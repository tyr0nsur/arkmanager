import { lazy, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Route as WouterRoute, Switch } from "wouter";
import { PageErrorFallback } from "@/components/ErrorFallback";
import { useAtomValue, useSetAtom } from "jotai";
import {
  contentRefreshKeyAtom,
  pageErrorStatusAtom,
  useSetPageTitle,
} from "@/hooks/pages";
import { selectedMapIdAtom } from "@/hooks/arkClusterState";
import { navigate } from "wouter/use-browser-location";
import { useAdminPerms } from "@/hooks/auth";
import GenericSpinner from "@/components/GenericSpinner";
import UnauthorizedPage from "@/pages/UnauthorizedPage";
import NotFound from "@/pages/NotFound";
const Cluster = lazy(() => import("@/pages/Ark/ClusterPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard/DashboardPage"));
const Console = lazy(() => import("@/pages/LiveConsole/LiveConsolePage"));
const Players = lazy(() => import("@/pages/Ark/PlayersPage"));
const History = lazy(() => import("@/pages/Ark/HistoryPage"));
const Resources = lazy(() => import("@/pages/Ark/ResourcesPage"));
const Config = lazy(() => import("@/pages/Ark/ConfigEditorPage"));
const ServerLog = lazy(() => import("@/pages/Ark/ServerLogPage"));
const Admins = lazy(() => import("@/pages/Ark/AdminsPage"));
const Audit = lazy(() => import("@/pages/Ark/AuditPage"));
const Hub = lazy(() => import("@/pages/Ark/HubPage"));
const Tasks = lazy(() => import("@/pages/Ark/TasksPage"));
const Settings = lazy(() => import("@/pages/Ark/SettingsPage"));
const Diagnostics = lazy(() => import("@/pages/Ark/DiagnosticsPage"));
const Bans = lazy(() => import("@/pages/Ark/BansPage"));
const routes = [
  { path: "/cluster", title: "Clúster ARK", Page: Cluster },
  { path: "/", title: "Resumen del mapa", Page: Dashboard },
  {
    path: "/players",
    title: "Jugadores del clúster",
    permission: "players.view",
    Page: Players,
  },
  {
    path: "/history",
    title: "Historial",
    permission: "history.view",
    Page: History,
  },
  {
    path: "/insights/player-drops",
    title: "Actividad del juego",
    permission: "players.view",
    Page: Players,
  },
  {
    path: "/allowlist",
    title: "Baneos de ARK",
    permission: "history.view",
    Page: Bans,
  },
  {
    path: "/bans",
    title: "Baneos de ARK",
    permission: "history.view",
    Page: Bans,
  },
  {
    path: "/server/console",
    title: "Consola ARK",
    permission: "console.view",
    Page: Console,
  },
  {
    path: "/server/resources",
    title: "Recursos nativos",
    permission: "resources.view",
    Page: Resources,
  },
  {
    path: "/server/cfg-editor",
    title: "Editor INI",
    permission: "server.cfg.editor",
    Page: Config,
  },
  {
    path: "/server/server-log",
    title: "Registro del servidor",
    permission: "server.log.view",
    Page: ServerLog,
  },
  {
    path: "/admins",
    title: "Administradores",
    permission: "manage.admins",
    Page: Admins,
  },
  {
    path: "/settings",
    title: "Configuración del panel",
    permission: "settings.view",
    Page: Settings,
  },
  {
    path: "/hub",
    title: "Hub de recursos",
    permission: "resources.view",
    Page: Hub,
  },
  {
    path: "/tasks",
    title: "Programación",
    permission: "schedule.view",
    Page: Tasks,
  },
  {
    path: "/system/action-log",
    title: "Auditoría",
    permission: "txadmin.log.view",
    Page: Audit,
  },
  {
    path: "/system/console-log",
    title: "Registro del servidor",
    permission: "server.log.view",
    Page: ServerLog,
  },
  {
    path: "/system/diagnostics",
    title: "Diagnóstico Linux",
    permission: "all_permissions",
    Page: Diagnostics,
  },
  {
    path: "/advanced",
    title: "Diagnóstico ARK",
    permission: "all_permissions",
    Page: Diagnostics,
  },
];
function PortRoute({
  route,
}: {
  route: (typeof routes)[number];
  path?: string;
}) {
  const { hasPerm } = useAdminPerms(),
    setTitle = useSetPageTitle();
  setTitle(route.title);
  return (
    <WouterRoute path={route.path}>
      {route.permission && !hasPerm(route.permission) ? (
        <UnauthorizedPage
          pageName={route.title}
          permission={route.permission}
        />
      ) : (
        <route.Page />
      )}
    </WouterRoute>
  );
}
export function MainRouterInner() {
  return (
    <Suspense fallback={<GenericSpinner msg="Cargando apartado…" />}>
      <Switch>
        {routes.map((route) => (
          <PortRoute key={route.path} path={route.path} route={route} />
        ))}
        <WouterRoute component={NotFound} />
      </Switch>
    </Suspense>
  );
}
export default function MainRouter() {
  const refresh = useAtomValue(contentRefreshKeyAtom),
    map = useAtomValue(selectedMapIdAtom),
    setError = useSetAtom(pageErrorStatusAtom);
  return (
    <ErrorBoundary
      key={refresh + ":" + map}
      FallbackComponent={PageErrorFallback}
      onError={() => setError(true)}
      onReset={() => {
        navigate("/cluster");
        setError(false);
      }}
    >
      <MainRouterInner />
    </ErrorBoundary>
  );
}
