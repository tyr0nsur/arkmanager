import { ActivityIcon } from "lucide-react";
import { useArkContext } from "@/hooks/arkCluster";
export default function ThreadPerfCard() {
  const { native, fresh } = useArkContext();
  return (
    <section className="rounded-xl border bg-card p-4 flex flex-col gap-3">
      <h2 className="font-semibold">Monitor del juego</h2>
      <div className="flex items-center gap-3 text-primary">
        <ActivityIcon className="size-7" />
        <span className="text-lg font-medium">
          {fresh ? "Recurso conectado" : "Sin señal reciente"}
        </span>
      </div>
      <dl className="space-y-3 text-sm text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Eventos de conexión</dt>
          <dd>
            {native?.lifecycleAvailable ? "Disponibles" : "No disponibles"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>TPS del juego</dt>
          <dd>Sin binding verificado</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Censo nativo completo</dt>
          <dd>Pendiente</dd>
        </div>
      </dl>
      <p className="mt-auto text-xs text-muted-foreground">
        El heartbeat confirma el recurso. El avance del hilo del juego se medirá
        con su binding nativo.
      </p>
    </section>
  );
}
