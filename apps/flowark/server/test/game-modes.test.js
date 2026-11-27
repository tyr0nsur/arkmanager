const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { MODE_PROFILES, setting, putSetting, modeChanges, previewToken, verifyToken, installGameModeRoutes } = require('../game-modes');

test('mode edits preserve CRLF, passwords, multipliers and unrelated sections while removing duplicate target settings', () => {
    const original = '[ServerSettings]\r\nserverPVE=False\r\nServerAdminPassword=must-not-change\r\nXPMultiplier=1000\r\n[Other]\r\nserverPVE=Untouched\r\n[ServerSettings]\r\nserverPVE=True\r\n';
    const files = { gameIni: '[/script/shootergame.shootergamemode]\r\nbAutoPvETimer=False\r\nTamingSpeedMultiplier=1000\r\n', gameUserSettings: original };
    const changes = modeChanges(files, MODE_PROFILES.find(mode => mode.id === 'pve'));
    assert.ok(changes.some(change => change.key === 'serverPVE'), 'conflicting duplicates normalize even when final assignment matches');
    const saved = putSetting(original, 'ServerSettings', 'serverPVE', 'True');
    assert.equal(saved.split(/\r?\n/).filter(line => line === 'serverPVE=True').length, 1);
    assert.match(saved, /ServerAdminPassword=must-not-change\r\nXPMultiplier=1000/);
    assert.match(saved, /\[Other\]\r\nserverPVE=Untouched/);
    assert.equal(saved.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal(setting(saved, 'ServerSettings', 'serverPVE'), 'True');
});

test('preview tokens reject tampering and expire at five minutes with no future-issued acceptance', () => {
    const secret = Buffer.alloc(32, 7);
    const token = previewToken({ issued: 1000, mapId: 'island', user: 'owner' }, secret);
    assert.equal(verifyToken(token, secret, 1001).mapId, 'island');
    assert.throws(() => verifyToken('X' + token.slice(1), secret, 1001));
    assert.throws(() => verifyToken(token, Buffer.alloc(32, 8), 1001));
    assert.throws(() => verifyToken(token, secret, 1000 + 5 * 60 * 1000), /expired/);
    assert.throws(() => verifyToken(token, secret, 999), /expired/);
    assert.throws(() => verifyToken('x'.repeat(2049), secret, 1001));
});

test('partially failed multi-file writes and post-save audit errors explicitly require review', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obelisk-modes-failure-'));
    const config = { gameIni: path.join(root, 'Game.ini'), gameUserSettings: path.join(root, 'GameUserSettings.ini') };
    const app = express();
    app.use(express.json());
    let writes = 0;
    let failAudit = false;
    const unchanged = { gameIni: '[/script/shootergame.shootergamemode]\nbAutoPvETimer=True\n', gameUserSettings: '[ServerSettings]\nserverPVE=False\nServerHardcore=False\n' };
    for (const key of Object.keys(config)) await fs.writeFile(config[key], unchanged[key]);
    installGameModeRoutes(app, {
        authenticateToken: (req, res, next) => { req.user = { username: 'owner', role: 'owner' }; next(); },
        requireRole: () => (req, res, next) => next(),
        resolveRequiredMapId: id => id === 'island' ? { mapId: id } : { error: 'invalid_map' },
        getMapConfig: () => config,
        ensureAuditLogWritable: async () => {},
        auditLog: async () => { if (failAudit) throw new Error('fixture audit failure'); },
        updateTextFilesAtomic: async (paths, updater) => {
            const current = {};
            for (const file of paths) current[file] = await fs.readFile(file, 'utf8');
            const next = updater(current);
            await fs.writeFile(paths[0], next[paths[0]]);
            writes++;
            if (!failAudit) throw new Error('second write failed');
            await fs.writeFile(paths[1], next[paths[1]]);
        },
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const post = async (endpoint, body) => {
        const response = await fetch(url + endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    };
    try {
        let preview = await post('/api/game-modes/preview', { mapId: 'island', modeId: 'pve' });
        let result = await post('/api/game-modes/apply', { preview_token: preview.body.preview_token, confirmation: 'island' });
        assert.equal(result.status, 409);
        assert.equal(result.body.configuration_outcome, 'partial_or_unknown');
        assert.equal(result.body.review_required, true);
        assert.equal(result.body.retry_automatically, false);
        assert.equal(result.body.saved, null);
        assert.equal(writes, 1);
        assert.equal(await fs.readFile(config.gameUserSettings, 'utf8'), unchanged.gameUserSettings);
        failAudit = true;
        preview = await post('/api/game-modes/preview', { mapId: 'island', modeId: 'pve' });
        result = await post('/api/game-modes/apply', { preview_token: preview.body.preview_token, confirmation: 'island' });
        assert.equal(result.body.configuration_outcome, 'saved_audit_unconfirmed');
        assert.equal(result.body.saved, true);
        assert.equal(result.body.runtime_applied, false);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await fs.rm(root, { recursive: true, force: true });
    }
});
