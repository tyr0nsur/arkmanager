import { useGlobalStatus } from "@/hooks/status";
import { VariantProps, cva } from "class-variance-authority";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DiscordBotStatus, FxMonitorHealth } from "@shared/enums";
import { msToShortDuration } from "@/lib/dateTime";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  `rounded-sm text-xs font-semibold px-1 py-[0.125rem] tracking-widest text-center cursor-help`,
  {
    variants: {
      type: {
        default: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        warning: "bg-warning text-warning-foreground",
        success: "bg-success text-success-foreground",
        info: "bg-info text-info-foreground",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      type: "default",
    },
  },
);
type StatusBadgeTypesVars = VariantProps<typeof statusBadgeVariants>["type"];
type StatusBadgeProps = {
  tooltip?:
    | string
    | {
        title: string;
        description: string;
      };
  type?: StatusBadgeTypesVars;
  children: React.ReactNode;
};

function StatusBadge({ children, tooltip, type }: StatusBadgeProps) {
  //If no tooltip is provided, just show the text
  if (!tooltip) {
    return <span className={statusBadgeVariants({ type })}>{children}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={statusBadgeVariants({ type })}>{children}</span>
      </TooltipTrigger>
      <TooltipContent side="right">
        {typeof tooltip === "string" ? (
          <p>{tooltip}</p>
        ) : (
          <>
            <h3>{tooltip.title}</h3>
            <p
              className={cn(
                "text-xs tracking-wider text-muted-foreground whitespace-pre-wrap",
                type === "warning" && "text-warning-inline",
              )}
            >
              {tooltip.description}
            </p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export default function ServerStatus() {
  const globalStatus = useGlobalStatus();
  const native = globalStatus?.ark?.native;
  const game = globalStatus?.ark?.game;
  const fresh =
    native?.status === "connected" &&
    Date.now() - (native.lastSeenAt || 0) < 6500;
  const health = globalStatus?.server.health || "Sin lectura";
  const uptime =
    fresh && native?.metrics
      ? msToShortDuration(native.metrics.uptime_seconds * 1000, {
          units: ["d", "h", "m"],
          delimiter: " ",
        })
      : "—";
  const password = game?.passwordProtected;
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <div className="flex justify-between gap-2">
        Mapa
        <StatusBadge
          type={
            health === "ONLINE"
              ? "success"
              : health === "PARTIAL"
                ? "warning"
                : "default"
          }
          tooltip={globalStatus?.server.healthReason}
        >
          {health}
        </StatusBadge>
      </div>
      <div className="flex justify-between gap-2">
        Tiempo activo<StatusBadge>{uptime}</StatusBadge>
      </div>
      <div className="flex justify-between gap-2">
        Monitor
        <StatusBadge type={fresh ? "success" : "warning"}>
          {fresh ? "Conectado" : "Sin señal"}
        </StatusBadge>
      </div>
      <div className="flex justify-between gap-2">
        Acceso
        <StatusBadge>
          {password === true
            ? "Contraseña"
            : password === false
              ? "Público"
              : "Sin lectura"}
        </StatusBadge>
      </div>
    </div>
  );
}
