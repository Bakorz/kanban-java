# Paused handoff — 2026-11-18

Owner explicitly asked to stop to conserve tokens and continue later. Persisted
goal is PAUSED. Do not restart tests, agents, live operations or releases until
owner asks to continue.

## Repository

- Work branch: `feat/application-foundation`; PR #5 targets `develop`.
- `main` unchanged; no deployment or production promotion.
- Original Spring Boot project untouched.
- Core backend committed as `357d52d`: clean package passed **43 tests**, zero skips,
  using the real restricted `kanban_runtime` role against isolated PostgreSQL.
- Schema and local setup already pushed; current core frontend checkpoint must be
  treated as work in progress until its final regression run/review is complete.

## Verified evidence

- Database schema/grants/cascades/ordering checks passed locally and in schema CI.
- Backend JWT/JSON/config/AuthFilter/CRUD/ownership/concurrency/rollback tests pass43.
- Browser UI → Java → PostgreSQL lifecycle passed desktop/mobile **2 tests** with
  synthetic Auth. That browser run preceded the restricted-role fixture change;
  repeat it once final frontend fixes are reviewed.
- Frontend final agent report: unit **47/47**, production build, browser **12 tests**
  passed (2 realCRUD tests intentionally skipped in mock suite). Includes SDK PKCE,
  pending controls, saved-but-refresh-failed regression. Build warns of ~501.84kB chunk.
  Agent collected all its jobs and confirmed none running. Parent has not rerun this
  latest47-test checkpoint; earlier41-test and realCRUD runs were parent-verified.
- IMPORTANT open bug confirmed by frontend agent: request scope still updates via
  render/unmount, NOT synchronous SDK identity ref. The pre-React-commit microtask
  account-switch race remains. Fix it before declaring review finding1 resolved.
- Public JWKS is available with ES256/P-256 keys. Public Auth settings last reported
  `mailer_autoconfirm:false`, despite owner selecting confirmation OFF. Owner was
  asked to save/recheck that setting. No live accounts were created.

## Review findings needing final resolution check

Read-only reviewer identified:
1. Delayed account-A request401 could clear/sign out newly switched accountB.
   Frontend is adding request-scope guards and regression tests. Ensure scope changes
   synchronously with SDK auth events, not only after React renders/unmounts.
2. Successful create followed by failed GET refresh could leave a replayable form.
   Frontend is closing committed editors/confirmations before refresh and showing a
   separate saved-but-refresh-failed state. Verify POST201→GET503 cannot duplicatePOST.

Reviewer agent `5a23e138-8adb-41e2-9a6f-b78b3e05c015` can verify only these fixes later.
Backend agent `ced3f44d-c0a8-4919-9264-e34ef6671b98` finished; frontend agent
`8b11d2a8-fe6c-4818-8c35-adfa86063a00` was instructed to stop and collect/cancel jobs.
No additional feature work should run while paused.

## Owner choices/access

- Personal MVP, one-day deadline, solo, teacher-approved stack, English, DnD optional.
- Demo on owner's computer (localhost5173), not this remote host.
- Dev project `cfvutnxoayzewyqbooml`; disposable Auth accounts/synthetic app data testing
  authorized after owner-run migrations/private runtime setup.
- Owner executes reviewed001/002 SQL; no agent migration authority or admin secrets.
- No confirmation of executed live migrations or private runtime credentials yet.
- Do not request passwords/tokens/service-role keys in chat or commit real env files.

## Resume order

1. Inspect Git status/lastcommit and agent final reports; do not assume narrated results.
2. Review frontend synchronous auth scope + committed-save refresh regression fixes.
3. Run frontend unit/build/audit/browser suite and realCRUD browser mode again.
4. Recheck test container/server cleanup, stage secret/whitespace scan, push checkpoint.
5. Check full PR CI (green older foundation is not evidence for new core changes).
6. Owner confirms migrations/settings; privately configure restricted runtime connection
   and frontend public values on own computer. Verify actual Supabase login/two-user
   privacy/TLS/recovery; these are NOT yet accepted.
7. Merge only through develop after validation; main requires separate approval.

Commands on implementation host (from repo root):

```bash
export NPM_CONFIG_CACHE=/tmp/kanban-npm-cache
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright"
export MVN=/home/bakorz/.local/bin/mvn
export MAVEN_REPO_LOCAL="$PWD/backend/.m2"
npm test --prefix frontend
npm run build --prefix frontend
npm audit --omit=dev --prefix frontend
npm run test:e2e --prefix frontend
node scripts/verify-foundation.mjs --crud
```

Child shells sometimes fail ENOENT landlock-run; main session explicit workspace-write
bash works. Do not repair DSH as a side effect. Keep full audit dev-only advisory honest.
