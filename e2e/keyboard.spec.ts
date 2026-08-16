/**
 * keyboard.spec.ts — keyboard traversal of the Today view.
 *
 * Records, without repairing:
 *   - the focus order Tab actually produces;
 *   - whether a visible focus indicator is drawn at each stop;
 *   - which task actions cannot be reached by keyboard at all;
 *   - which focusable controls have no accessible name.
 *
 * Everything asserted here is asserted against the *current* behaviour, so the
 * suite passes today and fails the moment PR4 changes it — at which point the
 * numbers in docs/a11y-baseline-1a.md get updated in the same PR.
 */

import { annotate, recordFindings } from './utils/report';
import { expect, test } from './fixtures/app';
import { traverseByKeyboard } from './utils/measure';

test.describe('keyboard traversal — Today', () => {
  test('Today can be traversed by keyboard, and the traversal is recorded', async ({
    app,
  }, testInfo) => {
    const steps = await traverseByKeyboard(app.page, 60);

    // The view is reachable at all: Tab does move focus through real controls.
    expect(steps.length, 'Tab must move focus through the Today view').toBeGreaterThan(5);

    const withoutIndicator = steps.filter((s) => !s.hasVisibleFocusIndicator);
    const ringed = steps.filter((s) => s.hasVisibleFocusIndicator);
    const weakRings = ringed.filter((s) => s.indicatorBelow3);
    const unnamed = steps.filter((s) => !s.label);
    const offscreen = steps.filter((s) => !s.inViewport);

    await recordFindings(testInfo, 'keyboard-focus-order-today', {
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

    // ── Finding 1: the app authors no focus style of its own ────────────────
    // Where a ring exists at all it is Chromium's UA default, whose colour is
    // derived from the element's own text colour. Against these surfaces that
    // lands at ~1.05–1.2:1 — drawn, but effectively invisible.
    expect(ringed.length, 'some stops do draw the UA ring').toBeGreaterThan(0);
    expect(
      weakRings.length,
      'baseline: every drawn focus ring is below the 3:1 non-text contrast minimum',
    ).toBe(ringed.length);

    annotate(
      testInfo,
      'baseline',
      `Focus indicator: ${ringed.length}/${steps.length} stops draw only Chromium's UA ring, all at ` +
        `${Math.min(...ringed.map((s) => s.indicatorContrast ?? 0))}–${Math.max(
          ...ringed.map((s) => s.indicatorContrast ?? 0),
        )}:1 against their surface (WCAG 2.4.11 needs 3:1). ` +
        `${withoutIndicator.length} stops draw nothing at all (focus:outline-none). ` +
        'The app defines no :focus-visible style anywhere. Owner: PR4.',
    );

    // ── Finding 2: controls with the ring explicitly removed ────────────────
    for (const step of withoutIndicator) {
      expect(
        step.focusStyle.outlineStyle,
        `${step.path} suppresses the focus ring outright`,
      ).toBe('none');
    }

    // ── Finding 3: unnamed controls sit in the tab ring ──────────────────────
    expect(
      unnamed.length,
      'baseline: at least the task-completion checkboxes are unnamed',
    ).toBeGreaterThan(0);

    annotate(
      testInfo,
      'baseline',
      `Unnamed focus stops: ${unnamed.length} of ${steps.length} (${unnamed
        .map((s) => s.path.split(' > ').pop())
        .join(', ')}). Owner: PR4.`,
    );

    // ── Finding 4: focus leaves the viewport into closed modals ─────────────
    // NewTaskModal is always mounted and merely translated off-screen when
    // closed, so Tab walks into a dialog the user cannot see.
    expect(
      offscreen.length,
      'baseline: focus reaches controls outside the viewport',
    ).toBeGreaterThan(0);

    annotate(
      testInfo,
      'baseline',
      `Off-screen focus stops: ${offscreen.length} (${offscreen
        .map((s) => s.label || '(unnamed)')
        .join(', ')}). These belong to NewTaskModal, which stays mounted at translate-y-full when closed. Owner: PR4.`,
    );
  });

  test('focus order puts hidden swipe actions ahead of the visible checkbox', async ({
    app,
  }, testInfo) => {
    const steps = await traverseByKeyboard(app.page, 60);

    // Within each task card the action strip precedes the card body in the DOM,
    // so Tab reaches Bearbeiten/Erledigt/Löschen — none of them visible — before
    // it reaches the checkbox the user can actually see.
    const stripLabels = new Set(['Bearbeiten', 'Erledigt', 'Löschen', 'Morgen', 'Rückgängig']);

    const firstCheckboxIndex = steps.findIndex(
      (s) => !s.label && s.path.includes('w-[22px]'),
    );
    const firstStripIndex = steps.findIndex(
      (s) => stripLabels.has(s.label) && s.path.includes('flex-1'),
    );

    expect(firstStripIndex, 'a swipe action appears in the tab ring').toBeGreaterThanOrEqual(0);
    expect(firstCheckboxIndex, 'a task checkbox appears in the tab ring').toBeGreaterThanOrEqual(0);
    expect(
      firstStripIndex,
      'baseline: hidden swipe actions are tabbed before the visible checkbox',
    ).toBeLessThan(firstCheckboxIndex);

    await recordFindings(testInfo, 'keyboard-focus-order-anomaly', {
      firstStripIndex,
      firstCheckboxIndex,
      sequence: steps.slice(0, 30).map((s) => s.label || '(unnamed)'),
    });

    annotate(
      testInfo,
      'baseline',
      `Focus order: the first hidden swipe action is tab stop #${firstStripIndex}, the first visible task checkbox is #${firstCheckboxIndex}. Owner: PR4.`,
    );
  });

  test('swipe-only task actions are focusable while invisible', async ({ app }, testInfo) => {
    // The action strip (Bearbeiten / Erledigt / Löschen) is always in the DOM,
    // positioned behind the card and revealed by a horizontal swipe. It is not
    // hidden from the accessibility tree, so keyboard focus enters buttons the
    // user cannot see and cannot otherwise reach.
    const strip = await app.page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('main button[aria-label]'),
      ).filter((b) => ['Bearbeiten', 'Erledigt', 'Löschen', 'Morgen', 'Rückgängig'].includes(b.getAttribute('aria-label') || ''));

      return buttons.map((b) => {
        const r = b.getBoundingClientRect();
        // Real hit-testing rather than geometry: whatever the browser returns
        // at the button's own centre point is what a user's finger would hit.
        const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          label: b.getAttribute('aria-label') || '',
          tabbable: b.tabIndex >= 0 && !b.disabled,
          ariaHidden: b.getAttribute('aria-hidden'),
          inertAttr: b.hasAttribute('inert'),
          rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
          // The strip lives underneath the card body; the card covers it fully
          // until a swipe translates the card left.
          occludedBy: topmost === b || b.contains(topmost) ? null : (topmost?.tagName.toLowerCase() ?? 'none'),
          coveredByCard: !(topmost === b || b.contains(topmost)),
        };
      });
    });

    await recordFindings(testInfo, 'task-action-strip-reachability', strip);

    expect(strip.length, 'the action strip renders for every task card').toBeGreaterThan(0);

    for (const button of strip) {
      // Focusable...
      expect(button.tabbable, `${button.label} is in the tab ring`).toBe(true);
      // ...and not hidden from assistive tech...
      expect(button.ariaHidden, `${button.label} is not aria-hidden`).toBeNull();
      expect(button.inertAttr, `${button.label} is not inert`).toBe(false);
      // ...while being visually covered by the card body.
      expect(button.coveredByCard, `${button.label} is visually covered`).toBe(true);
    }

    annotate(
      testInfo,
      'baseline',
      `Task action strip: ${strip.length} buttons are keyboard-focusable and exposed to AT while completely hidden behind the card body. Reachable by pointer only via a horizontal swipe, which has no keyboard equivalent. Owner: PR4.`,
    );
  });

  test('Daily Essentials rows are not keyboard operable', async ({ app }, testInfo) => {
    // Simple essentials and the section collapse toggle are click-handled <div>s
    // with no tabindex, no role and no key handler.
    const rows = await app.page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('section')).find((s) =>
        (s.textContent || '').includes('Tägliche Essentials'),
      );
      if (!section) return null;

      const collapseToggle = section.querySelector('div.cursor-pointer');
      const simpleRow = Array.from(section.querySelectorAll('div.cursor-pointer')).find((d) =>
        (d.textContent || '').includes('einfach'),
      );

      const shape = (el: Element | null | undefined) =>
        el
          ? {
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role'),
              tabindex: el.getAttribute('tabindex'),
              ariaChecked: el.getAttribute('aria-checked'),
              ariaExpanded: el.getAttribute('aria-expanded'),
              text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
            }
          : null;

      const chips = Array.from(section.querySelectorAll('button'))
        .filter((b) => /^\d+$/.test((b.textContent || '').trim()))
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            name: (b.textContent || '').trim(),
            width: Math.round(r.width),
            height: Math.round(r.height),
            ariaPressed: b.getAttribute('aria-pressed'),
            role: b.getAttribute('role'),
          };
        });

      return { collapseToggle: shape(collapseToggle), simpleRow: shape(simpleRow), chips };
    });

    expect(rows, 'the Daily Essentials section renders').not.toBeNull();
    await recordFindings(testInfo, 'essentials-keyboard-semantics', rows);

    // Collapse header: a <div onClick> — no role, no tabindex, no aria-expanded.
    expect(rows!.collapseToggle!.tag).toBe('div');
    expect(rows!.collapseToggle!.role).toBeNull();
    expect(rows!.collapseToggle!.tabindex).toBeNull();
    expect(rows!.collapseToggle!.ariaExpanded).toBeNull();

    // Simple essential row: same shape, and it is really a checkbox in disguise.
    expect(rows!.simpleRow!.tag).toBe('div');
    expect(rows!.simpleRow!.role).toBeNull();
    expect(rows!.simpleRow!.tabindex).toBeNull();
    expect(rows!.simpleRow!.ariaChecked).toBeNull();

    // Multi-target chips are real buttons, but carry no pressed state and are
    // 32x32 — under the 44x44 target minimum.
    expect(rows!.chips.length).toBe(6);
    for (const chip of rows!.chips) {
      expect(chip.ariaPressed, `chip "${chip.name}" has no pressed state`).toBeNull();
      expect(chip.width).toBeLessThan(44);
      expect(chip.height).toBeLessThan(44);
    }

    annotate(
      testInfo,
      'baseline',
      'Daily Essentials: collapse header and simple-essential rows are <div onClick> — not focusable, no role, no aria-expanded/aria-checked. Multi-target chips are 32x32 buttons named only by their digit, with no aria-pressed. Owner: PR4 (semantics) / PR5 (target size).',
    );
  });
});
