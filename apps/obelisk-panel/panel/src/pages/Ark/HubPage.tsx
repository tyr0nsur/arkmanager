import { ArkPage, ArkDataState, useArkData } from "./ArkPage";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Input } from "@/components/ui/input";
function Downloads() {
  const { data, error, isLoading, mutate } = useArkData("/api/hub/resources");
  return (
    <>
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <div className="space-y-4">
        {data?.resources?.items?.map((item: any) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.title}</CardTitle>
              <CardDescription>{item.summary}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {item.commands?.length > 0 && (
                <p className="font-mono text-xs text-muted-foreground">
                  {item.commands.join(" · ")}
                </p>
              )}
              <Button asChild size="sm" variant="outline">
                <a
                  href={
                    "/api/hub/resources/" +
                    encodeURIComponent(item.id) +
                    "/download"
                  }
                >
                  Descargar {item.title}
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
const dimensions: Record<string, string> = {
  command_syntax: "Sintaxis y comandos",
  default_limits: "Límites y valores por defecto",
  persistence: "Persistencia",
  visible_output: "Resultado visible",
  client_mod_or_gui: "Interfaz y mods del cliente",
  failure_lifecycle: "Fallos y ciclo de vida",
  steam_epic_gameplay: "Gameplay en Steam y Epic",
};
function ReferenceDetail({ id, close }: { id: number; close: () => void }) {
  const { data, error, isLoading, mutate } = useArkData(
      "/api/hub/references/" + id,
    ),
    item = data?.reference,
    contract = item?.selected_contract;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <CardTitle className="text-base">
          {item?.name || "Contrato del recurso"}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={close}>
          Cerrar ficha
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <ArkDataState
          error={error}
          loading={isLoading}
          retry={() => mutate()}
        />
        {item && (
          <>
            <p className="text-xs text-muted-foreground">
              Referencia {item.resource_id} · Versión {item.version} · Catálogo{" "}
              {item.snapshot_date}
            </p>
            <p className="text-sm text-warning-inline">
              {item.gameplay_parity_accepted
                ? "Paridad aceptada para este perfil."
                : "Paridad pendiente de aceptación."}
            </p>
            {contract?.gap && (
              <p className="text-sm text-muted-foreground">{contract.gap}</p>
            )}
            <h3 className="font-medium text-sm">Contrato observable</h3>
            <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
              {contract?.requirements?.length ? (
                contract.requirements.map((text: string) => (
                  <li key={text}>{text}</li>
                ))
              ) : (
                <li>
                  Falta concretar el comportamiento público y la configuración
                  de esta versión.
                </li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2">
              {(contract?.commands?.length
                ? contract.commands
                : item.commands || []
              ).map((command: string) => (
                <code
                  key={command}
                  className="max-w-full break-words rounded bg-secondary p-2 text-xs"
                >
                  {command}
                </code>
              ))}
            </div>
            <h3 className="font-medium text-sm">
              Aceptación por comportamiento
            </h3>
            <dl className="divide-y">
              {Object.entries(dimensions).map(([key, label]) => (
                <div
                  key={key}
                  className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                >
                  <dt>{label}</dt>
                  <dd className="text-muted-foreground">
                    {(
                      {
                        Accepted: "Aceptado",
                        DependencyDocumented: "Dependencia documentada",
                        Pending: "Pendiente",
                      } as Record<string, string>
                    )[item.behavior_matrix?.[key]?.stage] || "Pendiente"}
                  </dd>
                </div>
              ))}
            </dl>
            {!!item.required_primitives?.length && (
              <details>
                <summary className="cursor-pointer text-sm">
                  Primitivas que necesita el SDK
                </summary>
                <ul className="mt-3 space-y-2 text-xs font-mono text-muted-foreground">
                  {item.required_primitives.map((text: string) => (
                    <li key={text} className="break-words">
                      {text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!!item.related_native_modules?.length && (
              <p className="text-sm text-muted-foreground">
                Módulos relacionados: {item.related_native_modules.join(", ")}
              </p>
            )}
            {/^https:\/\//.test(item.source_url) && (
              <Button asChild size="sm" variant="outline">
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Referencia pública
                </a>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
function Parity() {
  const overview = useArkData("/api/hub/parity"),
    [search, setSearch] = useState(""),
    [family, setFamily] = useState(""),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    catalog = useArkData(
      "/api/hub/references?" +
        new URLSearchParams({
          search,
          family,
          page: String(page),
          pageSize: "20",
        }),
    ),
    parity = overview.data?.parity,
    references = catalog.data?.references;
  return (
    <div className="space-y-4">
      <ArkDataState
        error={overview.error}
        loading={overview.isLoading}
        retry={() => overview.mutate()}
      />
      {parity && (
        <Card>
          <CardContent className="p-4">
            <p className="font-medium">
              {parity.accepted} de {parity.total} recursos aceptados
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {parity.selected_contracts} contratos públicos seleccionados ·
              Catálogo {parity.snapshot_date}
            </p>
          </CardContent>
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Las referencias externas y los contratos publicados requieren
        implementación y aceptación propias. Las referencias pendientes no se
        instalan desde el Hub.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          aria-label="Buscar referencia ArkApi"
          placeholder="Buscar recurso ArkApi"
          value={search}
          maxLength={128}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <label className="sr-only" htmlFor="reference-family">
          Familia funcional
        </label>
        <select
          id="reference-family"
          className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm"
          value={family}
          onChange={(event) => {
            setFamily(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las familias</option>
          {references?.families?.map((id: string) => (
            <option key={id} value={id}>
              {id.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <ReferenceDetail
          key={selected}
          id={selected}
          close={() => setSelected(null)}
        />
      )}
      <ArkDataState
        error={catalog.error}
        loading={catalog.isLoading}
        retry={() => catalog.mutate()}
      />
      {!catalog.isLoading && references?.items?.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No hay recursos que coincidan. Cambia la búsqueda o la familia.
        </p>
      )}
      <Card>
        <CardContent className="p-0 divide-y">
          {references?.items?.map((item: any) => (
            <article
              key={item.resource_id}
              className="flex flex-wrap items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1 basis-48">
                <h3 className="font-medium text-sm break-words">{item.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recurso {item.resource_id} · Versión {item.version} ·{" "}
                  {item.family}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {item.summary}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(item.resource_id)}
                aria-label={"Ver contrato de " + item.name}
              >
                Ver contrato
              </Button>
            </article>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1 || catalog.isLoading}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          Página {page} · {references?.total ?? "…"} referencias
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={
            catalog.isLoading ||
            !references ||
            page * references.pageSize >= references.total
          }
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
        </Button>
      </div>
      {!!parity?.sdk_domains?.length && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm">
            Dominios del SDK para la paridad
          </summary>
          <div className="mt-3 divide-y">
            {parity.sdk_domains.map((domain: any) => (
              <article key={domain.id} className="py-3">
                <h3 className="font-mono text-sm break-words">{domain.id}</h3>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-xs text-muted-foreground">
                  {domain.requirements.map((text: string) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
function Catalog() {
  const { data, error, isLoading, mutate } = useArkData("/api/hub/catalog");
  return (
    <>
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      <div className="space-y-3">
        {data?.catalog?.plugins?.map((item: any) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription>{item.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-xs">
                {item.id} · {item.version}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {item.limitations?.map((line: string) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
export default function HubPage() {
  return (
    <ArkPage
      title="Hub de recursos"
      description="SDK, módulos nativos y seguimiento de los contratos de ArkApi."
    >
      <Tabs defaultValue="resources">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="resources">SDK y recursos</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo nativo</TabsTrigger>
          <TabsTrigger value="parity">Paridad ArkApi</TabsTrigger>
        </TabsList>
        <TabsContent value="resources">
          <Downloads />
        </TabsContent>
        <TabsContent value="catalog">
          <Catalog />
        </TabsContent>
        <TabsContent value="parity">
          <Parity />
        </TabsContent>
      </Tabs>
    </ArkPage>
  );
}
