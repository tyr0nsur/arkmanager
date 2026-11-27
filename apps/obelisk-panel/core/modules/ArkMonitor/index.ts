import type { IncomingHttpHeaders } from "node:http";
import { ArkGateway, type MapConfig } from "../ArkCluster/Gateway";
export class ArkMonitor {
  private cache = new Map<string, { at: number; value: Promise<any> }>();
  constructor(private gateway: ArkGateway) {}
  private async sample(
    headers: IncomingHttpHeaders,
    endpoint: string,
    ttl: number,
  ) {
    const session = await this.gateway.session(headers);
    if (!session) throw Error("session_expired");
    const key =
      session.role +
      JSON.stringify([...session.effectivePermissions].sort()) +
      endpoint;
    const previous = this.cache.get(key);
    if (previous && Date.now() - previous.at < ttl) return previous.value;
    const value = this.gateway.request(headers, endpoint);
    this.cache.set(key, { at: Date.now(), value });
    try {
      return await value;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }
  async cluster(headers: IncomingHttpHeaders) {
    const [monitor, publicStatus] = await Promise.all([
      this.sample(headers, "/api/monitor/cluster", 1000),
      this.sample(headers, "/api/cluster/status", 10000),
    ]);
    return { ...monitor, publicStatus };
  }
  async status(headers: IncomingHttpHeaders, map: MapConfig) {
    const data = await this.cluster(headers);
    const native = data.maps.find((item: any) => item.id === map.id);
    const game = data.publicStatus.maps.find((item: any) => item.id === map.id);
    const fresh =
      native?.status === "connected" &&
      Date.now() - native.lastSeenAt <= data.freshnessMs;
    const alive = fresh || game?.status === "online";
    return {
      configState: "ready",
      discord: 0,
      runner: { isIdle: !alive, isChildAlive: alive },
      server: {
        name: game?.serverName || map.name,
        uptime: fresh ? (native.metrics?.uptime_seconds || 0) * 1000 : 0,
        health:
          game?.status === "online" && fresh
            ? "ONLINE"
            : alive
              ? "PARTIAL"
              : "OFFLINE",
        healthReason: fresh
          ? "Monitor nativo conectado"
          : "Sin una señal reciente del monitor nativo",
        whitelist: "disabled",
      },
      scheduler: { nextRelativeMs: false as boolean | number, nextSkip: false, nextIsTemp: false },
      ark: { native, game, instance: map, cluster: data },
    };
  }
}
