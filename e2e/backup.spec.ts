/**
 * backup.spec.ts — browser-level backup round-trip, synthetic data only.
 *
 * The node suite (tests/backupFormat.test.ts) already proves the *format* and
 * the merge/replace semantics as pure functions. This spec proves the part node
 * cannot: that the real browser download → real file → real <input type="file">
 * → real localStorage path works end to end, and that the auth session never
 * travels with the data.
 *
 * File safety: the download is captured through Playwright's download API and
 * written into this test's own output directory under `test-results/`, which
 * Playwright creates and manages. That directory does sit inside the checkout,
 * but it is gitignored and disposable — every artifact this suite produces stays
 * there. What is never touched: the browser's real Downloads folder, any real
 * user file, any existing backup, and any tracked file in the repository.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { annotate, recordFindings } from './utils/report';
import { expect, test, waitForAppShell } from './fixtures/app';
import { KEYS, SEED_ESSENTIALS, SEED_TASKS, TODAY } from './fixtures/synthetic-data';

test.describe('backup export / import round-trip', () => {
  test('exported backup carries synthetic data and excludes the session', async ({
    app,
  }, testInfo) => {
    await app.openSettings();

    const downloadPromise = app.page.waitForEvent('download');
    await app.page.getByRole('button', { name: 'Exportieren' }).click();
    const download = await downloadPromise;

    const savedAt = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(savedAt);

    const raw = readFileSync(savedAt, 'utf8');
    const backup = JSON.parse(raw);

    // ── Shape ────────────────────────────────────────────────────────────────
    expect(backup.app).toBe('mydailyflow');
    expect(backup.schemaVersion).toBe(1);
    expect(download.suggestedFilename()).toMatch(/^mydailyflow-backup-.*\.json$/);

    // ── Data survives ────────────────────────────────────────────────────────
    const exportedTaskIds = backup.tasks.map((t: { id: string }) => t.id).sort();
    expect(exportedTaskIds).toEqual(SEED_TASKS.map((t) => t.id).sort());

    const exportedEssentialIds = backup.essentials.map((e: { id: string }) => e.id).sort();
    expect(exportedEssentialIds).toEqual(SEED_ESSENTIALS.map((e) => e.id).sort());

    expect(backup.essentialsState.progressById['e2e-ess-multi']).toBe(2);
    expect(backup.essentialsState.date).toBe(TODAY);

    // Preferences ride along, but only the four harmless UI ones.
    expect(Object.keys(backup.preferences).sort()).toEqual([
      'essentialsCollapsed',
      'remindersEnabled',
      'stickyHeroEnabled',
      'theme',
    ]);

    // ── Session is excluded ──────────────────────────────────────────────────
    // Checked three ways: the key is absent, the synthetic username never
    // appears anywhere in the serialized file, and no top-level field is
    // session-shaped.
    expect(raw).not.toContain(KEYS.authSession);
    expect(raw).not.toContain('e2e-synthetic-user');
    expect(raw).not.toContain('expiresAt');
    expect(Object.keys(backup)).toEqual(
      expect.not.arrayContaining(['session', 'auth', 'user', 'username']),
    );

    // The session is still live in the browser — it was simply not exported.
    const liveSession = await app.readSessionStorage(KEYS.authSession);
    expect(liveSession).toContain('e2e-synthetic-user');

    await recordFindings(testInfo, 'backup-export-contents', {
      fileName: download.suggestedFilename(),
      bytes: raw.length,
      topLevelKeys: Object.keys(backup),
      preferenceKeys: Object.keys(backup.preferences ?? {}),
      taskCount: backup.tasks.length,
      essentialCount: backup.essentials.length,
      sessionKeyPresent: raw.includes(KEYS.authSession),
      syntheticUsernamePresent: raw.includes('e2e-synthetic-user'),
    });
  });

  test('importing that backup restores tasks and essentials without touching auth', async ({
    app,
  }, testInfo) => {
    // 1. Export the seeded state.
    await app.openSettings();
    const downloadPromise = app.page.waitForEvent('download');
    await app.page.getByRole('button', { name: 'Exportieren' }).click();
    const download = await downloadPromise;
    const savedAt = path.join(testInfo.outputDir, download.suggestedFilename());
    await download.saveAs(savedAt);

    // 2. Wipe the data slices in the browser, leaving the session alone, and
    //    reload. The init script will not re-seed (see fixtures/app.ts).
    await app.page.evaluate((keys) => {
      localStorage.removeItem(keys.tasks);
      localStorage.removeItem(keys.essentialsData);
      localStorage.removeItem(keys.essentialsState);
    }, KEYS);
    await app.page.reload({ waitUntil: 'domcontentloaded' });

    await waitForAppShell(app.page);
    // Still signed in — the wipe did not disturb the session.
    expect(await app.readSessionStorage(KEYS.authSession)).toContain('e2e-synthetic-user');
    await expect(app.page.getByText('Synthetische Aufgabe — Morgen')).toBeHidden();

    // 3. Import the file through the real hidden <input type="file">.
    await app.openSettings();
    await app.page.locator('input[type="file"]').setInputFiles(savedAt);

    // Preview appears before anything is written — an import is never silent.
    await expect(app.page.getByText('Vorschau')).toBeVisible();
    await expect(app.page.getByText(`${SEED_TASKS.length} Aufgaben`)).toBeVisible();

    await app.page.getByRole('button', { name: 'Ersetzen' }).click();
    await app.page.getByRole('button', { name: 'Übernehmen' }).click();

    // 4. The app reloads itself after a successful import.
    await waitForAppShell(app.page);
    await expect(app.page.getByText('Synthetische Aufgabe — Morgen')).toBeVisible();

    const storage = await app.readStorage();
    const tasks = JSON.parse(storage[KEYS.tasks] as string);
    const essentials = JSON.parse(storage[KEYS.essentialsData] as string);

    expect(tasks.data.map((t: { id: string }) => t.id).sort()).toEqual(
      SEED_TASKS.map((t) => t.id).sort(),
    );
    expect(essentials.data.map((e: { id: string }) => e.id).sort()).toEqual(
      SEED_ESSENTIALS.map((e) => e.id).sort(),
    );

    // 5. Auth never entered localStorage, and the live session is untouched.
    expect(storage[KEYS.authSession]).toBeNull();
    expect(await app.readSessionStorage(KEYS.authSession)).toContain('e2e-synthetic-user');

    // 6. The import took a pre-import recovery snapshot rather than overwriting
    //    blind — checked because that is the safety property the feature exists
    //    for, and a browser-level regression here would be invisible to node.
    const recoveryKeys = await app.page.evaluate((prefix) => {
      const found: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) found.push(key);
      }
      return found;
    }, KEYS.recoveryPrefix);

    await recordFindings(testInfo, 'backup-import-round-trip', {
      importedTaskIds: tasks.data.map((t: { id: string }) => t.id),
      importedEssentialIds: essentials.data.map((e: { id: string }) => e.id),
      authInLocalStorage: storage[KEYS.authSession],
      sessionSurvived: true,
      recoverySnapshotsCreated: recoveryKeys.length,
      recoveryKeys,
    });

    expect(recoveryKeys.length).toBeGreaterThan(0);

    annotate(
      testInfo,
      'verified',
      'Browser round-trip is deterministic: download captured via the download API, re-imported via setInputFiles. No node-level fallback needed, and the node backup suite is unchanged.',
    );
  });
});
