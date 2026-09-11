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
    /// Why there is or is not a join link, for the log. "The event has no conferencing at all" and
    /// "it has conferencing but nothing this code recognised" need completely different fixes and
    /// are indistinguishable from the outside.
    #[serde(skip)]
    pub link_note: &'static str,
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
    fn link_note(&self) -> &'static str {
        if self.video_url().is_some() {
            return "+link";
        }
        match &self.conference_data {
            None => "-noconference",
            Some(data) if data.entry_points.is_empty() => "-noentrypoints",
            Some(_) => "-novideoentry",
        }
    }

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
        let status = response.status();
        // Google puts the actionable part in the body — "API has not been used in project N",
        // "insufficient authentication scopes", and a quota rejection are all 403 and are three
        // completely different fixes. A bare status code cannot be acted on.
        let body = response.text().await.unwrap_or_default();
        let detail = body
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .chars()
            .take(400)
            .collect::<String>();
        return Err(format!("calendar request failed with status {status}: {detail}"));
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
            let link_note = event.link_note();
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
                link_note,
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

    // Last summary logged, so a poll that changed nothing stays quiet. Without this the log is a
    // line every 45 seconds forever and the one line that matters is impossible to find.
    let mut last_summary = String::new();

    tauri::async_runtime::spawn(async move {
        loop {
            let result = fetch(&app).await;
            match &result {
                Ok(meetings) => {
                    // Enough to tell "the calendar is empty" apart from "the fetch is broken" and
                    // from "the event is there but has no video link", which look identical from
                    // the outside and are the three things that actually go wrong here.
                    let summary = meetings
                        .iter()
                        .take(3)
                        .map(|m| {
                            format!("{}min{}", m.minutes_until, m.link_note)
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    let summary = format!("{} event(s): {}", meetings.len(), summary);
                    if summary != last_summary {
                        println!("[slime] calendar {summary}");
                        last_summary = summary;
                    }
                }
                Err(error) => {
                    // Previously swallowed entirely, so a broken poller was indistinguishable from
                    // an empty calendar. "Not connected" is the normal pre-setup state and is not
                    // worth repeating, but everything else is a real failure.
                    // Deduped on the leading part only: Google's JSON body reorders its keys
                    // between identical responses, so comparing whole strings never matched and
                    // the same failure printed every 45 seconds forever.
                    let key: String = error.chars().take(60).collect();
                    if !error.contains("not connected") && key != last_summary {
                        println!("[slime] calendar poll failed: {error}");
                        last_summary = key;
                    }
                }
            }
            if let Ok(meetings) = result {
                for meeting in meetings.iter() {
                    if meeting.minutes_until > LEAD_MINUTES || meeting.minutes_until < -1 {
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
