export const SYNC_SCHEMA_VERSION = 1;

export type SyncEntityKind =
    | 'task'
    | 'essential'
    | 'essential-progress'
    | 'essential-history'
    | 'focus-active'
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
    removedFields?: string[];
    clientTimestamp: string;
}

export type SyncConflictReason = 'same-field-edit' | 'edit-after-delete' | 'delete-after-edit';

export interface SyncConflict {
    id: string;
    mutationId: string;
    key: string;
    kind: SyncEntityKind;
    conflictingFields: string[];
    reason: SyncConflictReason;
    serverPayload: Record<string, unknown>;
    clientChanges: Record<string, unknown>;
    clientRemovedFields: string[];
    clientOperation: 'patch' | 'delete';
    createdAt: string;
}

export interface MutationReceipt {
    mutationId: string;
    status: 'applied' | 'conflict';
    revision: number;
    conflictId: string | null;
}

export interface SyncClientState {
    version: typeof SYNC_SCHEMA_VERSION;
    deviceId: string;
    datasetRevision: number;
    shadow: Record<string, SyncRecord>;
    outbox: SyncMutation[];
    conflictedKeys: string[];
    lastSyncedAt: string | null;
}

export type SyncStatus = 'disabled' | 'local' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'offline' | 'error';

export interface SyncViewState {
    status: SyncStatus;
    pendingCount: number;
    conflicts: SyncConflict[];
    lastSyncedAt: string | null;
    message: string | null;
}
