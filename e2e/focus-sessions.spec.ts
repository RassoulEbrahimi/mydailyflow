import { expect, test, THEMES } from './fixtures/app';
import { FIXED_NOW, KEYS } from './fixtures/synthetic-data';

const TASK_TITLE = 'Synthetische Aufgabe — überfällig';

for (const theme of THEMES) {
  test.describe(`focus sessions · ${theme}`, () => {
    test.use({ appOptions: { theme } });

    test('a running session survives reload and pause freezes its derived time', async ({ app }) => {
      const { page } = app;
      await page.getByRole('button', { name: `Aktionen für ${TASK_TITLE}` }).click();
      await page.getByRole('menuitem', { name: 'Fokus starten' }).click();

      await expect(page.getByText('Fokus vorbereiten')).toBeVisible();
      await page.getByRole('button', { name: '15 min' }).click();
      await page.getByRole('button', { name: 'Fokus starten', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

      const started = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEYS.focusState);
      expect(started.version).toBe(1);
      expect(started.data.activeSession.taskTitle).toBe(TASK_TITLE);
      expect(started.data.activeSession.status).toBe('running');

      // Simulate five focused minutes occurring while the UI was not mounted.
      const fiveMinutesEarlier = new Date(FIXED_NOW.getTime() - 5 * 60_000).toISOString();
      await page.evaluate(({ key, start }) => {
        const wrapper = JSON.parse(localStorage.getItem(key) ?? 'null');
        wrapper.data.activeSession.startedAt = start;
        wrapper.data.activeSession.activeStartedAt = start;
        localStorage.setItem(key, JSON.stringify(wrapper));
      }, { key: KEYS.focusState, start: fiveMinutesEarlier });

      await page.reload({ waitUntil: 'domcontentloaded' });
      const banner = page.getByRole('button', { name: new RegExp(`^Fokus öffnen: ${TASK_TITLE}`) });
      await expect(banner).toContainText('10:00 verbleibend');
      await banner.click();
      await expect(page.locator('p.font-mono')).toHaveText('10:00');

      await page.getByRole('button', { name: 'Pause' }).click();
      const paused = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEYS.focusState);
      expect(paused.data.activeSession.status).toBe('paused');
      expect(paused.data.activeSession.activeStartedAt).toBeNull();
      expect(paused.data.activeSession.elapsedMs).toBe(300_000);
    });

    test('resume and finish save history without completing the task', async ({ app }) => {
      const { page } = app;
      const pausedAt = new Date(FIXED_NOW.getTime() - 7 * 60_000).toISOString();
      await page.evaluate(({ key, now }) => {
        localStorage.setItem(key, JSON.stringify({
          version: 1,
          data: {
            activeSession: {
              id: 'e2e-focus-paused',
              taskId: 'e2e-overdue',
              taskTitle: 'Synthetische Aufgabe — überfällig',
              plannedDurationMinutes: 25,
              startedAt: now,
              activeStartedAt: null,
              elapsedMs: 420_000,
              status: 'paused',
            },
            history: [],
          },
        }));
      }, { key: KEYS.focusState, now: pausedAt });
      await page.reload({ waitUntil: 'domcontentloaded' });

      await page.getByRole('button', { name: new RegExp(`^Fokus öffnen: ${TASK_TITLE}`) }).click();
      await expect(page.getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
      await page.getByRole('button', { name: 'Fortsetzen' }).click();
      await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
      await page.getByRole('button', { name: 'Fokus beenden' }).click();

      await expect(page.getByRole('button', { name: 'Fokus beenden' })).toBeHidden();
      const storage = await app.readStorage();
      const focus = JSON.parse(storage[KEYS.focusState] as string);
      const tasks = JSON.parse(storage[KEYS.tasks] as string);
      const linkedTask = tasks.data.find((entry: { id: string }) => entry.id === 'e2e-overdue');

      expect(focus.data.activeSession).toBeNull();
      expect(focus.data.history).toHaveLength(1);
      expect(focus.data.history[0]).toEqual(expect.objectContaining({
        id: 'e2e-focus-paused',
        taskId: 'e2e-overdue',
        elapsedMs: 420_000,
      }));
      expect(linkedTask.completed).toBe(false);
      expect(linkedTask.completedAt ?? null).toBeNull();
    });

    test('the Now card exposes the same setup flow', async ({ app }) => {
      const nowTitle = 'Synthetische Aufgabe — mit Checkliste';
      await app.page.getByRole('button', { name: `Fokus starten: ${nowTitle}` }).click();
      const setup = app.page.getByRole('dialog', { name: nowTitle, exact: true });
      await expect(setup.getByRole('heading', { name: nowTitle, exact: true })).toBeVisible();
      await expect(setup.getByRole('button', { name: '25 min' })).toHaveAttribute('aria-pressed', 'true');
    });
  });
}
