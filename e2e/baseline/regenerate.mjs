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
 *
 * Refuses to emit anything but a complete matrix. Duplicate evidence for a cell,
 * a missing cell, a stale cell outside the matrix, or a cell count other than
 * the expected 18 are all hard errors — a partial run must never be mistaken for
 * a baseline.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'test-results', 'baseline');

/**
 * The matrix this baseline must cover, in full.
 *
 * Kept in step with `VIEWPORTS` / `THEMES` / `TABS` in the specs; axe.spec.ts
 * derives the same key set from those constants and asserts the committed file
 * against it, so a divergence between this list and the tests fails the suite
 * rather than quietly producing a short baseline.
 */
const MATRIX_VIEWPORTS = ['360x812', '390x812', '430x812'];
const MATRIX_THEMES = ['dark', 'light'];
const MATRIX_TABS = ['today', 'all', 'done', 'reminders'];

const EXPECTED_KEYS = MATRIX_VIEWPORTS.flatMap((v) =>
  MATRIX_THEMES.flatMap((t) => MATRIX_TABS.map((tab) => `${v}|${t}|${tab}`)),
).sort();

const die = (...lines) => {
  for (const line of lines) console.error(line);
  process.exit(1);
};

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
/** Which file each cell came from, so a duplicate can name both sides. */
const seenIn = new Map();

for (const file of files) {
  const data = JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
  if (!data.cellKey || !Array.isArray(data.axeFingerprints)) {
    die(`${file} has no cellKey/axeFingerprints — stale evidence, delete and re-record.`);
  }

  // A duplicate cell means two runs, or two configurations, wrote evidence for
  // the same matrix position. Overwriting would silently pick whichever file
  // readdir happened to return last, so refuse instead.
  if (cells.has(data.cellKey)) {
    die(
      `Duplicate evidence for cell "${data.cellKey}":`,
      `  ${seenIn.get(data.cellKey)}`,
      `  ${file}`,
      'Refusing to overwrite. Delete test-results/ and re-record so exactly one',
      'evidence file exists per matrix cell.',
    );
  }

  seenIn.set(data.cellKey, file);
  cells.set(data.cellKey, [...new Set(data.axeFingerprints)].sort());
}

// ── The matrix must be complete and contain nothing else ────────────────────
const actualKeys = [...cells.keys()].sort();
const missing = EXPECTED_KEYS.filter((k) => !cells.has(k));
const unexpected = actualKeys.filter((k) => !EXPECTED_KEYS.includes(k));

if (missing.length || unexpected.length) {
  die(
    'The recorded matrix does not match the expected matrix.',
    ...(missing.length ? ['', 'Missing cells (no evidence recorded):', ...missing.map((k) => `  - ${k}`)] : []),
    ...(unexpected.length ? ['', 'Unexpected/stale cells (not part of the matrix):', ...unexpected.map((k) => `  + ${k}`)] : []),
    '',
    'A partial run cannot produce a baseline. Re-record the full suite:',
    '  MDF_AXE_BASELINE_WRITE=1 npm run test:browser',
  );
}

if (actualKeys.length !== EXPECTED_KEYS.length) {
  die(
    `Expected exactly ${EXPECTED_KEYS.length} cells ` +
      `(${MATRIX_VIEWPORTS.length} viewports x ${MATRIX_THEMES.length} themes x ${MATRIX_TABS.length} tabs), ` +
      `got ${actualKeys.length}.`,
  );
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
 * The key set is pinned too, not just the fingerprints: axe.spec.ts asserts that
 * these keys are exactly the measured matrix, so a missing cell and a stale
 * leftover cell both fail the run.
 *
 * See known-violations.ts for what each rule means and which PR owns it.
 */

export const AXE_FINGERPRINTS: Record<string, string[]> = {
${body}
};
`);
