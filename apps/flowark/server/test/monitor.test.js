const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { createMonitorService, installMonitorRoutes, forRole, FRESH_MS } = require('../monitor');

test('native monitor accepts only private, current, process-bound snapshots and bounded history', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obelisk-monitor-')); await fs.chmod(root, 0o700);
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const file = path.join(root, 'monitor.json'); let clock = Date.now(); let processTicks = '12345';
    const map = { id: 'island', name: 'The Island', monitor_file: file };
    const service = createMonitorService({ getMaps: () => [map], now: () => clock, identifyProcess: async () => processTicks });
    const value = () => ({ schema: 'obelisk.monitor.v1', resource_version: '0.1.0', instance_id: 'island', pid: 123,
        process_start_ticks: '12345', sequence: 1, generated_at_ms: clock,
        process: { cpu_percent: 121, rss_bytes: 123456, uptime_seconds: 50 },
        lifecycle: { available: true, login_observations: 1, logout_observations: 0, dropped_observations: 0,
            recent_events: [{ kind: 'login_observed', sequence: '1', process_epoch: '99', observed_at_ms: clock, name: 'Tester', opaque_id: 'opaque-unverified' }] }, player_census: null, game_thread: null });
    const write = async payload => { await fs.writeFile(file, JSON.stringify(payload), { mode: 0o600 }); clock += 1001; };
    let payload = value(); await write(payload);
    let result = await service.collect(); assert.equal(result.maps[0].status, 'connected');
    assert.equal(result.maps[0].metrics.cpu_percent, 121); assert.equal(result.maps[0].playerCensus, null);
    assert.equal(JSON.stringify(result).includes(file), false, 'transport paths must stay private');
    const viewer = forRole(result, 'viewer'); assert.equal(viewer.maps[0].metrics, undefined); assert.equal(viewer.maps[0].events, undefined);
    for (let sequence = 2; sequence <= 95; sequence++) { payload = { ...value(), sequence }; await write(payload); await service.collect(); }
    result = await service.collect(); assert.equal(result.maps[0].history.length, 90);
    clock += FRESH_MS + 1; result = await service.collect(); assert.equal(result.maps[0].status, 'stale'); assert.equal(result.maps[0].metrics, null);
    payload = { ...value(), sequence: 94 }; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable', 'a prior sequence must not refresh the monitor');
    payload = { ...value(), sequence: 96 }; await write(payload); assert.equal((await service.collect()).maps[0].status, 'connected');
    payload.process.cpu_percent = 55; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable', 'the same sequence cannot mutate');
    processTicks = '54321'; payload = { ...value(), sequence: 97 }; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable', 'PID reuse must reject an obsolete publisher');
    processTicks = '12345'; payload = { ...value(), sequence: 98, instance_id: 'other-map' }; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable');
    payload = { ...value(), sequence: 99 }; payload.lifecycle.recent_events[0].name = 'control\ncharacters'; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable');
    payload = { ...value(), sequence: 100, generated_at_ms: clock + 10000 }; await write(payload); assert.equal((await service.collect()).maps[0].status, 'unavailable', 'future timestamps cannot create fresh data');
    await write({ ...value(), sequence: 101 }); await fs.chmod(file, 0o644); assert.equal((await service.collect()).maps[0].status, 'unavailable');
    await fs.chmod(file, 0o600); const linked = path.join(root, 'linked.json'); await fs.symlink(file, linked); map.monitor_file = linked; clock += 1001;
    assert.equal((await service.collect()).maps[0].status, 'unavailable');
    delete map.monitor_file; assert.equal((await service.collect()).maps[0].status, 'unconfigured');
});

test('monitor stream refreshes permissions, closes revoked sessions and cleans up connection limits', async t => {
    let admin = { id: 'owner', role: 'owner' };
    const app = express();
    installMonitorRoutes(app, { service: { collect: async () => ({ maps: [{ id: 'island', name: 'Island', status: 'connected', metrics: { cpu_percent: 20 }, events: [{ name: 'private' }] }] }) },
        authenticateToken: (req, res, next) => { if (req.headers.authorization !== 'fixture') return res.sendStatus(401); req.user = { id: 'owner', role: 'owner' }; next(); }, resolveAdmin: async () => admin });
    const server = http.createServer(app); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/api/monitor/cluster')).status, 401);
    const stream = await fetch(base + '/api/monitor/stream', { headers: { authorization: 'fixture' } });
    assert.equal(stream.headers.get('x-accel-buffering'), 'no');
    const reader = stream.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value); assert.match(first, /private/);
    admin = { ...admin, role: 'viewer' };
    const next = new TextDecoder().decode((await reader.read()).value); assert.doesNotMatch(next, /private|cpu_percent/);
    admin = null; assert.equal((await reader.read()).done, true, 'revoked sessions must stop receiving live data');
});
