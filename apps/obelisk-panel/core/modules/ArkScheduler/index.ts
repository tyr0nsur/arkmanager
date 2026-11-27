import type { IncomingHttpHeaders } from "node:http";
import {
  ArkGateway,
  GatewayError,
  type MapConfig,
} from "../ArkCluster/Gateway";
export class ArkScheduler {
  constructor(private gateway: ArkGateway) {}
  async status(headers: IncomingHttpHeaders, mapId: string) {
    try {
      const data = await this.gateway.request(
        headers,
        "/api/scheduler/restarts",
      );
      const next = data.jobs
        .filter((job: any) => job.mapId === mapId && job.state === "pending")
        .sort((a: any, b: any) => a.dueAt - b.dueAt)[0];
      return {
        nextRelativeMs: next ? Math.max(0, next.dueAt - Date.now()) : false,
        nextSkip: false,
        nextIsTemp: Boolean(next),
      };
    } catch {
      return { nextRelativeMs: false, nextSkip: false, nextIsTemp: false };
    }
  }
  async schedule(headers: IncomingHttpHeaders, map: MapConfig, when: unknown) {
    if (typeof when !== "string")
      throw new GatewayError(400, "Indica +MM o HH:MM");
    let dueAt = 0;
    if (/^\+[1-9]\d{0,3}$/.test(when))
      dueAt = Date.now() + Number(when.slice(1)) * 60000;
    else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(when)) {
      const date = new Date(),
        [hour, minute] = when.split(":").map(Number);
      date.setHours(hour, minute, 0, 0);
      if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
      dueAt = date.getTime();
    }
    if (!dueAt) throw new GatewayError(400, "Indica +MM o HH:MM");
    return this.gateway.request(headers, "/api/scheduler/restarts", "POST", {
      mapId: map.id,
      dueAt,
    });
  }
}
