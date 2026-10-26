# Integration Catalogue

| Integration | Current evidence | Contract / owner | Failure handling and next action |
|---|---|---|---|
| Supabase Postgres/PostgREST | Browser client, SQL schema/RLS/RPC migrations | Data platform; anon-key client plus authenticated JWT | Surface database errors; staging policy tests and schema migration validation required. |
| Supabase Auth | Persisted browser session; staff/portal Edge Functions | Identity service | Verify MFA, session revocation, account lifecycle, rate limits, and recovery configuration. |
| Private document Storage | Bucket and policy migrations, signed URL path in UI | HIM/document service | Validate MIME/size, malware scanning, retention, short URL lifetime, and denied cross-patient access. |
| Staff provisioning Edge Function | `create-staff` | Admin identity workflow | Server-side secrets only; test authorization, duplicate request, rollback, and audit. |
| Patient portal account Edge Function | `create-patient-portal` | Patient identity workflow | Verify identity proofing, account linkage, recovery, and patient isolation. |
| Database workflow events | Append-only encounter history plus row triggers | Owning service writes in transaction | Current records are not a general event bus/outbox. Add durable retry only for downstream integrations. |
| FHIR export | FHIR-shaped collection export in system module | Data governance/export owner | Not a FHIR API/conformance claim; document resources/version/profile and run validator before exchange. |
| Laboratory equipment/LIS | Not found | Future integration owner: lab director/IT | Define order/result identifiers, acknowledgements, retry/idempotency, downtime/manual reconciliation. |
| PACS/DICOM | Not found | Future integration owner: radiology/IT | Use DICOM/PACS storage; do not store image payloads as ordinary database blobs. |
| Payer/HMO | Manual membership and eligibility history only | Future insurance/finance owner | No live eligibility or claims connection. Define payer auth, correlation IDs, retry and reconciliation. |
| Payment gateway/bank | Facility payment account configuration; no verified gateway | Finance/IT | Require signed callback validation, idempotent payment reference and daily reconciliation. |
| SMS/email/push | Notification rows; no delivery provider verified | Operations/IT | Delivery status/retry/escalation not established. Do not rely on notification alone for critical results. |

For future asynchronous work, persist an outbox event with the domain transaction, assign a stable event ID and schema version, and make consumers idempotent. Never report successful delivery until the provider response is recorded. Critical clinical communication requires explicit acknowledgement and escalation queue.
