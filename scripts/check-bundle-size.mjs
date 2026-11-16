import { readFile } from 'node:fs/promises';
import path from 'node:path';

const reportPath = path.resolve('dist/bundle-size-report.json');
const budgets = {
  totalGzipBytes: 8 * 1024 * 1024,
  largestChunkGzipBytes: 2 * 1024 * 1024,
  minimumDynamicChunks: 5
};

let report;
try {
  report = JSON.parse(await readFile(reportPath, 'utf8'));
} catch {
  console.error('FAIL  Bundle report is missing or invalid. Run `npm run build` first.');
  process.exit(1);
}

const checks = [
  ['Total JavaScript gzip size', report.totalGzipBytes, budgets.totalGzipBytes, 'bytes'],
  ['Largest JavaScript chunk gzip size', report.largestChunkGzipBytes, budgets.largestChunkGzipBytes, 'bytes'],
  ['Dynamic JavaScript chunks', report.chunks.filter((chunk) => chunk.dynamicEntry).length, budgets.minimumDynamicChunks, 'minimum']
];

let failed = false;
for (const [label, actual, budget, unit] of checks) {
  const passed = unit === 'minimum' ? actual >= budget : actual <= budget;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${label}: ${actual} (budget ${unit === 'minimum' ? `>= ${budget}` : `<= ${budget}`} ${unit === 'bytes' ? 'bytes' : 'chunks'})`);
  failed ||= !passed;
}

console.log('\nLargest JavaScript chunks (gzip):');
for (const chunk of report.chunks.slice(0, 12)) {
  console.log(`  ${(chunk.gzipBytes / 1024).toFixed(1).padStart(7)} KiB  ${chunk.file}${chunk.entry ? ' [entry]' : ''}${chunk.dynamicEntry ? ' [lazy]' : ''}`);
}

if (failed) process.exitCode = 1;
