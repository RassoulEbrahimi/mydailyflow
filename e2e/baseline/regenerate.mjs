/**
 * regenerate.mjs — rebuilds axe-fingerprints.ts from a recording run.
 *
 * Usage:
 *   MDF_AXE_BASELINE_WRITE=1 npm run test:browser
 *   node e2e/baseline/regenerate.mjs > e2e/baseline/axe-fingerprints.ts
 *
 * Reads the per-cell evidence written by axe.spec.ts into
 * test-results/baseline/axe-*.json and emits the committed baseline module.
 * Output is fully sorted, so regenerating after an unrelated change produces a
 * byte-identical file and an empty diff.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'test-results', 'baseline');

let files;
try {
  files = readdirSync(DIR).filter((f) => f.startsWith('axe-') && f.endsWith('.json'));
} catch {
  console.error(`No evidence in ${DIR}. Run the recording pass first:`);
  console.error('  MDF_AXE_BASELINE_WRITE=1 npm run test:browser');
  process.exit(1);
}

if (files.length === 0) {
  console.error(`No axe-*.json evidence in ${DIR}. Run the recording pass first.`);
  process.exit(1);
}

const cells = new Map();
for (const file of files) {
  const data = JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
  if (!data.cellKey || !Array.isArray(data.axeFingerprints)) {
    console.error(`${file} has no cellKey/axeFingerprints — stale evidence, delete and re-record.`);
    process.exit(1);
  }
  cells.set(data.cellKey, [...new Set(data.axeFingerprints)].sort());
}

const q = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const body = [...cells.keys()]
  .sort()
  .map((key) => {
    const entries = cells.get(key).map((f) => `    ${q(f)},`).join('\n');
    return `  ${q(key)}: [\n${entries}\n  ],`;
  })
  .join('\n');

process.stdout.write(`/**
 * axe-fingerprints.ts — the committed, machine-checkable axe baseline.
 *
 * GENERATED FILE. Do not hand-edit individual entries; regenerate instead.
 *
 * One entry per cell of the measurement matrix (\`viewport|theme|tab\`), holding
 * every axe violating node as a \`rule ID :: normalized target\` fingerprint,
 * deduplicated and sorted.
 *
 * Regenerate:
 *   MDF_AXE_BASELINE_WRITE=1 npm run test:browser
 *   node e2e/baseline/regenerate.mjs > e2e/baseline/axe-fingerprints.ts
 *
 * A regenerated file is byte-identical when nothing changed, so an unexpected
 * diff here is itself the signal.
 *
 * See known-violations.ts for what each rule means and which PR owns it.
 */

export const AXE_FINGERPRINTS: Record<string, string[]> = {
${body}
};
`);
