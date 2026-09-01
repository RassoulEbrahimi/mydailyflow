/**
 * touch-targets.spec.ts — the two 44x44 exceptions PR3 deferred (PR4).
 *
 * PR3 raised every control it could, and enumerated two it could not:
 * the Daily Essentials progress controls and the inline TaskCard checklist
 * rows. The compact stepper keeps two 44px targets beside the title at 360px;
 * five independent 44px chips would consume 220px before title or spacing.
 *
 * Size alone is not the whole requirement: an enlarged target that overlaps its
 * neighbour steals taps, and a row of enlarged targets that overflows the card
 * is a different defect. Both are asserted here, with realistic German, Persian
 * and mixed content.
 */

import { expect, test, THEMES, VIEWPORTS, waitForAppShell } from './fixtures/app';

const MIN = 44;

/** Realistic multi-language Essentials, including one legacy target above the new UI cap. */
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

      test('Essentials steppers are 44x44, do not overlap, and do not overflow', async ({ app }) => {
        await seed(app.page);

        const measured = await app.page.evaluate(() => {
          const controls = Array.from(
            document.querySelectorAll<HTMLElement>('section button[aria-label$="Fortschritt erhöhen"], section button[aria-label$="Fortschritt verringern"]'),
          ).map((el, i) => {
            const r = el.getBoundingClientRect();
            return { label: `control${i}:${el.getAttribute('aria-label')}`, x: r.x, y: r.y, w: r.width, h: r.height };
          });
          const doc = document.documentElement;
          const section = document.querySelector('button[aria-label="Essentials verwalten"]')!.closest('section')!;
          return {
            controls,
            pageOverflow: doc.scrollWidth - doc.clientWidth,
            sectionOverflow: section.scrollWidth - section.clientWidth,
          };
        });

        expect(measured.controls.length, 'two controls render for every multi-target Essential').toBe(8);

        const tooSmall = measured.controls
          .filter((c) => c.w < MIN || c.h < MIN)
          .map((c) => `${c.label} = ${c.w.toFixed(1)}x${c.h.toFixed(1)}`);
        expect(tooSmall, 'every stepper control reaches 44x44').toEqual([]);

        expect(intersections(measured.controls), 'no two stepper controls overlap').toEqual([]);
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

  test('the compact stepper still records progress', async ({ app }) => {
    await seed(app.page);
    const row = app.page.locator('[data-essential-id="t-de-5"]');
    const increase = row.getByRole('button', { name: 'Wasser trinken: Fortschritt erhöhen' });

    await increase.click();
    await app.page.waitForTimeout(250);

    await expect(row.getByRole('status')).toHaveText('3/5');
    await expect(row.getByRole('group')).toHaveAttribute('aria-label', 'Wasser trinken: 3 von 5');
  });
});
