# Ludic Pulse — Web

The public website and web apps for **Ludic Pulse**, an iPhone app for Tesla
owners that brings vehicle status, drives, charging, efficiency, Live
Activities, and private Shared ETA into one focused app.

**Live:** [ludicpulse.com](https://ludicpulse.com)

<!-- Add a screenshot of the marketing homepage or the Shared ETA map view here. -->

---

## What's in this repo

This is the static frontend — the marketing site plus two self-contained web
apps — deployed on Vercel. The iOS app and cloud API live elsewhere.

| Path | Purpose |
|---|---|
| `index.html`, `pulse/`, `hub/` | Marketing homepage and product pages |
| `beta/`, `beta/thanks/` | Private beta signup flow |
| `eta/` | **Shared ETA** web app — follow a private live trip in the browser, no app or sign-in required (Apple MapKit JS) |
| `auth/tesla/` | Tesla OAuth callback for account linking |
| `support/`, `privacy/`, `terms/` | Customer and legal pages |
| `.well-known/` | Tesla third-party public-key path |
| `styles.css`, `site.js`, `analytics.js`, `assets/` | Shared styling, behavior, and assets |
| `tests/`, `eta/*.test.js` | Test suite |
| `vercel.json` | Routing + response security headers |

## Highlights

- **Shipped product** on a custom domain with automated Vercel deploys from `main`.
- **Production-grade security headers** (`vercel.json`): strict Content-Security-Policy with script hashes, HSTS, `X-Frame-Options: DENY`, Cross-Origin-Opener-Policy, Referrer-Policy, and a locked-down Permissions-Policy.
- **Shared ETA web app** (`eta/`) — a dependency-light client app built around Apple MapKit JS with a separated map model and a state worker, so a recipient can watch a live trip from a link with no install and no account.
- **Tested** — accessibility, content, and page checks under `tests/`, plus unit tests for the Shared ETA app, map model, and state worker.
- **Privacy-conscious analytics** — anonymous page views only; the Shared ETA and OAuth callback pages load no analytics.

## Tech

Static HTML/CSS/vanilla JS · Apple MapKit JS (Shared ETA) · Vercel hosting +
edge headers · Node's built-in test runner. No build step — the site is served
as authored.

## Local development

It's a static site — serve the repo root with any static file server:

```bash
# Python
python3 -m http.server 8000
# or Node
npx serve .
```

Then open `http://localhost:8000`.

Run the tests with Node's built-in runner:

```bash
node --test tests/*.test.mjs eta/*.test.js
```

## Deployment

Deployed on Vercel; pushes to `main` publish automatically. `vercel.json`
defines redirects/rewrites and the response security headers. `CNAME` and
`.nojekyll` are retained for compatibility.
