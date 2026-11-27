import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
export default function BansPage() {
  const { data, error, isLoading, mutate } = useArkData("/api/players/bans");
  return (
    <ArkPage
      title="Baneos de ARK"
      description="Registro persistido de las sanciones del clúster."
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <Card>
        <CardContent className="p-0 divide-y">
          {data?.bans?.map((ban: any, index: number) => (
            <div key={ban.id || index} className="p-4 space-y-1">
              <p className="font-medium text-sm">
                {ban.playerName || ban.name || ban.steamId}
              </p>
              <p className="text-xs font-mono text-muted-foreground">
                {ban.steamId} · {ban.active ? "Activo" : "Revocado"}
              </p>
              <p className="text-sm text-muted-foreground">
                {ban.reason || "Sin motivo registrado"}
              </p>
            </div>
          ))}
          {data && !data.bans?.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No hay baneos registrados.
            </p>
          )}
        </CardContent>
      </Card>
    </ArkPage>
  );
}
