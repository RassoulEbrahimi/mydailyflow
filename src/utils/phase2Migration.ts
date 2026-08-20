import type { DailyEssential, DailyEssentialState, EssentialHistoryDay } from '../types/essential';
import {
    MANAGED_KEYS,
    STORAGE_KEYS,
    applyStorageTransaction,
    parseEssentialHistoryRaw,
    parseEssentialsRaw,
    parseEssentialsStateRaw,
    parseTasksRaw,
    readRaw,
    serializeEssentialHistory,
    serializeEssentialsState,
    serializeTasks,
    uniqueRecoveryKey,
} from './appStorage';
import type { StorageLike, StorageWrite } from './appStorage';

export const SCHEMA_V2_RECOVERY_SOURCE = 'schema-v2';

export type Phase2MigrationResult =
    | { status: 'ok'; migrated: boolean; recoveryKey?: string }
    | { status: 'failed'; error: string; rolledBack: boolean };

export function buildEssentialHistorySnapshot(
    essentials: DailyEssential[],
    state: DailyEssentialState,
): EssentialHistoryDay {
    const progress = { ...state.progressById };
    const entries = [...essentials]
        .sort((a, b) => a.order - b.order)
        .map(essential => {
            const completedCount = progress[essential.id] ?? 0;
            delete progress[essential.id];
            return {
                essentialId: essential.id,
                title: essential.title,
                targetCount: essential.targetCount,
                completedCount,
            };
        });

    for (const essentialId of Object.keys(progress).sort()) {
        entries.push({
            essentialId,
            title: null,
            targetCount: null,
            completedCount: progress[essentialId],
        });
    }

    return {
        date: state.date,
        recordedAt: null,
        source: 'legacy-snapshot',
        entries,
    };
}

export function closeEssentialHistoryDay(
    history: EssentialHistoryDay[],
    essentials: DailyEssential[],
    state: DailyEssentialState,
    recordedAt: string,
): EssentialHistoryDay[] {
    const closed: EssentialHistoryDay = {
        ...buildEssentialHistorySnapshot(essentials, state),
        recordedAt,
        source: 'daily-close',
    };
    return [...history.filter(day => day.date !== state.date), closed]
        .sort((a, b) => a.date.localeCompare(b.date));
}

const capture = (storage: StorageLike): StorageWrite[] | string => {
    const captured: StorageWrite[] = [];
    for (const key of MANAGED_KEYS) {
        const read = readRaw(storage, key);
        if (read.status === 'error') return `capture-read-failed: ${key}: ${read.error}`;
        captured.push({ key, value: read.value });
    }
    return captured;
};

const writeRecoverySnapshot = (
    storage: StorageLike,
    captured: StorageWrite[],
    nowISO: string,
): { status: 'ok'; key: string } | { status: 'failed'; error: string } => {
    const raw: Record<string, string | null> = {};
    for (const entry of captured) raw[entry.key] = entry.value;
    const payload = JSON.stringify({ capturedAt: nowISO, source: SCHEMA_V2_RECOVERY_SOURCE, raw });
    const key = uniqueRecoveryKey(storage, SCHEMA_V2_RECOVERY_SOURCE, nowISO);
    try {
        storage.setItem(key, payload);
    } catch (error) {
        return { status: 'failed', error: `snapshot-write-failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    const verify = readRaw(storage, key);
    if (verify.status === 'error' || verify.value !== payload) {
        try { storage.removeItem(key); } catch { /* best effort */ }
        return { status: 'failed', error: 'snapshot-verification-failed' };
    }
    return { status: 'ok', key };
};

/**
 * Upgrades the coordinated local data set before React hooks read it.
 * Every managed key is captured byte-for-byte, a verified recovery snapshot is
 * written, and the v2 writes are committed as one read-back-verified transaction.
 */
export function migrateStorageToV2(storage: StorageLike, nowISO: string): Phase2MigrationResult {
    const capturedResult = capture(storage);
    if (typeof capturedResult === 'string') {
        return { status: 'failed', error: capturedResult, rolledBack: true };
    }
    const captured = capturedResult;
    const values = new Map(captured.map(entry => [entry.key, entry.value]));
    const tasks = parseTasksRaw(values.get(STORAGE_KEYS.tasks) ?? null);
    const essentials = parseEssentialsRaw(values.get(STORAGE_KEYS.essentialsData) ?? null);
    const state = parseEssentialsStateRaw(values.get(STORAGE_KEYS.essentialsState) ?? null);
    const history = parseEssentialHistoryRaw(values.get(STORAGE_KEYS.essentialHistory) ?? null);

    if (tasks.status === 'invalid') return { status: 'failed', error: `invalid-tasks: ${tasks.detail}`, rolledBack: true };
    if (essentials.status === 'invalid') return { status: 'failed', error: `invalid-essentials: ${essentials.detail}`, rolledBack: true };
    if (state.status === 'invalid') return { status: 'failed', error: `invalid-essentialsState: ${state.detail}`, rolledBack: true };
    if (history.status === 'invalid') return { status: 'failed', error: `invalid-essentialHistory: ${history.detail}`, rolledBack: true };

    const now = new Date(nowISO);
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const writes: StorageWrite[] = [];
    if (tasks.status === 'migrated') {
        writes.push({ key: STORAGE_KEYS.tasks, value: serializeTasks(tasks.value ?? []) });
    }
    let nextHistory = history.value ?? [];
    if (history.status === 'empty') {
        nextHistory = state.value
            ? [buildEssentialHistorySnapshot(essentials.value ?? [], state.value)]
            : [];
        // A genuinely fresh installation has nothing to migrate and should not
        // receive a meaningless recovery point containing only null values.
        // Once any legacy data slice exists, history becomes part of the same
        // atomic migration boundary (even when its initial value is empty).
        const hasLegacyData = values.get(STORAGE_KEYS.tasks) !== null
            || values.get(STORAGE_KEYS.essentialsData) !== null
            || values.get(STORAGE_KEYS.essentialsState) !== null;
        if (hasLegacyData) {
            writes.push({ key: STORAGE_KEYS.essentialHistory, value: serializeEssentialHistory(nextHistory) });
        }
    } else if (history.status === 'migrated') {
        writes.push({ key: STORAGE_KEYS.essentialHistory, value: serializeEssentialHistory(nextHistory) });
    }

    if (state.value && state.value.date !== today) {
        // On later launches this is a real day close. During the first v1→v2
        // migration the legacy snapshot above is retained as such; no exact
        // historical close instant is invented.
        if (history.status !== 'empty') {
            nextHistory = closeEssentialHistoryDay(nextHistory, essentials.value ?? [], state.value, nowISO);
            const historyIndex = writes.findIndex(write => write.key === STORAGE_KEYS.essentialHistory);
            const entry = { key: STORAGE_KEYS.essentialHistory, value: serializeEssentialHistory(nextHistory) };
            if (historyIndex === -1) writes.push(entry);
            else writes[historyIndex] = entry;
        }
        writes.push({
            key: STORAGE_KEYS.essentialsState,
            value: serializeEssentialsState({ date: today, progressById: {} }),
        });
    }

    if (writes.length === 0) return { status: 'ok', migrated: false };

    const recovery = writeRecoverySnapshot(storage, captured, nowISO);
    if (recovery.status === 'failed') {
        return { status: 'failed', error: recovery.error, rolledBack: true };
    }
    const transaction = applyStorageTransaction(storage, writes, captured);
    if (transaction.status === 'failed') {
        return {
            status: 'failed',
            error: `${transaction.error} (${transaction.failedKey})`,
            rolledBack: transaction.restored,
        };
    }
    return { status: 'ok', migrated: true, recoveryKey: recovery.key };
}
