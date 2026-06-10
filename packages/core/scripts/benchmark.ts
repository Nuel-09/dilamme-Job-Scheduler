import { refreshBenchmarkReport } from '../src/benchmark-runner.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const report = refreshBenchmarkReport();
console.log(JSON.stringify(report, null, 2));

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '../../../docs/benchmark-results.json');
try {
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nBenchmark results written to ${outputPath}`);
} catch {
  console.log('\nCould not write benchmark-results.json (docs folder may not exist yet)');
}
