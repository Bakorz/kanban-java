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
  inspected. CI remote result remains pending until the pull request runs.
- Shipped frontend dependency audit: zero findings. Full tooling audit has six
  high development-only flags from upstream picomatch; no registry patch was
  available at verification time. See frontend README; do not describe this as a clean full audit.
- T11: reviewed SQL draft being prepared separately; not applied to Supabase.

The frontend is not yet a working authenticated Kanban application. A health success
checks Java liveness only, never database or authentication readiness.

## Supabase configuration received (not verified remotely)

- Development project reference: `cfvutnxoayzewyqbooml`.
- Browser publishable key supplied by owner; not copied into tracked example files.
- Signing-key type reported: ECC P-256 (ES256).
- Email confirmation: owner selecting setting; guidance provided.
- No authenticated/live project access, role creation, migrations, or synthetic data
  operations have been authorized or performed in this batch.
- Old exposed credentials: owner remediation status unconfirmed; never reused here.

## Next gates

1. Owner confirms email policy and whether frontend runs locally or on an approved remote target.
2. Owner explicitly authorizes this development project's allowed Auth/data operations.
3. Agent writes/reviews SQL; owner executes reviewed SQL through Supabase SQL Editor.
4. Restricted runtime credentials configured privately, separately from migration authority.
5. Agent implements token verification, pooled JDBC, real auth screens, and board vertical slice.
6. Cards/ordering, two-user privacy tests, owner acceptance, then separately approved deployment/release.

All implementation uses work branches → develop; main promotion and deployment
require separate owner approval. A pull request or passing health check is not a release.
