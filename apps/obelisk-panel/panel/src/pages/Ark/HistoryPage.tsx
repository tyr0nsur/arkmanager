import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
export default function HistoryPage() {
  const { data, error, isLoading, mutate } = useArkData("/api/players/history");
  return (
    <ArkPage
      title="Historial de jugadores"
      description="Registros conservados de las instalaciones anteriores del clúster."
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <Card>
        <CardContent className="p-0 divide-y">
          {data?.history?.map((player: any, index: number) => (
            <div key={player.steamId || index} className="p-4">
              <p className="font-medium text-sm">
                {player.name || player.lastName || "Sin nombre registrado"}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {player.steamId || player.id || "Identificador no disponible"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Última observación: {player.lastSeen || "No disponible"}
              </p>
            </div>
          ))}
          {data && !data.history?.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No hay registros históricos.
            </p>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        El historial conserva observaciones anteriores; no autentica una sesión
        actual de Steam o Epic.
      </p>
    </ArkPage>
  );
}
