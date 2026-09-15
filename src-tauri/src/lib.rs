mod devour;
mod save;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};
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
    /// True while the frontend is mid-gesture and owns the pointer through DOM events.
    ///
    /// The cursor poll below exists only so the slime can watch a pointer it cannot receive events
    /// from. During a drag it *is* receiving events, at frame rate, so every poll emission is pure
    /// noise — thirty IPC deliveries a second, each deserialised and dispatched on the same webview
    /// thread that is trying to render the drag.
    ///
    /// Deliberately tied to the same lease as `accepting`, and never settable on its own. It was
    /// briefly its own latch, set on pointerdown and cleared on pointerup, which is the exact shape
    /// of bug this file already exists to avoid: a pointerup that never arrived left the poll muted
    /// forever, so the frontend's cursor went permanently null, so nothing was ever over the slime,
    /// so every click passed through it. Anything that can strand the frontend must expire.
    pointer_owned: AtomicBool,
}

impl ClickState {
    fn new() -> Self {
        Self {
            epoch: Instant::now(),
            lease_until_ms: AtomicU64::new(0),
            accepting: AtomicBool::new(false),
            pointer_owned: AtomicBool::new(false),
        }
    }

    fn now_ms(&self) -> u64 {
        self.epoch.elapsed().as_millis() as u64
    }
}

fn apply_accepting(app: &AppHandle, state: &ClickState, accepting: bool) {
    if !accepting {
        // The gesture cannot outlive the lease that carries it.
        state.pointer_owned.store(false, Ordering::SeqCst);
    }
    if state.accepting.swap(accepting, Ordering::SeqCst) == accepting {
        return;
    }
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.set_ignore_cursor_events(!accepting);
    }
}

/// Asks for clicks for the next lease period. Called repeatedly while the pointer is over the slime.
///
/// `dragging` rides along on the same renewal so it inherits the same expiry: the frontend renews
/// well inside the lease while a gesture is live, and the moment it stops renewing for any reason
/// both the clicks and the poll suppression lapse together.
#[tauri::command]
fn hold_clicks(app: AppHandle, dragging: bool, state: tauri::State<ClickState>) {
    let deadline = state.now_ms() + CLICK_LEASE.as_millis() as u64;
    state.lease_until_ms.store(deadline, Ordering::SeqCst);
    state.pointer_owned.store(dragging, Ordering::SeqCst);
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
fn open_settings(app: AppHandle) {
    toggle_settings(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Shows or hides the settings window.
///
/// The window is **declared in `tauri.conf.json` and created hidden at startup**, not built on
/// demand. Building it at runtime produced a window whose WebView2 never fetched the document at
/// all: Tauri reported the correct URL and `build()` returned no error, the URL served fine over
/// curl, nothing was logged, and no vite client ever loaded the module — the page simply never
/// arrived, leaving a blank window that also would not close because there was nothing behind it to
/// tear down. Moving it to the same startup path the pet window already uses sidesteps the whole
/// failure rather than guessing at its cause.
///
/// Toggling, rather than re-focusing, means there is always a way to dismiss it that does not
/// depend on its own title bar.
fn toggle_settings(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(window) = handle.get_webview_window("settings") else {
            println!("[slime] the settings window is missing from the app config");
            return;
        };
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return;
        }
        let _ = window.center();
        let _ = window.show();
        let _ = window.unminimize();
        // The overlay is deliberately never focused, so this app has no active window for another
        // to be raised above; without this the settings window can appear behind whatever the user
        // was actually looking at.
        let _ = window.set_focus();
    });
}

/// Exercises window identification and the polite close without any of the animation.
///
/// The escalation to a force kill is deliberately *not* reachable from here. It is the irreversible
/// half of the feature and it belongs to a gesture the user is still holding, not to a menu item
/// that could be clicked by accident.
fn test_devour(app: &AppHandle) {
    if !devour::devour_supported() {
        println!("[slime] devour test: no window backend on this platform");
        return;
    }
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        println!("[slime] devour test: point at a window…");
        tokio::time::sleep(Duration::from_secs(3)).await;
        let Ok(at) = handle.cursor_position() else {
            println!("[slime] devour test: no cursor position");
            return;
        };
        let Some(prey) = devour::window_at(at.x as i32, at.y as i32) else {
            println!("[slime] devour test: nothing eatable at {}, {}", at.x, at.y);
            return;
        };
        println!(
            "[slime] devour test: {} — {:?} at {},{} {}x{} {:.0}% buried{}",
            prey.process,
            prey.title,
            prey.x,
            prey.y,
            prey.width,
            prey.height,
            prey.occlusion * 100.0,
            if prey.hung { " (already hung)" } else { "" }
        );
        let outcome = devour::swallow(prey.hwnd).await;
        println!("[slime] devour test: {}", devour::describe(outcome));
    });
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
        // Must be registered first, and exists to protect the save file: two copies of this app
        // running at once would take turns overwriting each other's progress, and the second one
        // would look like it had worked right up until the first one wrote again. The overlay
        // never takes focus, so there is nothing to raise for the second launch — it just leaves.
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
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
        .invoke_handler(tauri::generate_handler![
            hold_clicks,
            release_clicks,
            open_settings,
            quit_app,
            save::load_save,
            save::write_save,
            devour::devour_supported,
            devour::window_at,
            devour::raise,
            devour::swallow,
            devour::force,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // The macOS half of `skipTaskbar`, which does nothing there. Without this the pet gets
            // a Dock icon and a menu bar of its own, and activating it pulls focus off whatever the
            // user was working in — for a window that is meant to sit on top and be ignored, that
            // is the wrong kind of presence. Accessory is the same policy menu-bar-only apps use.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

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
            // Aims at the cursor after a delay rather than at click time: by the time a menu event
            // arrives the menu has closed and the pointer is still down by the tray, so sampling
            // immediately would only ever test whatever sits in the bottom corner of the screen.
            let devour_item = MenuItem::with_id(
                app,
                "test-devour",
                "Test devour  (3s, at cursor)",
                devour::devour_supported(),
                None::<&str>,
            )?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit Slime  (Ctrl+Alt+Shift+Q)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_item, &devour_item, &quit_item])?;
            // Losing the tray must not cost the pet. On Linux the tray is StatusNotifierItem,
            // which a stock GNOME session does not implement without an extension, so a failure
            // here is routine rather than exceptional — and `?` would turn a missing menu into no
            // app at all. The quit shortcut registered above is the exit that does not depend on
            // any of this, which is what makes downgrading this to a log safe.
            let mut tray = TrayIconBuilder::with_id("tray")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => toggle_settings(app),
                    "test-devour" => test_devour(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            if let Err(error) = tray.build(app) {
                println!("[slime] no tray icon ({error}); quit with Ctrl+Alt+Shift+Q");
            }

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
                    if cursor_handle.state::<ClickState>().pointer_owned.load(Ordering::SeqCst) {
                        tokio::time::sleep(Duration::from_millis(33)).await;
                        continue;
                    }
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

            Ok(())
        })
        .on_window_event(|window, event| {
            // The settings window is created once at startup, so its close button must hide it
            // rather than destroy it — a destroyed one could not be reopened without going back to
            // runtime creation, which is exactly what did not work.
            if window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
