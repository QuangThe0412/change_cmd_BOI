import React from 'react';
import { CommandEntry, BaseCommand } from '../types';
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
    baseCommands: BaseCommand[];
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

    const getCmdLabel = (baseCmd: string) => {
        const bc = baseCommands.find(c => c.name === baseCmd);
        return bc ? `${bc.index}. ${baseCmd}` : baseCmd;
    };

    const updateCommandField = (
        index: number,
        field: keyof CommandEntry | `iweb.${keyof CommandEntry['iweb']}` | `manager.${keyof CommandEntry['manager']}`,
        value: string
    ) => {
        const newCommands = [...commands];
        const cmd = newCommands[index];
        const cmdLabel = getCmdLabel(cmd.baseCmd);
        
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
                    onLog?.(`[IWEB-${cmdLabel}] Set ${subField} to ${value} (hex) = ${numValue} (dec)`);
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
                
                onLog?.(`[IWEB-${cmdLabel}] Recalculated Line 1: offsetEnd=${offsetEnd1}`);
                if (offsetStart2 > 0) onLog?.(`[IWEB-${cmdLabel}] Recalculated Line 2: offsetEnd=${offsetEnd2}`);
                
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
                        onLog?.(`[IWEB-${cmdLabel}] Scanning file for pattern...`);
                        const matches = findPatternInBytes(iwebFileData, cmd.baseCmd);
                        if (matches.length > 0) onLog?.(`[IWEB-${cmdLabel}] FOUND at: ${matches.map(m => numberToHex(m)).join(', ')}`);
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
                    onLog?.(`[MANAGER-${cmdLabel}] Set ${subField} to ${value} (hex) = ${numValue} (dec)`);
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
                
                onLog?.(`[MANAGER-${cmdLabel}] Auto-calculated using IWEB byteCount: byteCount=${byteCount}, offsetEnd=${offsetStart}+${byteCount}=${offsetEnd}`);
                
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
                            onLog?.(`[MANAGER-${cmdLabel}] ✓ Decoded bytes ${offsetStart}-${clampedEnd} (clamped from ${offsetEnd}): "${entry.manager.decodedString}"`);
                        } else {
                            onLog?.(`[MANAGER-${cmdLabel}] ✓ Decoded bytes ${offsetStart}-${offsetEnd}: "${entry.manager.decodedString}"`);
                        }
                    } catch (e) {
                        onLog?.(`[MANAGER-${cmdLabel}] ✗ Decode error: ${e}`);
                    }
                } else {
                    entry.manager.decodedString = '';
                    const reason = !managerFileData ? 'no file data' : offsetStart <= 0 ? 'offsetStart <= 0' : `offsetStart(${offsetStart}) >= fileSize(${managerFileData?.length})`;
                    onLog?.(`[MANAGER-${cmdLabel}] Cannot decode: ${reason}`);

                    // SMART FIND: If offset is invalid, search for the string in the file
                    if (managerFileData && cmd.baseCmd && cmd.baseCmd.length >= 3) {
                        onLog?.(`[MANAGER-${cmdLabel}] Scanning file for pattern "${cmd.baseCmd}"...`);
                        const matches = findPatternInBytes(managerFileData, cmd.baseCmd);
                        if (matches.length > 0) {
                            const hexMatches = matches.map(m => numberToHex(m)).join(', ');
                            onLog?.(`[MANAGER-${cmdLabel}] FOUND pattern at: ${hexMatches}. Please use one of these offsets.`);
                        } else {
                            onLog?.(`[MANAGER-${cmdLabel}] Pattern not found in file.`);
                        }
                    }
                }
            }
        } else {
            (newCommands[index] as any)[field] = value;
            onLog?.(`[${cmdLabel}] Set ${field} to "${value}"`);
        }
        
        onCommandsChange(newCommands);
    };

    const addCommand = (baseCmd: string) => {
        const baseCmdData = baseCommands.find(c => c.name === baseCmd);
        const label = baseCmdData ? `${baseCmdData.index}. ${baseCmd}` : baseCmd;
        onLog?.(`[+] Adding new command: "${label}"`);
        onCommandsChange([...commands, createEmptyCommandEntry(baseCmd)]);
    };

    const removeCommand = (index: number) => {
        const cmd = commands[index];
        const baseCmdData = baseCommands.find(c => c.name === cmd.baseCmd);
        const label = baseCmdData ? `${baseCmdData.index}. ${cmd.baseCmd}` : cmd.baseCmd;
        onLog?.(`[-] Removing command "${label}"`);
        onCommandsChange(commands.filter((_, i) => i !== index));
    };

    return (
        <div className="group-box">
            <span className="group-box-label">Unified Command Configuration (IWEB + MANAGER)</span>

            <div className="editor-section">
                <div className="table-wrapper">
                    <table className="command-table unified-table">
                        <thead>
                            <tr>
                                <th style={{ width: '10%' }}>Base Command</th>
                                <th style={{ width: '8%' }}>Target</th>
                                <th style={{ width: '6%' }}>Bytes</th>
                                <th style={{ width: '12%' }}>Offset Start (Hex)</th>
                                <th style={{ width: '12%' }}>Offset End</th>
                                <th style={{ width: '10%' }}>Binary Hex</th>
                                <th style={{ width: '15%' }}>Decoded String</th>
                                <th style={{ width: '12%' }}>New Command</th>
                                <th style={{ width: '100px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {commands.map((cmd, index) => {
                                const cmdLabel = getCmdLabel(cmd.baseCmd);
                                const iweb = cmd.iweb || {
                                    offsetStart: 0,
                                    offsetEnd: 0,
                                    byteCount: 0,
                                    decodedString: '',
                                    offsetStart2: 0,
                                    offsetEnd2: 0,
                                    decodedString2: ''
                                };
                                const manager = cmd.manager || {
                                    offsetStart: 0,
                                    offsetEnd: 0,
                                    byteCount: 0,
                                    decodedString: ''
                                };

                                const isValidNew = validateNewCommand(cmd.baseCmd, cmd.newCmd);
                                const baseByteCount = getByteCountFromCommand(cmd.baseCmd);

                                return (
                                    <React.Fragment key={`unified-group-${index}`}>
                                        {/* Row 1: IWEB Line 1 */}
                                        <tr 
                                            className={`${!isValidNew ? 'invalid-row' : ''} ${cmd.isBlocked ? 'blocked-row' : ''}`}
                                            style={{ opacity: cmd.isBlocked ? 0.6 : 1 }}
                                        >
                                            {/* Common: Base Command (Label) */}
                                            <td rowSpan={3} className="label-cell" style={{ verticalAlign: 'middle', borderRight: '1px solid #ddd' }}>
                                                <select
                                                    value={cmd.baseCmd}
                                                    onChange={(e) => {
                                                        const newBaseCmd = e.target.value;
                                                        const newCmds = [...commands];
                                                        newCmds[index].baseCmd = newBaseCmd;
                                                        
                                                        const byteCount = getByteCountFromCommand(newBaseCmd);
                                                        if (newCmds[index].iweb) newCmds[index].iweb.byteCount = byteCount;
                                                        if (newCmds[index].manager) newCmds[index].manager.byteCount = byteCount;

                                                        // Sync offsets
                                                        const o1 = parseHexOffset(newCmds[index].iweb.offsetStart as any);
                                                        newCmds[index].iweb.offsetEnd = o1 + byteCount;
                                                        
                                                        const o2 = parseHexOffset(newCmds[index].iweb.offsetStart2 as any);
                                                        if (o2 > 0) newCmds[index].iweb.offsetEnd2 = o2 + byteCount;

                                                        const om = parseHexOffset(newCmds[index].manager.offsetStart as any);
                                                        newCmds[index].manager.offsetEnd = om + byteCount;

                                                        onCommandsChange(newCmds);
                                                    }}
                                                    style={{ width: '100%', background: '#f0f0f0', fontWeight: 'bold' }}
                                                >
                                                    {baseCommands.map((c) => (
                                                        <option key={c.index} value={c.name}>
                                                            {c.index}. {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '4px', color: '#666' }}>
                                                    ({baseByteCount} bytes)
                                                </div>
                                            </td>

                                            {/* IWEB L1 Specific */}
                                            <td style={{ fontWeight: 'bold', color: '#0078d4', fontSize: '11px' }}>IWEB L1</td>
                                            <td className="readonly-cell">{baseByteCount}</td>
                                            <td className="input-cell">
                                                <input
                                                    type="text"
                                                    value={numberToHex(iweb.offsetStart)}
                                                    onChange={(e) => updateCommandField(index, 'iweb.offsetStart', e.target.value)}
                                                    style={{ width: '100%', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell">{numberToHex(iweb.offsetEnd)}</td>
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={bytesToHexString(iwebFileData, iweb.offsetStart, iweb.offsetEnd, `IWEB-L1-${cmdLabel}`)}
                                                    readOnly
                                                    style={{ width: '100%', background: '#f5f5f5', border: 'none', fontSize: '9px', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell" style={{ fontWeight: 'bold', color: '#000080' }}>
                                                {iweb.decodedString}
                                            </td>

                                            {/* Common: New Command */}
                                            <td rowSpan={3} className="input-cell" style={{ verticalAlign: 'middle', borderLeft: '1px solid #ddd' }}>
                                                <input
                                                    type="text"
                                                    placeholder={`${baseByteCount} chars`}
                                                    maxLength={baseByteCount || 100}
                                                    value={cmd.newCmd}
                                                    onChange={(e) => updateCommandField(index, 'newCmd', e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '4px',
                                                        background: !isValidNew && cmd.newCmd ? '#ffcccc' : 'white',
                                                        border: !isValidNew && cmd.newCmd ? '1px solid #ff0000' : '1px solid #ccc'
                                                    }}
                                                />
                                            </td>

                                            {/* Common: Actions */}
                                            <td rowSpan={3} style={{ verticalAlign: 'middle', textAlign: 'center', borderLeft: '1px solid #ddd' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '5px' }}>
                                                    <button
                                                        onClick={() => {
                                                            const newCmds = [...commands];
                                                            newCmds[index].isBlocked = !newCmds[index].isBlocked;
                                                            const bc = baseCommands.find(c => c.name === cmd.baseCmd);
                                                            const label = bc ? `${bc.index}. ${cmd.baseCmd}` : cmd.baseCmd;
                                                            onLog?.(`[${label}] ${newCmds[index].isBlocked ? 'Blocked (will skip)' : 'Unblocked'}`);
                                                            onCommandsChange(newCmds);
                                                        }}
                                                        className={`btn-action ${cmd.isBlocked ? 'btn-unblock' : 'btn-block'}`}
                                                        style={{
                                                            fontSize: '11px',
                                                            padding: '4px',
                                                            background: cmd.isBlocked ? '#4caf50' : '#ff9800',
                                                            color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'
                                                        }}
                                                    >
                                                        {cmd.isBlocked ? 'Unblock' : 'Block'}
                                                    </button>
                                                    <button
                                                        onClick={() => removeCommand(index)}
                                                        style={{
                                                            fontSize: '11px',
                                                            padding: '4px',
                                                            background: '#f44336',
                                                            color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer'
                                                        }}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Row 2: IWEB Line 2 */}
                                        <tr 
                                            className={cmd.isBlocked ? 'blocked-row' : ''}
                                            style={{ opacity: cmd.isBlocked ? 0.6 : 1, backgroundColor: '#f9f9f9' }}
                                        >
                                            <td style={{ fontWeight: 'bold', color: '#2b88d8', fontSize: '11px' }}>IWEB L2</td>
                                            <td className="readonly-cell">{baseByteCount}</td>
                                            <td className="input-cell">
                                                <input
                                                    type="text"
                                                    value={numberToHex(iweb.offsetStart2)}
                                                    onChange={(e) => updateCommandField(index, 'iweb.offsetStart2', e.target.value)}
                                                    style={{ width: '100%', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell">{numberToHex(iweb.offsetEnd2)}</td>
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={bytesToHexString(iwebFileData, iweb.offsetStart2 || 0, iweb.offsetEnd2 || 0, `IWEB-L2-${cmdLabel}`)}
                                                    readOnly
                                                    style={{ width: '100%', background: '#f5f5f5', border: 'none', fontSize: '9px', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell" style={{ fontWeight: 'bold', color: '#006400' }}>
                                                {iweb.decodedString2}
                                            </td>
                                        </tr>

                                        {/* Row 3: MANAGER */}
                                        <tr 
                                            className={cmd.isBlocked ? 'blocked-row' : ''}
                                            style={{ opacity: cmd.isBlocked ? 0.6 : 1, backgroundColor: '#fffbe6' }}
                                        >
                                            <td style={{ fontWeight: 'bold', color: '#856404', fontSize: '11px' }}>MANAGER</td>
                                            <td className="readonly-cell">{baseByteCount}</td>
                                            <td className="input-cell">
                                                <input
                                                    type="text"
                                                    value={numberToHex(manager.offsetStart)}
                                                    onChange={(e) => updateCommandField(index, 'manager.offsetStart', e.target.value)}
                                                    style={{ width: '100%', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell">{numberToHex(manager.offsetEnd)}</td>
                                            <td className="readonly-cell">
                                                <input
                                                    type="text"
                                                    value={bytesToHexString(managerFileData, manager.offsetStart, manager.offsetEnd, `MANAGER-${cmdLabel}`)}
                                                    readOnly
                                                    style={{ width: '100%', background: '#f5f5f5', border: 'none', fontSize: '9px', fontFamily: 'monospace' }}
                                                />
                                            </td>
                                            <td className="readonly-cell" style={{ fontWeight: 'bold', color: '#856404' }}>
                                                {manager.decodedString}
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Command Section */}
            <div className="add-command-container" style={{ padding: '8px', background: '#f0f0f0', borderRadius: '4px', border: '1px solid #ccc', flexShrink: 0 }}>
                <label style={{ marginRight: '10px', fontWeight: 'bold', fontSize: '11px' }}>Add new command:</label>
                <select
                    id="baseCommandSelect"
                    onChange={(e) => {
                        if (e.target.value) {
                            addCommand(e.target.value);
                            (document.getElementById('baseCommandSelect') as HTMLSelectElement).value = '';
                        }
                    }}
                    style={{ padding: '5px', minWidth: '250px', border: '1px solid #0078d4', borderRadius: '3px' }}
                >
                    <option value="">-- Select Base Command --</option>
                    {baseCommands.filter(c => !commands.some(cmd => cmd.baseCmd === c.name)).map((c) => (
                        <option key={c.index} value={c.name}>
                            {c.index}. {c.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
