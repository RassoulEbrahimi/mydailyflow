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
  timeBlock: time >= '18:00' || !time ? 'evening' : time >= '12:00' ? 'afternoon' : 'morning',
  completed,
  priority: 'medium',
  createdAt: `${TODAY}T06:00:00.000+02:00`,
  date: TODAY,
  rolledOverFrom,
});

const TASKS: SeedTask[] = [
  task('planned-open', 'Heute offen', '09:00', false),
  task('planned-done-late', 'Heute erledigt — spät', '18:00', true),
  task('planned-done-early', 'امروز انجام شد', '08:00', true),
  task('planned-done-untimed', 'Erledigt ohne Zeit', '', true),
  task('carried-open', 'Übernommen und offen', '10:00', false, YESTERDAY),
  task('carried-done', 'Übernommen und erledigt', '11:00', true, YESTERDAY),
];

test.describe('Today completed group', () => {
  test.use({ appOptions: { tasks: TASKS } });

  test('separates completed work from active time blocks and starts collapsed', async ({ app }) => {
    const group = app.page.getByRole('region', { name: 'Heute erledigt (4)' });
    await expect(group).toBeVisible();

    const toggle = group.getByRole('button', { name: /Heute erledigt \(4\)/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(group.getByRole('heading', { name: 'امروز انجام شد', exact: true })).toHaveCount(0);

    await expect(
      app.page.getByRole('region', { name: 'Morgen (06:00 – 12:00)' })
        .getByRole('heading', { level: 3, name: 'Heute offen', exact: true }),
    ).toBeVisible();
    await expect(app.page.getByRole('region', { name: 'Morgen-Check' })).toContainText('Übernommen und offen');
    await expect(app.page.getByRole('heading', { name: 'Übernommen und erledigt', exact: true })).toHaveCount(0);
  });

  test('expands in scheduled-time order with untimed work last', async ({ app }) => {
    const group = app.page.getByRole('region', { name: 'Heute erledigt (4)' });
    await group.getByRole('button', { name: /Heute erledigt \(4\)/ }).click();

    await expect(group.getByRole('button', { name: /Heute erledigt \(4\)/ })).toHaveAttribute('aria-expanded', 'true');
    const titles = await group.locator('h3[dir="auto"]').allInnerTexts();
    expect(titles).toEqual([
      'امروز انجام شد',
      'Übernommen und erledigt',
      'Heute erledigt — spät',
      'Erledigt ohne Zeit',
    ]);
  });

  test('undo moves a task back to its active section and updates the count', async ({ app }) => {
    const group = app.page.getByRole('region', { name: 'Heute erledigt (4)' });
    await group.getByRole('button', { name: /Heute erledigt \(4\)/ }).click();
    await group.getByRole('checkbox', { name: 'امروز انجام شد als erledigt markieren' }).click();

    await expect(app.page.getByRole('region', { name: 'Heute erledigt (3)' })).toBeVisible();
    await expect(
      app.page.getByRole('region', { name: 'Morgen (06:00 – 12:00)' })
        .getByRole('heading', { level: 3, name: 'امروز انجام شد', exact: true }),
    ).toBeVisible();
    await expect(app.hero()).toContainText('2 von 4 geplant');
  });

  test('completing active work moves it into the collapsed group', async ({ app }) => {
    await app.page.getByRole('checkbox', { name: 'Heute offen als erledigt markieren' }).click();

    const group = app.page.getByRole('region', { name: 'Heute erledigt (5)' });
    await expect(group).toBeVisible();
    await expect(group.getByRole('button', { name: /Heute erledigt \(5\)/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(app.page.getByRole('heading', { name: 'Heute offen', exact: true })).toHaveCount(0);
  });

  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`${viewport.name} ${theme}: the collapsed group stays readable without overflow`, async ({ app }) => {
        await app.page.setViewportSize({ width: viewport.width, height: viewport.height });
        const group = app.page.getByRole('region', { name: 'Heute erledigt (4)' });
        await expect(group).toBeVisible();
        await expect(group.getByRole('button', { name: /Heute erledigt \(4\)/ })).toHaveAttribute('aria-expanded', 'false');
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      });
    }
  }
});

test.describe('Today without completed tasks', () => {
  test.use({ appOptions: { tasks: [task('only-open', 'Nur offen', '09:00', false)] } });

  test('does not render an empty completed group', async ({ app }) => {
    await expect(app.page.getByText(/Heute erledigt/)).toHaveCount(0);
  });
});
