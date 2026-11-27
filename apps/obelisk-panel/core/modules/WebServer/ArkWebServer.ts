// ARK host for txAdmin's web application and Socket.IO channels. Uses the same
// modular core/panel/shared layout, with the FiveM host replaced by ARK adapters.
import Koa from "koa";
import Router from "@koa/router";
import bodyParser from "koa-bodyparser";
import http from "node:http";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server as SocketIO } from "socket.io";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { authData, GatewayError, requireRole } from "../ArkCluster/Gateway";
import type { ArkGateway, Session } from "../ArkCluster/Gateway";
import type { ArkMonitor } from "../ArkMonitor";
import type { ArkRunner } from "../ArkRunner";
import type { ArkScheduler } from "../ArkScheduler";
import type { ArkResources } from "../ArkResources";

type Core = {
  gateway: ArkGateway;
  monitor: ArkMonitor;
  runner: ArkRunner;
  resources: ArkResources;
  scheduler: ArkScheduler;
};
const version = "0.1.0-ark";
const cookieValue = (headers: http.IncomingHttpHeaders, name: string) =>
  (headers.cookie || "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(name + "="))
    ?.slice(name.length + 1) || "";
const equal = (a: string, b: string) =>
  Boolean(
    a &&
      b &&
      Buffer.byteLength(a) === Buffer.byteLength(b) &&
      timingSafeEqual(Buffer.from(a), Buffer.from(b)),
  );
export class ArkWebServer {
  private app = new Koa();
  private server: http.Server;
  private io: SocketIO;
  private panelRoot = path.resolve(
    process.env.OBELISK_PANEL_DIST ||
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../panel"),
  );
  private publicOrigin = new URL(
    process.env.OBELISK_PUBLIC_URL || "http://127.0.0.1:3042",
  ).origin;
  constructor(private core: Core) {
    this.app.proxy = true; // Intended for a trusted reverse proxy on loopback.
    this.app.use(async (ctx, next) => {
      ctx.set("X-Request-Id", randomUUID());
      ctx.set("Cache-Control", "no-store");
      ctx.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      ctx.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
      );
      ctx.set("Cross-Origin-Resource-Policy", "same-origin");
      ctx.set("Cross-Origin-Opener-Policy", "same-origin");
      ctx.set("X-Content-Type-Options", "nosniff");
      ctx.set("Referrer-Policy", "no-referrer");
      ctx.set("X-Frame-Options", "DENY");
      ctx.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https://cdn.discordapp.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
      try {
        await next();
      } catch (e) {
        const error = e as Error;
        ctx.status = e instanceof GatewayError ? e.status : 503;
        ctx.body = {
          error:
            e instanceof GatewayError
              ? error.message
              : "El servicio ARK no está disponible",
          ...(ctx.status === 401 ? { logout: true, reason: "expired" } : {}),
        };
      }
    });
    this.app.use(async (ctx, next) => {
      if (!ctx.path.startsWith("/api/")) return next();
      // Preserve the authorized ARK API, secure cookies and broker redirects.
      const headers = this.core.gateway.headers(ctx.req.headers, false);
      const response = await fetch(
        new URL(ctx.originalUrl, this.core.gateway.origin),
        {
          method: ctx.method,
          headers,
          ...(["GET", "HEAD"].includes(ctx.method)
            ? {}
            : { body: Readable.toWeb(ctx.req) as any, duplex: "half" as any }),
          redirect: "manual",
          signal: AbortSignal.timeout(45000),
        } as any,
      );
      ctx.status = response.status;
      for (const [key, value] of response.headers)
        if (
          ![
            "set-cookie",
            "content-length",
            "transfer-encoding",
            "connection",
            "content-encoding",
            "content-security-policy",
          ].includes(key)
        )
          ctx.set(key, value);
      for (const value of response.headers.getSetCookie())
        ctx.append("Set-Cookie", value);
      if (
        response.status === 401 ||
        (response.status === 403 &&
          response.headers
            .getSetCookie()
            .some((value) => /^(?:__Host-session|session)=;/.test(value)))
      ) {
        await response.body?.cancel();
        ctx.body = {
          logout: true,
          reason: "expired",
          error: "Sesión caducada",
        };
        return;
      }
      ctx.body = response.body ? Readable.fromWeb(response.body as any) : null;
    });
    this.app.use(bodyParser({ jsonLimit: "128kb", enableTypes: ["json"] }));
    const router = new Router();
    router.get("/healthz", async (ctx) => {
      const backend = await fetch(new URL("/healthz", core.gateway.origin), {
        signal: AbortSignal.timeout(3000),
      });
      if (!backend.ok)
        throw new GatewayError(503, "Servicio ARK no disponible");
      ctx.body = {
        ok: true,
        product: "ObeliskPanel",
        engine: "ark",
        upstream: "txAdmin",
        version,
      };
    });
    router.get("/runtime/ark-bootstrap.js", async (ctx) => {
      let session: Session | null = null, maps: Awaited<ReturnType<ArkGateway["maps"]>>["maps"] = [], backendAvailable = true;
      try {
        session = await core.gateway.session(ctx.req.headers);
        maps = session ? (await core.gateway.maps(ctx.req.headers)).maps : [];
      } catch {session = null; backendAvailable = false;}

      const constants = {
        fxsVersion: "ASE 361.7",
        fxsOutdated: false,
        txaVersion: version,
        txaOutdated: false,
        serverTimezone: process.env.TZ || "Europe/Madrid",
        isWindows: false,
        isWebInterface: true,
        showAdvanced: true,
        hasMasterAccount: true,
        defaultTheme: "dark",
        customThemes: [],
        providerName: "ObeliskNative",
        providerLogo: undefined,
        hostConfigSource: "ARK cluster",
        server: { name: "ObeliskPanel", game: "ark", icon: undefined },
        preAuth: session
          ? authData(session, cookieValue(ctx.req.headers, "XSRF-TOKEN"))
          : false,
        arkCluster: { maps, backendAvailable },
      };
      ctx.set("Cache-Control", "no-store");
      ctx.set("Vary", "Cookie");
      ctx.type = "application/javascript";
      ctx.body =
        "window.txConsts=" +
        JSON.stringify(constants).replace(/</g, "\\u003c") +
        ";";
    });
    router.get("/auth/self", async (ctx) => {
      const session = await this.session(ctx);
      ctx.body = authData(session, cookieValue(ctx.req.headers, "XSRF-TOKEN"));
    });
    router.post("/auth/logout", async (ctx) => {
      if (
        !equal(
          String(ctx.get("X-TxAdmin-CsrfToken")),
          cookieValue(ctx.req.headers, "XSRF-TOKEN"),
        ) ||
        (ctx.get("Origin") && ctx.get("Origin") !== this.publicOrigin)
      )
        throw new GatewayError(403, "Origen de cierre de sesión inválido");
      await core.gateway.request(
        ctx.req.headers,
        "/api/auth/logout",
        "POST",
        {},
      );
      for (const name of ["__Host-session", "session", "XSRF-TOKEN"])
        ctx.cookies.set(name, "", {
          path: "/",
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          httpOnly: name !== "XSRF-TOKEN",
        });
      ctx.body = { logout: true };
    });
    router.get("/ark/cluster", async (ctx) => {
      await this.session(ctx);
      ctx.body = await core.monitor.cluster(ctx.req.headers);
    });
    router.post("/ark/cluster/action", async (ctx) => {
      const session = await this.session(ctx, true);
      requireRole(session, "owner");
      const { mapIds, action } = ctx.request.body as any;
      if (
        !Array.isArray(mapIds) ||
        !mapIds.length ||
        mapIds.length > 32 ||
        new Set(mapIds).size !== mapIds.length ||
        !["start", "stop", "restart", "save"].includes(action)
      )
        throw new GatewayError(400, "Selecciona mapas y una operación válidos");
      // Resolve every target before the first side effect. Never trust IDs from the browser.
      const maps = await Promise.all(
        mapIds.map((id) => core.gateway.selected(ctx.req.headers, id)),
      );
      const results = [];
      for (const map of maps) {
        try {
          if (action === "save") {
            const saved = await core.runner.command(
              ctx.req.headers,
              session,
              map,
              "SaveWorld",
            );
            if (!String(saved.response).includes("World Saved"))
              throw new GatewayError(409, "Guardado no confirmado");
          } else
            await core.runner.control(ctx.req.headers, session, map, action);
          results.push({ id: map.id, name: map.name, accepted: true });
        } catch (error) {
          results.push({
            id: map.id,
            name: map.name,
            accepted: false,
            error:
              error instanceof GatewayError
                ? error.message
                : "No se pudo completar la solicitud",
          });
        }
      }
      ctx.body = {
        success: results.every((result) => result.accepted),
        results,
      };
    });
    router.get("/ark/maps", async (ctx) => {
      await this.session(ctx);
      ctx.body = await core.gateway.maps(ctx.req.headers);
    });
    router.post("/fxserver/controls", async (ctx) => {
      const session = await this.session(ctx, true);
      const map = await this.map(ctx);
      ctx.body = await core.runner.control(
        ctx.req.headers,
        session,
        map,
        (ctx.request.body as any)?.action,
      );
    });
    router.post("/fxserver/commands", async (ctx) => {
      const session = await this.session(ctx, true);
      const map = await this.map(ctx);
      const body = ctx.request.body as any;
      if (body?.action !== "admin_broadcast")
        throw new GatewayError(400, "Acción ARK no disponible");
      if (
        typeof body.parameter !== "string" ||
        !body.parameter.trim() ||
        body.parameter.length > 300 ||
        /[\r\n\0]/.test(body.parameter)
      )
        throw new GatewayError(400, "Mensaje inválido");
      await core.runner.command(
        ctx.req.headers,
        session,
        map,
        "Broadcast " + body.parameter,
      );
      ctx.body = { success: true };
    });
    router.post("/ark/command", async (ctx) => {
      const session = await this.session(ctx, true);
      const map = await this.map(ctx);
      const result = await core.runner.command(
        ctx.req.headers,
        session,
        map,
        (ctx.request.body as any)?.command,
      );
      ctx.body = { success: true, ...result };
    });
    router.post("/ark/schedule", async (ctx) => {
      const session = await this.session(ctx, true);
      requireRole(session, "owner");
      ctx.body = await core.scheduler.schedule(
        ctx.req.headers,
        await this.map(ctx),
        (ctx.request.body as any)?.when,
      );
    });
    router.get("/ark/resources", async (ctx) => {
      requireRole(await this.session(ctx), "operator");
      ctx.body = await core.resources.list(
        ctx.req.headers,
        await this.map(ctx),
      );
    });
    router.post("/ark/resources/action", async (ctx) => {
      const session = await this.session(ctx, true),
        map = await this.map(ctx),
        body = ctx.request.body as any;
      ctx.body = await core.resources.action(
        ctx.req.headers,
        session,
        map,
        body?.id,
        body?.action,
      );
    });
    router.get("/fxserver/downloadLog", async (ctx) => {
      requireRole(await this.session(ctx), "owner");
      const map = await this.map(ctx);
      const data = await core.gateway.request(
        ctx.req.headers,
        `/api/server/logs?mapId=${encodeURIComponent(map.id)}&lines=2000`,
      );
      ctx.type = "text/plain";
      ctx.attachment(`${map.id}-console.log`);
      ctx.body = data.logs || data.content || "";
    });
    this.app.use(router.routes()).use(router.allowedMethods());
    this.app.use(async (ctx) => {
      if (!["GET", "HEAD"].includes(ctx.method)) return;
      if (
        ctx.path.startsWith("/ark/") ||
        ctx.path.startsWith("/fxserver/") ||
        ctx.path.startsWith("/auth/") ||
        ctx.path.startsWith("/runtime/")
      ) {
        ctx.status = 404;
        ctx.body = { error: "Ruta ARK no disponible" };
        return;
      }
      const requested = decodeURIComponent(ctx.path);
      let file = path.resolve(this.panelRoot, "." + requested);
      if (!file.startsWith(this.panelRoot + path.sep))
        file = path.join(this.panelRoot, "index.html");
      if (file.endsWith(".map")) {
        ctx.status = 404;
        return;
      }
      try {
        const info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink()) throw Error("not_file");
      } catch {
        if (path.extname(requested)) {
          ctx.status = 404;
          return;
        }
        file = path.join(this.panelRoot, "index.html");
      }
      ctx.type = path.extname(file);
      ctx.set(
        "Cache-Control",
        file.endsWith("index.html") ? "no-store" : "public, max-age=3600",
      );
      ctx.body = await fs.readFile(file);
    });
    this.server = http.createServer(this.app.callback());
    this.server.requestTimeout = 30000;
    this.server.headersTimeout = 15000;
    this.io = new SocketIO(this.server, {
      path: "/socket.io",
      maxHttpBufferSize: 16384,
      serveClient: false,
      transports: ["polling"],
      allowRequest: (req, done) => {
        if (req.headers.origin && req.headers.origin !== this.publicOrigin)
          return done(null, false);
        core.gateway
          .session(req.headers)
          .then((session) => done(null, Boolean(session)))
          .catch(() => done(null, false));
      },
    });
    this.setupSockets();
  }
  private async session(ctx: any, mutation = false): Promise<Session> {
    const session = await this.core.gateway.session(ctx.req.headers);
    if (!session) throw new GatewayError(401, "Sesión caducada");
    if (mutation) {
      const supplied = String(
        ctx.get("X-TxAdmin-CsrfToken") || ctx.get("X-XSRF-TOKEN"),
      );
      if (!equal(supplied, cookieValue(ctx.req.headers, "XSRF-TOKEN")))
        throw new GatewayError(403, "Actualiza la sesión antes de continuar");
      if (ctx.get("Origin") && ctx.get("Origin") !== this.publicOrigin)
        throw new GatewayError(403, "Origen inválido");
    }
    return session;
  }
  private map(ctx: any) {
    return this.core.gateway.selected(
      ctx.req.headers,
      ctx.get("X-Obelisk-Map") || ctx.query.map,
    );
  }
  private setupSockets() {
    const clients = new Map<string, number>();
    this.io.use(async (socket, next) => {
      try {
        const session = await this.core.gateway.session(socket.request.headers);
        if (!session) throw Error("session");
        if ((clients.get(session.id) || 0) >= 8) throw Error("limit");
        if (socket.handshake.query.uiVersion !== version)
          throw Error("version");
        if (
          !equal(
            String(socket.handshake.auth?.csrfToken || ""),
            cookieValue(socket.request.headers, "XSRF-TOKEN"),
          )
        )
          throw Error("csrf");
        socket.data.session = session;
        socket.data.map = await this.core.gateway.selected(
          socket.request.headers,
          socket.handshake.query.instance,
        );
        next();
      } catch {
        next(Error("Acceso no autorizado"));
      }
    });
    this.io.on("connection", (socket) => {
      const id = socket.data.session.id;
      clients.set(id, (clients.get(id) || 0) + 1);
      let busy = false,
        previousLog = "";
      const requestedRooms = socket.handshake.query.rooms;
      const rooms = (
        Array.isArray(requestedRooms)
          ? requestedRooms
          : [String(requestedRooms || "")]
      )
        .flatMap((value) => String(value).split(","))
        .filter((value) =>
          [
            "status",
            "playerlist",
            "ark-cluster",
            "dashboard",
            "liveconsole",
          ].includes(value),
        );
      const publish = async () => {
        if (busy || !socket.connected) return;
        busy = true;
        try {
          const session = await this.core.gateway.session(
            socket.request.headers,
          );
          if (!session) {
            socket.emit("logout", "session_revoked");
            socket.disconnect(true);
            return;
          }
          socket.data.session = session;
          const status = await this.core.monitor.status(
            socket.request.headers,
            socket.data.map,
          );
          status.scheduler = await this.core.scheduler.status(
            socket.request.headers,
            socket.data.map.id,
          );
          if (rooms.includes("status")) socket.emit("status", status);
          if (rooms.includes("ark-cluster"))
            socket.emit("arkCluster", status.ark.cluster);
          if (rooms.includes("dashboard"))
            socket.emit("dashboard", {
              ark: status.ark,
              svRuntime: {
                fxsMemory: status.ark.native?.metrics?.rss_bytes / 1048576,
              },
            });
          if (rooms.includes("liveconsole") && session.role === "owner") {
            const data = await this.core.gateway.request(
              socket.request.headers,
              `/api/server/logs?mapId=${encodeURIComponent(socket.data.map.id)}&lines=500`,
            );
            const log = Array.isArray(data.logs)
              ? data.logs.join("\n")
              : String(data.logs || data.content || "");
            if (log !== previousLog) {
              socket.emit(
                "consoleData",
                previousLog && log.startsWith(previousLog)
                  ? log.slice(previousLog.length)
                  : log + "\n",
              );
              previousLog = log;
            }
          }
        } catch {
          socket.emit("arkUnavailable", {
            message: "No se pudo actualizar el estado ARK",
          });
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(publish, 2000);
      publish();
      socket.on("consoleCommand", async (command) => {
        try {
          const session = await this.core.gateway.session(
            socket.request.headers,
          );
          if (!session) throw Error("session");
          const headers = {
            ...socket.request.headers,
            "x-xsrf-token": cookieValue(socket.request.headers, "XSRF-TOKEN"),
          };
          const result = await this.core.runner.command(
            headers,
            session,
            socket.data.map,
            command,
          );
          socket.emit(
            "consoleData",
            String(result.response || "Comando enviado") + "\n",
          );
        } catch (error) {
          socket.emit(
            "consoleData",
            "[ObeliskPanel] " +
              (error instanceof GatewayError
                ? error.message
                : "No se pudo enviar el comando") +
              "\n",
          );
        }
      });
      socket.once("disconnect", () => {
        clearInterval(timer);
        const count = (clients.get(id) || 1) - 1;
        if (count) clients.set(id, count);
        else clients.delete(id);
      });
    });
  }
  address() {
    return this.server.address();
  }
  listen(port: number, host: string) {
    return new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, host, () => {
        const address = this.server.address();
        if (
          process.env.NODE_ENV === "test" &&
          new URL(this.publicOrigin).port === "0" &&
          address &&
          typeof address !== "string"
        )
          this.publicOrigin = `http://${host}:${address.port}`;
        console.log(
          `ObeliskPanel ARK host listening on ${host}:${typeof address === "object" ? address?.port : port}`,
        );
        resolve();
      });
    });
  }
  async close() {
    await new Promise<void>((resolve) => this.io.close(() => resolve()));
  }
}
