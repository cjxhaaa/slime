//! 敛息 — getting out of the way when something else owns the screen.
//!
//! A desktop pet is a guest. The moment a game goes full-screen, a film starts or a deck is being
//! presented, the thing it most needs to do is **not be there** — and the second thing is to stop
//! costing anything, because the application that just took the screen is usually the one that
//! wants the machine.
//!
//! ## Hiding the window, not merely declining to paint
//!
//! The render loop already stands down to 20 Hz and skips frames that change nothing, which took
//! an idle pet from 31% of a core to 4%. The remaining 4% is not the drawing — it is that a
//! transparent always-on-top layer the size of the desktop still exists, and the compositor still
//! has to combine it with everything underneath. `hide()` removes the layer, so this is the one
//! lever that reaches the cost the stand-down could not.
//!
//! ## This is not 静修
//!
//! Quiet mode answers "do not read my keyboard". This answers "do not sit on top of what I am
//! doing". They are different questions with different right answers, so they are different
//! switches — somebody who wants the pet eating their typing all day still wants it gone the
//! moment a game starts.
//!
//! ## What counts as taken
//!
//! Two independent tests, either of which is enough; see `windows.rs`. The important one is what
//! they both exclude: a **maximized** window is not a full-screen one. A maximized browser leaves
//! the taskbar showing and the desktop is still the thing you are working on top of — a pet that
//! vanished for it would be gone nearly all the time, which is the failure mode this has to avoid
//! more than it has to avoid being seen once over a game.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(windows)]
#[path = "windows.rs"]
mod backend;

#[cfg(not(windows))]
#[path = "unsupported.rs"]
mod backend;

/// Whether the pet gets out of the way at all. On by default: a guest that has to be *asked* to
/// step aside has already been in the way once.
static LIE_LOW: AtomicBool = AtomicBool::new(true);

/// Whether it is currently out of the way. Written only by the watcher below.
static CONCEALED: AtomicBool = AtomicBool::new(false);

/// How often the screen is asked who owns it.
///
/// Just under a second. The check is two cheap Win32 calls and nothing allocates, but this runs
/// forever on a machine whose owner is doing something else, so it is paced rather than tight.
const POLL: Duration = Duration::from_millis(900);

/// Consecutive clear polls before coming back.
///
/// Asymmetric on purpose. **Going is immediate** — one sample is enough, because the cost of being
/// a second late is the pet drawn over the first second of someone's game. **Coming back waits**,
/// because alt-tabbing out of a full-screen game for a moment is common and a pet that flickers
/// into the middle of it is worse than one that takes two seconds to notice.
const CLEAR_POLLS: u8 = 2;

/// Re-state the current answer this often even when nothing changed.
///
/// The frontend parks its render loop while concealed, so a lost "come back" event would leave the
/// pet visible and frozen until the next real change. Rather than make the event delivery
/// trustworthy, the answer is simply repeated — the same shape as the click lease, which also
/// recovers by restating rather than by remembering.
const REASSERT_EVERY: u8 = 6;

#[derive(Clone, Serialize)]
struct Presence {
    concealed: bool,
}

/// Whether this platform can tell. A platform that cannot never conceals, and the settings window
/// greys the switch rather than offering one that would do nothing.
#[tauri::command]
pub fn lie_low_supported() -> bool {
    backend::supported()
}

pub fn is_concealed() -> bool {
    CONCEALED.load(Ordering::SeqCst)
}

/// Turns the behaviour on or off. Turning it off reveals immediately rather than at the next poll.
#[tauri::command]
pub fn set_lie_low(app: AppHandle, lie_low: bool) {
    LIE_LOW.store(lie_low, Ordering::SeqCst);
    if !lie_low {
        apply(&app, false);
    }
}

#[tauri::command]
pub fn lie_low_state() -> bool {
    LIE_LOW.load(Ordering::SeqCst)
}

/// Hides or shows the overlay, and tells the frontend which it was.
///
/// The window is the authority and the event is the courtesy: the frontend uses it to park its
/// loop and to play the reveal, but it cannot leave the pet on screen by missing one.
fn apply(app: &AppHandle, concealed: bool) {
    if CONCEALED.swap(concealed, Ordering::SeqCst) == concealed {
        return;
    }
    println!(
        "[slime] {}",
        if concealed {
            "something took the screen; stepping aside"
        } else {
            "the screen is free again; coming back"
        }
    );
    if let Some(window) = app.get_webview_window("pet") {
        if concealed {
            let _ = window.hide();
        } else {
            let _ = window.show();
            // Re-asserted after every show. `ShowWindow` puts a window back at the top of its band,
            // but a full-screen application that has since exited may have left the band itself
            // disturbed, and an overlay that comes back *under* things is indistinguishable from
            // one that did not come back.
            let _ = window.set_always_on_top(true);
            // And click-through, which is the one that would matter. This window covers the desktop;
            // if showing it ever left the transparent style off, every click on the desktop would
            // land here instead, and the lease watchdog could not undo it — that watchdog only runs
            // while *it* believes clicks are being accepted, so a style set behind its back is
            // exactly the case it cannot see. Granting click-through unconditionally is safe in the
            // other direction: if the pointer really is over the pet, the frontend renews its lease
            // within a frame and takes the clicks straight back.
            let _ = window.set_ignore_cursor_events(true);
        }
    }
    let _ = app.emit("presence", Presence { concealed });
}

/// Starts watching. Called once at startup; a platform without a backend never conceals.
pub fn watch(app: AppHandle) {
    if !backend::supported() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut clear_run: u8 = 0;
        let mut since_said: u8 = 0;
        loop {
            tokio::time::sleep(POLL).await;

            if !LIE_LOW.load(Ordering::SeqCst) {
                clear_run = 0;
                continue;
            }

            let taken = backend::screen_is_taken();
            if taken {
                clear_run = 0;
            } else if clear_run < CLEAR_POLLS {
                clear_run += 1;
            }

            // Go on the first sample that says so; come back only once the run of clear samples is
            // long enough. Between those two the previous answer stands.
            let want = if taken {
                true
            } else if clear_run >= CLEAR_POLLS {
                false
            } else {
                CONCEALED.load(Ordering::SeqCst)
            };

            if want != CONCEALED.load(Ordering::SeqCst) {
                apply(&app, want);
                since_said = 0;
                continue;
            }

            since_said = since_said.saturating_add(1);
            if since_said >= REASSERT_EVERY {
                since_said = 0;
                let _ = app.emit("presence", Presence { concealed: want });
            }
        }
    });
}
