//! Eating a window.
//!
//! Holding the slime still over a window makes it engulf and swallow that window — an alternative
//! way to close things, and the only one that still works when an app has stopped responding.
//!
//! Closing is escalated in three stages, and the stages are visible in the animation rather than
//! hidden behind it: `WM_CLOSE` is a polite knock, and a responsive app that puts up a "save
//! changes?" dialog has *answered* it. So the escalation to `TerminateProcess` is gated on
//! `IsHungAppWindow` — the same signal the shell uses to write "(Not Responding)" on a title bar —
//! and never on "the window is still there after n seconds". Without that gate the obvious
//! implementation kills an editor with its unsaved-work prompt open, which is the one outcome this
//! feature must never produce.
//!
//! The force stage is also not reached on its own. `swallow` stops at `Hung` and hands the decision
//! back; `force` is a separate call the frontend only makes while the user is still holding on.
//! `WM_CLOSE` is something an app can refuse, prompt about, or undo. `TerminateProcess` is not, so
//! it does not ride along on the same gesture that started a polite close.

use std::ffi::c_void;
use std::time::Duration;

use serde::Serialize;
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, TerminateProcess, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetShellWindow, GetWindowRect, GetWindowTextW,
    GetWindowThreadProcessId, IsHungAppWindow, IsIconic, IsWindow, IsWindowVisible, PostMessageW,
    WM_CLOSE,
};

/// How long a polite close is given before the window is judged to have not gone.
const CLOSE_GRACE: Duration = Duration::from_millis(2500);
const CLOSE_POLL: Duration = Duration::from_millis(100);

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
}

/// What a bite came to.
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

fn hwnd_from(raw: isize) -> HWND {
    HWND(raw as *mut c_void)
}

fn wide_to_string(buffer: &[u16], len: i32) -> String {
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buffer[..len as usize])
}

fn window_title(hwnd: HWND) -> String {
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    wide_to_string(&buffer, len)
}

fn window_class(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    wide_to_string(&buffer, len)
}

/// Windows 11 keeps windows alive but hidden on other virtual desktops, and suspended UWP apps sit
/// in the same state. `IsWindowVisible` says true for all of them, so without this the slime will
/// happily eat something the user cannot see.
fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        )
    };
    ok.is_ok() && cloaked != 0
}

/// The rect the window actually *looks* like it occupies.
///
/// `GetWindowRect` reports the window including its invisible DWM resize border, which on Windows
/// 11 runs about eight pixels past the visible frame on the left, right and bottom of every
/// ordinary window — a maximized window comes back starting at x = -9. Hit-testing against that
/// makes a strip of empty space either side of a window count as being over it, and wrapping the
/// body around it would leave a visible gap between the slime and the thing it is supposed to be
/// swallowing.
///
/// Every coordinate here is a **physical** screen pixel. That is what DWM returns, what Tauri's
/// `cursor_position` returns, and what the overlay is positioned and sized in, so the whole feature
/// stays in one space. It is worth stating because `GetWindowRect` does *not* answer in physical
/// pixels unconditionally — it answers in whatever space the calling process is DPI-virtualized
/// into, so a DPI-unaware process reading the same window gets it back divided by the display
/// scale. On a 150% display that is a 1.5x error, silently, with no failure anywhere.
///
/// Falls back to `GetWindowRect` because the DWM attribute is unavailable for windows that are not
/// composited, which is rare but not impossible.
fn visible_rect(hwnd: HWND) -> Option<RECT> {
    let mut frame = RECT::default();
    let ok = unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut frame as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
    };
    if ok.is_ok() && frame.right > frame.left && frame.bottom > frame.top {
        return Some(frame);
    }
    let mut rect = RECT::default();
    unsafe { GetWindowRect(hwnd, &mut rect) }.ok()?;
    Some(rect)
}

fn process_id(hwnd: HWND) -> u32 {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    pid
}

fn process_name(pid: u32) -> String {
    let Ok(handle) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }) else {
        return String::new();
    };
    let mut buffer = [0u16; 512];
    let mut len = buffer.len() as u32;
    let name = unsafe {
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut len,
        );
        let _ = CloseHandle(handle);
        if ok.is_err() {
            String::new()
        } else {
            wide_to_string(&buffer, len as i32)
        }
    };
    name.rsplit('\\').next().unwrap_or("").to_string()
}

/// Classes that are the desktop or the shell itself. Eating any of these is never what was meant,
/// and `Shell_TrayWnd` in particular is the taskbar — the overlay is already sized to spare it.
fn is_shell_furniture(class: &str) -> bool {
    matches!(
        class,
        "Shell_TrayWnd"
            | "Shell_SecondaryTrayWnd"
            | "Progman"
            | "WorkerW"
            | "NotifyIconOverflowWindow"
            | "TopLevelWindowForOverflowXamlIsland"
            | "Windows.UI.Core.CoreWindow"
            | "XamlExplorerHostIslandWindow"
            | "ForegroundStaging"
    )
}

struct Hunt {
    x: i32,
    y: i32,
    own_pid: u32,
    shell: isize,
    found: Option<Prey>,
}

/// `EnumWindows` walks top-level windows in z-order, front to back, so the first window whose rect
/// contains the point is the one the user can actually see there.
///
/// The obvious `WindowFromPoint` cannot be used: the overlay holds a click lease for the whole
/// duration of a drag, which means it is *not* `WS_EX_TRANSPARENT` at the moment this runs, so it
/// would match itself at every point on the screen.
unsafe extern "system" fn hunt_proc(hwnd: HWND, param: LPARAM) -> BOOL {
    let hunt = &mut *(param.0 as *mut Hunt);

    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return true.into();
    }
    // Never eat ourselves: the overlay covers the entire work area, and the settings window is the
    // way back from anything this feature gets wrong.
    if process_id(hwnd) == hunt.own_pid || hwnd.0 as isize == hunt.shell {
        return true.into();
    }
    if is_cloaked(hwnd) || is_shell_furniture(&window_class(hwnd)) {
        return true.into();
    }
    // An untitled top-level window is nearly always an invisible helper, and a nameless thing is
    // also one the user could not be told they had just eaten.
    let title = window_title(hwnd);
    if title.is_empty() {
        return true.into();
    }

    let Some(rect) = visible_rect(hwnd) else {
        return true.into();
    };
    if rect.right <= rect.left || rect.bottom <= rect.top {
        return true.into();
    }
    if hunt.x < rect.left || hunt.x >= rect.right || hunt.y < rect.top || hunt.y >= rect.bottom {
        return true.into();
    }

    hunt.found = Some(Prey {
        hwnd: hwnd.0 as isize,
        title,
        process: process_name(process_id(hwnd)),
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        hung: IsHungAppWindow(hwnd).as_bool(),
    });
    false.into() // stop at the first, topmost hit
}

/// The topmost eatable window at a screen point, in physical pixels.
#[tauri::command]
pub fn window_at(x: i32, y: i32) -> Option<Prey> {
    hunt_at(x, y, std::process::id())
}

/// `skip_pid` is what stops the slime eating itself, and it is load-bearing rather than defensive:
/// the overlay is an ordinary visible, titled, uncloaked window covering the whole work area, so it
/// sits in front of every candidate and matches at every point on the screen. Nothing else in the
/// filter list excludes it. If this check ever fails to match, the only window the slime can reach
/// is itself.
///
/// It is a parameter rather than a direct `std::process::id()` so a test harness — which runs under
/// its own pid and would therefore find the live app's overlay and stop there — can stand in for it.
fn hunt_at(x: i32, y: i32, skip_pid: u32) -> Option<Prey> {
    let mut hunt = Hunt {
        x,
        y,
        own_pid: skip_pid,
        shell: unsafe { GetShellWindow() }.0 as isize,
        found: None,
    };
    // A `false` return from the callback stops the walk, which surfaces here as an error; that is
    // the success path, so the result is deliberately ignored in favour of what the hunt collected.
    let _ = unsafe { EnumWindows(Some(hunt_proc), LPARAM(&mut hunt as *mut Hunt as isize)) };
    hunt.found
}

/// The three probes the escalation is built out of.
///
/// Each takes the handle as an integer and rebuilds it inside, rather than taking an `HWND`. That
/// is not ceremony: `HWND` is a raw pointer and therefore not `Send`, so holding one across the
/// `.await` in `swallow` below would make that future non-`Send` and refuse to spawn on the async
/// runtime at all.
fn still_there(raw: isize) -> bool {
    unsafe { IsWindow(Some(hwnd_from(raw))) }.as_bool()
}

fn is_hung(raw: isize) -> bool {
    unsafe { IsHungAppWindow(hwnd_from(raw)) }.as_bool()
}

fn post_close(raw: isize) -> bool {
    unsafe { PostMessageW(Some(hwnd_from(raw)), WM_CLOSE, WPARAM(0), LPARAM(0)) }.is_ok()
}

/// The polite knock, then a wait. Never escalates on its own.
#[tauri::command]
pub async fn swallow(hwnd: isize) -> Bite {
    if !still_there(hwnd) {
        return Bite::Gone;
    }
    if !post_close(hwnd) {
        // A hung window still accepts a post into its queue, so a failure here means the handle
        // died underneath us rather than that the app declined.
        return if still_there(hwnd) {
            Bite::Resisting
        } else {
            Bite::Gone
        };
    }

    let deadline = std::time::Instant::now() + CLOSE_GRACE;
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(CLOSE_POLL).await;
        if !still_there(hwnd) {
            return Bite::Closed;
        }
    }

    if is_hung(hwnd) {
        Bite::Hung
    } else {
        // Alive, pumping messages, and choosing to stay. That is a dialog waiting for an answer,
        // and the answer is the user's to give.
        Bite::Resisting
    }
}

/// Terminates the process behind a window. Refuses anything that is not actually hung.
///
/// The check is repeated here rather than trusted from the caller: this is the irreversible half of
/// the feature, and the frontend making the call has just spent two seconds animating, which is
/// long enough for an app to have recovered and put a dialog up.
#[tauri::command]
pub fn force(hwnd: isize) -> Bite {
    if !still_there(hwnd) {
        return Bite::Gone;
    }
    if !is_hung(hwnd) {
        return Bite::Resisting;
    }

    let pid = process_id(hwnd_from(hwnd));
    if pid == 0 || pid == std::process::id() {
        return Bite::TooTough;
    }
    let Ok(handle) = (unsafe { OpenProcess(PROCESS_TERMINATE, false, pid) }) else {
        // Elevated processes cannot be opened by an unelevated one, and this app should stay
        // unelevated — a desk pet that can kill anything on the machine is a worse trade than one
        // that visibly cannot chew through an admin window.
        return Bite::TooTough;
    };
    let killed = unsafe {
        let result = TerminateProcess(handle, 1);
        let _ = CloseHandle(handle);
        result.is_ok()
    };
    if killed {
        Bite::Killed
    } else {
        Bite::TooTough
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::Win32::UI::HiDpi::{
        SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
        SM_YVIRTUALSCREEN,
    };

    /// Probes a grid across the primary screen and reports every distinct window the hunt is
    /// willing to eat.
    ///
    /// There is nothing to assert against a live desktop, so this is a smoke test to be read:
    /// `cargo test -- --nocapture list_eatable_windows`. What it is checking for is the taskbar,
    /// the desktop, and windows sitting on other virtual desktops turning up in the list — each of
    /// which is a filter above having failed, and none of which any assertion here could name.
    /// The test harness has no application manifest and is therefore DPI-unaware, which would make
    /// `GetWindowRect` report virtualized coordinates while DWM reports physical ones — the numbers
    /// printed below would disagree with each other and with the running app for no visible reason.
    /// The real app is per-monitor aware already; this only puts the harness in the same space.
    fn match_the_apps_dpi_awareness() {
        unsafe {
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }

    #[test]
    fn list_eatable_windows() {
        match_the_apps_dpi_awareness();

        // A running copy of the app would otherwise be the only thing this ever finds.
        let slime_pid = window_at(10, 10)
            .filter(|p| p.process.eq_ignore_ascii_case("slime.exe"))
            .map(|p| unsafe {
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd_from(p.hwnd), Some(&mut pid));
                pid
            })
            .unwrap_or(0);
        if slime_pid != 0 {
            println!("(standing in for the app's own-pid filter: pid {slime_pid})
");
        }

        // Physical pixels, and read rather than assumed: a hardcoded 2560x1400 grid covers only the
        // top-left corner of the same screen once the display is scaled, which reads as the filter
        // having rejected everything rather than as the probe never having reached it.
        let (ox, oy, w, h) = unsafe {
            (
                GetSystemMetrics(SM_XVIRTUALSCREEN),
                GetSystemMetrics(SM_YVIRTUALSCREEN),
                GetSystemMetrics(SM_CXVIRTUALSCREEN),
                GetSystemMetrics(SM_CYVIRTUALSCREEN),
            )
        };
        println!("probing {w}x{h} from {ox},{oy}
");

        let mut seen: Vec<isize> = Vec::new();
        for y in (oy..oy + h).step_by((h / 14).max(1) as usize) {
            for x in (ox..ox + w).step_by((w / 16).max(1) as usize) {
                let Some(prey) = hunt_at(x, y, slime_pid) else { continue };
                if seen.contains(&prey.hwnd) {
                    continue;
                }
                seen.push(prey.hwnd);
                println!(
                    "{:>16}  {:<28.28}  {:>5},{:<5} {:>5}x{:<5}{}",
                    prey.process,
                    prey.title,
                    prey.x,
                    prey.y,
                    prey.width,
                    prey.height,
                    if prey.hung { "  HUNG" } else { "" }
                );
            }
        }
        println!("
{} distinct windows", seen.len());
    }
}
