import type { SeedTask } from './fixtures/synthetic-data';
import { TODAY, YESTERDAY } from './fixtures/synthetic-data';
import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';

const task = (
  id: string,
  title: string,
  time: string,
  completed: boolean,
  rolledOverFrom?: string,
): SeedTask => ({
  id,
  title,
  time,
  duration: '30m',
  timeBlock: time < '12:00' ? 'morning' : 'afternoon',
  completed,
  priority: 'medium',
  createdAt: `${TODAY}T06:00:00.000+02:00`,
  date: TODAY,
  rolledOverFrom,
});

const TASKS: SeedTask[] = [
  task('planned-done', 'Heute geplant und erledigt', '08:00', true),
  task('planned-open', 'Heute geplant und offen', '16:00', false),
  task('carried-1', 'Von gestern offen', '09:00', false, YESTERDAY),
  task('carried-2', 'از دیروز منتقل شده', '10:00', false, '2026-05-18'),
  task('carried-done', 'Früher übernommen und erledigt', '11:00', true, YESTERDAY),
];

test.use({ appOptions: { tasks: TASKS } });

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} · ${theme}: carry-over is separate and progress reports today's plan`, async ({ app }) => {
      await app.page.setViewportSize({ width: viewport.width, height: viewport.height });

      const ring = app.page.getByRole('img', {
        name: 'Tagesfortschritt: 50 Prozent, 1 von 2 geplanten Aufgaben erledigt, 2 übernommen',
      });
      await expect(ring).toBeVisible();
      await expect(app.hero()).toContainText('1 von 2 geplant · 2 übernommen');

      const group = app.page.getByRole('region', { name: 'Übernommen' });
      await expect(group).toBeVisible();
      await expect(group).toContainText('2 von früher');
      await expect(group).toContainText('Von gestern offen');
      await expect(group).toContainText('از دیروز منتقل شده');
      await expect(group).toContainText('Von gestern');
      await expect(group).toContainText('Von Mo., 18. Mai 2026');

      await expect(app.page.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(1);
      await expect(app.page.getByRole('heading', { name: 'از دیروز منتقل شده', exact: true })).toHaveCount(1);

      const toggle = group.getByRole('button', { name: /Übernommen/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);
    });
  }
}

test('completing a carried task removes it from the group without changing planned progress', async ({ app }) => {
  const group = app.page.getByRole('region', { name: 'Übernommen' });
  await group.getByRole('checkbox', { name: 'Von gestern offen als erledigt markieren' }).click();

  await expect(group).toContainText('1 von früher');
  await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);
  await expect(app.hero()).toContainText('1 von 2 geplant · 1 übernommen');
  await expect(app.page.getByRole('img', {
    name: 'Tagesfortschritt: 50 Prozent, 1 von 2 geplanten Aufgaben erledigt, 1 übernommen',
  })).toBeVisible();
});
