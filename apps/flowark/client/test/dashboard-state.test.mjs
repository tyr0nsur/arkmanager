import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { DEFAULT_TAB, VALID_TABS, QUICK_ACTIONS, canAccessDashboardTab, dashboardNavSectionsForRole, normalizeDashboardTab, normalizeDashboardTabForRole } from '../src/constants/dashboard.js';
import { ADMIN_PASSWORD_MAX_BYTES, adminPasswordValidationMessage, isValidAdminPassword, isValidAdminUsername } from '../src/constants/adminValidation.js';
import { ROLE_OPTIONS, roleInfo } from '../src/constants/roles.js';
import { parseConfigLine, replaceConfigLineValue } from '../src/utils/configLine.js';
import { getNextCronExecutions, parseCronExpression } from '../src/utils/cronPreview.js';
import { cronMinuteInterval, deriveTaskCronDraft, taskCronDraftSummary } from '../src/utils/taskCron.js';

test('dashboard tab normalization falls back to cluster for invalid hashes', () => {
    assert.equal(DEFAULT_TAB, 'cluster');
    assert.equal(normalizeDashboardTab('players'), 'players');
    assert.equal(normalizeDashboardTab('global_settings'), 'global_settings');
    assert.equal(normalizeDashboardTab(''), 'cluster');
    assert.equal(normalizeDashboardTab('unknown'), 'cluster');
    assert.equal(normalizeDashboardTab('../files'), 'cluster');
});

test('mobile global navigation exposes every operational dashboard section', async () => {
    const source = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');
    const tabButtonSource = await readFile(new URL('../src/components/ui/TabButton.jsx', import.meta.url), 'utf8');
    const playersSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');
    const mobileNavBlock = source.match(/<nav[^>]+aria-label="Navegación del panel"/);
    assert.ok(mobileNavBlock, 'mobile navigation block should be present');

    const ownerTabs = dashboardNavSectionsForRole('owner').flatMap(section => section.items.map(item => item.id));
    for (const tab of ['cluster', 'players', 'bans', 'tasks', 'admins', 'audit', 'global_settings', 'system_health', 'plugins', 'deploy']) {
        assert.ok(ownerTabs.includes(tab), `owner nav should include ${tab}`);
    }
    assert.match(source, /const panelNavSections = dashboardNavSectionsForRole\(userRole\)/);
    assert.match(source, /panelNavSections\.map\(section =>/);
    assert.match(source, /setActiveTab\(item\.id\)/);
    assert.match(tabButtonSource, /min-h-11/);
    assert.match(tabButtonSource, /md:min-h-10/);
    assert.match(tabButtonSource, /min-w-0/);
    assert.match(tabButtonSource, /truncate text-left/);
    assert.match(source, /Navegación del panel/);
    assert.match(source, /aria-label="Navegación del panel"/);
    assert.doesNotMatch(playersSource, /Mobile Secondary Navigation/);
    assert.doesNotMatch(playersSource, /Navegación del panel/);
});

test('mobile operational controls expose touch-friendly targets', async () => {
    const actionBtnSource = await readFile(new URL('../src/components/ui/ActionBtn.jsx', import.meta.url), 'utf8');
    const tabButtonSource = await readFile(new URL('../src/components/ui/TabButton.jsx', import.meta.url), 'utf8');
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');
    const playersSidebarSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');

    assert.match(actionBtnSource, /h-10 w-10/);
    assert.match(actionBtnSource, /md:h-8 md:w-8/);
    assert.match(topNavSource, /h-11 w-11/);
    assert.match(tabButtonSource, /min-h-11/);
    assert.match(tabButtonSource, /md:min-h-10/);
    assert.match(sidebarSource, /min-h-11/);
    assert.match(sidebarSource, /md:min-h-10/);
    assert.match(sidebarSource, /aria-label=\{liveData\?\.status === 'online' \? 'Detener mapa seleccionado' : 'Arrancar mapa seleccionado'\}/);
    assert.match(sidebarSource, /aria-label="Reiniciar mapa seleccionado"/);
    assert.match(sidebarSource, /aria-label="Reiniciar cluster completo"/);
    assert.match(playersSidebarSource, /min-h-10/);
    assert.match(playersSidebarSource, /md:min-h-8/);
});

test('mobile drawers expose labelled controls and receive focus when opened', async () => {
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');
    const playersSidebarSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');

    assert.match(topNavSource, /aria-controls="server-navigation-drawer"/);
    assert.match(topNavSource, /aria-controls="players-navigation-drawer"/);
    assert.match(topNavSource, /aria-expanded=\{mobileNavOpen\}/);
    assert.match(topNavSource, /aria-expanded=\{mobilePlayersOpen\}/);

    for (const source of [sidebarSource, playersSidebarSource]) {
        assert.match(source, /const drawerRef = useRef\(null\)/);
        assert.match(source, /const previousFocusRef = useRef\(null\)/);
        assert.match(source, /const drawerInactive = !mobile[A-Za-z]+Open/);
        assert.match(source, /aria-hidden=\{drawerInactive \? 'true' : undefined\}/);
        assert.match(source, /inert=\{drawerInactive \? '' : undefined\}/);
        assert.match(source, /drawerInactive \? 'pointer-events-none' : ''/);
        assert.match(source, /const previousBodyOverflow = document\.body\.style\.overflow/);
        assert.match(source, /previousFocusRef\.current = document\.activeElement instanceof HTMLElement \? document\.activeElement : null/);
        assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
        assert.match(source, /drawerRef\.current\?\.focus\(\)/);
        assert.match(source, /document\.body\.style\.overflow = previousBodyOverflow/);
        assert.match(source, /previousFocusRef\.current\?\.focus\?\.\(\{ preventScroll: true \}\)/);
        assert.match(source, /previousFocusRef\.current = null/);
        assert.match(source, /tabIndex=\{mobile[A-Za-z]+Open \? -1 : undefined\}/);
        assert.match(source, /role=\{mobile[A-Za-z]+Open \? 'dialog' : undefined\}/);
    }

    assert.match(sidebarSource, /id="server-navigation-drawer"/);
    assert.match(sidebarSource, /const DESKTOP_NAV_QUERY = '\(min-width: 1280px\)'/);
    assert.match(sidebarSource, /window\.matchMedia\(DESKTOP_NAV_QUERY\)/);
    assert.match(sidebarSource, /aria-label="Cerrar navegación de servidor"/);
    assert.match(playersSidebarSource, /id="players-navigation-drawer"/);
    assert.match(playersSidebarSource, /const DESKTOP_PLAYERS_QUERY = '\(min-width: 1536px\)'/);
    assert.match(playersSidebarSource, /window\.matchMedia\(DESKTOP_PLAYERS_QUERY\)/);
    assert.match(playersSidebarSource, /2xl:hidden/);
    assert.match(playersSidebarSource, /aria-label="Cerrar panel de jugadores"/);
});

test('top navbar exposes logout on mobile and desktop', async () => {
    const source = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');

    assert.match(source, /onClick=\{handleLogout\}/);
    assert.match(source, /logoutPending/);
    assert.match(source, /disabled=\{logoutPending\}/);
    assert.doesNotMatch(source, /sm:hidden[^"]*text-zinc-400[^"]*hover:text-red-300/);
    assert.match(source, /aria-label="Cerrar Sesión"/);
    assert.match(source, /Cerrar Sesión/);
    assert.doesNotMatch(source, /global-settings/);
});

test('login exposes only Discord and handles provider availability', async () => {
    const source = await readFile(new URL('../src/components/Login.jsx', import.meta.url), 'utf8');
    assert.match(source, /Acceder con Discord/);
    assert.match(source, /href="\/api\/auth\/oidc\/start"/);
    assert.match(source, /role="alert"/);
    assert.doesNotMatch(source, /type="password"|auth\/login|login-username/);
});

test('auth and search forms expose explicit accessible labels', async () => {
    const loginSource = await readFile(new URL('../src/components/Login.jsx', import.meta.url), 'utf8');
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const playersSource = await readFile(new URL('../src/pages/PlayersView.jsx', import.meta.url), 'utf8');
    const bansSource = await readFile(new URL('../src/pages/BansView.jsx', import.meta.url), 'utf8');
    const globalPlayersSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');

    assert.match(loginSource, /aria-labelledby="login-title"/);
    assert.doesNotMatch(topNavSource, /type="password"/);

    assert.match(playersSource, /<label[^>]*>[\s\S]*Buscar jugador por nombre o ID[\s\S]*<input/);
    assert.match(bansSource, /htmlFor="bans-search" className="sr-only"/);
    assert.match(bansSource, /id="bans-search"/);
    assert.match(bansSource, /aria-label="Actualizar baneos"/);
    assert.match(globalPlayersSource, /htmlFor="connected-players-map-filter" className="sr-only"/);
    assert.match(globalPlayersSource, /id="connected-players-map-filter"/);
    assert.match(globalPlayersSource, /htmlFor="connected-players-search" className="sr-only"/);
    assert.match(globalPlayersSource, /id="connected-players-search"/);
});

test('persistent navigation contains each authorized destination exactly once', () => {
    const owner = dashboardNavSectionsForRole('owner').flatMap(section => section.items.map(item => item.id));
    assert.deepEqual(owner.slice().sort(), VALID_TABS.slice().sort());
    assert.equal(new Set(owner).size, owner.length);
    for (const role of ['viewer', 'operator']) {
        const visible = dashboardNavSectionsForRole(role).flatMap(section => section.items.map(item => item.id));
        assert.ok(visible.every(tab => canAccessDashboardTab(tab, role)));
        assert.equal(visible.includes('admins'), false);
    }
});

test('top navbar tab changes close profile and mobile overlays', async () => {
    const source = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');

    assert.match(source, /const closeNavigationOverlays = \(\) => \{/);
    assert.match(source, /setProfileOpen\(false\)/);
    assert.match(source, /setMobileNavOpen\(false\)/);
    assert.match(source, /setMobilePlayersOpen\(false\)/);
    assert.match(source, /const navigateTopTab = tab => \{\s+setActiveTab\(tab\);\s+closeNavigationOverlays\(\);/);
    assert.match(source, /aria-haspopup="menu"[\s\S]*aria-expanded=\{profileOpen\}/);
});

test('moderation navigation labels match their destination views', async () => {
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const playersSource = await readFile(new URL('../src/pages/PlayersView.jsx', import.meta.url), 'utf8');

    assert.doesNotMatch(topNavSource, /navigateTopTab\('bans'\)[\s\S]{0,240}Historial/);
    assert.match(topNavSource, /title="Jugadores"/);
    assert.match(playersSource, /<h1[^>]*>Jugadores<\/h1>/);
    assert.match(playersSource, /Sesiones del mapa/);
    assert.match(playersSource, /Sin censo completo/);
});

test('profile menu identifies Discord access without password controls', async () => {
    const source = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    assert.match(source, /Sesión verificada con Discord/);
    assert.doesNotMatch(source, /auth\/password|Cambiar Contraseña/);
});

test('logout handler clears local session state even when server logout fails', async () => {
    const source = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(source, /catch\(err\) \{ \/\* ignore \*\/ \}/);
    assert.match(source, /const \[logoutPending, setLogoutPending\] = useState\(false\)/);
    assert.match(source, /if \(logoutPending\) return/);
    assert.match(source, /setLogoutPending\(true\)/);
    assert.match(source, /setUser\(null\)/);
    assert.match(source, /setUserRole\('viewer'\)/);
    assert.match(source, /function clearDashboardAuthCookies\(\) \{/);
    assert.match(source, /clearDashboardAuthCookies\(\)/);
    assert.match(source, /for \(const cookieName of \['XSRF-TOKEN', 'session', '__Host-session'\]\)/);
    assert.match(source, /document\.cookie = `\$\{cookieName\}=; Max-Age=0; path=\/; SameSite=Strict`/);
    assert.match(source, /document\.cookie = `\$\{cookieName\}=; Max-Age=0; path=\/; SameSite=Strict; Secure`/);
    assert.match(source, /window\.location\.replace\('\/'\)/);
});

test('app waits for auth verification before rendering a role-bearing session', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[authChecked, setAuthChecked\] = useState\(false\)/);
    assert.match(stateSource, /finally \{\s*setAuthChecked\(true\);/);
    assert.match(stateSource, /const normalized = authChecked \? normalizeDashboardTabForRole\(tab, userRole\) : normalizeDashboardTab\(tab\)/);
    assert.match(stateSource, /if \(!authChecked\) return;\s+const normalized = normalizeDashboardTabForRole\(activeTab, userRole\)/);
    assert.match(stateSource, /\}, \[activeTab, authChecked, userRole\]\)/);
    assert.match(appSource, /if \(!authChecked\) return <><DashboardToaster \/><FallbackLoader \/><\/>/);
    assert.doesNotMatch(appSource, /setUserRole\(loginUser\.role \|\| 'viewer'\)/);
});

test('expired authenticated API sessions clear local role state consistently', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(appSource, /axios\.interceptors\.response\.use\(/);
    assert.match(appSource, /status === 401/);
    assert.match(appSource, /!\/\\\/auth\\\/\(\?:login\|verify\|logout\)\\b\/\.test\(url\)/);
    assert.match(appSource, /window\.dispatchEvent\(new CustomEvent\('dashboard:session-expired'\)\)/);
    assert.match(appSource, /return Promise\.reject\(error\)/);

    assert.match(stateSource, /const sessionExpiredHandledRef = useRef\(false\)/);
    assert.match(stateSource, /window\.addEventListener\('dashboard:session-expired', handleSessionExpired\)/);
    assert.match(stateSource, /window\.removeEventListener\('dashboard:session-expired', handleSessionExpired\)/);
    assert.match(stateSource, /if \(sessionExpiredHandledRef\.current\) return/);
    assert.match(stateSource, /sessionExpiredHandledRef\.current = true/);
    assert.match(stateSource, /clearDashboardAuthCookies\(\)/);
    assert.match(stateSource, /setUser\(null\)/);
    assert.match(stateSource, /setUserRole\('viewer'\)/);
    assert.match(stateSource, /setAuthChecked\(true\)/);
    assert.match(stateSource, /setLogoutPending\(false\)/);
    assert.match(stateSource, /setActiveTabState\(normalizeDashboardTab\('cluster'\)\)/);
    assert.match(stateSource, /Sesión caducada\. Inicia sesión de nuevo\./);
    assert.match(stateSource, /sessionExpiredHandledRef\.current = false/);

    assert.match(appSource, /import \{ DashboardToaster \} from '\.\/components\/ui\/DashboardToaster'/);
    assert.match(appSource, /if \(!authChecked\) return <><DashboardToaster \/><FallbackLoader \/><\/>/);
    assert.match(appSource, /if \(!user\) return <><DashboardToaster \/><Login \/><\/>/);
});

test('app presents a reload path for stale lazy-loaded build assets', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    assert.match(appSource, /class DashboardErrorBoundary extends Component/);
    assert.match(appSource, /function isStaleAssetError\(error\)/);
    assert.match(appSource, /Failed to fetch dynamically imported module/);
    assert.match(appSource, /ChunkLoadError/);
    assert.match(appSource, /Actualización pendiente/);
    assert.match(appSource, /Recargar panel/);
    assert.match(appSource, /window\.location\.reload\(\)/);
    assert.match(appSource, /<DashboardErrorBoundary key=\{currentTab\}>/);
    assert.match(appSource, /<Suspense fallback=\{<FallbackLoader \/>\}>/);
});

test('frontend document uses production panel metadata instead of scaffold defaults', async () => {
    const htmlSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(htmlSource, /<html lang="es">/);
    assert.match(htmlSource, /<title>ObeliskNative<\/title>/);
    assert.match(htmlSource, /name="description" content="ObeliskNative: consola, jugadores, clusters, plugins y artifacts para ARK en Linux\."/);
    assert.match(htmlSource, /name="robots" content="noindex,nofollow,noarchive"/);
    assert.match(htmlSource, /name="theme-color" content="#09090b"/);
    assert.doesNotMatch(htmlSource, /<title>client<\/title>|<html lang="en">/);
});

test('app title summarizes global players instances and host utilization', async () => {
    const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const helper = source.match(/function titlePercent\([^]*?\n\}/)?.[0];
    const implementation = source.match(/export function buildDashboardTitle\([^]*?\n\}/)?.[0]?.replace('export ', '');
    assert.ok(helper && implementation);
    const build = runInNewContext(`${helper}\n${implementation}\nbuildDashboardTitle`);
    assert.match(build(), /^ObeliskNative \| 0 Players \| ONLINE 0\/0/);
    const title = build({ onlinePlayers: [{}, {}], clusterStatus: { maps: [{status:'online'}, {status:'offline'}], cpu: 150, ram: 'NaN' }, clusterMaps: [{},{},{}] });
    assert.match(title, /2 Players \| ONLINE 1\/3/);
    assert.match(title, /CPU: 100% \| RAM: 0%/);
    assert.match(source, /document\.title = dashboardTitle/);
    assert.match(source, /document\.title = DEFAULT_DOCUMENT_TITLE/);
});

test('client css does not depend on external font providers blocked by CSP', async () => {
    const source = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('first-party terminal styling is CSP compatible', async () => {
    const rconSource = await readFile(new URL('../src/pages/RconConsole.jsx', import.meta.url), 'utf8');
    const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
    const faviconSource = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');

    assert.doesNotMatch(rconSource, /<style/);
    assert.match(cssSource, /\.xterm-viewport/);
    assert.match(cssSource, /\.xterm \.xterm-scroll-area/);
    assert.doesNotMatch(faviconSource, /<style|style=/);
});

test('first-party views keep scripts and external styles out of rendered markup', async () => {
    for (const file of ['../src/components/ui/ConfirmModal.jsx', '../src/components/deployer/NodesList.jsx', '../src/pages/SystemHealth.jsx', '../src/pages/ServerDashboard.jsx', '../src/pages/ClusterOverview.jsx']) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /dangerouslySetInnerHTML|<script\b|<link\b[^>]*https:/);
    }
    // Local numeric style attributes are compatible with the documented CSP;
    // script-src remains strict and is verified by server integration tests.
});

test('client dependency overrides keep Monaco DOMPurify on the patched line', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

    assert.match(pkg.overrides?.dompurify || '', /\^3\.4\./);
    assert.match(lock.packages?.['node_modules/dompurify']?.version || '', /^3\.4\./);
});

test('rcon terminal uses maintained xterm packages only', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
    const source = await readFile(new URL('../src/pages/RconConsole.jsx', import.meta.url), 'utf8');

    assert.ok(pkg.dependencies?.['@xterm/xterm']);
    assert.ok(pkg.dependencies?.['@xterm/addon-fit']);
    assert.equal(pkg.dependencies?.xterm, undefined);
    assert.equal(pkg.dependencies?.['xterm-addon-fit'], undefined);
    assert.equal(lock.packages?.['node_modules/xterm'], undefined);
    assert.equal(lock.packages?.['node_modules/xterm-addon-fit'], undefined);
    assert.match(source, /@xterm\/xterm/);
    assert.match(source, /@xterm\/addon-fit/);
});

test('client package manifest excludes unused router and store dependencies', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));

    for (const name of ['react-router-dom', 'zustand']) {
        assert.equal(pkg.dependencies?.[name], undefined);
        assert.equal(lock.packages?.[`node_modules/${name}`], undefined);
    }
});

test('vite build splits heavyweight dashboard dependencies into stable chunks', async () => {
    const source = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

    assert.match(source, /rolldownOptions/);
    assert.match(source, /codeSplitting/);
    assert.doesNotMatch(source, /advancedChunks/);

    for (const chunk of ['vendor-react', 'vendor-motion', 'vendor-icons', 'vendor-charts', 'vendor-terminal', 'vendor-editor']) {
        assert.match(source, new RegExp(`name: '${chunk}'`));
    }

    for (const dependencyPattern of ['recharts', '@xterm', 'monaco-editor', 'framer-motion', 'lucide-react']) {
        assert.match(source, new RegExp(dependencyPattern));
    }
});

test('declared dashboard tabs stay covered by the tab allowlist', () => {
    assert.deepEqual(
        [...new Set(VALID_TABS)],
        VALID_TABS,
        'VALID_TABS should not contain duplicates'
    );

    for (const tab of ['cluster', 'dashboard', 'players', 'bans', 'audit', 'rcon', 'settings', 'files', 'admins', 'tasks', 'plugins', 'deploy', 'global_settings', 'system_health']) {
        assert.ok(VALID_TABS.includes(tab), `${tab} should be valid`);
    }
});

test('dashboard tabs are normalized against the active admin role', () => {
    assert.equal(canAccessDashboardTab('players', 'viewer'), false);
    assert.equal(canAccessDashboardTab('players', 'operator'), true);
    assert.equal(canAccessDashboardTab('bans', 'viewer'), false);
    assert.equal(canAccessDashboardTab('bans', 'operator'), true);
    assert.equal(canAccessDashboardTab('audit', 'operator'), false);
    assert.equal(canAccessDashboardTab('audit', 'owner'), true);
    assert.equal(canAccessDashboardTab('files', 'operator'), false);
    assert.equal(canAccessDashboardTab('files', 'owner'), true);
    assert.equal(canAccessDashboardTab('plugins', 'operator'), false);
    assert.equal(canAccessDashboardTab('plugins', 'owner'), true);
    assert.equal(canAccessDashboardTab('deploy', 'operator'), false);
    assert.equal(canAccessDashboardTab('deploy', 'owner'), true);
    assert.equal(canAccessDashboardTab('settings', 'operator'), false);
    assert.equal(canAccessDashboardTab('settings', 'owner'), true);
    assert.equal(canAccessDashboardTab('system_health', 'operator'), false);
    assert.equal(canAccessDashboardTab('system_health', 'owner'), true);
    assert.equal(normalizeDashboardTabForRole('admins', 'viewer'), 'cluster');
    assert.equal(normalizeDashboardTabForRole('tasks', 'operator'), 'tasks');
    assert.equal(normalizeDashboardTabForRole('../files', 'owner'), 'cluster');
});

test('dashboard admin validation mirrors backend username and password limits', () => {
    assert.equal(isValidAdminUsername('Owner_1.test'), true);
    assert.equal(isValidAdminUsername('bad user'), false);
    assert.equal(isValidAdminUsername('ab'), false);
    assert.equal(isValidAdminUsername('a'.repeat(33)), false);
    assert.equal(ADMIN_PASSWORD_MAX_BYTES, 72);
    assert.equal(isValidAdminPassword('correct-password'), true);
    assert.equal(isValidAdminPassword('short'), false);
    assert.equal(isValidAdminPassword('a'.repeat(73)), false);
    assert.match(adminPasswordValidationMessage('short'), /al menos 12/);
    assert.match(adminPasswordValidationMessage('a'.repeat(73)), /72 bytes o menos/);
    assert.doesNotMatch(adminPasswordValidationMessage('short'), /Password must/);
    assert.equal(adminPasswordValidationMessage('correct-password'), '');
});

test('dashboard role presentation uses production-facing labels', () => {
    assert.deepEqual(ROLE_OPTIONS.map(role => role.value), ['viewer', 'operator', 'owner']);
    assert.equal(roleInfo('viewer').label, 'Lectura');
    assert.equal(roleInfo('operator').label, 'Operador');
    assert.equal(roleInfo('owner').label, 'Propietario');
    assert.equal(roleInfo('unknown').value, 'viewer');
});

test('admin view exposes safe edit controls backed by PATCH endpoint', async () => {
    const viewSource = await readFile(new URL('../src/pages/AdminsView.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const permissionSource = await readFile(new URL('../src/constants/permissions.js', import.meta.url), 'utf8');

    assert.match(viewSource, /updateAdmin/);
    assert.match(viewSource, /setModal/);
    assert.match(viewSource, /max-w-6xl/);
    assert.doesNotMatch(viewSource, /max-w-2xl/);
    assert.match(viewSource, /mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 overflow-hidden/);
    assert.match(viewSource, /flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto custom-scrollbar md:overflow-hidden/);
    assert.match(viewSource, /const operatorCount = admins\.filter/);
    assert.match(viewSource, /const viewerCount = admins\.filter/);
    assert.match(viewSource, /Owners/);
    assert.match(viewSource, /Operadores/);
    assert.match(viewSource, /Lectura/);
    assert.match(viewSource, /dashboard-card rounded-lg border border-zinc-800 bg-\[#18181b\] md:min-h-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar/);
    assert.match(viewSource, /htmlFor="new-admin-username" className="sr-only"/);
    assert.match(viewSource, /id="new-admin-username"/);
    assert.match(viewSource, /htmlFor="new-admin-discord" className="sr-only"/);
    assert.match(viewSource, /id="new-admin-discord"/);
    assert.match(viewSource, /htmlFor="new-admin-role" className="sr-only"/);
    assert.match(viewSource, /id="new-admin-role"/);
    assert.match(viewSource, /focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50/);
    assert.match(viewSource, /focus:border-cyan-500 disabled:cursor-not-allowed disabled:opacity-50/);
    assert.match(viewSource, /isValidAdminUsername/);
    assert.match(viewSource, /const newUsernameExists = admins\.some/);
    assert.match(viewSource, /!newUsernameExists/);
    assert.match(viewSource, /const editUsernameExists = admins\.some/);
    assert.match(viewSource, /const canSaveEdit = editUsernameValid && !editUsernameExists && !wouldDowngradeLastOwner && !adminActionLoading/);
    assert.match(viewSource, /Ese usuario ya existe\./);
    assert.match(viewSource, /maxLength=\{20\}/);
    assert.match(viewSource, /pattern="\[A-Za-z0-9_.-\]\{3,32\}"/);
    assert.match(viewSource, /disabled=\{!canSaveEdit\}/);
    assert.match(viewSource, /ROLE_OPTIONS\.map/);
    assert.match(viewSource, /PERMISSION_OPTIONS\.map/);
    assert.match(viewSource, /ROLE_PERMISSION_DEFAULTS/);
    assert.match(viewSource, /normalizePermissionOverrides/);
    assert.match(viewSource, /const permissionState = \(permissions, permission\) => \{/);
    assert.match(viewSource, /const cyclePermission = \(permission\) => \{/);
    assert.match(viewSource, /Permisos por usuario/);
    assert.match(viewSource, /Heredado: sí/);
    assert.match(viewSource, /Concedido/);
    assert.match(viewSource, /Denegado/);
    assert.match(viewSource, /updates\.permissions = normalizePermissionOverrides\(editForm\.permissions\)/);
    assert.match(viewSource, /Rol seleccionado:/);
    assert.match(viewSource, /Rol editado:/);
    assert.match(viewSource, /const openAdminRoleConfirmation = \(\{ title, message, expectedInput, confirmText, onConfirm \}\) => \{/);
    assert.match(viewSource, /title: 'Crear owner del panel'/);
    assert.match(viewSource, /expectedInput: `OWNER \$\{username\}`/);
    assert.match(viewSource, /confirmText: 'Crear owner'/);
    assert.match(viewSource, /title: updates\.role === 'owner' \? 'Promover a owner' : \(currentRole === 'owner' \? 'Cambiar rol de owner' : 'Cambiar rol'\)/);
    assert.match(viewSource, /expectedInput: `ROL \$\{targetUsername\}`/);
    assert.match(viewSource, /confirmText: 'Guardar rol'/);
    assert.match(viewSource, /roleInfo\(admin\.role \|\| 'owner'\)/);
    assert.match(viewSource, /adminRole\.description/);
    assert.match(stateSource, /ADMIN_USERNAME_HELP/);
    assert.match(stateSource, /if \(!isValidAdminUsername\(username\)\) return addToast\(ADMIN_USERNAME_HELP, 'warning'\)/);
    assert.match(stateSource, /admins\.some\(admin => String\(admin\.username \|\| ''\)\.toLowerCase\(\) === username\.toLowerCase\(\)\)/);
    assert.match(stateSource, /updates\?\.username && admins\.some/);
    assert.match(stateSource, /addToast\('Ese usuario ya existe', 'warning'\)/);
    assert.match(stateSource, /addToast\('Administrador creado', 'success'\)/);
    assert.match(stateSource, /addToast\('Administrador actualizado', 'success'\)/);
    assert.match(stateSource, /addToast\('Administrador borrado', 'success'\)/);
    assert.match(stateSource, /No se pudo añadir el administrador/);
    assert.match(stateSource, /No se pudo actualizar el administrador/);
    assert.match(stateSource, /No se pudo borrar el administrador/);
    assert.doesNotMatch(stateSource, /Admin created|Admin updated|Admin deleted|Failed to add admin|Failed to update admin|Failed to delete|Fill in all fields|Username already exists/);
    assert.match(stateSource, /axios\.patch\(`\$\{API_BASE\}\/admins\/\$\{id\}`/);
    assert.match(permissionSource, /'deploy\.view'/);
    assert.match(permissionSource, /'orchestrator\.view'/);
    assert.match(permissionSource, /'orchestrator\.configure'/);
    assert.match(permissionSource, /'wipe\.execute'/);
    assert.match(permissionSource, /owner: PERMISSION_OPTIONS\.map\(permission => permission\.value\)/);
    assert.match(permissionSource, /export function normalizePermissionOverrides/);
});

test('admin view surfaces load failures and protects protected owner actions in UI', async () => {
    const viewSource = await readFile(new URL('../src/pages/AdminsView.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const modalSource = await readFile(new URL('../src/components/ui/ConfirmModal.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[adminsError, setAdminsError\] = useState\(''\)/);
    assert.match(stateSource, /const \[adminsLoading, setAdminsLoading\] = useState\(false\)/);
    assert.match(stateSource, /const \[adminsLoaded, setAdminsLoaded\] = useState\(false\)/);
    assert.match(stateSource, /const \[adminActionLoading, setAdminActionLoading\] = useState\(false\)/);
    assert.match(stateSource, /adminsRequestRef/);
    assert.match(stateSource, /const adminMutationRef = useRef\(''\)/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/admins`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /adminsRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /setAdminsLoading\(true\)/);
    assert.match(stateSource, /setAdminsLoaded\(true\)/);
    assert.match(stateSource, /setAdminsError\(''\)/);
    assert.match(stateSource, /if \(adminsRequestRef\.current !== controller\) return;\s+setAdminsLoaded\(true\);\s+setAdminsError\(apiErrorMessage\(err, 'No se pudo cargar la lista de administradores'\)\)/);
    assert.match(stateSource, /setAdminsError\(apiErrorMessage\(err, 'No se pudo cargar la lista de administradores'\)\)/);
    assert.match(stateSource, /setAdminsLoading\(false\)/);
    assert.match(stateSource, /const username = newAdmin\.username\.trim\(\)/);
    assert.match(stateSource, /if \(adminMutationRef\.current\) return false/);
    assert.match(stateSource, /adminMutationRef\.current = 'create'/);
    assert.match(stateSource, /adminMutationRef\.current = `update:\$\{id\}`/);
    assert.match(stateSource, /adminMutationRef\.current = `delete:\$\{id\}`/);
    assert.match(stateSource, /adminMutationRef\.current = ''/);
    assert.match(stateSource, /setAdminActionLoading\(true\)/);
    assert.match(stateSource, /const payload = \{ username, discordId: newAdmin\.discordId, role: newAdmin\.role \|\| 'operator' \}/);
    assert.match(stateSource, /if \(confirmation\) payload\.confirmation = confirmation/);
    assert.match(stateSource, /await axios\.post\(`\$\{API_BASE\}\/admins`, payload\)/);
    assert.match(stateSource, /await axios\.patch\(`\$\{API_BASE\}\/admins\/\$\{id\}`, confirmation \? \{ \.\.\.updates, confirmation \} : updates\)/);
    assert.match(stateSource, /setAdminActionLoading\(false\)/);
    assert.match(viewSource, /adminsError/);
    assert.match(viewSource, /Reintentar/);
    assert.match(viewSource, /adminsLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(viewSource, /className=\{adminsLoading \? 'animate-spin' : ''\}/);
    assert.match(viewSource, /const isInitialAdminsLoading = adminsLoading && admins\.length === 0 && !adminsError/);
    assert.match(viewSource, /const adminsReadyForMutation = adminsLoaded && !adminsLoading && !adminsError/);
    assert.match(viewSource, /const canSubmitNewAdmin = adminsReadyForMutation/);
    assert.match(viewSource, /disabled=\{!canSubmitNewAdmin\}/);
    assert.match(viewSource, /Cargando inventario antes de permitir altas\./);
    assert.match(viewSource, /Cargando administradores\.\.\./);
    assert.match(viewSource, /renderAdminCount\(ownerCount\)/);
    assert.match(viewSource, /Guardando\.\.\./);
    assert.match(viewSource, /const ownerCount = admins\.filter/);
    assert.match(viewSource, /const isFinalOwner = \(admin\.role \|\| 'owner'\) === 'owner' && ownerCount <= 1/);
    assert.match(viewSource, /const isCurrentUser = String\(admin\.username \|\| ''\)\.toLowerCase\(\) === currentUsername/);
    assert.match(viewSource, /const deleteDisabled = isFinalOwner \|\| isCurrentUser \|\| adminActionLoading/);
    assert.match(viewSource, /const wouldDowngradeLastOwner = isFinalOwner && \(editForm\.role \|\| 'operator'\) !== 'owner'/);
    assert.match(viewSource, /disabled=\{deleteDisabled\}/);
    assert.match(viewSource, /disabled=\{isCurrentUser \|\| adminActionLoading\}/);
    assert.match(viewSource, /No se puede borrar el último owner/);
    assert.match(viewSource, /No puedes borrar tu propia cuenta/);
    assert.match(viewSource, /No puedes cambiar tu propio rol/);
    assert.match(viewSource, /No puedes degradar al último owner del panel/);
    assert.match(viewSource, /deleteAdmin\(admin\)/);
    assert.match(stateSource, /const username = typeof admin === 'object' \? admin\.username : 'este admin'/);
    assert.match(stateSource, /expectedInput: username/);
    assert.match(stateSource, /onConfirm: async \(inputValue = ''\) => \{/);
    assert.match(stateSource, /axios\.delete\(`\$\{API_BASE\}\/admins\/\$\{id\}`, \{ data: \{ confirmation: inputValue \} \}\)/);
    assert.match(stateSource, /confirmText: 'Borrar admin'/);
    assert.match(modalSource, /const expectedInput = typeof modal\.expectedInput === 'string' \? modal\.expectedInput : ''/);
    assert.match(modalSource, /inputValue\.trim\(\)\.toLowerCase\(\) !== expectedInput\.toLowerCase\(\)/);
    assert.match(modalSource, /const inputDescriptionIds = \[inputHelpText \? inputHelpId : '', inputErrorText \? inputErrorId : ''\]/);
    assert.match(modalSource, /htmlFor=\{inputId\}/);
    assert.match(modalSource, /id=\{inputId\}/);
    assert.match(modalSource, /aria-describedby=\{inputDescriptionIds\}/);
    assert.match(modalSource, /const \[submitting, setSubmitting\] = useState\(false\)/);
    assert.match(modalSource, /const confirmDisabled = submitting \|\| hasMissingRequiredInput \|\| hasMismatchedExpectedInput/);
    assert.match(modalSource, /disabled=\{confirmDisabled\}/);
    assert.match(viewSource, /admins\.length === 0 && adminsLoaded && !adminsError && !adminsLoading/);
});

test('navigation declares role gates for privileged dashboard sections', async () => {
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const playersSidebarSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');
    const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');

    assert.match(topNavSource, /canOperate/);
    assert.match(playersSidebarSource, /canOperate/);
    assert.match(sidebarSource, /const panelNavSections = dashboardNavSectionsForRole\(userRole\)/);
    assert.match(sidebarSource, /canOwn/);
    const ownerTabs = dashboardNavSectionsForRole('owner').flatMap(section => section.items.map(item => item.id));
    const operatorTabs = dashboardNavSectionsForRole('operator').flatMap(section => section.items.map(item => item.id));
    assert.ok(ownerTabs.includes('system_health'));
    assert.ok(ownerTabs.includes('plugins'));
    assert.ok(ownerTabs.includes('deploy'));
    assert.ok(operatorTabs.includes('tasks'));
    assert.equal(operatorTabs.includes('deploy'), false);
    assert.match(sidebarSource, /panelNavSections\.map\(section =>/);
    assert.match(sidebarSource, /section\.items\.map\(item =>/);
    assert.doesNotMatch(playersSidebarSource, /dashboardNavSectionsForRole\(userRole\)/);
    assert.ok(dashboardNavSectionsForRole('viewer').flatMap(section => section.items.map(item => item.id)).includes('cluster'));
    assert.match(sidebarSource, /\{canOwn && <div className="[^"]*space-y-2[^"]*" aria-label="Controles de ciclo de vida del servidor"/);
    assert.doesNotMatch(sidebarSource, /grid grid-cols-4 gap-2/);
    assert.doesNotMatch(sidebarSource, /\{canOperate && <div className="grid grid-cols-4 gap-2"/);
});

test('top navigation presents verified roles with operator-facing labels', async () => {
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const pluginsSource = await readFile(new URL('../src/pages/PluginsView.jsx', import.meta.url), 'utf8');

    assert.match(topNavSource, /import \{ roleInfo \} from '..\/..\/constants\/roles'/);
    assert.match(topNavSource, /const currentRole = roleInfo\(userRole\)/);
    assert.match(topNavSource, /Permiso verificado:/);
    assert.match(topNavSource, /currentRole\.label/);
    assert.match(topNavSource, /currentRole\.description/);
    assert.doesNotMatch(topNavSource, /\{userRole \|\| 'viewer'\}/);
    assert.match(pluginsSource, /Se requiere rol propietario para cambiar marcadores\./);
});

test('deploy view consumes backend capabilities instead of advertising unavailable automation', async () => {
    const deploySource = await readFile(new URL('../src/pages/DeployView.jsx', import.meta.url), 'utf8');
    const formSource = await readFile(new URL('../src/components/deployer/NewServerForm.jsx', import.meta.url), 'utf8');
    const orchestratorSource = await readFile(new URL('../src/components/deployer/NativeOrchestratorPanel.jsx', import.meta.url), 'utf8');
    const maintenanceSource = await readFile(new URL('../src/components/deployer/MaintenanceTools.jsx', import.meta.url), 'utf8');
    const wipeSource = await readFile(new URL('../src/components/deployer/WipeTools.jsx', import.meta.url), 'utf8');
    const nodesSource = await readFile(new URL('../src/components/deployer/NodesList.jsx', import.meta.url), 'utf8');

    assert.match(deploySource, /import \{ NativeOrchestratorPanel \} from '..\/components\/deployer\/NativeOrchestratorPanel'/);
    assert.match(deploySource, /const \{ userPermissions \} = useDashboard\(\)/);
    assert.match(deploySource, /const \[deployTab, setDeployTab\] = useState\('operations'\)/);
    assert.match(deploySource, /axios\.get\(`\$\{API_BASE\}\/deploy\/capabilities`, \{ signal: controller\.signal \}\)/);
    assert.match(deploySource, /capabilitiesError/);
    assert.match(deploySource, /capabilitiesLoading/);
    assert.match(deploySource, /capabilitiesRequestRef/);
    assert.match(deploySource, /new AbortController\(\)/);
    assert.match(deploySource, /signal: controller\.signal/);
    assert.match(deploySource, /if \(capabilitiesRequestRef\.current !== controller\) return/);
    assert.match(deploySource, /if \(err\.name === 'CanceledError' \|\| axios\.isCancel\?\.\(err\)\) return;\s+if \(capabilitiesRequestRef\.current !== controller\) return;/);
    assert.match(deploySource, /capabilitiesRequestRef\.current\?\.abort\(\)/);
    assert.match(deploySource, /capabilitiesRequestRef\.current = null/);
    assert.doesNotMatch(deploySource, /let cancelled = false/);
    assert.match(deploySource, /const maintenanceCapabilities = capabilities\?\.maintenance \|\| \{\}/);
    assert.match(deploySource, /const availableMaintenanceCount = maintenanceEntries\.filter\(capability => capability\?\.available === true\)\.length/);
    assert.match(deploySource, /const blockedMaintenanceCount = maintenanceEntries\.filter\(capability => capability\?\.available !== true\)\.length/);
    assert.match(deploySource, /const hostFamily = host\.family \|\| 'unknown'/);
    assert.match(deploySource, /const runtimeLabel = currentTarget\?\.runtime \|\| \(hostFamily === 'linux' \? 'Obelisk'/);
    assert.match(deploySource, /const HostIcon = hostFamily === 'windows' \? AppWindow : MonitorPlay/);
    assert.match(deploySource, /aria-label="Resumen de capacidades de despliegue"/);
    assert.match(deploySource, /Alta automática/);
    assert.match(deploySource, /Sistema operativo/);
    assert.match(deploySource, /Bloqueado por backend/);
    assert.match(deploySource, /onClick=\{fetchCapabilities\}/);
    assert.match(deploySource, /Reintentar/);
    assert.match(deploySource, /Cargando capacidades de despliegue/);
    assert.match(deploySource, /Mantenimiento y nodos/);
    assert.match(deploySource, /role="tablist" aria-label="Secciones del deployer"/);
    assert.match(deploySource, /\{ id: 'operations', label: 'Operación' \}/);
    assert.match(deploySource, /\{ id: 'wipe', label: 'Wipe' \}/);
    assert.match(deploySource, /\{ id: 'orchestrator', label: 'Orquestador' \}/);
    assert.match(deploySource, /\{ id: 'future', label: 'Despliegue futuro' \}/);
    assert.match(deploySource, /aria-selected=\{deployTab === tab\.id\}/);
    assert.match(deploySource, /onClick=\{\(\) => setDeployTab\(tab\.id\)\}/);
    assert.match(deploySource, /Acciones disponibles/);
    assert.match(deploySource, /Inventario/);
    assert.match(deploySource, /Despliegue futuro/);
    assert.match(deploySource, /mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4/);
    assert.match(deploySource, /dashboard-card flex shrink-0 flex-col gap-4 rounded-lg/);
    assert.match(deploySource, /min-h-0 flex-1 overflow-y-auto pr-1 pb-6 custom-scrollbar/);
    assert.match(deploySource, /grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6/);
    assert.doesNotMatch(deploySource, /flex flex-col gap-6 max-w-6xl mx-auto w-full pb-10/);
    assert.match(deploySource, /deployTab === 'operations'/);
    assert.match(deploySource, /<MaintenanceTools capabilities=\{capabilities\} hostFamily=\{hostFamily\} \/>[\s\S]*<NodesList \/>/);
    assert.match(deploySource, /deployTab === 'wipe'/);
    assert.match(deploySource, /<WipeTools capabilities=\{capabilities\} userPermissions=\{userPermissions\} \/>/);
    assert.match(deploySource, /deployTab === 'orchestrator'/);
    assert.match(deploySource, /<NativeOrchestratorPanel capabilities=\{capabilities\} hostFamily=\{hostFamily\} \/>/);
    assert.match(deploySource, /deployTab === 'future'/);
    assert.match(deploySource, /<NewServerForm capabilities=\{capabilities\} hostFamily=\{hostFamily\} \/>/);
    assert.match(orchestratorSource, /axios\.get\(`\$\{API_BASE\}\/orchestrator\/readiness`, \{ signal: controller\.signal \}\)/);
    assert.match(orchestratorSource, /axios\.get\(`\$\{API_BASE\}\/orchestrator\/preflight\?root=\$\{encodeURIComponent\(arkRoot\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(orchestratorSource, /axios\.post\(`\$\{API_BASE\}\/orchestrator\/config`/);
    assert.match(orchestratorSource, /Orquestador nativo/);
    assert.match(orchestratorSource, /Preparacion para migrar de LinuxGSM a ArkPanel nativo sin ejecutar acciones live/);
    assert.match(orchestratorSource, /Workshop opcional/);
    assert.match(orchestratorSource, /Epic Games/);
    assert.match(orchestratorSource, /Acciones bloqueadas/);
    assert.match(orchestratorSource, /const canConfigure = userRole === 'owner'/);
    assert.match(orchestratorSource, /disabled=\{!canConfigure \|\| saving\}/);
    assert.match(formSource, /capabilities\?\.deployStart/);
    assert.match(formSource, /capabilities\?\.deploymentTargets\?\.\[hostFamily\]/);
    assert.match(formSource, /const deployAvailable = deployCapability\?\.available === true/);
    assert.match(formSource, /const isLinuxHost = hostFamily === 'linux'/);
    assert.match(formSource, /const isWindowsHost = hostFamily === 'windows'/);
    assert.match(formSource, /const runtimeLabel = deploymentTarget\?\.runtime/);
    assert.match(formSource, /disabled=\{!deployAvailable\}/);
    assert.match(formSource, /title=\{deployReason\}/);
    assert.match(formSource, /Sistema detectado/);
    assert.match(formSource, /Runtime previsto/);
    assert.match(formSource, /Linux usará la ruta de runtime Obelisk/);
    assert.match(formSource, /Windows usará ArkApi/);
    assert.doesNotMatch(formSource, /id="deploy-install-api"/);
    assert.doesNotMatch(formSource, /deploy-os-options-label/);
    assert.match(formSource, /Preparación pendiente/);
    assert.match(formSource, /Sólo se muestra la ruta compatible/);
    assert.match(maintenanceSource, /capabilities\?\.maintenance/);
    assert.match(maintenanceSource, /function appliesToHost\(capability, hostFamily\)/);
    assert.match(maintenanceSource, /const showValidateSteamcmd = appliesToHost\(validateCapability, hostFamily\)/);
    assert.match(maintenanceSource, /const showClearLogs = appliesToHost\(clearLogsCapability, hostFamily\)/);
    assert.match(maintenanceSource, /const showWipe = appliesToHost\(wipeCapability, hostFamily\)/);
    assert.match(maintenanceSource, /clearLogsTargetCount/);
    assert.match(maintenanceSource, /clearLogsConfirmation/);
    assert.match(maintenanceSource, /clearLogsReady/);
    assert.match(maintenanceSource, /maintenanceActionRef = useRef\(null\)/);
    assert.match(maintenanceSource, /if \(maintenanceActionRef\.current\) return/);
    assert.match(maintenanceSource, /maintenanceActionRef\.current = action/);
    assert.match(maintenanceSource, /maintenanceActionRef\.current = null/);
    assert.match(maintenanceSource, /disabled=\{loadingAction !== null \|\| !canOwn \|\| !clearLogsReady\}/);
    assert.match(maintenanceSource, /expectedInput: clearLogsConfirmation/);
    assert.match(maintenanceSource, /payload\.confirmation = inputValue/);
    assert.match(maintenanceSource, /aria-label="Validar SteamCMD no disponible"/);
    assert.match(maintenanceSource, /aria-label="Truncar logs ARK gestionados"/);
    assert.match(maintenanceSource, /Truncar logs ARK/);
    assert.match(maintenanceSource, /aria-label="Wipe completo no disponible"/);
    assert.match(wipeSource, /capabilities\?\.wipe\?\.modes/);
    assert.match(wipeSource, /userPermissions\.includes\('wipe\.execute'\)/);
    assert.match(wipeSource, /Personajes/);
    assert.match(wipeSource, /Dinos/);
    assert.match(wipeSource, /Estructuras/);
    assert.match(wipeSource, /Wipe completo/);
    assert.match(wipeSource, /disabled/);
    assert.match(wipeSource, /No hay modos de wipe declarados por el backend/);
    assert.match(nodesSource, /const \[error, setError\] = useState\(''\)/);
    assert.match(nodesSource, /nodesRequestRef/);
    assert.match(nodesSource, /new AbortController\(\)/);
    assert.match(nodesSource, /axios\.get\(`\$\{API_BASE\}\/nodes`, \{ signal: controller\.signal \}\)/);
    assert.match(nodesSource, /if \(nodesRequestRef\.current !== controller\) return/);
    assert.match(nodesSource, /if \(err\.name === 'CanceledError' \|\| axios\.isCancel\?\.\(err\)\) return;\s+if \(nodesRequestRef\.current !== controller\) return;/);
    assert.match(nodesSource, /nodesRequestRef\.current\?\.abort\(\)/);
    assert.match(nodesSource, /nodesRequestRef\.current = null/);
    assert.match(nodesSource, /aria-label="Actualizar nodos"/);
    assert.match(nodesSource, /title=\{loading \? 'Actualizando nodos' : 'Actualizar nodos'\}/);
    assert.match(nodesSource, /<button type="button" onClick=\{\(\) => fetchNodes\(\)\}/);
    assert.match(nodesSource, /disabled:cursor-not-allowed disabled:opacity-50/);
    assert.match(nodesSource, /<button type="button" disabled className="w-full bg-zinc-800/);
    assert.match(nodesSource, /Vinculación de nodos no implementada/);
    assert.match(nodesSource, /Pendiente de flujo seguro con API key/);
    assert.doesNotMatch(nodesSource, /handleAddNode/);
    assert.match(nodesSource, /Inventario de nodos no disponible/);
    assert.match(nodesSource, /className=\{loading \? 'animate-spin' : ''\}/);
    assert.match(nodesSource, /loading \? 'Reintentando\.\.\.' : 'Reintentar'/);
});

test('confirmation modal stays above mobile drawers and disables invalid required input', async () => {
    const source = await readFile(new URL('../src/components/ui/ConfirmModal.jsx', import.meta.url), 'utf8');

    assert.match(source, /z-\[140\]/);
    assert.match(source, /hasMissingRequiredInput/);
    assert.match(source, /hasMismatchedExpectedInput/);
    assert.match(source, /const confirmDisabled = submitting \|\| hasMissingRequiredInput \|\| hasMismatchedExpectedInput/);
    assert.match(source, /disabled=\{confirmDisabled\}/);
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby=\{titleId\}/);
    assert.match(source, /aria-describedby=\{descriptionId\}/);
    assert.match(source, /const dialogRef = useRef\(null\)/);
    assert.match(source, /ref=\{dialogRef\}/);
    assert.match(source, /const CONFIRM_MODAL_FOCUSABLE_SELECTOR = 'button:not\(\[disabled\]\), input:not\(\[disabled\]\), select:not\(\[disabled\]\), textarea:not\(\[disabled\]\), \[href\], \[tabindex\]:not\(\[tabindex="-1"\]\)'/);
    assert.match(source, /requestAnimationFrame\(\(\) => \{/);
    assert.match(source, /dialogRef\.current\?\.querySelectorAll\(CONFIRM_MODAL_FOCUSABLE_SELECTOR\)/);
    assert.match(source, /const preferredElement = focusableElements\.find\(element => element\.hasAttribute\('data-modal-autofocus'\)\)/);
    assert.match(source, /\(preferredElement \|\| focusableElements\[0\] \|\| dialogRef\.current\)\?\.focus\?\.\(\{ preventScroll: true \}\)/);
    assert.match(source, /cancelAnimationFrame\(frame\)/);
    assert.match(source, /tabIndex=\{-1\}/);
    assert.match(source, /data-modal-autofocus/);
    assert.match(source, /event\.key === 'Tab'/);
    assert.match(source, /focusableElements/);
    assert.match(source, /lastElement\.focus\(\)/);
    assert.match(source, /firstElement\.focus\(\)/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /aria-label="Cerrar confirmación"/);
    assert.match(source, /items-end justify-center/);
    assert.match(source, /sm:items-center/);
    assert.match(source, /max-h-\[calc\(100dvh-1rem\)\]/);
    assert.match(source, /overflow-y-auto/);
    assert.match(source, /sticky bottom-0/);
    assert.match(source, /flex-wrap/);
    assert.match(source, /min-h-11/);
    assert.match(source, /amber:\s+\{ border: 'border-amber-500\/15'/);
    assert.match(source, /min-w-0 break-words text-\[15px\]/);
    assert.match(source, /mb-5 break-words text-\[13px\]/);
    assert.match(source, /htmlFor=\{inputId\}/);
    assert.match(source, /id=\{inputHelpId\}/);
    assert.match(source, /id=\{inputErrorId\}/);
    assert.match(source, /aria-describedby=\{inputDescriptionIds\}/);
});

test('confirmation modal serializes async confirms and blocks close while submitting', async () => {
    const source = await readFile(new URL('../src/components/ui/ConfirmModal.jsx', import.meta.url), 'utf8');

    assert.match(source, /import \{ useEffect, useId, useRef, useState \} from 'react'/);
    assert.match(source, /const \[submitting, setSubmitting\] = useState\(false\)/);
    assert.match(source, /const mountedRef = useRef\(true\)/);
    assert.match(source, /const dialogRef = useRef\(null\)/);
    assert.match(source, /setInputValue\(''\);\s+setSubmitting\(false\);/);
    assert.match(source, /if \(event\.key === 'Escape' && !submitting\) onClose\(\)/);
    assert.match(source, /const handleConfirm = async \(\) => \{/);
    assert.match(source, /if \(confirmDisabled\) return;\s+setSubmitting\(true\)/);
    assert.match(source, /await Promise\.resolve\(modal\.onConfirm\(inputValue\)\)/);
    assert.match(source, /if \(mountedRef\.current\) setSubmitting\(false\)/);
    assert.match(source, /onClick=\{\(\) => \{ if \(!submitting\) onClose\(\); \}\}/);
    assert.match(source, /disabled=\{submitting\}/);
    assert.match(source, /Procesando\.\.\./);
});

test('system health renders a persistent retry state after fetch failure', async () => {
    const source = await readFile(new URL('../src/pages/SystemHealth.jsx', import.meta.url), 'utf8');
    assert.match(source, /const \[error, setError\] = useState\(''\)/);
    assert.match(source, /useCallback\(async \(isManual = false\)/);
    assert.match(source, /healthRequestRef/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /signal: request\.controller\.signal/);
    assert.match(source, /healthRequestRef\.current\?\.controller\.abort\(\)/);
    assert.match(source, /if \(!isManual && healthRequestRef\.current\?\.isManual\) return/);
    assert.match(source, /isCanceledRequest\(error\)/);
    assert.match(source, /healthRequestRef\.current !== request/);
    assert.match(source, /if \(!health\) \{/);
    assert.match(source, /Diagnóstico no disponible/);
    assert.match(source, /fetchHealth\(true\)/);
    assert.match(source, /role="alert"/);
    assert.match(source, /if \(isManual\) toast\.error/);
    assert.match(source, /\}, \[fetchHealth\]\)/);
});

test('system health surfaces bounded metrics and production readiness checks', async () => {
    const source = await readFile(new URL('../src/pages/SystemHealth.jsx', import.meta.url), 'utf8');
    const numeric = source.match(/function numericMetric\([^]*?\n\}/)?.[0];
    const percentage = source.match(/function percentageMetric\([^]*?\n\}/)?.[0];
    assert.ok(numeric && percentage);
    const clamp = runInNewContext(`${numeric}\n${percentage}\npercentageMetric`);
    for (const [input, expected] of [[Infinity,0],['NaN',0],[-10,0],[150,100],['55.5',55.5]]) assert.equal(clamp(input), expected);
    assert.match(source, /health\.memory\?\.used/);
    assert.match(source, /memoryTotal > 0/);
    assert.match(source, /Array\.isArray\(health\.network\)/);
    assert.match(source, /Array\.isArray\(health\.disks\)/);
    assert.match(source, /readinessSummary\.pass/);
    assert.match(source, /readinessSummary\.warn/);
    assert.match(source, /readinessSummary\.fail/);
    assert.match(source, /sortedReadinessChecks\.map/);
    assert.match(source, /readinessSortWeight\(left\.status\) - readinessSortWeight\(right\.status\)/);
    assert.match(source, /Readiness sin checks/);
    assert.match(source, /check\.remediation/);
    assert.match(source, /Inventario de discos no disponible/);
    assert.match(source, /value=\{diskUse\}/);
    assert.match(source, /aria-label=\{`Uso disco \$\{diskMount\}`\}/);
});

test('global settings fail closed when settings cannot load', async () => {
    const source = await readFile(new URL('../src/pages/GlobalSettings.jsx', import.meta.url), 'utf8');

    assert.match(source, /const \[loadError, setLoadError\] = useState\(''\)/);
    assert.match(source, /settingsRequestRef/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /axios\.get\('\/api\/settings\/global', \{ signal: controller\.signal \}\)/);
    assert.match(source, /settingsRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /isCanceledRequest\(err\)/);
    assert.match(source, /if \(settingsRequestRef\.current !== controller\) return/);
    assert.match(source, /setLoadError\(''\)/);
    assert.match(source, /setLoadError\(err\.response\?\.data\?\.error \|\| 'Error al cargar ajustes globales'\)/);
    assert.match(source, /if \(loading && !loadError\) \{/);
    assert.match(source, /if \(loadError\) \{/);
    assert.match(source, /Ajustes globales no disponibles/);
    assert.match(source, /onClick=\{fetchSettings\}/);
    assert.match(source, /disabled=\{loading\}/);
    assert.match(source, /className=\{loading \? 'animate-spin' : ''\}/);
    assert.match(source, /loading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(source, /Reintentar/);
    assert.match(source, /toast\.error\(err\.response\?\.data\?\.error \|\| 'Error al guardar ajustes globales'\)/);
    assert.doesNotMatch(source, /catch \{\s*toast\.error\('Error al cargar ajustes globales'\)/);
});

test('global settings validates security inputs before save', async () => {
    const source = await readFile(new URL('../src/pages/GlobalSettings.jsx', import.meta.url), 'utf8');

    assert.match(source, /function isValidDiscordWebhook\(value\) \{/);
    assert.match(source, /url\.protocol === 'https:' && allowedHost/);
    assert.match(source, /function isValidIpAddress\(value\) \{/);
    assert.match(source, /const webhookAlertsInvalid = !isValidDiscordWebhook\(settings\.discordWebhookAlerts\)/);
    assert.match(source, /const webhookBansInvalid = !isValidDiscordWebhook\(settings\.discordWebhookBans\)/);
    assert.match(source, /const adminIpEntries = String\(settings\.adminIpWhitelist \|\| ''\)\.split\(','\)\.map\(ip => ip\.trim\(\)\)\.filter\(Boolean\)/);
    assert.match(source, /const settingsValidationMessage = \(\(\) => \{/);
    assert.match(source, /if \(settingsValidationMessage\) \{\s+toast\.error\(settingsValidationMessage\);\s+return;\s+\}/);
    assert.match(source, /disabled=\{saving \|\| Boolean\(settingsValidationMessage\)\}/);
    assert.match(source, /title=\{settingsValidationMessage \|\| undefined\}/);
    assert.match(source, /id="global-settings-validation"/);
    assert.match(source, /htmlFor="global-webhook-alerts"/);
    assert.match(source, /id="global-webhook-alerts"/);
    assert.match(source, /aria-invalid=\{webhookAlertsInvalid \? 'true' : undefined\}/);
    assert.match(source, /htmlFor="global-webhook-bans"/);
    assert.match(source, /id="global-webhook-bans"/);
    assert.match(source, /htmlFor="global-admin-ip-whitelist"/);
    assert.match(source, /id="global-admin-ip-whitelist"/);
    assert.match(source, /aria-describedby=\{adminIpWhitelistInvalid \? 'global-settings-validation global-admin-ip-help' : 'global-admin-ip-help'\}/);
    assert.match(source, /htmlFor="secret-map-id"/);
    assert.match(source, /id="secret-admin-password"/);
    assert.match(source, /id="secret-server-password"/);
    assert.match(source, /id="secret-spectator-password"/);
    assert.equal(source.match(/Los valores actuales no se muestran\. Solo se actualizan los campos rellenados\./g)?.length, 1);
    assert.equal(source.match(/disabled=\{savingSecrets\}/g)?.length, 4);
});

test('global settings keeps scheduled automation in the dedicated tasks view', async () => {
    const source = await readFile(new URL('../src/pages/GlobalSettings.jsx', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /import \{ TasksManager \}/);
    assert.doesNotMatch(source, /<TasksManager \/>/);
    assert.doesNotMatch(source, /id: 'automation'/);
    assert.doesNotMatch(source, /Guardar Todos los Ajustes/);
    assert.match(source, /Guardar ajustes globales/);
    assert.match(source, /setActiveTab: setDashboardTab/);
    assert.match(source, /onClick=\{\(\) => setDashboardTab\('tasks'\)\}/);
    assert.match(source, /Las tareas programadas se gestionan en una página operativa separada\./);
    assert.match(source, /Abrir tareas programadas/);
    assert.match(source, /mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4/);
    assert.match(source, /flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row/);
    assert.match(source, /role="tablist"/);
    assert.match(source, /aria-label="Categorías de ajustes globales"/);
    assert.match(source, /role="tab"/);
    assert.match(source, /aria-selected=\{isActive\}/);
    assert.match(source, /min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar/);
    assert.doesNotMatch(source, /max-w-6xl mx-auto w-full pb-10/);
});

test('data views show fetch errors instead of false empty states', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const playersSource = await readFile(new URL('../src/pages/PlayersView.jsx', import.meta.url), 'utf8');
    const bansSource = await readFile(new URL('../src/pages/BansView.jsx', import.meta.url), 'utf8');
    const auditSource = await readFile(new URL('../src/pages/AuditLogView.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[historyError, setHistoryError\] = useState\(''\)/);
    assert.match(stateSource, /onlinePlayersRequestRef/);
    assert.match(stateSource, /playerHistoryRequestRef/);
    assert.match(stateSource, /ingameAdminsRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/players\/online\?mapId=\$\{encodeURIComponent\(sidebarMapFilter\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/players\/history`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/players\/ingame-admins`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /onlinePlayersRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /playerHistoryRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /ingameAdminsRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /setHistoryError\(err\.response\?\.data\?\.error \|\| 'No se pudo cargar el historial de jugadores'\)/);
    assert.match(stateSource, /if \(playerHistoryRequestRef\.current !== controller\) return;\s+setHistoryError/);
    assert.match(stateSource, /if \(ingameAdminsRequestRef\.current !== controller\) return;\s+\} finally/);
    assert.doesNotMatch(stateSource, /catch \(err\) \{\s*setPlayerHistory\(\[\]\);/);
    assert.match(stateSource, /const \[bansError, setBansError\] = useState\(''\)/);
    assert.match(stateSource, /const \[auditError, setAuditError\] = useState\(''\)/);
    assert.match(stateSource, /const \[auditLoaded, setAuditLoaded\] = useState\(false\)/);
    assert.match(stateSource, /const auditLogsCountRef = useRef\(0\)/);
    assert.match(stateSource, /if \(auditLogsCountRef\.current === 0\) setAuditLoaded\(false\)/);
    assert.match(stateSource, /auditLogsCountRef\.current = nextLogs\.length/);
    assert.match(stateSource, /setAuditLoaded\(true\)/);
    assert.match(stateSource, /bansRequestRef/);
    assert.match(stateSource, /auditRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/players\/bans`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/audit\/log\?\$\{params\.toString\(\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /bansRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /auditRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /if \(bansRequestRef\.current !== controller\) return;\s+setBansError/);
    assert.match(playersSource, /historyError/);
    assert.match(bansSource, /bansError/);
    assert.match(auditSource, /auditError/);
    assert.match(auditSource, /auditLoaded/);
    assert.match(auditSource, /Cargando auditoría/);
    assert.match(auditSource, /Registro no disponible/);
    assert.match(auditSource, /disabled=\{auditLoading\}/);
    assert.match(auditSource, /auditLoading \? 'Actualizando\.\.\.' : 'Refrescar'/);
    assert.match(auditSource, /auditLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(auditSource, /className=\{auditLoading \? 'animate-spin' : ''\}/);
    assert.match(playersSource, /disabled=\{playersLoading \|\| historyLoading\}/);
    assert.match(bansSource, /disabled=\{bansLoading\}/);
    assert.match(bansSource, /bansLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(playersSource + bansSource + auditSource, /Reintentar/);
});

test('audit view surfaces security events without truncating details on mobile', async () => {
    const auditSource = await readFile(new URL('../src/pages/AuditLogView.jsx', import.meta.url), 'utf8');
    const constantsSource = await readFile(new URL('../src/constants/dashboard.js', import.meta.url), 'utf8');

    assert.match(auditSource, /<option value="LOGIN_FAILED">Fallos de Login<\/option>/);
    assert.match(auditSource, /break-words text-xs text-zinc-500/);
    assert.doesNotMatch(auditSource, /text-xs text-zinc-500 truncate/);
    assert.match(auditSource, /flex flex-col gap-3 px-4 py-4/);
    assert.match(auditSource, /mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4/);
    assert.match(auditSource, /min-h-0 flex-1 overflow-y-auto custom-scrollbar md:flex md:flex-col md:overflow-hidden/);
    assert.match(auditSource, /dashboard-card mt-4 flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-\[#18181b\] md:min-h-0 md:flex-1/);
    assert.match(auditSource, /divide-y divide-zinc-800\/50 md:min-h-0 md:flex-1 md:overflow-y-auto md:custom-scrollbar/);
    assert.doesNotMatch(auditSource, /min-h-0 flex-1 divide-y divide-zinc-800\/50 overflow-y-auto custom-scrollbar/);
    assert.match(auditSource, /htmlFor="audit-action-filter" className="sr-only"/);
    assert.match(auditSource, /aria-label="Actualizar registro de auditoría"/);
    assert.match(auditSource, /flex min-h-\[260px\] flex-1 flex-col items-center justify-center/);
    assert.match(auditSource, /mt-4 flex flex-col gap-3 sm:flex-row md:shrink-0/);
    assert.doesNotMatch(auditSource, /<div className="p-12 text-center text-zinc-600">/);
    assert.match(constantsSource, /ShieldAlert/);
    assert.match(constantsSource, /LOGIN_FAILED:\s+\{ Icon: ShieldAlert/);
});

test('operational data views keep tables scrollable and actions labelled', async () => {
    const players = await readFile(new URL('../src/pages/PlayersView.jsx', import.meta.url), 'utf8');
    const bans = await readFile(new URL('../src/pages/BansView.jsx', import.meta.url), 'utf8');
    const tasks = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');
    for (const source of [players,bans,tasks]) assert.match(source, /overflow-x-auto/);
    for (const source of [players,tasks]) {
        assert.match(source, /<table\b/);
        assert.match(source, /<th\b/);
        assert.match(source, /<tbody\b/);
    }
    assert.match(bans, /ban\.playerName/);
    assert.match(players, /aria-label=\{`Expulsar a/);
    assert.match(players, /aria-label=\{`Banear a/);
    assert.match(bans, /aria-label=\{`Desbanear a/);
    assert.match(tasks, /expectedInput/);
    assert.match(tasks, /pendingTaskId/);
});

test('file manager editor controls fit mobile viewports', async () => {
    const source = await readFile(new URL('../src/pages/FileManager.jsx', import.meta.url), 'utf8');
    const visualEditorSource = await readFile(new URL('../src/components/files/VisualConfigEditor.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(source, /fileListLoading/);
    assert.match(source, /fileListError/);
    assert.match(source, /fileReadLoading/);
    assert.match(source, /fileReadError/);
    assert.match(source, /fileReadTarget/);
    assert.match(source, /const saveDisabled = savingFile \|\| Boolean\(editingFile\?\.redacted\)/);
    assert.match(source, /Cargando archivos\.\.\./);
    assert.match(source, /Cargando archivo\.\.\./);
    assert.match(source, /No se pudo abrir el archivo/);
    assert.match(source, /Reintentar/);
    assert.match(source, /disabled=\{fileReadLoading\}/);
    assert.match(source, /className=\{fileReadLoading \? 'animate-spin' : ''\}/);
    assert.match(source, /fileReadLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(source, /fileList\.length === 0 && !fileListLoading && !fileListError/);
    assert.match(source, /disabled=\{fileListLoading\}/);
    assert.match(source, /relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-4 overflow-hidden/);
    assert.match(source, /editingFile\?\.name === file\.name \|\| fileReadTarget === file\.path/);
    assert.match(source, /const navigateBack = \(\) => \{/);
    assert.match(source, /onClick=\{navigateBack\}/);
    assert.match(source, /aria-label="Volver al directorio anterior"/);
    assert.match(source, /const editingFilePath = editingFile\?\.path \|\| editingFile\?\.name \|\| ''/);
    assert.match(source, /const editingFileDirectory = editingFilePath\.includes\('\/'\)/);
    assert.match(source, /const closeEditor = \(\) => \{\s+setEditingFile\(null\);\s+\}/);
    assert.match(source, /type="button"[\s\S]*aria-label=\{`\$\{file\.isDirectory \? 'Abrir carpeta' : 'Abrir archivo'\} \$\{file\.name\}`\}/);
    assert.match(source, /aria-selected=\{isSelected\}/);
    assert.match(source, /aria-busy=\{isReading \? 'true' : undefined\}/);
    assert.match(source, /focus-visible:ring-2 focus-visible:ring-indigo-500\/70/);
    assert.doesNotMatch(source, /<div\s+key=\{i\}\s+onClick=\{\(\) => file\.isDirectory \? fetchFiles\(file\.path\) : openFile\(file\.path\)\}/);
    assert.match(source, /onClick=\{\(\) => openFile\(fileReadTarget\)\}/);
    assert.match(source, /flex w-full flex-wrap items-center gap-2 md:w-auto md:flex-nowrap/);
    assert.match(source, /className="min-w-0 flex-1/);
    assert.match(source, /flex shrink-0 flex-col items-start justify-between gap-4/);
    assert.match(source, /min-h-0 w-full \$\{editingFile \? 'hidden lg:flex lg:w-80 lg:shrink-0' : 'flex flex-1'\}/);
    assert.match(source, /min-h-0 flex-1 space-y-1 overflow-y-auto p-2 custom-scrollbar/);
    assert.match(source, /dashboard-card relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg/);
    assert.doesNotMatch(source, /rounded-2xl/);
    assert.match(source, /<span>Guardar<\/span><span className="hidden sm:inline"> Cambios<\/span><span className="hidden lg:inline"> \(Ctrl\+S\)<\/span>/);
    assert.match(source, /flex shrink-0 flex-col gap-3 border-b border-zinc-800 bg-\[#18181b\] px-4 py-3 sm:flex-row sm:items-center sm:justify-between/);
    assert.match(source, /min-w-0 truncate text-zinc-200 font-mono/);
    assert.match(source, /Ruta: <span className="font-mono text-zinc-400">\{editingFileDirectory\}<\/span>/);
    assert.match(source, /aria-label="Volver al explorador de archivos"/);
    assert.match(source, /Volver a archivos/);
    assert.match(source, /onClick=\{closeEditor\}/);
    assert.match(source, /min-h-11 flex-1/);
    assert.match(source, /aria-label="Editar archivo en modo formulario"/);
    assert.match(source, /aria-label="Editar archivo en modo codigo"/);
    assert.match(source, /aria-label="Cerrar editor"/);
    assert.match(source, /id="file-redacted-save-warning"/);
    assert.match(source, /La edición directa queda bloqueada para evitar guardar placeholders/);
    assert.match(source, /disabled=\{saveDisabled\}/);
    assert.match(source, /aria-describedby=\{editingFile\?\.redacted \? 'file-redacted-save-warning' : undefined\}/);
    assert.match(source, /border-t border-zinc-800\/70 bg-\[#09090b\]\/95 p-3 md:hidden/);
    assert.match(visualEditorSource, /min-h-0 flex-1 space-y-5 overflow-y-auto bg-\[#09090b\] p-4 custom-scrollbar sm:p-5/);
    assert.match(visualEditorSource, /const editableSections = useMemo/);
    assert.match(visualEditorSource, /editableSections\.length === 0/);
    assert.match(visualEditorSource, /Sin campos editables detectados/);
    assert.match(visualEditorSource, /Cambia a modo código para editar comentarios/);
    assert.match(visualEditorSource, /editableSections\.map\(section =>/);
    assert.match(visualEditorSource, /grid grid-cols-1 gap-3 md:grid-cols-2/);
    assert.match(visualEditorSource, /flex min-w-0 flex-col space-y-1\.5 rounded-lg border border-zinc-800/);
    assert.match(visualEditorSource, /min-h-10 w-full rounded border border-zinc-700/);
    assert.match(source, /import \{ Fragment, useEffect, useRef, useState \} from 'react'/);
    assert.match(source, /const saveFileHandlerRef = useRef\(saveFile\)/);
    assert.match(source, /saveFileHandlerRef\.current = saveFile/);
    assert.match(source, /editor\.addCommand\(monaco\.KeyMod\.CtrlCmd \| monaco\.KeyCode\.KeyS, \(\) => \{\s+saveFileHandlerRef\.current\(\);/);
    assert.match(source, /window\.addEventListener\('keydown', handleWindowKeyDown\)/);
    assert.match(source, /event\.preventDefault\(\);\s+if \(!saveDisabled\) saveFileHandlerRef\.current\(\)/);
    assert.match(source, /setEditingFile\(null\);\s+setFileType\(nextFileType\);\s+fetchFiles\('\.', nextFileType\)/);
    assert.match(source, /onSave=\{\(\) => \{\s+if \(!saveDisabled\) saveFileHandlerRef\.current\(\);/);
    assert.match(visualEditorSource, /export function VisualConfigEditor\(\{ content, onChange, onSave \}\)/);
    assert.match(visualEditorSource, /parseConfigLine/);
    assert.match(visualEditorSource, /replaceConfigLineValue/);
    assert.match(visualEditorSource, /onKeyDown=\{handleKeyDown\}/);
    assert.match(stateSource, /const \[fileListLoading, setFileListLoading\] = useState\(false\)/);
    assert.match(stateSource, /const \[fileListError, setFileListError\] = useState\(''\)/);
    assert.match(stateSource, /const \[fileReadLoading, setFileReadLoading\] = useState\(false\)/);
    assert.match(stateSource, /const \[fileReadError, setFileReadError\] = useState\(''\)/);
    assert.match(stateSource, /const \[fileReadTarget, setFileReadTarget\] = useState\(''\)/);
    assert.match(stateSource, /setFileListLoading\(true\)/);
    assert.match(stateSource, /setFileListError\(''\)/);
    assert.match(stateSource, /setFileListError\(apiErrorMessage\(err, 'No se pudieron cargar los archivos'\)\)/);
    assert.match(stateSource, /setFileListLoading\(false\)/);
    assert.match(stateSource, /fileList, setFileList, fileListLoading, setFileListLoading, fileListError, setFileListError/);
    assert.match(stateSource, /setFileReadTarget\(filePath\)/);
    assert.match(stateSource, /setFileReadLoading\(true\)/);
    assert.match(stateSource, /setFileReadError\(''\)/);
    assert.match(stateSource, /setEditingFile\(null\);\s+setEditingContent\(''\)/);
    assert.match(stateSource, /setFileReadTarget\(''\)/);
    assert.match(stateSource, /setFileReadError\(message\)/);
    assert.match(stateSource, /setFileReadLoading\(false\)/);
    assert.match(stateSource, /fileReadLoading, setFileReadLoading, fileReadError, setFileReadError, fileReadTarget, setFileReadTarget/);
    assert.match(stateSource, /const savingFileRef = useRef\(false\)/);
    assert.match(stateSource, /if \(!editingFile \|\| savingFileRef\.current\) return/);
    assert.match(stateSource, /if \(editingFile\.redacted\) \{\s+addToast\('Este archivo contiene secretos redactados\. Usa la rotación segura de secretos\.', 'warning'\);\s+return;\s+\}/);
    assert.match(stateSource, /const targetType = fileType/);
    assert.match(stateSource, /setEditingFile\(\{ path: filePath, type: targetType, name: res\.data\.name, redacted: !!res\.data\.redacted \}\)/);
    assert.match(stateSource, /axios\.post\(`\$\{API_BASE\}\/files\/write`, \{ filePath: editingFile\.path, content: editingContent, type: editingFile\.type \}\)/);
    assert.match(stateSource, /savingFileRef\.current = true/);
    assert.match(stateSource, /savingFileRef\.current = false/);
});

test('visual config editor preserves quoted comment characters and inline comments', () => {
    const quotedHash = parseConfigLine('Message="Discord #rules" ; keep this note');
    assert.equal(quotedHash.key, 'Message');
    assert.equal(quotedHash.value, 'Discord #rules');
    assert.equal(quotedHash.hasQuotes, true);
    assert.equal(quotedHash.commentSuffix, ' ; keep this note');
    assert.equal(replaceConfigLineValue('Message="Discord #rules" ; keep this note', 'Discord #events', quotedHash), 'Message="Discord #events" ; keep this note');

    const quotedSemicolon = parseConfigLine('Greeting = "texto ; nota" # admin note');
    assert.equal(quotedSemicolon.value, 'texto ; nota');
    assert.equal(quotedSemicolon.leadingWhitespace, ' ');
    assert.equal(replaceConfigLineValue('Greeting = "texto ; nota" # admin note', 'texto ; limpio', quotedSemicolon), 'Greeting = "texto ; limpio" # admin note');

    const unquotedHash = parseConfigLine('Motd=Welcome # production');
    assert.equal(unquotedHash.value, 'Welcome');
    assert.equal(unquotedHash.commentSuffix, ' # production');
    assert.equal(replaceConfigLineValue('Motd=Welcome # production', 'Ready', unquotedHash), 'Motd=Ready # production');

    const inlineLiteral = parseConfigLine('Channel=ark#rules');
    assert.equal(inlineLiteral.value, 'ark#rules');
    assert.equal(inlineLiteral.commentSuffix, '');
});

test('dashboard layout allows bounded operational content to scroll', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
    assert.match(app, /dashboard-shell/);
    assert.match(css, /100dvh/);
    assert.match(app, /min-h-0/);
    for (const file of ['PlayersView','FileManager','SettingsView','ServerDashboard','SystemHealth','HubView','GameModesView']) {
        const source = await readFile(new URL(`../src/pages/${file}.jsx`, import.meta.url), 'utf8');
        assert.match(source, /overflow-(?:y|x)-auto|overflow-hidden/);
        assert.doesNotMatch(source, /h-\[calc\(100vh-120px\)\]/);
    }
});

test('restricted hash tabs are not mounted for insufficient roles', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(appSource, /canAccessDashboardTab\(activeTab, userRole\) \? activeTab : 'cluster'/);
    assert.match(appSource, /currentTab === 'admins'/);
    assert.doesNotMatch(appSource, /activeTab === 'admins'/);
    assert.match(stateSource, /normalizeDashboardTabForRole\(tab, userRole\)/);
    assert.match(stateSource, /normalizeDashboardTabForRole\(activeTab, userRole\)/);
});

test('main layout exposes persistent operational context', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const contextBarSource = await readFile(new URL('../src/components/layout/OperationalContextBar.jsx', import.meta.url), 'utf8');
    const playersSidebarSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');
    const dashboardConstants = await readFile(new URL('../src/constants/dashboard.js', import.meta.url), 'utf8');

    assert.match(appSource, /import \{ OperationalContextBar \} from '\.\/components\/layout\/OperationalContextBar'/);
    assert.match(appSource, /<OperationalContextBar \/>/);
    assert.match(dashboardConstants, /export const DASHBOARD_TAB_META = \{/);
    assert.match(dashboardConstants, /plugins: \{/);
    assert.match(dashboardConstants, /label: 'Plugins Runtime'/);
    assert.match(contextBarSource, /aria-label="Contexto operacional actual"/);
    assert.match(contextBarSource, /liveDataStale/);
    assert.doesNotMatch(contextBarSource, /overflow-x-auto no-scrollbar/);
    assert.match(appSource, /import \{ PLAYER_PANEL_DESKTOP_TABS, canAccessDashboardTab \} from '\.\/constants\/dashboard'/);
    const playerPanelTabs = dashboardConstants.match(/export const PLAYER_PANEL_DESKTOP_TABS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
    assert.match(dashboardConstants, /export const PLAYER_PANEL_DESKTOP_TABS = new Set\(\[/);
    for (const dockedTab of ['cluster', 'dashboard', 'players', 'bans', 'tasks', 'rcon', 'settings', 'files']) {
        assert.match(playerPanelTabs, new RegExp(`'${dockedTab}'`));
    }
    for (const undockedTab of ['admins', 'audit', 'global_settings', 'system_health', 'plugins', 'deploy']) {
        assert.doesNotMatch(playerPanelTabs, new RegExp(`'${undockedTab}'`));
    }
    assert.match(appSource, /const dockPlayersPanel = PLAYER_PANEL_DESKTOP_TABS\.has\(currentTab\)/);
    assert.match(appSource, /<GlobalPlayersSidebar desktopDocked=\{dockPlayersPanel\} \/>/);
    assert.match(playersSidebarSource, /export function GlobalPlayersSidebar\(\{ desktopDocked = true \}\)/);
    assert.match(playersSidebarSource, /const desktopDockedClasses = desktopDocked\s+\?/);
    assert.match(playersSidebarSource, /: ''/);
    assert.match(playersSidebarSource, /const closeButtonClasses = desktopDocked\s+\?/);
    assert.match(playersSidebarSource, /className=\{closeButtonClasses\}/);
    assert.match(playersSidebarSource, /2xl:relative 2xl:inset-auto 2xl:z-40 2xl:flex 2xl:h-full 2xl:max-h-full 2xl:min-h-0/);
    assert.match(playersSidebarSource, /2xl:w-\[320px\] 2xl:self-stretch 2xl:translate-x-0/);
    assert.match(playersSidebarSource, /\$\{desktopDocked \? '2xl:hidden' : ''\}/);
    assert.doesNotMatch(playersSidebarSource, /xl:h-\[calc\(100vh-104px\)\]/);
    assert.doesNotMatch(playersSidebarSource, /xl:top-6/);
    assert.match(playersSidebarSource, /className="shrink-0 p-4 border-b border-zinc-800 flex flex-col gap-3 bg-\[#09090b\]"/);
    assert.match(playersSidebarSource, /className="shrink-0 p-3 border-b border-zinc-800 bg-\[#09090b\]"/);
    assert.match(playersSidebarSource, /className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-2 bg-\[#18181b\]"/);
});

test('mobile drawers sit above the header and opening one closes the other', async () => {
    const topNavSource = await readFile(new URL('../src/components/layout/TopNavbar.jsx', import.meta.url), 'utf8');
    const playerSidebarSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');
    const serverSidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');

    assert.match(topNavSource, /setMobilePlayersOpen\(false\); setMobileNavOpen\(!mobileNavOpen\)/);
    assert.match(topNavSource, /setMobileNavOpen\(false\); setMobilePlayersOpen\(!mobilePlayersOpen\)/);
    assert.match(topNavSource, /import \{ PLAYER_PANEL_DESKTOP_TABS, canAccessDashboardTab \} from '..\/..\/constants\/dashboard'/);
    assert.match(topNavSource, /const currentTab = canAccessDashboardTab\(activeTab, userRole\) \? activeTab : 'cluster'/);
    assert.match(topNavSource, /const playersDockedOnCurrentTab = PLAYER_PANEL_DESKTOP_TABS\.has\(currentTab\)/);
    assert.match(topNavSource, /\$\{playersDockedOnCurrentTab \? '2xl:hidden' : ''\}/);
    assert.match(playerSidebarSource, /z-\[90\]/);
    assert.match(playerSidebarSource, /z-\[100\]/);
    assert.match(serverSidebarSource, /z-\[90\]/);
    assert.match(serverSidebarSource, /z-\[100\]/);
    for (const source of [playerSidebarSource, serverSidebarSource]) {
        assert.match(source, /role=\{mobile[A-Za-z]+Open \? 'dialog' : undefined\}/);
        assert.match(source, /aria-modal=\{mobile[A-Za-z]+Open \? 'true' : undefined\}/);
        assert.match(source, /event\.key === 'Escape'/);
        assert.match(source, /event\.key !== 'Tab'/);
        assert.match(source, /DRAWER_FOCUSABLE_SELECTOR/);
        assert.match(source, /querySelectorAll\(DRAWER_FOCUSABLE_SELECTOR\)/);
        assert.match(source, /event\.shiftKey && document\.activeElement === firstElement/);
        assert.match(source, /!event\.shiftKey && document\.activeElement === lastElement/);
        assert.match(source, /document\.addEventListener\('keydown', handleKeyDown\)/);
        assert.match(source, /document\.removeEventListener\('keydown', handleKeyDown\)/);
        assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
        assert.match(source, /document\.body\.style\.overflow = previousBodyOverflow/);
        assert.match(source, /previousFocusRef\.current\?\.focus\?\.\(\{ preventScroll: true \}\)/);
        assert.match(source, /w-\[min\(/);
        assert.match(source, /calc\(100vw-1rem\)/);
    }
    assert.match(playerSidebarSource, /aria-labelledby="players-sidebar-title"/);
    assert.match(playerSidebarSource, /id="players-sidebar-title"/);
    assert.match(serverSidebarSource, /aria-labelledby="server-sidebar-title"/);
    assert.match(serverSidebarSource, /id="server-sidebar-title"/);
});

test('dashboard state polling effects declare stable fetch dependencies', async () => {
    const source = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const clusterSource = await readFile(new URL('../src/pages/ClusterOverview.jsx', import.meta.url), 'utf8');
    const dashboardSource = await readFile(new URL('../src/pages/ServerDashboard.jsx', import.meta.url), 'utf8');

    assert.match(source, /useEffect\(\(\) => \{ verifyToken\(\); \}, \[verifyToken\]\)/);
    assert.match(source, /\}, \[user, fetchClusterStatus, fetchLiveData\]\)/);
    assert.match(source, /liveDataRequestRef/);
    assert.match(source, /clusterStatusRequestRef/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /axios\.get\(`\$\{API_BASE\}\/server\/live\?mapId=\$\{encodeURIComponent\(selectedMap\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(source, /axios\.get\(`\$\{API_BASE\}\/cluster\/status`, \{ signal: controller\.signal \}\)/);
    assert.match(source, /liveDataRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /clusterStatusRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /isCanceledRequest\(err\)/);
    assert.match(source, /const \[clusterStatusError, setClusterStatusError\] = useState\(''\)/);
    assert.match(source, /const \[liveDataError, setLiveDataError\] = useState\(''\)/);
    assert.match(source, /const LIVE_DATA_STALE_MS = 15000/);
    assert.match(source, /const \[liveDataUpdatedAt, setLiveDataUpdatedAt\] = useState\(0\)/);
    assert.match(source, /setLiveDataUpdatedAt\(Date\.now\(\)\)/);
    assert.match(source, /const liveDataStale = Boolean\(selectedMap && \(liveDataError \|\| !liveDataUpdatedAt \|\| Date\.now\(\) - liveDataUpdatedAt > LIVE_DATA_STALE_MS\)\)/);
    assert.match(source, /setLiveDataError\(err\.response\?\.data\?\.error \|\| 'No se pudo actualizar el estado del mapa'\)/);
    assert.match(source, /setClusterStatusError\(err\.response\?\.data\?\.error \|\| 'No se pudo actualizar el estado del clúster'\)/);
    assert.match(source, /setLiveDataError\(res\.data\.error \|\| \(res\.data\.status === 'error' \? 'No se pudo actualizar el estado del mapa' : ''\)\)/);
    assert.match(source, /setClusterStatusError\(res\.data\.error \|\| ''\)/);
    assert.match(source, /handleQuickAction, fetchClusterStatus, fetchOnlinePlayers/);
    assert.match(clusterSource, /aria-label="Reintentar telemetría"/);
    assert.match(clusterSource, /No hay mapas gestionados/);
    assert.match(dashboardSource, /Telemetría del mapa sin actualizar/);
    assert.match(source, /\}, \[user, userRole, fetchOnlinePlayers, fetchIngameAdmins\]\)/);
    assert.match(source, /\}, \[user, activeTab, currentPath, fetchFiles\]\)/);
    assert.match(source, /fileListRequestRef/);
    assert.match(source, /fileReadRequestRef/);
    assert.match(source, /axios\.get\(`\$\{API_BASE\}\/files\/list\?path=\$\{encodeURIComponent\(dirPath\)\}&type=\$\{encodeURIComponent\(targetType\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(source, /axios\.get\(`\$\{API_BASE\}\/files\/read\?path=\$\{encodeURIComponent\(filePath\)\}&type=\$\{encodeURIComponent\(targetType\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(source, /fileListRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /fileReadRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /\}, \[user, activeTab, fetchAuditLog\]\)/);
    assert.doesNotMatch(source, /eslint-disable-next-line react-hooks\/exhaustive-deps/);
});

test('dashboard clears privileged cached state when role or session loses access', async () => {
    const source = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(source, /const canOperate = Boolean\(user && \['operator', 'owner'\]\.includes\(userRole\)\)/);
    assert.match(source, /const canOwn = Boolean\(user && userRole === 'owner'\)/);
    assert.match(source, /if \(!canOperate\) \{/);
    assert.match(source, /playerHistoryRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /bansRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /tasksRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /setPlayerHistory\(\[\]\)/);
    assert.match(source, /setBans\(\[\]\)/);
    assert.match(source, /setTasks\(\[\]\)/);
    assert.match(source, /setTaskScheduleContext\(null\)/);
    assert.match(source, /if \(!canOwn\) \{/);
    assert.match(source, /adminsRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /auditRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /fileListRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /fileReadRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /setAdmins\(\[\]\)/);
    assert.match(source, /setAuditLogs\(\[\]\)/);
    assert.match(source, /setRconLog\(\[\]\)/);
    assert.match(source, /setCommandHistory\(\[\]\)/);
    assert.match(source, /setFileList\(\[\]\)/);
    assert.match(source, /setEditingFile\(null\)/);
    assert.match(source, /setMultipliers\(\{\}\)/);
    assert.match(source, /setSettingsLoaded\(false\)/);
    assert.match(source, /\}, \[user, userRole\]\)/);
});

test('clipboard helper falls back and reports browser permission failures', async () => {
    const source = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');

    assert.match(source, /const copyToClipboard = async \(text\) => \{/);
    assert.match(source, /const content = String\(text \?\? ''\)/);
    assert.match(source, /navigator\.clipboard\?\.writeText && window\.isSecureContext/);
    assert.match(source, /await navigator\.clipboard\.writeText\(content\)/);
    assert.match(source, /document\.createElement\('textarea'\)/);
    assert.match(source, /textArea\.setAttribute\('readonly', ''\)/);
    assert.match(source, /document\.execCommand\('copy'\)/);
    assert.match(source, /finally \{\s+if \(textArea\.parentNode\) textArea\.parentNode\.removeChild\(textArea\);\s+\}/);
    assert.match(source, /addToast\('Copiado al portapapeles', 'success'\)/);
    assert.match(source, /addToast\('No se pudo copiar al portapapeles\. Revisa permisos del navegador\.', 'error'\)/);
    assert.match(source, /return true/);
    assert.match(source, /return false/);
});

test('managed map selection is derived from cluster metadata instead of a hardcoded map id', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const globalSettingsSource = await readFile(new URL('../src/pages/GlobalSettings.jsx', import.meta.url), 'utf8');
    const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[selectedMap, setSelectedMap\] = useState\(''\)/);
    assert.match(stateSource, /const \[clusterMapsError, setClusterMapsError\] = useState\(''\)/);
    assert.match(stateSource, /clusterMapsRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/cluster\/maps`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /clusterMapsRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /fetchClusterMaps/);
    assert.match(stateSource, /if \(!selectedMap\) return;/);
    assert.match(stateSource, /setClusterMapsError\(''\)/);
    assert.match(stateSource, /setSelectedMap\(current => maps\.some\(map => map\.id === current\) \? current : \(maps\[0\]\?\.id \|\| ''\)\)/);
    assert.match(stateSource, /setClusterMapsError\(err\.response\?\.data\?\.error \|\| 'No se pudo cargar el inventario de mapas'\)/);
    assert.match(stateSource, /setSelectedMap\(''\)/);
    assert.match(sidebarSource, /Mapas no disponibles/);
    assert.match(sidebarSource, /relative z-10 flex shrink-0 flex-col overflow-visible rounded-xl/);
    assert.doesNotMatch(sidebarSource, /rounded-xl overflow-hidden flex flex-col shrink-0/);
    assert.match(sidebarSource, /aria-haspopup="listbox"/);
    assert.match(sidebarSource, /aria-expanded=\{mapSelectorOpen\}/);
    assert.match(sidebarSource, /aria-controls="server-map-selector-list"/);
    assert.match(sidebarSource, /id="server-map-selector-list"/);
    assert.match(sidebarSource, /role="listbox"/);
    assert.match(sidebarSource, /aria-label="Seleccionar mapa activo"/);
    assert.match(sidebarSource, /role="option"/);
    assert.match(sidebarSource, /aria-selected=\{selectedMap === map\.id\}/);
    assert.match(sidebarSource, /z-\[120\]/);
    assert.match(sidebarSource, /max-h-\[min\(50dvh,20rem\)\]/);
    assert.match(sidebarSource, /overflow-y-auto/);
    assert.match(sidebarSource, /min-w-0 flex-1 truncate/);
    assert.match(sidebarSource, /title=\{map\.name\}/);
    assert.match(sidebarSource, /clusterMapsError \|\| 'No hay mapas configurados\.'/);
    assert.doesNotMatch(stateSource, /useState\('ragnarok'\)/);
    assert.doesNotMatch(globalSettingsSource, /selectedMap \|\| 'ragnarok'/);
    assert.match(globalSettingsSource, /setSecretMapId\(selectedMap \|\| clusterMaps\[0\]\?\.id \|\| ''\)/);
    assert.match(globalSettingsSource, /const hasPendingSecret = Object\.values\(secretValues\)\.some\(value => value\.trim\(\)\.length > 0\)/);
    assert.match(globalSettingsSource, /const savingSettingsRef = useRef\(false\)/);
    assert.match(globalSettingsSource, /const savingSecretsRef = useRef\(false\)/);
    assert.match(globalSettingsSource, /setModal/);
    assert.match(globalSettingsSource, /const secretFieldLabels = \{/);
    assert.match(globalSettingsSource, /if \(savingSettingsRef\.current\) return/);
    assert.match(globalSettingsSource, /savingSettingsRef\.current = true/);
    assert.match(globalSettingsSource, /savingSettingsRef\.current = false/);
    assert.match(globalSettingsSource, /if \(savingSecretsRef\.current\) return/);
    assert.match(globalSettingsSource, /savingSecretsRef\.current = true/);
    assert.match(globalSettingsSource, /savingSecretsRef\.current = false/);
    assert.match(globalSettingsSource, /setModal\(\{\s+type: 'danger'/);
    assert.match(globalSettingsSource, /title: 'Confirmar rotación de secretos'/);
    assert.match(globalSettingsSource, /expectedInput: `ROTAR SECRETOS \$\{secretMapId\}`/);
    assert.match(globalSettingsSource, /confirmText: 'Rotar secretos'/);
    assert.match(globalSettingsSource, /onConfirm: \(\) => rotateSecrets\(\{ mapId: secretMapId, secrets \}\)/);
    assert.match(globalSettingsSource, /disabled=\{savingSecrets \|\| !secretMapId \|\| !hasPendingSecret\}/);
});

test('rcon console requires selected map, fresh state and allowed transport before sending', async () => {
    const state = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const console = await readFile(new URL('../src/pages/RconConsole.jsx', import.meta.url), 'utf8');
    assert.match(state, /if \(!selectedMap\) \{/);
    assert.match(state, /Selecciona un mapa antes de enviar comandos RCON/);
    assert.match(state, /if \(liveDataStale\) \{/);
    assert.match(state, /if \(rconSendingRef\.current\) return false/);
    assert.match(state, /rconSendingRef\.current = true/);
    assert.match(state, /rconSendingRef\.current = false/);
    assert.match(state, /mapId: selectedMap/);
    assert.match(console, /const rconBlocked = !hasSelectedMap \|\| liveDataStale \|\| !rconAvailable/);
    assert.match(console, /actions\?\.console === true/);
    assert.match(console, /disabled=\{rconBlocked \|\| rconSending/);
    assert.match(console, /aria-label="Comando RCON"/);
    assert.match(console, /aria-label="Enviar comando RCON"/);
    assert.match(console, /consoleEntriesForMap\(rconLog, selectedMap\)/);
    assert.match(console, /consoleText\(log\.text\)/);
    assert.match(console, /logsRequestRef\.current\?\.abort\(\)/);
    assert.match(console, /signal: controller\.signal/);
    assert.match(console, /requestAnimationFrame/);
    assert.match(console, /resizeObserver\?\.disconnect\(\)/);
    for (const command of ['DestroyWildDinos','ForceTame']) {
        const action = QUICK_ACTIONS.find(item => item.cmd === command);
        assert.equal(action.confirm, true);
        assert.equal(action.group, 'danger');
        assert.ok(action.expectedInput.length > 4);
    }
    assert.match(state, /if \(quickAction\?\.confirm\)/);
    assert.match(state, /expectedInput: quickAction\.expectedInput/);
});

test('plugins view keeps a retryable state when runtime inventory fails', async () => {
    const source = await readFile(new URL('../src/pages/PluginsView.jsx', import.meta.url), 'utf8');

    assert.match(source, /const EMPTY_OBELISK_RUNTIME = Object\.freeze/);
    assert.match(source, /const EMPTY_ARKAPI_RUNTIME = Object\.freeze/);
    assert.match(source, /const MARKER_RISK_LABELS = \{/);
    assert.match(source, /const SENSITIVE_MARKERS = new Set\(Object\.keys\(MARKER_RISK_LABELS\)\)/);
    assert.match(source, /const \[error, setError\] = useState\(''\)/);
    assert.match(source, /setError\(message\)/);
    assert.match(source, /No se pudo cargar el inventario de plugins/);
    assert.match(source, /Reintentar/);
    assert.match(source, /refreshing \? 'Actualizando\.\.\.' : 'Actualizar'/);
    assert.match(source, /refreshing \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(source, /disabled:cursor-not-allowed disabled:opacity-50/);
    assert.match(source, /setSelectedInstance\(current => \{/);
    assert.match(source, /const nextSelected = nextInstances\.some\(instance => instance\.name === current\) \? current : nextInstances\[0\]\?\.name \|\| ''/);
    assert.match(source, /if \(!nextSelected \|\| nextSelected !== current\) \{/);
    assert.match(source, /setLogs\(''\);\s+setLogsError\(''\);\s+logsRequestRef\.current\?\.abort\(\);\s+logsRequestRef\.current = null/);
    assert.match(source, /statusRequestRef/);
    assert.match(source, /logsRequestRef/);
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /axios\.get\('\/api\/plugins\/status', \{ signal: controller\.signal \}\)/);
    assert.match(source, /axios\.get\(`\/api\/plugins\/obelisk\/logs\?instance=\$\{encodeURIComponent\(selectedInstance\)\}&lines=200`, \{ signal: controller\.signal \}\)/);
    assert.match(source, /statusRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /logsRequestRef\.current\?\.abort\(\)/);
    assert.match(source, /if \(!selectedInstance\) \{\s+setLogs\(''\);\s+setLogsError\(''\);\s+setLogsLoading\(false\);\s+return;\s+\}/);
    assert.match(source, /isCanceledRequest\(err\)/);
    assert.match(source, /if \(statusRequestRef\.current !== controller\) return/);
    assert.match(source, /if \(logsRequestRef\.current !== controller\) return/);
    assert.match(source, /disabled=\{instances\.length === 0\}/);
    assert.match(source, /const \[logsError, setLogsError\] = useState\(''\)/);
    assert.match(source, /setLogsError\(message\)/);
    assert.match(source, /Log no disponible/);
    assert.doesNotMatch(source, /Log unavailable/);
    assert.match(source, /disabled=\{logsLoading \|\| !selectedInstance\}/);
    assert.match(source, /min-w-\[8\.75rem\]/);
    assert.match(source, /title=\{logsLoading \? 'Actualizando log de runtime Linux' : 'Actualizar log de runtime Linux'\}/);
    assert.match(source, /logsLoading \? 'Actualizando\.\.\.' : 'Actualizar log'/);
    assert.match(source, /const markerMutationRef = useRef\(''\)/);
    assert.match(source, /if \(!canWrite \|\| markerMutationRef\.current\) return/);
    assert.match(source, /markerMutationRef\.current = actionKey/);
    assert.match(source, /if \(markerMutationRef\.current === actionKey\)/);
    assert.match(source, /const requestMarkerToggle = \(instance, marker, enabled\) => \{/);
    assert.match(source, /setModal\(\{\s+type: 'danger'/);
    assert.match(source, /const expectedInput = `\$\{enabled \? 'ACTIVAR' : 'DESACTIVAR'\} \$\{marker\}`/);
    assert.match(source, /expectedInput,/);
    assert.match(source, /confirmText: enabled \? 'Activar marcador' : 'Desactivar marcador'/);
    assert.match(source, /Experimental: requiere runtime Linux compatible y reinicio controlado/);
    assert.match(source, /El marcador para desactivar plugins está activo/);
    assert.match(source, /const blocked = Boolean\(markerLoading\)/);
    assert.match(source, /disabled=\{!canWrite \|\| blocked\}/);
    assert.match(source, /min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-6 custom-scrollbar/);
    assert.match(source, /const PLUGIN_VIEW_TABS = \[/);
    for (const label of ['Resumen', 'Plugins', 'Consola', 'ArkApi']) {
        assert.match(source, new RegExp(`label: '${label}'`));
    }
    assert.match(source, /const \[activeView, setActiveView\] = useState\('overview'\)/);
    assert.match(source, /const arkApiAppliesToHost = arkApi\.platform === 'win32'/);
    assert.match(source, /const visiblePluginTabs = PLUGIN_VIEW_TABS\.filter\(tab => tab\.id !== 'arkapi' \|\| arkApiAppliesToHost\)/);
    assert.match(source, /const linuxCapability = canWrite/);
    assert.match(source, /Marcadores disponibles en Linux/);
    assert.match(source, /Requiere owner para operar marcadores/);
    assert.match(source, /const arkApiCapability = arkApi\.available \? 'Inventario Windows en solo lectura' : 'Sin inventario ArkApi detectado'/);
    assert.match(source, /role="tablist" aria-label="Vistas de gestión de plugins"/);
    assert.match(source, /role="tab"/);
    assert.match(source, /aria-selected=\{selected\}/);
    assert.match(source, /onClick=\{\(\) => setActiveView\(tab\.id\)\}/);
    assert.match(source, /onClick=\{\(\) => \{\s+setLogs\(''\);\s+setLogsError\(''\);\s+setSelectedInstance\(instance\.name\);\s+setActiveView\('console'\);\s+\}\}/);
    assert.match(source, /onChange=\{event => \{\s+setLogs\(''\);\s+setLogsError\(''\);\s+setSelectedInstance\(event\.target\.value\);\s+\}\}/);
    assert.match(source, /const showOverview = activeView === 'overview'/);
    assert.match(source, /const showArkApi = activeView === 'arkapi' && arkApiAppliesToHost/);
    assert.match(source, /const showPluginInventory = activeView === 'plugins'/);
    assert.match(source, /const showLogs = activeView === 'console'/);
    assert.match(source, /if \(activeView === 'arkapi' && !arkApiAppliesToHost\) \{/);
    assert.match(source, /const runtimeMode = useMemo\(\(\) => \{/);
    assert.match(source, /Modo Windows: ArkApi inventariado/);
    assert.doesNotMatch(source, /Modo mixto: runtime Linux preparado y ArkApi inventariado/);
    assert.doesNotMatch(source, /Inventario ArkApi: solo lectura/);
    assert.match(source, /Sin runtime detectado: configura rutas antes de operar plugins/);
    assert.match(source, /aria-label="Resumen de runtimes de plugins"/);
    assert.match(source, /Inventario y preparación operativa por runtime, manteniendo separadas las acciones Linux y ArkApi/);
    assert.match(source, /El resumen evita duplicar inventarios; usa las tabs para detalle/);
    assert.match(source, /aria-label="Resumen operativo de plugins"/);
    assert.match(source, /Ver plugins/);
    assert.match(source, /Abrir consola/);
    assert.match(source, /\{arkApiAppliesToHost && \(/);
    assert.match(source, /Ver inventario ArkApi/);
    assert.match(source, /Solo inventario: este panel no instala, habilita ni modifica plugins ArkApi/);
    assert.match(source, /aria-label="Actualizar inventario de runtimes de plugins"/);
    assert.match(source, /dashboard-card flex min-h-\[420px\] flex-col overflow-hidden rounded-lg/);
    assert.match(source, /min-h-0 flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar/);
    assert.match(source, /dashboard-card flex min-h-\[280px\] flex-col overflow-hidden rounded-lg/);
    assert.match(source, /xl:h-full xl:min-h-0/);
    assert.match(source, /xl:min-h-0/);
    assert.match(source, /min-h-0 flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar/);
    assert.match(source, /pre className="min-h-\[220px\] flex-1 overflow-auto whitespace-pre-wrap[\s\S]*xl:min-h-0/);
    assert.match(source, /aria-label="Actualizar log de runtime Linux"/);
    assert.match(source, /Plugins instalados/);
    assert.match(source, /No se detectó inventario ArkApi/);
    assert.match(source, /Librerías/);
    assert.match(source, /Instancias/);
    assert.match(source, /plugin\.configExists \? 'config' : 'sin config'/);
    assert.doesNotMatch(source, /min-w-\[680px\] table-fixed/);
    assert.doesNotMatch(source, /<th className="px-3 py-2">Modificado<\/th>/);
    assert.doesNotMatch(source, /xl:h-\[min\(56dvh,520px\)\]/);
    assert.doesNotMatch(source, /h-\[min\(42dvh,360px\)\] min-h-\[220px\] max-h-\[360px\]/);
});

test('settings view does not advertise restarts and requires a selected map', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const settingsSource = await readFile(new URL('../src/pages/SettingsView.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /if \(!selectedMap\) \{\s*addToast\('Selecciona un mapa antes de guardar ajustes', 'warning'\);/);
    assert.match(stateSource, /if \(!selectedMap\) \{\s*addToast\('Selecciona un mapa antes de aplicar presets', 'warning'\);/);
    assert.match(stateSource, /settingsRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/config\/gameini\?mapId=\$\{encodeURIComponent\(selectedMap\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/config\/gameusersettings\?mapId=\$\{encodeURIComponent\(selectedMap\)\}`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /settingsRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /const settingsMutationRef = useRef\(''\)/);
    assert.match(stateSource, /if \(settingsMutationRef\.current\) return/);
    assert.match(stateSource, /settingsMutationRef\.current = 'settings'/);
    assert.match(stateSource, /settingsMutationRef\.current = `preset:\$\{preset\.id\}`/);
    assert.match(stateSource, /settingsMutationRef\.current = ''/);
    assert.match(settingsSource, /clusterMaps/);
    assert.match(settingsSource, /const selectedMapMeta = clusterMaps\.find\(map => map\.id === selectedMap\)/);
    assert.match(settingsSource, /const selectedMapName = selectedMapMeta\?\.name \|\| selectedMap \|\| ''/);
    assert.match(settingsSource, /const settingsEditingDisabled = savingSettings \|\| !selectedMap/);
    assert.match(settingsSource, /if \(settingsEditingDisabled\) return/);
    assert.match(settingsSource, /onClick=\{\(\) => \{ if \(!settingsEditingDisabled\) setMultipliers/);
    assert.match(settingsSource, /disabled=\{savingSettings \|\| !selectedMap\}/);
    assert.match(settingsSource, /disabled=\{settingsEditingDisabled\}/);
    assert.match(settingsSource, /disabled=\{presetLoading \|\| !selectedMap\}/);
    assert.match(settingsSource, /Mapa objetivo: \$\{selectedMapName\}/);
    assert.match(settingsSource, /Los cambios y presets se aplican solo a esta instancia/);
    assert.match(settingsSource, /Selecciona un mapa del clúster para editar sus ajustes/);
    assert.match(settingsSource, /aria-label=\{`\$\{val \? 'Desactivar' : 'Activar'\} \$\{meta\.label\}`\}/);
    assert.match(settingsSource, /aria-label=\{`Reducir \$\{meta\.label\}`\}/);
    assert.match(settingsSource, /aria-label=\{`Incrementar \$\{meta\.label\}`\}/);
    assert.match(settingsSource, /min-h-11 min-w-11/);
    assert.match(settingsSource, /Guardar cambios/);
    assert.doesNotMatch(settingsSource, /Guardar y Reiniciar/);
});

test('tasks and presets keep retryable error states instead of false empty states', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');
    const settingsSource = await readFile(new URL('../src/pages/SettingsView.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[tasksError, setTasksError\] = useState\(''\)/);
    assert.match(stateSource, /const \[taskScheduleContext, setTaskScheduleContext\] = useState\(null\)/);
    assert.match(stateSource, /tasksRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/tasks`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /tasksRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /setTasksError\(''\)/);
    assert.match(stateSource, /setTaskScheduleContext\(res\.data\.scheduleContext \|\| null\)/);
    assert.match(stateSource, /if \(tasksRequestRef\.current !== controller\) return;\s+setTasksError\(apiErrorMessage\(err, 'Error cargando las tareas programadas'\)\)/);
    assert.match(stateSource, /setTasksError\(apiErrorMessage\(err, 'Error cargando las tareas programadas'\)\)/);
    assert.match(tasksSource, /tasksError/);
    assert.match(tasksSource, /Reintentar/);
    assert.match(tasksSource, /tasksLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(tasksSource, /disabled:cursor-not-allowed disabled:opacity-50/);
    assert.match(tasksSource, /tasks\.length === 0 && !tasksError/);

    assert.match(stateSource, /const \[presetsError, setPresetsError\] = useState\(''\)/);
    assert.match(stateSource, /const \[presetsLoaded, setPresetsLoaded\] = useState\(false\)/);
    assert.match(stateSource, /presetsRequestRef/);
    assert.match(stateSource, /axios\.get\(`\$\{API_BASE\}\/presets`, \{ signal: controller\.signal \}\)/);
    assert.match(stateSource, /presetsRequestRef\.current\?\.abort\(\)/);
    assert.match(stateSource, /setPresetsError\(''\)/);
    assert.match(stateSource, /setPresetsLoaded\(true\)/);
    assert.match(stateSource, /setPresetsLoaded\(false\)/);
    assert.match(stateSource, /if \(presetsRequestRef\.current !== controller\) return;\s+setPresetsError\(apiErrorMessage\(err, 'No se pudieron cargar los presets'\)\)/);
    assert.match(stateSource, /setPresetsError\(apiErrorMessage\(err, 'No se pudieron cargar los presets'\)\)/);
    assert.match(settingsSource, /presetsError/);
    assert.match(settingsSource, /presetsLoaded/);
    assert.match(settingsSource, /fetchPresets/);
    assert.match(settingsSource, /Reintentar/);
    assert.match(settingsSource, /onClick=\{fetchPresets\}/);
    assert.match(settingsSource, /disabled=\{presetLoading\}/);
    assert.match(settingsSource, /className=\{presetLoading \? 'animate-spin' : ''\}/);
    assert.match(settingsSource, /presetLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(settingsSource, /presetsError \? \(/);
    assert.match(settingsSource, /!presetsLoaded \? \(/);
    assert.match(settingsSource, /No hay presets configurados/);
});

test('scheduled DoExit creation matches backend safety constraints', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const action = taskInput\?\.action \|\| newTaskAction/);
    assert.match(stateSource, /if \(action === 'DoExit' && targetTaskMapId === 'all'\) \{/);
    assert.match(stateSource, /Selecciona un mapa concreto antes de programar DoExit/);
    assert.match(stateSource, /if \(action === 'DoExit' && userRole !== 'owner'\) \{/);
    assert.match(stateSource, /DoExit programado debe usar una frecuencia de al menos una hora/);
    assert.match(stateSource, /mapId: targetTaskMapId/);

    assert.match(tasksSource, /const isDoExitTask = newTaskAction === 'DoExit'/);
    assert.match(tasksSource, /import \{ TASK_MIN_INTERVAL_MINUTES, cronMinuteInterval, deriveTaskCronDraft, taskCronDraftSummary \} from '\.\.\/utils\/taskCron\.js'/);
    assert.match(tasksSource, /if \(action === 'DoExit'\) \{/);
    assert.match(tasksSource, /setNewTaskMapId\(firstMapId\)/);
    assert.match(tasksSource, /if \(newTaskCronMode === 'minutes'\) \{/);
    assert.match(tasksSource, /setCronDraftNotice\('DoExit no permite intervalos en minutos/);
    assert.match(tasksSource, /<option value="all" disabled=\{isDoExitTask\}>/);
    assert.match(tasksSource, /<option value="minutes" disabled=\{isDoExitTask\}>/);
    assert.match(tasksSource, /disabled=\{!canSubmitTask\}/);
    assert.match(tasksSource, /const createBlockedReason = \(\(\) => \{/);
    assert.match(tasksSource, /DoExit debe apuntar a un único mapa/);
    assert.match(tasksSource, /No hay mapas gestionados para programar DoExit/);
    assert.match(tasksSource, /DoExit requiere owner, un único mapa y al menos 60 minutos/);
    assert.match(tasksSource, /const openDoExitConfirmation = \(\{ title, confirmText, expectedInput, cronExpr, mapId, nextRunLabel, onConfirm \}\) => \{/);
    assert.match(tasksSource, /Próxima ejecución: \$\{nextRunLabel \|\| 'No calculable'\} \(\$\{serverTimeZone\}\)/);
    assert.match(tasksSource, /expectedInput: `DOEXIT \$\{selectedTaskMapId\}`/);
    assert.match(tasksSource, /confirmText: 'Crear DoExit'/);
    assert.match(tasksSource, /confirmText: 'Guardar DoExit'/);
    assert.match(tasksSource, /Confirmar DoExit programado/);
    assert.match(tasksSource, /Esta automatización reiniciará la instancia/);
});

test('scheduled task creation exposes compact validation before submit', async () => {
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');

    assert.match(tasksSource, /const BROADCAST_PAYLOAD_MAX_LENGTH = 500/);
    assert.match(tasksSource, /import \{ getNextCronExecutions, parseCronExpression \} from '\.\.\/utils\/cronPreview\.js'/);
    assert.match(tasksSource, /function hasControlCharacters\(value\) \{/);
    assert.match(tasksSource, /return code < 32 \|\| code === 127/);
    assert.match(tasksSource, /const customCronFieldCount = newTaskCron\.trim\(\) \? newTaskCron\.trim\(\)\.split\(\/\\s\+\/\)\.length : 0/);
    assert.match(tasksSource, /const selectedCronMinuteInterval = newTaskCronMode === 'minutes'/);
    assert.match(tasksSource, /const editingCronWillChange = taskModalMode === 'edit'/);
    assert.match(tasksSource, /const requiresCronChangeAcknowledgement = editingCronWillChange && !cronChangeAcknowledged/);
    assert.match(tasksSource, /const \[cronDraftTouched, setCronDraftTouched\] = useState\(false\)/);
    assert.match(tasksSource, /const \[cronDraftPreserveOriginal, setCronDraftPreserveOriginal\] = useState\(true\)/);
    assert.match(tasksSource, /taskModalMode === 'edit' && editingTask && !cronDraftTouched && cronDraftPreserveOriginal/);
    assert.match(tasksSource, /return String\(editingTask\.cron \|\| ''\)\.trim\(\)/);
    assert.match(tasksSource, /const serverTimeZone = taskScheduleContext\?\.timeZone/);
    assert.match(tasksSource, /const nextCronRuns = useMemo\(/);
    assert.match(tasksSource, /getNextCronExecutions\(previewCron/);
    assert.match(tasksSource, /Zona del servidor: \{serverTimeZone\}/);
    assert.match(tasksSource, /Próximas ejecuciones/);
    assert.match(tasksSource, /Acepta el cambio de Cron detectado antes de guardar la tarea/);
    assert.match(tasksSource, /selectedCronMinuteInterval !== null && selectedCronMinuteInterval < selectedActionMinInterval/);
    assert.match(tasksSource, /El anuncio no puede superar/);
    assert.match(tasksSource, /El anuncio contiene caracteres de control no permitidos/);
    assert.match(tasksSource, /Cron personalizado debe tener 5 campos: minuto hora día-del-mes mes día-semana/);
    assert.match(tasksSource, /Cron personalizado inválido: minuto 0-59, hora 0-23/);
    assert.match(tasksSource, /function computeFinalCron\(\) \{/);
    assert.match(tasksSource, /const finalCronDraft = computeFinalCron\(\)/);
    assert.match(tasksSource, /const finalPayloadDraft = newTaskAction === 'Broadcast' \? newTaskPayload\.trim\(\) : ''/);
    assert.match(tasksSource, /const previewCron = finalCronDraft \|\| 'Cron personalizado pendiente'/);
    assert.match(tasksSource, /const customCronInvalid = newTaskCronMode === 'custom' && customCronFieldCount === 5 && !parseCronExpression\(newTaskCron\)/);
    assert.match(tasksSource, /taskModalMode === 'edit' && editingTask && !cronDraftTouched && cronDraftPreserveOriginal/);
    assert.match(tasksSource, /if \(newTaskCronMode === 'hours'\) return `0 \*\/\$\{normalizeIntervalValue\(newTaskCronValue, 1, 1, 23\)\} \* \* \*`/);
    assert.match(tasksSource, /if \(newTaskCronMode === 'minutes'\) return `\*\/\$\{normalizeIntervalValue\(newTaskCronValue, 10, 5, 59\)\} \* \* \* \*`/);
    assert.match(tasksSource, /return newTaskCron/);
    assert.match(tasksSource, /setCronDraftTouched\(false\)/);
    assert.match(tasksSource, /setCronDraftTouched\(true\)/);
    assert.match(tasksSource, /aria-describedby="task-submit-feedback task-run-preview"/);
    assert.match(tasksSource, /id="task-run-preview"/);
    assert.doesNotMatch(tasksSource, /Previsualización operativa/);
    assert.doesNotMatch(tasksSource, /Cron final/);
    assert.match(tasksSource, /No se pudieron calcular próximas ejecuciones/);
    assert.doesNotMatch(tasksSource, /Reinicio controlado/);
    assert.match(tasksSource, /createBlockedReason && \(/);
    assert.match(tasksSource, /aria-live="polite"/);
});

test('scheduled task edit converts known cron expressions to guided inputs', () => {
    assert.deepEqual(deriveTaskCronDraft('0 */4 * * *', 'Broadcast'), {
        mode: 'hours',
        value: '4',
        time: '04:00',
        cron: '0 */4 * * *',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 0,6,12,18 * * *', 'SaveWorld'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '0 0,6,12,18 * * *',
        notice: 'La lista de horas se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 0-23/8 */1 * *', 'Broadcast'), {
        mode: 'hours',
        value: '8',
        time: '04:00',
        cron: '0 0-23/8 */1 * *',
        notice: 'El rango de horas con paso se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 */6 * 1-12 0-6', 'Broadcast'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '0 */6 * 1-12 0-6',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 */6 * JAN-DEC SUN-SAT', 'Broadcast'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '0 */6 * JAN-DEC SUN-SAT',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 4 * JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC SUN,MON,TUE,WED,THU,FRI,SAT', 'Broadcast'), {
        mode: 'daily',
        value: '',
        time: '04:15',
        cron: '15 4 * JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC SUN,MON,TUE,WED,THU,FRI,SAT',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0,20,40 * * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '20',
        time: '04:00',
        cron: '0,20,40 * * * *',
        notice: 'La lista de minutos se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('5,20,35,50 * * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '5,20,35,50 * * * *',
        notice: 'Esta tarea se ejecuta cada 15 minutos con desplazamiento. Se abre como input de minutos y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('5-59/15 * * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '5-59/15 * * * *',
        notice: 'Esta tarea se ejecuta cada 15 minutos con desplazamiento. Se abre como input de minutos y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('5/15 * * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '5/15 * * * *',
        notice: 'Esta tarea se ejecuta cada 15 minutos con desplazamiento. Se abre como input de minutos y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 2,8,14,20 * * *', 'SaveWorld'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '0 2,8,14,20 * * *',
        notice: 'Esta tarea se ejecuta cada 6 horas con desplazamiento horario. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0 2-23/6 * * *', 'Broadcast'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '0 2-23/6 * * *',
        notice: 'Esta tarea se ejecuta cada 6 horas con desplazamiento horario. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('30 5 * * *', 'Broadcast'), {
        mode: 'daily',
        value: '',
        time: '05:30',
        cron: '30 5 * * *',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('45 4 1-31 1,2,3,4,5,6,7,8,9,10,11,12 1-7', 'Broadcast'), {
        mode: 'daily',
        value: '',
        time: '04:45',
        cron: '45 4 1-31 1,2,3,4,5,6,7,8,9,10,11,12 1-7',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('*/3 * * * *', 'SaveWorld'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '*/15 * * * *',
        notice: 'La tarea usaba 3 minutos. Se ha preparado como cada 15 minutos para respetar las reglas de producción.',
        preserveOriginal: false,
    });
    assert.deepEqual(deriveTaskCronDraft('*/10 * * * *', 'DoExit'), {
        mode: 'hours',
        value: '1',
        time: '04:00',
        cron: '0 */1 * * *',
        notice: 'La tarea DoExit usaba minutos. Se ha preparado como cada 1 hora para respetar las reglas de producción.',
        preserveOriginal: false,
    });
    assert.deepEqual(deriveTaskCronDraft('0 0-23 * * *', 'Broadcast'), {
        mode: 'hours',
        value: '1',
        time: '04:00',
        cron: '0 0-23 * * *',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('*/15 0-23 * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '*/15 0-23 * * *',
        notice: '',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('0-59/15 0-23 * * *', 'Broadcast'), {
        mode: 'minutes',
        value: '15',
        time: '04:00',
        cron: '0-59/15 0-23 * * *',
        notice: 'El rango de minutos con paso se ha reconocido como intervalo regular y se ha convertido a controles guiados.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 * * * *', 'Broadcast'), {
        mode: 'hours',
        value: '1',
        time: '04:00',
        cron: '15 * * * *',
        notice: 'Esta tarea se ejecuta cada hora en el minuto 15. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 */4 * * *', 'Broadcast'), {
        mode: 'hours',
        value: '4',
        time: '04:00',
        cron: '15 */4 * * *',
        notice: 'Esta tarea se ejecuta cada 4 horas en el minuto 15. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 0,6,12,18 * * *', 'SaveWorld'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '15 0,6,12,18 * * *',
        notice: 'Esta tarea se ejecuta cada 6 horas en el minuto 15. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 0-23/8 * * *', 'Broadcast'), {
        mode: 'hours',
        value: '8',
        time: '04:00',
        cron: '15 0-23/8 * * *',
        notice: 'Esta tarea se ejecuta cada 8 horas en el minuto 15. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.deepEqual(deriveTaskCronDraft('15 2/6 * * *', 'SaveWorld'), {
        mode: 'hours',
        value: '6',
        time: '04:00',
        cron: '15 2/6 * * *',
        notice: 'Esta tarea se ejecuta cada 6 horas en el minuto 15. Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia.',
        preserveOriginal: true,
    });
    assert.equal(deriveTaskCronDraft('15 8 * * 1', 'Broadcast').mode, 'custom');
    assert.equal(taskCronDraftSummary(deriveTaskCronDraft('*/30 * * * *', 'Broadcast')), 'Control guiado: cada 30 minutos');
    assert.equal(taskCronDraftSummary(deriveTaskCronDraft('0 */1 * * *', 'Broadcast')), 'Control guiado: cada 1 hora');
    assert.equal(taskCronDraftSummary(deriveTaskCronDraft('15 */4 * * *', 'Broadcast')), 'Control guiado: cada 4 horas');
    assert.equal(taskCronDraftSummary(deriveTaskCronDraft('30 5 * * *', 'Broadcast')), 'Control guiado: todos los dias a las 05:30');
    assert.equal(taskCronDraftSummary(deriveTaskCronDraft('15 8 * * 1', 'Broadcast')), 'Cron avanzado: edicion manual');
});

test('scheduled task custom cron interval detection covers regular lists and ranges', () => {
    assert.equal(cronMinuteInterval('*/10 * * * *'), 10);
    assert.equal(cronMinuteInterval('0,20,40 * * * *'), 20);
    assert.equal(cronMinuteInterval('5,20,35,50 * * * *'), 15);
    assert.equal(cronMinuteInterval('0-59/15 * * * *'), 15);
    assert.equal(cronMinuteInterval('5-59/15 * * * *'), 15);
    assert.equal(cronMinuteInterval('5/15 * * * *'), 15);
    assert.equal(cronMinuteInterval('0,20,40 0-23 * * *'), 20);
    assert.equal(cronMinuteInterval('0-59/15 0-23 * JAN-DEC SUN-SAT'), 15);
    assert.equal(cronMinuteInterval('0 0,6,12,18 * * *'), 360);
    assert.equal(cronMinuteInterval('0 2,8,14,20 * * *'), 360);
    assert.equal(cronMinuteInterval('0 0-23/8 * * *'), 480);
    assert.equal(cronMinuteInterval('0 2-23/6 * * *'), 360);
    assert.equal(cronMinuteInterval('0 2/6 * * *'), 360);
    assert.equal(cronMinuteInterval('0 0-23 * * *'), 60);
    assert.equal(cronMinuteInterval('0 0-23 * JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC SUN,MON,TUE,WED,THU,FRI,SAT'), 60);
    assert.equal(cronMinuteInterval('15 8 * * 1'), 60);
    assert.equal(cronMinuteInterval('not cron'), null);
});

test('scheduled task cron preview calculates upcoming runs in the server timezone', () => {
    assert.ok(parseCronExpression('0 4 * * *'));
    assert.equal(parseCronExpression('not cron'), null);

    const dailyRuns = getNextCronExecutions('0 4 * * *', {
        count: 3,
        from: new Date('2026-05-28T01:30:00.000Z'),
        timeZone: 'UTC',
    });
    assert.deepEqual(dailyRuns.map(run => run.toISOString()), [
        '2026-05-28T04:00:00.000Z',
        '2026-05-29T04:00:00.000Z',
        '2026-05-30T04:00:00.000Z',
    ]);

    const madridRuns = getNextCronExecutions('0 4 * * *', {
        count: 1,
        from: new Date('2026-05-28T01:30:00.000Z'),
        timeZone: 'Europe/Madrid',
    });
    assert.equal(madridRuns[0].toISOString(), '2026-05-28T02:00:00.000Z');

    const listedRuns = getNextCronExecutions('0,30 * * * *', {
        count: 3,
        from: new Date('2026-05-28T01:10:00.000Z'),
        timeZone: 'UTC',
    });
    assert.deepEqual(listedRuns.map(run => run.toISOString()), [
        '2026-05-28T01:30:00.000Z',
        '2026-05-28T02:00:00.000Z',
        '2026-05-28T02:30:00.000Z',
    ]);

    const steppedStartRuns = getNextCronExecutions('5/15 * * * *', {
        count: 3,
        from: new Date('2026-05-28T01:00:00.000Z'),
        timeZone: 'UTC',
    });
    assert.deepEqual(steppedStartRuns.map(run => run.toISOString()), [
        '2026-05-28T01:05:00.000Z',
        '2026-05-28T01:20:00.000Z',
        '2026-05-28T01:35:00.000Z',
    ]);
});

test('scheduled DoExit row controls match backend owner-only mutation rules', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');

    assert.match(tasksSource, /const canMutateTask = task => !taskMutationLoading && \(task\.action !== 'DoExit' \|\| canOwn\)/);
    assert.match(tasksSource, /disabled=\{!canMutateTask\(task\)\}/);
    assert.match(tasksSource, /DoExit requiere owner/);
    assert.match(tasksSource, /const handleTaskToggleClick = \(task\) => \{/);
    assert.match(tasksSource, /if \(task\.action === 'DoExit' && !task\.active\) \{/);
    assert.match(tasksSource, /setPendingTaskId\(task\.id\)/);
    assert.match(tasksSource, /finally \{\s+setPendingTaskId\(null\);\s+\}/);
    assert.match(tasksSource, /expectedInput: `ACTIVAR DOEXIT \$\{targetMapId\}`/);
    assert.match(tasksSource, /confirmText: 'Activar DoExit'/);
    assert.match(tasksSource, /onClick=\{\(\) => handleTaskToggleClick\(task\)\}/);
    assert.match(tasksSource, /<Lock size=\{15\}/);
    assert.match(tasksSource, /<Lock size=\{14\}/);
    assert.match(stateSource, /addToast\(err\.response\?\.data\?\.error \|\| 'Error al actualizar la tarea', 'error'\)/);
    assert.match(stateSource, /addToast\(err\.response\?\.data\?\.error \|\| 'Error al borrar la tarea', 'error'\)/);
    assert.match(stateSource, /const handleToggleTask = async \(id, currentStatus\) => \{/);
    assert.match(stateSource, /if \(taskMutationRef\.current\) return false/);
    assert.match(stateSource, /return true/);
    assert.match(stateSource, /return false/);
});

test('scheduled task deletion requires typing the task signature', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');

    assert.match(tasksSource, /handleDeleteTask\(task\)/);
    assert.doesNotMatch(tasksSource, /handleDeleteTask\(task\.id\)/);
    assert.match(stateSource, /const handleDeleteTask = \(task\) => \{/);
    assert.match(stateSource, /const taskId = typeof task === 'object' \? task\.id : task/);
    assert.match(stateSource, /const shortTaskId = String\(taskId \|\| ''\)\.slice\(0, 8\)/);
    assert.match(stateSource, /const targetLabel = target === 'all' \? 'cluster' : target/);
    assert.match(stateSource, /const expectedInput = `BORRAR \$\{action\} \$\{targetLabel\} \$\{shortTaskId\}`\.trim\(\)/);
    assert.match(stateSource, /Vas a eliminar la tarea \$\{action\}/);
    assert.match(stateSource, /Id: \$\{shortTaskId \|\| 'sin id'\}/);
    assert.match(stateSource, /hasInput: true/);
    assert.match(stateSource, /inputLabel: `Escribe \$\{expectedInput\}`/);
    assert.match(stateSource, /expectedInput,/);
    assert.match(stateSource, /confirmText: 'Borrar tarea'/);
    assert.match(stateSource, /axios\.delete\(`\$\{API_BASE\}\/tasks\/\$\{taskId\}`\)/);
    assert.match(stateSource, /addToast\('Tarea borrada', 'success'\);\s+setModal\(null\);\s+return true;/);
    assert.match(stateSource, /addToast\(err\.response\?\.data\?\.error \|\| 'Error al borrar la tarea', 'error'\);\s+return false;/);
    assert.doesNotMatch(stateSource, /finally \{\s+taskMutationRef\.current = false;\s+setTaskMutationLoading\(false\);\s+setModal\(null\);/);
});

test('scheduled task mutations are serialized and disable task controls while pending', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const \[taskMutationLoading, setTaskMutationLoading\] = useState\(false\)/);
    assert.match(stateSource, /const taskMutationRef = useRef\(false\)/);
    assert.match(stateSource, /if \(taskMutationRef\.current\) return/);
    assert.match(stateSource, /taskMutationRef\.current = true;\s+setTaskMutationLoading\(true\)/);
    assert.match(stateSource, /taskMutationRef\.current = false;\s+setTaskMutationLoading\(false\)/);
    assert.match(stateSource, /await fetchTasks\(\)/);
    assert.match(stateSource, /tasks, tasksLoading, taskMutationLoading, tasksError, setTasksError, taskScheduleContext/);

    assert.match(tasksSource, /taskMutationLoading/);
    assert.match(tasksSource, /const canCreateTask = !createBlockedReason/);
    assert.match(tasksSource, /const canSubmitTask = canCreateTask/);
    assert.match(tasksSource, /const editingHasChanges = taskModalMode !== 'edit' \|\| !editingTask \|\| \(/);
    assert.match(tasksSource, /No hay cambios pendientes para guardar en esta tarea\./);
    assert.match(tasksSource, /const canMutateTask = task => !taskMutationLoading && \(task\.action !== 'DoExit' \|\| canOwn\)/);
    assert.match(tasksSource, /disabled=\{tasksLoading \|\| taskMutationLoading\}/);
    assert.match(tasksSource, /Operación de tarea en curso/);
    assert.match(tasksSource, /Guardando\.\.\./);
});

test('scheduled tasks are created in a modal and active tasks can be edited', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const tasksSource = await readFile(new URL('../src/pages/TasksManager.jsx', import.meta.url), 'utf8');
    const taskCronSource = await readFile(new URL('../src/utils/taskCron.js', import.meta.url), 'utf8');

    assert.match(stateSource, /const handleUpdateTask = async \(id, taskInput\) => \{/);
    assert.match(stateSource, /const taskInput = taskInputOrEvent && typeof taskInputOrEvent === 'object' && !taskInputOrEvent\.preventDefault \? taskInputOrEvent : null/);
    assert.match(stateSource, /const action = taskInput\?\.action \|\| newTaskAction/);
    assert.match(stateSource, /const finalPayload = taskInput\?\.payload \?\? \(action === 'Broadcast' \? newTaskPayload\.trim\(\) : ''\)/);
    assert.match(stateSource, /await axios\.post\(`\$\{API_BASE\}\/tasks`, \{ action, cronExpr: finalCron, payload: finalPayload, mapId: targetTaskMapId \}\)/);
    assert.match(stateSource, /await axios\.patch\(`\$\{API_BASE\}\/tasks\/\$\{id\}`, taskInput\)/);
    assert.match(stateSource, /addToast\('Tarea actualizada', 'success'\)/);
    assert.match(stateSource, /handleCreateTask, handleUpdateTask, handleToggleTask/);
    assert.match(stateSource, /return true/);
    assert.match(stateSource, /return false/);

    assert.match(tasksSource, /const \[taskModalMode, setTaskModalMode\] = useState\(null\)/);
    assert.match(tasksSource, /const \[editingTask, setEditingTask\] = useState\(null\)/);
    assert.match(tasksSource, /const \[cronDraftNotice, setCronDraftNotice\] = useState\(''\)/);
    assert.match(tasksSource, /const \[cronChangeAcknowledged, setCronChangeAcknowledged\] = useState\(false\)/);
    assert.match(tasksSource, /const lastTaskModalTriggerRef = useRef\(null\)/);
    assert.match(tasksSource, /const taskDialogRef = useRef\(null\)/);
    assert.match(tasksSource, /const taskFirstFieldRef = useRef\(null\)/);
    assert.match(tasksSource, /const TASK_MODAL_FOCUSABLE_SELECTOR = 'button:not\(\[disabled\]\), input:not\(\[disabled\]\), select:not\(\[disabled\]\), textarea:not\(\[disabled\]\), \[href\], \[tabindex\]:not\(\[tabindex="-1"\]\)'/);
    assert.match(tasksSource, /setModal/);
    assert.match(tasksSource, /const normalizeIntervalValue = \(value, fallback, min, max\) => \{/);
    assert.match(tasksSource, /function buildCronFromGuidedInputs\(\) \{/);
    assert.match(tasksSource, /const guidedCronDraft = buildCronFromGuidedInputs\(\)/);
    assert.match(tasksSource, /return buildCronFromGuidedInputs\(\)/);
    assert.match(tasksSource, /const canNormalizeConvertedCron = taskModalMode === 'edit'/);
    assert.match(tasksSource, /const editCronUsesGuidedInputs = taskModalMode === 'edit' && Boolean\(editingTask\) && newTaskCronMode !== 'custom'/);
    assert.match(tasksSource, /const editingCronUsesPreservedOriginal = editCronUsesGuidedInputs && !cronDraftTouched && cronDraftPreserveOriginal/);
    assert.match(tasksSource, /const guidedCronDiffersFromOriginal = editCronUsesGuidedInputs && Boolean\(editingOriginalCron\) && guidedCronDraft !== editingOriginalCron/);
    assert.match(tasksSource, /Cron exacto conservado/);
    assert.match(tasksSource, /Cron desde inputs/);
    assert.match(tasksSource, /Cron guardado exacto/);
    assert.match(tasksSource, /Cron de los inputs/);
    assert.match(tasksSource, /const applyCronDraft = \(cronExpression, action = newTaskAction\) => \{/);
    assert.match(tasksSource, /const cronInputStyleSummary = taskCronDraftSummary\(\{/);
    assert.match(tasksSource, /Cron existente convertido a input: \$\{cronInputStyleSummary\}\./);
    assert.match(tasksSource, /Edita con controles guiados; si no cambias la frecuencia se conserva el Cron guardado exacto\./);
    assert.match(tasksSource, /const draft = deriveTaskCronDraft\(cronExpression, action\)/);
    assert.match(tasksSource, /setNewTaskCronMode\(draft\.mode\)/);
    assert.match(tasksSource, /setNewTaskCronValue\(draft\.value\)/);
    assert.match(tasksSource, /setNewTaskCronTime\(draft\.time\)/);
    assert.match(tasksSource, /setNewTaskCron\(draft\.cron\)/);
    assert.match(tasksSource, /setCronDraftNotice\(draft\.notice\)/);
    assert.match(tasksSource, /return draft/);
    assert.match(tasksSource, /return String\(editingTask\.cron \|\| ''\)\.trim\(\)/);
    assert.match(tasksSource, /const handleCronCustomConvert = \(\) => \{\s+setCronChangeAcknowledged\(false\);\s+setCronDraftTouched\(true\);\s+setCronDraftPreserveOriginal\(false\);\s+applyCronDraft\(newTaskCron, newTaskAction\);\s+\}/);
    assert.match(tasksSource, /const handleUseGuidedCronForEdit = \(\) => \{/);
    assert.match(tasksSource, /setNewTaskCron\(guidedCronDraft\)/);
    assert.match(tasksSource, /Se usará el Cron generado por los controles guiados/);
    assert.match(tasksSource, /Usar Cron de inputs/);
    assert.match(tasksSource, /onClick=\{handleCronCustomConvert\}/);
    assert.match(tasksSource, /Convertir a controles guiados/);
    assert.match(tasksSource, /disabled=\{taskMutationLoading \|\| !newTaskCron\.trim\(\)\}/);
    assert.match(tasksSource, /if \(action !== 'Broadcast' && newTaskPayload\) \{/);
    assert.match(tasksSource, /setNewTaskPayload\(''\)/);
    assert.match(tasksSource, /SaveWorld debe ejecutarse al menos cada 15 minutos/);
    assert.match(tasksSource, /setNewTaskCronMode\('hours'\)/);
    assert.match(tasksSource, /openCreateTaskModal/);
    assert.match(tasksSource, /openEditTaskModal\(task\)/);
    assert.match(tasksSource, /resetTaskDraft\(\);\s+setEditingTask\(task\)/);
    assert.doesNotMatch(tasksSource, /setNewTaskCron\(task\.cron\);\s+applyCronDraft\(task\.cron, task\.action\)/);
    assert.match(tasksSource, /const draft = applyCronDraft\(task\.cron, task\.action\)/);
    assert.match(tasksSource, /setCronDraftTouched\(!draft\.preserveOriginal\)/);
    assert.doesNotMatch(tasksSource, /\/respetar las reglas\/i\.test\(draft\.notice\)/);
    assert.match(taskCronSource, /La tarea DoExit usaba minutos/);
    assert.match(taskCronSource, /Se abre como input horario y se conservará el Cron exacto hasta que cambies la frecuencia/);
    assert.match(taskCronSource, /No se pudo convertir esta expresión a controles guiados sin cambiar su frecuencia/);
    assert.match(tasksSource, /role="dialog"/);
    assert.match(tasksSource, /aria-modal="true"/);
    assert.match(tasksSource, /aria-labelledby="task-modal-title"/);
    assert.match(tasksSource, /aria-describedby="task-modal-description"/);
    assert.match(tasksSource, /taskFirstFieldRef\.current\?\.focus/);
    assert.match(tasksSource, /event\.key === 'Escape'/);
    assert.match(tasksSource, /event\.key === 'Tab'/);
    assert.match(tasksSource, /document\.querySelectorAll\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
    assert.match(tasksSource, /const topmostDialog = modalDialogs\[modalDialogs\.length - 1\]/);
    assert.match(tasksSource, /if \(topmostDialog !== taskDialogRef\.current\) return/);
    assert.match(tasksSource, /taskDialogRef\.current\?\.querySelectorAll\(TASK_MODAL_FOCUSABLE_SELECTOR\)/);
    assert.doesNotMatch(tasksSource, /document\.querySelectorAll\('\[role="dialog"\] button:not/);
    assert.match(tasksSource, /ref=\{taskDialogRef\}/);
    assert.match(tasksSource, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(tasksSource, /pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
    assert.match(tasksSource, /handleTaskModalSubmit/);
    assert.match(tasksSource, /handleCreateTask\(\{ action: newTaskAction, cronExpr: finalCron, payload: finalPayload, mapId: selectedTaskMapId \}\)/);
    assert.match(tasksSource, /handleUpdateTask\(editingTask\.id/);
    assert.match(tasksSource, /active: editingTask\.active/);
    assert.match(tasksSource, /const finalPayload = finalPayloadDraft/);
    assert.match(tasksSource, /payload: finalPayload/);
    assert.match(tasksSource, /const canEditTask = task => canMutateTask\(task\)/);
    assert.doesNotMatch(tasksSource, /const canEditTask = task => task\.active && canMutateTask\(task\)/);
    assert.match(tasksSource, /Esta tarea está pausada\. Los cambios se guardarán sin reactivarla\./);
    assert.match(tasksSource, /El Cron guardado cambiará al guardar esta edición\./);
    assert.match(tasksSource, /Cron actual/);
    assert.match(tasksSource, /Cron al guardar/);
    assert.match(tasksSource, /Esta tarea está activa: el cambio se aplicará inmediatamente al guardar\./);
    assert.match(tasksSource, /Acepto guardar la tarea con el nuevo Cron mostrado\./);
    assert.match(tasksSource, /checked=\{cronChangeAcknowledged\}/);
    assert.match(tasksSource, /active: editingTask\.active/);
    assert.match(tasksSource, /disabled=\{!canEditTask\(task\)\}/);
    assert.doesNotMatch(tasksSource, /Activa la tarea antes de editarla/);
    assert.match(tasksSource, /Nueva tarea/);
    assert.match(tasksSource, /Crear nueva tarea/);
    assert.match(tasksSource, /Editar tarea programada/);
    assert.match(tasksSource, /Escribe el mensaje del anuncio antes de guardar la tarea/);
    assert.match(tasksSource, /<textarea/);
    assert.match(tasksSource, /rows=\{3\}/);
    assert.match(tasksSource, /resize-y/);
    assert.match(tasksSource, /aria-describedby="task-payload-help task-payload-error"/);
    assert.match(tasksSource, /Mensaje que recibirán los jugadores conectados/);
    assert.match(tasksSource, /id="task-payload-error"/);
    assert.match(tasksSource, /Cada cuántas horas/);
    assert.match(tasksSource, /Cada cuántos minutos/);
    assert.doesNotMatch(tasksSource, /Previsualización operativa/);
    assert.match(tasksSource, /required=\{newTaskAction === 'Broadcast'\}/);
    assert.match(tasksSource, /maxLength=\{BROADCAST_PAYLOAD_MAX_LENGTH\}/);
    assert.match(tasksSource, /aria-invalid=\{newTaskAction === 'Broadcast' && \(!newTaskPayload\.trim\(\) \|\| broadcastPayloadHasControlChars \|\| broadcastPayloadLength > BROADCAST_PAYLOAD_MAX_LENGTH\) \? 'true' : undefined\}/);
    assert.match(tasksSource, /w-full min-w-0 bg-\[#09090b\]/);
    assert.match(tasksSource, /sticky bottom-0 -mx-4 -mb-4 flex justify-end/);
    assert.match(tasksSource, /cronDraftNotice && \([\s\S]*?task-run-preview[\s\S]*?type="submit"/);
    assert.match(tasksSource, /break-all font-mono text-zinc-300/);
    assert.doesNotMatch(tasksSource, /dashboard-card shrink-0 rounded-lg border border-zinc-800 bg-\[#18181b\] p-4 sm:p-5/);
});

test('server power controls require managed map selection before submission', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const sidebarSource = await readFile(new URL('../src/components/layout/Sidebar.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const powerRefreshTimerRef = useRef\(null\)/);
    assert.match(stateSource, /const powerActionRef = useRef\(''\)/);
    assert.match(stateSource, /if \(powerActionRef\.current\) return;\s+const mapName/);
    assert.match(stateSource, /const validSingleMap = clusterMaps\.some\(map => map\.id === targetMapId\)/);
    assert.match(stateSource, /Selecciona un mapa válido antes de ejecutar acciones del servidor/);
    assert.match(stateSource, /No hay mapas gestionados para ejecutar acciones del clúster/);
    assert.match(stateSource, /const expectedInput = isAll/);
    assert.match(stateSource, /\$\{action\.toUpperCase\(\)\} CLUSTER/);
    assert.match(stateSource, /\['stop', 'restart'\]\.includes\(action\) \? `\$\{action\.toUpperCase\(\)\} \$\{mapName\}` : ''/);
    assert.match(stateSource, /hasInput: Boolean\(expectedInput\)/);
    assert.match(stateSource, /inputLabel: expectedInput \? `Escribe \$\{expectedInput\}` : undefined/);
    assert.match(stateSource, /confirmText: `\$\{actionLabel\}\$\{isAll \? ' clúster' : ''\}`/);
    assert.match(stateSource, /await Promise\.allSettled\(\[fetchClusterStatus\(\), fetchLiveData\(\)\]\)/);
    assert.match(stateSource, /powerRefreshTimerRef\.current = setTimeout\(\(\) => \{/);
    assert.match(stateSource, /onConfirm: async \(\) => \{\s+if \(powerActionRef\.current\) return;/);
    assert.match(stateSource, /powerActionRef\.current = `\$\{action\}-\$\{targetMapId\}`/);
    assert.match(stateSource, /powerActionRef\.current = '';\s+setPowerLoading\(null\);/);
    assert.match(stateSource, /finally \{\s+powerActionRef\.current = '';\s+setPowerLoading\(null\);/);
    assert.doesNotMatch(stateSource, /setTimeout\(\(\) => setPowerLoading\(null\), 30000\)/);
    assert.match(sidebarSource, /const hasSelectedMap = Boolean\(selectedMap\)/);
    assert.match(sidebarSource, /const singleMapActionDisabled = !!powerLoading \|\| !hasSelectedMap/);
    assert.match(sidebarSource, /liveDataStale \? 'DESCONOCIDO'/);
    assert.match(sidebarSource, /aria-label="Controles de ciclo de vida del servidor"/);
    assert.match(sidebarSource, />Reiniciar</);
    assert.doesNotMatch(sidebarSource, /grid grid-cols-4 gap-2/);
    assert.doesNotMatch(sidebarSource, /title="Restart Cluster"/);
    assert.match(sidebarSource, /disabled=\{singleMapActionDisabled \|\| liveData\?\.status !== 'online'\}/);
    assert.match(sidebarSource, /disabled=\{!!powerLoading \|\| !hasClusterMaps \|\| !lifecycleAvailable\}/);
    assert.match(sidebarSource, /Sin mapa seleccionado/);
});

test('viewer dashboards keep host diagnostics and player details role gated', async () => {
    const cluster = await readFile(new URL('../src/pages/ClusterOverview.jsx', import.meta.url), 'utf8');
    const dashboard = await readFile(new URL('../src/pages/ServerDashboard.jsx', import.meta.url), 'utf8');
    for (const source of [cluster,dashboard]) assert.match(source, /const canOperate = \['operator', 'owner'\]\.includes\(userRole\)/);
    assert.match(cluster, /\{canOperate &&/);
    assert.match(dashboard, /\{canOperate && <>\s*<ResourceGauge/);
    assert.match(dashboard, /!canOperate \? \(/);
    assert.match(dashboard, /Detalle de jugadores restringido/);
    assert.equal(canAccessDashboardTab('players','viewer'),false);
    assert.equal(canAccessDashboardTab('system_health','viewer'),false);
});

test('player and ban actions require a valid managed map before opening confirmations', async () => {
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const playersSource = await readFile(new URL('../src/pages/PlayersView.jsx', import.meta.url), 'utf8');
    const bansSource = await readFile(new URL('../src/pages/BansView.jsx', import.meta.url), 'utf8');
    const globalPlayersSource = await readFile(new URL('../src/components/layout/GlobalPlayersSidebar.jsx', import.meta.url), 'utf8');
    const actionBtnSource = await readFile(new URL('../src/components/ui/ActionBtn.jsx', import.meta.url), 'utf8');

    assert.match(stateSource, /const resolvePlayerActionMap = useCallback\(\(record, actionLabel\) => \{/);
    assert.match(stateSource, /const targetMap = record\?\.mapId \|\| selectedMap/);
    assert.match(stateSource, /!clusterMaps\.some\(map => map\.id === targetMap\)/);
    assert.match(stateSource, /Selecciona un mapa válido antes de/);
    for (const action of ['handleKickPlayer', 'handleBanPlayer', 'handleMessagePlayer', 'handleMakeAdmin', 'handleRemoveAdmin', 'handleUnban']) {
        assert.match(stateSource, new RegExp(`const ${action} =`));
    }
    assert.match(stateSource, /await axios\.post\(`\$\{API_BASE\}\/players\/unban`, \{ steamId, mapId: targetMap \}\)/);
    assert.doesNotMatch(stateSource, /players\/unban`, \{ steamId: ban\.steamId, mapId: selectedMap \}/);
    assert.match(stateSource, /const \[playerActionLoading, setPlayerActionLoading\] = useState\(''\)/);
    assert.match(stateSource, /const playerActionRef = useRef\(''\)/);
    assert.match(stateSource, /const onlinePlayersRefreshTimerRef = useRef\(null\)/);
    assert.match(stateSource, /const scheduleOnlinePlayersRefresh = useCallback\(\(\) => \{/);
    assert.match(stateSource, /if \(onlinePlayersRefreshTimerRef\.current\) clearTimeout\(onlinePlayersRefreshTimerRef\.current\)/);
    assert.match(stateSource, /onlinePlayersRefreshTimerRef\.current = setTimeout\(\(\) => \{/);
    assert.match(stateSource, /onlinePlayersRefreshTimerRef\.current = null;\s+fetchOnlinePlayers\(\);/);
    assert.match(stateSource, /if \(onlinePlayersRefreshTimerRef\.current\) \{\s+clearTimeout\(onlinePlayersRefreshTimerRef\.current\);\s+onlinePlayersRefreshTimerRef\.current = null;\s+\}/);
    assert.doesNotMatch(stateSource, /setTimeout\(fetchOnlinePlayers, 2000\)/);
    assert.match(stateSource, /const runPlayerAction = useCallback\(async \(actionKey, action\) => \{/);
    assert.match(stateSource, /if \(playerActionRef\.current\) return false/);
    assert.match(stateSource, /playerActionRef\.current = actionKey/);
    assert.match(stateSource, /setPlayerActionLoading\(actionKey\)/);
    assert.match(stateSource, /if \(playerActionRef\.current === actionKey\)/);
    assert.match(stateSource, /await runPlayerAction\(`ban:\$\{player\.steamId\}`/);
    assert.match(stateSource, /const steamId = String\(ban\?\.steamId \|\| ''\)/);
    assert.match(stateSource, /title: 'Desbanear jugador'/);
    assert.match(stateSource, /inputLabel: `Escribe \$\{steamId\}`/);
    assert.match(stateSource, /expectedInput: steamId/);
    assert.match(stateSource, /confirmText: 'Desbanear'/);
    assert.match(stateSource, /await runPlayerAction\(`unban:\$\{steamId\}`/);
    assert.match(stateSource, /const handleKickPlayer = \(player\) => \{\s+if \(playerActionRef\.current\) return;/);
    assert.match(stateSource, /const handleBanPlayer = \(player\) => \{\s+if \(playerActionRef\.current\) return;/);
    assert.match(stateSource, /const handleMessagePlayer = \(player\) => \{\s+if \(playerActionRef\.current\) return;/);
    assert.match(stateSource, /title: 'Expulsar jugador'/);
    assert.match(stateSource, /confirmText: 'Expulsar'/);
    assert.match(stateSource, /title: 'Banear jugador'/);
    assert.match(stateSource, /inputLabel: 'Motivo del baneo'/);
    assert.match(stateSource, /confirmText: 'Banear'/);
    assert.match(stateSource, /title: 'Enviar mensaje'/);
    assert.match(stateSource, /inputLabel: 'Mensaje'/);
    assert.match(stateSource, /confirmText: 'Enviar'/);
    assert.match(stateSource, /title: 'Dar admin in-game'/);
    assert.match(stateSource, /confirmText: 'Dar admin'/);
    assert.match(stateSource, /title: 'Quitar admin in-game'/);
    assert.match(stateSource, /confirmText: 'Quitar admin'/);
    for (const staleCopy of ['Kick Player', 'Ban Player', 'Send Message', 'Grant Admin', 'Remove Admin', 'Reason (optional)', 'Ban reason', 'Message sent to']) {
        assert.doesNotMatch(stateSource, new RegExp(staleCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(playersSource, /const blocked = Boolean\(playerActionLoading\)/);
    assert.match(playersSource, /disabled=\{blocked \|\| !session \|\| !actions\.(message|kick|ban)\}/);
    assert.match(bansSource, /const playerActionsBlocked = Boolean\(playerActionLoading\)/);
    assert.match(bansSource, /disabled=\{playerActionsBlocked\}/);
    assert.match(globalPlayersSource, /playerActionLoading/);
    assert.match(globalPlayersSource, /fetchOnlinePlayers/);
    assert.match(globalPlayersSource, /onClick=\{fetchOnlinePlayers\}/);
    assert.match(globalPlayersSource, /disabled=\{playersLoading\}/);
    assert.match(globalPlayersSource, /playersLoading \? 'Reintentando\.\.\.' : 'Reintentar'/);
    assert.match(globalPlayersSource, /const playerActionsBlocked = Boolean\(playerActionLoading\)/);
    assert.match(globalPlayersSource, /disabled=\{playerActionsBlocked\}/);
    assert.match(actionBtnSource, /disabled = false/);
    assert.match(actionBtnSource, /disabled=\{disabled\}/);
});

test('operational actions surface backend error details in toasts', async () => {
    const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const toasterSource = await readFile(new URL('../src/components/ui/DashboardToaster.jsx', import.meta.url), 'utf8');
    const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
    const stateSource = await readFile(new URL('../src/hooks/useDashboardState.jsx', import.meta.url), 'utf8');
    const serverSource = await readFile(new URL('../../server/server.js', import.meta.url), 'utf8');

    assert.match(appSource, /import \{ DashboardToaster \} from '\.\/components\/ui\/DashboardToaster'/);
    assert.match(toasterSource, /<Toaster/);
    assert.match(toasterSource, /closeButton/);
    assert.match(toasterSource, /visibleToasts=\{[1-5]\}/);
    assert.match(toasterSource, /duration: 5000/);
    assert.doesNotMatch(cssSource, /data-sonner-toaster[^}]*display:\s*none/);
    assert.match(stateSource, /function apiErrorMessage\(err, fallback\) \{/);
    assert.match(stateSource, /return err\.response\?\.data\?\.error \|\| err\.userMessage \|\| fallback/);
    assert.match(stateSource, /else if \(type === 'warning'\) toast\.warning\(message\)/);
    assert.doesNotMatch(stateSource, /const \[toasts, setToasts\] = useState\(\[\]\)/);
    for (const fallback of [
        'No se pudo expulsar al jugador',
        'No se pudo banear al jugador',
        'No se pudo enviar el mensaje',
        'No se pudo dar admin',
        'No se pudo quitar admin',
        'No se pudo desbanear al jugador',
        'No se pudieron cargar los ajustes',
        'No se pudieron guardar los ajustes',
        'Error al aplicar el preset',
        'No se pudieron cargar los archivos',
        'No se pudo leer el archivo',
    ]) {
        assert.match(stateSource, new RegExp(`apiErrorMessage\\(err, '${fallback.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`));
    }
    assert.match(stateSource, /No se pudo guardar el archivo/);
    assert.doesNotMatch(stateSource, /Failed to load settings|Failed to save settings|Failed to load files|Failed to read file|Failed to save file|Settings saved|File saved|Secrets were redacted/);
    assert.match(stateSource, /apiErrorMessage\(err, `Error al ejecutar \$\{action\}`\)/);
    assert.doesNotMatch(stateSource, /catch \(err\) \{\s*addToast\('Failed to kick player', 'error'\);/);
    assert.doesNotMatch(stateSource, /apiErrorMessage\(err, 'Failed to (kick|ban|send|grant|remove)/);
    assert.doesNotMatch(stateSource, /catch\(err\) \{\s*addToast\('Failed to save settings', 'error'\);/);
    assert.match(serverSource, /No se pudieron cargar los presets/);
    assert.match(serverSource, /Falta presetId/);
    assert.match(serverSource, /Preset no encontrado/);
    assert.match(serverSource, /El preset no contiene cambios aplicables/);
    assert.match(serverSource, /Preset \$\{presetId\} aplicado correctamente\. Reinicia el servidor para aplicar los cambios\./);
    assert.match(serverSource, /Error al aplicar el preset/);
    assert.match(serverSource, /Ajustes guardados correctamente\. Reinicia el servidor para aplicar los cambios\./);
    assert.match(serverSource, /No se pudieron guardar los ajustes/);
    assert.match(serverSource, /Datos de loot crate inválidos/);
    assert.match(serverSource, /Nombre de clase ARK inválido/);
    assert.match(serverSource, /Loot crate inyectado correctamente\. Reinicia el servidor para aplicar los cambios\./);
    assert.match(serverSource, /No se pudo inyectar el loot crate/);
    assert.match(serverSource, /Payload de secretos inválido/);
    assert.match(serverSource, /No se proporcionaron secretos válidos/);
    assert.match(serverSource, /Secretos actualizados\. Reinicia el servidor si es necesario\./);
    assert.match(serverSource, /No se pudieron actualizar los secretos/);
    assert.doesNotMatch(serverSource, /Failed to fetch presets|Missing presetId|Preset not found|Preset has no applicable changes|applied successfully|Failed to apply preset|Settings saved successfully|Failed to parse configs|Invalid crate data|Invalid ARK class name|Loot crate injected successfully|Failed to inject loot crate|Invalid secrets payload|No valid secrets provided|Secrets updated\. Restart server if required\.|Failed to update secrets/);
});
