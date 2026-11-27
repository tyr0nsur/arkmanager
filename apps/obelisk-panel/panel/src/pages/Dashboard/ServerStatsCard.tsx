import { GaugeIcon, MemoryStickIcon, TimerIcon, UsersIcon } from "lucide-react";
import { useArkContext } from "@/hooks/arkCluster";
export default function ServerStatsCard() {
  const { metrics, game } = useArkContext();
  return (
    <section className="rounded-xl border bg-card p-4 flex flex-col gap-4">
      <h2 className="font-semibold">Estadísticas del mapa</h2>
      <div className="grid grid-cols-2 gap-5 text-muted-foreground">
        {[
          {
            Icon: GaugeIcon,
            label: "CPU del proceso",
            value: metrics ? metrics.cpu_percent.toFixed(1) + "%" : "—",
          },
          {
            Icon: MemoryStickIcon,
            label: "Memoria ARK",
            value: metrics
              ? (metrics.rss_bytes / 1073741824).toFixed(2) + " GiB"
              : "—",
          },
          {
            Icon: TimerIcon,
            label: "Tiempo activo",
            value: metrics
              ? Math.floor(metrics.uptime_seconds / 3600) +
                " h " +
                (Math.floor(metrics.uptime_seconds / 60) % 60) +
                " min"
              : "—",
          },
          {
            Icon: UsersIcon,
            label: "Jugadores · consulta pública",
            value:
              game?.status === "online" ? String(game.players ?? "—") : "—",
          },
        ].map(({ Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="hidden sm:block size-6 shrink-0 opacity-60" />
            <div>
              <p className="font-mono text-lg text-primary">{value}</p>
              <p className="text-xs">{label}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        100% CPU equivale a un núcleo.
      </p>
    </section>
  );
}
