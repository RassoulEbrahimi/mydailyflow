/**
 * report.ts — writes measured findings somewhere a human can read them.
 *
 * Two sinks, on purpose:
 *   1. `testInfo.attach` puts the JSON inside the Playwright HTML report, next
 *      to the test that produced it.
 *   2. `test-results/baseline/*.json` collects the same payloads on disk so
 *      docs/a11y-baseline-1a.md can be regenerated from real numbers rather
 *      than from memory.
 *
 * Both destinations are gitignored. The suite never writes into the repo tree.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { TestInfo } from '@playwright/test';

const BASELINE_DIR = path.join(process.cwd(), 'test-results', 'baseline');

/** Filesystem-safe slug for a measurement name. */
const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function recordFindings(
  testInfo: TestInfo,
  name: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify(payload, null, 2);

  await testInfo.attach(`${name}.json`, {
    body,
    contentType: 'application/json',
  });

  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(path.join(BASELINE_DIR, `${slug(name)}.json`), body, 'utf8');
}

/**
 * Records a finding *and* annotates the test with a one-line summary, so the
 * gap is visible in the run output instead of being buried in an attachment.
 */
export function annotate(testInfo: TestInfo, type: string, description: string): void {
  testInfo.annotations.push({ type, description });
}
