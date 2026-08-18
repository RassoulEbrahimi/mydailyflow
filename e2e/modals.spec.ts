/**
 * modals.spec.ts — the bottom sheets, measured while actually open.
 *
 * The matrix in `viewports.spec.ts` measures whatever is on screen. The sheets
 * are mounted but closed there, and their collapsed disclosure panel is
 * `opacity-0`, so a whole surface of controls — duration chips, the recurrence
 * select, the reminder switch, the priority segmented control — is never judged
 * by it. Those are exactly the controls PR3 renamed and re-tokenised, so they
 * get a pass of their own here: opened, expanded, and measured.
 *
 * Both themes, at 390 x 812. Width does not change any of these controls.
 */

import { expect, test, THEMES } from './fixtures/app';
import { measurePage } from './utils/measure';
import { recordFindings } from './utils/report';

for (const theme of THEMES) {
  test.describe(`open sheets · ${theme}`, () => {
    test.use({ appOptions: { theme }, viewport: { width: 390, height: 812 } });

    test('NewTaskModal, with Aufgabendetails expanded, is legible and named', async ({
      app,
    }, testInfo) => {
      await app.page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
      await app.page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();

      const dialog = app.page.getByRole('dialog', { name: 'Neue Aufgabe' });
      await expect(dialog).toBeVisible();

      // Expand the disclosure — everything inside it is opacity-0 until then.
      await app.page.getByRole('button', { name: /Aufgabendetails/ }).click();
      await app.page.waitForTimeout(400); // the panel animates open

      const measured = await measurePage(app.page);
      const failing = measured.contrast.filter((c) => !c.passes);

      await recordFindings(testInfo, `modal-new-task-${theme}`, {
        theme,
        contrast: measured.contrast,
        contrastFailures: failing,
        contrastExcluded: measured.excludedContrast,
        namelessControls: measured.namelessControls,
        subFortyFour: measured.hitTargets.filter((t) => !t.meets44 && t.inViewport),
      });

      expect(
        failing.map(
          (c) =>
            `${c.foreground} on ${c.background} = ${c.ratio}:1 (needs ${c.threshold}) ` +
            `${c.fontSizePx}px/${c.fontWeight} — ${c.path}`,
        ),
        `NewTaskModal @ ${theme}: every text pair meets its threshold`,
      ).toEqual([]);

      expect(
        measured.namelessControls.map((c) => c.path),
        `NewTaskModal @ ${theme}: every control has an accessible name`,
      ).toEqual([]);

      // The controls the sheet is really about: the recurrence select and the
      // reminder switch were both unnamed at the PR0 baseline.
      await expect(app.page.getByLabel('Wiederholung')).toBeVisible();
      const reminderSwitch = app.page.getByRole('switch', {
        name: 'Erinnerung 10 Minuten vorher',
      });
      await expect(reminderSwitch).toBeVisible();
      await expect(reminderSwitch).toHaveAttribute('aria-checked', 'true');
    });

    test('SettingsModal is legible and named', async ({ app }, testInfo) => {
      await app.openSettings();

      const measured = await measurePage(app.page);
      const failing = measured.contrast.filter((c) => !c.passes);

      await recordFindings(testInfo, `modal-settings-${theme}`, {
        theme,
        contrast: measured.contrast,
        contrastFailures: failing,
        contrastExcluded: measured.excludedContrast,
        namelessControls: measured.namelessControls,
        subFortyFour: measured.hitTargets.filter((t) => !t.meets44 && t.inViewport),
      });

      expect(
        failing.map(
          (c) =>
            `${c.foreground} on ${c.background} = ${c.ratio}:1 (needs ${c.threshold}) ` +
            `${c.fontSizePx}px/${c.fontWeight} — ${c.path}`,
        ),
        `SettingsModal @ ${theme}: every text pair meets its threshold`,
      ).toEqual([]);

      expect(
        measured.namelessControls.map((c) => c.path),
        `SettingsModal @ ${theme}: every control has an accessible name`,
      ).toEqual([]);

      // The sticky-hero row is a switch, not an unlabelled button.
      const stickySwitch = app.page.getByRole('switch', { name: /Kopfzeile fixieren/ });
      await expect(stickySwitch).toBeVisible();
      await expect(stickySwitch).toHaveAttribute('aria-checked', 'true');
    });
  });
}
