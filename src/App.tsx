import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { readTextFile, writeTextFile, exists } from '@tauri-apps/api/fs';
import { join } from '@tauri-apps/api/path';
import FileSelector from './components/FileSelector';
import CommandTable from './components/CommandTable';
import { Command, PatchResult } from './types';
import './App.css';

const CONFIG_FILE = 'settings.json';

function App() {
    const [iwebPath, setIwebPath] = useState('');
    const [managerPath, setManagerPath] = useState('');
    const [commands, setCommands] = useState<Command[]>([
        {
            old: 'GetLootTimes',
            new: 'SetLootTimes',
            hex_pattern: '47 65 74 4C 6F 6F 74 54 69 6D 65 73'
        }
    ]);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [dataDir, setDataDir] = useState<string>('');

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

    useEffect(() => {
        if (!dataDir) return;

        const loadSavedConfig = async () => {
            try {
                const filePath = await join(dataDir, CONFIG_FILE);
                if (await exists(filePath)) {
                    const content = await readTextFile(filePath);
                    const savedData = JSON.parse(content);
                    if (savedData.iwebPath) setIwebPath(savedData.iwebPath);
                    if (savedData.managerPath) setManagerPath(savedData.managerPath);
                    if (savedData.commands) {
                        const migratedCommands = savedData.commands.map((cmd: any) => ({
                            old: (cmd.old || 'N/A').trim(),
                            new: (cmd.new || '').trim(),
                            hex_pattern: (cmd.hex_pattern || cmd.iweb_hex_1 || cmd.old_hex || '').trim()
                        }));
                        setCommands(migratedCommands);
                    }
                } else {
                    const defaultConfig = { iwebPath: '', managerPath: '', commands };
                    await writeTextFile(filePath, JSON.stringify(defaultConfig, null, 2));
                }
            } catch (e) {
                console.error('Failed to load settings:', e);
            }
        };
        loadSavedConfig();
    }, [dataDir]);

    useEffect(() => {
        if (!dataDir) return;

        const saveTimeout = setTimeout(async () => {
            try {
                const filePath = await join(dataDir, CONFIG_FILE);
                const configData = { iwebPath, managerPath, commands };
                await writeTextFile(filePath, JSON.stringify(configData, null, 2));
            } catch (e) {
                console.error('Failed to save settings:', e);
            }
        }, 1000);
        return () => clearTimeout(saveTimeout);
    }, [iwebPath, managerPath, commands, dataDir]);

    const openSettingsFile = async () => {
        try {
            const filePath = await join(dataDir, CONFIG_FILE);
            await invoke('open_file', { path: filePath });
        } catch (error) {
            setMessage({ type: 'error', text: `Failed to open settings: ${error}` });
        }
    };

    const allCommandsValid = commands.length > 0 && commands.every(cmd =>
        cmd.hex_pattern &&
        cmd.old !== 'N/A' &&
        cmd.old !== '...' &&
        cmd.new.length === cmd.old.length &&
        cmd.new !== cmd.old
    );

    const applyPatch = async () => {
        if (!iwebPath || !managerPath) {
            setMessage({ type: 'error', text: 'Select both executable files!' });
            return;
        }

        if (!allCommandsValid) {
            setMessage({ type: 'error', text: 'Some commands have invalid lengths or missing patterns!' });
            return;
        }

        try {
            setMessage({ type: 'success', text: 'Processing patterns...' });
            const result: PatchResult = await invoke('apply_patch', {
                iwebPath,
                managerPath,
                config: { commands }
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
        </div>
    );
}

export default App;
