/**
 * Per-project counts from a Playwright JSON report, plus the axe findings the
 * a11y spec wrote to test-results/axe/ (for docs/QA_REPORT.md).
 *
 *   node scripts/summarize.mjs [test-results/offline-results.json]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const file = process.argv[2] ?? 'test-results/offline-results.json';
const report = JSON.parse(readFileSync(file, 'utf8'));
const counts = {};
function walk(suite) {
  for (const s of suite.suites ?? []) walk(s);
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) {
      const c = (counts[t.projectName] ??= { passed: 0, failed: 0, skipped: 0, flaky: 0 });
      const st = t.status === 'expected' ? 'passed' : t.status === 'unexpected' ? 'failed' : t.status === 'flaky' ? 'flaky' : 'skipped';
      c[st]++;
    }
  }
}
for (const s of report.suites) walk(s);
console.log('| project | passed | failed | flaky | skipped |\n| --- | ---: | ---: | ---: | ---: |');
for (const [p, c] of Object.entries(counts)) console.log(`| ${p} | ${c.passed} | ${c.failed} | ${c.flaky} | ${c.skipped} |`);
console.log(`duration: ${Math.round(report.stats.duration / 1000)} s`);

const axeDir = 'test-results/axe';
if (existsSync(axeDir)) {
  const agg = {};
  let scans = 0;
  for (const proj of readdirSync(axeDir))
    for (const f of readdirSync(join(axeDir, proj))) {
      scans++;
      const j = JSON.parse(readFileSync(join(axeDir, proj, f), 'utf8'));
      for (const v of j.violations) {
        const k = `${v.impact} ${v.id}`;
        agg[k] ??= { n: 0, where: new Set() };
        agg[k].n++;
        agg[k].where.add(`${proj}:${j.name}`);
      }
    }
  console.log(`\naxe scans: ${scans}`);
  for (const [k, v] of Object.entries(agg)) console.log(`  ${k}: ${v.n} (${[...v.where].slice(0, 6).join(', ')})`);
  if (Object.keys(agg).length === 0) console.log('  no violations');
}
