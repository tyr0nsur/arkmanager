import { LogIn, LogOut } from 'lucide-react';
export function MonitorActivity({ maps }) {
  const events = maps.flatMap(map => (map.events || []).map(event => ({ ...event, mapId: map.id, mapName: map.name })))
    .sort((a, b) => b.observed_at_ms - a.observed_at_ms).slice(0, 16);
  return <section className="monitor-activity" aria-labelledby="monitor-activity-title">
    <div className="monitor-section-heading"><h2 id="monitor-activity-title">Actividad del clúster</h2><span>Eventos del juego</span></div>
    {events.length ? <ol>{events.map(event => {
      const Icon = event.kind === 'login_observed' ? LogIn : LogOut;
      return <li key={`${event.mapId}:${event.process_epoch}:${event.sequence}`}><Icon size={15} aria-hidden="true" /><div><p><strong>{event.name || 'Jugador sin nombre disponible'}</strong> · {event.kind === 'login_observed' ? 'Entrada observada' : 'Salida observada'}</p><span>{event.mapName}</span></div><time dateTime={new Date(event.observed_at_ms).toISOString()}>{new Date(event.observed_at_ms).toLocaleTimeString('es-ES')}</time></li>;
    })}</ol> : <div className="monitor-empty"><p>Aún no hay entradas o salidas registradas.</p><span>Los eventos aparecerán cuando un jugador se conecte a un mapa con el monitor activo.</span></div>}
  </section>;
}
