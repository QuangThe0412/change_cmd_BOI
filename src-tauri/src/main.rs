// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PatchCommand {
    old: String,
    new: String,
    iweb_offsets: Vec<u64>,
    manager_offsets: Vec<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Config {
    commands: Vec<PatchCommand>,
}

#[derive(Debug, Serialize)]
struct PatchResult {
    success: bool,
    message: String,
}

fn patch_file_at_offset(
    file_path: &str,
    offset_start: u64,
    offset_end: u64,
    new_string: &str,
) -> Result<(), String> {
    if offset_start == 0 {
        return Ok(()); // Skip if offset is not set
    }

    let mut data = fs::read(file_path)
        .map_err(|e| format!("Failed to read file '{}': {}", file_path, e))?;

    let start = offset_start as usize;
    let end = offset_end as usize;

    if start >= data.len() {
        return Err(format!("Offset 0x{:X} is out of bounds for file '{}'", offset_start, file_path));
    }

    let new_bytes = new_string.as_bytes();
    let length_available = end - start;

    if new_bytes.len() > length_available {
        return Err(format!(
            "New string is too long for offset 0x{:X}: string length is {}, but available space is {}",
            offset_start, new_bytes.len(), length_available
        ));
    }

    // Overwrite existing data with the new string
    for (i, byte) in new_bytes.iter().enumerate() {
        data[start + i] = *byte;
    }

    // Optionally: Fill the remaining space with null bytes (0x00) if needed
    // for i in new_bytes.len()..length_available {
    //     data[start + i] = 0;
    // }

    fs::write(file_path, data)
        .map_err(|e| format!("Failed to write to file '{}': {}", file_path, e))?;

    Ok(())
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

    for cmd in &config.commands {
        // Patch iweb.exe - Supports multiple offsets (Line 1 & Line 2)
        for chunk in cmd.iweb_offsets.chunks(2) {
            if chunk.len() == 2 {
                let start = chunk[0];
                let end = chunk[1];
                if start > 0 {
                    if let Err(e) = patch_file_at_offset(&iweb_path, start, end, &cmd.new) {
                        return PatchResult { success: false, message: format!("IWEB patch error for '{}' at 0x{:X}: {}", cmd.old, start, e) };
                    }
                }
            }
        }

        // Patch managerserver.exe
        if cmd.manager_offsets.len() >= 2 {
            let start = cmd.manager_offsets[0];
            let end = cmd.manager_offsets[1];
            if start > 0 {
                if let Err(e) = patch_file_at_offset(&manager_path, start, end, &cmd.new) {
                    return PatchResult { success: false, message: format!("MANAGER patch error for '{}' at 0x{:X}: {}", cmd.old, start, e) };
                }
            }
        }
    }

    PatchResult {
        success: true,
        message: format!("✅ Patching complete! All {} commands have been updated at their respective offsets.", config.commands.len()),
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
