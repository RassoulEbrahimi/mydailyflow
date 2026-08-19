import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} · ${theme}: Jetzt names the next open task above the fold`, async ({ app }) => {
      await app.page.setViewportSize({ width: viewport.width, height: viewport.height });

      const focus = app.page.getByRole('region', {
        name: 'Jetzt: Synthetische Aufgabe — mit Checkliste',
      });
      await expect(focus).toBeVisible();
      await expect(focus).toContainText('Jetzt · ab 15:00');
      await expect(focus).toContainText('4 offen heute');

      const action = focus.getByRole('button', {
        name: 'Aufgabe erledigen: Synthetische Aufgabe — mit Checkliste',
      });
      await expect(action).toBeVisible();
      const box = await action.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  }
}

test('completing the Jetzt task advances focus to the next open task', async ({ app }) => {
  const current = app.page.getByRole('region', {
    name: 'Jetzt: Synthetische Aufgabe — mit Checkliste',
  });
  await current.getByRole('button', {
    name: 'Aufgabe erledigen: Synthetische Aufgabe — mit Checkliste',
  }).click();

  await expect(app.page.getByRole('region', {
    name: 'Jetzt: Synthetische Aufgabe — Abend',
  })).toBeVisible();
});

test('editing from Jetzt opens the existing task sheet without changing data', async ({ app }) => {
  const focus = app.page.getByRole('region', {
    name: 'Jetzt: Synthetische Aufgabe — mit Checkliste',
  });
  await focus.getByRole('button', {
    name: 'Aufgabe bearbeiten: Synthetische Aufgabe — mit Checkliste',
  }).click();

  await expect(app.page.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeVisible();
  await expect(app.page.getByLabel('Aufgabentitel', { exact: true })).toHaveValue(
    'Synthetische Aufgabe — mit Checkliste',
  );
});
