/**
 * storageHealth.ts — a tiny observable registry of storage slices whose writes
 * are currently suppressed because their stored value could not be read.
 *
 * The hooks own their own blocking decision (taken synchronously at load time,
 * so there is never a window in which a corrupted slice is persisted over). This
 * registry exists so Settings can *show* the problem and offer the one explicit
 * user action that resolves it.
 */

export type StorageSlice = 'tasks' | 'essentials' | 'essentialsState' | 'essentialHistory' | 'focusState';

export interface BlockedSlice {
    slice: StorageSlice;
    /**
     * - 'quarantined'       — a verified recovery copy exists
     * - 'quarantine-failed' — invalid, and the original is still in place
     * - 'unreadable'        — the key could not be read at all
     */
    reason: 'quarantined' | 'quarantine-failed' | 'unreadable';
    recoveryKey?: string;
    detail?: string;
}

/** Maps a slice load status onto the reason shown to the user. */
export const blockReasonFor = (status: string): BlockedSlice['reason'] => {
    if (status === 'quarantined') return 'quarantined';
    if (status === 'unreadable') return 'unreadable';
    return 'quarantine-failed';
};

let blocked: readonly BlockedSlice[] = [];
const listeners = new Set<() => void>();

const emit = () => {
    for (const listener of listeners) listener();
};

/** Stable identity between mutations — safe as a useSyncExternalStore snapshot. */
export const getBlockedSlices = (): readonly BlockedSlice[] => blocked;

export const isSliceBlocked = (slice: StorageSlice): boolean =>
    blocked.some(entry => entry.slice === slice);

export function subscribeStorageHealth(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function registerBlockedSlice(entry: BlockedSlice): void {
    if (blocked.some(existing => existing.slice === entry.slice)) return;
    blocked = [...blocked, entry];
    emit();
}

/**
 * Explicit user action ("continue without the unreadable copy") or a successful
 * import. Does not touch storage — it only lifts the write suppression.
 */
export function resolveBlockedSlice(slice: StorageSlice): void {
    if (!blocked.some(entry => entry.slice === slice)) return;
    blocked = blocked.filter(entry => entry.slice !== slice);
    emit();
}

/** Test helper: forget all registrations. */
export function resetStorageHealth(): void {
    blocked = [];
    emit();
}
