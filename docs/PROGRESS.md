# Implementation progress

## Approved scope — 2026-11-18

Owner approved the personal-board MVP, one-day deadline, solo team, English UI,
and React + Java Servlets + JDBC + Supabase stack (teacher accepted).
Drag-and-drop is optional. No existing data must be preserved. The new clean
repository is the implementation destination; the previous project stays untouched.
Owner approved a straightforward responsive workspace with readable boards,
keyboard-usable controls, and no decorative animation or branding exercise.

## Foundation batch

- T01/T02: decisions recorded above; destination established.
- T05: frontend/backend layout and exclusions implemented; database draft in progress.
- T06: Java release 21, Tomcat 11.0.29 / Servlet 6.1; build JDK 26.0.2 and Maven 3.10.1.
  Node 24.22.3; exact frontend dependencies in the tracked lockfile.
- T07: public React route placeholders and a three-column preview; no fake login or persistence.
- T08: real Servlet WAR, lifecycle listener, public JSON liveness, deny-by-default API boundary.
- T09: unit/component/container/browser tests and credential-free CI added.
  Local verification: 34 frontend tests, 7 backend tests, frontend production build,
  6 mock-network browser checks, and 4 real-Java browser checks passed (2 mock-only
  error cases intentionally skipped in real-Java mode). Desktop/mobile screenshots
  inspected. PR #5 application CI and branch-flow checks passed for foundation
  commit `39d283d`, including JDK 21 execution. Later changes need their own CI run.
- Shipped frontend dependency audit: zero findings. Full tooling audit has six
  high development-only flags from upstream picomatch; no registry patch was
  available at verification time. See frontend README; do not describe this as a clean full audit.
- T11: schema and restricted-runtime-role SQL drafts written; isolated PostgreSQL
  verification passed, including constraints, nullable clearing, role grants,
  browser denial, deferred reorder, rollback, and cascades. Not applied to Supabase.

## Core implementation verification (in progress)

- Supabase SDK-only auth provider, guarded routes, login/registration/recovery,
  same-origin API client, board/card forms and keyboard move controls implemented.
- Java ES256 verifier, bounded JWKS transport/cache, strict JSON/routes, lazy JDBC pool,
  ownership predicates, CRUD, board locking, dense ordering, and rollback implemented.
- Local clean backend package passed 43 tests with zero skips, including actual
  PostgreSQL/HTTP CRUD as the restricted runtime role, two-user isolation,
  concurrency, mid-move rollback, and consistent snapshots.
- Browser-to-real-Java/PostgreSQL CRUD passed on desktop and mobile with synthetic
  Auth only. Reload, nullable clearing, movement and deletion were exercised.
- The test pool now uses `kanban_runtime` with the authoritative grants/RLS;
  migration/bootstrap/trigger DDL use a separate test-only administrator connection.
  The container readiness race was fixed by probing its published loopback JDBC
  endpoint with a bounded deadline. Restricted-role denial assertions pass.
- Paused at owner's request. Frontend agent reports47 unit tests/build and12 mocked
  browser tests pass; saved-but-refresh-failed regression is fixed. A synchronous
  SDK-account-switch microtask race remains OPEN; current render-time scope guard
  is not sufficient. Do not release this checkpoint as fully reviewed.
- See HANDOFF.md for exact resume steps. No implementation agents/jobs remain running.

These are local fixture-based results, not a completed live Supabase demo.
A health success checks Java liveness only, never database/auth readiness.

## Supabase development configuration

- Development project reference: `cfvutnxoayzewyqbooml`.
- Browser publishable key supplied by owner; not copied into tracked example files.
- Signing-key type: ECC P-256 (ES256). Public JWKS endpoint returned HTTP 200
  with ES256/P-256 verification keys after development access was authorized.
  This verifies key availability, not sign-in or database connectivity.
- Email confirmation: owner selected OFF for disposable development only.
  A public Auth settings check subsequently reported `mailer_autoconfirm: false`;
  the owner was asked to save the setting again. No live accounts were created.
  Email/password provider and public signup are enabled.
- Owner authorizes Auth testing with disposable accounts and synthetic boards/cards
  in this development project after owner-run migrations/private runtime setup.
- Demo target: owner's computer; localhost frontend/auth callback URLs, not a public host.
- Agent has not executed live migrations, created roles, or performed live test data operations.
  No migration authority credentials will be placed in the app.
- Old exposed credentials: owner remediation status unconfirmed; never reused here.

## Next gates

1. Owner reviews and executes the SQL through the development Supabase SQL Editor.
2. Restricted runtime credentials configured privately, separately from migration authority.
3. Agent finishes/reviews token verification, pooled JDBC, Servlet CRUD, real auth screens,
   and board/card UI; current implementation is work in progress until tested.
4. Run local fixture-key/PostgreSQL tests, then authorized real-project Auth/data checks.
5. Owner runs the local course demo and accepts the release; main promotion remains separate.

All implementation uses work branches → develop; main promotion and deployment
require separate owner approval. A pull request or passing health check is not a release.
