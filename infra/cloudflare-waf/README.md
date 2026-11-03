# OneMed edge WAF (Cloudflare)

This Terraform configuration installs Cloudflare's managed WAF and OWASP Core Ruleset, then adds small custom rules for protocol abuse and common secret-file probes. It does not add per-endpoint rate limits. These rules run at Cloudflare's edge before proxied requests are forwarded to an origin.

## Scope and prerequisites

The repository contains a static browser app whose JavaScript connects directly to Supabase. Therefore, protecting only the app hostname does **not** protect Supabase API, Auth, Storage, Realtime, or Edge Function requests. To cover the stack, use Cloudflare proxy DNS for the app hostname and configure Supabase custom domains for the public Supabase services used by the app; then proxy those hostnames through the same zone. Update the app's Supabase URL to the proxied custom API hostname. Confirm the custom-domain setup for the hosted Supabase project before changing production DNS.

Use Cloudflare DNS proxy (orange cloud) on every app and Supabase custom-domain record. A DNS-only record, direct provider hostname, or publicly reachable origin permits bypassing the WAF. Keep origins private or restrict origin ingress to Cloudflare where the hosting provider supports it. Cloudflare cannot proxy the default `*.supabase.co` hostname as your customer zone; a Supabase custom domain is needed to put those requests behind your zone's WAF.

The WAF requires a Cloudflare zone and a plan that includes the selected managed rulesets. Cloudflare may require a paid plan for OWASP managed rules. Check plan availability and existing zone rules before applying: Terraform manages the phase rulesets it declares, so import/reconcile existing rulesets instead of replacing rules maintained elsewhere.

## Apply

Create a Cloudflare API token with Zone WAF Write and Zone Rulesets Write for the target zone. Set it in the shell as `CLOUDFLARE_API_TOKEN`; do not store it in this repository. Copy `terraform.tfvars.example` to `terraform.tfvars` and set the zone ID and hostnames. Keep the copied tfvars out of version control.

```sh
terraform init
terraform plan
terraform apply
```

Review the plan for conflicts with existing managed/custom rulesets. Run first in staging or use a Cloudflare ruleset phase with logging/simulate actions where available; inspect WAF events for legitimate clinical/API traffic before enforcing any additional custom rules. Managed rules are enabled with Cloudflare's current default actions, which may include log or block depending on rule severity and account configuration.

## Rollout checklist

1. Add Supabase custom domains and update the app's Supabase URL, Auth redirect URLs, and any allowed CORS origins.
2. Proxy the app and all Supabase service hostnames through Cloudflare.
3. Confirm requests use those hostnames and that direct origin routes cannot bypass Cloudflare.
4. Apply Terraform, inspect Cloudflare Security Events, and tune false positives with narrow rule overrides.
5. Verify sign-in, refresh, REST, Storage, Realtime, Edge Functions, webhooks, and large uploads through the proxied hostnames.

Terraform only configures the Cloudflare zone; it cannot enroll the domain, configure Supabase custom domains, or change production DNS without the relevant account details and authorization. Until those routing steps are completed, this is a ready-to-deploy WAF configuration, not an active firewall in front of the current project.
