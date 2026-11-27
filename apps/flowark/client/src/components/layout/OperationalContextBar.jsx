import { Activity, AlertTriangle, MapPin, ShieldCheck } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext.jsx';
import { DASHBOARD_TAB_META } from '../../constants/dashboard';
import { roleInfo } from '../../constants/roles';

const MAP_TABS = new Set(['dashboard', 'rcon', 'files', 'settings', 'game_modes', 'tasks']);
export function OperationalContextBar() {
  const { activeTab, userRole, selectedMap, clusterMaps, liveData, liveDataStale, liveDataError, clusterMapsError } = useDashboard();
  const meta = DASHBOARD_TAB_META[activeTab] || DASHBOARD_TAB_META.cluster;
  const scoped = MAP_TABS.has(activeTab);
  const selected = clusterMaps.find(map => map.id === selectedMap);
  const warning = clusterMapsError || (scoped && (liveDataError || (liveDataStale ? 'Estado del mapa sin actualizar. Actualiza los datos antes de ejecutar acciones.' : '')));
  const state = liveDataStale ? 'Sin lectura reciente' : liveData?.status === 'online' ? 'Online' : liveData?.status === 'offline' ? 'Offline' : 'Comprobando';
  return <section className="panel-context" aria-label="Contexto operacional actual">
    <div className="panel-context-path"><span>{meta.section}</span><span aria-hidden="true">/</span><strong>{meta.label}</strong></div>
    <div className="panel-context-scope"><MapPin size={14} /><span>{scoped ? selected?.name || 'Selecciona un mapa' : 'Todo el clúster'}</span>{scoped && <><Activity size={14} /><span>{state}</span></>}<ShieldCheck size={14} /><span>{roleInfo(userRole).label}</span></div>
    {warning && <p role="status" className="panel-context-warning"><AlertTriangle size={14} />{warning}</p>}
  </section>;
}
