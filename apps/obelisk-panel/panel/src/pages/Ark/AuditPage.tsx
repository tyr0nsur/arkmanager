import { useState } from "react";
import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function AuditPage() {
  const [page, setPage] = useState(1),
    { data, error, isLoading, mutate } = useArkData(
      "/api/audit/log?page=" + page + "&limit=30",
    );
  return (
    <ArkPage
      title="Registro de administración"
      description="Accesos, cambios de permisos y operaciones sobre los mapas."
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <Card>
        <CardContent className="p-0 divide-y">
          {data?.logs?.map((item: any, index: number) => (
            <div key={item.id || index} className="p-4 space-y-1">
              <p className="text-xs text-muted-foreground">
                {item.timestamp || item.date} · {item.admin}
              </p>
              <p className="font-medium text-sm">{item.action}</p>
              <p className="text-sm break-words text-muted-foreground">
                {item.details}
              </p>
            </div>
          ))}
          {data && !data.logs?.length && (
            <p className="p-6 text-sm text-muted-foreground">
              No hay actividad en esta página.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">Página {page}</span>
        <Button
          variant="outline"
          disabled={!data || page >= data.totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente
        </Button>
      </div>
    </ArkPage>
  );
}
