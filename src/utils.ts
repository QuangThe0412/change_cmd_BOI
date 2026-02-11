import { CommandEntry, IwebEntry, ManagerEntry } from './types';

/**
 * Convert hex string to number
 * Example: "0x1F3A20" -> 2031136
 */
export const parseHexOffset = (hexStr: string): number => {
    try {
        const cleaned = hexStr.trim().replace('0x', '').replace('0X', '');
        return parseInt(cleaned, 16);
    } catch {
        return 0;
    }
};

/**
 * Convert number to hex string
 * Example: 2031136 -> "0x1F3A20"
 */
export const numberToHex = (num: number): string => {
    return '0x' + num.toString(16).toUpperCase();
};

/**
 * Calculate byte count from base command string
 * Counts the number of characters in the string
 */
export const getByteCountFromCommand = (baseCmd: string): number => {
    if (!baseCmd || baseCmd === 'N/A') return 0;
    // For UTF-8/ASCII, 1 character = 1 byte (for basic ASCII)
    return baseCmd.length;
};

/**
 * Decode hex string to ASCII/UTF-8
 */
export const hexToString = (hex: string): string => {
    try {
        const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
        if (clean.length % 2 !== 0) return '';
        
        let str = '';
        for (let i = 0; i < clean.length; i += 2) {
            const charCode = parseInt(clean.substr(i, 2), 16);
            // Filter out non-printable characters
            if (charCode >= 32 && charCode <= 126) {
                str += String.fromCharCode(charCode);
            }
        }
        return str;
    } catch {
        return '';
    }
};

/**
 * Calculate IwebEntry with auto-calculated fields
 */
export const calculateIwebEntry = (
    baseCmd: string,
    offsetStartHex: string,
    fileData?: Uint8Array
): IwebEntry => {
    const byteCount = getByteCountFromCommand(baseCmd);
    const offsetStart = parseHexOffset(offsetStartHex);
    const offsetEnd = offsetStart + byteCount;
    
    let decodedString = '';
    if (fileData && offsetStart > 0 && offsetEnd <= fileData.length) {
        const bytes = Array.from(fileData.slice(offsetStart, offsetEnd));
        decodedString = bytes
            .map(b => String.fromCharCode(b))
            .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
            .join('');
    }
    
    return {
        offsetStart,
        offsetEnd,
        byteCount,
        decodedString,
        offsetStart2: 0,
        offsetEnd2: 0,
        decodedString2: ''
    };
};

/**
 * Calculate ManagerEntry with auto-calculated fields
 * Note: Manager entries don't have byteCount from base command
 * Instead, byteCount = offsetEnd - offsetStart
 */
export const calculateManagerEntry = (
    offsetStartHex: string,
    offsetEndHex: string,
    fileData?: Uint8Array
): ManagerEntry => {
    const offsetStart = parseHexOffset(offsetStartHex);
    const offsetEnd = parseHexOffset(offsetEndHex);
    const byteCount = offsetEnd - offsetStart;
    
    let decodedString = '';
    if (fileData && offsetStart > 0 && offsetEnd <= fileData.length) {
        const bytes = Array.from(fileData.slice(offsetStart, offsetEnd));
        decodedString = bytes
            .map(b => String.fromCharCode(b))
            .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
            .join('');
    }
    
    return {
        offsetStart,
        offsetEnd,
        byteCount,
        decodedString
    };
};

/**
 * Validate new command
 * - Must have same length as base command
 * - Must be different from base command
 */
export const validateNewCommand = (baseCmd: string, newCmd: string): boolean => {
    if (!baseCmd || baseCmd === 'N/A' || newCmd === '') return true;
    const baseLength = baseCmd.length;
    return newCmd.length === baseLength;
};

/**
 * Create empty CommandEntry
 */
export const createEmptyCommandEntry = (baseCmd: string = ''): CommandEntry => {
    const byteCount = baseCmd ? getByteCountFromCommand(baseCmd) : 0;
    return {
        baseCmd,
        newCmd: '',
        iweb: {
            offsetStart: 0,
            offsetEnd: 0,
            byteCount: byteCount,
            decodedString: '',
            offsetStart2: 0,
            offsetEnd2: 0,
            decodedString2: ''
        },
        manager: {
            offsetStart: 0,
            offsetEnd: 0,
            byteCount: byteCount,
            decodedString: ''
        }
    };
};

/**
 * Searches for a string pattern in a Uint8Array
 * Returns all found offsets
 */
export const findPatternInBytes = (data: Uint8Array, pattern: string): number[] => {
    if (!pattern || !data || data.length === 0) return [];
    
    // Simple naive search for bytes
    const results: number[] = [];
    const patternBytes = Array.from(pattern).map(c => c.charCodeAt(0));
    
    for (let i = 0; i <= data.length - patternBytes.length; i++) {
        let match = true;
        for (let j = 0; j < patternBytes.length; j++) {
            if (data[i + j] !== patternBytes[j]) {
                match = false;
                break;
            }
        }
        if (match) results.push(i);
    }
    return results;
};
