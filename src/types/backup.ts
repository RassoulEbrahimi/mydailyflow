// ─── Backup file format & runtime validation ──────────────────────────────────
//
// The backup file is the only thing that ever leaves the device, so its shape is
// deliberately narrow: tasks, essentials, today's essentials progress, and a few
// harmless UI preferences. Authentication/session data is not part of the type,
// so no code path can put it in a file.

import type { LegacyTask, Task } from './task';
import { isValidLegacyTaskArray, isValidTaskArray, migrateLegacyTasks } from './task';
import type { DailyEssential, DailyEssentialState, EssentialHistoryDay } from './essential';
import { isValidEssentialArray, isValidEssentialHistory, isValidEssentialState } from './essential';

export const BACKUP_APP_ID = 'mydailyflow';
export const BACKUP_SCHEMA_VERSION = 2;

export type Theme = 'light' | 'dark' | 'system';

export interface BackupPreferences {
    theme: Theme;
    remindersEnabled: boolean;
    stickyHeroEnabled: boolean;
    essentialsCollapsed: boolean;
}

export interface BackupFileV1 {
    app: typeof BACKUP_APP_ID;
    schemaVersion: 1;
    exportedAt: string;
    tasks: LegacyTask[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
    preferences: BackupPreferences;
}

export interface BackupFileV2 {
    app: typeof BACKUP_APP_ID;
    schemaVersion: 2;
    exportedAt: string;
    tasks: Task[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
    essentialHistory: EssentialHistoryDay[];
    preferences: BackupPreferences;
}

/** The in-app shape a backup is built from and restored into. */
export interface AppDataSnapshot {
    tasks: Task[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
    essentialHistory: EssentialHistoryDay[];
    preferences: BackupPreferences;
}

/**
 * A string discriminant is used instead of `ok: boolean` because this project
 * compiles without strictNullChecks, where boolean literal types widen and stop
 * narrowing a union.
 */
export type ValidationResult<T> =
    | { status: 'valid'; value: T }
    | { status: 'invalid'; errors: string[] };

export const isTheme = (value: unknown): value is Theme =>
    value === 'light' || value === 'dark' || value === 'system';

export const isBackupPreferences = (value: unknown): value is BackupPreferences => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    return isTheme(p.theme)
        && typeof p.remindersEnabled === 'boolean'
        && typeof p.stickyHeroEnabled === 'boolean'
        && typeof p.essentialsCollapsed === 'boolean';
};

const legacyHistory = (
    essentials: DailyEssential[],
    state: DailyEssentialState,
): EssentialHistoryDay[] => {
    const knownIds = new Set(essentials.map(item => item.id));
    const entries = [...essentials]
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map(item => ({
            essentialId: item.id,
            title: item.title,
            targetCount: item.targetCount,
            completedCount: state.progressById[item.id] ?? 0,
        }));
    for (const essentialId of Object.keys(state.progressById).filter(id => !knownIds.has(id)).sort()) {
        entries.push({
            essentialId,
            title: null,
            targetCount: null,
            completedCount: state.progressById[essentialId],
        });
    }
    return entries.length === 0 ? [] : [{
        date: state.date,
        recordedAt: null,
        source: 'legacy-snapshot',
        entries,
    }];
};

/**
 * Validates a parsed backup object in full and reports every problem at once.
 *
 * There is no partial success: a file with valid tasks but an invalid essential
 * is rejected as a whole, so an import can never apply half a backup.
 */
export function validateBackupObject(data: unknown): ValidationResult<BackupFileV2> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { status: 'invalid', errors: ['not-an-object'] };
    }
    const b = data as Record<string, unknown>;
    const errors: string[] = [];

    if (b.app !== BACKUP_APP_ID) {
        errors.push(`unknown-app: expected "${BACKUP_APP_ID}"`);
    }

    if (typeof b.schemaVersion !== 'number' || !Number.isInteger(b.schemaVersion)) {
        errors.push('missing-schema-version');
    } else if (b.schemaVersion !== 1 && b.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        errors.push(
            `unsupported-schema-version: file is v${b.schemaVersion}, this app supports v${BACKUP_SCHEMA_VERSION}`,
        );
    }

    if (typeof b.exportedAt !== 'string' || Number.isNaN(Date.parse(b.exportedAt))) {
        errors.push('invalid-exported-at');
    }

    const isV1 = b.schemaVersion === 1;
    if (isV1 ? !isValidLegacyTaskArray(b.tasks) : !isValidTaskArray(b.tasks)) errors.push('invalid-tasks');
    if (!isValidEssentialArray(b.essentials)) errors.push('invalid-essentials');
    if (!isValidEssentialState(b.essentialsState)) errors.push('invalid-essentials-state');
    if (!isV1 && !isValidEssentialHistory(b.essentialHistory)) errors.push('invalid-essential-history');
    if (!isBackupPreferences(b.preferences)) errors.push('invalid-preferences');

    if (errors.length > 0) return { status: 'invalid', errors };

    // Only known fields are carried over: anything else in the file (including a
    // stray session blob someone hand-edited in) is dropped here and can never
    // reach storage.
    return {
        status: 'valid',
        value: {
            app: BACKUP_APP_ID,
            schemaVersion: BACKUP_SCHEMA_VERSION,
            exportedAt: b.exportedAt as string,
            tasks: isV1
                ? migrateLegacyTasks(b.tasks as LegacyTask[])
                : b.tasks as Task[],
            essentials: b.essentials as DailyEssential[],
            essentialsState: b.essentialsState as DailyEssentialState,
            essentialHistory: isV1
                ? legacyHistory(b.essentials as DailyEssential[], b.essentialsState as DailyEssentialState)
                : b.essentialHistory as EssentialHistoryDay[],
            preferences: b.preferences as BackupPreferences,
        },
    };
}
