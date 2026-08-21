/**
 * P2-7 executable design prototype.
 *
 * This file is deliberately outside src/: it proves the sync contract without
 * entering the production bundle or changing local storage. P2-9 may implement
 * the contract behind a SyncTransport, but must not import this spike directly.
 */

export type SyncEntityKind =
    | 'task'
    | 'essential'
    | 'essential-history'
    | 'focus-session'
    | 'template'
    | 'preference';

export interface SyncRecord {
    key: string;
    kind: SyncEntityKind;
    payload: Record<string, unknown>;
    revision: number;
    fieldRevisions: Record<string, number>;
    tombstone: boolean;
}

export interface SyncMutation {
    mutationId: string;
    deviceId: string;
    key: string;
    kind: SyncEntityKind;
    baseRevision: number;
    operation: 'patch' | 'delete';
    changes?: Record<string, unknown>;
}

export interface SyncConflict {
    mutationId: string;
    key: string;
    conflictingFields: string[];
    reason: 'same-field-edit' | 'edit-after-delete' | 'delete-after-edit';
}

export interface MutationReceipt {
    mutationId: string;
    status: 'applied' | 'conflict';
    revision: number;
}

export interface SyncState {
    revision: number;
    records: Record<string, SyncRecord>;
    receipts: Record<string, MutationReceipt>;
    conflicts: SyncConflict[];
}

export const emptySyncState = (): SyncState => ({
    revision: 0,
    records: {},
    receipts: {},
    conflicts: [],
});

const conflict = (
    state: SyncState,
    mutation: SyncMutation,
    conflictingFields: string[],
    reason: SyncConflict['reason'],
): MutationReceipt => {
    const receipt: MutationReceipt = {
        mutationId: mutation.mutationId,
        status: 'conflict',
        revision: state.revision,
    };
    state.conflicts.push({
        mutationId: mutation.mutationId,
        key: mutation.key,
        conflictingFields,
        reason,
    });
    state.receipts[mutation.mutationId] = receipt;
    return receipt;
};

/**
 * Applies one mutation with server-revision ordering and idempotent receipts.
 * Different fields can merge when neither changed after baseRevision. Same-field
 * edits and delete/edit races are retained as conflicts instead of silently
 * choosing a device clock or last arrival.
 */
export const applyMutation = (state: SyncState, mutation: SyncMutation): MutationReceipt => {
    const existingReceipt = state.receipts[mutation.mutationId];
    if (existingReceipt) return existingReceipt;

    const current = state.records[mutation.key];
    if (mutation.operation === 'delete') {
        if (current && current.revision > mutation.baseRevision) {
            return conflict(state, mutation, [], 'delete-after-edit');
        }
        state.revision += 1;
        state.records[mutation.key] = {
            key: mutation.key,
            kind: mutation.kind,
            payload: current?.payload ?? {},
            revision: state.revision,
            fieldRevisions: current?.fieldRevisions ?? {},
            tombstone: true,
        };
    } else {
        if (current?.tombstone && current.revision > mutation.baseRevision) {
            return conflict(state, mutation, [], 'edit-after-delete');
        }
        const changes = mutation.changes ?? {};
        const conflictingFields = Object.keys(changes)
            .filter(field => (current?.fieldRevisions[field] ?? 0) > mutation.baseRevision)
            .sort();
        if (conflictingFields.length > 0) {
            return conflict(state, mutation, conflictingFields, 'same-field-edit');
        }

        state.revision += 1;
        const fieldRevisions = { ...(current?.fieldRevisions ?? {}) };
        for (const field of Object.keys(changes)) fieldRevisions[field] = state.revision;
        state.records[mutation.key] = {
            key: mutation.key,
            kind: mutation.kind,
            payload: { ...(current?.payload ?? {}), ...changes },
            revision: state.revision,
            fieldRevisions,
            tombstone: false,
        };
    }

    const receipt: MutationReceipt = {
        mutationId: mutation.mutationId,
        status: 'applied',
        revision: state.revision,
    };
    state.receipts[mutation.mutationId] = receipt;
    return receipt;
};

export interface DatasetManifest {
    itemCount: number;
    revision: number | null;
    digest: string | null;
}

export type FirstSignInDecision =
    | 'start-empty'
    | 'offer-upload-local'
    | 'offer-download-account'
    | 'require-explicit-reconciliation';

export const firstSignInDecision = (
    local: DatasetManifest,
    account: DatasetManifest,
): FirstSignInDecision => {
    if (local.itemCount === 0 && account.itemCount === 0) return 'start-empty';
    if (local.itemCount > 0 && account.itemCount === 0) return 'offer-upload-local';
    if (local.itemCount === 0 && account.itemCount > 0) return 'offer-download-account';
    return 'require-explicit-reconciliation';
};
