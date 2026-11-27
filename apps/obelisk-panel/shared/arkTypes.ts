export type ArkMap = {
  id: string;
  name: string;
  gamePort?: number;
  queryPort?: number;
  rconPort?: number;
};
export type ArkNativeMap = ArkMap & {
  status: "connected" | "stale" | "unavailable" | "unconfigured";
  lastSeenAt?: number;
  resourceVersion?: string;
  metrics?: {
    cpu_percent: number;
    rss_bytes: number;
    uptime_seconds: number;
  } | null;
  history?: { at: number; cpu: number; rss: number }[];
  lifecycleAvailable?: boolean;
  counters?: { logins: number; logouts: number; dropped: number };
  events?: {
    kind: "login_observed" | "logout_observed";
    name: string | null;
    opaque_id: string | null;
    sequence: string;
    process_epoch: string;
    observed_at_ms: number;
  }[];
  playerCensus?: null;
  gameThread?: null;
};
export type ArkGameStatus = {
  id: string;
  name: string;
  status: string;
  map: string;
  players: number | null;
  maxPlayers: number | null;
  passwordProtected?: boolean | null;
  serverName?: string;
};
export type ArkClusterSnapshot = {
  schema: string;
  observedAt: number;
  freshnessMs: number;
  maps: ArkNativeMap[];
  publicStatus: { maps: ArkGameStatus[] };
};
export type ArkContext = {
  instance: ArkMap;
  native?: ArkNativeMap;
  game?: ArkGameStatus;
  cluster: ArkClusterSnapshot;
};
