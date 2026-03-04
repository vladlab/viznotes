use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use base64::Engine;

/// Get the config file path inside app config dir (~/.config/ on Linux)
fn config_path(app: &tauri::AppHandle) -> PathBuf {
    let config_dir = app.path().app_config_dir().expect("no app config dir");
    fs::create_dir_all(&config_dir).ok();
    config_dir.join("config.json")
}

#[tauri::command]
fn get_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn get_vault_path(app: tauri::AppHandle) -> Option<String> {
    let path = config_path(&app);
    if !path.exists() { return None; }
    let content = fs::read_to_string(&path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    config.get("vaultPath")?.as_str().map(|s| s.to_string())
}

#[tauri::command]
fn set_vault_path(app: tauri::AppHandle, vault_path: String) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = match fs::read_to_string(&path) {
        Ok(c) => serde_json::from_str::<serde_json::Value>(&c).unwrap_or(serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    };
    config["vaultPath"] = serde_json::Value::String(vault_path);
    fs::write(&path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Option<String> {
    let path = config_path(&app);
    let content = fs::read_to_string(&path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    config.get("settings").and_then(|s| s.as_str()).map(|s| s.to_string())
}

#[tauri::command]
fn set_settings(app: tauri::AppHandle, settings: String) -> Result<(), String> {
    let path = config_path(&app);
    let mut config = match fs::read_to_string(&path) {
        Ok(c) => serde_json::from_str::<serde_json::Value>(&c).unwrap_or(serde_json::json!({})),
        Err(_) => serde_json::json!({}),
    };
    config["settings"] = serde_json::Value::String(settings);
    fs::write(&path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Atomic write: write to temp file, then rename into place.
    // fs::rename on the same filesystem is atomic on POSIX and uses
    // MoveFileEx(MOVEFILE_REPLACE_EXISTING) on Windows.
    let tmp_path = format!("{}.tmp", path);
    fs::write(&tmp_path, &contents).map_err(|e| {
        // Clean up temp file on write failure
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })?;
    fs::rename(&tmp_path, &path).map_err(|e| {
        // Clean up temp file on rename failure
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<String>, String> {
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut names = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get file size: {}", e))
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    let dest_path = Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    let output = std::process::Command::new("fc-list")
        .args(["--format", "%{family[0]}\n"])
        .output()
        .map_err(|e| format!("Failed to run fc-list: {}", e))?;
    if !output.status.success() {
        return Err("fc-list failed".to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut fonts: Vec<String> = text.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    fonts.sort_unstable();
    fonts.dedup();
    Ok(fonts)
}

#[tauri::command]
fn run_ffprobe(path: String, args: Vec<String>) -> Result<String, String> {    let mut cmd = std::process::Command::new("ffprobe");
    for arg in &args {
        cmd.arg(arg);
    }
    cmd.arg(&path);
    let output = cmd.output().map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("ffprobe error: {}", stderr))
    }
}

/// Generate a waveform PNG for a specific audio track using ffmpeg's showwavespic filter.
/// Returns the asset filename (e.g. "waveform_abc123.png").
#[tauri::command]
fn generate_waveform(
    vault_path: String,
    file_path: String,
    track_index: usize,
    filename: String,
    width: u32,
    height: u32,
    color: String,
) -> Result<String, String> {
    let assets_dir = PathBuf::from(&vault_path).join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    let output_path = assets_dir.join(&filename);

    let filter = format!(
        "[0:a:{}]showwavespic=s={}x{}:colors={}:scale=sqrt:filter=peak:split_channels=1",
        track_index, width, height, color
    );

    let output = std::process::Command::new("ffmpeg")
        .args([
            "-i", &file_path,
            "-filter_complex", &filter,
            "-frames:v", "1",
            "-y",
        ])
        .arg(output_path.to_str().unwrap())
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if output.status.success() {
        Ok(filename)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("ffmpeg waveform error: {}", stderr))
    }
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    let dir = if p.is_file() {
        p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or(path.clone())
    } else {
        path.clone()
    };

    #[cfg(target_os = "linux")]
    {
        // Try freedesktop FileManager1 DBus interface first (reveals file selected)
        if p.is_file() {
            let file_uri = format!("file://{}", &path);
            let dbus_result = std::process::Command::new("gdbus")
                .args([
                    "call", "--session",
                    "--dest", "org.freedesktop.FileManager1",
                    "--object-path", "/org/freedesktop/FileManager1",
                    "--method", "org.freedesktop.FileManager1.ShowItems",
                    &format!("['{}']", file_uri),
                    "",
                ])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();

            match dbus_result {
                Ok(status) if status.success() => return Ok(()),
                _ => {} // Fall through to xdg-open
            }
        }

        // Fallback: open containing directory (no file selection)
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        if p.is_file() {
            std::process::Command::new("open").args(["-R", &path]).spawn().map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?;
        }
    }

    #[cfg(target_os = "windows")]
    {
        if p.is_file() {
            std::process::Command::new("explorer").args(["/select,", &path]).spawn().map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn save_asset(vault_path: String, filename: String, base64_data: String) -> Result<String, String> {
    let assets_dir = PathBuf::from(&vault_path).join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;

    let data = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let full_path = assets_dir.join(&filename);
    fs::write(&full_path, &data).map_err(|e| e.to_string())?;

    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_asset(vault_path: String, filename: String) -> Result<String, String> {
    let full_path = PathBuf::from(&vault_path).join("assets").join(&filename);
    let data = fs::read(&full_path).map_err(|e| format!("Read error: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Scan all page JSON files for referenced asset filenames,
/// then move any files in assets/ that aren't referenced into assets/orphans/.
#[tauri::command]
fn cleanup_orphaned_assets(vault_path: String) -> Result<usize, String> {
    let vault = PathBuf::from(&vault_path);
    let assets_dir = vault.join("assets");

    if !assets_dir.exists() {
        return Ok(0);
    }

    // Collect all asset filenames referenced in any page file.
    // We do a simple text search for filenames rather than full JSON parsing,
    // so we catch references in any field.
    let mut referenced = std::collections::HashSet::new();

    // Read all .json files in vault/pages/ (page data files)
    let pages_dir = vault.join("pages");
    if let Ok(entries) = fs::read_dir(&pages_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = fs::read_to_string(&path) {
                    // Find all asset-like filenames (nanoid patterns)
                    for cap in regex_lite::Regex::new(r#"[A-Za-z0-9_-]{8,20}\.\w{3,4}"#)
                        .unwrap()
                        .find_iter(&content)
                    {
                        referenced.insert(cap.as_str().to_string());
                    }
                }
            }
        }
    }

    // List files in assets/ (not subdirectories)
    let mut moved = 0;
    let orphans_dir = assets_dir.join("orphans");

    if let Ok(entries) = fs::read_dir(&assets_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let filename = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if !referenced.contains(&filename) {
                // Move to orphans
                fs::create_dir_all(&orphans_dir).map_err(|e| e.to_string())?;
                let dest = orphans_dir.join(&filename);
                fs::rename(&path, &dest).map_err(|e| e.to_string())?;
                moved += 1;
            }
        }
    }

    Ok(moved)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_config_dir,
            get_vault_path,
            set_vault_path,
            get_settings,
            set_settings,
            ensure_dir,
            path_exists,
            read_text_file,
            write_text_file,
            remove_file,
            is_directory,
            list_dir,
            get_file_size,
            copy_file,
            list_system_fonts,
            run_ffprobe,
            generate_waveform,
            show_in_folder,
            save_asset,
            read_asset,
            cleanup_orphaned_assets,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
