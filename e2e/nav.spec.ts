/**
 * nav.spec.ts — bottom navigation baseline.
 *
 * All four tabs now switch the view. "Erinnerungen" was inert at the PR0
 * baseline and was pinned there as a `test.fail()` expected failure; PR2 built
 * the screen, so that expected failure is now an ordinary passing regression
 * test (see `Erinnerungen tab` below).
 *
 * The Reminders screen is held to the standard the feasibility ADR sets: it may
 * describe foreground-only delivery and must never imply background, closed-app,
 * or exact-time delivery. Those assertions live here so a future copy edit that
 * re-introduces an over-promise fails the suite.
 */

import { annotate, recordFindings } from './utils/report';
import { expect, test, TAB_LABEL, waitForAppShell } from './fixtures/app';

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

    // PR3 gave the nav a name and marked the active destination with
    // `aria-current="page"`, so a screen reader announces which of the four the
    // user is on instead of four unrelated buttons.
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

    const current = semantics.filter((t) => t.ariaCurrent === 'page');
    expect(
      current.map((t) => t.label),
      'exactly one nav destination is marked current, and it is the active one',
    ).toEqual([TAB_LABEL.today]);

    // Every other destination must not claim to be current.
    for (const tab of semantics.filter((t) => t.label !== TAB_LABEL.today)) {
      expect(tab.ariaCurrent, `"${tab.label}" is not marked current`).toBeNull();
    }

    await expect(app.page.locator('nav')).toHaveAttribute('aria-label', 'Hauptnavigation');

    annotate(
      testInfo,
      'pr3',
      'Bottom nav: <nav aria-label="Hauptnavigation"> with aria-current="page" on the active destination. Active state is no longer colour-only.',
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
    await expect(app.page.getByRole('button', { name: 'Gestern', exact: true })).toBeVisible();
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

test.describe('Erinnerungen tab', () => {
  /**
   * Was a `test.fail()` expected failure at the PR0 baseline, when the tab had
   * no click handler at all. PR2 implemented the screen, so this is now an
   * ordinary regression test: if the tab ever goes inert again, it fails.
   */
  test('opens a real Reminders screen', async ({ app }) => {
    await app.navButton('reminders').click();

    // The Today content is replaced, not merely overlaid.
    await expect(app.page.getByText('Tägliche Essentials')).toBeHidden();
    await expect(app.hero()).toBeHidden();

    await expect(
      app.page.getByRole('heading', { level: 2, name: 'Erinnerungen', exact: true }),
    ).toBeVisible();
  });

  test('marks the Erinnerungen tab as active once opened', async ({ app }) => {
    const state = async () =>
      app.page.evaluate(() => {
        const nav = document.querySelector('nav');
        const button = Array.from(nav?.querySelectorAll('button') ?? []).find((b) =>
          (b.textContent || '').includes('Erinnerungen'),
        );
        return {
          pill: button?.querySelector('div')?.getAttribute('class') ?? '',
          label: button?.querySelector('span')?.getAttribute('class') ?? '',
        };
      });

    const before = await state();
    expect(before.pill).not.toContain('bg-primary');
    expect(before.label).toContain('text-fg-faint');

    await app.navButton('reminders').click();

    const after = await state();
    expect(after.pill, 'active tab gets the primary pill').toContain('bg-primary');
    expect(after.label, 'active tab label switches to primary').toContain('text-primary');
  });

  test('states foreground-only delivery and promises nothing more', async ({ app }, testInfo) => {
    await app.navButton('reminders').click();

    // The truth statement the ADR requires, verbatim.
    await expect(
      app.page.getByText(
        'Erinnerungen werden nur ausgelöst, solange My Daily Flow geöffnet ist.',
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      app.page.getByText('können geplante Erinnerungen ausbleiben', { exact: false }),
    ).toBeVisible();

    // And no over-promise anywhere on the screen. These are the claims the
    // feasibility spike concluded the app cannot make.
    const copy = (await app.page.locator('main').innerText()).toLowerCase();
    for (const forbidden of [
      'im hintergrund',
      'hintergrund-erinnerung',
      'auch wenn die app geschlossen',
      'garantiert',
      'zuverlässig',
      'pünktlich',
      'push',
    ]) {
      expect(copy, `Reminders copy must not claim "${forbidden}"`).not.toContain(forbidden);
    }

    await recordFindings(testInfo, 'reminders-screen-copy', {
      containsForegroundOnlyStatement: true,
      forbiddenClaimsFound: [],
    });
  });

  test('lists tasks that have reminders enabled, split by deliverability', async ({ app }) => {
    // The untimed case is injected here rather than added to the shared seed, so
    // the Today/All/Done fingerprints in the axe ratchet stay untouched by a
    // fixture that only this screen needs.
    await app.page.evaluate(() => {
      const raw = localStorage.getItem('myDailyFlowTasks');
      const parsed = JSON.parse(raw as string);
      parsed.data.push({
        id: 'e2e-untimed',
        title: 'Synthetische Aufgabe — ohne Zeit',
        time: '',
        duration: '20m',
        timeBlock: 'afternoon',
        completed: false,
        priority: 'low',
        createdAt: '2026-05-20T06:10:00.000+02:00',
        date: '2026-05-20',
      });
      localStorage.setItem('myDailyFlowTasks', JSON.stringify(parsed));
    });
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppShell(app.page);

    await app.navButton('reminders').click();

    // Seeded synthetic data: timed, future-dated tasks are deliverable today.
    await expect(app.page.getByRole('heading', { name: 'Geplant', exact: true })).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: /Synthetische Aufgabe — Abend/ }),
    ).toBeVisible();

    // The untimed task cannot be reminded about, and says so rather than
    // silently disappearing.
    await expect(
      app.page.getByRole('heading', { name: /Ohne Zeit/ }),
    ).toBeVisible();
    await expect(
      app.page.getByRole('button', { name: /Synthetische Aufgabe — ohne Zeit/ }),
    ).toBeVisible();
  });

  test('an untimed task is never shown as overdue', async ({ app }) => {
    await app.page.evaluate(() => {
      const parsed = JSON.parse(localStorage.getItem('myDailyFlowTasks') as string);
      // Dated today with no time: the regression made this render "Überfällig".
      parsed.data = [{
        id: 'e2e-untimed-today',
        title: 'Synthetische Aufgabe — ohne Zeit',
        time: '',
        duration: '20m',
        timeBlock: 'afternoon',
        completed: false,
        priority: 'low',
        createdAt: '2026-05-20T06:10:00.000+02:00',
        date: '2026-05-20',
      }];
      localStorage.setItem('myDailyFlowTasks', JSON.stringify(parsed));
    });
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppShell(app.page);

    const card = app.page.locator('main .rounded-2xl').filter({
      hasText: 'Synthetische Aufgabe — ohne Zeit',
    }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText('Überfällig')).toBeHidden();

    // And the meta row shows a real label instead of an orphan separator.
    const meta = await card.innerText();
    expect(meta).toContain('Ohne Zeit');
    expect(meta, 'no leading bullet before the duration').not.toMatch(/(^|\n)\s*•/);
  });

  test('shows a deliberate empty state when nothing is scheduled', async ({ app }) => {
    // Clear the tasks in place, then reopen the tab.
    await app.page.evaluate(() => {
      localStorage.setItem('myDailyFlowTasks', JSON.stringify({ version: 1, data: [] }));
    });
    await app.page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppShell(app.page);

    await app.navButton('reminders').click();

    await expect(app.page.getByText('Keine Erinnerungen geplant')).toBeVisible();
    // The empty state still tells the truth about how delivery works.
    await expect(
      app.page.getByText('solange die App geöffnet ist', { exact: false }),
    ).toBeVisible();
  });

  test('the Reminders tab is reachable and activatable by keyboard', async ({ app }) => {
    const navButton = app.navButton('reminders');
    await navButton.focus();
    await expect(navButton).toBeFocused();

    await app.page.keyboard.press('Enter');

    await expect(
      app.page.getByRole('heading', { level: 2, name: 'Erinnerungen', exact: true }),
    ).toBeVisible();
    await expect(app.page.getByText('Tägliche Essentials')).toBeHidden();
  });
});
