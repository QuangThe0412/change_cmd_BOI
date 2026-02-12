import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { readTextFile, writeTextFile, exists, readBinaryFile } from '@tauri-apps/api/fs';
import { join, basename } from '@tauri-apps/api/path';
import { ask } from '@tauri-apps/api/dialog';
import FileSelector from './components/FileSelector';
import CommandTable from './components/CommandTable';
import { CommandEntry, PatchResult, BaseCommand } from './types';
import { numberToHex, createEmptyCommandEntry } from './utils';
import './App.css';

const CONFIG_FILE = 'settings.json';

function App() {
    const [iwebPath, setIwebPath] = useState('');
    const [managerPath, setManagerPath] = useState('');
    const [commands, setCommands] = useState<CommandEntry[]>([]);
    const [baseCommands, setBaseCommands] = useState<BaseCommand[]>([]);
    const [iwebFileData, setIwebFileData] = useState<Uint8Array | undefined>();
    const [managerFileData, setManagerFileData] = useState<Uint8Array | undefined>();
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [dataDir, setDataDir] = useState<string>('');
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Helper to add debug logs
    const addLog = (log: string) => {
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        setDebugLogs(prev => [...prev, `[${timestamp}] ${log}`]);
        console.log(`[${timestamp}] ${log}`);
    };

    // Helper to decode strings from file data
    const decodeString = (data: Uint8Array | undefined, start: number, end: number): string => {
        if (!data || start <= 0 || start >= data.length) return '';
        const clampedEnd = Math.min(end, data.length);
        if (clampedEnd <= start) return '';
        return Array.from(data.slice(start, clampedEnd))
            .map(b => String.fromCharCode(b))
            .filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)
            .join('');
    };

    // Update decoded strings when file data or commands change
    useEffect(() => {
        if (!iwebFileData && !managerFileData) return;
        
        let changed = false;
        const newCommands = commands.map(cmd => {
            const iwebDec1 = decodeString(iwebFileData, cmd.iweb.offsetStart, cmd.iweb.offsetEnd);
            const iwebDec2 = decodeString(iwebFileData, cmd.iweb.offsetStart2, cmd.iweb.offsetEnd2);
            const managerDec = decodeString(managerFileData, cmd.manager.offsetStart, cmd.manager.offsetEnd);
            
            if (cmd.iweb.decodedString !== iwebDec1 || 
                cmd.iweb.decodedString2 !== iwebDec2 || 
                cmd.manager.decodedString !== managerDec) {
                changed = true;
                return {
                    ...cmd,
                    iweb: { ...cmd.iweb, decodedString: iwebDec1, decodedString2: iwebDec2 },
                    manager: { ...cmd.manager, decodedString: managerDec }
                };
            }
            return cmd;
        });

        if (changed) {
            setCommands(newCommands);
        }
    }, [iwebFileData, managerFileData, commands.length]); 

    console.log('App rendered, commands:', commands);

    useEffect(() => {
        const initDataDir = async () => {
            try {
                const dir = await invoke<string>('get_data_dir');
                setDataDir(dir);
            } catch (e) {
                console.error('Failed to get data directory:', e);
            }
        };
        initDataDir();
    }, []);

    // Load file binary data when paths change
    useEffect(() => {
        const loadFileData = async () => {
            try {
                if (iwebPath) {
                    addLog(`Loading IWEB.EXE from: ${iwebPath}`);
                    if (await exists(iwebPath)) {
                        const data = await readBinaryFile(iwebPath);
                        const fileBytes = new Uint8Array(data);
                        setIwebFileData(fileBytes);
                        
                        // Verbose file info
                        const size = fileBytes.length;
                        const lastBytes = Array.from(fileBytes.slice(Math.max(0, size - 8)))
                            .map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                        
                        addLog(`✓ IWEB.EXE loaded successfully (${size} bytes)`);
                        addLog(`[DIAG] Last 8 bytes of IWEB.EXE: ${lastBytes} (at offset ${numberToHex(size-8)})`);
                        
                        setMessage({ type: 'success', text: `IWEB.EXE loaded (${data.length} bytes)` });
                    } else {
                        addLog(`✗ IWEB.EXE file not found at path`);
                        setMessage({ type: 'error', text: 'IWEB.EXE file not found!' });
                        setIwebFileData(undefined);
                    }
                }
            } catch (e) {
                addLog(`✗ Error loading IWEB.EXE: ${e}`);
                setMessage({ type: 'error', text: `Failed to load IWEB.EXE: ${e}` });
                setIwebFileData(undefined);
            }
        };
        loadFileData();
    }, [iwebPath, refreshTrigger]);

    useEffect(() => {
        const loadFileData = async () => {
            try {
                if (managerPath) {
                    addLog(`Loading MANAGER.EXE from: ${managerPath}`);
                    if (await exists(managerPath)) {
                        const data = await readBinaryFile(managerPath);
                        const fileBytes = new Uint8Array(data);
                        setManagerFileData(fileBytes);
                        
                        const size = fileBytes.length;
                        const lastBytes = Array.from(fileBytes.slice(Math.max(0, size - 8)))
                            .map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
                        
                        addLog(`✓ MANAGER.EXE loaded successfully (${size} bytes)`);
                        addLog(`[DIAG] Last 8 bytes of MANAGER.EXE: ${lastBytes} (at offset ${numberToHex(size-8)})`);
                        
                        setMessage({ type: 'success', text: `MANAGER.EXE loaded (${data.length} bytes)` });
                    } else {
                        addLog(`✗ MANAGER.EXE file not found at path`);
                        setMessage({ type: 'error', text: 'MANAGER.EXE file not found!' });
                        setManagerFileData(undefined);
                    }
                }
            } catch (e) {
                addLog(`✗ Error loading MANAGER.EXE: ${e}`);
                setMessage({ type: 'error', text: `Failed to load MANAGER.EXE: ${e}` });
                setManagerFileData(undefined);
            }
        };
        loadFileData();
    }, [managerPath, refreshTrigger]);

    // Load saved config
    useEffect(() => {
        if (!dataDir) return;

        const loadSavedConfig = async () => {
            try {
                const filePath = await join(dataDir, CONFIG_FILE);
                if (await exists(filePath)) {
                    const content = await readTextFile(filePath);
                    const savedData: any = JSON.parse(content);
                    addLog(`Loading config from: ${filePath}`);
                    
                    if (savedData.iwebPath) setIwebPath(savedData.iwebPath);
                    if (savedData.managerPath) setManagerPath(savedData.managerPath);
                    
                    // Load base commands from settings
                    if (savedData.baseCommand && Array.isArray(savedData.baseCommand)) {
                        setBaseCommands(savedData.baseCommand);
                        addLog(`✓ Loaded ${savedData.baseCommand.length} base commands from settings`);
                    }
                    
                    if (savedData.commands && Array.isArray(savedData.commands)) {
                        // Reconstruct full command objects from sparse saved data
                        const reconstructed = savedData.commands.map((saved: any) => {
                            // Create a full entry with default calculations
                            const entry = createEmptyCommandEntry(saved.baseCmd);
                            const byteCount = entry.iweb.byteCount;

                            // Apply saved user inputs
                            entry.newCmd = saved.newCmd || '';
                            
                            // Load offsets (handle either new sparse format or old full format if it exists)
                            const off1 = saved.offset1 !== undefined ? saved.offset1 : (saved.iweb?.offsetStart || 0);
                            const off2 = saved.offset2 !== undefined ? saved.offset2 : (saved.iweb?.offsetStart2 || 0);
                            const offM = saved.offsetM !== undefined ? saved.offsetM : (saved.manager?.offsetStart || 0);

                            entry.iweb.offsetStart = off1;
                            entry.iweb.offsetEnd = off1 > 0 ? off1 + byteCount : 0;
                            
                            entry.iweb.offsetStart2 = off2;
                            entry.iweb.offsetEnd2 = off2 > 0 ? off2 + byteCount : 0;
                            
                            entry.manager.offsetStart = offM;
                            entry.manager.offsetEnd = offM > 0 ? offM + byteCount : 0;

                            entry.isBlocked = saved.isBlocked || false;

                            return entry;
                        });
                        setCommands(reconstructed);
                        addLog(`✓ Loaded and recalculated ${reconstructed.length} commands`);
                    }
                } else {
                    // Create default config if doesn't exist
                    addLog(`Settings file not found at ${filePath}, creating default...`);
                    const defaultConfig: any = {
                        iwebPath: '',
                        managerPath: '',
                        commands: [],
                        baseCommand: []
                    };
                    await writeTextFile(filePath, JSON.stringify(defaultConfig, null, 2));
                }
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSavedConfig();
    }, [dataDir, refreshTrigger]);

    // Auto-save config
    useEffect(() => {
        if (!dataDir) return;

        const saveTimeout = setTimeout(async () => {
            try {
                const filePath = await join(dataDir, CONFIG_FILE);
                
                // Save only essential user-input fields
                const sparseCommands = commands.map(cmd => ({
                    baseCmd: cmd.baseCmd,
                    newCmd: cmd.newCmd,
                    offset1: cmd.iweb.offsetStart,
                    offset2: cmd.iweb.offsetStart2,
                    offsetM: cmd.manager.offsetStart,
                    isBlocked: cmd.isBlocked || false
                }));

                const configData: any = {
                    iwebPath,
                    managerPath,
                    commands: sparseCommands,
                    baseCommand: baseCommands
                };
                await writeTextFile(filePath, JSON.stringify(configData, null, 2));
            } catch (e) {
                console.error('Failed to save settings:', e);
            }
        }, 1000);
        return () => clearTimeout(saveTimeout);
    }, [iwebPath, managerPath, commands, baseCommands, dataDir]);

    const openSettingsFile = async () => {
        try {
            const filePath = await join(dataDir, CONFIG_FILE);
            await invoke('open_file', { path: filePath });
        } catch (error) {
            setMessage({ type: 'error', text: `Failed to open settings: ${error}` });
        }
    };

    const refreshSettings = () => {
        setRefreshTrigger(prev => prev + 1);
        addLog('Refreshing configuration from settings.json...');
        setMessage({ type: 'success', text: 'Settings reloaded!' });
    };

    const resetToDefaults = () => {
        setCommands([]);
        setMessage({ type: 'success', text: 'Reset to default settings' });
    };

    // Validate commands
    const allCommandsValid = commands.length > 0 && commands.every(cmd =>
        cmd.baseCmd &&
        cmd.baseCmd !== '' &&
        cmd.iweb.offsetStart > 0 &&
        cmd.iweb.offsetEnd > cmd.iweb.offsetStart &&
        cmd.iweb.offsetStart2 > 0 && // Rule: Row 2 must have an offset
        cmd.manager.offsetStart > 0 &&
        cmd.manager.offsetEnd > cmd.manager.offsetStart &&
        cmd.newCmd &&
        cmd.newCmd.length === cmd.baseCmd.length
    );

    const applyPatch = async () => {
        if (!iwebPath || !managerPath) {
            setMessage({ type: 'error', text: 'Select both executable files!' });
            return;
        }

        if (!allCommandsValid) {
            setMessage({ type: 'error', text: 'Some commands have invalid configuration!' });
            return;
        }

        try {
            setMessage({ type: 'success', text: 'Processing patch...' });
            
            // Convert CommandEntry to format expected by Rust backend
            const patchCommands = commands
                .filter(cmd => !cmd.isBlocked) // Skip blocked commands
                .map(cmd => {
                    const iweb_offsets = [cmd.iweb.offsetStart, cmd.iweb.offsetEnd];
                    // Add second offset if it exists
                    if (cmd.iweb.offsetStart2 && cmd.iweb.offsetStart2 > 0) {
                        iweb_offsets.push(cmd.iweb.offsetStart2, cmd.iweb.offsetEnd2);
                    }
                    
                    return {
                        old: cmd.baseCmd,
                        new: cmd.newCmd,
                        iweb_offsets,
                        manager_offsets: [cmd.manager.offsetStart, cmd.manager.offsetEnd]
                    };
                });

            const performPatch = async () => {
                return await invoke('apply_patch', {
                    iwebPath,
                    managerPath,
                    config: { commands: patchCommands }
                }) as PatchResult;
            };

            let result = await performPatch();

            // Check for file locking error (os error 32 on Windows)
            if (!result.success && result.message.includes('used by another process')) {
                const confirmed = await ask(
                    `File is being used by another process. Do you want to try closing it and continue?\n\n(Dòng này sẽ thực hiện taskkill cho iweb.exe/manager.exe)`,
                    { title: 'File Access Error', type: 'warning' }
                );

                if (confirmed) {
                    const iwebExt = await basename(iwebPath);
                    const managerExt = await basename(managerPath);

                    addLog(`Attempting to kill: ${iwebExt}, ${managerExt}`);
                    await invoke('kill_process', { name: iwebExt });
                    await invoke('kill_process', { name: managerExt });

                    // Wait a bit for the OS to release the file handles
                    await new Promise(r => setTimeout(r, 1000));

                    addLog('Retrying patch...');
                    result = await performPatch();
                }
            }

            if (result.success) {
                // Wait 500ms for OS to settle before reloading
                setTimeout(() => {
                    setRefreshTrigger(prev => prev + 1);
                }, 500);
            }

            setMessage({ type: result.success ? 'success' : 'error', text: result.message });
        } catch (error) {
            setMessage({ type: 'error', text: `Error: ${error}` });
        }
    };

    return (
        <div className="window-content">
            <div className="menu-bar">
                <button className="menu-item" onClick={openSettingsFile}>
                    Open Settings File (JSON)
                </button>
                <button className="menu-item" onClick={refreshSettings} style={{ background: '#e8f5e9', color: '#2e7d32' }}>
                    Refresh Settings
                </button>
                <button className="menu-item" onClick={resetToDefaults} style={{ color: '#666' }}>
                    Reset
                </button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '11px', color: '#808080', alignSelf: 'center', marginRight: '5px' }}>
                    Auto-save: ON
                </span>
            </div>

            <FileSelector
                iwebPath={iwebPath}
                managerPath={managerPath}
                onIwebPathChange={setIwebPath}
                onManagerPathChange={setManagerPath}
            />

            <div className="main-layout" style={{ display: 'block' }}>
                <CommandTable
                    commands={commands}
                    onCommandsChange={setCommands}
                    iwebFileData={iwebFileData}
                    managerFileData={managerFileData}
                    baseCommands={baseCommands}
                    onLog={addLog}
                />
            </div>

            <div className="action-bar">
                <div style={{ flex: 1, display: 'flex' }}>
                    {message && (
                        <div className={`message ${message.type}`} style={{ width: '100%' }}>
                            <span>{message.text}</span>
                            <button
                                onClick={() => setMessage(null)}
                                style={{ 
                                    minWidth: '20px', 
                                    height: '18px', 
                                    padding: '0 4px',
                                    fontSize: '10px',
                                    marginLeft: '10px'
                                }}
                            >
                                OK
                            </button>
                        </div>
                    )}
                </div>
                
                <button
                    onClick={applyPatch}
                    disabled={!iwebPath || !managerPath || !allCommandsValid}
                    className="patch-btn"
                >
                    Apply Patch
                </button>
            </div>

            {/* Debug Logs Panel */}
            <div style={{
                marginTop: '20px',
                padding: '10px',
                background: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '4px'
            }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '10px'
                }}>
                    <div style={{ fontWeight: 'bold', color: '#ffff00', fontFamily: 'monospace', fontSize: '11px' }}>
                        DEBUG LOG ({debugLogs.length} events)
                    </div>
                    <button
                        onClick={() => setDebugLogs([])}
                        style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: '#333',
                            color: '#0f0',
                            border: '1px solid #666',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontFamily: 'monospace'
                        }}
                    >
                        Clear Logs
                    </button>
                </div>

                <div style={{
                    color: '#00ff00',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '5px',
                    background: '#000'
                }}>
                    {debugLogs.length === 0 ? (
                        <div style={{ color: '#888' }}>Waiting for events...</div>
                    ) : (
                        debugLogs.map((log, idx) => (
                            <div key={idx} style={{ marginBottom: '2px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
