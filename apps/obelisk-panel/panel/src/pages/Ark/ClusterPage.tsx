import { useArkCluster, useSelectArkMap } from "@/hooks/arkCluster";
import { useAtomValue } from "jotai";
import { arkMapsAtom } from "@/hooks/arkClusterState";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOpenPromptDialog } from "@/hooks/dialogs";
import { useArkMutation } from "./ArkPage";
import { ArkPage } from "./ArkPage";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useAdminPerms } from "@/hooks/auth";
export default function ClusterPage() {
  const { data, connected } = useArkCluster(),
    maps = useAtomValue(arkMapsAtom),
    choose = useSelectArkMap(),
    navigate = useLocation()[1],
    { hasPerm } = useAdminPerms();
  const send = useArkMutation(),
    prompt = useOpenPromptDialog();
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<any[]>([]);
  const operate = (action: string, label: string) => {
    const targets = maps.filter((map) => selected.includes(map.id)),
      expected = `${label.toUpperCase()} ${targets.length}`;
    prompt({
      title: `${label} mapas del clúster`,
      message: `${targets.map((map) => map.name).join(", ")}. Escribe ${expected} para confirmar.`,
      placeholder: expected,
      required: true,
      submitLabel: label,
      onSubmit: async (value) => {
        if (value.trim() !== expected) {
          setResults([
            {
              id: "confirmation",
              accepted: false,
              error: "La confirmación no coincide.",
            },
          ]);
          return;
        }
        setBusy(true);
        setResults([]);
        try {
          const data = await send("/ark/cluster/action", "POST", {
            mapIds: targets.map((map) => map.id),
            action,
          });
          setResults(data.results);
        } catch (error) {
          setResults([
            { id: "error", accepted: false, error: (error as Error).message },
          ]);
        } finally {
          setBusy(false);
        }
      },
    });
  };
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const open = (id: string, path: string) => {
    choose(id);
    navigate(path);
  };
  return (
    <ArkPage
      title="Clúster ARK"
      description="Todos los mapas del clúster, con contexto y monitor independientes."
    >
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>{maps.length} mapas gestionados</span>
        <span>·</span>
        <span>
          {connected ? "Conexión en directo" : "Conectando con el panel…"}
        </span>
      </div>
      {hasPerm("all_permissions") && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <h2 className="font-medium">Operaciones del clúster</h2>
            <div className="flex flex-wrap gap-4">
              {maps.map((map) => (
                <label key={map.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    disabled={busy}
                    checked={selected.includes(map.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, map.id]
                          : current.filter((id) => id !== map.id),
                      )
                    }
                  />
                  {map.name}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["save", "Guardar"],
                ["start", "Iniciar"],
                ["restart", "Reiniciar"],
                ["stop", "Detener"],
              ].map(([action, label]) => (
                <Button
                  key={action}
                  variant="outline"
                  size="sm"
                  disabled={busy || !selected.length}
                  onClick={() => operate(action, label)}
                >
                  {label} seleccionados
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Los reinicios y las paradas requieren un guardado confirmado. Cada
              resultado corresponde a un mapa; comprueba su estado después de la
              solicitud.
            </p>
            {!!results.length && (
              <ul role="status" className="space-y-2 text-sm">
                {results.map((result) => (
                  <li
                    key={result.id}
                    className={
                      result.accepted
                        ? "text-success-inline"
                        : "text-destructive-inline"
                    }
                  >
                    {result.name || "Solicitud"}:{" "}
                    {result.accepted ? "Solicitud aceptada" : result.error}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {!maps.length && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No hay mapas gestionados. El administrador debe registrar las instancias del clúster antes de utilizarlas.
          </CardContent>
        </Card>
      )}
      <div className="grid w-full grid-cols-1 2xl:grid-cols-2 gap-4">
        {maps.map((map) => {
          const native = data?.maps.find((m) => m.id === map.id),
            game = data?.publicStatus.maps.find((m) => m.id === map.id),
            fresh =
              native?.status === "connected" &&
              now - (native.lastSeenAt || 0) <= 6500;
          return (
            <Card key={map.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{map.name}</CardTitle>
                  <Badge variant={fresh ? "default" : "secondary"}>
                    {fresh
                      ? "Monitor activo"
                      : native?.status === "unconfigured"
                        ? "Sin monitor"
                        : "Sin señal reciente"}
                  </Badge>
                </div>
                <CardDescription>
                  {game?.map || map.id} ·{" "}
                  {game?.status === "online"
                    ? "Mapa accesible"
                    : "Estado del mapa pendiente"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasPerm("resources.view") && (
                  <dl className="grid grid-cols-3 gap-3 text-xs text-muted-foreground">
                    <div>
                      <dt>CPU</dt>
                      <dd className="mt-1 font-mono text-base text-foreground">
                        {fresh && native?.metrics
                          ? native.metrics.cpu_percent.toFixed(1) + "%"
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Memoria</dt>
                      <dd className="mt-1 font-mono text-base text-foreground">
                        {fresh && native?.metrics
                          ? (native.metrics.rss_bytes / 1073741824).toFixed(2) +
                            " GiB"
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Jugadores públicos</dt>
                      <dd className="mt-1 font-mono text-base text-foreground">
                        {game?.status === "online" ? game.players : "—"}
                      </dd>
                    </div>
                  </dl>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => open(map.id, "/")}>
                    Abrir mapa
                  </Button>
                  {hasPerm("console.view") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(map.id, "/server/console")}
                    >
                      Consola
                    </Button>
                  )}
                  {hasPerm("resources.view") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(map.id, "/server/resources")}
                    >
                      Recursos
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        El monitor publica desde cada proceso ARK. La consulta pública comprueba
        si el mapa acepta conexiones. Los datos antiguos caducan
        automáticamente.
      </p>
    </ArkPage>
  );
}
