# Performance validation evidence

## Run identity

- Date/time (include timezone):
- Operator:
- Environment/project reference (no credentials):
- Application commit:
- Database migration revision:
- Supabase/Postgres compute class and region:
- Synthetic fixture: patients / vitals per patient / other relevant row counts:
- k6 version and command:
- VUs / iterations per VU:
- Test account role and MFA assurance (do not include account secrets):
- Run ID:

## Configured targets

Record only thresholds explicitly supplied for this run. These are configurable project targets, not repository defaults.

| Operation | Configured p95 target (ms) | Source/approval |
| --- | ---: | --- |
| Login | | |
| Patient search | | |
| Chart open | | |
| Order entry | | |
| Dashboard | | |

## Observed latency

| Operation | Samples | p50 (ms) | p95 (ms) | p99 (ms) | Target met? |
| --- | ---: | ---: | ---: | ---: | --- |
| Login | | | | | |
| Patient search | | | | | |
| Chart open | | | | | |
| Order entry | | | | | |
| Dashboard | | | | | |

- k6 success/error rates:
- Authentication/MFA notes:
- Generated order count and staging cleanup/reset reference:
- Artifact paths for raw k6 JSON and console output:

## Slow-query findings

| Query/RPC | Plan actual time | Buffers/read ratio | Estimated vs actual rows | Sort/hash spill or other finding | Proposed index/migration | Before/after evidence | Decision |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Patient directory | | | | | | | |
| Chart vitals | | | | | | | |
| Dashboard KPIs | | | | | | | |
| Other | | | | | | | |

Attach sanitized `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` output. State whether each plan was captured before or after the proposed index migration. Include index size and write impact when measured.

## Conclusion and follow-up

- Workload profile represented:
- Target results:
- Findings and constraints:
- Indexes retained, deferred, or rolled back:
- Follow-up owner/date:
