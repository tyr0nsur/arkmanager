import { useEffect, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { ArkPage, ArkDataState, useArkData, useArkMutation } from "./ArkPage";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOpenConfirmDialog } from "@/hooks/dialogs";
export default function ConfigEditorPage() {
  const mapId = useAtomValue(selectedMapIdAtom),
    [file, setFile] = useState("gameusersettings"),
    { data, error, isLoading, mutate } = useArkData(
      "/api/config/editor?mapId=" + encodeURIComponent(mapId) + "&file=" + file,
    ),
    send = useArkMutation(),
    confirm = useOpenConfirmDialog();
  const [content, setContent] = useState(""),
    [revision, setRevision] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const dirty = content !== (data?.content || ""),
    loaded = useRef("");
  useEffect(() => {
    if (data && loaded.current !== mapId + ":" + file) {
      loaded.current = mapId + ":" + file;
      setContent(data.content);
      setRevision(data.revision);
      setNotice("");
    }
  }, [data, mapId, file]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const discard = (action: () => void) =>
    dirty
      ? confirm({
          title: "Descartar cambios INI",
          message: "Hay cambios sin guardar en este archivo.",
          actionLabel: "Descartar",
          onConfirm: action,
        })
      : action();
  const reload = () =>
    discard(async () => {
      loaded.current = "";
      const next = await mutate();
      if (next) {
        setContent(next.content);
        setRevision(next.revision);
        loaded.current = mapId + ":" + file;
      }
    });
  const save = () =>
    confirm({
      title: "Guardar configuración de ARK",
      message:
        "La configuración se aplicará al arrancar este mapa. Las credenciales existentes se conservan por separado.",
      actionLabel: "Guardar",
      onConfirm: async () => {
        setBusy(true);
        try {
          const result = await send("/api/config/editor", "POST", {
            mapId,
            file,
            content,
            revision,
          });
          setNotice(result.message);
          loaded.current = "";
          await mutate();
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
  return (
    <ArkPage
      title="Editor INI de ARK"
      description="Archivos nativos del mapa seleccionado. El servidor debe estar detenido para guardarlos."
      actions={
        <Button size="sm" variant="outline" onClick={reload} disabled={busy}>
          Recargar
        </Button>
      }
    >
      <Tabs value={file} onValueChange={(next) => discard(() => setFile(next))}>
        <TabsList>
          <TabsTrigger value="gameusersettings">
            GameUserSettings.ini
          </TabsTrigger>
          <TabsTrigger value="gameini">Game.ini</TabsTrigger>
        </TabsList>
      </Tabs>
      <ArkDataState error={error} loading={isLoading} retry={() => mutate()} />
      {data && !data.editable && (
        <p
          role="status"
          className="rounded-lg border border-warning/30 bg-card p-4 text-sm text-warning-inline"
        >
          Detén el mapa antes de editar. ARK reescribe sus archivos INI al
          cerrar.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border bg-card p-4 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          <label className="sr-only" htmlFor="ark-ini-content">
            Contenido del archivo INI
          </label>
          <textarea
            id="ark-ini-content"
            spellCheck={false}
            className="block min-h-[28rem] w-full resize-y rounded-lg bg-background p-4 font-mono text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={!data?.editable || busy}
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Las líneas [REDACTED] conservan las contraseñas existentes.
        </p>
        <Button
          disabled={busy || !data?.editable || content === data?.content}
          onClick={save}
        >
          {busy ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </ArkPage>
  );
}
