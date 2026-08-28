import { expect, test, type Page } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

const TEST_EMAIL = process.env.P2_SYNC_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.P2_SYNC_TEST_PASSWORD ?? '';
const LIVE_SYNC_READY = Boolean(
  TEST_EMAIL
  && TEST_PASSWORD
  && process.env.VITE_REAL_AUTH_ENABLED === 'true'
  && process.env.VITE_SYNC_ENABLED === 'true',
);

async function waitForShell(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const nav = page.locator('nav');
    if (await nav.isVisible().catch(() => false)) return;
    const continueButton = page.getByRole('button', { name: 'Sicher synchronisieren' });
    if (await continueButton.isVisible().catch(() => false)) await continueButton.click();
    await page.waitForTimeout(750);
  }
  await expect(page.locator('nav')).toBeVisible({ timeout: 20_000 });
}

async function fillCredentialsAndSignIn(page: Page): Promise<void> {
  await page.getByLabel('E-MAIL').fill(TEST_EMAIL);
  await page.getByLabel('PASSWORT').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

async function reconcileAccountCopy(page: Page): Promise<void> {
  const heading = page.getByRole('heading', { name: 'Gerät und Konto abgleichen' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await page.locator('nav').isVisible().catch(() => false)) return;
    if (await heading.isVisible().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  await expect(heading).toBeVisible({ timeout: 5_000 });

  const backupButton = page.getByRole('button', { name: 'Backup erstellen und prüfen' });
  await expect(backupButton).toBeVisible();
  const download = page.waitForEvent('download');
  await backupButton.click();
  await download;
  await page.getByRole('button', { name: /^Kontodaten später verwenden/ }).click();
  await page.getByRole('button', { name: 'Sicher synchronisieren' }).click();
}

async function signIn(page: Page, reconcile = true): Promise<void> {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await fillCredentialsAndSignIn(page);
  if (reconcile) await reconcileAccountCopy(page);
  await waitForShell(page);
}

test.describe('P2-12 live single-device lease', () => {
  test.skip(!LIVE_SYNC_READY, 'Requires the ignored .env.local test account and enabled Real Auth + Sync flags.');

  test('new explicit login displaces the old device, survives reload, and fails closed offline', async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const shared = {
      baseURL: String(testInfo.project.use.baseURL),
      serviceWorkers: 'block' as const,
      locale: 'de-DE',
      timezoneId: 'Europe/Berlin',
      viewport: { width: 390, height: 812 },
      acceptDownloads: true,
    };
    const deviceA = await browser.newContext(shared);
    const deviceB = await browser.newContext(shared);
    const pageA = await deviceA.newPage();
    const pageB = await deviceB.newPage();

    try {
      await signIn(pageA);

      await signIn(pageB);
      await expect(pageA.getByRole('heading', { name: 'Konto auf einem anderen Gerät aktiv' }))
        .toBeVisible({ timeout: 15_000 });

      // Restoring the old persisted session must verify and stay displaced; a
      // refresh is never an implicit takeover.
      await pageA.reload({ waitUntil: 'domcontentloaded' });
      await expect(pageA.getByRole('heading', { name: 'Konto auf einem anderen Gerät aktiv' }))
        .toBeVisible({ timeout: 15_000 });
      await expect(pageB.locator('nav')).toBeVisible();

      // Strict one-device mode deliberately locks content without connectivity.
      await deviceB.setOffline(true);
      await expect(pageB.getByRole('heading', { name: 'Internetverbindung erforderlich' }))
        .toBeVisible({ timeout: 10_000 });
      await deviceB.setOffline(false);
      await pageB.getByRole('button', { name: 'Erneut prüfen' }).click();
      await waitForShell(pageB);

      // Only a fresh explicit login on A may create a newer Supabase session and
      // atomically take the account back.
      await pageA.getByRole('button', { name: 'Erneut anmelden' }).click();
      await expect(pageA.getByRole('heading', { name: 'Mit deinem Konto anmelden' })).toBeVisible();
      await fillCredentialsAndSignIn(pageA);
      await waitForShell(pageA);
      await expect(pageB.getByRole('heading', { name: 'Konto auf einem anderen Gerät aktiv' }))
        .toBeVisible({ timeout: 15_000 });
    } finally {
      await Promise.allSettled([deviceA.close(), deviceB.close()]);
    }
  });
});
