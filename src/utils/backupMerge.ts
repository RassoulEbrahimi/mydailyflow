/**
 * backupMerge.ts — how an imported backup combines with what is already there.
 *
 * Pure: given the current snapshot, a backup and today's date, it returns the
 * complete destination snapshot. Nothing is written here; the caller decides
 * whether the result is safe to persist.
 */

import type { AppDataSnapshot, BackupFileV1 } from '../types/backup';
import type { DailyEssential, DailyEssentialState } from '../types/essential';
import type { Task } from '../types/task';

export type ImportMode = 'merge' | 'replace';

/**
 * Title key used to spot the same essential imported twice under a new ID.
 * Case- and whitespace-insensitive; the stored title itself is never rewritten.
 */
export const normalizeEssentialTitle = (title: string): string =>
    title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Merge tasks by ID. Current tasks keep their exact contents and their position;
 * an imported task is added only when its ID is new, so an import can never
 * silently rewrite a task the user already has.
 */
export function mergeTasks(current: Task[], incoming: Task[]): Task[] {
    const seen = new Set(current.map(t => t.id));
    const merged = [...current];

    for (const task of incoming) {
        if (seen.has(task.id)) continue;
        seen.add(task.id);
        merged.push(task);
    }
    return merged;
}

/**
 * Merge essentials by ID *and* by normalized title, then renumber `order` so the
 * result has a stable, collision-free ordering: current essentials first (in
 * their existing order), imported newcomers appended in file order.
 */
export function mergeEssentials(current: DailyEssential[], incoming: DailyEssential[]): DailyEssential[] {
    const ordered = [...current].sort((a, b) => a.order - b.order);
    const seenIds = new Set(ordered.map(e => e.id));
    const seenTitles = new Set(ordered.map(e => normalizeEssentialTitle(e.title)));

    const merged = [...ordered];
    for (const essential of [...incoming].sort((a, b) => a.order - b.order)) {
        const titleKey = normalizeEssentialTitle(essential.title);
        if (seenIds.has(essential.id) || seenTitles.has(titleKey)) continue;
        seenIds.add(essential.id);
        seenTitles.add(titleKey);
        merged.push(essential);
    }

    return merged.map((essential, index) => ({ ...essential, order: index }));
}

/**
 * Daily progress is only meaningful for the day it was recorded. A backup made
 * on any other day contributes an empty progress map for today.
 */
export function resolveImportedDailyState(
    state: DailyEssentialState,
    today: string,
): DailyEssentialState {
    if (state.date !== today) return { date: today, progressById: {} };
    return { date: today, progressById: { ...state.progressById } };
}

/** Same rule applied to what is already on the device. */
const currentStateForToday = (state: DailyEssentialState, today: string): DailyEssentialState =>
    state.date === today ? { date: today, progressById: { ...state.progressById } } : { date: today, progressById: {} };

/**
 * Builds the full destination state for an import.
 *
 * merge   — current data wins on every conflict; the backup can only add.
 *           Preferences are left exactly as they are.
 * replace — the backup wins; preferences come from the file.
 */
export function applyBackup(
    current: AppDataSnapshot,
    backup: BackupFileV1,
    mode: ImportMode,
    today: string,
): AppDataSnapshot {
    const importedState = resolveImportedDailyState(backup.essentialsState, today);

    if (mode === 'replace') {
        return {
            tasks: [...backup.tasks],
            essentials: [...backup.essentials]
                .sort((a, b) => a.order - b.order)
                .map((essential, index) => ({ ...essential, order: index })),
            essentialsState: importedState,
            preferences: { ...backup.preferences },
        };
    }

    const currentState = currentStateForToday(current.essentialsState, today);
    const progressById = { ...currentState.progressById };
    // Only fill gaps — an existing count for an essential is never replaced.
    for (const [id, value] of Object.entries(importedState.progressById)) {
        if (!(id in progressById)) progressById[id] = value;
    }

    return {
        tasks: mergeTasks(current.tasks, backup.tasks),
        essentials: mergeEssentials(current.essentials, backup.essentials),
        essentialsState: { date: today, progressById },
        preferences: { ...current.preferences },
    };
}
