//! Asking Windows whether something else owns the screen.
//!
//! Two independent tests, either of which is enough. They are both here because each one alone
//! gets a common case wrong.
//!
//! **`SHQueryUserNotificationState`** is the API Windows itself uses to decide whether to show a
//! toast, which makes it the closest thing to an official answer to this exact question. It knows
//! about Direct3D exclusive full-screen, about Presentation Mode, and about the session being
//! locked — none of which is visible from a window rectangle. What it is bad at is ordinary
//! borderless-windowed games, which are the majority of them, and which it often reports as
//! business as usual.
//!
//! **The foreground rectangle** covers that gap: a window whose rect contains its monitor's whole
//! rect is full-screen, whatever it was built with. What *it* cannot see is the locked session or
//! presentation mode, since in both cases the foreground window is something ordinary.
//!
//! ## What both of them exclude, and why that matters more
//!
//! A **maximized** window is not full-screen. It stops at the work area, leaving the taskbar
//! showing, and the desktop is still the surface you are working on top of. Maximized windows are
//! most of what is on screen most of the time, so a test that counted them would hide the pet
//! nearly always — which is a far worse failure than being seen for one second over a game. The
//! rectangle test therefore compares against `rcMonitor` (the whole display) and not `rcWork`.
//!
//! The overlay is also excluded by process, which is load-bearing rather than tidy: it is placed
//! over the **work area**, so on a machine whose taskbar auto-hides, work area and monitor are the
//! same rectangle and the pet would otherwise detect *itself* as the full-screen application — hide
//! on that account, stop being full-screen by virtue of being hidden, come back, and oscillate
//! forever at one second a cycle.

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Shell::{
    SHQueryUserNotificationState, QUNS_BUSY, QUNS_NOT_PRESENT, QUNS_PRESENTATION_MODE,
    QUNS_RUNNING_D3D_FULL_SCREEN,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
};

pub fn supported() -> bool {
    true
}

pub fn screen_is_taken() -> bool {
    shell_is_busy() || foreground_fills_its_monitor()
}

/// The official answer, for the cases a rectangle cannot see.
fn shell_is_busy() -> bool {
    let Ok(state) = (unsafe { SHQueryUserNotificationState() }) else {
        return false;
    };
    // `QUNS_NOT_PRESENT` is the locked session or the screensaver. Hiding for it is not about being
    // in the way — nothing is on screen to be in the way of — but the parked render loop that comes
    // with it is free, and the pet is owed nothing for the time because cultivation settles off the
    // wall clock rather than off frames.
    state == QUNS_BUSY
        || state == QUNS_RUNNING_D3D_FULL_SCREEN
        || state == QUNS_PRESENTATION_MODE
        || state == QUNS_NOT_PRESENT
}

/// The rectangle answer, for the borderless-windowed games the official one misses.
fn foreground_fills_its_monitor() -> bool {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_invalid() || ours(hwnd) || !unsafe { IsWindowVisible(hwnd) }.as_bool() {
        return false;
    }
    // The desktop and the shell are always there and always that size. Counting them would mean
    // the pet hid whenever nothing else had focus, which is precisely when it should be visible.
    let class = class_of(hwnd);
    if matches!(
        class.as_str(),
        "Progman" | "WorkerW" | "Shell_TrayWnd" | "Windows.UI.Core.CoreWindow"
    ) {
        return false;
    }

    let Some(window) = rect_of(hwnd) else {
        return false;
    };
    let Some(monitor) = monitor_rect(hwnd) else {
        return false;
    };
    // Contains, not equals. A couple of games report a rect a pixel larger than the display, and a
    // couple of others sit a pixel inside it; one pixel of slack covers both without letting a
    // merely large window through.
    window.left <= monitor.left + 1
        && window.top <= monitor.top + 1
        && window.right >= monitor.right - 1
        && window.bottom >= monitor.bottom - 1
}

fn ours(hwnd: HWND) -> bool {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid != 0 && pid == unsafe { GetCurrentProcessId() }
}

fn class_of(hwnd: HWND) -> String {
    let mut buffer = [0u16; 128];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..len as usize])
}

fn rect_of(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    Some(rect)
}

/// The whole display the window is on — `rcMonitor`, deliberately not `rcWork`.
fn monitor_rect(hwnd: HWND) -> Option<RECT> {
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_invalid() {
        return None;
    }
    let mut info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    if !unsafe { GetMonitorInfoW(monitor, &mut info) }.as_bool() {
        return None;
    }
    Some(info.rcMonitor)
}
