# Course demonstration script

Use only disposable accounts and synthetic tasks. Complete the local setup and
actual Supabase acceptance checks before presenting; the isolated tests are not
proof of live email delivery or production readiness.

## Five-minute core walkthrough

1. **Explain the stack.** React handles views and Supabase SDK sessions. Java
   Servlets verify the access token, services authorize ownership and transactions,
   DAOs use parameterized JDBC, PostgreSQL persists the Kanban data.
2. **Log in as test user A.** Show the empty board list (or one clearly labeled
   demonstration board). Do not show browser storage, tokens, passwords, private
   environment files, or the database connection string on screen.
3. **Create “Course demo”.** Open it and point out the three fixed columns. Explain
   that board and columns are created atomically in one JDBC transaction.
4. **Add two cards.** Give one a priority, description, and due date. Edit it, clear
   description/date, and reload to show the null values persisted.
5. **Move a card.** Use the column selector and Move button, then same-column up/down
   controls. Explain zero-based dense positions, the shared owning-board row lock,
   deferred uniqueness, and rollback on failure. Drag-and-drop is intentionally optional.
6. **Reload the board.** The server—not a local fixture or client-only state—returns
   the canonical order. Stop/restart Java beforehand in rehearsal to verify durability.
7. **Log out and sign in as B.** A's boards do not appear. Demonstrate a prepared
   authorized isolation test showing generic 404 for A's resource ID; do not expose
   Bearer headers or a personal user's data in a browser request inspector.
8. **Delete a demo board.** Read the explicit descendant-deletion confirmation. Explain
   foreign-key cascades; confirm that the board and its cards disappear together.

## Java concepts to explain

- Servlet request/response lifecycle and explicit route parsing.
- Filter authentication versus service authorization; frontend guards are not security.
- Application-scope dependencies are immutable; user UUID is request-scoped.
- One pooled Connection per operation, try-with-resources, commit/rollback owned by services.
- PreparedStatement parameters instead of string-concatenated SQL.
- SQL NULL for clearable fields and LocalDate for a date without timezone conversion.
- HTTP JSON status codes, strict validation, safe errors, and no shared caching.
- Supabase Auth is not a second custom JWT/password implementation. JDBC does not
  automatically inherit a browser identity or call `auth.uid()`.

## Evidence to keep ready

- Exact tested Git commit and develop-targeted pull request.
- Passing backend tests (including restricted runtime privileges, two-user isolation,
  concurrent ordering, and mid-move rollback).
- Frontend tests and desktop/mobile browser evidence; distinguish mocked Auth from
  actual Supabase flows. Never describe mocked-email tests as delivered email.
- Local setup guide, API reference, reviewed migrations, known limitations.
- Email recovery rehearsal only if actual delivery/callback succeeds. If not verified,
  state that limitation rather than making a live promise during the presentation.

## Scope and limits

Personal boards only; no collaboration, invitations, assignments, realtime, or custom
columns. Immediate JWT revocation is not promised: a valid locally verified access
token can remain valid until its expiry after SDK signout. No production deployment,
production load testing, or main promotion has been performed by the local test suite.
