import { useMemo } from 'react';
import { parseConfigLine, replaceConfigLineValue } from '../../utils/configLine.js';

export function VisualConfigEditor({ content, onChange, onSave }) {
    // Parser for INI/CFG
    const parsedData = useMemo(() => {
        const lines = content.split('\n');
        const data = { 'General': [] };
        let currentSection = 'General';

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            // Section header e.g. [ServerSettings]
            if (trimmed.startsWith('[') && trimmed.includes(']')) {
                const sectionName = trimmed.substring(1, trimmed.indexOf(']')).trim();
                currentSection = sectionName;
                if (!data[currentSection]) data[currentSection] = [];
                return;
            }

            const parsedLine = parseConfigLine(line);
            if (parsedLine) {
                data[currentSection].push({
                    ...parsedLine,
                    lineIndex: index,
                });
            }
        });

        return data;
    }, [content]);
    const editableSections = useMemo(
        () => Object.keys(parsedData).filter(section => parsedData[section].length > 0),
        [parsedData]
    );

    const handleFieldChange = (item, newValue) => {
        const lines = content.split('\n');
        lines[item.lineIndex] = replaceConfigLineValue(lines[item.lineIndex], newValue, item);
        onChange(lines.join('\n'));
    };

    const handleKeyDown = event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            onSave?.();
        }
    };

    return (
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#09090b] p-4 custom-scrollbar sm:p-5">
            {editableSections.length === 0 && (
                <div className="flex min-h-[180px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-[#18181b] px-4 py-8 text-center">
                    <p className="text-sm font-semibold text-zinc-300">Sin campos editables detectados</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-zinc-500">Cambia a modo código para editar comentarios, líneas sin asignación o formatos no soportados por el formulario.</p>
                </div>
            )}
            {editableSections.map(section => (
                <div key={section} className="space-y-3">
                    <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider border-b border-zinc-800 pb-2">
                        {section}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {parsedData[section].map((item, idx) => (
                            <div key={idx} className="flex min-w-0 flex-col space-y-1.5 rounded-lg border border-zinc-800 bg-[#18181b] p-3">
                                <label className="text-xs font-mono text-zinc-400 truncate" title={item.key}>
                                    {item.key}
                                </label>
                                <input
                                    type="text"
                                    value={item.value}
                                    onChange={(e) => handleFieldChange(item, e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="min-h-10 w-full rounded border border-zinc-700 bg-[#09090b] px-2 py-1.5 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
