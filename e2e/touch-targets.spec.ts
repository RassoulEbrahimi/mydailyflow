/**
 * touch-targets.spec.ts — the two 44x44 exceptions PR3 deferred (PR4).
 *
 * PR3 raised every control it could, and enumerated two it could not:
 * the Daily Essentials counter chips (32x32) and the inline TaskCard checklist
 * rows (28px tall). Both were blocked on layout work — five 44px counters plus a
 * title do not fit one row at 360px, and four 44px checklist rows change the
 * card's height. PR4 does that work, so `TARGET_SIZE_EXCEPTIONS` is now empty
 * and these tests hold the two components to the bar directly.
 *
 * Size alone is not the whole requirement: an enlarged target that overlaps its
 * neighbour steals taps, and a row of enlarged targets that overflows the card
 * is a different defect. Both are asserted here, with realistic German, Persian
 * and mixed content.
 */

import { expect, test, THEMES, VIEWPORTS, waitForAppShell } from './fixtures/app';

const MIN = 44;

/** Realistic multi-language Essentials, including the widest counter this app allows. */
const ESSENTIALS = [
  { id: 't-de-5',    title: 'Wasser trinken',                 targetCount: 5, order: 0, createdAt: '2026-05-19T06:00:00.000Z' },
  { id: 't-fa-5',    title: 'نوشیدن آب در طول روز',            targetCount: 5, order: 1, createdAt: '2026-05-19T06:01:00.000Z' },
  { id: 't-mixed-3', title: 'مکمل Kreatin 💪 nehmen',          targetCount: 3, order: 2, createdAt: '2026-05-19T06:02:00.000Z' },
  { id: 't-long-10', title: 'Sehr langer deutscher Essential-Titel zum Testen', targetCount: 10, order: 3, createdAt: '2026-05-19T06:03:00.000Z' },
  { id: 't-simple',  title: 'Vitamin D einnehmen',            targetCount: 1, order: 4, createdAt: '2026-05-19T06:04:00.000Z' },
];

/** A task whose checklist mixes scripts, so row height is exercised with real glyphs. */
const CHECKLIST = [
  { id: 'c1', text: 'Erster Punkt mit einem längeren deutschen Text', completed: false },
  { id: 'c2', text: 'خرید مواد غذایی', completed: true },
  { id: 'c3', text: 'Mixed مورد سوم item', completed: false },
  { id: 'c4', text: 'Vierter Punkt', completed: false },
];

async function seed(page: import('@playwright/test').Page) {
  await page.evaluate(
    ({ essentials, checklist }) => {
      localStorage.setItem('myDailyFlowEssentialsData', JSON.stringify({ version: 1, data: essentials }));
      localStorage.setItem(
        'myDailyFlowEssentialsState',
        JSON.stringify({ version: 1, data: { date: '2026-05-20', progressById: { 't-de-5': 2 } } }),
      );
      localStorage.setItem('myDailyFlow_essentialsCollapsed', 'false');

      const raw = JSON.parse(localStorage.getItem('myDailyFlowTasks')!);
      raw.data[0].checklistItems = checklist;
      localStorage.setItem('myDailyFlowTasks', JSON.stringify(raw));
    },
    { essentials: ESSENTIALS, checklist: CHECKLIST },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
}

/** Pairwise intersection of a set of rects, as "a ∩ b" descriptions. */
function intersections(rects: { label: string; x: number; y: number; w: number; h: number }[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // Sub-pixel touching is not overlap; anything a finger could confuse is.
      if (overlapX > 0.5 && overlapY > 0.5) {
        hits.push(`${a.label} ∩ ${b.label} (${overlapX.toFixed(1)}x${overlapY.toFixed(1)}px)`);
      }
    }
  }
  return hits;
}

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`targets · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('Essentials counters are 44x44, do not overlap, and do not overflow', async ({ app }) => {
        await seed(app.page);

        const measured = await app.page.evaluate(() => {
          const chips = Array.from(
            document.querySelectorAll<HTMLElement>('section button[aria-pressed]'),
          ).map((el, i) => {
            const r = el.getBoundingClientRect();
            return { label: `chip${i}:${(el.textContent || '').trim()}`, x: r.x, y: r.y, w: r.width, h: r.height };
          });
          const doc = document.documentElement;
          const section = document.querySelector('section')!;
          return {
            chips,
            pageOverflow: doc.scrollWidth - doc.clientWidth,
            sectionOverflow: section.scrollWidth - section.clientWidth,
          };
        });

        expect(measured.chips.length, 'counter chips render').toBeGreaterThanOrEqual(23);

        const tooSmall = measured.chips
          .filter((c) => c.w < MIN || c.h < MIN)
          .map((c) => `${c.label} = ${c.w.toFixed(1)}x${c.h.toFixed(1)}`);
        expect(tooSmall, 'every counter chip reaches 44x44').toEqual([]);

        expect(intersections(measured.chips), 'no two counter chips overlap').toEqual([]);
        expect(measured.pageOverflow, 'no horizontal page overflow').toBeLessThanOrEqual(1);
        expect(measured.sectionOverflow, 'the Essentials card does not overflow').toBeLessThanOrEqual(1);
      });

      test('inline checklist rows are 44x44, do not overlap, and stay keyboard-operable', async ({ app }) => {
        await seed(app.page);

        const measured = await app.page.evaluate(() => {
          const rows = Array.from(
            document.querySelectorAll<HTMLElement>('main [role="checkbox"]'),
          )
            .filter((el) => el.closest('div.mt-2\\.5'))
            .map((el, i) => {
              const r = el.getBoundingClientRect();
              return {
                label: `row${i}:${(el.textContent || '').trim().slice(0, 14)}`,
                x: r.x, y: r.y, w: r.width, h: r.height,
                checked: el.getAttribute('aria-checked'),
              };
            });
          const doc = document.documentElement;
          return { rows, pageOverflow: doc.scrollWidth - doc.clientWidth };
        });

        expect(measured.rows.length, 'checklist rows render').toBeGreaterThan(0);

        const tooSmall = measured.rows
          .filter((r) => r.w < MIN || r.h < MIN)
          .map((r) => `${r.label} = ${r.w.toFixed(1)}x${r.h.toFixed(1)}`);
        expect(tooSmall, 'every checklist row reaches 44x44').toEqual([]);

        expect(intersections(measured.rows), 'no two checklist rows overlap').toEqual([]);
        expect(measured.pageOverflow, 'no horizontal page overflow').toBeLessThanOrEqual(1);

        // Semantics survived the resize.
        for (const row of measured.rows) {
          expect(['true', 'false']).toContain(row.checked);
        }
      });
    });
  }
}

test.describe('targets · keyboard and state', () => {
  test.use({ appOptions: { theme: 'dark' }, viewport: { width: 360, height: 812 } });

  test('a checklist row still toggles with the keyboard', async ({ app }) => {
    await seed(app.page);
    const row = app.page.locator('main div.mt-2\\.5 [role="checkbox"]').first();
    const before = await row.getAttribute('aria-checked');

    await row.focus();
    await app.page.keyboard.press('Enter');
    await app.page.waitForTimeout(200);

    expect(await row.getAttribute('aria-checked'), 'Enter flips the checklist item').not.toBe(before);
  });

  test('a counter chip still records progress', async ({ app }) => {
    await seed(app.page);
    const chips = app.page.locator('section button[aria-pressed]');
    const third = chips.nth(2);

    await third.click();
    await app.page.waitForTimeout(250);

    expect(await third.getAttribute('aria-pressed'), 'the clicked counter becomes active').toBe('true');
    expect(
      await chips.nth(1).getAttribute('aria-pressed'),
      'progress is cumulative, so earlier counters are active too',
    ).toBe('true');
  });
});
