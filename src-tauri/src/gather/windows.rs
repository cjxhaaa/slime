//! Raw Input on a message-only window of our own.
//!
//! Tauri's window has a message loop, but reaching into it means subclassing a window someone else
//! owns. A message-only window on its own thread is self-contained: nothing else in the process can
//! be disturbed by it, and it can be told to stop listening without touching the UI at all.

use std::sync::atomic::{AtomicIsize, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::{
    GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
    RIDEV_INPUTSINK, RIDEV_REMOVE, RID_INPUT, RIM_TYPEKEYBOARD,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostMessageW, RegisterClassW,
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_APP, WM_INPUT, WM_KEYDOWN, WM_SYSKEYDOWN,
    WNDCLASSW,
};

use super::Input;

/// Ours, posted to the worker thread so registration happens where the window lives.
const WM_LISTEN: u32 = WM_APP + 1;

/// **How many** keys have been pressed since the frontend last asked.
///
/// A count, not a record. It is what lets every keystroke put something on screen without every
/// keystroke putting a *letter* on screen, which is the entire difference between a pet that eats
/// your typing and a pet that transcribes it onto your desktop.
static PRESSES: AtomicU32 = AtomicU32::new(0);

/// Letters typed since the last one was handed out.
///
/// Cleared every time one is taken, so the longest this can hold a key is the gap between letters —
/// a few seconds. It never becomes a record of anything.
static RECENT: Mutex<Vec<char>> = Mutex::new(Vec::new());
/// When a letter was last handed out, so the rate below is enforced here rather than trusted to the
/// caller. A frontend bug must not be able to turn this into a keylogger.
static LAST_LETTER: Mutex<Option<Instant>> = Mutex::new(None);
/// The worker's window, as an integer because a raw handle is not `Sync`.
static WINDOW: AtomicIsize = AtomicIsize::new(0);

/// The soonest two letters can be shown.
///
/// Against typing at roughly five keys a second this is what keeps letter exposure near four
/// percent. It is enforced on this side deliberately: the privacy property should not depend on
/// how often the frontend happens to poll.
const LETTER_INTERVAL: Duration = Duration::from_millis(5500);
/// Enough to cover a burst of fast typing between letters. Older keys drop off the front.
const BUFFER_CAP: usize = 64;

pub fn start() {
    std::thread::spawn(|| unsafe {
        let Ok(instance) = GetModuleHandleW(None) else {
            return;
        };
        let class = w!("SlimeRawInput");
        let descriptor = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: instance.into(),
            lpszClassName: class,
            ..Default::default()
        };
        RegisterClassW(&descriptor);

        let window = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            PCWSTR::null(),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        );
        let Ok(window) = window else {
            println!("[slime] no raw input window; the pet will cultivate on the idle rate only");
            return;
        };
        WINDOW.store(window.0 as isize, Ordering::SeqCst);
        listen(window, true);

        // This thread exists only to pump messages for that window. It is not tied to the UI, so
        // blocking here costs nothing.
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            DispatchMessageW(&message);
        }
    });
}

/// How much has been typed since the last call, and — occasionally — one of the keys.
pub fn take_input() -> Input {
    Input {
        presses: PRESSES.swap(0, Ordering::SeqCst),
        key: take_letter(),
    }
}

fn take_letter() -> Option<String> {
    let mut last = LAST_LETTER.lock().ok()?;
    let now = Instant::now();
    if let Some(previous) = *last {
        if now.duration_since(previous) < LETTER_INTERVAL {
            return None;
        }
    }
    let mut recent = RECENT.lock().ok()?;
    if recent.is_empty() {
        return None;
    }
    // Drawn at random rather than from either end, and then *everything* is dropped. That is what
    // makes what reaches the screen a sparse unordered sample rather than a transcript with gaps
    // in it: the order the keys were pressed in does not survive this function.
    let index = scatter(recent.len());
    let key = recent[index];
    recent.clear();
    *last = Some(now);
    Some(key.to_string())
}

pub fn set_listening(on: bool) {
    if !on {
        PRESSES.store(0, Ordering::SeqCst);
        if let Ok(mut recent) = RECENT.lock() {
            recent.clear();
        }
    }
    let window = WINDOW.load(Ordering::SeqCst);
    if window != 0 {
        // Posted rather than called: registration has to happen on the thread owning the window.
        unsafe {
            let _ = PostMessageW(
                Some(HWND(window as *mut _)),
                WM_LISTEN,
                WPARAM(usize::from(on)),
                LPARAM(0),
            );
        }
    }
}

/// Not cryptographic, and does not need to be. It has to be uncorrelated with the order keys were
/// typed in, and nanoseconds off the wall clock are.
fn scatter(len: usize) -> usize {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.subsec_nanos())
        .unwrap_or(0);
    (nanos as usize) % len
}

unsafe extern "system" fn wndproc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match message {
        WM_INPUT => {
            collect(lparam);
            // Raw input still wants the default handling afterwards, per the API contract.
            DefWindowProcW(window, message, wparam, lparam)
        }
        WM_LISTEN => {
            listen(window, wparam.0 != 0);
            LRESULT(0)
        }
        _ => DefWindowProcW(window, message, wparam, lparam),
    }
}

/// Turns keyboard delivery to this process on or off at the OS level.
unsafe fn listen(window: HWND, on: bool) {
    let device = RAWINPUTDEVICE {
        // Generic desktop page, keyboard usage. Nothing else is registered.
        usUsagePage: 0x01,
        usUsage: 0x06,
        dwFlags: if on { RIDEV_INPUTSINK } else { RIDEV_REMOVE },
        // RIDEV_REMOVE insists on a null target; RIDEV_INPUTSINK insists on a real one.
        hwndTarget: if on { window } else { HWND(std::ptr::null_mut()) },
    };
    if RegisterRawInputDevices(&[device], std::mem::size_of::<RAWINPUTDEVICE>() as u32).is_err() {
        println!("[slime] raw input registration failed (listening: {on})");
    }
}

unsafe fn collect(lparam: LPARAM) {
    if super::is_quiet() {
        return;
    }
    let header = std::mem::size_of::<RAWINPUTHEADER>() as u32;
    let mut input = RAWINPUT::default();
    let mut size = std::mem::size_of::<RAWINPUT>() as u32;
    let read = GetRawInputData(
        HRAWINPUT(lparam.0 as *mut _),
        RID_INPUT,
        Some(&mut input as *mut _ as *mut _),
        &mut size,
        header,
    );
    if read == u32::MAX || input.header.dwType != RIM_TYPEKEYBOARD.0 {
        return;
    }
    let keyboard = input.data.keyboard;
    if u32::from(keyboard.Message) != WM_KEYDOWN && u32::from(keyboard.Message) != WM_SYSKEYDOWN {
        return;
    }
    // Every key counts towards the motes, including the ones that have no letter to show. Space and
    // backspace are typing too, and a pet that ignored them would look like it was missing beats.
    PRESSES.fetch_add(1, Ordering::Relaxed);

    let Some(key) = printable(keyboard.VKey) else {
        return;
    };
    if let Ok(mut recent) = RECENT.lock() {
        if recent.len() >= BUFFER_CAP {
            recent.remove(0);
        }
        recent.push(key);
    }
}

/// Letters and digits, and deliberately nothing else.
///
/// Modifiers, function keys and arrows are not characters and would read as noise on a keycap.
/// Punctuation is left out for a different reason: it is the most identifying part of a password,
/// and a glyph showing an exclamation mark says more about what was typed than a `K` does.
fn printable(vkey: u16) -> Option<char> {
    match vkey {
        0x30..=0x39 => Some((b'0' + (vkey - 0x30) as u8) as char),
        0x41..=0x5A => Some((b'A' + (vkey - 0x41) as u8) as char),
        _ => None,
    }
}
