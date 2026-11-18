# Local course demo setup

Target approved by owner: own computer, English personal Kanban, development
Supabase project only. Owner chose email confirmation OFF for this disposable
project; public settings now report `mailer_autoconfirm: true`, confirming that
choice is saved. Confirmation OFF does not verify email ownership. Password
recovery still needs mail delivery.

**Current checkpoint:** Auth/CRUD code is implemented and locally verified,
including real browser CRUD against Java and isolated PostgreSQL. Actual Supabase
sign-in, runtime TLS connectivity, migrations, and email recovery remain unverified
until the owner completes the steps below. These instructions are not proof of a
live end-to-end demonstration.

## 1. Install tools

- Node 24.22.3 and npm 11.x.
- JDK 21 or later; the application targets Java 21.
- Maven 3.9+ (the implementation host uses 3.10.1).
- Python 3 for the private environment launcher (optional if your terminal/IDE
  injects environment variables by another trusted mechanism).

Clone the repository and check out the reviewed development branch. During
implementation PR #5 uses `feat/application-foundation`; the long-lived
integration target is `develop`, not production `main`.

## 2. Configure Supabase in the browser

In the development project dashboard:

- Email/password provider enabled; Confirm email OFF (owner's development choice).
- Site URL `http://localhost:5173`.
- Allowed redirect URLs:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/reset-password`
- `kanban` must NOT be in Data API Exposed schemas.
- Keep ECC P-256 signing keys; no signing secret is needed in Java.

Use `localhost` consistently. Mixing `127.0.0.1` and `localhost` creates different
browser storage origins and can break PKCE callback/recovery state.

Default Supabase mail delivery may be restricted to team addresses and a low
hourly limit. Disabling confirmation does not bypass recovery mail limits.
If needed, configure SMTP privately in the dashboard; do not put its password here.

## 3. Run reviewed development SQL

Use the Supabase SQL Editor as owner, in order:

1. `database/migrations/001_initial_schema.sql`
2. `database/migrations/002_runtime_role.sql`
3. `database/verify_configuration.sql` (read only)

Stop at the first error. Do not run the local test bootstrap on Supabase. Do not
rerun a committed migration or drop an existing schema/role to make it pass.
The runtime role is NOLOGIN until you provision login/password privately.

Expected checks: browser roles lack schema access; runtime role has limited app
DML, no schema CREATE/auth table reads; RLS is enabled on app tables; both migration
versions exist. Local tests cannot establish dashboard exposure settings.

## 4. Configure secrets only on your computer

Frontend: copy `frontend/.env.example` to `frontend/.env.local`. Set the project
URL and browser-safe publishable key already supplied by the owner. Set API base
to `/api`. All VITE variables are public; never add DB passwords or service-role keys.

Backend: copy `backend/.env.example` to `backend/.env` and restrict permissions:

```bash
chmod 600 backend/.env
```

Use a private local editor to fill the real restricted runtime account, database
endpoint copied from Supabase Connect, database password, and trusted CA path.
The JDBC URL must not contain a password. Use TLS certificate/hostname verification
(`sslmode=verify-full`). Do not use the administrative `postgres` account for the app.
Direct connections require supported networking; session pooler is an option for
IPv4-only networks. Copy the actual endpoint and custom-role pooler username;
do not guess it. Keep migration credentials out of the runtime configuration.

The backend deliberately accepts only this shape (no extra parameters):

```text
JDBC_URL=jdbc:postgresql://HOST:PORT/postgres?sslmode=verify-full
```

Remove `pgbouncer=true`, `connection_limit`, or other options from a copied pooler
string. For a custom role through the shared session pooler, the username is
normally `kanban_runtime.<project-ref>`; confirm it in the dashboard rather than
inferring it. `DB_SSL_ROOT_CERT` is optional: set it to an absolute CA file if the
chosen endpoint is not trusted by the JVM's default trust store. Do not disable TLS.
If `DB_SSL_ROOT_CERT` is present, the file must be readable by the launcher and
must not be committed.

Public backend identity settings use the project Auth issuer and its public JWKS
URL. The expected audience is `authenticated`. Real JWTs are obtained through SDK
sign-in, never pasted manually into code or chat.

Private files are ignored by Git, not encrypted. Do not upload them or echo their
contents. The launcher refuses broad Unix file permissions and never evaluates
shell commands from the file. Validate syntax without printing values:

```bash
python3 scripts/run-backend.py --check
```

## 5. Build and run (after full implementation verification)

```bash
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
mvn -B -ntp -f backend/pom.xml verify
```

Terminal 1 (private environment injected into Tomcat by launcher):

```bash
python3 scripts/run-backend.py
```

Terminal 2:

```bash
npm run dev --prefix frontend
```

Open `http://localhost:5173`. Both servers bind loopback and stop with Ctrl+C.
There is no public deployment. Vite is a development server, not a production host.

## 6. Acceptance/demo checklist — not yet signed off

- Register/sign in with a disposable account; confirmation-off returns the right state.
- Create a board; see exactly three columns; reload and reopen the same board.
- Create/edit a card, clear description/due date, move it between columns and up/down.
- Delete a card then append another; positions remain dense.
- Log out, sign in as a second account; first user's boards are absent and direct
  requests for their IDs are denied with generic 404.
- Test forgot/reset password using actual email delivery before the presentation.
- Verify keyboard navigation/mobile layout and display of a network failure.
- Stop/restart Java; data still loads from the development database.
- Record any unverified flow honestly; a health check is only liveness, not acceptance.

Production promotion is a separate develop-to-main pull request after owner
acceptance. No deployment or production promotion is implied by this local guide.
