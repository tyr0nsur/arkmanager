const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const net = require('net');
const { execFile } = require('child_process');
const { GameDig } = require('gamedig');
const si = require('systeminformation');
const { Rcon } = require('rcon-client');
const ini = require('ini');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fsConstants = require('fs').constants;

const app = express();
const HOST = process.env.HOST || '127.0.0.1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';
const DISCORD_AUTH_ONLY = Boolean(process.env.OBELISK_OIDC_CONFIG_FILE);
const nodeCron = require('node-cron');
const cron = IS_TEST ? { validate: nodeCron.validate, schedule: () => ({ stop() {} }) } : nodeCron;
const SESSION_COOKIE_NAME = IS_PRODUCTION ? '__Host-session' : 'session';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_JWT_EXPIRES_IN = '24h';

function parseIntegerEnv(name, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = process.env[name];
    if (typeof raw === 'undefined' || raw === '') return defaultValue;
    const normalized = String(raw).trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    const value = Number(normalized);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}

const TEST_TIMEOUT_MIN_MS = IS_TEST ? 1 : 1000;
const PORT = parseIntegerEnv('PORT', 3040, { min: 0, max: 65535 });
const TRUST_PROXY_HOPS = parseIntegerEnv('TRUST_PROXY_HOPS', 0, { min: 0, max: 10 });
const RCON_CONNECT_TIMEOUT_MS = parseIntegerEnv('RCON_CONNECT_TIMEOUT_MS', 5000, { min: TEST_TIMEOUT_MIN_MS, max: 60000 });
const RCON_COMMAND_TIMEOUT_MS = parseIntegerEnv('RCON_COMMAND_TIMEOUT_MS', 5000, { min: TEST_TIMEOUT_MIN_MS, max: 60000 });
const GAMEDIG_TIMEOUT_MS = parseIntegerEnv('GAMEDIG_TIMEOUT_MS', 5000, { min: TEST_TIMEOUT_MIN_MS, max: 60000 });
const DISCORD_WEBHOOK_TIMEOUT_MS = parseIntegerEnv('DISCORD_WEBHOOK_TIMEOUT_MS', 3000, { min: TEST_TIMEOUT_MIN_MS, max: 30000 });
const RCON_RESPONSE_MAX_CHARS = parseIntegerEnv('RCON_RESPONSE_MAX_CHARS', 65536, { min: 1024, max: 1024 * 1024 });
const HTTP_REQUEST_TIMEOUT_MS = parseIntegerEnv('HTTP_REQUEST_TIMEOUT_MS', 30000, { min: 5000, max: 300000 });
const HTTP_HEADERS_TIMEOUT_MS = parseIntegerEnv('HTTP_HEADERS_TIMEOUT_MS', 10000, { min: 5000, max: 60000 });
const HTTP_KEEPALIVE_TIMEOUT_MS = parseIntegerEnv('HTTP_KEEPALIVE_TIMEOUT_MS', 5000, { min: 1000, max: 60000 });
if (HTTP_HEADERS_TIMEOUT_MS > HTTP_REQUEST_TIMEOUT_MS) {
    throw new Error('HTTP_HEADERS_TIMEOUT_MS must not exceed HTTP_REQUEST_TIMEOUT_MS');
}
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY_HOPS > 0 ? TRUST_PROXY_HOPS : false);

function normalizeRequestId(value) {
    const requestId = String(value || '').trim();
    return /^[A-Za-z0-9._:-]{8,128}$/.test(requestId) ? requestId : crypto.randomUUID();
}

app.use((req, res, next) => {
    req.requestId = normalizeRequestId(req.headers['x-request-id']);
    res.setHeader('X-Request-Id', req.requestId);
    next();
});

const DEPLOY_CAPABILITIES = Object.freeze({
    deployStart: {
        available: false,
        minRole: 'owner',
        platforms: ['linux', 'windows'],
        reason: 'El despliegue automático no está implementado en este servidor',
    },
    maintenance: {
        validate_steamcmd: {
            available: false,
            minRole: 'owner',
            platforms: ['linux', 'windows'],
            reason: 'La validación de SteamCMD no está conectada a un script gestionado seguro en este servidor',
        },
        clear_logs: {
            available: true,
            minRole: 'owner',
            destructive: true,
            platforms: ['linux', 'windows'],
            confirmation: 'TRUNCAR LOGS',
            reason: 'Trunca logs de consola ARK gestionados por el panel',
        },
        wipe_db: {
            available: false,
            minRole: 'owner',
            destructive: true,
            platforms: ['linux', 'windows'],
            reason: 'El wipe destructivo no está implementado desde el panel',
        },
    },
    wipe: {
        modes: {
            characters: {
                available: false,
                minPermission: 'wipe.execute',
                destructive: true,
                confirmation: 'WIPE CHARACTERS',
                reason: 'El borrado de personajes requiere un script validado por plataforma',
            },
            dinos: {
                available: false,
                minPermission: 'wipe.execute',
                destructive: true,
                confirmation: 'WIPE DINOS',
                reason: 'El borrado de dinos requiere un script validado por plataforma',
            },
            structures: {
                available: false,
                minPermission: 'wipe.execute',
                destructive: true,
                confirmation: 'WIPE STRUCTURES',
                reason: 'El borrado de estructuras requiere un script validado por plataforma',
            },
            full: {
                available: false,
                minPermission: 'wipe.execute',
                destructive: true,
                confirmation: 'WIPE FULL',
                reason: 'El wipe completo no está implementado desde el panel',
            },
        },
    },
});

const CLEAR_LOGS_CONFIRMATION = DEPLOY_CAPABILITIES.maintenance.clear_logs.confirmation;

function buildDeployCapabilities(clusterMaps = CLUSTER_MAPS) {
    const capabilities = JSON.parse(JSON.stringify(DEPLOY_CAPABILITIES));
    const platform = process.platform;
    const host = hostPlatformInfo(platform);
    const family = host.family;
    capabilities.host = host;
    capabilities.deploymentTargets = {
        linux: {
            label: 'Linux',
            current: family === 'linux',
            available: false,
            runtime: 'Obelisk',
            reason: family === 'linux'
                ? 'Preparado para integrar runtime Linux cuando Obelisk sea estable'
                : 'Oculto en este host porque el sistema operativo activo no es Linux',
        },
        windows: {
            label: 'Windows',
            current: family === 'windows',
            available: false,
            runtime: 'ArkApi',
            reason: family === 'windows'
                ? 'Preparado para instalaciones Windows con ArkApi cuando el flujo seguro exista'
                : 'Oculto en este host porque el sistema operativo activo no es Windows',
        },
    };
    const logTargets = Array.isArray(clusterMaps) ? clusterMaps.filter(map => map?.logPath) : [];
    capabilities.maintenance.clear_logs.available = logTargets.length > 0;
    capabilities.maintenance.clear_logs.targetCount = logTargets.length;
    if (logTargets.length === 0) {
        capabilities.maintenance.clear_logs.reason = 'No hay rutas de logs ARK gestionadas configuradas';
    }
    capabilities.nativeOrchestrator = {
        available: false,
        mode: 'planning',
        minRole: 'owner',
        layoutStrategy: 'shared-serverfiles',
        phases: ORCHESTRATOR_PHASES,
        reason: 'Preparado para planificar la migracion nativa; instalacion, migracion y ciclo de vida siguen bloqueados hasta tener runners seguros',
        workshopWarning: WORKSHOP_EPIC_WARNING,
    };
    capabilities.permissions = {
        catalog: PERMISSION_CATALOG,
        roleDefaults: ROLE_PERMISSION_DEFAULTS,
    };
    return capabilities;
}

const UNSAFE_PLACEHOLDER_SECRETS = new Set([
    'replace-with-32-plus-random-characters',
    'replace-with-a-long-one-time-password',
    'change-me',
    'changeme',
    'password',
    'secret',
]);

function isUnsafePlaceholderSecret(value) {
    return UNSAFE_PLACEHOLDER_SECRETS.has(String(value || '').trim().toLowerCase());
}

// --- Secure JWT Secret Resolution ---
// TODO(security): In production, use a proper secret management service (KMS).
function getJwtSecret() {
    if (process.env.JWT_SECRET_KEY) {
        if (IS_PRODUCTION && isUnsafePlaceholderSecret(process.env.JWT_SECRET_KEY)) {
            throw new Error('JWT_SECRET_KEY must not use a placeholder value in production');
        }
        if (IS_PRODUCTION && process.env.JWT_SECRET_KEY.length < 32) {
            throw new Error('JWT_SECRET_KEY must be at least 32 characters in production');
        }
        return process.env.JWT_SECRET_KEY;
    }
    if (IS_PRODUCTION) {
        throw new Error('JWT_SECRET_KEY is required in production');
    }
    // Development sessions deliberately expire on process restart. Never read or
    // create a credential in the source checkout, including a legacy symlink.
    console.warn('[SECURITY] Generating ephemeral JWT secret. Instance-isolated! Set JWT_SECRET_KEY env var for production.');
    return crypto.randomBytes(32).toString('hex');
}
const JWT_SECRET = getJwtSecret();

// Strict CORS allow-list. Override with comma-separated CORS_ORIGINS in production.
if (IS_PRODUCTION && !process.env.CORS_ORIGINS) {
    throw new Error('CORS_ORIGINS is required in production');
}
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3040,http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
function isWellFormedCorsOrigin(origin) {
    try {
        const parsed = new URL(origin);
        return ['http:', 'https:'].includes(parsed.protocol) &&
            parsed.pathname === '/' &&
            parsed.search === '' &&
            parsed.hash === '' &&
            parsed.username === '' &&
            parsed.password === '';
    } catch (_) {
        return false;
    }
}
if (IS_PRODUCTION && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include at least one HTTPS origin');
}
if (corsOrigins.some(origin => origin === '*' || origin.toLowerCase() === 'null' || !isWellFormedCorsOrigin(origin))) {
    throw new Error('CORS_ORIGINS entries must be exact URL origins without paths, wildcards, or null origins');
}
if (IS_PRODUCTION && corsOrigins.some(origin => !/^https:\/\//i.test(origin))) {
    throw new Error('CORS_ORIGINS entries must use https in production');
}
if (IS_PRODUCTION && corsOrigins.some(origin => /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/i.test(origin))) {
    throw new Error('CORS_ORIGINS must not include localhost origins in production');
}
const corsOriginSet = new Set(corsOrigins);
app.use(cors({
    origin(origin, callback) {
        if (!origin || corsOriginSet.has(origin)) {
            callback(null, true);
            return;
        }
        callback(null, false);
    },
    credentials: true,
}));

app.use('/api', (req, res, next) => {
    const bodyBearingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const hasBody = Number(req.headers['content-length'] || 0) > 0 || Boolean(req.headers['transfer-encoding']);
    if (bodyBearingMethod && hasBody && !req.is('application/json')) {
        return res.status(415).json({ error: 'Los cuerpos de API deben usar application/json' });
    }
    next();
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
    }
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'JSON de petición inválido' });
    }
    return next(err);
});

app.use('/api', (req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});

// Security headers with Helmet
app.use(helmet({
    frameguard: {
        action: 'deny',
    },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
        }
    }
}));

app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), clipboard-write=(self)');
    next();
});

app.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
});

function createJsonRateLimitHandler(message) {
    return (req, res) => {
        res.status(429).json({ error: message });
    };
}

const API_RATE_LIMIT_OPTIONS = Object.freeze({
    windowMs: 15 * 60 * 1000,
    max: parseIntegerEnv('API_MUTATION_RATE_LIMIT_MAX', 300, { min: 30, max: 10000 }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: createJsonRateLimitHandler('Demasiadas peticiones a la API'),
});

const API_READ_RATE_LIMIT_OPTIONS = Object.freeze({
    windowMs: 15 * 60 * 1000,
    max: parseIntegerEnv('API_READ_RATE_LIMIT_MAX', 3000, { min: 300, max: 50000 }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: createJsonRateLimitHandler('Demasiadas peticiones de lectura a la API'),
});

const AUTH_RATE_LIMIT_OPTIONS = Object.freeze({
    windowMs: 15 * 60 * 1000,
    max: parseIntegerEnv('AUTH_RATE_LIMIT_MAX', 20, { min: 5, max: 200 }),
    standardHeaders: true,
    legacyHeaders: false,
    handler: createJsonRateLimitHandler('Demasiados intentos de autenticación'),
});

// Rate limiting
if (!IS_TEST) {
    const authLimiter = rateLimit(AUTH_RATE_LIMIT_OPTIONS);
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/oidc/', authLimiter);

    const apiReadLimiter = rateLimit({
        ...API_READ_RATE_LIMIT_OPTIONS,
        skip: req => !['GET', 'HEAD', 'OPTIONS'].includes(req.method),
    });
    app.use('/api/', apiReadLimiter);

    const apiMutationLimiter = rateLimit({
        ...API_RATE_LIMIT_OPTIONS,
        skip: req => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.originalUrl.startsWith('/api/auth/login'),
    });
    app.use('/api/', apiMutationLimiter);
}

// Minimal unauthenticated healthcheck for nginx/systemd/API monitoring. Keep
// this before CSRF so probes do not mint dashboard cookies.
function sendPublicHealthcheck(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime())
    });
}

app.get(['/healthz', '/api/health'], sendPublicHealthcheck);

function summarizeReadinessChecks(checks, status, limit = 5) {
    return checks
        .filter(check => check.status === status)
        .slice(0, limit)
        .map(check => ({
            id: check.id,
            label: check.label,
            status: check.status,
        }));
}

function isLoopbackRequest(req) {
    const candidates = [
        req.ip,
        req.socket?.remoteAddress,
        req.connection?.remoteAddress,
    ].filter(Boolean).map(value => String(value).replace(/^::ffff:/, ''));
    return candidates.some(address => address === '127.0.0.1' || address === '::1' || address === 'localhost');
}

app.get('/readyz', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!isLoopbackRequest(req)) {
        return res.status(403).json({ status: 'fail', error: 'Readiness is only available from loopback' });
    }

    try {
        const readiness = await collectProductionReadiness();
        const payload = {
            status: readiness.status,
            failed: readiness.failed,
            warnings: readiness.warnings,
            checkedAt: readiness.checkedAt,
            failedChecks: summarizeReadinessChecks(readiness.checks, 'fail'),
            warningChecks: summarizeReadinessChecks(readiness.checks, 'warn'),
        };
        return res.status(readiness.status === 'fail' ? 503 : 200).json(payload);
    } catch (err) {
        return res.status(503).json({ status: 'fail', error: 'Readiness check failed' });
    }
});

app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});

function issueCsrfCookie(req, res) {
    if (req.cookies['XSRF-TOKEN']) {
        return req.cookies['XSRF-TOKEN'];
    }
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
        sameSite: 'strict',
        secure: IS_PRODUCTION,
        path: '/',
        maxAge: SESSION_MAX_AGE_MS,
        priority: 'high'
    });
    return token;
}

function clearDashboardAuthCookies(res) {
    for (const secure of [true, false]) {
        res.clearCookie('__Host-session', { path: '/', sameSite: 'strict', secure });
        res.clearCookie('session', { path: '/', sameSite: 'strict', secure });
        res.clearCookie('XSRF-TOKEN', { path: '/', sameSite: 'strict', secure });
    }
}

// CSRF Middleware
app.use((req, res, next) => {
    if (req.path.startsWith('/assets/')) {
        return next();
    }

    const hasCsrfCookie = Boolean(req.cookies['XSRF-TOKEN']);
    const isApiRequest = req.path.startsWith('/api/');

    // Generate tokens for SPA documents only. API reads/errors and failed
    // logins should remain side-effect free; successful login issues a token
    // explicitly after credentials and IP policy pass.
    if (!hasCsrfCookie && !isApiRequest) {
        req.csrfToken = issueCsrfCookie(req, res);
    } else {
        req.csrfToken = req.cookies['XSRF-TOKEN'];
    }

    // Verify on state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) &&
        !req.path.startsWith('/api/auth/login') &&
        !req.path.startsWith('/api/auth/logout')) {
        const tokenHeader = req.headers['x-xsrf-token'];
        if (!tokenHeader || tokenHeader !== req.csrfToken) {
            return res.status(403).json({ error: 'CSRF token missing or invalid' });
        }
    }
    next();
});

// --- Cluster Maps Configuration ---
const DATA_DIR = path.resolve(process.env.DASHBOARD_DATA_DIR || path.join(__dirname, 'data'));
const ARK_ROOT = path.resolve(process.env.ARK_ROOT || path.join(DATA_DIR, 'ark'));
const NODES_PATH = path.join(DATA_DIR, 'nodes.json');
let CLUSTER_MAPS = [];
let VALID_MAP_IDS = [];
let CLUSTER_MAPS_LOAD_ERROR = '';
const nativeMonitor = require('./monitor').createMonitorService({ getMaps: () => CLUSTER_MAPS });

function envPathList(name, defaults = []) {
    const value = process.env[name];
    const entries = value ? value.split(',') : defaults;
    return entries
        .map(entry => String(entry).trim())
        .filter(Boolean)
        .map(entry => path.resolve(entry));
}

function isPathInsideAllowedRoots(filePath, roots) {
    if (!filePath || typeof filePath !== 'string' || /[\0-\x1F\x7F]/.test(filePath)) return false;
    const target = path.resolve(filePath);
    return roots.some(root => target === root || target.startsWith(`${root}${path.sep}`));
}

function allowedArkScriptRoots() {
    return envPathList('ARK_SCRIPT_ROOTS', [ARK_ROOT]);
}

function allowedArkConfigRoots() {
    return envPathList('ARK_CONFIG_ROOTS', [process.env.FILE_MANAGER_GAME_ROOT || path.join(ARK_ROOT, 'serverfiles/ShooterGame/Saved/Config/LinuxServer')]);
}

function allowedArkLogRoots() {
    return envPathList('ARK_LOG_ROOTS', [path.join(ARK_ROOT, 'serverfiles/ShooterGame/Saved/Logs')]);
}

function isSafeMapId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

function isSafeHost(host) {
    return typeof host === 'string' &&
        host.length > 0 &&
        host.length <= 253 &&
        !/[\s/\\\0-\x1F\x7F]/.test(host);
}

function normalizePort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function normalizeProcessAlias(value) {
    const alias = String(value || '').trim();
    if (!alias || alias.length > 100 || /[\0-\x1F\x7F]/.test(alias)) return null;
    return alias;
}

function normalizeProcessAliases(value) {
    const entries = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? value.split(',') : []);
    const seen = new Set();
    const aliases = [];
    for (const entry of entries) {
        const alias = normalizeProcessAlias(entry);
        if (!alias) continue;
        const key = alias.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        aliases.push(alias);
    }
    return aliases;
}

function normalizeClusterMap(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.monitor_file !== undefined && (typeof raw.monitor_file !== 'string' || raw.monitor_file.length > 1024 ||
        !path.isAbsolute(raw.monitor_file) || path.resolve(raw.monitor_file) !== raw.monitor_file || raw.monitor_file.includes('\0'))) return null;
    const id = String(raw.id || '').trim();
    if (!isSafeMapId(id)) return null;

    const name = String(raw.name || raw.mapName || id).trim();
    if (!name || name.length > 100 || /[\0-\x1F\x7F]/.test(name)) return null;

    const gamePort = normalizePort(raw.gamePort);
    const queryPort = normalizePort(raw.queryPort);
    const rconPort = normalizePort(raw.rconPort);
    if (!gamePort || !queryPort || !rconPort) return null;

    const script = typeof raw.script === 'string' && raw.script.trim()
        ? raw.script.trim()
        : (typeof raw.scriptName === 'string' && raw.scriptName.trim() ? raw.scriptName.trim() : '');
    if (!isPathInsideAllowedRoots(script, allowedArkScriptRoots())) return null;

    const gameIni = typeof raw.gameIni === 'string' ? raw.gameIni.trim() : '';
    const gameUserSettings = typeof raw.gameUserSettings === 'string' ? raw.gameUserSettings.trim() : '';
    if (!isPathInsideAllowedRoots(gameIni, allowedArkConfigRoots())) return null;
    if (!isPathInsideAllowedRoots(gameUserSettings, allowedArkConfigRoots())) return null;

    const host = isSafeHost(raw.host) ? raw.host.trim() : '127.0.0.1';
    const logPath = typeof raw.logPath === 'string' && raw.logPath.trim() ? raw.logPath.trim() : '';
    if (logPath && !isPathInsideAllowedRoots(logPath, allowedArkLogRoots())) return null;

    const processAliases = normalizeProcessAliases(raw.processAliases || raw.processNames || raw.mapAliases);

    return {
        ...raw,
        id,
        name,
        processAliases,
        host,
        gamePort,
        queryPort,
        rconPort,
        script,
        gameIni,
        gameUserSettings,
        ...(logPath ? { logPath } : {})
    };
}

function normalizeClusterMaps(rawMaps) {
    if (!Array.isArray(rawMaps)) return [];
    const seen = new Set();
    const maps = [];
    for (const raw of rawMaps) {
        const map = normalizeClusterMap(raw);
        if (!map || seen.has(map.id)) continue;
        seen.add(map.id);
        maps.push(map);
    }
    return maps;
}

function compactIdentifier(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function processCommandText(processInfo) {
    return `${processInfo?.name || ''} ${processInfo?.command || ''} ${processInfo?.params || ''}`;
}

function isShooterGameProcess(processInfo) {
    return `${processInfo?.name || ''} ${processInfo?.command || ''}`.toLowerCase().includes('shootergame');
}

function processMatchCandidates(map) {
    const aliases = [
        ...(Array.isArray(map?.processAliases) ? map.processAliases : []),
        map?.name,
        map?.id,
    ];
    const noSpaceName = String(map?.name || '').replace(/\s+/g, '');
    if (noSpaceName) aliases.push(noSpaceName);

    const text = new Set();
    const compact = new Set();
    for (const alias of aliases) {
        const normalized = normalizeProcessAlias(alias);
        if (!normalized) continue;
        text.add(normalized.toLowerCase());
        const compacted = compactIdentifier(normalized);
        if (compacted.length >= 3) compact.add(compacted);
    }
    return { text: [...text], compact: [...compact] };
}

function commandHasExactPort(command, portName, port) {
    const normalizedPort = normalizePort(port);
    if (!normalizedPort) return false;
    const escapedName = String(portName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${escapedName}=${normalizedPort}(?:$|[^0-9])`, 'i').test(command);
}

function processMatchesMap(processInfo, map) {
    if (!isShooterGameProcess(processInfo)) return false;
    const command = processCommandText(processInfo).toLowerCase();
    if (
        commandHasExactPort(command, 'port', map?.gamePort) ||
        commandHasExactPort(command, 'queryport', map?.queryPort) ||
        commandHasExactPort(command, 'rconport', map?.rconPort)
    ) {
        return true;
    }

    const commandCompact = compactIdentifier(command);
    const candidates = processMatchCandidates(map);
    return candidates.text.some(candidate => command.includes(candidate)) ||
        candidates.compact.some(candidate => commandCompact.includes(candidate));
}

function findMapProcess(map, processList = []) {
    return (Array.isArray(processList) ? processList : []).find(processInfo => processMatchesMap(processInfo, map));
}

function loadClusterMaps() {
    const fsSync = require('fs');
    CLUSTER_MAPS = [];
    VALID_MAP_IDS = [];
    CLUSTER_MAPS_LOAD_ERROR = '';

    try {
        if (!fsSync.existsSync(NODES_PATH)) {
            throw new Error(`nodes.json is required at ${NODES_PATH}`);
        }

        const data = fsSync.readFileSync(NODES_PATH, 'utf8');
        const rawMaps = JSON.parse(data);
        if (!Array.isArray(rawMaps)) {
            throw new Error('nodes.json must contain an array of cluster maps');
        }

        const maps = normalizeClusterMaps(rawMaps);
        if (maps.length === 0) {
            throw new Error('nodes.json must contain at least one valid cluster map');
        }
        if (maps.length !== rawMaps.length) {
            throw new Error(`nodes.json contains ${rawMaps.length - maps.length} invalid or duplicate map entr${rawMaps.length - maps.length === 1 ? 'y' : 'ies'}`);
        }

        CLUSTER_MAPS = maps;
        VALID_MAP_IDS = CLUSTER_MAPS.map(m => m.id);
    } catch (e) {
        CLUSTER_MAPS_LOAD_ERROR = e?.message || 'Error reading nodes.json';
        console.error('[CONFIG] Error reading nodes.json:', CLUSTER_MAPS_LOAD_ERROR);
        if (IS_PRODUCTION) {
            throw e;
        }
    }
}
loadClusterMaps();

function getMapConfig(mapId) {
    const map = CLUSTER_MAPS.find(m => m.id === mapId);
    if (!map) throw new Error(`Unknown map: ${mapId}`);
    return map;
}

const ADMINS_PATH = path.join(DATA_DIR, 'admins.json');
const BANS_PATH = path.join(DATA_DIR, 'bans.json');
const AUDIT_PATH = path.join(DATA_DIR, 'audit.json');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const PLAYERS_DB_PATH = path.join(DATA_DIR, 'players_db.json');
const GLOBAL_SETTINGS_PATH = path.join(DATA_DIR, 'global_settings.json');
const ORCHESTRATOR_CONFIG_PATH = path.join(DATA_DIR, 'orchestrator_config.json');
const DASHBOARD_BACKUP_DIR = process.env.FLOWARK_DASHBOARD_BACKUP_DIR || path.join(DATA_DIR, 'backups');
const INGAME_ADMINS_PATH = process.env.INGAME_ADMINS_PATH || path.join(ARK_ROOT, 'serverfiles/ShooterGame/Saved/AllowedCheaterSteamIDs.txt');
const PLUGIN_MANAGER_OBELISK_ROOT = process.env.PLUGIN_MANAGER_OBELISK_ROOT || process.env.OBELISK_ROOT || path.join(ARK_ROOT, 'obelisk');
const PLUGIN_MANAGER_ARKAPI_ROOT = process.env.PLUGIN_MANAGER_ARKAPI_ROOT || process.env.ARKAPI_ROOT || path.join(ARK_ROOT, 'ArkApi');
const CLIENT_DIST = path.join(__dirname, '../client/dist');
const DASHBOARD_ROOT = path.resolve(__dirname, '..');

const ROLE_LEVELS = { viewer: 0, operator: 1, owner: 2 };
const PERMISSION_CATALOG = Object.freeze({
    'obelisk.plugins.manage': { label: 'Gestionar plugins ObeliskNative', minRole: 'owner' },
    'deploy.view': { label: 'Ver deployer', minRole: 'owner' },
    'deploy.future': { label: 'Preparar despliegues futuros', minRole: 'owner' },
    'orchestrator.view': { label: 'Ver orquestador nativo', minRole: 'owner' },
    'orchestrator.configure': { label: 'Configurar orquestador nativo', minRole: 'owner' },
    'maintenance.logs.clear': { label: 'Truncar logs ARK', minRole: 'owner' },
    'wipe.plan': { label: 'Ver planes de wipe', minRole: 'owner' },
    'wipe.execute': { label: 'Ejecutar wipes', minRole: 'owner' },
});
const ROLE_PERMISSION_DEFAULTS = Object.freeze({
    viewer: [],
    operator: [],
    owner: Object.keys(PERMISSION_CATALOG),
});
const REDACTED_SECRET = '[REDACTED]';
const ARK_SECRET_KEYS = ['ServerAdminPassword', 'ServerPassword', 'SpectatorPassword'];
const STEAM_ID_PATTERN = /^\d{10,25}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_BYTES = 72;
const RUNTIME_ID_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;
const ARK_CLASS_PATTERN = /^[A-Za-z0-9_./-]{1,200}$/;
const TASK_ACTIONS = new Set(['Broadcast', 'SaveWorld', 'DoExit']);
const TASK_MIN_INTERVAL_MINUTES = { Broadcast: 5, SaveWorld: 15, DoExit: 60 };
const OBELISK_SAFE_MARKERS = {
    'disable-plugins': 'Desactiva la carga de plugins en la instancia',
    'enable-process-event-hook': 'Activa el hook ProcessEvent del runtime',
    'enable-chat-reflection': 'Activa reflexión de chat si el runtime instalado lo soporta',
    'enable-inventory-reflection': 'Activa reflexión de inventario si el runtime instalado lo soporta',
    'enable-structure-reflection': 'Activa reflexión de estructuras si el runtime instalado lo soporta',
};
const ORCHESTRATOR_PHASES = Object.freeze([
    {
        id: 'root-preflight',
        label: 'Ruta base',
        status: 'planning',
        reason: 'Validacion de disco, permisos y layout antes de crear nada',
    },
    {
        id: 'steamcmd',
        label: 'SteamCMD',
        status: 'blocked',
        reason: 'Pendiente de runner seguro con lock global',
    },
    {
        id: 'serverfiles',
        label: 'Serverfiles compartidos',
        status: 'blocked',
        reason: 'Pendiente de instalacion/actualizacion atomica sin duplicar mapas',
    },
    {
        id: 'instances',
        label: 'Instancias nativas',
        status: 'blocked',
        reason: 'Pendiente de generador de configs, parametros y PID propio',
    },
    {
        id: 'plugins',
        label: 'Runtime plugins',
        status: 'blocked',
        reason: 'Obelisk se habilitara en Linux cuando el SDK estable este completo; ArkApi aplica solo en Windows',
    },
    {
        id: 'workshop',
        label: 'Steam Workshop',
        status: 'optional',
        reason: 'Opcional; requiere aviso Epic antes de activarse',
    },
]);
const ORCHESTRATOR_CONFIG_DEFAULTS = Object.freeze({
    enabled: false,
    mode: 'planning',
    arkRoot: '',
    serverFilesStrategy: 'shared',
    cluster: {
        enabled: true,
        id: '',
    },
    runtimes: {
        linux: 'obelisk',
        windows: 'arkapi',
    },
    workshopMods: {
        enabled: false,
        ids: [],
        epicWarningAccepted: false,
    },
    migration: {
        source: 'linuxgsm',
        status: 'planning',
        importedAt: '',
    },
});
const WORKSHOP_EPIC_WARNING = 'Los mods de Steam Workshop requieren cliente Steam. Si activas mods de Steam, los usuarios de Epic Games no podran entrar en ese servidor.';
const ORCHESTRATOR_MIN_FREE_BYTES = 20 * 1024 * 1024 * 1024;
const ORCHESTRATOR_WARN_FREE_BYTES = 60 * 1024 * 1024 * 1024;
const GLOBAL_SETTINGS_DEFAULTS = Object.freeze({
    discordWebhookAlerts: '',
    discordWebhookBans: '',
    adminIpWhitelist: '',
    TamingSpeedMultiplier: '1',
    HarvestAmountMultiplier: '1',
    XPMultiplier: '1',
    MatingIntervalMultiplier: '1',
    EggHatchSpeedMultiplier: '1',
    BabyMatureSpeedMultiplier: '1',
    serverPvE: false,
    crossplay: true,
    maxPlayersDefault: '70',
});
const GLOBAL_MULTIPLIER_FIELDS = Object.freeze({
    TamingSpeedMultiplier: { min: 0.01, max: 1000 },
    HarvestAmountMultiplier: { min: 0.01, max: 1000 },
    XPMultiplier: { min: 0.01, max: 1000 },
    MatingIntervalMultiplier: { min: 0.001, max: 1000 },
    EggHatchSpeedMultiplier: { min: 0.01, max: 1000 },
    BabyMatureSpeedMultiplier: { min: 0.01, max: 1000 },
});
const GLOBAL_BOOLEAN_FIELDS = Object.freeze(['serverPvE', 'crossplay']);

function isValidRole(role) {
    return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, role);
}

function normalizeRole(role, fallback = 'viewer') {
    return isValidRole(role) ? role : fallback;
}

function normalizePermissionList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(permission => String(permission || '').trim()).filter(permission => PERMISSION_CATALOG[permission]))].sort();
}

function normalizeAdminPermissions(admin) {
    const raw = admin?.permissions && typeof admin.permissions === 'object' && !Array.isArray(admin.permissions)
        ? admin.permissions
        : {};
    return {
        allow: normalizePermissionList(raw.allow),
        deny: normalizePermissionList(raw.deny),
    };
}

function effectiveAdminPermissions(admin) {
    const role = normalizeRole(admin?.role);
    const permissions = new Set(ROLE_PERMISSION_DEFAULTS[role] || []);
    const overrides = normalizeAdminPermissions(admin);
    for (const permission of overrides.allow) permissions.add(permission);
    for (const permission of overrides.deny) permissions.delete(permission);
    return [...permissions].sort();
}

function publicAdmin(admin) {
    return {
        id: admin.id,
        username: admin.username,
        discordId: admin.discordId || null,
        lastLoginAt: admin.lastLoginAt || null,
        status: admin.discordId ? (admin.lastLoginAt ? 'active' : 'invited') : 'unlinked',
        role: normalizeRole(admin.role),
        permissions: normalizeAdminPermissions(admin),
        effectivePermissions: effectiveAdminPermissions(admin),
    };
}

function adminSessionVersion(admin) {
    const version = Number(admin?.sessionVersion || 0);
    return Number.isInteger(version) && version >= 0 ? version : 0;
}

function dashboardPasswordError(password, label = 'La contraseña', language = 'es') {
    if (language === 'en') {
        if (typeof password !== 'string') return `${label} is required`;
        if (password.length < PASSWORD_MIN_LENGTH) return `${label} must be at least ${PASSWORD_MIN_LENGTH} characters`;
        if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `${label} must be ${PASSWORD_MAX_BYTES} bytes or less`;
        return null;
    }
    if (typeof password !== 'string') return `${label} es obligatoria`;
    if (password.length < PASSWORD_MIN_LENGTH) return `${label} debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`;
    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `${label} debe ocupar ${PASSWORD_MAX_BYTES} bytes o menos`;
    return null;
}

function normalizeLoginPayload(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') return null;
    const normalizedUsername = username.trim();
    if (!normalizedUsername || normalizedUsername.length > 32) return null;
    if (!password || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return null;
    return { username: normalizedUsername, password };
}

function requireRole(requiredRole) {
    return (req, res, next) => {
        const userRole = normalizeRole(req.user?.role);
        if (ROLE_LEVELS[userRole] < ROLE_LEVELS[requiredRole]) {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        next();
    };
}

function hasRole(user, requiredRole) {
    return ROLE_LEVELS[normalizeRole(user?.role)] >= ROLE_LEVELS[requiredRole];
}

function hasPermission(user, permission) {
    if (!PERMISSION_CATALOG[permission]) return false;
    if (Array.isArray(user?.effectivePermissions)) return user.effectivePermissions.includes(permission);
    const role = normalizeRole(user?.role);
    return (ROLE_PERMISSION_DEFAULTS[role] || []).includes(permission);
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!hasPermission(req.user, permission)) {
            return res.status(403).json({ error: 'Permisos insuficientes' });
        }
        next();
    };
}

function publicMapStatusForUser(status, user) {
    if (hasRole(user, 'operator')) return status;
    const { playerList, cpu, ram, ...publicStatus } = status;
    return { ...publicStatus, playerList: [] };
}

function publicClusterMapForUser(map, user) {
    const publicMap = { id: map.id, name: map.name };
    if (hasRole(user, 'operator')) {
        publicMap.gamePort = map.gamePort;
        publicMap.queryPort = map.queryPort;
        publicMap.rconPort = map.rconPort;
    }
    return publicMap;
}

function publicClusterStatusErrorForUser(user) {
    const payload = { maps: [], error: 'Estado del cluster no disponible' };
    if (hasRole(user, 'operator')) {
        payload.cpu = 0;
        payload.ram = 0;
    }
    return payload;
}

function publicLiveStatusErrorForUser(user) {
    const errorStatus = {
        status: 'error',
        players: 0,
        maxPlayers: 0,
        map: 'Desconocido',
        playerList: [],
        cpu: 0,
        ram: 0,
        error: 'Estado del mapa no disponible',
    };
    const payload = publicMapStatusForUser(errorStatus, user);
    if (hasRole(user, 'operator')) {
        payload.sysCpu = 0;
        payload.sysRam = 0;
    }
    return payload;
}

function parseCronNumberList(field, min, max) {
    if (!/^\d+(?:,\d+)*$/.test(field)) return null;
    const values = field.split(',').map(value => Number.parseInt(value, 10));
    const uniqueValues = [...new Set(values)].sort((left, right) => left - right);
    if (uniqueValues.length !== values.length) return null;
    if (uniqueValues.some(value => value < min || value > max)) return null;
    return uniqueValues;
}

function regularIntervalFromList(field, min, max) {
    const values = parseCronNumberList(field, min, max);
    if (!values || values.length < 2 || values[0] !== min) return null;
    const interval = values[1] - values[0];
    if (interval < 1 || interval > max) return null;
    const expectedValues = [];
    for (let value = min; value <= max; value += interval) {
        expectedValues.push(value);
    }
    if (expectedValues.length !== values.length) return null;
    return expectedValues.every((value, index) => value === values[index]) ? interval : null;
}

function regularIntervalFromRange(field, min, max) {
    const match = field.match(/^(\d+)-(\d+)\/([1-9]\d*)$/);
    if (!match) return null;
    const rangeStart = Number.parseInt(match[1], 10);
    const rangeEnd = Number.parseInt(match[2], 10);
    const interval = Number.parseInt(match[3], 10);
    if (rangeStart !== min || rangeEnd !== max || interval < 1 || interval > max) return null;
    return interval;
}

function regularCyclicIntervalFromValues(values, min, max) {
    if (!values || values.length < 2) return null;
    const cycleLength = max - min + 1;
    const interval = values[1] - values[0];
    if (interval < 1 || interval > max || cycleLength % interval !== 0) return null;
    const expectedValues = [];
    for (let value = values[0]; value <= max; value += interval) {
        expectedValues.push(value);
    }
    if (expectedValues.length !== values.length) return null;
    const wrapsToStart = values[values.length - 1] + interval === values[0] + cycleLength;
    return wrapsToStart && expectedValues.every((value, index) => value === values[index]) ? interval : null;
}

function regularCyclicIntervalFromList(field, min, max) {
    return regularCyclicIntervalFromValues(parseCronNumberList(field, min, max), min, max);
}

function regularCyclicIntervalFromRange(field, min, max) {
    const match = field.match(/^(\d+)-(\d+)\/([1-9]\d*)$/);
    if (!match) return null;
    const rangeStart = Number.parseInt(match[1], 10);
    const rangeEnd = Number.parseInt(match[2], 10);
    const interval = Number.parseInt(match[3], 10);
    if (rangeStart < min || rangeEnd > max || rangeStart >= rangeEnd || interval < 1 || interval > max) return null;
    const values = [];
    for (let value = rangeStart; value <= rangeEnd; value += interval) {
        values.push(value);
    }
    return regularCyclicIntervalFromValues(values, min, max);
}

function regularCyclicIntervalFromSteppedStart(field, min, max) {
    const match = field.match(/^(\d+)\/([1-9]\d*)$/);
    if (!match) return null;
    const rangeStart = Number.parseInt(match[1], 10);
    const interval = Number.parseInt(match[2], 10);
    if (rangeStart < min || rangeStart > max || interval < 1 || interval > max) return null;
    const values = [];
    for (let value = rangeStart; value <= max; value += interval) {
        values.push(value);
    }
    return regularCyclicIntervalFromValues(values, min, max);
}

function isEveryCalendarField(field, min, max) {
    if (field === '*' || field === '*/1') return true;
    const rangeMatch = field.match(/^(\d+)-(\d+)$/);
    if (rangeMatch && Number.parseInt(rangeMatch[1], 10) === min && Number.parseInt(rangeMatch[2], 10) === max) return true;
    const values = parseCronNumberList(field, min, max);
    if (!values || values.length !== max - min + 1) return false;
    return values.every((value, index) => value === min + index);
}

function isFullNamedRange(field, names) {
    const normalizedField = String(field || '').trim().toUpperCase();
    return normalizedField === `${names[0]}-${names[names.length - 1]}`;
}

function isFullNamedList(field, names) {
    const normalizedField = String(field || '').trim().toUpperCase();
    if (!/^[A-Z]+(?:,[A-Z]+)*$/.test(normalizedField)) return false;
    const values = normalizedField.split(',');
    const uniqueValues = new Set(values);
    if (uniqueValues.size !== values.length || uniqueValues.size !== names.length) return false;
    return names.every(name => uniqueValues.has(name));
}

function isEveryMonthField(field) {
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return isEveryCalendarField(field, 1, 12)
        || isFullNamedRange(field, monthNames)
        || isFullNamedList(field, monthNames);
}

function isEveryDayOfWeekField(field) {
    if (isEveryCalendarField(field, 0, 6) || isEveryCalendarField(field, 1, 7) || field === '0-7') return true;
    const values = parseCronNumberList(field, 0, 7);
    if (values) {
        const normalizedValues = new Set(values.map(value => (value === 7 ? 0 : value)));
        if (normalizedValues.size === 7 && [0, 1, 2, 3, 4, 5, 6].every(value => normalizedValues.has(value))) return true;
    }
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return isFullNamedRange(field, dayNames) || isFullNamedList(field, dayNames);
}

function isEveryHourField(field) {
    return isEveryCalendarField(field, 0, 23);
}

function isEveryDaySchedule(dayOfMonth, month, dayOfWeek) {
    return isEveryCalendarField(dayOfMonth, 1, 31)
        && isEveryMonthField(month)
        && isEveryDayOfWeekField(dayOfWeek);
}

function cronMinuteInterval(cronExpr) {
    const fields = String(cronExpr || '').trim().split(/\s+/);
    if (fields.length !== 5) return null;

    const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields;
    const isEveryDay = isEveryDaySchedule(dayOfMonth, month, dayOfWeek);

    if (minuteField === '*') return 1;
    const stepMatch = minuteField.match(/^\*\/(\d+)$/);
    if (stepMatch) return Number.parseInt(stepMatch[1], 10);

    if (isEveryHourField(hourField) && isEveryDay) {
        const listedMinuteInterval = regularIntervalFromList(minuteField, 0, 59);
        if (listedMinuteInterval) return listedMinuteInterval;
        const rangedMinuteInterval = regularIntervalFromRange(minuteField, 0, 59);
        if (rangedMinuteInterval) return rangedMinuteInterval;
        const listedOffsetMinuteInterval = regularCyclicIntervalFromList(minuteField, 0, 59);
        if (listedOffsetMinuteInterval) return listedOffsetMinuteInterval;
        const rangedOffsetMinuteInterval = regularCyclicIntervalFromRange(minuteField, 0, 59);
        if (rangedOffsetMinuteInterval) return rangedOffsetMinuteInterval;
        const steppedStartMinuteInterval = regularCyclicIntervalFromSteppedStart(minuteField, 0, 59);
        if (steppedStartMinuteInterval) return steppedStartMinuteInterval;
    }

    if (minuteField === '0' && isEveryDay) {
        const listedHourlyInterval = regularIntervalFromList(hourField, 0, 23);
        if (listedHourlyInterval) return listedHourlyInterval * 60;
        const rangedHourlyInterval = regularIntervalFromRange(hourField, 0, 23);
        if (rangedHourlyInterval) return rangedHourlyInterval * 60;
        const listedOffsetHourlyInterval = regularCyclicIntervalFromList(hourField, 0, 23);
        if (listedOffsetHourlyInterval) return listedOffsetHourlyInterval * 60;
        const rangedOffsetHourlyInterval = regularCyclicIntervalFromRange(hourField, 0, 23);
        if (rangedOffsetHourlyInterval) return rangedOffsetHourlyInterval * 60;
        const steppedStartHourlyInterval = regularCyclicIntervalFromSteppedStart(hourField, 0, 23);
        if (steppedStartHourlyInterval) return steppedStartHourlyInterval * 60;
        const hourlyStepMatch = hourField.match(/^(?:\*|0)\/([1-9]\d*)$/);
        if (hourlyStepMatch) return Number.parseInt(hourlyStepMatch[1], 10) * 60;
        if (isEveryHourField(hourField)) return 60;
    }

    if (/^\d+$/.test(minuteField)) return 60;
    return null;
}

function validateScheduledTaskInput({ action, cronExpr, payload, mapId }, user) {
    if (!TASK_ACTIONS.has(action)) return 'Acción de tarea inválida';
    const fields = String(cronExpr || '').trim().split(/\s+/).filter(Boolean);
    if (fields.length === 6) return 'Las expresiones Cron con segundos no están permitidas';
    if (fields.length !== 5 || !cron.validate(cronExpr)) return 'Expresión Cron inválida';
    if (mapId && mapId !== 'all' && !VALID_MAP_IDS.includes(mapId)) return 'mapId inválido';
    if (action === 'Broadcast' && (!payload || typeof payload !== 'string' || payload.length > 500)) {
        return 'El mensaje de Broadcast es obligatorio y no puede superar 500 caracteres';
    }
    if (action === 'Broadcast' && !sanitizeRconText(payload)) {
        return 'El mensaje de Broadcast contiene caracteres de control no permitidos';
    }
    if (action === 'DoExit' && !hasRole(user, 'owner')) {
        return 'Las tareas DoExit requieren rol owner';
    }
    if (action === 'DoExit' && (!mapId || mapId === 'all')) {
        return 'Las tareas DoExit deben apuntar a un único mapa';
    }
    const minuteInterval = cronMinuteInterval(cronExpr);
    const minInterval = TASK_MIN_INTERVAL_MINUTES[action];
    if (minuteInterval !== null && minuteInterval < minInterval) {
        return `Las tareas ${action} deben ejecutarse con al menos ${minInterval} minutos de separación`;
    }
    return null;
}

function validateStoredScheduledTask(task) {
    if (!task || typeof task !== 'object') return 'Tarea guardada inválida';
    const mapId = task.mapId || 'all';
    return validateScheduledTaskInput({
        action: task.action,
        cronExpr: task.cron,
        payload: task.payload,
        mapId,
    }, { role: 'owner' });
}

function badRequest(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function parseBoundedIntegerParam(value, name, { defaultValue, min, max }) {
    if (typeof value === 'undefined' || value === '') return defaultValue;
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
        throw badRequest(`El parámetro ${name} debe estar entre ${min} y ${max}`);
    }
    return parsed;
}

function parseAuditFilterParam(value, name, { maxLength, pattern }) {
    if (typeof value === 'undefined' || value === '') return '';
    if (typeof value !== 'string') {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    if (/[\0-\x1F\x7F]/.test(value)) {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    const normalized = value.trim();
    if (!normalized) return '';
    if (normalized.length > maxLength || !pattern.test(normalized)) {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    return normalized;
}

function parseUuidParam(value, name) {
    const normalized = String(value || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    return normalized;
}

function parseSafeIdParam(value, name) {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(normalized)) {
        throw badRequest(`Parámetro ${name} inválido`);
    }
    return normalized;
}

function sanitizeRconText(value, maxLength = 500) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) return null;
    if (/[\0-\x1F\x7F]/.test(value)) return null;
    const sanitized = value.replace(/"/g, ' ').trim();
    return sanitized || null;
}

function publicRconResponse(response) {
    const text = String(response || '');
    if (text.length <= RCON_RESPONSE_MAX_CHARS) {
        return { response: text, responseTruncated: false };
    }
    return {
        response: text.slice(0, RCON_RESPONSE_MAX_CHARS),
        responseTruncated: true,
        originalLength: text.length,
    };
}

function isSafeArkClassName(value) {
    return typeof value === 'string' && ARK_CLASS_PATTERN.test(value);
}

function redactArkSecrets(content) {
    if (typeof content !== 'string') return { content, redacted: false };
    let redacted = false;
    const secretKeyPattern = ARK_SECRET_KEYS.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`^\\s*(${secretKeyPattern})\\s*=.*$`, 'gim');
    const safeContent = content.replace(regex, (line, key) => {
        redacted = true;
        const indent = line.match(/^\\s*/)?.[0] || '';
        return `${indent}${key}=${REDACTED_SECRET}`;
    });
    return { content: safeContent, redacted };
}

function containsRedactedSecret(content) {
    if (typeof content !== 'string') return false;
    const secretKeyPattern = ARK_SECRET_KEYS.map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const redactedPattern = REDACTED_SECRET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*(${secretKeyPattern})\\s*=\\s*["']?\\s*${redactedPattern}\\s*["']?(?:\\s*[#;].*)?$`, 'gim');
    return regex.test(content);
}

function normalizeGameUserSettingsContent(content) {
    if (typeof content !== 'string') return content;

    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const normalized = [];
    let inMessageOfTheDay = false;
    let collectingMessage = false;
    let messagePrefix = 'Message=';
    let messageParts = [];

    const flushMessage = () => {
        if (!collectingMessage) return;
        normalized.push(`${messagePrefix}${messageParts.map(part => part.trimEnd()).join('\\n')}`);
        collectingMessage = false;
        messagePrefix = 'Message=';
        messageParts = [];
    };
    const isMessageOfTheDayKey = line => /^\s*[A-Za-z0-9_.:-]+\s*=/.test(line);

    for (const line of lines) {
        const sectionHeader = line.match(/^\s*\[([^\]]+)\]\s*$/);

        if (collectingMessage) {
            if (sectionHeader || isMessageOfTheDayKey(line)) {
                flushMessage();
            } else {
                messageParts.push(line);
                continue;
            }
        }

        if (sectionHeader) {
            inMessageOfTheDay = sectionHeader[1].trim().toLowerCase() === 'messageoftheday';
            normalized.push(line);
            continue;
        }

        if (inMessageOfTheDay && /^\s*Message\s*=/.test(line)) {
            const eqIdx = line.indexOf('=');
            messagePrefix = line.substring(0, eqIdx + 1);
            messageParts = [line.substring(eqIdx + 1)];
            collectingMessage = true;
            continue;
        }

        normalized.push(line);
    }

    flushMessage();
    return normalized.join('\n');
}

function updateIniKey(content, sectionName, key, value) {
    const sanitizedValue = String(value || '').replace(/[\r\n]/g, '');
    const sectionRegex = new RegExp(`^(\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*)$`, 'im');
    const keyRegex = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=.*$`, 'im');
    if (keyRegex.test(content)) {
        return content.replace(keyRegex, `${key}=${sanitizedValue}`);
    }
    if (sectionRegex.test(content)) {
        return content.replace(sectionRegex, `$1\n${key}=${sanitizedValue}`);
    }
    return `${content.trimEnd()}\n\n[${sectionName}]\n${key}=${sanitizedValue}\n`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label = 'operation') {
    let timeout;
    return Promise.race([
        Promise.resolve(promise).finally(() => clearTimeout(timeout)),
        new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
}

async function writeJsonAtomic(filePath, value) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const dirPath = path.dirname(filePath);
    let handle = null;
    try {
        await fs.mkdir(dirPath, { recursive: true });
        handle = await fs.open(tmpPath, 'w', 0o600);
        await handle.writeFile(JSON.stringify(value, null, 2));
        await handle.sync();
        await handle.close();
        handle = null;
        await fs.rename(tmpPath, filePath);
        await fsyncDirectory(dirPath);
    } catch (err) {
        await handle?.close().catch(() => {});
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw err;
    }
}

async function fsyncDirectory(dirPath) {
    let dirHandle;
    try {
        dirHandle = await fs.open(dirPath, 'r');
        await dirHandle.sync();
    } catch (_) {
        // Some filesystems/platforms do not support fsync on directories.
    } finally {
        await dirHandle?.close().catch(() => {});
    }
}

async function writeTextFileAtomic(filePath, content, options = {}) {
    const encoding = options.encoding || 'utf8';
    const dirPath = path.dirname(filePath);
    const tmpPath = path.join(dirPath, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    const backupPath = `${filePath}.bak`;
    let stat = null;
    let handle = null;

    try {
        stat = await fs.stat(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    try {
        await fs.mkdir(dirPath, { recursive: true });
        if (options.backup !== false && stat?.isFile()) {
            await fs.copyFile(filePath, backupPath);
        }

        handle = await fs.open(tmpPath, 'w', stat ? stat.mode : 0o640);
        await handle.writeFile(content, encoding);
        await handle.sync();
        await handle.close();
        handle = null;

        if (stat?.isFile()) {
            await fs.chmod(tmpPath, stat.mode);
        }
        await fs.rename(tmpPath, filePath);
        await fsyncDirectory(dirPath);
    } catch (err) {
        await handle?.close().catch(() => {});
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw err;
    }
}

async function updateTextFileAtomic(filePath, updater, options = {}) {
    return withJsonFileLock(filePath, () =>
        withJsonProcessLock(filePath, async () => {
            let current = '';
            try {
                current = await fs.readFile(filePath, options.encoding || 'utf8');
            } catch (err) {
                if (err.code !== 'ENOENT' || options.requireExisting) throw err;
            }
            const next = await updater(current);
            if (typeof next !== 'string') {
                throw new Error('Atomic text updater must return a string');
            }
            if (next !== current) {
                await writeTextFileAtomic(filePath, next, options);
            }
            return next;
        })
    );
}

const jsonFileLocks = new Map();

async function withJsonFileLock(filePath, task) {
    const previous = jsonFileLocks.get(filePath) || Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const cleanup = run.catch(() => {}).finally(() => {
        if (jsonFileLocks.get(filePath) === cleanup) {
            jsonFileLocks.delete(filePath);
        }
    });
    jsonFileLocks.set(filePath, cleanup);
    return run;
}

async function withJsonProcessLock(filePath, task, options = {}) {
    const lockPath = `${filePath}.lock`;
    const timeoutMs = options.timeoutMs || 10000;
    const staleMs = options.staleMs || 30000;
    const retryMs = options.retryMs || 25;
    const start = Date.now();
    let acquired = false;

    while (!acquired) {
        try {
            await fs.mkdir(lockPath);
            acquired = true;
            await fs.writeFile(path.join(lockPath, 'owner'), JSON.stringify({
                pid: process.pid,
                createdAt: new Date().toISOString()
            }));
        } catch (err) {
            if (err.code !== 'EEXIST') throw err;
            let stale = false;
            try {
                const stat = await fs.stat(lockPath);
                stale = Date.now() - stat.mtimeMs > staleMs;
            } catch (statErr) {
                if (statErr.code !== 'ENOENT') throw statErr;
            }
            if (stale) {
                await fs.rm(lockPath, { recursive: true, force: true });
                continue;
            }
            if (Date.now() - start > timeoutMs) {
                throw new Error(`Timed out waiting for JSON lock: ${path.basename(filePath)}`);
            }
            await sleep(retryMs);
        }
    }

    try {
        return await task();
    } finally {
        if (acquired) {
            await fs.rm(lockPath, { recursive: true, force: true });
        }
    }
}

async function withTextFileLocks(filePaths, task) {
    const targets = [...new Set(filePaths.map(filePath => path.resolve(filePath)))].sort();
    const lockLocal = (index) => {
        if (index >= targets.length) return lockProcess(0);
        return withJsonFileLock(targets[index], () => lockLocal(index + 1));
    };
    const lockProcess = (index) => {
        if (index >= targets.length) return task();
        return withJsonProcessLock(targets[index], () => lockProcess(index + 1));
    };
    return lockLocal(0);
}

async function updateTextFilesAtomic(filePaths, updater, options = {}) {
    const targets = [...new Set(filePaths.map(filePath => path.resolve(filePath)))];
    return withTextFileLocks(targets, async () => {
        const current = {};
        for (const filePath of targets) {
            try {
                current[filePath] = await fs.readFile(filePath, options.encoding || 'utf8');
            } catch (err) {
                if (err.code !== 'ENOENT' || options.requireExisting) throw err;
                current[filePath] = '';
            }
        }

        const next = await updater({ ...current });
        if (!next || typeof next !== 'object') {
            throw new Error('Atomic text files updater must return an object');
        }

        for (const filePath of targets) {
            const nextContent = next[filePath];
            if (typeof nextContent !== 'string') {
                throw new Error(`Atomic text updater missing content for ${path.basename(filePath)}`);
            }
            if (nextContent !== current[filePath]) {
                await writeTextFileAtomic(filePath, nextContent, options);
            }
        }
        return next;
    });
}

async function readJsonFile(filePath, fallback) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        if (!err || err.code !== 'ENOENT') {
            const reason = err && err.message ? err.message : 'unknown error';
            throw new Error(`Failed to read JSON state ${path.basename(filePath)}: ${reason}`);
        }
        return typeof fallback === 'function' ? fallback() : fallback;
    }
}

async function updateJsonFile(filePath, fallback, updater) {
    return withJsonFileLock(filePath, () =>
        withJsonProcessLock(filePath, async () => {
            const current = await readJsonFile(filePath, fallback);
            const next = await updater(current);
            const value = typeof next === 'undefined' ? current : next;
            await writeJsonAtomic(filePath, value);
            return value;
        })
    );
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function hostPlatformInfo(platform = process.platform) {
    const family = platform === 'win32' ? 'windows' : (platform === 'linux' ? 'linux' : 'other');
    return {
        platform,
        family,
        label: family === 'linux' ? 'Linux' : (family === 'windows' ? 'Windows' : platform),
    };
}

function normalizeWorkshopModIds(value) {
    const source = Array.isArray(value)
        ? value
        : String(value || '').split(/[\s,;]+/);
    return [...new Set(source
        .map(entry => String(entry || '').trim())
        .filter(entry => /^\d{5,25}$/.test(entry)))]
        .slice(0, 200);
}

function normalizeOrchestratorConfig(raw = {}) {
    const defaults = cloneJson(ORCHESTRATOR_CONFIG_DEFAULTS);
    const arkRoot = String(raw.arkRoot || '').trim();
    const cluster = raw.cluster && typeof raw.cluster === 'object' ? raw.cluster : {};
    const workshopMods = raw.workshopMods && typeof raw.workshopMods === 'object' ? raw.workshopMods : {};
    const migration = raw.migration && typeof raw.migration === 'object' ? raw.migration : {};

    return {
        ...defaults,
        enabled: false,
        mode: 'planning',
        arkRoot,
        serverFilesStrategy: 'shared',
        cluster: {
            enabled: cluster.enabled !== false,
            id: String(cluster.id || '').trim().replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64),
        },
        runtimes: {
            linux: 'obelisk',
            windows: 'arkapi',
        },
        workshopMods: {
            enabled: Boolean(workshopMods.enabled),
            ids: normalizeWorkshopModIds(workshopMods.ids),
            epicWarningAccepted: Boolean(workshopMods.epicWarningAccepted),
        },
        migration: {
            source: 'linuxgsm',
            status: ['planning', 'imported', 'pilot', 'migrated'].includes(migration.status) ? migration.status : 'planning',
            importedAt: typeof migration.importedAt === 'string' ? migration.importedAt : '',
        },
    };
}

async function readOrchestratorConfig() {
    return normalizeOrchestratorConfig(await readJsonFile(ORCHESTRATOR_CONFIG_PATH, () => cloneJson(ORCHESTRATOR_CONFIG_DEFAULTS)));
}

function isPathInside(parentPath, targetPath) {
    const parent = path.resolve(parentPath);
    const target = path.resolve(targetPath);
    const relative = path.relative(parent, target);
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function orchestratorLayoutForRoot(rootPath) {
    if (!rootPath) return {};
    return {
        root: rootPath,
        steamcmd: path.join(rootPath, 'steamcmd'),
        serverfiles: path.join(rootPath, 'serverfiles'),
        instances: path.join(rootPath, 'instances'),
        cluster: path.join(rootPath, 'cluster'),
        backups: path.join(rootPath, 'backups'),
        workshop: path.join(rootPath, 'mods', 'workshop'),
        obelisk: path.join(rootPath, 'obelisk'),
        arkapi: path.join(rootPath, 'arkapi'),
    };
}

function addPreflightCheck(checks, id, label, status, detail, remediation = '') {
    checks.push({ id, label, status, detail, ...(remediation ? { remediation } : {}) });
}

async function statFsOptional(targetPath) {
    try {
        if (typeof fs.statfs !== 'function') return null;
        return await fs.statfs(targetPath);
    } catch (_) {
        return null;
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

async function inspectOrchestratorRoot(inputRoot) {
    const rawRoot = String(inputRoot || '').trim();
    const checks = [];
    const layout = rawRoot && path.isAbsolute(rawRoot) ? orchestratorLayoutForRoot(path.resolve(rawRoot)) : {};

    if (!rawRoot) {
        addPreflightCheck(checks, 'root_required', 'Ruta base', 'error', 'Configura una ruta absoluta para preparar el orquestador nativo.');
        return { checkedAt: new Date().toISOString(), input: rawRoot, root: '', layout, checks, canUse: false };
    }

    if (/[\0\r\n]/.test(rawRoot)) {
        addPreflightCheck(checks, 'root_chars', 'Ruta base', 'error', 'La ruta contiene caracteres de control no permitidos.');
        return { checkedAt: new Date().toISOString(), input: rawRoot, root: rawRoot, layout, checks, canUse: false };
    }

    if (!path.isAbsolute(rawRoot)) {
        addPreflightCheck(checks, 'root_absolute', 'Ruta absoluta', 'error', 'La ruta del orquestador debe ser absoluta.');
        return { checkedAt: new Date().toISOString(), input: rawRoot, root: rawRoot, layout, checks, canUse: false };
    }

    const rootPath = path.resolve(rawRoot);
    const parentPath = path.dirname(rootPath);
    const resolvedLayout = orchestratorLayoutForRoot(rootPath);
    addPreflightCheck(checks, 'root_absolute', 'Ruta absoluta', 'ok', `Ruta normalizada: ${rootPath}`);

    if (rootPath === path.parse(rootPath).root) {
        addPreflightCheck(checks, 'root_not_filesystem_root', 'Raiz dedicada', 'error', 'No se permite usar la raiz del sistema como arkRoot.');
    } else {
        addPreflightCheck(checks, 'root_not_filesystem_root', 'Raiz dedicada', 'ok', 'La ruta apunta a un directorio dedicado.');
    }

    if (isPathInside(DASHBOARD_ROOT, rootPath)) {
        addPreflightCheck(checks, 'outside_dashboard', 'Separacion app/datos', 'error', 'No alojes ARK dentro de la carpeta del dashboard.');
    } else {
        addPreflightCheck(checks, 'outside_dashboard', 'Separacion app/datos', 'ok', 'La ruta queda separada del codigo de la app.');
    }

    let probePath = rootPath;
    let rootExists = false;
    try {
        const rootStat = await fs.lstat(rootPath);
        rootExists = true;
        if (rootStat.isSymbolicLink()) {
            addPreflightCheck(checks, 'root_symlink', 'Symlink root', 'error', 'La ruta base no puede ser un symlink.');
        } else if (!rootStat.isDirectory()) {
            addPreflightCheck(checks, 'root_directory', 'Directorio root', 'error', 'La ruta base existe pero no es un directorio.');
        } else {
            addPreflightCheck(checks, 'root_directory', 'Directorio root', 'ok', 'La ruta base existe y es un directorio.');
            try {
                await fs.access(rootPath, fsConstants.R_OK | fsConstants.W_OK | fsConstants.X_OK);
                addPreflightCheck(checks, 'root_access', 'Permisos root', 'ok', 'El usuario del panel puede leer, escribir y entrar en la ruta.');
            } catch (_) {
                addPreflightCheck(checks, 'root_access', 'Permisos root', 'error', 'El usuario del panel no tiene permisos suficientes sobre la ruta.');
            }
            if (rootStat.mode & 0o002) {
                addPreflightCheck(checks, 'root_mode', 'Permisos amplios', 'warn', 'La ruta es escribible por otros usuarios; conviene endurecer permisos antes de migrar.');
            } else {
                addPreflightCheck(checks, 'root_mode', 'Permisos amplios', 'ok', 'No se detecta escritura global en la ruta base.');
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            addPreflightCheck(checks, 'root_probe', 'Lectura root', 'error', 'No se pudo inspeccionar la ruta base.');
        } else {
            probePath = parentPath;
            addPreflightCheck(checks, 'root_directory', 'Directorio root', 'warn', 'La ruta base no existe todavia; el instalador podra crearla si el padre es escribible.');
            try {
                const parentStat = await fs.lstat(parentPath);
                if (parentStat.isSymbolicLink()) {
                    addPreflightCheck(checks, 'parent_symlink', 'Symlink padre', 'error', 'El directorio padre no puede ser un symlink.');
                } else if (!parentStat.isDirectory()) {
                    addPreflightCheck(checks, 'parent_directory', 'Directorio padre', 'error', 'El padre de la ruta base no es un directorio.');
                } else {
                    await fs.access(parentPath, fsConstants.W_OK | fsConstants.X_OK);
                    addPreflightCheck(checks, 'parent_access', 'Permisos padre', 'ok', 'El usuario del panel puede crear la ruta base en el directorio padre.');
                }
            } catch (_) {
                addPreflightCheck(checks, 'parent_access', 'Permisos padre', 'error', 'El usuario del panel no puede crear la ruta base en el directorio padre.');
            }
        }
    }

    if (rootExists) {
        for (const [id, targetPath] of Object.entries(resolvedLayout)) {
            if (id === 'root') continue;
            try {
                const entryStat = await fs.lstat(targetPath);
                if (entryStat.isSymbolicLink()) {
                    addPreflightCheck(checks, `layout_${id}`, `Layout ${id}`, 'error', `${id} existe como symlink; los directorios gestionados deben ser reales.`);
                } else if (!entryStat.isDirectory()) {
                    addPreflightCheck(checks, `layout_${id}`, `Layout ${id}`, 'error', `${id} existe pero no es un directorio.`);
                }
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    addPreflightCheck(checks, `layout_${id}`, `Layout ${id}`, 'warn', `No se pudo inspeccionar ${id}.`);
                }
            }
        }
    }

    const statFs = await statFsOptional(probePath);
    if (statFs) {
        const freeBytes = Number(statFs.bavail) * Number(statFs.bsize);
        if (freeBytes < ORCHESTRATOR_MIN_FREE_BYTES) {
            addPreflightCheck(checks, 'disk_free', 'Espacio libre', 'error', `Espacio libre bajo: ${formatBytes(freeBytes)}.`);
        } else if (freeBytes < ORCHESTRATOR_WARN_FREE_BYTES) {
            addPreflightCheck(checks, 'disk_free', 'Espacio libre', 'warn', `Espacio libre justo: ${formatBytes(freeBytes)}.`);
        } else {
            addPreflightCheck(checks, 'disk_free', 'Espacio libre', 'ok', `Espacio libre estimado: ${formatBytes(freeBytes)}.`);
        }
    } else {
        addPreflightCheck(checks, 'disk_free', 'Espacio libre', 'warn', 'No se pudo consultar el espacio libre del filesystem.');
    }

    const canUse = checks.every(check => check.status !== 'error');
    return {
        checkedAt: new Date().toISOString(),
        input: rawRoot,
        root: rootPath,
        layout: resolvedLayout,
        checks,
        canUse,
    };
}

function buildOrchestratorMigrationPlan(config, maps = CLUSTER_MAPS) {
    const host = hostPlatformInfo();
    const arkRoot = config.arkRoot ? path.resolve(config.arkRoot) : '';
    const runtime = host.family === 'linux' ? 'Obelisk' : (host.family === 'windows' ? 'ArkApi' : 'No soportado');
    const mapPlans = (Array.isArray(maps) ? maps : []).map(map => ({
        id: map.id,
        name: map.name,
        source: {
            type: 'linuxgsm',
            script: map.script ? path.basename(map.script) : '',
            scriptPathConfigured: Boolean(map.script),
        },
        target: {
            runtime,
            instancePath: arkRoot ? path.join(arkRoot, 'instances', map.id) : '',
            logPath: arkRoot ? path.join(arkRoot, 'instances', map.id, 'logs') : '',
        },
        ports: {
            game: map.gamePort,
            query: map.queryPort,
            rcon: map.rconPort,
        },
        status: 'planned',
    }));

    return {
        source: 'linuxgsm',
        strategy: 'pilot-first',
        linuxGsmMapsDetected: mapPlans.filter(map => map.source.scriptPathConfigured).length,
        sharedServerFilesPath: arkRoot ? path.join(arkRoot, 'serverfiles') : '',
        clusterPath: arkRoot ? path.join(arkRoot, 'cluster') : '',
        maps: mapPlans,
        blockedActions: [
            'install-steamcmd',
            'install-serverfiles',
            'create-instance',
            'start-instance',
            'stop-instance',
            'restart-instance',
            'migrate-linuxgsm',
            'install-obelisk',
            'install-workshop-mods',
        ],
    };
}

function buildOrchestratorReadiness(config, preflight = null) {
    const host = hostPlatformInfo();
    const currentRuntime = host.family === 'linux' ? 'Obelisk' : (host.family === 'windows' ? 'ArkApi' : 'No soportado');
    return {
        mode: config.mode,
        enabled: false,
        available: false,
        reason: 'Orquestador nativo preparado en modo planificacion; las acciones live siguen bloqueadas hasta implementar runners seguros.',
        host,
        currentRuntime,
        config,
        phases: ORCHESTRATOR_PHASES,
        layout: config.arkRoot ? orchestratorLayoutForRoot(path.resolve(config.arkRoot)) : {},
        preflight,
        migration: buildOrchestratorMigrationPlan(config),
        workshop: {
            available: false,
            configured: config.workshopMods,
            warning: WORKSHOP_EPIC_WARNING,
            reason: 'La instalacion de Workshop queda bloqueada hasta tener runner SteamCMD con lock y confirmacion Epic.',
        },
    };
}

function ensureAdminRolesSync(adminsPath = ADMINS_PATH) {
    const fsSync = require('fs');
    try {
        let admins = [];
        if (fsSync.existsSync(adminsPath)) {
            admins = JSON.parse(fsSync.readFileSync(adminsPath, 'utf8'));
        }
        if (!Array.isArray(admins)) admins = [];

        if (admins.length === 0 && Boolean(process.env.DASHBOARD_BOOTSTRAP_USERNAME) !== Boolean(process.env.DASHBOARD_BOOTSTRAP_PASSWORD)) {
            throw new Error('DASHBOARD_BOOTSTRAP_USERNAME and DASHBOARD_BOOTSTRAP_PASSWORD must be provided together');
        }

        if (admins.length === 0 && process.env.DASHBOARD_BOOTSTRAP_USERNAME && process.env.DASHBOARD_BOOTSTRAP_PASSWORD) {
            const username = String(process.env.DASHBOARD_BOOTSTRAP_USERNAME).trim();
            const password = String(process.env.DASHBOARD_BOOTSTRAP_PASSWORD);
            if (username.length < 3 || username.length > 32) {
                throw new Error('DASHBOARD_BOOTSTRAP_USERNAME must be 3-32 characters');
            }
            const passwordError = dashboardPasswordError(password, 'DASHBOARD_BOOTSTRAP_PASSWORD', 'en');
            if (passwordError) throw new Error(passwordError);
            if (IS_PRODUCTION && isUnsafePlaceholderSecret(password)) {
                throw new Error('DASHBOARD_BOOTSTRAP_PASSWORD must not use a placeholder value in production');
            }
            fsSync.mkdirSync(path.dirname(adminsPath), { recursive: true });
            fsSync.writeFileSync(adminsPath, JSON.stringify([{
                id: uuidv4(),
                username,
                password: bcrypt.hashSync(password, 12),
                role: 'owner',
                permissions: { allow: [], deny: [] },
                sessionVersion: 0
            }], null, 2));
            console.warn('[SECURITY] Bootstrapped initial owner from environment. Remove DASHBOARD_BOOTSTRAP_* after first login.');
            return;
        }

        if (admins.length === 0) {
            if (IS_PRODUCTION) {
                throw new Error('No dashboard admins found. Set DASHBOARD_BOOTSTRAP_USERNAME and DASHBOARD_BOOTSTRAP_PASSWORD for first production startup.');
            }
            return;
        }
        let changed = false;
        let ownerAssigned = admins.some(admin => admin.role === 'owner');
        const normalized = admins.map((admin, index) => {
            const normalizedPermissions = normalizeAdminPermissions(admin);
            const permissionsChanged = JSON.stringify(admin.permissions || { allow: [], deny: [] }) !== JSON.stringify(normalizedPermissions);
            if (isValidRole(admin.role) && Number.isInteger(admin.sessionVersion) && !permissionsChanged) return admin;
            changed = true;
            const migratedSession = { ...admin, permissions: normalizedPermissions, sessionVersion: adminSessionVersion(admin) };
            if (isValidRole(admin.role)) return migratedSession;
            if (!ownerAssigned && index === 0) {
                ownerAssigned = true;
                return { ...migratedSession, role: 'owner' };
            }
            return { ...migratedSession, role: ownerAssigned ? 'operator' : 'owner' };
        });
        if (changed) {
            fsSync.writeFileSync(adminsPath, JSON.stringify(normalized, null, 2));
            console.warn('[SECURITY] Migrated legacy admins to explicit roles.');
        }
    } catch (err) {
        console.error('[SECURITY] Failed to migrate admin roles:', err.message);
        if (IS_PRODUCTION || process.env.DASHBOARD_BOOTSTRAP_USERNAME || process.env.DASHBOARD_BOOTSTRAP_PASSWORD) {
            throw err;
        }
    }
}
ensureAdminRolesSync();

// --- Global Settings & Webhooks ---
async function readGlobalSettings() {
    return sanitizeGlobalSettings(await readJsonFile(GLOBAL_SETTINGS_PATH, GLOBAL_SETTINGS_DEFAULTS));
}

async function writeGlobalSettings(settings) {
    await updateJsonFile(GLOBAL_SETTINGS_PATH, GLOBAL_SETTINGS_DEFAULTS, current => sanitizeGlobalSettings(settings, current));
}

async function readAdminIpWhitelistForEnforcement() {
    const settings = await readJsonFile(GLOBAL_SETTINGS_PATH, GLOBAL_SETTINGS_DEFAULTS);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new Error('Invalid global settings state');
    }
    return parseAdminIpWhitelist(settings.adminIpWhitelist);
}

function normalizeIp(ip) {
    if (!ip) return '';
    return String(ip).replace(/^::ffff:/, '').trim();
}

function parseAdminIpWhitelist(value) {
    if (!value || typeof value !== 'string') return [];
    const entries = value
        .split(',')
        .map(normalizeIp)
        .filter(Boolean);
    const invalid = entries.filter(ip => !net.isIP(ip));
    if (invalid.length > 0) {
        throw new Error('Admin IP whitelist contains invalid IP addresses');
    }
    return entries;
}

function normalizeGlobalNumberField(field, value, { min, max, integer = false }) {
    const raw = typeof value === 'string' ? value.trim() : value;
    if (raw === '' || raw === null || typeof raw === 'undefined') {
        throw new Error(`${field} is required`);
    }
    const number = Number(raw);
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
        throw new Error(`${field} must be a ${integer ? 'whole number' : 'number'} between ${min} and ${max}`);
    }
    return String(number);
}

function sanitizeGlobalSettings(input, current = {}) {
    const next = { ...GLOBAL_SETTINGS_DEFAULTS };
    const existing = current && typeof current === 'object' ? current : {};
    for (const key of Object.keys(GLOBAL_SETTINGS_DEFAULTS)) {
        if (Object.prototype.hasOwnProperty.call(existing, key)) {
            next[key] = existing[key];
        }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'discordWebhookAlerts')) {
        const value = String(input.discordWebhookAlerts || '').trim();
        if (value && !isAllowedDiscordWebhook(value)) throw new Error('Invalid alerts webhook URL');
        next.discordWebhookAlerts = value;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'discordWebhookBans')) {
        const value = String(input.discordWebhookBans || '').trim();
        if (value && !isAllowedDiscordWebhook(value)) throw new Error('Invalid bans webhook URL');
        next.discordWebhookBans = value;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'adminIpWhitelist')) {
        const value = String(input.adminIpWhitelist || '').trim();
        const entries = value ? value.split(',').map(normalizeIp).filter(Boolean) : [];
        if (entries.some(ip => !net.isIP(ip))) throw new Error('Admin IP whitelist must contain comma-separated IP addresses');
        next.adminIpWhitelist = entries.join(', ');
    }

    for (const [field, limits] of Object.entries(GLOBAL_MULTIPLIER_FIELDS)) {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
            next[field] = normalizeGlobalNumberField(field, input[field], limits);
        }
    }
    if (Object.prototype.hasOwnProperty.call(input, 'maxPlayersDefault')) {
        next.maxPlayersDefault = normalizeGlobalNumberField('maxPlayersDefault', input.maxPlayersDefault, { min: 1, max: 1000, integer: true });
    }
    for (const field of GLOBAL_BOOLEAN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(input, field)) {
            if (typeof input[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
            next[field] = input[field];
        }
    }
    return next;
}

async function enforceAdminIpWhitelist(req, res, next) {
    try {
        const allowedIps = await readAdminIpWhitelistForEnforcement();
        if (allowedIps.length === 0) return next();
        const requestIp = normalizeIp(req.ip);
        if (!allowedIps.includes(requestIp)) {
            return res.status(403).json({ error: 'IP no autorizada' });
        }
        next();
    } catch (err) {
        console.error('Failed to enforce admin IP whitelist:', err.message);
        res.status(500).json({ error: 'Ajustes de seguridad no disponibles' });
    }
}

app.use('/api', enforceAdminIpWhitelist);

async function sendDiscordWebhook(type, payload) {
    const settings = await readGlobalSettings();
    let webhookUrl = '';

    if (type === 'BAN') webhookUrl = settings.discordWebhookBans;
    else if (['START', 'STOP', 'RESTART'].includes(type)) webhookUrl = settings.discordWebhookAlerts;

    if (!isAllowedDiscordWebhook(webhookUrl)) return;

    let embed = { color: 3447003 }; // Default blue

    if (type === 'START') {
        embed.color = 5763719; // Green
        embed.title = `✅ Servidor Iniciado: ${payload.map}`;
        embed.description = `El administrador **${payload.admin}** ha iniciado el servidor.`;
    } else if (type === 'STOP') {
        embed.color = 15548997; // Red
        embed.title = `🛑 Servidor Detenido: ${payload.map}`;
        embed.description = `El administrador **${payload.admin}** ha detenido el servidor.`;
    } else if (type === 'RESTART') {
        embed.color = 16776960; // Yellow
        embed.title = `🔄 Servidor Reiniciándose: ${payload.map}`;
        embed.description = `El administrador **${payload.admin}** ha reiniciado el servidor.`;
    } else if (type === 'BAN') {
        embed.color = 15158332; // Dark Red
        embed.title = `🔨 Jugador Baneado`;
        embed.description = `El jugador **${payload.playerName}** (${payload.steamId}) fue baneado por **${payload.admin}**.\n\n**Motivo:** ${payload.reason}`;
    }

    let timeout;
    try {
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), DISCORD_WEBHOOK_TIMEOUT_MS);
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
            signal: controller.signal,
        });
    } catch (err) {
        console.error('Failed to send Discord webhook:', err.message);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function isAllowedDiscordWebhook(webhookUrl) {
    try {
        const url = new URL(webhookUrl);
        if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname)) {
            return false;
        }
        if (url.username || url.password || url.search || url.hash) {
            return false;
        }
        return /^\/api\/webhooks\/\d{17,25}\/[A-Za-z0-9._-]{20,}$/.test(url.pathname);
    } catch (_) {
        return false;
    }
}

function decodeIniContent(raw) {
    if (typeof raw === 'string') return raw;
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return buffer.subarray(2).toString('utf16le');
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.from(buffer.subarray(2));
        swapped.swap16();
        return swapped.toString('utf16le');
    }
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return buffer.subarray(3).toString('utf8');
    }
    return buffer.toString('utf8');
}

// --- Helper: RCON Password from GameUserSettings.ini ---
async function getRconPassword(mapId) {
    try {
        const map = getMapConfig(mapId);
        const content = await fs.readFile(map.gameUserSettings);
        const decodedContent = decodeIniContent(content);
        const parsed = ini.parse(decodedContent);
        return parsed.ServerSettings?.ServerAdminPassword || null;
    } catch(err) {
        return null;
    }
}

async function isManagedRconConfigured(mapId) {
    try {
        const map = getMapConfig(mapId);
        const settings = ini.parse(decodeIniContent(await fs.readFile(map.gameUserSettings))).ServerSettings || {};
        return (settings.RCONEnabled === true || String(settings.RCONEnabled || '').toLowerCase() === 'true') &&
            typeof settings.ServerAdminPassword === 'string' && settings.ServerAdminPassword.length > 0 && Boolean(normalizePort(map.rconPort));
    } catch (_) { return false; }
}

async function collectOnlinePlayerObservations(maps, options = {}) {
    const configured = options.configured || (map => isManagedRconConfigured(map.id));
    const query = options.query || (map => execRcon('ListPlayers', map.id));
    const observations = new Array(maps.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, maps.length) }, async () => {
        while (cursor < maps.length) {
            const index = cursor++;
            const map = maps[index];
            const players = [];
            if (map.monitor_file) {
                observations[index] = { players, map: { mapId: map.id, status: 'unavailable', reason: 'native_census_not_available', observed_players: 0 } };
                continue;
            }
            let reason;
            try {
                if (!await configured(map)) reason = 'rcon_disabled_or_incomplete';
                else {
                    const response = await query(map);
                    if (typeof response !== 'string' || Buffer.byteLength(response) > 256 * 1024 || !response.trim()) reason = 'unrecognized_listplayers_response';
                    else if (!/^No Players(?: Connected)?[.!]?\s*$/i.test(response.trim())) {
                        const lines = response.split(/\r?\n/).filter(line => line.trim());
                        if (lines.length > 4096) reason = 'listplayers_limit_exceeded';
                        else for (const line of lines) {
                            const match = line.match(/^\d+\.\s*(.+?),\s*(\d{10,25})\s*$/);
                            if (!match || match[1].length > 256 || /[\x00-\x1f\x7f]/.test(match[1])) { reason = 'unrecognized_player_rows'; continue; }
                            players.push({ name: match[1].trim(), steamId: match[2], mapId: map.id, mapName: map.name });
                        }
                    }
                }
            } catch (_) { reason = 'rcon_query_unavailable'; }
            observations[index] = { players, map: { mapId: map.id, status: reason ? 'unavailable' : 'queried', ...(reason ? { reason } : {}), observed_players: players.length } };
        }
    }));
    const seen = new Set();
    const players = observations.flatMap(item => item.players).filter(player => {
        if (seen.has(player.steamId)) return false;
        seen.add(player.steamId);
        return true;
    });
    return { players, per_map: observations.map(item => item.map), complete: maps.length > 0 && observations.every(item => item.map.status === 'queried'),
        source: maps.every(map => map.monitor_file) ? 'native_monitor' : 'rcon_listplayers', roster_scope: 'observations_only', identity_authority: 'unverified_observation', observed_at: new Date().toISOString() };
}

const rconMapQueues = new Map();
const scheduledTaskMapIssues = new Map();

function scheduledTaskMapIssueKey(task, map) {
    return `${task?.id || 'unknown'}:${map?.id || 'unknown'}`;
}

function logScheduledTaskIssue(task, map, reason, message, level = 'warn') {
    const key = scheduledTaskMapIssueKey(task, map);
    if (scheduledTaskMapIssues.get(key) === reason) return;
    scheduledTaskMapIssues.set(key, reason);
    const logger = level === 'error' ? console.error : console.warn;
    logger(message);
}

function logScheduledTaskRecovery(task, map) {
    const key = scheduledTaskMapIssueKey(task, map);
    if (!scheduledTaskMapIssues.has(key)) return;
    scheduledTaskMapIssues.delete(key);
    console.info(`Task ${task.action} recovered on ${map.name}`);
}

function isRconTcpReachable(map, timeoutMs = 750) {
    const port = normalizePort(map?.rconPort);
    if (!port) return Promise.resolve(false);
    return new Promise(resolve => {
        let settled = false;
        const socket = net.createConnection({ host: map.host || '127.0.0.1', port });
        const finish = result => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

async function scheduledTaskRconPreflight(map, processList, options = {}) {
    if (!findMapProcess(map, processList)) {
        return { ok: false, reason: 'server_offline', detail: 'server process not running' };
    }

    const reachable = typeof options.rconAvailability === 'function'
        ? await options.rconAvailability(map)
        : await isRconTcpReachable(map, options.rconTimeoutMs);
    if (!reachable) {
        return { ok: false, reason: 'rcon_unavailable', detail: `RCON port ${map.rconPort} unavailable` };
    }

    return { ok: true };
}

// --- Helper: Execute RCON Command (map-aware) ---
async function execRcon(command, mapId) {
    const mapSelection = resolveRequiredMapId(mapId);
    if (mapSelection.error) throw new Error(mapSelection.error);
    if (!isValidRconCommand(command)) throw new Error('Comando inválido');
    const map = getMapConfig(mapSelection.mapId);
    const previous = rconMapQueues.get(map.id) || Promise.resolve();
    const run = previous.catch(() => {}).then(async () => {
        const pass = await getRconPassword(mapSelection.mapId);
        if (!pass) throw new Error(`RCON Password not set for ${map.name}`);
        const rcon = await withTimeout(
            Rcon.connect({ host: map.host || '127.0.0.1', port: map.rconPort, password: pass }),
            RCON_CONNECT_TIMEOUT_MS,
            `RCON connect ${map.name}`
        );
        rcon.on('error', err => console.error(`RCON error (${map.name}):`, err.message));
        try {
            return await withTimeout(rcon.send(command), RCON_COMMAND_TIMEOUT_MS, `RCON command ${map.name}`);
        } finally {
            rcon.end();
        }
    });
    const cleanup = run.catch(() => {}).finally(() => {
        if (rconMapQueues.get(map.id) === cleanup) {
            rconMapQueues.delete(map.id);
        }
    });
    rconMapQueues.set(map.id, cleanup);
    return run;
}

function runFile(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, ...(options.env || {}) };
        if (options.unsetTmux !== false) delete env.TMUX;
        execFile(command, args, {
            cwd: options.cwd || path.dirname(command),
            env,
            timeout: options.timeout || 120000,
            maxBuffer: options.maxBuffer || 1024 * 1024,
        }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                return reject(error);
            }
            resolve({ stdout, stderr });
        });
    });
}

async function tailFile(filePath, lines = 300) {
    const safeLines = parseBoundedIntegerParam(lines, 'lines', { defaultValue: 300, min: 1, max: 2000 });
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) {
        throw badRequest('Log path must not be a symlink');
    }
    if (!stat.isFile()) {
        throw badRequest('Log path must be a regular file');
    }

    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    let handle;
    try {
        handle = await fs.open(filePath, fsConstants.O_RDONLY | noFollow);
        const openedStat = await handle.stat();
        if (!openedStat.isFile()) {
            throw badRequest('Log path must be a regular file');
        }
        const maxBytes = 2 * 1024 * 1024;
        const bytesToRead = Math.min(openedStat.size, maxBytes);
        const start = Math.max(0, openedStat.size - bytesToRead);
        const buffer = Buffer.alloc(bytesToRead);
        if (bytesToRead > 0) {
            await handle.read(buffer, 0, bytesToRead, start);
        }
        const content = buffer.toString('utf8');
        const endedWithNewline = content.endsWith('\n');
        const parts = content.split('\n');
        if (start > 0) parts.shift();
        if (endedWithNewline) parts.pop();
        const selected = parts.slice(-safeLines);
        if (selected.length === 0) return '';
        return `${selected.join('\n')}${endedWithNewline ? '\n' : ''}`;
    } catch (err) {
        if (err.code === 'ELOOP') {
            throw badRequest('Log path must not be a symlink');
        }
        throw err;
    } finally {
        if (handle) await handle.close();
    }
}

async function pathExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch (_) {
        return false;
    }
}

async function statOptional(filePath) {
    try {
        return await fs.stat(filePath);
    } catch (_) {
        return null;
    }
}

async function truncateManagedLogFile(filePath) {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) {
        throw new Error('Managed log path must not be a symlink');
    }
    if (!stat.isFile()) {
        throw new Error('Managed log path must be a regular file');
    }

    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    const handle = await fs.open(filePath, fsConstants.O_WRONLY | noFollow);
    try {
        await handle.truncate(0);
    } finally {
        await handle.close();
    }
}

async function writeRuntimeMarkerFile(markerPath, content) {
    try {
        const stat = await fs.lstat(markerPath);
        if (stat.isSymbolicLink()) {
            throw badRequest('Runtime marker path must not be a symlink');
        }
        if (!stat.isFile()) {
            throw badRequest('Runtime marker path must be a regular file');
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }

    const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    let handle;
    try {
        handle = await fs.open(markerPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | noFollow, 0o600);
        await handle.writeFile(content);
    } catch (err) {
        if (err.code === 'ELOOP') {
            throw badRequest('Runtime marker path must not be a symlink');
        }
        throw err;
    } finally {
        if (handle) await handle.close();
    }
}

async function ensureRuntimeMarkerDirectory(root, ...parts) {
    const rootPath = path.resolve(root);
    await fs.mkdir(rootPath, { recursive: true, mode: 0o700 });
    const realRoot = await fs.realpath(rootPath);
    let currentPath = realRoot;

    for (const part of parts) {
        currentPath = path.join(currentPath, part);
        try {
            const stat = await fs.lstat(currentPath);
            if (stat.isSymbolicLink()) {
                throw badRequest('Runtime marker directory must not be a symlink');
            }
            if (!stat.isDirectory()) {
                throw badRequest('Runtime marker path must be a directory');
            }
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
            await fs.mkdir(currentPath, { mode: 0o700 });
        }

        const realCurrentPath = await fs.realpath(currentPath);
        if (realCurrentPath !== realRoot && !realCurrentPath.startsWith(`${realRoot}${path.sep}`)) {
            throw badRequest('Runtime marker directory must stay inside the runtime root');
        }
    }

    return currentPath;
}

function isSafeRuntimeId(id) {
    return typeof id === 'string' && RUNTIME_ID_PATTERN.test(id);
}

function resolveRuntimePath(root, ...parts) {
    const rootPath = path.resolve(root);
    const target = path.resolve(rootPath, ...parts);
    if (target !== rootPath && !target.startsWith(`${rootPath}${path.sep}`)) {
        throw new Error('Invalid runtime path');
    }
    return target;
}

function allowedObeliskInstanceIds() {
    const allowed = new Set();
    for (const map of CLUSTER_MAPS) {
        if (isSafeRuntimeId(map.id)) allowed.add(map.id);
        const scriptName = path.basename(map.script || '');
        if (isSafeRuntimeId(scriptName)) allowed.add(scriptName);
    }
    return allowed;
}

function queryGameServer(options) {
    return withTimeout(GameDig.query(options), GAMEDIG_TIMEOUT_MS, `GameDig ${options.host}:${options.port}`);
}

async function listRuntimeFiles(dirPath, predicate = () => true) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = await Promise.all(entries
            .filter(entry => predicate(entry))
            .map(async entry => {
                const fullPath = path.join(dirPath, entry.name);
                const stat = await statOptional(fullPath);
                return {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: stat?.size || 0,
                    modifiedAt: stat ? stat.mtime.toISOString() : null,
                };
            }));
        return files.sort((a, b) => a.name.localeCompare(b.name));
    } catch (_) {
        return [];
    }
}

async function getObeliskStatus() {
    const root = PLUGIN_MANAGER_OBELISK_ROOT;
    const available = await pathExists(root);
    const pluginDir = resolveRuntimePath(root, 'plugins');
    const configDir = resolveRuntimePath(root, 'config');
    const instanceDir = resolveRuntimePath(root, 'state', 'instances');
    const logRoot = resolveRuntimePath(root, 'logs');
    const plugins = await listRuntimeFiles(pluginDir, entry => entry.isFile() && entry.name.endsWith('.so'));
    const configEntries = await listRuntimeFiles(configDir, entry => entry.isDirectory());
    const configNames = new Set(configEntries.map(entry => entry.name));
    const allowedInstances = allowedObeliskInstanceIds();
    const instances = (await listRuntimeFiles(instanceDir, entry => entry.isDirectory() && allowedInstances.has(entry.name)));

    return {
        type: 'obelisk',
        label: 'Obelisk Linux Runtime',
        available,
        rootConfigured: Boolean(root),
        libraries: {
            obelisk: await pathExists(resolveRuntimePath(root, 'lib', 'libobelisk.so')),
            subhook: await pathExists(resolveRuntimePath(root, 'lib', 'libsubhook.so')),
        },
        plugins: plugins.map(plugin => {
            const id = plugin.name.replace(/\.so$/i, '');
            return { ...plugin, id, configExists: configNames.has(id) };
        }),
        configs: configEntries,
        instances: await Promise.all(instances.map(async instance => ({
            ...instance,
            markers: (await listRuntimeFiles(resolveRuntimePath(instanceDir, instance.name), entry => entry.isFile()))
                .map(marker => marker.name)
                .sort(),
            logExists: await pathExists(resolveRuntimePath(logRoot, instance.name, 'Obelisk.log')),
        }))),
        markerCatalog: OBELISK_SAFE_MARKERS,
        supportedActions: ['toggle-marker', 'read-log'],
    };
}

async function getArkApiStatus() {
    const root = PLUGIN_MANAGER_ARKAPI_ROOT;
    const pluginsRoot = resolveRuntimePath(root, 'Plugins');
    return {
        type: 'arkapi',
        label: 'ArkApi Windows Compatibility',
        available: await pathExists(root),
        rootConfigured: Boolean(root),
        platform: process.platform,
        plugins: await listRuntimeFiles(pluginsRoot, entry => entry.isDirectory() || entry.name.endsWith('.dll')),
        supportedActions: [],
        note: 'Detectado solo para inventario/compatibilidad; las acciones de ArkApi se gestionan fuera de Linux.',
    };
}

async function checkProcess(map, processList = null) {
    const processes = Array.isArray(processList) ? { list: processList } : await si.processes();
    return Boolean(findMapProcess(map, processes.list));
}

// --- Helper: Audit Logger ---
function redactAuditSecrets(value) {
    if (typeof value !== 'string') return value;
    const redactedAssignmentKeys = [
        'password',
        'secret',
        'token',
        'apikey',
        'api_key',
        'jwt',
        'webhook',
        ...ARK_SECRET_KEYS
    ].map(key => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return value
        .replace(new RegExp(`\\b(${redactedAssignmentKeys})\\b\\s*[:=]\\s*("[^"]*"|'[^']*'|\\S+)`, 'gi'), '$1=[REDACTED]')
        .replace(/https:\/\/(?:discord(?:app)?\.com)\/api\/webhooks\/[^\s"'<>]+/gi, 'https://discord.com\x2fapi/webhooks/[REDACTED]')
        .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}\b/gi, '$1[REDACTED]');
}

function sanitizeAuditDetails(details) {
    return redactAuditSecrets(sanitizeAuditText(String(details || ''), 'No details', 1000));
}

function requestIpForAudit(req) {
    const source = req.ip || req.socket?.remoteAddress || 'unknown';
    return sanitizeAuditText(source, 'unknown', 80);
}

async function ensureAuditLogWritable() {
    try {
        await readJsonFile(AUDIT_PATH, []);
        await fs.access(AUDIT_PATH, fsConstants.R_OK | fsConstants.W_OK);
    } catch (err) {
        if (err.code === 'ENOENT') {
            await fs.access(path.dirname(AUDIT_PATH), fsConstants.W_OK);
            return;
        }
        err.statusCode = 500;
        throw err;
    }
}

async function auditLog(adminUser, action, details, options = {}) {
    try {
        await updateJsonFile(AUDIT_PATH, [], logs => {
            logs.unshift({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            admin: sanitizeAuditText(adminUser, 'Unknown', 64),
            action: sanitizeAuditText(action, 'UNKNOWN', 80),
            details: sanitizeAuditDetails(details)
            });

            // Keep last 1000 entries
            return logs.length > 1000 ? logs.slice(0, 1000) : logs;
        });
    } catch (err) {
        console.error('Failed to write audit log:', err.message);
        if (!options.bestEffort) {
            const auditError = new Error('Log de auditoría no disponible');
            auditError.statusCode = 500;
            throw auditError;
        }
    }
}

async function accessStatus(id, label, targetPath, mode, okText, failText, remediation = '') {
    try {
        await fs.access(targetPath, mode);
        return { id, label, status: 'ok', detail: okText };
    } catch (err) {
        return { id, label, status: 'fail', detail: `${failText}: ${err.code || err.message}`, remediation };
    }
}

async function dashboardDataStateStatus() {
    const files = [
        ['nodes', NODES_PATH],
        ['admins', ADMINS_PATH],
        ['audit', AUDIT_PATH],
        ['bans', BANS_PATH],
        ['players', PLAYERS_DB_PATH],
        ['tasks', TASKS_PATH],
        ['global_settings', GLOBAL_SETTINGS_PATH],
    ];
    const issues = [];
    const readableByOthers = [];

    for (const [name, filePath] of files) {
        try {
            const stat = await fs.lstat(filePath);
            if (!stat.isFile()) {
                issues.push(`${name} no es fichero regular`);
                continue;
            }
            if (stat.isSymbolicLink()) issues.push(`${name} es symlink`);
            if (stat.nlink > 1) issues.push(`${name} tiene hardlinks`);
            if (stat.mode & 0o002) issues.push(`${name} escribible por otros`);
            if (stat.mode & 0o066) readableByOthers.push(name);
        } catch (err) {
            if (err.code === 'ENOENT') {
                issues.push(`${name} ausente`);
            } else {
                issues.push(`${name}: ${err.code || err.message}`);
            }
        }
    }

    if (issues.length > 0) {
        return {
            id: 'data_state_files',
            label: 'Ficheros de estado',
            status: 'fail',
            detail: issues.join('; '),
            remediation: `Ejecuta deploy/manage-dashboard-data.sh prepare con DASHBOARD_DATA_DIR=${DATA_DIR} y revisa que los ficheros sean regulares, propiedad del usuario del panel y no symlinks/hardlinks.`,
        };
    }

    if (readableByOthers.length > 0) {
        return {
            id: 'data_state_files',
            label: 'Ficheros de estado',
            status: 'warn',
            detail: `Revisar permisos: ${readableByOthers.join(', ')} legible por grupo/otros`,
            remediation: `Endurece permisos con chmod 700 ${DATA_DIR} y chmod 600 ${DATA_DIR}/*.json; conserva backups antes de cambiar permisos.`,
        };
    }

    return {
        id: 'data_state_files',
        label: 'Ficheros de estado',
        status: 'ok',
        detail: `${files.length} fichero(s) críticos regulares con permisos restrictivos`,
    };
}

async function dashboardBackupStatus() {
    try {
        const entries = await fs.readdir(DASHBOARD_BACKUP_DIR, { withFileTypes: true });
        const archives = entries
            .filter(entry => entry.isFile() && /^flowark-dashboard-data-.+\.tar\.gz$/.test(entry.name))
            .map(entry => entry.name)
            .sort();

        if (archives.length === 0) {
            return {
                id: 'data_backups',
                label: 'Backups del panel',
                status: 'warn',
                detail: `Sin backups en ${DASHBOARD_BACKUP_DIR}`,
                remediation: `Ejecuta deploy/manage-dashboard-data.sh backup con FLOWARK_DASHBOARD_BACKUP_DIR=${DASHBOARD_BACKUP_DIR} y programa un backup periódico.`,
            };
        }

        const missingChecksums = [];
        let newest = null;
        for (const archive of archives) {
            const archivePath = path.join(DASHBOARD_BACKUP_DIR, archive);
            const checksumPath = `${archivePath}.sha256`;
            try {
                await fs.access(checksumPath, fsConstants.R_OK);
            } catch (_) {
                missingChecksums.push(archive);
            }
            const stat = await fs.stat(archivePath);
            if (!newest || stat.mtimeMs > newest.mtimeMs) {
                newest = { name: archive, mtimeMs: stat.mtimeMs };
            }
        }

        if (missingChecksums.length > 0) {
            return {
                id: 'data_backups',
                label: 'Backups del panel',
                status: 'fail',
                detail: `Backups sin checksum: ${missingChecksums.slice(0, 3).join(', ')}`,
                remediation: 'Regenera esos backups o crea sus .sha256 desde una copia verificada antes de confiar en ellos para restauración.',
            };
        }

        const ageHours = newest ? (Date.now() - newest.mtimeMs) / 36e5 : Infinity;
        if (ageHours > 24 * 7) {
            return {
                id: 'data_backups',
                label: 'Backups del panel',
                status: 'warn',
                detail: `Último backup hace ${Math.floor(ageHours / 24)} días: ${newest.name}`,
                remediation: 'Ejecuta un backup fresco y confirma que el archivo .tar.gz y su .sha256 quedan en el directorio de backups.',
            };
        }

        return {
            id: 'data_backups',
            label: 'Backups del panel',
            status: 'ok',
            detail: `${archives.length} backup(s); último: ${newest.name}`,
        };
    } catch (err) {
        return {
            id: 'data_backups',
            label: 'Backups del panel',
            status: 'warn',
            detail: `No se pudo inspeccionar ${DASHBOARD_BACKUP_DIR}: ${err.code || err.message}`,
            remediation: `Crea ${DASHBOARD_BACKUP_DIR} con permisos restrictivos o configura FLOWARK_DASHBOARD_BACKUP_DIR a una ruta persistente accesible.`,
        };
    }
}

async function collectProductionReadiness() {
    const checks = [];
    const add = (id, label, status, detail, remediation = '') => {
        const check = { id, label, status, detail };
        if (remediation && status !== 'ok') check.remediation = remediation;
        checks.push(check);
    };

    add(
        'runtime_mode',
        'Modo runtime',
        IS_PRODUCTION ? 'ok' : 'warn',
        IS_PRODUCTION ? 'NODE_ENV=production activo' : `NODE_ENV=${process.env.NODE_ENV || 'development'}`,
        'Arranca el panel con NODE_ENV=production desde systemd o deploy/start-pm2.sh antes de exponerlo detrás de HTTPS.'
    );

    const loopbackHost = HOST === '127.0.0.1' || HOST === '::1' || HOST === 'localhost';
    add(
        'bind_host',
        'Bind del backend',
        loopbackHost ? 'ok' : 'fail',
        loopbackHost ? `Escuchando en ${HOST}` : `HOST=${HOST}; usa loopback detrás de nginx`,
        'Configura HOST=127.0.0.1 o ::1 y publica el panel únicamente mediante nginx/HTTPS.'
    );

    const localhostCors = corsOrigins.some(origin => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(origin));
    const insecureCors = corsOrigins.some(origin => !/^https:\/\//i.test(origin));
    add(
        'cors_origins',
        'CORS',
        (!IS_PRODUCTION || (!localhostCors && !insecureCors)) ? 'ok' : 'fail',
        corsOrigins.length ? corsOrigins.join(', ') : 'Sin orígenes configurados',
        'Define CORS_ORIGINS con orígenes HTTPS exactos, sin localhost, wildcard, rutas, query ni fragmentos.'
    );

    add(
        'jwt_secret',
        'JWT secret',
        process.env.JWT_SECRET_KEY ? 'ok' : 'warn',
        process.env.JWT_SECRET_KEY ? 'JWT_SECRET_KEY viene del entorno' : 'Usando secreto local de desarrollo',
        'Mueve JWT_SECRET_KEY a /etc/flowark-dashboard/dashboard.env con al menos 32 caracteres aleatorios y reinicia el servicio.'
    );

    checks.push(await accessStatus(
        'data_dir',
        'Directorio de datos',
        DATA_DIR,
        fsConstants.R_OK | fsConstants.W_OK,
        'Lectura/escritura disponible',
        `No se puede leer/escribir ${DATA_DIR}`,
        `Crea ${DATA_DIR}, asigna propietario al usuario del panel y valida ReadWritePaths si usas systemd endurecido.`
    ));
    checks.push(await dashboardDataStateStatus());
    checks.push(await dashboardBackupStatus());

    const assetsDir = path.join(CLIENT_DIST, 'assets');
    const assetsCheck = await accessStatus(
        'client_assets',
        'Build del cliente',
        assetsDir,
        fsConstants.R_OK,
        'Assets de producción presentes',
        `No se puede leer ${assetsDir}`
    );
    if (assetsCheck.status === 'ok') {
        try {
            const assets = await fs.readdir(assetsDir);
            if (!assets.some(name => name.endsWith('.js')) || !assets.some(name => name.endsWith('.css'))) {
                assetsCheck.status = 'fail';
                assetsCheck.detail = 'Faltan assets JS/CSS generados por Vite';
                assetsCheck.remediation = 'Ejecuta npm run build en client y despliega client/dist completo junto al servidor.';
            } else {
                const indexHtml = await fs.readFile(path.join(CLIENT_DIST, 'index.html'), 'utf8');
                const requiredShellMarkers = [
                    '<html lang="es">',
                    '<title>ObeliskNative</title>',
                    'name="description" content="ObeliskNative: consola, jugadores, clusters, plugins y artifacts para ARK en Linux."',
                    'name="robots" content="noindex,nofollow,noarchive"',
                    'name="theme-color" content="#09090b"',
                ];
                const missingMarkers = requiredShellMarkers.filter(marker => !indexHtml.includes(marker));
                if (missingMarkers.length > 0 || /<title>client<\/title>|<html lang="en">/.test(indexHtml)) {
                    assetsCheck.status = 'fail';
                    assetsCheck.detail = 'El shell HTML de producción no contiene los metadatos ObeliskNative esperados';
                    assetsCheck.remediation = 'Reconstruye el frontend con npm run build en client y despliega client/dist completo.';
                }
            }
        } catch (err) {
            assetsCheck.status = 'fail';
            assetsCheck.detail = `No se pudo inspeccionar el build del cliente: ${err.code || err.message}`;
            assetsCheck.remediation = 'Revisa permisos de client/dist/assets o reconstruye el frontend de producción.';
        }
    }
    checks.push(assetsCheck);

    add(
        'cluster_maps',
        'Mapas configurados',
        CLUSTER_MAPS.length > 0 ? 'ok' : 'fail',
        CLUSTER_MAPS_LOAD_ERROR || `${CLUSTER_MAPS.length} mapa(s) validado(s) desde nodes.json`,
        'Corrige DASHBOARD_NODES_CONFIG o server/data/nodes.json usando server/data/nodes.example.json como plantilla.'
    );

    try {
        const owners = (await readAdmins()).filter(admin => normalizeRole(admin.role) === 'owner');
        add(
            'owner_account',
            'Owners',
            owners.length > 0 ? 'ok' : 'fail',
            `${owners.length} owner(s) activo(s)`,
            'Crea al menos un owner con DASHBOARD_BOOTSTRAP_USERNAME/DASHBOARD_BOOTSTRAP_PASSWORD o desde Gestión de administradores.'
        );
    } catch (err) {
        add('owner_account', 'Owners', 'fail', `No se pudieron leer admins: ${err.message}`, 'Restaura admins.json desde backup o corrige permisos/formato antes de reiniciar.');
    }

    for (const map of CLUSTER_MAPS) {
        checks.push(await accessStatus(
            `map_${map.id}_script`,
            `${map.name} script`,
            map.script,
            fsConstants.R_OK | fsConstants.X_OK,
            'Script LGSM ejecutable',
            `No se puede ejecutar ${map.script}`,
            `Revisa la ruta script de ${map.id} en nodes.json y permisos de ejecución del usuario del panel.`
        ));
        checks.push(await accessStatus(
            `map_${map.id}_game_ini`,
            `${map.name} Game.ini`,
            map.gameIni,
            fsConstants.R_OK | fsConstants.W_OK,
            'Game.ini editable',
            `No se puede editar ${map.gameIni}`,
            `Ajusta permisos de ${map.gameIni} o corrige la ruta gameIni de ${map.id} en nodes.json.`
        ));
        checks.push(await accessStatus(
            `map_${map.id}_gus_ini`,
            `${map.name} GameUserSettings.ini`,
            map.gameUserSettings,
            fsConstants.R_OK | fsConstants.W_OK,
            'GameUserSettings.ini editable',
            `No se puede editar ${map.gameUserSettings}`,
            `Ajusta permisos de ${map.gameUserSettings} o corrige la ruta gameUserSettings de ${map.id} en nodes.json.`
        ));
    }

    const failed = checks.filter(check => check.status === 'fail').length;
    const warnings = checks.filter(check => check.status === 'warn').length;
    return {
        status: failed > 0 ? 'fail' : warnings > 0 ? 'warn' : 'ok',
        failed,
        warnings,
        checkedAt: new Date().toISOString(),
        checks
    };
}

// --- Helper: Read/Write Bans ---
async function readBans() {
    return readJsonFile(BANS_PATH, []);
}

async function writeBans(bans) {
    await updateJsonFile(BANS_PATH, [], () => bans);
}

// --- Player Tracking Database ---
async function readPlayersDb() {
    return readJsonFile(PLAYERS_DB_PATH, {});
}

async function writePlayersDb(db) {
    await updateJsonFile(PLAYERS_DB_PATH, {}, () => db);
}

let playerTrackerRunning = false;

async function trackOnlinePlayersOnce() {
    if (playerTrackerRunning) return false;
    playerTrackerRunning = true;
    try {
        const seenPlayers = [];

        for (const map of CLUSTER_MAPS) {
            if (map.monitor_file) continue;
            try {
                // Compatibility tracking for servers without the native monitor.
                const response = await execRcon('ListPlayers', map.id);
	                if (response && response.trim() && !response.includes('No Players')) {
	                    const lines = response.split('\n').filter(l => l.trim());
	                    for (const line of lines) {
	                        const match = line.match(/^\d+\.\s*(.+?),\s*(\d{10,25})/);
	                        if (match) {
	                            const name = match[1].trim();
	                            const steamId = match[2].trim();
	                            seenPlayers.push({ name, steamId });
	                        }
	                    }
	                }
            } catch (e) {
                // Server might be offline or RCON failed
            }
        }

        if (seenPlayers.length > 0) {
            await updateJsonFile(PLAYERS_DB_PATH, {}, db => {
                const now = new Date().toISOString();
                for (const { name, steamId } of seenPlayers) {
                    if (!db[steamId]) {
                        db[steamId] = {
                            name,
                            steamId,
                            firstSeen: now,
                            lastSeen: now,
                            playtimeMinutes: 1
                        };
                    } else {
                        db[steamId].name = name; // Update name in case they changed it
                        db[steamId].lastSeen = now;
                        db[steamId].playtimeMinutes = (db[steamId].playtimeMinutes || 0) + 1;
                    }
                }
                return db;
            });
        }
    } catch (err) {
        console.error('Player tracking task failed:', err);
    } finally {
        playerTrackerRunning = false;
    }
    return true;
}

// Background Task: Poll online players to track playtime
if (!IS_TEST) {
setInterval(() => {
    trackOnlinePlayersOnce().catch(err => console.error('Player tracking task failed:', err));
}, 60000); // Run every 60 seconds
}

async function readAdmins() {
    return readJsonFile(ADMINS_PATH, []);
}

async function writeAdmins(admins) {
    await updateJsonFile(ADMINS_PATH, [], () => admins);
}

function hasAnotherOwner(admins, targetId) {
    return admins.some(admin => String(admin.id) !== String(targetId) && normalizeRole(admin.role) === 'owner');
}

function hasExplicitConfirmation(value, expected) {
    return typeof value === 'string' && value.trim().toLowerCase() === String(expected || '').toLowerCase();
}

function resolveRequiredMapId(mapId) {
    if (!mapId || typeof mapId !== 'string') return { error: 'mapId es obligatorio' };
    const normalizedMapId = mapId.trim();
    if (!normalizedMapId) return { error: 'mapId es obligatorio' };
    if (!VALID_MAP_IDS.includes(normalizedMapId)) return { error: 'mapId inválido' };
    return { mapId: normalizedMapId };
}

function resolvePresetPath(presetId) {
    if (!isSafeRuntimeId(presetId) || presetId === '.' || presetId === '..') {
        const error = new Error('presetId inválido');
        error.statusCode = 400;
        throw error;
    }
    const presetsRoot = path.resolve(DATA_DIR, 'presets');
    const presetDir = path.resolve(presetsRoot, presetId);
    if (presetDir !== presetsRoot && !presetDir.startsWith(`${presetsRoot}${path.sep}`)) {
        const error = new Error('presetId inválido');
        error.statusCode = 400;
        throw error;
    }
    return presetDir;
}

function isValidRconCommand(command) {
    return typeof command === 'string' &&
        command.trim().length > 0 &&
        command.length <= 500 &&
        !/[\r\n\0-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(command);
}

function sanitizeAuditText(value, fallback = 'Unknown', maxLength = 500) {
    if (typeof value !== 'string') return fallback;
    const sanitized = value
        .replace(/[\r\n\0-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
    return sanitized || fallback;
}

function upsertActiveBan(bans, banRecord) {
    let replaced = false;
    const next = bans.map(ban => {
        if (ban.steamId === banRecord.steamId && ban.active) {
            replaced = true;
            return { ...ban, ...banRecord, id: ban.id || banRecord.id, active: true };
        }
        return ban;
    });
    if (!replaced) next.push(banRecord);
    return next;
}

function deactivateActiveBans(bans, steamId, unbannedBy) {
    const unbannedAt = new Date().toISOString();
    return bans.map(ban => ban.steamId === steamId && ban.active
        ? { ...ban, active: false, unbannedBy, unbannedAt }
        : ban);
}

// --- Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const token = req.cookies[SESSION_COOKIE_NAME] || req.cookies['__Host-session'] || req.cookies['session'];
    if (!token) return res.status(401).json({ error: 'No autorizado' });

    jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, async (err, user) => {
        if (err || (DISCORD_AUTH_ONLY && user?.authProvider !== 'discord')) {
            clearDashboardAuthCookies(res);
            return res.status(403).json({ error: 'Sesión inválida' });
        }
        try {
            const admins = await readAdmins();
            const currentAdmin = admins.find(admin => String(admin.id) === String(user.id));
            if (!currentAdmin) {
                clearDashboardAuthCookies(res);
                return res.status(401).json({ error: 'No autorizado' });
            }
            const tokenSessionVersion = Number.isInteger(user.sessionVersion) ? user.sessionVersion : 0;
            if (tokenSessionVersion !== adminSessionVersion(currentAdmin)) {
                clearDashboardAuthCookies(res);
                return res.status(401).json({ error: 'No autorizado' });
            }
            req.user = publicAdmin(currentAdmin);
            next();
        } catch (readErr) {
            res.status(500).json({ error: 'Error del servidor' });
        }
    });
};

async function resolveAuthenticatedAdminFromRequest(req) {
    const token = req.cookies[SESSION_COOKIE_NAME] || req.cookies['__Host-session'] || req.cookies['session'];
    if (!token) return null;
    try {
        const user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        if (DISCORD_AUTH_ONLY && user.authProvider !== 'discord') return null;
        const admins = await readAdmins();
        const currentAdmin = admins.find(admin => String(admin.id) === String(user.id));
        if (!currentAdmin) return null;
        const tokenSessionVersion = Number.isInteger(user.sessionVersion) ? user.sessionVersion : 0;
        if (tokenSessionVersion !== adminSessionVersion(currentAdmin)) return null;
        return publicAdmin(currentAdmin);
    } catch (_) {
        return null;
    }
}

// --- Auth Routes ---
require('./oidc').installOidcRoutes(app, {
    readAdmins, auditLog, test: IS_TEST,
    async recordLogin({ discordId, subject }) {
        let authenticated = null;
        await updateJsonFile(ADMINS_PATH, [], admins => admins.map(admin => {
            if (admin.discordId !== discordId || (admin.oidcSubject && admin.oidcSubject !== subject)) return admin;
            authenticated = { ...admin, oidcSubject: subject, lastLoginAt: new Date().toISOString() };
            return authenticated;
        }));
        return authenticated;
    },
    issueSession(req, res, admin) {
        const token = jwt.sign({ id: admin.id, username: admin.username, role: normalizeRole(admin.role), sessionVersion: adminSessionVersion(admin), authProvider: 'discord' },
            JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
        res.cookie(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict', path: '/', maxAge: 3600000, priority: 'high' });
        issueCsrfCookie(req, res);
    },
});
app.post('/api/auth/login', async (req, res) => {
    if (DISCORD_AUTH_ONLY) return res.status(410).json({ error: 'Utiliza Acceder con Discord' });
    try {
        const { username, password } = req.body;
        const loginPayload = normalizeLoginPayload(username, password);
        if (!loginPayload) {
            await auditLog('system', 'LOGIN_FAILED', `Invalid login payload from ${requestIpForAudit(req)}`);
            return res.status(400).json({ error: 'Credenciales inválidas' });
        }
        const admins = await readAdmins();
        const admin = admins.find(a => String(a.username).toLowerCase() === loginPayload.username.toLowerCase());
        if (!admin) {
            await auditLog('system', 'LOGIN_FAILED', `Invalid credentials from ${requestIpForAudit(req)}`);
            return res.status(400).json({ error: 'Credenciales inválidas' });
        }
        const validPassword = await bcrypt.compare(loginPayload.password, admin.password);
        if (!validPassword) {
            await auditLog('system', 'LOGIN_FAILED', `Invalid credentials from ${requestIpForAudit(req)}`);
            return res.status(400).json({ error: 'Credenciales inválidas' });
        }
        const role = normalizeRole(admin.role);
        const token = jwt.sign(
            { id: admin.id, username: admin.username, role, sessionVersion: adminSessionVersion(admin) },
            JWT_SECRET,
            { expiresIn: SESSION_JWT_EXPIRES_IN, algorithm: 'HS256' }
        );

        // Secure cookie for session
        res.cookie(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_MAX_AGE_MS,
            priority: 'high'
        });
        issueCsrfCookie(req, res);

        const publicUser = publicAdmin(admin);
        await auditLog(admin.username, 'LOGIN', 'Dashboard login');
        res.json({ user: publicUser, username: publicUser.username, role: publicUser.role });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: { ...req.user, role: normalizeRole(req.user.role) } });
});

app.get('/api/permissions', authenticateToken, requireRole('owner'), (req, res) => {
    res.json({ permissions: PERMISSION_CATALOG, roleDefaults: ROLE_PERMISSION_DEFAULTS });
});

app.post('/api/auth/logout', async (req, res) => {
    const admin = await resolveAuthenticatedAdminFromRequest(req);
    if (admin) {
        await auditLog(admin.username, 'LOGOUT', 'Dashboard logout', { bestEffort: true });
    }
    clearDashboardAuthCookies(res);
    res.json({ message: 'Sesión cerrada' });
});

app.post('/api/auth/password', authenticateToken, async (req, res) => {
    if (DISCORD_AUTH_ONLY) return res.status(410).json({ error: 'Esta cuenta accede mediante Discord y no tiene contraseña local' });
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            return res.status(400).json({ error: 'La contraseña actual y la nueva contraseña son obligatorias' });
        }
        const passwordError = dashboardPasswordError(newPassword);
        if (passwordError) return res.status(400).json({ error: passwordError });

        await ensureAuditLogWritable();
        let updatedAdmin = null;
        let updateError = null;
        await updateJsonFile(ADMINS_PATH, [], async admins => {
            const currentAdmin = admins.find(admin => String(admin.id) === String(req.user.id));
            if (!currentAdmin) {
                updateError = { status: 401, error: 'No autorizado' };
                return admins;
            }
            const validPassword = await bcrypt.compare(currentPassword, currentAdmin.password);
            if (!validPassword) {
                updateError = { status: 400, error: 'La contraseña actual no es correcta' };
                return admins;
            }

            const nextAdmins = await Promise.all(admins.map(async admin => {
                if (String(admin.id) !== String(req.user.id)) return admin;
                updatedAdmin = {
                    ...admin,
                    password: await bcrypt.hash(newPassword, 12),
                    sessionVersion: adminSessionVersion(admin) + 1,
                };
                return updatedAdmin;
            }));
            return nextAdmins;
        });

        if (updateError) return res.status(updateError.status).json({ error: updateError.error });
        const role = normalizeRole(updatedAdmin.role);
        const token = jwt.sign(
            { id: updatedAdmin.id, username: updatedAdmin.username, role, sessionVersion: adminSessionVersion(updatedAdmin) },
            JWT_SECRET,
            { expiresIn: SESSION_JWT_EXPIRES_IN, algorithm: 'HS256' }
        );
        res.cookie(SESSION_COOKIE_NAME, token, {
            httpOnly: true,
            secure: IS_PRODUCTION,
            sameSite: 'strict',
            path: '/',
            maxAge: SESSION_MAX_AGE_MS,
            priority: 'high'
        });

        await auditLog(updatedAdmin.username, 'PASSWORD_CHANGED', 'Dashboard password changed by account owner');
        res.json({ message: 'Contraseña actualizada', user: publicAdmin(updatedAdmin) });
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// --- Dashboard Admin Routes ---
app.get('/api/admins', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        res.json((await readAdmins()).map(publicAdmin));
    } catch (err) { res.status(500).json({ error: 'Error del servidor' }); }
});

app.post('/api/admins', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { username, password, discordId, role = 'operator', confirmation } = req.body;
        const discordAccount = DISCORD_AUTH_ONLY || discordId !== undefined;
        if (discordAccount && (typeof discordId !== 'string' || !/^[0-9]{17,20}$/.test(discordId))) {
            return res.status(400).json({ error: 'Introduce un ID de usuario de Discord válido (17-20 dígitos)' });
        }
        if (discordAccount && password !== undefined) return res.status(400).json({ error: 'Las cuentas de Discord no utilizan contraseña local' });
        if (!username || typeof username !== 'string' || (!discordAccount && (!password || typeof password !== 'string'))) {
            return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
        }
        if (!isValidRole(role)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }
        const normalizedRole = role;
        const normalizedUsername = username.trim();
        if (!USERNAME_PATTERN.test(normalizedUsername)) {
            return res.status(400).json({ error: 'El usuario debe tener 3-32 caracteres y solo puede contener letras, números, puntos, guiones bajos o guiones' });
        }
        const passwordError = discordAccount ? null : dashboardPasswordError(password);
        if (passwordError) return res.status(400).json({ error: passwordError });
        if (normalizedRole === 'owner' && !hasExplicitConfirmation(confirmation, `OWNER ${normalizedUsername}`)) {
            return res.status(400).json({ error: 'Crear un owner requiere confirmación explícita' });
        }
        await ensureAuditLogWritable();
        let duplicate = false;
        await updateJsonFile(ADMINS_PATH, [], async admins => {
            if (admins.find(a => String(a.username).toLowerCase() === normalizedUsername.toLowerCase() || (discordAccount && a.discordId === discordId))) {
                duplicate = true;
                return admins;
            }
            admins.push({ id: uuidv4(), username: normalizedUsername, role: normalizedRole, permissions: { allow: [], deny: [] },
                ...(discordAccount ? { discordId, invitedAt: new Date().toISOString() } : { password: await bcrypt.hash(password, 12) }), sessionVersion: 0 });
            return admins;
        });
        if (duplicate) return res.status(400).json({ error: discordAccount ? 'Ese usuario o ID de Discord ya existe' : 'Ese usuario ya existe' });
        await auditLog(req.user.username, 'ADMIN_CREATED', `Created dashboard admin: ${normalizedUsername} (${normalizedRole})`);
        res.json({ message: 'Administrador creado' });
    } catch (err) { res.status(500).json({ error: 'Error del servidor' }); }
});

app.patch('/api/admins/:id', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const id = parseSafeIdParam(req.params.id, 'admin id');
        const updates = req.body || {};
        if (Object.prototype.hasOwnProperty.call(updates, 'discordId')) return res.status(400).json({ error: 'Para cambiar la identidad de Discord, revoca el acceso y crea una nueva invitación' });
        if (DISCORD_AUTH_ONLY && Object.prototype.hasOwnProperty.call(updates, 'password')) return res.status(400).json({ error: 'Las cuentas de Discord no utilizan contraseña local' });
        const requestedUsername = Object.prototype.hasOwnProperty.call(updates, 'username') ? String(updates.username || '').trim() : null;
        const requestedRole = Object.prototype.hasOwnProperty.call(updates, 'role') ? updates.role : null;
        const requestedPassword = Object.prototype.hasOwnProperty.call(updates, 'password') ? updates.password : null;
        const requestedPermissions = Object.prototype.hasOwnProperty.call(updates, 'permissions') ? updates.permissions : null;
        const requestedConfirmation = Object.prototype.hasOwnProperty.call(updates, 'confirmation') ? updates.confirmation : null;

        if (requestedUsername !== null && !USERNAME_PATTERN.test(requestedUsername)) {
            return res.status(400).json({ error: 'El usuario debe tener 3-32 caracteres y solo puede contener letras, números, puntos, guiones bajos o guiones' });
        }
        if (requestedRole !== null && !isValidRole(requestedRole)) {
            return res.status(400).json({ error: 'Rol inválido' });
        }
        if (requestedPassword !== null) {
            const passwordError = dashboardPasswordError(requestedPassword);
            if (passwordError) return res.status(400).json({ error: passwordError });
        }
        if (requestedPermissions !== null && (!requestedPermissions || typeof requestedPermissions !== 'object' || Array.isArray(requestedPermissions))) {
            return res.status(400).json({ error: 'Permisos inválidos' });
        }
        if (requestedUsername === null && requestedRole === null && requestedPassword === null && requestedPermissions === null) {
            return res.status(400).json({ error: 'No hay cambios válidos para guardar' });
        }

        await ensureAuditLogWritable();
        let target = null;
        let updateError = null;
        let changed = false;
        await updateJsonFile(ADMINS_PATH, [], async admins => {
            target = admins.find(a => String(a.id) === String(id));
            if (!target) {
                updateError = { status: 404, error: 'Administrador no encontrado' };
                return admins;
            }

            if (requestedUsername !== null && admins.some(a => String(a.id) !== String(id) && String(a.username).toLowerCase() === requestedUsername.toLowerCase())) {
                updateError = { status: 400, error: 'Ese usuario ya existe' };
                return admins;
            }

            const nextRole = requestedRole !== null ? requestedRole : normalizeRole(target.role);
            if (normalizeRole(target.role) === 'owner' && nextRole !== 'owner' && !hasAnotherOwner(admins, id)) {
                updateError = { status: 400, error: 'No puedes degradar al último owner' };
                return admins;
            }
            if (String(req.user.id) === String(id) && requestedRole !== null && nextRole !== normalizeRole(target.role)) {
                updateError = { status: 400, error: 'No puedes cambiar tu propio rol' };
                return admins;
            }
            const nextUsername = requestedUsername !== null ? requestedUsername : target.username;
            if (requestedRole !== null && nextRole !== normalizeRole(target.role) && !hasExplicitConfirmation(requestedConfirmation, `ROL ${nextUsername}`)) {
                updateError = { status: 400, error: 'Los cambios de rol requieren confirmación explícita' };
                return admins;
            }
            if (requestedPassword !== null && (requestedRole === null || nextRole === normalizeRole(target.role)) && !hasExplicitConfirmation(requestedConfirmation, `RESET ${nextUsername}`)) {
                updateError = { status: 400, error: 'Los reseteos de contraseña requieren confirmación explícita' };
                return admins;
            }

            const nextAdmins = await Promise.all(admins.map(async admin => {
                if (String(admin.id) !== String(id)) return admin;
                const nextAdmin = { ...admin, sessionVersion: adminSessionVersion(admin) };
                if (requestedUsername !== null && requestedUsername !== admin.username) {
                    nextAdmin.username = requestedUsername;
                    changed = true;
                }
                if (requestedRole !== null && requestedRole !== normalizeRole(admin.role)) {
                    nextAdmin.role = requestedRole;
                    changed = true;
                }
                if (requestedPassword !== null) {
                    nextAdmin.password = await bcrypt.hash(requestedPassword, 12);
                    changed = true;
                }
                if (requestedPermissions !== null) {
                    const normalizedPermissions = normalizeAdminPermissions({ permissions: requestedPermissions });
                    if (JSON.stringify(normalizeAdminPermissions(admin)) !== JSON.stringify(normalizedPermissions)) {
                        nextAdmin.permissions = normalizedPermissions;
                        changed = true;
                    }
                }
                if (changed) nextAdmin.sessionVersion = adminSessionVersion(nextAdmin) + 1;
                target = nextAdmin;
                return nextAdmin;
            }));
            return nextAdmins;
        });

        if (updateError) return res.status(updateError.status).json({ error: updateError.error });
        if (!changed) return res.status(400).json({ error: 'No hay cambios para guardar' });
        await auditLog(req.user.username, 'ADMIN_UPDATED', `Updated dashboard admin: ${target.username} (${normalizeRole(target.role)})`);
        res.json({ message: 'Administrador actualizado', admin: publicAdmin(target) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error del servidor' });
    }
});

app.delete('/api/admins/:id', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const id = parseSafeIdParam(req.params.id, 'admin id');
        const confirmation = req.body?.confirmation;
        await ensureAuditLogWritable();
        let target = null;
        let deleteError = null;
        await updateJsonFile(ADMINS_PATH, [], admins => {
            target = admins.find(a => String(a.id) === String(id));
            if (!target) {
                deleteError = { status: 404, error: 'Administrador no encontrado' };
                return admins;
            }
            if (normalizeRole(target.role) === 'owner' && !hasAnotherOwner(admins, id)) {
                deleteError = { status: 400, error: 'No puedes borrar el último owner' };
                return admins;
            }
            if (String(req.user.id) === String(id)) {
                deleteError = { status: 400, error: 'No puedes borrar tu propia cuenta admin' };
                return admins;
            }
            if (!hasExplicitConfirmation(confirmation, target.username)) {
                deleteError = { status: 400, error: 'Borrar un administrador requiere confirmación explícita' };
                return admins;
            }
            const filtered = admins.filter(a => String(a.id) !== String(id));
            if (filtered.length === 0) {
                deleteError = { status: 400, error: 'No puedes borrar el último administrador' };
                return admins;
            }
            return filtered;
        });
        if (deleteError) return res.status(deleteError.status).json({ error: deleteError.error });
        await auditLog(req.user.username, 'ADMIN_DELETED', `Deleted dashboard admin: ${target?.username || id}`);
        res.json({ message: 'Administrador borrado' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error del servidor' });
    }
});

// ARK-specific adapters used by the txAdmin port.
async function requireMapStoppedForEditing(map) {
    const result = await runFile(map.script, ['status'], { timeout: 5000, maxBuffer: 8192 });
    const state = String(result.stdout).match(/^ActiveState=(.*)$/m)?.[1];
    if (!['inactive', 'failed'].includes(state)) {
        const error = new Error('Detén el mapa antes de editar. ARK reescribe sus archivos INI al cerrar.');
        error.statusCode = 409; throw error;
    }
}
require('./config-editor').installConfigEditor(app, {
    authenticateToken, requireRole,
    getMap(id) { const selected = resolveRequiredMapId(id); if (selected.error) { const error = new Error(selected.error); error.statusCode = 400; throw error; } return getMapConfig(selected.mapId); },
    ensureStopped: requireMapStoppedForEditing, updateText: updateTextFileAtomic,
    auditLog, ensureAuditLogWritable, redact: redactArkSecrets,
});
const restartScheduler = require('./scheduled-restarts').createRestartScheduler({
    file: path.join(DATA_DIR, 'scheduled_restarts.json'), read: readJsonFile, update: updateJsonFile,
    getAdmins: readAdmins, getMaps: () => CLUSTER_MAPS, auditLog,
    async execute(map) {
        const result = await runFile(map.script, ['status'], { timeout: 5000, maxBuffer: 8192 });
        if (!/^ActiveState=active$/m.test(String(result.stdout))) throw new Error('map_not_active');
        const saved = await execRcon('SaveWorld', map.id);
        if (!String(saved).includes('World Saved')) throw new Error('save_not_confirmed');
        const previousPid = String(result.stdout).match(/^MainPID=(\d+)$/m)?.[1];
        if (!previousPid || previousPid === '0') throw new Error('process_identity_unavailable');
        await runFile(map.script, ['restart']);
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
            const status = await runFile(map.script, ['status'], { timeout: 5000, maxBuffer: 8192 });
            const nextPid = String(status.stdout).match(/^MainPID=(\d+)$/m)?.[1];
            if (/^ActiveState=active$/m.test(String(status.stdout)) && nextPid && nextPid !== '0' && nextPid !== previousPid) return;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        throw new Error('restart_not_confirmed');
    },
});
require('./scheduled-restarts').installRestartRoutes(app, { service: restartScheduler, authenticateToken, requireRole });
if (!IS_TEST) {
    restartScheduler.recover().catch(() => console.error('Scheduled restart recovery requires operator review'));
    setInterval(() => restartScheduler.tick().catch(() => console.error('Scheduled restart registry requires operator review')), 1000).unref();
}

// --- Cluster Info Routes ---
app.get('/api/cluster/maps', authenticateToken, (req, res) => {
    res.json({ maps: CLUSTER_MAPS.map(m => publicClusterMapForUser(m, req.user)) });
});

// Helper: query a single map's status
require('./monitor').installMonitorRoutes(app, {
    service: nativeMonitor, authenticateToken, resolveAdmin: resolveAuthenticatedAdminFromRequest,
});
async function queryMapStatus(map, processList = [], options = {}) {
    const allowRconFallback = !map.monitor_file && options.allowRconFallback !== false;
    const includeProcessMetrics = options.includeProcessMetrics !== false;
    let gameData = null;
    let rconPlayers = [];
    let rconOnline = false;
    let configSessionName = null;

    // Try to read from LGSM instance config first, as it overrides the ini
    if (map.script) {
        try {
            const fsSync = require('fs');
            const path = require('path');
            const scriptDir = path.dirname(map.script);
            const scriptName = path.basename(map.script);
            const lgsmConfigPath = path.join(scriptDir, 'lgsm/config-lgsm/arkserver', `${scriptName}.cfg`);
            if (fsSync.existsSync(lgsmConfigPath)) {
                const cfgContent = fsSync.readFileSync(lgsmConfigPath, 'utf8');
                const match = cfgContent.match(/^ark_session_name="(.*)"$/m) || cfgContent.match(/^ark_session_name='(.*)'$/m);
                if (match && match[1]) {
                    configSessionName = match[1].trim();
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    // Fallback to GameUserSettings.ini if LGSM config didn't have it
    if (!configSessionName && map.gameUserSettings) {
        try {
            const fsSync = require('fs');
            if (fsSync.existsSync(map.gameUserSettings)) {
                const configContent = fsSync.readFileSync(map.gameUserSettings, 'utf8');
                const match = configContent.match(/^SessionName=(.*)$/m);
                if (match && match[1]) {
                    configSessionName = match[1].trim();
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    if (map.monitor_file) {
        try { gameData = await require('./a2s').queryAseInfo({ host: map.host, port: map.queryPort }); }
        catch { /* Public query readiness remains separate from native heartbeat. */ }
    } else {
        try {
            gameData = await queryGameServer({ type: 'ase', host: map.host, port: map.queryPort, givenPortOnly: true });
        } catch (_) {
            try { gameData = await queryGameServer({ type: 'ase', host: map.host, port: map.gamePort, givenPortOnly: true }); }
            catch (_) {}
        }
    }

    if (!gameData && allowRconFallback) {
        try {
            const rconResponse = await execRcon('ListPlayers', map.id);
            rconOnline = true;
            if (rconResponse && rconResponse.trim() && !rconResponse.includes('No Players')) {
                const lines = rconResponse.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    const match = line.match(/^\d+\.\s*(.+?),\s*(\d{10,25})/);
                    if (match) {
                        rconPlayers.push({ name: match[1].trim(), steamId: match[2].trim() });
                    }
                }
            }
        } catch(_) { /* RCON also failed, server is truly offline */ }
    }

    const isOnline = gameData ? true : rconOnline;
    const playerList = gameData ? (gameData.players || []) : rconPlayers;
    const playerCount = gameData
        ? (gameData.players ? gameData.players.length : gameData.numplayers || 0)
        : rconPlayers.length;

    // Find the associated process for CPU/RAM usage
    let procCpu = 0;
    let procRam = 0;
    let monitor;
    if (map.monitor_file) {
        monitor = await nativeMonitor.readMap(map);
        if (includeProcessMetrics && monitor.metrics) {
            procCpu = monitor.metrics.cpu_percent;
            // Compatibility field: percent of host RAM, derived from native RSS.
            procRam = monitor.metrics.rss_bytes / require('node:os').totalmem() * 100;
        }
    } else if (includeProcessMetrics) {
        const proc = findMapProcess(map, processList);
        if (proc) {
            procCpu = proc.cpu || 0;
            procRam = proc.mem || 0;
        }
    }

    return {
        id: map.id,
        name: map.name,
        status: isOnline ? 'online' : 'offline',
        players: playerCount,
        maxPlayers: gameData ? (gameData.maxplayers || 70) : 70,
        map: gameData ? (gameData.map || map.name) : map.name,
        serverName: gameData?.name || configSessionName || map.name,
        passwordProtected: typeof gameData?.password === 'boolean' ? gameData.password : null,
        playerList,
        cpu: procCpu,
        ram: procRam,
        ...(monitor ? { telemetrySource: 'native_monitor', monitorStatus: monitor.status } : {})
    };
}

app.get('/api/cluster/status', authenticateToken, async (req, res) => {
    try {
        const canOperate = hasRole(req.user, 'operator');
        const [cpu, mem, processes] = canOperate
            ? await Promise.all([si.currentLoad(), si.mem(), CLUSTER_MAPS.some(map => !map.monitor_file) ? si.processes() : { list: [] }])
            : [null, null, { list: [] }];
        const mapStatuses = await Promise.allSettled(CLUSTER_MAPS.map(m =>
            queryMapStatus(m, processes.list, {
                allowRconFallback: canOperate,
                includeProcessMetrics: canOperate,
            })
        ));
        const maps = mapStatuses.map((r, i) => publicMapStatusForUser(
            r.status === 'fulfilled' ? r.value : { id: CLUSTER_MAPS[i].id, name: CLUSTER_MAPS[i].name, status: 'error', players: 0, maxPlayers: 0, map: CLUSTER_MAPS[i].name, playerList: [], cpu: 0, ram: 0 },
            req.user
        ));

        const payload = { maps };
        if (canOperate) {
            payload.cpu = cpu.currentLoad || 0;
            payload.ram = mem.total > 0 ? (mem.active / mem.total) * 100 : 0;
        }
        res.json(payload);
    } catch(err) {
        res.json(publicClusterStatusErrorForUser(req.user));
    }
});

app.get('/api/server/state', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const selection = resolveRequiredMapId(req.query.mapId);
        if (selection.error) return res.status(400).json({ error: selection.error });
        const result = await runFile(getMapConfig(selection.mapId).script, ['status'], { timeout: 5000, maxBuffer: 8192 });
        const active = String(result.stdout).match(/^ActiveState=(.*)$/m)?.[1];
        const pid = Number(String(result.stdout).match(/^MainPID=(\d+)$/m)?.[1] || 0);
        res.json({ mapId: selection.mapId, state: ['active','activating','deactivating','inactive','failed'].includes(active) ? active : 'unknown', processId: Number.isSafeInteger(pid) ? pid : null });
    } catch { res.status(503).json({ error: 'No se pudo confirmar el estado del gestor del mapa' }); }
});

// --- Server Action Routes ---
const ALLOWED_ACTIONS = ['start', 'stop', 'restart'];

function commandOutputSnippet(value) {
    return String(value || '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(-4)
        .join(' | ');
}

function serverActionFailureMessage(action, mapName, err) {
    const detail = commandOutputSnippet(err?.stderr) ||
        commandOutputSnippet(err?.stdout) ||
        commandOutputSnippet(err?.message);
    const safeDetail = detail ? sanitizeAuditText(redactArkSecrets(detail), '', 360) : '';
    const target = sanitizeAuditText(mapName, 'servidor', 80);
    const safeAction = sanitizeAuditText(action, 'acción', 32);
    return safeDetail
        ? `No se pudo ejecutar ${safeAction} en ${target}: ${safeDetail}`
        : `No se pudo ejecutar ${safeAction} en ${target}`;
}

app.post('/api/server/action', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { action, mapId } = req.body;
        if (!ALLOWED_ACTIONS.includes(action)) return res.status(400).json({ error: 'Acción inválida' });
        if (mapId !== 'all' && (!mapId || !VALID_MAP_IDS.includes(mapId))) {
            return res.status(400).json({ error: 'mapId inválido. Usa un mapa válido o "all".' });
        }
        await ensureAuditLogWritable();

        if (mapId === 'all') {
            sendDiscordWebhook(action.toUpperCase(), { map: 'Clúster Completo', admin: req.user.username });
            if (action === 'stop' || action === 'restart') {
                await Promise.allSettled(CLUSTER_MAPS.map(map => execRcon('SaveWorld', map.id)));
            }
            // Execute action on all maps concurrently to avoid chain failures
            const results = await Promise.allSettled(CLUSTER_MAPS.map(async map => {
                await runFile(map.script, [action]);
                return { map: map.name };
            }));
            const failed = results.filter(r => r.status === 'rejected');
            await auditLog(req.user.username, 'SERVER_ACTION', `Cluster ${action} (all maps)`);
            if (failed.length === CLUSTER_MAPS.length) {
                return res.status(500).json({ error: `No se pudo ejecutar ${action} en ningún mapa del clúster` });
            }
            return res.json({
                message: `Comando ${action} enviado al clúster`,
                results: results.map((result, index) => ({
                    map: CLUSTER_MAPS[index].name,
                    status: result.status === 'fulfilled' ? 'enviado' : 'fallido',
                    ...(result.status === 'rejected' ? { error: serverActionFailureMessage(action, CLUSTER_MAPS[index].name, result.reason) } : {}),
                })),
            });
        }

        if (mapId && VALID_MAP_IDS.includes(mapId)) {
            const map = getMapConfig(mapId);
            sendDiscordWebhook(action.toUpperCase(), { map: map.name, admin: req.user.username });
            if (action === 'stop' || action === 'restart') {
                await execRcon('SaveWorld', map.id).catch(() => {});
            }
            await runFile(map.script, [action]);
            await auditLog(req.user.username, 'SERVER_ACTION', `${map.name} ${action}`);
            return res.json({ message: `Comando ${action} enviado a ${map.name}`, status: 'enviado' });
        }

        return res.status(400).json({ error: 'mapId inválido. Usa un mapa válido o "all".' });
    } catch (err) {
        const fallbackMap = VALID_MAP_IDS.includes(req.body?.mapId) ? getMapConfig(req.body.mapId)?.name : (req.body?.mapId || 'servidor');
        res.status(500).json({ error: serverActionFailureMessage(req.body?.action || 'la acción', fallbackMap, err) });
    }
});

app.get('/api/server/live', authenticateToken, async (req, res) => {
    try {
        const mapSelection = resolveRequiredMapId(req.query.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const map = getMapConfig(mapSelection.mapId);
        const canOperate = hasRole(req.user, 'operator');

        const [cpu, mem, processes] = canOperate
            ? await Promise.all([si.currentLoad(), si.mem(), CLUSTER_MAPS.some(map => !map.monitor_file) ? si.processes() : { list: [] }])
            : [null, null, { list: [] }];
        const mapStatus = await queryMapStatus(map, processes.list, {
            allowRconFallback: canOperate,
            includeProcessMetrics: canOperate,
        });

        const payload = publicMapStatusForUser(mapStatus, req.user);
        if (canOperate) {
            payload.sysCpu = cpu.currentLoad || 0;
            payload.sysRam = mem.total > 0 ? (mem.active / mem.total) * 100 : 0;
        }
        res.json(payload);
    } catch(err) {
        res.json(publicLiveStatusErrorForUser(req.user));
    }
});

// --- Player Management Routes ---

// Get online players via RCON ListPlayers (map-aware or global)
app.get('/api/players/online', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const mapId = req.query.mapId || 'all';
        let mapsToQuery = [];
        if (mapId === 'all') {
            mapsToQuery = CLUSTER_MAPS;
        } else {
            if (!VALID_MAP_IDS.includes(mapId)) return res.status(400).json({ error: 'mapId inválido' });
            mapsToQuery = [getMapConfig(mapId)];
        }

        res.json(await collectOnlinePlayerObservations(mapsToQuery));
    } catch (err) {
        res.status(500).json({ players: [], per_map: [], complete: false, source: 'rcon_listplayers', observed_at: new Date().toISOString(), error: 'No se pudieron consultar los jugadores conectados' });
    }
});

// Get player history
app.get('/api/players/history', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const db = await readPlayersDb();
        // Convert to array
        const history = Object.values(db);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo leer el historial de jugadores' });
    }
});

// Kick player (map-aware)
app.post('/api/players/kick', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { steamId, reason, mapId } = req.body;
        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }
        const sanitizedReason = sanitizeAuditText(reason, 'No reason specified', 500);
        await ensureAuditLogWritable();
        await execRcon(`KickPlayer ${steamId}`, targetMap);
        await auditLog(req.user.username, 'PLAYER_KICK', `Kicked player ${steamId} on ${targetMap}. Reason: ${sanitizedReason}`);
        res.json({ message: 'Jugador expulsado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo expulsar al jugador. ¿El servidor está encendido?' });
    }
});

// Ban player
app.post('/api/players/ban', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { steamId, playerName, reason } = req.body;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }
        const sanitizedReason = sanitizeAuditText(reason, 'No reason specified', 500);
        const sanitizedName = sanitizeAuditText(playerName, 'Unknown', 64);

        // Execute RCON ban (map-aware)
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        await ensureAuditLogWritable();
        await execRcon(`BanPlayer ${steamId}`, targetMap);

        // Persist ban
        await updateJsonFile(BANS_PATH, [], bans => upsertActiveBan(bans, {
            id: Date.now(),
            steamId,
            playerName: sanitizedName,
            reason: sanitizedReason,
            bannedBy: req.user.username,
            bannedAt: new Date().toISOString(),
            mapId: targetMap,
            active: true
        }));

        sendDiscordWebhook('BAN', { playerName: sanitizedName, steamId, admin: req.user.username, reason: sanitizedReason });
        await auditLog(req.user.username, 'PLAYER_BAN', `Banned player ${sanitizedName} (${steamId}). Reason: ${sanitizedReason}`);
        res.json({ message: 'Jugador baneado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo banear al jugador. ¿El servidor está encendido?' });
    }
});

// Unban player
app.post('/api/players/unban', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { steamId } = req.body;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }

        // Execute RCON unban (map-aware)
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const currentBans = await readBans();
        if (!currentBans.some(ban => ban.steamId === steamId && ban.active)) {
            return res.status(404).json({ error: 'No se encontró un ban activo' });
        }
        await ensureAuditLogWritable();
        await execRcon(`UnbanPlayer ${steamId}`, targetMap);

        // Update persisted ban
        await updateJsonFile(BANS_PATH, [], bans => deactivateActiveBans(bans, steamId, req.user.username));

        await auditLog(req.user.username, 'PLAYER_UNBAN', `Unbanned player ${steamId}`);
        res.json({ message: 'Jugador desbaneado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo desbanear al jugador. ¿El servidor está encendido?' });
    }
});

// Get ban list
app.get('/api/players/bans', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const bans = await readBans();
        res.json({ bans });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo leer la lista de baneos' });
    }
});

// Send message to player
app.post('/api/players/message', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { steamId, message } = req.body;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }
        const sanitizedMsg = sanitizeRconText(message);
        if (!sanitizedMsg) return res.status(400).json({ error: 'Mensaje inválido' });
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        await ensureAuditLogWritable();
        await execRcon(`ServerChatTo "${steamId}" ${sanitizedMsg}`, targetMap);
        await auditLog(req.user.username, 'PLAYER_MESSAGE', `Sent message to ${steamId}: ${sanitizedMsg.slice(0, 100)}`);
        res.json({ message: 'Mensaje enviado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo enviar el mensaje' });
    }
});

// Broadcast message
app.post('/api/players/broadcast', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { message } = req.body;
        const sanitizedMsg = sanitizeRconText(message);
        if (!sanitizedMsg) return res.status(400).json({ error: 'Mensaje inválido' });
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        await ensureAuditLogWritable();
        await execRcon(`Broadcast ${sanitizedMsg}`, targetMap);
        await auditLog(req.user.username, 'BROADCAST', `Broadcast: ${sanitizedMsg.slice(0, 100)}`);
        res.json({ message: 'Anuncio enviado' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo enviar el anuncio' });
    }
});

// Make player admin in-game
app.post('/api/players/make-admin', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { steamId, playerName } = req.body;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }
        const sanitizedName = sanitizeAuditText(playerName, 'Unknown', 64);

        await ensureAuditLogWritable();
        await updateTextFileAtomic(INGAME_ADMINS_PATH, currentAdmins => {
            const currentAdminIds = currentAdmins.split('\n').map(line => line.trim()).filter(Boolean);
            if (!currentAdminIds.includes(steamId)) currentAdminIds.push(steamId);
            return currentAdminIds.length > 0 ? `${currentAdminIds.join('\n')}\n` : '';
        });

        await auditLog(req.user.username, 'PLAYER_MAKE_ADMIN', `Granted in-game admin to ${sanitizedName} (${steamId})`);
        res.json({ message: 'Jugador añadido a la lista de admins. Puede requerir reinicio del servidor.' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo dar admin in-game' });
    }
});

// Remove in-game admin
app.post('/api/players/remove-admin', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { steamId, playerName } = req.body;
        if (!steamId || typeof steamId !== 'string' || !STEAM_ID_PATTERN.test(steamId)) {
            return res.status(400).json({ error: 'Steam ID inválido' });
        }
        const sanitizedName = sanitizeAuditText(playerName, 'Unknown', 64);

        if (!await pathExists(INGAME_ADMINS_PATH)) return res.status(404).json({ error: 'No existe la lista de admins in-game' });
        const currentAdminIds = (await fs.readFile(INGAME_ADMINS_PATH, 'utf8')).split('\n').map(line => line.trim()).filter(Boolean);
        if (!currentAdminIds.includes(steamId)) {
            return res.status(404).json({ error: 'Admin in-game no encontrado' });
        }
        await ensureAuditLogWritable();
        await updateTextFileAtomic(INGAME_ADMINS_PATH, currentAdmins => {
            const lines = currentAdmins.split('\n').map(line => line.trim()).filter(line => line && line !== steamId);
            return lines.length > 0 ? `${lines.join('\n')}\n` : '';
        }, { requireExisting: true });

        await auditLog(req.user.username, 'PLAYER_REMOVE_ADMIN', `Removed in-game admin from ${sanitizedName} (${steamId})`);
        res.json({ message: 'Jugador retirado de la lista de admins. Puede requerir reinicio del servidor.' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo quitar admin in-game' });
    }
});

// Get in-game admins
app.get('/api/players/ingame-admins', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        let content = '';
        try {
            content = await fs.readFile(INGAME_ADMINS_PATH, 'utf-8');
        } catch (_) { return res.json({ admins: [] }); }

        const admins = content.split('\n').map(l => l.trim()).filter(l => l && /^\d{10,25}$/.test(l));
        res.json({ admins });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo leer la lista de admins in-game' });
    }
});

// --- RCON Console Route ---
app.post('/api/rcon/command', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { command, mapId } = req.body;
        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        if (!isValidRconCommand(command)) {
            return res.status(400).json({ error: 'Comando inválido' });
        }
        const trimmedCommand = command.trim();
        await ensureAuditLogWritable();
        const response = await execRcon(trimmedCommand, targetMap);
        await auditLog(req.user.username, 'RCON_COMMAND', `[${targetMap}] Command: ${trimmedCommand.slice(0, 200)}`);
        res.json(publicRconResponse(response));
    } catch(err) {
        res.status(500).json({ error: 'Falló la conexión RCON. ¿El servidor está encendido y RCON habilitado?' });
    }
});

// --- Server Logs Route ---
app.get('/api/server/logs', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const mapId = typeof req.query.mapId === 'string' ? req.query.mapId.trim() : '';
        if (!mapId) return res.status(400).json({ error: 'mapId es obligatorio' });
        if (!VALID_MAP_IDS.includes(mapId)) return res.status(400).json({ error: 'mapId inválido' });
        const lines = parseBoundedIntegerParam(req.query.lines, 'lines', { defaultValue: 300, min: 1, max: 2000 });

        const map = getMapConfig(mapId);
        if (!map.logPath) return res.status(400).json({ error: 'La ruta de logs no está configurada para este mapa' });

        const logs = await tailFile(map.logPath, lines);
        res.json({ logs: logs.replace(/\b(ServerAdminPassword|ServerPassword|SpectatorPassword)\s*=\s*(?:"[^"]*"|'[^']*'|[^?\s;&]*)/gi, '$1=[REDACTED]') });
    } catch(err) {
        if (err.statusCode) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        if (err.code === 1 || err.message?.includes('No such file')) {
            return res.json({ logs: 'No se encontró archivo de log. Puede que el servidor aún no haya arrancado.' });
        }
        console.error('Logs API error:', err);
        res.status(500).json({ error: 'No se pudieron cargar los logs del servidor' });
    }
});

// --- Audit Log Routes ---
app.get('/api/audit/log', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const logs = await readJsonFile(AUDIT_PATH, []);

        // Pagination
        const page = parseBoundedIntegerParam(req.query.page, 'page', { defaultValue: 1, min: 1, max: 100000 });
        const limit = parseBoundedIntegerParam(req.query.limit, 'limit', { defaultValue: 50, min: 1, max: 100 });
        const filterAction = parseAuditFilterParam(req.query.action, 'action', { maxLength: 80, pattern: /^[A-Z0-9_:-]+$/ });
        const filterAdmin = parseAuditFilterParam(req.query.admin, 'admin', { maxLength: 64, pattern: /^[A-Za-z0-9_.@-]+$/ });

        let filtered = logs;
        if (filterAction) {
            filtered = filtered.filter(l => l.action === filterAction);
        }
        if (filterAdmin) {
            filtered = filtered.filter(l => l.admin === filterAdmin);
        }

        const total = filtered.length;
        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        res.json({ logs: paginated, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo leer el log de auditoría' });
    }
});

// --- System Health Routes ---
app.get('/api/system/health', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const [osInfo, cpu, cpuTemp, mem, fsSize, currentLoad, time, networkStats] = await Promise.all([
            si.osInfo(),
            si.cpu(),
            si.cpuTemperature(),
            si.mem(),
            si.fsSize(),
            si.currentLoad(),
            si.time(),
            si.networkStats()
        ]);

        // Filter out irrelevant mounts (loops, boot, efi) to get actual storage drives like / and /servidor
        const validDisks = fsSize.filter(fs =>
            fs.size > 0 &&
            ['ext4', 'xfs', 'btrfs', 'ntfs', 'vfat'].includes(fs.type) &&
            !fs.mount.startsWith('/boot')
        );

        // Map network stats
        const network = networkStats.map(net => ({
            iface: net.iface,
            rx_bytes: net.rx_bytes,
            tx_bytes: net.tx_bytes
        }));

        const readiness = await collectProductionReadiness();

        res.json({
            os: {
                distro: osInfo.distro,
                release: osInfo.release,
                kernel: osInfo.kernel,
                uptime: time.uptime
            },
            cpu: {
                manufacturer: cpu.manufacturer,
                brand: cpu.brand,
                cores: cpu.cores,
                speed: cpu.speed,
                currentLoad: currentLoad.currentLoad,
                temperature: cpuTemp.main || 0
            },
            memory: {
                total: mem.total,
                free: mem.free,
                used: mem.used,
                active: mem.active,
                available: mem.available,
                buffcache: mem.buffcache
            },
            disks: validDisks.map(d => ({
                mount: d.mount,
                fs: d.fs,
                type: d.type,
                size: d.size,
                used: d.used,
                use: d.use
            })),
            network: network,
            readiness
        });
    } catch(err) {
        console.error('System Health Error:', err);
        res.status(500).json({ error: 'No se pudo leer la salud del sistema' });
    }
});

// --- Global Settings Routes ---
app.get('/api/settings/global', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const settings = await readGlobalSettings();
        res.json(settings);
    } catch(err) {
        res.status(500).json({ error: 'No se pudieron leer los ajustes globales' });
    }
});

app.post('/api/settings/global', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        await ensureAuditLogWritable();
        await updateJsonFile(GLOBAL_SETTINGS_PATH, GLOBAL_SETTINGS_DEFAULTS, current => {
            const next = sanitizeGlobalSettings(req.body || {}, current);
            if (Object.prototype.hasOwnProperty.call(req.body || {}, 'adminIpWhitelist')) {
                const allowedIps = parseAdminIpWhitelist(next.adminIpWhitelist);
                const requestIp = normalizeIp(req.ip);
                if (allowedIps.length > 0 && !allowedIps.includes(requestIp)) {
                    throw new Error(`Admin IP whitelist must include your current IP (${requestIp})`);
                }
            }
            return next;
        });
        await auditLog(req.user.username, 'GLOBAL_SETTINGS', 'Updated global settings');
        res.json({ message: 'Ajustes globales actualizados' });
    } catch(err) {
        res.status(err.statusCode || 400).json({ error: err.statusCode ? 'Log de auditoría no disponible' : (err.message || 'No se pudieron guardar los ajustes globales') });
    }
});

// --- Config Routes ---
app.post('/api/config/parsed', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { settings, mapId } = req.body;
        const multipliers = settings || req.body;
        if (typeof multipliers !== 'object' || multipliers === null) {
            return res.status(400).json({ error: 'Datos inválidos' });
        }
        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);

        const gameIniKeys = ['MatingIntervalMultiplier', 'EggHatchSpeedMultiplier', 'BabyMatureSpeedMultiplier',
            'BabyCuddleIntervalMultiplier', 'BabyImprintAmountMultiplier', 'HexagonRewardMultiplier',
            'BabyFoodConsumptionSpeedMultiplier', 'CropGrowthSpeedMultiplier', 'LayEggIntervalMultiplier',
            'PoopIntervalMultiplier', 'CraftXPMultiplier', 'GenericXPMultiplier',
            'HarvestXPMultiplier', 'KillXPMultiplier', 'SpecialXPMultiplier',
            'bAllowPlatformSaddleMultiFloors', 'MaxNumberOfPlayersInTribe', 'bAllowUnlimitedRespecs',
            'OverrideStructurePlatformPrevention', 'MatingSpeedMultiplier', 'bAllowFlyerSpeedLeveling',
            'PreventDiseases', 'NonPermanentDiseases', 'bAutoDestroyDecayedDinos', 'bAutoUnlockAllEngrams'];
        const gameUserKeys = ['HarvestAmountMultiplier', 'TamingSpeedMultiplier', 'XPMultiplier', 'DinoCountMultiplier',
            'DayTimeSpeedScale', 'NightTimeSpeedScale', 'DayCycleSpeedScale',
            'PlayerDamageMultiplier', 'DinoDamageMultiplier', 'StructureDamageMultiplier',
            'PlayerResistanceMultiplier', 'DinoResistanceMultiplier', 'StructureResistanceMultiplier',
            'HarvestHealthMultiplier', 'ResourcesRespawnPeriodMultiplier',
            'DinoCharacterFoodDrainMultiplier', 'PlayerCharacterFoodDrainMultiplier',
            'PlayerCharacterWaterDrainMultiplier', 'PlayerCharacterStaminaDrainMultiplier',
            'DinoCharacterStaminaDrainMultiplier', 'PlayerCharacterHealthRecoveryMultiplier',
            'DinoCharacterHealthRecoveryMultiplier',
            'DifficultyOffset', 'OverrideOfficialDifficulty', 'MaxTamedDinos', 'MaxPersonalTamedDinos',
            'PerPlatformMaxStructuresMultiplier', 'AutoSavePeriodMinutes', 'bDisableStructurePlacementCollision',
            'AllowCaveBuildingPvE', 'PvEAllowBuildingAtSupplyDrops', 'EnableExtraStructurePreventionVolumes',
            'TheMaxStructuresInRange', 'ShowMapPlayerLocation', 'AllowThirdPersonPlayer', 'EnableCrosshair',
            'AllowFlyerCarryPvE', 'DisablePvEGamma', 'PreventOfflinePvP', 'GlobalVoiceChat', 'ProximityChat',
            'NoTributeDownloads', 'PreventDownloadSurvivors', 'PreventDownloadItems', 'PreventDownloadDinos',
            'bDisableFriendlyFire', 'AlwaysNotifyPlayerJoined', 'AlwaysNotifyPlayerLeft', 'EnablePvPGamma',
            'AutoDestroyOldStructuresMultiplier'];

        const booleanKeys = [
            'bAllowPlatformSaddleMultiFloors', 'bAllowUnlimitedRespecs', 'OverrideStructurePlatformPrevention',
            'bAllowFlyerSpeedLeveling', 'PreventDiseases', 'NonPermanentDiseases', 'bAutoDestroyDecayedDinos',
            'bAutoUnlockAllEngrams', 'bDisableStructurePlacementCollision', 'AllowCaveBuildingPvE',
            'PvEAllowBuildingAtSupplyDrops', 'EnableExtraStructurePreventionVolumes', 'ShowMapPlayerLocation',
            'AllowThirdPersonPlayer', 'EnableCrosshair', 'AllowFlyerCarryPvE', 'DisablePvEGamma',
            'PreventOfflinePvP', 'GlobalVoiceChat', 'ProximityChat', 'NoTributeDownloads',
            'PreventDownloadSurvivors', 'PreventDownloadItems', 'PreventDownloadDinos', 'bDisableFriendlyFire',
            'AlwaysNotifyPlayerJoined', 'AlwaysNotifyPlayerLeft', 'EnablePvPGamma'
        ];

        await ensureAuditLogWritable();
        await updateTextFilesAtomic([mapCfg.gameIni, mapCfg.gameUserSettings], files => {
            let gameIni = files[path.resolve(mapCfg.gameIni)];
            let gameUserIni = files[path.resolve(mapCfg.gameUserSettings)];
            const allAllowed = [...gameIniKeys, ...gameUserKeys];
            for (const [key, val] of Object.entries(multipliers)) {
                if (!allAllowed.includes(key)) continue;

                let finalVal;
                if (booleanKeys.includes(key)) {
                    finalVal = (val === true || val === 'true' || val === 'True' || val === 1 || val === '1') ? 'True' : 'False';
                } else {
                    if (val === true || val === 'true' || val === 'True') finalVal = 'True';
                    else if (val === false || val === 'false' || val === 'False') finalVal = 'False';
                    else {
                        const numVal = parseFloat(val);
                        if (isNaN(numVal)) continue;
                        finalVal = numVal;
                    }
                }

                if (gameIniKeys.includes(key)) {
                    const regex = new RegExp(`^${key}=.*`, 'm');
                    if (regex.test(gameIni)) gameIni = gameIni.replace(regex, `${key}=${finalVal}`);
                    else gameIni = gameIni.replace(/\[\/script\/shootergame\.shootergamemode\]/i, `[/script/shootergame.shootergamemode]\n${key}=${finalVal}`);
                } else if (gameUserKeys.includes(key)) {
                    const regex = new RegExp(`^${key}=.*`, 'm');
                    if (regex.test(gameUserIni)) gameUserIni = gameUserIni.replace(regex, `${key}=${finalVal}`);
                    else gameUserIni = gameUserIni.replace(/\[ServerSettings\]/i, `[ServerSettings]\n${key}=${finalVal}`);
                }
            }
            return {
                [path.resolve(mapCfg.gameIni)]: gameIni,
                [path.resolve(mapCfg.gameUserSettings)]: normalizeGameUserSettingsContent(gameUserIni),
            };
        }, { requireExisting: true });
        await auditLog(req.user.username, 'CONFIG_CHANGE', `[${targetMap}] Updated server multipliers: ${Object.keys(multipliers).join(', ')}`);
        res.json({ message: 'Ajustes guardados correctamente. Reinicia el servidor para aplicar los cambios.' });
    } catch(err) {
        res.status(500).json({ error: 'No se pudieron guardar los ajustes' });
    }
});

app.post('/api/config/lootcrates', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { crateClass, items, mapId } = req.body;
        if (!crateClass || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Datos de loot crate inválidos' });
        }
        const normalizedCrateClass = String(crateClass).trim();
        const normalizedItems = items.map(item => String(item).trim());
        if (!isSafeArkClassName(normalizedCrateClass) || normalizedItems.some(item => !isSafeArkClassName(item))) {
            return res.status(400).json({ error: 'Nombre de clase ARK inválido' });
        }
        const itemClasses = normalizedItems.map(i => `"${i}"`).join(',');
        const weights = items.map(() => "1.0").join(',');
        const configString = `ConfigOverrideSupplyCrateItems=(SupplyCrateClassString="${normalizedCrateClass}",MinItemSets=1,MaxItemSets=1,NumItemSetsPower=1.0,bSetsRandomWithoutReplacement=true,ItemSets=((MinNumItems=1,MaxNumItems=3,NumItemsPower=1.0,SetWeight=1.0,bItemsRandomWithoutReplacement=true,ItemEntries=((EntryWeight=1.0,ItemClassStrings=(${itemClasses}),ItemsWeights=(${weights}),MinQuantity=1.0,MaxQuantity=1.0,MinQuality=1.0,MaxQuality=5.0,bForceBlueprint=false,ChanceToBeBlueprintOverride=0.0)))))`;

        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);
        await ensureAuditLogWritable();
        await updateTextFileAtomic(mapCfg.gameIni, gameIni => `${gameIni}\n${configString}\n`, { requireExisting: true });
        await auditLog(req.user.username, 'LOOT_CRATE', `[${targetMap}] Injected custom loot crate: ${normalizedCrateClass}`);
        res.json({ message: 'Loot crate inyectado correctamente. Reinicia el servidor para aplicar los cambios.' });
    } catch(err) {
        res.status(500).json({ error: 'No se pudo inyectar el loot crate' });
    }
});

// --- Presets Routes ---
app.get('/api/presets', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const presetsDir = path.join(DATA_DIR, 'presets');
        if (!await pathExists(presetsDir)) {
            return res.json({ presets: [] });
        }
        const folders = await fs.readdir(presetsDir, { withFileTypes: true });
        const presets = [];
        for (const f of folders) {
            if (f.isDirectory() && isSafeRuntimeId(f.name) && f.name !== '.' && f.name !== '..') {
                try {
                    const metaPath = path.join(presetsDir, f.name, 'metadata.json');
                    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                    presets.push({
                        ...meta,
                        id: isSafeRuntimeId(meta.id) && meta.id !== '.' && meta.id !== '..' ? meta.id : f.name
                    });
                } catch(e) {}
            }
        }
        res.json({ presets });
    } catch(err) {
        res.status(500).json({ error: 'No se pudieron cargar los presets' });
    }
});

app.post('/api/presets/apply', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { presetId, mapId } = req.body;
        if (!presetId) return res.status(400).json({ error: 'Falta presetId' });

        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);

        const presetDir = resolvePresetPath(presetId);
        if (!await pathExists(presetDir)) {
            return res.status(404).json({ error: 'Preset no encontrado' });
        }
        let multipliers = {};
        let gameOverrides = '';

        try {
            multipliers = JSON.parse(await fs.readFile(path.join(presetDir, 'multipliers.json'), 'utf8'));
        } catch(e) {}

        try {
            gameOverrides = await fs.readFile(path.join(presetDir, 'game_overrides.ini'), 'utf8');
        } catch(e) {}
        if (Object.keys(multipliers).length === 0 && !gameOverrides.trim()) {
            return res.status(400).json({ error: 'El preset no contiene cambios aplicables' });
        }
        await ensureAuditLogWritable();

        // Apply Multipliers
        const gameUserKeys = ['HarvestAmountMultiplier', 'TamingSpeedMultiplier', 'XPMultiplier', 'DinoCountMultiplier',
            'DayTimeSpeedScale', 'NightTimeSpeedScale', 'DayCycleSpeedScale', 'PlayerDamageMultiplier', 'DinoDamageMultiplier',
            'StructureDamageMultiplier', 'PlayerResistanceMultiplier', 'DinoResistanceMultiplier', 'StructureResistanceMultiplier',
            'HarvestHealthMultiplier', 'ResourcesRespawnPeriodMultiplier', 'DinoCharacterFoodDrainMultiplier',
            'PlayerCharacterFoodDrainMultiplier', 'PlayerCharacterWaterDrainMultiplier', 'PlayerCharacterStaminaDrainMultiplier',
            'DinoCharacterStaminaDrainMultiplier', 'PlayerCharacterHealthRecoveryMultiplier', 'DinoCharacterHealthRecoveryMultiplier',
            'DifficultyOffset', 'OverrideOfficialDifficulty', 'MaxTamedDinos', 'MaxPersonalTamedDinos', 'PerPlatformMaxStructuresMultiplier',
            'AutoSavePeriodMinutes', 'bDisableStructurePlacementCollision', 'AllowCaveBuildingPvE', 'PvEAllowBuildingAtSupplyDrops',
            'EnableExtraStructurePreventionVolumes', 'TheMaxStructuresInRange', 'ShowMapPlayerLocation', 'AllowThirdPersonPlayer',
            'EnableCrosshair', 'AllowFlyerCarryPvE', 'DisablePvEGamma', 'PreventOfflinePvP', 'GlobalVoiceChat', 'ProximityChat',
            'NoTributeDownloads', 'PreventDownloadSurvivors', 'PreventDownloadItems', 'PreventDownloadDinos', 'bDisableFriendlyFire',
            'AlwaysNotifyPlayerJoined', 'AlwaysNotifyPlayerLeft', 'EnablePvPGamma', 'AutoDestroyOldStructuresMultiplier'];

        const gameIniKeys = ['MatingIntervalMultiplier', 'EggHatchSpeedMultiplier', 'BabyMatureSpeedMultiplier',
            'BabyCuddleIntervalMultiplier', 'BabyImprintAmountMultiplier', 'HexagonRewardMultiplier',
            'BabyFoodConsumptionSpeedMultiplier', 'CropGrowthSpeedMultiplier', 'LayEggIntervalMultiplier',
            'PoopIntervalMultiplier', 'CraftXPMultiplier', 'GenericXPMultiplier', 'HarvestXPMultiplier',
            'KillXPMultiplier', 'SpecialXPMultiplier', 'bAllowPlatformSaddleMultiFloors', 'MaxNumberOfPlayersInTribe',
            'bAllowUnlimitedRespecs', 'OverrideStructurePlatformPrevention', 'MatingSpeedMultiplier',
            'bAllowFlyerSpeedLeveling', 'PreventDiseases', 'NonPermanentDiseases', 'bAutoDestroyDecayedDinos',
            'bAutoUnlockAllEngrams'];

        await updateTextFilesAtomic([mapCfg.gameIni, mapCfg.gameUserSettings], files => {
            let gameIni = files[path.resolve(mapCfg.gameIni)];
            let gameUserIni = files[path.resolve(mapCfg.gameUserSettings)];

            gameIni = gameIni.split('\n').filter(line => {
                const l = line.trim();
                return !(l.startsWith('ConfigOverrideItemCraftingCosts=') ||
                         l.startsWith('ConfigOverrideSupplyCrateItems=') ||
                         l.startsWith('ConfigOverrideItemMaxQuantity=') ||
                         l.startsWith('PerLevelStatsMultiplier_'));
            }).join('\n');

            if (gameOverrides) {
                gameIni += `\n${gameOverrides}\n`;
            }

            for (const [key, val] of Object.entries(multipliers)) {
                let finalVal = val;
                if (val === true || val === 'true' || val === 'True') finalVal = 'True';
                else if (val === false || val === 'false' || val === 'False') finalVal = 'False';

                if (gameIniKeys.includes(key)) {
                    const regex = new RegExp(`^${key}=.*`, 'm');
                    if (regex.test(gameIni)) gameIni = gameIni.replace(regex, `${key}=${finalVal}`);
                    else gameIni = gameIni.replace(/\[\/script\/shootergame\.shootergamemode\]/i, `[/script/shootergame.shootergamemode]\n${key}=${finalVal}`);
                } else if (gameUserKeys.includes(key)) {
                    const regex = new RegExp(`^${key}=.*`, 'm');
                    if (regex.test(gameUserIni)) gameUserIni = gameUserIni.replace(regex, `${key}=${finalVal}`);
                    else gameUserIni = gameUserIni.replace(/\[ServerSettings\]/i, `[ServerSettings]\n${key}=${finalVal}`);
                }
            }
            return {
                [path.resolve(mapCfg.gameIni)]: gameIni,
                [path.resolve(mapCfg.gameUserSettings)]: normalizeGameUserSettingsContent(gameUserIni),
            };
        }, { requireExisting: true });
        await auditLog(req.user.username, 'CONFIG_CHANGE', `[${targetMap}] Applied Preset: ${presetId}`);

        res.json({ message: `Preset ${presetId} aplicado correctamente. Reinicia el servidor para aplicar los cambios.` });
    } catch(err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Error al aplicar el preset' });
    }
});

app.get('/api/config/gameini', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const mapSelection = resolveRequiredMapId(req.query.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);
        const result = redactArkSecrets(await fs.readFile(mapCfg.gameIni, 'utf8'));
        res.json(result);
    }
    catch (err) { res.status(500).json({ error: 'No se pudo leer Game.ini' }); }
});
app.post('/api/config/gameini', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        if (typeof req.body.content !== 'string') {
            return res.status(400).json({ error: 'Contenido inválido' });
        }
        if (containsRedactedSecret(req.body.content)) {
            return res.status(400).json({ error: 'No se guardan secretos redactados. Usa la rotación segura de secretos.' });
        }
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);
        await ensureAuditLogWritable();
        await updateTextFileAtomic(mapCfg.gameIni, () => req.body.content, { requireExisting: true });
        await auditLog(req.user.username, 'CONFIG_EDIT', `[${targetMap}] Edited Game.ini`);
        res.json({ message: 'Guardado' });
    }
    catch (err) { res.status(500).json({ error: 'No se pudo escribir Game.ini' }); }
});
app.get('/api/config/gameusersettings', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const mapSelection = resolveRequiredMapId(req.query.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);
        const result = redactArkSecrets(await fs.readFile(mapCfg.gameUserSettings, 'utf8'));
        res.json(result);
    }
    catch (err) { res.status(500).json({ error: 'No se pudo leer GameUserSettings.ini' }); }
});
app.post('/api/config/gameusersettings', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        if (typeof req.body.content !== 'string') {
            return res.status(400).json({ error: 'Contenido inválido' });
        }
        if (containsRedactedSecret(req.body.content)) {
            return res.status(400).json({ error: 'No se guardan secretos redactados. Usa la rotación segura de secretos.' });
        }
        const mapSelection = resolveRequiredMapId(req.body.mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        const mapCfg = getMapConfig(targetMap);
        const normalizedContent = normalizeGameUserSettingsContent(req.body.content);
        await ensureAuditLogWritable();
        await updateTextFileAtomic(mapCfg.gameUserSettings, () => normalizedContent, { requireExisting: true });
        await auditLog(req.user.username, 'CONFIG_EDIT', `[${targetMap}] Edited GameUserSettings.ini`);
        res.json({ message: 'Guardado' });
    }
    catch (err) { res.status(500).json({ error: 'No se pudo escribir GameUserSettings.ini' }); }
});

app.post('/api/config/secrets', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { mapId, secrets } = req.body;
        const mapSelection = resolveRequiredMapId(mapId);
        if (mapSelection.error) return res.status(400).json({ error: mapSelection.error });
        const targetMap = mapSelection.mapId;
        if (!secrets || typeof secrets !== 'object') return res.status(400).json({ error: 'Payload de secretos inválido' });

        const updates = Object.entries(secrets).filter(([key, value]) =>
            ARK_SECRET_KEYS.includes(key) && typeof value === 'string' && value.length > 0 && value.length <= 256
        );
        if (updates.length === 0) return res.status(400).json({ error: 'No se proporcionaron secretos válidos' });

        const mapCfg = getMapConfig(targetMap);
        await ensureAuditLogWritable();
        await updateTextFileAtomic(mapCfg.gameUserSettings, content => {
            for (const [key, value] of updates) {
                content = updateIniKey(content, 'ServerSettings', key, value);
            }
            return normalizeGameUserSettingsContent(content);
        }, { requireExisting: true });
        await auditLog(req.user.username, 'CONFIG_SECRET_ROTATE', `[${targetMap}] Rotated secrets: ${updates.map(([key]) => key).join(', ')}`);
        res.json({ message: 'Secretos actualizados. Reinicia el servidor si es necesario.' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudieron actualizar los secretos' });
    }
});

// --- File Manager Routes ---
const FILE_MANAGER_ROOTS = {
    game: process.env.FILE_MANAGER_GAME_ROOT || path.join(ARK_ROOT, 'serverfiles/ShooterGame/Saved/Config/LinuxServer'),
    lgsm: process.env.FILE_MANAGER_LGSM_ROOT || path.join(ARK_ROOT, 'lgsm/config-lgsm/arkserver')
};

function getFileManagerRoot(req) {
    const type = req.query.type || req.body.type || 'game';
    if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(FILE_MANAGER_ROOTS, type)) {
        const error = new Error('Tipo de raíz del gestor de archivos inválido');
        error.statusCode = 400;
        throw error;
    }
    return FILE_MANAGER_ROOTS[type];
}

async function resolveManagedPath(root, subPath = '') {
    if (typeof subPath !== 'string' || /[\0-\x1F\x7F]/.test(subPath)) {
        throw badRequest('Ruta inválida');
    }
    const realRoot = await fs.realpath(root);
    const requestedPath = path.resolve(realRoot, subPath || '');
    const targetPath = requestedPath;
    let realTarget;
    try {
        realTarget = await fs.realpath(targetPath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        realTarget = path.resolve(realRoot, subPath || '');
    }
    if (!realTarget.startsWith(realRoot + path.sep) && realTarget !== realRoot) {
        const error = new Error('Acceso denegado');
        error.statusCode = 403;
        throw error;
    }
    return { realRoot, requestedPath, targetPath: realTarget };
}

async function rejectManagedSymlink(requestedPath) {
    try {
        const linkStat = await fs.lstat(requestedPath);
        if (linkStat.isSymbolicLink()) {
            const error = new Error('Las rutas con enlaces simbólicos no se pueden editar desde el gestor de archivos');
            error.statusCode = 403;
            throw error;
        }
        return linkStat;
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }
}

app.get('/api/files/list', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const root = getFileManagerRoot(req);
        const subdir = req.query.path || '';
        const { realRoot, requestedPath, targetPath } = await resolveManagedPath(root, subdir);
        await rejectManagedSymlink(requestedPath);

        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        const files = entries.map(e => ({
            name: e.name,
            isDirectory: e.isDirectory(),
            isSymlink: e.isSymbolicLink(),
            path: path.relative(realRoot, path.join(targetPath, e.name))
        }));
        res.json({ currentPath: path.relative(realRoot, targetPath) || '.', files });
    } catch(err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo listar el directorio' });
    }
});

app.get('/api/files/read', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const root = getFileManagerRoot(req);
        const filePath = req.query.path || '';
        const { requestedPath, targetPath } = await resolveManagedPath(root, filePath);
        await rejectManagedSymlink(requestedPath);

        const stat = await fs.stat(targetPath);
        if (!stat.isFile()) return res.status(400).json({ error: 'La ruta no apunta a un archivo' });
        if (stat.size > 5 * 1024 * 1024) return res.status(400).json({ error: 'El archivo es demasiado grande (máximo 5MB)' });

        const result = redactArkSecrets(await fs.readFile(targetPath, 'utf8'));
        res.json({ ...result, name: path.basename(targetPath) });
    } catch(err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo leer el archivo' });
    }
});

app.post('/api/files/write', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const root = getFileManagerRoot(req);
        const { filePath, content } = req.body;
        if (!filePath || typeof filePath !== 'string' || typeof content !== 'string') {
            return res.status(400).json({ error: 'Datos inválidos' });
        }
        if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) return res.status(400).json({ error: 'El archivo es demasiado grande (máximo 5MB)' });
        if (containsRedactedSecret(content)) {
            return res.status(400).json({ error: 'No se guardan secretos redactados. Usa la rotación segura de secretos.' });
        }
        const { requestedPath, targetPath } = await resolveManagedPath(root, filePath);
        await rejectManagedSymlink(requestedPath);
        const stat = await fs.stat(targetPath);
        if (!stat.isFile()) return res.status(400).json({ error: 'La ruta no apunta a un archivo' });

        const nextContent = path.basename(targetPath).toLowerCase() === 'gameusersettings.ini'
            ? normalizeGameUserSettingsContent(content)
            : content;
        await ensureAuditLogWritable();
        await updateTextFileAtomic(targetPath, () => nextContent, { requireExisting: true });
        await auditLog(req.user.username, 'FILE_EDIT', `Edited file: ${path.basename(targetPath)}`);
        res.json({ message: 'Archivo guardado' });
    } catch(err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo escribir el archivo' });
    }
});

// --- Scheduled Tasks Routes & Logic ---
const activeCronJobs = {};

async function readTasks() {
    return readJsonFile(TASKS_PATH, []);
}

async function writeTasks(tasks) {
    await updateJsonFile(TASKS_PATH, [], () => tasks);
}

async function executeTaskAction(task, options = {}) {
    try {
        const validationError = validateStoredScheduledTask(task);
        if (validationError) {
            console.warn(`Skipping invalid scheduled task ${task?.id || 'unknown'}: ${validationError}`);
            return false;
        }

        let command = '';
        if (task.action === 'Broadcast' && task.payload) {
            const sanitizedPayload = sanitizeRconText(task.payload);
            if (!sanitizedPayload) return;
            command = `Broadcast ${sanitizedPayload}`;
        } else if (task.action === 'SaveWorld') {
            command = 'SaveWorld';
        } else if (task.action === 'DoExit') {
            command = 'DoExit';
        }

        if (!command) return;

        const mapsToRun = (task.mapId === 'all' || !task.mapId) ? CLUSTER_MAPS : [CLUSTER_MAPS.find(m => m.id === task.mapId)].filter(Boolean);
        const processList = Array.isArray(options.processList)
            ? options.processList
            : (await si.processes()).list || [];

        for (const map of mapsToRun) {
            const preflight = await scheduledTaskRconPreflight(map, processList, options);
            if (!preflight.ok) {
                logScheduledTaskIssue(
                    task,
                    map,
                    preflight.reason,
                    `Task ${task.action} skipped on ${map.name}: ${preflight.detail}`
                );
                continue;
            }

            try {
                await execRcon(command, map.id);
                logScheduledTaskRecovery(task, map);
            } catch (err) {
                logScheduledTaskIssue(
                    task,
                    map,
                    'rcon_failed',
                    `Task ${task.action} failed on ${map.name}: ${err.message}`,
                    'error'
                );
            }
        }
        return true;
    } catch (err) {
        console.error(`Error executing scheduled task ${task.id}:`, err);
        return false;
    }
}

function scheduleCronJob(task) {
    const taskId = task?.id || 'unknown';
    if (activeCronJobs[taskId]) {
        activeCronJobs[taskId].stop();
        delete activeCronJobs[taskId];
    }
    const validationError = validateStoredScheduledTask(task);
    if (validationError) {
        console.warn(`Not scheduling invalid task ${taskId}: ${validationError}`);
        return false;
    }
    if (task.active) {
        activeCronJobs[task.id] = cron.schedule(task.cron, () => {
            executeTaskAction(task);
        });
        return true;
    }
    return false;
}

// Load all tasks on startup
if (!IS_TEST) {
    (async function initTasks() {
        const tasks = await readTasks();
        tasks.forEach(scheduleCronJob);
    })();
}

app.get('/api/tasks', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const tasks = await readTasks();
        res.json({
            tasks,
            scheduleContext: {
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                serverTime: new Date().toISOString(),
            },
        });
    } catch (err) { res.status(500).json({ error: 'No se pudieron leer las tareas programadas' }); }
});

app.post('/api/tasks', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { action, cronExpr, payload, mapId } = req.body;
        const validationError = validateScheduledTaskInput({ action, cronExpr, payload, mapId }, req.user);
        if (validationError) {
            const status = validationError.includes('rol owner') ? 403 : 400;
            return res.status(status).json({ error: validationError });
        }
        await ensureAuditLogWritable();

        const newTask = {
            id: uuidv4(),
            action,
            cron: cronExpr,
            payload: typeof payload === 'string' ? payload.slice(0, 500) : '',
            mapId: mapId || 'all',
            active: true,
            createdAt: new Date().toISOString()
        };
        await updateJsonFile(TASKS_PATH, [], tasks => {
            tasks.push(newTask);
            return tasks;
        });
        scheduleCronJob(newTask);
        await auditLog(req.user.username, 'TASK_CREATED', `Created scheduled task: ${action} (${cronExpr})`);
        res.json({ message: 'Tarea creada', taskId: newTask.id });
    } catch (err) { res.status(500).json({ error: 'No se pudo crear la tarea' }); }
});

app.post('/api/tasks/:id/toggle', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const taskId = parseUuidParam(req.params.id, 'task id');
        const { active } = req.body;
        if (typeof active !== 'boolean') {
            return res.status(400).json({ error: 'El estado activo de la tarea debe ser booleano' });
        }
        await ensureAuditLogWritable();
        let task = null;
        let updateError = null;
        await updateJsonFile(TASKS_PATH, [], tasks => {
            task = tasks.find(t => t.id === taskId);
            if (!task) return tasks;
            if (task.action === 'DoExit' && !hasRole(req.user, 'owner')) {
                updateError = { status: 403, error: 'Las tareas DoExit requieren rol owner' };
                return tasks;
            }
            task.active = active;
            return tasks;
        });
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
        if (updateError) return res.status(updateError.status).json({ error: updateError.error });
        scheduleCronJob(task);
        await auditLog(req.user.username, 'TASK_TOGGLED', `Toggled task ${task.action} to ${task.active ? 'active' : 'inactive'}`);
        res.json({ message: 'Tarea actualizada' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo actualizar la tarea' });
    }
});

app.patch('/api/tasks/:id', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const taskId = parseUuidParam(req.params.id, 'task id');
        const { action, cronExpr, payload, mapId, active } = req.body;
        if (typeof active !== 'undefined' && typeof active !== 'boolean') {
            return res.status(400).json({ error: 'El estado activo de la tarea debe ser booleano' });
        }

        const validationError = validateScheduledTaskInput({ action, cronExpr, payload, mapId }, req.user);
        if (validationError) {
            const status = validationError.includes('rol owner') ? 403 : 400;
            return res.status(status).json({ error: validationError });
        }
        await ensureAuditLogWritable();

        let task = null;
        let updateError = null;
        await updateJsonFile(TASKS_PATH, [], tasks => tasks.map(existingTask => {
            if (existingTask.id !== taskId) return existingTask;
            task = existingTask;
            if ((existingTask.action === 'DoExit' || action === 'DoExit') && !hasRole(req.user, 'owner')) {
                updateError = { status: 403, error: 'Las tareas DoExit requieren rol owner' };
                return existingTask;
            }
            task = {
                ...existingTask,
                action,
                cron: cronExpr,
                payload: typeof payload === 'string' ? payload.slice(0, 500) : '',
                mapId: mapId || 'all',
                active: typeof active === 'boolean' ? active : existingTask.active,
                updatedAt: new Date().toISOString(),
            };
            return task;
        }));

        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
        if (updateError) return res.status(updateError.status).json({ error: updateError.error });
        scheduleCronJob(task);
        await auditLog(req.user.username, 'TASK_UPDATED', `Updated scheduled task ${task.action} (${taskId})`);
        res.json({ message: 'Tarea actualizada' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo actualizar la tarea' });
    }
});

app.delete('/api/tasks/:id', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const taskId = parseUuidParam(req.params.id, 'task id');
        await ensureAuditLogWritable();
        let task = null;
        let deleteError = null;
        await updateJsonFile(TASKS_PATH, [], tasks => {
            task = tasks.find(t => t.id === taskId);
            if (!task) return tasks;
            if (task.action === 'DoExit' && !hasRole(req.user, 'owner')) {
                deleteError = { status: 403, error: 'Las tareas DoExit requieren rol owner' };
                return tasks;
            }
            return tasks.filter(t => t.id !== taskId);
        });
        if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
        if (deleteError) return res.status(deleteError.status).json({ error: deleteError.error });

        if (activeCronJobs[taskId]) {
            activeCronJobs[taskId].stop();
            delete activeCronJobs[taskId];
        }
        await auditLog(req.user.username, 'TASK_DELETED', `Deleted scheduled task ${task.action} (${taskId})`);
        res.json({ message: 'Tarea borrada' });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo borrar la tarea' });
    }
});

// --- Deployer Routes ---
app.get('/api/nodes', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const processes = await si.processes();
        const processList = processes.list || [];
        const statuses = await Promise.all(VALID_MAP_IDS.map(async mapId => {
            const map = getMapConfig(mapId);
            const isOnline = await checkProcess(map, processList);
            const live = await queryMapStatus(map, processList).catch(() => null);
            return {
                id: mapId,
                name: map.name,
                status: isOnline ? 'online' : 'offline',
                cpu: live?.cpu || 0,
                memory: live?.ram || 0,
                players: live?.players || 0
            };
        }));

        res.json({ nodes: statuses });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo consultar el inventario de nodos' });
    }
});

app.get('/api/deploy/capabilities', authenticateToken, requirePermission('deploy.view'), async (req, res) => {
    res.json({ capabilities: buildDeployCapabilities() });
});

app.post('/api/deploy/start', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const { clusterName, osType, installApi } = req.body || {};
        const requestedCluster = sanitizeAuditText(clusterName, 'unnamed', 80);
        const requestedOs = sanitizeAuditText(osType, 'unknown', 32);
        await auditLog(req.user.username, 'DEPLOY_UNAVAILABLE', `Requested unsupported deployment of ${requestedCluster} (${requestedOs}) with API=${Boolean(installApi)}`);
        res.status(501).json({ error: DEPLOY_CAPABILITIES.deployStart.reason });
    } catch (err) {
        res.status(500).json({ error: 'Error al iniciar el despliegue' });
    }
});

app.get('/api/orchestrator/readiness', authenticateToken, requirePermission('orchestrator.view'), async (req, res) => {
    try {
        const config = await readOrchestratorConfig();
        const preflight = config.arkRoot ? await inspectOrchestratorRoot(config.arkRoot) : null;
        res.json({ orchestrator: buildOrchestratorReadiness(config, preflight) });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo cargar el estado del orquestador nativo' });
    }
});

app.get('/api/orchestrator/preflight', authenticateToken, requirePermission('orchestrator.view'), async (req, res) => {
    try {
        const root = String(req.query.root || '');
        res.json({ preflight: await inspectOrchestratorRoot(root) });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo validar la ruta del orquestador nativo' });
    }
});

app.post('/api/orchestrator/config', authenticateToken, requirePermission('orchestrator.configure'), async (req, res) => {
    try {
        const nextConfig = normalizeOrchestratorConfig(req.body || {});
        const preflight = nextConfig.arkRoot ? await inspectOrchestratorRoot(nextConfig.arkRoot) : null;
        if (preflight && !preflight.canUse) {
            await auditLog(req.user.username, 'ORCHESTRATOR_CONFIG_REJECTED', `Rejected native orchestrator root ${sanitizeAuditText(nextConfig.arkRoot, 'empty', 180)}`);
            return res.status(400).json({ error: 'La ruta base del orquestador no supera el preflight', preflight });
        }

        await ensureAuditLogWritable();
        const saved = await updateJsonFile(ORCHESTRATOR_CONFIG_PATH, () => cloneJson(ORCHESTRATOR_CONFIG_DEFAULTS), () => nextConfig);
        await auditLog(req.user.username, 'ORCHESTRATOR_CONFIG', `Prepared native orchestrator root ${saved.arkRoot ? sanitizeAuditText(saved.arkRoot, 'empty', 180) : 'empty'} in planning mode`);
        res.json({ message: 'Preparacion del orquestador guardada', orchestrator: buildOrchestratorReadiness(saved, preflight) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo guardar la preparacion del orquestador nativo' });
    }
});

app.post('/api/orchestrator/action', authenticateToken, requirePermission('orchestrator.configure'), async (req, res) => {
    try {
        const action = sanitizeAuditText(req.body?.action, 'unknown', 80);
        await auditLog(req.user.username, 'ORCHESTRATOR_ACTION_BLOCKED', `Blocked native orchestrator action while in planning mode: ${action}`);
        res.status(501).json({ error: 'El orquestador nativo esta en modo planificacion; no ejecuta instalaciones, migraciones ni ciclo de vida todavia' });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo registrar la accion bloqueada del orquestador' });
    }
});

app.post('/api/maintenance/action', authenticateToken, requireRole('operator'), async (req, res) => {
    try {
        const { action, confirmation } = req.body || {};
        if (action === 'clear_logs') {
            if (!hasRole(req.user, 'owner')) {
                return res.status(403).json({ error: 'Truncar logs ARK requiere rol owner' });
            }
            if (typeof confirmation !== 'string' || confirmation.trim().toUpperCase() !== CLEAR_LOGS_CONFIRMATION) {
                await auditLog(req.user.username, 'MAINTENANCE_REJECTED', 'Rejected ARK log truncation without explicit confirmation');
                return res.status(400).json({ error: `Escribe ${CLEAR_LOGS_CONFIRMATION} para confirmar el truncado de logs ARK` });
            }
            const logTargets = CLUSTER_MAPS.filter(map => map.logPath);
            if (logTargets.length === 0) {
                return res.status(400).json({ error: 'No hay rutas de logs ARK gestionadas configuradas' });
            }
            await ensureAuditLogWritable();
            const results = await Promise.allSettled(logTargets.map(map => truncateManagedLogFile(map.logPath)));
            const failed = results.filter(result => result.status === 'rejected').length;
            if (failed > 0) {
                await auditLog(req.user.username, 'MAINTENANCE_FAILED', `Failed to clear ${failed}/${logTargets.length} server logs`);
                return res.status(500).json({ error: `No se pudieron truncar ${failed} de ${logTargets.length} logs del servidor` });
            }
            await auditLog(req.user.username, 'MAINTENANCE', `Cleared ${logTargets.length} server logs`);
            return res.json({ message: 'Mantenimiento: clear_logs completado', cleared: logTargets.length });
        }

        if (action === 'validate_steamcmd' || action === 'wipe_db') {
            if (!hasRole(req.user, 'owner')) {
                return res.status(403).json({ error: `La acción de mantenimiento ${action} requiere rol owner` });
            }
            await auditLog(req.user.username, 'MAINTENANCE_UNAVAILABLE', `Requested unsupported maintenance action: ${action}`);
            return res.status(501).json({ error: DEPLOY_CAPABILITIES.maintenance[action].reason });
        }

        res.status(400).json({ error: 'Acción de mantenimiento inválida' });
    } catch (err) {
        res.status(500).json({ error: 'Error al ejecutar la acción de mantenimiento' });
    }
});

// --- Runtime Plugin Routes ---
app.get('/api/plugins/status', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const [obelisk, arkApi] = await Promise.all([getObeliskStatus(), getArkApiStatus()]);
        res.json({ runtimes: { obelisk, arkApi } });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo inspeccionar los runtimes de plugins' });
    }
});

app.get('/api/plugins/obelisk/logs', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const instance = String(req.query.instance || '').trim();
        if (!isSafeRuntimeId(instance)) {
            return res.status(400).json({ error: 'Id de instancia inválido' });
        }
        if (!allowedObeliskInstanceIds().has(instance)) {
            return res.status(404).json({ error: 'La instancia Obelisk no está gestionada por este panel' });
        }
        const lines = parseBoundedIntegerParam(req.query.lines, 'lines', { defaultValue: 200, min: 20, max: 500 });
        const logPath = resolveRuntimePath(PLUGIN_MANAGER_OBELISK_ROOT, 'logs', instance, 'Obelisk.log');
        if (!await pathExists(logPath)) {
            return res.status(404).json({ error: 'No se encontró log Obelisk para esta instancia' });
        }
        res.json({ instance, lines, content: await tailFile(logPath, lines) });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo leer el log Obelisk' });
    }
});

app.post('/api/plugins/obelisk/instances/:instance/markers', authenticateToken, requireRole('owner'), async (req, res) => {
    try {
        const instance = String(req.params.instance || '').trim();
        const marker = String(req.body?.marker || '').trim();
        const enabled = req.body?.enabled;
        if (!isSafeRuntimeId(instance)) {
            return res.status(400).json({ error: 'Id de instancia inválido' });
        }
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'El estado del marcador debe ser booleano' });
        }
        if (!allowedObeliskInstanceIds().has(instance)) {
            return res.status(404).json({ error: 'La instancia Obelisk no está gestionada por este panel' });
        }
        if (!Object.prototype.hasOwnProperty.call(OBELISK_SAFE_MARKERS, marker)) {
            return res.status(400).json({ error: 'Marcador Obelisk no soportado' });
        }

        await ensureAuditLogWritable();
        const markerDir = await ensureRuntimeMarkerDirectory(PLUGIN_MANAGER_OBELISK_ROOT, 'state', 'instances', instance);
        const markerPath = resolveRuntimePath(markerDir, marker);
        if (enabled) {
            await writeRuntimeMarkerFile(markerPath, `${new Date().toISOString()}\n`);
        } else {
            await fs.rm(markerPath, { force: true });
        }

        await auditLog(req.user.username, 'PLUGIN_MARKER_UPDATED', `Obelisk ${instance}: ${enabled ? 'enabled' : 'disabled'} ${marker}`);
        res.json({ message: 'Marcador Obelisk actualizado', instance, marker, enabled });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'No se pudo actualizar el marcador Obelisk' });
    }
});

if (IS_TEST) {
    app.get('/api/test/unhandled-error', (req, res, next) => {
        next(new Error('simulated unhandled route failure'));
    });
}

const hubService = require('./hub').installHubRoutes(app, { authenticateToken, requireRole, requirePermission, ensureAuditLogWritable, auditLog });
require('./game-modes').installGameModeRoutes(app, { authenticateToken, requireRole, resolveRequiredMapId, getMapConfig, updateTextFilesAtomic, ensureAuditLogWritable, auditLog });

app.get('/api/servers/:mapId/capabilities', authenticateToken, requireRole('operator'), async (req, res) => {
    const selection = resolveRequiredMapId(req.params.mapId);
    if (selection.error || Object.keys(req.query).length) return res.status(400).json({ error: selection.error || 'Parámetros de consulta inválidos' });
    try {
        const map = getMapConfig(selection.mapId);
        const rconConfigured = await isManagedRconConfigured(selection.mapId);
        const writable = async target => {
            try { await fs.access(target, fsConstants.W_OK); return true; } catch (_) { return false; }
        };
        const executable = async target => {
            try { await fs.access(target, fsConstants.X_OK); return true; } catch (_) { return false; }
        };
        const configWritable = (await writable(map.gameIni)) && (await writable(map.gameUserSettings));
        const canOwn = hasRole(req.user, 'owner');
        const canOperate = hasRole(req.user, 'operator');
        let obeliskInstance;
        try { obeliskInstance = (await hubService.instances()).find(item => item.id === selection.mapId); } catch (_) { /* Kept distinct from RCON. */ }
        const lifecycle = canOwn && await executable(map.script);
        res.json({
            map_id: selection.mapId, configured: true,
            transport: {
                rcon: { configured: rconConfigured, reachable: null, reachability: 'not_probed', reason: rconConfigured ? 'Configuración disponible; la conexión se confirma al ejecutar.' : 'RCON está desactivado o su configuración está incompleta.' },
                obelisk: { registered: Boolean(obeliskInstance), available: obeliskInstance?.available === true, plugin_control: Boolean(obeliskInstance?.available && hasPermission(req.user, 'obelisk.plugins.manage')) },
            },
            actions: { console: canOwn && rconConfigured, kick: canOperate && rconConfigured, ban: canOperate && rconConfigured, unban: canOperate && rconConfigured, message: canOperate && rconConfigured, broadcast: canOperate && rconConfigured, admin: canOwn && await writable(INGAME_ADMINS_PATH), settings: canOwn && configWritable, start: lifecycle, stop: lifecycle, restart: lifecycle },
            restart_required: { settings: true, admin_allowlist: true },
            identity: { rcon_player_ids: 'steam_or_native_text_requires_validation', admin_allowlist: 'steam_ids_only', epic_admin_grant_verified: false },
        });
    } catch (_) { res.status(503).json({ error: 'No se pudieron obtener las capacidades de la instancia' }); }
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta API no encontrada' });
});

// Serve frontend. Missing hashed assets must not fall through to index.html,
// otherwise browsers reject them as JavaScript with a text/html MIME type.
app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), {
    immutable: true,
    maxAge: '1y',
}));
app.use('/assets', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-FlowArk-Asset-Missing', '1');
    res.status(404).type('text/plain').send('Asset no encontrado; recarga el panel para obtener la versión actual.');
});
app.use(express.static(CLIENT_DIST, {
    index: false,
    setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));
app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return res.status(404).json({ error: 'Ruta no encontrada' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const isApiRequest = req.path.startsWith('/api/');
    const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
    if (isApiRequest) {
        return res.status(statusCode).json({
            error: statusCode === 500 ? 'Error interno del servidor' : 'Petición fallida',
            requestId: req.requestId,
        });
    }
    res.status(statusCode).type('text/plain').send('Error interno del servidor');
});

function startServer(port = PORT, host = HOST) {
    const server = app.listen(port, host, () => console.log(`ObeliskNative running on ${host}:${port}`));
    server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
    server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
    server.keepAliveTimeout = HTTP_KEEPALIVE_TIMEOUT_MS;
    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = {
    app,
    collectOnlinePlayerObservations,
    startServer,
    HOST,
    HTTP_REQUEST_TIMEOUT_MS,
    HTTP_HEADERS_TIMEOUT_MS,
    HTTP_KEEPALIVE_TIMEOUT_MS,
    DISCORD_WEBHOOK_TIMEOUT_MS,
    API_RATE_LIMIT_OPTIONS,
    API_READ_RATE_LIMIT_OPTIONS,
    AUTH_RATE_LIMIT_OPTIONS,
    sendDiscordWebhook,
    redactArkSecrets,
    containsRedactedSecret,
    normalizeGameUserSettingsContent,
    redactAuditSecrets,
    sanitizeAuditDetails,
    DEPLOY_CAPABILITIES,
    ORCHESTRATOR_CONFIG_DEFAULTS,
    ORCHESTRATOR_PHASES,
    WORKSHOP_EPIC_WARNING,
    PERMISSION_CATALOG,
    ROLE_PERMISSION_DEFAULTS,
    buildDeployCapabilities,
    normalizeOrchestratorConfig,
    inspectOrchestratorRoot,
    buildOrchestratorReadiness,
    buildOrchestratorMigrationPlan,
    effectiveAdminPermissions,
    normalizeAdminPermissions,
    hasPermission,
    updateIniKey,
    ensureAdminRolesSync,
    normalizeClusterMap,
    normalizeClusterMaps,
    processMatchesMap,
    findMapProcess,
    updateJsonFile,
    withJsonProcessLock,
    writeTextFileAtomic,
    updateTextFileAtomic,
    updateTextFilesAtomic,
    truncateManagedLogFile,
    writeRuntimeMarkerFile,
    withTimeout,
    execRcon,
    queryGameServer,
    trackOnlinePlayersOnce,
    upsertActiveBan,
    deactivateActiveBans,
    sanitizeAuditText,
    publicClusterStatusErrorForUser,
    publicLiveStatusErrorForUser,
    validateStoredScheduledTask,
    executeTaskAction,
    scheduleCronJob,
};
