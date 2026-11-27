import { useAtomValue } from "jotai";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function ServerLogPage() {
  const id = useAtomValue(selectedMapIdAtom),
    { data, error, isLoading, mutate } = useArkData(
      "/api/server/logs?mapId=" + encodeURIComponent(id) + "&lines=500",
      10000,
    );
  return (
    <ArkPage
      title="Registro del servidor ARK"
      description="Últimas líneas del archivo de juego del mapa seleccionado."
      actions={
        <Button size="sm" variant="outline" onClick={() => mutate()}>
          Actualizar
        </Button>
      }
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <Card>
        <CardContent className="p-0">
          <pre className="max-h-[65vh] min-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {data?.logs || "Sin líneas disponibles."}
          </pre>
        </CardContent>
      </Card>
    </ArkPage>
  );
}
