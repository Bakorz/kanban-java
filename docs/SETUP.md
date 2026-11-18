# Personal Kanban — Setup, Credentials, and Access Checklist

Date: 2026-11-18

Related: [PRD](<PRD.md>) · [Implementation tasks](<TASKS.md>)

## 1. First: do not paste secrets into chat

Public project configuration can be shared in the conversation. Configure actual secrets in a server environment, hosting secret manager, or a private untracked file. Then tell the agent which configuration source to use and the authorized environment; do not paste its contents.

A file excluded by Git is not encrypted or inaccessible to authorized tools. Use restrictive permissions for private files, do not upload them as attachments, and do not ask the agent to echo secret values. The agent should verify presence or successful connection, not print credentials.

The earlier review found an exposed database credential and a signing key for the old custom JWT implementation. Before reusing that database, rotate its credential. Retire/rotate the old application's signing key if any deployment still uses it. That old JWT key is not necessarily the Supabase Auth signing key. Do not automatically rotate Supabase signing keys without identifying what was exposed and planning the impact.

A new, dedicated development Supabase project with synthetic data is recommended. That reduces risk but does not remove the need to secure an old project that remains active.

## 2. Information you can provide in chat

Copy and complete this form without adding passwords or tokens:

```text
Project name:
New implementation folder/repository, or existing repository migration:
Existing data that must be preserved: none / describe
Teacher approved React and Supabase Auth: yes / not yet
Deadline and team size:
UI language: English / other
MVP: personal boards with three fixed columns? yes / changes
Drag-and-drop required for submission? yes / optional

Supabase project URL: https://<project-ref>.supabase.co
Supabase publishable key: sb_publishable_...
Environment: development only
Signing keys: asymmetric / legacy HS256 / unsure
Email confirmation enabled: yes / no / unsure
Allowed local frontend URL: http://localhost:5173
Production/demo URL: not decided / URL

Database connection mode: direct / session pooler / unsure
Runtime DB credentials: configured privately / not yet
Migration execution: I run the SQL / temporary migration access
Two disposable test users available: yes / no
Authorized live operations: describe, or 'none yet'
```

The project URL and publishable key are intended for browser applications. They are not authorization to expose your application tables; keep the Data API and database grants restricted.

## 3. Exact configuration needed

### A. React / Supabase Auth

| Item | Secret? | Where to find/configure it | Needed for |
|---|---|---|---|
| Supabase project URL | No | Project dashboard; project connection/API settings | Auth client and issuer configuration |
| Publishable key (`sb_publishable_...`) | No | API keys section | Browser Supabase SDK |
| Auth signing configuration | No | Auth signing-key settings | Choose server verification method |
| Site URL and allowed redirect URLs | No | Auth URL configuration | Confirmation and recovery callbacks |
| Email confirmation policy | No | Auth provider settings | Correct registration UX |

A legacy `anon` key may be used only after confirming that it is actually the browser-safe anon key. Never substitute a secret or service-role key.

Suggested frontend template:

```dotenv
# All VITE_* values are exposed to the browser. No secrets here.
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_API_BASE_URL=/api
```

During implementation, these values would be supplied to the frontend build, typically through a private local env file containing only public configuration or the hosting build settings. They are embedded into the generated client bundle.

### B. Java JWT verification

| Item | Secret? | Notes |
|---|---|---|
| Expected issuer | No | Normally `https://<project-ref>.supabase.co/auth/v1`; confirm actual project/custom-domain setup |
| Expected audience | No | Typically `authenticated`; validate against the configured Auth project |
| Trusted JWKS URL | No | Normally issuer + `/.well-known/jwks.json` for asymmetric signing keys |

For the recommended asymmetric setup, Java only needs public keys. No signing private key, shared JWT secret, or service-role key is required.

If the project is legacy HS256, stop and choose an explicit verification approach, such as the supported Auth-server validation path or a planned signing-key migration. Do not send the shared secret as a shortcut.

### C. Java / PostgreSQL runtime connection

| Item | Secret? | Handling |
|---|---|---|
| JDBC URL without password | Usually no | Copy actual host/port/database from Supabase Connect; do not invent the pooler hostname |
| Runtime database username | Usually no | Use a dedicated application role, not the administrative `postgres` role for normal app requests |
| Runtime database password | **Yes** | Inject server-side; never paste into chat or put in React |
| Supabase database root certificate / trusted CA path | No | Configure certificate and hostname verification for deployment |
| Pool settings | No | Small bounded pool and finite timeouts; adjust to project connection limits |

Recommended: direct connection for a persistent backend with supported networking, or the shared **session pooler** when the backend is IPv4-only. The dashboard's connection string gives the correct host and username. For a custom role through the shared pooler, the username generally includes the project reference.

The runtime role needs schema usage and only the application's required SELECT/INSERT/UPDATE/DELETE permissions. It does not need schema ownership, role management, or access to authentication passwords/tokens.

Suggested backend environment template:

```dotenv
# TEMPLATE ONLY — replace placeholders through secure server configuration.
# Java does not automatically load dotenv files; an explicit launcher/loader
# or the deployment environment must supply these values to Tomcat.

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_JWT_ISSUER=https://YOUR_PROJECT_REF.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://YOUR_PROJECT_REF.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_AUDIENCE=authenticated

# Copy the actual session-pooler or direct endpoint from Supabase Connect.
# Password is deliberately NOT embedded in JDBC_URL.
JDBC_URL=jdbc:postgresql://YOUR_DATABASE_HOST:5432/postgres?sslmode=verify-full
DB_USERNAME=YOUR_RUNTIME_ROLE_OR_POOLED_USERNAME
DB_PASSWORD=SET_PRIVATELY_NOT_IN_CHAT
DB_SSL_ROOT_CERT=/absolute/path/to/configured-supabase-root.crt
DB_POOL_MAX_SIZE=5
DB_CONNECTION_TIMEOUT_MS=10000
DB_STATEMENT_TIMEOUT_MS=10000
```

These are proposed application variable names; the implementation will explicitly read them and pass the certificate/query-timeout settings to the JDBC driver. Merely setting a variable does not configure TLS or SQL timeouts by itself.

Pool size/timeouts are initial development defaults, not load-tested sizing. Do not include an administrative password in this runtime environment.

### D. Migrations / schema setup

Creating a schema, foreign key to `auth.users`, or database role requires privileges beyond ordinary runtime DML.

Choose one path:

1. **Recommended: owner executes reviewed SQL.** The agent writes migrations; you review and run them through the Supabase SQL Editor or your trusted migration process. No admin credential needs to be shared with the agent. Runtime connectivity is verified afterward.
2. **Optional: temporary migration access.** You explicitly authorize the target development project and scope, configure a suitably privileged connection privately, and revoke/rotate temporary access afterward. Keep it separate from runtime configuration.

Never grant permanent admin database credentials just to simplify application queries. Changes to auth configuration, role grants, exposed schemas, or production data need explicit approval.

### E. Test users

Provide or authorize creation of two disposable test accounts with distinct Supabase UUIDs. Use no personal or real customer data.

- Test-user passwords, if needed for automated browser tests, belong in private test configuration.
- Do not share your personal account password, recovery codes, or long-lived access/refresh tokens.
- Prefer SDK sign-in during tests over pasting JWTs manually.
- Specify whether the agent may create and delete synthetic boards/cards for those users.
- Email confirmation and recovery testing may require you to complete inbox steps; the agent does not need access to your personal mailbox.

### F. Deployment — only when ready

No deployment credential is needed for planning or initial coding.

Later, provide the target host/provider, desired public URL, and chosen deployment mechanism. Configure access through an existing authenticated environment, project-scoped deploy identity, or hosting integration. Do not paste SSH private keys, root passwords, cloud master keys, or GitHub personal access tokens into chat.

GitHub access is unnecessary unless you explicitly want commits pushed or a remote repository created. Hosting access is unnecessary for a local course demo.

## 4. What is NOT needed for the locked architecture

- Supabase account/dashboard password.
- Supabase secret API key (`sb_secret_...`).
- Legacy Supabase service-role key.
- Supabase management/personal access token.
- Supabase JWT private signing key or shared signing secret for the asymmetric design.
- The previous application's custom JWT signing key.
- Production database credentials or a copy of real user data.
- GitHub or hosting credentials merely to create code locally.
- SMTP credentials unless a later approved email-delivery setup actually requires them; configure those directly in Supabase rather than the Java runtime.

## 5. Least-privilege data boundary

```text
Browser public configuration
  → Supabase Auth only

Browser access token
  → Java API verifies identity and ownership

Java runtime DB role
  → kanban schema DML only

Separate migration authority
  → approved DDL/grants on the designated development target
```

A direct JDBC connection does not automatically turn the browser JWT into a PostgreSQL user context. Java enforces per-user ownership. Keep the `kanban` schema out of Supabase's exposed Data API schemas, and do not grant browser-facing anon/authenticated roles access as a parallel route around Java.

## 6. Authorization checklist before connecting

- [ ] Target Supabase project is identified as development/test or production.
- [ ] Existing data and backup requirements are stated.
- [ ] Exposed credential issue has been addressed.
- [ ] Runtime versus migration credentials are separated.
- [ ] Owner explicitly permits the connection and required operations.
- [ ] Test data is synthetic; destructive tests use an isolated test environment.
- [ ] Private configuration source is identified without printing contents.
- [ ] Agent is instructed not to echo secrets or include them in logs/artifacts.
- [ ] No production schema change, auth-key rotation, or history rewrite is implied by planning approval.

## 7. What can start without credentials?

Immediately after scope/destination confirmation:

- Repository structure and dependency setup.
- React pages and components with fixtures.
- Servlet routes, DTOs, validation, and error handling.
- SQL migration drafts and DAO code.
- Token verifier tests using test-only keys.
- Local isolated PostgreSQL tests when local prerequisites are approved.
- Documentation and CI without live secrets.

Live sign-in, schema execution, deployment, and final end-to-end verification wait for the relevant configuration and permission gates.

## References

- [Supabase API keys](https://supabase.com/docs/guides/api/api-keys)
- [Supabase JWT verification](https://supabase.com/docs/guides/auth/jwts)
- [Supabase PostgreSQL connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
