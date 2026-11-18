# Kanban Servlet API

Layered Jakarta Servlet + JDBC application packaged as a WAR. Supabase manages identity;
Java verifies asymmetric JWTs and handles every board/card operation. No Spring, JPA,
custom password system, Java session, or browser Data API path is used.

## Pinned versions

See [Maven configuration](<pom.xml>): Java **21** bytecode (`--release 21`, no previews),
Tomcat **11.0.29**, Servlet **6.1.0** provided by the container, Nimbus JOSE JWT **10.10**,
Jackson **2.23.0**, HikariCP **7.1.0**, PostgreSQL JDBC **42.7.14**, SLF4J NOP **2.0.17**,
JUnit Jupiter **6.1.3**. Embedded Tomcat is test/dev scope only.

The development environment builds on JDK **26.0.2** and Maven **3.10.1**. Execution on
an actual Java 21 VM remains a separate runtime-matrix check; Java 21 compatibility is
compiler-enforced. Isolated database tests use PostgreSQL **17.7 Alpine**.

## Build and test

From this directory (the local Maven cache is ignored):

```bash
/home/bakorz/.local/bin/mvn -B -ntp -Dmaven.repo.local="$PWD/.m2" test
/home/bakorz/.local/bin/mvn -B -ntp -Dmaven.repo.local="$PWD/.m2" package
```

Both commands run every unit, real Tomcat HTTP, and real PostgreSQL integration test.
Docker must be available and `postgres:17.7-alpine` cached or pullable. Tests **do not
silently skip** when Docker is missing. They create a uniquely named disposable container,
bind PostgreSQL to **127.0.0.1 on a random port**, apply both authoritative migrations and
minimal synthetic auth fixtures as a separate administrator, and remove the container on
completion/failure. Every service/HTTP/browser operation uses the actual restricted
`kanban_runtime` role with RLS enabled, not the migration superuser. Tests also assert that
this role cannot bypass RLS, read authentication/migration tables, create schema objects,
or directly delete fixed columns. Only injected failure-trigger DDL uses a test-only admin
connection. Tests
never read runtime DB credentials or connect to Supabase. Commands and database/HTTP
operations have finite deadlines. An abruptly killed JVM may require removing its
`kanban-backend-test-*` Docker container manually.

Coverage includes strict UTF-8/body/field validation; offline ES256 claim/signature/key
cache verification; full signed-token HTTP CRUD and two-user privacy; atomic creation,
cascade, null clearing, dates, recency, same-/cross-column ordering; mid-move SQL rollback;
concurrent append/move/delete/board deletion and repeated same-card moves; repeatable-read
snapshots; public health and missing-configuration fail-closed behavior.

## Runtime configuration

Follow the authoritative [setup requirements](<../docs/SETUP.md>) and use a least-privilege
runtime role after the owner applies the reviewed [database migrations](<../database/README.md>).
Java does not load dotenv automatically. Supply server environment variables through the
private launcher/deployment environment, never command-line passwords or client variables.

| Variable | Policy |
|---|---|
| `SUPABASE_JWT_ISSUER` | HTTPS issuer ending exactly `/auth/v1` |
| `SUPABASE_JWKS_URL` | That issuer plus `/.well-known/jwks.json` |
| `SUPABASE_JWT_AUDIENCE` | Optional; only `authenticated` is supported |
| `JDBC_URL` | `jdbc:postgresql://HOST:PORT/DATABASE?sslmode=verify-full` |
| `DB_USERNAME`, `DB_PASSWORD` | Separate private runtime credentials |
| `DB_SSL_ROOT_CERT` | Optional absolute trusted CA path; otherwise driver trust configuration |
| `DB_SSL_MODE` | Optional, must be `verify-full` |
| `DB_POOL_MAX_SIZE` | Default 5; bounds 1–20 |
| `DB_CONNECTION_TIMEOUT_MS` | Default 10000; bounds 500–30000 |
| `DB_STATEMENT_TIMEOUT_MS` | Default 10000; bounds 1000–60000 |

The JDBC URL intentionally accepts **only** `sslmode=verify-full` as its query. Credentials,
duplicate options, custom SSL factories, arbitrary `options`, and alternative SSL modes
are rejected. TLS certificate **and hostname** verification cannot be overridden through
URL parameters. Private configuration has a redacted `toString`. Hikari receives a configured
DataSource rather than a raw URL; SLF4J's NOP provider deliberately suppresses third-party
configuration/driver exception logging, even under DEBUG. Application logs are categorical,
with no driver causes, SQL, URL, token, header or secret values.

Startup validates all required configuration before creating the public-key HTTP client and
bounded pool. Pool initialization is lazy; startup performs no JWKS/DB network request.
Undeploy closes both resources. Missing/invalid config leaves health available and protected
routes closed. Authentication uses ES256/P-256 only (legacy HS256 is not supported), requires
issuer/audience/expiry/UUID subject, and exposes only a verified request UUID. JWKS retrieval
uses trusted configuration, HTTPS, bounded bodies/timeouts, cached public keys and a shared
refresh cooldown. No credentials or URLs from a JWT are followed.

## HTTP contract

Only exact `GET /api/health` is public: `200 {"status":"ok","service":"kanban-api"}`.
It is process liveness, not dependency readiness. Other exact health methods return 405;
path parameters and trailing slashes do not become public routes.

Every application route requires exactly one Bearer authorization value. Missing/invalid/
expired tokens return **401** with `WWW-Authenticate: Bearer`; unavailable signing keys return
**503**. A valid identity with unavailable data services receives 503. With missing config,
protected requests remain 401. No Java session is created.

| Method and path | Result |
|---|---|
| `GET /api/boards` | 200 `{boards:[...]}` |
| `POST /api/boards` | 201 `{board,columns:[{cards:[]}]}`, Location header |
| `GET /api/boards/{id}` | 200 `{board,columns:[{cards:[...]}]}` |
| `PUT /api/boards/{id}` | 200 `{board}` |
| `DELETE /api/boards/{id}` | 204, empty body |
| `POST /api/columns/{id}/cards` | 201 `{card}` |
| `PUT /api/cards/{id}` | 200 `{card}` |
| `DELETE /api/cards/{id}` | 204, empty body |
| `POST /api/cards/{id}/move` | 200 canonical `{board,columns:[{cards:[...]}]}` |

Board bodies accept `name` (required) and nullable `description`. Card creation requires
`title`, defaults omitted `priority` to MEDIUM, and accepts nullable `description`/`dueDate`.
Card PUT requires `title` and `priority`; omitted optional fields clear them, as does explicit
null. Explicit null priority is invalid. Move requires `targetColumnId` and integer
`newPosition` (zero-based final insertion index). No ownership/status/position fields are
accepted in card edits. Limits follow the [PRD](<../docs/PRD.md>): board names 100, card titles
200, descriptions 2000/5000 Unicode code points, real `YYYY-MM-DD` dates, LOW/MEDIUM/HIGH.

JSON must be an object, UTF-8 `application/json`, at most 65536 bytes. Unknown fields,
duplicates, trailing tokens, invalid types/dates/UUIDs return 400; wrong media type/charset
415; oversized declared or streamed bodies 413. Authenticated unknown routes return 404,
unsupported methods 405 with Allow. Errors use `{error:{code,message?}}`, never SQL or stack
traces. Application responses are UTF-8 JSON with `Cache-Control: no-store` and `nosniff`.
Container/proxy rejections before application dispatch remain the host's responsibility.

## Transaction and consistency protocol

Every mutation acquires the owning board row lock before child writes, including board
delete (before cascading). Card lookup **re-reads current location after acquiring the board
lock**; joined pre-wait snapshots cannot corrupt a subsequent delete/move. Ownership is
checked through card → column → board and inaccessible resources return generic 404;
owned cross-board moves return 400. Card writes explicitly touch board recency.

Services own one connection/transaction; DAOs use parameters and never commit. Reorders and
delete compaction defer the named uniqueness constraint, restore dense zero-based positions,
and recheck uniqueness before commit. Failure rolls back all changes. Board details use a
repeatable-read transaction so board/columns/cards form one consistent committed snapshot.
Writes use read-committed plus the shared board lock. Query, lock and idle-in-transaction
timeouts bound waiting. This is serialized last-successful-write behavior, not conflict merging.

## Isolated browser acceptance fixture

The explicitly selected `e2e` profile runs a test-classpath-only fixture, not a production
authentication bypass:

```bash
/home/bakorz/.local/bin/mvn -Dmaven.repo.local="$PWD/.m2" -Pe2e test-compile exec:exec
```

It starts the same Servlet routes on `127.0.0.1:8080` with a disposable PostgreSQL container
and generated ES256 signing key. After the `KANBAN_BROWSER_FIXTURE_READY` marker, the ignored
`target/e2e-session.json` artifact contains a **synthetic** Supabase-shaped session for browser
acceptance tests. Only the Auth session needs substituting; `/api` traffic reaches real Java
and PostgreSQL. Never use this runner with live data or as the normal development server.
Ctrl+C cleans the server, database and session artifact; a 15-minute ceiling bounds orphaned
runs. The fixture runner, keys, verifier transport and token are absent from the WAR.

## Development and deployment

```bash
/home/bakorz/.local/bin/mvn -Dmaven.repo.local="$PWD/.m2" -Pdev package exec:exec
```

This explicitly starts the packaged WAR on Tomcat at **127.0.0.1:8080**, root context.
Stop with Ctrl+C. No hot reload or alternate port is silently selected. Test/dev container
classes are never packaged in the WAR. Health works without private configuration, including
through the frontend development proxy. Deploy later to approved Tomcat 11/Java 21+ as
`ROOT.war`, or account for the context prefix. Configure HTTPS and same-origin `/api` routing;
no permissive CORS is provided. Keep TRACE disabled in external Tomcat (normal default).

Known release gates: no live Supabase/JWKS/database testing is performed by this suite;
owner-supplied credentials, reviewed migrations/grants/Data API settings, real two-user Auth
flows, email recovery and persistence across actual deployment restarts need authorized
manual verification. This backend does not claim those external checks are complete.
