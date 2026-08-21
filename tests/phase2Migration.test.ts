import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateBackupObject } from '../src/types/backup';
import type { BackupFileV2, BackupFileV4 } from '../src/types/backup';
import { applyStorageTransaction } from '../src/utils/appStorage';
import type { StorageLike, StorageWrite } from '../src/utils/appStorage';

const fixture = (name: string): unknown => JSON.parse(readFileSync(
    fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
    'utf8',
));

const phase1 = (): Record<string, unknown> => fixture('phase1-backup-v1.json') as Record<string, unknown>;
const expectedPhase2 = (): BackupFileV2 => fixture('phase2-backup-v2.json') as BackupFileV2;
const expectedCurrent = (): BackupFileV4 => ({
    ...expectedPhase2(),
    schemaVersion: 4,
    focusState: { activeSession: null, history: [] },
    templates: [],
});

const migrateBackupToCurrent = (input: unknown) => {
    const validated = validateBackupObject(input);
    if (validated.status === 'invalid') return validated;
    const source = input as { schemaVersion?: number };
    return {
        status: 'ok' as const,
        value: validated.value,
        migratedFrom: source.schemaVersion as 1 | 2 | 3 | 4,
    };
};

class ContractStorage implements StorageLike {
    private readonly values = new Map<string, string>();
    private writeCalls = 0;
    failSetCall: number | null = null;

    get length(): number {
        return this.values.size;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this.writeCalls += 1;
        if (this.failSetCall === this.writeCalls) throw new Error('synthetic write failure');
        this.values.set(key, value);
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    seed(key: string, value: string): void {
        this.values.set(key, value);
    }

    snapshot(): Record<string, string> {
        return Object.fromEntries(this.values);
    }
}

test('the synthetic Phase 1 fixture remains a valid production v1 backup', () => {
    const validation = validateBackupObject(phase1());
    assert.equal(validation.status, 'valid');
});

test('v1 migrates to the reviewed current fixture exactly', () => {
    const source = phase1();
    const result = migrateBackupToCurrent(source);

    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;
    assert.equal(result.migratedFrom, 1);
    assert.deepEqual(result.value, expectedCurrent());
});

test('migration never invents a legacy completion instant', () => {
    const result = migrateBackupToCurrent(phase1());
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;

    assert.equal(result.value.tasks[0].completed, true);
    assert.equal(result.value.tasks[0].completedAt, null);
    assert.equal(result.value.tasks[1].completed, false);
    assert.equal(result.value.tasks[1].completedAt, null);
});

test('migration preserves orphan Essential progress without inventing its deleted definition', () => {
    const result = migrateBackupToCurrent(phase1());
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;

    const orphan = result.value.essentialHistory[0].entries.at(-1);
    assert.deepEqual(orphan, {
        essentialId: 'synthetic-removed-essential',
        title: null,
        targetCount: null,
        completedCount: 1,
    });
});

test('migration is deterministic, idempotent, and does not mutate its input', () => {
    const source = phase1();
    const untouched = structuredClone(source);
    const first = migrateBackupToCurrent(source);
    assert.equal(first.status, 'ok');
    if (first.status !== 'ok') return;

    const second = migrateBackupToCurrent(first.value);
    assert.equal(second.status, 'ok');
    if (second.status !== 'ok') return;

    assert.deepEqual(source, untouched);
    assert.deepEqual(second.value, first.value);
    assert.equal(second.migratedFrom, 4);
});

test('unknown top-level fields including an auth session never cross the migration boundary', () => {
    const source = phase1();
    source.mdf_auth_session = { username: 'synthetic-only', token: 'not-a-real-token' };

    const result = migrateBackupToCurrent(source);
    assert.equal(result.status, 'ok');
    if (result.status !== 'ok') return;

    assert.equal('mdf_auth_session' in result.value, false);
    assert.equal(JSON.stringify(result.value).includes('not-a-real-token'), false);
});

test('unsupported versions and malformed v2 history are rejected as a whole', () => {
    const unsupported = { ...phase1(), schemaVersion: 99 };
    const unsupportedResult = migrateBackupToCurrent(unsupported);
    assert.equal(unsupportedResult.status, 'invalid');
    if (unsupportedResult.status === 'invalid') {
        assert.equal(unsupportedResult.errors.some(error => error.startsWith('unsupported-schema-version')), true);
    }

    const malformed = expectedPhase2();
    malformed.essentialHistory[0].entries.push({
        ...malformed.essentialHistory[0].entries[0],
        essentialId: malformed.essentialHistory[0].entries[0].essentialId,
    });
    const result = migrateBackupToCurrent(malformed);
    assert.equal(result.status, 'invalid');
    if (result.status !== 'invalid') return;
    assert.equal(result.errors.includes('invalid-essential-history'), true);
});

test('v2 rejects invented or inconsistent completion timestamps', () => {
    const nonCanonical = expectedPhase2();
    nonCanonical.tasks[0].completedAt = '2026-08-20T12:00:00Z';
    assert.equal(migrateBackupToCurrent(nonCanonical).status, 'invalid');

    const incompleteWithTimestamp = expectedPhase2();
    incompleteWithTimestamp.tasks[1].completedAt = '2026-08-20T12:00:00.000Z';
    assert.equal(migrateBackupToCurrent(incompleteWithTimestamp).status, 'invalid');
});

test('v2 rejects a non-canonical Essentials history close instant', () => {
    const malformed = expectedPhase2();
    malformed.essentialHistory[0].recordedAt = '2026-08-20T12:00:00Z';
    assert.equal(migrateBackupToCurrent(malformed).status, 'invalid');
});

test('a failed multi-key v2 storage migration restores exact raw bytes and key absence', () => {
    const storage = new ContractStorage();
    const tasksKey = 'myDailyFlowTasks';
    const historyKey = 'myDailyFlowEssentialHistory';
    const originalTasks = '{  "version": 1, "data": [] }\n';
    storage.seed(tasksKey, originalTasks);
    storage.seed('mdf_auth_session', 'synthetic-session-must-survive');
    const before = storage.snapshot();
    const baseline: StorageWrite[] = [
        { key: tasksKey, value: originalTasks },
        { key: historyKey, value: null },
    ];
    storage.failSetCall = 2;

    const result = applyStorageTransaction(storage, [
        { key: tasksKey, value: JSON.stringify({ version: 2, data: expectedPhase2().tasks }) },
        { key: historyKey, value: JSON.stringify({ version: 2, data: expectedPhase2().essentialHistory }) },
    ], baseline);

    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.equal(result.restored, true);
    assert.deepEqual(storage.snapshot(), before);
    assert.equal(storage.getItem(tasksKey), originalTasks);
    assert.equal(storage.getItem(historyKey), null);
    assert.equal(storage.getItem('mdf_auth_session'), 'synthetic-session-must-survive');
});

test('the same v2 transaction succeeds when storage is healthy', () => {
    const storage = new ContractStorage();
    const tasksKey = 'myDailyFlowTasks';
    const historyKey = 'myDailyFlowEssentialHistory';
    const writes: StorageWrite[] = [
        { key: tasksKey, value: JSON.stringify({ version: 2, data: expectedPhase2().tasks }) },
        { key: historyKey, value: JSON.stringify({ version: 2, data: expectedPhase2().essentialHistory }) },
    ];

    const result = applyStorageTransaction(storage, writes);

    assert.equal(result.status, 'ok');
    assert.equal(storage.getItem(tasksKey), writes[0].value);
    assert.equal(storage.getItem(historyKey), writes[1].value);
});
