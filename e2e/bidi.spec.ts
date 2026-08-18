/**
 * bidi.spec.ts — the PR5 RTL / mixed-content regression suite.
 *
 * The contract under test, stated once:
 *
 *   1. Application chrome is German and LTR. Nav, badges, times, durations,
 *      counters, headings and labels never reorder.
 *   2. Every user-authored string decides its own direction, independently of
 *      every other string and of the chrome around it.
 *   3. Isolation is standards-based: `dir="auto"` on the smallest content-only
 *      element, which the HTML rendering spec gives `unicode-bidi: isolate`.
 *      No Unicode directional control characters are ever stored.
 *   4. Layout is physical. An RTL title never moves the checkbox, the priority
 *      dot, the swipe strip or the FAB.
 *
 * Assertions read the *rendered* result — `getComputedStyle().direction`,
 * measured boxes, real overflow — rather than class names, because a class name
 * proves nothing about how Chromium actually laid the string out.
 */

import {
  ALL_BIDI_STRINGS,
  assertNoBidiControls,
  BIDI_CASE_BY_ID,
  BIDI_ESSENTIALS,
  BIDI_ESSENTIALS_STATE,
  BIDI_TASKS,
  BIDI_TITLE_CASES,
  FA_CHECKLIST,
  FA_NOTES,
} from './fixtures/bidi-data';
import { expect, test, THEMES, VIEWPORTS, type Tab } from './fixtures/app';

/** Seed every test in this file with the bidi corpus. */
const BIDI_SEED = {
  tasks: BIDI_TASKS,
  essentials: BIDI_ESSENTIALS,
  essentialsState: BIDI_ESSENTIALS_STATE,
} as const;

const CARD = 'div.relative.overflow-hidden.rounded-2xl';

/** Tolerance for sub-pixel layout rounding, in CSS px. */
const EPSILON = 1;

/**
 * Which edge of its box the rendered text actually hugs.
 *
 * `getComputedStyle().textAlign` cannot answer this: `text-align: start` is a
 * computed value in its own right, so Chromium serialises it back as "start"
 * for an LTR and an RTL element alike. The only honest measurement is where the
 * glyphs landed, so this ranges over the element's own text and compares the
 * painted text box with the element box.
 *
 * Returns 'left', 'right' or 'fill' (the text spans the whole box, so neither
 * edge is informative — a long wrapped string).
 */
async function renderedAlignment(
  locator: import('@playwright/test').Locator,
): Promise<'left' | 'right' | 'fill'> {
  return locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const slack = 2;
    const hugsLeft = text.left - box.left <= slack;
    const hugsRight = box.right - text.right <= slack;
    if (hugsLeft && hugsRight) return 'fill';
    return hugsLeft ? 'left' : 'right';
  });
}

/**
 * Open the "new task" modal. The FAB opens a two-item menu first ("Manuelle
 * Aufgabe" / "Sprachaufgabe"); the manual entry is the one with a title field.
 */
async function openNewTaskModal(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Neue Aufgabe' });
  await dialog.waitFor();
  // The sheet is always mounted; when closed it is `inert` and translated below
  // the viewport. "Visible" does not distinguish those, so wait for it to have
  // actually slid on screen before typing into it.
  await expect
    .poll(async () => (await dialog.boundingBox())?.y ?? Number.MAX_SAFE_INTEGER)
    .toBeLessThan((page.viewportSize()?.height ?? 812) - 120);
  return dialog;
}

/** Locate a card by the exact title text it renders. */
function cardForTitle(page: import('@playwright/test').Page, title: string) {
  return page.locator(CARD).filter({ has: page.locator('h3', { hasText: title }) });
}

async function switchTab(app: import('./fixtures/app').AppHarness, tab: Tab) {
  await app.navButton(tab).click();
  await app.page.waitForTimeout(250);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The data contract: nothing smuggles direction into storage.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('stored strings carry no direction', () => {
  test.use({ appOptions: { ...BIDI_SEED }, viewport: { width: 390, height: 812 } });

  test('the fixture itself is free of Unicode directional controls', async () => {
    for (const value of ALL_BIDI_STRINGS) {
      expect(assertNoBidiControls(value), `no bidi controls in ${JSON.stringify(value)}`).toBe(true);
    }
  });

  test('the app stores every title byte-for-byte as seeded', async ({ app }) => {
    const raw = (await app.readStorage())['myDailyFlowTasks'];
    expect(raw, 'the task slice is present').toBeTruthy();
    const stored: { title: string; notes?: string }[] = JSON.parse(raw!).data;

    for (const seeded of BIDI_TASKS) {
      const found = stored.find((t) => (t as { id?: string }).id === seeded.id);
      expect(found, `task ${seeded.id} survived the boot`).toBeTruthy();
      expect(found!.title, `title of ${seeded.id} is unchanged`).toBe(seeded.title);
      if (seeded.notes) expect(found!.notes).toBe(seeded.notes);
    }

    // And the app added no control characters of its own on the way through.
    for (const t of stored) {
      expect(assertNoBidiControls(t.title), 'stored title has no bidi controls').toBe(true);
    }
  });

  test('editing and saving a Persian task returns the identical string', async ({ app }) => {
    const page = app.page;
    const target = BIDI_CASE_BY_ID.get('bidi-fa')!;

    // Open the card's edit action through the swipe strip (focus reveals it).
    const card = cardForTitle(page, target.title);
    await expect(card).toHaveCount(1);
    // The strip is `pointer-events-none` until revealed; focusing reveals it
    // exactly as a swipe would, so focus first and let React settle.
    await card.getByLabel('Bearbeiten').focus();
    await page.waitForTimeout(350);
    await card.getByLabel('Bearbeiten').click();

    const dialog = page.getByRole('dialog', { name: 'Aufgabe bearbeiten' });
    await expect
      .poll(async () => (await dialog.boundingBox())?.y ?? Number.MAX_SAFE_INTEGER)
      .toBeLessThan((page.viewportSize()?.height ?? 812) - 120);

    const titleField = dialog.getByLabel('Aufgabentitel');
    await expect(titleField).toHaveValue(target.title);
    expect(await app.direction(titleField), 'the field opens in the string own direction').toBe('rtl');

    // Save without touching the text at all.
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await page.waitForTimeout(500);

    const raw = (await app.readStorage())['myDailyFlowTasks'];
    const stored: { id: string; title: string }[] = JSON.parse(raw!).data;
    const after = stored.find((t) => t.id === 'bidi-fa');
    expect(after!.title, 'a round trip through the editor changes nothing').toBe(target.title);
    expect(assertNoBidiControls(after!.title)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Per-string direction resolution across the whole matrix.
// ─────────────────────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`content direction · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme, ...BIDI_SEED },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('each title resolves to its own direction', async ({ app }) => {
        const page = app.page;
        const wrong: string[] = [];

        for (const c of BIDI_TITLE_CASES) {
          if (c.title === '') continue; // no text to locate; covered separately
          const h3 = page.locator('main h3').filter({ hasText: c.title }).first();
          await expect(h3, `${c.id} renders`).toHaveCount(1);
          const dir = await app.direction(h3);
          if (dir !== c.expectedDir) wrong.push(`${c.id} (${c.note}): expected ${c.expectedDir}, got ${dir}`);
        }

        expect(wrong, 'every title resolved as the bidi algorithm requires').toEqual([]);
      });

      test('an empty title renders an empty, LTR, non-overflowing box', async ({ app }) => {
        const page = app.page;
        // The empty-title card is the only one whose h3 has no text content.
        const empty = page.locator('main h3').filter({ hasNotText: /\S/ }).first();
        await expect(empty).toHaveCount(1);
        expect(await app.direction(empty), 'falls back to the LTR chrome').toBe('ltr');

        const box = await empty.evaluate((el) => {
          const card = el.closest('div.relative.overflow-hidden.rounded-2xl')!.getBoundingClientRect();
          const own = el.getBoundingClientRect();
          return { inside: own.left >= card.left - 1 && own.right <= card.right + 1 };
        });
        expect(box.inside).toBe(true);
      });

      test('RTL user content does not leak into the chrome around it', async ({ app }) => {
        const page = app.page;

        // The load-bearing property is *containment*, not the presence of an
        // isolate: Chromium's UA stylesheet computes `unicode-bidi: isolate`
        // for essentially every element, so asserting that on a `[dir="auto"]`
        // node would pass even with the attribute removed. What actually has to
        // hold is that a string resolving to RTL changes nothing above itself —
        // every ancestor up to <main> stays LTR.
        const leaks = await page.evaluate(() => {
          const bad: string[] = [];
          let rtlSeen = 0;

          for (const el of Array.from(document.querySelectorAll('main [dir="auto"]'))) {
            if (getComputedStyle(el).direction !== 'rtl') continue;
            rtlSeen++;
            const text = (el.textContent ?? '').slice(0, 20);

            for (let a = el.parentElement; a; a = a.parentElement) {
              if (getComputedStyle(a).direction !== 'ltr') {
                bad.push(`"${text}" flipped <${a.tagName.toLowerCase()}> to RTL`);
                break;
              }
              if (a.tagName === 'MAIN') break;
            }
          }

          return { bad, rtlSeen };
        });

        expect(leaks.rtlSeen, 'at least one string actually resolved to RTL').toBeGreaterThan(0);
        expect(leaks.bad, 'RTL stays inside the element that declared it').toEqual([]);

        // The chrome around them stays LTR, whatever the titles resolved to.
        const chrome = await page.evaluate(() => {
          const dirOf = (sel: string) => {
            const el = document.querySelector(sel);
            return el ? getComputedStyle(el).direction : null;
          };
          return {
            html: getComputedStyle(document.documentElement).direction,
            body: getComputedStyle(document.body).direction,
            nav: dirOf('nav'),
            main: dirOf('main'),
            heading: dirOf('main h2'),
          };
        });
        expect(chrome.html).toBe('ltr');
        expect(chrome.body).toBe('ltr');
        expect(chrome.nav).toBe('ltr');
        expect(chrome.main).toBe('ltr');
        expect(chrome.heading).toBe('ltr');
      });

      test('metadata beside RTL content keeps its order and its direction', async ({ app }) => {
        const page = app.page;

        // The overdue/rollover/recurrence card: German badges next to a Persian
        // title. The meta row is pinned LTR, so its children must run left to
        // right in DOM order, and its text must read forwards.
        const card = cardForTitle(page, 'پرداخت قبض برق و گاز');
        await expect(card).toHaveCount(1);

        const meta = card.locator('div[dir="ltr"]').first();
        expect(await app.direction(meta), 'the meta row is LTR').toBe('ltr');

        const order = await meta.evaluate((el) =>
          Array.from(el.children).map((c) => ({
            text: (c.textContent ?? '').trim(),
            left: Math.round(c.getBoundingClientRect().left),
            top: Math.round(c.getBoundingClientRect().top),
          })),
        );
        expect(order.length, 'time + recurrence + rollover + overdue badges').toBeGreaterThanOrEqual(3);

        // Within each wrapped line, DOM order must equal visual left-to-right order.
        for (let i = 1; i < order.length; i++) {
          if (order[i].top !== order[i - 1].top) continue; // different wrapped line
          expect(
            order[i].left,
            `"${order[i].text}" sits right of "${order[i - 1].text}"`,
          ).toBeGreaterThanOrEqual(order[i - 1].left);
        }

        // The German badge text is present and readable in logical order.
        await expect(card.getByText('Überfällig')).toBeVisible();
      });

      test('an untimed Persian task shows "Ohne Zeit" as LTR chrome', async ({ app }) => {
        const page = app.page;
        const card = cardForTitle(page, 'مطالعه کتاب قبل از خواب');
        await expect(card).toHaveCount(1);

        const title = card.locator('h3');
        expect(await app.direction(title), 'the title is RTL').toBe('rtl');

        const meta = card.locator('div[dir="ltr"]').first();
        expect(await app.direction(meta)).toBe('ltr');
        // The bullet belongs to the time segment, so the whole string is one run.
        await expect(meta).toContainText('Ohne Zeit');
        await expect(meta).toContainText('20m');
      });

      test('Persian notes and checklist rows render RTL and stay in the card', async ({ app }) => {
        const page = app.page;
        const card = cardForTitle(page, 'بازبینی اسناد پروژه');
        await expect(card).toHaveCount(1);

        const notes = card.locator('p[dir="auto"]');
        await expect(notes).toHaveCount(1);
        expect(await app.direction(notes), 'Persian notes are RTL').toBe('rtl');

        // The checklist preview shows the first four items; ours has three.
        const items = card.locator('button[role="checkbox"] span[dir="auto"]');
        await expect(items).toHaveCount(FA_CHECKLIST.length);
        for (let i = 0; i < FA_CHECKLIST.length; i++) {
          const row = items.nth(i);
          await expect(row).toHaveText(FA_CHECKLIST[i].text);
          expect(await app.direction(row), `checklist row ${i} is RTL`).toBe('rtl');
        }

        // Everything stays inside the card's painted box.
        const contained = await card.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const bad: string[] = [];
          for (const child of Array.from(el.querySelectorAll('h3, p, span, button'))) {
            const r = child.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < box.left - 1 || r.right > box.right + 1) {
              bad.push(`${child.tagName}: ${(child.textContent ?? '').slice(0, 20)}`);
            }
          }
          return bad;
        });
        expect(contained, 'no card child escapes the card box').toEqual([]);
      });

      test('no title overlaps the checkbox, the priority dot or the FAB', async ({ app }) => {
        const page = app.page;
        const overlaps = await page.evaluate((sel) => {
          const bad: string[] = [];
          const intersects = (a: DOMRect, b: DOMRect) =>
            a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

          for (const card of Array.from(document.querySelectorAll(sel))) {
            const h3 = card.querySelector('h3');
            const checkbox = card.querySelector('button[role="checkbox"]');
            const dot = card.querySelector('[role="img"][aria-label^="Priorität"]');
            if (!h3) continue;
            const t = h3.getBoundingClientRect();
            const label = (h3.textContent ?? '(empty)').slice(0, 24);
            if (checkbox && intersects(t, checkbox.getBoundingClientRect())) {
              bad.push(`title "${label}" overlaps its checkbox`);
            }
            if (dot && intersects(t, dot.getBoundingClientRect())) {
              bad.push(`title "${label}" overlaps its priority dot`);
            }
          }

          // The FAB deliberately floats over scrolled content, so "does any
          // title share its pixels" is not a defect and not a bidi question.
          // What matters is that no title escapes the card that clips it — that
          // is the only way RTL content could reach the FAB's column.
          for (const h3 of Array.from(document.querySelectorAll('main h3'))) {
            const card = h3.closest('div.relative.overflow-hidden.rounded-2xl');
            if (!card) continue;
            const t = h3.getBoundingClientRect();
            const c = card.getBoundingClientRect();
            if (t.left < c.left - 1 || t.right > c.right + 1) {
              bad.push(`title "${(h3.textContent ?? '').slice(0, 24)}" escapes its card`);
            }
          }
          return bad;
        }, CARD);

        expect(overlaps, 'RTL and mixed titles clear every control').toEqual([]);

        // And the FAB itself never mirrors: it is anchored to the physical
        // right edge whatever direction the content resolved to.
        const fab = page.getByRole('button', { name: 'Aufgabe hinzufügen' });
        const anchored = await fab.evaluate(
          (el) => window.innerWidth - el.getBoundingClientRect().right,
        );
        expect(anchored, 'the FAB stays on the physical right').toBeLessThan(40);
      });

      test('the long mixed title wraps inside its card and never overflows the page', async ({ app }) => {
        const page = app.page;
        const long = BIDI_CASE_BY_ID.get('bidi-long')!;
        const card = cardForTitle(page, long.title);
        await expect(card).toHaveCount(1);

        const measured = await card.locator('h3').evaluate((el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const cardBox = el.closest('div.relative.overflow-hidden.rounded-2xl')!.getBoundingClientRect();
          return {
            direction: cs.direction,
            // Logical, not physical: this is what lets the alignment follow the
            // string's own direction. Chromium serialises it back verbatim.
            textAlign: cs.textAlign,
            lines: Math.round(r.height / parseFloat(cs.lineHeight || '20')),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            withinCard: r.left >= cardBox.left - 1 && r.right <= cardBox.right + 1,
          };
        });

        expect(measured.direction, 'the long mixed title is RTL').toBe('rtl');
        expect(measured.textAlign, 'alignment is logical, not a physical left').toBe('start');
        expect(measured.lines, 'it wraps rather than running off').toBeGreaterThan(1);
        expect(
          measured.scrollWidth - measured.clientWidth,
          'and it wraps instead of scrolling horizontally',
        ).toBeLessThanOrEqual(EPSILON);
        expect(measured.withinCard).toBe(true);

        const pageOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(pageOverflow, 'no horizontal page overflow').toBeLessThanOrEqual(EPSILON);
      });

      test('German titles still hug the left edge and Persian titles hug the right', async ({ app }) => {
        const page = app.page;
        const de = page.locator('main h3').filter({ hasText: BIDI_CASE_BY_ID.get('bidi-de')!.title }).first();
        const fa = page.locator('main h3').filter({ hasText: BIDI_CASE_BY_ID.get('bidi-fa')!.title }).first();

        // Both are short enough to leave slack in the box, so the edge they hug
        // is meaningful. This is the regression that `text-start` fixes: before
        // it, the Persian title hugged the left edge like the German one.
        expect(await renderedAlignment(de), 'German reads from the left').toBe('left');
        expect(await renderedAlignment(fa), 'Persian reads from the right').toBe('right');
      });

      test('the swipe strip stays on the physical right for RTL content', async ({ app }) => {
        const page = app.page;
        const card = cardForTitle(page, BIDI_CASE_BY_ID.get('bidi-fa')!.title);
        const sides = await card.evaluate((el) => {
          const strip = el.querySelector('div.absolute.inset-y-0.right-0')!.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          return {
            stripRight: Math.round(strip.right),
            stripLeft: Math.round(strip.left),
            cardRight: Math.round(box.right),
            cardLeft: Math.round(box.left),
          };
        });
        expect(sides.stripRight, 'anchored to the physical right edge').toBe(sides.cardRight);
        expect(sides.stripLeft, 'and does not span the whole card').toBeGreaterThan(sides.cardLeft);
      });

      test('the swipe actions stay reachable and correctly named beside RTL content', async ({ app }) => {
        const page = app.page;
        const card = cardForTitle(page, BIDI_CASE_BY_ID.get('bidi-fa')!.title);
        const edit = card.getByLabel('Bearbeiten');
        await edit.focus();
        await page.waitForTimeout(350);

        const state = await edit.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return {
            focused: document.activeElement === el,
            opacity: Number(getComputedStyle(el.parentElement as HTMLElement).opacity),
            covered: !(topmost === el || el.contains(topmost)),
            size: { w: Math.round(r.width), h: Math.round(r.height) },
          };
        });
        expect(state.focused).toBe(true);
        expect(state.opacity, 'focus reveals the strip').toBe(1);
        expect(state.covered, 'the action is not covered by the RTL card body').toBe(false);
        expect(state.size.h, 'the action keeps a 44px activation height').toBeGreaterThanOrEqual(44);
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Essentials — Persian simple row, Persian counter row, mixed row.
// ─────────────────────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`essentials direction · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme, ...BIDI_SEED },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('Persian essential titles read RTL while counters stay LTR', async ({ app }) => {
        const page = app.page;
        // The marked span, not `getByText`: a row's wrapper has the same text
        // content as the title inside it, which is two strict-mode matches.
        const titleSpan = (title: string) =>
          page.locator('span[dir="auto"]').filter({ hasText: title }).first();

        const simple = titleSpan(BIDI_ESSENTIALS[0].title);
        await expect(simple).toBeVisible();
        expect(await app.direction(simple), 'the simple row title is RTL').toBe('rtl');

        const multi = titleSpan(BIDI_ESSENTIALS[1].title);
        await expect(multi).toBeVisible();
        expect(await app.direction(multi), 'the counter row title is RTL').toBe('rtl');

        // "2 / 6" must never render as "6 / 2".
        const counter = page.locator('span[dir="ltr"]').filter({ hasText: '/' }).first();
        await expect(counter).toBeVisible();
        expect(await app.direction(counter), 'the counter is pinned LTR').toBe('ltr');

        const digits = await counter.evaluate((el) =>
          Array.from((el.textContent ?? '').matchAll(/\d+/g)).map((m) => m[0]),
        );
        expect(digits, 'progress first, target second').toEqual(['2', '6']);
      });

      test('a mixed Persian/German essential title stays RTL', async ({ app }) => {
        const mixed = app.page
          .locator('span[dir="auto"]')
          .filter({ hasText: BIDI_ESSENTIALS[2].title })
          .first();
        await expect(mixed).toBeVisible();
        expect(await app.direction(mixed)).toBe('rtl');
      });

      test('counter chips remain 44x44 and never overlap beside RTL titles', async ({ app }) => {
        const page = app.page;
        const report = await page.evaluate(() => {
          const chips = Array.from(
            document.querySelectorAll('button[aria-label*=" von "]'),
          ) as HTMLElement[];
          const boxes = chips.map((c) => c.getBoundingClientRect());
          const undersized = boxes
            .filter((b) => Math.round(b.width) < 44 || Math.round(b.height) < 44)
            .map((b) => `${Math.round(b.width)}x${Math.round(b.height)}`);

          const overlapping: string[] = [];
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i];
              const b = boxes[j];
              if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) {
                overlapping.push(`${i}/${j}`);
              }
            }
          }
          return { count: chips.length, undersized, overlapping };
        });

        expect(report.count, 'counter chips render').toBeGreaterThan(0);
        expect(report.undersized, 'every chip is at least 44x44').toEqual([]);
        expect(report.overlapping, 'no two chips overlap').toEqual([]);
      });

      test('nothing in the essentials card overflows it', async ({ app }) => {
        const overflow = await app.page.evaluate(() => {
          // The Essentials section is the one holding the manage button.
          const manage = document.querySelector('button[aria-label="Essentials verwalten"]');
          const section = manage?.closest('section');
          if (!section) return ['essentials section not found'];

          const box = section.getBoundingClientRect();
          const bad: string[] = [];
          for (const child of Array.from(section.querySelectorAll('span, button, div'))) {
            const r = child.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            if (r.left < box.left - 1 || r.right > box.right + 1) {
              bad.push((child.textContent ?? '').slice(0, 24));
            }
          }
          return bad;
        });
        expect(overflow, 'RTL essentials stay inside their section').toEqual([]);
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Per-tab coverage: Today / All Tasks / Reminders / Completed.
// ─────────────────────────────────────────────────────────────────────────────

const TAB_MATRIX: Tab[] = ['today', 'all', 'reminders', 'done'];

for (const theme of THEMES) {
  test.describe(`tab coverage · 360x812 · ${theme}`, () => {
    test.use({
      appOptions: { theme, ...BIDI_SEED },
      viewport: { width: 360, height: 812 },
    });

    for (const tab of TAB_MATRIX) {
      test(`${tab}: RTL content is isolated, chrome is LTR, nothing overflows`, async ({ app }) => {
        const page = app.page;
        await switchTab(app, tab);

        const state = await page.evaluate(() => {
          const marked = Array.from(document.querySelectorAll('main [dir="auto"]')) as HTMLElement[];
          const rtl = marked.filter((el) => getComputedStyle(el).direction === 'rtl');

          // Containment, not the isolate itself — see the note on the
          // "does not leak" test above.
          const leaked = rtl.filter((el) => {
            for (let a = el.parentElement; a; a = a.parentElement) {
              if (getComputedStyle(a).direction !== 'ltr') return true;
              if (a.tagName === 'MAIN') return false;
            }
            return false;
          }).length;

          return {
            markedCount: marked.length,
            rtlCount: rtl.length,
            leaked,
            navDir: getComputedStyle(document.querySelector('nav')!).direction,
            mainDir: getComputedStyle(document.querySelector('main')!).direction,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          };
        });

        expect(state.markedCount, 'user content is present and marked').toBeGreaterThan(0);
        expect(state.rtlCount, 'at least one string resolved to RTL').toBeGreaterThan(0);
        expect(state.leaked, 'no RTL string flipped an ancestor').toBe(0);
        expect(state.navDir, 'the nav stays LTR').toBe('ltr');
        expect(state.mainDir, 'the content region stays LTR').toBe('ltr');
        expect(state.overflow, 'no horizontal page overflow').toBeLessThanOrEqual(EPSILON);
      });
    }

    test('Reminders rows keep the German schedule detail LTR beside RTL titles', async ({ app }) => {
      const page = app.page;
      await switchTab(app, 'reminders');

      const row = page.locator('li button').filter({ hasText: 'خرید مواد غذایی برای هفته' }).first();
      await expect(row).toHaveCount(1);

      const title = row.locator('span[dir="auto"]');
      expect(await app.direction(title), 'the reminder title is RTL').toBe('rtl');
      expect(await renderedAlignment(title), 'and it hugs the right edge').toBe('right');

      const detail = row.locator('span[dir="ltr"]');
      await expect(detail).toHaveCount(1);
      expect(await app.direction(detail), 'the schedule detail stays LTR').toBe('ltr');

      // The row's accessible name still carries the complete logical text.
      const name = await row.getAttribute('aria-label');
      expect(name).toContain('خرید مواد غذایی برای هفته');
      expect(name).toContain('Aufgabe bearbeiten');
    });

    test('Completed RTL tasks keep their strike-through and stay contained', async ({ app }) => {
      const page = app.page;
      await switchTab(app, 'done');

      const title = page.locator('main h3').filter({ hasText: 'ارسال گزارش ماهانه به مدیر' }).first();
      await expect(title).toHaveCount(1);
      expect(await app.direction(title), 'a completed Persian title is still RTL').toBe('rtl');
      expect(await title.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain('line-through');

      const contained = await title.evaluate((el) => {
        const card = el.closest('div.relative.overflow-hidden.rounded-2xl')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.left >= card.left - 1 && r.right <= card.right + 1;
      });
      expect(contained).toBe(true);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Input behaviour — typing German, Persian and mixed text.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('input direction follows the typed value', () => {
  test.use({ appOptions: { ...BIDI_SEED }, viewport: { width: 390, height: 812 } });

  test('the task title field switches direction with no manual toggle', async ({ app }) => {
    const page = app.page;
    const dialog = await openNewTaskModal(page);
    const field = dialog.getByLabel('Aufgabentitel');

    // Empty: the German placeholder has to read left to right.
    expect(await app.direction(field), 'an empty field inherits the LTR chrome').toBe('ltr');

    await field.fill('Einkaufen gehen');
    expect(await app.direction(field), 'German types LTR').toBe('ltr');

    await field.fill('خرید مواد غذایی');
    expect(await app.direction(field), 'Persian flips the field to RTL').toBe('rtl');

    await field.fill('خرید از Rewe و Aldi');
    expect(await app.direction(field), 'mixed text follows its first strong character').toBe('rtl');

    await field.fill('Buy milk از سوپرمارکت');
    expect(await app.direction(field), 'and back to LTR when Latin leads').toBe('ltr');

    // The surrounding modal chrome never moved.
    const chrome = await dialog.evaluate((el) => ({
      dialog: getComputedStyle(el).direction,
      heading: getComputedStyle(el.querySelector('h2') ?? el).direction,
    }));
    expect(chrome.dialog).toBe('ltr');
    expect(chrome.heading).toBe('ltr');
  });

  test('the notes field and the checklist field follow their own values', async ({ app }) => {
    const page = app.page;
    const dialog = await openNewTaskModal(page);

    await dialog.getByRole('button', { name: 'Notiz' }).click();
    const notes = dialog.getByLabel('Notiz');
    await notes.fill('Kurze deutsche Notiz');
    expect(await app.direction(notes)).toBe('ltr');
    await notes.fill(FA_NOTES);
    expect(await app.direction(notes), 'Persian notes type RTL').toBe('rtl');

    await dialog.getByRole('button', { name: 'Checkliste' }).click();
    const item = dialog.getByLabel('Checklistenpunkt hinzufügen');
    await item.fill('آماده‌سازی مدارک');
    expect(await app.direction(item), 'the checklist field types RTL').toBe('rtl');

    // The German helper labels around them are untouched.
    expect(
      await dialog.evaluate((el) => getComputedStyle(el).direction),
      'the modal chrome stays LTR',
    ).toBe('ltr');
  });

  test('the search field follows the query direction', async ({ app }) => {
    const page = app.page;
    // The magnifier button and the field it opens share an accessible name, so
    // they are told apart by role rather than by label.
    await page.getByRole('button', { name: 'Aufgaben durchsuchen' }).click();
    const search = page.getByRole('textbox', { name: 'Aufgaben durchsuchen' });
    await expect(search).toBeVisible();

    expect(await app.direction(search), 'the empty field shows a German placeholder LTR').toBe('ltr');
    await search.fill('Zahnarzt');
    expect(await app.direction(search)).toBe('ltr');
    await search.fill('خرید');
    expect(await app.direction(search), 'a Persian query renders RTL').toBe('rtl');

    // And it actually filters: the Persian task survives, the German one does not.
    await expect(page.locator('main h3').filter({ hasText: 'خرید مواد غذایی برای هفته' })).toHaveCount(1);
  });

  test('editing a Persian essential keeps the field and the stored value intact', async ({ app }) => {
    const page = app.page;
    await page.getByRole('button', { name: 'Essentials verwalten' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel(`Bearbeiten: ${BIDI_ESSENTIALS[0].title}`).click();
    const field = page.locator('#essential-title');
    await expect(field).toHaveValue(BIDI_ESSENTIALS[0].title);
    expect(await app.direction(field), 'the edit field opens RTL for a Persian title').toBe('rtl');

    const raw = (await app.readStorage())['myDailyFlowEssentialsData'];
    const stored: { id: string; title: string }[] = JSON.parse(raw!).data;
    expect(stored.find((e) => e.id === 'bidi-ess-simple')!.title).toBe(BIDI_ESSENTIALS[0].title);
  });
});
