# Staging acceptance evidence

Run the repository and staging checks sequentially with:

```sh
npm run staging:evidence
```

The command writes `artifacts/staging-evidence/staging-evidence-<UTC timestamp>.md`. The report includes the exact Git commit, whether the working tree was dirty, each check result (`PASS`, `FAIL`, or `SKIPPED`), elapsed time, and the reason for failures/skips. A check that could not run is never reported as passing. A nonzero command exit means at least one check failed or was skipped; review its report before acceptance.

## Required target configuration

Set the staging targets and production deny-lists in the shell or a protected environment file. The script refuses to run the suite unless both staging URLs are distinct from production URLs and both production URL lists are configured.

```sh
export STAGING_SUPABASE_URL="https://<staging-project-ref>.supabase.co"
export STAGING_PROJECT_REF="<staging-project-ref>"
export STAGING_APP_URL="https://<staging-app-host>"
export PRODUCTION_SUPABASE_URLS="https://<production-project-ref>.supabase.co"
export PRODUCTION_APP_URLS="https://<production-app-host>"
```

The `Hosted configuration` probe also requires `STAGING_SUPABASE_ANON_KEY`. Remote migration comparison uses the Supabase CLI v3 `--remote=<project-ref>` target and an authenticated CLI session; an unavailable CLI is reported as skipped, while auth failure or an unparseable comparison is a failure. Neither outcome is a pass. [Supabase CLI migration list](https://supabase.com/docs/reference/cli/supabase-migration-list) compares the repository migration timestamps with the remote migration history.

## Disposable database and browser checks

pgTAP runs only when `STAGING_DISPOSABLE_DB_URL` points to a dedicated disposable database and `PRODUCTION_DATABASE_URLS` is configured. The script refuses to run the pgTAP suite when that database identity matches a listed production database. Never provide the application staging database as the disposable test database. Database test files run transactionally and roll back their fixtures.

Playwright runs only with `STAGING_SUPABASE_ANON_KEY` and `STAGING_SUPABASE_SERVICE_ROLE_KEY`; these values are passed to the test process with the staging URL. The service-role key must belong only to the staging project. The existing Playwright global setup creates or updates synthetic `@example.test` accounts in Auth and profiles, so this suite must never point at production. Any `CI_E2E_*_EMAIL` value outside `@example.test` or `@example.invalid` causes the browser suite to be skipped. Existing test suites may leave these synthetic accounts in staging; they must not contain real user or patient information.

Deno tests are skipped with a reason when Deno is unavailable. The other checks run in order: lint, static checks, migration structure, production build, bundle-size check, hosted configuration, remote migration comparison, disposable pgTAP, Deno tests, and Playwright.

## Review and evidence

The report is command output evidence, not a go-live approval. The owners in the [go-live evidence tracker](../../docs/status/evidence-tracker.md) must review relevant outcomes and attach any required dashboard, backup, recovery, clinical governance, and privacy evidence. Keep report artifacts in a restricted location if target hostnames or repository details are sensitive. Never put service-role keys, database URLs, passwords, or patient data in the report or shell history.

Optional: set `STAGING_EVIDENCE_DIR` to a repository-relative or absolute output directory. Do not set it to a public artifact location unless the report is approved for publication.
