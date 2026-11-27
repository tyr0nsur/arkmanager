const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { installOidcRoutes } = require('../oidc');

for (const issuerPath of ['', '/realm']) {
    test('dedicated OIDC (' + (issuerPath || '/') + ') validates signatures, issuer, audience, nonce, PKCE, browser binding, Discord invitation and single use', async t => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obelisk-oidc-'));
        await fs.chmod(root, 0o700);
        const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
        const publicKey = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'fixture', alg: 'RS256', use: 'sig' };
        let issuer, provider, application, base, mode = 'ok', nonce, challenge, tokenRequests = 0, clock = Date.now();
        let adminExists = true, issued = 0, audited = 0;
        const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        provider = http.createServer(async (req, res) => {
            res.setHeader('content-type', 'application/json');
            if (req.url === issuerPath + '/.well-known/openid-configuration') return res.end(JSON.stringify({ issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/certs', response_types_supported: ['code'], code_challenge_methods_supported: ['S256'], id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_post'] }));
            if (req.url === issuerPath + '/certs') return res.end(JSON.stringify({ keys: [publicKey] }));
            if (req.url !== issuerPath + '/token') { res.statusCode = 404; return res.end('{}'); }
            tokenRequests++;
            let data = ''; for await (const chunk of req) data += chunk;
            const body = new URLSearchParams(data);
            assert.equal(body.get('client_id'), 'panel-fixture');
            assert.equal(body.get('client_secret'), 'fixture-client-secret-more-than-24-bytes');
            assert.equal(crypto.createHash('sha256').update(body.get('code_verifier')).digest('base64url'), challenge);
            const claims = { sub: 'immutable-keycloak-subject', nonce: mode === 'nonce' ? 'wrong' : nonce, discord_id: mode === 'identity' ? 'spoofed-name' : mode === 'uninvited' ? '999999999999999999' : '100000000000000001' };
            const token = jwt.sign(claims, mode === 'signature' ? other.privateKey : keys.privateKey, { algorithm: 'RS256', keyid: 'fixture', issuer: mode === 'issuer' ? issuer + '/wrong' : issuer, audience: mode === 'audience' ? 'wrong-client' : 'panel-fixture', expiresIn: 60 });
            res.end(JSON.stringify({ token_type: 'Bearer', access_token: 'fixture-access-token', ...(mode === 'missing_id_token' ? {} : { id_token: token }) }));
        });
        await listen(provider); issuer = `http://127.0.0.1:${provider.address().port}${issuerPath}`;
        const app = express(); app.use(cookieParser());
        const configFile = path.join(root, 'oidc.json');
        const service = installOidcRoutes(app, {
            test: true,
            readAdmins: async () => adminExists ? [{ id: 'existing-owner', username: 'owner', discordId: '100000000000000001' }] : [],
            auditLog: async () => { audited++; },
            issueSession: (req, res, admin) => { issued++; assert.equal(admin.id, 'existing-owner'); res.cookie('session', 'fixture-session'); },
        }, { configFile, now: () => clock });
        assert.equal(service.enabled, true);
        application = http.createServer(app); await listen(application);
        base = `http://127.0.0.1:${application.address().port}`;
        const settings = { issuer, client_id: 'panel-fixture', client_secret: 'fixture-client-secret-more-than-24-bytes', redirect_uri: base + '/api/auth/oidc/callback', identity_claim: 'discord_id' };
        await fs.writeFile(configFile, JSON.stringify(settings), { mode: 0o600 });
        t.after(async () => { application.closeAllConnections(); provider.closeAllConnections(); await Promise.all([new Promise(resolve => application.close(resolve)), new Promise(resolve => provider.close(resolve))]); await fs.rm(root, { recursive: true, force: true }); });
        const request = (url, cookie) => fetch(base + url, { redirect: 'manual', headers: cookie ? { cookie } : {} });
        async function start() {
            const response = await request('/api/auth/oidc/start');
            assert.equal(response.status, 303);
            const url = new URL(response.headers.get('location'));
            assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
            assert.equal(url.searchParams.get('redirect_uri'), settings.redirect_uri);
            assert.equal(url.searchParams.get('kc_idp_hint'), 'discord');
            nonce = url.searchParams.get('nonce'); challenge = url.searchParams.get('code_challenge');
            assert.ok(nonce && challenge);
            return { state: url.searchParams.get('state'), cookie: response.headers.getSetCookie()[0].split(';')[0] };
        }
        const callback = flow => '/api/auth/oidc/callback?code=fixture-code&state=' + flow.state;
        let flow = await start();
        const previousRequests = tokenRequests;
        assert.equal((await request(callback(flow))).headers.get('location'), '/?sso_error=access_denied');
        assert.equal(tokenRequests, previousRequests, 'unbound callbacks must never exchange a code');
        const success = await request(callback(flow), flow.cookie);
        assert.equal(success.headers.get('location'), '/#/cluster');
        assert.equal(issued, 1); assert.equal(audited, 1);
        assert.ok(success.headers.getSetCookie().some(value => value.startsWith('session=')));
        assert.equal((await request(callback(flow), flow.cookie)).headers.get('location'), '/?sso_error=access_denied');
        assert.equal(issued, 1);
        for (mode of ['signature', 'issuer', 'audience', 'nonce', 'identity', 'uninvited', 'missing_id_token']) {
            flow = await start();
            const result = await request(callback(flow), flow.cookie);
            assert.equal(result.headers.get('location'), '/?sso_error=access_denied', mode);
            assert.equal(issued, 1, mode + ' must not issue a session');
        }
        mode = 'ok'; flow = await start(); clock += 300001;
        assert.equal((await request(callback(flow), flow.cookie)).headers.get('location'), '/?sso_error=access_denied');
        clock = Date.now(); flow = await start();
        assert.equal((await request(callback(flow) + '&state=duplicate', flow.cookie)).headers.get('location'), '/?sso_error=access_denied');
        flow = await start(); adminExists = false;
        assert.equal((await request(callback(flow), flow.cookie)).headers.get('location'), '/?sso_error=access_denied');
        assert.equal(issued, 1);
        assert.equal((await request('/api/auth/oidc/start?issuer=http://attacker')).status, 503);
        await fs.chmod(configFile, 0o644);
        assert.equal((await request('/api/auth/oidc/start')).status, 503, 'publicly readable configuration must reject');
    });
}
