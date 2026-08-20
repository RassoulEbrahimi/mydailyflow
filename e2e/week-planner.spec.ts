import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { KEYS, TODAY, type SeedTask } from './fixtures/synthetic-data';

const PLANNER_TASKS: SeedTask[] = [
  {
    id: 'planner-recurring',
    title: 'Wochenplanung prüfen',
    time: '09:15',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    priority: 'high',
    createdAt: '2026-05-18T06:00:00.000+02:00',
    date: TODAY,
    recurrence: 'weekly',
    checklistItems: [{ id: 'planner-check', text: 'Rhythmus erhalten', completed: false }],
  },
  {
    id: 'planner-untimed',
    title: 'برنامه هفتگی بدون ساعت',
    time: '',
    duration: '45m',
    timeBlock: 'evening',
    completed: false,
    priority: 'medium',
    createdAt: '2026-05-18T06:01:00.000+02:00',
    date: '2026-05-21',
  },
  {
    id: 'planner-mixed',
    title: 'Review برنامه Friday',
    time: '14:30',
    duration: '30m',
    timeBlock: 'afternoon',
    completed: false,
    priority: 'low',
    createdAt: '2026-05-18T06:02:00.000+02:00',
    date: '2026-05-22',
  },
];

async function openPlanner(page: Page) {
  await page.getByRole('button', { name: 'Wochenrückblick öffnen' }).click();
  await page.getByRole('button', { name: 'Diese Woche planen' }).click();
  const planner = page.locator('[data-week-planner]');
  await expect(planner).toBeVisible();
  return planner;
}

async function storedTask(page: Page, id: string) {
  return page.evaluate(({ key, taskId }) => {
    const raw = localStorage.getItem(key);
    const tasks = raw ? JSON.parse(raw).data : [];
    return tasks.find((task: { id: string }) => task.id === taskId) ?? null;
  }, { key: KEYS.tasks, taskId: id });
}

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`P2-4 week planner layout — ${viewport.name} ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        appOptions: { theme, tasks: PLANNER_TASKS },
      });

      test('renders seven accessible day canvases without horizontal overflow', async ({ app }) => {
        const planner = await openPlanner(app.page);
        await expect(planner.locator('[data-planner-day]')).toHaveCount(7);
        await expect(planner.locator('[data-planner-lane]')).toHaveCount(28);
        await expect(planner.getByText('برنامه هفتگی بدون ساعت', { exact: true })).toBeVisible();
        expect(await app.direction(planner.getByText('برنامه هفتگی بدون ساعت', { exact: true }))).toBe('rtl');

        const geometry = await planner.evaluate(root => ({
          viewport: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          plannerRight: root.getBoundingClientRect().right,
          escaped: [...root.querySelectorAll<HTMLElement>('[data-planner-task]')].some(card => {
            const rect = card.getBoundingClientRect();
            return rect.left < root.getBoundingClientRect().left - 0.5 || rect.right > root.getBoundingClientRect().right + 0.5;
          }),
        }));
        expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.plannerRight).toBeLessThanOrEqual(geometry.viewport + 0.5);
        expect(geometry.escaped).toBe(false);

        const axe = await new AxeBuilder({ page: app.page }).include('[data-week-planner]').analyze();
        expect(axe.violations).toEqual([]);
      });
    });
  }
}

test.describe('P2-4 accessible movement', () => {
  test.use({
    viewport: { width: 390, height: 812 },
    appOptions: { theme: 'dark', tasks: PLANNER_TASKS },
  });

  test('moves an untimed Persian task to another day without inventing a time', async ({ app }) => {
    const planner = await openPlanner(app.page);
    await planner.getByRole('button', { name: 'Verschieben: برنامه هفتگی بدون ساعت' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'برنامه هفتگی بدون ساعت' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /So.*24\.05/ }).click();
    await expect(dialog.getByRole('button', { name: 'Ohne Zeit' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Verschieben', exact: true }).click();

    await expect.poll(() => storedTask(app.page, 'planner-untimed')).toMatchObject({
      date: '2026-05-24',
      time: '',
      timeBlock: 'evening',
    });
    await expect(planner.locator('[data-planner-day="2026-05-24"]')).toContainText('برنامه هفتگی بدون ساعت');
  });

  test('assigns an explicit time on the series day and preserves recurrence/checklist data', async ({ app }) => {
    const planner = await openPlanner(app.page);
    await planner.getByRole('button', { name: 'Verschieben: Wochenplanung prüfen' }).click();
    const dialog = app.page.getByRole('dialog', { name: 'Wochenplanung prüfen' });
    await expect(dialog.getByRole('button', { name: /Fr.*22\.05/ })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Nachmittag' }).click();
    await dialog.getByLabel('Neue Startzeit').fill('16:30');
    await dialog.getByRole('button', { name: 'Verschieben', exact: true }).click();

    await expect.poll(() => storedTask(app.page, 'planner-recurring')).toMatchObject({
      date: TODAY,
      time: '16:30',
      timeBlock: 'afternoon',
      recurrence: 'weekly',
      checklistItems: [{ id: 'planner-check', text: 'Rhythmus erhalten', completed: false }],
    });
    await expect(planner.locator('p[role="status"]')).toContainText('Mittwoch');
  });

  test('keeps all movement controls keyboard reachable and at least 44px', async ({ app }) => {
    const planner = await openPlanner(app.page);
    const moveButtons = planner.getByRole('button', { name: /^Verschieben:/ });
    await expect(moveButtons).toHaveCount(3);
    for (let index = 0; index < await moveButtons.count(); index += 1) {
      const box = await moveButtons.nth(index).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const firstMoveButton = moveButtons.first();
    await firstMoveButton.focus();
    await app.page.keyboard.press('Enter');
    const dialog = app.page.getByRole('dialog', { name: 'Wochenplanung prüfen' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Verschieben abbrechen' })).toBeFocused();
    await app.page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Verschieben', exact: true })).toBeFocused();
    await app.page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Verschieben abbrechen' })).toBeFocused();
    await app.page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(firstMoveButton).toBeFocused();
  });

  test('supports pointer drag with the same persisted result as the visible action', async ({ app }) => {
    const planner = await openPlanner(app.page);
    const day = planner.locator('[data-planner-day="2026-05-20"]');
    await day.scrollIntoViewIfNeeded();
    const handle = day.getByRole('button', { name: 'Ziehen: Wochenplanung prüfen' });
    const destination = day.locator('[data-planner-lane="planner:2026-05-20:afternoon"]');
    const handleBox = await handle.boundingBox();
    const destinationBox = await destination.boundingBox();
    expect(handleBox).not.toBeNull();
    expect(destinationBox).not.toBeNull();

    await app.page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(destinationBox!.x + destinationBox!.width / 2, destinationBox!.y + destinationBox!.height / 2, { steps: 12 });
    await app.page.mouse.up();

    await expect.poll(() => storedTask(app.page, 'planner-recurring')).toMatchObject({
      date: TODAY,
      time: '14:00',
      timeBlock: 'afternoon',
      recurrence: 'weekly',
    });
    await expect(day.locator('[data-planner-lane="planner:2026-05-20:afternoon"]')).toContainText('Wochenplanung prüfen');
  });
});
