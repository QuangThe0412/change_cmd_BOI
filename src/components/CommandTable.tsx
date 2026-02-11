import React from 'react';
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
            newCommands[index].iweb = { 
                offsetStart: 0, 
                offsetEnd: 0, 
                byteCount: 0, 
                decodedString: '',
                offsetStart2: 0,
                offsetEnd2: 0,
                decodedString2: ''
            };
        }
        if (!newCommands[index].manager) {
            newCommands[index].manager = { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
        }
        
        if (field.includes('.')) {
            const [section, subField] = field.split('.');
            if (section === 'iweb') {
                // Parse hex offset to number
                if (subField === 'offsetStart' || subField === 'offsetEnd' || subField === 'offsetStart2') {
                    const numValue = parseHexOffset(value);
                    (newCommands[index].iweb as any)[subField] = numValue;
                    onLog?.(`[IWEB-${cmd.baseCmd}] Set ${subField} to ${value} (hex) = ${numValue} (dec)`);
                } else {
                    (newCommands[index].iweb as any)[subField] = value;
                }
                
                // Recalculate derived fields
                const entry = newCommands[index];
                const byteCount = getByteCountFromCommand(entry.baseCmd);
                entry.iweb.byteCount = byteCount;

                // Handle Offset 1
                const offsetStart1 = entry.iweb.offsetStart;
                const offsetEnd1 = offsetStart1 + byteCount;
                entry.iweb.offsetEnd = offsetEnd1;

                // Handle Offset 2
                const offsetStart2 = entry.iweb.offsetStart2 || 0;
                const offsetEnd2 = offsetStart2 > 0 ? offsetStart2 + byteCount : 0;
                entry.iweb.offsetEnd2 = offsetEnd2;
                
                onLog?.(`[IWEB-${cmd.baseCmd}] Recalculated Line 1: offsetEnd=${offsetEnd1}`);
                if (offsetStart2 > 0) onLog?.(`[IWEB-${cmd.baseCmd}] Recalculated Line 2: offsetEnd=${offsetEnd2}`);
                
                // Decode Line 1
                if (iwebFileData && offsetStart1 > 0 && offsetStart1 < iwebFileData.length) {
                    const clampedEnd = Math.min(offsetEnd1, iwebFileData.length);
                    entry.iweb.decodedString = Array.from(iwebFileData.slice(offsetStart1, clampedEnd))
                        .map(b => String.fromCharCode(b))
                        .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
                        .join('');
                } else {
                    entry.iweb.decodedString = '';
                    if (iwebFileData && offsetStart1 > 0 && subField === 'offsetStart') {
                        onLog?.(`[IWEB-${cmd.baseCmd}] Scanning file for pattern...`);
                        const matches = findPatternInBytes(iwebFileData, cmd.baseCmd);
                        if (matches.length > 0) onLog?.(`[IWEB-${cmd.baseCmd}] FOUND at: ${matches.map(m => numberToHex(m)).join(', ')}`);
                    }
                }

                // Decode Line 2
                if (iwebFileData && offsetStart2 > 0 && offsetStart2 < iwebFileData.length) {
                    const clampedEnd2 = Math.min(offsetEnd2, iwebFileData.length);
                    entry.iweb.decodedString2 = Array.from(iwebFileData.slice(offsetStart2, clampedEnd2))
                        .map(b => String.fromCharCode(b))
                        .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
                        .join('');
                } else {
                    entry.iweb.decodedString2 = '';
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
                const byteCount = entry.iweb.byteCount; // Always use byteCount from IWEB
                const offsetStart = entry.manager.offsetStart;
                const offsetEnd = offsetStart + byteCount;
                
                entry.manager.offsetEnd = offsetEnd;
                entry.manager.byteCount = byteCount;
                
                onLog?.(`[MANAGER-${cmd.baseCmd}] Auto-calculated using IWEB byteCount: byteCount=${byteCount}, offsetEnd=${offsetStart}+${byteCount}=${offsetEnd}`);
                
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
                                const iweb = cmd.iweb || {
                                    offsetStart: 0,
                                    offsetEnd: 0,
                                    byteCount: 0,
                                    decodedString: '',
                                    offsetStart2: 0,
                                    offsetEnd2: 0,
                                    decodedString2: ''
                                };

                                const isValidNew = validateNewCommand(cmd.baseCmd, cmd.newCmd);
                                const baseByteCount = getByteCountFromCommand(cmd.baseCmd);

                                return (
                                    <React.Fragment key={`iweb-group-${index}`}>
                                        {/* Row 1: Primary Offset */}
                                        <tr className={!isValidNew ? 'invalid-row' : ''}>
                                            {/* Col 1: Base Command Label */}
                                            <td className="label-cell">
                                                <select
                                                    value={cmd.baseCmd}
                                                    onChange={(e) => {
                                                        const oldBaseCmd = cmd.baseCmd;
                                                        const newBaseCmd = e.target.value;
                                                        const newCmd = [...commands];
                                                        newCmd[index].baseCmd = newBaseCmd;
                                                        if (!newCmd[index].iweb) {
                                                            newCmd[index].iweb = {
                                                                offsetStart: 0,
                                                                offsetEnd: 0,
                                                                byteCount: 0,
                                                                decodedString: '',
                                                                offsetStart2: 0,
                                                                offsetEnd2: 0,
                                                                decodedString2: ''
                                                            };
                                                        }
                                                        const byteCount = getByteCountFromCommand(newBaseCmd);
                                                        newCmd[index].iweb.byteCount = byteCount;

                                                        // Recalculate offsetEnd 1
                                                        const offsetStart1 = parseHexOffset(newCmd[index].iweb.offsetStart as any);
                                                        newCmd[index].iweb.offsetEnd = offsetStart1 + byteCount;

                                                        // Recalculate offsetEnd 2
                                                        const offsetStart2 = parseHexOffset(newCmd[index].iweb.offsetStart2 as any);
                                                        if (offsetStart2 > 0) {
                                                            newCmd[index].iweb.offsetEnd2 = offsetStart2 + byteCount;
                                                        }

                                                        // Sync manager fields
                                                        if (!newCmd[index].manager) newCmd[index].manager = { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' };
                                                        newCmd[index].manager.byteCount = byteCount;
                                                        const mOffsetStart = parseHexOffset(newCmd[index].manager.offsetStart as any);
                                                        newCmd[index].manager.offsetEnd = mOffsetStart + byteCount;

                                                        onLog?.(`[IWEB] Changed base command from "${oldBaseCmd}" to "${newBaseCmd}"`);
                                                        onLog?.(`[IWEB-${newBaseCmd}] Auto-calculated: byteCount=${byteCount}, offsetEnd=${offsetStart1}+${byteCount}=${offsetStart1 + byteCount}`);
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

                                            {/* Col 5: Bytes (Read-only) */}
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

                                        {/* Row 2: Secondary Offset (Line 2) */}
                                        <tr style={{ backgroundColor: '#f9f9f9' }}>
                                            {/* Col 1: Base Command Label (Read-only clone) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={cmd.baseCmd}
                                                    readOnly
                                                    style={{ width: '100%', background: '#e0e0e0', fontStyle: 'italic' }}
                                                />
                                            </td>

                                            {/* Col 2: Byte Count (Read-only clone) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={baseByteCount}
                                                    readOnly
                                                    style={{ width: '100%', background: '#e0e0e0' }}
                                                />
                                            </td>

                                            {/* Col 3: Offset Start 2 (User Input) */}
                                            <td className="input-cell">
                                                <input
                                                    type="text"
                                                    placeholder="0x1F3A20 (Line 2)"
                                                    value={numberToHex(iweb.offsetStart2)}
                                                    onChange={(e) => updateCommandField(index, 'iweb.offsetStart2', e.target.value)}
                                                    style={{ width: '100%', fontFamily: 'monospace', borderLeft: '3px solid #0078d4' }}
                                                />
                                            </td>

                                            {/* Col 4: Offset End 2 (Auto, Read-only) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={numberToHex(iweb.offsetEnd2)}
                                                    readOnly
                                                    style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace' }}
                                                />
                                            </td>

                                            {/* Col 5: Bytes 2 (Read-only) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={bytesToHexString(iwebFileData, iweb.offsetStart2 || 0, iweb.offsetEnd2 || 0, `IWEB-L2-${cmd.baseCmd}`)}
                                                    readOnly
                                                    style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace', fontSize: '9px' }}
                                                />
                                            </td>

                                            {/* Col 6: Decoded String 2 (Auto, Read-only) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={iweb.decodedString2 || ''}
                                                    readOnly
                                                    style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold', color: '#006400' }}
                                                />
                                            </td>

                                            {/* Col 7: New Command (Read-only clone) */}
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={cmd.newCmd}
                                                    readOnly
                                                    style={{ width: '100%', background: '#eee', color: '#666' }}
                                                />
                                            </td>
                                        </tr>
                                    </React.Fragment>
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
                                <th style={{ width: '15%' }}>Command Reference</th>
                                <th style={{ width: '8%' }}>Byte Count</th>
                                <th style={{ width: '15%' }}>Offset Start (Hex)</th>
                                <th style={{ width: '15%' }}>Offset End</th>
                                <th style={{ width: '12%' }}>Bytes</th>
                                <th style={{ width: '18%' }}>Decoded String</th>
                                <th style={{ width: '17%' }}>New Command</th>
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

                                        {/* Col 2: Byte Count (Mirrored from IWEB) */}
                                        <td className="readonly-cell" title="Mirrored from IWEB.EXE Configuration">
                                            <input
                                                type="text"
                                                value={cmd.iweb.byteCount}
                                                readOnly
                                                style={{ width: '100%', background: '#f0f0f0', color: '#000080' }}
                                            />
                                        </td>

                                        {/* Col 3: Offset Start (User Input) */}
                                        <td className="input-cell">
                                            <input
                                                type="text"
                                                placeholder="0x2A4B10"
                                                value={numberToHex((cmd.manager || { offsetStart: 0 }).offsetStart)}
                                                onChange={(e) => updateCommandField(index, 'manager.offsetStart', e.target.value)}
                                                style={{ width: '100%', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 4: Offset End (Auto, Read-only) */}
                                        <td className="readonly-cell" title="Auto-calculated">
                                            <input
                                                type="text"
                                                value={numberToHex((cmd.manager || { offsetEnd: 0 }).offsetEnd)}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace' }}
                                            />
                                        </td>

                                        {/* Col 5: Bytes (Read-only) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={bytesToHexString(managerFileData, (cmd.manager || { offsetStart: 0 }).offsetStart, (cmd.manager || { offsetEnd: 0 }).offsetEnd, `MANAGER-${cmd.baseCmd}`)}
                                                readOnly
                                                style={{ width: '100%', background: '#e0e0e0', fontFamily: 'monospace', fontSize: '9px' }}
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

                                        {/* Col 7: New Command (Read-only, Mirror IWEB) */}
                                        <td className="readonly-cell">
                                            <input
                                                type="text"
                                                value={cmd.newCmd}
                                                readOnly
                                                style={{ width: '100%', background: '#f0f0f0', color: '#006400' }}
                                                title="Mirrors New Command from IWEB.EXE"
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
