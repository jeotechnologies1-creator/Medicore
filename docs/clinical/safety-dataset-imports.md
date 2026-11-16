# Clinical safety dataset imports

No medication, interaction, dose, allergen, or terminology reference rows are bundled with this repository. Operators must obtain an appropriately licensed source, have the content reviewed by the facility clinical owner, and follow the source licence before loading it. A successful import marks interaction and dose rows approved under the active Super Admin profile supplied as the clinical owner; treat the owner sign-off as clinical authorization.

All three commands accept comma-separated UTF-8 files with a header row, a `--dry-run` option, and these required metadata flags: `--version`, `--source`, `--licence-note`, `--loaded-by`, `--clinical-owner-name`, `--clinical-owner-profile-id`, and `--clinical-owner-date` (`YYYY-MM-DD`). Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in the operator's secure environment for a real import. The database performs each import and its sign-off in one RPC transaction; failures roll back both. Re-running the same `import_key` updates the same imported row. Duplicate keys in the file, duplicate interaction pairs, unknown ATC codes, and references to unknown formulary keys fail the transaction.

`--dry-run` parses the complete CSV, checks required columns, values, and duplicate import keys, and prints a row-count report without connecting to Supabase or writing data. Foreign-key and code existence checks occur during the transactional import.

## Formulary CSV

Run `node scripts/load-formulary.mjs formulary.csv ...`. Required header:

```text
import_key,atc_code,generic_name,form,strength,unit,route,controlled,active
```

`import_key` is the stable operator/source key used by later interaction and dose-limit files. `atc_code` is optional but, when present, must exist in the facility's loaded active ATC terminology. `controlled` and `active` are optional booleans and default to `false` and `true` respectively. Do not put example or test records in a production file.

## Interaction CSV

Run `node scripts/load-interactions.mjs interactions.csv ...`. Required header:

```text
import_key,item_a_code,item_b_code,severity,interaction_text
```

`item_a_code` and `item_b_code` must reference distinct active formulary `import_key` values. Severity must match the database vocabulary (`contraindicated`, `severe`, `major`, `moderate`, or `minor`). Each imported interaction is activated with the active Super Admin clinical owner's approval metadata.

## Dose-limit CSV

Run `node scripts/load-dose-limits.mjs dose-limits.csv ...`. Required header:

```text
import_key,item_code,age_min_months,age_max_months,weight_basis,dose_unit,min_per_dose,max_per_dose,min_per_day,max_per_day,renal_note,pregnancy_note
```

`item_code` must reference an active formulary `import_key`; `weight_basis` is `fixed` or `per_kg`. Age and bound fields may be empty where the approved source has no bound. Dose values and notes must match the source and facility review. Imported limits are activated with the clinical owner's approval metadata.

## Sign-off and application status

Every successful dataset/version creates or refreshes a sign-off row with dataset name, version, source, licence note, operator, clinical owner name, active owner profile, owner date, and timestamp. Service role can write; only Super Admins can read those records. The prescribing and pharmacy screens show that interaction/dose checks are inactive unless both active rule sets have a signed-off version. This banner reports configuration status; it does not replace clinical review or validate the quality of a source dataset.
