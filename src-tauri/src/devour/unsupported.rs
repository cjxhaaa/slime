//! Eating a window where the platform backend is not written yet — macOS and Linux.
//!
//! This is a stub rather than a `compile_error!` because the rest of the app is worth having on
//! these platforms without it, and because the honest failure here is "there is nothing to eat",
//! which the frontend already understands.
//!
//! What the real backends need, so the next person does not have to re-derive it:
//!
//! - **Linux/X11** has a designed equivalent for nearly all of it, via EWMH:
//!   `_NET_CLIENT_LIST_STACKING` for enumeration *and* the stacking order that occlusion needs,
//!   `_NET_WM_PID` for the process, `_NET_CLOSE_WINDOW` for the polite knock, and `_NET_WM_PING`
//!   for hung detection — the same signal a window manager uses to offer "Force Quit", which is
//!   exactly the gate `IsHungAppWindow` provides on Windows. `SIGKILL` is the force stage.
//! - **Linux/Wayland** has none of it, by design: a client cannot enumerate, inspect, or close
//!   another client's surfaces. This feature is X11-only on Linux and cannot be otherwise.
//! - **macOS** can enumerate and get bounds and stacking from `CGWindowListCopyWindowInfo` without
//!   permission, but window *titles* need Screen Recording consent and closing a window needs the
//!   Accessibility API (press the close button via `AXUIElement`) and its own consent prompt.
//!   There is no public "is this app hung" call, so the `IsHungAppWindow` gate — the thing that
//!   keeps this feature from killing an editor with an unsaved-work dialog open — has to be
//!   rebuilt from an Accessibility query that times out. Until that gate exists, do not ship the
//!   force stage on macOS.

use super::{Bite, Prey};

pub const SUPPORTED: bool = false;

pub fn window_at(_x: i32, _y: i32) -> Option<Prey> {
    None
}

/// Fully buried. `window_at` never hands out prey here, so nothing should reach this; if something
/// does, the answer that makes the frontend abort the meal is the right one.
pub fn raise(_hwnd: isize) -> f32 {
    1.0
}

pub async fn swallow(_hwnd: isize) -> Bite {
    Bite::Gone
}

pub fn force(_hwnd: isize) -> Bite {
    Bite::Gone
}
