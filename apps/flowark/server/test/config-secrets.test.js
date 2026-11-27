const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const http = require('http');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Rcon } = require('rcon-client');

function cookiePairs(setCookies = []) {
    return setCookies
        .map(cookie => cookie.split(';')[0].trim())
        .filter(Boolean);
}

function httpRequest(pathname, { method = 'GET', body, headers = {} } = {}) {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(pathname, globalThis.baseUrl);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method,
            headers: {
                ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
                connection: 'close',
                ...headers,
            },
        }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    json: () => JSON.parse(data || '{}'),
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function rawHttpRequest(pathname, { method = 'POST', payload = '', headers = {} } = {}) {
    const url = new URL(pathname, globalThis.baseUrl);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            method,
            headers: {
                connection: 'close',
                ...headers,
            },
        }, res => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data,
                    json: () => JSON.parse(data || '{}'),
                });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function writeJson(filePath, value) {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function readAdminsFixture() {
    return JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'admins.json'), 'utf8'));
}

async function writeAdminsFixture(admins) {
    await writeJson(path.join(globalThis.fixture.dataDir, 'admins.json'), admins);
}

async function createFixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-test-'));
    const dataDir = path.join(root, 'data');
    const configDir = path.join(root, 'config');
    const obeliskRoot = path.join(root, 'obelisk');
    const arkApiRoot = path.join(root, 'ArkApi');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(configDir, { recursive: true });

    const gameIni = path.join(configDir, 'Game.ini');
    const gameUserSettings = path.join(configDir, 'GameUserSettings.ini');
    const ingameAdmins = path.join(root, 'AllowedCheaterSteamIDs.txt');
    await fs.writeFile(gameIni, [
        '[/script/shootergame.shootergamemode]',
        'MatingIntervalMultiplier=1.0',
        'ServerPassword=game-secret',
        '',
    ].join('\n'));
    await fs.writeFile(gameUserSettings, [
        '[ServerSettings]',
        'ServerAdminPassword=admin-secret',
        'SpectatorPassword=spectator-secret',
        '',
    ].join('\n'));
    const logDir = path.join(root, 'logs');
    const logPath = path.join(logDir, 'arkserver-console.log');
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(logPath, 'boot log line\n');

    await writeJson(path.join(dataDir, 'nodes.json'), [{
        id: 'ragnarok',
        name: 'Ragnarok',
        script: path.join(root, 'arkserver'),
        gameIni,
        gameUserSettings,
        host: '10.0.0.5',
        gamePort: 7777,
        queryPort: 27015,
        rconPort: 27020,
        logPath,
    }]);
    await writeJson(path.join(dataDir, 'admins.json'), [{
        id: 'owner-1',
        username: 'owner',
        password: await bcrypt.hash('correct-password', 4),
        role: 'owner',
    }, {
        id: 'operator-1',
        username: 'operator',
        password: await bcrypt.hash('correct-password', 4),
        role: 'operator',
    }]);
    await writeJson(path.join(dataDir, 'audit.json'), []);
    await writeJson(path.join(dataDir, 'bans.json'), []);
    await writeJson(path.join(dataDir, 'players_db.json'), []);
    await writeJson(path.join(dataDir, 'tasks.json'), []);
    await writeJson(path.join(dataDir, 'global_settings.json'), {});
    await fs.mkdir(path.join(dataDir, 'presets'), { recursive: true });

    await fs.writeFile(ingameAdmins, '76561198000000000\n');
    await fs.writeFile(path.join(root, 'arkserver'), [
        '#!/usr/bin/env bash',
        'printf "internal path /srv/ark secret-token\\n"',
    ].join('\n'));
    await fs.chmod(path.join(root, 'arkserver'), 0o700);

    await fs.mkdir(path.join(obeliskRoot, 'lib'), { recursive: true });
    await fs.mkdir(path.join(obeliskRoot, 'plugins'), { recursive: true });
    await fs.mkdir(path.join(obeliskRoot, 'config', 'oBaseEvents'), { recursive: true });
    await fs.mkdir(path.join(obeliskRoot, 'state', 'instances', 'arkserver'), { recursive: true });
    await fs.mkdir(path.join(obeliskRoot, 'logs', 'arkserver'), { recursive: true });
    await fs.writeFile(path.join(obeliskRoot, 'lib', 'libobelisk.so'), 'fake-lib');
    await fs.writeFile(path.join(obeliskRoot, 'lib', 'libsubhook.so'), 'fake-lib');
    await fs.writeFile(path.join(obeliskRoot, 'plugins', 'oBaseEvents.so'), 'fake-plugin');
    await fs.writeFile(path.join(obeliskRoot, 'config', 'oBaseEvents', 'config.json'), '{}\n');
    await fs.writeFile(path.join(obeliskRoot, 'state', 'instances', 'arkserver', 'disable-plugins'), '');
    await fs.writeFile(path.join(obeliskRoot, 'logs', 'arkserver', 'Obelisk.log'), 'line-one\nline-two\n');
    await fs.mkdir(path.join(arkApiRoot, 'Plugins', 'SamplePlugin'), { recursive: true });

    return { root, dataDir, configDir, gameIni, gameUserSettings, ingameAdmins, logPath, obeliskRoot, arkApiRoot };
}

async function createClient(username = 'owner', password = 'correct-password') {
    const login = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password },
    });
    assert.equal(login.status, 200);
    const cookies = cookiePairs(login.headers['set-cookie']);
    const xsrfCookie = cookies.find(cookie => cookie.startsWith('XSRF-TOKEN='));
    assert.ok(xsrfCookie);
    return {
        cookieHeader: cookies.join('; '),
        xsrfToken: xsrfCookie.split('=')[1],
    };
}

async function request(pathname, options = {}, client = globalThis.ownerClient) {
    const headers = {
        cookie: client.cookieHeader,
        'x-xsrf-token': client.xsrfToken,
        ...options.headers,
    };
    return httpRequest(pathname, { ...options, headers });
}

test.before(async () => {
    const fixture = await createFixture();
    process.env.NODE_ENV = 'test';
    process.env.DASHBOARD_DATA_DIR = fixture.dataDir;
    process.env.FILE_MANAGER_GAME_ROOT = fixture.configDir;
    process.env.ARK_SCRIPT_ROOTS = fixture.root;
    process.env.ARK_CONFIG_ROOTS = fixture.configDir;
    process.env.ARK_LOG_ROOTS = path.join(fixture.root, 'logs');
    process.env.INGAME_ADMINS_PATH = fixture.ingameAdmins;
    process.env.PLUGIN_MANAGER_OBELISK_ROOT = fixture.obeliskRoot;
    process.env.PLUGIN_MANAGER_ARKAPI_ROOT = fixture.arkApiRoot;
    process.env.JWT_SECRET_KEY = 'test-secret-key-with-at-least-32-chars';
    process.env.PORT = '0';
    process.env.CORS_ORIGINS = 'https://panel.example.test';
    process.env.RCON_CONNECT_TIMEOUT_MS = '100';
    process.env.RCON_COMMAND_TIMEOUT_MS = '100';
    process.env.GAMEDIG_TIMEOUT_MS = '100';
    process.env.DISCORD_WEBHOOK_TIMEOUT_MS = '5';
    globalThis.rconCalls = [];
    globalThis.originalRconConnect = Rcon.connect;
    Rcon.connect = async options => {
        globalThis.rconCalls.push({ type: 'connect', options });
        return {
            on() {},
            async send(command) {
                globalThis.rconCalls.push({ type: 'send', command });
                return `ok:${command}`;
            },
            end() {
                globalThis.rconCalls.push({ type: 'end' });
            },
        };
    };
    globalThis.fixture = fixture;
    globalThis.serverModule = require('../server');
    const { startServer } = globalThis.serverModule;
    globalThis.server = startServer(0);
    await new Promise(resolve => globalThis.server.once('listening', resolve));
    const { port } = globalThis.server.address();
    globalThis.baseUrl = `http://127.0.0.1:${port}`;
    globalThis.ownerClient = await createClient('owner');
    globalThis.operatorClient = await createClient('operator');
});

test.after(async () => {
    await new Promise(resolve => {
        const done = () => {
            clearTimeout(fallback);
            resolve();
        };
        const fallback = setTimeout(done, 250);
        globalThis.server.close(done);
        globalThis.server.closeIdleConnections();
        globalThis.server.closeAllConnections();
    });
    Rcon.connect = globalThis.originalRconConnect;
    await fs.rm(globalThis.fixture.root, { recursive: true, force: true });
});

test('raw config reads redact ARK secrets', async () => {
    const gameIniRes = await request('/api/config/gameini?mapId=ragnarok');
    assert.equal(gameIniRes.status, 200);
    const gameIni = await gameIniRes.json();
    assert.equal(gameIni.redacted, true);
    assert.match(gameIni.content, /ServerPassword=\[REDACTED\]/);
    assert.doesNotMatch(gameIni.content, /game-secret/);

    const gusRes = await request('/api/config/gameusersettings?mapId=ragnarok');
    assert.equal(gusRes.status, 200);
    const gus = await gusRes.json();
    assert.equal(gus.redacted, true);
    assert.match(gus.content, /ServerAdminPassword=\[REDACTED\]/);
    assert.match(gus.content, /SpectatorPassword=\[REDACTED\]/);
    assert.doesNotMatch(gus.content, /admin-secret|spectator-secret/);
});

test('http server applies bounded request timeouts and JSON body errors are stable', async () => {
    assert.equal(globalThis.server.requestTimeout, globalThis.serverModule.HTTP_REQUEST_TIMEOUT_MS);
    assert.equal(globalThis.server.headersTimeout, globalThis.serverModule.HTTP_HEADERS_TIMEOUT_MS);
    assert.equal(globalThis.server.keepAliveTimeout, globalThis.serverModule.HTTP_KEEPALIVE_TIMEOUT_MS);

    const tooLarge = await rawHttpRequest('/api/auth/login', {
        payload: JSON.stringify({ username: 'owner', password: 'x'.repeat(1024 * 1024 + 1) }),
        headers: { 'content-type': 'application/json' },
    });
    assert.equal(tooLarge.status, 413);
    assert.equal((await tooLarge.json()).error, 'El cuerpo de la petición es demasiado grande');
    assert.doesNotMatch(tooLarge.body, /<html/i);

    const malformed = await rawHttpRequest('/api/auth/login', {
        payload: '{"username":',
        headers: { 'content-type': 'application/json' },
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'JSON de petición inválido');
    assert.doesNotMatch(malformed.body, /<html/i);

    const textBody = await rawHttpRequest('/api/auth/login', {
        payload: 'username=owner&password=correct-password',
        headers: { 'content-type': 'text/plain' },
    });
    assert.equal(textBody.status, 415);
    assert.equal((await textBody.json()).error, 'Los cuerpos de API deben usar application/json');
    assert.doesNotMatch(textBody.body, /<html/i);

    const deleteTextBody = await rawHttpRequest('/api/tasks/example', {
        method: 'DELETE',
        payload: 'delete=true',
        headers: { 'content-type': 'text/plain', 'content-length': Buffer.byteLength('delete=true') },
    });
    assert.equal(deleteTextBody.status, 415);
    assert.equal((await deleteTextBody.json()).error, 'Los cuerpos de API deben usar application/json');
    assert.doesNotMatch(deleteTextBody.body, /<html/i);

    const bodylessLogout = await rawHttpRequest('/api/auth/logout', {
        payload: '',
    });
    assert.equal(bodylessLogout.status, 200);
    assert.equal((await bodylessLogout.json()).message, 'Sesión cerrada');

    const bodylessLogin = await rawHttpRequest('/api/auth/login', {
        payload: '',
    });
    assert.equal(bodylessLogin.status, 400);
    assert.equal((await bodylessLogin.json()).error, 'Credenciales inválidas');

    const bodylessServerAction = await request('/api/server/action', {
        method: 'POST',
    });
    assert.equal(bodylessServerAction.status, 400);
    assert.match((await bodylessServerAction.json()).error, /acción inválida/i);

    const bodylessTask = await request('/api/tasks', {
        method: 'POST',
    }, globalThis.operatorClient);
    assert.equal(bodylessTask.status, 400);
    assert.match((await bodylessTask.json()).error, /acción|cron|map/i);
});

test('rate limiters use stable JSON responses and modern headers', () => {
    const { API_RATE_LIMIT_OPTIONS, AUTH_RATE_LIMIT_OPTIONS } = globalThis.serverModule;
    assert.equal(API_RATE_LIMIT_OPTIONS.standardHeaders, true);
    assert.equal(API_RATE_LIMIT_OPTIONS.legacyHeaders, false);
    assert.equal(AUTH_RATE_LIMIT_OPTIONS.standardHeaders, true);
    assert.equal(AUTH_RATE_LIMIT_OPTIONS.legacyHeaders, false);

    const makeRecorder = () => ({
        statuses: [],
        payloads: [],
        status(code) {
            this.statuses.push(code);
            return this;
        },
        json(payload) {
            this.payloads.push(payload);
            return this;
        },
    });

    const apiRes = makeRecorder();
    API_RATE_LIMIT_OPTIONS.handler({}, apiRes);
    assert.deepEqual(apiRes.statuses, [429]);
    assert.deepEqual(apiRes.payloads, [{ error: 'Demasiadas peticiones a la API' }]);

    const authRes = makeRecorder();
    AUTH_RATE_LIMIT_OPTIONS.handler({}, authRes);
    assert.deepEqual(authRes.statuses, [429]);
    assert.deepEqual(authRes.payloads, [{ error: 'Demasiados intentos de autenticación' }]);
});

test('unknown API and non-GET SPA routes do not return index.html', async () => {
    const missingApi = await httpRequest('/api/does-not-exist');
    assert.equal(missingApi.status, 404);
    assert.equal((await missingApi.json()).error, 'Ruta API no encontrada');
    assert.match(missingApi.headers['content-type'], /application\/json/);
    assert.equal(missingApi.headers['set-cookie'], undefined);

    const missingPost = await request('/not-a-dashboard-route', {
        method: 'POST',
        body: { ok: true },
    });
    assert.equal(missingPost.status, 404);
    assert.equal((await missingPost.json()).error, 'Ruta no encontrada');
    assert.match(missingPost.headers['content-type'], /application\/json/);
});

test('unhandled API errors return stable JSON without Express HTML', async () => {
    const res = await httpRequest('/api/test/unhandled-error');
    assert.equal(res.status, 500);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.match(res.headers['cache-control'], /no-store/);
    const body = await res.json();
    assert.equal(body.error, 'Error interno del servidor');
    assert.match(body.requestId, /^[A-Za-z0-9._:-]{8,128}$/);
    assert.doesNotMatch(JSON.stringify(body), /simulated unhandled route failure/i);
});

test('responses include a sanitized request id for operational correlation', async () => {
    const generated = await httpRequest('/healthz');
    assert.match(generated.headers['x-request-id'], /^[0-9a-f-]{36}$/);

    const propagated = await httpRequest('/api/auth/verify', {
        headers: { 'X-Request-Id': 'deploy-check-2026.05.28:01' },
    });
    assert.equal(propagated.headers['x-request-id'], 'deploy-check-2026.05.28:01');

    const rejected = await httpRequest('/healthz', {
        headers: { 'X-Request-Id': '../../bad header' },
    });
    assert.match(rejected.headers['x-request-id'], /^[0-9a-f-]{36}$/);
    assert.notEqual(rejected.headers['x-request-id'], '../../bad header');
});

test('healthcheck is public, minimal, and does not mint CSRF cookies', async () => {
    const res = await httpRequest('/healthz');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.equal(body.user, undefined);
    assert.equal(body.maps, undefined);
    assert.equal(body.cpu, undefined);
    assert.equal(body.memory, undefined);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.match(res.headers['cache-control'], /no-store/);
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
    assert.equal(res.headers['x-powered-by'], undefined);

    const apiRes = await httpRequest('/api/health');
    assert.equal(apiRes.status, 200);
    assert.equal(apiRes.headers['set-cookie'], undefined);
    assert.match(apiRes.headers['cache-control'], /no-store/);
    assert.deepEqual(Object.keys(await apiRes.json()).sort(), ['status', 'uptimeSeconds']);

    const readyRes = await httpRequest('/readyz');
    assert.equal(readyRes.status, 200);
    assert.equal(readyRes.headers['set-cookie'], undefined);
    assert.match(readyRes.headers['cache-control'], /no-store/);
    const readyBody = await readyRes.json();
    assert.ok(['ok', 'warn'].includes(readyBody.status));
    assert.equal(typeof readyBody.failed, 'number');
    assert.equal(typeof readyBody.warnings, 'number');
    assert.match(readyBody.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Array.isArray(readyBody.failedChecks));
    assert.ok(Array.isArray(readyBody.warningChecks));
    for (const check of [...readyBody.failedChecks, ...readyBody.warningChecks]) {
        assert.deepEqual(Object.keys(check).sort(), ['id', 'label', 'status']);
        assert.match(check.id, /^[a-z0-9_:-]+$/i);
        assert.equal(typeof check.label, 'string');
        assert.ok(['fail', 'warn'].includes(check.status));
        assert.equal(check.remediation, undefined);
    }
    assert.ok(readyBody.failedChecks.length <= 5);
    assert.ok(readyBody.warningChecks.length <= 5);
    assert.equal(readyBody.checks, undefined);
    assert.equal(JSON.stringify(readyBody).includes('remediation'), false);
    assert.equal(JSON.stringify(readyBody).includes(globalThis.fixture.dataDir), false);
    assert.equal(readyBody.memory, undefined);
});

test('cors reflects only configured allowed origins', async () => {
    const allowed = await httpRequest('/healthz', {
        headers: { Origin: 'https://panel.example.test' },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://panel.example.test');
    assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

    const blocked = await httpRequest('/healthz', {
        headers: { Origin: 'https://evil.example.com' },
    });
    assert.equal(blocked.status, 200);
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
    assert.equal(blocked.headers['access-control-allow-credentials'], undefined);
});

test('spa requests still receive CSRF cookies', async () => {
    const res = await httpRequest('/');
    assert.equal(res.status, 200);
    assert.ok((res.headers['set-cookie'] || []).some(cookie => cookie.startsWith('XSRF-TOKEN=')));
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
});

test('read-only API requests do not mint CSRF cookies', async () => {
    const verify = await httpRequest('/api/auth/verify');
    assert.equal(verify.status, 401);
    assert.equal(verify.headers['set-cookie'], undefined);
    assert.match(verify.headers['cache-control'], /no-store/);
});

test('authenticated API responses are not cacheable', async () => {
    const verify = await request('/api/auth/verify');
    assert.equal(verify.status, 200);
    assert.match(verify.headers['cache-control'], /no-store/);
});

test('immutable assets do not mint CSRF cookies', async () => {
    const assetsDir = path.join(__dirname, '..', '..', 'client', 'dist', 'assets');
    const assetName = (await fs.readdir(assetsDir)).find(name => name.endsWith('.js'));
    assert.ok(assetName, 'expected at least one built JS asset');
    const res = await httpRequest(`/assets/${assetName}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.match(res.headers['cache-control'], /immutable/);
    assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
});

test('raw config writes reject redacted placeholders', async () => {
    const cases = [
        '[ServerSettings]\nServerAdminPassword=[REDACTED]\n',
        '[ServerSettings]\nServerAdminPassword="[REDACTED]" ; keep comment\n',
        '[ServerSettings]\nSpectatorPassword= [redacted] # copied from UI\n',
    ];

    for (const content of cases) {
        const res = await request('/api/config/gameusersettings', {
            method: 'POST',
            body: { mapId: 'ragnarok', content },
        });
        assert.equal(res.status, 400, content);
        assert.match((await res.json()).error, /secretos redactados/i);
    }

    const persisted = await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8');
    assert.match(persisted, /ServerAdminPassword=admin-secret/);
});

test('config mutation routes reject missing or invalid map ids without falling back', async () => {
    const originalGameIni = await fs.readFile(globalThis.fixture.gameIni, 'utf8');
    const originalGameUserSettings = await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8');

    const cases = [
        ['/api/config/parsed', { settings: { XPMultiplier: 2 } }],
        ['/api/config/parsed', { mapId: 'not-a-map', settings: { XPMultiplier: 2 } }],
        ['/api/config/lootcrates', { mapId: 'not-a-map', crateClass: 'SupplyCrate_Level03_C', items: ['PrimalItemResource_Stone_C'] }],
        ['/api/config/gameini', { mapId: 'not-a-map', content: 'changed' }],
        ['/api/config/gameusersettings', { mapId: 'not-a-map', content: 'changed' }],
        ['/api/config/secrets', { mapId: 'not-a-map', secrets: { ServerAdminPassword: 'changed' } }],
    ];

    for (const [pathname, body] of cases) {
        const res = await request(pathname, { method: 'POST', body });
        assert.equal(res.status, 400, `${pathname} should reject ${JSON.stringify(body)}`);
        assert.match((await res.json()).error, /mapId/i);
    }

    const readCases = [
        '/api/config/gameini',
        '/api/config/gameini?mapId=not-a-map',
        '/api/config/gameusersettings',
        '/api/config/gameusersettings?mapId=not-a-map',
    ];
    for (const pathname of readCases) {
        const res = await request(pathname);
        assert.equal(res.status, 400, `${pathname} should reject invalid map selection`);
        assert.match((await res.json()).error, /mapId/i);
    }

    assert.equal(await fs.readFile(globalThis.fixture.gameIni, 'utf8'), originalGameIni);
    assert.equal(await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8'), originalGameUserSettings);
});

test('server configuration mutations are owner-only and validate loot crate classes', async () => {
    const operatorParsed = await request('/api/config/parsed', {
        method: 'POST',
        body: { mapId: 'ragnarok', settings: { XPMultiplier: 3 } },
    }, globalThis.operatorClient);
    assert.equal(operatorParsed.status, 403);

    const parsed = await request('/api/config/parsed', {
        method: 'POST',
        body: { mapId: 'ragnarok', settings: { XPMultiplier: 3 } },
    });
    assert.equal(parsed.status, 200);
    assert.equal((await parsed.json()).message, 'Ajustes guardados correctamente. Reinicia el servidor para aplicar los cambios.');

    const operatorLoot = await request('/api/config/lootcrates', {
        method: 'POST',
        body: { mapId: 'ragnarok', crateClass: 'SupplyCrate_Level03_C', items: ['PrimalItemResource_Stone_C'] },
    }, globalThis.operatorClient);
    assert.equal(operatorLoot.status, 403);

    const injectedLoot = await request('/api/config/lootcrates', {
        method: 'POST',
        body: { mapId: 'ragnarok', crateClass: 'SupplyCrate_Level03_C\nServerAdminPassword=leak', items: ['PrimalItemResource_Stone_C'] },
    });
    assert.equal(injectedLoot.status, 400);
    assert.match((await injectedLoot.json()).error, /clase ARK inválido/i);

    const validLoot = await request('/api/config/lootcrates', {
        method: 'POST',
        body: { mapId: 'ragnarok', crateClass: 'SupplyCrate_Level03_C', items: ['PrimalItemResource_Stone_C'] },
    });
    assert.equal(validLoot.status, 200);
    assert.equal((await validLoot.json()).message, 'Loot crate inyectado correctamente. Reinicia el servidor para aplicar los cambios.');
});

test('preset routes constrain preset ids and handle missing preset directory', async () => {
    const presetsRoot = path.join(globalThis.fixture.dataDir, 'presets');
    const presetDir = path.join(presetsRoot, 'boosted');
    await fs.mkdir(presetDir, { recursive: true });
    await writeJson(path.join(presetDir, 'metadata.json'), {
        id: '../unsafe',
        name: 'Boosted',
        description: 'Safe preset id should come from folder',
    });
    await writeJson(path.join(presetDir, 'multipliers.json'), { XPMultiplier: 2 });

    const listRes = await request('/api/presets');
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.presets.find(preset => preset.name === 'Boosted').id, 'boosted');

    const operatorApply = await request('/api/presets/apply', {
        method: 'POST',
        body: { mapId: 'ragnarok', presetId: 'boosted' },
    }, globalThis.operatorClient);
    assert.equal(operatorApply.status, 403);

    const traversal = await request('/api/presets/apply', {
        method: 'POST',
        body: { mapId: 'ragnarok', presetId: '..' },
    });
    assert.equal(traversal.status, 400);
    assert.match((await traversal.json()).error, /presetId/i);

    const invalidMap = await request('/api/presets/apply', {
        method: 'POST',
        body: { mapId: 'not-a-map', presetId: 'boosted' },
    });
    assert.equal(invalidMap.status, 400);
    assert.match((await invalidMap.json()).error, /mapId/i);

    const missing = await request('/api/presets/apply', {
        method: 'POST',
        body: { mapId: 'ragnarok', presetId: 'missing' },
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'Preset no encontrado');

    const applied = await request('/api/presets/apply', {
        method: 'POST',
        body: { mapId: 'ragnarok', presetId: 'boosted' },
    });
    assert.equal(applied.status, 200);
    assert.equal((await applied.json()).message, 'Preset boosted aplicado correctamente. Reinicia el servidor para aplicar los cambios.');
    assert.match(await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8'), /XPMultiplier=2/);

    await fs.rm(presetsRoot, { recursive: true, force: true });
    const emptyList = await request('/api/presets');
    assert.equal(emptyList.status, 200);
    assert.deepEqual((await emptyList.json()).presets, []);
});

test('file manager reads redact secrets and writes reject redacted placeholders', async () => {
    const readRes = await request('/api/files/read?type=game&path=GameUserSettings.ini');
    assert.equal(readRes.status, 200);
    const readBody = await readRes.json();
    assert.equal(readBody.redacted, true);
    assert.doesNotMatch(readBody.content, /admin-secret|spectator-secret/);

    const writeCases = [
        '[ServerSettings]\nServerAdminPassword=[REDACTED]\n',
        '[ServerSettings]\nServerAdminPassword="[REDACTED]" ; copied from browser\n',
        '[ServerSettings]\nserverpassword= [redacted] # copied from browser\n',
    ];

    for (const content of writeCases) {
        const writeRes = await request('/api/files/write', {
            method: 'POST',
            body: {
                type: 'game',
                filePath: 'GameUserSettings.ini',
                content,
            },
        });
        assert.equal(writeRes.status, 400, content);
        assert.match((await writeRes.json()).error, /secretos redactados/i);
    }
});

test('global settings accept only strict Discord webhook URLs and valid IP allowlists', async () => {
    const valid = await request('/api/settings/global', {
        method: 'POST',
        body: {
            discordWebhookAlerts: 'https://discord.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
            discordWebhookBans: 'https://discordapp.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
            adminIpWhitelist: '::ffff:127.0.0.1, 10.0.0.5',
            TamingSpeedMultiplier: '5.5',
            HarvestAmountMultiplier: '1000',
            XPMultiplier: 2,
            MatingIntervalMultiplier: '0.001',
            EggHatchSpeedMultiplier: '7',
            BabyMatureSpeedMultiplier: '8',
            serverPvE: true,
            crossplay: false,
            maxPlayersDefault: '150',
            force2fa: true,
        },
    });
    assert.equal(valid.status, 200);

    const stored = await request('/api/settings/global', {}, globalThis.ownerClient);
    assert.equal(stored.status, 200);
    const storedBody = await stored.json();
    assert.equal(storedBody.adminIpWhitelist, '127.0.0.1, 10.0.0.5');
    assert.equal(storedBody.TamingSpeedMultiplier, '5.5');
    assert.equal(storedBody.HarvestAmountMultiplier, '1000');
    assert.equal(storedBody.XPMultiplier, '2');
    assert.equal(storedBody.MatingIntervalMultiplier, '0.001');
    assert.equal(storedBody.EggHatchSpeedMultiplier, '7');
    assert.equal(storedBody.BabyMatureSpeedMultiplier, '8');
    assert.equal(storedBody.serverPvE, true);
    assert.equal(storedBody.crossplay, false);
    assert.equal(storedBody.maxPlayersDefault, '150');
    assert.equal(storedBody.force2fa, undefined);

    const lockout = await request('/api/settings/global', {
        method: 'POST',
        body: { adminIpWhitelist: '10.0.0.5' },
    });
    assert.equal(lockout.status, 400);
    assert.match((await lockout.json()).error, /current IP/i);
    const afterLockout = await request('/api/settings/global', {}, globalThis.ownerClient);
    assert.equal((await afterLockout.json()).adminIpWhitelist, '127.0.0.1, 10.0.0.5');

    for (const body of [
        { TamingSpeedMultiplier: '0' },
        { MatingIntervalMultiplier: '-1' },
        { maxPlayersDefault: '12.5' },
        { serverPvE: 'true' },
        { crossplay: 'false' },
    ]) {
        const res = await request('/api/settings/global', { method: 'POST', body });
        assert.equal(res.status, 400, `${JSON.stringify(body)} should be rejected`);
    }

    for (const discordWebhookAlerts of [
        'https://discord.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345?wait=true',
        'https://discord.com/api/v10/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
        'https://discord.com/channels/@me',
        'https://example.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
        'http://discord.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
    ]) {
        const res = await request('/api/settings/global', {
            method: 'POST',
            body: { discordWebhookAlerts },
        });
        assert.equal(res.status, 400, `${discordWebhookAlerts} should be rejected`);
        assert.match((await res.json()).error, /webhook/i);
    }

    const invalidIp = await request('/api/settings/global', {
        method: 'POST',
        body: { adminIpWhitelist: '127.0.0.1, not-an-ip' },
    });
    assert.equal(invalidIp.status, 400);
    assert.match((await invalidIp.json()).error, /ip whitelist/i);
});

test('Discord webhooks use bounded network timeouts and sanitized embeds', async () => {
    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const originalSettings = await fs.readFile(settingsPath, 'utf8');
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedOptions = null;

    try {
        await writeJson(settingsPath, {
            discordWebhookAlerts: 'https://discord.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345',
        });
        globalThis.fetch = async (url, options) => {
            capturedUrl = String(url);
            capturedOptions = options;
            assert.ok(options.signal);
            return new Promise((resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
        };

        const started = Date.now();
        await globalThis.serverModule.sendDiscordWebhook('START', { map: 'Ragnarok', admin: 'owner' });
        assert.ok(Date.now() - started < 1000);
        assert.equal(capturedUrl, 'https://discord.com\x2fapi/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDE_-.12345');
        assert.equal(capturedOptions.method, 'POST');
        assert.equal(capturedOptions.headers['content-type'], 'application/json');
        assert.equal(capturedOptions.signal.aborted, true);
        const body = JSON.parse(capturedOptions.body);
        assert.match(body.embeds[0].title, /Ragnarok/);
        assert.match(body.embeds[0].description, /owner/);
    } finally {
        globalThis.fetch = originalFetch;
        await fs.writeFile(settingsPath, originalSettings);
    }
});

test('global settings fail before changing state when audit log is malformed', async () => {
    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalSettings = await fs.readFile(settingsPath, 'utf8');
    const originalAudit = await fs.readFile(auditPath, 'utf8');

    try {
        await fs.writeFile(auditPath, '{"logs":');
        const res = await request('/api/settings/global', {
            method: 'POST',
            body: { TamingSpeedMultiplier: '9' },
        });
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'Log de auditoría no disponible');
        assert.equal(await fs.readFile(settingsPath, 'utf8'), originalSettings);
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(settingsPath, originalSettings);
        await fs.writeFile(auditPath, originalAudit);
    }
});

test('invalid persisted admin IP whitelist fails closed before auth', async () => {
    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const original = await fs.readFile(settingsPath, 'utf8');

    try {
        await writeJson(settingsPath, { adminIpWhitelist: '10.0.0.5' });
        const blocked = await httpRequest('/api/auth/verify');
        assert.equal(blocked.status, 403);
        assert.equal((await blocked.json()).error, 'IP no autorizada');

        await writeJson(settingsPath, { adminIpWhitelist: 'not-an-ip' });
        const res = await httpRequest('/api/auth/verify');
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'Ajustes de seguridad no disponibles');
    } finally {
        await fs.writeFile(settingsPath, original);
    }
});

test('invalid non-security global settings do not disable pre-auth IP enforcement', async () => {
    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const original = await fs.readFile(settingsPath, 'utf8');

    try {
        await writeJson(settingsPath, {
            adminIpWhitelist: '127.0.0.1',
            TamingSpeedMultiplier: '0',
        });
        const verify = await httpRequest('/api/auth/verify');
        assert.equal(verify.status, 401);
        assert.match((await verify.json()).error, /no autorizado/i);

        const settings = await request('/api/settings/global', {}, globalThis.ownerClient);
        assert.equal(settings.status, 500);
        assert.match((await settings.json()).error, /ajustes globales/i);
    } finally {
        await fs.writeFile(settingsPath, original);
    }
});

test('auth and owner-only operational errors use Spanish API copy', async () => {
    const unauthenticated = await httpRequest('/api/auth/verify');
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json()).error, 'No autorizado');

    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const original = await fs.readFile(settingsPath, 'utf8');
    try {
        await writeJson(settingsPath, {
            adminIpWhitelist: '127.0.0.1',
            TamingSpeedMultiplier: '0',
        });
        const settings = await request('/api/settings/global', {}, globalThis.ownerClient);
        assert.equal(settings.status, 500);
        assert.equal((await settings.json()).error, 'No se pudieron leer los ajustes globales');
    } finally {
        await fs.writeFile(settingsPath, original);
    }
});

test('operator-facing backend error fallbacks stay localized', async () => {
    const source = await fs.readFile(path.join(__dirname, '..', 'server.js'), 'utf8');
    for (const staleMessage of [
        "error: 'Unauthorized'",
        "error: 'Forbidden'",
        "error: 'Insufficient role'",
        "error: 'IP not allowed'",
        "error: 'Server error'",
        "error: 'Security settings unavailable'",
        "error: 'Internal server error'",
        "error: 'Request failed'",
        "error: 'Not found'",
        "error: 'Audit log unavailable'",
        "error: 'Failed to read audit log'",
        "error: 'Failed to read system health'",
        "error: 'Failed to read global settings'",
        "error: 'Cluster status unavailable'",
        "error: 'Map status unavailable'",
    ]) {
        assert.doesNotMatch(source, new RegExp(staleMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(source, /error: 'No autorizado'/);
    assert.match(source, /error: 'Permisos insuficientes'/);
    assert.match(source, /error: 'IP no autorizada'/);
    assert.match(source, /error: 'Ajustes de seguridad no disponibles'/);
    assert.match(source, /error: 'Error del servidor'/);
    assert.match(source, /'Error interno del servidor'/);
    assert.match(source, /error: 'Ruta no encontrada'/);
    assert.match(source, /'Log de auditoría no disponible'/);
    assert.match(source, /'No se pudo leer el log de auditoría'/);
    assert.match(source, /error: 'No se pudo leer la salud del sistema'/);
    assert.match(source, /error: 'No se pudieron leer los ajustes globales'/);
    assert.match(source, /error: 'Estado del cluster no disponible'/);
    assert.match(source, /error: 'Estado del mapa no disponible'/);
});

test('persisted global settings are returned through the supported schema only', async () => {
    const settingsPath = path.join(globalThis.fixture.dataDir, 'global_settings.json');
    const original = await fs.readFile(settingsPath, 'utf8');

    try {
        await writeJson(settingsPath, {
            adminIpWhitelist: '',
            TamingSpeedMultiplier: '3',
            crossplay: false,
            maxPlayersDefault: '99',
            legacySecret: 'should-not-return',
            force2fa: true,
        });
        const res = await request('/api/settings/global', {}, globalThis.ownerClient);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.TamingSpeedMultiplier, '3');
        assert.equal(body.crossplay, false);
        assert.equal(body.maxPlayersDefault, '99');
        assert.equal(body.legacySecret, undefined);
        assert.equal(body.force2fa, undefined);
        assert.equal(body.discordWebhookAlerts, '');
        assert.equal(body.HarvestAmountMultiplier, '1');
    } finally {
        await fs.writeFile(settingsPath, original);
    }
});

test('api routes require auth and CSRF for state changes', async () => {
    const unauthenticated = await httpRequest('/api/cluster/maps');
    assert.equal(unauthenticated.status, 401);

    const corruptSession = await httpRequest('/api/auth/verify', {
        headers: { cookie: 'session=not-a-valid-jwt; XSRF-TOKEN=stale-token' },
    });
    assert.equal(corruptSession.status, 403);
    const corruptSessionClears = corruptSession.headers['set-cookie'].join('\n');
    assert.match(corruptSessionClears, /session=;/);
    assert.match(corruptSessionClears, /XSRF-TOKEN=;/);

    const missingCsrf = await httpRequest('/api/tasks', {
        method: 'POST',
        headers: { cookie: globalThis.operatorClient.cookieHeader },
        body: {
            action: 'Broadcast',
            cronExpr: '* * * * *',
            payload: 'missing csrf',
            mapId: 'all',
        },
    });
    assert.equal(missingCsrf.status, 403);
    assert.match((await missingCsrf.json()).error, /csrf/i);

    const logout = await httpRequest('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: globalThis.operatorClient.cookieHeader },
    });
    assert.equal(logout.status, 200);
    const clearedCookies = logout.headers['set-cookie'].join('\n');
    assert.match(clearedCookies, /session=;/);
    assert.match(clearedCookies, /XSRF-TOKEN=;/);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    assert.ok(audit.some(entry => entry.action === 'LOGOUT' && entry.admin === 'operator'));

    const unauthenticatedLogout = await httpRequest('/api/auth/logout', { method: 'POST' });
    assert.equal(unauthenticatedLogout.status, 200);
});

test('failed logins are audited without storing attempted usernames', async () => {
    const res = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'does-not-exist', password: 'wrong-password' },
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /credenciales inválidas/i);
    assert.equal(res.headers['set-cookie'], undefined);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    const failure = audit.find(entry => entry.action === 'LOGIN_FAILED');
    assert.ok(failure);
    assert.equal(failure.admin, 'system');
    assert.match(failure.details, /Invalid credentials from/);
    assert.doesNotMatch(failure.details, /does-not-exist|wrong-password/);
});

test('oversized login payloads fail generically without issuing cookies or leaking secrets', async () => {
    const oversizedUsername = 'user'.repeat(40);
    const oversizedPassword = 'p'.repeat(73);
    const validLengthPassword = 'wrong-password';

    const oversizedUsernameRes = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: oversizedUsername, password: validLengthPassword },
    });
    assert.equal(oversizedUsernameRes.status, 400);
    assert.match((await oversizedUsernameRes.json()).error, /credenciales inválidas/i);
    assert.equal(oversizedUsernameRes.headers['set-cookie'], undefined);

    const oversizedPasswordRes = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'owner', password: oversizedPassword },
    });
    assert.equal(oversizedPasswordRes.status, 400);
    assert.match((await oversizedPasswordRes.json()).error, /credenciales inválidas/i);
    assert.equal(oversizedPasswordRes.headers['set-cookie'], undefined);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    const failures = audit.filter(entry => entry.action === 'LOGIN_FAILED');
    assert.ok(failures.some(entry => /Invalid login payload from/.test(entry.details)));
    const serializedAudit = JSON.stringify(failures);
    assert.doesNotMatch(serializedAudit, new RegExp(oversizedUsername));
    assert.doesNotMatch(serializedAudit, new RegExp(oversizedPassword));
});

test('successful login issues session and CSRF cookies', async () => {
    const res = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'owner', password: 'correct-password' },
    });
    assert.equal(res.status, 200);
    const cookies = cookiePairs(res.headers['set-cookie']);
    assert.ok(cookies.some(cookie => cookie.startsWith('session=')));
    assert.ok(cookies.some(cookie => cookie.startsWith('XSRF-TOKEN=')));
    const rawCookies = res.headers['set-cookie'].join('\n');
    assert.match(rawCookies, /session=.*Max-Age=86400/i);
    assert.match(rawCookies, /session=.*HttpOnly/i);
    assert.match(rawCookies, /session=.*SameSite=Strict/i);
    assert.match(rawCookies, /session=.*Priority=High/i);
    assert.match(rawCookies, /XSRF-TOKEN=.*Max-Age=86400/i);
    assert.match(rawCookies, /XSRF-TOKEN=.*SameSite=Strict/i);
    assert.match(rawCookies, /XSRF-TOKEN=.*Priority=High/i);
});

test('login matches dashboard usernames case-insensitively after trimming', async () => {
    const res = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: '  OWNER  ', password: 'correct-password' },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.username, 'owner');
    assert.equal(body.user.role, 'owner');
    assert.ok(cookiePairs(res.headers['set-cookie']).some(cookie => cookie.startsWith('session=')));
});

test('missing built assets return 404 instead of the SPA shell', async () => {
    const res = await rawHttpRequest('/assets/missing-dashboard-chunk.js', { method: 'GET' });
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /^text\/plain/);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-flowark-asset-missing'], '1');
    assert.equal(res.headers['set-cookie'], undefined);
    assert.match(res.body, /recarga el panel/i);
    assert.doesNotMatch(res.body, /reload the dashboard/i);
});

test('content security policy does not allow inline scripts or external CDNs', async () => {
    const res = await httpRequest('/');
    assert.equal(res.status, 200);
    const csp = res.headers['content-security-policy'] || '';
    const permissionsPolicy = res.headers['permissions-policy'] || '';

    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(csp, /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com/);
    assert.match(csp, /style-src 'self'/);
    // Framer Motion writes runtime style attributes; script execution remains
    // restricted above. Style allowance is not a script-src exception.
    assert.match(csp, /style-src[^;]*'unsafe-inline'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
    assert.match(csp, /form-action 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.match(permissionsPolicy, /camera=\(\)/);
    assert.match(permissionsPolicy, /microphone=\(\)/);
    assert.match(permissionsPolicy, /geolocation=\(\)/);
    assert.match(permissionsPolicy, /payment=\(\)/);
    assert.match(permissionsPolicy, /clipboard-read=\(\)/);
    assert.match(permissionsPolicy, /clipboard-write=\(self\)/);
});

test('server package manifest excludes unused direct dependencies', async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const lock = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

    assert.equal(pkg.main, 'server.js');
    assert.equal(lock.packages?.['']?.name, pkg.name);
    assert.equal(lock.packages?.['']?.version, pkg.version);
    assert.equal(pkg.dependencies?.dotenv, undefined);
    assert.equal(pkg.dependencies?.['fast-xml-parser'], undefined);
    assert.equal(lock.packages?.['']?.dependencies?.dotenv, undefined);
    assert.equal(lock.packages?.['']?.dependencies?.['fast-xml-parser'], undefined);
    assert.match(pkg.overrides?.gamedig?.['fast-xml-parser'] || '', /\^5\.8\./);
    assert.match(lock.packages?.['node_modules/fast-xml-parser']?.version || '', /^5\.8\./);
});

test('file manager rejects traversal consistently', async () => {
    await fs.writeFile(path.join(globalThis.fixture.root, 'outside.txt'), 'outside');

    const listRes = await request('/api/files/list?type=game&path=..');
    assert.equal(listRes.status, 403);

    const readRes = await request('/api/files/read?type=game&path=../outside.txt');
    assert.equal(readRes.status, 403);
    assert.equal((await readRes.json()).error, 'Acceso denegado');

    const repeatedPath = await request('/api/files/list?type=game&path=Game.ini&path=GameUserSettings.ini');
    assert.equal(repeatedPath.status, 400);
    assert.equal((await repeatedPath.json()).error, 'Ruta inválida');

    const controlPath = await request('/api/files/read?type=game&path=Game.ini%00');
    assert.equal(controlPath.status, 400);
    assert.equal((await controlPath.json()).error, 'Ruta inválida');

    const writeRes = await request('/api/files/write', {
        method: 'POST',
        body: {
            type: 'game',
            filePath: '../outside.txt',
            content: 'changed',
        },
    });
    assert.equal(writeRes.status, 403);
    assert.equal(await fs.readFile(path.join(globalThis.fixture.root, 'outside.txt'), 'utf8'), 'outside');
});

test('file manager refuses symlinked managed paths', async () => {
    const linkedInside = path.join(globalThis.fixture.configDir, 'Game-linked.ini');
    const originalGameIni = await fs.readFile(globalThis.fixture.gameIni, 'utf8');

    try {
        await fs.symlink(globalThis.fixture.gameIni, linkedInside);
    } catch (err) {
        if (['EPERM', 'EOPNOTSUPP', 'ENOSYS'].includes(err.code)) {
            assert.ok(true, `symlinks unsupported on this platform: ${err.code}`);
            return;
        }
        throw err;
    }

    const readRes = await request('/api/files/read?type=game&path=Game-linked.ini');
    assert.equal(readRes.status, 403);
    assert.match((await readRes.json()).error, /symlink|enlaces simbólicos/i);

    const writeRes = await request('/api/files/write', {
        method: 'POST',
        body: {
            type: 'game',
            filePath: 'Game-linked.ini',
            content: 'changed',
        },
    });
    assert.equal(writeRes.status, 403);
    assert.match((await writeRes.json()).error, /symlink|enlaces simbólicos/i);
    assert.equal(await fs.readFile(globalThis.fixture.gameIni, 'utf8'), originalGameIni);
});

test('file manager rejects unknown root types instead of falling back to game files', async () => {
    const listRes = await request('/api/files/list?type=unknown&path=.');
    assert.equal(listRes.status, 400);
    assert.equal((await listRes.json()).error, 'Tipo de raíz del gestor de archivos inválido');

    const readRes = await request('/api/files/read?type=unknown&path=Game.ini');
    assert.equal(readRes.status, 400);
    assert.equal((await readRes.json()).error, 'Tipo de raíz del gestor de archivos inválido');

    const writeRes = await request('/api/files/write', {
        method: 'POST',
        body: {
            type: 'unknown',
            filePath: 'Game.ini',
            content: 'changed',
        },
    });
    assert.equal(writeRes.status, 400);
    assert.equal((await writeRes.json()).error, 'Tipo de raíz del gestor de archivos inválido');

    const gameIni = await fs.readFile(globalThis.fixture.gameIni, 'utf8');
    assert.doesNotMatch(gameIni, /changed/);
});

test('config file mutations fail before changing files when audit log is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');
    const originalGameIni = await fs.readFile(globalThis.fixture.gameIni, 'utf8');
    const originalGameUserSettings = await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8');

    try {
        await fs.writeFile(auditPath, '{"logs":');

        const fileWrite = await request('/api/files/write', {
            method: 'POST',
            body: {
                type: 'game',
                filePath: 'Game.ini',
                content: `${originalGameIni}\nAuditBlocked=True\n`,
            },
        });
        assert.equal(fileWrite.status, 500);

        const gameIniWrite = await request('/api/config/gameini', {
            method: 'POST',
            body: { mapId: 'ragnarok', content: `${originalGameIni}\nAuditBlockedRaw=True\n` },
        });
        assert.equal(gameIniWrite.status, 500);

        const secretRotate = await request('/api/config/secrets', {
            method: 'POST',
            body: {
                mapId: 'ragnarok',
                secrets: { ServerAdminPassword: 'audit-blocked-secret' },
            },
        });
        assert.equal(secretRotate.status, 500);

        assert.equal(await fs.readFile(globalThis.fixture.gameIni, 'utf8'), originalGameIni);
        assert.equal(await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8'), originalGameUserSettings);
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
    }
});

test('secret rotation is owner-only and updates only valid ARK secret keys', async () => {
    const denied = await request('/api/config/secrets', {
        method: 'POST',
        body: {
            mapId: 'ragnarok',
            secrets: { ServerAdminPassword: 'operator-change' },
        },
    }, globalThis.operatorClient);
    assert.equal(denied.status, 403);

    const malformedPayload = await request('/api/config/secrets', {
        method: 'POST',
        body: { mapId: 'ragnarok', secrets: null },
    });
    assert.equal(malformedPayload.status, 400);
    assert.equal((await malformedPayload.json()).error, 'Payload de secretos inválido');

    const emptyPayload = await request('/api/config/secrets', {
        method: 'POST',
        body: { mapId: 'ragnarok', secrets: { NotASecret: 'ignored' } },
    });
    assert.equal(emptyPayload.status, 400);
    assert.equal((await emptyPayload.json()).error, 'No se proporcionaron secretos válidos');

    const rotated = await request('/api/config/secrets', {
        method: 'POST',
        body: {
            mapId: 'ragnarok',
            secrets: {
                ServerAdminPassword: 'new-admin-secret',
                SpectatorPassword: 'new-spectator-secret',
                NotASecret: 'ignored',
            },
        },
    });
    assert.equal(rotated.status, 200);
    assert.equal((await rotated.json()).message, 'Secretos actualizados. Reinicia el servidor si es necesario.');

    const persisted = await fs.readFile(globalThis.fixture.gameUserSettings, 'utf8');
    assert.match(persisted, /ServerAdminPassword=new-admin-secret/);
    assert.match(persisted, /SpectatorPassword=new-spectator-secret/);
    assert.doesNotMatch(persisted, /NotASecret=ignored/);
});

test('in-game admin grants are owner-only and write the admin allowlist', async () => {
    const steamId = '76561198123456789';
    const denied = await request('/api/players/make-admin', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player' },
    }, globalThis.operatorClient);
    assert.equal(denied.status, 403);

    let persisted = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    assert.doesNotMatch(persisted, new RegExp(steamId));

    const granted = await request('/api/players/make-admin', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player' },
    });
    assert.equal(granted.status, 200);
    persisted = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    assert.match(persisted, new RegExp(steamId));

    const deniedRemove = await request('/api/players/remove-admin', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player' },
    }, globalThis.operatorClient);
    assert.equal(deniedRemove.status, 403);
    persisted = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    assert.match(persisted, new RegExp(steamId));

    const removed = await request('/api/players/remove-admin', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player' },
    });
    assert.equal(removed.status, 200);
    persisted = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    assert.doesNotMatch(persisted, new RegExp(steamId));

    const missingRemove = await request('/api/players/remove-admin', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player' },
    });
    assert.equal(missingRemove.status, 404);
    assert.match((await missingRemove.json()).error, /admin in-game no encontrado/i);
});

test('removing in-game admin fails explicitly when allowlist is missing', async () => {
    const original = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    await fs.rm(globalThis.fixture.ingameAdmins, { force: true });

    const res = await request('/api/players/remove-admin', {
        method: 'POST',
        body: { steamId: '76561198123456789', playerName: 'Missing File Player' },
    });
    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /lista de admins in-game/i);

    await fs.writeFile(globalThis.fixture.ingameAdmins, original);
});

test('concurrent task creation keeps all JSON updates', async () => {
    const requests = Array.from({ length: 8 }, (_, index) => request('/api/tasks', {
        method: 'POST',
        body: {
            action: 'Broadcast',
            cronExpr: `*/${index + 5} * * * *`,
            payload: `message-${index}`,
            mapId: 'all',
        },
    }, globalThis.operatorClient));

    const results = await Promise.all(requests);
    assert.deepEqual(results.map(res => res.status), Array(8).fill(200));
    for (const res of results) {
        const body = await res.json();
        assert.equal(body.message, 'Tarea creada');
        assert.match(body.taskId, /^[0-9a-f-]{36}$/i);
        assert.equal(body.task, undefined);
    }

    const tasksRes = await request('/api/tasks', {}, globalThis.operatorClient);
    assert.equal(tasksRes.status, 200);
    const tasksBody = await tasksRes.json();
    const tasks = tasksBody.tasks;
    assert.match(tasksBody.scheduleContext.timeZone, /\S/);
    assert.match(tasksBody.scheduleContext.serverTime, /^\d{4}-\d{2}-\d{2}T/);
    for (let index = 0; index < 8; index += 1) {
        assert.ok(tasks.some(task => task.payload === `message-${index}`));
    }
});

test('scheduled tasks reject invalid action, cron, map, and payload', async () => {
    const cases = [{
        body: { action: 'Shell', cronExpr: '* * * * *', payload: 'x', mapId: 'all' },
        error: /acción de tarea inválida/i,
    }, {
        body: { action: 'Broadcast', cronExpr: 'not-cron', payload: 'x', mapId: 'all' },
        error: /cron inválida/i,
    }, {
        body: { action: 'Broadcast', cronExpr: '* * * * * *', payload: 'x', mapId: 'all' },
        error: /segundos no están permitidas/i,
    }, {
        body: { action: 'Broadcast', cronExpr: '* * * * *', payload: 'x', mapId: 'all' },
        error: /al menos 5 minutos/i,
    }, {
        body: { action: 'Broadcast', cronExpr: '1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51,53,55,57,59 * * * *', payload: 'x', mapId: 'all' },
        error: /al menos 5 minutos/i,
    }, {
        body: { action: 'SaveWorld', cronExpr: '5-59/10 * * * *', mapId: 'all' },
        error: /al menos 15 minutos/i,
    }, {
        body: { action: 'SaveWorld', cronExpr: '* * * * *', mapId: 'not-a-map' },
        error: /mapId inválido/i,
    }, {
        body: { action: 'Broadcast', cronExpr: '* * * * *', payload: 'x'.repeat(501), mapId: 'all' },
        error: /500 caracteres/i,
    }, {
        body: { action: 'Broadcast', cronExpr: '*/5 * * * *', payload: 'hello\nDoExit', mapId: 'all' },
        error: /caracteres de control/i,
    }];

    for (const testCase of cases) {
        const res = await request('/api/tasks', {
            method: 'POST',
            body: testCase.body,
        }, globalThis.operatorClient);
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, testCase.error);
    }
});

test('scheduled task mutation routes reject malformed task ids', async () => {
    for (const pathname of [
        '/api/tasks/not-a-uuid/toggle',
        `/api/tasks/${'a'.repeat(200)}/toggle`,
    ]) {
        const res = await request(pathname, {
            method: 'POST',
            body: { active: false },
        }, globalThis.operatorClient);
        assert.equal(res.status, 400, `${pathname} should reject malformed task id`);
        const body = await res.json();
        assert.match(body.error, /task id/i);
        assert.match(body.error, /parámetro/i);
        assert.doesNotMatch(body.error, /invalid/i);
    }

    for (const pathname of [
        '/api/tasks/not-a-uuid',
        `/api/tasks/${'b'.repeat(200)}`,
    ]) {
        const res = await request(pathname, {
            method: 'DELETE',
        }, globalThis.operatorClient);
        assert.equal(res.status, 400, `${pathname} should reject malformed task id`);
        const body = await res.json();
        assert.match(body.error, /task id/i);
        assert.match(body.error, /parámetro/i);
        assert.doesNotMatch(body.error, /invalid/i);
    }

    for (const pathname of [
        '/api/tasks/not-a-uuid',
        `/api/tasks/${'c'.repeat(200)}`,
    ]) {
        const res = await request(pathname, {
            method: 'PATCH',
            body: { action: 'Broadcast', cronExpr: '*/10 * * * *', payload: 'hello', mapId: 'all' },
        }, globalThis.operatorClient);
        assert.equal(res.status, 400, `${pathname} should reject malformed task id on PATCH`);
        const body = await res.json();
        assert.match(body.error, /task id/i);
        assert.match(body.error, /parámetro/i);
        assert.doesNotMatch(body.error, /invalid/i);
    }
});

test('scheduled task mutations fail before changing tasks when audit log is malformed', async () => {
    const tasksPath = path.join(globalThis.fixture.dataDir, 'tasks.json');
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const existingTasks = [{
        id: '11111111-1111-4111-8111-111111111111',
        action: 'Broadcast',
        cron: '*/10 * * * *',
        payload: 'before edit',
        mapId: 'all',
        active: true,
        createdAt: '2026-05-28T00:00:00.000Z',
    }, {
        id: '22222222-2222-4222-8222-222222222222',
        action: 'SaveWorld',
        cron: '0 */2 * * *',
        payload: '',
        mapId: 'ragnarok',
        active: true,
        createdAt: '2026-05-28T00:00:00.000Z',
    }];
    await writeJson(tasksPath, existingTasks);
    await fs.writeFile(auditPath, '{"logs":');

    const create = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'Broadcast', cronExpr: '*/10 * * * *', payload: 'new task', mapId: 'all' },
    }, globalThis.operatorClient);
    assert.equal(create.status, 500);

    const toggle = await request('/api/tasks/11111111-1111-4111-8111-111111111111/toggle', {
        method: 'POST',
        body: { active: false },
    }, globalThis.operatorClient);
    assert.equal(toggle.status, 500);

    const patch = await request('/api/tasks/11111111-1111-4111-8111-111111111111', {
        method: 'PATCH',
        body: { action: 'SaveWorld', cronExpr: '0 */3 * * *', payload: '', mapId: 'ragnarok', active: false },
    }, globalThis.operatorClient);
    assert.equal(patch.status, 500);

    const remove = await request('/api/tasks/22222222-2222-4222-8222-222222222222', {
        method: 'DELETE',
    }, globalThis.operatorClient);
    assert.equal(remove.status, 500);

    assert.deepEqual(JSON.parse(await fs.readFile(tasksPath, 'utf8')), existingTasks);
    assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    await writeJson(auditPath, []);
});

test('scheduled task updates validate input, preserve role gates, and reschedule active tasks', async () => {
    const create = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'Broadcast', cronExpr: '*/10 * * * *', payload: 'before edit', mapId: 'all' },
    }, globalThis.operatorClient);
    assert.equal(create.status, 200);
    const taskId = (await create.json()).taskId;

    const invalidPatch = await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: { action: 'Broadcast', cronExpr: '* * * * * *', payload: 'bad', mapId: 'all' },
    }, globalThis.operatorClient);
    assert.equal(invalidPatch.status, 400);
    assert.match((await invalidPatch.json()).error, /segundos no están permitidas/i);

    const nonBooleanActive = await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: { action: 'Broadcast', cronExpr: '*/10 * * * *', payload: 'bad', mapId: 'all', active: 'yes' },
    }, globalThis.operatorClient);
    assert.equal(nonBooleanActive.status, 400);
    assert.match((await nonBooleanActive.json()).error, /boolean/i);

    const update = await request(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: { action: 'SaveWorld', cronExpr: '0 */3 * * *', payload: '', mapId: 'ragnarok', active: true },
    }, globalThis.operatorClient);
    assert.equal(update.status, 200);
    assert.deepEqual(await update.json(), { message: 'Tarea actualizada' });

    const tasksRes = await request('/api/tasks', {}, globalThis.operatorClient);
    assert.equal(tasksRes.status, 200);
    const updatedTask = (await tasksRes.json()).tasks.find(task => task.id === taskId);
    assert.equal(updatedTask.action, 'SaveWorld');
    assert.equal(updatedTask.cron, '0 */3 * * *');
    assert.equal(updatedTask.payload, '');
    assert.equal(updatedTask.mapId, 'ragnarok');
    assert.equal(updatedTask.active, true);
    assert.ok(updatedTask.updatedAt);
});

test('destructive scheduled tasks require owner role, single map, and conservative frequency', async () => {
    const operatorDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0 */2 * * *', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(operatorDoExit.status, 403);
    assert.match((await operatorDoExit.json()).error, /rol owner/i);

    const allMapsDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0 */2 * * *', mapId: 'all' },
    }, globalThis.ownerClient);
    assert.equal(allMapsDoExit.status, 400);
    assert.match((await allMapsDoExit.json()).error, /único mapa/i);

    const tooFrequentDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '*/30 * * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentDoExit.status, 400);
    assert.match((await tooFrequentDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentListedDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0,20,40 * * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentListedDoExit.status, 400);
    assert.match((await tooFrequentListedDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentRangedDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0-59/30 * * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentRangedDoExit.status, 400);
    assert.match((await tooFrequentRangedDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentSteppedStartDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '5/30 * * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentSteppedStartDoExit.status, 400);
    assert.match((await tooFrequentSteppedStartDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentAllDayRangeDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0,20,40 0-23 * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentAllDayRangeDoExit.status, 400);
    assert.match((await tooFrequentAllDayRangeDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentNamedCalendarDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0,20,40 * * JAN-DEC SUN-SAT', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentNamedCalendarDoExit.status, 400);
    assert.match((await tooFrequentNamedCalendarDoExit.json()).error, /al menos 60 minutos/i);

    const tooFrequentNamedCalendarRangeDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0-59/30 0-23 * JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC SUN,MON,TUE,WED,THU,FRI,SAT', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(tooFrequentNamedCalendarRangeDoExit.status, 400);
    assert.match((await tooFrequentNamedCalendarRangeDoExit.json()).error, /al menos 60 minutos/i);

    const validDoExit = await request('/api/tasks', {
        method: 'POST',
        body: { action: 'DoExit', cronExpr: '0 */2 * * *', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(validDoExit.status, 200);
    const doExitCreateBody = await validDoExit.json();
    assert.equal(doExitCreateBody.message, 'Tarea creada');
    assert.match(doExitCreateBody.taskId, /^[0-9a-f-]{36}$/i);
    assert.equal(doExitCreateBody.task, undefined);
    const doExitTaskId = doExitCreateBody.taskId;

    const nonBooleanToggle = await request(`/api/tasks/${doExitTaskId}/toggle`, {
        method: 'POST',
        body: { active: 'false' },
    }, globalThis.ownerClient);
    assert.equal(nonBooleanToggle.status, 400);
    assert.match((await nonBooleanToggle.json()).error, /boolean/i);

    const operatorToggle = await request(`/api/tasks/${doExitTaskId}/toggle`, {
        method: 'POST',
        body: { active: false },
    }, globalThis.operatorClient);
    assert.equal(operatorToggle.status, 403);
    assert.match((await operatorToggle.json()).error, /rol owner/i);

    const operatorDelete = await request(`/api/tasks/${doExitTaskId}`, {
        method: 'DELETE',
    }, globalThis.operatorClient);
    assert.equal(operatorDelete.status, 403);
    assert.match((await operatorDelete.json()).error, /rol owner/i);

    const operatorPatch = await request(`/api/tasks/${doExitTaskId}`, {
        method: 'PATCH',
        body: { action: 'DoExit', cronExpr: '0 */3 * * *', mapId: 'ragnarok', payload: '' },
    }, globalThis.operatorClient);
    assert.equal(operatorPatch.status, 403);
    assert.match((await operatorPatch.json()).error, /rol owner/i);

    const operatorDowngradePatch = await request(`/api/tasks/${doExitTaskId}`, {
        method: 'PATCH',
        body: { action: 'Broadcast', cronExpr: '*/10 * * * *', mapId: 'all', payload: 'restart avoided' },
    }, globalThis.operatorClient);
    assert.equal(operatorDowngradePatch.status, 403);
    assert.match((await operatorDowngradePatch.json()).error, /rol owner/i);

    const ownerToggle = await request(`/api/tasks/${doExitTaskId}/toggle`, {
        method: 'POST',
        body: { active: false },
    }, globalThis.ownerClient);
    assert.equal(ownerToggle.status, 200);
    assert.deepEqual(await ownerToggle.json(), { message: 'Tarea actualizada' });

    const ownerDelete = await request(`/api/tasks/${doExitTaskId}`, {
        method: 'DELETE',
    }, globalThis.ownerClient);
    assert.equal(ownerDelete.status, 200);
});

test('persisted legacy scheduled tasks are validated before scheduling or execution', async () => {
    const { validateStoredScheduledTask, scheduleCronJob, executeTaskAction } = globalThis.serverModule;
    const legacyDoExitAll = {
        id: 'legacy-doexit-all',
        action: 'DoExit',
        cron: '0 */2 * * *',
        mapId: 'all',
        active: true,
    };
    const unsafeBroadcast = {
        id: 'legacy-broadcast-control',
        action: 'Broadcast',
        cron: '*/5 * * * *',
        mapId: 'all',
        payload: 'hello\nDoExit',
        active: true,
    };
    const validSaveWorld = {
        id: 'valid-saveworld',
        action: 'SaveWorld',
        cron: '0 */2 * * *',
        mapId: 'ragnarok',
        active: true,
    };

    assert.match(validateStoredScheduledTask(legacyDoExitAll), /único mapa/i);
    assert.match(validateStoredScheduledTask(unsafeBroadcast), /caracteres de control/i);
    assert.equal(scheduleCronJob(legacyDoExitAll), false);
    assert.equal(scheduleCronJob(unsafeBroadcast), false);

    globalThis.rconCalls = [];
    assert.equal(await executeTaskAction(legacyDoExitAll), false);
    assert.deepEqual(globalThis.rconCalls, []);

    assert.equal(validateStoredScheduledTask(validSaveWorld), null);
    assert.equal(scheduleCronJob(validSaveWorld), true);
    assert.equal(scheduleCronJob({ ...validSaveWorld, active: false }), false);
});

test('scheduled RCON tasks skip unavailable maps and log recovery without spam', async () => {
    const { executeTaskAction } = globalThis.serverModule;
    const task = {
        id: 'broadcast-rcon-preflight',
        action: 'Broadcast',
        cron: '*/30 * * * *',
        mapId: 'ragnarok',
        payload: 'hello cluster',
        active: true,
    };
    const processList = [{
        name: 'ShooterGameServer',
        command: '/server/ShooterGameServer',
        params: 'Ragnarok?RCONPort=27020 -Port=7777 -QueryPort=27015',
    }];
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const warnings = [];
    const infos = [];

    try {
        console.warn = (...args) => warnings.push(args.join(' '));
        console.info = (...args) => infos.push(args.join(' '));
        globalThis.rconCalls.length = 0;

        assert.equal(await executeTaskAction(task, {
            processList,
            rconAvailability: async () => false,
        }), true);
        assert.deepEqual(globalThis.rconCalls, []);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /RCON port 27020 unavailable/);

        assert.equal(await executeTaskAction(task, {
            processList,
            rconAvailability: async () => false,
        }), true);
        assert.equal(warnings.length, 1);
        assert.deepEqual(globalThis.rconCalls, []);

        assert.equal(await executeTaskAction(task, {
            processList,
            rconAvailability: async () => true,
        }), true);
        assert.ok(globalThis.rconCalls.some(call => call.type === 'send' && call.command === 'Broadcast hello cluster'));
        assert.ok(infos.some(message => /recovered on Ragnarok/.test(message)));
    } finally {
        console.warn = originalWarn;
        console.info = originalInfo;
    }
});

test('server actions reject invalid input before invoking map scripts', async () => {
    const invalidAction = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'shell', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(invalidAction.status, 400);
    assert.match((await invalidAction.json()).error, /acción inválida/i);

    const invalidMap = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'restart', mapId: 'not-a-map' },
    }, globalThis.ownerClient);
    assert.equal(invalidMap.status, 400);
    assert.match((await invalidMap.json()).error, /mapId inválido/i);

    const operatorAction = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'restart', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(operatorAction.status, 403);

    const viewerCreated = await request('/api/admins', {
        method: 'POST',
        body: { username: 'viewer', password: 'correct-password', role: 'viewer' },
    });
    assert.equal(viewerCreated.status, 200);
    const viewerClient = await createClient('viewer');
    const forbidden = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'restart', mapId: 'ragnarok' },
    }, viewerClient);
    assert.equal(forbidden.status, 403);
});

test('server action responses do not expose script stdout', async () => {
    const single = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'restart', mapId: 'ragnarok' },
    }, globalThis.ownerClient);
    assert.equal(single.status, 200);
    const singleBody = await single.json();
    assert.equal(singleBody.status, 'enviado');
    assert.equal(singleBody.output, undefined);
    assert.doesNotMatch(JSON.stringify(singleBody), /secret-token|\/servidor\/ark/);

    const cluster = await request('/api/server/action', {
        method: 'POST',
        body: { action: 'restart', mapId: 'all' },
    }, globalThis.ownerClient);
    assert.equal(cluster.status, 200);
    const clusterBody = await cluster.json();
    assert.deepEqual(clusterBody.results, [{ map: 'Ragnarok', status: 'enviado' }]);
    assert.doesNotMatch(JSON.stringify(clusterBody), /secret-token|\/servidor\/ark/);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    assert.ok(audit.some(entry => entry.action === 'SERVER_ACTION' && /Ragnarok restart/.test(entry.details)));
    assert.ok(audit.some(entry => entry.action === 'SERVER_ACTION' && /Cluster restart \(all maps\)/.test(entry.details)));
});

test('admin creation rejects weak passwords, unsafe usernames, and duplicate names', async () => {
    const weak = await request('/api/admins', {
        method: 'POST',
        body: { username: 'weakpass', password: 'short123', role: 'operator' },
    });
    assert.equal(weak.status, 400);
    assert.match((await weak.json()).error, /al menos 12 caracteres/i);

    const tooLong = await request('/api/admins', {
        method: 'POST',
        body: { username: 'toolongpass', password: 'a'.repeat(73), role: 'operator' },
    });
    assert.equal(tooLong.status, 400);
    assert.match((await tooLong.json()).error, /72 bytes/i);

    const unsafe = await request('/api/admins', {
        method: 'POST',
        body: { username: 'bad user', password: 'correct-password', role: 'operator' },
    });
    assert.equal(unsafe.status, 400);
    assert.match((await unsafe.json()).error, /letras, números/i);

    const duplicate = await request('/api/admins', {
        method: 'POST',
        body: { username: 'OWNER', password: 'correct-password', role: 'operator' },
    });
    assert.equal(duplicate.status, 400);
    assert.match((await duplicate.json()).error, /usuario ya existe/i);

    const ownerWithoutConfirmation = await request('/api/admins', {
        method: 'POST',
        body: { username: 'owner-without-confirm', password: 'correct-password', role: 'owner' },
    });
    assert.equal(ownerWithoutConfirmation.status, 400);
    assert.match((await ownerWithoutConfirmation.json()).error, /confirmación explícita/i);

    const ownerWithConfirmation = await request('/api/admins', {
        method: 'POST',
        body: { username: 'owner-with-confirm', password: 'correct-password', role: 'owner', confirmation: 'OWNER owner-with-confirm' },
    });
    assert.equal(ownerWithConfirmation.status, 200);

    const adminsAfterOwnerCreate = await readAdminsFixture();
    const confirmedOwner = adminsAfterOwnerCreate.find(admin => admin.username === 'owner-with-confirm');
    assert.ok(confirmedOwner);
    const cleanupOwner = await request(`/api/admins/${confirmedOwner.id}`, {
        method: 'DELETE',
        body: { confirmation: 'owner-with-confirm' },
    });
    assert.equal(cleanupOwner.status, 200);
});

test('admin mutation routes reject malformed admin ids', async () => {
    for (const pathname of [
        '/api/admins/bad%20id',
        `/api/admins/${'a'.repeat(200)}`,
    ]) {
        const patch = await request(pathname, {
            method: 'PATCH',
            body: { role: 'viewer' },
        });
        assert.equal(patch.status, 400, `${pathname} should reject malformed admin id on PATCH`);
        const patchBody = await patch.json();
        assert.match(patchBody.error, /admin id/i);
        assert.match(patchBody.error, /parámetro/i);
        assert.doesNotMatch(patchBody.error, /invalid/i);

        const del = await request(pathname, {
            method: 'DELETE',
        });
        assert.equal(del.status, 400, `${pathname} should reject malformed admin id on DELETE`);
        const deleteBody = await del.json();
        assert.match(deleteBody.error, /admin id/i);
        assert.match(deleteBody.error, /parámetro/i);
        assert.doesNotMatch(deleteBody.error, /invalid/i);
    }
});

test('admin updates invalidate old sessions and protect the final owner', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'patch-target', password: 'correct-password', role: 'operator' },
    });
    assert.equal(created.status, 200);
    const oldClient = await createClient('patch-target');

    const adminsBefore = await readAdminsFixture();
    const patchTarget = adminsBefore.find(admin => admin.username === 'patch-target');
    assert.ok(patchTarget);
    assert.equal(patchTarget.sessionVersion || 0, 0);

    const updated = await request(`/api/admins/${patchTarget.id}`, {
        method: 'PATCH',
        body: { username: 'patch-target-renamed', password: 'updated-password', role: 'viewer' },
    });
    assert.equal(updated.status, 400);
    assert.match((await updated.json()).error, /cambios de rol requieren confirmación explícita/i);

    const resetWithoutConfirmation = await request(`/api/admins/${patchTarget.id}`, {
        method: 'PATCH',
        body: { password: 'updated-password' },
    });
    assert.equal(resetWithoutConfirmation.status, 400);
    assert.match((await resetWithoutConfirmation.json()).error, /reseteos de contraseña requieren confirmación explícita/i);

    const updatedWithConfirmation = await request(`/api/admins/${patchTarget.id}`, {
        method: 'PATCH',
        body: { username: 'patch-target-renamed', password: 'updated-password', role: 'viewer', confirmation: 'ROL patch-target-renamed' },
    });
    assert.equal(updatedWithConfirmation.status, 200);
    const updatedBody = await updatedWithConfirmation.json();
    assert.equal(updatedBody.admin.username, 'patch-target-renamed');
    assert.equal(updatedBody.admin.role, 'viewer');

    const adminsAfter = await readAdminsFixture();
    const patched = adminsAfter.find(admin => admin.id === patchTarget.id);
    assert.equal(patched.sessionVersion, 1);
    assert.equal(await bcrypt.compare('updated-password', patched.password), true);

    const oldSession = await request('/api/auth/verify', {}, oldClient);
    assert.equal(oldSession.status, 401);

    const oldLogin = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'patch-target-renamed', password: 'correct-password' },
    });
    assert.equal(oldLogin.status, 400);

    const newClient = await createClient('patch-target-renamed', 'updated-password');
    const newSession = await request('/api/auth/verify', {}, newClient);
    assert.equal(newSession.status, 200);
    assert.equal((await newSession.json()).user.role, 'viewer');

    const tooLongPassword = await request(`/api/admins/${patchTarget.id}`, {
        method: 'PATCH',
        body: { password: 'b'.repeat(73) },
    });
    assert.equal(tooLongPassword.status, 400);
    assert.match((await tooLongPassword.json()).error, /72 bytes/i);

    const downgradeFinalOwner = await request('/api/admins/owner-1', {
        method: 'PATCH',
        body: { role: 'operator' },
    });
    assert.equal(downgradeFinalOwner.status, 400);
    assert.match((await downgradeFinalOwner.json()).error, /último owner/i);
});

test('admins can change their own password and invalidate old sessions', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'self-password', password: 'correct-password', role: 'operator' },
    });
    assert.equal(created.status, 200);

    const oldClient = await createClient('self-password');
    const secondOldClient = await createClient('self-password');

    const wrongCurrent = await request('/api/auth/password', {
        method: 'POST',
        body: { currentPassword: 'wrong-password', newPassword: 'updated-password' },
    }, oldClient);
    assert.equal(wrongCurrent.status, 400);
    assert.match((await wrongCurrent.json()).error, /contraseña actual no es correcta/i);

    const weakPassword = await request('/api/auth/password', {
        method: 'POST',
        body: { currentPassword: 'correct-password', newPassword: 'short' },
    }, oldClient);
    assert.equal(weakPassword.status, 400);
    assert.match((await weakPassword.json()).error, /al menos 12 caracteres/i);

    const tooLongPassword = await request('/api/auth/password', {
        method: 'POST',
        body: { currentPassword: 'correct-password', newPassword: 'c'.repeat(73) },
    }, oldClient);
    assert.equal(tooLongPassword.status, 400);
    assert.match((await tooLongPassword.json()).error, /72 bytes/i);

    const updated = await request('/api/auth/password', {
        method: 'POST',
        body: { currentPassword: 'correct-password', newPassword: 'updated-password' },
    }, oldClient);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).message, 'Contraseña actualizada');
    assert.ok(cookiePairs(updated.headers['set-cookie']).some(cookie => cookie.startsWith('session=')));
    assert.match(updated.headers['set-cookie'].join('\n'), /session=.*Max-Age=86400/i);
    assert.match(updated.headers['set-cookie'].join('\n'), /session=.*Priority=High/i);

    const staleVerify = await request('/api/auth/verify', {}, secondOldClient);
    assert.equal(staleVerify.status, 401);

    const oldLogin = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'self-password', password: 'correct-password' },
    });
    assert.equal(oldLogin.status, 400);

    const newClient = await createClient('self-password', 'updated-password');
    const newVerify = await request('/api/auth/verify', {}, newClient);
    assert.equal(newVerify.status, 200);
    assert.equal((await newVerify.json()).user.role, 'operator');
});

test('self-service password changes fail before mutation when audit log is malformed', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'audit-password', password: 'correct-password', role: 'operator' },
    });
    assert.equal(created.status, 200);

    const auditBlockedClient = await createClient('audit-password');
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');

    try {
        await fs.writeFile(auditPath, '{"logs":');
        const blocked = await request('/api/auth/password', {
            method: 'POST',
            body: { currentPassword: 'correct-password', newPassword: 'updated-password' },
        }, auditBlockedClient);
        assert.equal(blocked.status, 500);
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
    }

    const oldPasswordStillWorks = await createClient('audit-password');
    const newPasswordRejected = await httpRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'audit-password', password: 'updated-password' },
    });
    assert.equal(newPasswordRejected.status, 400);
    const verify = await request('/api/auth/verify', {}, oldPasswordStillWorks);
    assert.equal(verify.status, 200);
});

test('player and RCON actions reject invalid map or command before RCON', async () => {
    const steamId = '76561198111111111';
    const invalidMapCases = [{
        path: '/api/players/kick',
        client: globalThis.operatorClient,
        body: { steamId, mapId: 'not-a-map' },
    }, {
        path: '/api/players/ban',
        client: globalThis.operatorClient,
        body: { steamId, playerName: 'Player', reason: 'Reason', mapId: 'not-a-map' },
    }, {
        path: '/api/players/unban',
        client: globalThis.operatorClient,
        body: { steamId, mapId: 'not-a-map' },
    }, {
        path: '/api/players/message',
        client: globalThis.operatorClient,
        body: { steamId, message: 'hello', mapId: 'not-a-map' },
    }, {
        path: '/api/players/broadcast',
        client: globalThis.operatorClient,
        body: { message: 'hello', mapId: 'not-a-map' },
    }, {
        path: '/api/rcon/command',
        client: globalThis.ownerClient,
        body: { command: 'ListPlayers', mapId: 'not-a-map' },
    }];

    for (const testCase of invalidMapCases) {
        const res = await request(testCase.path, {
            method: 'POST',
            body: testCase.body,
        }, testCase.client);
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /mapId inválido/i);
    }

    const missingMapCases = [{
        path: '/api/players/kick',
        client: globalThis.operatorClient,
        body: { steamId },
    }, {
        path: '/api/players/ban',
        client: globalThis.operatorClient,
        body: { steamId, playerName: 'Player', reason: 'Reason' },
    }, {
        path: '/api/players/unban',
        client: globalThis.operatorClient,
        body: { steamId },
    }, {
        path: '/api/players/message',
        client: globalThis.operatorClient,
        body: { steamId, message: 'hello' },
    }, {
        path: '/api/players/broadcast',
        client: globalThis.operatorClient,
        body: { message: 'hello' },
    }, {
        path: '/api/rcon/command',
        client: globalThis.ownerClient,
        body: { command: 'ListPlayers' },
    }];

    for (const testCase of missingMapCases) {
        const res = await request(testCase.path, {
            method: 'POST',
            body: testCase.body,
        }, testCase.client);
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /mapId es obligatorio/i);
    }

    const missingLiveMap = await request('/api/server/live', {}, globalThis.operatorClient);
    assert.equal(missingLiveMap.status, 400);
    assert.match((await missingLiveMap.json()).error, /mapId es obligatorio/i);

    const controlChars = await request('/api/rcon/command', {
        method: 'POST',
        body: { command: 'ListPlayers\nBroadcast injected', mapId: 'ragnarok' },
    });
    assert.equal(controlChars.status, 400);
    assert.match((await controlChars.json()).error, /comando inválido/i);

    for (const path of ['/api/players/message', '/api/players/broadcast']) {
        const res = await request(path, {
            method: 'POST',
            body: path.includes('message')
                ? { steamId: '76561198222222222', message: 'hello\nDoExit', mapId: 'ragnarok' }
                : { message: 'hello\nDoExit', mapId: 'ragnarok' },
        }, globalThis.operatorClient);
        assert.equal(res.status, 400);
        assert.match((await res.json()).error, /mensaje inválido/i);
    }
});

test('RCON and in-game admin mutations fail before side effects when audit log is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');
    const originalIngameAdmins = await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8');
    const startingRconCalls = globalThis.rconCalls.length;
    const steamId = '76561198233333333';

    try {
        await fs.writeFile(auditPath, '{"logs":');

        const kick = await request('/api/players/kick', {
            method: 'POST',
            body: { steamId, reason: 'audit outage', mapId: 'ragnarok' },
        }, globalThis.operatorClient);
        assert.equal(kick.status, 500);

        const rcon = await request('/api/rcon/command', {
            method: 'POST',
            body: { command: 'Broadcast audit outage', mapId: 'ragnarok' },
        }, globalThis.ownerClient);
        assert.equal(rcon.status, 500);

        const grant = await request('/api/players/make-admin', {
            method: 'POST',
            body: { steamId, playerName: 'Audit Blocked' },
        }, globalThis.ownerClient);
        assert.equal(grant.status, 500);

        assert.equal(globalThis.rconCalls.length, startingRconCalls);
        assert.equal(await fs.readFile(globalThis.fixture.ingameAdmins, 'utf8'), originalIngameAdmins);
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
    }
});

test('player and RCON actions execute against configured map host with sanitized state', async () => {
    globalThis.rconCalls.length = 0;
    const steamId = '76561198222222222';

    const kick = await request('/api/players/kick', {
        method: 'POST',
        body: { steamId, reason: `line1\n${'x'.repeat(700)}`, mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(kick.status, 200);
    assert.deepEqual(await kick.json(), { message: 'Jugador expulsado' });

    const message = await request('/api/players/message', {
        method: 'POST',
        body: { steamId, message: 'hello there', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(message.status, 200);
    assert.deepEqual(await message.json(), { message: 'Mensaje enviado' });

    const broadcast = await request('/api/players/broadcast', {
        method: 'POST',
        body: { message: 'cluster notice', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(broadcast.status, 200);
    assert.deepEqual(await broadcast.json(), { message: 'Anuncio enviado' });

    const firstBan = await request('/api/players/ban', {
        method: 'POST',
        body: { steamId, playerName: 'Test\nPlayer', reason: 'first\nreason', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(firstBan.status, 200);
    assert.deepEqual(await firstBan.json(), { message: 'Jugador baneado' });

    const secondBan = await request('/api/players/ban', {
        method: 'POST',
        body: { steamId, playerName: 'Test Player 2', reason: 'second reason', mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(secondBan.status, 200);
    assert.deepEqual(await secondBan.json(), { message: 'Jugador baneado' });

    const rcon = await request('/api/rcon/command', {
        method: 'POST',
        body: { command: 'Broadcast ServerAdminPassword=super-secret', mapId: 'ragnarok' },
    });
    assert.equal(rcon.status, 200);
    assert.equal((await rcon.json()).response, 'ok:Broadcast ServerAdminPassword=super-secret');

    const unban = await request('/api/players/unban', {
        method: 'POST',
        body: { steamId, mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(unban.status, 200);
    assert.deepEqual(await unban.json(), { message: 'Jugador desbaneado' });

    const missingUnban = await request('/api/players/unban', {
        method: 'POST',
        body: { steamId, mapId: 'ragnarok' },
    }, globalThis.operatorClient);
    assert.equal(missingUnban.status, 404);
    assert.match((await missingUnban.json()).error, /ban activo/i);

    const connectCalls = globalThis.rconCalls.filter(call => call.type === 'connect');
    assert.ok(connectCalls.length >= 7);
    assert.ok(connectCalls.every(call => call.options.host === '10.0.0.5'));
    assert.ok(connectCalls.every(call => call.options.port === 27020));

    const sentCommands = globalThis.rconCalls.filter(call => call.type === 'send').map(call => call.command);
    assert.ok(sentCommands.includes(`KickPlayer ${steamId}`));
    assert.ok(sentCommands.includes(`ServerChatTo "${steamId}" hello there`));
    assert.ok(sentCommands.includes('Broadcast cluster notice'));
    assert.ok(sentCommands.includes(`BanPlayer ${steamId}`));
    assert.ok(sentCommands.includes(`UnbanPlayer ${steamId}`));
    assert.ok(sentCommands.includes('Broadcast ServerAdminPassword=super-secret'));

    const bans = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'bans.json'), 'utf8'));
    const matchingBans = bans.filter(ban => ban.steamId === steamId);
    assert.equal(matchingBans.length, 1);
    assert.equal(matchingBans.filter(ban => ban.active).length, 0);
    assert.equal(matchingBans[0].reason, 'second reason');
    assert.equal(matchingBans[0].mapId, 'ragnarok');
    assert.equal(matchingBans[0].unbannedBy, 'operator');

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    const kickAudit = audit.find(entry => entry.action === 'PLAYER_KICK' && entry.details.includes(steamId));
    assert.ok(kickAudit);
    assert.doesNotMatch(kickAudit.details, /[\r\n]/);
    assert.ok(kickAudit.details.length < 650);
    const rconAudit = audit.find(entry => entry.action === 'RCON_COMMAND' && entry.details.includes('Broadcast'));
    assert.ok(rconAudit);
    assert.match(rconAudit.details, /ServerAdminPassword=\[REDACTED\]/);
    assert.doesNotMatch(rconAudit.details, /super-secret/);
});

test('online players endpoint returns parsed fields without raw RCON output', async () => {
    const originalConnect = Rcon.connect;
    const settingsPath = globalThis.fixture.gameUserSettings;
    const originalSettings = await fs.readFile(settingsPath, 'utf8');
    await fs.writeFile(settingsPath, globalThis.serverModule.updateIniKey(originalSettings, 'ServerSettings', 'RCONEnabled', 'True'));
    Rcon.connect = async () => ({
        on() {},
        async send(command) {
            assert.equal(command, 'ListPlayers');
            return '0. Player One, 76561198222222222\n1. Player Two, 76561198333333333';
        },
        end() {},
    });

    try {
        const res = await request('/api/players/online?mapId=ragnarok', {}, globalThis.operatorClient);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.raw, undefined);
        assert.equal(body.players.length, 2);
        assert.deepEqual(body.players[0], {
            name: 'Player One',
            steamId: '76561198222222222',
            mapId: 'ragnarok',
            mapName: 'Ragnarok',
        });
        assert.equal(body.players[1].raw, undefined);
        assert.equal(body.complete, true);
        assert.equal(body.per_map[0].status, 'queried');
        assert.equal(body.source, 'rcon_listplayers');
    } finally {
        Rcon.connect = originalConnect;
        await fs.writeFile(settingsPath, originalSettings);
    }
});

test('RCON commands timeout and are serialized per map', async () => {
    const { execRcon } = globalThis.serverModule;
    const originalConnect = Rcon.connect;

    try {
        globalThis.rconCalls.length = 0;
        await assert.rejects(execRcon('ListPlayers'), /mapId es obligatorio/i);
        await assert.rejects(execRcon('ListPlayers', 'not-a-map'), /mapId inválido/i);
        await assert.rejects(execRcon('ListPlayers\nDoExit', 'ragnarok'), /comando inválido/i);
        assert.deepEqual(globalThis.rconCalls, []);

        Rcon.connect = async () => ({
            on() {},
            send() {
                return new Promise(() => {});
            },
            end() {},
        });
        await assert.rejects(execRcon('ListPlayers', 'ragnarok'), /timed out/i);

        let activeSends = 0;
        let maxActiveSends = 0;
        const sent = [];
        Rcon.connect = async () => ({
            on() {},
            async send(command) {
                activeSends += 1;
                maxActiveSends = Math.max(maxActiveSends, activeSends);
                sent.push(command);
                await new Promise(resolve => setTimeout(resolve, 15));
                activeSends -= 1;
                return `ok:${command}`;
            },
            end() {},
        });

        const [first, second] = await Promise.all([
            execRcon('FirstCommand', 'ragnarok'),
            execRcon('SecondCommand', 'ragnarok'),
        ]);
        assert.equal(first, 'ok:FirstCommand');
        assert.equal(second, 'ok:SecondCommand');
        assert.equal(maxActiveSends, 1);
        assert.deepEqual(sent, ['FirstCommand', 'SecondCommand']);
    } finally {
        Rcon.connect = originalConnect;
    }
});

test('manual RCON route truncates oversized responses for the browser', async () => {
    const originalConnect = Rcon.connect;
    const largeResponse = 'r'.repeat(70000);

    try {
        Rcon.connect = async () => ({
            on() {},
            async send() {
                return largeResponse;
            },
            end() {},
        });

        const res = await request('/api/rcon/command', {
            method: 'POST',
            body: { command: 'ListPlayers', mapId: 'ragnarok' },
        }, globalThis.ownerClient);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.response.length, 65536);
        assert.equal(body.responseTruncated, true);
        assert.equal(body.originalLength, largeResponse.length);
    } finally {
        Rcon.connect = originalConnect;
    }
});

test('sensitive player/admin read routes require operator role', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'readonly-viewer', password: 'correct-password', role: 'viewer' },
    });
    assert.equal(created.status, 200);
    const viewerClient = await createClient('readonly-viewer');

    for (const pathname of [
        '/api/players/history',
        '/api/players/online',
        '/api/players/bans',
        '/api/players/ingame-admins',
        '/api/server/logs?mapId=ragnarok',
        '/api/audit/log',
        '/api/system/health',
        '/api/plugins/status',
        '/api/orchestrator/readiness',
        '/api/tasks',
        '/api/nodes',
        '/api/presets',
    ]) {
        const res = await request(pathname, {}, viewerClient);
        assert.equal(res.status, 403);
    }

    const operatorHistory = await request('/api/players/history', {}, globalThis.operatorClient);
    assert.equal(operatorHistory.status, 200);
    for (const pathname of [
        '/api/players/ingame-admins',
        '/api/server/logs?mapId=ragnarok',
        '/api/audit/log',
        '/api/plugins/status',
        '/api/orchestrator/readiness',
        '/api/plugins/obelisk/logs?instance=arkserver&lines=20',
    ]) {
        const res = await request(pathname, {}, globalThis.operatorClient);
        assert.equal(res.status, 403, `${pathname} should require owner role`);
    }
    const operatorHealth = await request('/api/system/health', {}, globalThis.operatorClient);
    assert.equal(operatorHealth.status, 403);
    const ownerHealth = await request('/api/system/health', {}, globalThis.ownerClient);
    assert.equal(ownerHealth.status, 200);
    const ownerHealthBody = await ownerHealth.json();
    assert.ok(Array.isArray(ownerHealthBody.readiness.checks));
    assert.match(ownerHealthBody.readiness.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'data_dir')?.status, 'ok');
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'data_state_files')?.status, 'warn');
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'data_backups')?.status, 'warn');
    assert.match(ownerHealthBody.readiness.checks.find(check => check.id === 'data_backups')?.detail || '', /backups/i);
    assert.match(ownerHealthBody.readiness.checks.find(check => check.id === 'data_state_files')?.remediation || '', /chmod 700/i);
    assert.match(ownerHealthBody.readiness.checks.find(check => check.id === 'data_backups')?.remediation || '', /backup/i);
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'data_dir')?.remediation, undefined);
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'client_assets')?.status, 'ok');
    assert.match(ownerHealthBody.readiness.checks.find(check => check.id === 'client_assets')?.detail || '', /Assets de producción presentes/);
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'cluster_maps')?.status, 'ok');
    assert.equal(ownerHealthBody.readiness.checks.find(check => check.id === 'owner_account')?.status, 'ok');
});

test('audit log read fails closed when audit state is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const original = await fs.readFile(auditPath, 'utf8');

    try {
        await fs.writeFile(auditPath, '{"logs":');
        const res = await request('/api/audit/log', {}, globalThis.ownerClient);
        assert.equal(res.status, 500);
        assert.equal((await res.json()).error, 'No se pudo leer el log de auditoría');
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, original);
    }
});

test('admin mutations fail before changing state when audit log is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');
    const adminsBefore = await readAdminsFixture();

    try {
        await fs.writeFile(auditPath, '{"logs":');
        const res = await request('/api/admins', {
            method: 'POST',
            body: { username: 'audit-blocked-admin', password: 'correct-password', role: 'operator' },
        }, globalThis.ownerClient);

        assert.equal(res.status, 500);
        assert.match((await res.json()).error, /error del servidor|audit/i);
        const adminsAfter = await readAdminsFixture();
        assert.deepEqual(
            adminsAfter.map(admin => admin.username).sort(),
            adminsBefore.map(admin => admin.username).sort()
        );
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
    }
});

test('audit log pagination rejects malformed numeric query parameters', async () => {
    for (const pathname of [
        '/api/audit/log?page=1abc',
        '/api/audit/log?page=0',
        '/api/audit/log?limit=50evil',
        '/api/audit/log?limit=101',
    ]) {
        const res = await request(pathname, {}, globalThis.ownerClient);
        assert.equal(res.status, 400, `${pathname} should reject malformed pagination`);
        const body = await res.json();
        assert.match(body.error, /page|limit/i);
        assert.match(body.error, /parámetro|entre/i);
        assert.doesNotMatch(body.error, /invalid|must be between/i);
    }
});

test('audit log filters reject malformed values', async () => {
    for (const pathname of [
        '/api/audit/log?action=LOGIN_FAILED%0A',
        `/api/audit/log?action=${'A'.repeat(81)}`,
        '/api/audit/log?action=LOGIN%20FAILED',
        '/api/audit/log?admin=owner%0A',
        `/api/audit/log?admin=${'a'.repeat(65)}`,
        '/api/audit/log?admin=../owner',
    ]) {
        const res = await request(pathname, {}, globalThis.ownerClient);
        assert.equal(res.status, 400, `${pathname} should reject malformed audit filters`);
        const body = await res.json();
        assert.match(body.error, /action|admin/i);
        assert.match(body.error, /parámetro/i);
        assert.doesNotMatch(body.error, /invalid/i);
    }
});

test('server log route requires explicit map id and strict line counts', async () => {
    const missingMap = await request('/api/server/logs', {}, globalThis.ownerClient);
    assert.equal(missingMap.status, 400);
    assert.match((await missingMap.json()).error, /mapId es obligatorio/i);

    const malformedLines = await request('/api/server/logs?mapId=ragnarok&lines=20junk', {}, globalThis.ownerClient);
    assert.equal(malformedLines.status, 400);
    const malformedLinesBody = await malformedLines.json();
    assert.match(malformedLinesBody.error, /lines/i);
    assert.match(malformedLinesBody.error, /parámetro/i);
    assert.doesNotMatch(malformedLinesBody.error, /invalid/i);

    const outsideLog = path.join(globalThis.fixture.root, 'outside-readable-log.txt');
    await fs.writeFile(outsideLog, 'outside secret log\n');
    await fs.rm(globalThis.fixture.logPath, { force: true });
    await fs.symlink(outsideLog, globalThis.fixture.logPath);
    const symlinkedLog = await request('/api/server/logs?mapId=ragnarok&lines=20', {}, globalThis.ownerClient);
    assert.equal(symlinkedLog.status, 400);
    assert.match((await symlinkedLog.json()).error, /symlink/i);
    await fs.rm(globalThis.fixture.logPath, { force: true });
    await fs.writeFile(globalThis.fixture.logPath, 'restored log\n');
});

test('cluster map metadata hides ports from viewer roles', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'map-viewer', password: 'correct-password', role: 'viewer' },
    });
    assert.equal(created.status, 200);
    const viewerClient = await createClient('map-viewer');

    const viewerMaps = await request('/api/cluster/maps', {}, viewerClient);
    assert.equal(viewerMaps.status, 200);
    const viewerMap = (await viewerMaps.json()).maps[0];
    assert.equal(viewerMap.id, 'ragnarok');
    assert.equal(viewerMap.gamePort, undefined);
    assert.equal(viewerMap.queryPort, undefined);
    assert.equal(viewerMap.rconPort, undefined);

    const operatorMaps = await request('/api/cluster/maps', {}, globalThis.operatorClient);
    assert.equal(operatorMaps.status, 200);
    const operatorMap = (await operatorMaps.json()).maps[0];
    assert.equal(operatorMap.rconPort, 27020);
});

test('viewer status payloads omit host and process diagnostics', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'status-viewer', password: 'correct-password', role: 'viewer' },
    });
    assert.equal(created.status, 200);
    const viewerClient = await createClient('status-viewer');
    const beforeViewerRcon = globalThis.rconCalls.length;

    const cluster = await request('/api/cluster/status', {}, viewerClient);
    assert.equal(cluster.status, 200);
    const clusterBody = await cluster.json();
    assert.equal(clusterBody.cpu, undefined);
    assert.equal(clusterBody.ram, undefined);
    assert.ok(Array.isArray(clusterBody.maps));
    assert.equal(clusterBody.maps[0].cpu, undefined);
    assert.equal(clusterBody.maps[0].ram, undefined);
    assert.deepEqual(clusterBody.maps[0].playerList, []);

    const live = await request('/api/server/live?mapId=ragnarok', {}, viewerClient);
    assert.equal(live.status, 200);
    const liveBody = await live.json();
    assert.equal(liveBody.cpu, undefined);
    assert.equal(liveBody.ram, undefined);
    assert.equal(liveBody.sysCpu, undefined);
    assert.equal(liveBody.sysRam, undefined);
    assert.deepEqual(liveBody.playerList, []);
    assert.equal(globalThis.rconCalls.length, beforeViewerRcon);

    const operatorLive = await request('/api/server/live?mapId=ragnarok', {}, globalThis.operatorClient);
    assert.equal(operatorLive.status, 200);
    const operatorLiveBody = await operatorLive.json();
    assert.equal(typeof operatorLiveBody.sysCpu, 'number');
    assert.equal(typeof operatorLiveBody.sysRam, 'number');
});

test('status error payloads preserve viewer redaction contracts', () => {
    const { publicClusterStatusErrorForUser, publicLiveStatusErrorForUser } = globalThis.serverModule;

    const viewerCluster = publicClusterStatusErrorForUser({ role: 'viewer' });
    assert.deepEqual(viewerCluster, { maps: [], error: 'Estado del cluster no disponible' });

    const viewerLive = publicLiveStatusErrorForUser({ role: 'viewer' });
    assert.equal(viewerLive.status, 'error');
    assert.equal(viewerLive.error, 'Estado del mapa no disponible');
    assert.equal(viewerLive.map, 'Desconocido');
    assert.equal(viewerLive.cpu, undefined);
    assert.equal(viewerLive.ram, undefined);
    assert.equal(viewerLive.sysCpu, undefined);
    assert.equal(viewerLive.sysRam, undefined);
    assert.deepEqual(viewerLive.playerList, []);

    const operatorCluster = publicClusterStatusErrorForUser({ role: 'operator' });
    assert.equal(operatorCluster.error, 'Estado del cluster no disponible');
    assert.equal(operatorCluster.cpu, 0);
    assert.equal(operatorCluster.ram, 0);

    const operatorLive = publicLiveStatusErrorForUser({ role: 'operator' });
    assert.equal(operatorLive.error, 'Estado del mapa no disponible');
    assert.equal(operatorLive.cpu, 0);
    assert.equal(operatorLive.ram, 0);
    assert.equal(operatorLive.sysCpu, 0);
    assert.equal(operatorLive.sysRam, 0);
    assert.deepEqual(operatorLive.playerList, []);
});

test('ban helpers keep only one active ban and deactivate every active duplicate', () => {
    const { upsertActiveBan, deactivateActiveBans, sanitizeAuditText, sanitizeAuditDetails } = globalThis.serverModule;
    const steamId = '76561198999999999';
    const first = upsertActiveBan([], {
        id: 'ban-1',
        steamId,
        playerName: sanitizeAuditText('Name\nInjected', 'Unknown', 64),
        reason: sanitizeAuditText('Reason\rInjected', 'No reason specified', 500),
        active: true,
    });
    const second = upsertActiveBan(first, {
        id: 'ban-2',
        steamId,
        playerName: 'Updated',
        reason: 'Updated reason',
        active: true,
    });

    assert.equal(second.filter(ban => ban.steamId === steamId && ban.active).length, 1);
    assert.equal(second[0].id, 'ban-1');
    assert.equal(second[0].reason, 'Updated reason');
    assert.equal(sanitizeAuditText('x\n\r\t y', 'fallback', 10), 'x y');
    assert.equal(
        sanitizeAuditDetails('ServerAdminPassword=topsecret token: abcdefghijklmnopqrstuvwxyz Bearer abcdefghijklmnopqrstuvwxyz Discord https://discord.com\x2fapi/webhooks/123/secret'),
        'ServerAdminPassword=[REDACTED] token=[REDACTED] Bearer [REDACTED] Discord https://discord.com\x2fapi/webhooks/[REDACTED]'
    );

    const duplicated = [...second, { id: 'legacy-duplicate', steamId, active: true }];
    const deactivated = deactivateActiveBans(duplicated, steamId, 'owner');
    assert.equal(deactivated.filter(ban => ban.steamId === steamId && ban.active).length, 0);
    assert.equal(deactivated.filter(ban => ban.steamId === steamId && ban.unbannedBy === 'owner').length, 2);
});

test('deploy capabilities are owner-only and incomplete actions report not implemented', async () => {
    const operatorCapabilities = await request('/api/deploy/capabilities', {}, globalThis.operatorClient);
    assert.equal(operatorCapabilities.status, 403);
    assert.equal((await operatorCapabilities.json()).error, 'Permisos insuficientes');

    const capabilities = await request('/api/deploy/capabilities', {}, globalThis.ownerClient);
    assert.equal(capabilities.status, 200);
    const capabilitiesBody = await capabilities.json();
    assert.ok(['linux', 'windows', 'other'].includes(capabilitiesBody.capabilities.host.family));
    assert.equal(capabilitiesBody.capabilities.host.platform, process.platform);
    assert.equal(capabilitiesBody.capabilities.deploymentTargets.linux.runtime, 'Obelisk');
    assert.equal(capabilitiesBody.capabilities.deploymentTargets.windows.runtime, 'ArkApi');
    assert.equal(capabilitiesBody.capabilities.deploymentTargets.linux.current, process.platform === 'linux');
    assert.equal(capabilitiesBody.capabilities.deploymentTargets.windows.current, process.platform === 'win32');
    assert.equal(capabilitiesBody.capabilities.deployStart.available, false);
    assert.equal(capabilitiesBody.capabilities.deployStart.minRole, 'owner');
    assert.ok(capabilitiesBody.capabilities.deployStart.platforms.includes('linux'));
    assert.ok(capabilitiesBody.capabilities.deployStart.platforms.includes('windows'));
    assert.equal(capabilitiesBody.capabilities.permissions.catalog['deploy.view'].minRole, 'owner');
    assert.equal(capabilitiesBody.capabilities.permissions.catalog['orchestrator.view'].minRole, 'owner');
    assert.equal(capabilitiesBody.capabilities.permissions.catalog['orchestrator.configure'].minRole, 'owner');
    assert.equal(capabilitiesBody.capabilities.nativeOrchestrator.available, false);
    assert.equal(capabilitiesBody.capabilities.nativeOrchestrator.mode, 'planning');
    assert.equal(capabilitiesBody.capabilities.nativeOrchestrator.layoutStrategy, 'shared-serverfiles');
    assert.match(capabilitiesBody.capabilities.nativeOrchestrator.workshopWarning, /Epic Games/);
    assert.ok(capabilitiesBody.capabilities.permissions.roleDefaults.owner.includes('wipe.execute'));
    assert.ok(capabilitiesBody.capabilities.permissions.roleDefaults.owner.includes('orchestrator.configure'));
    assert.equal(capabilitiesBody.capabilities.maintenance.clear_logs.available, true);
    assert.equal(capabilitiesBody.capabilities.maintenance.clear_logs.targetCount, 1);
    assert.equal(capabilitiesBody.capabilities.maintenance.clear_logs.destructive, true);
    assert.ok(capabilitiesBody.capabilities.maintenance.clear_logs.platforms.includes('linux'));
    assert.equal(capabilitiesBody.capabilities.maintenance.clear_logs.confirmation, 'TRUNCAR LOGS');
    assert.equal(capabilitiesBody.capabilities.maintenance.wipe_db.destructive, true);
    assert.equal(capabilitiesBody.capabilities.wipe.modes.full.available, false);
    assert.equal(capabilitiesBody.capabilities.wipe.modes.full.confirmation, 'WIPE FULL');
    assert.equal(capabilitiesBody.capabilities.wipe.modes.characters.minPermission, 'wipe.execute');

    const noLogCapabilities = globalThis.serverModule.buildDeployCapabilities([{ id: 'ragnarok' }]);
    assert.equal(noLogCapabilities.maintenance.clear_logs.available, false);
    assert.equal(noLogCapabilities.maintenance.clear_logs.targetCount, 0);
    assert.match(noLogCapabilities.maintenance.clear_logs.reason, /No hay rutas de logs ARK gestionadas/);

    const operatorDeploy = await request('/api/deploy/start', {
        method: 'POST',
        body: { clusterName: 'new-map', osType: 'linux', installApi: true },
    }, globalThis.operatorClient);
    assert.equal(operatorDeploy.status, 403);

    const deploy = await request('/api/deploy/start', {
        method: 'POST',
        body: { clusterName: 'new-map', osType: 'linux', installApi: true },
    }, globalThis.ownerClient);
    assert.equal(deploy.status, 501);
    assert.match((await deploy.json()).error, /no está implementado/i);

    const bodylessDeploy = await request('/api/deploy/start', {
        method: 'POST',
    }, globalThis.ownerClient);
    assert.equal(bodylessDeploy.status, 501);
    assert.match((await bodylessDeploy.json()).error, /no está implementado/i);

    const noisyDeploy = await request('/api/deploy/start', {
        method: 'POST',
        body: { clusterName: `cluster\n${'x'.repeat(120)}`, osType: 'linux\rprod', installApi: false },
    }, globalThis.ownerClient);
    assert.equal(noisyDeploy.status, 501);

    const operatorValidate = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'validate_steamcmd' },
    }, globalThis.operatorClient);
    assert.equal(operatorValidate.status, 403);

    const validate = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'validate_steamcmd' },
    }, globalThis.ownerClient);
    assert.equal(validate.status, 501);
    assert.match((await validate.json()).error, /no está conectada/i);

    const wipe = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'wipe_db' },
    }, globalThis.ownerClient);
    assert.equal(wipe.status, 501);
    assert.match((await wipe.json()).error, /no está implementado/i);

    const invalid = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'unknown_action' },
    }, globalThis.operatorClient);
    assert.equal(invalid.status, 400);

    const bodylessMaintenance = await request('/api/maintenance/action', {
        method: 'POST',
    }, globalThis.operatorClient);
    assert.equal(bodylessMaintenance.status, 400);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    assert.ok(audit.some(entry => entry.action === 'DEPLOY_UNAVAILABLE' && /unsupported deployment of cluster x+ \(linux prod\)/.test(entry.details)));
    assert.ok(audit.every(entry => !/cluster\n|linux\r/.test(entry.details || '')));
});

test('native orchestrator stays in planning mode with read-only preflight and blocked actions', async t => {
    // The read-only contract must not depend on free disk space on the test host.
    let freeBytes = 100 * 1024 * 1024 * 1024;
    t.mock.method(fs, 'statfs', async () => ({ bavail: freeBytes, bsize: 1 }));
    const operatorReadiness = await request('/api/orchestrator/readiness', {}, globalThis.operatorClient);
    assert.equal(operatorReadiness.status, 403);

    const readiness = await request('/api/orchestrator/readiness', {}, globalThis.ownerClient);
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.equal(readinessBody.orchestrator.enabled, false);
    assert.equal(readinessBody.orchestrator.available, false);
    assert.equal(readinessBody.orchestrator.mode, 'planning');
    assert.equal(readinessBody.orchestrator.currentRuntime, process.platform === 'linux' ? 'Obelisk' : (process.platform === 'win32' ? 'ArkApi' : 'No soportado'));
    assert.ok(readinessBody.orchestrator.migration.blockedActions.includes('install-steamcmd'));
    assert.ok(readinessBody.orchestrator.migration.blockedActions.includes('start-instance'));
    assert.equal(readinessBody.orchestrator.migration.linuxGsmMapsDetected, 1);
    assert.equal(readinessBody.orchestrator.migration.maps[0].source.script, 'arkserver');

    const missingRoot = path.join(globalThis.fixture.root, 'native-ark');
    const preflight = await request(`/api/orchestrator/preflight?root=${encodeURIComponent(missingRoot)}`, {}, globalThis.ownerClient);
    assert.equal(preflight.status, 200);
    const preflightBody = await preflight.json();
    assert.equal(preflightBody.preflight.root, missingRoot);
    assert.equal(preflightBody.preflight.canUse, true);
    assert.ok(preflightBody.preflight.checks.some(check => check.id === 'root_directory' && check.status === 'warn'));
    assert.equal(await fs.access(missingRoot).then(() => true, () => false), false);

    freeBytes = 1024;
    const lowDisk = await request(`/api/orchestrator/preflight?root=${encodeURIComponent(missingRoot)}`, {}, globalThis.ownerClient);
    const lowDiskBody = await lowDisk.json();
    assert.equal(lowDiskBody.preflight.canUse, false);
    assert.ok(lowDiskBody.preflight.checks.some(check => check.id === 'disk_free' && check.status === 'error'));
    assert.equal(await fs.access(missingRoot).then(() => true, () => false), false);
    freeBytes = 100 * 1024 * 1024 * 1024;

    const appRootPreflight = await request(`/api/orchestrator/preflight?root=${encodeURIComponent(path.resolve(__dirname, '..'))}`, {}, globalThis.ownerClient);
    assert.equal(appRootPreflight.status, 200);
    const appRootBody = await appRootPreflight.json();
    assert.equal(appRootBody.preflight.canUse, false);
    assert.ok(appRootBody.preflight.checks.some(check => check.id === 'outside_dashboard' && check.status === 'error'));

    const save = await request('/api/orchestrator/config', {
        method: 'POST',
        body: {
            arkRoot: missingRoot,
            cluster: { id: 'flowark cluster!*' },
            workshopMods: {
                enabled: true,
                ids: ['731604991', 'bad-id', '1404697612', '731604991'],
                epicWarningAccepted: true,
            },
        },
    }, globalThis.ownerClient);
    assert.equal(save.status, 200);
    const saveBody = await save.json();
    assert.equal(saveBody.orchestrator.config.arkRoot, missingRoot);
    assert.equal(saveBody.orchestrator.config.cluster.id, 'flowarkcluster');
    assert.deepEqual(saveBody.orchestrator.config.workshopMods.ids, ['731604991', '1404697612']);
    assert.equal(saveBody.orchestrator.config.workshopMods.epicWarningAccepted, true);
    assert.equal(await fs.access(missingRoot).then(() => true, () => false), false);

    const configPath = path.join(globalThis.fixture.dataDir, 'orchestrator_config.json');
    const savedConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
    assert.equal(savedConfig.enabled, false);
    assert.equal(savedConfig.mode, 'planning');
    assert.equal(savedConfig.serverFilesStrategy, 'shared');

    const blocked = await request('/api/orchestrator/action', {
        method: 'POST',
        body: { action: 'install-steamcmd' },
    }, globalThis.ownerClient);
    assert.equal(blocked.status, 501);
    assert.match((await blocked.json()).error, /modo planificacion/i);

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    assert.ok(audit.some(entry => entry.action === 'ORCHESTRATOR_CONFIG'));
    assert.ok(audit.some(entry => entry.action === 'ORCHESTRATOR_ACTION_BLOCKED' && /install-steamcmd/.test(entry.details)));
});

test('clearing ARK logs requires owner role', async () => {
    const operatorClear = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'clear_logs' },
    }, globalThis.operatorClient);
    assert.equal(operatorClear.status, 403);
    assert.match((await operatorClear.json()).error, /rol owner/i);

    const missingConfirmation = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'clear_logs' },
    }, globalThis.ownerClient);
    assert.equal(missingConfirmation.status, 400);
    assert.match((await missingConfirmation.json()).error, /TRUNCAR LOGS/);

    await fs.writeFile(globalThis.fixture.logPath, 'line-one\nline-two\n');
    const ownerClear = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'clear_logs', confirmation: 'truncar logs' },
    }, globalThis.ownerClient);
    assert.equal(ownerClear.status, 200);
    assert.equal((await ownerClear.json()).cleared, 1);
    assert.equal(await fs.readFile(globalThis.fixture.logPath, 'utf8'), '');

    const audit = JSON.parse(await fs.readFile(path.join(globalThis.fixture.dataDir, 'audit.json'), 'utf8'));
    assert.ok(audit.some(entry => entry.action === 'MAINTENANCE' && /Cleared 1 server logs/.test(entry.details)));
});

test('clearing ARK logs refuses symlinked managed log paths', async () => {
    const outsideLog = path.join(globalThis.fixture.root, 'outside-log.txt');
    await fs.writeFile(outsideLog, 'must stay intact\n');
    await fs.rm(globalThis.fixture.logPath, { force: true });
    await fs.symlink(outsideLog, globalThis.fixture.logPath);

    const res = await request('/api/maintenance/action', {
        method: 'POST',
        body: { action: 'clear_logs', confirmation: 'TRUNCAR LOGS' },
    }, globalThis.ownerClient);
    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /No se pudieron truncar 1 de 1/i);
    assert.equal(await fs.readFile(outsideLog, 'utf8'), 'must stay intact\n');

    await fs.rm(globalThis.fixture.logPath, { force: true });
    await fs.writeFile(globalThis.fixture.logPath, 'restored log\n');
});

test('clearing ARK logs fails before truncating when audit log is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');

    try {
        await fs.writeFile(globalThis.fixture.logPath, 'audit blocked log\n');
        await fs.writeFile(auditPath, '{"logs":');
        const res = await request('/api/maintenance/action', {
            method: 'POST',
            body: { action: 'clear_logs', confirmation: 'TRUNCAR LOGS' },
        }, globalThis.ownerClient);
        assert.equal(res.status, 500);
        assert.equal(await fs.readFile(globalThis.fixture.logPath, 'utf8'), 'audit blocked log\n');
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
        await fs.writeFile(globalThis.fixture.logPath, 'restored log\n');
    }
});

test('plugin runtime status inventories Obelisk and ArkApi safely', async () => {
    const status = await request('/api/plugins/status', {}, globalThis.ownerClient);
    assert.equal(status.status, 200);
    const body = await status.json();

    assert.equal(body.runtimes.obelisk.available, true);
    assert.equal(body.runtimes.obelisk.libraries.obelisk, true);
    assert.equal(body.runtimes.obelisk.plugins[0].name, 'oBaseEvents.so');
    assert.equal(body.runtimes.obelisk.plugins[0].configExists, true);
    assert.deepEqual(body.runtimes.obelisk.instances[0].markers, ['disable-plugins']);
    assert.equal(body.runtimes.obelisk.root, undefined);
    assert.equal(body.runtimes.obelisk.rootConfigured, true);
    assert.equal(body.runtimes.arkApi.available, true);
    assert.equal(body.runtimes.arkApi.root, undefined);
    assert.equal(body.runtimes.arkApi.rootConfigured, true);
    assert.equal(body.runtimes.arkApi.supportedActions.length, 0);
});

test('plugin logs require owner role and are path constrained', async () => {
    const obeliskLogPath = path.join(globalThis.fixture.obeliskRoot, 'logs', 'arkserver', 'Obelisk.log');
    const logs = await request('/api/plugins/obelisk/logs?instance=arkserver&lines=20', {}, globalThis.ownerClient);
    assert.equal(logs.status, 200);
    assert.match((await logs.json()).content, /line-two/);

    const invalidLines = await request('/api/plugins/obelisk/logs?instance=arkserver&lines=20junk', {}, globalThis.ownerClient);
    assert.equal(invalidLines.status, 400);
    assert.match((await invalidLines.json()).error, /lines/i);

    const tooManyLines = await request('/api/plugins/obelisk/logs?instance=arkserver&lines=501', {}, globalThis.ownerClient);
    assert.equal(tooManyLines.status, 400);
    assert.match((await tooManyLines.json()).error, /lines/i);

    const invalid = await request('/api/plugins/obelisk/logs?instance=../arkserver', {}, globalThis.ownerClient);
    assert.equal(invalid.status, 400);

    const unmanaged = await request('/api/plugins/obelisk/logs?instance=unmanaged&lines=20', {}, globalThis.ownerClient);
    assert.equal(unmanaged.status, 404);

    const outsideLog = path.join(globalThis.fixture.root, 'outside-obelisk-log.txt');
    await fs.writeFile(outsideLog, 'outside runtime log\n');
    await fs.rm(obeliskLogPath, { force: true });
    await fs.symlink(outsideLog, obeliskLogPath);
    const symlinkedLog = await request('/api/plugins/obelisk/logs?instance=arkserver&lines=20', {}, globalThis.ownerClient);
    assert.equal(symlinkedLog.status, 400);
    assert.match((await symlinkedLog.json()).error, /symlink/i);
    await fs.rm(obeliskLogPath, { force: true });
    await fs.writeFile(obeliskLogPath, 'line-one\nline-two\n');
});

test('only owners can toggle supported Obelisk instance markers', async () => {
    const operator = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: true },
    }, globalThis.operatorClient);
    assert.equal(operator.status, 403);

    const invalid = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'unsafe-debug-marker', enabled: true },
    });
    assert.equal(invalid.status, 400);

    const nonBoolean = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: 'false' },
    });
    assert.equal(nonBoolean.status, 400);
    assert.match((await nonBoolean.json()).error, /boolean/i);

    const unmanaged = await request('/api/plugins/obelisk/instances/unmanaged/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: true },
    });
    assert.equal(unmanaged.status, 404);

    const markerPath = path.join(globalThis.fixture.obeliskRoot, 'state', 'instances', 'arkserver', 'enable-process-event-hook');
    const enabled = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: true },
    });
    assert.equal(enabled.status, 200);
    await fs.access(markerPath);

    const outsideMarkerTarget = path.join(globalThis.fixture.root, 'outside-marker-target.txt');
    await fs.writeFile(outsideMarkerTarget, 'must stay intact\n');
    await fs.rm(markerPath, { force: true });
    await fs.symlink(outsideMarkerTarget, markerPath);
    const symlinkMarker = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: true },
    });
    assert.equal(symlinkMarker.status, 400);
    assert.match((await symlinkMarker.json()).error, /symlink/i);
    assert.equal(await fs.readFile(outsideMarkerTarget, 'utf8'), 'must stay intact\n');
    await fs.rm(markerPath, { force: true });

    const markerDir = path.dirname(markerPath);
    const outsideInstanceDir = path.join(globalThis.fixture.root, 'outside-obelisk-instance');
    await fs.rm(markerDir, { recursive: true, force: true });
    await fs.mkdir(outsideInstanceDir, { recursive: true });
    await fs.symlink(outsideInstanceDir, markerDir);
    const symlinkedInstanceDir = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: true },
    });
    assert.equal(symlinkedInstanceDir.status, 400);
    assert.match((await symlinkedInstanceDir.json()).error, /symlink|runtime root/i);
    await assert.rejects(fs.access(path.join(outsideInstanceDir, 'enable-process-event-hook')), /ENOENT/);
    await fs.rm(markerDir, { force: true });
    await fs.mkdir(markerDir, { recursive: true });

    const disabled = await request('/api/plugins/obelisk/instances/arkserver/markers', {
        method: 'POST',
        body: { marker: 'enable-process-event-hook', enabled: false },
    });
    assert.equal(disabled.status, 200);
    await assert.rejects(fs.access(markerPath), /ENOENT/);
});

test('owners can grant per-user permissions without changing the base role', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'perm-operator', password: 'correct-password', role: 'operator' },
    });
    assert.equal(created.status, 200);

    const adminsBefore = await readAdminsFixture();
    const tempOperator = adminsBefore.find(admin => admin.username === 'perm-operator');
    assert.ok(tempOperator);

    const updated = await request(`/api/admins/${tempOperator.id}`, {
        method: 'PATCH',
        body: { permissions: { allow: ['deploy.view', 'not-real'], deny: ['wipe.execute'] } },
    });
    assert.equal(updated.status, 200);
    const updatedBody = await updated.json();
    assert.deepEqual(updatedBody.admin.permissions, { allow: ['deploy.view'], deny: ['wipe.execute'] });
    assert.deepEqual(updatedBody.admin.effectivePermissions, ['deploy.view']);

    const tempClient = await createClient('perm-operator');
    const verify = await request('/api/auth/verify', {}, tempClient);
    assert.equal(verify.status, 200);
    const verifyBody = await verify.json();
    assert.equal(verifyBody.user.role, 'operator');
    assert.deepEqual(verifyBody.user.effectivePermissions, ['deploy.view']);

    const capabilities = await request('/api/deploy/capabilities', {}, tempClient);
    assert.equal(capabilities.status, 200);

    const cleanup = await request(`/api/admins/${tempOperator.id}`, {
        method: 'DELETE',
        body: { confirmation: 'perm-operator' },
    });
    assert.equal(cleanup.status, 200);
});

test('Obelisk marker toggles fail before changing state when audit log is malformed', async () => {
    const auditPath = path.join(globalThis.fixture.dataDir, 'audit.json');
    const originalAudit = await fs.readFile(auditPath, 'utf8');
    const markerPath = path.join(globalThis.fixture.obeliskRoot, 'state', 'instances', 'arkserver', 'enable-process-event-hook');

    try {
        await fs.rm(markerPath, { force: true });
        await fs.writeFile(auditPath, '{"logs":');
        const enable = await request('/api/plugins/obelisk/instances/arkserver/markers', {
            method: 'POST',
            body: { marker: 'enable-process-event-hook', enabled: true },
        });
        assert.equal(enable.status, 500);
        await assert.rejects(fs.access(markerPath), /ENOENT/);
        assert.equal(await fs.readFile(auditPath, 'utf8'), '{"logs":');
    } finally {
        await fs.writeFile(auditPath, originalAudit);
        await fs.rm(markerPath, { force: true });
    }
});

test('auth uses the current stored role instead of the JWT role claim', async () => {
    let admins = await readAdminsFixture();
    admins = admins.map(admin => admin.username === 'operator' ? { ...admin, role: 'owner' } : admin);
    await writeAdminsFixture(admins);

    const promotedVerify = await request('/api/auth/verify', {}, globalThis.operatorClient);
    assert.equal(promotedVerify.status, 200);
    assert.equal((await promotedVerify.json()).user.role, 'owner');

    const promotedAdmins = await request('/api/admins', {}, globalThis.operatorClient);
    assert.equal(promotedAdmins.status, 200);

    admins = admins.map(admin => admin.username === 'operator' ? { ...admin, role: 'operator' } : admin);
    await writeAdminsFixture(admins);

    const downgradedVerify = await request('/api/auth/verify', {}, globalThis.operatorClient);
    assert.equal(downgradedVerify.status, 200);
    assert.equal((await downgradedVerify.json()).user.role, 'operator');

    const downgradedAdmins = await request('/api/admins', {}, globalThis.operatorClient);
    assert.equal(downgradedAdmins.status, 403);
});

test('deleted admins lose access immediately', async () => {
    const admins = await readAdminsFixture();
    admins.push({
        id: 'temp-owner',
        username: 'tempowner',
        password: await bcrypt.hash('correct-password', 4),
        role: 'owner',
    });
    await writeAdminsFixture(admins);
    const tempOwnerClient = await createClient('tempowner');

    const deleted = await request('/api/admins/temp-owner', { method: 'DELETE' });
    assert.equal(deleted.status, 400);
    assert.match((await deleted.json()).error, /confirmación explícita/i);

    const deletedWithConfirmation = await request('/api/admins/temp-owner', {
        method: 'DELETE',
        body: { confirmation: 'tempowner' },
    });
    assert.equal(deletedWithConfirmation.status, 200);

    const verifyDeleted = await request('/api/auth/verify', {}, tempOwnerClient);
    assert.equal(verifyDeleted.status, 401);
});

test('owners cannot delete themselves or change their own role from admin management', async () => {
    const created = await request('/api/admins', {
        method: 'POST',
        body: { username: 'self-guard-owner', password: 'correct-password', role: 'owner', confirmation: 'OWNER self-guard-owner' },
    });
    assert.equal(created.status, 200);

    const adminsBefore = await readAdminsFixture();
    const selfGuardOwner = adminsBefore.find(admin => admin.username === 'self-guard-owner');
    assert.ok(selfGuardOwner);
    const selfGuardClient = await createClient('self-guard-owner');

    const downgradeSelf = await request(`/api/admins/${selfGuardOwner.id}`, {
        method: 'PATCH',
        body: { role: 'operator' },
    }, selfGuardClient);
    assert.equal(downgradeSelf.status, 400);
    assert.match((await downgradeSelf.json()).error, /propio rol/i);

    const deleteSelf = await request(`/api/admins/${selfGuardOwner.id}`, { method: 'DELETE' }, selfGuardClient);
    assert.equal(deleteSelf.status, 400);
    assert.match((await deleteSelf.json()).error, /propia cuenta admin/i);

    const verifyStillOwner = await request('/api/auth/verify', {}, selfGuardClient);
    assert.equal(verifyStillOwner.status, 200);
    assert.equal((await verifyStillOwner.json()).user.role, 'owner');

    const adminsAfter = await readAdminsFixture();
    assert.equal(adminsAfter.find(admin => admin.id === selfGuardOwner.id).role, 'owner');

    const cleanup = await request(`/api/admins/${selfGuardOwner.id}`, {
        method: 'DELETE',
        body: { confirmation: 'self-guard-owner' },
    });
    assert.equal(cleanup.status, 200);
});

test('the final owner cannot be deleted', async () => {
    const res = await request('/api/admins/owner-1', { method: 'DELETE' });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /último owner/i);

    const admins = await readAdminsFixture();
    assert.equal(admins.filter(admin => admin.role === 'owner').length, 1);
    assert.ok(admins.some(admin => admin.id === 'owner-1'));
});
