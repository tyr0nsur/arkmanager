// Browser OIDC login into an existing dashboard account. No account is created
// from a display name, email address, Discord tag or game observation.
const crypto = require('node:crypto');
const oidc = require('openid-client');
const { readPrivateJson } = require('./hub');

function createOidcService({ configFile = process.env.OBELISK_OIDC_CONFIG_FILE, test = false, now = Date.now } = {}) {
    const flows = new Map();
    let cached;
    const cookie = test ? 'obelisk-oidc' : '__Host-obelisk-oidc';
    const cookieOptions = { httpOnly: true, secure: !test, sameSite: 'lax', path: '/', maxAge: 300000 };
    async function settings() {
        if (!configFile) return null;
        const value = await readPrivateJson(configFile);
        const issuer = new URL(value.issuer);
        const redirect = new URL(value.redirect_uri);
        if ((!test && (issuer.protocol !== 'https:' || redirect.protocol !== 'https:')) || issuer.search || issuer.hash || issuer.username || issuer.password ||
            redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== '/api/auth/oidc/callback' ||
            typeof value.client_id !== 'string' || !value.client_id || typeof value.client_secret !== 'string' || value.client_secret.length < 24 ||
            value.identity_claim !== 'discord_id') throw new Error('invalid_oidc_settings');
        if (value.backchannel_origin) {
            const back = new URL(value.backchannel_origin);
            if (back.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(back.hostname) || back.pathname !== '/' || back.search || back.hash || back.username || back.password) throw new Error('invalid_backchannel');
        }
        return value;
    }
    const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
    async function configuration(value) {
        const key = fingerprint(value);
        if (cached?.key === key && cached.expires > now()) return cached.config;
        const issuer = new URL(value.issuer);
        const endpointPrefix = issuer.pathname.replace(/\/+$/, '') + '/';
        const fetcher = async (input, init = {}) => {
            const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
            if (url.origin !== issuer.origin || !url.pathname.startsWith(endpointPrefix)) throw new Error('unexpected_oidc_endpoint');
            const headers = new Headers(init.headers);
            if (value.backchannel_origin) {
                const back = new URL(value.backchannel_origin);
                headers.set('host', issuer.host);
                headers.set('x-forwarded-host', issuer.host);
                headers.set('x-forwarded-proto', 'https');
                url.protocol = back.protocol; url.host = back.host;
            }
            return fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(8000) });
        };
        const config = await oidc.discovery(issuer, value.client_id,
            { client_secret: value.client_secret, id_token_signed_response_alg: 'RS256' },
            oidc.ClientSecretPost(value.client_secret), {
                [oidc.customFetch]: fetcher, ...(test ? { execute: [oidc.allowInsecureRequests] } : {}),
            });
        config[oidc.customFetch] = fetcher;
        oidc.enableNonRepudiationChecks(config);
        cached = { key, config, expires: now() + 300000 };
        return config;
    }
    async function start(req, res) {
        if (Object.keys(req.query).length) throw new Error('invalid_query');
        const value = await settings();
        if (!value) throw new Error('oidc_disabled');
        const config = await configuration(value);
        for (const [state, flow] of flows) if (flow.expires <= now()) flows.delete(state);
        if (flows.size >= 200) throw new Error('too_many_login_flows');
        const previous = req.cookies?.[cookie];
        if (typeof previous === 'string') flows.delete(previous);
        const state = oidc.randomState();
        const verifier = oidc.randomPKCECodeVerifier();
        const nonce = oidc.randomNonce();
        const challenge = await oidc.calculatePKCECodeChallenge(verifier);
        const url = oidc.buildAuthorizationUrl(config, { redirect_uri: value.redirect_uri, response_type: 'code', scope: 'openid profile',
            code_challenge: challenge, code_challenge_method: 'S256', state, nonce, kc_idp_hint: 'discord' });
        flows.set(state, { verifier, nonce, expires: now() + 300000, config: fingerprint(value) });
        res.cookie(cookie, state, cookieOptions);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.redirect(303, url.href);
    }
    async function finish(req, res) {
        res.clearCookie(cookie, { ...cookieOptions, maxAge: undefined });
        const value = await settings();
        const state = req.query.state;
        const bound = req.cookies?.[cookie];
        const flow = typeof state === 'string' && flows.get(state);
        if (!value || !flow || typeof bound !== 'string' || bound.length !== state.length ||
            !crypto.timingSafeEqual(Buffer.from(bound), Buffer.from(state))) throw new Error('invalid_login_state');
        flows.delete(state); // A callback can consume its flow only once, even on failure.
        if (flow.expires <= now() || flow.config !== fingerprint(value) || req.originalUrl.length > 8192) throw new Error('expired_login');
        const url = new URL(value.redirect_uri);
        const query = new URL(req.originalUrl, url.origin).searchParams;
        for (const key of query.keys()) if (query.getAll(key).length !== 1) throw new Error('duplicate_callback_parameter');
        url.search = query.toString();
        const tokens = await oidc.authorizationCodeGrant(await configuration(value), url,
            { pkceCodeVerifier: flow.verifier, expectedState: state, expectedNonce: flow.nonce, idTokenExpected: true });
        const claims = tokens.claims();
        if (!claims || typeof claims.sub !== 'string' || !claims.sub ||
            typeof claims.discord_id !== 'string' || !/^[0-9]{17,20}$/.test(claims.discord_id)) throw new Error('account_not_authorized');
        return { discordId: claims.discord_id, subject: claims.sub };
    }
    return { start, finish, enabled: Boolean(configFile) };
}

function installOidcRoutes(app, { readAdmins, recordLogin, auditLog, issueSession, test = false }, options = {}) {
    const service = createOidcService({ ...options, test });
    app.get('/api/auth/providers', (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ discord: service.enabled }); });
    app.get('/api/auth/oidc/start', async (req, res) => {
        try { await service.start(req, res); }
        catch { res.status(503).json({ error: 'El acceso con Discord no está disponible. Vuelve a intentarlo en unos instantes.' }); }
    });
    app.get('/api/auth/oidc/callback', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
        try {
            const result = await service.finish(req, res);
            const admin = recordLogin ? await recordLogin(result) : (await readAdmins()).find(item => item.discordId === result.discordId);
            if (!admin) throw new Error('dashboard_account_removed');
            await auditLog(admin.username, 'OIDC_LOGIN', 'Discord login through the dedicated ARK identity provider');
            issueSession(req, res, admin);
            res.redirect(303, '/#/cluster');
        } catch { res.redirect(303, '/?sso_error=access_denied'); }
    });
    return service;
}
module.exports = { createOidcService, installOidcRoutes };
