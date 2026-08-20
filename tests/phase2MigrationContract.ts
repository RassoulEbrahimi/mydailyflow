import type { BackupPreferences } from '../src/types/backup';
import { BACKUP_APP_ID, isBackupPreferences } from '../src/types/backup';
import type { DailyEssential, DailyEssentialState } from '../src/types/essential';
import {
    isNonNegativeInteger,
    isPositiveInteger,
    isValidDateString,
    isValidEssentialArray,
    isValidEssentialState,
} from '../src/types/essential';
import type { Task } from '../src/types/task';
import { isValidTaskArray } from '../src/types/task';

/**
 * Test-only executable reference for the Phase 2 schema decision.
 *
 * Production types, validators, storage keys and import code deliberately stay
 * on v1 until the implementation PR. These types let the migration contract be
 * proved before a persisted byte is changed.
 */

export interface Phase2Task extends Task {
    /** null means the task is incomplete or the exact legacy completion instant is unknown. */
    completedAt: string | null;
}

export interface EssentialHistoryEntry {
    essentialId: string;
    title: string | null;
    targetCount: number | null;
    completedCount: number;
}

export interface EssentialHistoryDay {
    date: string;
    /** null is reserved for a v1 snapshot whose capture instant cannot be inferred safely. */
    recordedAt: string | null;
    source: 'legacy-snapshot' | 'daily-close';
    entries: EssentialHistoryEntry[];
}

export interface Phase2BackupV2 {
    app: typeof BACKUP_APP_ID;
    schemaVersion: 2;
    exportedAt: string;
    tasks: Phase2Task[];
    essentials: DailyEssential[];
    essentialsState: DailyEssentialState;
    essentialHistory: EssentialHistoryDay[];
    preferences: BackupPreferences;
}

type Phase1BackupShape = Omit<Phase2BackupV2, 'schemaVersion' | 'tasks' | 'essentialHistory'> & {
    schemaVersion: 1;
    tasks: Task[];
};

export type Phase2MigrationResult =
    | { status: 'ok'; value: Phase2BackupV2; migratedFrom: 1 | 2 }
    | { status: 'invalid'; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isCanonicalUtcInstant = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const validateCommon = (value: Record<string, unknown>): string[] => {
    const errors: string[] = [];
    if (value.app !== BACKUP_APP_ID) errors.push('unknown-app');
    if (!isCanonicalUtcInstant(value.exportedAt)) errors.push('invalid-exported-at');
    if (!isValidEssentialArray(value.essentials)) errors.push('invalid-essentials');
    if (!isValidEssentialState(value.essentialsState)) errors.push('invalid-essentials-state');
    if (!isBackupPreferences(value.preferences)) errors.push('invalid-preferences');
    return errors;
};

const isPhase2TaskArray = (value: unknown): value is Phase2Task[] => {
    if (!isValidTaskArray(value)) return false;
    return value.every(task => {
        const completedAt = (task as unknown as Record<string, unknown>).completedAt;
        if (completedAt !== null && !isCanonicalUtcInstant(completedAt)) return false;
        return task.completed || completedAt === null;
    });
};

const isHistoryEntry = (value: unknown): value is EssentialHistoryEntry => {
    if (!isRecord(value)) return false;
    return typeof value.essentialId === 'string'
        && (value.title === null || typeof value.title === 'string')
        && (value.targetCount === null || isPositiveInteger(value.targetCount))
        && isNonNegativeInteger(value.completedCount);
};

const isHistoryDay = (value: unknown): value is EssentialHistoryDay => {
    if (!isRecord(value)) return false;
    if (!isValidDateString(value.date)) return false;
    if (value.recordedAt !== null && !isCanonicalUtcInstant(value.recordedAt)) return false;
    if (value.source !== 'legacy-snapshot' && value.source !== 'daily-close') return false;
    if (!Array.isArray(value.entries) || !value.entries.every(isHistoryEntry)) return false;
    return new Set(value.entries.map(entry => entry.essentialId)).size === value.entries.length;
};

const validateV2 = (value: Record<string, unknown>): string[] => {
    const errors = validateCommon(value);
    if (!isPhase2TaskArray(value.tasks)) errors.push('invalid-v2-tasks');
    if (!Array.isArray(value.essentialHistory) || !value.essentialHistory.every(isHistoryDay)) {
        errors.push('invalid-essential-history');
    } else if (new Set(value.essentialHistory.map(day => day.date)).size !== value.essentialHistory.length) {
        errors.push('duplicate-essential-history-date');
    }
    return errors;
};

const historyFromLegacySnapshot = (
    essentials: DailyEssential[],
    state: DailyEssentialState,
): EssentialHistoryDay[] => {
    const definitions = [...essentials].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const knownIds = new Set(definitions.map(item => item.id));
    const entries: EssentialHistoryEntry[] = definitions.map(item => ({
        essentialId: item.id,
        title: item.title,
        targetCount: item.targetCount,
        completedCount: state.progressById[item.id] ?? 0,
    }));

    // A legacy state can outlive an Essential definition after deletion. Keep
    // those counts rather than silently losing data or inventing old labels.
    for (const essentialId of Object.keys(state.progressById).filter(id => !knownIds.has(id)).sort()) {
        entries.push({
            essentialId,
            title: null,
            targetCount: null,
            completedCount: state.progressById[essentialId],
        });
    }

    return entries.length === 0
        ? []
        : [{ date: state.date, recordedAt: null, source: 'legacy-snapshot', entries }];
};

export function migrateBackupToPhase2(input: unknown): Phase2MigrationResult {
    if (!isRecord(input)) return { status: 'invalid', errors: ['not-an-object'] };
    if (input.schemaVersion !== 1 && input.schemaVersion !== 2) {
        return { status: 'invalid', errors: ['unsupported-schema-version'] };
    }

    if (input.schemaVersion === 2) {
        const errors = validateV2(input);
        return errors.length > 0
            ? { status: 'invalid', errors }
            : { status: 'ok', value: deepClone(input as unknown as Phase2BackupV2), migratedFrom: 2 };
    }

    const errors = validateCommon(input);
    if (!isValidTaskArray(input.tasks)) errors.push('invalid-v1-tasks');
    if (errors.length > 0) return { status: 'invalid', errors };

    const legacy = input as unknown as Phase1BackupShape;
    const migrated: Phase2BackupV2 = {
        app: BACKUP_APP_ID,
        schemaVersion: 2,
        exportedAt: legacy.exportedAt,
        tasks: legacy.tasks.map(task => ({ ...deepClone(task), completedAt: null })),
        essentials: deepClone(legacy.essentials),
        essentialsState: deepClone(legacy.essentialsState),
        essentialHistory: historyFromLegacySnapshot(legacy.essentials, legacy.essentialsState),
        preferences: deepClone(legacy.preferences),
    };
    return { status: 'ok', value: migrated, migratedFrom: 1 };
}
