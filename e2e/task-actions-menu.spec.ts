import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { SEED_TASKS, TODAY, YESTERDAY } from './fixtures/synthetic-data';

const firstTaskTitle = SEED_TASKS[0].title;
// Use a non-adjacent card when proving app-wide exclusivity: the first menu is
// intentionally allowed to overlay the next card in the dense mobile list.
const secondTaskTitle = SEED_TASKS[2].title;

const taskCard = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`[data-task-card="${id}"]`);

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`task action menu · ${viewport.name} · ${theme}`, () => {
      test.use({ appOptions: { theme }, viewport });

      test('every visible task has a named 44px action trigger', async ({ app }) => {
        const triggers = app.page.getByRole('button', { name: /^Aktionen für / });
        const count = await triggers.count();
        expect(count).toBeGreaterThan(0);

        for (let index = 0; index < count; index++) {
          const trigger = triggers.nth(index);
          const box = await trigger.boundingBox();
          expect(box, `trigger ${index} is rendered`).not.toBeNull();
          expect(box!.width, `trigger ${index} width`).toBeGreaterThanOrEqual(44);
          expect(box!.height, `trigger ${index} height`).toBeGreaterThanOrEqual(44);
          await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        }
      });

      test('opens one discoverable menu with the required actions', async ({ app }) => {
        const page = app.page;
        const firstTrigger = page.getByRole('button', { name: `Aktionen für ${firstTaskTitle}` });
        await firstTrigger.click();

        const firstMenu = page.getByRole('menu', { name: `Aktionen für ${firstTaskTitle}` });
        await expect(firstMenu).toBeVisible();
        await expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');
        await expect(firstMenu.getByRole('menuitem')).toHaveCount(3);
        await expect(firstMenu.getByRole('menuitem', { name: 'Bearbeiten' })).toBeVisible();
        await expect(firstMenu.getByRole('menuitem', { name: 'Morgen' })).toBeVisible();
        await expect(firstMenu.getByRole('menuitem', { name: 'Löschen' })).toBeVisible();

        const secondTrigger = page.getByRole('button', { name: `Aktionen für ${secondTaskTitle}` });
        await secondTrigger.click();
        await expect(firstMenu).toBeHidden();
        await expect(page.getByRole('menu', { name: `Aktionen für ${secondTaskTitle}` })).toBeVisible();
        await expect(page.getByRole('menu')).toHaveCount(1);
      });

      test('supports roving focus, trapped Tab and Escape focus restoration', async ({ app }) => {
        const page = app.page;
        const trigger = page.getByRole('button', { name: `Aktionen für ${firstTaskTitle}` });
        await trigger.focus();
        await page.keyboard.press('Enter');

        const menu = page.getByRole('menu', { name: `Aktionen für ${firstTaskTitle}` });
        const edit = menu.getByRole('menuitem', { name: 'Bearbeiten' });
        const tomorrow = menu.getByRole('menuitem', { name: 'Morgen' });
        const remove = menu.getByRole('menuitem', { name: 'Löschen' });

        await expect(edit).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(tomorrow).toBeFocused();
        await page.keyboard.press('End');
        await expect(remove).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(edit).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(remove).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
      });
    });
  }
}

test.describe('task menu actions', () => {
  test.use({ appOptions: { theme: 'dark' }, viewport: { width: 390, height: 812 } });

  test('Bearbeiten opens the existing edit sheet', async ({ app }) => {
    const page = app.page;
    await page.getByRole('button', { name: `Aktionen für ${firstTaskTitle}` }).click();
    await page.getByRole('menuitem', { name: 'Bearbeiten' }).click();
    await expect(page.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeVisible();
  });

  test('Morgen moves an incomplete task out of Today', async ({ app }) => {
    const page = app.page;
    await page.getByRole('button', { name: `Aktionen für ${firstTaskTitle}` }).click();
    await page.getByRole('menuitem', { name: 'Morgen' }).click();
    await expect(page.getByRole('heading', { name: firstTaskTitle })).toHaveCount(0);
  });

  test('Löschen uses the existing recoverable delete flow', async ({ app }) => {
    const page = app.page;
    await page.getByRole('button', { name: `Aktionen für ${firstTaskTitle}` }).click();
    await page.getByRole('menuitem', { name: 'Löschen' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'gelöscht' })).toBeVisible();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByRole('heading', { name: firstTaskTitle })).toBeVisible();
  });
});

for (const theme of THEMES) {
  test.describe(`badge hierarchy · ${theme}`, () => {
    test.use({
      appOptions: {
        theme,
        tasks: SEED_TASKS.map((task, index) => index === 0
          ? { ...task, rolledOverFrom: YESTERDAY, date: TODAY }
          : task),
      },
      viewport: { width: 390, height: 812 },
    });

    test('reserves semantic colour for overdue and carried-over badges', async ({ app }) => {
      const page = app.page;
      const overdueCard = taskCard(page, 'e2e-overdue');
      const recurrenceCard = taskCard(page, 'e2e-morning');
      const checklistCard = taskCard(page, 'e2e-checklist');

      const overdue = overdueCard.getByText('Überfällig', { exact: true });
      const rollover = overdueCard.getByLabel('Von gestern übernommen');
      const recurrence = recurrenceCard.getByLabel('Wiederholende Aufgabe');
      const checklist = checklistCard.getByLabel('Checkliste: 1 von 2 erledigt');

      await expect(overdue).toBeVisible();
      await expect(rollover).toBeVisible();
      await expect(recurrence).toBeVisible();
      await expect(checklist).toBeVisible();

      const backgrounds = await Promise.all(
        [overdue, rollover, recurrence, checklist].map(locator =>
          locator.evaluate(element => getComputedStyle(element).backgroundColor),
        ),
      );

      expect(backgrounds[2], 'recurrence and checklist share the neutral badge surface')
        .toBe(backgrounds[3]);
      expect(backgrounds[0], 'overdue uses a semantic surface').not.toBe(backgrounds[2]);
      expect(backgrounds[1], 'carried-over uses a semantic surface').not.toBe(backgrounds[2]);
    });
  });
}
