//! Eating a window.
//!
//! Holding the slime still over a window makes it engulf and swallow that window — an alternative
//! way to close things, and the only one that still works when an app has stopped responding.
//!
//! Reaching into another application's windows is the least portable thing this app does, so the
//! platform half lives behind `backend` and this module holds only what crosses the IPC boundary.
//! Windows is implemented. macOS and Linux report no prey, which makes the feature *absent* rather
//! than broken: `window_at` returning `None` is a state the frontend already handles on Windows
//! every time the pointer is over bare desktop, so nothing downstream needs a second code path.
//!
//! `supported` exists so the frontend can stop asking. Holding the slime still re-probes every
//! `DEVOUR_HOLD_MS`, which against a backend that can never answer differently is a round trip
//! every two seconds for as long as the pet is held — quiet, pointless, and indefinite.

use serde::Serialize;

#[cfg(windows)]
#[path = "windows.rs"]
mod backend;

#[cfg(not(windows))]
#[path = "unsupported.rs"]
mod backend;

/// A window the slime could eat. `hwnd` crosses the IPC boundary as an integer because a raw
/// handle is neither `Send` nor meaningful to the frontend; it is only ever handed straight back.
#[derive(Clone, Serialize)]
pub struct Prey {
    pub hwnd: isize,
    pub title: String,
    pub process: String,
    /// Screen rect in physical pixels — what the body has to deform around.
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    /// Already not responding before we touched it.
    pub hung: bool,
    /// Fraction of the window buried under other windows, 0.0 (fully exposed) to 1.0.
    ///
    /// The slime is only ever launched at a point it can see, so the window it lands on can still
    /// be almost entirely behind something else. Swallowing a window that is not on screen looks
    /// like the pet eating nothing.
    pub occlusion: f32,
}

/// What a bite came to.
///
/// Only a backend that can actually close a window constructs more than one of these, so off
/// Windows the rest are dead by construction rather than by neglect — and a warning on every build
/// of a platform whose backend is deliberately a stub is noise that trains you to ignore warnings.
/// The lint stays on where the variants are meant to be reachable.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Bite {
    /// It went. A clean meal.
    Closed,
    /// Still there and still pumping messages — it is asking the user something, so it is theirs
    /// to answer, not ours to kill.
    Resisting,
    /// Still there and not responding. Eligible for `force`, and nothing else is.
    Hung,
    /// Terminated.
    Killed,
    /// The process refused to open — almost always because it runs elevated and this does not.
    TooTough,
    /// The window disappeared on its own between being targeted and being bitten.
    Gone,
}

/// One line per outcome, for the console during development and for the pet's bubble later.
pub fn describe(bite: Bite) -> &'static str {
    match bite {
        Bite::Closed => "closed cleanly",
        Bite::Resisting => "still up and responding — it is asking you something",
        Bite::Hung => "not responding; force is available",
        Bite::Killed => "force killed",
        Bite::TooTough => "could not be killed (elevated?)",
        Bite::Gone => "already gone",
    }
}

/// Whether this platform can identify and close another application's windows.
///
/// Checked once at startup rather than inferred from an empty `window_at`, which is ambiguous —
/// it also means "pointing at the desktop".
#[tauri::command]
pub fn devour_supported() -> bool {
    backend::SUPPORTED
}

#[tauri::command]
pub fn window_at(x: i32, y: i32) -> Option<Prey> {
    backend::window_at(x, y)
}

#[tauri::command]
pub fn raise(hwnd: isize) -> f32 {
    backend::raise(hwnd)
}

#[tauri::command]
pub async fn swallow(hwnd: isize) -> Bite {
    backend::swallow(hwnd).await
}

#[tauri::command]
pub fn force(hwnd: isize) -> Bite {
    backend::force(hwnd)
}
