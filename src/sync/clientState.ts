import type { LocalSyncRecord } from './projection';
import { changedFields, removedFieldNames } from './projection';
import type { FirstSignInDecision } from './reconciliation';
import { SYNC_SCHEMA_VERSION, type SyncClientState, type SyncMutation, type SyncRecord } from './types';

export const SYNC_DEVICE_KEY = 'mdf_sync_device_v1';
export const syncStateKey = (userId: string): string => `mdf_sync_state_v1_${userId}`;
export const reconciliationStateKey = (userId: string): string => `mdf_reconciliation_state_v1_${userId}`;

const isDeviceId = (value: string | null): value is string =>
    Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

export const newOpaqueId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export function loadOrCreateDeviceId(storage: Pick<Storage, 'getItem' | 'setItem'>): string {
    const existing = storage.getItem(SYNC_DEVICE_KEY);
    if (isDeviceId(existing)) return existing;
    const created = newOpaqueId();
    storage.setItem(SYNC_DEVICE_KEY, created);
    return created;
}

/**
 * True only after this exact browser/device has completed at least one sync for
 * the signed-in account. A different browser has no matching device + state,
 * so it still has to pass through first-sign-in reconciliation.
 */
export function hasEstablishedSyncClient(
    storage: Pick<Storage, 'getItem'>,
    userId: string,
): boolean {
    const deviceId = storage.getItem(SYNC_DEVICE_KEY);
    if (!isDeviceId(deviceId)) return false;
    const raw = storage.getItem(syncStateKey(userId));
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw) as Partial<SyncClientState>;
        return parsed.version === SYNC_SCHEMA_VERSION
            && parsed.deviceId === deviceId
            && typeof parsed.lastSyncedAt === 'string'
            && parsed.lastSyncedAt.length > 0
            && Boolean(parsed.shadow && typeof parsed.shadow === 'object')
            && Array.isArray(parsed.outbox)
            && Array.isArray(parsed.conflictedKeys);
    } catch {
        return false;
    }
}

export function hasPreparedReconciliation(
    storage: Pick<Storage, 'getItem'>,
    userId: string,
): boolean {
    const deviceId = storage.getItem(SYNC_DEVICE_KEY);
    if (!isDeviceId(deviceId)) return false;
    const raw = storage.getItem(reconciliationStateKey(userId));
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw) as { deviceId?: unknown; choice?: unknown };
        return parsed.deviceId === deviceId
            && typeof parsed.choice === 'string'
            && ['start-empty', 'upload-local', 'download-account', 'merge-with-conflicts', 'keep-device-separate']
                .includes(parsed.choice);
    } catch {
        return false;
    }
}

export function persistPreparedReconciliation(
    storage: Pick<Storage, 'setItem'>,
    userId: string,
    deviceId: string,
    choice: FirstSignInDecision,
): void {
    storage.setItem(reconciliationStateKey(userId), JSON.stringify({ deviceId, choice }));
}

export const emptyClientState = (deviceId: string): SyncClientState => ({
    version: SYNC_SCHEMA_VERSION,
    deviceId,
    datasetRevision: 0,
    shadow: {},
    outbox: [],
    conflictedKeys: [],
    lastSyncedAt: null,
});

export function loadClientState(storage: Pick<Storage, 'getItem'>, userId: string, deviceId: string): SyncClientState {
    const raw = storage.getItem(syncStateKey(userId));
    if (!raw) return emptyClientState(deviceId);
    try {
        const parsed = JSON.parse(raw) as Partial<SyncClientState>;
        if (parsed.version !== SYNC_SCHEMA_VERSION
            || parsed.deviceId !== deviceId
            || !parsed.shadow || typeof parsed.shadow !== 'object'
            || !Array.isArray(parsed.outbox)
            || !Array.isArray(parsed.conflictedKeys)) return emptyClientState(deviceId);
        return parsed as SyncClientState;
    } catch {
        return emptyClientState(deviceId);
    }
}

export function persistClientState(storage: Pick<Storage, 'setItem'>, userId: string, state: SyncClientState): void {
    storage.setItem(syncStateKey(userId), JSON.stringify(state));
}

const pendingKeys = (state: SyncClientState): Set<string> => new Set(state.outbox.map(item => item.key));
const valuesEqual = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/** Appends at most one pending mutation per entity key. */
export function enqueueLocalChanges(
    state: SyncClientState,
    local: Record<string, LocalSyncRecord>,
    nowISO: string,
    id: () => string = newOpaqueId,
    includeDeletes = true,
): SyncClientState {
    const pending = pendingKeys(state);
    const conflicted = new Set(state.conflictedKeys);
    const outbox = [...state.outbox];
    const keys = new Set([...Object.keys(local), ...Object.keys(state.shadow)]);

    for (const key of [...keys].sort()) {
        if (pending.has(key) || conflicted.has(key)) continue;
        const current = local[key];
        const base = state.shadow[key];
        let mutation: SyncMutation | null = null;
        if (includeDeletes && !current && base && !base.tombstone) {
            mutation = {
                mutationId: id(), deviceId: state.deviceId, key, kind: base.kind,
                baseRevision: base.revision, operation: 'delete', clientTimestamp: nowISO,
            };
        } else if (current && (!base || base.tombstone)) {
            mutation = {
                mutationId: id(), deviceId: state.deviceId, key, kind: current.kind,
                baseRevision: base?.revision ?? 0, operation: 'patch', changes: current.payload, clientTimestamp: nowISO,
            };
        } else if (current && base) {
            const changes = changedFields(current.payload, base.payload);
            const removedFields = removedFieldNames(current.payload, base.payload);
            if (Object.keys(changes).length > 0 || removedFields.length > 0) {
                mutation = {
                    mutationId: id(), deviceId: state.deviceId, key, kind: current.kind,
                    baseRevision: base.revision, operation: 'patch', changes, removedFields, clientTimestamp: nowISO,
                };
            }
        }
        if (mutation) outbox.push(mutation);
    }
    return { ...state, outbox };
}

/** Queues only edits made after a sync cycle began, without mistaking fresh remote fields for local edits. */
export function enqueueLocalChangesSince(
    state: SyncClientState,
    latest: Record<string, LocalSyncRecord>,
    cycleStart: Record<string, LocalSyncRecord>,
    knownShadow: Record<string, SyncRecord>,
    nowISO: string,
    id: () => string = newOpaqueId,
): SyncClientState {
    const pending = pendingKeys(state);
    const conflicted = new Set(state.conflictedKeys);
    const outbox = [...state.outbox];
    const keys = new Set([...Object.keys(latest), ...Object.keys(cycleStart)]);

    for (const key of [...keys].sort()) {
        if (pending.has(key) || conflicted.has(key)) continue;
        const current = latest[key];
        const previous = cycleStart[key];
        const remote = state.shadow[key];
        const known = knownShadow[key];
        let mutation: SyncMutation | null = null;

        if (!current && previous) {
            mutation = {
                mutationId: id(), deviceId: state.deviceId, key, kind: previous.kind,
                baseRevision: known?.revision ?? remote?.revision ?? 0,
                operation: 'delete', clientTimestamp: nowISO,
            };
        } else if (current && !previous) {
            mutation = {
                mutationId: id(), deviceId: state.deviceId, key, kind: current.kind,
                baseRevision: remote?.revision ?? 0,
                operation: 'patch', changes: current.payload, clientTimestamp: nowISO,
            };
        } else if (current && previous) {
            const changes = changedFields(current.payload, previous.payload);
            const removedFields = removedFieldNames(current.payload, previous.payload);
            const touchedFields = [...Object.keys(changes), ...removedFields];
            if (touchedFields.length > 0) {
                const remoteChangedSameField = touchedFields.some(field =>
                    !valuesEqual(remote?.payload[field], previous.payload[field]));
                mutation = {
                    mutationId: id(), deviceId: state.deviceId, key, kind: current.kind,
                    baseRevision: remoteChangedSameField
                        ? known?.revision ?? 0
                        : remote?.revision ?? known?.revision ?? 0,
                    operation: 'patch', changes, removedFields, clientTimestamp: nowISO,
                };
            }
        }
        if (mutation) outbox.push(mutation);
    }
    return { ...state, outbox };
}

/** Remote canonical records replace the shadow; conflicted local keys stay locally visible. */
export function mergeRemoteForLocal(
    remote: Record<string, SyncRecord>,
    local: Record<string, LocalSyncRecord>,
    protectedKeys: string[],
    baseShadow?: Record<string, SyncRecord>,
): Record<string, SyncRecord> {
    const merged = { ...remote };
    for (const key of protectedKeys) {
        const entry = local[key];
        const remoteEntry = remote[key];
        const baseEntry = baseShadow?.[key];
        if (baseShadow && entry && baseEntry && !baseEntry.tombstone) {
            const payload = { ...(remoteEntry?.payload ?? baseEntry.payload) };
            for (const field of removedFieldNames(entry.payload, baseEntry.payload)) delete payload[field];
            Object.assign(payload, changedFields(entry.payload, baseEntry.payload));
            merged[key] = {
                ...entry,
                payload,
                revision: remoteEntry?.revision ?? baseEntry.revision,
                fieldRevisions: remoteEntry?.fieldRevisions ?? baseEntry.fieldRevisions,
                tombstone: false,
            };
            continue;
        }
        if (entry) {
            merged[key] = {
                ...entry,
                revision: remoteEntry?.revision ?? 0,
                fieldRevisions: remoteEntry?.fieldRevisions ?? {},
                tombstone: false,
            };
        } else if (remoteEntry) {
            delete merged[key];
        }
    }
    return merged;
}
