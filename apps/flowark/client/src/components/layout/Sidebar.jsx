import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, Layers, RefreshCw, X } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { dashboardNavSectionsForRole } from '../../constants/dashboard';
import { useServerCapabilities } from '../../hooks/useServerCapabilities.js';
import { TabButton } from '../ui/TabButton.jsx';

const DRAWER_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const DESKTOP_NAV_QUERY = '(min-width: 1280px)';

export function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    clusterStatus,
    liveData,
    liveDataStale,
    clusterMaps,
    clusterMapsError,
    selectedMap,
    setSelectedMap,
    setSettingsLoaded,
    setChartData,
    mobileNavOpen,
    setMobileNavOpen,
    powerLoading,
    sendPowerAction,
    userRole
  } = useDashboard();

  const [mapSelectorOpen, setMapSelectorOpen] = useState(false);
  const [desktopNavVisible, setDesktopNavVisible] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(DESKTOP_NAV_QUERY).matches
  ));
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);
  const canOwn = userRole === 'owner';
  const capabilities = useServerCapabilities(canOwn ? selectedMap : '');
  const lifecycleAvailable = capabilities.data?.actions?.start === true && capabilities.data?.actions?.stop === true && capabilities.data?.actions?.restart === true;
  const panelNavSections = dashboardNavSectionsForRole(userRole);
  const hasSelectedMap = Boolean(selectedMap);
  const hasClusterMaps = clusterMaps.length > 0;
  const singleMapActionDisabled = !!powerLoading || !hasSelectedMap || !lifecycleAvailable;
  const drawerInactive = !mobileNavOpen && !desktopNavVisible;

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_NAV_QUERY);
    const handleChange = event => setDesktopNavVisible(event.matches);
    setDesktopNavVisible(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
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
  }, [mobileNavOpen, setMobileNavOpen]);

  return (
    <>
      {/* Mobile Overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[90] xl:hidden backdrop-blur-sm"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar Content */}
      <div
        id="server-navigation-drawer"
        ref={drawerRef}
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? 'true' : undefined}
        aria-labelledby="server-sidebar-title"
        aria-hidden={drawerInactive ? 'true' : undefined}
        inert={drawerInactive ? '' : undefined}
        tabIndex={mobileNavOpen ? -1 : undefined}
        className={`fixed inset-y-0 left-0 z-[100] w-[min(260px,calc(100vw-1rem))] bg-[#09090b] xl:bg-transparent p-4 xl:p-0 flex flex-col gap-4 overflow-y-auto shrink-0 transition-transform duration-300 ease-in-out xl:relative xl:w-[260px] xl:translate-x-0 border-r border-zinc-800/50 xl:border-none shadow-2xl xl:shadow-none ${drawerInactive ? 'pointer-events-none' : ''} ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >

        {/* Main Server Menu Card */}
        <div className="relative z-10 flex shrink-0 flex-col overflow-visible rounded-xl border border-zinc-800/50 bg-[#18181b]">
            <div className="p-4 bg-[#09090b] border-b border-zinc-800/50">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="server-sidebar-title" className="font-semibold text-zinc-200 text-sm">Mapa seleccionado</h2>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white xl:hidden"
                  aria-label="Cerrar navegación de servidor"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Map Selector */}
              <div className="relative z-20">
                  <button
                  onClick={() => setMapSelectorOpen(!mapSelectorOpen)}
                  aria-haspopup="listbox"
                  aria-expanded={mapSelectorOpen}
                  aria-controls="server-map-selector-list"
                  className="w-full flex items-center justify-between bg-zinc-800/50 border border-white/[0.05] rounded-xl px-3.5 py-2.5 hover:border-zinc-600 transition-all duration-200 group"
                  >
                  <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="text-[13px] font-semibold truncate w-full text-left text-white/90 group-hover:text-cyan-400 transition-colors">
                      {clusterMaps.find(m => m.id === selectedMap)?.name || selectedMap || 'Sin mapa seleccionado'}
                      </span>
                      {clusterMapsError && (
                        <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-300">
                          <AlertTriangle size={10} />
                          Mapas no disponibles
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${!liveDataStale && liveData.status === 'online' ? 'status-online' : 'status-offline'}`}></div>
                      <ChevronDown size={13} className={`text-zinc-600 transition-transform duration-200 ${mapSelectorOpen ? 'rotate-180' : ''}`} />
                  </div>
                  </button>
                  <AnimatePresence>
                  {mapSelectorOpen && (
                      <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      id="server-map-selector-list"
                      role="listbox"
                      aria-label="Seleccionar mapa activo"
                      className="absolute left-0 right-0 top-full z-[120] mt-1.5 max-h-[min(50dvh,20rem)] overflow-y-auto rounded-xl border border-zinc-800 bg-[#18181b] shadow-xl shadow-black/20 custom-scrollbar"
                      >
                      {clusterMaps.map(map => {
                          const mapStatus = clusterStatus.maps?.find(m => m.id === map.id);
                          return (
                          <button
                              key={map.id}
                              onClick={() => { setSelectedMap(map.id); setMapSelectorOpen(false); setSettingsLoaded(false); setChartData([]); setMobileNavOpen(false); }}
                              role="option"
                              aria-selected={selectedMap === map.id}
                              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-zinc-800 transition-colors ${
                              selectedMap === map.id ? 'bg-cyan-500/[0.06] border-l-2 border-cyan-500/30' : 'border-l-2 border-transparent'
                              }`}
                          >
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${mapStatus?.status === 'online' ? 'bg-cyan-400' : 'bg-red-400'}`}></div>
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-400" title={map.name}>{map.name}</span>
                              <span className="shrink-0 text-[10px] text-zinc-600 font-mono">{mapStatus?.players || 0}p</span>
                          </button>
                          );
                      })}
                      {clusterMaps.length === 0 && (
                          <div className="px-3.5 py-3 text-xs text-zinc-500">
                              {clusterMapsError || 'No hay mapas configurados.'}
                          </div>
                      )}
                      </motion.div>
                  )}
                  </AnimatePresence>
              </div>
            </div>

            <nav className="flex flex-col gap-4 border-b border-zinc-800/50 p-3" aria-label="Navegación del panel">
              {panelNavSections.map(section => (
                <div key={section.id} className="flex flex-col gap-1">
                  <h3 className="px-2 pb-1 text-xs font-medium text-zinc-400">{section.shortLabel}</h3>
                  {section.items.map(item => {
                    const Icon = item.Icon;
                    return <TabButton key={item.id} icon={<Icon size={16}/>} label={item.label} isActive={activeTab === item.id} onClick={() => { setActiveTab(item.id); setMobileNavOpen(false); }} />;
                  })}
                </div>
              ))}
            </nav>

            {/* Power Controls & Info Panel (txAdmin Style) */}
            <div className="p-3 bg-[#18181b] flex flex-col gap-3">
                  <div className="space-y-2 mt-1 mb-2 bg-[#09090b] p-3 rounded-lg border border-zinc-800/50">
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-zinc-400">Estado</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${!liveDataStale && liveData?.status === 'online' ? 'bg-cyan-500/20 text-cyan-400' : liveDataStale ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-400'}`}>
                              {liveDataStale ? 'DESCONOCIDO' : (liveData?.status || 'OFFLINE')}
                          </span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-zinc-400">Jugadores</span>
                          <span className="font-mono text-[11px] font-bold text-zinc-300">
                              {liveData?.players || 0} / {liveData?.maxPlayers || 0}
                          </span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-zinc-400">Mapa</span>
                          <span className="font-medium text-[11px] text-zinc-300 truncate max-w-[120px]">
                              {liveData?.map || selectedMap || 'Sin mapa'}
                          </span>
                      </div>
                  </div>

                  {canOwn && <div className="space-y-2 mt-2" aria-label="Controles de ciclo de vida del servidor">
                      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Acciones del Servidor</p>
                      {!lifecycleAvailable && <p className="px-1 text-xs text-amber-200">Ciclo de vida sin configurar para esta instancia.</p>}
                      <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-2">
                              <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">{liveData?.status === 'online' ? 'Encendido' : 'Apagado'}</span>
                              <button
                                  onClick={() => sendPowerAction(liveData?.status === 'online' ? 'stop' : 'start', selectedMap)}
                                  disabled={singleMapActionDisabled || (liveData?.status === 'online' && powerLoading === `stop-${selectedMap}`) || (liveData?.status !== 'online' && powerLoading === `start-${selectedMap}`)}
                                  className={`relative inline-flex min-h-11 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${liveData?.status === 'online' ? 'bg-cyan-500' : 'bg-zinc-600'}`}
                                  aria-label={liveData?.status === 'online' ? 'Detener mapa seleccionado' : 'Arrancar mapa seleccionado'}
                                  title="Arrancar / Detener mapa"
                              >
                                  <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${liveData?.status === 'online' ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                          </div>

                          <button
                              onClick={() => sendPowerAction('restart', selectedMap)}
                              disabled={singleMapActionDisabled || liveData?.status !== 'online'}
                              className="group relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-2 py-2 text-[10px] font-semibold text-zinc-300 transition-all hover:bg-zinc-700/60 disabled:cursor-not-allowed disabled:opacity-30 md:min-h-10"
                              title="Reiniciar mapa seleccionado"
                              aria-label="Reiniciar mapa seleccionado"
                          >
                              {powerLoading === `restart-${selectedMap}` ? <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" /> : <RefreshCw size={16} className={liveData?.status === 'online' ? "group-hover:text-yellow-400 transition-colors" : ""} />}
                              <span>Reiniciar</span>
                          </button>

                          <button
                              onClick={() => sendPowerAction('restart', 'all')}
                              disabled={!!powerLoading || !hasClusterMaps || !lifecycleAvailable}
                              className="group relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2 py-2 text-[10px] font-semibold text-purple-300 transition-all hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-30 md:min-h-10"
                              title="Reiniciar clúster completo"
                              aria-label="Reiniciar cluster completo"
                          >
                              {powerLoading === 'restart-all' ? <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" /> : <Layers size={16} className="group-hover:text-purple-300 transition-colors" />}
                              <span>R. Todos</span>
                          </button>
                      </div>
                  </div>}
            </div>
        </div>

        {/* Cluster Status Card */}
        <div className="bg-[#18181b] border border-zinc-800/50 rounded-xl p-4 shrink-0">
            <h3 className="text-zinc-400 text-xs font-semibold mb-3">ESTADO DEL CLÚSTER</h3>
            <div className="flex flex-col gap-2">
                {clusterMaps.map(m => {
                    const mapStatus = clusterStatus.maps?.find(status => status.id === m.id);
                    const isOnline = mapStatus?.status === 'online';
                    return (
                        <div key={m.id} className="flex justify-between items-center bg-zinc-800/30 px-3 py-2 rounded border border-zinc-800/50">
                            <span className="text-xs text-zinc-300">{m.name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${isOnline ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-400'}`}>
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>
    </>
  );
}
