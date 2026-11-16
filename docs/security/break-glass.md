# Super Admin continuity and break-glass recovery

This procedure is for restoring access to an existing Super Admin account when the normal sign-in or account administration path is unavailable. It is not a routine account-provisioning method. The database prevents demoting, suspending, or deleting the last active Super Admin; maintain at least two independently controlled active Super Admin accounts.

## Facility assignments before go-live

The facility must fill in and approve these placeholders before using recovery:

- Authorizing role/title: **[facility-designated authorizing role/title]**
- Recovery operator role/title: **[facility-designated technical operator role/title]**
- Independent post-use reviewer role/title: **[facility-designated audit reviewer role/title]**
- Incident/change record location: **[facility ticket or incident system]**
- Secure service-key retrieval location: **[facility-approved secrets vault]**
- Escalation contact if recovery or audit logging fails: **[facility contact/process]**

The authorizer must be independent of the person performing the recovery. The facility decides which positions may fill these duties and records deputies and contact methods; this repository does not assign named people or roles.

## Recovery steps

1. Open an incident/change record. Record the business reason, affected project, target Auth UID, requested email change, and expected review time. Do not record a password, service key, or other secret in the ticket.
2. The authorizer verifies the request and the target account owner's identity through the facility's approved identity-check process, then records approval in the incident record.
3. The operator confirms the target is linked to an **active `super_admin` profile** in the intended Supabase project. Verify that the replacement mailbox is controlled by the account owner. If the account is suspended or the profile is not an active Super Admin, stop and use the separately approved account-administration process.
4. Retrieve the project service-role/secret key from the approved vault. Run `node scripts/recover-admin-login.mjs` directly in a private interactive terminal. Enter the project URL, target Auth UID, replacement email, and key/password only at the hidden prompts. Never put credentials in command-line arguments, shell history, environment dumps, tickets, screenshots, or chat.
5. The script confirms the Auth email and password update, synchronizes the linked profile email, then writes an `account_recovered` success event through `record_account_admin_audit`. The event uses actor label `break-glass script`, records the target Auth UID/email and outcome, and contains no password or service key. If the recovery succeeds but the audit write fails, stop and notify the designated reviewer and escalation contact immediately; record the event through the facility's approved audit-failure process.
6. Confirm the account owner can sign in through the normal application. Verify or re-enroll the required MFA factor and review active sessions using the facility-approved Supabase procedure. Do not send the new password to the user; have the account owner set a unique password through the approved secure channel.

## Required post-use review

The independent reviewer checks the incident record against the `account_admin_audit` entry (`action = account_recovered`, `details.actor = break-glass script`, target UID/email, and `outcome = success`), confirms that no credential was recorded, verifies account access and MFA/session handling, and documents findings and corrective actions. Complete this review within **[facility-approved review interval]**. Investigate any missing or mismatched audit record as an incident. Close the recovery record only after the review is signed off and the Super Admin count is at least two, or a documented continuity plan is approved while a second account is restored.

Review this procedure at least annually and after any break-glass use. Keep the authorization record and audit evidence according to the facility's approved retention policy.
