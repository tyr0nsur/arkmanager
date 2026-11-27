import { motion } from 'framer-motion';
import { Activity, Users, MonitorCog, HardDrive, CircleDot, ChevronRight, Globe, AlertTriangle, Server, Hash } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { ResourceGauge } from '../components/charts/ResourceGauge.jsx';
import { ResourceLegend, ResourceTrendChart } from '../components/charts/ResourceTrendChart.jsx';
import { useDashboard } from '../context/DashboardContext.jsx';

export function ServerDashboard() {
  const { clusterMaps, selectedMap, liveData, liveDataError, liveDataStale, chartData, setActiveTab, userRole } = useDashboard();
  const canOperate = ['operator', 'owner'].includes(userRole);
  const selectedMapConfig = clusterMaps.find(m => m.id === selectedMap);
  const statusValue = liveDataStale ? 'DESCONOCIDO' : liveData.status.toUpperCase();
  const occupancy = liveData.maxPlayers ? Math.round(((liveData.players || 0) / liveData.maxPlayers) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4"
    >
      <div className="flex shrink-0 justify-between items-center">
          <div>
              <h2 className="text-2xl font-bold text-white">{liveData.serverName || selectedMapConfig?.name || selectedMap}</h2>
              <p className="text-sm text-zinc-500 mt-1">Instancia activa: <span className="text-zinc-300">{selectedMapConfig?.name || selectedMap}</span></p>
          </div>
      </div>

      {(liveDataError || liveDataStale) && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <span>Telemetría del mapa sin actualizar: {liveDataError || 'última lectura demasiado antigua'}</span>
          </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-6 custom-scrollbar">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:col-span-2 xl:grid-cols-1">
              <StatCard title="Estado" value={statusValue} icon={<Activity size={18}/>} color={!liveDataStale && liveData.status === 'online' ? 'text-cyan-400' : liveDataStale ? 'text-amber-300' : 'text-red-400'} iconBg={!liveDataStale && liveData.status === 'online' ? 'bg-cyan-500/10' : liveDataStale ? 'bg-amber-500/10' : 'bg-red-500/10'} />
              <StatCard title="Jugadores" value={`${liveData.players} / ${liveData.maxPlayers}`} icon={<Users size={18}/>} iconBg="bg-indigo-500/[0.08]" />
          </div>

          {canOperate && <>
              <ResourceGauge title="CPU proceso" value={liveData.cpu || 0} colorClass="text-purple-400" color="#c084fc" icon={<MonitorCog size={16}/>} />
              <ResourceGauge title="RAM proceso" value={liveData.ram || 0} colorClass="text-amber-400" color="#fbbf24" icon={<HardDrive size={16}/>} />
          </>}
          <div className="dashboard-card col-span-2 grid gap-3 rounded-lg border border-zinc-800 bg-[#18181b] p-4 shadow-sm sm:grid-cols-3 xl:col-span-2">
              <div className="min-w-0 rounded-lg bg-[#09090b] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Hash size={12} /> ID</p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-200">{selectedMap || 'Sin mapa'}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-[#09090b] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Globe size={12} /> Mapa</p>
                  <p className="mt-1 truncate text-sm font-semibold text-zinc-200">{liveData.map || selectedMapConfig?.name || 'Desconocido'}</p>
              </div>
              <div className="min-w-0 rounded-lg bg-[#09090b] p-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500"><Server size={12} /> Ocupación</p>
                  <p className="mt-1 text-sm font-semibold text-zinc-200">{occupancy}%</p>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Chart */}
          {canOperate && <div className="dashboard-card rounded-lg border border-zinc-800 bg-[#18181b] p-4 shadow-sm xl:col-span-2">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-semibold text-zinc-400">Recursos de instancia</h3>
                  <ResourceLegend compact />
              </div>
              <div className="h-[min(30dvh,240px)] min-h-[170px] w-full">
                  <ResourceTrendChart data={chartData} mode="line" />
              </div>
          </div>}

          {/* Online Players Widget */}
          <div className="dashboard-card flex min-h-[240px] flex-col rounded-lg border border-zinc-800 bg-[#18181b] p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-zinc-400">Jugadores Conectados</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${liveData.players > 0 ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'bg-gray-500/15 text-zinc-400 border border-gray-500/20'}`}>{liveData.players} online</span>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto custom-scrollbar">
                  {!canOperate ? (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                          <Users size={28} className="mb-2 opacity-30" />
                          <p className="text-xs">Detalle de jugadores restringido</p>
                      </div>
                  ) : liveData.playerList.length > 0 ? liveData.playerList.map((p, i) => (
                      <div key={i} className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-[#09090b] border border-zinc-800/50 hover:border-zinc-700 transition-colors">
                          <CircleDot size={10} className="text-cyan-400 shrink-0" />
                          <span className="text-sm text-zinc-400 truncate">{p.name || `Jugador ${i+1}`}</span>
                      </div>
                  )) : (
                      <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                          <Users size={28} className="mb-2 opacity-30" />
                          <p className="text-xs">No hay jugadores conectados</p>
                      </div>
                  )}
              </div>
              {canOperate && liveData.playerList.length > 10 && (
                  <button onClick={() => setActiveTab('players')} className="mt-3 w-full text-center text-xs text-indigo-400 hover:text-blue-300 py-2 transition-colors flex items-center justify-center gap-1 border-t border-zinc-800/50 pt-3">
                      Ver los {liveData.playerList.length} jugadores <ChevronRight size={12} />
                  </button>
              )}
          </div>
      </div>

      {liveData.map !== 'Unknown' && (
          <motion.div
            whileHover={{ scale: 1.01 }}
            className="dashboard-card flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#18181b] p-4 shadow-sm"
          >
              <Globe size={16} className="text-indigo-400" />
              <span className="text-sm text-zinc-400">Mapa Actual:</span>
              <span className="text-sm font-medium text-indigo-400">{liveData.map}</span>
          </motion.div>
      )}
      </div>
    </motion.div>
  );
}
