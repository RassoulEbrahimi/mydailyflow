import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/app';
import { KEYS, TODAY } from './fixtures/synthetic-data';

const TOMORROW = '2026-05-21';

async function openNewTaskModal(page: Page) {
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neue Aufgabe' });
  await expect(dialog.getByLabel('Aufgabendatum')).toBeVisible();
  return dialog;
}

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

test.describe('task date capture', () => {
  test('defaults to today and saves into the Today view', async ({ app }) => {
    const title = 'Heute erfasste Aufgabe';
    const dialog = await openNewTaskModal(app.page);
    const date = dialog.getByLabel('Aufgabendatum');

    await expect(date).toHaveValue(TODAY);
    await expect(date).toHaveAttribute('min', TODAY);
    await expect(dialog.getByRole('button', { name: 'Heute', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(await storedTask(app.page, title)).toMatchObject({ date: TODAY });
  });

  test('the Tomorrow shortcut routes a new task to the matching All Tasks group', async ({ app }) => {
    const title = 'Morgen geplante Aufgabe';
    const dialog = await openNewTaskModal(app.page);

    await dialog.getByRole('button', { name: 'Morgen', exact: true }).click();
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(TOMORROW);
    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeHidden();
    await app.navButton('all').click();
    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(app.page.getByText(/21\. Mai 2026/)).toBeVisible();
    expect(await storedTask(app.page, title)).toMatchObject({ date: TOMORROW });
  });

  test('an arbitrary date is persisted and becomes a monthly recurrence anchor', async ({ app }) => {
    const title = 'Monatliche Aufgabe am Dreißigsten';
    const chosenDate = '2026-06-30';
    const dialog = await openNewTaskModal(app.page);

    await dialog.getByLabel('Aufgabendatum').fill(chosenDate);
    await dialog.getByRole('button', { name: /Aufgabendetails/ }).click();
    await dialog.getByLabel('Wiederholung').selectOption('monthly');
    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await app.navButton('all').click();
    await app.page.getByLabel('Nach Datum filtern').fill(chosenDate);
    await expect(app.page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(await storedTask(app.page, title)).toMatchObject({
      date: chosenDate,
      recurrence: 'monthly',
      recurrenceAnchorDay: 30,
    });
  });

  test('editing a task can move it to another date without changing its identity', async ({ app }) => {
    const title = 'Synthetische Aufgabe — Abend';
    const before = await storedTask(app.page, title);
    const heading = app.page.getByRole('heading', { name: title, exact: true });
    const card = app.page.locator('div.relative.overflow-hidden.rounded-2xl').filter({ has: heading });
    const editButton = card.getByRole('button', { name: 'Bearbeiten', exact: true });

    await editButton.focus();
    await editButton.press('Enter');
    const dialog = app.page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
    await expect(dialog.getByLabel('Aufgabendatum')).toHaveValue(TODAY);
    await dialog.getByLabel('Aufgabendatum').fill(TOMORROW);
    await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();

    await expect(heading).toBeHidden();
    const after = await storedTask(app.page, title);
    expect(after).toMatchObject({ id: before.id, date: TOMORROW });
  });

  test('a past date is refused inline and cannot be saved', async ({ app }) => {
    const title = 'Darf nicht gespeichert werden';
    const dialog = await openNewTaskModal(app.page);

    await dialog.getByLabel('Aufgabentitel').fill(title);
    await dialog.getByLabel('Aufgabendatum').fill('2026-05-19');

    await expect(dialog.getByRole('alert')).toHaveText('Vergangene Daten können nicht geplant werden.');
    await expect(dialog.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Fertig', exact: true })).toBeDisabled();
    expect(await storedTask(app.page, title)).toBeNull();
  });
});
