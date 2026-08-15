/**
 * backupService.ts — orchestrates export and import against a StorageLike.
 *
 * Export is strictly read-only: it reads raw values and parses them purely, so a
 * corrupted slice makes the export fail rather than quietly producing a file
 * with that slice missing — and no key is written, removed or quarantined.
 *
 * The import path is step-by-step and abortable:
 *
 *   1. capture the exact raw value of every managed key (a read error aborts)
 *   2. write and verify a timestamped, collision-safe recovery snapshot
 *   3. compute the destination *from the captured raw values*, never by
 *      re-reading storage, and validate it in full
 *   4. write every destination key, verifying each by read-back
 *   5. on any failure, restore every key to the captured value and confirm the
 *      restore before claiming it succeeded
 *
 * Nothing between steps 1 and 4 mutates a managed key, so the rollback baseline
 * is always the true pre-import state.
 */

import type { AppDataSnapshot, BackupFileV1, BackupPreferences } from '../types/backup';
import { isTheme } from '../types/backup';
import type { DailyEssentialState } from '../types/essential';
import {
    MANAGED_KEYS,
    PRE_IMPORT_SOURCE,
    STORAGE_KEYS,
    applyStorageTransaction,
    parseEssentialsRaw,
    parseEssentialsStateRaw,
    parseTasksRaw,
    readRaw,
    serializeEssentials,
    serializeEssentialsState,
    serializeTasks,
    uniqueRecoveryKey,
} from './appStorage';
import type { StorageLike, StorageWrite } from './appStorage';
import { backupFileName, buildBackup, serializeBackup, validateSnapshot } from './backupFormat';
import { applyBackup } from './backupMerge';
import type { ImportMode } from './backupMerge';

// ─── Raw capture ──────────────────────────────────────────────────────────────

/** A lookup over captured raw values — no storage access. */
type RawLookup = (key: string) => string | null;

const lookupOf = (captured: StorageWrite[]): RawLookup => {
    const map = new Map(captured.map(entry => [entry.key, entry.value]));
    return key => (map.has(key) ? map.get(key) : null);
};

export type CaptureResult =
    | { status: 'ok'; captured: StorageWrite[] }
    | { status: 'failed'; error: string };

/**
 * Reads the exact raw value of every managed key. A read that throws aborts the
 * whole capture: recording it as `null` would make a later rollback erase the
 * very value it was meant to protect.
 */
export function captureManagedKeys(storage: StorageLike): CaptureResult {
    const captured: StorageWrite[] = [];
    for (const key of MANAGED_KEYS) {
        const read = readRaw(storage, key);
        if (read.status === 'error') {
            return { status: 'failed', error: `capture-read-failed: ${key}: ${read.error}` };
        }
        captured.push({ key, value: read.value });
    }
    return { status: 'ok', captured };
}

/** Confirms every managed key currently equals the captured raw value. */
export function matchesCapture(storage: StorageLike, captured: StorageWrite[]): boolean {
    for (const entry of captured) {
        const read = readRaw(storage, entry.key);
        if (read.status === 'error' || read.value !== entry.value) return false;
    }
    return true;
}

// ─── Preferences ──────────────────────────────────────────────────────────────

const readBooleanRaw = (raw: string | null, fallback: boolean): boolean => {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
};

/**
 * Preferences are independent scalars with safe defaults, so an unrecognised
 * value falls back rather than failing the whole export. Their *keys* are still
 * captured and restored byte-for-byte like every other managed key.
 */
export function preferencesFromRaw(raw: RawLookup): BackupPreferences {
    const theme = raw(STORAGE_KEYS.theme);
    return {
        theme: isTheme(theme) ? theme : 'dark',
        remindersEnabled: readBooleanRaw(raw(STORAGE_KEYS.remindersEnabled), false),
        stickyHeroEnabled: readBooleanRaw(raw(STORAGE_KEYS.stickyHeroEnabled), true),
        essentialsCollapsed: readBooleanRaw(raw(STORAGE_KEYS.essentialsCollapsed), false),
    };
}

const emptyState = (today: string): DailyEssentialState => ({ date: today, progressById: {} });

// ─── Read-only snapshot ───────────────────────────────────────────────────────

export type SnapshotReadResult =
    | { status: 'ok'; snapshot: AppDataSnapshot }
    | { status: 'invalid'; errors: string[] };

/**
 * Interprets already-captured raw values. Invalid slices are reported rather
 * than silently treated as empty.
 */
export function snapshotFromRaw(raw: RawLookup, today: string): SnapshotReadResult {
    const tasks = parseTasksRaw(raw(STORAGE_KEYS.tasks));
    const essentials = parseEssentialsRaw(raw(STORAGE_KEYS.essentialsData));
    const state = parseEssentialsStateRaw(raw(STORAGE_KEYS.essentialsState));

    const errors: string[] = [];
    if (tasks.status === 'invalid') errors.push(`invalid-tasks: ${tasks.detail}`);
    if (essentials.status === 'invalid') errors.push(`invalid-essentials: ${essentials.detail}`);
    if (state.status === 'invalid') errors.push(`invalid-essentials-state: ${state.detail}`);
    if (errors.length > 0) return { status: 'invalid', errors };

    return {
        status: 'ok',
        snapshot: {
            tasks: tasks.value ?? [],
            essentials: essentials.value ?? [],
            // Yesterday's progress is never presented as today's.
            essentialsState: state.value && state.value.date === today ? state.value : emptyState(today),
            preferences: preferencesFromRaw(raw),
        },
    };
}

/**
 * Same interpretation, tolerant of invalid slices: they read as empty. Used only
 * where the caller has already preserved the raw values and is about to
 * overwrite them anyway (the import path).
 */
function lenientSnapshotFromRaw(raw: RawLookup, today: string): AppDataSnapshot {
    const tasks = parseTasksRaw(raw(STORAGE_KEYS.tasks));
    const essentials = parseEssentialsRaw(raw(STORAGE_KEYS.essentialsData));
    const state = parseEssentialsStateRaw(raw(STORAGE_KEYS.essentialsState));

    return {
        tasks: tasks.value ?? [],
        essentials: essentials.value ?? [],
        essentialsState: state.value && state.value.date === today ? state.value : emptyState(today),
        preferences: preferencesFromRaw(raw),
    };
}

/** Strictly read-only view of what is stored. Never writes or quarantines. */
export function readSnapshotStrict(storage: StorageLike, today: string): SnapshotReadResult {
    const capture = captureManagedKeys(storage);
    if (capture.status === 'failed') return { status: 'invalid', errors: [capture.error] };
    return snapshotFromRaw(lookupOf(capture.captured), today);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportResult =
    | { status: 'ok'; fileName: string; text: string; taskCount: number; essentialCount: number }
    | { status: 'invalid'; errors: string[] };

/**
 * Builds a backup from what is stored. Read-only: on invalid data it returns
 * `invalid` and every storage key is left byte-for-byte unchanged.
 */
export function exportBackup(storage: StorageLike, today: string, nowISO: string): ExportResult {
    const read = readSnapshotStrict(storage, today);
    if (read.status === 'invalid') return { status: 'invalid', errors: read.errors };

    const validation = validateSnapshot(read.snapshot);
    if (validation.status === 'invalid') return { status: 'invalid', errors: validation.errors };

    const backup = buildBackup(validation.value, nowISO);
    return {
        status: 'ok',
        fileName: backupFileName(nowISO),
        text: serializeBackup(backup),
        taskCount: backup.tasks.length,
        essentialCount: backup.essentials.length,
    };
}

// ─── Import ───────────────────────────────────────────────────────────────────

export interface ImportSuccess {
    status: 'ok';
    recoveryKey: string;
    taskCount: number;
    essentialCount: number;
}

export interface ImportFailure {
    status: 'failed';
    stage: 'capture' | 'snapshot' | 'validation' | 'write';
    errors: string[];
    /** True only when every managed key provably matches the pre-import capture. */
    rolledBack: boolean;
}

export type ImportResult = ImportSuccess | ImportFailure;

/**
 * Stores one snapshot entry holding the raw value of every managed key, under a
 * key that cannot collide with an existing snapshot, and verifies it by
 * read-back before the caller may continue.
 */
function writePreImportSnapshot(
    storage: StorageLike,
    captured: StorageWrite[],
    nowISO: string,
): { status: 'ok'; key: string } | { status: 'failed'; error: string } {
    const raw: Record<string, string | null> = {};
    for (const entry of captured) raw[entry.key] = entry.value;

    const payload = JSON.stringify({ capturedAt: nowISO, raw });
    const key = uniqueRecoveryKey(storage, PRE_IMPORT_SOURCE, nowISO);

    try {
        storage.setItem(key, payload);
    } catch (e) {
        return { status: 'failed', error: `snapshot-write-failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    const verify = readRaw(storage, key);
    if (verify.status === 'error' || verify.value !== payload) {
        try {
            storage.removeItem(key);
        } catch {
            /* best effort */
        }
        return { status: 'failed', error: 'snapshot-verification-failed' };
    }
    return { status: 'ok', key };
}

/** Turns a destination snapshot into the exact set of key writes it implies. */
export function snapshotToWrites(snapshot: AppDataSnapshot): StorageWrite[] {
    return [
        { key: STORAGE_KEYS.tasks, value: serializeTasks(snapshot.tasks) },
        { key: STORAGE_KEYS.essentialsData, value: serializeEssentials(snapshot.essentials) },
        { key: STORAGE_KEYS.essentialsState, value: serializeEssentialsState(snapshot.essentialsState) },
        { key: STORAGE_KEYS.theme, value: snapshot.preferences.theme },
        { key: STORAGE_KEYS.remindersEnabled, value: String(snapshot.preferences.remindersEnabled) },
        { key: STORAGE_KEYS.stickyHeroEnabled, value: String(snapshot.preferences.stickyHeroEnabled) },
        { key: STORAGE_KEYS.essentialsCollapsed, value: String(snapshot.preferences.essentialsCollapsed) },
    ];
}

export function importBackup(
    storage: StorageLike,
    backup: BackupFileV1,
    mode: ImportMode,
    today: string,
    nowISO: string,
): ImportResult {
    // 1 — capture the true pre-import state before anything else happens.
    const capture = captureManagedKeys(storage);
    if (capture.status === 'failed') {
        return { status: 'failed', stage: 'capture', errors: [capture.error], rolledBack: true };
    }
    const { captured } = capture;

    // 2 — preserve it, verified, before any managed key is touched.
    const snapshotResult = writePreImportSnapshot(storage, captured, nowISO);
    if (snapshotResult.status === 'failed') {
        return { status: 'failed', stage: 'snapshot', errors: [snapshotResult.error], rolledBack: true };
    }

    // 3 — compute from the capture, not from storage: no re-read, no quarantine,
    // so `captured` stays the true rollback baseline.
    const current = lenientSnapshotFromRaw(lookupOf(captured), today);
    const destination = applyBackup(current, backup, mode, today);
    const validation = validateSnapshot(destination);
    if (validation.status === 'invalid') {
        return { status: 'failed', stage: 'validation', errors: validation.errors, rolledBack: true };
    }

    // 4 + 5 — write everything against that baseline, then confirm the rollback.
    const transaction = applyStorageTransaction(storage, snapshotToWrites(validation.value), captured);
    if (transaction.status === 'failed') {
        return {
            status: 'failed',
            stage: 'write',
            errors: [`${transaction.error} (${transaction.failedKey})`],
            rolledBack: transaction.restored && matchesCapture(storage, captured),
        };
    }

    return {
        status: 'ok',
        recoveryKey: snapshotResult.key,
        taskCount: destination.tasks.length,
        essentialCount: destination.essentials.length,
    };
}
