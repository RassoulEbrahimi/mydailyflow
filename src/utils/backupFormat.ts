/**
 * backupFormat.ts — building, serializing and parsing backup files.
 *
 * Pure: no DOM, no storage, no React. Everything here is directly testable.
 */

import type { AppDataSnapshot, BackupFileV3, ValidationResult } from '../types/backup';
import { BACKUP_APP_ID, BACKUP_SCHEMA_VERSION, isBackupPreferences, validateBackupObject } from '../types/backup';
import { isValidEssentialArray, isValidEssentialHistory, isValidEssentialState } from '../types/essential';
import { isValidTaskArray } from '../types/task';
import { isValidFocusState } from '../types/focus';
import { pauseFocusForBackup } from './focusSessions';

/** Assembles only the explicitly versioned, user-owned data sections. */
export function buildBackup(snapshot: AppDataSnapshot, exportedAt: string): BackupFileV3 {
    return {
        app: BACKUP_APP_ID,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt,
        tasks: snapshot.tasks,
        essentials: snapshot.essentials,
        essentialsState: snapshot.essentialsState,
        essentialHistory: snapshot.essentialHistory,
        focusState: pauseFocusForBackup(snapshot.focusState, exportedAt),
        preferences: snapshot.preferences,
    };
}

export const serializeBackup = (backup: BackupFileV3): string =>
    JSON.stringify(backup, null, 2);

/** `mydailyflow-backup-2026-08-15-1204.json` */
export function backupFileName(exportedAt: string): string {
    const stamp = exportedAt.replace(/[:]/g, '-').replace(/\..*$/, '');
    const [datePart, timePart = ''] = stamp.split('T');
    const compactTime = timePart.split('-').slice(0, 2).join('');
    return `mydailyflow-backup-${datePart}${compactTime ? `-${compactTime}` : ''}.json`;
}

/**
 * Validates the data currently held by the app before it is written to a file,
 * so a corrupted in-memory slice cannot be exported as if it were sound.
 */
export function validateSnapshot(snapshot: AppDataSnapshot): ValidationResult<AppDataSnapshot> {
    const errors: string[] = [];
    if (!isValidTaskArray(snapshot.tasks)) errors.push('invalid-tasks');
    if (!isValidEssentialArray(snapshot.essentials)) errors.push('invalid-essentials');
    if (!isValidEssentialState(snapshot.essentialsState)) errors.push('invalid-essentials-state');
    if (!isValidEssentialHistory(snapshot.essentialHistory)) errors.push('invalid-essential-history');
    if (!isValidFocusState(snapshot.focusState)) errors.push('invalid-focus-state');
    if (!isBackupPreferences(snapshot.preferences)) errors.push('invalid-preferences');
    if (errors.length > 0) return { status: 'invalid', errors };
    return { status: 'valid', value: snapshot };
}

/** Parses file text. Invalid JSON and unsupported versions are distinguished. */
export function parseBackupText(raw: string): ValidationResult<BackupFileV3> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return { status: 'invalid', errors: [`invalid-json: ${e instanceof Error ? e.message : String(e)}`] };
    }
    return validateBackupObject(parsed);
}

export interface BackupSummary {
    exportedAt: string;
    taskCount: number;
    essentialCount: number;
    progressEntryCount: number;
    progressDate: string;
    historyDayCount: number;
    focusSessionCount: number;
}

/** Counts shown in the import preview before anything is applied. */
export function summarizeBackup(backup: BackupFileV3): BackupSummary {
    return {
        exportedAt: backup.exportedAt,
        taskCount: backup.tasks.length,
        essentialCount: backup.essentials.length,
        progressEntryCount: Object.keys(backup.essentialsState.progressById).length,
        progressDate: backup.essentialsState.date,
        historyDayCount: backup.essentialHistory.length,
        focusSessionCount: backup.focusState.history.length + (backup.focusState.activeSession ? 1 : 0),
    };
}
