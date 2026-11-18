-- DRAFT: owner-reviewed, development-only execution. Never run tests/bootstrap.sql on Supabase.
-- Apply once with a separate migration authority. No auth objects are created or altered.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA kanban;
REVOKE ALL ON SCHEMA kanban FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA kanban REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA kanban REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA kanban REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Migration authority only; never grant this table to the runtime role.
CREATE TABLE kanban.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kanban.boards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name varchar(100) NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT boards_name_nonblank CHECK (name !~ '^[[:space:]]*$'),
    CONSTRAINT boards_description_length CHECK (char_length(description) <= 2000)
);
CREATE INDEX boards_owner_id_idx ON kanban.boards(owner_id);

CREATE TABLE kanban.board_columns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id uuid NOT NULL REFERENCES kanban.boards(id) ON DELETE CASCADE,
    name varchar(20) NOT NULL,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT board_columns_fixed_identity CHECK (
        (position = 0 AND name = 'To Do') OR
        (position = 1 AND name = 'In Progress') OR
        (position = 2 AND name = 'Done')
    ),
    CONSTRAINT board_columns_board_position_key UNIQUE (board_id, position)
);

CREATE TABLE kanban.cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    column_id uuid NOT NULL REFERENCES kanban.board_columns(id) ON DELETE CASCADE,
    title varchar(200) NOT NULL,
    description text,
    priority varchar(6) NOT NULL DEFAULT 'MEDIUM',
    due_date date,
    position integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cards_title_nonblank CHECK (title !~ '^[[:space:]]*$'),
    CONSTRAINT cards_description_length CHECK (char_length(description) <= 5000),
    CONSTRAINT cards_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    CONSTRAINT cards_position_nonnegative CHECK (position >= 0),
    -- Services defer this named constraint during reorder; commit must restore uniqueness.
    CONSTRAINT cards_column_position_key UNIQUE (column_id, position)
        DEFERRABLE INITIALLY IMMEDIATE
);
-- Parent/position indexes are already supplied by these unique constraints.

CREATE FUNCTION kanban.set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION kanban.set_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER boards_set_updated_at BEFORE UPDATE ON kanban.boards
FOR EACH ROW EXECUTE FUNCTION kanban.set_updated_at();
CREATE TRIGGER cards_set_updated_at BEFORE UPDATE ON kanban.cards
FOR EACH ROW EXECUTE FUNCTION kanban.set_updated_at();

-- Defense in depth: no browser policies. JDBC ownership is enforced in Java, not auth.uid().
ALTER TABLE kanban.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.board_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE kanban.cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA kanban FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA kanban FROM PUBLIC, anon, authenticated;

INSERT INTO kanban.schema_migrations(version) VALUES ('001_initial_schema');
COMMIT;
-- Exactly three columns, dense card positions, same-board moves, and owner authorization
-- are service responsibilities; see ../README.md for the shared board-lock protocol.
-- SQL cannot remove a schema from Supabase Data API settings: owner verifies that separately.
