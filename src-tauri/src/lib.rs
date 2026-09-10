mod calendar;
mod oauth;
mod store;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// Screen-space cursor position, pushed to the overlay so the slime can look at the pointer even
/// while the window is click-through and therefore receives no mouse events of its own.
#[derive(Clone, Serialize)]
struct CursorPos {
    x: f64,
    y: f64,
}

/// Whether the overlay currently swallows clicks.
///
/// The overlay covers the whole screen, so it must be click-through by default or it would eat
/// every click on the desktop. The frontend knows where the slime actually is and asks for clicks
/// back only while the pointer is over it. Tracked here as well so we never issue a redundant
/// platform call at cursor-poll frequency.
struct ClickState {
    through: AtomicBool,
}

#[tauri::command]
fn set_click_through(app: AppHandle, through: bool, state: tauri::State<Arc<ClickState>>) {
    if state.through.swap(through, Ordering::Relaxed) == through {
        return;
    }
    if let Some(window) = app.get_webview_window("pet") {
        let _ = window.set_ignore_cursor_events(through);
    }
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
    let _ = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("Slime settings")
    .inner_size(480.0, 620.0)
    .resizable(false)
    .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(ClickState {
            through: AtomicBool::new(true),
        }))
        .manage(oauth::AuthState::default())
        .invoke_handler(tauri::generate_handler![
            set_click_through,
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

            // The overlay spans the whole primary monitor so the slime can roam anywhere, rather
            // than living in a small window we would have to move over IPC every frame.
            if let Some(window) = app.get_webview_window("pet") {
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let size = *monitor.size();
                    let position = *monitor.position();
                    let _ = window.set_position(tauri::PhysicalPosition::new(position.x, position.y));
                    let _ = window.set_size(tauri::PhysicalSize::new(size.width, size.height));
                }
                let _ = window.set_ignore_cursor_events(true);
                let _ = window.set_always_on_top(true);
            }

            let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Slime", true, None::<&str>)?;
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
                    tokio::time::sleep(std::time::Duration::from_millis(33)).await;
                }
            });

            calendar::spawn_poller(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
