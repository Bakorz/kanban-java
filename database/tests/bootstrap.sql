-- TEST ONLY. Refuses all databases except the named disposable local test target.
-- Run only inside the isolated container described in README, never on Supabase.
\set ON_ERROR_STOP on
DO $$ BEGIN
    IF current_database() <> 'kanban_schema_test' THEN
        RAISE EXCEPTION 'Test bootstrap requires disposable kanban_schema_test database';
    END IF;
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname IN ('auth', 'kanban')) THEN
        RAISE EXCEPTION 'Test database must be empty; refusing existing auth/kanban schemas';
    END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
-- Minimal auth fixture only; never a replacement for Supabase's managed auth schema.
INSERT INTO auth.users(id) VALUES
    ('00000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000002');
