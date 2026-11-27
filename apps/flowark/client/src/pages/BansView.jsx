import { motion } from 'framer-motion';
import { AlertTriangle, Ban, CheckCircle, RefreshCw, ScrollText, Search } from 'lucide-react';
import { MiniStat } from '../components/ui/MiniStat';
import { useDashboard } from '../context/DashboardContext.jsx';

export function BansView() {
  const {
    banSearch,
    setBanSearch,
    bansLoading,
    bansError,
    bans,
    filteredBans,
    activeBans,
    playerActionLoading,
    handleUnban,
    fetchBans
  } = useDashboard();
  const playerActionsBlocked = Boolean(playerActionLoading);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4"
    >
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar md:flex md:flex-col md:overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row md:shrink-0 sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">Gestión de Baneos</h2>
            <p className="mt-1 text-sm text-zinc-500">Ver y gestionar jugadores baneados</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:flex-none">
              <label htmlFor="bans-search" className="sr-only">Buscar baneos</label>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                id="bans-search"
                type="text"
                value={banSearch}
                onChange={e => setBanSearch(e.target.value)}
                placeholder="Buscar baneos..."
                className="min-h-11 w-full rounded-lg border border-zinc-800 bg-[#18181b] pl-9 pr-4 text-sm text-white outline-none transition-colors focus:border-blue-500 sm:min-h-10 sm:w-56"
              />
            </div>
            <button
              type="button"
              onClick={fetchBans}
              disabled={bansLoading}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/[0.08] px-3.5 text-sm text-indigo-400 transition-all hover:bg-indigo-500/[0.12] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10"
              aria-label="Actualizar baneos"
            >
              <RefreshCw size={13} className={bansLoading ? 'animate-spin' : ''} /> Refrescar
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:shrink-0">
          <MiniStat icon={<Ban size={16} className="text-red-400" />} label="Baneos Activos" value={activeBans.length} bg="bg-red-500/10" />
          <MiniStat icon={<ScrollText size={16} className="text-zinc-400" />} label="Total Registros" value={bans.length} bg="bg-gray-500/10" />
        </div>

        <div className="dashboard-card mt-4 flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] md:min-h-0 md:flex-1">
        {bansError && (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-5 py-3 text-sm text-amber-300">
            <AlertTriangle size={15} />
            <span className="flex-1">{bansError}</span>
            <button
              type="button"
              onClick={fetchBans}
              disabled={bansLoading}
              className="text-xs font-semibold text-amber-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bansLoading ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        )}

        {filteredBans.length > 0 && (
          <div className="divide-y divide-zinc-800/70 md:hidden">
            {filteredBans.map((ban, i) => (
              <div key={i} className={`p-4 ${!ban.active ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ban.active ? 'bg-red-500/15' : 'bg-gray-500/15'}`}>
                    {ban.active ? <Ban size={15} className="text-red-400" /> : <CheckCircle size={15} className="text-zinc-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{ban.playerName}</span>
                      {!ban.active && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-400">Desbaneado</span>}
                    </div>
                    <p className="mt-1 break-words text-xs text-zinc-400">{ban.reason}</p>
                    <p className="mt-2 truncate font-mono text-[11px] text-zinc-500">{ban.steamId}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">por {ban.bannedBy} · {new Date(ban.bannedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  {ban.active ? (
                    <button
                      type="button"
                      onClick={() => handleUnban(ban)}
                      disabled={playerActionsBlocked}
                      className="flex min-h-10 items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 text-xs text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Desbanear a ${ban.playerName || ban.steamId}`}
                    >
                      <CheckCircle size={12} /> Desbanear
                    </button>
                  ) : (
                    <span className="text-[10px] text-zinc-600">desbaneado por {ban.unbannedBy}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="hidden min-h-0 flex-1 overflow-x-auto custom-scrollbar md:block overflow-y-auto">
          <div className="min-w-[720px]">
            {filteredBans.length > 0 ? filteredBans.map((ban, i) => (
              <div key={i} className={`flex items-center gap-4 border-b border-zinc-800/50 px-5 py-4 transition-colors hover:bg-[#27272a] ${!ban.active ? 'opacity-40' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ban.active ? 'bg-red-500/15' : 'bg-gray-500/15'}`}>
                  {ban.active ? <Ban size={14} className="text-red-400" /> : <CheckCircle size={14} className="text-zinc-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-medium" title={ban.playerName}>{ban.playerName}</span>
                    {!ban.active && <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] text-cyan-400">Desbaneado</span>}
                  </div>
                  <p className="truncate text-xs text-zinc-500">{ban.reason}</p>
                </div>
                <div className="min-w-0 w-56 shrink-0 text-right">
                  <p className="truncate font-mono text-[11px] text-zinc-500" title={ban.steamId}>{ban.steamId}</p>
                  <p className="mt-0.5 truncate text-[10px] text-zinc-600" title={`por ${ban.bannedBy} · ${new Date(ban.bannedAt).toLocaleDateString()}`}>
                    por {ban.bannedBy} · {new Date(ban.bannedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0">
                  {ban.active ? (
                    <button
                      type="button"
                      onClick={() => handleUnban(ban)}
                      disabled={playerActionsBlocked}
                      className="flex min-h-9 items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 text-xs text-cyan-400 transition-all hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Desbanear a ${ban.playerName || ban.steamId}`}
                    >
                      <CheckCircle size={12} /> Desbanear
                    </button>
                  ) : (
                    <span className="text-[10px] text-zinc-600">por {ban.unbannedBy}</span>
                  )}
                </div>
              </div>
            )) : null}
          </div>
        </div>

        {filteredBans.length === 0 && bansError && !bansLoading ? (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center p-8 text-center text-zinc-600">
            <AlertTriangle size={36} className="mx-auto mb-3 opacity-30 text-amber-400" />
            <p className="mb-1 text-sm font-medium text-amber-200">Baneos no disponibles</p>
            <p className="text-xs text-zinc-600">No se puede confirmar si la lista esta vacia hasta recuperar el backend.</p>
          </div>
        ) : filteredBans.length === 0 && (
          <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center p-8 text-center text-zinc-600">
            <Ban size={36} className="mx-auto mb-3 opacity-20" />
            <p className="mb-1 text-sm font-medium">No hay baneos</p>
            <p className="text-xs text-zinc-600">Los jugadores baneados aparecerán aquí</p>
          </div>
        )}
        </div>
      </div>
    </motion.div>
  );
}
