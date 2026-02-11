import { CommandEntry } from '../types';
import {
    getByteCountFromCommand,
    parseHexOffset,
    validateNewCommand,
    createEmptyCommandEntry,
    numberToHex,
    findPatternInBytes
} from '../utils';

// Helper to convert bytes to hex string
const bytesToHexString = (bytes: Uint8Array | undefined, start: number, end: number, label: string = ''): string => {
    if (!bytes) {
        console.debug(`bytesToHexString (${label}): No bytes data provided`);
        return '';
    }
    if (start < 0 || end <= start) {
        console.debug(`bytesToHexString (${label}): Invalid range - start=${start}, end=${end}`);
        return '';
    }
    
    // Clamp end to file size
    const clampedEnd = Math.min(end, bytes.length);
    
    if (clampedEnd <= start) {
        console.debug(`bytesToHexString (${label}): start=${start} >= fileSize=${bytes.length}`);
        return '[OUT OF BOUNDS]';
    }
    
    const slice = Array.from(bytes.slice(start, clampedEnd));
    const hex = slice.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    
    if (end > bytes.length) {
        console.debug(`bytesToHexString (${label}): end=${end} > fileSize=${bytes.length}, clamped to ${clampedEnd}, extracted ${slice.length} bytes, result="${hex}"`);
    } else {
        console.debug(`bytesToHexString (${label}): start=${start}, end=${end}, bytes=${bytes.length}, result="${hex}"`);
    }
    return hex;
};

interface CommandTableProps {
    commands: CommandEntry[];
    onCommandsChange: (commands: CommandEntry[]) => void;
    iwebFileData?: Uint8Array;
    managerFileData?: Uint8Array;
    baseCommands: string[];
    onLog?: (message: string) => void;
}

export default function CommandTable({
    commands,
    onCommandsChange,
    iwebFileData,
    managerFileData,
    baseCommands,
    onLog
}: CommandTableProps) {

    const updateCommandField = (
        index: number,
        field: keyof CommandEntry | `iweb.${keyof CommandEntry['iweb']}` | `manager.${keyof CommandEntry['manager']}`,
        value: string
    ) => {
        const newCommands = [...commands];
        const cmd = newCommands[index];
        
        // Ensure command has iweb and manager objects
        if (!newCommands[index].iweb) {
            newCommands[index].iweb = { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
        }
        if (!newCommands[index].manager) {
            newCommands[index].manager = { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
        }
        
        if (field.includes('.')) {
            const [section, subField] = field.split('.');
            if (section === 'iweb') {
                // Parse hex offset to number
                if (subField === 'offsetStart' || subField === 'offsetEnd') {
                    const numValue = parseHexOffset(value);
                    (newCommands[index].iweb as any)[subField] = numValue;
                    onLog?.(`[IWEB-${cmd.baseCmd}] Set ${subField} to ${value} (hex) = ${numValue} (dec)`);
                } else {
                    (newCommands[index].iweb as any)[subField] = value;
                }
                
                // Recalculate derived fields
                const entry = newCommands[index];
                const byteCount = getByteCountFromCommand(entry.baseCmd);
                const offsetStart = entry.iweb.offsetStart;
                const offsetEnd = offsetStart + byteCount;
                
                entry.iweb.offsetEnd = offsetEnd;
                entry.iweb.byteCount = byteCount;
                
                onLog?.(`[IWEB-${cmd.baseCmd}] Auto-calculated: byteCount=${byteCount} (from "${entry.baseCmd}".length), offsetEnd=${offsetStart}+${byteCount}=${offsetEnd}`);
                
                // Decode if we have file data
                if (iwebFileData && offsetStart > 0 && offsetStart < iwebFileData.length) {
                    try {
                        // Clamp offsetEnd to file size
                        const clampedEnd = Math.min(offsetEnd, iwebFileData.length);
                        const bytes = Array.from(iwebFileData.slice(offsetStart, clampedEnd));
                        entry.iweb.decodedString = bytes
                            .map(b => String.fromCharCode(b))
                            .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
                            .join('');
                        if (offsetEnd > iwebFileData.length) {
                            onLog?.(`[IWEB-${cmd.baseCmd}] ✓ Decoded bytes ${offsetStart}-${clampedEnd} (clamped from ${offsetEnd}): "${entry.iweb.decodedString}"`);
                        } else {
                            onLog?.(`[IWEB-${cmd.baseCmd}] ✓ Decoded bytes ${offsetStart}-${offsetEnd}: "${entry.iweb.decodedString}"`);
                        }
                    } catch (e) {
                        onLog?.(`[IWEB-${cmd.baseCmd}] ✗ Decode error: ${e}`);
                    }
                } else {
                    entry.iweb.decodedString = '';
                    const reason = !iwebFileData ? 'no file data' : offsetStart <= 0 ? 'offsetStart <= 0' : `offsetStart(${offsetStart}) >= fileSize(${iwebFileData?.length})`;
                    onLog?.(`[IWEB-${cmd.baseCmd}] Cannot decode: ${reason}`);
                    
                    // SMART FIND: If offset is invalid, search for the string in the file
                    if (iwebFileData && cmd.baseCmd && cmd.baseCmd.length >= 3) {
                        onLog?.(`[IWEB-${cmd.baseCmd}] Scanning file for pattern "${cmd.baseCmd}"...`);
                        const matches = findPatternInBytes(iwebFileData, cmd.baseCmd);
                        if (matches.length > 0) {
                            const hexMatches = matches.map(m => numberToHex(m)).join(', ');
                            onLog?.(`[IWEB-${cmd.baseCmd}] FOUND pattern at: ${hexMatches}. Please use one of these offsets.`);
                        } else {
                            onLog?.(`[IWEB-${cmd.baseCmd}] Pattern not found in file.`);
                        }
                    }
                }
            } else if (section === 'manager') {
                // Parse hex offset to number
                if (subField === 'offsetStart' || subField === 'offsetEnd') {
                    const numValue = parseHexOffset(value);
                    (newCommands[index].manager as any)[subField] = numValue;
                    onLog?.(`[MANAGER-${cmd.baseCmd}] Set ${subField} to ${value} (hex) = ${numValue} (dec)`);
                } else {
                    (newCommands[index].manager as any)[subField] = value;
                }
                
                // Recalculate derived fields
                const entry = newCommands[index];
                const offsetStart = entry.manager.offsetStart;
                const offsetEnd = entry.manager.offsetEnd;
                const byteCount = offsetEnd - offsetStart;
                
                entry.manager.byteCount = byteCount;
                
                onLog?.(`[MANAGER-${cmd.baseCmd}] Auto-calculated: byteCount=${offsetEnd}-${offsetStart}=${byteCount}`);
                
                // Decode if we have file data
                if (managerFileData && offsetStart > 0 && offsetStart < managerFileData.length) {
                    try {
                        // Clamp offsetEnd to file size
                        const clampedEnd = Math.min(offsetEnd, managerFileData.length);
                        const bytes = Array.from(managerFileData.slice(offsetStart, clampedEnd));
                        entry.manager.decodedString = bytes
                            .map(b => String.fromCharCode(b))
                            .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
                            .join('');
                        if (offsetEnd > managerFileData.length) {
                            onLog?.(`[MANAGER-${cmd.baseCmd}] ✓ Decoded bytes ${offsetStart}-${clampedEnd} (clamped from ${offsetEnd}): "${entry.manager.decodedString}"`);
                        } else {
                            onLog?.(`[MANAGER-${cmd.baseCmd}] ✓ Decoded bytes ${offsetStart}-${offsetEnd}: "${entry.manager.decodedString}"`);
                        }
                    } catch (e) {
                        onLog?.(`[MANAGER-${cmd.baseCmd}] ✗ Decode error: ${e}`);
                    }
                } else {
                    entry.manager.decodedString = '';
                    const reason = !managerFileData ? 'no file data' : offsetStart <= 0 ? 'offsetStart <= 0' : `offsetStart(${offsetStart}) >= fileSize(${managerFileData?.length})`;
                    onLog?.(`[MANAGER-${cmd.baseCmd}] Cannot decode: ${reason}`);

                    // SMART FIND: If offset is invalid, search for the string in the file
                    if (managerFileData && cmd.baseCmd && cmd.baseCmd.length >= 3) {
                        onLog?.(`[MANAGER-${cmd.baseCmd}] Scanning file for pattern "${cmd.baseCmd}"...`);
                        const matches = findPatternInBytes(managerFileData, cmd.baseCmd);
                        if (matches.length > 0) {
                            const hexMatches = matches.map(m => numberToHex(m)).join(', ');
                            onLog?.(`[MANAGER-${cmd.baseCmd}] FOUND pattern at: ${hexMatches}. Please use one of these offsets.`);
                        } else {
                            onLog?.(`[MANAGER-${cmd.baseCmd}] Pattern not found in file.`);
                        }
                    }
                }
            }
        } else {
            (newCommands[index] as any)[field] = value;
            onLog?.(`[${cmd.baseCmd}] Set ${field} to "${value}"`);
        }
        
        onCommandsChange(newCommands);
    };

    const addCommand = (baseCmd: string) => {
        onLog?.(`[+] Adding new command: "${baseCmd}"`);
        onCommandsChange([...commands, createEmptyCommandEntry(baseCmd)]);
    };

    const removeCommand = (index: number) => {
        onLog?.(`[-] Removing command at index ${index}: "${commands[index].baseCmd}"`);
        onCommandsChange(commands.filter((_, i) => i !== index));
    };

    return (
        <div className="group-box" style={{ width: '100%' }}>
            <span className="group-box-label">Command & Pattern Editor (2-Part Configuration)</span>

            {/* IWEB.EXE Section */}
            <div className="editor-section">
                <h3 className="section-title">IWEB.EXE Configuration</h3>
                <div className="table-wrapper">
                    <table className="command-table iweb-table">
                        <thead>
                            <tr>
                                <th style={{ width: '15%' }}>Base Command (Label)</th>
                                <th style={{ width: '10%' }}>Byte Count</th>
                                <th style={{ width: '15%' }}>Offset Start (Hex)</th>
                                <th style={{ width: '15%' }}>Offset End</th>
                                <th style={{ width: '10%' }}>Bytes</th>
                                <th style={{ width: '20%' }}>Decoded String</th>
                                <th style={{ width: '15%' }}>New Command</th>
                            </tr>
                        </thead>
                        <tbody>
                            {commands.map((cmd, index) => {
                                // Ensure cmd has iweb
                                const iweb = cmd.iweb || { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
                                
                                const isValidNew = validateNewCommand(cmd.baseCmd, cmd.newCmd);
                                const baseByteCount = getByteCountFromCommand(cmd.baseCmd);
                                
                                return (
                                    <tr key={`iweb-${index}`} className={!isValidNew ? 'invalid-row' : ''}>
                                        {/* Col 1: Base Command Label */}
                                        <td className="label-cell">
                                            <select
                                                value={cmd.baseCmd}
                                                onChange={(e) => {
                                                    const oldBaseCmd = cmd.baseCmd;
                                                    const newBaseCmd = e.target.value;
                                                    const newCmd = [...commands];
                                                    newCmd[index].baseCmd = newBaseCmd;
                                                    if (!newCmd[index].iweb) newCmd[index].iweb = { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
                                                    const byteCount = getByteCountFromCommand(newBaseCmd);
                                                    newCmd[index].iweb.byteCount = byteCount;
                                                    // Recalculate offsetEnd
                                                    const offsetStart = parseHexOffset(newCmd[index].iweb.offsetStart as any);
                                                    newCmd[index].iweb.offsetEnd = offsetStart + byteCount;
                                                    onLog?.(`[IWEB] Changed base command from "${oldBaseCmd}" to "${newBaseCmd}"`);
                                                    onLog?.(`[IWEB-${newBaseCmd}] Auto-calculated: byteCount=${byteCount}, offsetEnd=${offsetStart}+${byteCount}=${offsetStart + byteCount}`);
                                                    onCommandsChange(newCmd);
                                                }}
                                                style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold' }}
                                            >
                                                <option value="">-- Select Base Command --</option>
                                                {baseCommands.map((c) => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        </td>

                                        {/* Col 2: Byte Count (Auto, Read-only) */}
                                        <td className="readonly-cell" title={`Auto-calculated: ${baseByteCount} bytes`}>
                                            <input
                                                type="text"
                                                value={baseByteCount}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0' }}
                                            />
                                        </td>

                                        {/* Col 3: Offset Start (User Input) */}
                                        <td className="input-cell">
                                            <input
                                                type="text"
                                                placeholder="0x1F3A20"
                                                value={numberToHex(iweb.offsetStart)}
                                                onChange={(e) => updateCommandField(index, 'iweb.offsetStart', e.target.value)}
                                                style={{ width: '100%', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 4: Offset End (Auto, Read-only) */}
                                        <td className="readonly-cell" title="Auto-calculated">
                                            <input
                                                type="text"
                                                value={numberToHex(iweb.offsetEnd)}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 5: Byte Count (Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={bytesToHexString(iwebFileData, iweb.offsetStart, iweb.offsetEnd, `IWEB-${cmd.baseCmd}`)}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace', fontSize: '9px' }}
                                            />
                                        </td>

                                        {/* Col 6: Decoded String (Auto, Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={iweb.decodedString}
                                                readOnly
                                                style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold', color: '#000080' }}
                                            />
                                        </td>

                                        {/* Col 7: New Command (User Input) */}
                                        <td className="input-cell">
                                            <input
                                                type="text"
                                                placeholder={`${baseByteCount} chars`}
                                                maxLength={baseByteCount || 100}
                                                value={cmd.newCmd}
                                                onChange={(e) => updateCommandField(index, 'newCmd', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    background: !isValidNew && cmd.newCmd ? '#ffcccc' : 'white',
                                                    border: !isValidNew && cmd.newCmd ? '1px solid #ff0000' : '1px solid #ccc'
                                                }}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MANAGER.EXE Section */}
            <div className="editor-section" style={{ marginTop: '20px' }}>
                <h3 className="section-title">MANAGER.EXE Configuration</h3>
                <div className="table-wrapper">
                    <table className="command-table manager-table">
                        <thead>
                            <tr>
                                <th style={{ width: '20%' }}>Command Reference</th>
                                <th style={{ width: '15%' }}>Offset Start (Hex)</th>
                                <th style={{ width: '15%' }}>Offset End (Hex)</th>
                                <th style={{ width: '15%' }}>Bytes</th>
                                <th style={{ width: '15%' }}>Byte Count</th>
                                <th style={{ width: '20%' }}>Decoded String</th>
                            </tr>
                        </thead>
                        <tbody>
                            {commands.map((cmd, index) => {
                                return (
                                    <tr key={`manager-${index}`}>
                                        {/* Col 1: Command Reference */}
                                        <td className="label-cell">
                                            <input
                                                type="text"
                                                value={cmd.baseCmd}
                                                readOnly
                                                style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold' }}
                                            />
                                        </td>

                                        {/* Col 2: Offset Start (User Input) */}
                                        <td className="input-cell">
                                            <input
                                                type="text"
                                                placeholder="0x2A4B10"
                                                value={numberToHex((cmd.manager || { offsetStart: 0 }).offsetStart)}
                                                onChange={(e) => updateCommandField(index, 'manager.offsetStart', e.target.value)}
                                                style={{ width: '100%', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 3: Offset End (User Input) */}
                                        <td className="input-cell">
                                            <input
                                                type="text"
                                                placeholder="0x2A4B30"
                                                value={numberToHex((cmd.manager || { offsetEnd: 0 }).offsetEnd)}
                                                onChange={(e) => updateCommandField(index, 'manager.offsetEnd', e.target.value)}
                                                style={{ width: '100%', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 4: Bytes (Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={bytesToHexString(managerFileData, (cmd.manager || { offsetStart: 0 }).offsetStart, (cmd.manager || { offsetEnd: 0 }).offsetEnd, `MANAGER-${cmd.baseCmd}`)}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace', fontSize: '9px' }}
                                            />
                                        </td>

                                        {/* Col 5: Byte Count (Auto, Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={(cmd.manager || { byteCount: 0 }).byteCount}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0' }}
                                            />
                                        </td>

                                        {/* Col 6: Decoded String (Auto, Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={(cmd.manager || { decodedString: '' }).decodedString}
                                                readOnly
                                                style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold', color: '#000080' }}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Command Section */}
            <div style={{ marginTop: '15px' }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Add new command:</label>
                <select
                    id="baseCommandSelect"
                    onChange={(e) => {
                        if (e.target.value) {
                            addCommand(e.target.value);
                            (document.getElementById('baseCommandSelect') as HTMLSelectElement).value = '';
                        }
                    }}
                    style={{ padding: '5px', minWidth: '200px' }}
                >
                    <option value="">-- Select Base Command to Add --</option>
                    {baseCommands.filter(c => !commands.some(cmd => cmd.baseCmd === c)).map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Commands List with Remove Buttons */}
            {commands.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                    <p style={{ fontSize: '12px', color: '#666' }}>Active Commands:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {commands.map((cmd, index) => (
                            <div
                                key={`tag-${index}`}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 8px',
                                    background: '#e3f2fd',
                                    border: '1px solid #2196f3',
                                    borderRadius: '3px',
                                    fontSize: '11px'
                                }}
                            >
                                <span>{cmd.baseCmd}</span>
                                <button
                                    onClick={() => removeCommand(index)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#d32f2f',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        padding: '0'
                                    }}
                                    title="Remove this command"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
