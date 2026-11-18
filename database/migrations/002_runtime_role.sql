-- OPTIONAL owner-executed provisioning after 001. Requires CREATEROLE and table ownership.
-- Intentionally fails if kanban_runtime already exists: audit that role before adapting.
-- NOLOGIN means this file cannot activate a database password or runtime connection.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE ROLE kanban_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
    NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE kanban_runtime SET search_path = pg_catalog, kanban;
GRANT USAGE ON SCHEMA kanban TO kanban_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON kanban.boards, kanban.cards TO kanban_runtime;
-- Fixed columns are inserted only during atomic board creation. Board deletion cascades.
GRANT SELECT, INSERT ON kanban.board_columns TO kanban_runtime;

-- One trusted backend role sees all application rows. These are NOT end-user policies.
-- Every Java query/service MUST check verified owner_id; JDBC does not set auth.uid().
CREATE POLICY backend_access ON kanban.boards TO kanban_runtime USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON kanban.board_columns TO kanban_runtime USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON kanban.cards TO kanban_runtime USING (true) WITH CHECK (true);
-- No auth schema/table, migration history, sequence, function, schema CREATE, or role grants.
-- UUIDs use PostgreSQL's built-in gen_random_uuid(); no sequence privileges are needed.
-- Future migrations must grant only their explicitly reviewed runtime requirements.
INSERT INTO kanban.schema_migrations(version) VALUES ('002_runtime_role');
COMMIT;
-- Owner provisions LOGIN/password PRIVATELY only after approval; never add secrets here.
