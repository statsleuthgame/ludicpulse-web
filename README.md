# Ludic Technologies public site

Static company marketing, Ludic Hub, support, privacy, Terms, Tesla public-key,
OAuth callback, and Shared ETA pages for `ludicpulse.com`.

The company homepage and `/hub/` are maintained directly in this repository.
The approved wordmark and Pulse screenshots live in `assets/`; do not redraw the
wordmark or replace it with generated lettering.

The customer pages are generated from the cloud API's canonical public-page
source so the deployed website and API copy stay aligned:

```bash
cd /Users/codyostler/Projects/Tesla
node node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/cli.mjs \
  apps/cloud-api/scripts/export-public-pages.ts \
  /Users/codyostler/Projects/ludicpulse-web /
```

After regeneration, preserve `CNAME`, `.nojekyll`, `.well-known/`, `auth/`,
`hub/`, `assets/`, `styles.css`, `site.js`, `social-card.png`, `icon.png`,
`favicon.png`, and this README. Review regenerated root, support, privacy, and
Terms pages before committing so the shared company navigation remains intact.

Shared ETA website gates:

```bash
node --test tests/site.test.mjs eta/app.test.js eta/map-model.test.js
node --check site.js
MAPKIT_TEST_TOKEN=... node eta/verify-mapkit-browser.mjs
```

The browser gate runs the deployed adapter from the exact `https://ludicpulse.com`
origin against Apple Maps. Use a fresh 15-minute `mapkit_js` token; the script
keeps it in the environment and never prints it.

The OAuth callback intentionally forwards to the legacy API until the clean
`api.ludicpulse.com` endpoint is verified and Tesla's allowed redirect URI is
changed. Do not remove the old `statmask.com` routes while installed beta builds
still reference them.
