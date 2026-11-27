import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

function clampPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function ResourceGauge({ title, value, colorClass, color, icon, size = 'lg' }) {
  const percent = clampPercent(value);
  const compact = size === 'sm';
  const data = [{ name: title, value: percent, fill: color }];

  if (compact) {
    return (
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="74%" outerRadius="96%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background={{ fill: '#27272a' }} cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <span className={`absolute text-[9px] font-bold ${colorClass}`}>{Math.round(percent)}</span>
      </div>
    );
  }

  return (
    <div className="dashboard-card group relative flex min-h-[148px] flex-col items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-[#18181b] p-3 shadow-sm">
      <div className={`absolute left-3 top-3 opacity-30 transition-opacity group-hover:opacity-100 ${colorClass}`}>{icon}</div>
      <div className="relative mt-2 flex h-28 w-28 items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="74%" outerRadius="96%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background={{ fill: '#27272a' }} cornerRadius={12} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-xl font-bold tracking-tight text-white">{percent.toFixed(1)}<span className="ml-0.5 text-xs text-zinc-500">%</span></span>
        </div>
      </div>
      <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{title}</span>
    </div>
  );
}
