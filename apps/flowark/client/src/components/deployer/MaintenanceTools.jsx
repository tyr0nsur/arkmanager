import { useRef, useState } from 'react';
import { Wrench, Search, Skull, Trash2, Lock } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import axios from 'axios';
const API_BASE = '/api';

function appliesToHost(capability, hostFamily) {
    const platforms = Array.isArray(capability?.platforms) ? capability.platforms : [];
    return platforms.length === 0 || platforms.includes(hostFamily);
}

export function MaintenanceTools({ capabilities, hostFamily = 'unknown' }) {
    const { setModal, addToast, userRole } = useDashboard();
    const [loadingAction, setLoadingAction] = useState(null);
    const maintenanceActionRef = useRef(null);
    const canOwn = userRole === 'owner';
    const maintenanceCapabilities = capabilities?.maintenance || {};
    const validateCapability = maintenanceCapabilities.validate_steamcmd;
    const clearLogsCapability = maintenanceCapabilities.clear_logs;
    const wipeCapability = maintenanceCapabilities.wipe_db;
    const showValidateSteamcmd = appliesToHost(validateCapability, hostFamily);
    const showClearLogs = appliesToHost(clearLogsCapability, hostFamily);
    const showWipe = appliesToHost(wipeCapability, hostFamily);
    const clearLogsTargetCount = Number.isInteger(clearLogsCapability?.targetCount) ? clearLogsCapability.targetCount : null;
    const clearLogsConfirmation = clearLogsCapability?.confirmation || 'TRUNCAR LOGS';
    const clearLogsReady = Boolean(clearLogsCapability && clearLogsCapability.available !== false);
    const clearLogsDescription = clearLogsTargetCount !== null && clearLogsReady
        ? `Trunca ${clearLogsTargetCount} log${clearLogsTargetCount === 1 ? '' : 's'} gestionado${clearLogsTargetCount === 1 ? '' : 's'}; conserva evidencias antes.`
        : (clearLogsCapability?.reason || 'Cargando capacidad de logs gestionados...');
    const handleMaintenance = (action, title, desc, icon, color, options = {}) => {
        if (maintenanceActionRef.current) return;
        setModal({
            type: 'confirm',
            title,
            message: desc,
            Icon: icon,
            color,
            hasInput: Boolean(options.expectedInput),
            inputLabel: options.expectedInput ? `Escribe ${options.expectedInput}` : undefined,
            expectedInput: options.expectedInput,
            confirmText: options.confirmText,
            onConfirm: async (inputValue = '') => {
                if (maintenanceActionRef.current) return;
                maintenanceActionRef.current = action;
                setModal(null);
                setLoadingAction(action);
                try {
                    const payload = { action };
                    if (options.expectedInput) payload.confirmation = inputValue;
                    const res = await axios.post(`${API_BASE}/maintenance/action`, payload);
                    addToast(res.data.message || 'Acción completada', 'success');
                } catch (err) {
                    addToast(err.response?.data?.error || 'Error ejecutando la acción de mantenimiento', 'error');
                } finally {
                    maintenanceActionRef.current = null;
                    setLoadingAction(null);
                }
            }
        });
    };

    return (
        <div className="bg-[#18181b] border border-zinc-800/50 rounded-xl overflow-hidden relative">
            <div className="p-5 border-b border-zinc-800/50 flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                    <Wrench size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-white text-lg">Mantenimiento y Sanación</h3>
                    <p className="text-xs text-zinc-400">Herramientas aplicables al host {hostFamily}</p>
                </div>
            </div>
	            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                {showValidateSteamcmd && (
	                <button
	                    type="button"
	                    disabled
	                    aria-label="Validar SteamCMD no disponible"
	                    className="flex flex-col items-center justify-center gap-3 p-6 bg-[#09090b] border border-zinc-800 rounded-xl opacity-60"
	                >
                    <Search size={32} className="text-emerald-500/30" />
                    <div className="text-center">
                        <span className="block font-bold text-zinc-500 text-sm mb-1">Validar con SteamCMD</span>
                        <span className="block text-xs text-zinc-500">{validateCapability?.reason || 'No implementado en este servidor.'}</span>
                    </div>
                    <Lock size={14} className="text-zinc-600" />
	                </button>
                )}

                {showClearLogs && (
	                <button
	                    type="button"
	                    disabled={loadingAction !== null || !canOwn || !clearLogsReady}
	                    aria-label="Truncar logs ARK gestionados"
	                    onClick={() => handleMaintenance(
	                        'clear_logs',
	                        'Truncar logs ARK',
                        `Esto truncará ${clearLogsTargetCount ?? 'los'} log${clearLogsTargetCount === 1 ? '' : 's'} ARK gestionado${clearLogsTargetCount === 1 ? '' : 's'} por el panel. Debe usarse solo tras conservar la evidencia necesaria. Confirma escribiendo ${clearLogsConfirmation}.`,
                        Trash2,
                        'amber',
                        { expectedInput: clearLogsConfirmation, confirmText: 'Truncar logs' }
                    )}
                    className="flex flex-col items-center justify-center gap-3 p-6 bg-[#09090b] border border-zinc-800 rounded-xl hover:border-amber-500/50 transition-colors disabled:opacity-50"
                >
                    <Trash2 size={32} className={`text-amber-500/50 ${loadingAction === 'clear_logs' ? 'animate-pulse' : ''}`} />
	                    <div className="text-center">
	                        <span className="block font-bold text-zinc-300 text-sm mb-1">{loadingAction === 'clear_logs' ? 'Truncando...' : 'Truncar logs ARK'}</span>
                        <span className="block text-xs text-zinc-500">{canOwn ? clearLogsDescription : 'Requiere rol owner.'}</span>
                    </div>
                    {!canOwn && <Lock size={14} className="text-zinc-600" />}
                </button>
                )}

                {showWipe && (
	                <button
	                    type="button"
	                    disabled
	                    aria-label="Wipe completo no disponible"
	                    className="flex flex-col items-center justify-center gap-3 p-6 bg-[#09090b] border border-zinc-800 rounded-xl opacity-60 md:col-span-2"
	                >
                    <Skull size={32} className="text-red-500/30" />
                    <div className="text-center">
                        <span className="block font-bold text-red-500/70 text-sm mb-1">Wipe Completo (Irreversible)</span>
                        <span className="block text-xs text-zinc-500">{wipeCapability?.reason || 'No implementado; no se ofrece una acción destructiva falsa.'}</span>
                    </div>
                    <Lock size={14} className="text-zinc-600" />
                </button>
                )}

                {!showValidateSteamcmd && !showClearLogs && !showWipe && (
                    <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-6 text-center text-sm text-zinc-500 md:col-span-2">
                        No hay acciones de mantenimiento aplicables a este sistema operativo.
                    </div>
                )}

            </div>
        </div>
    );
}
