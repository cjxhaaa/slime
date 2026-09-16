//! Reading what you type, so the pet can eat it.
//!
//! The slime cultivates off your work: a key you press becomes a glyph beside it, and it hops over
//! and swallows it. For that to feel like *your* typing rather than decoration, the glyph has to
//! carry a key you actually pressed — which means reading the keyboard while another application
//! has focus, and that is Raw Input with `RIDEV_INPUTSINK`.
//!
//! Two things are load-bearing and neither is an implementation detail:
//!
//! - **A key is used to choose a glyph and then dropped.** Nothing is written to disk, sent
//!   anywhere, or counted. The buffer here holds at most a few seconds of letters and is cleared
//!   every time one is taken.
//! - **Only a few percent of them are ever shown, out of order.** The frontend asks about once
//!   every five seconds and gets *one* key drawn at random from everything typed since it last
//!   asked, and the rest are discarded. Typing runs at five keys a second, so a password entered
//!   in two seconds contributes zero or one character, unlabelled, out of sequence, among a day of
//!   other letters. That is the whole defence against a password drifting across a shared screen,
//!   and it is a property of the sampling rather than of anyone remembering to be careful.
//!
//! Quiet mode does not filter — it calls `RIDEV_REMOVE` and the OS stops delivering keys to this
//! process at all. "I do not want it watching me type" deserves an answer that is true at the
//! system level, not a flag this code promises to honour.

use std::sync::atomic::{AtomicBool, Ordering};

/// Whether the keyboard is being left alone.
///
/// Lives here rather than in a backend because three separate things need the same answer: the
/// settings window renders a checkbox from it, the overlay stores it in the save, and the Windows
/// backend checks it on the way in. One atomic beats three copies that can disagree.
static QUIET: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
#[path = "windows.rs"]
mod backend;

#[cfg(not(windows))]
#[path = "unsupported.rs"]
mod backend;

/// Starts listening. Called once at startup; a platform without a backend does nothing.
pub fn start() {
    backend::start();
}

/// One key, chosen at random from everything typed since the last call, which is then forgotten.
///
/// `None` means nothing has been typed — which is also how the frontend knows not to spawn a glyph,
/// so an idle machine produces no motion and no work at all.
#[tauri::command]
pub fn take_keystroke() -> Option<String> {
    backend::take_keystroke()
}

/// Stops or resumes reading the keyboard outright.
///
/// Not a filter. The backend hands the registration back to the OS, so keys stop being delivered to
/// this process at all — "I would rather it did not watch me type" deserves an answer that is true
/// at the system level rather than one this code promises to honour.
#[tauri::command]
pub fn set_quiet(quiet: bool) {
    QUIET.store(quiet, Ordering::SeqCst);
    backend::set_listening(!quiet);
}

#[tauri::command]
pub fn quiet_state() -> bool {
    is_quiet()
}

pub fn is_quiet() -> bool {
    QUIET.load(Ordering::SeqCst)
}
