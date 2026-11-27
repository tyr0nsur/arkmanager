import type { IncomingHttpHeaders } from "node:http";
import {
  ArkGateway,
  GatewayError,
  requireRole,
  type MapConfig,
  type Session,
} from "../ArkCluster/Gateway";
export class ArkResources {
  constructor(private gateway: ArkGateway) {}
  async list(headers: IncomingHttpHeaders, map: MapConfig) {
    return this.gateway.request(
      headers,
      `/api/hub/instances/${encodeURIComponent(map.id)}/plugins`,
    );
  }
  async action(
    headers: IncomingHttpHeaders,
    session: Session,
    map: MapConfig,
    id: unknown,
    action: unknown,
  ) {
    requireRole(session, "owner");
    if (!session.effectivePermissions.includes("obelisk.plugins.manage")) throw new GatewayError(403, "No tienes permiso para gestionar recursos nativos");
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(id) ||
      !["start", "pause", "resume", "stop", "reload"].includes(String(action))
    )
      throw new GatewayError(400, "Acción de recurso inválida");
    return this.gateway.request(
      headers,
      `/api/hub/instances/${encodeURIComponent(map.id)}/plugins/${encodeURIComponent(id)}/${action}`,
      "POST",
      {},
    );
  }
}
