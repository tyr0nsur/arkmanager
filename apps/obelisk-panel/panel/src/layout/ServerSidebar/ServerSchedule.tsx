import { useState } from "react";
import { useAtomValue } from "jotai";
import { useArkData, useArkMutation } from "@/pages/Ark/ArkPage";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { useOpenPromptDialog } from "@/hooks/dialogs";
import { useAdminPerms } from "@/hooks/auth";
import { Button } from "@/components/ui/button";

export default function ServerSchedule() {
  const id = useAtomValue(selectedMapIdAtom);
  const { data, error, mutate } = useArkData("/api/scheduler/restarts", 10000);
  const send = useArkMutation();
  const prompt = useOpenPromptDialog();
  const { hasPerm } = useAdminPerms();
  const [notice, setNotice] = useState("");
  const job = data?.jobs?.find(
    (job: any) => job.mapId === id && job.state === "pending",
  );
  const add = () =>
    prompt({
      title: "Programar reinicio del mapa",
      message: `Indica +MM para minutos o HH:MM para una hora en ${window.txConsts.serverTimezone}. El mundo se guardará antes de reiniciar.`,
      placeholder: "+15",
      required: true,
      submitLabel: "Programar",
      onSubmit: async (input) => {
        try {
          await send("/ark/schedule", "POST", { when: input });
          setNotice("Reinicio programado");
          await mutate();
        } catch (error) {
          setNotice((error as Error).message);
        }
      },
    });
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Próximo reinicio</h2>
      <p className="text-xs text-muted-foreground">
        {job
          ? new Date(job.dueAt).toLocaleString("es-ES", {
              timeZone: window.txConsts.serverTimezone,
            })
          : error
            ? "Programación no disponible"
            : "Sin reinicio programado"}
      </p>
      {hasPerm("control.server") && !job && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={add}
          disabled={!id}
        >
          Programar reinicio
        </Button>
      )}
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
