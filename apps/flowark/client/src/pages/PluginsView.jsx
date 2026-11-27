import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, FileJson, Plug, RefreshCw, ServerCog, ShieldAlert, TerminalSquare, XCircle } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';

const MARKER_LABELS = {
    'disable-plugins': 'Desactivar plugins',
    'enable-process-event-hook': 'ProcessEvent hook',
    'enable-chat-reflection': 'Reflexión de chat',
    'enable-inventory-reflection': 'Reflexión de inventario',
    'enable-structure-reflection': 'Reflexión de estructuras',
};

const MARKER_RISK_LABELS = {
    'disable-plugins': 'Desactiva la carga de plugins en la instancia. Requiere coordinación operativa.',
    'enable-process-event-hook': 'Experimental: requiere runtime Linux compatible y reinicio controlado.',
    'enable-chat-reflection': 'Experimental: reflexión de chat, requiere runtime Linux y validación en servidor aislado.',
    'enable-inventory-reflection': 'Experimental: reflexión de inventario, requiere runtime Linux y validación en servidor aislado.',
    'enable-structure-reflection': 'Experimental: reflexión de estructuras, requiere runtime Linux y validación en servidor aislado.',
};

const SENSITIVE_MARKERS = new Set(Object.keys(MARKER_RISK_LABELS));

const PLUGIN_VIEW_TABS = [
    { id: 'overview', label: 'Resumen' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'console', label: 'Consola' },
    { id: 'arkapi', label: 'ArkApi' },
];

const EMPTY_OBELISK_RUNTIME = Object.freeze({
    type: 'obelisk',
    label: 'Obelisk Linux Runtime',
    available: false,
    rootConfigured: false,
    libraries: {},
    plugins: [],
    configs: [],
    instances: [],
    markerCatalog: {},
});

const EMPTY_ARKAPI_RUNTIME = Object.freeze({
    type: 'arkapi',
    label: 'ArkApi Windows inventory',
    available: false,
    rootConfigured: false,
    platform: '',
    plugins: [],
    supportedActions: [],
    note: 'Solo inventario: este panel no instala, habilita ni modifica plugins ArkApi.',
});

function isCanceledRequest(err) {
    return err?.name === 'CanceledError' || axios.isCancel?.(err);
}

function StatusPill({ ok, label }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-zinc-700 bg-zinc-900 text-zinc-400'}`}>
            {ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {label}
        </span>
    );
}

function RuntimeHeader({ runtime }) {
    return (
        <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <ServerCog size={18} className="text-cyan-300" />
                    <h3 className="truncate text-base font-semibold text-white">{runtime.label}</h3>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{runtime.rootConfigured ? 'Ruta configurada en el host' : 'Ruta sin configurar'}</p>
            </div>
            <StatusPill ok={runtime.available} label={runtime.available ? 'Detectado' : 'No encontrado'} />
        </div>
    );
}

export function PluginsView() {
    const { userRole, setModal } = useDashboard();
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');
    const [logs, setLogs] = useState('');
    const [logsError, setLogsError] = useState('');
    const [logsLoading, setLogsLoading] = useState(false);
    const [selectedInstance, setSelectedInstance] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [markerLoading, setMarkerLoading] = useState('');
    const [activeView, setActiveView] = useState('overview');
    const markerMutationRef = useRef('');
    const statusRequestRef = useRef(null);
    const logsRequestRef = useRef(null);

    const obelisk = status?.runtimes?.obelisk || EMPTY_OBELISK_RUNTIME;
    const arkApi = status?.runtimes?.arkApi || EMPTY_ARKAPI_RUNTIME;
    const canWrite = userRole === 'owner';
    const arkApiAppliesToHost = arkApi.platform === 'win32';
    const visiblePluginTabs = PLUGIN_VIEW_TABS.filter(tab => tab.id !== 'arkapi' || arkApiAppliesToHost);

    const instances = useMemo(() => obelisk?.instances || [], [obelisk]);
    const markerCatalog = obelisk?.markerCatalog || {};
    const readyLibraryCount = [obelisk?.libraries?.obelisk, obelisk?.libraries?.subhook].filter(Boolean).length;
    const runtimeMode = useMemo(() => {
        if (arkApiAppliesToHost && arkApi.available) return 'Modo Windows: ArkApi inventariado';
        if (obelisk.available) return 'Modo Linux: runtime detectado para instancias gestionadas';
        return 'Sin runtime detectado: configura rutas antes de operar plugins';
    }, [arkApi.available, arkApiAppliesToHost, obelisk.available]);
    const runtimeStats = [
        { label: 'Modo operativo', value: runtimeMode, tone: obelisk.available ? 'text-cyan-200' : (arkApiAppliesToHost && arkApi.available ? 'text-amber-200' : 'text-zinc-300') },
        { label: 'Librerías', value: `${readyLibraryCount}/2 listas`, tone: 'text-white' },
        { label: 'Plugins Obelisk', value: String(obelisk?.plugins?.length || 0), tone: 'text-white' },
        { label: 'Instancias Linux', value: String(instances.length), tone: 'text-white' },
        ...(arkApiAppliesToHost ? [{ label: 'Inventario ArkApi', value: String(arkApi?.plugins?.length || 0), tone: 'text-white' }] : []),
    ];
    const linuxCapability = canWrite
        ? (obelisk.available ? 'Marcadores disponibles en Linux' : 'Sin runtime Linux detectado')
        : 'Requiere owner para operar marcadores';
    const arkApiCapability = arkApi.available ? 'Inventario Windows en solo lectura' : 'Sin inventario ArkApi detectado';
    const showOverview = activeView === 'overview';
    const showArkApi = activeView === 'arkapi' && arkApiAppliesToHost;
    const showPluginInventory = activeView === 'plugins';
    const showLogs = activeView === 'console';

    const fetchStatus = useCallback(async (manual = false) => {
        statusRequestRef.current?.abort();
        const controller = new AbortController();
        statusRequestRef.current = controller;

        if (manual) setRefreshing(true);
        try {
            const res = await axios.get('/api/plugins/status', { signal: controller.signal });
            if (statusRequestRef.current !== controller) return;
            setStatus(res.data);
            setError('');
            const nextInstances = res.data.runtimes?.obelisk?.instances || [];
            setSelectedInstance(current => {
                const nextSelected = nextInstances.some(instance => instance.name === current) ? current : nextInstances[0]?.name || '';
                if (!nextSelected || nextSelected !== current) {
                    setLogs('');
                    setLogsError('');
                    logsRequestRef.current?.abort();
                    logsRequestRef.current = null;
                }
                return nextSelected;
            });
            if (manual) toast.success('Inventario de plugins actualizado');
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (statusRequestRef.current !== controller) return;
            const message = err.response?.data?.error || 'No se pudo cargar el inventario de plugins';
            setError(message);
            if (manual) toast.error(message);
        } finally {
            if (statusRequestRef.current === controller) {
                statusRequestRef.current = null;
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, []);

    const fetchLogs = useCallback(async () => {
        logsRequestRef.current?.abort();

        if (!selectedInstance) {
            setLogs('');
            setLogsError('');
            setLogsLoading(false);
            return;
        }

        const controller = new AbortController();
        logsRequestRef.current = controller;

        setLogsLoading(true);
        try {
            const res = await axios.get(`/api/plugins/obelisk/logs?instance=${encodeURIComponent(selectedInstance)}&lines=200`, { signal: controller.signal });
            if (logsRequestRef.current !== controller) return;
            setLogs(res.data.content || '');
            setLogsError('');
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (logsRequestRef.current !== controller) return;
            const message = err.response?.data?.error || 'Log no disponible';
            setLogsError(message);
            setLogs('');
        } finally {
            if (logsRequestRef.current === controller) {
                logsRequestRef.current = null;
                setLogsLoading(false);
            }
        }
    }, [selectedInstance]);

    useEffect(() => {
        fetchStatus();
        return () => {
            const request = statusRequestRef.current;
            request?.abort();
            if (statusRequestRef.current === request) {
                statusRequestRef.current = null;
            }
        };
    }, [fetchStatus]);

    useEffect(() => {
        fetchLogs();
        return () => {
            const request = logsRequestRef.current;
            request?.abort();
            if (logsRequestRef.current === request) {
                logsRequestRef.current = null;
            }
        };
    }, [fetchLogs]);

    useEffect(() => {
        if (activeView === 'arkapi' && !arkApiAppliesToHost) {
            setActiveView('overview');
        }
    }, [activeView, arkApiAppliesToHost]);

    const applyMarkerUpdate = async (instance, marker, enabled) => {
        const actionKey = `${instance}:${marker}`;
        if (!canWrite || markerMutationRef.current) return;

        markerMutationRef.current = actionKey;
        setMarkerLoading(actionKey);
        try {
            await axios.post(`/api/plugins/obelisk/instances/${encodeURIComponent(instance)}/markers`, { marker, enabled });
            toast.success(`${MARKER_LABELS[marker] || marker}: marcador ${enabled ? 'activado' : 'desactivado'}`);
            await fetchStatus();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo actualizar el marcador');
        } finally {
            if (markerMutationRef.current === actionKey) {
                markerMutationRef.current = '';
                setMarkerLoading('');
            }
        }
    };

    const requestMarkerToggle = (instance, marker, enabled) => {
        if (!canWrite || markerMutationRef.current) return;

        const label = MARKER_LABELS[marker] || marker;
        const risk = MARKER_RISK_LABELS[marker] || markerCatalog[marker] || 'Este marcador modifica el comportamiento del runtime Linux.';
        const expectedInput = `${enabled ? 'ACTIVAR' : 'DESACTIVAR'} ${marker}`;

        if (!SENSITIVE_MARKERS.has(marker)) {
            applyMarkerUpdate(instance, marker, enabled);
            return;
        }

        setModal({
            type: 'danger',
            title: `${enabled ? 'Activar' : 'Desactivar'} marcador sensible`,
            message: `${label} en ${instance}. ${risk} Confirma solo si el servidor está preparado para este cambio.`,
            Icon: AlertTriangle,
            color: 'amber',
            hasInput: true,
            inputLabel: `Escribe ${expectedInput}`,
            expectedInput,
            confirmText: enabled ? 'Activar marcador' : 'Desactivar marcador',
            onConfirm: async () => {
                await applyMarkerUpdate(instance, marker, enabled);
                setModal(null);
            },
        });
    };

    if (loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-zinc-500">
                <RefreshCw className="animate-spin text-cyan-400" size={26} />
                <p className="text-sm">Analizando runtimes de plugins...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 overflow-hidden">
            <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
                        <Plug className="text-cyan-300" />
                        Gestión de Plugins
                    </h2>
                    <p className="mt-1 text-sm text-zinc-500">Inventario y preparación operativa por runtime, manteniendo separadas las acciones Linux y ArkApi.</p>
                </div>
                <button
                    onClick={() => fetchStatus(true)}
                    disabled={refreshing}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Actualizar inventario de runtimes de plugins"
                >
                    <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Actualizando...' : 'Actualizar'}
                </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-6 custom-scrollbar">
            <section className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de runtimes de plugins">
                {runtimeStats.map(stat => (
                    <div key={stat.label} className="rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{stat.label}</p>
                        <p className={`mt-2 break-words text-sm font-semibold ${stat.tone}`}>{stat.value}</p>
                    </div>
                ))}
            </section>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-xs text-zinc-500">
                    Estado real de runtimes y acciones disponibles. El resumen evita duplicar inventarios; usa las tabs para detalle.
                </p>
                <div className="flex overflow-x-auto rounded-lg border border-zinc-800 bg-[#18181b] p-1 no-scrollbar" role="tablist" aria-label="Vistas de gestión de plugins">
                    {visiblePluginTabs.map(tab => {
                        const selected = activeView === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setActiveView(tab.id)}
                                className={`min-h-9 shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${selected ? 'bg-cyan-500 text-[#09090b]' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {error && (
                <div className="flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-300" />
                        <span className="break-words">{error}</span>
                    </div>
                    <button
                        onClick={() => fetchStatus(true)}
                        disabled={refreshing}
                        className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300/30 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Reintentando...' : 'Reintentar'}
                    </button>
                </div>
            )}

            {showOverview && (
                <section className="grid grid-cols-1 gap-3" aria-label="Resumen operativo de plugins">
                    <div className="dashboard-card overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                        <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                                    <Activity size={18} className="text-cyan-300" />
                                    Operativa Linux
                                </h3>
                                <p className="mt-1 text-xs text-zinc-500">{linuxCapability}</p>
                            </div>
                            <StatusPill ok={obelisk.available} label={obelisk.available ? 'Runtime detectado' : 'No detectado'} />
                        </div>
                        <div className="flex flex-wrap gap-2 p-4">
                            <button
                                type="button"
                                onClick={() => setActiveView('plugins')}
                                className="inline-flex min-h-9 items-center justify-center rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
                            >
                                Ver plugins
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveView('console')}
                                disabled={!selectedInstance}
                                className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Abrir consola
                            </button>
                        </div>
                    </div>
                    <div className="dashboard-card flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                        <div className="shrink-0 border-b border-zinc-800 px-4 py-4">
                            <h3 className="flex items-center gap-2 font-semibold text-white">
                                <Activity size={18} className="text-cyan-300" />
                                Marcadores de instancia
                            </h3>
                            {!canWrite && (
                                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                                    <ShieldAlert size={13} />
                                    Se requiere rol propietario para cambiar marcadores.
                                </p>
                            )}
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
                            {instances.map(instance => (
                                <div key={instance.name} className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="font-mono text-sm font-semibold text-white">{instance.name}</p>
                                            <p className="text-xs text-zinc-500">{instance.logExists ? 'Log de runtime disponible' : 'No hay log de runtime'}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setLogs('');
                                                setLogsError('');
                                                setSelectedInstance(instance.name);
                                                setActiveView('console');
                                            }}
                                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                                            aria-label={`Ver consola de runtime de ${instance.name}`}
                                        >
                                            <TerminalSquare size={14} />
                                            Consola
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {Object.keys(markerCatalog).map(marker => {
                                            const enabled = instance.markers.includes(marker);
                                            const busy = markerLoading === `${instance.name}:${marker}`;
                                            const blocked = Boolean(markerLoading);
                                            return (
                                                <button
                                                    key={marker}
                                                    onClick={() => requestMarkerToggle(instance.name, marker, !enabled)}
                                                    disabled={!canWrite || blocked}
                                                    title={markerCatalog[marker]}
                                                    className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${enabled ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200' : 'border-zinc-800 bg-[#18181b] text-zinc-400 hover:bg-zinc-800/70'}`}
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block text-xs font-medium">{MARKER_LABELS[marker] || marker}</span>
                                                        <span className={`mt-0.5 block text-[11px] leading-snug ${enabled && marker === 'disable-plugins' ? 'text-amber-200' : 'text-zinc-500'}`}>
                                                            {enabled && marker === 'disable-plugins' ? 'El marcador para desactivar plugins está activo' : (MARKER_RISK_LABELS[marker] || markerCatalog[marker])}
                                                        </span>
                                                    </span>
                                                    {busy ? <RefreshCw size={14} className="animate-spin" /> : <span className={`h-5 w-9 rounded-full border p-0.5 ${enabled ? 'border-cyan-400/40 bg-cyan-400/20' : 'border-zinc-700 bg-zinc-900'}`}><span className={`block h-3.5 w-3.5 rounded-full transition-transform ${enabled ? 'translate-x-4 bg-cyan-300' : 'bg-zinc-600'}`} /></span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {instances.length === 0 && (
                                <p className="rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-6 text-center text-sm text-zinc-500">No se detectaron instancias Obelisk.</p>
                            )}
                        </div>
                    </div>
                    {arkApiAppliesToHost && (
                        <div className="dashboard-card overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                            <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                                        <Plug size={18} className="text-amber-300" />
                                        ArkApi Windows
                                    </h3>
                                    <p className="mt-1 text-xs text-zinc-500">{arkApiCapability}</p>
                                </div>
                                <StatusPill ok={arkApi.available} label={arkApi.available ? 'Inventariado' : 'Sin datos'} />
                            </div>
                            <div className="p-4">
                                <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Plugins detectados</p>
                                    <p className="mt-2 text-2xl font-bold text-white">{arkApi?.plugins?.length || 0}</p>
                                    <p className="mt-2 text-xs text-zinc-500">{arkApi?.note || 'Solo inventario: este panel no instala, habilita ni modifica plugins ArkApi.'}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('arkapi')}
                                    className="mt-3 inline-flex min-h-9 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                                >
                                    Ver inventario ArkApi
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            {(showArkApi || showPluginInventory) && <div className="grid grid-cols-1 gap-3">
                {showPluginInventory && (
                <section className="dashboard-card flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                    <RuntimeHeader runtime={obelisk} />
                    <div className="min-h-0 flex-1 p-4">
                        <div className="flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-[#09090b]">
                            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
                                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-300">
                                    <FileJson size={16} className="shrink-0 text-emerald-300" />
                                    <span className="truncate">Plugins instalados</span>
                                </div>
                                <span className="shrink-0 rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                                    {(obelisk?.plugins || []).length}
                                </span>
                            </div>
                            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
                                {(obelisk?.plugins || []).map(plugin => (
                                    <div key={plugin.name} className="rounded-lg border border-zinc-800 bg-[#18181b] px-3 py-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="min-w-0 truncate font-mono text-xs font-semibold text-zinc-200" title={plugin.name}>{plugin.name}</span>
                                            <StatusPill ok={plugin.configExists} label={plugin.configExists ? 'config' : 'sin config'} />
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-zinc-500">
                                            <span className="truncate">{plugin.modifiedAt ? new Date(plugin.modifiedAt).toLocaleString() : 'Sin fecha'}</span>
                                            <span className="shrink-0 font-mono">{plugin.size} B</span>
                                        </div>
                                    </div>
                                ))}
                                {(!obelisk?.plugins || obelisk.plugins.length === 0) && (
                                    <p className="px-3 py-6 text-center text-sm text-zinc-500">No se detectaron plugins Obelisk.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
                )}

                {showArkApi && (
                <section className="dashboard-card overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                    <RuntimeHeader runtime={arkApi} />
                    <div className="space-y-4 p-4">
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
	                            <div className="mb-2 flex items-center gap-2 font-semibold">
	                                <AlertTriangle size={16} />
	                                Compatibilidad de solo inventario
	                            </div>
                            <p className="text-amber-100/80">{arkApi?.note || 'Solo inventario: este panel no instala, habilita ni modifica plugins ArkApi.'}</p>
                        </div>
                        <div className="space-y-2">
                            {(arkApi?.plugins || []).map(plugin => (
                                <div key={plugin.name} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-2">
                                    <span className="truncate text-sm text-zinc-300">{plugin.name}</span>
                                    <span className="text-[11px] uppercase text-zinc-500">{plugin.type}</span>
                                </div>
                            ))}
	                            {(!arkApi?.plugins || arkApi.plugins.length === 0) && (
	                                <p className="rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-4 text-center text-sm text-zinc-500">No se detectó inventario ArkApi.</p>
	                            )}
                        </div>
                    </div>
                </section>
                )}
            </div>}

	            {showLogs && <section className="grid min-h-0 grid-cols-1 gap-3 xl:h-[min(58dvh,720px)] xl:min-h-[360px]">
	                <div className="dashboard-card flex min-h-[280px] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] xl:h-full xl:min-h-0">
                    <div className="flex shrink-0 flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="flex items-center gap-2 font-semibold text-white">
                            <TerminalSquare size={18} className="text-emerald-300" />
	                            Log de runtime Linux
                        </h3>
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedInstance}
                                onChange={event => {
                                    setLogs('');
                                    setLogsError('');
                                    setSelectedInstance(event.target.value);
                                }}
                                disabled={instances.length === 0}
                                aria-label="Seleccionar instancia para leer log"
                                className="min-h-9 w-full min-w-0 rounded-md border border-zinc-700 bg-[#09090b] px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                                {instances.map(instance => <option key={instance.name} value={instance.name}>{instance.name}</option>)}
                            </select>
	                            <button onClick={fetchLogs} disabled={logsLoading || !selectedInstance} className="flex min-h-9 min-w-[8.75rem] items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50" title={logsLoading ? 'Actualizando log de runtime Linux' : 'Actualizar log de runtime Linux'} aria-label="Actualizar log de runtime Linux">
	                                <RefreshCw size={15} className={logsLoading ? 'animate-spin' : ''} />
	                                {logsLoading ? 'Actualizando...' : 'Actualizar log'}
	                            </button>
                        </div>
                    </div>
                    {logsError && (
                        <div className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">
                            {logsError}
                        </div>
                    )}
	                    <pre className="min-h-[220px] flex-1 overflow-auto whitespace-pre-wrap break-words bg-[#09090b] p-4 font-mono text-xs leading-5 text-zinc-300 custom-scrollbar xl:min-h-0">{logs || (logsLoading ? 'Cargando log...' : 'No hay log cargado.')}</pre>
	                </div>
            </section>}
            </div>
        </div>
    );
}
