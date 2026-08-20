import type { Page } from '@playwright/test';

import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { KEYS, TODAY } from './fixtures/synthetic-data';

const TOMORROW = '2026-05-21';
const FUTURE_DATE = '2026-05-25';

async function storedTask(page: Page, title: string) {
  return page.evaluate(
    ({ key, taskTitle }) => {
      const raw = localStorage.getItem(key);
      const tasks = raw ? JSON.parse(raw).data : [];
      return tasks.find((task: { title: string }) => task.title === taskTitle) ?? null;
    },
    { key: KEYS.tasks, taskTitle: title },
  );
}

async function manualTaskDialog(page: Page) {
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neue Aufgabe' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Phase 1B B8 — integrated planning flow', () => {
  test('plans an untimed task for tomorrow and reveals it in the exact All Tasks group', async ({ app }) => {
    const title = 'B8 Morgen ohne Uhrzeit';

    await app.page.getByRole('button', { name: 'Aufgabe für morgen' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Neue Aufgabe' });
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(TOMORROW);
    await expect(dialog.getByText('Morgen ·', { exact: false })).toContainText('Morgen ·');

    await dialog.getByRole('button', { name: 'Ohne Zeit', exact: true }).click();
    await expect(dialog.getByText('Morgen · Ohne Zeit', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Startzeit')).toBeHidden();
    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(app.navButton('all')).toHaveAttribute('aria-current', 'page');
    await expect(app.page.getByLabel('Nach Datum filtern')).toHaveValue(TOMORROW);
    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(app.page.getByText('Ohne Zeit', { exact: true }).first()).toBeVisible();
    await expect(app.page.locator('[data-planning-confirmation]')).toContainText(`${title} · Morgen · Ohne Zeit`);
    expect(await storedTask(app.page, title)).toMatchObject({
      date: TOMORROW,
      time: '',
      reminderEnabled: false,
    });
  });

  test('inherits the upcoming planning context from All Tasks', async ({ app }) => {
    await app.navButton('all').click();
    await app.page.getByRole('button', { name: 'Kommend', exact: true }).click();

    await expect(app.page.getByText('Planungsziel')).toBeVisible();
    await expect(app.page.getByText('Morgen', { exact: true }).first()).toBeVisible();
    await app.page.getByRole('button', { name: 'Hier planen' }).click();

    const dialog = app.page.getByRole('dialog', { name: 'Neue Aufgabe' });
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(TOMORROW);
  });

  test('inherits an exact future date and preserves it through save', async ({ app }) => {
    const title = 'B8 am gewählten Datum';
    await app.navButton('all').click();
    await app.page.getByLabel('Nach Datum filtern').fill(FUTURE_DATE);

    await expect(app.page.getByText('Mo., 25. Mai 2026', { exact: true }).first()).toBeVisible();
    await app.page.getByRole('button', { name: 'Hier planen' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Neue Aufgabe' });
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(FUTURE_DATE);
    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(app.page.getByLabel('Nach Datum filtern')).toHaveValue(FUTURE_DATE);
    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(await storedTask(app.page, title)).toMatchObject({ date: FUTURE_DATE });
  });

  test('keeps ordinary Today capture anchored to today', async ({ app }) => {
    const dialog = await manualTaskDialog(app.page);
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(TODAY);
    await expect(dialog.getByText(/Heute · \d{2}:\d{2} Uhr/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Mit Uhrzeit', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`B8 planning layout — ${viewport.name} ${theme}`, () => {
      test.use({ viewport: { width: viewport.width, height: viewport.height }, appOptions: { theme } });

      test('keeps the planning surfaces reachable without horizontal overflow', async ({ app }) => {
        const tomorrowButton = app.page.getByRole('button', { name: 'Aufgabe für morgen' });
        await tomorrowButton.scrollIntoViewIfNeeded();
        await expect(tomorrowButton).toBeVisible();
        expect((await tomorrowButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        await app.navButton('all').click();
        const planHere = app.page.getByRole('button', { name: 'Hier planen' });
        await expect(planHere).toBeVisible();
        expect((await planHere.boundingBox())?.height).toBeGreaterThanOrEqual(44);

        const hasHorizontalOverflow = await app.page.locator('main').evaluate(
          element => element.scrollWidth > element.clientWidth + 1,
        );
        expect(hasHorizontalOverflow).toBe(false);
      });
    });
  }
}
