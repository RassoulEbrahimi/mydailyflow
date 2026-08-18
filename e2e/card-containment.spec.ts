/**
 * card-containment.spec.ts — the F8 swipe-strip containment (PR4).
 *
 * The reported defect was a blue/green/red line at the edge of a resting task
 * card. Root cause, measured rather than guessed: the action strip painted at
 * full opacity directly underneath the card body, and the body is a separately
 * rasterised layer (it carries a `transform` and `will-change: transform`), so
 * its antialiased 16px corner arcs never coincided exactly with the wrapper's
 * own rounded clip. Before the fix this leaked 31–47 strip-coloured pixels per
 * card around the right-hand corners, at every device pixel ratio from 1 to 3,
 * with a per-channel delta up to 80.
 *
 * The test does not look for particular colours — that would only catch the
 * palette it was written against. It measures the strip's *contribution*: screenshot
 * the resting card, hide the strip, screenshot again, and compare the rasters.
 * Any pixel that changes is a pixel the strip was painting.
 */

import { expect, test, THEMES } from './fixtures/app';
import { decodePng, diffRasters } from './utils/png';

const CARD = 'div.relative.overflow-hidden.rounded-2xl';

/** 1 is desktop; 1.25 and 1.5 are common Windows scalings; 2 and 3 are phones. */
const DEVICE_SCALES = [1, 1.25, 1.5, 2, 3];

for (const dpr of DEVICE_SCALES) {
  for (const theme of THEMES) {
    test.describe(`resting strip · dpr ${dpr} · ${theme}`, () => {
      test.use({
        appOptions: { theme },
        viewport: { width: 390, height: 812 },
        deviceScaleFactor: dpr,
      });

      test('contributes zero visible pixels to a resting card', async ({ app }) => {
        const page = app.page;
        const cards = page.locator(CARD);
        const count = Math.min(await cards.count(), 5);
        expect(count, 'task cards render').toBeGreaterThan(0);

        const offenders: string[] = [];

        for (let i = 0; i < count; i++) {
          const card = cards.nth(i);
          await card.scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
          const box = await card.boundingBox();
          if (!box) continue;

          const withStrip = await page.screenshot({ clip: box, scale: 'css' });
          await card.evaluate((el) => {
            const strip = el.querySelector('div.absolute.inset-y-0.right-0') as HTMLElement;
            strip.dataset.savedDisplay = strip.style.display;
            strip.style.display = 'none';
          });
          await page.waitForTimeout(80);
          const withoutStrip = await page.screenshot({ clip: box, scale: 'css' });
          await card.evaluate((el) => {
            const strip = el.querySelector('div.absolute.inset-y-0.right-0') as HTMLElement;
            strip.style.display = strip.dataset.savedDisplay ?? '';
          });

          const diff = diffRasters(decodePng(withStrip), decodePng(withoutStrip));
          if (diff.changed > 0) {
            offenders.push(
              `card ${i} (y=${box.y.toFixed(3)} h=${box.height.toFixed(3)}): ` +
                `${diff.changed} px, maxDelta ${diff.maxDelta}, first ${JSON.stringify(diff.samples[0])}`,
            );
          }
        }

        expect(offenders, `the hidden strip must paint nothing at dpr ${dpr}`).toEqual([]);
      });

      test('is inert to pointers and cannot intercept the card while hidden', async ({ app }) => {
        const page = app.page;
        const state = await page.locator(CARD).first().evaluate((el) => {
          const strip = el.querySelector('div.absolute.inset-y-0.right-0') as HTMLElement;
          const cs = getComputedStyle(strip);
          const r = strip.getBoundingClientRect();
          // Real hit-testing: whatever is topmost at the strip's own centre is
          // what a finger would reach.
          const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return {
            opacity: Number(cs.opacity),
            pointerEvents: cs.pointerEvents,
            hitIsStrip: strip.contains(topmost),
          };
        });

        expect(state.opacity, 'hidden strip paints nothing').toBe(0);
        expect(state.pointerEvents, 'hidden strip takes no pointer events').toBe('none');
        expect(state.hitIsStrip, 'hidden strip does not intercept taps').toBe(false);
      });
    });
  }
}

test.describe('swipe strip behaviour', () => {
  test.use({ appOptions: { theme: 'dark' }, viewport: { width: 390, height: 812 } });

  test('a swipe still reveals the actions', async ({ app }) => {
    const page = app.page;
    const card = page.locator(CARD).first();
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = (await card.boundingBox())!;

    // Real touch input through CDP rather than hand-built TouchEvents: the
    // component decides swipe-vs-scroll from the event stream, and synthetic
    // events dispatched from page script are not a faithful stand-in.
    const cdp = await page.context().newCDPSession(page);
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 20;
    const endX = startX - 150;

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y }],
    });
    for (let x = startX - 12; x >= endX; x -= 12) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500); // the card body animates aside (220ms)

    const revealed = await card.evaluate((el) => {
      const strip = el.querySelector('div.absolute.inset-y-0.right-0') as HTMLElement;
      const body = strip.nextElementSibling as HTMLElement;
      const first = strip.querySelector('button')!;
      const r = first.getBoundingClientRect();
      const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        opacity: Number(getComputedStyle(strip).opacity),
        pointerEvents: getComputedStyle(strip).pointerEvents,
        bodyShifted: new DOMMatrix(getComputedStyle(body).transform).m41,
        actionOnTop: first.contains(topmost) || first === topmost,
      };
    });

    expect(revealed.bodyShifted, 'the swipe slid the card body aside').toBeLessThan(-10);
    expect(revealed.opacity, 'the swipe reveals the strip').toBe(1);
    expect(revealed.pointerEvents, 'revealed actions are tappable').toBe('auto');
    expect(revealed.actionOnTop, 'a revealed action is actually hittable').toBe(true);
  });

  test('keyboard focus reveals the actions and they stay operable', async ({ app }) => {
    const page = app.page;
    const edit = page.getByLabel('Bearbeiten').first();
    await edit.focus();
    await page.waitForTimeout(400);

    const state = await edit.evaluate((el) => {
      const strip = el.parentElement as HTMLElement;
      const r = el.getBoundingClientRect();
      const topmost = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        focused: document.activeElement === el,
        stripOpacity: Number(getComputedStyle(strip).opacity),
        covered: !(topmost === el || el.contains(topmost)),
      };
    });

    expect(state.focused, 'the action holds focus').toBe(true);
    expect(state.stripOpacity, 'focus reveals the strip').toBe(1);
    expect(state.covered, 'the focused action is not covered by the card body').toBe(false);

    // And it is genuinely operable from the keyboard.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Aufgabe bearbeiten' })).toBeVisible();
  });

  test('right-to-left task content does not move the actions to the wrong side', async ({ app }) => {
    const page = app.page;
    // Persian title — `dir="auto"` flips the *text*, never the card's layout.
    await page.evaluate(() => {
      const raw = localStorage.getItem('myDailyFlowTasks');
      const parsed = JSON.parse(raw!);
      parsed.data[0].title = 'خرید مواد غذایی برای هفته';
      localStorage.setItem('myDailyFlowTasks', JSON.stringify(parsed));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('nav').waitFor();

    const sides = await page.locator(CARD).first().evaluate((el) => {
      const strip = el.querySelector('div.absolute.inset-y-0.right-0')!.getBoundingClientRect();
      const card = el.getBoundingClientRect();
      return { stripRight: Math.round(strip.right), cardRight: Math.round(card.right), stripLeft: Math.round(strip.left), cardLeft: Math.round(card.left) };
    });

    expect(sides.stripRight, 'the strip stays anchored to the physical right edge').toBe(sides.cardRight);
    expect(sides.stripLeft, 'and does not span the whole card').toBeGreaterThan(sides.cardLeft);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'Persian content causes no horizontal page overflow').toBeLessThanOrEqual(1);
  });
});
