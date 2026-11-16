#!/usr/bin/env node
import { runClinicalSafetyCsv } from './lib/load-clinical-safety-csv.mjs';
await runClinicalSafetyCsv('interactions', ['import_key', 'item_a_code', 'item_b_code', 'severity', 'interaction_text']);
