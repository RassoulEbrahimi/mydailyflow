/**
 * sticky-layout.spec.ts — the pinned-surface layout contract (PR4).
 *
 * PR0 recorded the hero as pinned and left it there. What it did not check is
 * whether anything can still be *reached* underneath it: the scroll container
 * had `scroll-padding-top: auto`, so every programmatic scroll — focus,
 * scrollIntoView, an anchor — landed content behind the pinned hero. A section
 * heading measured at y=71 while the hero occupied y=0..100.
 *
 * PR4 makes the shell publish the measured pinned height as `--mdf-pinned-top`
 * and derive `scroll-padding-top` from it. These tests assert the contract and
 * its consequences, not the number: the hero's height depends on the greeting,
 * the width and the font that loaded, so a hard-coded expectation would be a
 * different bug.
 */

import { expect, test, THEMES, VIEWPORTS } from './fixtures/app';

/** Elements a user scrolls to and must be able to read in full. */
const CONTENT = 'main section h2, main .bg-surface-dim > *, main h3';

for (const theme of THEMES) {
  for (const viewport of VIEWPORTS) {
    test.describe(`sticky · ${viewport.name} · ${theme}`, () => {
      test.use({
        appOptions: { theme },
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('pinned: the contract is measured, and scrolled-to content clears it', async ({ app }) => {
        const page = app.page;

        const contract = await page.evaluate(() => {
          const main = document.querySelector('main') as HTMLElement;
          const hero = document.querySelector('.hero-gradient')!.parentElement as HTMLElement;
          return {
            pinnedTop: getComputedStyle(main).getPropertyValue('--mdf-pinned-top').trim(),
            stickyGroup: getComputedStyle(main).getPropertyValue('--mdf-sticky-group').trim(),
            scrollPaddingTop: getComputedStyle(main).scrollPaddingTop,
            heroHeight: Math.ceil(hero.getBoundingClientRect().height),
          };
        });

        // The contract exists, is a real length, and matches what is pinned —
        // rather than a constant that happens to be right at one width.
        expect(contract.pinnedTop).toMatch(/^\d+(\.\d+)?px$/);
        expect(parseFloat(contract.pinnedTop)).toBeGreaterThan(0);
        expect(parseFloat(contract.pinnedTop)).toBe(contract.heroHeight);
        // Today has no sticky group header, so the combined reservation is the
        // hero alone. The All tab exercises the two-surface case below.
        expect(contract.stickyGroup).toBe('0px');
        expect(parseFloat(contract.scrollPaddingTop)).toBe(contract.heroHeight);

        // Scroll to every piece of content in turn; none may land under the hero.
        const obscured = await page.evaluate(async (selector) => {
          const hero = document.querySelector('.hero-gradient')!.parentElement as HTMLElement;
          const bad: string[] = [];
          for (const el of Array.from(document.querySelectorAll(selector))) {
            el.scrollIntoView({ block: 'start' });
            await new Promise((r) => setTimeout(r, 90));
            const r = el.getBoundingClientRect();
            const h = hero.getBoundingClientRect();
            if (r.height === 0) continue;
            // 1px of slack for the hero's deliberate top:-1px overlap.
            if (r.top < h.bottom - 1) {
              bad.push(`"${(el.textContent || '').trim().slice(0, 28)}" top=${r.top.toFixed(1)} heroBottom=${h.bottom.toFixed(1)}`);
            }
          }
          return bad;
        }, CONTENT);

        expect(obscured, 'no scrolled-to content sits under the pinned hero').toEqual([]);
      });

      test('pinned: the hero stays put and stays opaque while scrolling', async ({ app }) => {
        const page = app.page;
        await page.locator('main').evaluate((el) => { el.scrollTop = 500; });
        await page.waitForTimeout(300);

        const state = await page.evaluate(() => {
          const wrapper = document.querySelector('.hero-gradient')!.parentElement as HTMLElement;
          const cs = getComputedStyle(wrapper);
          const r = wrapper.getBoundingClientRect();
          return {
            top: r.top,
            position: cs.position,
            zIndex: cs.zIndex,
            // The panel is rounded at the bottom; without an opaque wrapper,
            // content scrolling under shows through the two corner arcs.
            wrapperBackground: cs.backgroundColor,
          };
        });

        expect(state.position).toBe('sticky');
        expect(state.top).toBeLessThanOrEqual(1);
        expect(Number(state.zIndex)).toBeGreaterThanOrEqual(20);
        expect(state.wrapperBackground, 'the pinned wrapper is opaque').not.toMatch(/rgba\(.*,\s*0(\.\d+)?\)$/);
      });
    });
  }
}

test.describe('sticky disabled', () => {
  test.use({ appOptions: { theme: 'dark' }, viewport: { width: 390, height: 812 } });

  test('the hero scrolls away and leaves no reserved gap', async ({ app }) => {
    const page = app.page;

    // Turn the setting off through the UI it belongs to.
    await app.openSettings();
    const toggle = page.getByRole('switch', { name: /Kopfzeile fixieren/ });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.getByRole('dialog', { name: 'Einstellungen' })
      .getByRole('button', { name: 'Schließen' }).click();
    await page.waitForTimeout(300);

    const before = await page.evaluate(() => {
      const main = document.querySelector('main') as HTMLElement;
      const wrapper = document.querySelector('.hero-gradient')!.parentElement as HTMLElement;
      return {
        position: getComputedStyle(wrapper).position,
        pinnedTop: getComputedStyle(main).getPropertyValue('--mdf-pinned-top').trim(),
        scrollPaddingTop: getComputedStyle(main).scrollPaddingTop,
        heroTop: wrapper.getBoundingClientRect().top,
      };
    });

    expect(before.position, 'the hero returns to normal flow').toBe('static');
    // Nothing is pinned, so nothing is reserved — no phantom gap at the top.
    expect(before.pinnedTop).toBe('0px');
    expect(before.scrollPaddingTop).toBe('0px');

    await page.locator('main').evaluate((el) => { el.scrollTop = 500; });
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const wrapper = document.querySelector('.hero-gradient')!.parentElement as HTMLElement;
      return wrapper.getBoundingClientRect().bottom;
    });

    expect(after, 'the hero scrolls out of view instead of pinning').toBeLessThan(0);
  });
});

test.describe('All Tasks date headers', () => {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test.describe(`${viewport.name} · ${theme}`, () => {
        test.use({
          appOptions: { theme },
          viewport: { width: viewport.width, height: viewport.height },
        });

        test('pin below the shell contract, stay opaque, and never sit over a title', async ({ app }) => {
          const page = app.page;
          await app.navButton('all').click();
          await page.waitForTimeout(300);

          const header = page.locator('main .sticky').first();
          await expect(header).toBeVisible();

          const style = await header.evaluate((el) => {
            const cs = getComputedStyle(el);
            const main = document.querySelector('main') as HTMLElement;
            const mainCs = getComputedStyle(main);
            return {
              position: cs.position,
              top: cs.top,
              zIndex: cs.zIndex,
              background: cs.backgroundColor,
              height: Math.ceil(el.getBoundingClientRect().height),
              stickyGroup: mainCs.getPropertyValue('--mdf-sticky-group').trim(),
              scrollPaddingTop: parseFloat(mainCs.scrollPaddingTop),
              pinnedTop: parseFloat(mainCs.getPropertyValue('--mdf-pinned-top').trim() || '0'),
            };
          });

          // The contract knows about this surface, and the scroll reservation is
          // the *combined* height — a scroll that only cleared the hero would
          // still park a title behind the date header.
          expect(parseFloat(style.stickyGroup)).toBe(style.height);
          expect(style.scrollPaddingTop).toBe(style.pinnedTop + style.height);
          expect(style.position).toBe('sticky');
          // Reads the shell's contract rather than hard-coding 0.
          expect(style.top).toMatch(/^\d+(\.\d+)?px$/);
          // Opaque: `bg-page/95` let titles smear through as they passed under.
          expect(style.background, 'the date header is opaque').not.toMatch(/rgba|oklab\(.*\/\s*0\.\d+\)/);
          // Below the hero's layer, above the task cards.
          expect(Number(style.zIndex)).toBeLessThan(20);

          // Scrolling to a task must not park its title under a pinned header.
          const covered = await page.evaluate(async () => {
            const bad: string[] = [];
            for (const title of Array.from(document.querySelectorAll('main h3'))) {
              title.scrollIntoView({ block: 'start' });
              await new Promise((r) => setTimeout(r, 90));
              const t = title.getBoundingClientRect();
              const headers = Array.from(document.querySelectorAll('main .sticky'));
              for (const h of headers) {
                const hr = h.getBoundingClientRect();
                if (hr.height === 0) continue;
                // 0.5px tolerance: sub-pixel layout rounding is not "covered".
            const overlaps = t.top < hr.bottom - 0.5 && t.bottom > hr.top && t.left < hr.right && t.right > hr.left;
                if (overlaps) bad.push(`"${(title.textContent || '').trim().slice(0, 26)}" under "${(h.textContent || '').trim().slice(0, 20)}"`);
              }
            }
            return bad;
          });
          expect(covered, 'no task title is covered by a sticky date header').toEqual([]);
        });
      });
    }
  }
});
