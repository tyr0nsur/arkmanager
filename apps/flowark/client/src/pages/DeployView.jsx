import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AppWindow, MonitorPlay, RefreshCw, ServerCog } from 'lucide-react';
import { NewServerForm } from '../components/deployer/NewServerForm';
import { MaintenanceTools } from '../components/deployer/MaintenanceTools';
import { NodesList } from '../components/deployer/NodesList';
import { WipeTools } from '../components/deployer/WipeTools';
import { NativeOrchestratorPanel } from '../components/deployer/NativeOrchestratorPanel';
import { useDashboard } from '../context/DashboardContext.jsx';

const API_BASE = '/api';

export function DeployView() {
  const { userPermissions } = useDashboard();
  const [capabilities, setCapabilities] = useState(null);
  const [capabilitiesError, setCapabilitiesError] = useState('');
  const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
  const [deployTab, setDeployTab] = useState('operations');
  const capabilitiesRequestRef = useRef(null);
  const maintenanceCapabilities = capabilities?.maintenance || {};
  const maintenanceEntries = Object.values(maintenanceCapabilities);
  const availableMaintenanceCount = maintenanceEntries.filter(capability => capability?.available === true).length;
  const blockedMaintenanceCount = maintenanceEntries.filter(capability => capability?.available !== true).length;
  const deployAvailable = capabilities?.deployStart?.available === true;
  const host = capabilities?.host || {};
  const hostFamily = host.family || 'unknown';
  const hostLabel = host.label || 'Detectando';
  const currentTarget = capabilities?.deploymentTargets?.[hostFamily];
  const runtimeLabel = currentTarget?.runtime || (hostFamily === 'linux' ? 'Obelisk' : (hostFamily === 'windows' ? 'ArkApi' : 'No definido'));
  const HostIcon = hostFamily === 'windows' ? AppWindow : MonitorPlay;

  const fetchCapabilities = useCallback(async () => {
    capabilitiesRequestRef.current?.abort();
    const controller = new AbortController();
    capabilitiesRequestRef.current = controller;
    setCapabilitiesLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/deploy/capabilities`, { signal: controller.signal });
      if (capabilitiesRequestRef.current !== controller) return;
      setCapabilities(res.data.capabilities || null);
      setCapabilitiesError('');
    } catch (err) {
      if (err.name === 'CanceledError' || axios.isCancel?.(err)) return;
      if (capabilitiesRequestRef.current !== controller) return;
      setCapabilities(null);
      setCapabilitiesError(err.response?.data?.error || 'No se pudieron cargar las capacidades de despliegue');
    } finally {
      if (capabilitiesRequestRef.current === controller) {
        capabilitiesRequestRef.current = null;
        setCapabilitiesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchCapabilities();
    return () => {
      capabilitiesRequestRef.current?.abort();
      capabilitiesRequestRef.current = null;
    };
  }, [fetchCapabilities]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4">

      {/* Header */}
      <div className="dashboard-card flex shrink-0 flex-col gap-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ServerCog className="text-cyan-400" />
            Mantenimiento y nodos
          </h2>
          <p className="text-zinc-300 mt-2 text-sm max-w-2xl">
            Operaciones filtradas por sistema operativo y capacidades reales del backend.
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-3 rounded-lg border border-cyan-400/20 bg-[#09090b]/70 px-3 py-2">
          <HostIcon size={18} className="shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/70">Host activo</p>
            <p className="truncate text-sm font-semibold text-white">{hostLabel} · {runtimeLabel}</p>
          </div>
        </div>
      </div>

      {capabilitiesError && (
        <div className="flex shrink-0 flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 break-words">{capabilitiesError}</span>
          <button
            type="button"
            onClick={fetchCapabilities}
            disabled={capabilitiesLoading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-400/30 px-3 text-xs font-semibold text-red-100 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={13} className={capabilitiesLoading ? 'animate-spin' : ''} />
            {capabilitiesLoading ? 'Reintentando...' : 'Reintentar'}
          </button>
        </div>
      )}

      {capabilitiesLoading && !capabilitiesError && (
        <div className="shrink-0 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          Cargando capacidades de despliegue...
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar">
        <div className="mb-4 flex w-full overflow-x-auto rounded-lg border border-zinc-800 bg-[#18181b] p-1 no-scrollbar" role="tablist" aria-label="Secciones del deployer">
          {[
            { id: 'operations', label: 'Operación' },
            { id: 'wipe', label: 'Wipe' },
            { id: 'orchestrator', label: 'Orquestador' },
            { id: 'future', label: 'Despliegue futuro' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={deployTab === tab.id}
              onClick={() => setDeployTab(tab.id)}
              className={`min-h-10 shrink-0 rounded-md px-4 text-sm font-semibold transition-colors ${deployTab === tab.id ? 'bg-cyan-500 text-[#09090b]' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen de capacidades de despliegue">
          <div className="rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Alta automática</p>
            <p className={`mt-2 text-sm font-semibold ${deployAvailable ? 'text-emerald-300' : 'text-zinc-300'}`}>{deployAvailable ? 'Disponible' : 'Bloqueada'}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Sistema operativo</p>
            <p className="mt-2 text-sm font-semibold text-cyan-200">{hostLabel}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Mantenimiento activo</p>
            <p className="mt-2 text-sm font-semibold text-emerald-300">{availableMaintenanceCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Bloqueado por backend</p>
            <p className="mt-2 text-sm font-semibold text-amber-300">{blockedMaintenanceCount}</p>
          </div>
        </section>

        {deployTab === 'operations' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6" role="tabpanel">
            <div className="space-y-4 lg:col-span-2">
              <section className="min-w-0">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Acciones disponibles</h3>
                <MaintenanceTools capabilities={capabilities} hostFamily={hostFamily} />
              </section>
            </div>

            <section className="min-w-0">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-500">Inventario</h3>
              <NodesList />
            </section>
          </div>
        )}

        {deployTab === 'wipe' && (
          <section className="min-w-0" role="tabpanel">
            <WipeTools capabilities={capabilities} userPermissions={userPermissions} />
          </section>
        )}

        {deployTab === 'orchestrator' && (
          <section className="min-w-0" role="tabpanel">
            <NativeOrchestratorPanel capabilities={capabilities} hostFamily={hostFamily} />
          </section>
        )}

        {deployTab === 'future' && (
          <section className="min-w-0" role="tabpanel">
            <NewServerForm capabilities={capabilities} hostFamily={hostFamily} />
          </section>
        )}
      </div>
    </div>
  );
}
