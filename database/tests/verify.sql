-- TEST ONLY after bootstrap + migrations, inside disposable local database.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
    IF current_database() <> 'kanban_schema_test' THEN
        RAISE EXCEPTION 'Tests require isolated kanban_schema_test database';
    END IF;
END $$;
CREATE FUNCTION pg_temp.expect_rejected(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE command;
    EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation
        OR not_null_violation OR string_data_right_truncation OR insufficient_privilege THEN
        RETURN;
    END;
    RAISE EXCEPTION 'Expected database rejection: %', command;
END;
$$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END;
$$;

SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM kanban.schema_migrations), 'migration history');
SELECT pg_temp.assert_true((SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
    AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
    FROM pg_roles WHERE rolname = 'kanban_runtime'), 'restricted NOLOGIN role');
SELECT pg_temp.assert_true(NOT has_schema_privilege('anon','kanban','USAGE')
    AND NOT has_schema_privilege('authenticated','kanban','USAGE'), 'browser schema denial');
SELECT pg_temp.assert_true(NOT has_schema_privilege('kanban_runtime','kanban','CREATE')
    AND NOT has_table_privilege('kanban_runtime','auth.users','SELECT')
    AND NOT has_table_privilege('kanban_runtime','kanban.schema_migrations','SELECT')
    AND NOT has_table_privilege('kanban_runtime','kanban.board_columns','UPDATE')
    AND NOT has_table_privilege('kanban_runtime','kanban.board_columns','DELETE'), 'runtime least privilege');
SELECT pg_temp.assert_true((SELECT count(*) = 3 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='kanban' AND c.relname IN ('boards','board_columns','cards') AND c.relrowsecurity), 'RLS enabled');
SELECT pg_temp.assert_true((SELECT condeferrable AND NOT condeferred FROM pg_constraint
    WHERE conrelid='kanban.cards'::regclass AND conname='cards_column_position_key'), 'ordering deferrable');

-- Actual runtime statements: cross-user ownership is intentionally Java's responsibility.
SET LOCAL ROLE kanban_runtime;
INSERT INTO kanban.boards(id,owner_id,name,description) VALUES
    ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Board A',NULL),
    ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Board B',NULL);
INSERT INTO kanban.board_columns(id,board_id,name,position) VALUES
    ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','To Do',0),
    ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','In Progress',1),
    ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Done',2),
    ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','To Do',0);
INSERT INTO kanban.cards(id,column_id,title,position,due_date,description) VALUES
    ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Card one',0,'2020-01-01','Clear me'),
    ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Card two',1,NULL,NULL);
UPDATE kanban.cards SET due_date=NULL,description=NULL,updated_at='2000-01-01' WHERE title='Card one';
UPDATE kanban.boards SET name='Updated A',updated_at='2000-01-01' WHERE name='Board A';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT due_date IS NULL AND description IS NULL AND priority='MEDIUM'
    AND updated_at > '2000-01-01' FROM kanban.cards WHERE title='Card one'), 'nullable clearing/default/timestamp');
SELECT pg_temp.assert_true((SELECT updated_at > '2000-01-01' FROM kanban.boards WHERE name='Updated A'), 'board timestamp');
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.boards(owner_id,name) VALUES ('00000000-0000-4000-8000-000000000001',E' \t\n')$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.boards(owner_id,name) VALUES ('00000000-0000-4000-8000-000000000001',repeat('x',101))$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.boards(owner_id,name,description) VALUES ('00000000-0000-4000-8000-000000000001','Long',repeat('x',2001))$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.boards(owner_id,name) VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff','Missing owner')$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.board_columns(board_id,name,position) VALUES ('10000000-0000-4000-8000-000000000001','Custom',3)$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.board_columns(board_id,name,position) VALUES ('10000000-0000-4000-8000-000000000001','Done',0)$q$);
SELECT pg_temp.expect_rejected($q$INSERT INTO kanban.board_columns(board_id,name,position) VALUES ('10000000-0000-4000-8000-000000000001','To Do',0)$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET title=' ' WHERE title='Card one'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET title=repeat('x',201) WHERE title='Card one'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET description=repeat('x',5001) WHERE title='Card one'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET priority='URGENT' WHERE title='Card one'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET position=-1 WHERE title='Card one'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET position=0 WHERE title='Card two'$q$);
SELECT pg_temp.expect_rejected($q$UPDATE kanban.cards SET column_id='ffffffff-ffff-4fff-8fff-ffffffffffff' WHERE title='Card one'$q$);

SET LOCAL ROLE kanban_runtime;
SELECT id FROM kanban.boards WHERE id='10000000-0000-4000-8000-000000000001'
    AND owner_id='00000000-0000-4000-8000-000000000001' FOR UPDATE;
SET CONSTRAINTS kanban.cards_column_position_key DEFERRED;
UPDATE kanban.cards SET position=1 WHERE title='Card one';
UPDATE kanban.cards SET position=0 WHERE title='Card two';
SET CONSTRAINTS kanban.cards_column_position_key IMMEDIATE;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT array_agg(position ORDER BY position)=ARRAY[0,1] FROM kanban.cards), 'deferred reorder');
SAVEPOINT rollback_move;
SET LOCAL ROLE kanban_runtime;
UPDATE kanban.cards SET column_id='20000000-0000-4000-8000-000000000002',position=0 WHERE title='Card one';
ROLLBACK TO SAVEPOINT rollback_move;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT column_id='20000000-0000-4000-8000-000000000001' FROM kanban.cards WHERE title='Card one'), 'rollback restores source');
SET LOCAL ROLE kanban_runtime;
DELETE FROM kanban.boards WHERE id='10000000-0000-4000-8000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM kanban.cards), 'board cascade cards');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM kanban.board_columns), 'other board preserved');
DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM kanban.boards) AND (SELECT count(*)=0 FROM kanban.board_columns), 'auth deletion cascades');
SET LOCAL ROLE anon;
SELECT pg_temp.expect_rejected('SELECT * FROM kanban.boards');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_rejected('SELECT * FROM kanban.cards');
RESET ROLE;
SET LOCAL ROLE kanban_runtime;
SELECT pg_temp.expect_rejected('SELECT * FROM auth.users');
SELECT pg_temp.expect_rejected('CREATE TABLE kanban.forbidden(id integer)');
SELECT pg_temp.expect_rejected('UPDATE kanban.board_columns SET name=''Custom''');
RESET ROLE;
ROLLBACK;
\echo 'Schema verification passed; all fixture mutations rolled back.'
