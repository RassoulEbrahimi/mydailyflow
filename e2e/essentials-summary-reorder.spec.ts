import { test, expect, THEMES, VIEWPORTS } from './fixtures/app';
import { TODAY, type SeedEssential } from './fixtures/synthetic-data';

const ESSENTIALS: SeedEssential[] = [
  {
    id: 'b7-simple-open',
    title: 'Morgenroutine starten',
    targetCount: 1,
    order: 0,
    createdAt: `${TODAY}T06:00:00.000+02:00`,
  },
  {
    id: 'b7-multi-fa',
    title: 'آب کافی بنوش',
    targetCount: 5,
    order: 1,
    createdAt: `${TODAY}T06:01:00.000+02:00`,
  },
  {
    id: 'b7-simple-done',
    title: 'Frühstück vorbereiten',
    targetCount: 1,
    order: 2,
    createdAt: `${TODAY}T06:02:00.000+02:00`,
  },
  {
    id: 'b7-multi-open',
    title: 'Fokusblöcke',
    targetCount: 3,
    order: 3,
    createdAt: `${TODAY}T06:03:00.000+02:00`,
  },
  {
    id: 'b7-extra-open',
    title: 'Lesen',
    targetCount: 1,
    order: 4,
    createdAt: `${TODAY}T06:04:00.000+02:00`,
  },
];

const PARTIAL_STATE = {
  date: TODAY,
  progressById: {
    'b7-simple-open': 0,
    'b7-multi-fa': 2,
    'b7-simple-done': 1,
    'b7-multi-open': 1,
    'b7-extra-open': 0,
  },
};

const options = {
  essentials: ESSENTIALS,
  essentialsState: PARTIAL_STATE,
};

test.describe('Phase 1B B7 · Daily Essentials summary and types', () => {
  test.use({ appOptions: options });

  test('collapsed strip summarizes the next incomplete essentials', async ({ app }) => {
    const collapse = app.page.getByRole('button', { name: /Tägliche Essentials/ });
    await collapse.click();

    await expect(collapse).toHaveAttribute('aria-expanded', 'false');
    const summary = app.page.getByTestId('essentials-collapsed-summary');
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Morgenroutine starten', { exact: true })).toBeVisible();
    await expect(summary.getByText('آب کافی بنوش', { exact: true })).toBeVisible();
    await expect(summary.getByText('2/5', { exact: true })).toBeVisible();
    await expect(summary.getByText('+2 offen', { exact: true })).toBeVisible();
    await expect(summary.getByText('Frühstück vorbereiten', { exact: true })).toHaveCount(0);
    await expect(app.page.locator('[data-essential-id="b7-simple-open"]')).toHaveCount(0);
  });

  test('expanded rows state their interaction model', async ({ app }) => {
    const section = app.page.getByRole('button', { name: 'Essentials verwalten' }).locator('xpath=ancestor::section');

    await expect(section.locator('[data-essential-type="simple"]')).toHaveCount(3);
    await expect(section.locator('[data-essential-type="multiple"]')).toHaveCount(2);
    await expect(section.getByText('Einfach', { exact: true })).toHaveCount(3);
    await expect(section.getByText('Mehrfach · 5', { exact: true })).toBeVisible();
    await expect(section.getByText('Mehrfach · 3', { exact: true })).toBeVisible();

    const persianTitle = section.locator('[dir="auto"]').filter({ hasText: 'آب کافی بنوش' }).first();
    await expect(persianTitle).toBeVisible();
    expect(await app.direction(persianTitle)).toBe('rtl');
  });
});

test.describe('Phase 1B B7 · completed summary', () => {
  test.use({
    appOptions: {
      essentials: ESSENTIALS,
      essentialsState: {
        date: TODAY,
        progressById: Object.fromEntries(ESSENTIALS.map((essential) => [essential.id, essential.targetCount])),
      },
    },
  });

  test('collapsed strip celebrates a fully completed day', async ({ app }) => {
    await app.page.getByRole('button', { name: /Tägliche Essentials/ }).click();
    await expect(app.page.getByTestId('essentials-collapsed-summary')).toHaveText('Alles für heute erledigt');
  });
});

test.describe('Phase 1B B7 · discoverable reorder handle', () => {
  test.use({ appOptions: options });

  test('manage view exposes a named 44px handle and usage hint for every item', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Essentials verwalten' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Essentials verwalten' });
    await expect(dialog.getByText('Mit dem Griff ziehen oder per Tastatur verschieben.')).toBeVisible();

    const handles = dialog.getByRole('button', { name: /^Reihenfolge ändern:/ });
    await expect(handles).toHaveCount(ESSENTIALS.length);
    for (const handle of await handles.all()) {
      const box = await handle.boundingBox();
      expect(box).not.toBeNull();
      expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
    }
  });

  test('keyboard reordering persists and updates the Today list', async ({ app }) => {
    await app.page.getByRole('button', { name: 'Essentials verwalten' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Essentials verwalten' });
    const firstHandle = dialog.getByRole('button', { name: 'Reihenfolge ändern: Morgenroutine starten' });

    await firstHandle.focus();
    await firstHandle.press('Enter');
    await firstHandle.press('ArrowDown');
    await firstHandle.press('Enter');

    await expect.poll(async () => {
      const handleOrder = await dialog
        .getByRole('button', { name: /^Reihenfolge ändern:/ })
        .evaluateAll((handles) => handles.map((handle) => handle.getAttribute('aria-label')));
      return handleOrder.slice(0, 2);
    }).toEqual([
      'Reihenfolge ändern: آب کافی بنوش',
      'Reihenfolge ändern: Morgenroutine starten',
    ]);

    await expect.poll(async () => {
      const raw = await app.page.evaluate(() => localStorage.getItem('myDailyFlowEssentialsData'));
      const parsed = JSON.parse(raw!) as { data: SeedEssential[] };
      return parsed.data.sort((a, b) => a.order - b.order).map((essential) => essential.id);
    }).toEqual(['b7-multi-fa', 'b7-simple-open', 'b7-simple-done', 'b7-multi-open', 'b7-extra-open']);

    await dialog.getByRole('button', { name: 'Schließen' }).click();
    const todayOrder = await app.page.locator('section [data-essential-id]').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-essential-id')),
    );
    expect(todayOrder.slice(0, 2)).toEqual(['b7-multi-fa', 'b7-simple-open']);
  });
});

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`Phase 1B B7 · compact summary · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme, ...options },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('summary and Settings stay inside the viewport', async ({ app }) => {
        await app.page.getByRole('button', { name: /Tägliche Essentials/ }).click();
        const result = await app.page.getByRole('button', { name: 'Essentials verwalten' }).locator('xpath=ancestor::section').evaluate((section) => {
          const summary = section.querySelector<HTMLElement>('[data-testid="essentials-collapsed-summary"]')!;
          const settings = section.querySelector<HTMLElement>('button[aria-label="Essentials verwalten"]')!;
          const sectionBox = section.getBoundingClientRect();
          const summaryBox = summary.getBoundingClientRect();
          const settingsBox = settings.getBoundingClientRect();
          return {
            pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            summaryInside: summaryBox.left >= sectionBox.left - 1 && summaryBox.right <= sectionBox.right + 1,
            settingsInside: settingsBox.left >= sectionBox.left - 1 && settingsBox.right <= sectionBox.right + 1,
            settingsSize: [Math.round(settingsBox.width), Math.round(settingsBox.height)],
          };
        });

        expect(result.pageOverflow).toBeLessThanOrEqual(1);
        expect(result.summaryInside).toBe(true);
        expect(result.settingsInside).toBe(true);
        expect(result.settingsSize[0]).toBeGreaterThanOrEqual(44);
        expect(result.settingsSize[1]).toBeGreaterThanOrEqual(44);
      });
    });
  }
}
