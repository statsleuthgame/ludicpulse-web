# Ludic Pulse public site

Static marketing, support, privacy, Terms, Tesla public-key, and OAuth callback
pages for `ludicpulse.com`.

The customer pages are generated from the cloud API's canonical public-page
source so the deployed website and API copy stay aligned:

```bash
cd /Users/codyostler/Projects/Tesla
node node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/cli.mjs \
  apps/cloud-api/scripts/export-public-pages.ts \
  /Users/codyostler/Projects/ludicpulse-web /
```

After regeneration, preserve `CNAME`, `.nojekyll`, `.well-known/`, `auth/`,
`icon.png`, `favicon.png`, and this README.

Shared ETA website gates:

```bash
node --test eta/app.test.js eta/map-model.test.js
MAPKIT_TEST_TOKEN=... node eta/verify-mapkit-browser.mjs
```

The browser gate runs the deployed adapter from the exact `https://ludicpulse.com`
origin against Apple Maps. Use a fresh 15-minute `mapkit_js` token; the script
keeps it in the environment and never prints it.

The OAuth callback intentionally forwards to the legacy API until the clean
`api.ludicpulse.com` endpoint is verified and Tesla's allowed redirect URI is
changed. Do not remove the old `statmask.com` routes while installed beta builds
still reference them.
