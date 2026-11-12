# Monitoring and alerting

## Implemented endpoints and signals

Deploy the `monitoring` Supabase Edge Function. `GET /functions/v1/monitoring` is a low-sensitivity uptime check; it returns HTTP 200 only when the database can answer the check. Configure an external uptime monitor from an approved network and alert after the agreed consecutive-failure threshold.

Client error reporting is installed in the application. Before sending, the browser constructs an allowlisted event containing only event type, approved error class, approved module name, and environment. It does not send error message, stack, request/response, user, patient, or URL data. The Edge Function validates the same allowlist and stores bounded metadata in `monitoring_events`. Notification-dispatch failures use the shared safe Edge reporter. Expand Edge Function instrumentation as functions are deployed; platform runtime logs remain the source for uninstrumented failures.

The authenticated `get_operations_alerts()` RPC and service-only `GET /functions/v1/monitoring?alerts=1` summarize:

- Failed FHIR exchange jobs (`fhir_exchange_jobs.status = failed`).
- Due, unacknowledged or escalated critical result acknowledgements.
- Failed outbound messages after retries are exhausted.
- Failed password/profile login attempts reported by the client and failed account-administration audit outcomes in the last 24 hours (a bounded authentication/admin anomaly indicator; not a complete Supabase Auth sign-in log).
- Edge Function error telemetry in the last 24 hours.

Poll the service-only alert endpoint from an approved alerting job and send notifications to the configured on-call destination. Set thresholds with clinical and operations owners. The repository provides counters/endpoints but does **not** configure the external monitor, on-call recipients, alert delivery channel, `ALLOWED_ORIGINS`, or production secrets. Record those settings and test each alert before go-live.

## Secret and privacy handling

- Set the function's `SUPABASE_SERVICE_ROLE_KEY` only in Supabase secrets and the secured backup/monitoring runner. Never send it to browsers or include it in URLs.
- The `?alerts=1` route requires the service-role bearer credential; do not expose it in a public monitor. Run it from a secrets-managed scheduled worker.
- Do not forward general application exceptions, message bodies, SQL errors, URLs, headers, or clinical payloads to third-party error services. If adding a vendor, keep the allowlist contract and complete a privacy/security review first.
- Restrict dashboard and telemetry access; define retention and deletion periods with the privacy owner.

## Alert response

| Signal | First response |
|---|---|
| Uptime check fails | Check Supabase status, network/DNS, Edge Function deployment and database health; declare downtime if clinical access is impacted. |
| Failed jobs | Inspect bounded job identifiers in the authorized operations console; retry only after validating idempotency and destination status. |
| Critical results overdue | Contact the responsible clinician through the escalation policy; record read-back and acknowledgement in the EMR. |
| Failed outbound messages | Review connector health and queue age; use approved alternate communication for urgent results. |
| Authentication/admin anomalies | Review account administration audit and Supabase Auth logs; revoke sessions or suspend accounts under incident procedure. |
| Edge Function errors | Inspect function logs and deployment/secrets. Logs must not contain tokens or patient payloads. |

Test a synthetic event and each alert route quarterly. Record owner, test time, delivery result, and corrective actions. Never use real patient data as a test payload.
