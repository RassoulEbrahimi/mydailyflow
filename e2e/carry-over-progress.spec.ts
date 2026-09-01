import type { SeedTask } from './fixtures/synthetic-data';
import { TODAY, YESTERDAY } from './fixtures/synthetic-data';
import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';

const task = (
  id: string,
  title: string,
  time: string,
  completed: boolean,
  date: string = TODAY,
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
  date,
  rolledOverFrom,
});

const TASKS: SeedTask[] = [
  task('planned-done', 'Heute geplant und erledigt', '08:00', true),
  task('planned-open', 'Heute geplant und offen', '16:00', false),
  task('stale-1', 'Von gestern offen', '09:00', false, YESTERDAY),
  task('legacy-carry', 'از دیروز منتقل شده', '10:00', false, TODAY, '2026-05-18'),
  task('stale-done', 'Früher erledigt', '11:00', true, YESTERDAY),
];

test.use({ appOptions: { tasks: TASKS } });

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} · ${theme}: morning triage is separate and progress reports today's accepted plan`, async ({ app }) => {
      await app.page.setViewportSize({ width: viewport.width, height: viewport.height });

      const ring = app.page.getByRole('img', {
        name: 'Tagesfortschritt: 50 Prozent, 1 von 2 geplanten Aufgaben erledigt, 2 zu klären',
      });
      await expect(ring).toBeVisible();
      await expect(app.hero()).toContainText('1 von 2 geplant · 2 zu klären');

      const group = app.page.getByRole('region', { name: 'Morgen-Check' });
      await expect(group).toBeVisible();
      await expect(group).toContainText('2 aus früheren Tagen');
      const toggle = group.getByRole('button', { name: /Morgen-Check/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(group).toContainText('Nichts wird automatisch in Heute verschoben.');
      await expect(group).toContainText('Von gestern offen');
      await expect(group).toContainText('از دیروز منتقل شده');
      await expect(group).toContainText('Ursprünglich Gestern');
      await expect(group).toContainText('Ursprünglich Mo., 18. Mai 2026');

      await expect(app.page.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(1);
      await expect(app.page.getByRole('heading', { name: 'از دیروز منتقل شده', exact: true })).toHaveCount(1);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);
    });
  }
}

test('completing a triage task removes it without changing accepted-plan progress', async ({ app }) => {
  const group = app.page.getByRole('region', { name: 'Morgen-Check' });
  await group.getByRole('button', { name: /Morgen-Check/ }).click();
  await group.getByRole('checkbox', { name: 'Von gestern offen als erledigt markieren' }).click();

  await expect(group).toContainText('1 aus früheren Tagen');
  await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);
  await expect(app.hero()).toContainText('1 von 2 geplant · 1 zu klären');
  await expect(app.page.getByRole('img', {
    name: 'Tagesfortschritt: 50 Prozent, 1 von 2 geplanten Aufgaben erledigt, 1 zu klären',
  })).toBeVisible();
});

test('accepting a triage item adds it to Today and its truthful progress denominator', async ({ app }) => {
  const group = app.page.getByRole('region', { name: 'Morgen-Check' });
  await group.getByRole('button', { name: /Morgen-Check/ }).click();
  await group.getByRole('button', { name: 'Von gestern offen heute einplanen' }).click();

  await expect(group).toContainText('1 aus früheren Tagen');
  await expect(group.getByRole('heading', { name: 'Von gestern offen', exact: true })).toHaveCount(0);
  await expect(
    app.page.getByRole('region', { name: 'Morgen (06:00 – 12:00)' })
      .getByRole('heading', { name: 'Von gestern offen', exact: true }),
  ).toBeVisible();
  await expect(app.hero()).toContainText('1 von 3 geplant · 1 zu klären');
  await expect(app.page.getByRole('img', {
    name: 'Tagesfortschritt: 33 Prozent, 1 von 3 geplanten Aufgaben erledigt, 1 zu klären',
  })).toBeVisible();
});
