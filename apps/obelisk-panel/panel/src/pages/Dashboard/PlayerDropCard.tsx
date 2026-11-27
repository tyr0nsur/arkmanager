import { useArkContext } from "@/hooks/arkCluster";
export default function PlayerDropCard() {
  const { native, fresh } = useArkContext();
  const events = fresh ? native?.events || [] : [];
  return (
    <section className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <h2 className="font-semibold">Actividad de jugadores</h2>
      <div className="flex gap-6 text-sm">
        <span className="text-muted-foreground">
          Entradas{" "}
          <strong className="ml-1 font-mono text-primary">
            {fresh ? (native?.counters?.logins ?? "—") : "—"}
          </strong>
        </span>
        <span className="text-muted-foreground">
          Salidas{" "}
          <strong className="ml-1 font-mono text-primary">
            {fresh ? (native?.counters?.logouts ?? "—") : "—"}
          </strong>
        </span>
      </div>
      {events.length ? (
        <ol className="space-y-2">
          {events
            .slice(-4)
            .reverse()
            .map((event) => (
              <li
                key={event.process_epoch + ":" + event.sequence}
                className="flex min-w-0 items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">
                  {event.name || "Sin nombre disponible"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {event.kind === "login_observed" ? "Entrada" : "Salida"}
                </span>
              </li>
            ))}
        </ol>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">
          Sin eventos recientes del juego.
        </p>
      )}
      <p className="mt-auto text-xs text-muted-foreground">
        Observaciones nativas del proceso actual.
      </p>
    </section>
  );
}
