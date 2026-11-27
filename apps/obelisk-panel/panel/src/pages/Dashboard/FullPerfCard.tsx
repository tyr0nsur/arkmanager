import { useArkContext } from "@/hooks/arkCluster";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import * as d3 from "d3";
export default function FullPerfCard() {
  const { native, fresh } = useArkContext(),
    [metric, setMetric] = useState<"cpu" | "rss">("cpu");
  const samples = native?.history || [];
  const chart = useMemo(() => {
    if (!samples.length) return null;
    const x = d3
      .scaleTime()
      .domain(d3.extent(samples, (s) => new Date(s.at)) as [Date, Date])
      .range([45, 785]);
    const max = d3.max(samples, (s) => s[metric]) || 1;
    const y = d3
      .scaleLinear()
      .domain([0, metric === "cpu" ? Math.max(100, max) : max * 1.1])
      .nice()
      .range([200, 15]);
    const line = d3
      .line<(typeof samples)[number]>()
      .defined((s) => Number.isFinite(s[metric]))
      .x((s) => x(new Date(s.at)))
      .y((s) => y(s[metric]));
    const segments: (typeof samples)[] = [];
    for (const sample of samples) {
      const current = segments.at(-1);
      if (!current || sample.at - current.at(-1)!.at > 6500)
        segments.push([sample]);
      else current.push(sample);
    }
    return {
      x,
      y,
      paths: segments.map((segment) => line(segment)).filter(Boolean),
      max,
    };
  }, [samples, metric]);
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Rendimiento del proceso ARK</h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={metric === "cpu" ? "default" : "outline"}
            onClick={() => setMetric("cpu")}
          >
            CPU
          </Button>
          <Button
            size="sm"
            variant={metric === "rss" ? "default" : "outline"}
            onClick={() => setMetric("rss")}
          >
            Memoria
          </Button>
        </div>
      </div>
      <div className="mt-4 min-h-56">
        {chart ? (
          <svg
            viewBox="0 0 800 235"
            className="w-full h-60"
            role="img"
            aria-label={`Historial ${metric === "cpu" ? "CPU" : "memoria"} del proceso ARK, ${samples.length} muestras`}
          >
            {chart.y.ticks(4).map((value) => (
              <g key={value}>
                <line
                  x1="45"
                  x2="785"
                  y1={chart.y(value)}
                  y2={chart.y(value)}
                  className="stroke-border"
                />
                <text
                  x="38"
                  y={chart.y(value) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {metric === "cpu"
                    ? value + "%"
                    : (value / 1073741824).toFixed(1)}
                </text>
              </g>
            ))}
            {chart.paths.map((path, index) => (
              <path
                key={index}
                d={path!}
                fill="none"
                className="stroke-primary"
                strokeWidth="2"
              />
            ))}
            {chart.x.ticks(5).map((date) => (
              <text
                key={date.getTime()}
                x={chart.x(date)}
                y="225"
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {date.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </text>
            ))}
          </svg>
        ) : (
          <div
            role="status"
            className="flex min-h-56 items-center justify-center text-sm text-muted-foreground"
          >
            Esperando muestras del monitor nativo.
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {fresh
          ? "Datos del recurso oMonitor en directo."
          : "Las lecturas actuales no están disponibles."}{" "}
        {metric === "cpu"
          ? "100% equivale a un núcleo."
          : "Memoria residente del proceso, en GiB."}
      </p>
    </section>
  );
}
