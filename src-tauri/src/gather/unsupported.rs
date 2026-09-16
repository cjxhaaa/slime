//! Keyboard reading where the platform backend is not written yet — macOS and Linux.
//!
//! Returning no keystrokes makes the feature *absent* rather than broken: the frontend already
//! treats `None` as "nothing has been typed", which happens on Windows every time someone steps
//! away from the desk, so nothing downstream needs a second code path. The pet still cultivates on
//! the idle rate, still breaks through, and still says what realm it is on.
//!
//! What a real backend needs:
//!
//! - **macOS**: a `CGEventTap` on `kCGEventKeyDown`, which requires Accessibility consent and
//!   prompts the user for it. There is no way to observe keys across applications without that
//!   permission, by design.
//! - **Linux/X11**: `XRecord`, or `XInput2` with `XISelectEvents` on the root window.
//! - **Linux/Wayland**: not possible for an ordinary client, which is the point of the protocol.

pub fn start() {}

pub fn take_keystroke() -> Option<String> {
    None
}

pub fn set_listening(_on: bool) {}
