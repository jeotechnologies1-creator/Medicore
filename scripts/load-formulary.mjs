#!/usr/bin/env node
import { runClinicalSafetyCsv } from './lib/load-clinical-safety-csv.mjs';
await runClinicalSafetyCsv('formulary', ['import_key', 'generic_name', 'form', 'strength', 'unit', 'route']);
