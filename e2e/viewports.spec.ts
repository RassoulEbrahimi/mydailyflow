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

/**
 * On-screen controls allowed below 44x44 CSS px.
 *
 * **Empty since PR4.** PR3 left two entries here — the Daily Essentials counter
 * chips and the inline checklist rows — both deferred because raising them
 * needed the layout work PR4 owns. PR4 did that work (the counter row stacks,
 * the checklist rows are 44px tall), so the list is now empty and *every*
 * on-screen control must meet 44x44.
 *
 * The constant is kept rather than deleted: a future deferral has to be written
 * down here, with a reason and an owner, instead of quietly weakening the
 * assertion.
 */
const TARGET_SIZE_EXCEPTIONS: RegExp[] = [];

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
            /* Text the probe saw but deliberately did not judge, with the
               reason attached — never silently dropped. */
            contrastExcluded: measured.excludedContrast,
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

          // ── Contrast: closed by PR3, and now a hard invariant ────────────
          // PR0 recorded this as "failures exist"; PR3 fixed every measured
          // pair, so the assertion is inverted. The message names the offending
          // pairs so a regression is diagnosable from the failure alone.
          expect(
            failingContrast.map(
              (c) =>
                `${c.foreground} on ${c.background} = ${c.ratio}:1 (needs ${c.threshold}) ` +
                `${c.fontSizePx}px/${c.fontWeight} — ${c.path}`,
            ),
            `${tab} @ ${viewport.name}/${theme}: every measured text pair must meet its WCAG threshold`,
          ).toEqual([]);

          // ── Touch targets: still measured, still asserted ────────────────
          // PR3 raised every control it touches to 44x44. What is left below
          // that bar is enumerated in TARGET_SIZE_EXCEPTIONS with an owner, so
          // a *new* small target fails even though known ones do not.
          const unexpectedSmall = subFortyFour
            .filter((t) => t.inViewport)
            .filter((t) => !TARGET_SIZE_EXCEPTIONS.some((rx) => rx.test(t.path)));

          expect(
            unexpectedSmall.map(
              (t) => `${t.path} — ${t.effectiveWidth}x${t.effectiveHeight} (painted ${t.width}x${t.height})`,
            ),
            `${tab} @ ${viewport.name}/${theme}: no un-owned control below 44x44`,
          ).toEqual([]);
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
        // PR4 made the offset safe-area aware —
        // `calc(env(safe-area-inset-top, 0px) - 1px)` — so the string is no
        // longer a fixed literal. What matters is the resolved value: the hero
        // pins flush with the scroll port (the -1px kills a sub-pixel gap line),
        // plus whatever inset the device reports. Assert the number, not the
        // spelling, or this breaks on the first notched device.
        const resolvedTop = parseFloat(stickyAtTop.top);
        expect(Number.isNaN(resolvedTop), `sticky top resolves to a length (got "${stickyAtTop.top}")`).toBe(false);
        expect(resolvedTop).toBeGreaterThanOrEqual(-1);
        expect(resolvedTop).toBeLessThanOrEqual(0);

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
