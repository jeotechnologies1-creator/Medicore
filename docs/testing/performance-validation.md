# Staging performance validation

This harness measures Supabase Auth, the patient directory RPC, chart open, synthetic lab-order entry, and dashboard KPI RPC. It is for a dedicated staging project populated only with synthetic records. It creates audit entries and the k6 run leaves synthetic lab orders behind; reset the staging database or remove the marked fixture records through the approved staging reset process after evidence is collected. Never run it against production or use real patient credentials/data.

## Prepare the staging fixture

1. Apply all current migrations to the staging project. Use the existing `search_patient_directory`, `read_patient_chart`, and `get_screen_kpis` RPCs; keep the harness on the same JWT/RLS path as the application.
2. Create an active staging-only Super Admin or Records Officer profile for directory search and chart access, plus a designated synthetic patient whose `patient_number` is `LOAD-1`. Assign the patient to the tested facility. Chart access must pass the ordinary patient/facility checks. For order entry, supply a clinician profile allowed to author laboratory orders in that facility. Super Admin and clinician profiles may require TOTP MFA.
3. Run the rolled-back SQL fixture in a disposable copy of staging. Defaults are 100,000 patients and 20 vitals per patient; override the volume with psql variables as appropriate:

   ```sh
   psql "$STAGING_DATABASE_URL" -v patient_count=100000 -v vitals_per_patient=20 -f scripts/load-test.sql
   ```

   The fixture runs `ANALYZE`, captures `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` for directory and recent-vitals queries, and rolls generated rows back. The transaction may still consume substantial CPU, WAL, audit-trigger work, and temporary disk; start with smaller values and increase gradually. Save the complete psql output with the result record.

## Run the user-path harness

Install k6 in the operator environment. Set secrets in that environment only, then run `k6 run scripts/performance-staging.k6.js`. Required settings:

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | Staging Supabase project URL |
| `SUPABASE_ANON_KEY` | Staging public anon key |
| `PERF_EMAIL`, `PERF_PASSWORD` | Dedicated staging-only test identity |
| `PERF_PATIENT_ID` | UUID for synthetic `LOAD-1` patient |
| `PERF_FACILITY_ID` | Facility UUID used for dashboard scope |
| `PERF_CLINICIAN_ID` | Authorized facility clinician profile for the test order |

Optional settings: `PERF_TOTP_SECRET` (Base32 secret for the test profile's verified TOTP factor), `PERF_SEARCH_QUERY` (defaults to `LOAD-1`), `PERF_RUN_ID`, `PERF_VUS`, `PERF_ITERATIONS_PER_VU`, and `PERF_RESULTS_PATH` (defaults to `performance-results.json`). One full workflow creates one laboratory order per iteration with a `PERF_SYNTHETIC_...` test type; these are retained until staging reset.

The result JSON records p50 and p95 for login, patient search, chart open, order entry, and dashboard calls. Targets are optional per-step settings such as `PERF_TARGET_LOGIN_P95_MS=...` or `PERF_TARGET_CHART_OPEN_P95_MS=...`. No target value is supplied by this repository; teams should set thresholds from their approved product requirements and the tested staging environment. The script adds a k6 threshold only when its corresponding target variable is provided.

For a run that includes a TOTP factor, authentication performs the Auth password flow, factor lookup, challenge, and verification. Password login time is recorded as `login_ms`; the MFA endpoints remain visible in k6 HTTP request metrics. The harness sends no service-role key.

## Review query plans and indexes

Record the fixture plan output and dashboard plan output from `scripts/load-test-him-dashboard.sql` with the same staging identity and data volume. Compare actual execution time, shared buffer reads/hits, row estimates versus actual rows, sort/hash spills, and repeated sequential scans. Do not add indexes solely because a query has a sequential scan on a small fixture; check whether it remains slow at the intended synthetic volume and whether the predicate matches an existing index.

Migration `20261116000078_patient_directory_search_index.sql` isolates a candidate trigram index for the actual `search_patient_directory` wildcard expression, which spans name, MRN, patient number, and phone and is not the same expression as the older individual identity indexes. Compare plans and timing before and after applying this migration in staging. Keep the index only when measured benefit justifies its storage and write cost; its rollback is separate. Write any other index proposal as a new migration rather than editing historical migrations. Dashboard and patient-vitals indexes already exist in earlier migrations; record whether the plans use them before proposing duplicates.

## Evidence

Fill in [the results template](performance-results-template.md) with project/environment identifiers (never keys), migration revision, fixture size, k6 settings, configured thresholds, p50/p95 observations, EXPLAIN output, and index decision. Include the generated JSON and sanitized SQL plan text as artifacts. Do not copy auth tokens, TOTP secrets, or patient details into the evidence.
