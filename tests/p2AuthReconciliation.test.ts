import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRealAuthConfig } from '../src/config/features';
import type { StorageLike } from '../src/utils/appStorage';
import { RECOVERY_PREFIX, STORAGE_KEYS, serializeTasks } from '../src/utils/appStorage';
import type { Task } from '../src/types/task';
import {
    emptyManifest,
    prepareFirstSignInSafetyBoundary,
    recommendedDecision,
} from '../src/sync/reconciliation';

class MemoryStorage implements StorageLike {
    values = new Map<string, string>();
    failWrites = false;
    get length(): number { return this.values.size; }
    key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    setItem(key: string, value: string): void {
        if (this.failWrites) throw new Error('synthetic quota failure');
        this.values.set(key, value);
    }
    removeItem(key: string): void { this.values.delete(key); }
}

const task: Task = {
    id: 'synthetic-task',
    title: 'Synthetic local task',
    time: '',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    completedAt: null,
    priority: 'medium',
    createdAt: '2026-08-21T08:00:00.000Z',
    date: '2026-08-21',
};

test('real auth is disabled by default and requires complete public configuration', () => {
    assert.deepEqual(resolveRealAuthConfig({}, '/mydailyflow/', 'https://example.test'), { status: 'disabled' });
    assert.equal(resolveRealAuthConfig({ VITE_REAL_AUTH_ENABLED: 'true' }, '/', 'https://example.test').status, 'misconfigured');
    assert.equal(resolveRealAuthConfig({
        VITE_REAL_AUTH_ENABLED: 'true',
        VITE_SUPABASE_URL: 'http://unsafe.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test-key',
    }, '/', 'https://example.test').status, 'misconfigured');

    const configured = resolveRealAuthConfig({
        VITE_REAL_AUTH_ENABLED: 'true',
        VITE_SUPABASE_URL: 'https://synthetic.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    }, '/mydailyflow/', 'https://example.test');
    assert.equal(configured.status, 'configured');
    if (configured.status === 'configured') {
        assert.equal(configured.value.redirectUrl, 'https://example.test/mydailyflow/');
        assert.equal(configured.value.syncEnabled, false);
    }

    const syncConfigured = resolveRealAuthConfig({
        VITE_REAL_AUTH_ENABLED: 'true',
        VITE_SYNC_ENABLED: 'true',
        VITE_SUPABASE_URL: 'https://synthetic.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    }, '/', 'https://example.test');
    assert.equal(syncConfigured.status, 'configured');
    if (syncConfigured.status === 'configured') assert.equal(syncConfigured.value.syncEnabled, true);
});

test('first-sign-in choices are explicit for all four manifest combinations', () => {
    const empty = emptyManifest();
    const local = { ...emptyManifest(), itemCount: 1, digest: 'local' };
    const account = { ...emptyManifest(), itemCount: 2, revision: 4, digest: 'account' };

    assert.equal(recommendedDecision(empty, empty), 'start-empty');
    assert.equal(recommendedDecision(local, empty), 'upload-local');
    assert.equal(recommendedDecision(empty, account), 'download-account');
    assert.equal(recommendedDecision(local, account), 'merge-with-conflicts');
});

test('safety boundary verifies Backup v4 and byte-exact recovery without changing managed keys', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.tasks, serializeTasks([task]));
    storage.setItem('mdf_auth_session', 'synthetic-demo-session');
    const tasksBefore = storage.getItem(STORAGE_KEYS.tasks);

    const result = await prepareFirstSignInSafetyBoundary(
        storage,
        '2026-08-21',
        '2026-08-21T10:00:00.000Z',
    );
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;

    assert.equal(result.value.manifest.counts.tasks, 1);
    assert.equal(result.value.manifest.itemCount, 1);
    assert.equal(result.value.manifest.digest?.length, 64);
    assert.equal(storage.getItem(STORAGE_KEYS.tasks), tasksBefore);
    assert.equal(storage.getItem('mdf_auth_session'), 'synthetic-demo-session');
    assert.match(result.value.recoveryKey, new RegExp(`^${RECOVERY_PREFIX}first-sign-in__`));
    assert.equal(JSON.parse(result.value.backupText).schemaVersion, 4);
});

test('safety boundary fails closed when the recovery snapshot cannot be written', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.tasks, serializeTasks([task]));
    const before = Object.fromEntries(storage.values);
    storage.failWrites = true;

    const result = await prepareFirstSignInSafetyBoundary(
        storage,
        '2026-08-21',
        '2026-08-21T10:00:00.000Z',
    );
    assert.equal(result.status, 'failed');
    assert.deepEqual(Object.fromEntries(storage.values), before);
});
