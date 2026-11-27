const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const { spawnSync } = require('child_process');

function requireServerInProduction(env) {
    return spawnSync(process.execPath, ['-e', "require('./server')"], {
        cwd: path.join(__dirname, '..'),
        env: {
            ...process.env,
            NODE_ENV: 'production',
            ARK_ROOT: '/srv/ark',
            CORS_ORIGINS: 'https://ark.example.com',
            PORT: '0',
            ...env,
        },
        encoding: 'utf8',
    });
}

async function writeValidNodes(dataDir) {
    await fsp.mkdir(dataDir, { recursive: true });
    await fsp.writeFile(path.join(dataDir, 'nodes.json'), JSON.stringify([{
        id: 'ragnarok',
        name: 'Ragnarok',
        host: '127.0.0.1',
        gamePort: 7777,
        queryPort: 27015,
        rconPort: 27020,
        script: '/srv/ark/arkserver',
        gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
        gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        logPath: '/srv/ark/serverfiles/ShooterGame/Saved/Logs/ShooterGame.log',
    }], null, 2));
}

test('initial owner can be bootstrapped from environment without committing admins.json', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-bootstrap-'));
    const adminsPath = path.join(root, 'admins.json');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousUsername = process.env.DASHBOARD_BOOTSTRAP_USERNAME;
    const previousPassword = process.env.DASHBOARD_BOOTSTRAP_PASSWORD;

    process.env.NODE_ENV = 'test';
    process.env.DASHBOARD_BOOTSTRAP_USERNAME = 'firstowner';
    process.env.DASHBOARD_BOOTSTRAP_PASSWORD = 'long-one-time-password';
    const { ensureAdminRolesSync } = require('../server');

    try {
        ensureAdminRolesSync(adminsPath);
        const admins = JSON.parse(await fsp.readFile(adminsPath, 'utf8'));
        assert.equal(admins.length, 1);
        assert.equal(admins[0].username, 'firstowner');
        assert.equal(admins[0].role, 'owner');
        assert.equal(await bcrypt.compare('long-one-time-password', admins[0].password), true);
    } finally {
        if (typeof previousNodeEnv === 'undefined') delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (typeof previousUsername === 'undefined') delete process.env.DASHBOARD_BOOTSTRAP_USERNAME;
        else process.env.DASHBOARD_BOOTSTRAP_USERNAME = previousUsername;
        if (typeof previousPassword === 'undefined') delete process.env.DASHBOARD_BOOTSTRAP_PASSWORD;
        else process.env.DASHBOARD_BOOTSTRAP_PASSWORD = previousPassword;
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('bootstrap rejects weak owner passwords', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-bootstrap-'));
    const adminsPath = path.join(root, 'admins.json');
    const previousNodeEnv = process.env.NODE_ENV;
    const previousUsername = process.env.DASHBOARD_BOOTSTRAP_USERNAME;
    const previousPassword = process.env.DASHBOARD_BOOTSTRAP_PASSWORD;

    process.env.NODE_ENV = 'test';
    process.env.DASHBOARD_BOOTSTRAP_USERNAME = 'firstowner';
    process.env.DASHBOARD_BOOTSTRAP_PASSWORD = 'short';
    const { ensureAdminRolesSync } = require('../server');

    try {
        assert.throws(() => ensureAdminRolesSync(adminsPath), /at least 12 characters/);
        assert.equal(fs.existsSync(adminsPath), false);
        process.env.DASHBOARD_BOOTSTRAP_PASSWORD = 'a'.repeat(73);
        assert.throws(() => ensureAdminRolesSync(adminsPath), /72 bytes or less/);
        assert.equal(fs.existsSync(adminsPath), false);
    } finally {
        if (typeof previousNodeEnv === 'undefined') delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
        if (typeof previousUsername === 'undefined') delete process.env.DASHBOARD_BOOTSTRAP_USERNAME;
        else process.env.DASHBOARD_BOOTSTRAP_USERNAME = previousUsername;
        if (typeof previousPassword === 'undefined') delete process.env.DASHBOARD_BOOTSTRAP_PASSWORD;
        else process.env.DASHBOARD_BOOTSTRAP_PASSWORD = previousPassword;
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('production rejects placeholder JWT secrets', () => {
    const result = requireServerInProduction({
        JWT_SECRET_KEY: 'replace-with-32-plus-random-characters',
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}${result.stdout}`, /JWT_SECRET_KEY must not use a placeholder value/);
});

test('production rejects placeholder bootstrap owner passwords', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-bootstrap-prod-'));
    try {
        await writeValidNodes(root);
        const result = requireServerInProduction({
            DASHBOARD_DATA_DIR: root,
            JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
            DASHBOARD_BOOTSTRAP_USERNAME: 'owner',
            DASHBOARD_BOOTSTRAP_PASSWORD: 'replace-with-a-long-one-time-password',
        });

        assert.notEqual(result.status, 0);
        assert.match(`${result.stderr}${result.stdout}`, /DASHBOARD_BOOTSTRAP_PASSWORD must not use a placeholder value/);
        assert.equal(fs.existsSync(path.join(root, 'admins.json')), false);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('production rejects insecure or malformed CORS origins', () => {
    for (const CORS_ORIGINS of [
        'http://ark.example.com',
        'https://ark.example.com/path',
        'https://ark.example.com?x=1',
        '*',
        'null',
    ]) {
        const result = requireServerInProduction({
            JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
            CORS_ORIGINS,
        });
        assert.notEqual(result.status, 0, `${CORS_ORIGINS} should be rejected`);
        assert.match(`${result.stderr}${result.stdout}`, /CORS_ORIGINS/);
    }
});

test('production rejects invalid numeric runtime environment values', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-runtime-prod-'));
    const baseEnv = {
        DASHBOARD_DATA_DIR: root,
        JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
        DASHBOARD_BOOTSTRAP_USERNAME: 'owner',
        DASHBOARD_BOOTSTRAP_PASSWORD: 'long-one-time-password',
    };

    try {
        const cases = [{
            env: { PORT: 'not-a-port' },
            error: /PORT/,
        }, {
            env: { TRUST_PROXY_HOPS: '11' },
            error: /TRUST_PROXY_HOPS/,
        }, {
            env: { RCON_CONNECT_TIMEOUT_MS: '999' },
            error: /RCON_CONNECT_TIMEOUT_MS/,
        }, {
            env: { RCON_COMMAND_TIMEOUT_MS: '60001' },
            error: /RCON_COMMAND_TIMEOUT_MS/,
        }, {
            env: { RCON_RESPONSE_MAX_CHARS: '1023' },
            error: /RCON_RESPONSE_MAX_CHARS/,
        }, {
            env: { GAMEDIG_TIMEOUT_MS: '0' },
            error: /GAMEDIG_TIMEOUT_MS/,
        }, {
            env: { DISCORD_WEBHOOK_TIMEOUT_MS: '0' },
            error: /DISCORD_WEBHOOK_TIMEOUT_MS/,
        }, {
            env: { HTTP_REQUEST_TIMEOUT_MS: '4999' },
            error: /HTTP_REQUEST_TIMEOUT_MS/,
        }, {
            env: { HTTP_HEADERS_TIMEOUT_MS: '40000', HTTP_REQUEST_TIMEOUT_MS: '30000' },
            error: /HTTP_HEADERS_TIMEOUT_MS must not exceed HTTP_REQUEST_TIMEOUT_MS/,
        }, {
            env: { HTTP_KEEPALIVE_TIMEOUT_MS: '999' },
            error: /HTTP_KEEPALIVE_TIMEOUT_MS/,
        }];

        for (const { env, error } of cases) {
            const result = requireServerInProduction({ ...baseEnv, ...env });
            assert.notEqual(result.status, 0, `${Object.keys(env).join(',')} should be rejected`);
            assert.match(`${result.stderr}${result.stdout}`, error);
        }
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('production requires an initial owner or a complete bootstrap pair', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-bootstrap-prod-'));
    try {
        await writeValidNodes(root);
        const missingBootstrap = requireServerInProduction({
            DASHBOARD_DATA_DIR: root,
            JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
        });
        assert.notEqual(missingBootstrap.status, 0);
        assert.match(`${missingBootstrap.stderr}${missingBootstrap.stdout}`, /No dashboard admins found/);

        const partialBootstrap = requireServerInProduction({
            DASHBOARD_DATA_DIR: root,
            JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
            DASHBOARD_BOOTSTRAP_USERNAME: 'owner',
        });
        assert.notEqual(partialBootstrap.status, 0);
        assert.match(`${partialBootstrap.stderr}${partialBootstrap.stdout}`, /must be provided together/);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('production rejects missing, malformed, empty, or partially invalid nodes config', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-nodes-prod-'));
    const baseEnv = {
        DASHBOARD_DATA_DIR: root,
        JWT_SECRET_KEY: 'production-test-secret-with-32-plus-characters',
        DASHBOARD_BOOTSTRAP_USERNAME: 'owner',
        DASHBOARD_BOOTSTRAP_PASSWORD: 'long-one-time-password',
    };

    try {
        const missing = requireServerInProduction(baseEnv);
        assert.notEqual(missing.status, 0);
        assert.match(`${missing.stderr}${missing.stdout}`, /nodes\.json is required/);

        await fsp.writeFile(path.join(root, 'nodes.json'), '{"id":');
        const malformed = requireServerInProduction(baseEnv);
        assert.notEqual(malformed.status, 0);
        assert.match(`${malformed.stderr}${malformed.stdout}`, /Error reading nodes\.json|Unexpected end of JSON input/);

        await fsp.writeFile(path.join(root, 'nodes.json'), '[]');
        const empty = requireServerInProduction(baseEnv);
        assert.notEqual(empty.status, 0);
        assert.match(`${empty.stderr}${empty.stdout}`, /at least one valid cluster map/);

        await fsp.writeFile(path.join(root, 'nodes.json'), JSON.stringify([{
            id: 'ragnarok',
            name: 'Ragnarok',
            host: '127.0.0.1',
            gamePort: 7777,
            queryPort: 27015,
            rconPort: 27020,
            script: '/srv/ark/arkserver',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: '../bad',
            name: 'Bad',
            host: '127.0.0.1',
            gamePort: 7778,
            queryPort: 27016,
            rconPort: 27021,
            script: '/srv/ark/badserver',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }], null, 2));
        const partial = requireServerInProduction(baseEnv);
        assert.notEqual(partial.status, 0);
        assert.match(`${partial.stderr}${partial.stdout}`, /invalid or duplicate map/);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('cluster map normalization validates node config and supports legacy aliases', () => {
    process.env.NODE_ENV = 'test';
    const previousScriptRoots = process.env.ARK_SCRIPT_ROOTS;
    const previousConfigRoots = process.env.ARK_CONFIG_ROOTS;
    const previousLogRoots = process.env.ARK_LOG_ROOTS;
    process.env.ARK_SCRIPT_ROOTS = '/srv/ark,, ';
    process.env.ARK_CONFIG_ROOTS = '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer';
    process.env.ARK_LOG_ROOTS = '/srv/ark/serverfiles/ShooterGame/Saved/Logs';
    const { normalizeClusterMaps } = require('../server');
    try {
        const maps = normalizeClusterMaps([{
            id: 'ragnarok',
            mapName: 'Ragnarok',
            host: 'ark-node-1.internal',
            gamePort: '7777',
            queryPort: 27015,
            rconPort: 27020,
            scriptName: '/srv/ark/arkserver',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
            logPath: '/srv/ark/serverfiles/ShooterGame/Saved/Logs/ShooterGame.log',
        }, {
            id: 'ragnarok',
            name: 'Duplicate',
            host: '127.0.0.1',
            gamePort: 7778,
            queryPort: 27016,
            rconPort: 27021,
            script: '/srv/ark/duplicate',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: '../bad',
            name: 'Bad',
            host: '127.0.0.1',
            gamePort: 7777,
            queryPort: 27015,
            rconPort: 27020,
            script: '/srv/ark/bad',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'bad-port',
            name: 'Bad Port',
            host: '127.0.0.1',
            gamePort: 7777,
            queryPort: 99999,
            rconPort: 27020,
            script: '/srv/ark/bad',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'default-host',
            name: 'Default Host',
            host: 'bad host with spaces',
            gamePort: 7779,
            queryPort: 27017,
            rconPort: 27022,
            script: '/srv/ark/default-host',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'unsafe-script',
            name: 'Unsafe Script',
            host: '127.0.0.1',
            gamePort: 7780,
            queryPort: 27018,
            rconPort: 27023,
            script: '/tmp/arkserver',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'blank-root-cwd',
            name: 'Blank Root Cwd',
            host: '127.0.0.1',
            gamePort: 7783,
            queryPort: 27027,
            rconPort: 27028,
            script: path.join(process.cwd(), 'arkserver'),
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'unsafe-config',
            name: 'Unsafe Config',
            host: '127.0.0.1',
            gamePort: 7781,
            queryPort: 27019,
            rconPort: 27024,
            script: '/srv/ark/arkserver3',
            gameIni: '/etc/passwd',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
        }, {
            id: 'unsafe-log',
            name: 'Unsafe Log',
            host: '127.0.0.1',
            gamePort: 7782,
            queryPort: 27025,
            rconPort: 27026,
            script: '/srv/ark/arkserver4',
            gameIni: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/Game.ini',
            gameUserSettings: '/srv/ark/serverfiles/ShooterGame/Saved/Config/LinuxServer/GameUserSettings.ini',
            logPath: '/tmp/ShooterGame.log',
        }]);

        assert.equal(maps.length, 2);
        assert.deepEqual(maps.map(map => map.id), ['ragnarok', 'default-host']);
        assert.equal(maps[0].name, 'Ragnarok');
        assert.equal(maps[0].host, 'ark-node-1.internal');
        assert.equal(maps[0].gamePort, 7777);
        assert.equal(maps[0].script, '/srv/ark/arkserver');
        assert.equal(maps[1].host, '127.0.0.1');
    } finally {
        if (typeof previousScriptRoots === 'undefined') delete process.env.ARK_SCRIPT_ROOTS;
        else process.env.ARK_SCRIPT_ROOTS = previousScriptRoots;
        if (typeof previousConfigRoots === 'undefined') delete process.env.ARK_CONFIG_ROOTS;
        else process.env.ARK_CONFIG_ROOTS = previousConfigRoots;
        if (typeof previousLogRoots === 'undefined') delete process.env.ARK_LOG_ROOTS;
        else process.env.ARK_LOG_ROOTS = previousLogRoots;
    }
});

test('process matching supports ARK map aliases and launch ports', () => {
    process.env.NODE_ENV = 'test';
    const { processMatchesMap } = require('../server');
    const genesis = {
        id: 'genesis2',
        name: 'Genesis 2',
        processAliases: ['Gen2', 'Genesis2'],
        gamePort: 7783,
        queryPort: 27017,
        rconPort: 27022,
    };

    assert.equal(processMatchesMap({
        name: 'ShooterGameServer',
        command: '/srv/ark/serverfiles/ShooterGame/Binaries/Linux/ShooterGameServer',
        params: 'Gen2?AltSaveDirectoryName=SavedGen2?RCONPort=27022?SessionName=FLOWCOM | Genesis2 -Port=7783 -QueryPort=27017',
    }, genesis), true);

    assert.equal(processMatchesMap({
        name: 'ShooterGameServer',
        command: '/srv/ark/serverfiles/ShooterGame/Binaries/Linux/ShooterGameServer',
        params: 'TheIsland?RCONPort=27021 -Port=7780 -QueryPort=27016',
    }, genesis), false);

    assert.equal(processMatchesMap({
        name: 'tmux',
        command: 'tmux',
        params: 'new-session ./ObeliskRun.sh Gen2?RCONPort=27022 -Port=7783 -QueryPort=27017 ShooterGameServer',
    }, genesis), false);
});

test('json updates wait for filesystem locks and clean up lock directories', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-json-lock-'));
    const jsonPath = path.join(root, 'state.json');
    const lockPath = `${jsonPath}.lock`;
    process.env.NODE_ENV = 'test';
    const { updateJsonFile } = require('../server');

    try {
        await fsp.writeFile(jsonPath, JSON.stringify({ count: 1 }));
        await fsp.mkdir(lockPath);

        const started = Date.now();
        const release = setTimeout(() => {
            fsp.rm(lockPath, { recursive: true, force: true }).catch(() => {});
        }, 80);

        const next = await updateJsonFile(jsonPath, {}, current => ({ count: current.count + 1 }));
        clearTimeout(release);

        assert.equal(next.count, 2);
        assert.ok(Date.now() - started >= 50);
        assert.deepEqual(JSON.parse(await fsp.readFile(jsonPath, 'utf8')), { count: 2 });
        assert.equal(fs.existsSync(lockPath), false);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('json updates fail closed instead of overwriting malformed state', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-json-corrupt-'));
    const jsonPath = path.join(root, 'state.json');
    process.env.NODE_ENV = 'test';
    const { updateJsonFile } = require('../server');

    try {
        await fsp.writeFile(jsonPath, '{"count":');

        await assert.rejects(
            updateJsonFile(jsonPath, {}, current => ({ count: (current.count || 0) + 1 })),
            /Failed to read JSON state state\.json/
        );
        assert.equal(await fsp.readFile(jsonPath, 'utf8'), '{"count":');
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('json atomic writes fsync temp files and containing directories', async () => {
    const source = await fsp.readFile(path.join(__dirname, '..', 'server.js'), 'utf8');
    const match = source.match(/async function writeJsonAtomic\(filePath, value\) \{[\s\S]*?\n\}/);
    assert.ok(match, 'writeJsonAtomic should exist');
    const body = match[0];

    assert.match(body, /const dirPath = path\.dirname\(filePath\)/);
    assert.match(body, /await fs\.open\(tmpPath, 'w', 0o600\)/);
    assert.match(body, /await handle\.writeFile\(JSON\.stringify\(value, null, 2\)\)/);
    assert.match(body, /await handle\.sync\(\)/);
    assert.match(body, /await fs\.rename\(tmpPath, filePath\)/);
    assert.match(body, /await fsyncDirectory\(dirPath\)/);
    assert.match(body, /await fs\.rm\(tmpPath, \{ force: true \}\)\.catch\(\(\) => \{\}\)/);
});

test('production readiness checks every configured map instead of sampling inventory', async () => {
    const source = await fsp.readFile(path.join(__dirname, '..', 'server.js'), 'utf8');
    const readinessMatch = source.match(/async function collectProductionReadiness\(\) \{[\s\S]*?\n\}/);
    assert.ok(readinessMatch, 'collectProductionReadiness should exist');
    const readinessSource = readinessMatch[0];

    assert.match(readinessSource, /for \(const map of CLUSTER_MAPS\)/);
    assert.doesNotMatch(readinessSource, /CLUSTER_MAPS\.slice\(/);
    assert.doesNotMatch(readinessSource, /map_readiness_limit/);
    assert.doesNotMatch(readinessSource, /Mapas restantes/);
});

test('atomic text updates create backups and preserve concurrent changes', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-atomic-text-'));
    const filePath = path.join(root, 'GameUserSettings.ini');
    process.env.NODE_ENV = 'test';
    const { updateTextFileAtomic } = require('../server');

    try {
        await fsp.writeFile(filePath, '[ServerSettings]\nInitial=True\n');

        await Promise.all([
            updateTextFileAtomic(filePath, content => `${content}A=True\n`),
            updateTextFileAtomic(filePath, content => `${content}B=True\n`),
            updateTextFileAtomic(filePath, content => `${content}C=True\n`),
        ]);

        const persisted = await fsp.readFile(filePath, 'utf8');
        assert.match(persisted, /Initial=True/);
        assert.match(persisted, /A=True/);
        assert.match(persisted, /B=True/);
        assert.match(persisted, /C=True/);

        const backup = await fsp.readFile(`${filePath}.bak`, 'utf8');
        assert.match(backup, /Initial=True/);
        assert.equal(fs.existsSync(`${filePath}.lock`), false);
        const leftovers = (await fsp.readdir(root)).filter(name => name.includes('.tmp'));
        assert.deepEqual(leftovers, []);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('game user settings normalizer keeps MOTD message on one physical line', async () => {
    process.env.NODE_ENV = 'test';
    const { normalizeGameUserSettingsContent } = require('../server');
    const input = [
        '[ServerSettings]',
        'ServerName=Flow',
        '',
        '[MessageOfTheDay]',
        'Message=<RichColor Color="0, 1, 1, 1">Welcome to ARK FLOW',
        'ERRORS MAY OCCUR</>\\n<RichColor Color="1, 1, 0, 1">Bienvenido a ARK FLOW',
        'POSIBLES ERRORES</>',
        'Duration=20',
        '',
    ].join('\n');

    const normalized = normalizeGameUserSettingsContent(input);
    const lines = normalized.split('\n');
    const messageIndex = lines.findIndex(line => line.startsWith('Message='));

    assert.notEqual(messageIndex, -1);
    assert.equal(lines[messageIndex + 1], 'Duration=20');
    assert.match(lines[messageIndex], /Welcome to ARK FLOW\\nERRORS MAY OCCUR/);
    assert.match(lines[messageIndex], /Bienvenido a ARK FLOW\\nPOSIBLES ERRORES/);
});

test('game user settings normalizer stops multiline MOTD before the next ini key', async () => {
    process.env.NODE_ENV = 'test';
    const { normalizeGameUserSettingsContent } = require('../server');
    const input = [
        '[MessageOfTheDay]',
        'Message=Line one',
        'Line two',
        'Duration=20',
        'OtherSetting=True',
        '',
    ].join('\n');

    const normalized = normalizeGameUserSettingsContent(input);
    const lines = normalized.split('\n');
    const messageIndex = lines.findIndex(line => line.startsWith('Message='));

    assert.equal(lines[messageIndex], 'Message=Line one\\nLine two');
    assert.equal(lines[messageIndex + 1], 'Duration=20');
    assert.equal(lines[messageIndex + 2], 'OtherSetting=True');
});

test('game user settings key updates repair existing multiline MOTD', async () => {
    process.env.NODE_ENV = 'test';
    const { normalizeGameUserSettingsContent, updateIniKey } = require('../server');
    const input = [
        '[ServerSettings]',
        'ServerPassword=old',
        '',
        '[MessageOfTheDay]',
        'Message=Line one',
        'Line two',
        'Duration=20',
        '',
    ].join('\n');

    const updated = updateIniKey(input, 'ServerSettings', 'ServerPassword', 'new');
    const normalized = normalizeGameUserSettingsContent(updated);
    const lines = normalized.split('\n');
    const messageIndex = lines.findIndex(line => line.startsWith('Message='));

    assert.match(normalized, /^ServerPassword=new$/m);
    assert.equal(lines[messageIndex], 'Message=Line one\\nLine two');
    assert.equal(lines[messageIndex + 1], 'Duration=20');
});

test('atomic multi-file updates lock every target and preserve backups', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ark-dashboard-atomic-multi-'));
    const gameIni = path.join(root, 'Game.ini');
    const gameUserSettings = path.join(root, 'GameUserSettings.ini');
    process.env.NODE_ENV = 'test';
    const { updateTextFilesAtomic } = require('../server');

    try {
        await fsp.writeFile(gameIni, 'GameInitial=True\n');
        await fsp.writeFile(gameUserSettings, 'GUSInitial=True\n');

        await Promise.all([
            updateTextFilesAtomic([gameIni, gameUserSettings], files => ({
                [path.resolve(gameIni)]: `${files[path.resolve(gameIni)]}A=True\n`,
                [path.resolve(gameUserSettings)]: `${files[path.resolve(gameUserSettings)]}A=True\n`,
            })),
            updateTextFilesAtomic([gameUserSettings, gameIni], files => ({
                [path.resolve(gameIni)]: `${files[path.resolve(gameIni)]}B=True\n`,
                [path.resolve(gameUserSettings)]: `${files[path.resolve(gameUserSettings)]}B=True\n`,
            })),
        ]);

        assert.match(await fsp.readFile(gameIni, 'utf8'), /A=True[\s\S]*B=True|B=True[\s\S]*A=True/);
        assert.match(await fsp.readFile(gameUserSettings, 'utf8'), /A=True[\s\S]*B=True|B=True[\s\S]*A=True/);
        assert.match(await fsp.readFile(`${gameIni}.bak`, 'utf8'), /GameInitial=True/);
        assert.match(await fsp.readFile(`${gameUserSettings}.bak`, 'utf8'), /GUSInitial=True/);
        assert.equal(fs.existsSync(`${gameIni}.lock`), false);
        assert.equal(fs.existsSync(`${gameUserSettings}.lock`), false);
    } finally {
        await fsp.rm(root, { recursive: true, force: true });
    }
});

test('server binds localhost by default for reverse-proxy deployments', () => {
    process.env.NODE_ENV = 'test';
    const { HOST } = require('../server');
    assert.equal(HOST, '127.0.0.1');
});

test('development JWT fallback is ephemeral and never reads or writes a source checkout credential', () => {
    const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const implementation = source.match(/function getJwtSecret\(\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(implementation);
    const getSecret = require('node:vm').runInNewContext(`${implementation}\ngetJwtSecret`, {
        process: { env: {} }, IS_PRODUCTION: false,
        crypto: require('node:crypto'), console: { warn() {} },
        require: () => { throw new Error('filesystem access is forbidden in ephemeral fallback'); },
    });
    const first = getSecret();
    const second = getSecret();
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.match(second, /^[a-f0-9]{64}$/);
    assert.notEqual(first, second);
});
