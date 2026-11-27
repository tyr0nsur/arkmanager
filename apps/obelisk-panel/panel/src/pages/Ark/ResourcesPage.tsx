import { useState } from "react";
import { ArkPage, ArkDataState, useArkData, useArkMutation } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminPerms } from "@/hooks/auth";
import { useOpenConfirmDialog } from "@/hooks/dialogs";
export default function ResourcesPage() {
  const { data, error, isLoading, mutate } = useArkData("/ark/resources", 5000),
    send = useArkMutation(),
    { hasPerm } = useAdminPerms(),
    confirm = useOpenConfirmDialog();
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const run = (id: string, action: string) =>
    confirm({
      title: `${action} · ${id}`,
      message:
        "La acción se aplicará únicamente al mapa seleccionado. El runtime confirma el estado de cada recurso.",
      actionLabel: "Confirmar",
      onConfirm: () => {
        setBusy(id);
        setNotice("");
        send("/ark/resources/action", "POST", { id, action })
          .then((result) =>
            setNotice(
              result.ok
                ? `${id}: operación confirmada.`
                : result.guidance ||
                    result.reason ||
                    "Consulta el estado antes de volver a actuar.",
            ),
          )
          .catch((e) => setNotice(e.message))
          .finally(() => {
            setBusy("");
            mutate();
          });
      },
    });
  return (
    <ArkPage
      title="Recursos de ObeliskNative"
      description="Control del ciclo de vida de los módulos nativos del mapa seleccionado."
      actions={
        <Button size="sm" variant="outline" onClick={() => mutate()}>
          Actualizar estado
        </Button>
      }
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      {notice && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardContent className="p-0 divide-y">
          {data?.plugins?.map((item: any) => (
            <div
              key={item.plugin_id}
              className="flex flex-wrap items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium">{item.plugin_id}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Generación {item.generation ?? "—"} ·{" "}
                  {item.cooperative
                    ? "Ciclo de vida cooperativo"
                    : "Descarga no confirmada como cooperativa"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={item.state === "running" ? "default" : "secondary"}
                >
                  {item.state}
                </Badge>
                {hasPerm("obelisk.plugins.manage") && (
                  <>
                    {item.state === "stopped" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => run(item.plugin_id, "start")}
                      >
                        Iniciar
                      </Button>
                    )}
                    {item.state === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => run(item.plugin_id, "pause")}
                      >
                        Pausar
                      </Button>
                    )}
                    {item.state === "paused" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => run(item.plugin_id, "resume")}
                      >
                        Continuar
                      </Button>
                    )}
                    {item.cooperative && item.state !== "stopped" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => run(item.plugin_id, "reload")}
                        >
                          Recargar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!!busy}
                          onClick={() => run(item.plugin_id, "stop")}
                        >
                          Detener
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {data && !data.plugins?.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No hay recursos disponibles en el control de esta instancia.
            </p>
          )}
        </CardContent>
      </Card>
    </ArkPage>
  );
}
