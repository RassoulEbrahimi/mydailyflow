/**
 * backupService.ts — orchestrates export and import against a StorageLike.
 *
 * The import path is deliberately step-by-step and abortable:
 *
 *   1. capture the exact raw value of every key the import will touch
 *   2. write and verify a timestamped recovery snapshot of those raw values
 *   3. compute the destination state and validate it in full
 *   4. write every destination key, verifying each by read-back
 *   5. on any failure, restore every affected key to its exact previous value
 *
 * Steps 1-3 write nothing but the recovery snapshot, and step 4 is all-or-
 * nothing, so there is no state in which half a backup has been applied.
 */

import type { AppDataSnapshot, BackupFileV1, BackupPreferences } from '../types/backup';
import { isTheme } from '../types/backup';
import type { DailyEssentialState } from '../types/essential';
import {
    MANAGED_KEYS,
    PRE_IMPORT_SOURCE,
    RECOVERY_PREFIX,
    STORAGE_KEYS,
    applyStorageTransaction,
    loadEssentialsSlice,
    loadEssentialsStateSlice,
    loadTasksSlice,
    safeGetItem,
    serializeEssentials,
    serializeEssentialsState,
    serializeTasks,
} from './appStorage';
import type { StorageLike, StorageWrite } from './appStorage';
import { backupFileName, buildBackup, serializeBackup, validateSnapshot } from './backupFormat';
import { applyBackup } from './backupMerge';
import type { ImportMode } from './backupMerge';

// ─── Reading what is currently stored ─────────────────────────────────────────

const readBoolean = (storage: StorageLike, key: string, fallback: boolean): boolean => {
    const raw = safeGetItem(storage, key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
};

export function readPreferences(storage: StorageLike): BackupPreferences {
    const theme = safeGetItem(storage, STORAGE_KEYS.theme);
    return {
        theme: isTheme(theme) ? theme : 'dark',
        remindersEnabled: readBoolean(storage, STORAGE_KEYS.remindersEnabled, false),
        stickyHeroEnabled: readBoolean(storage, STORAGE_KEYS.stickyHeroEnabled, true),
        essentialsCollapsed: readBoolean(storage, STORAGE_KEYS.essentialsCollapsed, false),
    };
}

const emptyState = (today: string): DailyEssentialState => ({ date: today, progressById: {} });

/**
 * Best-effort read of everything the app owns.
 *
 * A slice that fails validation reads as empty rather than throwing: its raw
 * value has already been quarantined by the loader, so it is recoverable from a
 * snapshot rather than from here.
 */
export function readSnapshot(storage: StorageLike, today: string, nowISO: string): AppDataSnapshot {
    const tasks = loadTasksSlice(storage, nowISO);
    const essentials = loadEssentialsSlice(storage, nowISO);
    const state = loadEssentialsStateSlice(storage, nowISO);

    const storedState = state.value;
    return {
        tasks: tasks.value ?? [],
        essentials: essentials.value ?? [],
        essentialsState: storedState && storedState.date === today ? storedState : emptyState(today),
        preferences: readPreferences(storage),
    };
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportResult =
    | { status: 'ok'; fileName: string; text: string; taskCount: number; essentialCount: number }
    | { status: 'invalid'; errors: string[] };

export function exportBackup(storage: StorageLike, today: string, nowISO: string): ExportResult {
    const snapshot = readSnapshot(storage, today, nowISO);

    const validation = validateSnapshot(snapshot);
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
    stage: 'snapshot' | 'validation' | 'write';
    errors: string[];
    /** True when every affected key was put back to its exact previous value. */
    rolledBack: boolean;
}

export type ImportResult = ImportSuccess | ImportFailure;

const timestampSlug = (iso: string): string => iso.replace(/[:.]/g, '-');

/**
 * Copies the raw value of every managed key into one snapshot entry, and
 * verifies it by read-back before the caller is allowed to continue.
 */
function writePreImportSnapshot(
    storage: StorageLike,
    nowISO: string,
): { status: 'ok'; key: string } | { status: 'failed'; error: string } {
    const raw: Record<string, string | null> = {};
    for (const key of MANAGED_KEYS) raw[key] = safeGetItem(storage, key);

    const payload = JSON.stringify({ capturedAt: nowISO, raw });
    const key = `${RECOVERY_PREFIX}${PRE_IMPORT_SOURCE}__${timestampSlug(nowISO)}`;

    try {
        storage.setItem(key, payload);
    } catch (e) {
        return { status: 'failed', error: `snapshot-write-failed: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (safeGetItem(storage, key) !== payload) {
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

/**
 * Applies a validated backup. Returns without touching the managed keys unless
 * every preceding step succeeded.
 */
export function importBackup(
    storage: StorageLike,
    backup: BackupFileV1,
    mode: ImportMode,
    today: string,
    nowISO: string,
): ImportResult {
    // 1 + 2 — preserve the current raw values before anything else happens.
    const snapshotResult = writePreImportSnapshot(storage, nowISO);
    if (snapshotResult.status === 'failed') {
        return { status: 'failed', stage: 'snapshot', errors: [snapshotResult.error], rolledBack: true };
    }

    // 3 — compute the destination and validate it in full before writing.
    const current = readSnapshot(storage, today, nowISO);
    const destination = applyBackup(current, backup, mode, today);
    const validation = validateSnapshot(destination);
    if (validation.status === 'invalid') {
        return { status: 'failed', stage: 'validation', errors: validation.errors, rolledBack: true };
    }

    // 4 + 5 — write everything, verify everything, roll back on any failure.
    const transaction = applyStorageTransaction(storage, snapshotToWrites(validation.value));
    if (transaction.status === 'failed') {
        return {
            status: 'failed',
            stage: 'write',
            errors: [`${transaction.error} (${transaction.failedKey})`],
            rolledBack: transaction.restored,
        };
    }

    return {
        status: 'ok',
        recoveryKey: snapshotResult.key,
        taskCount: destination.tasks.length,
        essentialCount: destination.essentials.length,
    };
}
