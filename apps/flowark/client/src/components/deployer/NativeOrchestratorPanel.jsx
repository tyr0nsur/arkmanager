import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FolderInput, HardDrive, Lock, Package, RefreshCw, Save, ServerCog, XCircle } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';

const API_BASE = '/api';

function isCanceledRequest(err) {
    return err?.name === 'CanceledError' || axios.isCancel?.(err);
}

function CheckRow({ check }) {
    const status = check.status || 'warn';
    const Icon = status === 'ok' ? CheckCircle2 : (status === 'error' ? XCircle : AlertTriangle);
    const tone = status === 'ok'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
        : (status === 'error'
            ? 'border-red-500/25 bg-red-500/10 text-red-200'
            : 'border-amber-500/25 bg-amber-500/10 text-amber-200');

    return (
        <div className={`rounded-lg border px-3 py-2 ${tone}`}>
            <div className="flex items-start gap-2">
                <Icon size={15} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="text-xs font-semibold">{check.label || check.id}</p>
                    <p className="mt-0.5 break-words text-[11px] opacity-80">{check.detail}</p>
                </div>
            </div>
        </div>
    );
}

function PhasePill({ phase }) {
    const tone = phase.status === 'planning'
        ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-200'
        : (phase.status === 'optional'
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
            : 'border-zinc-700 bg-[#09090b] text-zinc-400');

    return (
        <div className={`rounded-lg border px-3 py-3 ${tone}`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{phase.label}</p>
                <span className="shrink-0 rounded-md border border-current/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">{phase.status}</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 opacity-80">{phase.reason}</p>
        </div>
    );
}

export function NativeOrchestratorPanel({ capabilities, hostFamily = 'unknown' }) {
    const { userRole } = useDashboard();
    const [readiness, setReadiness] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [arkRoot, setArkRoot] = useState('');
    const [clusterId, setClusterId] = useState('');
    const [workshopEnabled, setWorkshopEnabled] = useState(false);
    const [workshopIds, setWorkshopIds] = useState('');
    const [epicWarningAccepted, setEpicWarningAccepted] = useState(false);
    const [preflight, setPreflight] = useState(null);
    const readinessRequestRef = useRef(null);
    const preflightRequestRef = useRef(null);
    const saveRequestRef = useRef(null);

    const canConfigure = userRole === 'owner';
    const nativeCapability = capabilities?.nativeOrchestrator || {};
    const phases = readiness?.phases || nativeCapability.phases || [];
    const layout = readiness?.layout || {};
    const migration = readiness?.migration || {};
    const maps = migration.maps || [];
    const blockedActions = migration.blockedActions || [];
    const workshopWarning = readiness?.workshop?.warning || nativeCapability.workshopWarning || 'Los mods de Steam Workshop requieren cliente Steam; los usuarios de Epic Games no podran entrar si se activan.';
    const hostLabel = readiness?.host?.label || (hostFamily === 'linux' ? 'Linux' : (hostFamily === 'windows' ? 'Windows' : 'No soportado'));
    const runtimeLabel = readiness?.currentRuntime || (hostFamily === 'linux' ? 'Obelisk' : (hostFamily === 'windows' ? 'ArkApi' : 'Sin runtime'));

    const applyReadiness = useCallback((orchestrator) => {
        setReadiness(orchestrator);
        const config = orchestrator?.config || {};
        setArkRoot(config.arkRoot || '');
        setClusterId(config.cluster?.id || '');
        setWorkshopEnabled(Boolean(config.workshopMods?.enabled));
        setWorkshopIds((config.workshopMods?.ids || []).join('\n'));
        setEpicWarningAccepted(Boolean(config.workshopMods?.epicWarningAccepted));
        setPreflight(orchestrator?.preflight || null);
    }, []);

    const fetchReadiness = useCallback(async (manual = false) => {
        readinessRequestRef.current?.abort();
        const controller = new AbortController();
        readinessRequestRef.current = controller;
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/orchestrator/readiness`, { signal: controller.signal });
            if (readinessRequestRef.current !== controller) return;
            applyReadiness(res.data.orchestrator || null);
            setError('');
            if (manual) toast.success('Orquestador actualizado');
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (readinessRequestRef.current !== controller) return;
            const message = err.response?.data?.error || 'No se pudo cargar el orquestador nativo';
            setError(message);
            if (manual) toast.error(message);
        } finally {
            if (readinessRequestRef.current === controller) {
                readinessRequestRef.current = null;
                setLoading(false);
            }
        }
    }, [applyReadiness]);

    useEffect(() => {
        fetchReadiness();
        return () => {
            readinessRequestRef.current?.abort();
            preflightRequestRef.current?.abort();
            saveRequestRef.current?.abort();
            readinessRequestRef.current = null;
            preflightRequestRef.current = null;
            saveRequestRef.current = null;
        };
    }, [fetchReadiness]);

    const runPreflight = async () => {
        preflightRequestRef.current?.abort();
        const controller = new AbortController();
        preflightRequestRef.current = controller;
        setPreflightLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/orchestrator/preflight?root=${encodeURIComponent(arkRoot)}`, { signal: controller.signal });
            if (preflightRequestRef.current !== controller) return;
            setPreflight(res.data.preflight || null);
            const canUse = res.data.preflight?.canUse === true;
            toast[canUse ? 'success' : 'warning'](canUse ? 'Ruta valida para preparar el orquestador' : 'La ruta necesita ajustes antes de guardarse');
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (preflightRequestRef.current !== controller) return;
            toast.error(err.response?.data?.error || 'No se pudo validar la ruta');
        } finally {
            if (preflightRequestRef.current === controller) {
                preflightRequestRef.current = null;
                setPreflightLoading(false);
            }
        }
    };

    const saveConfig = async () => {
        if (!canConfigure || saveRequestRef.current) return;
        const controller = new AbortController();
        saveRequestRef.current = controller;
        setSaving(true);
        try {
            const res = await axios.post(`${API_BASE}/orchestrator/config`, {
                arkRoot,
                cluster: { id: clusterId },
                workshopMods: {
                    enabled: workshopEnabled,
                    ids: workshopIds,
                    epicWarningAccepted,
                },
            }, { signal: controller.signal });
            if (saveRequestRef.current !== controller) return;
            applyReadiness(res.data.orchestrator || null);
            toast.success(res.data.message || 'Preparacion guardada');
        } catch (err) {
            if (isCanceledRequest(err)) return;
            if (saveRequestRef.current !== controller) return;
            if (err.response?.data?.preflight) setPreflight(err.response.data.preflight);
            toast.error(err.response?.data?.error || 'No se pudo guardar la preparacion');
        } finally {
            if (saveRequestRef.current === controller) {
                saveRequestRef.current = null;
                setSaving(false);
            }
        }
    };

    if (loading && !readiness) {
        return (
            <div className="rounded-xl border border-zinc-800 bg-[#18181b] px-4 py-8 text-center text-sm text-zinc-500">
                Cargando orquestador nativo...
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <section className="dashboard-card min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] xl:col-span-2">
                <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                            <ServerCog size={18} className="text-cyan-300" />
                            Orquestador nativo
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">Preparacion para migrar de LinuxGSM a ArkPanel nativo sin ejecutar acciones live.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchReadiness(true)}
                        disabled={loading}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-zinc-700 px-3 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>

                {error && (
                    <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
                    <div className="space-y-3">
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                                <HardDrive size={16} className="text-cyan-300" />
                                Ruta base
                            </div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500" htmlFor="orchestrator-root">arkRoot</label>
                            <input
                                id="orchestrator-root"
                                value={arkRoot}
                                onChange={event => setArkRoot(event.target.value)}
                                placeholder="/mnt/ark-storage"
                                className="mt-2 min-h-11 w-full rounded-md border border-zinc-700 bg-[#18181b] px-3 text-sm text-white outline-none focus:border-cyan-500"
                            />
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={runPreflight}
                                    disabled={preflightLoading}
                                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <FolderInput size={14} />
                                    {preflightLoading ? 'Validando...' : 'Validar ruta'}
                                </button>
                                <button
                                    type="button"
                                    onClick={saveConfig}
                                    disabled={!canConfigure || saving}
                                    className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Save size={14} />
                                    {saving ? 'Guardando...' : 'Guardar preparacion'}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                                <Package size={16} className="text-amber-300" />
                                Workshop opcional
                            </div>
                            <div className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                                {workshopWarning}
                            </div>
                            <label className="mt-3 flex items-start gap-2 text-xs text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={workshopEnabled}
                                    onChange={event => setWorkshopEnabled(event.target.checked)}
                                    className="mt-0.5"
                                />
                                Preparar lista de mods Steam Workshop
                            </label>
                            <textarea
                                value={workshopIds}
                                onChange={event => setWorkshopIds(event.target.value)}
                                disabled={!workshopEnabled}
                                placeholder="731604991&#10;1404697612"
                                rows={4}
                                className="mt-3 w-full rounded-md border border-zinc-700 bg-[#18181b] px-3 py-2 font-mono text-xs text-white outline-none focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <label className="mt-3 flex items-start gap-2 text-xs text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={epicWarningAccepted}
                                    onChange={event => setEpicWarningAccepted(event.target.checked)}
                                    className="mt-0.5"
                                />
                                He leido el aviso de Epic para esta preparacion
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Host y runtime</p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <div className="rounded-md border border-zinc-800 bg-[#18181b] px-3 py-2">
                                    <p className="text-[10px] uppercase text-zinc-500">Sistema</p>
                                    <p className="mt-1 text-sm font-semibold text-white">{hostLabel}</p>
                                </div>
                                <div className="rounded-md border border-zinc-800 bg-[#18181b] px-3 py-2">
                                    <p className="text-[10px] uppercase text-zinc-500">Plugins</p>
                                    <p className="mt-1 text-sm font-semibold text-cyan-200">{runtimeLabel}</p>
                                </div>
                            </div>
                            <label className="mt-3 block text-[10px] font-bold uppercase tracking-widest text-zinc-500" htmlFor="orchestrator-cluster">Cluster id futuro</label>
                            <input
                                id="orchestrator-cluster"
                                value={clusterId}
                                onChange={event => setClusterId(event.target.value)}
                                placeholder="obelisk-cluster"
                                className="mt-2 min-h-10 w-full rounded-md border border-zinc-700 bg-[#18181b] px-3 text-sm text-white outline-none focus:border-cyan-500"
                            />
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#09090b] p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Preflight</p>
                            <div className="mt-3 space-y-2">
                                {(preflight?.checks || []).map(check => <CheckRow key={check.id} check={check} />)}
                                {!preflight && (
                                    <p className="rounded-lg border border-zinc-800 bg-[#18181b] px-3 py-4 text-center text-sm text-zinc-500">Valida una ruta para ver checks.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <aside className="min-w-0 space-y-4">
                <section className="dashboard-card overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b]">
                    <div className="border-b border-zinc-800 px-4 py-3">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Lock size={16} className="text-zinc-400" />
                            Fases bloqueadas
                        </h3>
                    </div>
                    <div className="space-y-2 p-4">
                        {phases.map(phase => <PhasePill key={phase.id} phase={phase} />)}
                    </div>
                </section>
            </aside>

            <section className="dashboard-card min-w-0 overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] xl:col-span-3">
                <div className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white">Plan de migracion LinuxGSM</h3>
                        <p className="mt-1 text-xs text-zinc-500">Importacion piloto primero, manteniendo LinuxGSM como rollback hasta completar la migracion.</p>
                    </div>
                    <span className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        {maps.length} mapas detectados
                    </span>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
                    {maps.map(map => (
                        <div key={map.id} className="rounded-lg border border-zinc-800 bg-[#09090b] p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-white">{map.name}</p>
                                <span className="rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-200">planned</span>
                            </div>
                            <p className="mt-2 text-[11px] text-zinc-500">LinuxGSM: {map.source?.script || 'sin script'}</p>
                            <p className="mt-1 truncate text-[11px] text-zinc-500" title={map.target?.instancePath}>Instancia: {map.target?.instancePath || 'pendiente de arkRoot'}</p>
                            <p className="mt-2 font-mono text-[11px] text-zinc-400">game {map.ports?.game} · query {map.ports?.query} · rcon {map.ports?.rcon}</p>
                        </div>
                    ))}
                    {maps.length === 0 && (
                        <p className="rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-6 text-center text-sm text-zinc-500 lg:col-span-3">No hay mapas configurados para planificar.</p>
                    )}
                </div>
                <div className="border-t border-zinc-800 px-4 py-3">
                    <p className="text-[11px] text-zinc-500">Acciones bloqueadas: {blockedActions.join(', ') || 'ninguna declarada'}.</p>
                    {layout.serverfiles && (
                        <p className="mt-1 truncate text-[11px] text-zinc-500" title={layout.serverfiles}>Serverfiles compartidos: {layout.serverfiles}</p>
                    )}
                </div>
            </section>
        </div>
    );
}
