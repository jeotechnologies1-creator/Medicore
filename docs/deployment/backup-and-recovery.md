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

Run `npm run backup:daily` daily from a restricted backup runner. Provide `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `BACKUP_DIR` through the runner's secret manager. Configure `BACKUP_ENCRYPTION_RECIPIENT` as an age public recipient (for example, an `age1...` recipient); the script never accepts or stores a private identity. Without a recipient it refuses to run. `BACKUP_ALLOW_UNENCRYPTED=true` is a local-development-only override and prints a loud warning. The script creates a custom-format `pg_dump`, downloads Storage objects, writes per-file SHA-256 entries in the encrypted `backup-manifest.txt`, creates an age-encrypted tar archive, and records the encrypted archive's SHA-256 in `backup.sha256`. It rereads and validates source payload checksums after packaging/encryption; the restore procedure verifies the archive hash and all decrypted payload hashes before restore. The private age identity must be held separately by the recovery operator.

Optional S3-compatible upload requires all of `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, and `BACKUP_S3_SECRET_ACCESS_KEY`; `BACKUP_S3_REGION` is optional. The script uploads the encrypted archive and its checksum sidecar, then checks remote object length and SHA-256 metadata. Partial configuration is an error. Do not put credentials in command arguments, source control, or logs. `BACKUP_OBJECT_TIMEOUT_MS` can raise the per-object download timeout (default 900000 ms). `BACKUP_RETENTION_DAYS` is optional; when set to an integer from 1 through 3650, the script removes only older backup directories bearing its ownership marker and a matching checksum-verified artifact, and only after the newest local archive and any configured remote upload have verified and the success timestamp has been saved. Configure durable, access-controlled, versioned/immutable off-site storage and its own lifecycle policy as required by the facility.

On any backup failure the command exits non-zero, emits a safe `edge_error` event to the monitoring function when its Supabase credentials are available, and omits exception text and backup contents from logs. If local archive verification succeeded before an upload or status-write failure, the verified local artifact is retained for recovery/retry, but the run does not update the success timestamp. On full success it updates the service-role-only `backup_status.last_success_at` row. The monitoring health response reports `backup_stale` and returns unhealthy when the timestamp is missing or older than `BACKUP_STALE_AFTER_HOURS` (default 26). This requires the `20261116000051_backup_status_tracking.sql` migration and a deployed monitoring function. Confirm alert routing in the target environment; it has not been verified against a live Supabase project here.

An example GitHub Actions workflow is in `.github/workflows/backup.yml`. Scheduled runs are disabled unless repository variable `ENABLE_BACKUPS` is exactly `true`. The schedule in the example is 02:15 UTC daily and should be changed to the facility's approved schedule. A manual dispatch also requires all workflow credentials. Configure these repository secrets: `BACKUP_DATABASE_URL`, `BACKUP_SUPABASE_URL`, `BACKUP_SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_ENCRYPTION_RECIPIENT`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, and `BACKUP_S3_SECRET_ACCESS_KEY`. Optional repository variables are `BACKUP_RETENTION_DAYS` and `BACKUP_S3_REGION`. Protect workflow edits and secret access, and ensure the S3 destination has the facility's approved retention and recovery access controls. The workflow has not been run against a live project or bucket.

For a non-GitHub runner, an example scheduler (UTC, 02:15 daily) is:

```cron
15 2 * * * cd /srv/medicore && /usr/bin/node scripts/backup-daily.mjs
```

Alert on non-zero exit, missing checksum sidecar, `backup_stale`, insufficient destination capacity, or an unexpected bucket/object count drop. Supabase database backups do not constitute a backup of Storage object bytes. The script downloads objects through Storage APIs; for large buckets, evaluate Supabase's S3-compatible Storage interface or a managed transfer runner. The script records object counts and verifies the downloaded object bytes against its manifest. Supabase describes Storage metadata separately from object bytes in its [Storage backup guidance](https://supabase.com/docs/guides/storage/management/download-objects).

## Restore drill

Perform at least quarterly and after a major schema or backup-process change. Restore to a disposable isolated database/project; never overwrite production during a drill. The automated restore helper is intentionally limited to database names containing `restore` or `disposable`; non-local targets also require `RESTORE_ALLOW_NONLOCAL=true`.

For an age-encrypted backup, download both `backup.<timestamp>.tar.age` and its `backup.sha256` sidecar into one directory. Provide the recovery operator's separately held private identity file as `BACKUP_DECRYPT_IDENTITY_FILE`; never copy it into the backup or application repository. Set `RESTORE_DATABASE_URL` to an empty disposable PostgreSQL database. For restoring object bytes, also set `RESTORE_SUPABASE_URL` and `RESTORE_SUPABASE_SERVICE_ROLE_KEY` for the matching isolated Supabase recovery project. Then run:

```sh
npm run restore:backup -- /path/to/backup.tar.age
```

The helper checks the sidecar hash, rejects unsafe tar paths/links, decrypts into a temporary directory, verifies each manifest checksum, restores with `pg_restore`, uploads the Storage object bytes when present, and runs `scripts/restore-verify.sql` with `psql`. It deletes its temporary extraction on exit. This command can overwrite objects in the configured recovery project's matching buckets; use a disposable recovery target. A full restore drill and bucket parity have not been performed against a live project.

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
