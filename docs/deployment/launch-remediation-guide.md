# OneMed launch remediation guide

This guide separates repository fixes from controls that require access to the target hospital, hosted Supabase projects, vendors, or clinical governance. Complete every applicable item and store sanitized evidence in the [go-live evidence tracker](../status/evidence-tracker.md). Do not store patient data, passwords, API keys, or MFA secrets in the tracker.

## 1. Configure each environment independently

1. In the static host's staging environment, set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY` to the staging project and the staging hostname. Set the matching values separately in production. Use the anon/publishable key only; never put a service-role key in a `VITE_` variable.
2. In each Supabase project's Auth settings, enable Turnstile CAPTCHA and set the matching server-side Turnstile secret. Configure the exact allowed redirect URLs, site URL, SMTP delivery, password policy, session lifetime, and MFA requirements using [hosted-auth-settings.md](hosted-auth-settings.md).
3. Confirm the deployed app fails closed when public Supabase configuration is absent: sign-in must not authenticate, and the app must not connect to another environment.
4. Deploy the frontend and check that the response includes the expected security headers. The repository CSP permits Supabase hosted-project subdomains. If using a custom Supabase domain or self-hosted Supabase, change the CSP sources in `public/_headers`, `vercel.json`, `vite.config.js`, and `scripts/serve.mjs` to the exact approved origins; do not add a broad wildcard.
5. With the correct public variables in the environment, run `npm run verify:hosted-config`. Resolve every `FAIL`; investigate every `UNVERIFIABLE` manually. The script makes requests to the configured hosted Auth endpoint.
6. Record project references, frontend origins, build revision, check output, reviewer, and date in the evidence tracker. Do not record keys.

## 2. Apply and validate database changes

1. Back up or snapshot the staging database and reconcile its migration history against the actual schema. Never mark a migration as applied based only on its filename.
2. Set `STAGING_PROJECT_REF` to the staging project reference and link the Supabase CLI to that project. Review `supabase migration list --remote` against the checked-in migration stream before applying anything.
3. Run `npm run check:migrations`, then push pending migrations to staging with `supabase db push --remote`. Review the remote migration list again and inspect any migration errors or legacy-data exceptions.
4. Deploy the Edge Functions required by the enabled workflows. At minimum, follow [supabase/DEPLOYMENT.md](../../supabase/DEPLOYMENT.md), set their required server-side secrets, and deploy `create-staff`, `create-patient-portal`, `integration-dispatch`, `integration-webhook`, `notification-dispatch`, `monitoring`, and `fhir-r4` only where those features are in scope.
5. Use separate non-production accounts for every staff role and a patient account. Verify allowed and denied access for each facility and department, including direct API requests and cross-patient/document attempts. Confirm the migrations for MFA, patient scope, read auditing, and public `SECURITY DEFINER` execution are present in the target history.
6. Complete [staging acceptance](staging-acceptance.md), review its commit-specific evidence, then promote the same reviewed migration revision to production under the organization's change-control process. Do not use synthetic records in production.

## 3. Validate clinical workflows with named owners

1. Name a medical director, nursing lead, pharmacy lead, laboratory lead, radiology lead, transfusion lead, privacy officer, security lead, and technical operations owner. Each owner must approve the workflows and thresholds in their domain.
2. Replace draft privacy and terms notices with notices approved for the deployment jurisdiction, organization, data flows, patient portal, and retention practices. Update the notice/terms version identifiers recorded by the login flow, obtain legal/privacy approval, and verify acceptance is recorded before staff or patient accounts are enabled.
3. Configure licensed terminology and the facility formulary. Confirm diagnosis, allergy, medication, laboratory, and procedure concepts retain codes and display text. Validate the actual drug catalog, dose limits, interactions, units, and local protocols before prescribing or administration.
4. Have clinical owners validate escalation thresholds and actions with representative non-production scenarios. The nursing ward board currently labels its scoring tool as a placeholder and does not calculate a score. Do not use it as a clinical early-warning score until the facility has chosen the tool, implemented it, validated it, and approved the workflow.
5. Test the full clinical journey using synthetic staging patients: identity and duplicate review; consent; appointment; encounter and signed note; observations; orders; result verification and correction; critical-result acknowledgement and escalation; medication order, dispense, and administration; admission, handover, transfer, discharge; and record amendment.
6. Have the lab lead verify critical-result routing from result creation through named recipient, acknowledgement timeout, escalation, corrected result handling, and recorded audit evidence. The current code includes in-app notification paths but no provider-verified SMS/email/push delivery. If external delivery is required, configure the notification connector, secrets, retries, delivery status, and on-call escalation; test provider failure and recovery. Keep a staffed in-app escalation queue until approved alternate channels are operational.
7. Configure transfusion compatibility rules and obtain transfusion-service approval; missing compatibility rules must remain fail-closed. Validate surgical, anaesthesia, and blood-bank workflows against local policy before using them for care.
8. Decide the facility's initial service scope. The repository inventory marks maternity/newborn as planned, and appointment management, inpatient operations, HIM, HR, and some other workflows as partial. For each needed workflow, either defer that service from digital use with an approved downtime/manual process or fund implementation and clinical acceptance before launch.
9. Record test scenarios, expected outcomes, evidence, defects, owner approval, and date without patient-identifying data.

## 4. Connect external systems only after contract and safety review

The repository does not establish working connectivity to a hospital LIS/equipment, PACS/DICOM, payer, bank/payment provider, or patient messaging provider. For each integration required at launch:

1. Obtain the vendor's interface specification, sandbox credentials, data-processing agreement, security contact, support hours, and production onboarding procedure.
2. Agree identifiers, message/resource versions, acknowledgements, idempotency keys, retry limits, timeout behavior, reconciliation owner, downtime procedure, and PHI minimization.
3. Implement against the sandbox using server-side secrets and a least-privilege service identity. Do not route vendor secrets through the browser or commit them to the repository.
4. Test duplicate, delayed, reordered, malformed, rejected, and unavailable-provider scenarios. Reconcile source and destination records and prove that retries do not create duplicate clinical or financial events.
5. Obtain department owner sign-off and record the tested vendor version, configuration owner, monitoring, escalation contact, and production cutover plan.

FHIR exchange also needs an interoperability owner to validate resource profiles, terminology, identifiers, authorization, pagination, audit logging, and round-trip behavior with the receiving system. The current patient export is not evidence of a certified or conformant production interface.

## 5. Establish recovery and security operations

1. Apply the operations-readiness migration in staging, then production, and test downtime read-only enforcement for every covered workflow/table.
2. Enable Supabase PITR and record retention and recovery points. Configure the daily logical database and Storage backup runner with a secured server-side service key, encrypted off-site storage, access controls, failure alerting, and a named operator.
3. Schedule `npm run backup:daily` from a secured runner with `DATABASE_URL`, `BACKUP_DIR`, `SUPABASE_URL`, and the server-side service key. Confirm the backup destination is outside the application host and is not publicly accessible.
4. Approve numeric RTO/RPO targets. Restore a backup into an isolated project, run the row-count and hash-chain checks, verify Storage objects, and sign in with representative roles. Record duration, defects, and owner approval.
5. Configure and deploy the monitoring function with exact allowed origins, service-only polling, alert thresholds, delivery route, and an on-call owner. Trigger a controlled alert and prove it reaches the responder.
6. Complete a downtime tabletop exercise with paper forms, unique downtime identifiers, reconciliation ownership, medication/lab/imaging workflows, and post-recovery reconciliation. Review the [downtime procedure](downtime-procedure.md).
7. Complete access reviews, verify two independently controlled active Super Admin accounts, test termination/revocation, and complete the break-glass procedure.
8. Have privacy/security owners approve the risk analysis, local-law review, data processing agreements, retention schedule, legal holds, access requests, breach response, device/session controls, and audit retention.

## 6. Final release decision

Before production patient data is entered, the clinical governance lead, privacy/security lead, and platform owner must review the completed evidence tracker and sign the release decision. Any applicable row still marked `Unverified`, any failed staging acceptance check, or any unresolved safety/security defect blocks launch. Reassess this gate after every schema, policy, clinical rule, or integration change.
