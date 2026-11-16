# Controlled patient record import

Use synthetic records in development and staging. Production CSVs contain protected health information: keep them in the approved operator environment and do not commit them to this repository.

## CSV contract

UTF-8 comma-separated file with one header row. Required columns are `source_record_key`, `first_name`, `last_name`, and `date_of_birth` (`YYYY-MM-DD`). `source_record_key` is a stable unique identifier from the source system and is globally unique across all staged imports. Optional columns are `patient_number`, `gender`, `phone`, `email`, `address`, `blood_group`, `emergency_contact_name`, `emergency_contact_phone`, `allergies`, `chronic_conditions`, and `national_id_hash`. Empty optional values remain null except allergies and chronic conditions, which default to `None` on patient creation. Do not import clinical history through this demographic feed.

## Operator flow

1. Run `node scripts/import-patients.mjs records.csv --facility-id <UUID> --operator-profile-id <UUID> --source-name <label> --dry-run`. The local dry run checks headers, required values, dates, and duplicate source keys, and prints row-level errors. It does not connect to Supabase.
2. Correct all errors, then run the command without `--dry-run` using `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the secure operator environment. This stores the raw source row in quarantine and evaluates candidates using the same name, date-of-birth, phone, national identity hash, and trigram similarity rules as patient registration. It does not create patients.
3. A records officer reviews staged rows through `patient_import_batches` and `patient_import_rows`. Exact matches cannot be approved as new patients. Near-match candidates require a documented reason of at least 10 characters. Review rows in batches with `review_patient_import_batch(batch_id, [{row_id, decision, near_match_reason}])`; `decision` is `approve` or `skip`. Approval sets `home_facility_id` from the batch facility.
4. A records officer can reverse an unused batch with `rollback_patient_import_batch(batch_id, reason)` and a reason of at least 10 characters. Rollback deletes only patients created by that batch; database foreign keys prevent deletion once other records depend on a patient. The migration rollback intentionally refuses to drop quarantine or audit history.

All staging, review, patient creation, and batch rollback changes use the database row audit trigger. Staging and approval are idempotent by source key: an existing key is reported as a validation error and never creates a second patient. The CSV dry run cannot check database candidates because it does not connect; candidate detection occurs during secure staging and is visible to the reviewer before approval.
