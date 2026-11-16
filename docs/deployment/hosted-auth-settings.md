# Hosted Auth and API settings

`supabase/config.toml` configures the local Supabase stack. It does not apply these values to a hosted project. Set and review the settings separately in each hosted staging and production project before staff onboarding.

## Auth settings

| Hosted setting | Required value for this repo | Notes |
| --- | --- | --- |
| CAPTCHA protection | Enabled; provider **Cloudflare Turnstile**. Configure the matching secret in Supabase Auth and the public site key as `VITE_TURNSTILE_SITE_KEY` in the frontend host build. | The site key must allow the exact deployed frontend hostname. Never put the secret in a `VITE_` variable. A public probe can verify that a sign-in without a CAPTCHA token is rejected, but cannot verify provider identity or secret/site-key pairing. Confirm Auth CAPTCHA is available on the selected plan. |
| Signup switches | Global email signup disabled; email signup disabled; phone signup disabled; anonymous sign-in disabled. | Staff are provisioned through the authorized admin workflow. Public signup must remain off. |
| Email confirmation | Enabled. Double confirmation for email changes enabled. Secure password change enabled. | These match `[auth.email]` in the local config. |
| Password policy | Minimum length **12**; require lowercase, uppercase, digits, and symbols (`lower_upper_letters_digits_symbols`). | Enable leaked-password protection if the hosted plan supports it; Supabase marks this feature as plan-dependent. |
| MFA | TOTP authenticator enrollment and verification enabled. Permit up to **10** enrolled factors per user. The app requires AAL2 for `super_admin`, `accountant`, `doctor`, `pharmacist`, `surgeon`, and `specialist` roles. | The app/database enforce AAL2 for these roles; confirm hosted Auth MFA settings support TOTP. The repository config labels Auth MFA as Pro-plan functionality. Test enroll, verify, challenge, and sensitive writes with each role in staging. |
| Auth session timebox | **12 hours**. | Hosted Auth session setting; do not confuse with JWT expiry. |
| Auth inactivity timeout | **2 hours**. | The frontend additionally signs out after an idle period configured in app settings; its default is **30 minutes** (allowed range 5–1440 minutes). Keep the hosted cap at 2 hours. |
| `site_url` | The canonical HTTPS origin of this facility's deployed application, for example `https://emr.facility.example`. | Replace the local `http://127.0.0.1:3000` value. |
| Additional redirect URLs | Exact HTTPS application origins and callback URLs used by the deployed app, including staging separately in the staging project. | Do not use broad wildcards. Replace the local loopback redirect. Test invite, email confirmation, recovery, and sign-in redirects. |
| Custom SMTP | Enabled with facility-approved sender name/address, verified sending domain, SMTP host, port, username, and server-side password/secret. Use TLS submission (typically port **587**) where supported by the chosen SMTP service. | The repo intentionally selects no SMTP vendor or facility values. Configure SPF, DKIM, and DMARC with the mail-domain owner and test invites, confirmation, and recovery email delivery. Supabase's default SMTP is not appropriate for facility onboarding. Delivery capacity and limits depend on the selected external service. |
| JWT expiry | **3600 seconds (1 hour)**. | Matches `jwt_expiry = 3600`; refresh-token rotation should remain enabled. |
| API exposure | Browser uses only the hosted **Project URL** and **anon/publishable key**. Keep the service-role/secret key server-side. Expose only the schemas and Storage buckets required by the deployed application; keep RLS enabled on application data. | Set frontend `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` per environment. Never use production values in a public test environment. The public verification script does not inspect API schema exposure or RLS. |

## Frontend and Edge API settings

Serve the security headers in [`public/_headers`](../../public/_headers) from the public frontend host, including the Content Security Policy. Set the exact deployed origins in the server-side `ALLOWED_ORIGINS` configuration for the Edge Functions that enforce origin checks. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY` are public build-time values; `SUPABASE_SERVICE_ROLE_KEY`, Turnstile secret, and SMTP credentials are server-side secrets only.

## Public verification

Run the checker against each environment after deploying the frontend and configuring Auth:

```sh
HOSTED_APP_URL=https://emr.facility.example \
SUPABASE_URL=https://project-ref.supabase.co \
SUPABASE_ANON_KEY=your-public-anon-key \
node scripts/verify-hosted-config.mjs
```

The anon key is public and can also be supplied as `VITE_SUPABASE_ANON_KEY`. The script never requests or prints a secret key. It checks the public password-sign-in response for CAPTCHA enforcement, confirms signup is disabled, and compares public frontend response headers with `public/_headers`. It reports password policy, MFA, timeouts, redirect configuration, SMTP, JWT expiry, and Turnstile provider/secret pairing as **UNVERIFIABLE** because those require authenticated project configuration or dashboard review. An unverifiable setting is never reported as passed, and any unverifiable or failed result gives a nonzero exit code. Complete those checks manually and record evidence before go-live.

The checker submits only synthetic credentials at `example.invalid`; it does not create a real account or send email. Run it against staging first, then production, and review the output together with the manual settings checklist above.
