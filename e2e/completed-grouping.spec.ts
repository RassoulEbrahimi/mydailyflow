import type { SeedTask } from './fixtures/synthetic-data';
import { TODAY } from './fixtures/synthetic-data';
import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';

const completedTask = (
  id: string,
  title: string,
  date: string,
  time: string,
): SeedTask => ({
  id,
  title,
  date,
  time,
  duration: '30m',
  timeBlock: time >= '18:00' ? 'evening' : time >= '12:00' ? 'afternoon' : 'morning',
  completed: true,
  priority: 'medium',
  createdAt: `${date}T${time}:00.000+02:00`,
});

const COMPLETED_HISTORY: SeedTask[] = [
  completedTask('done-older-late', 'Älter — spät', '2026-05-18', '18:00'),
  completedTask('done-today-late', 'Heute — spät', TODAY, '20:00'),
  completedTask('done-yesterday', 'Gestern — einmal', '2026-05-19', '12:30'),
  completedTask('done-today-early', 'Heute — früh', TODAY, '08:00'),
  completedTask('done-older-early', 'Älter — früh', '2026-05-18', '09:00'),
  {
    ...completedTask('open-not-done', 'Noch offen', TODAY, '07:00'),
    completed: false,
  },
];

test.describe('Completed tasks grouped by scheduled date', () => {
  test.use({ appOptions: { tasks: COMPLETED_HISTORY } });

  test('renders newest dates first with a truthful count for every day', async ({ app }) => {
    await app.navButton('done').click();

    await expect(app.page.getByRole('heading', { name: 'Erledigte Aufgaben, 5 Aufgaben' })).toBeVisible();
    await expect(
      app.page.getByText('Neueste zuerst, gruppiert nach Datum. Neue Abschlüsse verwenden den tatsächlich gespeicherten Zeitpunkt.'),
    ).toBeVisible();

    const dateHeaders = app.page.locator('[data-sticky-group] h3');
    await expect(dateHeaders).toHaveCount(3);
    await expect(dateHeaders.nth(0)).toHaveAttribute('aria-label', 'Heute, 2 Aufgaben');
    await expect(dateHeaders.nth(1)).toHaveAttribute('aria-label', 'Gestern, 1 Aufgabe');
    await expect(dateHeaders.nth(2)).toHaveAttribute('aria-label', 'Mo., 18. Mai 2026, 2 Aufgaben');
    await expect(app.page.getByText('Noch offen')).toBeHidden();
  });

  test('orders scheduled times ascending inside each date group', async ({ app }) => {
    await app.navButton('done').click();

    const titles = await app.page.locator('main h3[dir="auto"]').allInnerTexts();
    expect(titles).toEqual([
      'Heute — früh',
      'Heute — spät',
      'Gestern — einmal',
      'Älter — früh',
      'Älter — spät',
    ]);
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name} ${theme}: date groups stay readable without horizontal overflow`, async ({ app }) => {
        await app.page.setViewportSize({ width: viewport.width, height: viewport.height });
        await app.navButton('done').click();

        await expect(app.page.getByRole('heading', { name: /Erledigte Aufgaben/ })).toBeVisible();
        await expect(app.page.locator('[data-sticky-group]')).toHaveCount(3);
        const hasOverflow = await app.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(hasOverflow).toBe(false);
      });
    }
  }
});

test.describe('Completed empty state', () => {
  test.use({ appOptions: { seedData: false } });

  test('stays explicit when no completed task exists', async ({ app }) => {
    await app.navButton('done').click();
    await expect(app.page.getByText('Noch keine erledigten Aufgaben.')).toBeVisible();
    await expect(app.page.locator('[data-sticky-group]')).toHaveCount(0);
  });
});
