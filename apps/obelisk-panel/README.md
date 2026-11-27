# Obelisk Panel

ARK cluster administration panel adapted from [citizenfx/txAdmin](https://github.com/citizenfx/txAdmin). See [upstream provenance](UPSTREAM.md) and the [MIT license](LICENSE).

Start with the [Arkmanager setup guide](../../README.md) to configure the gateway. Start it without OIDC, sign in to its standalone UI with the bootstrap owner and invite a separate owner account with the Discord ID that your provider will attest. The Discord-only flow is enabled when the gateway starts with `OBELISK_OIDC_CONFIG_FILE`.

Configure a Keycloak client with an HTTPS issuer, authorization code flow, PKCE S256, RS256 ID tokens, client secret POST authentication, and a Discord identity provider with the `discord_id` claim in the ID token. Set the exact HTTPS callback on the panel origin. Keep the gateway OIDC configuration file outside the checkout with mode `0600` in an owner-only directory.

```json
{
  "issuer": "https://identity.example.test/realms/arkmanager",
  "client_id": "arkmanager",
  "client_secret": "<your OIDC client secret>",
  "redirect_uri": "https://panel.example.test/api/auth/oidc/callback",
  "identity_claim": "discord_id"
}
```

Set the gateway's production `CORS_ORIGINS` to that panel origin. Run the following from this directory with the gateway listening at the address configured in `OBELISK_GATEWAY_ORIGIN`. Serve the panel at `OBELISK_PUBLIC_URL` through a trusted HTTPS reverse proxy to its loopback listener.

```sh
npm ci --ignore-scripts
npm run build
npm test
NODE_ENV=production OBELISK_PUBLIC_URL=https://panel.example.test \
  OBELISK_GATEWAY_ORIGIN=http://127.0.0.1:3040 npm start
```

Browser tests use a simulated cluster. Set `PLAYWRIGHT_MODULE` to a local Playwright Core installation and `CHROMIUM_EXECUTABLE` to an installed Chromium executable before running `npm run test:browser`.
