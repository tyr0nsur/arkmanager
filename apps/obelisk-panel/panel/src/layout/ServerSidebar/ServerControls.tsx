// txAdmin's server control rail, adapted to the selected ARK map.
import { useState } from "react";
import {
  PowerIcon,
  PowerOffIcon,
  RotateCcwIcon,
  MegaphoneIcon,
  SaveIcon,
} from "lucide-react";
import { useAtomValue } from "jotai";
import { selectedMapAtom } from "@/hooks/arkClusterState";
import { fxRunnerStateAtom, txConfigStateAtom } from "@/hooks/status";
import { useAdminPerms } from "@/hooks/auth";
import { useOpenConfirmDialog, useOpenPromptDialog } from "@/hooks/dialogs";
import { useArkMutation } from "@/pages/Ark/ArkPage";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TxConfigState } from "@shared/enums";
export default function ServerControls() {
  const state = useAtomValue(fxRunnerStateAtom),
    config = useAtomValue(txConfigStateAtom),
    map = useAtomValue(selectedMapAtom),
    { hasPerm } = useAdminPerms(),
    confirm = useOpenConfirmDialog(),
    prompt = useOpenPromptDialog(),
    send = useArkMutation();
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const request = async (path: string, body: unknown) => {
    setBusy(true);
    setNotice("");
    try {
      const result = await send(path, "POST", body);
      setNotice(result.message || "Solicitud enviada");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const control = (action: "start" | "stop" | "restart") => {
    const execute = () => request("/fxserver/controls", { action });
    if (action === "start") execute();
    else
      confirm({
        title: `${action === "stop" ? "Detener" : "Reiniciar"} ${map?.name || "mapa"}`,
        message:
          "Esta acción afecta únicamente al mapa seleccionado. El mundo se guarda antes de detener el proceso.",
        actionLabel: action === "stop" ? "Detener mapa" : "Reiniciar mapa",
        confirmBtnVariant: "destructive",
        onConfirm: execute,
      });
  };
  const announcement = () =>
    prompt({
      title: `Anuncio en ${map?.name || "ARK"}`,
      message: "El mensaje se enviará a los jugadores de este mapa.",
      placeholder: "Mensaje",
      required: true,
      submitLabel: "Enviar anuncio",
      onSubmit: (parameter) =>
        request("/fxserver/commands", { action: "admin_broadcast", parameter }),
    });
  const allowed =
    hasPerm("control.server") &&
    config === TxConfigState.Ready &&
    !busy &&
    Boolean(map);
  const buttons = [
    {
      Icon: state.isIdle ? PowerIcon : PowerOffIcon,
      label: state.isIdle
        ? "Arrancar mapa seleccionado"
        : "Detener mapa seleccionado",
      action: () => control(state.isIdle ? "start" : "stop"),
      disabled: !allowed,
    },
    {
      Icon: RotateCcwIcon,
      label: "Reiniciar mapa seleccionado",
      action: () => control("restart"),
      disabled: !allowed || !state.isChildAlive,
    },
    {
      Icon: SaveIcon,
      label: "Guardar mundo",
      action: () => request("/ark/command", { command: "SaveWorld" }),
      disabled: !allowed || !state.isChildAlive,
    },
    {
      Icon: MegaphoneIcon,
      label: "Enviar anuncio",
      action: announcement,
      disabled: !allowed || !state.isChildAlive,
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex justify-between gap-2">
        {buttons.map(({ Icon, label, action, disabled }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                disabled={disabled}
                onClick={action}
                className="flex h-10 sm:h-8 flex-1 items-center justify-center rounded-md border bg-muted transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
