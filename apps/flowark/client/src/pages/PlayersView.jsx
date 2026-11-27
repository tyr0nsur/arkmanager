import { useMemo, useState } from 'react';
import { Users, Search, RefreshCw, Copy, Ban, UserMinus, MessageSquare, Crown } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { useServerCapabilities } from '../hooks/useServerCapabilities.js';

const actionButton = 'inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-300 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-35';
const identifier = player => String(player?.steamId ?? player?.nativeId ?? '');

export function PlayersView() {
  const { onlinePlayers, playerHistory, playersLoading, onlinePlayersError, historyLoading, historyError,
    playerActionLoading, fetchOnlinePlayers, fetchPlayerHistory, copyToClipboard,
    handleKickPlayer, handleBanPlayer, handleMessagePlayer, handleMakeAdmin, handleRemoveAdmin,
    ingameAdmins, userRole, selectedMap, clusterMaps, sidebarMapFilter } = useDashboard();
  const [search, setSearch] = useState('');
  const [view, setView] = useState('online');
  const capabilities = useServerCapabilities(selectedMap);
  const actions = capabilities.data?.actions || {};
  const inMap = useMemo(() => onlinePlayers.filter(player => player.mapId === selectedMap), [onlinePlayers, selectedMap]);
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    const source = view === 'online' ? inMap : [...(playerHistory || [])].sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    return source.filter(player => !term || `${player.name || ''} ${identifier(player)}`.toLocaleLowerCase('es').includes(term));
  }, [search, view, inMap, playerHistory]);
  const mapName = clusterMaps.find(map => map.id === selectedMap)?.name || selectedMap;
  const blocked = Boolean(playerActionLoading) || playersLoading || Boolean(onlinePlayersError);
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Sin registro';

  return <section className="flex h-full min-h-0 w-full flex-col overflow-y-auto pb-5 custom-scrollbar">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs uppercase tracking-widest text-cyan-400">Operación por instancia</p><h1 className="mt-2 text-3xl font-semibold">Jugadores</h1><p className="mt-2 text-sm text-zinc-400">{mapName ? `Mapa objetivo: ${mapName}` : 'Selecciona un mapa para operar.'}</p></div>
      <button className={actionButton} disabled={playersLoading || historyLoading} onClick={() => { fetchOnlinePlayers(); fetchPlayerHistory(); }}><RefreshCw size={15} className={playersLoading || historyLoading ? 'animate-spin' : ''} />Actualizar</button>
    </header>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"><p className="text-xs text-zinc-500">Sesiones observadas en el mapa</p><p className="mt-2 text-2xl font-semibold text-cyan-300">{onlinePlayersError ? 'Sin censo completo' : inMap.length}</p></div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"><p className="text-xs text-zinc-500">Historial del panel</p><p className="mt-2 text-2xl font-semibold">{(playerHistory || []).length}</p></div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"><p className="text-xs text-zinc-500">Transporte de gestión</p><p className="mt-2 text-sm text-zinc-300">{capabilities.data?.transport?.rcon?.configured ? 'RCON configurado · alcance sin comprobar' : 'RCON no disponible'}</p></div>
    </div>
    <p className="mb-4 rounded-lg border border-zinc-800 p-3 text-xs leading-5 text-zinc-400">El identificador recibido por RCON es un dato observado. La autenticación Steam/Epic y la concesión nativa de admin siguen pendientes de validar. El historial conserva la última observación y puede incluir jugadores desconectados.</p>
    {(onlinePlayersError || historyError || capabilities.error) && <p role="alert" className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-200">{[onlinePlayersError, historyError, capabilities.error].filter(Boolean).join(' ')}</p>}
    {sidebarMapFilter !== 'all' && sidebarMapFilter !== selectedMap && <p className="mb-4 text-sm text-amber-200">El filtro global de jugadores apunta a otro mapa. Cámbialo a todos los mapas para consultar esta instancia.</p>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">{[['online', 'Sesiones del mapa'], ['history', 'Historial']].map(([id, label]) => <button key={id} aria-pressed={view === id} onClick={() => setView(id)} className={`${actionButton} ${view === id ? 'border-cyan-500 text-cyan-200' : ''}`}>{label}</button>)}</div>
      <label className="relative"><span className="sr-only">Buscar jugador por nombre o ID</span><Search size={15} className="absolute left-3 top-3 text-zinc-500" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o ID observado" className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 pl-9 pr-3 text-sm" /></label>
    </div>
    <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#131316]">
      <table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-zinc-800 text-xs text-zinc-500"><tr><th className="p-4">Jugador</th><th className="p-4">ID observado</th><th className="p-4">Presencia / última lectura</th><th className="p-4 text-right">Acciones en {mapName || 'mapa'}</th></tr></thead>
        <tbody className="divide-y divide-zinc-800">{rows.map((player, index) => {
          const id = identifier(player);
          const session = inMap.find(candidate => identifier(candidate) === id);
          const target = session || { ...player, mapId: selectedMap };
          const presenceKnown = !onlinePlayersError && !playersLoading;
          // A numeric native ID alone is not sufficient proof of a Steam account.
          const adminEligible = userRole === 'owner' && actions.admin && player.identity_verified === true && player.provider === 'steam';
          const isAdmin = ingameAdmins.includes(id);
          return <tr key={`${id}-${index}`} className="hover:bg-zinc-800/25"><td className="p-4 font-medium">{player.name || 'Sin nombre'}</td><td className="p-4"><button className="inline-flex min-h-10 max-w-52 items-center gap-2 text-left font-mono text-xs text-zinc-400" onClick={() => copyToClipboard(id)} aria-label={`Copiar ID de ${player.name || 'jugador'}`}><span className="truncate">{id || 'No disponible'}</span><Copy size={13} className="shrink-0" /></button></td><td className="p-4 text-xs"><span className={session ? 'text-cyan-300' : 'text-zinc-400'}>{session ? 'Observado en este mapa' : presenceKnown ? 'Sin sesión observada en este mapa' : 'Lectura pendiente o incompleta'}</span>{view === 'history' && <p className="mt-2 text-zinc-500">{date(player.lastSeen)}</p>}</td><td className="p-4"><div className="flex justify-end gap-2"><button className={actionButton} title="Enviar mensaje" aria-label={`Mensaje a ${player.name}`} disabled={blocked || !session || !actions.message} onClick={() => handleMessagePlayer(target)}><MessageSquare size={14} /></button><button className={actionButton} title="Expulsar" aria-label={`Expulsar a ${player.name}`} disabled={blocked || !session || !actions.kick} onClick={() => handleKickPlayer(target)}><UserMinus size={14} /></button><button className={actionButton} title="Banear en este mapa" aria-label={`Banear a ${player.name}`} disabled={blocked || !session || !actions.ban} onClick={() => handleBanPlayer(target)}><Ban size={14} /></button><button className={actionButton} title={adminEligible ? 'Modificar allowlist Steam; puede requerir reinicio' : 'Requiere identidad Steam verificada y permiso de propietario'} aria-label={`Allowlist de admin de ${player.name}`} disabled={blocked || !adminEligible} onClick={() => isAdmin ? handleRemoveAdmin(target) : handleMakeAdmin(target)}><Crown size={14} /></button></div></td></tr>;
        })}</tbody></table>
      {!rows.length && <div className="flex flex-col items-center gap-3 p-10 text-center text-zinc-500"><Users size={24} /><p className="text-sm">{playersLoading || historyLoading ? 'Consultando jugadores…' : view === 'online' ? 'Sin sesiones observadas en esta lectura.' : 'No hay jugadores que coincidan.'}</p></div>}
    </div>
  </section>;
}
