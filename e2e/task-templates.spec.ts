import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { KEYS } from './fixtures/synthetic-data';

const ROUTINE_NAME = 'Synthetische Morgenroutine';
const FIRST_TASK = 'Synthetische Aufgabe — Morgen';
const CHECKLIST_TASK = 'Synthetische Aufgabe — mit Checkliste';

async function openTemplates(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.getByRole('button', { name: 'Vorlagen & Routinen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Vorlagen und Routinen' });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const theme of THEMES) {
  test.describe(`task templates · ${theme}`, () => {
    test.use({ appOptions: { theme } });

    test('creates a routine and plans independent tasks on the selected date', async ({ app }) => {
      const { page } = app;
      let dialog = await openTemplates(page);
      await dialog.getByRole('button', { name: 'Neue Vorlage oder Routine' }).click();
      await dialog.getByLabel('Name').fill(ROUTINE_NAME);
      await dialog.getByRole('button', { name: new RegExp(FIRST_TASK) }).click();
      await dialog.getByRole('button', { name: new RegExp(CHECKLIST_TASK) }).click();
      await dialog.getByRole('button', { name: 'Routine mit 2 Aufgaben speichern' }).click();

      await expect(dialog.locator('[data-template-library]')).toContainText(ROUTINE_NAME);
      await expect(dialog.getByText('Routine · 2 Aufgaben')).toBeVisible();
      await dialog.getByLabel('Startdatum für Vorlage').fill('2026-05-25');
      await dialog.getByRole('button', { name: /Ab .* planen/ }).click();

      await expect(dialog).toHaveAttribute('inert', '');
      await expect(app.navButton('all')).toHaveAttribute('aria-current', 'page');
      await expect(page.getByLabel('Nach Datum filtern')).toHaveValue('2026-05-25');
      await expect(page.locator('[data-template-confirmation]')).toContainText('2 Aufgaben unabhängig geplant');

      const stored = await page.evaluate(({ tasksKey, templatesKey }) => ({
        tasks: JSON.parse(localStorage.getItem(tasksKey) ?? 'null').data,
        templates: JSON.parse(localStorage.getItem(templatesKey) ?? 'null').data,
      }), { tasksKey: KEYS.tasks, templatesKey: KEYS.templates });

      expect(stored.templates).toHaveLength(1);
      expect(stored.templates[0].items[1].checklistItems[0]).toEqual({ text: 'Erster synthetischer Punkt' });
      const copies = stored.tasks.filter((task: { date: string; title: string }) =>
        task.date === '2026-05-25' && [FIRST_TASK, CHECKLIST_TASK].includes(task.title));
      expect(copies).toHaveLength(2);
      const copiedChecklist = copies.find((task: { title: string }) => task.title === CHECKLIST_TASK).checklistItems;
      expect(copiedChecklist.map((item: { completed: boolean }) => item.completed)).toEqual([false, false]);
      expect(copiedChecklist[0].id).not.toBe('e2e-ci-1');
    });

    test('keeps a saved routine after reload and requires confirmation before deletion', async ({ app }) => {
      const { page } = app;
      await page.evaluate(({ key, name }) => localStorage.setItem(key, JSON.stringify({
        version: 1,
        data: [{
          id: 'saved-routine', name, kind: 'routine', createdAt: '2026-05-20T10:00:00.000Z',
          items: [
            { dayOffset: 0, title: 'Erster Schritt', time: '08:00', duration: '15m', timeBlock: 'morning', priority: 'medium', recurrence: 'none', reminderEnabled: true },
            { dayOffset: 1, title: 'Zweiter Schritt', time: '', duration: '15m', timeBlock: 'evening', priority: 'low', recurrence: 'none', reminderEnabled: false },
          ],
        }],
      })), { key: KEYS.templates, name: ROUTINE_NAME });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const dialog = await openTemplates(page);
      await expect(dialog.getByText(ROUTINE_NAME, { exact: true })).toBeVisible();
      page.once('dialog', prompt => prompt.dismiss());
      await dialog.getByRole('button', { name: `Vorlage löschen: ${ROUTINE_NAME}` }).click();
      await expect(dialog.getByText(ROUTINE_NAME, { exact: true })).toBeVisible();
    });
  });
}

for (const viewport of VIEWPORTS) {
  test(`template library stays usable at ${viewport.name}`, async ({ app }) => {
    await app.page.setViewportSize({ width: viewport.width, height: viewport.height });
    const dialog = await openTemplates(app.page);
    await expect(dialog.getByRole('button', { name: 'Neue Vorlage oder Routine' })).toBeVisible();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });
}
