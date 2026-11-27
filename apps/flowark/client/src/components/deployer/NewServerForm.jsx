import { Rocket, Server, AppWindow, MonitorPlay, Lock } from 'lucide-react';

export function NewServerForm({ capabilities, hostFamily = 'unknown' }) {
    const deployCapability = capabilities?.deployStart;
    const host = capabilities?.host || {};
    const deploymentTarget = capabilities?.deploymentTargets?.[hostFamily];
    const deployAvailable = deployCapability?.available === true;
    const deployReason = deploymentTarget?.reason || deployCapability?.reason || 'El despliegue automatizado no está implementado en este servidor';
    const isLinuxHost = hostFamily === 'linux';
    const isWindowsHost = hostFamily === 'windows';
    const HostIcon = isWindowsHost ? AppWindow : MonitorPlay;
    const hostLabel = host.label || deploymentTarget?.label || 'Sistema no soportado';
    const runtimeLabel = deploymentTarget?.runtime || (isLinuxHost ? 'Obelisk' : (isWindowsHost ? 'ArkApi' : 'Sin runtime'));

    return (
        <div className="relative overflow-hidden rounded-xl border border-zinc-800/50 bg-[#18181b]/70">
            <div className="p-5 border-b border-zinc-800/50 flex items-center gap-3">
                <div className="p-2 bg-zinc-700/30 rounded-lg text-zinc-400">
                    <Server size={20} />
                </div>
                <div>
                    <h3 className="font-bold text-white text-lg">Despliegue automatizado</h3>
                    <p className="text-xs text-zinc-400">Sólo se muestra la ruta compatible con el sistema operativo activo.</p>
                </div>
            </div>
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-xs text-amber-100">
                {deployReason}
            </div>
            <div className="p-5 space-y-5">
	                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
	                    <div className="space-y-1.5">
	                        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Sistema detectado</span>
                        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-2 text-sm text-zinc-200">
                            <HostIcon size={16} className={isWindowsHost ? 'text-blue-300' : 'text-cyan-300'} />
                            <span>{hostLabel}</span>
                        </div>
	                    </div>
	                    <div className="space-y-1.5">
	                        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Runtime previsto</span>
	                        <div className="flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-2 text-sm text-zinc-200">
	                            <Server size={16} className="text-zinc-400" />
                            <span>{runtimeLabel}</span>
                        </div>
                    </div>
                </div>

                {isLinuxHost && (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                        Linux usará la ruta de runtime Obelisk cuando esté lista. ArkApi no se muestra aquí porque es específico de Windows.
                    </div>
                )}

                {isWindowsHost && (
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-100">
                        Windows usará ArkApi cuando el flujo de despliegue seguro esté implementado. La ruta Obelisk no aplica en este host.
                    </div>
                )}

                {!isLinuxHost && !isWindowsHost && (
                    <div className="rounded-lg border border-zinc-700 bg-[#09090b] p-3 text-xs text-zinc-400">
                        Sistema operativo no soportado para asistentes de alta.
                    </div>
                )}

                <button
                    type="button"
                    disabled={!deployAvailable}
                    className="w-full bg-zinc-800 text-zinc-500 font-bold uppercase tracking-wider text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-70"
                    title={deployReason}
                >
                    <Lock size={16} />
                    <Rocket size={18} /> Preparación pendiente
                </button>
                <p className="text-center text-[11px] text-zinc-500">Cuando exista un flujo seguro, este bloque podrá convertirse en asistente de alta.</p>
            </div>
        </div>
    );
}
