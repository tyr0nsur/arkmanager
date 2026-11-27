// Native monitor transport. The publisher is a managed SDK resource inside ARK;
// only private, bounded snapshots from the configured process are accepted.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readPrivateJson } = require('./hub');
const FRESH_MS = 6500;
const finite = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const counter = value => Number.isSafeInteger(value) && value >= 0;
const digits = value => typeof value === 'string' && /^[0-9]{1,24}$/.test(value);
const text = value => value === null || (typeof value === 'string' && Buffer.byteLength(value) <= 256 && !/[\x00-\x1f\x7f]/.test(value));
async function processIdentity(pid) {
    const handle = await fs.open(`/proc/${pid}/stat`, 'r');
    try {
        const info = await handle.stat();
        if (info.uid !== process.getuid()) throw Error('wrong_process_owner');
        const raw = await handle.readFile('utf8');
        const startTicks = raw.slice(raw.lastIndexOf(')') + 2).trim().split(/\s+/)[19];
        const executable = await fs.readlink(`/proc/${pid}/exe`);
        if (path.basename(executable) !== 'ShooterGameServer') throw Error('wrong_process');
        return startTicks;
    } finally { await handle.close(); }
}
function validate(value, instance, now) {
    if (!value || value.schema !== 'obelisk.monitor.v1' || value.instance_id !== instance ||
        !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(value.resource_version || '') || !Number.isInteger(value.pid) || value.pid < 1 ||
        !digits(value.process_start_ticks) || !counter(value.sequence) || value.sequence === 0 || !counter(value.generated_at_ms) ||
        value.generated_at_ms > now + 1000 || value.player_census !== null || value.game_thread !== null) throw Error('invalid_snapshot');
    const p = value.process, life = value.lifecycle;
    if (!p || !finite(p.cpu_percent, 65536) || !counter(p.rss_bytes) || !finite(p.uptime_seconds, 1e10) ||
        !life || typeof life.available !== 'boolean' || !['login_observations', 'logout_observations', 'dropped_observations'].every(key => counter(life[key])) ||
        !Array.isArray(life.recent_events) || life.recent_events.length > 32 || life.recent_events.some(event =>
            !event || !['login_observed', 'logout_observed'].includes(event.kind) || !digits(event.sequence) || !digits(event.process_epoch) ||
            !counter(event.observed_at_ms) || event.observed_at_ms > value.generated_at_ms + 1000 || !text(event.name) || !text(event.opaque_id))) throw Error('invalid_snapshot');
    return value;
}
function createMonitorService({ getMaps, now = Date.now, identifyProcess = processIdentity } = {}) {
    const states = new Map();
    async function readMap(map) {
        if (!map.monitor_file) return { id: map.id, name: map.name, status: 'unconfigured', metrics: null, history: [], events: [] };
        let state = states.get(map.id);
        if (!state) { state = { history: [], checkedAt: 0 }; states.set(map.id, state); }
        if (state.pending) return state.pending;
        if (state.result && now() - state.checkedAt < 1000) return state.result;
        state.pending = (async () => {
            try {
                const value = validate(await readPrivateJson(map.monitor_file), map.id, now());
                if (await identifyProcess(value.pid) !== value.process_start_ticks) throw Error('obsolete_process');
                const identity = `${value.pid}:${value.process_start_ticks}`;
                const digest = crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
                if (state.identity === identity && (value.sequence < state.sequence || value.generated_at_ms < state.generatedAt ||
                    (value.sequence === state.sequence && digest !== state.digest))) throw Error('snapshot_replayed');
                if (state.identity !== identity) state.history = [];
                const fresh = now() - value.generated_at_ms <= FRESH_MS;
                if (fresh && (state.identity !== identity || value.sequence !== state.sequence)) {
                    state.history.push({ at: value.generated_at_ms, cpu: value.process.cpu_percent, rss: value.process.rss_bytes });
                    if (state.history.length > 90) state.history.shift();
                }
                Object.assign(state, { identity, sequence: value.sequence, generatedAt: value.generated_at_ms, digest });
                state.result = { id: map.id, name: map.name, status: fresh ? 'connected' : 'stale',
                    lastSeenAt: value.generated_at_ms, resourceVersion: value.resource_version,
                    metrics: fresh ? value.process : null, lifecycleAvailable: value.lifecycle.available,
                    counters: { logins: value.lifecycle.login_observations, logouts: value.lifecycle.logout_observations, dropped: value.lifecycle.dropped_observations },
                    events: fresh ? value.lifecycle.recent_events : [], history: state.history.slice(),
                    playerCensus: null, gameThread: null };
            } catch { state.result = { id: map.id, name: map.name, status: 'unavailable', metrics: null, history: [], events: [] }; }
            finally { state.checkedAt = now(); state.pending = null; }
            return state.result;
        })();
        return state.pending;
    }
    async function collect() {
        const maps = getMaps();
        for (const id of states.keys()) if (!maps.some(map => map.id === id)) states.delete(id);
        return { schema: 'obelisk.panel.monitor.v1', observedAt: now(), freshnessMs: FRESH_MS, maps: await Promise.all(maps.map(readMap)) };
    }
    return { collect, readMap };
}
function forRole(snapshot, role) {
    if (['owner', 'operator'].includes(role)) return snapshot;
    return { ...snapshot, maps: snapshot.maps.map(({ id, name, status, lastSeenAt, resourceVersion }) => ({ id, name, status, lastSeenAt, resourceVersion })) };
}
function installMonitorRoutes(app, { service, authenticateToken, resolveAdmin }) {
    const connections = new Map();
    app.get('/api/monitor/cluster', authenticateToken, async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try { res.json(forRole(await service.collect(), req.user.role)); }
        catch { res.status(503).json({ error: 'El monitor del clúster no está disponible' }); }
    });
    app.get('/api/monitor/stream', authenticateToken, (req, res) => {
        const id = req.user.id;
        const total = [...connections.values()].reduce((sum, n) => sum + n, 0);
        if ((connections.get(id) || 0) >= 2 || total >= 32) return res.status(429).json({ error: 'Cierra otra vista del monitor y vuelve a intentarlo' });
        connections.set(id, (connections.get(id) || 0) + 1);
        res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        res.flushHeaders();
        let busy = false, closed = false;
        const publish = async () => {
            if (busy || closed) return;
            busy = true;
            try {
                const admin = await resolveAdmin(req);
                if (!admin) { res.end(); return; }
                const snapshot = forRole(await service.collect(), admin.role);
                if (!closed && !res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`)) res.end();
            } catch { if (!closed) res.end(); }
            finally { busy = false; }
        };
        const timer = setInterval(publish, 2000);
        req.on('close', () => { closed = true; clearInterval(timer); const count = (connections.get(id) || 1) - 1; if (count) connections.set(id, count); else connections.delete(id); });
        publish();
    });
}
module.exports = { createMonitorService, installMonitorRoutes, validate, forRole, FRESH_MS };
