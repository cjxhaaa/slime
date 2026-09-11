use std::collections::HashSet;
use std::sync::Mutex;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::oauth;

const EVENTS_ENDPOINT: &str =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/// How far ahead to look. Long enough that the settings pane can show the rest of the day, short
/// enough that the response stays small.
const LOOKAHEAD_HOURS: i64 = 12;

/// The slime starts its performance this many minutes before the meeting.
const LEAD_MINUTES: i64 = 5;

const POLL_SECONDS: u64 = 45;

#[derive(Clone, Debug, Serialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub start: String,
    pub minutes_until: i64,
    pub meet_url: Option<String>,
}

#[derive(Deserialize)]
struct EventsResponse {
    #[serde(default)]
    items: Vec<Event>,
}

#[derive(Deserialize)]
struct Event {
    #[serde(default)]
    id: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    start: Option<EventTime>,
    #[serde(default)]
    #[serde(rename = "hangoutLink")]
    hangout_link: Option<String>,
    #[serde(default)]
    #[serde(rename = "conferenceData")]
    conference_data: Option<ConferenceData>,
}

#[derive(Deserialize)]
struct EventTime {
    /// Absent for all-day events, which are not meetings you can be late to.
    #[serde(default)]
    #[serde(rename = "dateTime")]
    date_time: Option<String>,
}

#[derive(Deserialize)]
struct ConferenceData {
    #[serde(default)]
    #[serde(rename = "entryPoints")]
    entry_points: Vec<EntryPoint>,
}

#[derive(Deserialize)]
struct EntryPoint {
    #[serde(default)]
    #[serde(rename = "entryPointType")]
    entry_point_type: Option<String>,
    #[serde(default)]
    uri: Option<String>,
}

impl Event {
    fn video_url(&self) -> Option<String> {
        if let Some(link) = self.hangout_link.as_ref().filter(|l| !l.is_empty()) {
            return Some(link.clone());
        }
        self.conference_data
            .as_ref()?
            .entry_points
            .iter()
            .find(|entry| entry.entry_point_type.as_deref() == Some("video"))
            .and_then(|entry| entry.uri.clone())
            // A conference entry point is remote data; only https is worth handing onward.
            .filter(|uri| uri.starts_with("https://"))
    }
}

/// Upcoming events that have a video link, soonest first.
#[tauri::command]
pub async fn next_meetings(app: AppHandle) -> Result<Vec<Meeting>, String> {
    fetch(&app).await
}

async fn fetch(app: &AppHandle) -> Result<Vec<Meeting>, String> {
    let token = oauth::access_token(app).await?;
    let now = Utc::now();
    let time_max = now + Duration::hours(LOOKAHEAD_HOURS);

    let response = oauth::http(app)
        .get(EVENTS_ENDPOINT)
        .bearer_auth(token)
        .query(&[
            ("timeMin", now.to_rfc3339()),
            ("timeMax", time_max.to_rfc3339()),
            // Expands recurring series into individual instances, which is what "my next meeting"
            // means; without it a weekly standup comes back as one row with the original date.
            ("singleEvents", "true".to_string()),
            ("orderBy", "startTime".to_string()),
            ("maxResults", "25".to_string()),
        ])
        .send()
        .await
        .map_err(|error| format!("calendar request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "calendar request failed with status {}",
            response.status()
        ));
    }

    let payload: EventsResponse = response
        .json()
        .await
        .map_err(|error| format!("could not read the calendar response: {error}"))?;

    let mut meetings: Vec<Meeting> = payload
        .items
        .into_iter()
        .filter(|event| event.status.as_deref() != Some("cancelled"))
        .filter_map(|event| {
            let start_raw = event.start.as_ref()?.date_time.clone()?;
            let start = DateTime::parse_from_rfc3339(&start_raw).ok()?;
            let meet_url = event.video_url();
            Some(Meeting {
                id: event.id.clone(),
                title: event
                    .summary
                    .clone()
                    .filter(|title| !title.trim().is_empty())
                    .unwrap_or_else(|| "(no title)".into()),
                start: start_raw,
                minutes_until: (start.with_timezone(&Utc) - now).num_minutes(),
                meet_url,
            })
        })
        .collect();

    meetings.sort_by_key(|meeting| meeting.minutes_until);
    Ok(meetings)
}

/// Event ids already performed for, so a 45-second poll does not re-trigger the same reminder.
/// Keyed by id plus start time, so a rescheduled meeting is announced again.
struct Announced {
    seen: Mutex<HashSet<String>>,
}

pub fn spawn_poller(app: AppHandle) {
    let announced = Announced {
        seen: Mutex::new(HashSet::new()),
    };

    tauri::async_runtime::spawn(async move {
        loop {
            // Nothing is connected yet on a fresh install, and that is the normal state rather than
            // an error worth surfacing — the poller just idles until Settings has a token.
            if let Ok(meetings) = fetch(&app).await {
                for meeting in meetings.iter() {
                    if meeting.minutes_until > LEAD_MINUTES || meeting.minutes_until < -1 {
                        continue;
                    }
                    if meeting.meet_url.is_none() {
                        continue;
                    }
                    let key = format!("{}@{}", meeting.id, meeting.start);
                    let fresh = {
                        let mut seen = announced.seen.lock().unwrap();
                        seen.insert(key)
                    };
                    if fresh {
                        let _ = app.emit("meeting-soon", meeting.clone());
                    }
                }

                // Keep the set from growing for the life of the process: anything no longer in the
                // lookahead window can never be announced again anyway.
                let live: HashSet<String> = meetings
                    .iter()
                    .map(|meeting| format!("{}@{}", meeting.id, meeting.start))
                    .collect();
                announced
                    .seen
                    .lock()
                    .unwrap()
                    .retain(|key| live.contains(key));

                let _ = app.emit("meetings", meetings);
            }
            tokio::time::sleep(std::time::Duration::from_secs(POLL_SECONDS)).await;
        }
    });
}
