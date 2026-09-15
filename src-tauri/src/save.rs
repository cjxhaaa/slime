use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// The live file, the last known good copy of it, and the scratch file writes land in first.
const LIVE: &str = "save.json";
const BACKUP: &str = "save.bak";
const SCRATCH: &str = "save.tmp";

/// Where the save lives, created if it is not there yet.
fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("no data directory: {error}"))?;
    fs::create_dir_all(&dir)
        .map_err(|error| format!("could not create {}: {error}", dir.display()))?;
    Ok(dir)
}

/// True when `raw` is JSON this side can at least parse.
///
/// The *shape* of a save belongs to the frontend, because the gameplay does — this side never
/// needs touching as the schema grows. But it does have to tell a damaged file from a good one,
/// or keeping a backup would be pointless: without this check the loader would hand back a
/// truncated file quite happily and the backup would never be reached.
fn parses(raw: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(raw).is_ok()
}

fn read_if_good(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    if parses(&raw) {
        Some(raw)
    } else {
        None
    }
}

/// The save, or `None` when there is not one yet.
///
/// A damaged live file falls through to the backup rather than being reported as an error. The
/// caller could not do anything more useful with the failure than start over, and starting over
/// would mean throwing away a perfectly good backup.
#[tauri::command]
pub fn load_save(app: AppHandle) -> Option<String> {
    let dir = dir(&app).ok()?;
    if let Some(raw) = read_if_good(&dir.join(LIVE)) {
        return Some(raw);
    }
    let backup = read_if_good(&dir.join(BACKUP));
    if backup.is_some() {
        println!("[slime] the save would not parse; fell back to {BACKUP}");
    }
    backup
}

/// Replaces the save atomically, keeping the previous one.
///
/// The order is the whole point of this function:
///
/// 1. refuse anything that is not JSON, so a bug upstream cannot commit a file that will not load;
/// 2. write the new bytes to a scratch file and **sync them to the disk**, so they are really
///    there before anything else is touched;
/// 3. copy the current save aside as the backup;
/// 4. rename the scratch file over the live one, which is atomic.
///
/// A crash at any point leaves either the old save or the new one, never half of either. An idle
/// game's save is the player's entire holdings, and losing one is the failure they do not forgive
/// — so it is worth four steps and a spare copy.
#[tauri::command]
pub fn write_save(app: AppHandle, json: String) -> Result<(), String> {
    if !parses(&json) {
        return Err("refusing to write a save that is not valid JSON".into());
    }
    let dir = dir(&app)?;
    let live = dir.join(LIVE);
    let scratch = dir.join(SCRATCH);

    let mut file = fs::File::create(&scratch).map_err(|error| error.to_string())?;
    file.write_all(json.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);

    if live.exists() {
        // Best effort. Failing the write that would have produced the thing worth backing up, over
        // a backup that could not be refreshed, trades a real save for a hypothetical one.
        let _ = fs::copy(&live, dir.join(BACKUP));
    }
    fs::rename(&scratch, &live).map_err(|error| error.to_string())
}
