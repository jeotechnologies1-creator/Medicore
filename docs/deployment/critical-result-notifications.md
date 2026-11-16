# Critical result notifications

Critical lab results that are finalized or corrected, and critical radiology results that are finalized or amended, create an in-app alert and a durable outbound queue entry for the responsible clinician. An overdue result also queues a neutral notice for each configured escalation recipient. The acknowledgement UUID in the notice is an opaque routing reference; recipients must sign in to review and acknowledge the result.

The external message intentionally contains only `A critical result is awaiting acknowledgement.`, the opaque reference, and the facility's HTTPS app login URL. This minimizes exposure if a recipient's email or phone is shared, misdirected, or displayed on a lock screen. Patient names, result values, diagnoses, and result types stay in the authenticated application. The login URL is added by `notification-dispatch` at send time and is not stored in the queue payload.

## External scheduling when database scheduling is unavailable

The migration registers one-minute `pg_cron` jobs when the required extensions and Vault secrets are available. If `pg_cron` or `pg_net` is unavailable, a facility can use a protected scheduler such as GitHub Actions. The example below runs every five minutes; store the database connection string and service-role key as encrypted repository secrets named `SUPABASE_DB_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. It requires `psql` and `curl` on the runner. Restrict workflow changes and secret access to deployment maintainers.

```yaml
name: Drain MediCore notification queues
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Escalate overdue results
        env:
          DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'select public.escalate_overdue_results();'
      - name: Dispatch notifications
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: >-
          curl --fail-with-body --silent --show-error
          -X POST "$SUPABASE_URL/functions/v1/notification-dispatch"
          -H "Authorization: Bearer $SERVICE_ROLE_KEY"
          -H "Content-Type: application/json"
          -d '{}'
      - name: Dispatch integrations
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: >-
          curl --fail-with-body --silent --show-error
          -X POST "$SUPABASE_URL/functions/v1/integration-dispatch"
          -H "Authorization: Bearer $SERVICE_ROLE_KEY"
          -H "Content-Type: application/json"
          -d '{}'
```

Apply the database migration, deploy both dispatch functions, and configure `MEDICORE_APP_LOGIN_URL` before enabling the workflow. Validate the workflow in staging with synthetic data. Failed deliveries are retried and appear in Operations → Super Admin; monitor the `undelivered_critical_result_messages` counter. Do not enable this schedule as a substitute for assigning escalation recipients and reviewing the facility's acknowledgement deadlines.

## Connector setup

No real SMS or email provider is configured by this repository. Until the facility sets up a provider-neutral connector endpoint, its credential, and `MEDICORE_NOTIFICATION_CONNECTOR_JSON`, outbound delivery will fail and remain visible for operations follow-up. The dispatcher accepts a connector endpoint plus a secret-variable name; it does not hardcode a vendor. Local Deno tests use an in-memory mock connector and make no external calls.
