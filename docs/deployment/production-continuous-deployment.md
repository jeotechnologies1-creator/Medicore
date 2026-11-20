# Production continuous deployment

`.github/workflows/deploy-production.yml` deploys a revision only after the `CI` workflow passes for a push to `main` or `master`. It applies pending Supabase migrations, deploys every tracked Edge Function, then deploys the Vite frontend to Vercel. Feature branches and pull requests do not deploy to production.

Configure a GitHub Environment named `production` and require the platform owner's approval before the deployment job runs. Restrict changes to this workflow, production secrets, and the protected deployment branch to approved maintainers.

Create these GitHub Environment secrets:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | A Supabase personal access token authorized for the production organization/project. |
| `SUPABASE_PROJECT_REF` | The production Supabase project reference. |
| `SUPABASE_DB_PASSWORD` | The production database password, used only by `supabase link` and `supabase db push`. |
| `VERCEL_ORG_ID` | The Vercel team or personal account ID that owns the production project. |
| `VERCEL_PROJECT_ID` | The Vercel project ID for the EMR frontend. |
| `VERCEL_TOKEN` | A Vercel token authorized to deploy that project. |

After saving the secrets, merge a reviewed commit to the protected default branch. CI runs first; after it passes, approve the `production` environment deployment in GitHub Actions. Review the emitted remote migration list and Vercel deployment URL. The workflow never resets a hosted database and does not deploy a failed CI revision.

Before enabling the workflow for a live clinical project, complete the required staging acceptance and backup checks described in [launch-remediation-guide.md](launch-remediation-guide.md) and [backup-and-recovery.md](backup-and-recovery.md). A protected approval is intentionally retained for schema and Edge Function changes that affect clinical workflows.
