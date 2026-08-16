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
 */

import AxeBuilder from '@axe-core/playwright';

import { annotate, recordFindings } from './utils/report';
import { expect, test, THEMES, VIEWPORTS, type Tab } from './fixtures/app';
import {
  KNOWN_AXE_VIOLATIONS,
  VIOLATION_OWNERS,
  type AxeTab,
  type AxeTheme,
} from './baseline/known-violations';
import { measureBoundaries, measurePage } from './utils/measure';

const TABS: AxeTab[] = ['today', 'all', 'done'];

/** Set true to record the measured rule IDs without asserting against the baseline. */
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
            `${viewport.name}/${theme}/${tab}: axe rules [${ruleIds.join(', ')}] · ` +
              Object.entries(byCategory)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · '),
          );

          for (const rule of ruleIds) {
            annotate(testInfo, 'expected-failure', `${rule} — ${VIOLATION_OWNERS[rule] ?? 'unclassified; triage in PR3.'}`);
          }

          if (WRITE_MODE) {
            // Recording pass: no assertion, so the baseline file can be filled in.
            return;
          }

          // The committed baseline is a ratchet in both directions.
          expect(
            ruleIds,
            `${theme}/${tab} axe violations must match the committed Phase 1A baseline. ` +
              'A longer list is a regression; a shorter one means something was fixed — ' +
              'update e2e/baseline/known-violations.ts and docs/a11y-baseline-1a.md together.',
          ).toEqual(KNOWN_AXE_VIOLATIONS[theme][tab]);

          // Categories the brief requires evidence for must actually have been
          // measured; an empty category would mean the probe stopped working.
          expect(byCategory['unnamed buttons'] ?? 0).toBeGreaterThan(0);
          expect(byCategory['hit area below 44x44 CSS px'] ?? 0).toBeGreaterThan(0);
        });
      }
    });
  }
}
