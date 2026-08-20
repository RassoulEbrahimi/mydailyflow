import { test, expect } from './fixtures/app';
import { KEYS } from './fixtures/synthetic-data';

const TASK_TITLE = 'Synthetische Aufgabe — Abend';
const ESSENTIAL_TITLE = 'Synthetisches Essential (einfach)';
const RECOVERY_KEY = `${KEYS.recoveryPrefix}${KEYS.tasks}__2026-05-20T12-00-00-000Z`;

test.describe('safe destructive actions', () => {
  test('a deleted task can be restored identically after switching tabs', async ({ app }) => {
    const beforeRaw = (await app.readStorage())[KEYS.tasks];
    expect(beforeRaw).not.toBeNull();
    const beforeTasks = JSON.parse(beforeRaw!).data as Array<Record<string, unknown>>;
    const beforeTask = beforeTasks.find(task => task.title === TASK_TITLE);
    expect(beforeTask).toBeDefined();

    const heading = app.page.getByRole('heading', { name: TASK_TITLE, exact: true });
    const card = app.page.locator('div.relative.overflow-hidden.rounded-2xl').filter({ has: heading });
    const deleteButton = card.getByRole('button', { name: 'Löschen', exact: true });

    // Focusing an action reveals the swipe strip for keyboard users.
    await deleteButton.focus();
    await deleteButton.press('Enter');

    await expect(heading).toBeHidden();
    const toast = app.page.getByRole('status').filter({ hasText: TASK_TITLE });
    await expect(toast).toBeVisible();
    await expect.poll(async () => {
      const raw = (await app.readStorage())[KEYS.tasks];
      return (JSON.parse(raw!).data as Array<{ title: string }>).some(task => task.title === TASK_TITLE);
    }).toBe(false);

    await app.navButton('all').click();
    await expect(toast, 'the app-level Undo remains available across tabs').toBeVisible();
    await toast.getByRole('button', { name: 'Rückgängig', exact: true }).click();

    await expect(app.page.getByRole('heading', { name: TASK_TITLE, exact: true })).toBeVisible();
    await expect(toast).toBeHidden();
    await expect.poll(async () => {
      const raw = (await app.readStorage())[KEYS.tasks];
      const restored = (JSON.parse(raw!).data as Array<Record<string, unknown>>)
        .find(task => task.title === TASK_TITLE);
      return restored;
    }).toEqual(beforeTask);
  });

  test('an Essential requires an explicit second confirmation', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Essentials verwalten', exact: true }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Essentials verwalten', exact: true });
    await dialog.getByRole('button', { name: `Löschen: ${ESSENTIAL_TITLE}`, exact: true }).click();

    const warning = dialog.getByRole('alert');
    await expect(warning).toContainText('Essential endgültig löschen?');
    await expect(warning).toContainText(ESSENTIAL_TITLE);
    await expect.poll(async () => {
      const raw = (await app.readStorage())[KEYS.essentialsData];
      return (JSON.parse(raw!).data as Array<{ title: string }>).some(item => item.title === ESSENTIAL_TITLE);
    }).toBe(true);

    await warning.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(dialog.getByText(ESSENTIAL_TITLE, { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: `Löschen: ${ESSENTIAL_TITLE}`, exact: true }).click();
    await dialog.getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
    await expect(dialog.getByText(ESSENTIAL_TITLE, { exact: true })).toBeHidden();
    await expect.poll(async () => {
      const raw = (await app.readStorage())[KEYS.essentialsData];
      return (JSON.parse(raw!).data as Array<{ title: string }>).some(item => item.title === ESSENTIAL_TITLE);
    }).toBe(false);
  });

  test('a recovery point remains intact until the second confirmation', async ({ app }) => {
    await app.page.evaluate(
      ({ key }) => localStorage.setItem(key, '{"synthetic":"recovery-point"}'),
      { key: RECOVERY_KEY },
    );
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(app.page.locator('nav')).toBeVisible();
    const settings = app.page.getByRole('dialog', { name: 'Einstellungen', exact: true });
    await app.settingsButton().click();
    await expect(settings.getByRole('button', { name: 'Exportieren', exact: true })).toBeVisible();
    const deleteSyntheticRecovery = settings.getByRole('button', {
      name: `Wiederherstellungspunkt ${KEYS.tasks} löschen`,
      exact: true,
    });
    await deleteSyntheticRecovery.click();
    await expect(settings.getByText('Wiederherstellungspunkt endgültig löschen?', { exact: true })).toBeVisible();
    expect(await app.page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY)).not.toBeNull();

    await settings.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    expect(await app.page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY)).not.toBeNull();

    await deleteSyntheticRecovery.click();
    await settings.getByRole('button', { name: 'Endgültig löschen', exact: true }).click();
    await expect(settings.getByText('Wiederherstellungspunkt endgültig löschen?', { exact: true })).toBeHidden();
    expect(await app.page.evaluate(key => localStorage.getItem(key), RECOVERY_KEY)).toBeNull();
  });
});
