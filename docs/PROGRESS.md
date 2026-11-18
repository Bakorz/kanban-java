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

The frontend is not yet a working authenticated Kanban application. A health success
checks Java liveness only, never database or authentication readiness.

## Supabase configuration received (not verified remotely)

- Development project reference: `cfvutnxoayzewyqbooml`.
- Browser publishable key supplied by owner; not copied into tracked example files.
- Signing-key type reported: ECC P-256 (ES256).
- Email confirmation: owner reports OFF for disposable development only.
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
