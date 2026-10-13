//! Borrowing the keyboard for the length of a 历练, and giving it back.
//!
//! 历练 is steered with WASD. For four keys to reach a transparent, click-through overlay, that
//! overlay has to hold keyboard focus — and `lib.rs` is right that it should never hold it the
//! rest of the time. The two alternatives are both worse:
//!
//! - **A global shortcut per key.** A registration is swallowed system-wide, which is exactly why
//!   Esc is only held for the length of a run. Swallowing W, A, S and D everywhere would break
//!   typing in every other application on the machine for ninety seconds.
//! - **The Raw Input hook `gather` owns.** It already reads the keyboard whatever has focus, so
//!   it would work. It must not be used: that hook deliberately hands over about **one key every
//!   five seconds, drawn at random and out of order**, and that sampling is not an implementation
//!   detail — it is the whole reason a password typed into another window cannot drift across the
//!   desktop. Steering needs every press and release of four specific keys, which is the opposite
//!   shape, and it would also mean 静修 silently broke the controls.
//!
//! ## Giving it back is the part that matters
//!
//! Taking focus is one call. **Not giving it back is a bug with a ninety-second fuse**: the run
//! ends, the overlay still owns the keyboard, and the next thing the user types goes into a
//! transparent window that ignores it. Their work simply disappears until they think to click
//! something. So the window that had it is remembered on the way in and restored on the way out.
//!
//! Best-effort throughout. Windows refuses `SetForegroundWindow` from a process that is not the
//! foreground one under the foreground lock, and the honest answer to that is to leave the user's
//! focus wherever it ended up rather than to fight the OS for it.

#[cfg(windows)]
mod backend {
    use std::sync::atomic::{AtomicIsize, Ordering};

    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, IsWindow, SetForegroundWindow};

    /// The window that had focus when the run started, as a raw handle, or 0 for none.
    ///
    /// An atomic rather than a `Mutex<Option<HWND>>` because the only thing stored is a pointer
    /// width and the only operations are "write one" and "take it". `HWND` is not `Send`, which a
    /// mutex would have to be argued around; an `isize` has no such opinion.
    static BORROWED_FROM: AtomicIsize = AtomicIsize::new(0);

    /// Remembers who has the keyboard now, so `give_back` knows where to return it.
    pub fn remember() {
        // SAFETY: a read of the foreground window handle, which takes no arguments and cannot
        // fail into anything but a null handle.
        let current = unsafe { GetForegroundWindow() };
        BORROWED_FROM.store(current.0 as isize, Ordering::SeqCst);
    }

    /// Puts focus back where it was. Does nothing when there was nothing to go back to.
    pub fn give_back() {
        let raw = BORROWED_FROM.swap(0, Ordering::SeqCst);
        if raw == 0 {
            return;
        }
        let window = HWND(raw as *mut core::ffi::c_void);
        // SAFETY: the handle is checked for still being a window first. A window that has closed
        // during the run is the ordinary case, not an error.
        unsafe {
            if IsWindow(Some(window)).as_bool() {
                let _ = SetForegroundWindow(window);
            }
        }
    }
}

#[cfg(not(windows))]
mod backend {
    pub fn remember() {}
    pub fn give_back() {}
}

pub use backend::{give_back, remember};
