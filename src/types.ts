export interface Command {
    old: string;
    new: string;
    hex_pattern: string;
}

export interface Config {
    commands: Command[];
}

export interface PatchResult {
    success: boolean;
    message: string;
}
