use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

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
            list_system_fonts,
            run_ffprobe,
            show_in_folder,
            exit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
