# Ludic Technologies public site

Static company marketing, Ludic Hub, support, privacy, Terms, Tesla public-key,
OAuth callback, and Shared ETA pages for `ludicpulse.com`.

Production is delivered by the Vercel project `ludicpulse-web`. GitHub `main`
is connected for automatic deployments; `vercel.json` supplies HSTS, response
CSP, framing protection, Permissions-Policy, referrer policy, MIME protection,
and explicit cache behavior. The tracked GitHub workflow runs the requirement
tests; `CNAME` and `.nojekyll` remain compatibility metadata, not evidence of a
current Pages deployment workflow. Public DNS points to Vercel. Do not remove or weaken the
response headers without rerunning the bounded production security audit.

The company homepage, `/pulse/`, `/hub/`, and `/beta/` are maintained directly in this repository.
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
`pulse/`, `hub/`, `beta/`, `assets/`, `styles.css`, `site.js`, `analytics.js`, `social-card.png`, `icon.png`,
`favicon.png`, and this README. Review regenerated root, support, privacy, and
Terms pages before committing so the shared company navigation remains intact.
The Pulse app-icon files remain release assets only; public HTML must not
reference or display them.

## Launch analytics

Vercel Web Analytics is intentionally limited to anonymous page views on the
marketing, support, legal, and private-beta pages. The Shared ETA recipient and
Tesla callback pages do not load analytics. Use `https://ludicpulse.com/teaser/`
for launch-post traffic, `/beta/` for signup intent, and `/beta/thanks/` for
completed requests. The Vercel Hobby plan reports pages, referrers, countries,
devices, browsers, and operating systems; custom events and UTM panels require a
paid analytics plan. Web Analytics was enabled for the production project on
September 1, 2026.

Shared ETA website gates:

```bash
node --test tests/*.test.mjs eta/*.test.js
node --check site.js && node --check eta/app.js && node --check eta/map-model.js && node --check eta/state-worker.js
MAPKIT_TEST_TOKEN=... node eta/verify-mapkit-browser.mjs
```

The browser gate runs the deployed adapter from the exact `https://ludicpulse.com`
origin against Apple Maps. Use a fresh 15-minute `mapkit_js` token; the script
keeps it in the environment and never prints it.

The OAuth callback intentionally forwards to the legacy API until the clean
`api.ludicpulse.com` endpoint is verified and Tesla's allowed redirect URI is
changed. Do not remove the old `statmask.com` routes while installed beta builds
still reference them.

## Source and route map

| Location | Responsibility |
| --- | --- |
| `index.html`, `pulse/`, `hub/`, `beta/`, `beta/thanks/` | Public product pages and signup journey |
| `support/`, `privacy/`, `terms/` | Customer pages aligned with the canonical cloud public-page source |
| `eta/` | Self-contained Shared ETA recipient, model, worker and colocated tests |
| `auth/tesla/`, `.well-known/appspecific/` | Installed OAuth callback and Tesla public-key compatibility paths |
| Root JavaScript/CSS and `assets/` | Shared behavior, styling and approved public assets |
| `tests/`, `.github/workflows/`, `vercel.json` | Source-level verification and routing/response policy |

These physical names are public URL contracts. Do not move them merely to add
`src/` or `public/` conventions. Some local `.vercel/output/static/` files are
hard-linked to source files; generated output is not an independent backup and
must not be edited as one. Environment and Vercel connection files remain local.

The canonical checkout on this Mac is `/Users/codyostler/Projects/ludicpulse-web`.
The older Desktop checkout was preserved separately; it is not the default
editing or deployment source. The September 6 organization changes this README
only; application files and public routes are unchanged. Publishing follows the
configured Git deployment pipeline. Verify the resulting deployment or skip and
record its actual state in Notion; this README is excluded by `.vercelignore`.
