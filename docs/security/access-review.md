# Quarterly access review and dormant accounts

## Review cadence and scope

The Super Admin and department managers complete this review every quarter and after role, facility, or employment changes. Review staff accounts, role and department, facility memberships, patient assignments, privileged capabilities, recent sign-in, service credentials, and emergency access. Managers attest that access matches current duties; security reviews Super Admin and integration access; HR confirms active employment. Retain reviewer, review date, exceptions, remediation owner, and completion evidence.

## Dormant account report

After migration `20261112000049_operations_readiness.sql`, a Super Admin can call `public.list_dormant_staff(false)`. It lists active or suspended non-patient profiles whose last successful Supabase sign-in is older than 60 days, falling back to profile creation time for never-signed-in accounts. Review the list with HR before taking action; service accounts and approved leave must be considered explicitly.

To optionally suspend the returned dormant accounts, call `public.list_dormant_staff(true)`. This sets the profile status to `suspended`, invokes the profile audit workflow, and records an audit event. It does not delete accounts or revoke an external identity-provider account. Confirm sign-in is denied, revoke active sessions through the approved Auth process when needed, and coordinate restoration through the identity-verification workflow.

Example (authenticated Super Admin SQL/API session):

```sql
select * from public.list_dormant_staff(false); -- review only
select * from public.list_dormant_staff(true);  -- suspend after approval
```

## Evidence checklist

- [ ] Staff roster reconciled with HR and current facility assignments.
- [ ] Role/department/facility access attested by the responsible manager.
- [ ] Dormant-account report reviewed; exceptions and suspensions documented.
- [ ] Privileged accounts and service credentials have named owners and MFA/rotation evidence.
- [ ] Suspended accounts tested for denied access; active sessions handled as required.
- [ ] Least-privilege exceptions have approver, reason, expiry, and review date.
- [ ] Findings assigned, closed, and retained with the quarterly review record.
