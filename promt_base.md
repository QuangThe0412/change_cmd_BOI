✅ React frontend + Rust backend (Tauri)
✅ Mỗi lệnh có 2 offset cho iweb.exe và 2 offset cho managerserver.exe
✅ Rule bắt buộc: new command length == old command length (ví dụ BULL → NUL ❌)
✅ Replace byte không làm thay đổi cấu trúc file
✅ UI bảng chỉnh sửa + setting panel
✅ JSON config
✅ Validate + backup + error handling

🧠 FULL PROMPT (COPY NGUYÊN KHỐI)
ROLE

You are a senior fullstack developer specialized in:

Rust

Tauri framework

React (Vite + TypeScript)

Binary file editing

Build a Windows desktop application using Tauri (Rust backend + React frontend) that edits and synchronizes command strings inside two executable files using fixed offsets.

APPLICATION GOAL

Create a mini desktop tool that allows the user to:

Select two executable files:

iweb.exe

managerserver.exe

Edit and synchronize command names stored inside both files.

Replace command strings at predefined offsets without changing the file size or binary structure.

MAIN FEATURES
1. File Selection Panel

Button: Select iweb.exe

Button: Select managerserver.exe

Display selected file paths

Validate both files are selected before applying changes

2. Main Command Table (UI)

A table with 2 columns:

Original Command	New Command
BULL	FULL
CMD_LOGIN	CMD_ENTER

Features:

Editable cells

Add / remove rows

Validate input before saving

If new command length is not equal to original command length → show error and reject input

Example validation:

old = BULL (4 chars)

new = NUL (3 chars) → ❌ reject

new = NULL (4 chars) → ✅ allow

3. Settings Panel (Offset Configuration)

Each command has 4 offsets total:

Command	iweb offset 1	iweb offset 2	manager offset 1	manager offset 2
CMD_A	0x1F3A20	0x1F3A40	0x2A4B10	0x2A4B30

Rules:

Offsets are editable

Offsets are hexadecimal

Each command can have up to:

2 offsets in iweb.exe

2 offsets in managerserver.exe

CONFIG FORMAT (JSON)

The application must load and save configuration in JSON format.

Example:

{
  "commands": [
    {
      "old": "BULL",
      "new": "FULL",
      "iweb_offsets": ["0x1F3A20", "0x1F3A40"],
      "manager_offsets": ["0x2A4B10", "0x2A4B30"]
    },
    {
      "old": "CMD_LOGIN",
      "new": "CMD_ENTER",
      "iweb_offsets": ["0x1F5000", "0x1F5020"],
      "manager_offsets": ["0x2A6000", "0x2A6020"]
    }
  ]
}

BACKEND (Rust - Tauri)
Core Logic

Implement Rust functions to:

Read exe files as byte arrays

Replace strings at fixed offsets

Validate rules:

new_string.length == old_string.length

offset must be within file range

Do NOT:

change file size

insert or remove bytes

pad with null bytes

Write modified bytes back to file

Replacement Logic (Pseudo Code)
if new_cmd.len() != old_cmd.len() {
    return Err("New command must have the same length as original command");
}

for offset in iweb_offsets {
    replace_bytes(iweb_file, offset, old_cmd, new_cmd);
}

for offset in manager_offsets {
    replace_bytes(manager_file, offset, old_cmd, new_cmd);
}

SAFETY FEATURES

Create backup files before patching:

iweb.exe.bak

managerserver.exe.bak

Show error when:

file not selected

offset out of range

new command length != old command length

Show success dialog after patching

FRONTEND TECH REQUIREMENTS

React (Vite + TypeScript)

Table editor UI

Buttons:

Load Config

Save Config

Apply Patch

Error dialog & success dialog

Simple clean UI

TAURI COMMANDS (Backend API)

Expose these commands:

select_file()

load_config()

save_config(config_json)

apply_patch(iweb_path, manager_path, config_json)

UI OPTIONAL FEATURES (BONUS)

Log panel

Progress bar

Hex preview before and after replacement

Dark mode

OUTPUT REQUIREMENTS

Generate full project code including:

/src-tauri/main.rs

/src-tauri/tauri.conf.json

React frontend components

File picker

JSON config handling

Binary replace logic

Validation logic

Error handling

The project must be ready to build using:

npm install
npm run tauri build


and produce a Windows .exe file.

IMPORTANT RULE

All replacements must:

Use fixed offsets

Keep the same string length

Not modify binary structure

Not change file size

✅ END PROMPT