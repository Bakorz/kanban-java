# Personal Kanban frontend

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
# Visit http://127.0.0.1:5173/ for the public landing page.
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

## Authentication and saved work

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in an ignored
local environment file, then restart Vite. Use a public/publishable key, never a
service-role key. Without both settings the application makes no Auth calls and
displays setup instructions; `/` remains public. No live project URL/key
is tracked, and all `VITE_*` values are visible in client bundles.

Supabase SDK owns PKCE callback exchange, session persistence, refresh and logout.
The provider unsubscribes on unmount and invalidates user-scoped views on identity
changes or logout. Signup supports both immediate sessions and email confirmation
with a null session. Recovery responses are neutral; password updates require an
SDK `PASSWORD_RECOVERY` event, never an arbitrary signed-in session. Recovery
permission is intentionally memory-only: after reloading an already-consumed
recovery URL, request a fresh recovery link. Configure the provider's allowed
redirect URLs for `/auth/callback` and `/reset-password` on the application's
actual origin. Do not log callback parameters or tokens.

`/dashboard` and `/boards/:boardId` require a session. Boards can be created,
opened, renamed and deleted (with a cascade warning). Cards support title,
optional description, LOW/MEDIUM/HIGH priority, date-only due date, editing,
deleting and keyboard-usable column/up/down movement. Blank descriptions/dates
are sent as null; dates are never converted to timestamps. Successful mutations
close their editor/confirmation immediately and reload canonical API state; if that
reload fails, the UI says the change was saved and offers a reload-only retry, so a
committed create cannot be replayed as a duplicate. Native forms supply labels,
autocomplete, length constraints, pending locks and structured server field errors.
Mobile columns stack vertically rather than requiring horizontal page scrolling.

Private requests go only to same-origin `/api`, use SDK bearer tokens, omit
cookies, reject redirects, disable caches and have finite timeouts. GET after a
401 may refresh and retry once; mutations are never automatically retried. Each
request captures the synchronously maintained auth scope before its first await,
so a delayed response from a previous account is discarded instead of refreshing
or signing out the newly active account. Java must independently enforce JWT
verification and ownership; route guards are not an authorization boundary.
No drag-and-drop, sharing or production deployment is included.

The Java health endpoint at `/api/health` checks **liveness only**: JSON
`status: ok` and `service: kanban-api`. It neither authenticates nor checks the
database. Requests are bounded to five seconds, omit credentials, and do not
follow redirects. The public landing page does not call it automatically.

Routes: `/` (public landing page), `/preview` (redirects to `/`), `/dashboard`,
`/boards/:boardId`, `/login`, `/register`, `/forgot-password`, `/reset-password`,
`/auth/reset-password` (alias), `/auth/callback`, and a not-found screen.
Sign-in, registration and recovery share one centred card on a pale blue field;
Google sign-in is a visible, disabled placeholder until an OAuth provider is
configured. Workspace routes update the document title and focus their first
heading. The landing page sets its own title and keeps the skip link as the
first stop. The skip link targets the main content, not a large interactive
container.

The repository environment example contains placeholders only. Never commit a
real project configuration or credentials.

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
Default browser tests use a synthetic, non-secret Auth endpoint configured only
by Playwright. They intercept SDK HTTP responses and the Java API. There is no
production fixture flag, injected session storage, custom JWT implementation or
live Supabase access. They exercise public health/error/retry, SDK login, signup
confirmation, actual SDK-generated PKCE recovery exchange, card/board CRUD,
null clearing, keyboard moves/focus, mobile reflow and logout. Screenshots are
saved under ignored `.tools/screenshots/`. Unit tests mock SDK/fetch directly and
cover cleanup, identity invalidation, initial loading/guards, bounded 401 retry,
no mutation retry, request/SDK timeouts and server field errors.

For an actual Java → Vite proxy → browser health verification, start the Java
backend on 8080 separately, then run:

```sh
KANBAN_E2E_REAL_API=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" npm run test:e2e
```

This leaves health network requests unmocked; mock-specific application/failure
cases are skipped. No Supabase access is needed. Stop the backend afterward.

For real saved-data browser integration, start the backend's isolated E2E fixture
(which produces ignored `backend/target/e2e-session.json`), then run:

```sh
KANBAN_E2E_REAL_CRUD=1 PLAYWRIGHT_BROWSERS_PATH="$PWD/../.tools/playwright" npx playwright test real-crud.spec.js
```

Do not also set `KANBAN_E2E_REAL_API`: the CRUD fixture intentionally keeps the
synthetic SDK endpoint but does **not** intercept any `/api` requests. Java verifies
the fixture's signed token against its local fixture issuer. The browser creates
unique per-project boards, verifies persistence across reloads, clears nullable
fields, moves cards, renames and deletes records through Java/PostgreSQL. This is
not evidence of a live Supabase sign-in or production deployment. Parent integration
verification passed this flow in both desktop and mobile Chromium; the normal
suite skips it unless explicitly enabled.

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
