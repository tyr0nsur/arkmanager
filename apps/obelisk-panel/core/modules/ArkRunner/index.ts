import type { IncomingHttpHeaders } from "node:http";
import {
  ArkGateway,
  GatewayError,
  requireRole,
  type MapConfig,
  type Session,
} from "../ArkCluster/Gateway";
export class ArkRunner {
  private busy = new Set<string>();
  constructor(private gateway: ArkGateway) {}
  async control(
    headers: IncomingHttpHeaders,
    session: Session,
    map: MapConfig,
    action: unknown,
  ) {
    requireRole(session, "owner");
    if (!["start", "stop", "restart"].includes(String(action)))
      throw new GatewayError(400, "Acción de servidor inválida");
    if (this.busy.has(map.id))
      throw new GatewayError(
        409,
        "Ya hay una operación en curso para este mapa",
      );
    this.busy.add(map.id);
    if (action === "stop" || action === "restart") {
      try {
        const status = await this.gateway.request(
          headers,
          "/api/server/state?mapId=" + encodeURIComponent(map.id),
        );
        if (
          action === "stop" &&
          ["inactive", "failed"].includes(status.state)
        ) {
          this.busy.delete(map.id);
          return { success: true, message: "El mapa ya está detenido" };
        }
        if (!["inactive", "failed"].includes(status.state)) {
          const saved = await this.gateway.request(
            headers,
            "/api/rcon/command",
            "POST",
            { mapId: map.id, command: "SaveWorld" },
          );
          if (!String(saved.response).includes("World Saved"))
            throw new GatewayError(
              409,
              "El guardado del mundo no se ha confirmado. Revisa el mapa antes de detenerlo.",
            );
        }
      } catch (error) {
        this.busy.delete(map.id);
        throw error;
      }
    }

    try {
      await this.gateway.request(headers, "/api/server/action", "POST", {
        action,
        mapId: map.id,
      });
      return { success: true };
    } finally {
      this.busy.delete(map.id);
    }
  }
  async command(
    headers: IncomingHttpHeaders,
    session: Session,
    map: MapConfig,
    command: unknown,
  ) {
    requireRole(session, "owner");
    if (
      typeof command !== "string" ||
      !command.trim() ||
      command.length > 500 ||
      /[\r\n\0]/.test(command)
    )
      throw new GatewayError(400, "Comando ARK inválido");
    return this.gateway.request(headers, "/api/rcon/command", "POST", {
      command: command.trim(),
      mapId: map.id,
    });
  }
}
