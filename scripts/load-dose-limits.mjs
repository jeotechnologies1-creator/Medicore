#!/usr/bin/env node
import { runClinicalSafetyCsv } from './lib/load-clinical-safety-csv.mjs';
await runClinicalSafetyCsv('dose_limits', ['import_key', 'item_code', 'weight_basis', 'dose_unit']);
