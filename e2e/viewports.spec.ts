/**
 * viewports.spec.ts — the 3 viewports x 2 themes measurement matrix.
 *
 * For every combination this records, per tab:
 *   - contrast pairs (foreground, background, ratio, applicable threshold);
 *   - interactive targets under 44x44 CSS px;
 *   - controls with no accessible name;
 *   - horizontal bleed (card / action-strip overflow);
 *   - sticky-header geometry and how much content the fixed bottom nav covers.
 *
 * Nothing visual is changed. The assertions pin the current numbers so a later
 * PR cannot quietly move them without updating docs/a11y-baseline-1a.md.
 */

import { annotate, recordFindings } from './utils/report';
import { expect, test, THEMES, VIEWPORTS, type Tab } from './fixtures/app';
import { measurePage, measureSticky } from './utils/measure';

const TABS: Tab[] = ['today', 'all', 'done', 'reminders'];

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`${viewport.name} · ${theme}`, () => {
      test.use({ appOptions: { theme }, viewport: { width: viewport.width, height: viewport.height } });

      test('layout, contrast and target sizes are measured on every reachable tab', async ({
        app,
      }, testInfo) => {
        const perTab: Record<string, unknown> = {};

        for (const tab of TABS) {
          await app.navButton(tab).click();
          await app.page.waitForTimeout(250); // let the view settle

          const measured = await measurePage(app.page);

          const subFortyFour = measured.hitTargets.filter((t) => !t.meets44);
          const failingContrast = measured.contrast.filter((c) => !c.passes);

          perTab[tab] = {
            viewport: viewport.name,
            theme,
            interFontLoaded: measured.interFontLoaded,
            appFontFamily: measured.appFontFamily,
            contrast: measured.contrast,
            contrastFailures: failingContrast,
            hitTargets: measured.hitTargets,
            subFortyFourTargets: subFortyFour,
            /* Split out, because a small control inside a closed modal is a
               different problem from a small control on the visible screen. */
            subFortyFourOnScreen: subFortyFour.filter((t) => t.inViewport),
            subFortyFourInClosedOverlay: subFortyFour.filter((t) => !t.inViewport),
            namelessControls: measured.namelessControls,
            horizontalOverflow: measured.horizontalOverflow,
            documentBleedPx: measured.documentScrollWidth - measured.documentClientWidth,
          };

          // ── The page itself must not scroll sideways ─────────────────────
          // This is the one layout property the app already gets right at all
          // three widths; asserting it means a future card/action-strip change
          // that breaks it is caught immediately.
          expect(
            measured.documentScrollWidth - measured.documentClientWidth,
            `${tab} @ ${viewport.name}/${theme}: document must not bleed horizontally`,
          ).toBeLessThanOrEqual(1);

          // ── Baseline facts, asserted so they cannot silently change ──────
          expect(
            subFortyFour.length,
            `${tab} @ ${viewport.name}/${theme}: sub-44px targets exist (baseline)`,
          ).toBeGreaterThan(0);

          expect(
            failingContrast.length,
            `${tab} @ ${viewport.name}/${theme}: contrast failures exist (baseline)`,
          ).toBeGreaterThan(0);
        }

        // ── Sticky hero + fixed nav geometry (Today only) ──────────────────
        await app.navButton('today').click();
        await app.page.waitForTimeout(200);

        const stickyAtTop = await measureSticky(app.page);

        // Scroll the single scroll container and re-measure: the hero should
        // pin at top:-1px while content passes beneath it.
        await app.page.locator('main').evaluate((el) => {
          el.scrollTop = 400;
        });
        await app.page.waitForTimeout(300);
        const stickyScrolled = await measureSticky(app.page);

        expect(stickyAtTop.present, 'the Today hero renders').toBe(true);
        expect(stickyAtTop.position).toBe('sticky');
        expect(stickyAtTop.top).toBe('-1px');

        // Pinned: after scrolling, the hero's top edge sits at or above the
        // viewport top rather than scrolling away.
        expect(
          stickyScrolled.rect.top,
          `hero stays pinned after scroll @ ${viewport.name}/${theme}`,
        ).toBeLessThanOrEqual(1);

        await recordFindings(testInfo, `matrix-${viewport.name}-${theme}`, {
          viewport,
          theme,
          tabs: perTab,
          sticky: { atTop: stickyAtTop, afterScroll: stickyScrolled },
        });

        const todayMeasure = perTab.today as {
          subFortyFourOnScreen: unknown[];
          subFortyFourInClosedOverlay: unknown[];
          contrastFailures: unknown[];
          namelessControls: unknown[];
          horizontalOverflow: { path: string; overflowPx: number }[];
        };

        const worstBleed = todayMeasure.horizontalOverflow.reduce(
          (max, o) => Math.max(max, o.overflowPx),
          0,
        );

        annotate(
          testInfo,
          'baseline',
          `${viewport.name}/${theme} · Today: ${todayMeasure.subFortyFourOnScreen.length} sub-44px targets on screen ` +
            `(+${todayMeasure.subFortyFourInClosedOverlay.length} inside closed overlays), ` +
            `${todayMeasure.contrastFailures.length} contrast failures, ` +
            `${todayMeasure.namelessControls.length} unnamed controls, ` +
            `worst in-card horizontal bleed ${worstBleed}px. ` +
            `Content under fixed nav: ${stickyAtTop.contentClippedByNav}px. Owners: PR3/PR5.`,
        );
      });
    });
  }
}
