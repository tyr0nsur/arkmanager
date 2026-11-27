import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Users, Search, RefreshCw, Crown, MessageSquare, UserMinus, Ban, X } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';

const DRAWER_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DESKTOP_PLAYERS_QUERY = '(min-width: 1536px)';

export function GlobalPlayersSidebar({ desktopDocked = true }) {
  const {
    onlinePlayers,
    playersLoading,
    onlinePlayersError,
    playerSearch,
    setPlayerSearch,
    filteredPlayers,
    ingameAdmins,
    handleMessagePlayer,
    handleKickPlayer,
    handleBanPlayer,
    playerActionLoading,
    fetchOnlinePlayers,
    clusterMaps,
    sidebarMapFilter,
    setSidebarMapFilter,
    mobilePlayersOpen,
    setMobilePlayersOpen,
    userRole
  } = useDashboard();
  const canOperate = ['operator', 'owner'].includes(userRole);
  const playerActionsBlocked = Boolean(playerActionLoading) || playersLoading || Boolean(onlinePlayersError);
  const [desktopPlayersVisible, setDesktopPlayersVisible] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_PLAYERS_QUERY).matches
  ));
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const desktopDockedClasses = desktopDocked
    ? '2xl:relative 2xl:inset-auto 2xl:z-40 2xl:flex 2xl:h-full 2xl:max-h-full 2xl:min-h-0 2xl:w-[320px] 2xl:self-stretch 2xl:translate-x-0 2xl:border 2xl:border-zinc-800/50 2xl:rounded-xl 2xl:bg-transparent 2xl:shadow-none'
    : '';
  const closeButtonClasses = desktopDocked
    ? 'flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white 2xl:hidden'
    : 'flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white';
  const drawerInactive = !mobilePlayersOpen && !(desktopDocked && desktopPlayersVisible);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_PLAYERS_QUERY);
    const handleChange = event => setDesktopPlayersVisible(event.matches);
    setDesktopPlayersVisible(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!mobilePlayersOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setMobilePlayersOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = Array.from(drawerRef.current?.querySelectorAll(DRAWER_FOCUSABLE_SELECTOR) || [])
        .filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
      if (focusableElements.length === 0) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousFocusRef.current?.focus?.({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [mobilePlayersOpen, setMobilePlayersOpen]);

  if (!canOperate) return null;

  return (
    <>
      {/* Mobile Overlay */}
      {mobilePlayersOpen && (
        <div
          className={`fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm ${desktopDocked ? '2xl:hidden' : ''}`}
          onClick={() => setMobilePlayersOpen(false)}
        />
      )}

      <div
        id="players-navigation-drawer"
        ref={drawerRef}
        role={mobilePlayersOpen ? 'dialog' : undefined}
        aria-modal={mobilePlayersOpen ? 'true' : undefined}
        aria-labelledby="players-sidebar-title"
        aria-hidden={drawerInactive ? 'true' : undefined}
        inert={drawerInactive ? '' : undefined}
        tabIndex={mobilePlayersOpen ? -1 : undefined}
        className={`fixed inset-y-0 right-0 z-[100] flex h-full w-[min(320px,calc(100vw-1rem))] shrink-0 flex-col overflow-hidden border-l border-zinc-800/50 bg-[#18181b] shadow-2xl transition-transform duration-300 ease-in-out ${desktopDockedClasses} ${drawerInactive ? 'pointer-events-none' : ''} ${mobilePlayersOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="shrink-0 p-4 border-b border-zinc-800 flex flex-col gap-3 bg-[#09090b]">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="relative flex h-3 w-3">
                      {onlinePlayers.length > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>}
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                    </div>
                    <h3 id="players-sidebar-title" className="font-semibold text-sm">Conectados ({onlinePlayers.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                    {playersLoading && (
                        <RefreshCw size={14} className="animate-spin text-cyan-400" />
                    )}
                    <button
                        type="button"
                        onClick={() => setMobilePlayersOpen(false)}
                        className={closeButtonClasses}
                        aria-label="Cerrar panel de jugadores"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <label htmlFor="connected-players-map-filter" className="sr-only">Filtrar jugadores conectados por servidor</label>
            <select
                id="connected-players-map-filter"
                value={sidebarMapFilter}
                onChange={e => setSidebarMapFilter(e.target.value)}
                className="w-full bg-[#18181b] border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
            >
                <option value="all">Todos los Servidores</option>
                {clusterMaps && clusterMaps.map(map => (
                    <option key={map.id} value={map.id}>{map.name}</option>
                ))}
            </select>
        </div>

        <div className="shrink-0 p-3 border-b border-zinc-800 bg-[#09090b]">
            <div className="relative">
                <label htmlFor="connected-players-search" className="sr-only">Buscar jugador conectado</label>
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                    id="connected-players-search"
                    type="text"
                    value={playerSearch}
                    onChange={e => setPlayerSearch(e.target.value)}
                    placeholder="Buscar conectado..."
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-cyan-500"
                />
            </div>
        </div>

		        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 bg-[#18181b]">
	            {onlinePlayersError && (
	                <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
	                    <div className="flex items-start gap-2">
	                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300" />
	                        <div className="min-w-0">
	                            <p className="font-semibold">Jugadores no disponibles</p>
	                            <p className="mt-0.5 break-words text-amber-100/80">{onlinePlayersError}</p>
	                            <button
	                                type="button"
	                                onClick={fetchOnlinePlayers}
	                                disabled={playersLoading}
	                                className="mt-2 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
	                            >
	                                <RefreshCw size={13} className={playersLoading ? 'animate-spin' : ''} />
	                                {playersLoading ? 'Reintentando...' : 'Reintentar'}
	                            </button>
	                        </div>
	                    </div>
	                </div>
	            )}
	            {filteredPlayers.length > 0 ? filteredPlayers.map((player, i) => {
                const isAdmin = ingameAdmins.includes(player.steamId);
                return (
                <div key={i} className="flex flex-col gap-2 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors mb-1 group border border-transparent hover:border-zinc-700/50">
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col w-full">
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-sm text-zinc-200 truncate max-w-[130px]">{player.name}</span>
                                    {isAdmin && <Crown size={12} className="text-yellow-500" title="In-Game Admin" />}
                                </div>
                                {sidebarMapFilter === 'all' && player.mapName && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[80px]" title={player.mapName}>
                                        {player.mapName}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className="font-mono text-[10px] text-zinc-500">{player.steamId}</span>
                            </div>
                        </div>
                    </div>

                    {canOperate && <div className="grid grid-cols-3 gap-1 mt-1 opacity-100 md:opacity-50 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleMessagePlayer(player)} disabled={playerActionsBlocked} className="flex min-h-10 justify-center items-center rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:min-h-8" title="Mensaje" aria-label={`Enviar mensaje a ${player.name}`}>
                            <MessageSquare size={14} />
                        </button>
                        <button onClick={() => handleKickPlayer(player)} disabled={playerActionsBlocked} className="flex min-h-10 justify-center items-center rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:min-h-8" title="Kick" aria-label={`Expulsar a ${player.name}`}>
                            <UserMinus size={14} />
                        </button>
                        <button onClick={() => handleBanPlayer(player)} disabled={playerActionsBlocked} className="flex min-h-10 justify-center items-center rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:min-h-8" title="Ban" aria-label={`Banear a ${player.name}`}>
                            <Ban size={14} />
                        </button>
                    </div>}
                </div>
	            )}) : onlinePlayersError ? (
	                <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
	                    <AlertTriangle size={24} className="mb-2 opacity-30" />
	                    <span className="text-xs text-amber-200">No se pudo consultar la presencia online</span>
	                    <button
	                        type="button"
	                        onClick={fetchOnlinePlayers}
	                        disabled={playersLoading}
	                        className="mt-3 inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-amber-400/30 px-3 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-400/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
	                    >
	                        <RefreshCw size={13} className={playersLoading ? 'animate-spin' : ''} />
	                        {playersLoading ? 'Reintentando...' : 'Reintentar'}
	                    </button>
	                </div>
	            ) : (
	                <div className="flex flex-col items-center justify-center h-40 text-zinc-600">
                    <Users size={24} className="mb-2 opacity-20" />
                    <span className="text-xs">{playersLoading ? 'Cargando...' : 'Nadie en línea'}</span>
                </div>
            )}
        </div>
      </div>
    </>
  );
}
