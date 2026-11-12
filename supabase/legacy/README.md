# Legacy SQL snapshots

The files in this directory are historical copies or one-off SQL fragments retained for reference. They are not an installation or upgrade path and must not be applied directly. The authoritative, ordered database change set is `supabase/migrations/`; update that stream with a new timestamped migration and a corresponding rollback plan instead.

The legacy role-enum conversion was incorporated into `20261026000012_role_authorization.sql`. The department/service payment helper was incorporated into `20261112000037_department_service_payments.sql`. Other files with numbered migration counterparts are superseded by those migrations; `payment_dispute_workflow.sql` exists only as its numbered migration.
