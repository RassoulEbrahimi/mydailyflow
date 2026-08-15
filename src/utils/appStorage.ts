/**
 * appStorage.ts — the single source of truth for every localStorage key the app
 * owns, plus the defensive read/write primitives used around them.
 *
 * Two rules this module exists to enforce:
 *
 * 1. A value that fails parsing or validation is NEVER deleted outright. It is
 *    first copied to a timestamped recovery key; the original is removed only
 *    after that copy has been read back and verified. If the copy fails, the
 *    original stays exactly where it is.
 * 2. Writing several keys at once is all-or-nothing. Every write is verified by
 *    read-back, and any failure restores every affected key to its exact
 *    previous raw value.
 *
 * Everything here takes a StorageLike, so it runs unchanged in the browser and
 * against an in-memory fake in tests.
 */

import type { Task, StorageWrapper } from '../types/task';
import { isStorageWrapper, isValidTaskArray } from '../types/task';
import type {
    DailyEssential,
    DailyEssentialState,
    EssentialsDataWrapper,
    EssentialsStateWrapper,
} from '../types/essential';
import {
    isEssentialsDataWrapper,
    isEssentialsStateWrapper,
    isValidEssentialArray,
} from '../types/essential';

// ─── Keys ─────────────────────────────────────────────────────────────────────

/**
 * Every key the app owns and that Backup & Restore may touch.
 *
 * The auth/session key (`mdf_auth_session`, see utils/fakeAuth.ts) is
 * deliberately absent so that no backup, snapshot or transaction in this module
 * can read or write it. `lastRolloverDate` is also absent: it is derived,
 * write-only dead state and carries no user data worth restoring.
 */
export const STORAGE_KEYS = {
    tasks: 'myDailyFlowTasks',
    essentialsData: 'myDailyFlowEssentialsData',
    essentialsState: 'myDailyFlowEssentialsState',
    theme: 'myDailyFlow_theme',
    remindersEnabled: 'remindersEnabled',
    stickyHeroEnabled: 'stickyHeroEnabled',
    essentialsCollapsed: 'myDailyFlow_essentialsCollapsed',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** All keys an import writes, in a stable order. */
export const MANAGED_KEYS: StorageKey[] = [
    STORAGE_KEYS.tasks,
    STORAGE_KEYS.essentialsData,
    STORAGE_KEYS.essentialsState,
    STORAGE_KEYS.theme,
    STORAGE_KEYS.remindersEnabled,
    STORAGE_KEYS.stickyHeroEnabled,
    STORAGE_KEYS.essentialsCollapsed,
];

export const RECOVERY_PREFIX = 'myDailyFlow_recovery__';

/** Source label used for the snapshot taken right before an import. */
export const PRE_IMPORT_SOURCE = 'preimport';

// ─── Storage abstraction ──────────────────────────────────────────────────────

export interface StorageLike {
    readonly length: number;
    key(index: number): string | null;
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

const errorMessage = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

/**
 * A read that failed and a key that is genuinely absent are different facts, and
 * every safety-critical path has to tell them apart: treating a thrown read as
 * `null` would let a capture record "nothing was here" and let a verification
 * pass for a removal that never happened.
 */
export type ReadResult =
    | { status: 'read'; value: string | null }
    | { status: 'error'; error: string };

export function readRaw(storage: StorageLike, key: string): ReadResult {
    try {
        return { status: 'read', value: storage.getItem(key) };
    } catch (e) {
        return { status: 'error', error: errorMessage(e) };
    }
}

/**
 * Best-effort read that flattens a thrown read into `null`.
 *
 * Only for paths where "unreadable" and "absent" lead to the same harmless
 * outcome — listing snapshots, rendering UI. Never use it to capture a rollback
 * baseline, to verify a write, or to decide whether data may be deleted.
 */
export const safeGetItem = (storage: StorageLike, key: string): string | null => {
    const read = readRaw(storage, key);
    return read.status === 'read' ? read.value : null;
};

// ─── Quarantine ───────────────────────────────────────────────────────────────

// Note: result unions use a string discriminant rather than an `ok: boolean`.
// This project compiles without strictNullChecks, where boolean literal types
// widen to `boolean` and stop narrowing the union.
export type QuarantineResult =
    | { status: 'ok'; recoveryKey: string }
    | { status: 'failed'; reason: string };

/** ISO timestamps contain ':' — harmless in a key, but awkward in file names. */
const timestampSlug = (iso: string): string => iso.replace(/[:.]/g, '-');

/** True only when the key is provably free; an unreadable slot counts as taken. */
const isKeyFree = (storage: StorageLike, key: string): boolean => {
    const read = readRaw(storage, key);
    return read.status === 'read' && read.value === null;
};

/**
 * Picks a recovery key that is not already in use, so two snapshots taken in the
 * same millisecond cannot overwrite one another.
 */
export const uniqueRecoveryKey = (storage: StorageLike, sourceKey: string, nowISO: string): string => {
    const base = `${RECOVERY_PREFIX}${sourceKey}__${timestampSlug(nowISO)}`;
    if (isKeyFree(storage, base)) return base;
    for (let i = 2; i < 100; i++) {
        const candidate = `${base}__${i}`;
        if (isKeyFree(storage, candidate)) return candidate;
    }
    return `${base}__${Math.random().toString(36).slice(2, 8)}`;
};

/**
 * Copies the raw value of `sourceKey` to a timestamped recovery key and removes
 * the original ONLY once the copy has been verified by read-back.
 *
 * On any failure the original is left untouched — the caller is expected to keep
 * blocking writes to that slice so the surviving copy is not overwritten later.
 */
export function quarantineRawValue(
    storage: StorageLike,
    sourceKey: string,
    nowISO: string,
): QuarantineResult {
    const source = readRaw(storage, sourceKey);
    if (source.status === 'error') {
        return { status: 'failed', reason: `source-read-failed: ${source.error}` };
    }
    const raw = source.value;
    if (raw === null) return { status: 'failed', reason: 'nothing-to-quarantine' };

    const recoveryKey = uniqueRecoveryKey(storage, sourceKey, nowISO);

    try {
        storage.setItem(recoveryKey, raw);
    } catch (e) {
        return { status: 'failed', reason: `snapshot-write-failed: ${errorMessage(e)}` };
    }

    const verify = readRaw(storage, recoveryKey);
    if (verify.status === 'error' || verify.value !== raw) {
        // The snapshot is not trustworthy: drop it and keep the original.
        try {
            storage.removeItem(recoveryKey);
        } catch {
            /* best effort */
        }
        return { status: 'failed', reason: 'snapshot-verification-failed' };
    }

    try {
        storage.removeItem(sourceKey);
    } catch (e) {
        // Snapshot exists, original could not be cleared. Data is safe either
        // way; the slice stays blocked so nothing overwrites the original.
        return { status: 'failed', reason: `original-removal-failed: ${errorMessage(e)}` };
    }

    return { status: 'ok', recoveryKey };
}

export interface RecoverySnapshotInfo {
    key: string;
    sourceKey: string;
    capturedAt: string;
    size: number;
}

/** Lists recovery snapshots, newest first. Never restores or deletes anything. */
export function listRecoverySnapshots(storage: StorageLike): RecoverySnapshotInfo[] {
    const found: RecoverySnapshotInfo[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key || !key.startsWith(RECOVERY_PREFIX)) continue;
        const rest = key.slice(RECOVERY_PREFIX.length);
        const separator = rest.indexOf('__');
        if (separator === -1) continue;
        found.push({
            key,
            sourceKey: rest.slice(0, separator),
            capturedAt: rest.slice(separator + 2),
            size: (safeGetItem(storage, key) ?? '').length,
        });
    }
    return found.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

// ─── All-or-nothing multi-key writes ──────────────────────────────────────────

/** A single key write. `value: null` means "remove this key". */
export interface StorageWrite {
    key: string;
    value: string | null;
}

export type TransactionResult =
    | { status: 'ok' }
    | { status: 'failed'; error: string; failedKey: string; restored: boolean };

const writeOne = (storage: StorageLike, entry: StorageWrite): void => {
    if (entry.value === null) storage.removeItem(entry.key);
    else storage.setItem(entry.key, entry.value);
};

/**
 * Confirms a write landed. A read that throws is a failure, never a pass —
 * including for a removal, whose expected value is `null`.
 */
const verifyWrite = (storage: StorageLike, entry: StorageWrite): boolean => {
    const read = readRaw(storage, entry.key);
    return read.status === 'read' && read.value === entry.value;
};

/**
 * Applies every write, verifying each by read-back. If any write throws or fails
 * verification, every key touched by this transaction is restored to the exact
 * raw value recorded in the baseline.
 *
 * @param baseline The exact pre-transaction raw values to roll back to. Pass one
 *   when it was captured earlier (an import captures before writing its recovery
 *   snapshot, so the baseline must predate anything that happened since).
 *   Omitted, the baseline is captured here — and a read error while capturing
 *   aborts before the first write rather than recording a false `null`.
 */
export function applyStorageTransaction(
    storage: StorageLike,
    writes: StorageWrite[],
    baseline?: StorageWrite[],
): TransactionResult {
    const previous: StorageWrite[] = [];

    if (baseline) {
        previous.push(...baseline);
    } else {
        for (const write of writes) {
            const read = readRaw(storage, write.key);
            if (read.status === 'error') {
                // Nothing has been written yet, so the store is untouched.
                return {
                    status: 'failed',
                    error: `capture-read-failed: ${read.error}`,
                    failedKey: write.key,
                    restored: true,
                };
            }
            previous.push({ key: write.key, value: read.value });
        }
    }

    const rollback = (): boolean => {
        let allRestored = true;
        for (const entry of previous) {
            // Keys the failure never reached already hold their previous value;
            // rewriting them would risk failing on a key that needs no repair.
            // An unreadable key is never assumed to be fine — it gets rewritten
            // and re-verified like any other.
            const current = readRaw(storage, entry.key);
            if (current.status === 'read' && current.value === entry.value) continue;
            try {
                writeOne(storage, entry);
            } catch {
                allRestored = false;
                continue;
            }
            if (!verifyWrite(storage, entry)) allRestored = false;
        }
        return allRestored;
    };

    for (const entry of writes) {
        try {
            writeOne(storage, entry);
        } catch (e) {
            return {
                status: 'failed',
                error: `write-failed: ${errorMessage(e)}`,
                failedKey: entry.key,
                restored: rollback(),
            };
        }
        if (!verifyWrite(storage, entry)) {
            return {
                status: 'failed',
                error: 'verification-failed',
                failedKey: entry.key,
                restored: rollback(),
            };
        }
    }

    return { status: 'ok' };
}

// ─── Slice parsing (pure) ─────────────────────────────────────────────────────
//
// Parsing is separated from loading so that read-only callers — export, and the
// import's computation over already-captured raw values — can interpret stored
// data without any chance of writing, removing or quarantining it.

export type SliceParseStatus = 'empty' | 'ok' | 'migrated' | 'invalid';

export interface SliceParseResult<T> {
    status: SliceParseStatus;
    value: T | null;
    detail?: string;
}

export function parseTasksRaw(raw: string | null): SliceParseResult<Task[]> {
    if (raw === null) return { status: 'empty', value: null };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { status: 'invalid', value: null, detail: `unparseable JSON: ${errorMessage(e)}` };
    }

    if (isStorageWrapper(parsed)) return { status: 'ok', value: parsed.data };
    // Legacy migration path: a bare, fully valid task array.
    if (isValidTaskArray(parsed)) return { status: 'migrated', value: parsed };

    return { status: 'invalid', value: null, detail: 'invalid task data format' };
}

export function parseEssentialsRaw(raw: string | null): SliceParseResult<DailyEssential[]> {
    if (raw === null) return { status: 'empty', value: null };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { status: 'invalid', value: null, detail: `unparseable JSON: ${errorMessage(e)}` };
    }

    if (isEssentialsDataWrapper(parsed)) return { status: 'ok', value: parsed.data };
    if (isValidEssentialArray(parsed)) return { status: 'migrated', value: parsed };

    return { status: 'invalid', value: null, detail: 'invalid essentials data format' };
}

export function parseEssentialsStateRaw(raw: string | null): SliceParseResult<DailyEssentialState> {
    if (raw === null) return { status: 'empty', value: null };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { status: 'invalid', value: null, detail: `unparseable JSON: ${errorMessage(e)}` };
    }

    if (isEssentialsStateWrapper(parsed)) return { status: 'ok', value: parsed.data };

    return { status: 'invalid', value: null, detail: 'invalid essentials state format' };
}

// ─── Slice loading (may quarantine) ───────────────────────────────────────────

/**
 * - `empty`             — nothing stored yet (fresh install)
 * - `ok`                — parsed and validated
 * - `migrated`          — valid legacy shape, will be rewritten as a wrapper
 * - `quarantined`       — invalid; raw value safely copied aside and removed
 * - `quarantine-failed` — invalid; raw value could not be copied, left in place
 * - `unreadable`        — the key could not even be read
 *
 * The last three all block persistence for that slice. They are reported
 * separately so the UI can tell the user which copy still exists.
 */
export type SliceStatus = 'empty' | 'ok' | 'migrated' | 'quarantined' | 'quarantine-failed' | 'unreadable';

export interface SliceLoadResult<T> {
    status: SliceStatus;
    /** Parsed value, or null when nothing usable was stored. */
    value: T | null;
    /** True when writes to this slice must be suppressed. */
    blocked: boolean;
    recoveryKey?: string;
    detail?: string;
}

const quarantineSlice = <T>(
    storage: StorageLike,
    key: string,
    nowISO: string,
    detail: string,
): SliceLoadResult<T> => {
    const result = quarantineRawValue(storage, key, nowISO);
    if (result.status === 'ok') {
        return { status: 'quarantined', value: null, blocked: true, recoveryKey: result.recoveryKey, detail };
    }
    return { status: 'quarantine-failed', value: null, blocked: true, detail: `${detail} (${result.reason})` };
};

/** Shared load pipeline: read → parse → quarantine only when invalid. */
function loadSlice<T>(
    storage: StorageLike,
    key: string,
    nowISO: string,
    parse: (raw: string | null) => SliceParseResult<T>,
): SliceLoadResult<T> {
    const read = readRaw(storage, key);
    if (read.status === 'error') {
        // Unreadable is not empty: writing here could destroy what we failed to
        // read, so the slice is blocked without touching storage.
        return { status: 'unreadable', value: null, blocked: true, detail: `read failed: ${read.error}` };
    }

    const parsed = parse(read.value);
    if (parsed.status === 'invalid') {
        return quarantineSlice(storage, key, nowISO, parsed.detail);
    }
    return { status: parsed.status, value: parsed.value, blocked: false };
}

export const loadTasksSlice = (storage: StorageLike, nowISO: string): SliceLoadResult<Task[]> =>
    loadSlice(storage, STORAGE_KEYS.tasks, nowISO, parseTasksRaw);

export const loadEssentialsSlice = (storage: StorageLike, nowISO: string): SliceLoadResult<DailyEssential[]> =>
    loadSlice(storage, STORAGE_KEYS.essentialsData, nowISO, parseEssentialsRaw);

export const loadEssentialsStateSlice = (storage: StorageLike, nowISO: string): SliceLoadResult<DailyEssentialState> =>
    loadSlice(storage, STORAGE_KEYS.essentialsState, nowISO, parseEssentialsStateRaw);

// ─── Wrapper helpers ──────────────────────────────────────────────────────────

export const serializeTasks = (tasks: Task[]): string =>
    JSON.stringify({ version: 1, data: tasks } satisfies StorageWrapper);

export const serializeEssentials = (essentials: DailyEssential[]): string =>
    JSON.stringify({ version: 1, data: essentials } satisfies EssentialsDataWrapper);

export const serializeEssentialsState = (state: DailyEssentialState): string =>
    JSON.stringify({ version: 1, data: state } satisfies EssentialsStateWrapper);
