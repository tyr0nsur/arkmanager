import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Copy, Trash2, Terminal as TerminalIcon, Send, Play, Pause, RefreshCw } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useDashboard } from '../context/DashboardContext.jsx';
import { useServerCapabilities } from '../hooks/useServerCapabilities.js';
import { consoleText, consoleEntriesForMap } from '../utils/consoleText.js';
import { QUICK_ACTIONS } from '../constants/dashboard.js';

const QUICK_ACTION_GROUPS = [
    { id: 'read', label: 'Lectura', description: 'Consultas sin cambios de estado' },
    { id: 'maintenance', label: 'Mantenimiento', description: 'Acciones operativas rutinarias' },
    { id: 'danger', label: 'Destructivas/Admin', description: 'Requieren confirmación y contexto in-game' },
];
const SERVER_LOG_REFRESH_MS = 5000;

function isCanceledRequest(err) {
    return err?.name === 'CanceledError' || axios.isCancel?.(err);
}

function getNewLogLines(oldStr, newStr) {
    if (!oldStr) return newStr;
    if (newStr === oldStr) return "";

    const oldLength = oldStr.length;
    const snippetLength = Math.min(250, oldLength);
    const snippet = oldStr.slice(-snippetLength);

    const idx = newStr.lastIndexOf(snippet);
    if (idx !== -1) {
        let diff = newStr.slice(idx + snippetLength);
        if (diff.startsWith('\n')) diff = diff.slice(1);
        return diff;
    }
    return newStr;
}

export function RconConsole() {
    const { rconLog, setRconLog, rconCommand, setRconCommand, showAutocomplete, setShowAutocomplete, rconSending, setHistoryIndex, handleRconSubmit, handleRconKeyDown, handleQuickAction, autocompleteSuggestions, selectedMap, clusterMaps, liveDataStale, liveDataError, liveDataUpdatedAt, copyToClipboard } = useDashboard();
    const [logsLoading, setLogsLoading] = useState(false);
    const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
    const [activeQuickActionGroupId, setActiveQuickActionGroupId] = useState('maintenance');
    const hasSelectedMap = Boolean(selectedMap);
    const capabilities = useServerCapabilities(selectedMap);
    const rconAvailable = capabilities.data?.actions?.console === true;
    const rconBlocked = !hasSelectedMap || liveDataStale || !rconAvailable;
    const rconBlockReason = !hasSelectedMap
        ? 'Selecciona un mapa antes de enviar RCON o leer logs'
        : (liveDataStale ? `Telemetría del mapa sin actualizar${liveDataError ? ': ' + liveDataError : ''}. RCON queda bloqueado.` : (!rconAvailable ? (capabilities.error || 'RCON sin configurar o capacidades pendientes de consulta.') : ''));
    const selectedMapMeta = clusterMaps.find(map => map.id === selectedMap);
    const selectedMapName = selectedMapMeta?.name || selectedMap || '';
    const lastLiveDataLabel = liveDataUpdatedAt ? new Date(liveDataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sin lectura';

    const rconTerminalRef = useRef(null);
    const xtermRcon = useRef(null);
    const fitAddonRcon = useRef(null);
    const fitFrameRef = useRef({ rcon: null });
    const previousLogsRef = useRef('');
    const logsRequestRef = useRef(null);
    const lastPrintedEntry = useRef(null);
    const printedMap = useRef('');
    const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState(0);

    const visibleAutocompleteSuggestions = useMemo(() => autocompleteSuggestions.slice(0, 15), [autocompleteSuggestions]);
    const quickActionGroups = useMemo(() => QUICK_ACTION_GROUPS.map(group => ({ ...group, actions: QUICK_ACTIONS.filter(action => (action.group || 'maintenance') === group.id) })).filter(group => group.actions.length > 0), []);
    const autocompleteOpen = showAutocomplete && visibleAutocompleteSuggestions.length > 0;
    const safeActiveAutocompleteIndex = Math.min(activeAutocompleteIndex, Math.max(visibleAutocompleteSuggestions.length - 1, 0));
    const activeAutocompleteId = `rcon-suggestion-${safeActiveAutocompleteIndex}`;

    const mapLogs = useMemo(() => consoleEntriesForMap(rconLog, selectedMap), [rconLog, selectedMap]);
    const rconTranscript = useMemo(() => mapLogs.map(log => `[${log.time}] ${log.type.toUpperCase()}: ${consoleText(log.text)}`).join('\n'), [mapLogs]);
    const copyUnifiedTranscript = () => copyToClipboard([rconTranscript, consoleText(previousLogsRef.current)].filter(Boolean).join('\n\n---\n\n') || 'Consola sin salida.');

    const cancelPendingTerminalFit = useCallback(() => {
        if (!fitFrameRef.current.rcon) return;
        cancelAnimationFrame(fitFrameRef.current.rcon);
        fitFrameRef.current.rcon = null;
    }, []);

    const fitTerminal = useCallback(() => {
        const addon = fitAddonRcon.current;
        const container = rconTerminalRef.current;
        if (!addon || !container || container.offsetParent === null) return;
        cancelPendingTerminalFit();
        fitFrameRef.current.rcon = requestAnimationFrame(() => {
            fitFrameRef.current.rcon = null;
            if (!container.isConnected || container.offsetParent === null) return;
            try { addon.fit(); } catch {}
        });
    }, [cancelPendingTerminalFit]);

    useEffect(() => { setActiveAutocompleteIndex(0); }, [rconCommand, visibleAutocompleteSuggestions.length]);

    const applyAutocompleteSuggestion = useCallback((suggestion) => {
        if (!suggestion) return;
        setRconCommand(suggestion.value);
        setShowAutocomplete(false);
        setHistoryIndex(-1);
    }, [setHistoryIndex, setRconCommand, setShowAutocomplete]);

    const handleRconInputKeyDown = event => {
        if (autocompleteOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
            event.preventDefault();
            if (event.key === 'ArrowDown') { setActiveAutocompleteIndex(index => Math.min(index + 1, visibleAutocompleteSuggestions.length - 1)); return; }
            if (event.key === 'ArrowUp') { setActiveAutocompleteIndex(index => Math.max(index - 1, 0)); return; }
            if (event.key === 'Escape') { setShowAutocomplete(false); return; }
            applyAutocompleteSuggestion(visibleAutocompleteSuggestions[safeActiveAutocompleteIndex]);
            return;
        }
        handleRconKeyDown(event);
    };

    // --- Initialize Terminals ---
    useEffect(() => {
        if (!xtermRcon.current && rconTerminalRef.current) {
            xtermRcon.current = new Terminal({
                theme: { background: '#09090b', foreground: '#d4d4d8', cursor: '#6366f1', black: '#000000', red: '#f87171', green: '#34d399', yellow: '#fbbf24', blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#ffffff' },
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: 13, cursorBlink: false, disableStdin: true, convertEol: true
            });
            fitAddonRcon.current = new FitAddon();
            xtermRcon.current.loadAddon(fitAddonRcon.current);
            xtermRcon.current.open(rconTerminalRef.current);
            fitTerminal();
            xtermRcon.current.writeln('\x1b[1;34m[RCON]\x1b[0m Visor preparado. La disponibilidad de RCON se consulta por instancia.');
            xtermRcon.current.writeln('\x1b[38;5;240mUsa ↑↓ para historial • Tab para autocompletar\x1b[0m\n');
        }

        const handleResize = () => fitTerminal();
        window.addEventListener('resize', handleResize);

        const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => fitTerminal());
        if (rconTerminalRef.current) resizeObserver?.observe(rconTerminalRef.current);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver?.disconnect();
            cancelPendingTerminalFit();
            xtermRcon.current?.dispose();
            xtermRcon.current = null;
            fitAddonRcon.current = null;
        };
    }, [cancelPendingTerminalFit, fitTerminal]);

    useEffect(() => {
        const timer = setTimeout(() => fitTerminal(), 50);
        return () => clearTimeout(timer);
    }, [fitTerminal]);

    // --- Update RCON Terminal Output ---
    useEffect(() => {
        if (!xtermRcon.current) return;
        if (printedMap.current !== selectedMap) {
            xtermRcon.current.reset();
            lastPrintedEntry.current = null;
            printedMap.current = selectedMap;
        }
        if (mapLogs.length === 0) {
            xtermRcon.current.clear();
            xtermRcon.current.writeln('\x1b[1;34m[RCON]\x1b[0m Visor preparado. La disponibilidad de RCON se consulta por instancia.');
            xtermRcon.current.writeln('\x1b[38;5;240mUsa ↑↓ para historial • Tab para autocompletar\x1b[0m\n');
            lastPrintedEntry.current = null;
            return;
        }

        const cursor = lastPrintedEntry.current ? mapLogs.indexOf(lastPrintedEntry.current) : -1;
        const newLogs = mapLogs.slice(cursor + 1);
        newLogs.forEach(log => {
            const timeStr = `\x1b[38;5;240m${log.time}\x1b[0m`;
            let logLine;
            if (log.type === 'cmd') logLine = `${timeStr} \x1b[1;34m❯\x1b[0m \x1b[1;37m${consoleText(log.text)}\x1b[0m`;
            else if (log.type === 'error') logLine = `${timeStr} \x1b[1;31m✕\x1b[0m \x1b[31m${consoleText(log.text)}\x1b[0m`;
            else if (log.type === 'response') logLine = `${timeStr} \x1b[1;36m←\x1b[0m \x1b[38;5;250m${consoleText(log.text)}\x1b[0m`;
            else logLine = `${timeStr} ${consoleText(log.text)}`;
            xtermRcon.current.writeln(logLine);
        });
        if (newLogs.length > 0) xtermRcon.current.scrollToBottom();
        lastPrintedEntry.current = mapLogs.at(-1);
    }, [mapLogs, selectedMap]);

    // --- Server Logs Logic ---
    const processAnsiLogs = useCallback((rawLogs) => {
        const lines = consoleText(rawLogs).split('\n');
        return lines.map(line => {
            if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') || line.toLowerCase().includes('exception')) {
                return `\x1b[31m${line}\x1b[0m`;
            } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
                return `\x1b[33m${line}\x1b[0m`;
            } else if (line.includes('[SERVER]')) {
                return `\x1b[36m${line}\x1b[0m`;
            }
            return line;
        }).join('\n');
    }, []);

    const fetchServerLogs = useCallback(async () => {
        logsRequestRef.current?.abort();
        if (!selectedMap || !xtermRcon.current) { setLogsLoading(false); return; }

        const controller = new AbortController();
        logsRequestRef.current = controller;
        setLogsLoading(true);

        try {
            const res = await axios.get(`/api/server/logs?mapId=${encodeURIComponent(selectedMap)}`, { signal: controller.signal });
            if (logsRequestRef.current !== controller) return;
            const logsData = res.data.logs || 'No hay logs disponibles.';
            if (logsData !== previousLogsRef.current) {
                const newLines = getNewLogLines(previousLogsRef.current, logsData);
                if (newLines) {
                    xtermRcon.current.write(processAnsiLogs(newLines) + (newLines.endsWith('\n') ? '' : '\n'));
                    xtermRcon.current.scrollToBottom();
                }
                previousLogsRef.current = logsData;
            }
        } catch (err) {
            if (isCanceledRequest(err)) return;
            const message = err.response?.data?.error || 'Error al cargar logs.';
            const renderedMessage = `ERROR LOGS: ${message}`;
            if (renderedMessage !== previousLogsRef.current) {
                xtermRcon.current.writeln(`\x1b[31m${consoleText(renderedMessage)}\x1b[0m`);
                previousLogsRef.current = renderedMessage;
            }
        } finally {
            if (logsRequestRef.current === controller) { logsRequestRef.current = null; setLogsLoading(false); }
        }
    }, [processAnsiLogs, selectedMap]);

    useEffect(() => {
        const request = logsRequestRef.current;
        request?.abort();
        if (logsRequestRef.current === request) logsRequestRef.current = null;
        setLogsLoading(false);
        previousLogsRef.current = '';
        if (xtermRcon.current && selectedMap) {
            xtermRcon.current.writeln('\x1b[1;36m[SISTEMA]\x1b[0m Visor listo para recibir logs del servidor...');
        }
    }, [selectedMap]);

    useEffect(() => {
        let interval;
        if (autoRefreshLogs) {
            fetchServerLogs();
            interval = setInterval(fetchServerLogs, SERVER_LOG_REFRESH_MS);
        }
        return () => {
            if (interval) clearInterval(interval);
            const request = logsRequestRef.current;
            request?.abort();
            if (logsRequestRef.current === request) logsRequestRef.current = null;
        };
    }, [autoRefreshLogs, fetchServerLogs]);

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#09090b] text-white">
            <div className="flex min-h-0 w-full flex-1 flex-col">
                <div className="bg-[#18181b] border-b border-zinc-800 p-4 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <TerminalIcon className="text-indigo-500" size={24} />
                        <div>
                            <h2 className="text-lg font-bold leading-none">Consola Unificada</h2>
                            <p className="text-xs text-zinc-500 mt-1">Mapa objetivo: <span className="text-zinc-300">{selectedMapName || 'Sin mapa seleccionado'}</span></p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 relative gap-2 p-2">
                    <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden shadow-xl">
                        <div className={`border-b px-4 py-2 text-xs shrink-0 flex items-center justify-between ${!rconBlocked ? 'border-cyan-500/10 bg-cyan-500/[0.06] text-cyan-100' : 'border-amber-500/20 bg-amber-500/10 text-amber-200'}`}>
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                                <span className="font-semibold">{rconBlocked ? rconBlockReason : `RCON configurado · ${selectedMapName} · conexión sin comprobar`}</span>
                                {hasSelectedMap && <span className={`font-mono text-[11px] ${liveDataStale ? 'text-amber-200/80' : 'text-cyan-300/80'}`}>{selectedMap}{liveDataStale ? ` · ${lastLiveDataLabel}` : ''}</span>}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <button type="button" onClick={() => setAutoRefreshLogs(!autoRefreshLogs)} className={`flex min-h-11 items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold transition-colors sm:min-h-8 ${autoRefreshLogs ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'}`}>
                                    {autoRefreshLogs ? <Pause size={10} /> : <Play size={10} />}
                                    Logs {autoRefreshLogs ? 'ON' : 'OFF'}
                                </button>
                                <button type="button" aria-label="Actualizar logs del servidor" onClick={fetchServerLogs} disabled={logsLoading || !hasSelectedMap} className="flex min-h-11 items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50 sm:min-h-8">
                                    <RefreshCw size={10} className={logsLoading ? 'animate-spin' : ''} />
                                </button>
                            </div>
                        </div>

                        <div className="bg-[#0f0f13] border-b border-zinc-800/50 px-3 py-2 shrink-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="flex rounded-md border border-zinc-800 bg-[#18181b] p-0.5" role="tablist">
                                    {quickActionGroups.map(group => (
                                        <button key={group.id} type="button" role="tab" aria-selected={activeQuickActionGroupId === group.id} onClick={() => setActiveQuickActionGroupId(group.id)} className={`rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeQuickActionGroupId === group.id ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-200'}`}>
                                            {group.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex-1" />
                                <button type="button" aria-label="Copiar salida de la instancia" onClick={copyUnifiedTranscript} className="rounded p-1.5 text-zinc-500 hover:bg-indigo-500/10 hover:text-indigo-300 transition-colors">
                                    <Copy size={13} />
                                </button>
                                <button type="button" aria-label="Limpiar salida de la instancia" onClick={() => { setRconLog(entries => entries.filter(entry => entry.mapId !== selectedMap)); previousLogsRef.current = ''; }} className="rounded p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {quickActionGroups.map(group => (
                                    <div key={group.id} className={activeQuickActionGroupId === group.id ? 'contents' : 'hidden'} role="tabpanel">
                                        {group.actions.map(qa => {
                                            const QaIcon = qa.Icon;
                                            const iconColor = qa.color === 'green' ? 'text-emerald-400' : qa.color === 'red' ? 'text-red-400' : qa.color === 'blue' ? 'text-blue-400' : qa.color === 'cyan' ? 'text-cyan-400' : 'text-amber-400';
                                            return (
                                                <button key={qa.cmd} type="button" onClick={() => handleQuickAction(qa.cmd)} disabled={rconBlocked || rconSending} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${qa.confirm ? 'border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/15' : 'border-zinc-700/60 bg-[#18181b] text-zinc-300 hover:border-zinc-500 hover:text-white'}`}>
                                                    <QaIcon size={11} className={iconColor} /> {qa.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 bg-[#09090b] p-4 relative min-h-0">
                            <div ref={rconTerminalRef} className="w-full h-full" />
                        </div>

                        <form onSubmit={event => { if (rconBlocked) event.preventDefault(); else handleRconSubmit(event); }} className="bg-[#18181b] border-t border-zinc-800 p-2 shrink-0 relative">
                            {autocompleteOpen && (
                                <div id="rcon-suggestions" role="listbox" aria-label="Sugerencias de comandos RCON" className="absolute bottom-full left-0 w-full mb-1 bg-[#27272a] border border-zinc-700 shadow-xl z-50 max-h-56 overflow-y-auto custom-scrollbar">
                                    {visibleAutocompleteSuggestions.map((item, i) => (
                                        <button id={`rcon-suggestion-${i}`} role="option" aria-selected={i === safeActiveAutocompleteIndex} type="button" key={item.value} className={`w-full px-4 py-1.5 cursor-pointer font-mono border-b border-zinc-700/50 flex items-center justify-between text-left text-[11px] ${i === safeActiveAutocompleteIndex ? 'bg-indigo-500 text-white' : 'text-zinc-300 hover:bg-indigo-500 hover:text-white'}`} onMouseEnter={() => setActiveAutocompleteIndex(i)} onMouseDown={(e) => { e.preventDefault(); applyAutocompleteSuggestion(item); }}>
                                            <span className="font-bold">{item.label}</span> {item.hint && <span className="opacity-60 italic">{item.hint}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center bg-[#09090b] border border-zinc-800 rounded px-3 py-1">
                                <span className="text-indigo-500 font-bold mr-2">❯</span>
                                <input role="combobox" aria-autocomplete="list" aria-expanded={autocompleteOpen} aria-controls="rcon-suggestions" aria-activedescendant={autocompleteOpen ? activeAutocompleteId : undefined} aria-label="Comando RCON" type="text" value={rconCommand} onChange={e => { setRconCommand(e.target.value); setShowAutocomplete(true); setHistoryIndex(-1); }} onFocus={() => setShowAutocomplete(true)} onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)} onKeyDown={handleRconInputKeyDown} placeholder="Comando RCON..." disabled={rconBlocked || rconSending} className="flex-1 bg-transparent text-white outline-none font-mono text-[13px] placeholder-zinc-600" />
                                <button aria-label="Enviar comando RCON" type="submit" disabled={rconBlocked || rconSending || !rconCommand.trim()} className="flex min-h-11 min-w-11 items-center justify-center rounded text-zinc-500 hover:text-indigo-400 disabled:opacity-50 sm:min-h-9 sm:min-w-9">
                                    {rconSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
