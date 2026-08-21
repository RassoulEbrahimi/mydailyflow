import type { AppDataSnapshot } from '../types/backup';
import { FIRST_SIGN_IN_SOURCE, type StorageLike } from '../utils/appStorage';
import { parseBackupText } from '../utils/backupFormat';
import {
    captureManagedKeys,
    exportBackup,
    matchesCapture,
    readSnapshotStrict,
    writeVerifiedRecoverySnapshot,
} from '../utils/backupService';

export interface ManifestCounts {
    tasks: number;
    essentials: number;
    essentialHistoryDays: number;
    focusSessions: number;
    templates: number;
}

export interface DatasetManifest {
    itemCount: number;
    revision: number | null;
    digest: string | null;
    latestActivity: string | null;
    counts: ManifestCounts;
    reconciliationStatus: 'none' | 'prepared';
}

export type FirstSignInDecision =
    | 'start-empty'
    | 'upload-local'
    | 'download-account'
    | 'merge-with-conflicts'
    | 'keep-device-separate';

export interface SafetyBoundary {
    backupFileName: string;
    backupText: string;
    recoveryKey: string;
    manifest: DatasetManifest;
}

export type SafetyBoundaryResult =
    | { status: 'ok'; value: SafetyBoundary }
    | { status: 'failed'; errors: string[] };

const countsFor = (snapshot: AppDataSnapshot): ManifestCounts => ({
    tasks: snapshot.tasks.length,
    essentials: snapshot.essentials.length,
    essentialHistoryDays: snapshot.essentialHistory.length,
    focusSessions: snapshot.focusState.history.length + (snapshot.focusState.activeSession ? 1 : 0),
    templates: snapshot.templates.length,
});

const itemCount = (counts: ManifestCounts): number =>
    counts.tasks
    + counts.essentials
    + counts.essentialHistoryDays
    + counts.focusSessions
    + counts.templates;

const bytesToHex = (bytes: ArrayBuffer): string =>
    [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');

export async function manifestFromSnapshot(snapshot: AppDataSnapshot): Promise<DatasetManifest> {
    const counts = countsFor(snapshot);
    const canonical = JSON.stringify(snapshot);
    const digest = canonical.length === 0
        ? null
        : bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    return {
        itemCount: itemCount(counts),
        revision: null,
        digest,
        latestActivity: null,
        counts,
        reconciliationStatus: 'none',
    };
}

export type ManifestReadResult =
    | { status: 'ok'; value: DatasetManifest }
    | { status: 'failed'; errors: string[] };

export async function readLocalManifest(
    storage: StorageLike,
    today: string,
): Promise<ManifestReadResult> {
    const snapshot = readSnapshotStrict(storage, today);
    if (snapshot.status === 'invalid') return { status: 'failed', errors: snapshot.errors };
    return { status: 'ok', value: await manifestFromSnapshot(snapshot.snapshot) };
}

export const emptyManifest = (): DatasetManifest => ({
    itemCount: 0,
    revision: null,
    digest: null,
    latestActivity: null,
    counts: { tasks: 0, essentials: 0, essentialHistoryDays: 0, focusSessions: 0, templates: 0 },
    reconciliationStatus: 'none',
});

export function recommendedDecision(local: DatasetManifest, account: DatasetManifest): FirstSignInDecision {
    if (local.itemCount === 0 && account.itemCount === 0) return 'start-empty';
    if (local.itemCount > 0 && account.itemCount === 0) return 'upload-local';
    if (local.itemCount === 0 && account.itemCount > 0) return 'download-account';
    return 'merge-with-conflicts';
}

/**
 * Creates both user-controlled escape hatches before a remote intent can be
 * recorded: a downloadable Backup v4 and a byte-exact local recovery snapshot.
 * No managed key is changed.
 */
export async function prepareFirstSignInSafetyBoundary(
    storage: StorageLike,
    today: string,
    nowISO: string,
): Promise<SafetyBoundaryResult> {
    const capture = captureManagedKeys(storage);
    if (capture.status === 'failed') return { status: 'failed', errors: [capture.error] };

    const snapshot = readSnapshotStrict(storage, today);
    if (snapshot.status === 'invalid') return { status: 'failed', errors: snapshot.errors };

    const exported = exportBackup(storage, today, nowISO);
    if (exported.status === 'invalid') return { status: 'failed', errors: exported.errors };
    const verifiedBackup = parseBackupText(exported.text);
    if (verifiedBackup.status === 'invalid') return { status: 'failed', errors: verifiedBackup.errors };

    const recovery = writeVerifiedRecoverySnapshot(
        storage,
        capture.captured,
        FIRST_SIGN_IN_SOURCE,
        nowISO,
    );
    if (recovery.status === 'failed') return { status: 'failed', errors: [recovery.error] };
    if (!matchesCapture(storage, capture.captured)) {
        return { status: 'failed', errors: ['managed-storage-changed-during-safety-boundary'] };
    }

    return {
        status: 'ok',
        value: {
            backupFileName: exported.fileName,
            backupText: exported.text,
            recoveryKey: recovery.key,
            manifest: await manifestFromSnapshot(snapshot.snapshot),
        },
    };
}
