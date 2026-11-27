// Local ObeliskNative Hub. The browser never supplies a filesystem path.
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const { execFile } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CATALOG_PATH = path.join(__dirname, '../hub/catalog.json');
const REFERENCES_PATH = path.join(REPO_ROOT, 'docs/research/ase-ecosystem-inventory-20261014.json');
const CLI_PATH = path.join(REPO_ROOT, 'scripts/obelisk_plugin_ctl.py');
const ACTIONS = new Set(['start', 'pause', 'resume', 'stop', 'reload']);
const LABEL = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_CODE = /^[A-Za-z0-9_-]{1,100}$/;
const PRIVATE_UIDS = new Set([0, process.getuid?.() ?? 0]);

class HubError extends Error {
    constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function fail(status, message, code) { throw new HubError(status, message, code); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, allowed) { return isRecord(value) && Object.keys(value).every(key => allowed.includes(key)); }
function publicCode(value, fallback = 'runtime_rejected') { return typeof value === 'string' && SAFE_CODE.test(value) ? value : fallback; }

async function checkedAncestors(filePath, { privateParent = false } = {}) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || filePath.includes('\0') || path.resolve(filePath) !== filePath) {
        fail(503, 'La configuración local del Hub contiene una ruta inválida', 'unsafe_local_path');
    }
    const parts = path.dirname(filePath).split(path.sep).filter(Boolean);
    let current = path.parse(filePath).root;
    for (const component of parts) {
        current = path.join(current, component);
        const info = await fs.lstat(current);
        const stickyRoot = info.uid === 0 && Boolean(info.mode & 0o1000);
        if (!info.isDirectory() || info.isSymbolicLink() || !PRIVATE_UIDS.has(info.uid) || ((info.mode & 0o022) && !stickyRoot)) {
            fail(503, 'El Hub requiere rutas locales de confianza sin enlaces simbólicos', 'unsafe_local_ancestor');
        }
    }
    if (privateParent) {
        const parent = await fs.lstat(path.dirname(filePath));
        if ((parent.mode & 0o077) !== 0) fail(503, 'La carpeta privada del Hub debe tener permisos 0700', 'unsafe_private_parent');
    }
}

async function readPrivateJson(filePath) {
    await checkedAncestors(filePath, { privateParent: true });
    let handle;
    try {
        handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const info = await handle.stat();
        if (!info.isFile() || !PRIVATE_UIDS.has(info.uid) || (info.mode & 0o077) !== 0 || info.nlink !== 1 || info.size > 65536) {
            fail(503, 'El registro del Hub requiere un archivo privado 0600 de tamaño limitado', 'unsafe_registry_file');
        }
        const data = await handle.readFile('utf8');
        if (Buffer.byteLength(data) > 65536) fail(503, 'El registro del Hub supera el tamaño permitido', 'registry_too_large');
        return JSON.parse(data);
    } catch (error) {
        if (error instanceof HubError) throw error;
        fail(503, 'No se pudo leer el registro privado de instancias del Hub', 'registry_unavailable');
    } finally { await handle?.close(); }
}

async function openTrustedFile(filePath, maxBytes) {
    await checkedAncestors(filePath);
    const handle = await fs.open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || !PRIVATE_UIDS.has(info.uid) || (info.mode & 0o022) || info.nlink !== 1 || info.size > maxBytes) {
        await handle.close();
        fail(503, 'El artefacto local no cumple los límites de publicación', 'unsafe_artifact_file');
    }
    return { handle, info };
}

async function checkSocket(socketPath) {
    await checkedAncestors(socketPath, { privateParent: true });
    const info = await fs.lstat(socketPath);
    if (!info.isSocket() || info.isSymbolicLink() || !PRIVATE_UIDS.has(info.uid) || (info.mode & 0o077) !== 0) {
        fail(503, 'El control requiere un socket local privado 0600', 'unsafe_control_socket');
    }
    await fs.access(socketPath, constants.W_OK);
}

function parseQuery(query, allowed) {
    if (!exactKeys(query, allowed) || Object.values(query).some(value => typeof value !== 'string')) {
        fail(400, 'Parámetros de consulta inválidos', 'invalid_query');
    }
}

function integerQuery(value, fallback, max) {
    if (value === undefined) return fallback;
    if (!/^[1-9][0-9]{0,5}$/.test(value) || Number(value) > max) fail(400, 'Paginación fuera del rango permitido', 'invalid_pagination');
    return Number(value);
}

function normalizePluginStatus(value, allowedIds) {
    if (!isRecord(value) || !allowedIds.includes(value.plugin_id)) return null;
    const item = { plugin_id: value.plugin_id, state: publicCode(value.state, 'unknown') };
    for (const key of ['cooperative', 'faulted', 'retained', 'shutdown_failed', 'prepare_unload_failed']) {
        if (typeof value[key] === 'boolean') item[key] = value[key];
    }
    for (const key of ['generation', 'in_flight']) {
        if (Number.isSafeInteger(value[key]) && value[key] >= 0) item[key] = value[key];
    }
    if (value.last_failure) item.last_failure = publicCode(value.last_failure, 'runtime_failure');
    return item;
}

function invokeCli(socketPath, action, pluginId, runner = execFile) {
    return new Promise(resolve => {
        const args = [CLI_PATH, '--socket', socketPath, '--timeout-ms', '1000', action];
        if (pluginId) args.push(pluginId);
        runner('/usr/bin/python3', args, { timeout: 6000, maxBuffer: 65536, encoding: 'utf8', windowsHide: true }, (error, stdout, stderr) => {
            let response;
            try { response = JSON.parse(stdout || stderr || '{}'); } catch { response = null; }
            if (!isRecord(response) || typeof response.ok !== 'boolean' || error?.killed || error?.code === 'ETIMEDOUT' || response.outcome === 'unknown') {
                resolve({ ok: false, outcome: 'pending', reason: 'outcome_unknown' });
                return;
            }
            const code = publicCode(response.reason || response.error);
            if (code === 'in_progress' || code === 'handler_failure' || code === 'invalid_handler_response') {
                resolve({ ok: false, outcome: 'pending', reason: code });
                return;
            }
            resolve({ ...response, outcome: 'confirmed', reason: response.ok ? undefined : code });
        });
    });
}

function createHubService(options = {}) {
    const instancesFile = options.instancesFile ?? process.env.OBELISK_HUB_INSTANCES_FILE ?? '';
    const artifactDir = options.artifactDir ?? process.env.OBELISK_HUB_ARTIFACTS_DIR ?? '';
    const inFlight = new Set();
    const pending = new Set();
    const resources = require('./hub-resources').createResourceService(openTrustedFile, fail);
    const parity = require('./hub-parity');

    async function catalog() {
        return JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
    }

    async function registry() {
        if (!instancesFile) return [];
        const value = await readPrivateJson(instancesFile);
        if (!exactKeys(value, ['schema_version', 'instances']) || value.schema_version !== 1 || !Array.isArray(value.instances) || value.instances.length > 32) {
            fail(503, 'El registro de instancias no cumple el contrato del Hub', 'invalid_registry');
        }
        const pluginIds = new Set((await catalog()).plugins.map(plugin => plugin.id));
        const ids = new Set();
        const sockets = new Set();
        return value.instances.map(instance => {
            if (!exactKeys(instance, ['id', 'name', 'socket_path', 'plugin_ids']) || typeof instance.id !== 'string' || !LABEL.test(instance.id) || ids.has(instance.id) || typeof instance.name !== 'string' || !instance.name.trim() || instance.name.length > 100 || /[\x00-\x1f\x7f]/.test(instance.name) || typeof instance.socket_path !== 'string' || Buffer.byteLength(instance.socket_path) > 107 || instance.socket_path.includes('\0') || !path.isAbsolute(instance.socket_path) || path.resolve(instance.socket_path) !== instance.socket_path || sockets.has(instance.socket_path) || !Array.isArray(instance.plugin_ids) || instance.plugin_ids.length > pluginIds.size || instance.plugin_ids.some(id => !pluginIds.has(id)) || new Set(instance.plugin_ids).size !== instance.plugin_ids.length) {
                fail(503, 'El registro de instancias contiene una entrada inválida', 'invalid_registry_instance');
            }
            ids.add(instance.id);
            sockets.add(instance.socket_path);
            return instance;
        });
    }

    async function instanceById(id) {
        if (typeof id !== 'string' || !LABEL.test(id)) fail(400, 'Identificador de instancia inválido', 'invalid_instance_id');
        const instance = (await registry()).find(item => item.id === id);
        if (!instance) fail(404, 'Instancia no registrada en el Hub', 'instance_not_registered');
        return instance;
    }

    async function instances() {
        const entries = await registry();
        return Promise.all(entries.map(async item => {
            let available = false;
            try { await checkSocket(item.socket_path); available = true; } catch { /* No host paths in browser errors. */ }
            return { id: item.id, name: item.name, available, capabilities: { plugin_control: available }, plugins: item.plugin_ids };
        }));
    }

    async function references(query = {}) {
        parseQuery(query, ['search', 'family', 'page', 'pageSize']);
        const rawSearch = (query.search || '').normalize('NFKC');
        if (rawSearch.length > 128 || /[\x00-\x1f\x7f]/.test(rawSearch)) fail(400, 'Búsqueda inválida', 'invalid_search');
        const search = rawSearch.trim();
        const page = integerQuery(query.page, 1, 10000);
        const pageSize = integerQuery(query.pageSize, 20, 50);
        const snapshot = JSON.parse(await fs.readFile(REFERENCES_PATH, 'utf8'));
        const families = [...new Set(snapshot.resources.map(item => item.functional_family))].filter(Boolean).sort();
        if (query.family && !families.includes(query.family)) fail(400, 'Familia de referencia desconocida', 'invalid_family');
        const selected = snapshot.resources.filter(item => (!query.family || item.functional_family === query.family) && (!search || `${item.name} ${item.capability_summary_original_es || ''}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))));
        return {
            snapshot_date: snapshot.snapshot_date,
            stage: 'reference_pending',
            gameplay_parity_accepted: false,
            items: selected.slice((page - 1) * pageSize, page * pageSize).map(item => ({ resource_id: item.resource_id, name: item.name, version: item.listed_version, category: item.category, family: item.functional_family, source_url: item.resource_url, summary: item.capability_summary_original_es || '', stage: 'reference_pending', available: false })),
            total: selected.length, page, pageSize, families,
        };
    }

    async function plugins(id) {
        const instance = await instanceById(id);
        await checkSocket(instance.socket_path);
        const response = await invokeCli(instance.socket_path, 'status', null, options.runner);
        if (response.ok && response.outcome === 'confirmed') pending.delete(id);
        return { instance: id, ok: response.ok, outcome: response.outcome, reason: response.reason, plugins: Array.isArray(response.plugins) ? response.plugins.map(item => normalizePluginStatus(item, instance.plugin_ids)).filter(Boolean) : [], guidance: response.outcome === 'pending' ? 'Consulta el estado de nuevo; no reintentes la acción anterior hasta confirmar el resultado.' : undefined };
    }

    async function action(id, pluginId, operation) {
        const instance = await instanceById(id);
        if (!LABEL.test(pluginId || '') || !instance.plugin_ids.includes(pluginId)) fail(400, 'Plugin no permitido para esta instancia', 'plugin_not_allowed');
        if (!ACTIONS.has(operation)) fail(400, 'Acción de plugin inválida', 'invalid_plugin_action');
        await checkSocket(instance.socket_path);
        if (pending.has(id)) fail(409, 'La operación anterior requiere consultar el estado antes de otra acción', 'previous_outcome_pending');
        if (inFlight.has(id)) fail(409, 'Ya hay una operación en curso; consulta el estado antes de continuar', 'instance_control_busy');
        inFlight.add(id);
        try {
            const response = await invokeCli(instance.socket_path, operation, pluginId, options.runner);
            if (response.outcome === 'pending') pending.add(id);
            return {
                ok: response.ok, instance: id, plugin_id: pluginId, action: operation,
                state: publicCode(response.state, 'unknown'), reason: response.reason,
                outcome: response.outcome,
                guidance: response.outcome === 'pending' ? 'Resultado pendiente. Consulta el estado antes de decidir otra acción; no se reintenta automáticamente.' : undefined,
            };
        } finally { inFlight.delete(id); }
    }

    async function artifactIndex() {
        if (!artifactDir) return [];
        if (!path.isAbsolute(artifactDir) || path.resolve(artifactDir) !== artifactDir) fail(503, 'Ruta de publicación inválida', 'invalid_artifact_directory');
        const { handle } = await openTrustedFile(path.join(artifactDir, 'index.json'), 1024 * 1024);
        let index;
        try { index = JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
        if (!exactKeys(index, ['schema_version', 'artifacts']) || index.schema_version !== 1 || !Array.isArray(index.artifacts) || index.artifacts.length > 64) fail(503, 'Índice de artefactos inválido', 'invalid_artifact_index');
        const ids = new Set();
        const knownPlugins = new Set((await catalog()).plugins.map(item => item.id));
        const basename = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/.test(value) && path.basename(value) === value;
        for (const item of index.artifacts) {
            if (!exactKeys(item, ['id', 'version', 'channel', 'stability', 'platform', 'game', 'game_build', 'api_bytes', 'runtime_ready', 'archive_name', 'manifest_name', 'signature_name', 'archive_sha256', 'archive_size', 'created_at_utc', 'components']) || typeof item.id !== 'string' || !LABEL.test(item.id) || ids.has(item.id) || !basename(item.version) || !SAFE_CODE.test(item.channel || '') || !SAFE_CODE.test(item.stability || '') || !SAFE_CODE.test(item.platform || '') || typeof item.game !== 'string' || item.game.length > 100 || /[\x00-\x1f\x7f]/.test(item.game) || !/^[A-Za-z0-9._-]{1,64}$/.test(String(item.game_build ?? '')) || !Number.isSafeInteger(item.api_bytes) || item.api_bytes < 1 || item.api_bytes > 65536 || typeof item.runtime_ready !== 'boolean' || !['archive_name', 'manifest_name', 'signature_name'].every(key => basename(item[key])) || !/^[a-f0-9]{64}$/.test(item.archive_sha256 || '') || !Number.isSafeInteger(item.archive_size) || item.archive_size < 1 || item.archive_size > 512 * 1024 * 1024 || !Array.isArray(item.components) || item.components.length > knownPlugins.size || item.components.some(id => !knownPlugins.has(id)) || new Set(item.components).size !== item.components.length || (item.created_at_utc !== undefined && (typeof item.created_at_utc !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(item.created_at_utc)))) fail(503, 'Metadatos de artefacto inválidos', 'invalid_artifact_metadata');
            ids.add(item.id);
        }
        return index.artifacts;
    }

    async function artifacts() {
        return { configured: Boolean(artifactDir), installation_available: false, verification_status: 'signature_not_verified_by_hub', artifacts: (await artifactIndex()).map(item => ({ ...item, signature_verified: false, installation_available: false })) };
    }

    async function downloadArtifact(id, file) {
        if (!LABEL.test(id || '') || !['archive', 'manifest', 'signature'].includes(file)) fail(400, 'Descarga de artefacto inválida', 'invalid_artifact_download');
        const item = (await artifactIndex()).find(entry => entry.id === id);
        if (!item) fail(404, 'Artefacto no publicado', 'artifact_not_found');
        const filename = item[`${file}_name`];
        const opened = await openTrustedFile(path.join(artifactDir, filename), file === 'archive' ? 512 * 1024 * 1024 : 2 * 1024 * 1024);
        if (file === 'archive' && opened.info.size !== item.archive_size) {
            await opened.handle.close();
            fail(503, 'El tamaño del artefacto no coincide con su índice', 'artifact_size_mismatch');
        }
        return { ...opened, filename };
    }

    return { catalog, references, instances, plugins, action, artifacts, downloadArtifact,
        resources: resources.catalog, downloadResource: resources.download,
        parity: parity.overview, referenceDetail: id => parity.detail(id, fail),
        requireStatus: id => pending.add(id), configured: Boolean(instancesFile) };
}

function installHubRoutes(app, guards, options = {}) {
    const service = createHubService(options);
    const { authenticateToken, requireRole, requirePermission, ensureAuditLogWritable, auditLog } = guards;
    const handler = fn => async (req, res) => {
        try { await fn(req, res); }
        catch (error) { res.status(error instanceof HubError ? error.status : 503).json({ error: error instanceof HubError ? error.message : 'El Hub local no está disponible', code: error instanceof HubError ? error.code : 'hub_unavailable' }); }
    };
    const reader = [authenticateToken, requireRole('operator')];
    app.get('/api/hub/catalog', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json({ catalog: await service.catalog() }); }));
    app.get('/api/hub/references', ...reader, handler(async (req, res) => res.json({ references: await service.references(req.query) })));
    app.get('/api/hub/references/:id', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json({ reference: await service.referenceDetail(req.params.id) }); }));
    app.get('/api/hub/parity', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json({ parity: await service.parity() }); }));
    app.get('/api/hub/resources', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json({ resources: await service.resources() }); }));
    app.get('/api/hub/resources/:id/download', ...reader, handler(async (req, res) => {
        parseQuery(req.query, []);
        const resource = await service.downloadResource(req.params.id);
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${resource.filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-SHA256', resource.sha256);
        res.send(resource.bytes);
    }));
    app.get('/api/hub/instances', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json({ instances: await service.instances(), configured: service.configured }); }));
    app.get('/api/hub/instances/:id/plugins', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json(await service.plugins(req.params.id)); }));
    app.get('/api/hub/artifacts', ...reader, handler(async (req, res) => { parseQuery(req.query, []); res.json(await service.artifacts()); }));
    app.get('/api/hub/artifacts/:id/download', ...reader, handler(async (req, res) => {
        parseQuery(req.query, ['file']);
        const { handle, info, filename } = await service.downloadArtifact(req.params.id, req.query.file);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', info.size);
        const stream = handle.createReadStream();
        res.on('close', () => stream.destroy());
        stream.on('error', () => res.destroy());
        stream.pipe(res);
    }));
    app.post('/api/hub/instances/:id/plugins/:pluginId/:action', ...reader, requirePermission('obelisk.plugins.manage'), handler(async (req, res) => {
        parseQuery(req.query, []);
        if (!exactKeys(req.body, []) || Number(req.headers['content-length'] || 0) > 1024) fail(400, 'La acción no acepta parámetros de host ni datos adicionales', 'invalid_action_body');
        await ensureAuditLogWritable();
        const response = await service.action(req.params.id, req.params.pluginId, req.params.action);
        try { await auditLog(req.user.username, 'OBELISK_PLUGIN_CONTROL', `${response.instance} ${response.plugin_id} ${response.action} outcome=${response.outcome} ok=${response.ok}`); }
        catch {
            service.requireStatus(response.instance);
            response.outcome = 'pending';
            response.reason = 'audit_commit_failed_after_dispatch';
            response.guidance = 'El runtime pudo ejecutar la acción. Consulta su estado antes de continuar; no se reintenta automáticamente.';
        }
        res.status(response.outcome === 'pending' ? 202 : (response.ok ? 200 : 409)).json(response);
    }));
    return service;
}

module.exports = { createHubService, installHubRoutes, HubError, checkSocket, readPrivateJson };
