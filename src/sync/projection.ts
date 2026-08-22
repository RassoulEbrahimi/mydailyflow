import type { AppDataSnapshot } from '../types/backup';
import type { FocusState } from '../types/focus';
import type { SyncEntityKind, SyncRecord } from './types';

export type LocalSyncRecord = Omit<SyncRecord, 'revision' | 'fieldRevisions' | 'tombstone'>;

const record = (key: string, kind: SyncEntityKind, payload: Record<string, unknown>): LocalSyncRecord => ({
    key,
    kind,
    payload,
});

const sorted = <T>(items: T[], key: (item: T) => string): T[] =>
    [...items].sort((left, right) => key(left).localeCompare(key(right)));

/**
 * Converts Backup-v4's provider-independent snapshot into independently
 * mergeable server records. Authentication and recovery data cannot enter this
 * function because AppDataSnapshot has no such fields.
 */
export function snapshotToSyncRecords(snapshot: AppDataSnapshot): Record<string, LocalSyncRecord> {
    const result: Record<string, LocalSyncRecord> = {};
    const add = (entry: LocalSyncRecord) => { result[entry.key] = entry; };

    for (const task of snapshot.tasks) add(record(`task:${task.id}`, 'task', { ...task }));
    for (const essential of snapshot.essentials) add(record(`essential:${essential.id}`, 'essential', { ...essential }));
    for (const [essentialId, progress] of Object.entries(snapshot.essentialsState.progressById)) {
        add(record(
            `essential-progress:${snapshot.essentialsState.date}:${essentialId}`,
            'essential-progress',
            { date: snapshot.essentialsState.date, essentialId, progress },
        ));
    }
    for (const day of snapshot.essentialHistory) {
        add(record(`essential-history:${day.date}`, 'essential-history', { ...day }));
    }
    if (snapshot.focusState.activeSession) {
        add(record('focus-active:current', 'focus-active', { ...snapshot.focusState.activeSession }));
    }
    for (const session of snapshot.focusState.history) {
        add(record(`focus-session:${session.id}`, 'focus-session', { ...session }));
    }
    for (const template of snapshot.templates) add(record(`template:${template.id}`, 'template', { ...template }));
    for (const [name, value] of Object.entries(snapshot.preferences)) {
        add(record(`preference:${name}`, 'preference', { name, value }));
    }
    return result;
}

const activeRecords = (records: Record<string, SyncRecord>): SyncRecord[] =>
    Object.values(records).filter(entry => !entry.tombstone);

/** Rebuilds exactly the app-owned snapshot slices from canonical sync records. */
export function syncRecordsToSnapshot(
    records: Record<string, SyncRecord>,
    today: string,
): AppDataSnapshot {
    const active = activeRecords(records);
    const progressById: Record<string, number> = {};
    for (const entry of active.filter(item => item.kind === 'essential-progress')) {
        if (entry.payload.date === today
            && typeof entry.payload.essentialId === 'string'
            && typeof entry.payload.progress === 'number') {
            progressById[entry.payload.essentialId] = entry.payload.progress;
        }
    }

    const focusState: FocusState = {
        activeSession: (active.find(item => item.kind === 'focus-active')?.payload ?? null) as unknown as FocusState['activeSession'],
        history: sorted(
            active.filter(item => item.kind === 'focus-session').map(item => item.payload as unknown as FocusState['history'][number]),
            item => item.completedAt,
        ),
    };
    const preferenceValues = Object.fromEntries(
        active
            .filter(item => item.kind === 'preference' && typeof item.payload.name === 'string')
            .map(item => [item.payload.name as string, item.payload.value]),
    ) as Partial<AppDataSnapshot['preferences']>;
    const preferences: AppDataSnapshot['preferences'] = {
        theme: preferenceValues.theme ?? 'dark',
        remindersEnabled: preferenceValues.remindersEnabled ?? false,
        stickyHeroEnabled: preferenceValues.stickyHeroEnabled ?? true,
        essentialsCollapsed: preferenceValues.essentialsCollapsed ?? false,
    };

    return {
        tasks: sorted(active.filter(item => item.kind === 'task').map(item => item.payload as unknown as AppDataSnapshot['tasks'][number]), item => item.id),
        essentials: sorted(active.filter(item => item.kind === 'essential').map(item => item.payload as unknown as AppDataSnapshot['essentials'][number]), item => item.id),
        essentialsState: { date: today, progressById },
        essentialHistory: sorted(active.filter(item => item.kind === 'essential-history').map(item => item.payload as unknown as AppDataSnapshot['essentialHistory'][number]), item => item.date),
        focusState,
        templates: sorted(active.filter(item => item.kind === 'template').map(item => item.payload as unknown as AppDataSnapshot['templates'][number]), item => item.id),
        preferences,
    };
}

const equal = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export function changedFields(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(local)) {
        if (!equal(value, remote[field])) changes[field] = value;
    }
    return changes;
}

export function removedFieldNames(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
): string[] {
    return Object.keys(remote).filter(field => !Object.hasOwn(local, field)).sort();
}
