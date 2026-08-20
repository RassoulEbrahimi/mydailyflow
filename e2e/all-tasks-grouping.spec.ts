import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import type { SeedTask } from './fixtures/synthetic-data';
import { TODAY } from './fixtures/synthetic-data';

const task = (
  id: string,
  title: string,
  date: string,
  completed = false,
): SeedTask => ({
  id,
  title,
  date,
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed,
  priority: 'medium',
  createdAt: `${date}T08:00:00.000+02:00`,
});

const PERIOD_TASKS: SeedTask[] = [
  task('period-today', 'B4 heute', TODAY),
  task('period-future-near', 'B4 Zukunft nah', '2026-05-21'),
  task('period-future-far', 'B4 Zukunft fern', '2026-05-25'),
  // Past incomplete tasks roll into Today on boot. Completed history remains on
  // its original date and therefore exercises the real persisted past path.
  task('period-past-near', 'B4 Vergangenheit nah', '2026-05-19', true),
  task('period-past-far', 'B4 Vergangenheit fern', '2026-05-10', true),
];

test.describe('Phase 1B B4 — All Tasks date periods', () => {
  test.use({ appOptions: { tasks: PERIOD_TASKS } });

  test('shows Heute, Kommend and Vergangen in honest chronological order', async ({ app }) => {
    await app.navButton('all').click();

    const sections = app.page.locator('main section[aria-labelledby^="all-tasks-"]');
    await expect(sections).toHaveCount(3);
    await expect(sections.nth(0)).toHaveAttribute('aria-labelledby', 'all-tasks-today');
    await expect(sections.nth(1)).toHaveAttribute('aria-labelledby', 'all-tasks-upcoming');
    await expect(sections.nth(2)).toHaveAttribute('aria-labelledby', 'all-tasks-past');

    await expect(sections.nth(0).getByRole('heading', { name: 'Heute, 1 Aufgabe' })).toBeVisible();
    await expect(sections.nth(1).getByRole('heading', { name: 'Kommend, 2 Aufgaben' })).toBeVisible();
    await expect(sections.nth(2).getByRole('heading', { name: 'Vergangen, 2 Aufgaben' })).toBeVisible();

    const upcomingDates = sections.nth(1).locator('[data-sticky-group] h3');
    await expect(upcomingDates).toHaveCount(2);
    await expect(upcomingDates.nth(0)).toHaveAttribute('aria-label', 'Do., 21. Mai 2026, 1 Aufgabe');
    await expect(upcomingDates.nth(1)).toHaveAttribute('aria-label', 'Mo., 25. Mai 2026, 1 Aufgabe');

    const pastDates = sections.nth(2).locator('[data-sticky-group] h3');
    await expect(pastDates).toHaveCount(2);
    await expect(pastDates.nth(0)).toHaveAttribute('aria-label', 'Gestern, 1 Aufgabe');
    await expect(pastDates.nth(1)).toHaveAttribute('aria-label', 'So., 10. Mai 2026, 1 Aufgabe');
  });

  test('Kommend filter keeps future dates only and preserves nearest-first order', async ({ app }) => {
    await app.navButton('all').click();
    await app.page.getByRole('button', { name: 'Kommend', exact: true }).click();

    await expect(app.page.getByRole('button', { name: 'Kommend', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(app.page.getByText('B4 Zukunft nah')).toBeVisible();
    await expect(app.page.getByText('B4 Zukunft fern')).toBeVisible();
    await expect(app.page.getByText('B4 heute')).toBeHidden();
    await expect(app.page.getByText('B4 Vergangenheit nah')).toBeHidden();
    await expect(app.page.locator('#all-tasks-upcoming')).toHaveText(/Kommend/);
  });

  test('Heute and Vergangen filters expose only their matching periods', async ({ app }) => {
    await app.navButton('all').click();

    await app.page.getByRole('main').getByRole('button', { name: 'Heute', exact: true }).click();
    await expect(app.page.getByText('B4 heute')).toBeVisible();
    await expect(app.page.getByText('B4 Zukunft nah')).toBeHidden();

    await app.page.getByRole('button', { name: 'Vergangen', exact: true }).click();
    await expect(app.page.getByText('B4 Vergangenheit nah')).toBeVisible();
    await expect(app.page.getByText('B4 Vergangenheit fern')).toBeVisible();
    await expect(app.page.getByText('B4 heute')).toBeHidden();
    await expect(app.page.locator('#all-tasks-past')).toHaveText(/Vergangen/);
  });
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`B4 layout — ${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        appOptions: { tasks: PERIOD_TASKS, theme },
      });

      test('keeps all period controls and content inside the mobile viewport', async ({ app }) => {
        await app.navButton('all').click();

        for (const label of ['Alle Daten', 'Heute', 'Kommend', 'Vergangen']) {
          await expect(app.page.getByRole('main').getByRole('button', { name: label, exact: true })).toBeVisible();
        }
        await expect(app.page.locator('#all-tasks-today')).toBeVisible();
        await expect(app.page.locator('#all-tasks-upcoming')).toBeAttached();
        await expect(app.page.locator('#all-tasks-past')).toBeAttached();

        const hasHorizontalOverflow = await app.page.locator('main').evaluate(
          element => element.scrollWidth > element.clientWidth + 1,
        );
        expect(hasHorizontalOverflow).toBe(false);
      });
    });
  }
}
