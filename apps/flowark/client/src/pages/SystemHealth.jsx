import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Server, Cpu, HardDrive, Clock, RefreshCw, AlertTriangle, Network, ArrowDown, ArrowUp, ShieldCheck, CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

function numericMetric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function percentageMetric(value) {
    return Math.min(100, Math.max(0, numericMetric(value, 0)));
}

function isCanceledRequest(error) { return error?.name === 'CanceledError' || axios.isCancel?.(error); }

export function SystemHealth() {
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showReadinessModal, setShowReadinessModal] = useState(false);
    const [error, setError] = useState('');
    const healthRequestRef = useRef(null);

    const fetchHealth = useCallback(async (isManual = false) => {
        if (!isManual && healthRequestRef.current?.isManual) return;
        healthRequestRef.current?.controller.abort();
        const request = { controller: new AbortController(), isManual };
        healthRequestRef.current = request;
        if (isManual) setRefreshing(true);
        try {
            const res = await axios.get('/api/system/health', { signal: request.controller.signal });
            if (healthRequestRef.current !== request) return;
            if (!res.data || typeof res.data !== 'object' || Array.isArray(res.data)) throw new Error('invalid_health_payload');
            setHealth(res.data);
            setError('');
            if (isManual) toast.success('Diagnóstico del sistema actualizado');
        } catch (error) {
            if (isCanceledRequest(error) || healthRequestRef.current !== request) return;
            setError(error.response?.data?.error || 'Diagnóstico no disponible. Reintenta antes de tomar decisiones de despliegue.');
            if (isManual) toast.error('Error al obtener salud del sistema');
        } finally {
            if (healthRequestRef.current === request) {
                healthRequestRef.current = null;
                setLoading(false);
                if (isManual) setRefreshing(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchHealth();
        const interval = setInterval(() => fetchHealth(), 10000);
        return () => {
            clearInterval(interval);
            healthRequestRef.current?.controller.abort();
            healthRequestRef.current = null;
        };
    }, [fetchHealth]);

    const formatBytes = (bytes, decimals = 2) => {
        bytes = Math.max(0, numericMetric(bytes));
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.max(0, Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k))));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const formatUptime = (seconds) => {
        seconds = Math.max(0, numericMetric(seconds));
        const d = Math.floor(seconds / (3600*24));
        const h = Math.floor(seconds % (3600*24) / 3600);
        const m = Math.floor(seconds % 3600 / 60);
        return `${d}d ${h}h ${m}m`;
    };

    const getStatusColor = (percentage) => {
        if (percentage > 90) return 'text-red-400 bg-red-500/10 border-red-500/30';
        if (percentage > 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    };

    if (loading && !health) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                <p>Ejecutando escaneo de hardware avanzado...</p>
            </div>
        );
    }

    if (!health) {
        return <section className="flex h-full min-h-0 flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertTriangle className="text-amber-400" size={28} /><h2>Diagnóstico no disponible</h2>
            <p role="alert" className="max-w-xl text-sm text-zinc-400">{error}</p>
            <button type="button" onClick={() => fetchHealth(true)} disabled={refreshing} className="min-h-11 min-w-[8.5rem] rounded-lg border border-zinc-700 px-4 disabled:cursor-not-allowed disabled:opacity-50">{refreshing ? 'Reintentando...' : 'Reintentar'}</button>
        </section>;
    }
    const memoryUsed = Math.max(0, numericMetric(health.memory?.used));
    const memoryTotal = Math.max(0, numericMetric(health.memory?.total));
    const memoryUsage = memoryTotal > 0 ? percentageMetric((memoryUsed / memoryTotal) * 100) : 0;
    const cpuUsage = percentageMetric(health.cpu?.currentLoad);
    const cpuTemp = numericMetric(health.cpu?.temperature);
    const networkInterfaces = Array.isArray(health.network) ? health.network : [];
    const disks = Array.isArray(health.disks) ? health.disks.filter(disk => disk && typeof disk === 'object') : [];

    // Calculate total network traffic
    let totalRx = 0;
    let totalTx = 0;
    networkInterfaces.forEach(net => {
        totalRx += Math.max(0, numericMetric(net?.rx_bytes));
        totalTx += Math.max(0, numericMetric(net?.tx_bytes));
    });

    // Readiness Logic
    const readiness = health.readiness || { status: 'unknown', checks: [] };
    const readinessChecks = Array.isArray(readiness.checks) ? readiness.checks.filter(check => check && typeof check === 'object') : [];

    const readinessStatusKey = (status) => {
        if (status === 'pass' || status === 'ok') return 'pass';
        if (status === 'fail' || status === 'error' || status === 'critical') return 'fail';
        return 'warn';
    };

    const readinessSortWeight = (status) => {
        const s = readinessStatusKey(status);
        if (s === 'fail') return 0;
        if (s === 'warn') return 1;
        return 2;
    };

    const readinessSummary = readinessChecks.reduce((summary, check) => {
        const status = readinessStatusKey(check.status);
        summary[status]++;
        return summary;
    }, { pass: 0, warn: 0, fail: 0 });

    const sortedReadinessChecks = [...readinessChecks].sort((left, right) => {
        return readinessSortWeight(left.status) - readinessSortWeight(right.status);
    });

    const readinessTone = (status) => {
        const s = readinessStatusKey(status);
        if (s === 'pass') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20';
        if (s === 'fail') return 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20';
        if (s === 'warn') return 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20';
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/20';
    };

    const readinessIcon = (status) => {
        const s = readinessStatusKey(status);
        if (s === 'pass') return <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />;
        if (s === 'fail') return <XCircle size={16} className="text-red-400 shrink-0" />;
        return <AlertCircle size={16} className="text-amber-400 shrink-0" />;
    };

    const formatTimestamp = (ts) => {
        if (!ts) return 'Desconocido';
        return new Date(ts).toLocaleString('es-ES');
    };

    const readinessLabel = readinessChecks.length > 0
        ? (readinessStatusKey(readiness.status) === 'pass' ? 'OK' : readinessStatusKey(readiness.status) === 'warn' ? 'AVISOS' : 'FALLOS')
        : 'SIN DATOS';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-y-auto pr-1 pb-6 custom-scrollbar"
        >
            {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200"><span className="flex-1">{error} Se conserva la última lectura.</span><button type="button" disabled={refreshing} onClick={() => fetchHealth(true)} className="min-h-11 rounded border border-amber-500/40 px-3 disabled:opacity-50">Reintentar</button></div>}
            {/* Readiness Modal */}
            <AnimatePresence>
                {showReadinessModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#121214] border border-zinc-800/80 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
                        >
                            <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-[#18181b]">
                                <div>
                                    <h3 className="text-xl font-bold flex items-center gap-2 text-white">
                                        <ShieldCheck className="text-emerald-400" size={24} />
                                        Readiness de Producción
                                    </h3>
                                    <p className="text-sm text-zinc-500 mt-1">Última comprobación: {formatTimestamp(readiness?.checkedAt)}</p>
                                </div>
                                <button
                                    onClick={() => setShowReadinessModal(false)}
                                    className="p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {sortedReadinessChecks.map(check => (
                                        <div key={check.id} className={`flex items-start gap-3 p-4 rounded-xl border ${readinessStatusKey(check.status) === 'pass' ? 'border-zinc-800/60 bg-[#0a0a0c]' : readinessStatusKey(check.status) === 'fail' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                                            <div className="mt-0.5">
                                                {readinessIcon(check.status)}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className={`text-sm font-bold truncate ${readinessStatusKey(check.status) === 'fail' ? 'text-red-400' : readinessStatusKey(check.status) === 'warn' ? 'text-amber-400' : 'text-zinc-200'}`}>
                                                    {check.label}
                                                </h4>
                                                <p className="text-xs text-zinc-500 mt-1 leading-snug">{check.detail}</p>{check.remediation && <p className="mt-2 text-xs text-amber-200">Acción recomendada: {check.remediation}</p>}
                                            </div>
                                        </div>
                                    ))}
                                    {readinessChecks.length === 0 && (
                                        <div className="col-span-full text-center text-sm text-zinc-500 py-10 border border-dashed border-zinc-800 rounded-xl bg-[#0a0a0c]">
                                            Readiness sin checks. Reintenta antes de tomar decisiones de despliegue.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="p-5 border-t border-zinc-800/80 bg-[#18181b] flex justify-between items-center">
                                <div className="flex gap-4 text-sm font-bold">
                                    <span className="text-emerald-400">{readinessSummary.pass} OK</span>
                                    <span className="text-amber-400">{readinessSummary.warn} Avisos</span>
                                    <span className="text-red-400">{readinessSummary.fail} Fallos</span>
                                </div>
                                <button
                                    onClick={() => setShowReadinessModal(false)}
                                    className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-colors"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#121214] border border-zinc-800/80 p-5 rounded-2xl shadow-lg gap-4">
                <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
                        <Activity className="text-indigo-400" />
                        Diagnósticos del Host
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1">Monitorización del runtime Linux, hardware físico y health checks.</p>
                </div>
                <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto">
                    {/* Botón de Readiness dinámico */}
                    <button
                        aria-label="Readiness de producción"
                        onClick={() => setShowReadinessModal(true)}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors border text-sm ${readinessTone(readiness.status)}`}
                    >
                        <ShieldCheck size={16} />
                        Producción: {readinessLabel}
                    </button>

                    <button
                        onClick={() => fetchHealth(true)}
                        disabled={refreshing}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 px-4 py-2 rounded-lg font-medium transition-colors border border-indigo-500/20 text-sm disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Analizando...' : 'Refrescar'}
                    </button>
                </div>
            </div>

            {/* TOP ROW: HARDWARE VITALS (4 columns) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Resumen operativo del host">

                {/* CPU */}
                <div className="dashboard-card flex flex-col rounded-xl border border-zinc-800/80 bg-[#121214] p-5 shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                            <Cpu size={18} className="text-purple-400" />
                            <h3 className="font-bold">CPU</h3>
                        </div>
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(cpuUsage)}`}>
                            {cpuUsage > 90 ? 'Crítico' : cpuUsage > 70 ? 'Alto' : 'Normal'}
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-2xl font-bold text-white">{cpuUsage.toFixed(1)}%</span>
                            {cpuTemp > 0 && <span className={`text-sm font-bold ${cpuTemp > 80 ? 'text-red-400' : 'text-amber-400'}`}>{cpuTemp.toFixed(1)} °C</span>}
                        </div>
                        <div className="w-full bg-zinc-800/50 rounded-full h-1.5 mb-3">
                            <progress aria-label="Uso de CPU" value={cpuUsage} max={100} className="h-full w-full accent-cyan-400" />
                        </div>
                        <p className="text-xs text-zinc-500 truncate">{health.cpu?.manufacturer || 'CPU'} {health.cpu?.brand || 'No disponible'}</p>
                        <p className="text-xs text-zinc-600 mt-1">{numericMetric(health.cpu?.cores)} Cores @ {numericMetric(health.cpu?.speed)} GHz</p>
                    </div>
                </div>

                {/* RAM */}
                <div className="dashboard-card flex flex-col rounded-xl border border-zinc-800/80 bg-[#121214] p-5 shadow-lg">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2 text-zinc-300">
                            <Activity size={18} className="text-amber-400" />
                            <h3 className="font-bold">RAM Real</h3>
                        </div>
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(memoryUsage)}`}>
                            {memoryUsage > 90 ? 'Crítico' : memoryUsage > 70 ? 'Aviso' : 'Óptimo'}
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-2xl font-bold text-white">{formatBytes(memoryUsed, 1)}</span>
                            <span className="text-xs text-zinc-500 mb-1">de {memoryTotal > 0 ? formatBytes(memoryTotal, 1) : 'No disponible'}</span>
                        </div>
                        <div className="w-full bg-zinc-800/50 rounded-full h-1.5 mb-3">
                            <progress aria-label="Uso de memoria" value={memoryUsage} max={100} className="h-full w-full accent-cyan-400" />
                        </div>
                        <p className="text-xs text-zinc-500">Memoria RAM Activa</p>
                        <p className="text-xs text-zinc-600 mt-1">Excluye cache y buffers del kernel</p>
                    </div>
                </div>

                {/* RED */}
                <div className="dashboard-card flex flex-col rounded-xl border border-zinc-800/80 bg-[#121214] p-5 shadow-lg">
                    <div className="flex items-center gap-2 text-zinc-300 mb-4">
                        <Network size={18} className="text-pink-400" />
                        <h3 className="font-bold">Red Global</h3>
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-3">
                        <div className="flex justify-between items-center bg-[#0a0a0c] p-2 rounded-lg border border-zinc-800/80">
                            <span className="text-xs text-zinc-500 flex items-center gap-1"><ArrowDown size={14} className="text-cyan-400" /> Bajada</span>
                            <span className="font-bold text-cyan-400">{formatBytes(totalRx, 1)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-[#0a0a0c] p-2 rounded-lg border border-zinc-800/80">
                            <span className="text-xs text-zinc-500 flex items-center gap-1"><ArrowUp size={14} className="text-emerald-400" /> Subida</span>
                            <span className="font-bold text-emerald-400">{formatBytes(totalTx, 1)}</span>
                        </div>
                    </div>
                </div>

                {/* OS & Uptime */}
                <div className="dashboard-card flex flex-col rounded-xl border border-zinc-800/80 bg-[#121214] p-5 shadow-lg">
                    <div className="flex items-center gap-2 text-zinc-300 mb-4">
                        <Server size={18} className="text-blue-400" />
                        <h3 className="font-bold">Sistema</h3>
                    </div>
                    <div className="flex-1">
                        <p className="text-lg font-bold text-white leading-tight truncate">{health.os?.distro || 'No disponible'} {health.os?.release || ''}</p>
                        <p className="text-xs text-zinc-500 font-mono mt-1 truncate">{health.os?.kernel || 'No disponible'}</p>
                        <div className="mt-4 pt-4 border-t border-zinc-800/80 flex justify-between items-center">
                            <span className="text-xs text-zinc-500 uppercase">Uptime</span>
                            <span className="text-sm font-bold text-emerald-400 flex items-center gap-1"><Clock size={12}/> {formatUptime(health.os?.uptime)}</span>
                        </div>
                    </div>
                </div>

            </div>

            {/* MIDDLE ROW: STORAGE (Critical) */}
            <div className="dashboard-card border border-zinc-800/80 bg-[#121214] rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-bold flex items-center gap-2 mb-6 text-white">
                    <HardDrive className="text-cyan-400" size={24} />
                    Unidades de Almacenamiento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6" aria-label="Red y almacenamiento">
                    {!disks.length && <p role="status" className="text-sm text-amber-200">Inventario de discos no disponible. Reintenta el diagnóstico antes de operar con capacidad crítica.</p>}
                    {disks.map((disk, idx) => {
                        const diskMount = String(disk.mount || 'Sin montaje');
                        const diskUse = percentageMetric(disk.use);
                        const isPrimary = diskMount === '/' || diskMount.includes('servidor');
                        return (
                            <div key={idx} className={`bg-[#0a0a0c] border ${isPrimary ? 'border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.05)]' : 'border-zinc-800/80'} rounded-xl p-5`}>
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-bold text-base text-white flex items-center gap-2">
                                            {diskMount} {isPrimary && <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded uppercase tracking-wider">Primario</span>}
                                        </h3>
                                        <p className="text-[11px] text-zinc-500 mt-1 uppercase tracking-wider">{disk.fs} ({disk.type})</p>
                                    </div>
                                    <div className={`px-2 py-1 rounded text-xs font-bold uppercase border ${getStatusColor(diskUse)}`}>
                                        {diskUse > 90 ? 'Lleno' : diskUse > 70 ? 'Aviso' : 'Óptimo'}
                                    </div>
                                </div>
                                <div className="flex justify-between items-end mb-2">
                                    <div>
                                        <p className="text-2xl font-bold text-white">{formatBytes(disk.used, 1)}</p>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Ocupado ({diskUse}%)</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-base font-medium text-zinc-400">{formatBytes(disk.size, 1)}</p>
                                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Total</p>
                                    </div>
                                </div>
                                <div className="w-full bg-zinc-800/60 rounded-full h-2.5 overflow-hidden relative">
                                    <progress aria-label={`Uso disco ${diskMount}`} value={diskUse} max={100} className="h-full w-full accent-cyan-400" />
                                </div>
                                {diskUse > 80 && diskMount.includes('servidor') && (
                                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex gap-3 items-start">
                                        <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                                        <div className="flex flex-col gap-1">
                                            <p className="text-sm font-bold text-amber-300">Espacio de Servidor Crítico</p>
                                            <p className="text-xs text-amber-200/80">Vacíe los logs y autoguardados antiguos desde el Gestor de Archivos para evitar pérdida de datos en ARK.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </motion.div>
    );
}
