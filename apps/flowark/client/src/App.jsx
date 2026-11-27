import { Component, Suspense, lazy, useEffect, useMemo } from 'react';
import { useDashboard } from './context/DashboardContext.jsx';
import axios from 'axios';
import Login from './components/Login';
import { Sidebar } from './components/layout/Sidebar';
import { GlobalPlayersSidebar } from './components/layout/GlobalPlayersSidebar';
import { TopNavbar } from './components/layout/TopNavbar';
import { OperationalContextBar } from './components/layout/OperationalContextBar';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { DashboardToaster } from './components/ui/DashboardToaster';
import { PLAYER_PANEL_DESKTOP_TABS, canAccessDashboardTab } from './constants/dashboard';

// Lazy loaded views for better initial load performance
const ClusterOverview = lazy(() => import('./pages/ClusterOverview').then(m => ({ default: m.ClusterOverview })));
const ServerDashboard = lazy(() => import('./pages/ServerDashboard').then(m => ({ default: m.ServerDashboard })));
const PlayersView = lazy(() => import('./pages/PlayersView').then(m => ({ default: m.PlayersView })));
const BansView = lazy(() => import('./pages/BansView').then(m => ({ default: m.BansView })));
const AuditLogView = lazy(() => import('./pages/AuditLogView').then(m => ({ default: m.AuditLogView })));
const RconConsole = lazy(() => import('./pages/RconConsole').then(m => ({ default: m.RconConsole })));
const DeployView = lazy(() => import('./pages/DeployView').then(m => ({ default: m.DeployView })));
const GlobalSettings = lazy(() => import('./pages/GlobalSettings').then(m => ({ default: m.GlobalSettings })));
const SystemHealth = lazy(() => import('./pages/SystemHealth').then(m => ({ default: m.SystemHealth })));
const SettingsView = lazy(() => import('./pages/SettingsView').then(m => ({ default: m.SettingsView })));
const FileManager = lazy(() => import('./pages/FileManager').then(m => ({ default: m.FileManager })));
const AdminsView = lazy(() => import('./pages/AdminsView').then(m => ({ default: m.AdminsView })));
const TasksManager = lazy(() => import('./pages/TasksManager').then(m => ({ default: m.TasksManager })));
const HubView = lazy(() => import('./pages/HubView').then(m => ({ default: m.HubView })));
const GameModesView = lazy(() => import('./pages/GameModesView').then(m => ({ default: m.GameModesView })));
const PluginsView = lazy(() => import('./pages/PluginsView').then(m => ({ default: m.PluginsView })));

axios.defaults.withCredentials = true;

axios.interceptors.request.use(config => {
    // Read XSRF-TOKEN from cookies for CSRF protection
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
    if (match) {
        config.headers['X-XSRF-TOKEN'] = match[1];
    }
    return config;
});

axios.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status;
    const url = String(error?.config?.url || '');
    if (status === 401 && !/\/auth\/(?:login|verify|logout)\b/.test(url)) {
      window.dispatchEvent(new CustomEvent('dashboard:session-expired'));
    }
    return Promise.reject(error);
  },
);

const DEFAULT_DOCUMENT_TITLE = 'ObeliskNative';

function titlePercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '0%';
  return `${Math.max(0, Math.min(100, parsed)).toFixed(0)}%`;
}

export function buildDashboardTitle({ onlinePlayers = [], clusterStatus = {}, clusterMaps = [] } = {}) {
  const globalPlayerCount = Array.isArray(onlinePlayers) ? onlinePlayers.length : 0;
  const statusMaps = Array.isArray(clusterStatus?.maps) ? clusterStatus.maps : [];
  const onlineInstanceCount = statusMaps.filter(map => map?.status === 'online').length;
  const configuredInstanceCount = Array.isArray(clusterMaps) ? clusterMaps.length : 0;
  const instanceCount = Math.max(configuredInstanceCount, statusMaps.length);

  return `ObeliskNative | ${globalPlayerCount} Players | ONLINE ${onlineInstanceCount}/${instanceCount} INSTANCES | CPU: ${titlePercent(clusterStatus?.cpu)} | RAM: ${titlePercent(clusterStatus?.ram)}`;
}

function FallbackLoader() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center h-full opacity-50">
      <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
      <p className="text-zinc-400 text-sm animate-pulse">Cargando módulo...</p>
    </div>
  );
}

function isStaleAssetError(error) {
  const message = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed|ChunkLoadError|dynamically imported module/i.test(message);
}

class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Dashboard view failed to render', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const staleAsset = isStaleAssetError(error);
    const title = staleAsset ? 'Actualización pendiente' : 'Vista no disponible';
    const message = staleAsset
      ? 'El panel se ha actualizado y tu navegador conserva una versión anterior de los módulos.'
      : 'La vista activa no se pudo renderizar. Recarga el panel para volver a un estado limpio.';

    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-zinc-800 bg-[#111113] p-6 text-center">
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">ObeliskNative</p>
          <h1 className="mt-3 text-2xl font-bold text-white">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-cyan-500 px-5 text-sm font-semibold text-[#09090b] transition-colors hover:bg-cyan-400"
          >
            Recargar panel
          </button>
        </div>
      </section>
    );
  }
}

function App() {
  const {
    user,
    authChecked,
    activeTab,
    userRole,
    modal,
    setModal,
    onlinePlayers,
    clusterStatus,
    clusterMaps,
  } = useDashboard();
  const dashboardTitle = useMemo(
    () => (user ? buildDashboardTitle({ onlinePlayers, clusterStatus, clusterMaps }) : DEFAULT_DOCUMENT_TITLE),
    [user, onlinePlayers, clusterStatus, clusterMaps],
  );

  useEffect(() => {
    document.title = dashboardTitle;
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [dashboardTitle]);

  if (!authChecked) return <><DashboardToaster /><FallbackLoader /></>;
  if (!user) return <><DashboardToaster /><Login /></>;
  const currentTab = canAccessDashboardTab(activeTab, userRole) ? activeTab : 'cluster';
  const dockPlayersPanel = PLAYER_PANEL_DESKTOP_TABS.has(currentTab);

  return (
    <div className="obelisk-app dashboard-shell flex min-h-[100dvh] w-full flex-col overflow-y-auto bg-[#09090b] font-sans text-zinc-100 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <TopNavbar />

	      <DashboardToaster />

      {/* Modals */}
      {modal && <ConfirmModal modal={modal} onClose={() => setModal(null)} />}

	      <div className="flex min-h-0 w-full flex-1 flex-col gap-4 overflow-visible p-3 sm:p-4 lg:gap-5 lg:overflow-hidden lg:p-5 xl:flex-row">
          {/* Left Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <main className="relative min-h-0 min-w-0 flex-1 overflow-visible lg:overflow-hidden">
            <div className="relative z-10 flex h-full min-h-0 flex-col">
              <OperationalContextBar />
              <div className="flex min-h-0 flex-1 overflow-visible lg:overflow-hidden">
                <DashboardErrorBoundary key={currentTab}>
                  <Suspense fallback={<FallbackLoader />}>
                    {currentTab === 'cluster' && <ClusterOverview />}
                    {currentTab === 'dashboard' && <ServerDashboard />}
                    {currentTab === 'players' && <PlayersView />}
                    {currentTab === 'bans' && <BansView />}
                    {currentTab === 'audit' && <AuditLogView />}
                    {currentTab === 'rcon' && <RconConsole />}
                    {currentTab === 'settings' && <SettingsView />}
                    {currentTab === 'files' && <FileManager />}
                    {currentTab === 'admins' && <AdminsView />}
                    {currentTab === 'tasks' && <TasksManager />}
                    {currentTab === 'hub' && <HubView />}
                    {currentTab === 'game_modes' && <GameModesView />}
                    {currentTab === 'plugins' && <PluginsView />}
                    {currentTab === 'deploy' && <DeployView />}
                    {currentTab === 'global_settings' && <GlobalSettings />}
                    {currentTab === 'system_health' && <SystemHealth />}
                  </Suspense>
                </DashboardErrorBoundary>
              </div>
            </div>
          </main>

          {/* Right Sidebar: Global Players */}
          <GlobalPlayersSidebar desktopDocked={dockPlayersPanel} />
      </div>
    </div>
  );
}

export default App;
