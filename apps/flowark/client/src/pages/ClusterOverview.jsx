import '../features/monitor/monitor.css';
import { RefreshCw, Layers, Radio, ArrowUpRight } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext.jsx';
import { useClusterMonitor } from '../features/monitor/useClusterMonitor.js';
import { MapMonitorRow } from '../features/monitor/MapMonitorRow.jsx';
import { MonitorActivity } from '../features/monitor/MonitorActivity.jsx';
import { monitorStatus } from '../features/monitor/format.js';

export function ClusterOverview() {
  const { clusterMaps, clusterMapsError, clusterStatus, clusterStatusError, fetchClusterStatus, userRole, setSelectedMap, setActiveTab, setSettingsLoaded, setChartData } = useDashboard();
  const { snapshot, connection, now, reconnect } = useClusterMonitor();
  const canOperate = ['operator', 'owner'].includes(userRole);
  const canOwn = userRole === 'owner';
  const maps = clusterMaps.map(map => snapshot?.maps.find(item => item.id === map.id) || { ...map, status: 'unconfigured' });
  const connected = maps.filter(map => monitorStatus(map, now) === 'connected').length;
  const online = (clusterStatus.maps || []).filter(map => map.status === 'online').length;
  const openMap = (id, tab) => { setSelectedMap(id); setSettingsLoaded(false); setChartData([]); setActiveTab(tab); };
  const retry = () => { reconnect(); fetchClusterStatus(); };
  return <div className="cluster-monitor">
    <header className="monitor-heading">
      <div><h1>Resumen del clúster</h1><p>Estado del juego, recursos y actividad de cada servidor.</p></div>
      <button type="button" className="monitor-button" onClick={retry} aria-label="Reintentar telemetría"><RefreshCw size={15} /> Actualizar</button>
    </header>
    {(clusterMapsError || clusterStatusError) && <div className="monitor-notice" role="alert">{clusterMapsError || clusterStatusError} <button onClick={retry}>Reintentar</button></div>}
    {connection === 'reconnecting' || connection === 'error' ? <div role="status" className="monitor-notice">La conexión con el panel se está recuperando. Las lecturas antiguas caducan automáticamente.<button onClick={reconnect}>Reconectar monitor</button></div> : null}
    <section className="monitor-summary" aria-label="Resumen del clúster">
      <div><Layers size={17} /><span><strong>{clusterMaps.length}</strong> {clusterMaps.length === 1 ? 'mapa gestionado' : 'mapas gestionados'}</span></div>
      <div><span className="monitor-dot monitor-dot-ready" /><span><strong>{online}</strong> accesibles</span></div>
      <div><Radio size={17} /><span><strong>{connected} / {maps.length}</strong> monitores conectados</span></div>
      <span className="monitor-stream-state">{connection === 'connected' ? 'Actualización en directo' : 'Conectando monitor…'}</span>
    </section>
    <div className="monitor-section-heading"><h2>Mapas del clúster</h2><span>Heartbeat independiente por proceso</span></div>
    {!snapshot && maps.length > 0 ? <div role="status" aria-busy="true" className="monitor-loading">Conectando con los monitores de tus mapas…</div> : null}
    {maps.length === 0 ? <div className="monitor-empty"><h3>No hay mapas gestionados</h3><p>{clusterMapsError || 'Añade una instancia para comenzar a gestionar tu clúster.'}</p>{canOwn && <button className="monitor-button" onClick={() => setActiveTab('deploy')}>Gestionar instancias <ArrowUpRight size={14} /></button>}</div> :
      <div className="monitor-map-list">{maps.map(map => <MapMonitorRow key={map.id} map={map} game={clusterStatus.maps?.find(item => item.id === map.id)} now={now} canOperate={canOperate} canOwn={canOwn} onOpen={() => openMap(map.id, 'dashboard')} onConsole={() => openMap(map.id, 'rcon')} onResources={() => setActiveTab('hub')} />)}</div>}
    {canOperate && <>
      <MonitorActivity maps={maps.map(map => monitorStatus(map, now) === 'connected' ? map : { ...map, events: [] })} />
      <footer className="monitor-capabilities"><p><strong>Monitor nativo</strong> Métricas del proceso y eventos de conexión desde oMonitor.</p><p><strong>Mediciones pendientes</strong> TPS y censo completo de jugadores todavía requieren bindings nativos verificados.</p></footer>
    </>}
  </div>;
}
