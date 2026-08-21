import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyMutation,
    emptySyncState,
    firstSignInDecision,
    type DatasetManifest,
    type SyncMutation,
} from '../spikes/p2-7-auth-sync/protocol';

const mutation = (overrides: Partial<SyncMutation> = {}): SyncMutation => ({
    mutationId: 'mutation-1',
    deviceId: 'device-a',
    key: 'task:task-1',
    kind: 'task',
    baseRevision: 0,
    operation: 'patch',
    changes: { title: 'Plan today' },
    ...overrides,
});

test('replaying a mutation returns the original receipt without a second write', () => {
    const state = emptySyncState();
    const first = applyMutation(state, mutation());
    const replay = applyMutation(state, mutation());

    assert.deepEqual(replay, first);
    assert.equal(state.revision, 1);
    assert.equal(Object.keys(state.receipts).length, 1);
});

test('two devices can merge edits to different fields from the same base revision', () => {
    const state = emptySyncState();
    applyMutation(state, mutation());

    const deviceA = applyMutation(state, mutation({
        mutationId: 'device-a-title',
        baseRevision: 1,
        changes: { title: 'Updated title' },
    }));
    const deviceB = applyMutation(state, mutation({
        mutationId: 'device-b-note',
        deviceId: 'device-b',
        baseRevision: 1,
        changes: { notes: 'Independent note' },
    }));

    assert.equal(deviceA.status, 'applied');
    assert.equal(deviceB.status, 'applied');
    assert.deepEqual(state.records['task:task-1'].payload, {
        title: 'Updated title',
        notes: 'Independent note',
    });
});

test('same-field concurrent edits create a visible conflict and preserve the server value', () => {
    const state = emptySyncState();
    applyMutation(state, mutation());
    applyMutation(state, mutation({
        mutationId: 'device-a-title',
        baseRevision: 1,
        changes: { title: 'Device A' },
    }));
    const result = applyMutation(state, mutation({
        mutationId: 'device-b-title',
        deviceId: 'device-b',
        baseRevision: 1,
        changes: { title: 'Device B' },
    }));

    assert.equal(result.status, 'conflict');
    assert.equal(state.records['task:task-1'].payload.title, 'Device A');
    assert.deepEqual(state.conflicts[0].conflictingFields, ['title']);
});

test('an offline edit cannot resurrect a remotely deleted record', () => {
    const state = emptySyncState();
    applyMutation(state, mutation());
    applyMutation(state, mutation({
        mutationId: 'delete-a',
        baseRevision: 1,
        operation: 'delete',
        changes: undefined,
    }));
    const result = applyMutation(state, mutation({
        mutationId: 'late-edit-b',
        deviceId: 'device-b',
        baseRevision: 1,
        changes: { title: 'Offline title' },
    }));

    assert.equal(result.status, 'conflict');
    assert.equal(state.records['task:task-1'].tombstone, true);
    assert.equal(state.conflicts[0].reason, 'edit-after-delete');
});

test('a stale delete cannot silently erase a newer edit', () => {
    const state = emptySyncState();
    applyMutation(state, mutation());
    applyMutation(state, mutation({
        mutationId: 'edit-a',
        baseRevision: 1,
        changes: { notes: 'Newer note' },
    }));
    const result = applyMutation(state, mutation({
        mutationId: 'delete-b',
        deviceId: 'device-b',
        baseRevision: 1,
        operation: 'delete',
        changes: undefined,
    }));

    assert.equal(result.status, 'conflict');
    assert.equal(state.records['task:task-1'].tombstone, false);
    assert.equal(state.conflicts[0].reason, 'delete-after-edit');
});

test('completion and undo are same-field domain mutations and therefore conflict safely', () => {
    const state = emptySyncState();
    applyMutation(state, mutation({ changes: { completed: false, completedAt: null } }));
    applyMutation(state, mutation({
        mutationId: 'complete-a',
        baseRevision: 1,
        changes: { completed: true, completedAt: '2026-08-21T12:00:00.000Z' },
    }));
    const result = applyMutation(state, mutation({
        mutationId: 'undo-b',
        deviceId: 'device-b',
        baseRevision: 1,
        changes: { completed: false, completedAt: null },
    }));

    assert.equal(result.status, 'conflict');
    assert.deepEqual(state.conflicts[0].conflictingFields, ['completed', 'completedAt']);
});

test('first sign-in always chooses an explicit path from local and account manifests', () => {
    const empty: DatasetManifest = { itemCount: 0, revision: null, digest: null };
    const local: DatasetManifest = { itemCount: 3, revision: null, digest: 'local-digest' };
    const remote: DatasetManifest = { itemCount: 5, revision: 12, digest: 'remote-digest' };

    assert.equal(firstSignInDecision(empty, empty), 'start-empty');
    assert.equal(firstSignInDecision(local, empty), 'offer-upload-local');
    assert.equal(firstSignInDecision(empty, remote), 'offer-download-account');
    assert.equal(firstSignInDecision(local, remote), 'require-explicit-reconciliation');
});
