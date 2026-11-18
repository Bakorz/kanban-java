# Database drafts — owner review required

**Status: draft migrations; not applied to Supabase.** These files implement the
schema portion of T11 and propose T12 grants. Local fixture tests are not proof of
Supabase dashboard settings, live runtime connectivity, or application authorization.

## Owner execution (development project only)

1. Confirm the target is the dedicated development project and the data-retention
   policy is acceptable. Obtain explicit migration approval. Do not run against an
   existing `kanban` schema: these intentionally non-idempotent files fail instead
   of silently adopting unknown tables or overwriting data.
2. Review [001_initial_schema.sql](<migrations/001_initial_schema.sql>) against the
   [PRD](<../docs/PRD.md#7-erd-and-data-rules>). Use the Supabase SQL Editor or a
   separate elevated migration connection. `auth.users(id)` must already exist;
   the script only references it. **Never upload/run the test bootstrap there.**
3. Run the complete 001 file once. Each migration uses one transaction. On any
   error, stop, inspect the error, and roll back the session before retrying; do
   not continue with the next file. No destructive reset/down migration is supplied.
4. Optionally review and run [002_runtime_role.sql](<migrations/002_runtime_role.sql>)
   with authority to create roles and grant privileges. It creates deterministic
   `kanban_runtime` as **NOLOGIN**, not a working password account. It intentionally
   fails if that cluster-wide role already exists. Do not drop/adopt an existing
   role without auditing its memberships, ownership, and privileges.
5. In Supabase Data API settings, ensure **`kanban` is not in Exposed schemas**.
   SQL does not change this dashboard setting. Do not add it to make browser
   requests work: React uses Supabase Auth only; all board/card data goes through Java.
6. Only after approval, configure LOGIN and a generated password for
   `kanban_runtime` using your trusted private database administration method.
   Do not paste the password into chat, Git, shared SQL history, or the frontend.
   Configure the backend privately with the actual connection endpoint, correct
   direct/pooler username, TLS CA verification, and finite pool/query timeouts.
   Database CONNECT is normally inherited from PUBLIC on the target database;
   if hardened off, the owner must grant CONNECT only to the selected database.
7. Run [verify_configuration.sql](<verify_configuration.sql>) using the migration
   authority and review the non-sensitive results. Test runtime connectivity
   separately when the Java connection pool is implemented. Leave migration
   authority credentials out of the running application.
8. Record migration versions and execution date. The local
   `kanban.schema_migrations` table records committed file versions; it is not
   an automatic runner/checksum system. Do not reapply or edit an already-applied
   migration; add a newly numbered reviewed file instead.

## Schema contract for Java implementers

- `boards.owner_id` references `auth.users(id)`; owner deletion cascades through
  boards → columns → cards. No auth table/role is created by the real migrations.
- `board_columns` has UUID identity and fixed `(position,name)` pairs:
  `(0,'To Do')`, `(1,'In Progress')`, `(2,'Done')`. The unique parent/position
  constraint permits **at most** three. The service creates **exactly three**
  with the board in a single transaction. No public column mutation endpoints.
- Runtime role may SELECT/INSERT columns but cannot UPDATE/DELETE them. Board
  deletion still cascades. It has only SELECT/INSERT/UPDATE/DELETE on boards/cards,
  schema USAGE, and no auth-table, DDL, migration-history or sequence privileges.
- IDs default to PostgreSQL built-in `gen_random_uuid()`; Java may supply UUIDs.
  Ordered-child indexes are already supplied by unique constraints; don't add
  duplicate `(parent_id,position)` indexes. Owner lookup has a separate index.
- Board name ≤100/card title ≤200, not SQL-whitespace-only; Java trims and validates
  input before writing. SQL's whitespace classification is locale-dependent, so
  API validation remains necessary for its documented Unicode behavior.
- Descriptions accept NULL or text (board ≤2000, card ≤5000); due date is nullable
  SQL `date`, past dates allowed. PUT clearing is SQL NULL, not empty strings or
  omitted fields. Map dates with `LocalDate` rather than timestamp conversion.
- Priority defaults MEDIUM and accepts only LOW/MEDIUM/HIGH. Position is required,
  nonnegative, and unique per column. There is no duplicate card board/status field.
- BEFORE UPDATE triggers overwrite `updated_at` with `statement_timestamp()` for
  changed board/card rows. Multiple rows in one statement share a timestamp;
  timestamps are not optimistic versions. On child mutations, services explicitly
  `UPDATE kanban.boards SET updated_at=statement_timestamp() WHERE id=?` inside the
  same transaction so board recency reflects card changes. Triggers do not acquire
  parent locks or mutate other rows; no hidden reverse lock ordering is introduced.

### Shared transaction and ordering protocol

1. Begin JDBC transaction on one connection (`autoCommit=false`).
2. Resolve the owning board and lock it with an ownership predicate:
   `SELECT id FROM kanban.boards WHERE id=? AND owner_id=? FOR UPDATE`.
   Owner UUID comes only from the verified token. For a card/column request,
   resolve its parent then lock; reread/recheck existence and owner under the lock.
   No row/missing ownership match means generic 404.
3. Every create/delete/move/board-delete uses that **same board-row lock first**.
   Read fresh ordered children after locking. Reject cross-board destinations.
4. Before reorder, issue
   `SET CONSTRAINTS kanban.cards_column_position_key DEFERRED` on that connection.
   Update source/destination and moved row; compact deletion gaps. Same-column
   final index is 0..N−1; cross-column index is 0..M. Append at count only after
   verifying dense ordering under the lock.
5. Touch the board timestamp, then commit; roll back all work on failure. Let
   deferred uniqueness validate at commit. Never commit from individual DAOs.

Uniqueness/nonnegative checks do **not** enforce dense positions, exactly three
columns, same-board moves, or ownership by themselves. Do not claim a schema-only
implementation passes concurrency or two-user isolation tests. The runtime role
can see all application rows through role-specific RLS policies; Java is the
end-user authorization boundary. JDBC does not carry JWT identity or `auth.uid()`.
RLS without policies plus revoked browser grants blocks browser roles; runtime
RLS policy does not grant them membership or schema access. Elevated migration
roles/table owners remain trusted and can bypass this boundary.

## Isolated local verification

Requires Docker and an empty disposable container. Never run fixture scripts
against a shared database, even one whose name resembles the test target.
[bootstrap.sql](<tests/bootstrap.sql>) creates a minimal `auth.users` stub and
browser-role fixtures **only** for this local test; it refuses an existing
`auth`/`kanban` schema and any other database name.

From the repository root, the repeatable CI check is:

```bash
python3 database/verify-local.py
```

The script pins the PostgreSQL image by digest, creates a unique network-disabled
container, checks readiness within 45 seconds, runs all four SQL files, and verifies
the container ID plus ownership label before removing only that container. It has
passed locally; it never reads application environment files or contacts Supabase.

For a manual equivalent:

```bash
# Choose an unused container name. No published ports, volume, or live credentials.
docker run --detach --rm --name kanban-schema-test --network none \
  --mount "type=bind,source=$PWD/database,target=/work,readonly" \
  -e POSTGRES_DB=kanban_schema_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17.7
# Wait until this reports accepting connections before running SQL:
docker exec kanban-schema-test pg_isready -U postgres -d kanban_schema_test
docker exec kanban-schema-test psql -U postgres -d kanban_schema_test \
  -v ON_ERROR_STOP=1 -f /work/tests/bootstrap.sql \
  -f /work/migrations/001_initial_schema.sql \
  -f /work/migrations/002_runtime_role.sql -f /work/tests/verify.sql
# Verify this is the container you created, then stop it (--rm removes it):
docker inspect kanban-schema-test --format '{{.Name}} {{.Config.Image}}'
docker stop kanban-schema-test
```

The trust setting is **only for this network-disabled disposable container**;
never use it on a live database. Tests exercise real PostgreSQL constraints,
role grants, RLS browser denial, nullable clearing, priority/timestamp defaults,
deferred reorder, rollback, and board/auth cascades; fixture mutations roll back.
The repeatable script pins `postgres:17.7-alpine` by digest. The manual example
above uses a tag for readability; prefer the script for recorded test evidence.

Without Docker, use a separately provisioned empty local PostgreSQL 17+ instance,
create `kanban_schema_test`, then run the same four files through `psql` with
`ON_ERROR_STOP=1`. That requires local create-role/schema privileges and must not
be pointed at Supabase. If neither local option is available, treat these as
unexecuted drafts pending a real PostgreSQL test, not as tests that passed.
