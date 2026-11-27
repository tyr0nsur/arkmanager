// Native process CPU, fixed vertical scale (one core = 100%). Gaps are explicit.
export function HealthTrace({ history = [], name }) {
  const values = history.slice(-60);
  const segments = [];
  let current = [];
  for (const item of values) {
    if (current.length && item.at - current[current.length - 1].at > 6500) { segments.push(current); current = []; }
    current.push(item);
  }
  if (current.length) segments.push(current);
  const first = values[0]?.at || 0;
  const span = Math.max(120000, (values.at(-1)?.at || 0) - first);
  const point = item => `${((item.at - first) / span * 280 + 4).toFixed(1)},${(42 - Math.min(400, item.cpu) / 400 * 36).toFixed(1)}`;
  return <div className="monitor-trace">
    <svg viewBox="0 0 292 48" role="img" aria-label={`Historial CPU de ${name}: ${values.length} muestras; 100% equivale a un núcleo`}>
      <path d="M4 42H288 M4 24H288" className="monitor-trace-grid" />
      {segments.map((items, index) => items.length > 1 ? <polyline key={index} points={items.map(point).join(' ')} className="monitor-trace-line" /> : <circle key={index} cx={point(items[0]).split(',')[0]} cy={point(items[0]).split(',')[1]} r="2" className="monitor-trace-dot" />)}
    </svg>
    <span>{values.length ? 'CPU del proceso · 2 min' : 'Esperando muestras del monitor'}</span>
  </div>;
}
