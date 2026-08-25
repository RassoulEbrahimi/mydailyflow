import { expect, test, type BrowserContext, type Page } from '@playwright/test';
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

const RUN_ID = Date.now().toString(36);
const BASE_TITLE = `P2-9 Live Sync Basis ${RUN_ID}`;
const OFFLINE_TITLE = `P2-9 Offline von Gerät B ${RUN_ID}`;
const DEVICE_A_CONFLICT_TITLE = `P2-9 Konflikt von Gerät A ${RUN_ID}`;
const DEVICE_B_CONFLICT_TITLE = `P2-9 Konflikt von Gerät B ${RUN_ID}`;
const DEVICE_A_NOTE = `Unabhängige Online-Notiz von Gerät A ${RUN_ID}`;

async function waitForShell(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nav = page.locator('nav');
    if (await nav.isVisible().catch(() => false)) return;

    const continueButton = page.getByRole('button', { name: 'Sicher synchronisieren' });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }
    await page.waitForTimeout(750);
  }
  await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 });
}

async function signInAndReconcile(page: Page, decision: string): Promise<void> {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('E-MAIL').fill(TEST_EMAIL);
  await page.getByLabel('PASSWORT').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Gerät und Konto abgleichen' })).toBeVisible({ timeout: 20_000 });
  const backupButton = page.getByRole('button', { name: 'Backup erstellen und prüfen' });
  await expect(backupButton).toBeVisible();
  const download = page.waitForEvent('download');
  await backupButton.click();
  await download;

  await page.getByRole('button', { name: new RegExp(`^${decision}`) }).click();
  await expect(page.getByRole('button', { name: 'Sicher synchronisieren' })).toBeVisible();
  await page.getByRole('button', { name: 'Sicher synchronisieren' }).click();
  await waitForShell(page);
}

async function openSettings(page: Page) {
  const existing = page.locator('[role="dialog"][aria-label="Einstellungen"]:not([inert])');
  if (await existing.count()) return existing;
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(existing).toBeVisible();
  return existing;
}

async function closeSettings(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"][aria-label="Einstellungen"]:not([inert])');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!(await dialog.count())) return;
    // A completed sync may atomically apply remote data and reload the shell.
    // Dispatch the button's own click handler without a long pointer-action
    // retry, then re-acquire the active sheet after any navigation.
    await dialog.getByRole('button', { name: 'Schließen', exact: true })
      .evaluate((button: HTMLButtonElement) => button.click())
      .catch(() => undefined);
    await page.waitForTimeout(300);
  }
  await expect(dialog).toHaveCount(0);
}

async function syncAndExpect(page: Page, status: 'Synchronisiert' | 'Offline' | 'Konflikt'): Promise<void> {
  await waitForShell(page);
  let dialog = await openSettings(page);
  if (await dialog.getByText(status, { exact: true }).isVisible().catch(() => false)) return;

  const syncButton = dialog.getByRole('button', { name: 'Jetzt synchronisieren' });
  if (await syncButton.isEnabled().catch(() => false)) await syncButton.click();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const reconciliation = page.getByRole('button', { name: 'Sicher synchronisieren' });
    if (await reconciliation.isVisible().catch(() => false)) {
      await reconciliation.click();
    }
    await waitForShell(page);
    if (!(await dialog.count())) dialog = await openSettings(page);
    if (await dialog.getByText(status, { exact: true }).isVisible().catch(() => false)) return;
    await page.waitForTimeout(500);
  }
  await expect(dialog.getByText(status, { exact: true })).toBeVisible();
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Aufgabe hinzufügen' }).click();
  await page.getByRole('button', { name: 'Manuelle Aufgabe' }).click();
  const dialog = page.locator('[role="dialog"][aria-label="Neue Aufgabe"]:not([inert])');
  await dialog.getByLabel('Aufgabentitel').fill(title);
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true }).last()).toBeVisible();
}

async function editTask(page: Page, currentTitle: string, update: { title?: string; note?: string }): Promise<void> {
  await page.getByRole('button', { name: `Aktionen für ${currentTitle}`, exact: true }).click();
  const menu = page.getByRole('menu', { name: `Aktionen für ${currentTitle}` });
  await menu.getByRole('menuitem', { name: 'Bearbeiten', exact: true }).click();
  const dialog = page.locator('[role="dialog"][aria-label="Aufgabe bearbeiten"]:not([inert])');
  if (update.title) await dialog.getByLabel('Aufgabentitel').fill(update.title);
  if (update.note) {
    const note = dialog.getByLabel('Notiz', { exact: true });
    if (!(await note.isVisible().catch(() => false))) {
      await dialog.getByRole('button', { name: 'Notiz', exact: true }).click();
    }
    await dialog.getByLabel('Notiz', { exact: true }).fill(update.note);
  }
  await dialog.getByRole('button', { name: 'Speichern', exact: true }).click();
}

async function expectTask(page: Page, title: string, note?: string): Promise<void> {
  await waitForShell(page);
  await expect(page.getByRole('heading', { name: title, exact: true }).last()).toBeVisible({ timeout: 15_000 });
  if (note) {
    await expect(page.locator('p[dir="auto"]').filter({ hasText: note }).last()).toHaveText(note);
  }
}

test.describe('P2-9 live two-device sync', () => {
  test.skip(!LIVE_SYNC_READY, 'Requires the ignored .env.local live-sync test account and enabled Real Auth + Sync flags.');

  test('syncs offline edits, preserves independent fields, exposes a conflict, and resolves it', async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const baseURL = String(testInfo.project.use.baseURL);
    const shared = {
      baseURL,
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
      await signInAndReconcile(pageA, 'Kontodaten später verwenden');
      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);
      await createTask(pageA, BASE_TITLE);
      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);

      await signInAndReconcile(pageB, 'Kontodaten später verwenden');
      await syncAndExpect(pageB, 'Synchronisiert');
      await closeSettings(pageB);
      await expectTask(pageB, BASE_TITLE);

      await deviceB.setOffline(true);
      await editTask(pageB, BASE_TITLE, { title: OFFLINE_TITLE });
      await syncAndExpect(pageB, 'Offline');
      await closeSettings(pageB);

      await editTask(pageA, BASE_TITLE, { note: DEVICE_A_NOTE });
      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);

      await deviceB.setOffline(false);
      await syncAndExpect(pageB, 'Synchronisiert');
      await closeSettings(pageB);
      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);
      await expectTask(pageA, OFFLINE_TITLE, DEVICE_A_NOTE);
      await expectTask(pageB, OFFLINE_TITLE, DEVICE_A_NOTE);

      await deviceA.setOffline(true);
      await deviceB.setOffline(true);
      await editTask(pageA, OFFLINE_TITLE, { title: DEVICE_A_CONFLICT_TITLE });
      await editTask(pageB, OFFLINE_TITLE, { title: DEVICE_B_CONFLICT_TITLE });

      await deviceA.setOffline(false);
      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);

      await deviceB.setOffline(false);
      await syncAndExpect(pageB, 'Konflikt');
      const settingsB = await openSettings(pageB);
      await expect(settingsB.getByText('Auf beiden Geräten geändert: title', { exact: true })).toBeVisible();
      await settingsB.getByRole('button', { name: 'Dieses Gerät', exact: true }).click();
      await waitForShell(pageB);
      await syncAndExpect(pageB, 'Synchronisiert');
      await closeSettings(pageB);

      await syncAndExpect(pageA, 'Synchronisiert');
      await closeSettings(pageA);
      await expectTask(pageA, DEVICE_B_CONFLICT_TITLE, DEVICE_A_NOTE);
      await expectTask(pageB, DEVICE_B_CONFLICT_TITLE, DEVICE_A_NOTE);
    } finally {
      await Promise.allSettled([deviceA.close(), deviceB.close()]);
    }
  });
});
