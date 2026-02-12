// ===== IWEB.EXE Entry =====
export interface IwebEntry {
    offsetStart: number;  // User input (hex)
    offsetEnd: number;    // Auto-calculated
    byteCount: number;    // Auto-calculated from offsetEnd - offsetStart
    decodedString: string; // Auto-decoded from file
    offsetStart2: number; // Secondary offset (Line 2)
    offsetEnd2: number;   // Auto-calculated (Line 2)
    decodedString2: string; // Auto-decoded (Line 2)
}

// ===== MANAGER.EXE Entry =====
export interface ManagerEntry {
    offsetStart: number;  // User input (hex)
    offsetEnd: number;    // Auto-calculated
    byteCount: number;    // Auto-calculated from offsetEnd - offsetStart
    decodedString: string; // Auto-decoded from file
}

// ===== Base Command Reference =====
export interface BaseCommand {
    index: number;
    name: string;
}

// ===== Command Entry (combines both files) =====
export interface CommandEntry {
    baseCmd: string;      // The "name" from BaseCommand
    newCmd: string;       // User input: new command
    iweb: IwebEntry;      // IWEB.EXE configuration
    manager: ManagerEntry; // MANAGER.EXE configuration
    isBlocked?: boolean;  // If true, the command is kept as is (not patched)
}

// ===== Legacy command format (for backward compatibility) =====
export interface Command {
    old: string;
    new: string;
    hex_pattern: string;
}

export interface Config {
    iwebPath: string;
    managerPath: string;
    commands: CommandEntry[];
}

export interface PatchResult {
    success: boolean;
    message: string;
}
