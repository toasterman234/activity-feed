-- Destructive rollback for the additive durable work-run schema.
-- Export work_runs before applying this rollback if production attempts exist.
BEGIN;
DROP TABLE IF EXISTS work_runs;
COMMIT;

