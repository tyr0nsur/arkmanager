import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
const gib = (bytes: number) =>
  Number.isFinite(bytes) ? (bytes / 1073741824).toFixed(2) + " GiB" : "—";
export default function DiagnosticsPage() {
  const { data, error, isLoading, mutate } = useArkData(
    "/api/system/health",
    15000,
  );
  const rows = [
    {
      title: "Sistema Linux",
      items: [
        [
          "Distribución",
          [data?.os?.distro, data?.os?.release].filter(Boolean).join(" "),
        ],
        ["Kernel", data?.os?.kernel],
        [
          "Tiempo activo",
          Number.isFinite(data?.os?.uptime)
            ? Math.floor(data.os.uptime / 3600) + " h"
            : "—",
        ],
      ],
    },
    {
      title: "Procesador del host",
      items: [
        ["Modelo", data?.cpu?.brand],
        ["Núcleos", data?.cpu?.cores],
        [
          "Carga",
          Number.isFinite(data?.cpu?.currentLoad)
            ? data.cpu.currentLoad.toFixed(1) + "%"
            : "—",
        ],
      ],
    },
    {
      title: "Memoria del host",
      items: [
        ["Total", gib(data?.memory?.total)],
        ["Activa", gib(data?.memory?.active)],
        ["Disponible", gib(data?.memory?.available)],
      ],
    },
  ];
  return (
    <ArkPage
      title="Diagnóstico del host"
      description="Estado del host Linux que ejecuta los mapas del clúster."
    >
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <div className="grid gap-4 md:grid-cols-2">
        {data &&
          rows.map((row) => (
            <Card key={row.title}>
              <CardHeader>
                <CardTitle className="text-base">{row.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  {row.items.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-wrap justify-between gap-3"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="break-words">{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ))}
      </div>
      {data?.disks?.map((disk: any) => (
        <Card key={disk.mount}>
          <CardHeader>
            <CardTitle className="text-base">
              Almacenamiento · {disk.mount}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              {gib(disk.used)} utilizados de {gib(disk.size)}
            </p>
            <meter
              className="w-full"
              min={0}
              max={100}
              value={disk.use}
              aria-label={"Uso de " + disk.mount}
            />
          </CardContent>
        </Card>
      ))}
    </ArkPage>
  );
}
