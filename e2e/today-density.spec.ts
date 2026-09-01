import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';
import { TODAY, YESTERDAY, type SeedEssential, type SeedTask } from './fixtures/synthetic-data';

const TRIAGE_TASKS: SeedTask[] = Array.from({ length: 17 }, (_, index) => ({
  id: `density-triage-${index + 1}`,
  title: index === 0 ? 'کار قدیمی برای بررسی' : `Offene Aufgabe ${index + 1}`,
  time: `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`,
  duration: '30m',
  timeBlock: index < 8 ? 'morning' : index < 14 ? 'afternoon' : 'evening',
  completed: false,
  priority: 'medium',
  createdAt: `${YESTERDAY}T06:00:00.000+02:00`,
  date: YESTERDAY,
}));

const ESSENTIALS: SeedEssential[] = [
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `density-simple-${index + 1}`,
    title: index === 0 ? 'صبحانه آماده کن' : `Einfaches Ziel ${index + 1}`,
    targetCount: 1,
    order: index,
    createdAt: `${TODAY}T06:00:00.000+02:00`,
  })),
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `density-multiple-${index + 1}`,
    title: index === 4 ? 'روزی پنج سؤال امتحان تئوری رانندگی پاسخ بده' : `Mehrfaches Ziel ${index + 1}`,
    targetCount: index === 1 ? 3 : 5,
    order: index + 9,
    createdAt: `${TODAY}T06:10:00.000+02:00`,
  })),
];

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`Today density · ${viewport.name} · ${theme}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        appOptions: { theme, tasks: TRIAGE_TASKS, essentials: ESSENTIALS },
      });

      test('keeps historical work collapsed and Essentials compact without losing 44px targets', async ({ app }) => {
        const triage = app.page.getByRole('region', { name: 'Morgen-Check' });
        await expect(triage.getByRole('button', { name: /Morgen-Check/ })).toHaveAttribute('aria-expanded', 'false');
        await expect(triage).toContainText('17 aus früheren Tagen');
        await expect(triage.getByRole('heading', { level: 3 })).toHaveCount(0);

        await expect(app.page.getByRole('region', { name: /Morgen \(/ })).toHaveCount(0);
        await expect(app.page.getByRole('region', { name: /Nachmittag \(/ })).toHaveCount(0);
        await expect(app.page.getByRole('region', { name: /Abend \(/ })).toHaveCount(0);
        await expect(app.page.getByTestId('today-plan-empty')).toHaveText('Noch keine Aufgaben für heute eingeplant.');

        const section = app.page.getByRole('button', { name: 'Essentials verwalten' }).locator('xpath=ancestor::section');
        await expect(section.getByText('Einfach', { exact: true })).toHaveCount(0);
        await expect(section.getByText('Mehrfach', { exact: true })).toHaveCount(0);

        const metrics = await section.evaluate((element) => {
          const rows = Array.from(element.querySelectorAll<HTMLElement>('[data-essential-id]'));
          const simple = rows.filter(row => row.dataset.essentialType === 'simple');
          const multiple = rows.filter(row => row.dataset.essentialType === 'multiple');
          const controls = Array.from(element.querySelectorAll<HTMLElement>('button[aria-label$="Fortschritt erhöhen"], button[aria-label$="Fortschritt verringern"]'));
          const sectionBox = element.getBoundingClientRect();
          return {
            sectionHeight: Math.round(sectionBox.height),
            maxSimpleHeight: Math.max(...simple.map(row => row.getBoundingClientRect().height)),
            maxMultipleHeight: Math.max(...multiple.map(row => row.getBoundingClientRect().height)),
            controlSizes: controls.map(control => {
              const box = control.getBoundingClientRect();
              return [Math.round(box.width), Math.round(box.height)];
            }),
            overflow: element.scrollWidth - element.clientWidth,
            mainScrollHeight: element.closest('main')!.scrollHeight,
          };
        });

        expect(metrics.sectionHeight).toBeLessThanOrEqual(1_050);
        expect(metrics.maxSimpleHeight).toBeLessThanOrEqual(62);
        expect(metrics.maxMultipleHeight).toBeLessThanOrEqual(100);
        expect(metrics.controlSizes).toHaveLength(10);
        expect(metrics.controlSizes.every(([width, height]) => width >= 44 && height >= 44)).toBe(true);
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        expect(metrics.mainScrollHeight).toBeLessThanOrEqual(1_700);
      });
    });
  }
}
