/**
 * essentials-contrast.spec.ts — regression cover for the Light-theme Daily
 * Essentials legibility defect.
 *
 * Real-device evidence (Android, Light theme) showed incomplete Essential
 * titles rendering nearly white on the pale card, worst on Persian/RTL titles.
 * Root cause: the titles used the hardcoded Tailwind class `text-slate-200`,
 * a dark-palette colour that never switched with the theme.
 *
 * The existing axe ratchet did flag this pair (PR0 baseline §3.2 recorded
 * `#e2e8f0 on #e9ecf3 = 1.04:1`) but it was recorded as a known violation
 * rather than treated as a defect, so nothing failed. These tests close that
 * gap by asserting the *rendered* contrast directly, at every viewport and in
 * both themes, for realistic multi-language content.
 *
 * They measure composited computed colours — not class names — because the
 * defect was invisible at the class level.
 */

import { expect, test, VIEWPORTS, waitForAppShell } from './fixtures/app';
import { measureTextContrast } from './utils/measure';
import { recordFindings } from './utils/report';

/**
 * Realistic Essentials covering the languages and row types from the report:
 * German and Persian simple toggles, German and mixed-language counter rows,
 * emoji, and a completed item.
 */
const ESSENTIALS = [
  { id: 'c-de-simple', title: 'Vitamin D einnehmen', targetCount: 1, order: 0, createdAt: '2026-05-19T06:00:00.000Z' },
  { id: 'c-fa-simple', title: 'ویتامین دی', targetCount: 1, order: 1, createdAt: '2026-05-19T06:01:00.000Z' },
  { id: 'c-emoji', title: 'صبحانه 🍳 (پروتئین بار یا تخم‌مرغ)', targetCount: 1, order: 2, createdAt: '2026-05-19T06:02:00.000Z' },
  { id: 'c-de-counter', title: 'Wasser trinken', targetCount: 3, order: 3, createdAt: '2026-05-19T06:03:00.000Z' },
  { id: 'c-mixed-counter', title: 'مکمل Kreatin 💪 nehmen', targetCount: 2, order: 4, createdAt: '2026-05-19T06:04:00.000Z' },
  { id: 'c-done', title: 'Erledigtes Essential', targetCount: 1, order: 5, createdAt: '2026-05-19T06:05:00.000Z' },
];

/** `c-done` is complete; everything else is deliberately incomplete. */
const PROGRESS: Record<string, number> = { 'c-done': 1 };

// Selectors are rooted at the Daily Essentials list container (`.bg-surface-dim`)
// and its header badge. Scoping matters: a broader `section .text-[12px]` also
// matches the Today time-block labels ("06:00 – 12:00") in App.tsx, which have
// their own pre-existing light-theme contrast defect owned by the PR3 token
// sweep. This hotfix must neither fix nor be blocked by that.

/** Essential titles: 15px/500 — normal text, so the bar is 4.5:1, never 3:1. */
const TITLE_SELECTOR = '.bg-surface-dim .text-\\[15px\\]';
/** "0/3" progress readouts inside the compact stepper. */
const PROGRESS_SELECTOR = '.bg-surface-dim [data-essential-type="multiple"] [role="status"]';
/** The "x/y" completion badge in the section header. */
const BADGE_SELECTOR = '.text-\\[13px\\].rounded-full';
async function seedEssentials(app: { page: import('@playwright/test').Page }) {
  await app.page.evaluate(
    ({ essentials, progress }) => {
      localStorage.setItem(
        'myDailyFlowEssentialsData',
        JSON.stringify({ version: 1, data: essentials }),
      );
      localStorage.setItem(
        'myDailyFlowEssentialsState',
        JSON.stringify({ version: 1, data: { date: '2026-05-20', progressById: progress } }),
      );
      localStorage.setItem('myDailyFlow_essentialsCollapsed', 'false');
    },
    { essentials: ESSENTIALS, progress: PROGRESS },
  );
  await app.page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppShell(app.page);
}

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of VIEWPORTS) {
    test.describe(`Daily Essentials contrast · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('every Essential title meets 4.5:1 against its card', async ({ app }, testInfo) => {
        await seedEssentials(app);

        const titles = await measureTextContrast(app.page, TITLE_SELECTOR);

        // The fixture must actually have rendered, or this test proves nothing.
        expect(titles.length, 'Essential titles are on screen').toBeGreaterThanOrEqual(
          ESSENTIALS.length,
        );

        await recordFindings(testInfo, `essentials-contrast-${viewport.name}-${theme}`, {
          viewport: viewport.name,
          theme,
          titles,
        });

        for (const sample of titles) {
          // Titles are 15px/500. If a future change makes one "large text", the
          // 3:1 bar would silently apply — so assert the classification too.
          expect(
            sample.isLargeText,
            `"${sample.text}" is normal text, so 4.5:1 applies (measured ${sample.fontSizePx}px/${sample.fontWeight})`,
          ).toBe(false);

          expect(
            sample.ratio,
            `"${sample.text}" — ${sample.foreground} on ${sample.background} = ${sample.ratio}:1, needs ${sample.threshold}:1 (${theme}, ${viewport.name})`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });

      test('no incomplete title is near-white on the light card', async ({ app }) => {
        await seedEssentials(app);

        const titles = await measureTextContrast(app.page, TITLE_SELECTOR);
        const relativeLuminance = (hex: string) => {
          const n = parseInt(hex.slice(1), 16);
          const ch = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return (
            0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
          );
        };

        for (const sample of titles) {
          if (theme !== 'light') continue;
          // The exact shape of the reported defect: light text on a light card.
          const fgL = relativeLuminance(sample.foreground);
          const bgL = relativeLuminance(sample.background);
          expect(
            fgL,
            `"${sample.text}" must not be near-white text on a light card (fg ${sample.foreground}, bg ${sample.background})`,
          ).toBeLessThan(bgL);
        }
      });

      test('progress readouts and the header badge stay readable', async ({ app }) => {
        await seedEssentials(app);

        const progress = await measureTextContrast(app.page, PROGRESS_SELECTOR);
        const badge = await measureTextContrast(app.page, BADGE_SELECTOR);

        expect(progress.length, '"0/3" progress text is on screen').toBeGreaterThan(0);
        expect(badge.length, 'the header x/y badge is on screen').toBeGreaterThan(0);

        for (const sample of [...progress, ...badge]) {
          expect(
            sample.ratio,
            `"${sample.text}" — ${sample.foreground} on ${sample.background} = ${sample.ratio}:1, needs ${sample.threshold}:1 (${theme}, ${viewport.name})`,
          ).toBeGreaterThanOrEqual(sample.threshold);
        }
      });

      test('the completed Essential stays de-emphasised but readable', async ({ app }) => {
        await seedEssentials(app);

        const titles = await measureTextContrast(app.page, TITLE_SELECTOR);
        const done = titles.find((t) => t.text.includes('Erledigtes Essential'));

        expect(done, 'the completed Essential renders').toBeDefined();
        expect(
          done!.ratio,
          `completed title — ${done!.foreground} on ${done!.background} = ${done!.ratio}:1 (${theme})`,
        ).toBeGreaterThanOrEqual(4.5);

        // De-emphasis is expected, and must be achieved without dropping below
        // the threshold: the completed title should still be visibly softer
        // than an incomplete one.
        const incomplete = titles.find((t) => t.text.includes('Vitamin D einnehmen'));
        expect(incomplete, 'an incomplete Essential renders for comparison').toBeDefined();
        expect(
          done!.ratio,
          'completed title is softer than an incomplete one',
        ).toBeLessThan(incomplete!.ratio);
      });
    });
  }
}
