import { useState } from "react";
import { useAtomValue } from "jotai";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { useAdminPerms } from "@/hooks/auth";
import { ArkPage, ArkDataState, useArkData, useArkMutation } from "./ArkPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export default function TasksPage() {
  const mapId = useAtomValue(selectedMapIdAtom),
    { data, error, isLoading, mutate } = useArkData("/api/tasks", 10000),
    restarts = useArkData("/api/scheduler/restarts", 5000),
    send = useArkMutation(),
    { hasPerm } = useAdminPerms();
  const [action, setAction] = useState("SaveWorld"),
    [cronExpr, setCron] = useState("0 */4 * * *"),
    [payload, setPayload] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (
    path: string,
    method: "POST" | "DELETE",
    body: unknown,
  ) => {
    setBusy(true);
    try {
      await send(path, method, body);
      setNotice("Programación actualizada");
      await Promise.all([mutate(), restarts.mutate()]);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ArkPage
      title="Programación"
      description={
        "Tareas por mapa · Zona horaria: " +
        (data?.scheduleContext?.timeZone || "Comprobando…")
      }
    >
      <ArkDataState
        error={error || restarts.error}
        loading={isLoading}
        retry={() => {
          mutate();
          restarts.mutate();
        }}
      />
      {notice && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tarea recurrente del mapa seleccionado
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger aria-label="Acción programada">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SaveWorld">Guardar mundo</SelectItem>
              <SelectItem value="Broadcast">Anuncio en el juego</SelectItem>
            </SelectContent>
          </Select>
          <Input
            aria-label="Expresión cron"
            value={cronExpr}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 */4 * * *"
          />
          {action === "Broadcast" && (
            <Input
              aria-label="Mensaje del anuncio"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              maxLength={300}
              placeholder="Mensaje para los jugadores"
            />
          )}
          <Button
            disabled={busy || !mapId}
            onClick={() =>
              run("/api/tasks", "POST", { action, cronExpr, payload, mapId })
            }
          >
            Crear tarea
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tareas del clúster</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.tasks?.map((task: any) => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p>
                  {task.action} · {task.mapId || "Clúster"}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {task.cron} · {task.active ? "Activa" : "Pausada"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      "/api/tasks/" + encodeURIComponent(task.id) + "/toggle",
                      "POST",
                      { active: !task.active },
                    )
                  }
                >
                  {task.active ? "Pausar" : "Activar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      "/api/tasks/" + encodeURIComponent(task.id),
                      "DELETE",
                      {},
                    )
                  }
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {data && !data.tasks?.length && (
            <p className="text-sm text-muted-foreground">
              No hay tareas recurrentes.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reinicios programados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {restarts.data?.jobs
            ?.slice()
            .reverse()
            .map((job: any) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p>
                    {job.mapId} · {new Date(job.dueAt).toLocaleString("es-ES")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(
                      {
                        pending: "Pendiente",
                        running: "En ejecución",
                        completed: "Completado",
                        failed: "Fallido",
                        cancelled: "Cancelado",
                        deauthorized: "Acceso revocado",
                        unknown: "Resultado pendiente de revisión",
                      } as Record<string, string>
                    )[job.state] || job.state}
                    {job.reason ? " · " + job.reason : ""}
                  </p>
                </div>
                {hasPerm("all_permissions") && job.state === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run("/api/scheduler/restarts/" + job.id, "DELETE", {})
                    }
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            ))}
          {restarts.data && !restarts.data.jobs?.length && (
            <p className="text-sm text-muted-foreground">
              No hay reinicios programados. Puedes añadir uno desde el panel del
              servidor.
            </p>
          )}
        </CardContent>
      </Card>
    </ArkPage>
  );
}
