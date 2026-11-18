-- READ ONLY, owner-run after approved migrations. No tokens/passwords or user data.
-- Expected: two migration versions; false browser access; false runtime DDL/auth access;
-- runtime role remains NOLOGIN until the owner privately provisions it.
SELECT version, applied_at FROM kanban.schema_migrations ORDER BY version;
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname = 'kanban_runtime';
SELECT r.role_name, has_schema_privilege(r.role_name, 'kanban', 'USAGE') AS schema_usage,
       has_schema_privilege(r.role_name, 'kanban', 'CREATE') AS schema_create,
       has_table_privilege(r.role_name, 'kanban.boards', 'SELECT') AS boards_select,
       has_table_privilege(r.role_name, 'kanban.cards', 'INSERT') AS cards_insert,
       has_table_privilege(r.role_name, 'auth.users', 'SELECT') AS auth_users_select
FROM (VALUES ('anon'), ('authenticated'), ('kanban_runtime')) AS r(role_name);
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='kanban' ORDER BY tablename, policyname;
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       pg_get_userbyid(c.relowner) AS table_owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='kanban' AND c.relkind='r' ORDER BY c.relname;
SELECT conname, condeferrable, condeferred, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace='kanban'::regnamespace ORDER BY conrelid, conname;
-- Exposed Data API schemas are a separate dashboard check, not inferred by these results.
