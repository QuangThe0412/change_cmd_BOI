# Binary Command Editor

A desktop application built with Tauri (Rust + React) for editing command strings in executable files at fixed memory offsets.

## Features

- ✅ Select and edit two executable files (iweb.exe and managerserver.exe)
- ✅ Edit command strings with automatic length validation
- ✅ Configure memory offsets in hexadecimal format
- ✅ Automatic backup creation (.bak files)
- ✅ JSON configuration import/export
- ✅ Modern, responsive UI with dark theme

## Installation

### Prerequisites

- Node.js (v16 or later)
- Rust (latest stable)
- npm or yarn

### Setup

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

### Development Mode

Run the application in development mode:

```bash
npm run tauri dev
```

### Build Production

Build the production executable:

```bash
npm run tauri build
```

The executable will be created in `src-tauri/target/release/`.

## How It Works

1. **Select Files**: Choose your `iweb.exe` and `managerserver.exe` files
2. **Edit Commands**: Add or modify command mappings in the table
3. **Configure Offsets**: Set the memory offsets for each command (hex format)
4. **Save/Load Config**: Export or import your configuration as JSON
5. **Apply Patch**: Execute the patching process (backups are created automatically)

## Important Rules

- ⚠️ New command length must equal old command length
- ⚠️ Offsets must be in hexadecimal format (e.g., 0x1F3A20)
- ⚠️ Backup files (.bak) are created before any modifications
- ⚠️ File size remains unchanged after patching

## Configuration Format

```json
{
  "commands": [
    {
      "old": "BULL",
      "new": "FULL",
      "iweb_offsets": ["0x1F3A20", "0x1F3A40"],
      "manager_offsets": ["0x2A4B10", "0x2A4B30"]
    }
  ]
}
```

## License

This project is provided as-is for educational purposes.
