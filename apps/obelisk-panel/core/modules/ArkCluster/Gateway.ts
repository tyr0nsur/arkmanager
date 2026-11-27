import { createHash } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export class GatewayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Session = {
  id: string;
  username: string;
  role: "owner" | "operator" | "viewer";
  discordId?: string;
  effectivePermissions: string[];
};
export type MapConfig = {
  id: string;
  name: string;
  gamePort?: number;
  queryPort?: number;
  rconPort?: number;
};
export class ArkGateway {
  readonly origin: URL;
  private sessions = new Map<
    string,
    { at: number; value: Promise<Session | null> }
  >();
  constructor(origin: string) {
    this.origin = new URL(origin);
    if (
      this.origin.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(this.origin.hostname) ||
      this.origin.pathname !== "/" ||
      this.origin.username ||
      this.origin.password
    )
      throw Error("ARK gateway must be a fixed local origin");
  }
  headers(source: IncomingHttpHeaders, json = true) {
    const result: Record<string, string> = {
      ...(json
        ? { "content-type": "application/json" }
        : typeof source["content-type"] === "string"
          ? { "content-type": source["content-type"] }
          : {}),
    };
    for (const key of [
      "cookie",
      "origin",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-proto",
    ])
      if (typeof source[key] === "string") result[key] = source[key]!;
    const csrf = source["x-txadmin-csrftoken"] || source["x-xsrf-token"];
    if (typeof csrf === "string") result["x-xsrf-token"] = csrf;
    return result;
  }
  async request<T = any>(
    source: IncomingHttpHeaders,
    endpoint: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    if (
      !endpoint.startsWith("/api/") ||
      endpoint.startsWith("//") ||
      endpoint.includes("\0")
    )
      throw Error("Invalid gateway endpoint");
    const response = await fetch(new URL(endpoint, this.origin), {
      method,
      headers: this.headers(source),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const payload = await response.json();
    if (!response.ok)
      throw new GatewayError(
        response.status,
        typeof payload.error === "string"
          ? payload.error
          : "La operación ARK no se pudo completar",
      );
    return payload;
  }
  async session(headers: IncomingHttpHeaders): Promise<Session | null> {
    const key = createHash("sha256")
      .update(headers.cookie || "")
      .digest("hex");
    const existing = this.sessions.get(key);
    if (existing && Date.now() - existing.at < 1000) return existing.value;
    if (this.sessions.size >= 200)
      this.sessions.delete(this.sessions.keys().next().value!);
    const value = (async () => {
      try {
        const result = await this.request(headers, "/api/auth/verify");
        const user = result?.user;
        if (
          result?.valid !== true ||
          !user ||
          typeof user.id !== "string" ||
          typeof user.username !== "string" ||
          !["owner", "operator", "viewer"].includes(user.role) ||
          !Array.isArray(user.effectivePermissions)
        )
          throw new GatewayError(
            503,
            "La identidad del servicio ARK no es válida",
          );
        return user as Session;
      } catch (error) {
        if (error instanceof GatewayError && [401, 403].includes(error.status))
          return null;
        throw error;
      }
    })();
    this.sessions.set(key, { at: Date.now(), value });
    try {
      return await value;
    } catch (error) {
      this.sessions.delete(key);
      throw error;
    }
  }
  maps(headers: IncomingHttpHeaders): Promise<{ maps: MapConfig[] }> {
    return this.request(headers, "/api/cluster/maps");
  }
  async selected(
    headers: IncomingHttpHeaders,
    requested: unknown,
  ): Promise<MapConfig> {
    if (
      typeof requested !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(requested)
    )
      throw new GatewayError(400, "Selecciona un mapa del clúster");
    const map = (await this.maps(headers)).maps.find(
      (map) => map.id === requested,
    );
    if (!map)
      throw new GatewayError(
        400,
        "El mapa seleccionado no pertenece al clúster",
      );
    return map;
  }
}
export function requireRole(session: Session, role: Session["role"]) {
  const level = { viewer: 0, operator: 1, owner: 2 };
  if ((level[session.role] ?? -1) < level[role])
    throw new GatewayError(403, "Tu rol no permite esta operación");
}
export function authData(session: Session, csrfToken: string) {
  // Presentation mapping only. Every operation is checked again at the gateway.
  const permissions =
    session.role === "owner"
      ? ["all_permissions"]
      : session.role === "operator"
        ? ["players.view", "resources.view", "schedule.view", "history.view"]
        : [];
  return {
    name: session.username,
    permissions,
    isMaster: session.role === "owner",
    isTempPassword: false,
    csrfToken,
    arkPermissions: session.effectivePermissions,
    discordId: session.discordId,
    role: session.role,
  };
}
