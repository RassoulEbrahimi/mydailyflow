import type { AppDataSnapshot } from '../types/backup';
import {
    MANAGED_KEYS,
    STORAGE_KEYS,
    applyStorageTransaction,
    serializeEssentialHistory,
    serializeEssentials,
    serializeEssentialsState,
    serializeFocusState,
    serializeTasks,
    serializeTemplates,
    type StorageLike,
    type StorageWrite,
} from '../utils/appStorage';
import { validateSnapshot } from '../utils/backupFormat';

export function snapshotStorageWrites(snapshot: AppDataSnapshot): StorageWrite[] {
    return [
        { key: STORAGE_KEYS.tasks, value: serializeTasks(snapshot.tasks) },
        { key: STORAGE_KEYS.essentialsData, value: serializeEssentials(snapshot.essentials) },
        { key: STORAGE_KEYS.essentialsState, value: serializeEssentialsState(snapshot.essentialsState) },
        { key: STORAGE_KEYS.essentialHistory, value: serializeEssentialHistory(snapshot.essentialHistory) },
        { key: STORAGE_KEYS.focusState, value: serializeFocusState(snapshot.focusState) },
        { key: STORAGE_KEYS.templates, value: serializeTemplates(snapshot.templates) },
        { key: STORAGE_KEYS.theme, value: snapshot.preferences.theme },
        { key: STORAGE_KEYS.remindersEnabled, value: String(snapshot.preferences.remindersEnabled) },
        { key: STORAGE_KEYS.stickyHeroEnabled, value: String(snapshot.preferences.stickyHeroEnabled) },
        { key: STORAGE_KEYS.essentialsCollapsed, value: String(snapshot.preferences.essentialsCollapsed) },
    ];
}

export function applySyncedSnapshot(
    storage: StorageLike,
    snapshot: AppDataSnapshot,
): { status: 'unchanged' | 'applied' } | { status: 'failed'; error: string } {
    const validation = validateSnapshot(snapshot);
    if (validation.status === 'invalid') return { status: 'failed', error: validation.errors.join(', ') };
    const writes = snapshotStorageWrites(validation.value);
    const current = new Map<string, string | null>(MANAGED_KEYS.map(key => [key, storage.getItem(key)]));
    if (writes.every(write => current.get(write.key) === write.value)) return { status: 'unchanged' };
    const result = applyStorageTransaction(storage, writes);
    if (result.status === 'failed') {
        return { status: 'failed', error: `${result.error}; restored=${result.restored}` };
    }
    return { status: 'applied' };
}
