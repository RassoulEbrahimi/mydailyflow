/**
 * nav.spec.ts — bottom navigation baseline.
 *
 * Three of the four tabs switch the view. The fourth, "Erinnerungen", is a
 * button with no click handler at all (src/App.tsx renders it under the comment
 * "non-functional tab, keep stable"), so there is no Reminders screen to open.
 *
 * That gap is represented twice and hidden neither time:
 *   - a `test.fail()` test written against the behaviour the app *should* have,
 *     which the run reports as an expected failure;
 *   - a passing test that pins the current behaviour exactly, so the day the
 *     tab starts working, this suite says so.
 */

import { annotate, recordFindings } from './utils/report';
import { expect, test, TAB_LABEL } from './fixtures/app';

test.describe('bottom navigation', () => {
  test('renders exactly the four documented tabs', async ({ app }, testInfo) => {
    const buttons = app.page.locator('nav button');
    await expect(buttons).toHaveCount(4);

    const labels = await buttons.allInnerTexts();
    expect(labels.map((l) => l.trim())).toEqual([
      TAB_LABEL.today,
      TAB_LABEL.all,
      TAB_LABEL.reminders,
      TAB_LABEL.done,
    ]);

    // No tab semantics anywhere in the nav: these are plain buttons, so a screen
    // reader announces four unrelated buttons rather than a tab list with a
    // selected item. Recorded, not fixed.
    const semantics = await app.page.evaluate(() => {
      const nav = document.querySelector('nav');
      return Array.from(nav?.querySelectorAll('button') ?? []).map((b) => ({
        label: (b.textContent || '').replace(/\s+/g, ' ').trim(),
        role: b.getAttribute('role'),
        ariaSelected: b.getAttribute('aria-selected'),
        ariaCurrent: b.getAttribute('aria-current'),
        ariaPressed: b.getAttribute('aria-pressed'),
        hasAriaLabel: b.hasAttribute('aria-label'),
      }));
    });

    await recordFindings(testInfo, 'nav-tab-semantics', semantics);

    for (const tab of semantics) {
      expect(
        tab.role ?? tab.ariaSelected ?? tab.ariaCurrent ?? tab.ariaPressed,
        `baseline: "${tab.label}" carries no tab/selected/current semantics`,
      ).toBeNull();
    }

    annotate(
      testInfo,
      'baseline',
      'Bottom nav is four plain <button>s: no role="tablist"/"tab", no aria-selected, no aria-current. Active state is colour-only.',
    );
  });

  test('Heute opens the Today view', async ({ app }) => {
    await app.navButton('all').click();
    await expect(app.page.getByText('Tägliche Essentials')).toBeHidden();

    await app.navButton('today').click();
    await expect(app.page.getByText('Tägliche Essentials')).toBeVisible();
    await expect(app.hero()).toBeVisible();
    // Level 2 headings are the time-block section titles; task titles are h3.
    await expect(app.page.getByRole('heading', { level: 2, name: 'Morgen', exact: true })).toBeVisible();
    await expect(app.page.getByRole('heading', { level: 2, name: 'Nachmittag', exact: true })).toBeVisible();
    await expect(app.page.getByRole('heading', { level: 2, name: 'Abend', exact: true })).toBeVisible();
  });

  test('Alle Aufgaben opens the All Tasks view', async ({ app }) => {
    await app.navButton('all').click();

    await expect(app.page.getByRole('button', { name: 'Alle Daten' })).toBeVisible();
    await expect(app.page.getByRole('button', { name: 'Gestern' })).toBeVisible();
    // Today's tasks and yesterday's completed tasks are both grouped here.
    await expect(app.page.getByText('Synthetische Aufgabe — Morgen')).toBeVisible();
    await expect(app.page.getByText('Synthetische Aufgabe — gestern erledigt')).toBeVisible();
    // The hero belongs to Today only.
    await expect(app.hero()).toBeHidden();
  });

  test('Erledigt opens the Completed view', async ({ app }) => {
    await app.navButton('done').click();

    await expect(app.page.getByRole('heading', { name: 'Erledigte Aufgaben' })).toBeVisible();
    await expect(app.page.getByText('Synthetische Aufgabe — erledigt')).toBeVisible();
    // Incomplete work must not leak into Done.
    await expect(app.page.getByText('Synthetische Aufgabe — überfällig')).toBeHidden();
  });
});

test.describe('Erinnerungen tab — known gap', () => {
  /**
   * EXPECTED FAILURE (PR0 baseline).
   *
   * Reminders logic exists (useReminders schedules a notification 10 minutes
   * before a task), but no Reminders *screen* was ever built. The nav button
   * has no onClick, so pressing it does nothing at all.
   *
   * PR2 owns navigation and building a real, truthful Reminders screen. Until
   * then this test fails on purpose; if it ever passes, Playwright fails the run
   * so the baseline and the doc get updated together.
   */
  test.fail(
    'opens a Reminders screen',
    async ({ app }) => {
      await app.navButton('reminders').click();

      // Any real Reminders view would have to replace the Today content.
      await expect(app.page.getByText('Tägliche Essentials')).toBeHidden({ timeout: 2_000 });
    },
  );

  test('currently renders no Reminders screen at all (documented limitation)', async ({
    app,
  }, testInfo) => {
    const before = await app.page.locator('main').innerHTML();

    await app.navButton('reminders').click();
    await app.page.waitForTimeout(300);

    const after = await app.page.locator('main').innerHTML();

    // The click is inert: the view does not change by so much as one node.
    expect(after).toBe(before);

    // The Today view is still the one mounted.
    await expect(app.page.getByText('Tägliche Essentials')).toBeVisible();
    await expect(app.hero()).toBeVisible();

    // And the button never takes the active styling the other three get.
    const hasHandler = await app.page.evaluate(() => {
      const nav = document.querySelector('nav');
      const buttons = Array.from(nav?.querySelectorAll('button') ?? []);
      const reminders = buttons.find((b) => (b.textContent || '').includes('Erinnerungen'));
      const pill = reminders?.querySelector('div');
      return {
        activePillClasses: pill?.getAttribute('class') ?? '',
        labelClasses: reminders?.querySelector('span')?.getAttribute('class') ?? '',
      };
    });

    // The other tabs toggle `bg-primary/15` on the icon pill; this one has no
    // such class in either state because nothing ever sets an active tab for it.
    expect(hasHandler.activePillClasses).not.toContain('bg-primary');
    expect(hasHandler.labelClasses).toContain('text-fg-faint');

    await recordFindings(testInfo, 'reminders-tab-state', {
      clickChangesView: false,
      ...hasHandler,
      note:
        'App.tsx activeTab is typed \'today\' | \'all\' | \'done\'; the Erinnerungen button has no onClick and no active state.',
    });

    annotate(
      testInfo,
      'baseline',
      'Erinnerungen tab is inert: clicking it changes nothing in <main>. No Reminders screen exists. Owner: PR2.',
    );
  });
});
