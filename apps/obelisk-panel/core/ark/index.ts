// Standalone ARK entry for the txAdmin port. No FXServer globals or Cfx login.
import { ArkGateway } from "../modules/ArkCluster/Gateway";
import { ArkMonitor } from "../modules/ArkMonitor";
import { ArkRunner } from "../modules/ArkRunner";
import { ArkScheduler } from "../modules/ArkScheduler";
import { ArkResources } from "../modules/ArkResources";
import { ArkWebServer } from "../modules/WebServer/ArkWebServer";
process.env.TZ ||= "Europe/Madrid";
const gateway = new ArkGateway(
  process.env.OBELISK_GATEWAY_ORIGIN || "http://127.0.0.1:3041",
);
const core = {
  gateway,
  monitor: new ArkMonitor(gateway),
  runner: new ArkRunner(gateway),
  resources: new ArkResources(gateway),
  scheduler: new ArkScheduler(gateway),
};
const web = new ArkWebServer(core);
await web.listen(
  Number(process.env.PORT || 3042),
  process.env.HOST || "127.0.0.1",
);
const shutdown = async () => {
  await web.close();
  process.exit(0);
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
