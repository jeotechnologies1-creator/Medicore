# Coded terminology

The terminology foundation registers ICD-10, SNOMED CT, LOINC, and ATC as code systems. It deliberately ships with **no clinical concept codes**. Import only official files obtained under the applicable source licence.

## Import an operator-provided export

Apply migrations to the intended database, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in a secure shell. The loader reads a local UTF-8 CSV or TSV file and makes no network request to any terminology publisher:

```sh
node scripts/load-terminology.mjs 'LOINC' /secure/path/official-export.csv
node scripts/load-terminology.mjs 'SNOMED CT' /secure/path/official-preferred-terms.tsv
```

The file must have a header with one code column and one display column. Accepted aliases include `code` / `conceptId` / `LOINC_NUM` and `display` / `term` / `LONG_COMMON_NAME` / `description`. Optional columns are `active`, `parent_code`, `version`, `source_url`, and `licence_note`. Each code must occur once. For source formats with multiple descriptions per concept, export only the official preferred term before importing. The loader rejects ambiguous duplicate displays, incomplete rows, unrecognized active values, and mixed versions or provenance values. Re-running is idempotent; failed batches can be retried after correcting the file.

The `source_url` and `licence_note` metadata remain operator-managed because the appropriate release URL and licence depend on the exact official edition and jurisdiction. Include those optional columns in the import file only when their values come from the source provider's terms. `loaded_at` and optional `version` are recorded from the completed import.

## Clinical entry and review

Diagnosis, condition, allergy substance, laboratory test, and imaging study fields offer concept search. Selecting a result stores the source system, code, and canonical display alongside the existing text. Typing a value without selecting a result remains supported and is marked **Uncoded free text**. The laboratory module's uncoded-entry report is a security-invoker view, so the underlying table RLS policies continue to control which records the signed-in user can review.

No mapping is inferred for pre-existing free-text records. Review the uncoded report and code those records through the UI when a suitable official concept is available.
