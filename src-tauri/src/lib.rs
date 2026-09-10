mod calendar;
mod oauth;
mod store;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// An emergency exit that does not depend on the overlay behaving.
///
/// Every other way out goes through something this app can break: the tray icon, which Windows 11
/// hides in the overflow flyout by default so most people never find it, and clicking the pet,
/// which stops working the moment anything is wrong with click handling — which is exactly when
/// you most want to quit. A global shortcut is handled by the OS and works regardless.
fn quit_shortcut() -> Shortcut {
    Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
        Code::KeyQ,
    )
}

/// Screen-space cursor position, pushed to the overlay so the slime can look at the pointer even
/// while the window is click-through and therefore receives no mouse events of its own.
#[derive(Clone, Serialize)]
struct CursorPos {
    x: f64,
    y: f64,
}

/// How long a single "I want clicks" request stays valid. The frontend renews well inside this.
const CLICK_LEASE: Duration = Duration::from_millis(400);
const WATCHDOG_INTERVAL: Duration = Duration::from_millis(100);

/// Whether the overlay swallows clicks — held as an expiring lease, never as a latch.
///
/// The overlay covers the screen, so "accepting clicks" is a dangerous state: while it is on, every
/// click on the desktop lands on a transparent window instead of on what the user aimed at. It must
/// therefore be impossible for that state to outlive the frontend's intent to hold it.
///
/// An earlier version had the frontend cache the current mode and skip the IPC call when it thought
/// the mode already matched. That desynchronises permanently the moment the webview reloads: the
/// page's cached flag resets to "click-through" while this process is still set to accept clicks, so
/// the frontend then believes there is nothing to do and stops calling. The desktop is left
/// unclickable with no way back — including the tray, which the overlay was also covering.
///
/// So the frontend does not get to hold anything. It asks, repeatedly, and this side lets the
/// request lapse. A reload, a crash, a thrown exception or a frozen render loop all resolve
/// themselves within one lease.
struct ClickState {
    epoch: Instant,
    /// Milliseconds since `epoch` at which the current lease expires.
    lease_until_ms: AtomicU64,
    /// Mirrors what was last handed to the platform, so we do not call it every renewal.
    accepting: AtomicBool,
}

impl ClickState {
    fn new() -> Self {
        Self {
            epoch: Instant::now(),
            lease_until_ms: AtomicU64::new(0),
            accepting: AtomicBool::new(false),
        }
    }

    fn now_ms(&self) -> u64 {
        self.epoch.elapsed().as_millis() as u64
    }
}

fn apply_accepting(app: &AppHandle, state: &ClickState, accepting: bool) {
    if state.accepting.swap(accepting, Ordering::SeqCst) == accepting {
        return;
    }
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.set_ignore_cursor_events(!accepting);
    }
}

/// Asks for clicks for the next lease period. Called repeatedly while the pointer is over the slime.
#[tauri::command]
fn hold_clicks(app: AppHandle, state: tauri::State<ClickState>) {
    let deadline = state.now_ms() + CLICK_LEASE.as_millis() as u64;
    state.lease_until_ms.store(deadline, Ordering::SeqCst);
    apply_accepting(&app, &state, true);
}

/// Gives clicks back immediately rather than waiting for the lease to lapse. Best-effort: if this
/// never arrives, the watchdog does the same thing a moment later.
#[tauri::command]
fn release_clicks(app: AppHandle, state: tauri::State<ClickState>) {
    state.lease_until_ms.store(0, Ordering::SeqCst);
    apply_accepting(&app, &state, false);
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    // Only ever hand the OS an https link. A calendar entry is remote data, and letting an
    // arbitrary scheme (file:, ms-…:) out of it would turn a hostile invite into a local launcher.
    if !url.starts_with("https://") {
        return Err("refusing to open a non-https url".into());
    }
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    show_settings(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_settings(app: &AppHandle) {
    if let Some(existing) = app.get_webview_window("settings") {
        let _ = existing.show();
        let _ = existing.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("Slime settings")
        .inner_size(480.0, 620.0)
        .resizable(false)
        .build();
}

/// Puts the overlay over the monitor's work area rather than the whole monitor.
///
/// The work area excludes the taskbar, which keeps the notification area — and therefore this app's
/// own tray menu — permanently clickable. That matters as a floor on how bad a click-handling bug
/// can get: whatever else goes wrong, the user can always reach Quit.
fn place_overlay(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.primary_monitor() else {
        return;
    };
    let area = monitor.work_area();
    let _ = window.set_position(tauri::PhysicalPosition::new(area.position.x, area.position.y));
    let _ = window.set_size(tauri::PhysicalSize::new(area.size.width, area.size.height));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && shortcut == &quit_shortcut() {
                        app.exit(0);
                    }
                })
                .build(),
        )
        .manage(ClickState::new())
        .manage(oauth::AuthState::default())
        .invoke_handler(tauri::generate_handler![
            hold_clicks,
            release_clicks,
            open_external,
            open_settings,
            quit_app,
            oauth::google_config_status,
            oauth::save_google_client,
            oauth::begin_google_auth,
            oauth::disconnect_google,
            calendar::next_meetings,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("pet") {
                place_overlay(&window);
                // Starts click-through and stays that way until something asks otherwise.
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.set_always_on_top(true);
            }

            // Registration can fail if another app already owns the combination; that is not worth
            // refusing to start over, so it is logged and skipped.
            if let Err(error) = app.global_shortcut().register(quit_shortcut()) {
                println!("[slime] could not register the quit shortcut: {error}");
            }

            let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit Slime  (Ctrl+Alt+Shift+Q)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;
            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => show_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // The lease watchdog. This is the thing that makes an unclickable desktop unreachable
            // as a persistent state rather than merely unlikely.
            let click_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(WATCHDOG_INTERVAL).await;
                    let state = click_handle.state::<ClickState>();
                    if !state.accepting.load(Ordering::SeqCst) {
                        continue;
                    }
                    if state.now_ms() > state.lease_until_ms.load(Ordering::SeqCst) {
                        apply_accepting(&click_handle, &state, false);
                    }
                }
            });

            // Cursor polling. 30Hz is smooth enough for eye tracking and for deciding when the
            // pointer is over the slime, and it keeps this off the frame budget of the renderer.
            let cursor_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut last = (f64::NAN, f64::NAN);
                loop {
                    if let Ok(position) = cursor_handle.cursor_position() {
                        if position.x != last.0 || position.y != last.1 {
                            last = (position.x, position.y);
                            let _ = cursor_handle.emit(
                                "cursor",
                                CursorPos {
                                    x: position.x,
                                    y: position.y,
                                },
                            );
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(33)).await;
                }
            });

            calendar::spawn_poller(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
