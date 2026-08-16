/**
 * axe.spec.ts — axe-core scan of every reachable tab, in both themes, at all
 * three baseline viewports.
 *
 * The Erinnerungen tab is deliberately absent: it opens nothing, so there is no
 * fourth surface to scan. That gap is covered by nav.spec.ts.
 *
 * Findings are classified into the categories the Phase 1A brief asks for:
 *   - normal-text contrast below 4.5:1
 *   - large-text contrast below 3:1
 *   - interactive boundary / focus indicator contrast below 3:1
 *   - hit areas below 44x44 CSS px
 *   - unnamed buttons
 *   - incorrect or missing checkbox semantics
 *
 * axe covers the first two and the fifth directly. The other three are measured
 * here explicitly, because axe's own target-size and focus-indicator coverage
 * does not reach controls that are click-handled <div>s or that never receive a
 * focus style at all.
 *
 * ── What is ratcheted, and what is only recorded ──────────────────────────────
 *
 * RATCHETED (asserted for exact equality against a committed baseline):
 *   the full set of axe violating nodes, per viewport/theme/tab, as
 *   `rule ID :: normalized target` fingerprints. Adding a node, removing a node,
 *   moving a node to a different element, adding a rule and removing a rule all
 *   fail the run.
 *
 * RECORDED ONLY (measured, attached, annotated — but not pinned node by node):
 *   the harness's own measurements — sub-44px targets, unnamed controls,
 *   boundary contrast, and the full contrast table. These are asserted to be
 *   *non-empty*, which proves the probe still works, not that the exact set is
 *   unchanged. Their numbers live in docs/a11y-baseline-1a.md and in the
 *   generated JSON evidence.
 */

import AxeBuilder from '@axe-core/playwright';

import { annotate, recordFindings } from './utils/report';
import { expect, test, THEMES, VIEWPORTS, type Tab } from './fixtures/app';
import {
  axeFingerprint,
  cellKey,
  VIOLATION_OWNERS,
  type AxeTab,
  type AxeTheme,
} from './baseline/known-violations';
import { AXE_FINGERPRINTS } from './baseline/axe-fingerprints';
import { measureBoundaries, measurePage } from './utils/measure';

const TABS: AxeTab[] = ['today', 'all', 'done'];

/**
 * Every cell the matrix is supposed to cover, derived from the same VIEWPORTS,
 * THEMES and TABS the tests iterate — never hand-listed, so the expectation
 * cannot drift from what actually runs.
 *
 * The committed baseline's key set is pinned against this. Comparing
 * fingerprints alone is not enough: a cell whose entry went missing would make
 * `AXE_FINGERPRINTS[key]` undefined, and a *stale* cell left behind after a
 * viewport or tab is renamed would simply never be looked at. Both are silent
 * holes in the baseline, so both are assertion failures.
 */
const EXPECTED_CELL_KEYS: string[] = VIEWPORTS.flatMap((viewport) =>
  (THEMES as AxeTheme[]).flatMap((theme) =>
    TABS.map((tab) => cellKey(viewport.name, theme, tab)),
  ),
).sort();

/**
 * Recording pass: measure and write the fingerprints without asserting, so the
 * committed baseline can be regenerated. See the header of
 * `e2e/baseline/axe-fingerprints.ts` for the exact regeneration command.
 */
const WRITE_MODE = process.env.MDF_AXE_BASELINE_WRITE === '1';

interface ClassifiedFinding {
  category: string;
  rule: string;
  impact: string | null;
  target: string;
  detail: string;
}

for (const theme of THEMES as AxeTheme[]) {
  for (const viewport of VIEWPORTS) {
    test.describe(`axe · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme },
        viewport: { width: viewport.width, height: viewport.height },
      });

      for (const tab of TABS) {
        test(`${tab} tab`, async ({ app }, testInfo) => {
          await app.navButton(tab as Tab).click();
          await app.page.waitForTimeout(250);

          const results = await new AxeBuilder({ page: app.page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();

          const ruleIds = [...new Set(results.violations.map((v) => v.id))].sort();

          // One fingerprint per violating node: `rule :: normalized target`.
          // Deduplicated and sorted so the comparison is order-independent and
          // the committed baseline diffs cleanly.
          const fingerprints = [
            ...new Set(
              results.violations.flatMap((v) =>
                v.nodes.map((n) => axeFingerprint(v.id, n.target)),
              ),
            ),
          ].sort();

          const key = cellKey(viewport.name, theme, tab);

          // ── Classify every axe node into the brief's categories ───────────
          const classified: ClassifiedFinding[] = [];

          for (const violation of results.violations) {
            for (const node of violation.nodes) {
              const target = node.target.join(' ');

              if (violation.id === 'color-contrast') {
                const data = (node.any[0]?.data ?? {}) as {
                  fgColor?: string;
                  bgColor?: string;
                  contrastRatio?: number;
                  fontSize?: string;
                  fontWeight?: string;
                  expectedContrastRatio?: string;
                };
                const expectedRatio = data.expectedContrastRatio ?? '';
                const isLarge = expectedRatio.startsWith('3');
                classified.push({
                  category: isLarge
                    ? 'large-text contrast below 3:1'
                    : 'normal-text contrast below 4.5:1',
                  rule: violation.id,
                  impact: violation.impact ?? null,
                  target,
                  detail: `fg ${data.fgColor} on bg ${data.bgColor} = ${data.contrastRatio}:1 (needs ${expectedRatio}; ${data.fontSize}, weight ${data.fontWeight})`,
                });
                continue;
              }

              if (violation.id === 'button-name' || violation.id === 'link-name') {
                classified.push({
                  category: 'unnamed buttons',
                  rule: violation.id,
                  impact: violation.impact ?? null,
                  target,
                  detail: node.html.slice(0, 160),
                });
                continue;
              }

              if (
                violation.id === 'aria-required-attr' ||
                violation.id === 'aria-allowed-attr' ||
                violation.id === 'aria-required-children' ||
                violation.id === 'nested-interactive'
              ) {
                classified.push({
                  category: 'incorrect or missing checkbox/control semantics',
                  rule: violation.id,
                  impact: violation.impact ?? null,
                  target,
                  detail: node.html.slice(0, 160),
                });
                continue;
              }

              if (violation.id === 'target-size') {
                classified.push({
                  category: 'hit area below 44x44 CSS px',
                  rule: violation.id,
                  impact: violation.impact ?? null,
                  target,
                  detail: node.failureSummary?.slice(0, 160) ?? node.html.slice(0, 160),
                });
                continue;
              }

              classified.push({
                category: 'other',
                rule: violation.id,
                impact: violation.impact ?? null,
                target,
                detail: node.failureSummary?.slice(0, 160) ?? node.html.slice(0, 160),
              });
            }
          }

          // ── Measurements axe does not make ────────────────────────────────
          const measured = await measurePage(app.page);
          const subFortyFour = measured.hitTargets.filter((t) => !t.meets44);

          for (const target of subFortyFour) {
            classified.push({
              category: 'hit area below 44x44 CSS px',
              rule: 'measured:target-size',
              impact: 'serious',
              target: target.path,
              detail: `"${target.label || '(no accessible name)'}" (${target.role}) = ${target.width}x${target.height} CSS px`,
            });
          }

          for (const control of measured.namelessControls) {
            classified.push({
              category: 'unnamed buttons',
              rule: 'measured:control-name',
              impact: 'serious',
              target: control.path,
              detail: `${control.tag} / ${control.role} — ${control.hint}`,
            });
          }

          // Interactive boundary contrast: an unchecked task checkbox is drawn
          // as a 2px border ring, which is the only thing distinguishing it from
          // the card. WCAG 1.4.11 wants 3:1 for that boundary.
          const boundaries = await measureBoundaries(app.page);

          for (const boundary of boundaries.filter((b) => !b.meets3)) {
            classified.push({
              category: 'interactive boundary contrast below 3:1',
              rule: 'measured:non-text-contrast',
              impact: 'serious',
              target: boundary.path,
              detail: `"${boundary.label}" border ${boundary.borderColor} on ${boundary.background} = ${boundary.ratio}:1 (needs 3:1)`,
            });
          }

          const byCategory: Record<string, number> = {};
          for (const finding of classified) {
            byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
          }

          await recordFindings(testInfo, `axe-${viewport.name}-${theme}-${tab}`, {
            viewport: viewport.name,
            theme,
            tab,
            cellKey: key,
            /* The ratcheted set. Also the regeneration source — see
               e2e/baseline/axe-fingerprints.ts. */
            axeFingerprints: fingerprints,
            axeRuleIds: ruleIds,
            axeViolationCount: results.violations.reduce((n, v) => n + v.nodes.length, 0),
            passes: results.passes.length,
            incomplete: results.incomplete.map((i) => ({ id: i.id, nodes: i.nodes.length })),
            categoryCounts: byCategory,
            findings: classified,
            /* Every measured contrast pair on this surface, passing or not. */
            allContrastPairs: measured.contrast,
          });

          annotate(
            testInfo,
            'baseline',
            `${key}: ${fingerprints.length} violating nodes across [${ruleIds.join(', ')}] · ` +
              Object.entries(byCategory)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · '),
          );

          for (const rule of ruleIds) {
            annotate(testInfo, 'expected-failure', `${rule} — ${VIOLATION_OWNERS[rule] ?? 'unclassified; triage in PR3.'}`);
          }

          if (WRITE_MODE) {
            // Recording pass: no assertion, so the baseline file can be regenerated.
            return;
          }

          // ── The matrix itself is pinned, before any fingerprint is compared ──
          // Checked inside the existing cells rather than as a separate test, so
          // the reported test count stays at 36.
          expect(
            Object.keys(AXE_FINGERPRINTS).sort(),
            'The committed axe baseline must cover exactly the measured matrix ' +
              `(${VIEWPORTS.length} viewports x ${THEMES.length} themes x ${TABS.length} tabs = ` +
              `${EXPECTED_CELL_KEYS.length} cells).\n` +
              '  · A missing key means a viewport/theme/tab has no baseline at all.\n' +
              '  · An extra key means a stale cell left behind after a rename or removal, ' +
              'which nothing would ever compare against.\n' +
              'Regenerate with e2e/baseline/regenerate.mjs.',
          ).toEqual(EXPECTED_CELL_KEYS);

          const expected = AXE_FINGERPRINTS[key];

          expect(
            expected,
            `No committed axe baseline for cell "${key}". Every viewport/theme/tab ` +
              'combination must be represented — regenerate e2e/baseline/axe-fingerprints.ts.',
          ).toBeDefined();

          // ── The two-directional ratchet ─────────────────────────────────────
          // Exact equality on the full node-level fingerprint set. This fails on
          // all five transitions the baseline has to catch:
          //   a new node under an existing rule, a removed/fixed node, a node
          //   that moved to a different element, a new rule, a removed rule.
          expect(
            fingerprints,
            `Cell "${key}": the set of axe violating nodes no longer matches the ` +
              'committed Phase 1A baseline.\n' +
              '  · Extra fingerprints  = a regression: a new violating element.\n' +
              '  · Missing fingerprints = something was fixed. That is good, and it ' +
              'still fails here on purpose: update e2e/baseline/axe-fingerprints.ts ' +
              'and docs/a11y-baseline-1a.md in the same PR so the recorded baseline ' +
              'never drifts from the code.',
          ).toEqual(expected);

          // The harness's own measurements are recorded rather than pinned, so
          // these assertions only prove the probes still find something. The
          // exact sets live in the JSON evidence and the baseline document.
          expect(
            byCategory['unnamed buttons'] ?? 0,
            'the unnamed-control probe still reports findings',
          ).toBeGreaterThan(0);
          expect(
            byCategory['hit area below 44x44 CSS px'] ?? 0,
            'the target-size probe still reports findings',
          ).toBeGreaterThan(0);
        });
      }
    });
  }
}
