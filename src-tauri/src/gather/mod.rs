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

use serde::Serialize;

/// What has been typed since the last time anyone asked.
///
/// Two very different things, and the split is the point. `presses` is a **count** — enough for
/// every keystroke to put a speck of dust on the desktop, which is what makes the pet look like it
/// is eating your work. `key` is an actual letter, and it arrives rarely: the backend will not hand
/// one over more than about once every five seconds however often it is asked.
///
/// Every key showing its own letter would put a password on the desktop in order, one character at
/// a time. Every key showing a nameless mote does not.
#[derive(Serialize)]
pub struct Input {
    pub presses: u32,
    pub key: Option<String>,
}

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

/// How much has been typed since the last call, and occasionally one of the keys.
///
/// A zero count means nobody is there, which is also how the frontend knows to draw nothing at all
/// — so an idle machine produces no motion and no work.
#[tauri::command]
pub fn take_input() -> Input {
    backend::take_input()
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
