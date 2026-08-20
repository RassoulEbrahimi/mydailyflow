import { expect, test } from './fixtures/app';
import { KEYS, TODAY } from './fixtures/synthetic-data';

test.describe('Phase 2A P2-1 — schema v2 lifecycle', () => {
  test('upgrades the legacy browser seed before the UI can write and keeps an exact recovery point', async ({ app }) => {
    const storage = await app.readStorage();
    const tasks = JSON.parse(storage[KEYS.tasks] as string);
    const history = JSON.parse(storage[KEYS.essentialHistory] as string);

    expect(tasks.version).toBe(2);
    expect(tasks.data.length).toBeGreaterThan(0);
    expect(tasks.data.every((task: Record<string, unknown>) => task.completedAt === null)).toBe(true);

    expect(history).toEqual({
      version: 2,
      data: [expect.objectContaining({
        date: TODAY,
        recordedAt: null,
        source: 'legacy-snapshot',
        entries: expect.any(Array),
      })],
    });

    const migrationSnapshot = await app.page.evaluate((prefix) => {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(`${prefix}schema-v2__`)) {
          return JSON.parse(localStorage.getItem(key) as string);
        }
      }
      return null;
    }, KEYS.recoveryPrefix);

    expect(migrationSnapshot).toEqual(expect.objectContaining({
      source: 'schema-v2',
      raw: expect.objectContaining({
        [KEYS.tasks]: expect.stringContaining('"version":1'),
        [KEYS.essentialHistory]: null,
      }),
    }));
    expect(JSON.stringify(migrationSnapshot)).not.toContain(KEYS.authSession);
  });

  test('records a canonical completion instant and clears it when completion is undone', async ({ app }) => {
    const taskTitle = 'Synthetische Aufgabe — Abend';
    const checkbox = app.page.getByRole('checkbox', {
      name: `${taskTitle} als erledigt markieren`,
      exact: true,
    });

    await checkbox.click();
    await expect.poll(async () => {
      const storage = await app.readStorage();
      const tasks = JSON.parse(storage[KEYS.tasks] as string).data as Array<{
        title: string;
        completed: boolean;
        completedAt: string | null;
      }>;
      return tasks.find(task => task.title === taskTitle);
    }).toEqual(expect.objectContaining({
      completed: true,
      completedAt: '2026-05-20T12:30:00.000Z',
    }));

    const completedGroup = app.page.getByRole('region', { name: /Heute erledigt/ });
    await completedGroup.getByRole('button', { name: /Heute erledigt/ }).click();
    await completedGroup.getByRole('checkbox', {
      name: `${taskTitle} als erledigt markieren`,
      exact: true,
    }).click();

    await expect.poll(async () => {
      const storage = await app.readStorage();
      const tasks = JSON.parse(storage[KEYS.tasks] as string).data as Array<{
        title: string;
        completed: boolean;
        completedAt: string | null;
      }>;
      return tasks.find(task => task.title === taskTitle);
    }).toEqual(expect.objectContaining({ completed: false, completedAt: null }));
  });
});
