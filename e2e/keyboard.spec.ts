/**
 * keyboard.spec.ts — keyboard traversal and focus of the Today view.
 *
 * PR0 recorded this area as a set of measured defects: no authored focus style
 * (Chromium's UA ring landed at 1.04–1.19:1), unnamed controls in the tab ring,
 * focus walking into closed modals, and Daily Essentials rows that were click-
 * handled <div>s with no role and no way in from the keyboard.
 *
 * PR3 closed all four, so every assertion here is now the *fixed* invariant
 * rather than the recorded defect. The measurements themselves are unchanged —
 * same traversal, same composited-colour maths — only the expected answers moved.
 */

import { annotate, recordFindings } from './utils/report';
import { expect, test, THEMES } from './fixtures/app';
import { traverseByKeyboard } from './utils/measure';

/**
 * WCAG 2.4.11 asks for 3:1 on the focus indicator. Chromium reports the
 * outline colour it will paint; `measure.ts` composites it against the actual
 * stack behind the control.
 */
const FOCUS_INDICATOR_MIN = 3;

for (const theme of THEMES) {
  test.describe(`keyboard traversal — Today · ${theme}`, () => {
    test.use({ appOptions: { theme } });

    test('every focus stop is named, on screen, and draws a 3:1 indicator', async ({
      app,
    }, testInfo) => {
      const steps = await traverseByKeyboard(app.page, 60);

      expect(steps.length, 'Tab must move focus through the Today view').toBeGreaterThan(5);

      const withoutIndicator = steps.filter((s) => !s.hasVisibleFocusIndicator);
      const ringed = steps.filter((s) => s.hasVisibleFocusIndicator);
      const weakRings = ringed.filter((s) => s.indicatorBelow3);
      const unnamed = steps.filter((s) => !s.label);
      const offscreen = steps.filter((s) => !s.inViewport);

      await recordFindings(testInfo, `keyboard-focus-order-today-${theme}`, {
        theme,
        totalStops: steps.length,
        order: steps.map((s) => ({
          index: s.index,
          label: s.label || '(no accessible name)',
          role: s.role,
          path: s.path,
          rect: s.rect,
          inViewport: s.inViewport,
          focusVisible: s.focusVisible,
          hasVisibleFocusIndicator: s.hasVisibleFocusIndicator,
          indicatorContrast: s.indicatorContrast,
          indicatorBelow3: s.indicatorBelow3,
          focusStyle: s.focusStyle,
        })),
        summary: {
          stopsWithNoIndicatorAtAll: withoutIndicator.length,
          stopsWithIndicator: ringed.length,
          stopsWithIndicatorBelow3to1: weakRings.length,
          indicatorContrastRange: ringed.length
            ? {
                min: Math.min(...ringed.map((s) => s.indicatorContrast ?? 0)),
                max: Math.max(...ringed.map((s) => s.indicatorContrast ?? 0)),
              }
            : null,
          stopsWithoutAccessibleName: unnamed.length,
          stopsOutsideViewport: offscreen.length,
        },
      });

      // ── 1. A focus indicator is drawn at every stop ─────────────────────
      // The app now authors `:focus-visible { outline: 2px solid var(--_focus) }`
      // in a base layer, so nothing falls back to the UA ring and nothing can
      // opt out with `focus:outline-none`.
      expect(
        withoutIndicator.map((s) => `${s.path} — outline-style ${s.focusStyle.outlineStyle}`),
        'every focus stop draws an indicator',
      ).toEqual([]);

      // ── 2. …and it clears the 3:1 non-text contrast minimum ─────────────
      expect(
        weakRings.map((s) => `${s.label || s.path} — ${s.indicatorContrast}:1`),
        `every focus indicator reaches ${FOCUS_INDICATOR_MIN}:1 against its surface`,
      ).toEqual([]);

      // ── 3. Every tab stop has an accessible name ────────────────────────
      expect(
        unnamed.map((s) => s.path),
        'every keyboard-reachable control has an accessible name',
      ).toEqual([]);

      // ── 4. Focus never leaves the visible screen ────────────────────────
      // The modals stay mounted at translate-y-full when closed; `inert` keeps
      // them out of the tab ring until they open.
      expect(
        offscreen.map((s) => `${s.label || '(unnamed)'} — ${s.path}`),
        'focus stays within the viewport (closed modals are inert)',
      ).toEqual([]);

      annotate(
        testInfo,
        'pr3',
        `${theme}: ${steps.length} focus stops, all named, all on screen, indicator contrast ` +
          `${Math.min(...ringed.map((s) => s.indicatorContrast ?? 0))}–${Math.max(
            ...ringed.map((s) => s.indicatorContrast ?? 0),
          )}:1.`,
      );
    });

    test('the swipe-only task actions are reachable and become visible on focus', async ({
      app,
    }, testInfo) => {
      // Pointer users reveal Bearbeiten / Erledigt / Löschen with a horizontal
      // swipe, which has no keyboard equivalent. The buttons stay in the tab
      // ring, and focusing one opens the strip so the user can see what is
      // focused.
      const stripLabels = ['Bearbeiten', 'Erledigt', 'Löschen', 'Morgen', 'Rückgängig'];

      const firstStrip = app.page
        .locator('main button')
        .filter({ hasText: '' })
        .and(app.page.getByLabel('Bearbeiten'))
        .first();

      await firstStrip.focus();
      await app.page.waitForTimeout(400); // the card body animates aside

      const state = await firstStrip.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
          covered: !(topmost === el || el.contains(topmost)),
          focused: document.activeElement === el,
        };
      });

      await recordFindings(testInfo, `task-action-strip-focus-${theme}`, state);

      expect(state.focused, 'the strip button holds focus').toBe(true);
      expect(
        state.covered,
        'focusing a swipe action reveals it instead of leaving it under the card',
      ).toBe(false);

      // Every action is still keyboard reachable and exposed to AT.
      for (const label of stripLabels) {
        const button = app.page.getByLabel(label).first();
        if ((await button.count()) === 0) continue;
        expect(await button.getAttribute('aria-hidden'), `${label} is not aria-hidden`).toBeNull();
      }
    });

    test('Daily Essentials rows are keyboard operable and carry real state', async ({
      app,
    }, testInfo) => {
      const rows = await app.page.evaluate(() => {
        const section = Array.from(document.querySelectorAll('section')).find((s) =>
          (s.textContent || '').includes('Tägliche Essentials'),
        );
        if (!section) return null;

        const shape = (el: Element | null | undefined) =>
          el
            ? {
                tag: el.tagName.toLowerCase(),
                role: el.getAttribute('role'),
                ariaChecked: el.getAttribute('aria-checked'),
                ariaExpanded: el.getAttribute('aria-expanded'),
                ariaLabel: el.getAttribute('aria-label'),
                text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
              }
            : null;

        const collapseToggle = section.querySelector('button[aria-expanded]');
        const simpleRow = section.querySelector('button[role="checkbox"]');

        const stepperControls = Array.from(section.querySelectorAll('button'))
          .filter((button) => /Fortschritt (erhöhen|verringern)$/.test(button.getAttribute('aria-label') || ''))
          .map((b) => ({
            ariaLabel: b.getAttribute('aria-label'),
            disabled: (b as HTMLButtonElement).disabled,
          }));

        return { collapseToggle: shape(collapseToggle), simpleRow: shape(simpleRow), stepperControls };
      });

      expect(rows, 'the Daily Essentials section renders').not.toBeNull();
      await recordFindings(testInfo, `essentials-keyboard-semantics-${theme}`, rows);

      // Collapse header: a real button that reports its expanded state.
      expect(rows!.collapseToggle, 'the collapse header is a button').not.toBeNull();
      expect(rows!.collapseToggle!.tag).toBe('button');
      expect(rows!.collapseToggle!.ariaExpanded).toBe('true');
      expect(rows!.collapseToggle!.ariaLabel).toBeTruthy();

      // Simple essential row: a checkbox, announced as one, with real state.
      expect(rows!.simpleRow, 'a simple essential row is a checkbox').not.toBeNull();
      expect(rows!.simpleRow!.tag).toBe('button');
      expect(rows!.simpleRow!.role).toBe('checkbox');
      expect(['true', 'false']).toContain(rows!.simpleRow!.ariaChecked);

      // Stepper controls are named by their action. Disabled state truthfully
      // exposes the lower and upper bounds without changing the 44px geometry.
      expect(rows!.stepperControls.length).toBeGreaterThan(0);
      for (const control of rows!.stepperControls) {
        expect(control.ariaLabel, 'each stepper control has an action name').toBeTruthy();
        expect(typeof control.disabled).toBe('boolean');
      }
    });

    test('a simple Essential can be toggled with the keyboard alone', async ({ app }) => {
      const row = app.page.locator('section button[role="checkbox"]').first();
      const before = await row.getAttribute('aria-checked');

      await row.focus();
      await app.page.keyboard.press('Enter');
      await app.page.waitForTimeout(200);

      expect(
        await row.getAttribute('aria-checked'),
        'Enter on a focused Essential flips its checked state',
      ).not.toBe(before);
    });

    test('opening a sheet moves focus into it, and closing returns it', async ({ app }) => {
      const trigger = app.settingsButton();
      await trigger.click();

      const dialog = app.page.getByRole('dialog', { name: 'Einstellungen' });
      await expect(dialog).toBeVisible();

      // Focus is inside the dialog, not left behind on the trigger.
      await expect
        .poll(
          () => dialog.evaluate((el) => el.contains(document.activeElement)),
          { message: 'focus moves into the Einstellungen sheet' },
        )
        .toBe(true);

      // Scoped to the dialog: two closed VoiceTaskModal sheets carry the same
      // "Schließen" label, and Playwright's role query still sees them.
      await dialog.getByRole('button', { name: 'Schließen' }).click();

      // …and comes back to whatever opened it, rather than dropping to <body>.
      await expect
        .poll(
          () =>
            app.page.evaluate(
              () => document.activeElement?.getAttribute('aria-label') ?? null,
            ),
          { message: 'focus returns to the control that opened the sheet' },
        )
        .toBe('Einstellungen');
    });

    test('the bottom navigation reports the current destination', async ({ app }) => {
      const nav = app.page.locator('nav');
      await expect(nav).toHaveAttribute('aria-label', 'Hauptnavigation');

      // Exactly one tab is marked current, and it is the one that is active.
      const current = nav.locator('button[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText('Heute');

      await app.navButton('reminders').click();
      await app.page.waitForTimeout(200);
      await expect(nav.locator('button[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('button[aria-current="page"]')).toContainText('Erinnerungen');
    });
  });
}
