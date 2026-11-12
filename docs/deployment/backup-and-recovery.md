# Backup and recovery

## Recovery objectives

| Objective | Approved value | Owner / approval date |
|---|---|---|
| Recovery time objective (RTO) | **TBD before go-live** | **TBD** |
| Recovery point objective (RPO) | **TBD before go-live** | **TBD** |
| Database recovery retention | **TBD** | **TBD** |
| Off-site backup retention and region | **TBD** | **TBD** |

Do not treat a configured backup as a tested recovery. Production must have named owners, approved RTO/RPO, monitored job results, encrypted off-site storage, and a completed restore drill.

## Supabase database protection

In the Supabase Dashboard, open **Database → Backups** and confirm the production project plan and latest successful backup. Supabase documents daily database backups for paid plans. Enable the **Point-in-Time Recovery (PITR)** add-on in the project's backup settings and select the retention period approved by the data owner. Record the earliest/latest available recovery points and review them at least monthly. Supabase notes that PITR replaces its daily backup schedule, so this runbook separately requires a daily logical export. See [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups) and [PITR usage](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery).

## Daily logical database and Storage backup

Run `node scripts/backup-daily.mjs` daily from a restricted backup runner. Provide `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BACKUP_DIR` through the runner's secret manager. `BACKUP_DIR` must be a mounted encrypted, off-site destination with access logging, retention, and immutability appropriate to the data classification. The script writes a custom-format `pg_dump`, every Storage bucket object, and a manifest. It does not delete older backups. Use a dedicated least-privilege backup credential where supported; never commit credentials or write them to job logs.

Example scheduler (UTC, 02:15 daily):

```cron
15 2 * * * cd /srv/medicore && /usr/bin/node scripts/backup-daily.mjs
```

Alert on non-zero exit, missing manifest, stale backup older than 26 hours, insufficient destination capacity, or a bucket/object count drop. Supabase database backups do not constitute a backup of Storage object bytes. The script downloads objects through Storage APIs; for large buckets, evaluate Supabase's S3-compatible Storage interface or a managed transfer runner and validate object counts and checksums. Supabase describes Storage metadata separately from object bytes in its [Storage backup guidance](https://supabase.com/docs/guides/storage/management/download-objects).

## Restore drill

Perform at least quarterly and after a major schema or backup-process change. Restore to an isolated recovery project; never overwrite production during a drill.

1. Incident commander records the incident time, desired recovery point, approved project, and expected RTO/RPO. Get clinical, privacy, and technical approval before any production restore.
2. Select a PITR point or logical backup. Restore the database into the isolated project and restore Storage objects to its corresponding buckets. Keep outbound integrations disabled and restrict recovery-project access.
3. Apply migrations only if the restore plan calls for a later target schema; record the exact migration set. Do not silently combine data and schema recovery.
4. Run `scripts/restore-verify.sql` as a temporary Super Admin. Compare table counts with the source snapshot/backup manifest and investigate every difference. Confirm `verify_audit_log_chain()` returns `valid: true`.
5. Compare Storage object counts per bucket with the backup manifest. Download samples from each bucket and compare checksums against the backup copy. Confirm private objects remain private and signed URLs are not reused.
6. Validate sample Super Admin, clinician, nurse, records, finance, and patient logins. Verify each role sees only its authorized facility/patient data. Confirm a suspended account cannot sign in or read records.
7. Test patient search, encounter and medication history, final/critical results and acknowledgements, discharge documents, invoices, receipts, and audit access with approved test records.
8. Measure elapsed recovery time and the newest restored transaction. Record achieved RTO/RPO against the approved targets; open actions for any miss.
9. Clinical lead signs clinical validation; security/privacy lead signs access and audit validation; technical lead signs infrastructure validation; incident commander closes the drill. Retain the evidence and remediation owners.

### Verification checklist

- [ ] Restore point and backup IDs recorded; RTO/RPO measured.
- [ ] Counts reviewed for every table in `restore-verify.sql`; exceptions explained.
- [ ] Audit hash chain valid and number of rows checked recorded.
- [ ] Storage bucket counts and sampled object hashes verified.
- [ ] Role login matrix passes; unauthorized patient/facility reads fail.
- [ ] Critical result, medication, billing, and patient document samples verified.
- [ ] Integrations remain disabled until recovery approval.
- [ ] Clinical, security/privacy, technical, and incident-command sign-offs recorded.
- [ ] Findings assigned an owner and due date.

## Recovery approvals

Production recovery requires incident commander approval, clinical operations approval for patient-care impact, and security/privacy approval for data integrity/access impact. Restore into a new project first when feasible, compare and approve recovered state, then follow the separately approved cutover plan.
