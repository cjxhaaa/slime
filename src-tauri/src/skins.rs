//! The skins folder: where somebody drops a skin they made or downloaded.
//!
//! Each skin is one folder under `<app data>/skins/`, holding a `skin.json` and the pictures it
//! names. This side only reads files and hands them over; what a `skin.json` *means* is decided in
//! TypeScript (`src/skins/manifest.ts`), the same split the save uses, so the format can grow
//! without touching Rust.
//!
//! Pictures go across as `data:` URLs rather than being served from disk. That keeps the webview
//! with no file access at all — no asset protocol, no scope to get wrong — at the cost of base64
//! on a few hundred kilobytes once, when the list is read.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const FOLDER: &str = "skins";
const MANIFEST: &str = "skin.json";

/// Generous for a hand-written file, and small enough that a wrong file cannot stall the read.
const MANIFEST_LIMIT: u64 = 64 * 1024;
/// Per picture. A body-sized picture is a few hundred pixels across; this is ten times that.
const PICTURE_LIMIT: u64 = 4 * 1024 * 1024;
/// Per skin, all pictures together.
const SKIN_LIMIT: u64 = 16 * 1024 * 1024;
/// How many folders are looked at.
const MOST_SKINS: usize = 64;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModSkin {
    /// The folder's own name, which is the skin's id.
    folder: String,
    /// The raw `skin.json`, unparsed. Null when it is missing or too big, with `error` saying so.
    manifest: Option<String>,
    /// File name to `data:` URL, for every picture in the folder that was small enough.
    files: BTreeMap<String, String>,
    /// Why this folder cannot be used, when that is already known on this side.
    error: Option<String>,
}

fn skins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("no data directory: {error}"))?
        .join(FOLDER);
    fs::create_dir_all(&dir)
        .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    Ok(dir)
}

fn mime_for(name: &str) -> Option<&'static str> {
    let extension = name.rsplit_once('.')?.1.to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

/// One folder. Only its top level is read: a skin cannot reach outside the folder it is in.
fn read_skin(folder: String, path: PathBuf) -> ModSkin {
    let mut skin = ModSkin {
        folder,
        manifest: None,
        files: BTreeMap::new(),
        error: None,
    };

    let manifest = path.join(MANIFEST);
    match fs::metadata(&manifest) {
        Err(_) => {
            skin.error = Some(format!("no {MANIFEST} in this folder"));
            return skin;
        }
        Ok(meta) if meta.len() > MANIFEST_LIMIT => {
            skin.error = Some(format!("{MANIFEST} is larger than {} KB", MANIFEST_LIMIT / 1024));
            return skin;
        }
        Ok(_) => match fs::read_to_string(&manifest) {
            Ok(raw) => skin.manifest = Some(raw),
            Err(error) => {
                skin.error = Some(format!("could not read {MANIFEST}: {error}"));
                return skin;
            }
        },
    }

    let Ok(entries) = fs::read_dir(&path) else {
        return skin;
    };
    let mut total = 0u64;
    let mut names: Vec<(String, PathBuf, u64)> = entries
        .flatten()
        .filter_map(|entry| {
            let meta = entry.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let name = entry.file_name().into_string().ok()?;
            mime_for(&name)?;
            Some((name, entry.path(), meta.len()))
        })
        .collect();
    names.sort();
    for (name, file, size) in names {
        if size > PICTURE_LIMIT {
            skin.error = Some(format!("{name} is larger than {} MB", PICTURE_LIMIT / 1024 / 1024));
            return skin;
        }
        total += size;
        if total > SKIN_LIMIT {
            skin.error = Some(format!(
                "the pictures add up to more than {} MB",
                SKIN_LIMIT / 1024 / 1024
            ));
            return skin;
        }
        let Some(mime) = mime_for(&name) else { continue };
        match fs::read(&file) {
            Ok(bytes) => {
                let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
                skin.files.insert(name, format!("data:{mime};base64,{encoded}"));
            }
            Err(error) => {
                skin.error = Some(format!("could not read {name}: {error}"));
                return skin;
            }
        }
    }
    skin
}

/// Every folder in the skins folder, in name order, each with whatever could be read of it.
#[tauri::command]
pub fn list_skins(app: AppHandle) -> Result<Vec<ModSkin>, String> {
    let dir = skins_dir(&app)?;
    let mut folders: Vec<(String, PathBuf)> = fs::read_dir(&dir)
        .map_err(|error| format!("could not read {}: {error}", dir.display()))?
        .flatten()
        .filter(|entry| entry.metadata().map(|meta| meta.is_dir()).unwrap_or(false))
        .filter_map(|entry| Some((entry.file_name().into_string().ok()?, entry.path())))
        .filter(|(name, _)| !name.starts_with('.'))
        .collect();
    folders.sort();
    folders.truncate(MOST_SKINS);
    Ok(folders
        .into_iter()
        .map(|(name, path)| read_skin(name, path))
        .collect())
}

/// Opens the skins folder in the system's file manager, creating it first if need be.
#[tauri::command]
pub fn open_skins_folder(app: AppHandle) -> Result<(), String> {
    let dir = skins_dir(&app)?;
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("could not open {}: {error}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("slime-skin-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn reads_the_manifest_and_only_top_level_pictures() {
        let dir = scratch("good");
        fs::write(dir.join(MANIFEST), r#"{"format":1,"name":"x"}"#).unwrap();
        fs::write(dir.join("ears.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>").unwrap();
        fs::write(dir.join("notes.txt"), "not a picture").unwrap();
        fs::create_dir_all(dir.join("deeper")).unwrap();
        fs::write(dir.join("deeper").join("hidden.png"), [0u8; 4]).unwrap();

        let skin = read_skin("good".into(), dir.clone());
        assert!(skin.error.is_none(), "{:?}", skin.error);
        assert_eq!(skin.manifest.as_deref(), Some(r#"{"format":1,"name":"x"}"#));
        assert_eq!(skin.files.keys().collect::<Vec<_>>(), vec!["ears.svg"]);
        assert!(skin.files["ears.svg"].starts_with("data:image/svg+xml;base64,"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_folder_without_a_manifest_says_so() {
        let dir = scratch("empty");
        let skin = read_skin("empty".into(), dir.clone());
        assert!(skin.error.unwrap().contains(MANIFEST));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn an_oversized_picture_is_refused_by_name() {
        let dir = scratch("big");
        fs::write(dir.join(MANIFEST), "{}").unwrap();
        fs::write(dir.join("huge.png"), vec![0u8; PICTURE_LIMIT as usize + 1]).unwrap();
        let skin = read_skin("big".into(), dir.clone());
        assert!(skin.error.unwrap().contains("huge.png"));
        assert!(skin.files.is_empty());
        let _ = fs::remove_dir_all(dir);
    }
}
