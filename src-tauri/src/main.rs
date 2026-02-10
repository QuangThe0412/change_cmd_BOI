// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Command {
    old: String,
    new: String,
    hex_pattern: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    commands: Vec<Command>,
}

#[derive(Debug, Serialize)]
struct PatchResult {
    success: bool,
    message: String,
}

fn hex_to_bytes(hex: &str) -> Vec<u8> {
    let clean: String = hex.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if clean.is_empty() { return Vec::new(); }
    (0..clean.len())
        .step_by(2)
        .filter_map(|i| {
            if i + 2 <= clean.len() {
                u8::from_str_radix(&clean[i..i+2], 16).ok()
            } else {
                None
            }
        })
        .collect()
}

fn patch_file_pattern(
    file_path: &str,
    old_pattern_hex: &str,
    new_string: &str,
) -> Result<usize, String> {
    let old_bytes = hex_to_bytes(old_pattern_hex);
    if old_bytes.is_empty() {
        return Ok(0); // Skip empty patterns
    }
    
    let new_bytes = new_string.as_bytes();
    if old_bytes.len() != new_bytes.len() {
        return Err(format!("Pattern length mismatch: {} bytes vs {} chars", old_bytes.len(), new_bytes.len()));
    }

    let mut data = fs::read(file_path)
        .map_err(|e| format!("Failed to read file '{}': {}", file_path, e))?;

    let mut count = 0;
    let mut i = 0;
    while i <= data.len().saturating_sub(old_bytes.len()) {
        if &data[i..i + old_bytes.len()] == &old_bytes[..] {
            data[i..i + old_bytes.len()].copy_from_slice(new_bytes);
            count += 1;
            i += old_bytes.len();
        } else {
            i += 1;
        }
    }

    if count > 0 {
        fs::write(file_path, data)
            .map_err(|e| format!("Failed to write to file '{}': {}", file_path, e))?;
    }

    Ok(count)
}

fn create_backup(file_path: &str) -> Result<String, String> {
    let backup_path = format!("{}.bak", file_path);
    if !std::path::Path::new(&backup_path).exists() {
        fs::copy(file_path, &backup_path)
            .map_err(|e| format!("Failed to create backup of '{}': {}", file_path, e))?;
    }
    Ok(backup_path)
}

#[tauri::command]
fn apply_patch(iweb_path: String, manager_path: String, config: Config) -> PatchResult {
    // Create backups first
    if let Err(e) = create_backup(&iweb_path) {
        return PatchResult { success: false, message: e };
    }
    if let Err(e) = create_backup(&manager_path) {
        return PatchResult { success: false, message: e };
    }

    let mut total_matches = 0;

    for cmd in &config.commands {
        // Patch iweb.exe
        match patch_file_pattern(&iweb_path, &cmd.hex_pattern, &cmd.new) {
            Ok(c) => total_matches += c,
            Err(e) => return PatchResult { success: false, message: format!("iweb pattern error: {}", e) },
        }

        // Patch managerserver.exe
        match patch_file_pattern(&manager_path, &cmd.hex_pattern, &cmd.new) {
            Ok(c) => total_matches += c,
            Err(e) => return PatchResult { success: false, message: format!("manager pattern error: {}", e) },
        }
    }

    PatchResult {
        success: true,
        message: format!("✅ Patching complete! Found and replaced {} occurrences across both files.", total_matches),
    }
}

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    let exe_dir = exe_path.parent()
        .ok_or_else(|| "Failed to get executable directory".to_string())?;
    let data_dir = exe_dir.join("data");
    if !data_dir.exists() {
        fs::create_dir_all(&data_dir)
            .map_err(|e| format!("Failed to create data directory: {}", e))?;
    }
    data_dir.to_str()
        .ok_or_else(|| "Failed to convert path to string".to_string())
        .map(|s| s.to_string())
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![apply_patch, get_data_dir, open_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
