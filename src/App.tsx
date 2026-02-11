import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { readTextFile, writeTextFile, exists, readBinaryFile } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import FileSelector from './components/FileSelector';
import CommandTable from './components/CommandTable';
import { CommandEntry, PatchResult } from './types';
import { numberToHex } from './utils';
import './App.css';

const CONFIG_FILE = 'settings.json';

function App() {
    const [iwebPath, setIwebPath] = useState('');
    const [managerPath, setManagerPath] = useState('');
    const [commands, setCommands] = useState<CommandEntry[]>([]);
    const [baseCommands, setBaseCommands] = useState<string[]>([]);
    const [iwebFileData, setIwebFileData] = useState<Uint8Array | undefined>();
    const [managerFileData, setManagerFileData] = useState<Uint8Array | undefined>();
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [dataDir, setDataDir] = useState<string>('');
    const [debugLogs, setDebugLogs] = useState<string[]>([]);

    // Helper to add debug logs
    const addLog = (log: string) => {
        const timestamp = new Date().toLocaleTimeString('vi-VN');
        setDebugLogs(prev => [...prev, `[${timestamp}] ${log}`]);
        console.log(`[${timestamp}] ${log}`);
    };

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
    }, [iwebPath]);

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
    }, [managerPath]);

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
                        // Validate and migrate old format to new format if needed
                        const validCommands = savedData.commands.map((cmd: any) => {
                            if (!cmd.iweb || !cmd.manager) {
                                // Old format or incomplete, migrate it
                                return {
                                    baseCmd: cmd.baseCmd || cmd.old || '',
                                    newCmd: cmd.newCmd || cmd.new || '',
                                    iweb: cmd.iweb || { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' },
                                    manager: cmd.manager || { offsetStart: 0, offsetEnd: 0, byteCount: 0, decodedString: '' }
                                };
                            }
                            return cmd;
                        });
                        setCommands(validCommands);
                        addLog(`✓ Loaded ${validCommands.length} commands from settings`);
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
    }, [dataDir]);

    // Auto-save config
    useEffect(() => {
        if (!dataDir) return;

        const saveTimeout = setTimeout(async () => {
            try {
                const filePath = await join(dataDir, CONFIG_FILE);
                const configData: any = {
                    iwebPath,
                    managerPath,
                    commands,
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
        cmd.manager.offsetStart > 0 &&
        cmd.manager.offsetEnd > cmd.manager.offsetStart &&
        cmd.newCmd &&
        cmd.newCmd.length === cmd.baseCmd.length &&
        cmd.newCmd !== cmd.baseCmd
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
            const patchCommands = commands.map(cmd => {
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

            const result: PatchResult = await invoke('apply_patch', {
                iwebPath,
                managerPath,
                config: { commands: patchCommands }
            });
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
                <button
                    onClick={applyPatch}
                    disabled={!iwebPath || !managerPath || !allCommandsValid}
                    className="patch-btn"
                >
                    Apply Patch
                </button>
            </div>

            {message && (
                <div className={`message ${message.type}`}>
                    {message.text}
                    <button
                        onClick={() => setMessage(null)}
                        style={{ float: 'right', minWidth: '20px', height: '16px', padding: 0 }}
                    >
                        OK
                    </button>
                </div>
            )}

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
