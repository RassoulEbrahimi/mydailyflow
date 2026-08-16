import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration — Phase 1A accessibility / browser baseline (PR0).
 *
 * Deliberately isolated from the existing `npm test` node suite:
 *   npm test      → node --test over tests/*.test.ts   (unchanged)
 *   npm run test:browser → this config over e2e/*.spec.ts
 *
 * Everything runs against a *production* Vite build served by `vite preview`,
 * under the real GitHub Pages base path `/mydailyflow/`, so the measured
 * baseline reflects what is actually deployed rather than a dev-server build.
 */

/** Preview server port. Overridable so a busy port never wedges a run. */
const PORT = Number(process.env.MDF_PREVIEW_PORT ?? 4173);

/** The app is deployed under a sub-path; every test navigates relative to it. */
export const BASE_PATH = '/mydailyflow/';

const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* A measured baseline must not be papered over by retries. */
  retries: 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 7_000 },

  /* Fail the run if a `test.only` is left behind. */
  forbidOnly: !!process.env.CI,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  outputDir: 'test-results/artifacts',

  use: {
    baseURL: `${ORIGIN}${BASE_PATH}`,

    /* The app registers a service worker. Blocking it keeps every context a
       true cold start instead of replaying a cached shell. */
    serviceWorkers: 'block',

    /* Deterministic rendering for measurement. The app picks its own palette
       from localStorage, so `colorScheme` only settles native form controls. */
    colorScheme: 'dark',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',

    /* Animations settle instantly, so a measurement never catches a tween. */
    contextOptions: { reducedMotion: 'reduce' },

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Overridden per-test by the viewport matrix; this is only the default. */
        viewport: { width: 390, height: 812 },
        isMobile: false,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
  ],

  webServer: {
    command: `npm run preview -- --port=${PORT} --strictPort --host=127.0.0.1`,
    url: `${ORIGIN}${BASE_PATH}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
