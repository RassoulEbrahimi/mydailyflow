/**
 * app.ts — the shared test fixture for the Phase 1A browser baseline.
 *
 * Isolation guarantees, all of which matter because this suite runs on a real
 * developer machine as well as in CI:
 *
 *  - Playwright gives every test its own browser context, backed by a throwaway
 *    profile directory. Nothing here ever touches a real Chrome/Edge profile,
 *    a real localStorage, a real backup file, or the user's Downloads folder.
 *  - Storage is seeded through `addInitScript`, which runs *before* any page
 *    script — including the FOUC theme script in index.html — so the app boots
 *    already authenticated and already populated, and the login form is never
 *    filled in.
 *  - Authentication is a synthetic `mdf_auth_session` written to
 *    **sessionStorage**, matching the shape `fakeAuth.saveSession(user, false)`
 *    produces. Nothing is written to the localStorage auth key.
 *  - The service worker is blocked (see playwright.config.ts), and the clock is
 *    pinned, so every run measures the same frame.
 */

import { test as base, expect, type Locator, type Page } from '@playwright/test';

import {
  buildStorageSeed,
  FIXED_NOW,
  KEYS,
  SYNTHETIC_SESSION,
  type SeedTheme,
} from './synthetic-data';

export type Tab = 'today' | 'all' | 'done' | 'reminders';

/**
 * Waits for React to mount the app shell.
 *
 * The generous timeout is not slack: index.html loads Inter from
 * fonts.googleapis.com through a render-blocking <link rel="stylesheet">, and a
 * pending stylesheet blocks script execution. On a machine without egress to
 * Google Fonts the request has to time out before React runs at all, which
 * takes well past the default expect timeout. That delay is a real property of
 * the app — it is recorded in the baseline document rather than worked around
 * by changing product code.
 */
export async function waitForAppShell(page: Page): Promise<void> {
  await expect(page.locator('nav')).toBeVisible({ timeout: 30_000 });
}

/** German nav labels, exactly as App.tsx renders them. */
export const TAB_LABEL: Record<Tab, string> = {
  today: 'Heute',
  all: 'Alle Aufgaben',
  done: 'Erledigt',
  reminders: 'Erinnerungen',
};

/** The three device widths the baseline is measured at. */
export const VIEWPORTS = [
  { name: '360x812', width: 360, height: 812 },
  { name: '390x812', width: 390, height: 812 },
  { name: '430x812', width: 430, height: 812 },
] as const;

export const THEMES: SeedTheme[] = ['dark', 'light'];

export interface AppOptions {
  theme?: SeedTheme;
  /** Skip data seeding to measure the empty state. Auth is still injected. */
  seedData?: boolean;
}

export class AppHarness {
  constructor(readonly page: Page) {}

  /** Bottom-nav button for a tab, located by its visible German label. */
  navButton(tab: Tab): Locator {
    return this.page.locator('nav button').filter({ hasText: TAB_LABEL[tab] });
  }

  /** Any task card title currently rendered. */
  taskTitles(): Locator {
    return this.page.locator('main h3');
  }

  /** The header button that opens the Settings sheet. */
  settingsButton(): Locator {
    return this.page.getByRole('button', { name: 'Einstellungen' });
  }

  /** The Today-tab hero, identified by its gradient utility class. */
  hero(): Locator {
    return this.page.locator('.hero-gradient');
  }

  async openSettings(): Promise<void> {
    // By role, not by label: PR3 named the Settings sheet "Einstellungen" too,
    // so a bare getByLabel now matches both the trigger and the dialog.
    await this.settingsButton().click();
    await expect(this.page.getByRole('button', { name: 'Exportieren' })).toBeVisible();
  }

  /** Read the app's own localStorage exactly as the browser holds it. */
  async readStorage(): Promise<Record<string, string | null>> {
    return this.page.evaluate((keys) => {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = localStorage.getItem(k);
      return out;
    }, Object.values(KEYS) as string[]);
  }

  async readSessionStorage(key: string): Promise<string | null> {
    return this.page.evaluate((k) => sessionStorage.getItem(k), key);
  }
}

interface Fixtures {
  app: AppHarness;
  /** Per-test overrides; set with `test.use({ appOptions: {...} })`. */
  appOptions: AppOptions;
}

export const test = base.extend<Fixtures>({
  appOptions: [{}, { option: true }],

  app: async ({ page, appOptions }, use) => {
    const theme: SeedTheme = appOptions.theme ?? 'dark';
    const seedData = appOptions.seedData ?? true;

    // Date/time only — timers and requestAnimationFrame stay real, so React and
    // Motion still settle normally.
    await page.clock.setFixedTime(FIXED_NOW);

    await page.addInitScript(
      ({ sessionKey, session, storage, marker }) => {
        // The app reloads itself after a successful import. Re-seeding on that
        // reload would overwrite exactly the data the import test is checking,
        // so seeding happens once per tab and never again.
        if (sessionStorage.getItem(marker) === '1') return;

        sessionStorage.setItem(sessionKey, JSON.stringify(session));
        for (const [key, value] of Object.entries(storage)) {
          localStorage.setItem(key, value);
        }
        sessionStorage.setItem(marker, '1');
      },
      {
        sessionKey: KEYS.authSession,
        session: SYNTHETIC_SESSION,
        storage: seedData
          ? buildStorageSeed(theme)
          : { [KEYS.theme]: theme, [KEYS.essentialsCollapsed]: 'false' },
        marker: '__mdf_e2e_seeded__',
      },
    );

    await page.goto('./', { waitUntil: 'domcontentloaded' });
    await waitForAppShell(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await use(new AppHarness(page));
  },
});

export { expect };
