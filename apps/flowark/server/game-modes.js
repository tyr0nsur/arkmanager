// Original ObeliskNative configuration profiles. Saving is not live activation.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const MODE_PROFILES = Object.freeze([
    { id: 'pve', name: 'PvE', description: 'Supervivencia cooperativa, sin combate entre jugadores.', pve: true, hardcore: false },
    { id: 'pvp', name: 'PvP', description: 'Supervivencia con combate entre jugadores y tribus.', pve: false, hardcore: false },
    { id: 'hardcore-pve', name: 'Hardcore PvE', description: 'PvE con reinicio del personaje a nivel 1 al morir.', pve: true, hardcore: true },
    { id: 'hardcore-pvp', name: 'Hardcore PvP', description: 'PvP con reinicio del personaje a nivel 1 al morir.', pve: false, hardcore: true },
]);
const GAME_SECTION = '/script/shootergame.shootergamemode';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const PREVIEW_TTL_MS = 5 * 60 * 1000;

function settingValues(content, section, key) {
    let selected = false;
    const values = [];
    for (const line of content.split(/\r?\n/)) {
        const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (header) { selected = header[1].toLowerCase() === section.toLowerCase(); continue; }
        if (!selected) continue;
        const match = line.match(/^\s*([^;#=][^=]*?)\s*=\s*(.*?)\s*$/);
        if (match && match[1].trim().toLowerCase() === key.toLowerCase()) values.push(match[2]);
    }
    return values;
}

function setting(content, section, key) { return settingValues(content, section, key).at(-1); }

function putSetting(content, section, key, value) {
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const lines = content.split(/\r?\n/);
    const result = [];
    let selected = false;
    let sectionSeen = false;
    let written = false;
    for (const line of lines) {
        const header = line.match(/^\s*\[([^\]]+)\]\s*$/);
        if (header) {
            if (selected && !written) { result.push(`${key}=${value}`); written = true; }
            selected = header[1].toLowerCase() === section.toLowerCase();
            if (selected) sectionSeen = true;
        }
        const assignment = selected && line.match(/^\s*([^;#=][^=]*?)\s*=/);
        if (assignment && assignment[1].trim().toLowerCase() === key.toLowerCase()) {
            if (!written) { result.push(`${key}=${value}`); written = true; }
            continue; // Remove duplicates in all copies of the target section.
        }
        result.push(line);
    }
    if (!sectionSeen) result.push(`[${section}]`);
    if (!written) result.push(`${key}=${value}`);
    return result.join(eol);
}

function modeChanges(files, mode) {
    const changes = [
        { file: 'gameUserSettings', section: 'ServerSettings', key: 'serverPVE', value: mode.pve ? 'True' : 'False' },
        { file: 'gameUserSettings', section: 'ServerSettings', key: 'ServerHardcore', value: mode.hardcore ? 'True' : 'False' },
        { file: 'gameIni', section: GAME_SECTION, key: 'bAutoPvETimer', value: 'False' },
    ];
    return changes.map(change => ({ ...change, previous: setting(files[change.file], change.section, change.key) ?? null }))
        .filter(change => settingValues(files[change.file], change.section, change.key).length !== 1 || String(change.previous).toLowerCase() !== change.value.toLowerCase());
}

function revision(files) {
    return crypto.createHash('sha256').update(JSON.stringify([files.gameIni, files.gameUserSettings])).digest('hex');
}

function previewToken(payload, secret) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
}

function verifyToken(token, secret, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 2048) throw new Error('invalid_preview');
    const pieces = token.split('.');
    if (pieces.length !== 2) throw new Error('invalid_preview');
    const expected = crypto.createHmac('sha256', secret).update(pieces[0]).digest();
    const actual = Buffer.from(pieces[1], 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('invalid_preview');
    const payload = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(payload.issued) || payload.issued > now || now - payload.issued >= PREVIEW_TTL_MS)
        throw new Error('expired_preview');
    return payload;
}

async function readFiles(config) {
    const files = {};
    for (const key of ['gameIni', 'gameUserSettings']) {
        const info = await fs.lstat(config[key]);
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES) throw new Error('invalid_configuration_file');
        const bytes = await fs.readFile(config[key]);
        if (bytes.length > MAX_FILE_BYTES || bytes.includes(0)) throw new Error('invalid_configuration_file');
        files[key] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    return files;
}

function installGameModeRoutes(app, dependencies) {
    const { authenticateToken, requireRole, resolveRequiredMapId, getMapConfig,
        updateTextFilesAtomic, ensureAuditLogWritable, auditLog } = dependencies;
    // Invalidate unfinished previews across panel restarts; no persisted secret.
    const secret = crypto.randomBytes(32);
    const authenticateOwner = [authenticateToken, requireRole('owner')];
    app.get('/api/game-modes', authenticateToken, requireRole('operator'), (req, res) => {
        res.json({ profiles: MODE_PROFILES, restart_required: true,
            scope: 'configuration_only', applies_to: 'ase', custom_modes_supported: false });
    });
    app.post('/api/game-modes/preview', ...authenticateOwner, async (req, res) => {
        try {
            if (!req.body || Object.keys(req.body).some(key => !['mapId', 'modeId'].includes(key)))
                return res.status(400).json({ error: 'Selecciona mapa y modo.' });
            const selection = resolveRequiredMapId(req.body.mapId);
            const mode = MODE_PROFILES.find(entry => entry.id === req.body.modeId);
            if (selection.error || !mode) return res.status(400).json({ error: 'Mapa o modo no válido.' });
            const files = await readFiles(getMapConfig(selection.mapId));
            const changes = modeChanges(files, mode);
            const token = previewToken({ mapId: selection.mapId, modeId: mode.id,
                revision: revision(files), user: req.user.username, issued: Date.now() }, secret);
            res.json({ mapId: selection.mapId, profile: mode, changes, preview_token: token,
                expires_in_seconds: PREVIEW_TTL_MS / 1000, restart_required: true,
                runtime_applied: false, preserves_rates: true, disables_pve_schedule: true });
        } catch {
            res.status(409).json({ error: 'No se puede preparar el modo. Comprueba los archivos del mapa.' });
        }
    });
    app.post('/api/game-modes/apply', ...authenticateOwner, async (req, res) => {
        let writesPrepared = false;
        let writesCompleted = false;
        try {
            if (!req.body || Object.keys(req.body).some(key => !['preview_token', 'confirmation'].includes(key)))
                return res.status(400).json({ error: 'Solicitud no válida.' });
            const payload = verifyToken(req.body.preview_token, secret);
            const selection = resolveRequiredMapId(payload.mapId);
            const mode = MODE_PROFILES.find(entry => entry.id === payload.modeId);
            if (selection.error || !mode || payload.user !== req.user.username || req.body.confirmation !== payload.mapId)
                return res.status(400).json({ error: 'La confirmación no corresponde al mapa y usuario.' });
            const config = getMapConfig(selection.mapId);
            await ensureAuditLogWritable();
            await updateTextFilesAtomic([config.gameIni, config.gameUserSettings], current => {
                const files = { gameIni: current[path.resolve(config.gameIni)],
                    gameUserSettings: current[path.resolve(config.gameUserSettings)] };
                if (revision(files) !== payload.revision) throw new Error('stale_preview');
                let gameIni = files.gameIni;
                let gameUserSettings = files.gameUserSettings;
                for (const change of modeChanges(files, mode)) {
                    if (change.file === 'gameIni') gameIni = putSetting(gameIni, change.section, change.key, change.value);
                    else gameUserSettings = putSetting(gameUserSettings, change.section, change.key, change.value);
                }
                writesPrepared = true;
                return { [path.resolve(config.gameIni)]: gameIni, [path.resolve(config.gameUserSettings)]: gameUserSettings };
            }, { requireExisting: true });
            writesCompleted = true;
            await auditLog(req.user.username, 'GAME_MODE_SAVED', `[${selection.mapId}] ${mode.id}; restart required`);
            res.json({ mapId: selection.mapId, modeId: mode.id, saved: true, runtime_applied: false,
                restart_required: true, message: 'Configuración guardada. Reinicia el mapa y comprueba el modo en juego.' });
        } catch {
            if (writesPrepared) {
                return res.status(409).json({ error: 'No se pudo confirmar el guardado completo. Revisa ambos archivos y sus backups antes de otra acción.',
                    saved: writesCompleted ? true : null,
                    configuration_outcome: writesCompleted ? 'saved_audit_unconfirmed' : 'partial_or_unknown',
                    review_required: true, retry_automatically: false, runtime_applied: false, restart_required: true });
            }
            res.status(409).json({ error: 'No se aplicó el modo. Actualiza la vista y revisa la configuración antes de repetir.',
                saved: false, configuration_outcome: 'unchanged', retry_automatically: false, runtime_applied: false });
        }
    });
}

module.exports = { MODE_PROFILES, setting, putSetting, modeChanges, revision, previewToken, verifyToken, installGameModeRoutes };
