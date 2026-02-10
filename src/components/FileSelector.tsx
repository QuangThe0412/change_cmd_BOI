import { open } from '@tauri-apps/api/dialog';

interface FileSelectorProps {
    iwebPath: string;
    managerPath: string;
    onIwebPathChange: (path: string) => void;
    onManagerPathChange: (path: string) => void;
}

export default function FileSelector({
    iwebPath,
    managerPath,
    onIwebPathChange,
    onManagerPathChange
}: FileSelectorProps) {
    const selectFile = async (type: 'iweb' | 'manager') => {
        try {
            const selected = await open({
                filters: [{
                    name: 'Executable',
                    extensions: ['exe']
                }],
                multiple: false
            });

            if (selected && typeof selected === 'string') {
                if (type === 'iweb') {
                    onIwebPathChange(selected);
                } else {
                    onManagerPathChange(selected);
                }
            }
        } catch (error) {
            console.error('Error selecting file:', error);
        }
    };

    return (
        <div className="group-box">
            <span className="group-box-label">File Selection</span>
            <div className="v-stack">
                <div className="h-stack">
                    <button onClick={() => selectFile('iweb')} style={{ width: '160px' }}>
                        Browse iweb.exe...
                    </button>
                    <div className="file-path">
                        {iwebPath || 'C:\\path\\to\\iweb.exe'}
                    </div>
                </div>

                <div className="h-stack">
                    <button onClick={() => selectFile('manager')} style={{ width: '160px' }}>
                        Browse manager.exe...
                    </button>
                    <div className="file-path">
                        {managerPath || 'C:\\path\\to\\managerserver.exe'}
                    </div>
                </div>
            </div>
        </div>
    );
}
