export function monitorStatus(map, now, freshnessMs = 6500) {
  if (map?.status === 'connected' && (!Number.isFinite(map.lastSeenAt) || now - map.lastSeenAt > freshnessMs || map.lastSeenAt > now + 1000)) return 'stale';
  return map?.status || 'unconfigured';
}
export function bytesLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  return bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(2)} GiB` : `${(bytes / 1048576).toFixed(0)} MiB`;
}
export function uptimeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours > 23 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}
export const MONITOR_STATUS = {
  connected: { label: 'Monitor conectado', tone: 'healthy', detail: 'El recurso publica datos desde el proceso ARK.' },
  stale: { label: 'Sin señal reciente', tone: 'warning', detail: 'Revisa el proceso y el recurso oMonitor en este mapa.' },
  unavailable: { label: 'Monitor no disponible', tone: 'warning', detail: 'Comprueba oMonitor y su configuración de instancia en el Hub.' },
  unconfigured: { label: 'Monitor sin configurar', tone: 'neutral', detail: 'Activa oMonitor y vincula esta instancia al panel.' },
};
