import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { AppDataSnapshot } from '../src/types/backup';
import {
    emptyClientState,
    enqueueLocalChanges,
    enqueueLocalChangesSince,
    hasEstablishedSyncClient,
    hasPreparedReconciliation,
    loadClientState,
    mergeRemoteForLocal,
    persistPreparedReconciliation,
    persistClientState,
    reconciliationStateKey,
    SYNC_DEVICE_KEY,
} from '../src/sync/clientState';
import { snapshotToSyncRecords, syncRecordsToSnapshot } from '../src/sync/projection';
import { applySyncedSnapshot, snapshotStorageWrites } from '../src/sync/storage';
import type { SyncRecord } from '../src/sync/types';

const snapshot = (): AppDataSnapshot => ({
    tasks: [{
        id: 'task-1', title: 'Plan', time: '09:00', duration: '30m', timeBlock: 'morning',
        completed: false, completedAt: null, priority: 'high', createdAt: '2026-08-21T08:00:00.000Z', date: '2026-08-21',
    }],
    essentials: [{ id: 'essential-1', title: 'Water', targetCount: 3, order: 0, createdAt: '2026-08-21T08:00:00.000Z' }],
    essentialsState: { date: '2026-08-21', progressById: { 'essential-1': 2 } },
    essentialHistory: [{
        date: '2026-08-20', recordedAt: '2026-08-21T00:00:00.000Z', source: 'daily-close',
        entries: [{ essentialId: 'essential-1', title: 'Water', targetCount: 3, completedCount: 3 }],
    }],
    focusState: { activeSession: null, history: [] },
    templates: [],
    preferences: { theme: 'dark', remindersEnabled: true, stickyHeroEnabled: true, essentialsCollapsed: false },
});

const canonical = (local: ReturnType<typeof snapshotToSyncRecords>, start = 1): Record<string, SyncRecord> =>
    Object.fromEntries(Object.values(local).map((entry, index) => [entry.key, {
        ...entry,
        revision: start + index,
        fieldRevisions: Object.fromEntries(Object.keys(entry.payload).map(field => [field, start + index])),
        tombstone: false,
    }]));

class MemoryStorage {
    values = new Map<string, string>();
    get length() { return this.values.size; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    getItem(key: string) { return this.values.get(key) ?? null; }
    setItem(key: string, value: string) { this.values.set(key, value); }
    removeItem(key: string) { this.values.delete(key); }
}

test('Backup-v4 snapshot projects to mergeable records and round-trips without auth material', () => {
    const source = snapshot();
    const records = snapshotToSyncRecords(source);
    assert.ok(records['task:task-1']);
    assert.ok(records['essential-progress:2026-08-21:essential-1']);
    assert.equal(Object.keys(records).some(key => /auth|session|recovery/i.test(key)), false);
    assert.deepEqual(syncRecordsToSnapshot(canonical(records), '2026-08-21'), source);
});

test('independent field edits create one outbox mutation with the shared base revision', () => {
    const initial = snapshotToSyncRecords(snapshot());
    const shadow = canonical(initial);
    const changed = structuredClone(initial);
    changed['task:task-1'].payload.title = 'Updated';
    const base = { ...emptyClientState('11111111-1111-4111-8111-111111111111'), shadow };
    const next = enqueueLocalChanges(base, changed, '2026-08-21T10:00:00.000Z', () => '22222222-2222-4222-8222-222222222222');
    assert.equal(next.outbox.length, 1);
    assert.equal(next.outbox[0].baseRevision, shadow['task:task-1'].revision);
    assert.deepEqual(next.outbox[0].changes, { title: 'Updated' });
    assert.equal(enqueueLocalChanges(next, changed, '2026-08-21T10:01:00.000Z').outbox.length, 1);
});

test('removing an optional field is an explicit patch and preserves unrelated remote edits', () => {
    const initial = snapshotToSyncRecords(snapshot());
    initial['task:task-1'].payload.notes = 'Remove me';
    const shadow = canonical(initial);
    const changed = structuredClone(initial);
    delete changed['task:task-1'].payload.notes;
    const base = { ...emptyClientState('11111111-1111-4111-8111-111111111111'), shadow };
    const next = enqueueLocalChanges(base, changed, '2026-08-21T10:00:00.000Z', () => '22222222-2222-4222-8222-222222222222');
    assert.equal(next.outbox.length, 1);
    assert.deepEqual(next.outbox[0].changes, {});
    assert.deepEqual(next.outbox[0].removedFields, ['notes']);

    const remote = structuredClone(shadow);
    remote['task:task-1'].payload.priority = 'low';
    const merged = mergeRemoteForLocal(remote, changed, ['task:task-1'], shadow);
    assert.equal(Object.hasOwn(merged['task:task-1'].payload, 'notes'), false);
    assert.equal(merged['task:task-1'].payload.priority, 'low');
});

test('a local edit made during sync remains queued without hiding an unrelated remote edit', () => {
    const initial = snapshotToSyncRecords(snapshot());
    const shadow = canonical(initial);
    const remote = structuredClone(shadow);
    remote['task:task-1'].payload.priority = 'low';
    remote['task:task-1'].revision += 1;
    remote['task:task-1'].fieldRevisions.priority = remote['task:task-1'].revision;
    const latestLocal = structuredClone(initial);
    latestLocal['task:task-1'].payload.title = 'Typed while syncing';
    const refreshed = {
        ...emptyClientState('11111111-1111-4111-8111-111111111111'),
        shadow: remote,
        datasetRevision: remote['task:task-1'].revision,
    };
    const queued = enqueueLocalChangesSince(
        refreshed,
        latestLocal,
        initial,
        shadow,
        '2026-08-21T10:00:00.000Z',
        () => '22222222-2222-4222-8222-222222222222',
    );
    assert.equal(queued.outbox.length, 1);
    assert.deepEqual(queued.outbox[0].changes, { title: 'Typed while syncing' });
    assert.equal(queued.outbox[0].baseRevision, remote['task:task-1'].revision);
    const merged = mergeRemoteForLocal(remote, latestLocal, ['task:task-1'], shadow);
    assert.equal(merged['task:task-1'].payload.title, 'Typed while syncing');
    assert.equal(merged['task:task-1'].payload.priority, 'low');
});

test('a same-field remote edit during sync keeps the older observed revision so the server creates a conflict', () => {
    const initial = snapshotToSyncRecords(snapshot());
    const shadow = canonical(initial);
    const remote = structuredClone(shadow);
    remote['task:task-1'].payload.title = 'Other device';
    remote['task:task-1'].revision += 1;
    remote['task:task-1'].fieldRevisions.title = remote['task:task-1'].revision;
    const latestLocal = structuredClone(initial);
    latestLocal['task:task-1'].payload.title = 'This device';
    const refreshed = {
        ...emptyClientState('11111111-1111-4111-8111-111111111111'),
        shadow: remote,
        datasetRevision: remote['task:task-1'].revision,
    };
    const queued = enqueueLocalChangesSince(
        refreshed,
        latestLocal,
        initial,
        shadow,
        '2026-08-21T10:00:00.000Z',
        () => '22222222-2222-4222-8222-222222222222',
    );
    assert.equal(queued.outbox[0].baseRevision, shadow['task:task-1'].revision);
    assert.deepEqual(queued.outbox[0].changes, { title: 'This device' });
});

test('first reconciliation merge never turns remote-only entities into deletes', () => {
    const local = snapshotToSyncRecords(snapshot());
    const remoteOnly = canonical({
        'task:remote': { key: 'task:remote', kind: 'task', payload: { ...snapshot().tasks[0], id: 'remote' } },
    });
    const state = { ...emptyClientState('11111111-1111-4111-8111-111111111111'), shadow: remoteOnly };
    const next = enqueueLocalChanges(state, local, '2026-08-21T10:00:00.000Z', () => crypto.randomUUID(), false);
    assert.equal(next.outbox.some(item => item.operation === 'delete'), false);
});

test('first reconciliation can mark shared-field differences as conflicts without deleting remote-only records', () => {
    const local = snapshotToSyncRecords(snapshot());
    local['task:task-1'].payload.title = 'Device title';
    const remote = canonical({
        ...snapshotToSyncRecords(snapshot()),
        'task:remote': { key: 'task:remote', kind: 'task', payload: { ...snapshot().tasks[0], id: 'remote' } },
    });
    remote['task:task-1'].payload.title = 'Account title';
    const comparison = Object.fromEntries(
        Object.entries(remote).map(([key, entry]) => [key, { ...entry, revision: 0 }]),
    );
    const state = {
        ...emptyClientState('11111111-1111-4111-8111-111111111111'),
        shadow: comparison,
        datasetRevision: Math.max(...Object.values(remote).map(entry => entry.revision)),
    };
    const next = enqueueLocalChanges(state, local, '2026-08-21T10:00:00.000Z', () => crypto.randomUUID(), false);
    const shared = next.outbox.find(item => item.key === 'task:task-1');
    assert.equal(shared?.baseRevision, 0);
    assert.deepEqual(shared?.changes, { title: 'Device title' });
    assert.equal(next.outbox.some(item => item.key === 'task:remote' && item.operation === 'delete'), false);
});

test('conflicted device value remains visible while non-conflicting remote changes apply', () => {
    const local = snapshotToSyncRecords(snapshot());
    local['task:task-1'].payload.title = 'Device title';
    const remote = canonical(snapshotToSyncRecords(snapshot()));
    remote['task:task-1'].payload.title = 'Account title';
    remote['preference:theme'].payload.value = 'light';
    const merged = mergeRemoteForLocal(remote, local, ['task:task-1']);
    assert.equal(merged['task:task-1'].payload.title, 'Device title');
    assert.equal(merged['preference:theme'].payload.value, 'light');
});

test('sync client metadata is account-namespaced and invalid metadata fails closed to empty', () => {
    const storage = new MemoryStorage();
    const state = emptyClientState('11111111-1111-4111-8111-111111111111');
    persistClientState(storage as unknown as Storage, 'user-a', state);
    assert.deepEqual(loadClientState(storage as unknown as Storage, 'user-a', state.deviceId), state);
    assert.equal(loadClientState(storage as unknown as Storage, 'user-b', state.deviceId).lastSyncedAt, null);
    storage.setItem('mdf_sync_state_v1_user-a', '{bad');
    assert.deepEqual(loadClientState(storage as unknown as Storage, 'user-a', state.deviceId), state);
});

test('only a completed sync state lets the same account and device bypass first-sign-in reconciliation', () => {
    const storage = new MemoryStorage();
    const deviceId = '11111111-1111-4111-8111-111111111111';
    storage.setItem(SYNC_DEVICE_KEY, deviceId);
    const state = emptyClientState(deviceId);
    persistClientState(storage as unknown as Storage, 'user-a', state);
    assert.equal(hasEstablishedSyncClient(storage as unknown as Storage, 'user-a'), false);

    persistClientState(storage as unknown as Storage, 'user-a', {
        ...state,
        lastSyncedAt: '2026-08-25T10:00:00.000Z',
    });
    assert.equal(hasEstablishedSyncClient(storage as unknown as Storage, 'user-a'), true);
    assert.equal(hasEstablishedSyncClient(storage as unknown as Storage, 'user-b'), false);

    storage.setItem(SYNC_DEVICE_KEY, 'not-a-device-id');
    assert.equal(hasEstablishedSyncClient(storage as unknown as Storage, 'user-a'), false);
});

test('a prepared first-sign-in decision is scoped to the exact account and device', () => {
    const storage = new MemoryStorage();
    const deviceA = '11111111-1111-4111-8111-111111111111';
    const deviceB = '22222222-2222-4222-8222-222222222222';
    storage.setItem(SYNC_DEVICE_KEY, deviceA);
    persistPreparedReconciliation(storage as unknown as Storage, 'user-a', deviceA, 'download-account');

    assert.equal(hasPreparedReconciliation(storage as unknown as Storage, 'user-a'), true);
    assert.equal(hasPreparedReconciliation(storage as unknown as Storage, 'user-b'), false);

    storage.setItem(SYNC_DEVICE_KEY, deviceB);
    assert.equal(hasPreparedReconciliation(storage as unknown as Storage, 'user-a'), false);

    storage.setItem(SYNC_DEVICE_KEY, deviceA);
    storage.setItem(reconciliationStateKey('user-a'), JSON.stringify({ deviceId: deviceA, choice: 'unknown' }));
    assert.equal(hasPreparedReconciliation(storage as unknown as Storage, 'user-a'), false);
});

test('remote snapshot applies all managed slices through one verified transaction', () => {
    const storage = new MemoryStorage();
    const source = snapshot();
    const result = applySyncedSnapshot(storage, source);
    assert.deepEqual(result, { status: 'applied' });
    for (const write of snapshotStorageWrites(source)) assert.equal(storage.getItem(write.key), write.value);
    assert.deepEqual(applySyncedSnapshot(storage, source), { status: 'unchanged' });
});

test('P2-9 migration keeps direct writes revoked and scopes every exposed table with RLS', () => {
    const sql = readFileSync('supabase/migrations/202608210002_p2_9_multidevice_sync.sql', 'utf8');
    for (const table of ['sync_devices', 'sync_records', 'sync_mutation_receipts', 'sync_conflicts']) {
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
    assert.match(sql, /revoke all on public\.sync_devices, public\.sync_records, public\.sync_mutation_receipts, public\.sync_conflicts from anon, authenticated/i);
    assert.match(sql, /client_removed_fields text\[\] not null default '\{\}'/i);
    assert.match(sql, /payload = \(public\.sync_records\.payload \|\| excluded\.payload\) - coalesce\(p_removed_fields/i);
    assert.match(sql, /p_device_present boolean/i);
    assert.match(sql, /payload = excluded\.payload/i);
    assert.match(sql, /security definer\s+set search_path = ''/gi);
    assert.doesNotMatch(sql, /service_role|secret[_-]?key/i);
});

test('P2-9 device reconciliation migration pins each decision to one browser device', () => {
    const sql = readFileSync('supabase/migrations/202608250001_p2_9_device_reconciliation.sql', 'utf8');
    assert.match(sql, /add column if not exists device_id uuid/i);
    assert.match(sql, /reconciliation_intents_owner_device_created_idx/i);
    assert.match(sql, /drop function if exists public\.prepare_first_sign_in_reconciliation\(text, jsonb, bigint\)/i);
    assert.match(sql, /p_device_id uuid/i);
    assert.match(sql, /if p_device_id is null then raise exception 'device id required'/i);
    assert.match(sql, /owner_id, dataset_id, device_id, choice/i);
    assert.match(sql, /revoke all on function public\.prepare_first_sign_in_reconciliation\(text, jsonb, bigint, uuid\) from public, anon/i);
    assert.match(sql, /grant execute on function public\.prepare_first_sign_in_reconciliation\(text, jsonb, bigint, uuid\) to authenticated/i);
});
