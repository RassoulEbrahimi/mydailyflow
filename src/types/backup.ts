// ─── Backup file format & runtime validation ──────────────────────────────────
//
// The backup file is the only thing that ever leaves the device, so its shape is
// deliberately narrow: tasks, essentials, today's essentials progress, and a few
// harmless UI preferences. Authentication/session data is not part of the type,
// so no code path can put it in a file.

import type { Task } from './task';
import { isValidTaskArray } from './task';
import type { DailyEssential, DailyEssentialState } from './essential';
import { isValidEssentialArray, isValidEssentialState } from './essential';

export const BACKUP_APP_ID = 'mydailyflow';
export const BACKUP_SCHEMA_VERSION = 1;

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
    tasks: Task[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
    preferences: BackupPreferences;
}

/** The in-app shape a backup is built from and restored into. */
export interface AppDataSnapshot {
    tasks: Task[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
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

/**
 * Validates a parsed backup object in full and reports every problem at once.
 *
 * There is no partial success: a file with valid tasks but an invalid essential
 * is rejected as a whole, so an import can never apply half a backup.
 */
export function validateBackupObject(data: unknown): ValidationResult<BackupFileV1> {
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
    } else if (b.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        errors.push(
            `unsupported-schema-version: file is v${b.schemaVersion}, this app supports v${BACKUP_SCHEMA_VERSION}`,
        );
    }

    if (typeof b.exportedAt !== 'string' || Number.isNaN(Date.parse(b.exportedAt))) {
        errors.push('invalid-exported-at');
    }

    if (!isValidTaskArray(b.tasks)) errors.push('invalid-tasks');
    if (!isValidEssentialArray(b.essentials)) errors.push('invalid-essentials');
    if (!isValidEssentialState(b.essentialsState)) errors.push('invalid-essentials-state');
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
            tasks: b.tasks as Task[],
            essentials: b.essentials as DailyEssential[],
            essentialsState: b.essentialsState as DailyEssentialState,
            preferences: b.preferences as BackupPreferences,
        },
    };
}
