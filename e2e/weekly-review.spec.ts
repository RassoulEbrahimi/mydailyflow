import AxeBuilder from '@axe-core/playwright';
import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { BIDI_ESSENTIALS, BIDI_ESSENTIALS_STATE, BIDI_TASKS } from './fixtures/bidi-data';

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`P2-3 weekly review — ${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        appOptions: { theme },
      });

      test('renders factual partial history without mobile overflow', async ({ app }) => {
        await app.page.getByRole('button', { name: 'Wochenrückblick öffnen' }).click();

        const review = app.page.locator('[data-weekly-review]');
        await expect(review).toBeVisible();
        await expect(review.getByRole('heading', { name: 'Wochenrückblick' })).toBeVisible();
        await expect(review.locator('[data-week-task-day]')).toHaveCount(7);
        await expect(review.locator('[data-week-essential-day]')).toHaveCount(7);
        await expect(review.getByText('1 von 7 Tagen erfasst')).toBeVisible();
        await expect(review.getByText(/stammt aus der Migration/)).toBeVisible();
        await expect(review.getByText(/kein verlässlicher Abschlusszeitpunkt/)).toBeVisible();
        await expect(review.getByText(/ältere erledigte Aufgaben haben keinen gespeicherten Abschlusszeitpunkt/)).toBeVisible();

        const metrics = await app.page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          reviewRight: document.querySelector('[data-weekly-review]')?.getBoundingClientRect().right ?? 0,
        }));
        expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
        expect(metrics.reviewRight).toBeLessThanOrEqual(metrics.clientWidth + 0.5);

        const nextWeek = review.getByRole('button', { name: 'Nächste Woche' });
        await expect(nextWeek).toBeDisabled();
        await review.getByRole('button', { name: 'Vorherige Woche' }).click();
        await expect(review.getByText('Vergangene Woche')).toBeVisible();
        await expect(nextWeek).toBeEnabled();

        const axe = await new AxeBuilder({ page: app.page })
          .include('[data-weekly-review]')
          .analyze();
        expect(axe.violations).toEqual([]);

        await review.getByRole('button', { name: 'Wochenrückblick schließen' }).click();
        await expect(review).toBeHidden();
        await expect(app.navButton('today')).toHaveAttribute('aria-current', 'page');
      });
    });
  }
}

test.describe('P2-3 weekly review — navigation and mixed content', () => {
  test.use({
    viewport: { width: 390, height: 812 },
    appOptions: {
      theme: 'dark',
      tasks: BIDI_TASKS,
      essentials: BIDI_ESSENTIALS,
      essentialsState: BIDI_ESSENTIALS_STATE,
    },
  });

  test('keeps Persian and mixed-language decisions contained and self-directed', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Wochenrückblick öffnen' }).click();

    const review = app.page.locator('[data-weekly-review]');
    const persian = review.getByText('مطالعه کتاب قبل از خواب', { exact: true });
    const mixed = review.getByText('Buy milk از سوپرمارکت', { exact: true });

    await expect(persian).toBeVisible();
    await expect(mixed).toBeVisible();
    expect(await app.direction(persian)).toBe('rtl');
    expect(await app.direction(mixed)).toBe('ltr');

    const geometry = await review.evaluate((root) => {
      const rootRect = root.getBoundingClientRect();
      const authored = [...root.querySelectorAll<HTMLElement>('[dir="auto"]')];
      return {
        rootRight: rootRect.right,
        clientWidth: document.documentElement.clientWidth,
        escaped: authored.some((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < rootRect.left - 0.5 || rect.right > rootRect.right + 0.5;
        }),
      };
    });
    expect(geometry.escaped).toBe(false);
    expect(geometry.rootRight).toBeLessThanOrEqual(geometry.clientWidth + 0.5);
  });

  test('returns to the tab that opened the review', async ({ app }) => {
    await app.navButton('all').click();
    await expect(app.navButton('all')).toHaveAttribute('aria-current', 'page');

    await app.page.getByRole('button', { name: 'Wochenrückblick öffnen' }).click();
    const review = app.page.locator('[data-weekly-review]');
    await expect(review).toBeVisible();
    await review.getByRole('button', { name: 'Wochenrückblick schließen' }).click();

    await expect(review).toBeHidden();
    await expect(app.navButton('all')).toHaveAttribute('aria-current', 'page');
  });
});
