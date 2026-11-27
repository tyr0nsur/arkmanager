import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const SERIES = [
  { key: 'cpu', name: 'CPU %', stroke: '#3b82f6', fill: '#3b82f6' },
  { key: 'ram', name: 'RAM %', stroke: '#10b981', fill: '#10b981' },
];

function ResourceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-800 bg-[#09090b] px-3 py-2 text-xs shadow-xl shadow-black/50">
      <div className="mb-1 font-semibold text-zinc-300">{label}</div>
      {payload.map(item => (
        <div key={item.dataKey} className="flex items-center justify-between gap-5 text-zinc-400">
          <span>{item.name}</span>
          <span className="font-mono font-bold text-white">{Number(item.value || 0).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function ResourceLegend({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-4 text-xs' : 'gap-5 text-xs font-bold uppercase tracking-wider'}`}>
      {SERIES.map(series => (
        <span key={series.key} className="flex items-center gap-2">
          <span className={`${compact ? 'h-2.5 w-2.5 rounded-full' : 'h-3 w-3 rounded'} ${series.key === 'cpu' ? 'bg-blue-500' : 'bg-emerald-500'}`}></span>
          {series.key.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export function ResourceTrendChart({ data, mode = 'line', gradientId = 'resource-trend' }) {
  if (mode === 'area') {
    const cpuFill = `${gradientId}-cpu`;
    const ramFill = `${gradientId}-ram`;
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={cpuFill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={ramFill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="time" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#52525b" fontSize={11} domain={[0, dataMax => Math.max(50, dataMax)]} tickLine={false} axisLine={false} />
          <Tooltip content={<ResourceTooltip />} />
          <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill={`url(#${cpuFill})`} activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }} isAnimationActive={true} animationDuration={800} animationEasing="ease" />
          <Area type="monotone" dataKey="ram" name="RAM %" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill={`url(#${ramFill})`} activeDot={{ r: 6, strokeWidth: 0, fill: '#10b981' }} isAnimationActive={true} animationDuration={800} animationEasing="ease" />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2230" />
        <XAxis dataKey="time" stroke="#4b5563" fontSize={11} />
        <YAxis stroke="#4b5563" fontSize={11} domain={[0, dataMax => Math.max(50, dataMax)]} />
        <Tooltip content={<ResourceTooltip />} />
        <Line type="monotone" dataKey="cpu" name="CPU proceso %" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={800} animationEasing="ease" />
        <Line type="monotone" dataKey="ram" name="RAM proceso %" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={800} animationEasing="ease" />
      </LineChart>
    </ResponsiveContainer>
  );
}
