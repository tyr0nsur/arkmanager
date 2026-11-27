import { ArrowUpRight, Terminal, Activity } from 'lucide-react';
import { HealthTrace } from './HealthTrace.jsx';
import { bytesLabel, monitorStatus, MONITOR_STATUS, uptimeLabel } from './format.js';

export function MapMonitorRow({ map, game, now, canOperate, canOwn, onOpen, onConsole, onResources }) {
  const status = monitorStatus(map, now);
  const info = MONITOR_STATUS[status] || MONITOR_STATUS.unavailable;
  const metrics = status === 'connected' ? map.metrics : null;
  return <article className="monitor-map" aria-label={`Monitor de ${map.name}`}>
    <div className="monitor-map-heading">
      <div><span className="monitor-map-id">{map.id}</span><h3>{map.name}</h3></div>
      <span className={`monitor-signal monitor-signal-${info.tone}`}><Activity size={13} />{info.label}</span>
    </div>
    <div className="monitor-map-body">
      <div className="monitor-map-health">
        <p><span className={`monitor-dot ${game?.status === 'online' ? 'monitor-dot-ready' : ''}`} />{game?.status === 'online' ? 'Mapa accesible' : game?.status === 'offline' ? 'Mapa sin respuesta pública' : 'Comprobando mapa'}</p>
        <p className="monitor-secondary">{game?.map || 'Mapa pendiente de consultar'} · {game?.status === 'online' ? `${game.players ?? '—'} / ${game.maxPlayers ?? '—'} jugadores (consulta pública)` : 'Consulta pública independiente del monitor'}</p>
        {status !== 'connected' && <p className="monitor-secondary">{info.detail}</p>}
        {status === 'connected' && <p className="monitor-secondary">Última señal hace {Math.max(0, Math.floor((now - map.lastSeenAt) / 1000))} s · v{map.resourceVersion}</p>}
      </div>
      {canOperate && <><dl className="monitor-process-metrics" aria-label={`Métricas del proceso ${map.name}`}>
        <div><dt>CPU del proceso</dt><dd>{metrics ? `${metrics.cpu_percent.toFixed(1)}%` : '—'}</dd></div>
        <div><dt>Memoria residente</dt><dd>{bytesLabel(metrics?.rss_bytes)}</dd></div>
        <div><dt>Tiempo activo</dt><dd>{uptimeLabel(metrics?.uptime_seconds)}</dd></div>
      </dl><HealthTrace history={map.history} name={map.name} /></>}
    </div>
    <div className="monitor-map-actions">
      <button type="button" onClick={onOpen}>Abrir mapa <ArrowUpRight size={14} /></button>
      {canOwn && <button type="button" onClick={onConsole}><Terminal size={14} /> Consola</button>}
      {canOperate && status !== 'connected' && <button type="button" onClick={onResources}>Revisar recurso monitor</button>}
    </div>
  </article>;
}
