const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { createHubService, checkSocket } = require('../hub');

let fixture, application, runtimeSocket, baseUrl;
let requests = [];
let responseMode = 'normal';
const clients = {};
const json = (file, data) => fs.writeFile(file, JSON.stringify(data), { mode: 0o600 });

async function request(url, { role = 'owner', method = 'GET', body, csrf = true, authenticated = true } = {}) {
    const headers = {};
    if (authenticated) headers.cookie = clients[role];
    if (csrf) headers['x-xsrf-token'] = 'hub-test-csrf';
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(baseUrl + url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: response.status, headers: response.headers, body: parsed };
}

test.before(async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obelisk-hub-test-'));
    await fs.chmod(root, 0o700);
    const data = path.join(root, 'data');
    await fs.mkdir(data, { mode: 0o700 });
    const socket = path.join(root, 'operator.sock');
    const registryFile = path.join(root, 'instances.json');
    const artifacts = path.join(root, 'artifacts');
    await fs.mkdir(artifacts, { mode: 0o700 });
    const gameIni = path.join(root, 'Game.ini');
    const gus = path.join(root, 'GameUserSettings.ini');
    const script = path.join(root, 'arkserver');
    await fs.writeFile(gameIni, '[/script/shootergame.shootergamemode]\n', { mode: 0o600 });
    await fs.writeFile(gus, '[ServerSettings]\nRCONEnabled=False\nServerAdminPassword=fixture-only-password\n', { mode: 0o600 });
    await fs.writeFile(script, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const password = await bcrypt.hash('test-owner-password', 4);
    await json(path.join(data, 'admins.json'), ['owner', 'operator', 'viewer'].map(role => ({ id: role, username: role, password, role })));
    await json(path.join(data, 'nodes.json'), [{ id: 'island', name: 'The Island', script, gameIni, gameUserSettings: gus, host: '127.0.0.1', gamePort: 17777, queryPort: 27025, rconPort: 27020 }]);
    for (const filename of ['audit', 'bans', 'players_db', 'tasks']) await json(path.join(data, filename + '.json'), []);
    await json(path.join(data, 'global_settings.json'), {});
    await json(registryFile, { schema_version: 1, instances: [{ id: 'island', name: 'Isla de prueba', socket_path: socket, plugin_ids: ['oPing', 'oHomes'] }] });
    fixture = { root, data, registryFile, artifacts, socket, gus, gameIni };
    runtimeSocket = net.createServer(connection => {
        let buffer = '';
        connection.on('data', async chunk => {
            buffer += chunk;
            if (!buffer.includes('\n')) return;
            const input = JSON.parse(buffer);
            requests.push(input);
            if (responseMode === 'disconnect') { connection.end(); return; }
            if (responseMode === 'pending') { connection.end(JSON.stringify({ ok: false, error: 'in_progress', started: true, request_id: input.request_id }) + '\n'); return; }
            if (responseMode === 'audit-failure') await fs.writeFile(path.join(data, 'audit.json'), 'invalid');
            connection.end(JSON.stringify({ ok: true, request_id: input.request_id, state: input.action === 'status' ? 'status' : 'running', started: true, plugins: [{ plugin_id: 'oPing', state: 'running', generation: 2, cooperative: true, private_path: '/not-for-browser', last_failure: '/private/log/path' }, { plugin_id: 'unregistered', state: 'running' }] }) + '\n');
        });
    });
    await new Promise(resolve => runtimeSocket.listen(socket, resolve));
    await fs.chmod(socket, 0o600);
    Object.assign(process.env, { NODE_ENV: 'test', DASHBOARD_DATA_DIR: data, ARK_SCRIPT_ROOTS: root, ARK_CONFIG_ROOTS: root, JWT_SECRET_KEY: 'hub-test-key-longer-than-thirty-two-characters', PORT: '0', OBELISK_HUB_INSTANCES_FILE: registryFile, OBELISK_HUB_ARTIFACTS_DIR: artifacts });
    const { startServer } = require('../server');
    application = startServer(0);
    await new Promise(resolve => application.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${application.address().port}`;
    for (const role of ['owner', 'operator', 'viewer']) {
        const response = await fetch(baseUrl + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'XSRF-TOKEN=hub-test-csrf' }, body: JSON.stringify({ username: role, password: 'test-owner-password' }) });
        assert.equal(response.status, 200);
        clients[role] = response.headers.getSetCookie().map(value => value.split(';')[0]).concat('XSRF-TOKEN=hub-test-csrf').join('; ');
        await response.arrayBuffer();
    }
});

test.after(async () => {
    application?.closeAllConnections();
    await new Promise(resolve => application?.close(resolve));
    await new Promise(resolve => runtimeSocket?.close(resolve));
    await fs.rm(fixture.root, { recursive: true, force: true });
});

test('Hub reads require authenticated operator and distinguish native prototypes and monitor from references', async () => {
    assert.equal((await request('/api/hub/catalog', { authenticated: false })).status, 401);
    assert.equal((await request('/api/hub/catalog', { role: 'viewer' })).status, 403);
    const own = await request('/api/hub/catalog', { role: 'operator' });
    assert.equal(own.status, 200);
    assert.equal(own.body.catalog.plugins.length, 7);
    assert.equal(own.body.catalog.gameplay_parity_accepted, false);
    assert.ok(own.body.catalog.plugins.every(item => item.stage === 'experimental'));
    const references = await request('/api/hub/references?pageSize=50');
    assert.equal(references.body.references.total, 157);
    assert.equal(references.body.references.items.length, 50);
    assert.equal(references.body.references.snapshot_date, '2026-10-14');
    assert.ok(references.body.references.items.every(item => item.available === false && item.stage === 'reference_pending'));
});

test('reference search and pagination reject duplicate, malformed and unbounded parameters', async () => {
    const found = await request('/api/hub/references?search=ArkShop&pageSize=2');
    assert.equal(found.status, 200);
    assert.ok(found.body.references.items.length <= 2);
    for (const query of ['page=0', 'pageSize=51', 'page=1&page=2', 'family=unknown', 'search=%0A', 'socket=/tmp/evil']) {
        assert.equal((await request('/api/hub/references?' + query)).status, 400, query);
    }
});

test('SDK resources require operator authentication and distribute only reviewed source bundles', async () => {
    for (const url of ['/api/hub/resources', '/api/hub/resources/command-starter/download']) {
        assert.equal((await request(url, { authenticated: false })).status, 401);
        assert.equal((await request(url, { role: 'viewer' })).status, 403);
    }
    const result = await request('/api/hub/resources', { role: 'operator' });
    assert.equal(result.status, 200);
    assert.equal(result.body.resources.gameplay_parity_accepted, false);
    assert.equal(result.body.resources.items.length, 5);
    assert.equal(JSON.stringify(result.body).includes('/srv/'), false);
    for (const resource of result.body.resources.items) {
        const response = await fetch(baseUrl + resource.download_url, { headers: { cookie: clients.operator } });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /application\/gzip/);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), response.headers.get('x-content-sha256'));
        const names = execFileSync('tar', ['-tzf', '-'], { input: bytes, encoding: 'utf8' }).trim().split('\n');
        assert.deepEqual(names, resource.files.map(file => `${resource.id}/${file.name}`));
        for (const file of resource.files) {
            const content = execFileSync('tar', ['-xOzf', '-', `${resource.id}/${file.name}`], { input: bytes });
            assert.equal(content.length, file.size);
            assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256);
        }
        if (resource.id === 'command-starter') {
            const again = await fetch(baseUrl + resource.download_url, { headers: { cookie: clients.operator } });
            assert.deepEqual(Buffer.from(await again.arrayBuffer()), bytes, 'archives must be reproducible');
        }
    }
});

test('resource downloads reject arbitrary sources, traversal and query overrides', async () => {
    for (const url of ['/api/hub/resources?path=/etc/passwd', '/api/hub/resources/command-starter/download?file=../../server.js', '/api/hub/resources/command-starter/download?file=a&file=b']) {
        assert.equal((await request(url)).status, 400, url);
    }
    for (const id of ['server', 'LICENSE', '%2e%2e%2fserver', 'unknown-template']) {
        assert.equal((await request(`/api/hub/resources/${id}/download`)).status, 404, id);
    }
});

test('parity overview accounts for every pinned resource without promoting prototypes', async () => {
    assert.equal((await request('/api/hub/parity', { authenticated: false })).status, 401);
    assert.equal((await request('/api/hub/parity', { role: 'viewer' })).status, 403);
    assert.equal((await request('/api/hub/parity?accept=true')).status, 400);
    const { body, status } = await request('/api/hub/parity', { role: 'operator' });
    assert.equal(status, 200);
    assert.equal(body.parity.total, 157);
    assert.equal(body.parity.accepted, 0);
    assert.equal(body.parity.pending, 157);
    assert.equal(body.parity.full_functional_parity, false);
    assert.equal(body.parity.native_dll_compatibility, false);
    assert.equal(body.parity.selected_contracts, 13);
    assert.equal(body.parity.sdk_domains.length, 13);
    assert.equal(Object.keys(body.parity.dimensions).length, 7);
    assert.equal(body.parity.families.reduce((sum, family) => sum + family.total, 0), 157);
    assert.equal(body.parity.snapshot_date, '2026-10-14');
});

test('reference details expose exact contracts, gaps and client dependencies with bounded IDs', async () => {
    assert.equal((await request('/api/hub/references/36', { role: 'viewer' })).status, 403);
    const shop = await request('/api/hub/references/36');
    assert.equal(shop.status, 200);
    assert.equal(shop.body.reference.resource_id, 36);
    assert.equal(shop.body.reference.available, false);
    assert.deepEqual(shop.body.reference.related_native_modules, ['oShopKits']);
    assert.ok(shop.body.reference.selected_contract.commands.includes('/buy <ID> <Amount>'));
    assert.match(shop.body.reference.selected_contract.gap, /no compra/);
    assert.equal(shop.body.reference.gameplay_parity_accepted, false);
    assert.equal(Object.keys(shop.body.reference.behavior_matrix).length, 7);
    const ui = await request('/api/hub/references/28');
    assert.equal(ui.body.reference.selected_contract, null);
    assert.equal(ui.body.reference.behavior_matrix.client_mod_or_gui.stage, 'DependencyDocumented');
    for (const id of ['0', '36.0', '-1', '1e2', '00036', '9999999999', '%2e%2e%2fserver']) {
        assert.equal((await request(`/api/hub/references/${id}`)).status, 400, id);
    }
    assert.equal((await request('/api/hub/references/999999')).status, 404);
    assert.equal((await request('/api/hub/references/36?stage=Accepted')).status, 400);
});

test('private registry lists no socket paths and real CLI queries a private AF_UNIX fixture', async () => {
    const instances = await request('/api/hub/instances');
    assert.equal(instances.status, 200);
    assert.deepEqual(instances.body.instances[0], { id: 'island', name: 'Isla de prueba', available: true, capabilities: { plugin_control: true }, plugins: ['oPing', 'oHomes'] });
    assert.equal(JSON.stringify(instances.body).includes(fixture.root), false);
    const status = await request('/api/hub/instances/island/plugins');
    assert.equal(status.body.ok, true);
    assert.equal(status.body.plugins.length, 1);
    assert.equal(status.body.plugins[0].last_failure, 'runtime_failure');
    assert.equal(JSON.stringify(status.body).includes('/private'), false);
    assert.equal(requests.at(-1).action, 'status');
});

test('plugin actions use owner permission, existing CSRF and no browser filesystem input', async () => {
    const url = '/api/hub/instances/island/plugins/oPing/start';
    assert.equal((await request(url, { method: 'POST', body: {}, role: 'operator' })).status, 403);
    assert.equal((await request(url, { method: 'POST', body: {}, csrf: false })).status, 403);
    const before = requests.length;
    assert.equal((await request(url, { method: 'POST', body: { socket: '/tmp/evil' } })).status, 400);
    assert.equal((await request(url.replace('oPing', 'ShellPlugin'), { method: 'POST', body: {} })).status, 400);
    assert.equal((await request(url.replace('/start', '/exec'), { method: 'POST', body: {} })).status, 400);
    assert.equal(requests.length, before);
    const result = await request(url, { method: 'POST', body: {} });
    assert.equal(result.status, 200);
    assert.equal(result.body.outcome, 'confirmed');
    assert.equal(requests.length, before + 1);
    assert.equal(requests.at(-1).plugin_id, 'oPing');
});

test('per-user manage permission enables operators while viewer role remains insufficient', async () => {
    const filename = path.join(fixture.data, 'admins.json');
    const admins = JSON.parse(await fs.readFile(filename, 'utf8'));
    for (const admin of admins) if (admin.role !== 'owner') admin.permissions = { allow: ['obelisk.plugins.manage'], deny: [] };
    await json(filename, admins);
    const url = '/api/hub/instances/island/plugins/oPing/pause';
    assert.equal((await request(url, { method: 'POST', body: {}, role: 'operator' })).status, 200);
    assert.equal((await request(url, { method: 'POST', body: {}, role: 'viewer' })).status, 403);
});

test('pending or disconnected runtime outcomes dispatch once and block mutations until status confirmation', async () => {
    const url = '/api/hub/instances/island/plugins/oPing/reload';
    for (const mode of ['pending', 'disconnect']) {
        responseMode = mode;
        const before = requests.length;
        const result = await request(url, { method: 'POST', body: {} });
        assert.equal(result.status, 202);
        assert.equal(result.body.outcome, 'pending');
        assert.match(result.body.guidance, /estado/);
        assert.equal(requests.length, before + 1);
        assert.equal((await request(url, { method: 'POST', body: {} })).status, 409);
        assert.equal(requests.length, before + 1);
        responseMode = 'normal';
        assert.equal((await request('/api/hub/instances/island/plugins')).body.outcome, 'confirmed');
    }
});

test('registry permission failures and symlinked socket cannot dispatch controls', async () => {
    const service = createHubService({ instancesFile: fixture.registryFile });
    await fs.chmod(fixture.registryFile, 0o644);
    await assert.rejects(service.instances(), error => error.code === 'unsafe_registry_file');
    await fs.chmod(fixture.registryFile, 0o600);
    const link = path.join(fixture.root, 'socket-link');
    await fs.symlink(fixture.socket, link);
    await assert.rejects(checkSocket(link), error => error.code === 'unsafe_control_socket');
    await fs.chmod(fixture.socket, 0o666);
    await assert.rejects(checkSocket(fixture.socket), error => error.code === 'unsafe_control_socket');
    await fs.chmod(fixture.socket, 0o600);
});

test('audit corruption blocks dispatch and audit failure after dispatch reports an unknown outcome', async () => {
    const file = path.join(fixture.data, 'audit.json');
    const before = requests.length;
    await fs.writeFile(file, 'invalid');
    assert.equal((await request('/api/hub/instances/island/plugins/oPing/start', { method: 'POST', body: {} })).status, 503);
    assert.equal(requests.length, before);
    await json(file, []);
    responseMode = 'audit-failure';
    const result = await request('/api/hub/instances/island/plugins/oPing/start', { method: 'POST', body: {} });
    assert.equal(result.status, 202);
    assert.equal(result.body.reason, 'audit_commit_failed_after_dispatch');
    responseMode = 'normal';
    await json(file, []);
    assert.equal((await request('/api/hub/instances/island/plugins')).body.ok, true);
});

test('artifact metadata never implies signature verification and downloads only indexed regular files', async () => {
    const content = Buffer.from('signed elsewhere, still verify before installation');
    await fs.writeFile(path.join(fixture.artifacts, 'runtime.tar.gz'), content, { mode: 0o600 });
    await fs.writeFile(path.join(fixture.artifacts, 'manifest.json'), '{}', { mode: 0o600 });
    await fs.writeFile(path.join(fixture.artifacts, 'manifest.sig'), 'signature-fixture', { mode: 0o600 });
    const entry = { id: 'runtime-test', version: '0.1.0-experimental.1', channel: 'experimental', stability: 'experimental', platform: 'linux-x86_64', game: 'ASE', game_build: '21241282', api_bytes: 312, runtime_ready: false, archive_name: 'runtime.tar.gz', manifest_name: 'manifest.json', signature_name: 'manifest.sig', archive_sha256: crypto.createHash('sha256').update(content).digest('hex'), archive_size: content.length, components: ['oPing'] };
    const index = path.join(fixture.artifacts, 'index.json');
    await json(index, { schema_version: 1, artifacts: [entry] });
    const metadata = await request('/api/hub/artifacts');
    assert.equal(metadata.status, 200);
    assert.equal(metadata.body.artifacts[0].signature_verified, false);
    assert.equal(metadata.body.installation_available, false);
    const download = await request('/api/hub/artifacts/runtime-test/download?file=archive');
    assert.equal(download.status, 200);
    assert.equal(download.body, content.toString());
    assert.match(download.headers.get('content-disposition'), /runtime\.tar\.gz/);
    assert.equal((await request('/api/hub/artifacts/runtime-test/download?file=../../secret')).status, 400);
    await json(index, { schema_version: 1, artifacts: [{ ...entry, archive_name: '../outside' }] });
    assert.equal((await request('/api/hub/artifacts')).status, 503);
    await json(index, { schema_version: 1, artifacts: [entry] });
    await fs.link(path.join(fixture.artifacts, 'runtime.tar.gz'), path.join(fixture.artifacts, 'hardlink'));
    assert.equal((await request('/api/hub/artifacts/runtime-test/download?file=archive')).status, 503);
});

test('server capabilities separate configured RCON from unprobed reachability and native control', async () => {
    const disabled = await request('/api/servers/island/capabilities');
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.transport.rcon.configured, false);
    assert.equal(disabled.body.actions.console, false);
    assert.equal(disabled.body.transport.obelisk.registered, true);
    await fs.writeFile(fixture.gus, '[ServerSettings]\nRCONEnabled=True\nServerAdminPassword=fixture-only-password\n');
    const enabled = await request('/api/servers/island/capabilities');
    assert.equal(enabled.body.transport.rcon.configured, true);
    assert.equal(enabled.body.transport.rcon.reachable, null);
    assert.equal(enabled.body.actions.console, true);
    const operator = await request('/api/servers/island/capabilities', { role: 'operator' });
    assert.equal(operator.body.actions.console, false);
    assert.equal(operator.body.actions.kick, true);
    assert.equal(JSON.stringify(enabled.body).includes('fixture-only-password'), false);
});

test('game modes require real owner authentication and a bounded map/profile selection', async () => {
    assert.equal((await request('/api/game-modes', { authenticated: false })).status, 401);
    assert.equal((await request('/api/game-modes', { role: 'viewer' })).status, 403);
    const modes = await request('/api/game-modes', { role: 'operator' });
    assert.equal(modes.status, 200);
    assert.equal(modes.body.profiles.length, 4);
    assert.equal(modes.body.scope, 'configuration_only');
    assert.equal((await request('/api/game-modes/preview', { role: 'operator', method: 'POST', body: { mapId: 'island', modeId: 'pve' } })).status, 403);
    for (const body of [{ mapId: 'missing', modeId: 'pve' }, { mapId: 'island', modeId: 'battle-royale' }, { mapId: 'island', modeId: 'pve', path: '/tmp/evil' }]) {
        assert.equal((await request('/api/game-modes/preview', { method: 'POST', body })).status, 400);
    }
});

test('mode previews bind user and full config revision, preserve rates/secrets and save without live activation', async () => {
    const originals = {
        gameIni: '[/script/shootergame.shootergamemode]\r\nbAutoPvETimer=True\r\nMatingIntervalMultiplier=0.01\r\n',
        gus: '[ServerSettings]\r\nserverPVE=False\r\nServerHardcore=True\r\nRCONEnabled=False\r\nServerAdminPassword=confidential-mode-fixture\r\nXPMultiplier=1000\r\n',
    };
    await fs.writeFile(fixture.gameIni, originals.gameIni);
    await fs.writeFile(fixture.gus, originals.gus);
    const preview = await request('/api/game-modes/preview', { method: 'POST', body: { mapId: 'island', modeId: 'pve' } });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.runtime_applied, false);
    assert.equal(preview.body.preserves_rates, true);
    assert.equal(JSON.stringify(preview.body).includes('confidential-mode-fixture'), false);
    const valid = { preview_token: preview.body.preview_token, confirmation: 'island' };
    assert.equal((await request('/api/game-modes/apply', { method: 'POST', body: { ...valid, confirmation: 'another-map' } })).status, 400);
    assert.equal((await request('/api/game-modes/apply', { method: 'POST', body: { ...valid, preview_token: 'X' + valid.preview_token.slice(1) } })).status, 409);
    const adminsFile = path.join(fixture.data, 'admins.json');
    const admins = JSON.parse(await fs.readFile(adminsFile, 'utf8'));
    admins.find(item => item.id === 'owner').username = 'renamed-owner';
    await json(adminsFile, admins);
    assert.equal((await request('/api/game-modes/apply', { method: 'POST', body: valid })).status, 400);
    admins.find(item => item.id === 'owner').username = 'owner';
    await json(adminsFile, admins);
    await fs.appendFile(fixture.gameIni, '; another owner edited this after preview\r\n');
    const stale = await request('/api/game-modes/apply', { method: 'POST', body: valid });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.configuration_outcome, 'unchanged');
    assert.equal(await fs.readFile(fixture.gus, 'utf8'), originals.gus);
    const fresh = await request('/api/game-modes/preview', { method: 'POST', body: { mapId: 'island', modeId: 'pve' } });
    const saved = await request('/api/game-modes/apply', { method: 'POST', body: { preview_token: fresh.body.preview_token, confirmation: 'island' } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.saved, true);
    assert.equal(saved.body.runtime_applied, false);
    assert.equal(saved.body.restart_required, true);
    const game = await fs.readFile(fixture.gameIni, 'utf8');
    const settings = await fs.readFile(fixture.gus, 'utf8');
    assert.match(game, /bAutoPvETimer=False\r\nMatingIntervalMultiplier=0.01/);
    assert.match(settings, /serverPVE=True\r\nServerHardcore=False/);
    assert.match(settings, /ServerAdminPassword=confidential-mode-fixture\r\nXPMultiplier=1000/);
    assert.equal(await fs.readFile(fixture.gus + '.bak', 'utf8'), originals.gus);
    assert.equal(JSON.stringify(saved.body).includes('confidential-mode-fixture'), false);
});

test('player observations retain mixed success and never turn unavailable maps into confirmed zero', async () => {
    const { collectOnlinePlayerObservations } = require('../server');
    const maps = [{ id: 'island', name: 'The Island' }, { id: 'offline', name: 'Offline' }];
    const mixed = await collectOnlinePlayerObservations(maps, { configured: async () => true, query: async map => {
        if (map.id === 'offline') throw new Error('private host and secret must not escape');
        return '0. Player Uno, 76561198000000001';
    } });
    assert.equal(mixed.complete, false);
    assert.equal(mixed.players.length, 1);
    assert.deepEqual(mixed.per_map.map(item => item.status), ['queried', 'unavailable']);
    assert.equal(mixed.source, 'rcon_listplayers');
    assert.equal(mixed.identity_authority, 'unverified_observation');
    assert.equal(JSON.stringify(mixed).includes('secret'), false);
    assert.ok(Number.isFinite(Date.parse(mixed.observed_at)));
    let calls = 0;
    const unavailable = await collectOnlinePlayerObservations(maps, { configured: async () => false, query: async () => { calls++; return 'No Players Connected'; } });
    assert.equal(unavailable.complete, false);
    assert.deepEqual(unavailable.players, []);
    assert.equal(calls, 0);
    assert.ok(unavailable.per_map.every(item => item.reason === 'rcon_disabled_or_incomplete'));
    const actualZero = await collectOnlinePlayerObservations(maps, { configured: async () => true, query: async () => 'No Players Connected' });
    assert.equal(actualZero.complete, true);
    assert.deepEqual(actualZero.players, []);
    const emptyResponse = await collectOnlinePlayerObservations(maps, { configured: async () => true, query: async () => '' });
    assert.equal(emptyResponse.complete, false);
    const duplicate = await collectOnlinePlayerObservations(maps, { configured: async () => true, query: async () => '0. Moving Player, 76561198000000001' });
    assert.equal(duplicate.complete, true);
    assert.equal(duplicate.players.length, 1);
    assert.equal(duplicate.players[0].mapId, 'island');
    const disabled = await request('/api/players/online?mapId=island');
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.complete, false);
    assert.equal(disabled.body.per_map[0].status, 'unavailable');
});
