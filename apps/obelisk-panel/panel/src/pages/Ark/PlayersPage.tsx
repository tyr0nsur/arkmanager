import { useArkCluster } from "@/hooks/arkCluster";
import { ArkPage } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
export default function PlayersPage() {
  const { data } = useArkCluster(),
    [search, setSearch] = useState("");
  const events = (data?.maps || [])
    .flatMap((map) =>
      (map.events || []).map((event) => ({
        ...event,
        mapId: map.id,
        mapName: map.name,
      })),
    )
    .sort((a, b) => b.observed_at_ms - a.observed_at_ms)
    .filter((event) =>
      (event.name || "").toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <ArkPage
      title="Jugadores del clúster"
      description="Eventos nativos de entrada y salida, identificados por mapa y proceso."
    >
      <Input
        aria-label="Buscar jugador"
        placeholder="Buscar por nombre observado"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-4">Jugador observado</th>
                  <th className="p-4">Mapa</th>
                  <th className="p-4">Evento</th>
                  <th className="p-4">Hora</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={
                      event.mapId +
                      ":" +
                      event.process_epoch +
                      ":" +
                      event.sequence
                    }
                    className="border-b"
                  >
                    <td className="p-4">
                      {event.name || "Sin nombre disponible"}
                    </td>
                    <td className="p-4">{event.mapName}</td>
                    <td className="p-4">
                      {event.kind === "login_observed" ? "Entrada" : "Salida"}
                    </td>
                    <td className="p-4 whitespace-nowrap font-mono text-xs">
                      {new Date(event.observed_at_ms).toLocaleTimeString(
                        "es-ES",
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!events.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No hay eventos recientes que coincidan.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs leading-relaxed text-muted-foreground">
        El censo completo de sesiones y la identidad autenticada Steam/Epic
        requieren sus bindings nativos. Estos eventos no conceden permisos ni
        habilitan acciones contra una identidad supuesta.
      </p>
    </ArkPage>
  );
}
