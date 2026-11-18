# Handoff — 2026-11-18

Resumed after an owner-requested pause. The two review findings below are fixed and
locally reverified; live Supabase acceptance is still pending. Persisted goal is active.
Do not deploy or promote to `main` without separate owner approval.

## Repository

- Work branch: `feat/application-foundation`; PR #5 targets `develop`.
- `main` unchanged; no deployment or production promotion.
- Original Spring Boot project untouched.
- Core backend committed as `357d52d`: clean package passed **43 tests**, zero skips,
  using the real restricted `kanban_runtime` role against isolated PostgreSQL.
- Frontend fix checkpoint adds synchronous auth-scope guarding and the saved-mutation
  regression.

## Verified evidence

- Database schema/grants/cascades/ordering checks passed locally and in schema CI.
- Backend JWT/JSON/config/AuthFilter/CRUD/ownership/concurrency/rollback tests pass43.
- Browser UI → Java → PostgreSQL lifecycle passed desktop/mobile **2 tests** with
  synthetic Auth. That browser run preceded the restricted-role fixture change;
  repeat it once final frontend fixes are reviewed.
- Frontend final verification: unit **48/48**, production build, browser **12** mocked
  tests, and **2** real desktop/mobile CRUD tests against Java + PostgreSQL passed.
  Build still warns of a ~502kB chunk.
- Review finding1 (delayed A 401 signing out B): RESOLVED in code by a synchronous
  auth-scope ref updated in SDK callbacks before React renders; API requests capture
  the starting scope and discard stale responses. Regression tests cover delayed 401
  after scope change and SDK A→B switch with old A 401.
- Review finding2 (committed create replayable after refresh failure): RESOLVED; editors
  and confirmations close immediately after a successful mutation, reload failure is
  shown separately, and retry reloads only. POST201→GET503 regression passes.
- Reviewer verification of these two fixes is requested; parent tests pass regardless.
- Public JWKS is available with ES256/P-256 keys. Public Auth settings last reported
  `mailer_autoconfirm:false`, despite owner selecting confirmation OFF. Owner was
  asked to save/recheck that setting. No live accounts were created.

## Review findings

Both material findings from the independent read-only review are fixed and covered by
regression tests (see Verified evidence). Reviewer `5a23e138-8adb-41e2-9a6f-b78b3e05c015`
was asked for a focused resolution check; it does not execute code.
No implementation agent is currently running.

## Owner choices/access

- Personal MVP, one-day deadline, solo, teacher-approved stack, English, DnD optional.
- Demo on owner's computer (localhost5173), not this remote host.
- Dev project `cfvutnxoayzewyqbooml`; disposable Auth accounts/synthetic app data testing
  authorized after owner-run migrations/private runtime setup.
- Owner executes reviewed001/002 SQL; no agent migration authority or admin secrets.
- No confirmation of executed live migrations or private runtime credentials yet.
- Do not request passwords/tokens/service-role keys in chat or commit real env files.

## Resume order (current position: step 5 complete locally)

1. Inspect Git status/lastcommit and agent reports; do not assume narrated results. DONE
2. Review frontend synchronous auth scope + committed-save refresh regression fixes. DONE
3. Run frontend unit/build/audit/browser suite and realCRUD browser mode again. DONE (48/12/2, audit0)
4. Recheck test container/server cleanup, stage secret/whitespace scan, push checkpoint. DONE
5. Check full PR CI. IN PROGRESS for the latest fix commit.
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
