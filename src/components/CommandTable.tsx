import { Command } from '../types';

interface CommandTableProps {
    commands: Command[];
    onCommandsChange: (commands: Command[]) => void;
}

const hexToAscii = (hex: string): string => {
    try {
        const clean = hex.replace(/[^0-9A-Fa-f]/g, '');
        if (clean.length % 2 !== 0) return '...';
        let str = '';
        for (let i = 0; i < clean.length; i += 2) {
            str += String.fromCharCode(parseInt(clean.substr(i, 2), 16));
        }
        return str;
    } catch {
        return 'Error';
    }
};

export default function CommandTable({ commands, onCommandsChange }: CommandTableProps) {
    const updateCommand = (index: number, field: keyof Command, value: string) => {
        const newCommands = [...commands];
        const trimmedValue = value.trim();
        (newCommands[index] as any)[field] = trimmedValue;

        if (field === 'hex_pattern') {
            const decoded = hexToAscii(trimmedValue);
            if (decoded !== '...' && decoded !== 'Error') {
                newCommands[index].old = decoded;
            }
        }

        onCommandsChange(newCommands);
    };

    const addCommand = () => {
        onCommandsChange([
            ...commands,
            {
                old: 'N/A',
                new: '',
                hex_pattern: ''
            }
        ]);
    };

    const removeCommand = (index: number) => {
        onCommandsChange(commands.filter((_, i) => i !== index));
    };

    const validateLength = (cmd: Command): boolean => {
        if (!cmd.hex_pattern || cmd.old === 'N/A' || cmd.old === '...') return true;
        // Must be same length AND must be different from the original
        return cmd.new.length === cmd.old.length && cmd.new !== cmd.old;
    };

    return (
        <div className="group-box" style={{ width: '100%' }}>
            <span className="group-box-label">Command & Pattern Editor</span>
            <table className="command-table">
                <thead>
                    <tr>
                        <th style={{ width: '40%' }}>Hex Pattern (Old Cmd)</th>
                        <th style={{ width: '20%' }}>Decoded</th>
                        <th style={{ width: '30%' }}>New Command</th>
                        <th style={{ width: '10%' }}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {commands.map((cmd, index) => {
                        const isValid = validateLength(cmd);
                        const requiredLength = cmd.old && cmd.old !== 'N/A' ? cmd.old.length : undefined;
                        return (
                            <tr key={index}>
                                <td>
                                    <input
                                        type="text"
                                        value={cmd.hex_pattern}
                                        onChange={(e) => updateCommand(index, 'hex_pattern', e.target.value)}
                                        placeholder="47 65 74 4C 6F 6F 74 54 69 6D 65 73"
                                        style={{ width: '100%', fontSize: '11px', fontFamily: 'monospace' }}
                                    />
                                </td>
                                <td style={{ fontSize: '11px', color: '#000080', background: '#f0f0f0', fontWeight: 'bold' }}>
                                    {cmd.old}
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        value={cmd.new}
                                        maxLength={requiredLength}
                                        onChange={(e) => updateCommand(index, 'new', e.target.value)}
                                        style={{
                                            width: '100%',
                                            background: !isValid || (requiredLength && cmd.new.length < requiredLength) ? '#ffcccc' : 'white'
                                        }}
                                        placeholder={requiredLength ? `Enter ${requiredLength} chars` : "Enter new string..."}
                                    />
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button
                                        onClick={() => removeCommand(index)}
                                        style={{ minWidth: '40px', height: '18px', padding: '0 4px', fontSize: '11px' }}
                                    >
                                        Del
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div style={{ marginTop: '10px' }}>
                <button onClick={addCommand}>Add New Pattern</button>
            </div>
        </div>
    );
}
