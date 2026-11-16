# Laboratory accession, QC, and radiology reporting

## Laboratory

- Each new laboratory order receives a facility/year accession number from an atomic counter. Existing orders are backfilled during migration. The `lab_specimen_labels` view exposes the order, patient, accession, and specimen state to the authenticated app through existing order RLS.
- Labels use the Task 1 in-app printable document renderer and its `record_document_print` audit path. Specimen rejection is recorded through `reject_lab_specimen`, which requires a reason and appends an immutable event.
- QC acceptance rules are facility and coded-analyte scoped. They are empty until a laboratory configures its locally approved bounds. Every run snapshots the active rule and stores a server-calculated pass/fail result. Result release requires the latest run for every analyte in the result to pass; a missing or failed run blocks release.
- Corrections to released results require a reason and retain previous and corrected result JSON in append-only history.

## Radiology

- Reports have `preliminary`, `final`, or `addendum` state. Existing report status remains mapped to `preliminary`, `final`, or `amended` so the established critical-result acknowledgement and escalation triggers continue to apply. Each report revision is retained in history.
- The critical-finding field is checked server side against the assigned active radiologist. Final critical reports use the existing `result_acknowledgements` queue and escalation ladder.
- The study viewer contains a PACS/DICOM placeholder only. No DICOM objects, links, viewers, or network integration are implemented in this task.
