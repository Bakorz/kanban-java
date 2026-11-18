# Frontend foundation

React 19.3.1, React DOM 19.3.1, React Router 7.18.5, Vite 8.3.8,
Vite React plugin 6.3.0. Use Node 24.x (verified 24.22.3) and npm 11.x
(verified 11.19.1). Exact direct dependencies and transitive resolutions are
recorded in package.json and package-lock.json.

## Run and verify

From this directory:

```sh
npm ci
npm run dev
# Separate shell; see backend/README.md for starting Java on 127.0.0.1:8080.
# Visit http://127.0.0.1:5173 and click Check connection.
npm test
npm run build
```

The Vite server listens only on `127.0.0.1:5173`, refuses port fallback, and
proxies `/api` to `http://127.0.0.1:8080`. A remote workspace does not make this
URL available on your own computer without a separately approved tunnel or
hosting arrangement. Do not expose Vite as a production server.

`VITE_API_BASE_URL` accepts only `/api` (also the default). Different origins
and alternate paths fail closed. Production hosting must serve the static
build with an SPA fallback and proxy `/api` to Java; do not rewrite API errors
to the frontend document. No production deployment is configured here.

## Honest scaffold, not an implemented product

The dashboard and board preview contain no persisted boards/cards. All account
screens explicitly state that Supabase Auth is not connected. They do not
collect passwords, exchange callback tokens, establish sessions, or claim that
routes are protected. Java must enforce authentication and ownership regardless
of React route guards when those features are implemented.

The health button checks **liveness only**: JSON `status: ok` and
`service: kanban-api`. It neither authenticates nor checks the database.
Requests are bounded to five seconds, omit credentials, and do not follow
redirects. No public health request is made automatically.

Routes: `/dashboard`, `/boards/:boardId` (`preview` is a layout only), `/login`,
`/register`, `/forgot-password`, `/reset-password`, `/auth/reset-password`
(alias), `/auth/callback`, and a not-found screen. `/` redirects to `/dashboard`.
Each route updates the document title and focuses its first heading. The skip
link targets that heading, not a large interactive container.

No live project URL/key is tracked. `.env.example` contains public placeholders
for future Auth work only; all `VITE_*` values are visible in client bundles.

## Browser tests

Vitest 5.1.0 + Testing Library 16.3.3 + jsdom 31.0.1 run unit/component tests.
Playwright 1.65.1 runs actual Chromium desktop and mobile viewport checks:

```sh
# Local browser download; no system install is needed.
PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" npm run test:e2e
```

Playwright starts and stops its own temporary loopback Vite server. Stop other
servers on port 5173 first; the config intentionally does not reuse them.
Default browser tests mock only the public health response and test success,
invalid-JSON-content errors, retry, route focus, keyboard skip navigation,
mobile reflow, and screenshots under ignored `.tools/screenshots/`.

For an actual Java → Vite proxy → browser health verification, start the Java
backend on 8080 separately, then run:

```sh
KANBAN_E2E_REAL_API=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" npm run test:e2e
```

This leaves health network requests unmocked; the mock-specific failure case
is skipped. No Supabase access is needed. Stop the backend afterward.

If your npm home cache is not writable, prefix npm/npx commands with
`NPM_CONFIG_CACHE=/tmp/kanban-npm-cache`; do not change ownership of a shared
home directory.

## Dependency audit limitation (2026-11-18)

`npm audit --omit=dev` reports zero vulnerabilities. The full audit reports six
high development dependency flags originating from picomatch 4.0.7
([GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
regular-expression denial of service when processing malicious glob patterns).
The npm registry currently offers no patched picomatch release; 4.0.7 is the
latest and is within the advisory's affected range. Do not blindly run
`npm audit fix --force`, which proposes downgrading the Vite/Vitest toolchain.
Keep development tooling loopback-only, do not supply untrusted glob patterns,
and update/retest the lockfile when an upstream patch is published. This is a
known unresolved tooling advisory, not a clean full dependency audit.
