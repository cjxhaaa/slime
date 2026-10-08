//! Everywhere that is not Windows.
//!
//! Returning "never taken" rather than guessing. The two tests in `windows.rs` have no portable
//! equivalent — macOS puts full-screen apps on their own Space, where the question is not whether a
//! rectangle is covered but which Space the overlay belongs to, and X11 and Wayland disagree with
//! each other about whether it can be asked at all. A wrong answer here hides the pet for no reason
//! on a machine nobody tested, so the honest one is that this platform does not know.

pub fn supported() -> bool {
    false
}

pub fn screen_is_taken() -> bool {
    false
}
