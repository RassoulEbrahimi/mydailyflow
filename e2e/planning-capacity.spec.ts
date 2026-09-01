import { AxeBuilder } from '@axe-core/playwright';
import { test, expect, THEMES, VIEWPORTS } from './fixtures/app';
import { TODAY, type SeedTask } from './fixtures/synthetic-data';

const task = (id: string, title: string, time: string, duration: string): SeedTask => ({
    id,
    title,
    time,
    duration,
    timeBlock: time >= '12:00' ? 'afternoon' : 'morning',
    completed: false,
    priority: 'medium',
    createdAt: '2026-08-16T06:00:00.000Z',
    date: TODAY,
});

const CAPACITY_TASKS: SeedTask[] = [
    task('meeting', 'Kundentermin', '09:00', '1h'),
    task('overlap', 'Zug zum Flughafen', '09:30', '2h'),
    task('flexible-fa', 'گزارش پروژه را آماده کن', '', '6h'),
];

test.describe('fixed commitments and daily capacity', () => {
    test.use({
        viewport: { width: 390, height: 812 },
        appOptions: { theme: 'light', tasks: CAPACITY_TASKS },
    });

    test('distinguishes fixed and flexible work and warns without changing the plan', async ({ app }) => {
        const before = await app.readStorage();
        const card = app.page.getByRole('region', { name: 'Tagesrahmen' });

        await expect(card).toContainText('2 feste Termine');
        await expect(card).toContainText('1 flexible Aufgabe');
        await expect(card).toContainText('9 Std.');
        await expect(card).toContainText('1 Std. über dem Orientierungsrahmen');
        await expect(card).toContainText('Zeitkonflikt 09:00');
        await expect(card.getByRole('progressbar', { name: 'Geplante Tageskapazität' })).toHaveAttribute('aria-valuetext', '9 Std. von 8 Std.');

        await expect(app.page.getByText('Fester Termin', { exact: true })).toHaveCount(2);
        expect(await app.direction(app.page.getByText('گزارش پروژه را آماده کن', { exact: true }))).toBe('rtl');
        expect(await app.readStorage()).toEqual(before);
    });

    test('explains the existing time model in the capture sheet', async ({ app }) => {
        await app.page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
        await app.page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();
        const dialog = app.page.getByRole('dialog', { name: 'Neue Aufgabe' });
        await expect(dialog.getByRole('button', { name: 'Mit Uhrzeit', exact: true })).toContainText('Fester Termin');
        await expect(dialog.getByRole('button', { name: 'Ohne Zeit', exact: true })).toContainText('Flexibel');
        await expect(dialog).toContainText('Eine Uhrzeit reserviert einen festen Termin.');
    });

    test('keeps the same distinction visible in the Week Planner', async ({ app }) => {
        await app.page.getByRole('button', { name: 'Wochenrückblick öffnen' }).click();
        await app.page.getByRole('button', { name: 'Diese Woche planen' }).click();
        const planner = app.page.locator('[data-week-planner]');

        await expect(planner.getByText('Fester Termin', { exact: true })).toHaveCount(2);
        await expect(planner.getByText('Flexibel', { exact: true })).toHaveCount(1);
    });
});

for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
        test.describe(`capacity layout · ${viewport.name} · ${theme}`, () => {
            test.use({
                viewport: { width: viewport.width, height: viewport.height },
                appOptions: { theme, tasks: CAPACITY_TASKS },
            });

            test('stays contained, legible and accessible', async ({ app }) => {
                const card = app.page.getByRole('region', { name: 'Tagesrahmen' });
                await card.scrollIntoViewIfNeeded();
                await expect(card).toBeVisible();

                const geometry = await card.evaluate(element => {
                    const rect = element.getBoundingClientRect();
                    return {
                        left: rect.left,
                        right: rect.right,
                        viewport: document.documentElement.clientWidth,
                        pageWidth: document.documentElement.scrollWidth,
                    };
                });
                expect(geometry.left).toBeGreaterThanOrEqual(0);
                expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 0.5);
                expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport);

                const axe = await new AxeBuilder({ page: app.page }).include('[data-planning-capacity]').analyze();
                expect(axe.violations).toEqual([]);
            });
        });
    }
}
