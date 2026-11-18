# Kanban API foundation

Plain Jakarta Servlets packaged as a production-deployable WAR. **No Spring, JPA,
database connection, Supabase access, JWT verification, or application CRUD exists yet.**

## Version matrix

Versions are pinned in [pom.xml](<pom.xml>); stable releases checked against Maven Central on 2026-11-18.

| Component | Version / policy |
|---|---|
| Java target | **21**, `javac --release 21`; no preview features |
| Verified build JDK | OpenJDK **26.0.2** (Ubuntu); JDK 21+ can build |
| Verified Maven | **3.10.1**; Maven 3.9+ recommended |
| Production container | Apache Tomcat **11.0.29**, Java 21+ |
| Servlet API | Jakarta Servlet **6.1.0**, `provided` (not bundled) |
| Embedded Tomcat | **11.0.29**, test/dev scope only |
| Jakarta Annotations | **3.0.0**, test/dev scope only |
| JUnit Jupiter | **6.1.3**, test scope only |
| Compiler / WAR plugin | **3.16.0** / **3.5.1** |
| Surefire / resources / clean plugin | **3.6.1** / **3.5.0** / **3.5.0** |
| Exec plugin | **3.7.0**, `dev` profile only |

A Java 26 build does **not** make this a Java 26-only application: `--release 21`
produces Java 21 bytecode and checks use of Java 21 APIs. The current environment
has only JDK 26; execution on JDK 21 remains a separate runtime-matrix check.

## Build and test

From the repository root:

```bash
/home/bakorz/.local/bin/mvn -B -ntp -f backend/pom.xml test
/home/bakorz/.local/bin/mvn -B -ntp -f backend/pom.xml package
```

Or, from this directory with Maven on PATH:

```bash
mvn -B -ntp test
mvn -B -ntp package
```

Both `test` and `package` run JUnit unit tests **and real embedded Tomcat HTTP
integration tests**. Tests bind only `127.0.0.1` on ephemeral ports, use synthetic
requests, and stop/destroy their containers afterward. No secrets, external
services, or Docker are needed. Maven downloads artifacts on the first build.
If home-cache writes are sandboxed, add `-Dmaven.repo.local="$PWD/.m2"` when
running from this directory; that local cache is ignored.

Output: `target/kanban-api.war`. Test reports: `target/surefire-reports/`.

## Local development: actual Tomcat, root context

From the repository root:

```bash
/home/bakorz/.local/bin/mvn -f backend/pom.xml -Pdev package exec:exec
```

Or from this directory:

```bash
mvn -Pdev package exec:exec
```

The command packages the real WAR and launches **Apache Tomcat 11.0.29** in a
separate JVM, bound to **127.0.0.1:8080**, root context. This is not a replacement
for another application's server and is never started automatically by a build.
Port 8080 must be free; the runner does not choose a hidden alternate port.
There is no hot reload: stop and rerun after changes.

In a second terminal:

```bash
curl -i http://127.0.0.1:8080/api/health
curl -i -X POST http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/boards
```

Use **Ctrl+C** to stop. The child JVM shutdown hook pauses the connector, stops
Tomcat (allowing in-flight servlet unloading up to five seconds), invokes the
application destroy listener, destroys the container, and removes its own
validated temporary base directory. Embedded container classes and the dev
runner are test sources and **never included in the production WAR**.

## HTTP contract

| Request | Response |
|---|---|
| `GET /api/health` | `200 {"status":"ok","service":"kanban-api"}` |
| `POST /api/health` (and non-GET health methods) | `405`, `Allow: GET`, `{"error":{"code":"METHOD_NOT_ALLOWED"}}` |
| Any other `/api/*` path (including unknown routes) | `401`, `WWW-Authenticate: Bearer`, `{"error":{"code":"UNAUTHORIZED"}}` |
| Missing non-API route | `404 {"error":{"code":"NOT_FOUND"}}` |

Health is **public liveness only**, not DB/auth readiness. Authentication is
intentionally fail-closed: even a supplied Bearer token is rejected until a
real verifier is implemented. No sessions are created. HEAD follows the non-GET
405 policy, with HTTP's usual body suppression. The exact health URI is
allowlisted; trailing slashes/path parameters do not become public endpoints.

Application JSON responses include `Content-Type: application/json;charset=UTF-8`,
`Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. Errors use static
codes, never exception messages, stack traces, credentials, or reflected input.
The descriptor maps common container errors and unexpected exceptions to JSON;
container failures before application dispatch (e.g. malformed HTTP) remain the
hosting container/proxy's responsibility.

The lifecycle listener creates a startup timestamp as application-scope state
and removes it on shutdown. It deliberately does not claim to initialize a
connection pool or authentication service that has not been built.

## Deploy the WAR later (not performed by this foundation)

Use an approved **Tomcat 11.0.29 / Java 21+** host. Deploy the built WAR as
`$CATALINA_BASE/webapps/ROOT.war` for root-context `/api/...` routing, or configure
an equivalent root-context deployment through the host's managed mechanism.
Deploying it under a different name adds that context prefix (for example,
`/kanban-api/api/health`); routing and proxy configuration must account for this.
Tomcat supplies Servlet 6.1; do not add Servlet or embedded Tomcat jars to the WAR.

Production TLS, reverse-proxy routing, secret provisioning, access-token
verification, database readiness, and deployment automation are later tasks.
For externally managed Tomcat, keep TRACE disabled (the normal container default);
it may return a container-level 405 before the servlet. The embedded test/dev
connector allows dispatch solely so the servlet's safe 405 JSON policy can be
tested; no TRACE echo implementation is enabled.

Dependency source: [Maven Central](<https://repo.maven.apache.org/maven2/>).
Container requirements: [Tomcat 11 documentation](<https://tomcat.apache.org/tomcat-11.0-doc/>).
