import assert from 'node:assert/strict';
import test from 'node:test';

import type { StorageLike } from '../src/utils/appStorage';
import { RECOVERY_PREFIX, STORAGE_KEYS, parseEssentialHistoryRaw, parseEssentialsStateRaw, parseTasksRaw } from '../src/utils/appStorage';
import { closeEssentialHistoryDay, migrateStorageToV2 } from '../src/utils/phase2Migration';
import { withTaskCompletion } from '../src/utils/taskUtils';
import type { Task } from '../src/types/task';

class MigrationStorage implements StorageLike {
    private values = new Map<string, string>();
    writeCount = 0;
    failWriteAt: number | null = null;

    get length(): number { return this.values.size; }
    key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    setItem(key: string, value: string): void {
        this.writeCount += 1;
        if (this.failWriteAt === this.writeCount) throw new Error('synthetic migration failure');
        this.values.set(key, value);
    }
    removeItem(key: string): void { this.values.delete(key); }
    seed(key: string, value: string): void { this.values.set(key, value); }
    recoveryKeys(): string[] { return [...this.values.keys()].filter(key => key.startsWith(RECOVERY_PREFIX)); }
}

const legacyTask = {
    id: 'legacy-task',
    title: 'Synthetic legacy task',
    time: '09:00',
    duration: '30m',
    timeBlock: 'morning',
    completed: true,
    priority: 'medium',
    createdAt: '2026-08-19T08:00:00.000Z',
    date: '2026-08-20',
};

const seedLegacy = (storage: MigrationStorage) => {
    storage.seed(STORAGE_KEYS.tasks, JSON.stringify({ version: 1, data: [legacyTask] }));
    storage.seed(STORAGE_KEYS.essentialsData, JSON.stringify({ version: 1, data: [{
        id: 'water', title: 'Water', targetCount: 3, order: 0, createdAt: '2026-08-01T08:00:00.000Z',
    }] }));
    storage.seed(STORAGE_KEYS.essentialsState, JSON.stringify({
        version: 1,
        data: { date: '2026-08-20', progressById: { water: 2, removed: 1 } },
    }));
    storage.seed('mdf_auth_session', 'synthetic-session');
};

test('a fresh installation is not treated as a migration and receives no recovery snapshot', () => {
    const storage = new MigrationStorage();

    assert.deepEqual(migrateStorageToV2(storage, '2026-08-20T12:00:00.000Z'), {
        status: 'ok',
        migrated: false,
    });
    assert.equal(storage.getItem(STORAGE_KEYS.essentialHistory), null);
    assert.deepEqual(storage.recoveryKeys(), []);
});

test('storage migration atomically creates Task v2 and the first Essentials history day', () => {
    const storage = new MigrationStorage();
    seedLegacy(storage);

    const result = migrateStorageToV2(storage, '2026-08-20T12:00:00.000Z');
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.migrated, true);

    const tasks = parseTasksRaw(storage.getItem(STORAGE_KEYS.tasks));
    assert.equal(tasks.status, 'ok');
    assert.equal(tasks.value?.[0].completedAt, null);

    const history = parseEssentialHistoryRaw(storage.getItem(STORAGE_KEYS.essentialHistory));
    assert.equal(history.status, 'ok');
    assert.equal(history.value?.[0].source, 'legacy-snapshot');
    assert.deepEqual(history.value?.[0].entries.at(-1), {
        essentialId: 'removed', title: null, targetCount: null, completedCount: 1,
    });
    assert.equal(storage.getItem('mdf_auth_session'), 'synthetic-session');
    assert.equal(storage.recoveryKeys().length, 1);
});

test('storage migration is idempotent and does not create another snapshot', () => {
    const storage = new MigrationStorage();
    seedLegacy(storage);
    assert.equal(migrateStorageToV2(storage, '2026-08-20T12:00:00.000Z').status, 'ok');
    const firstTasks = storage.getItem(STORAGE_KEYS.tasks);
    const firstHistory = storage.getItem(STORAGE_KEYS.essentialHistory);

    const second = migrateStorageToV2(storage, '2026-08-20T13:00:00.000Z');
    assert.deepEqual(second, { status: 'ok', migrated: false });
    assert.equal(storage.getItem(STORAGE_KEYS.tasks), firstTasks);
    assert.equal(storage.getItem(STORAGE_KEYS.essentialHistory), firstHistory);
    assert.equal(storage.recoveryKeys().length, 1);
});

test('opening on the next day atomically closes yesterday and resets current progress', () => {
    const storage = new MigrationStorage();
    seedLegacy(storage);
    assert.equal(migrateStorageToV2(storage, '2026-08-20T12:00:00.000Z').status, 'ok');
    storage.setItem(STORAGE_KEYS.essentialsState, JSON.stringify({
        version: 1,
        data: { date: '2026-08-20', progressById: { water: 3 } },
    }));

    const result = migrateStorageToV2(storage, '2026-08-21T00:05:00.000Z');
    assert.equal(result.status, 'ok');
    const state = parseEssentialsStateRaw(storage.getItem(STORAGE_KEYS.essentialsState));
    assert.deepEqual(state.value, { date: '2026-08-21', progressById: {} });
    const history = parseEssentialHistoryRaw(storage.getItem(STORAGE_KEYS.essentialHistory));
    assert.equal(history.value?.[0].source, 'daily-close');
    assert.equal(history.value?.[0].recordedAt, '2026-08-21T00:05:00.000Z');
    assert.equal(history.value?.[0].entries.find(entry => entry.essentialId === 'water')?.completedCount, 3);
});

test('a failed coordinated migration restores original task bytes and history-key absence', () => {
    const storage = new MigrationStorage();
    seedLegacy(storage);
    const originalTasks = storage.getItem(STORAGE_KEYS.tasks);
    storage.failWriteAt = 3; // recovery snapshot, tasks write, then history write fails

    const result = migrateStorageToV2(storage, '2026-08-20T12:00:00.000Z');
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.rolledBack, true);
    assert.equal(storage.getItem(STORAGE_KEYS.tasks), originalTasks);
    assert.equal(storage.getItem(STORAGE_KEYS.essentialHistory), null);
    assert.equal(storage.getItem('mdf_auth_session'), 'synthetic-session');
});

test('new completion writes a canonical instant and undo clears it', () => {
    const base: Task = { ...legacyTask, timeBlock: 'morning', priority: 'medium', completed: false, completedAt: null };
    const completed = withTaskCompletion(base, true, () => '2026-08-20T12:34:56.789Z');
    assert.equal(completed.completed, true);
    assert.equal(completed.completedAt, '2026-08-20T12:34:56.789Z');

    const undone = withTaskCompletion(completed, false);
    assert.equal(undone.completed, false);
    assert.equal(undone.completedAt, null);
});

test('daily close replaces the same date immutably and preserves definition labels', () => {
    const previous = [{
        date: '2026-08-19', recordedAt: null, source: 'legacy-snapshot' as const, entries: [],
    }];
    const untouched = structuredClone(previous);
    const result = closeEssentialHistoryDay(
        previous,
        [{ id: 'water', title: 'Wasser', targetCount: 3, order: 0, createdAt: '2026-08-01T08:00:00.000Z' }],
        { date: '2026-08-19', progressById: { water: 2 } },
        '2026-08-20T00:00:05.000Z',
    );
    assert.deepEqual(previous, untouched);
    assert.deepEqual(result, [{
        date: '2026-08-19',
        recordedAt: '2026-08-20T00:00:05.000Z',
        source: 'daily-close',
        entries: [{ essentialId: 'water', title: 'Wasser', targetCount: 3, completedCount: 2 }],
    }]);
});
