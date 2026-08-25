import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealAuthConfig } from '../config/features';
import { readSnapshotStrict } from '../utils/backupService';
import { getTodayString } from '../utils/taskUtils';
import {
    enqueueLocalChanges,
    enqueueLocalChangesSince,
    loadClientState,
    loadOrCreateDeviceId,
    mergeRemoteForLocal,
    persistClientState,
} from '../sync/clientState';
import { snapshotToSyncRecords, syncRecordsToSnapshot } from '../sync/projection';
import { applySyncedSnapshot } from '../sync/storage';
import { syncTransportFor } from '../sync/supabaseSync';
import type { SyncClientState, SyncRecord, SyncViewState } from '../sync/types';

const initialView: SyncViewState = {
    status: 'local', pendingCount: 0, conflicts: [], lastSyncedAt: null, message: null,
};

export function useSyncCoordinator(config: RealAuthConfig | null, userId?: string) {
    const transport = useMemo(() => config ? syncTransportFor(config) : null, [config?.url, config?.publishableKey]);
    const [view, setView] = useState<SyncViewState>(config && userId ? initialView : { ...initialView, status: 'disabled' });
    const running = useRef(false);
    const stateRef = useRef<SyncClientState | null>(null);

    const publish = useCallback((status: SyncViewState['status'], state: SyncClientState, conflicts?: SyncViewState['conflicts'], message: string | null = null) => {
        setView(current => ({
            status,
            pendingCount: state.outbox.length,
            conflicts: conflicts ?? current.conflicts,
            lastSyncedAt: state.lastSyncedAt,
            message,
        }));
    }, []);

    const syncNow = useCallback(async (reason: 'startup' | 'local' | 'remote' | 'online' | 'timer' = 'local') => {
        if (!transport || !userId || running.current) return;
        if (!navigator.onLine) {
            const current = stateRef.current;
            if (current) publish('offline', current, undefined, 'Änderungen bleiben sicher auf diesem Gerät.');
            return;
        }
        running.current = true;
        try {
            const deviceId = loadOrCreateDeviceId(localStorage);
            let state = stateRef.current ?? loadClientState(localStorage, userId, deviceId);
            const cycleBaseShadow = state.shadow;
            stateRef.current = state;
            publish('syncing', state, undefined, reason === 'startup' ? 'Konto wird abgeglichen…' : null);

            await transport.registerDevice(deviceId, state.datasetRevision);
            let bootstrap = await transport.fetchBootstrap(deviceId);
            const reconciliationBaseShadow = bootstrap.records;
            if (bootstrap.reconciliationChoice === 'keep-device-separate') {
                publish('local', state, bootstrap.conflicts, 'Dieses Gerät bleibt wie gewählt getrennt.');
                return;
            }

            const read = readSnapshotStrict(localStorage, getTodayString());
            if (read.status === 'invalid') throw new Error(`Lokale Daten sind nicht synchronisierbar: ${read.errors.join(', ')}`);
            const localRecords = snapshotToSyncRecords(read.snapshot);
            const firstSync = state.lastSyncedAt === null && Object.keys(state.shadow).length === 0;

            if (firstSync && bootstrap.reconciliationChoice === 'download-account') {
                state = { ...state, shadow: bootstrap.records, datasetRevision: bootstrap.revision };
            } else if (firstSync && bootstrap.reconciliationChoice === 'merge-with-conflicts') {
                const conflictDetectingShadow = Object.fromEntries(
                    (Object.entries(bootstrap.records) as Array<[string, SyncRecord]>)
                        .map(([key, entry]) => [key, { ...entry, revision: 0 }]),
                );
                state = enqueueLocalChanges(
                    { ...state, shadow: conflictDetectingShadow, datasetRevision: bootstrap.revision },
                    localRecords,
                    new Date().toISOString(),
                    undefined,
                    false,
                );
                state = { ...state, shadow: bootstrap.records };
            } else {
                if (firstSync) state = { ...state, shadow: bootstrap.records, datasetRevision: bootstrap.revision };
                state = enqueueLocalChanges(state, localRecords, new Date().toISOString(), undefined, !firstSync);
            }
            persistClientState(localStorage, userId, state);

            for (const mutation of [...state.outbox]) {
                const receipt = await transport.applyMutation(mutation);
                state = {
                    ...state,
                    datasetRevision: Math.max(state.datasetRevision, receipt.revision),
                    outbox: state.outbox.filter(item => item.mutationId !== mutation.mutationId),
                    conflictedKeys: receipt.status === 'conflict'
                        ? [...new Set([...state.conflictedKeys, mutation.key])]
                        : state.conflictedKeys,
                };
                persistClientState(localStorage, userId, state);
            }

            bootstrap = await transport.fetchBootstrap(deviceId);
            const latestRead = readSnapshotStrict(localStorage, getTodayString());
            if (latestRead.status === 'invalid') throw new Error(`Lokale Daten sind nicht synchronisierbar: ${latestRead.errors.join(', ')}`);
            const latestLocalRecords = snapshotToSyncRecords(latestRead.snapshot);
            const conflictedKeys = Array.from(new Set<string>(bootstrap.conflicts.map(conflict => conflict.key)));
            const refreshedBase: SyncClientState = {
                ...state,
                datasetRevision: bootstrap.revision,
                shadow: bootstrap.records,
                conflictedKeys,
            };
            state = firstSync && bootstrap.reconciliationChoice === 'download-account'
                ? refreshedBase
                : enqueueLocalChangesSince(
                    refreshedBase,
                    latestLocalRecords,
                    localRecords,
                    cycleBaseShadow,
                    new Date().toISOString(),
                );
            const protectedKeys = Array.from(new Set([
                ...conflictedKeys,
                ...state.outbox.map(mutation => mutation.key),
            ]));
            const merged = mergeRemoteForLocal(
                bootstrap.records,
                latestLocalRecords,
                protectedKeys,
                firstSync ? reconciliationBaseShadow : cycleBaseShadow,
            );
            const snapshot = syncRecordsToSnapshot(merged, getTodayString());
            const applied = applySyncedSnapshot(localStorage, snapshot);
            if (applied.status === 'failed') throw new Error(`Remote-Daten konnten nicht atomar übernommen werden: ${applied.error}`);

            const syncedAt = new Date().toISOString();
            state = {
                ...state,
                datasetRevision: bootstrap.revision,
                shadow: bootstrap.records,
                conflictedKeys,
                lastSyncedAt: syncedAt,
            };
            stateRef.current = state;
            persistClientState(localStorage, userId, state);
            await transport.acknowledge(deviceId, bootstrap.revision);
            publish(conflictedKeys.length > 0 ? 'conflict' : state.outbox.length > 0 ? 'pending' : 'synced', state, bootstrap.conflicts);
            if (applied.status === 'applied') window.location.reload();
        } catch (error) {
            const state = stateRef.current;
            if (state) {
                const offline = !navigator.onLine;
                publish(offline ? 'offline' : state.outbox.length ? 'pending' : 'error', state, undefined,
                    offline ? 'Offline — Änderungen warten auf Verbindung.' : 'Synchronisierung wird erneut versucht.');
            }
            console.error('P2-9 sync failed', error instanceof Error ? error.message : 'unknown error');
        } finally {
            running.current = false;
        }
    }, [transport, userId, publish]);

    const resolveConflict = useCallback(async (conflictId: string, resolution: 'keep-server' | 'use-device') => {
        if (!transport || !userId || running.current) return;
        running.current = true;
        try {
            const deviceId = loadOrCreateDeviceId(localStorage);
            const conflict = view.conflicts.find(item => item.id === conflictId);
            if (!conflict) throw new Error('Konflikt ist nicht mehr verfügbar.');
            const before = readSnapshotStrict(localStorage, getTodayString());
            if (before.status === 'invalid') throw new Error(before.errors.join(', '));
            const deviceEntry = snapshotToSyncRecords(before.snapshot)[conflict.key];
            await transport.resolveConflict(conflictId, resolution, deviceId, {
                present: Boolean(deviceEntry),
                payload: deviceEntry?.payload ?? null,
            });
            const bootstrap = await transport.fetchBootstrap(deviceId);
            const remainingKeys = Array.from(new Set<string>(bootstrap.conflicts.map(conflict => conflict.key)));
            const read = readSnapshotStrict(localStorage, getTodayString());
            if (read.status === 'invalid') throw new Error(read.errors.join(', '));
            const local = snapshotToSyncRecords(read.snapshot);
            const merged = mergeRemoteForLocal(bootstrap.records, local, remainingKeys);
            const applied = applySyncedSnapshot(localStorage, syncRecordsToSnapshot(merged, getTodayString()));
            if (applied.status === 'failed') throw new Error(applied.error);
            const state = stateRef.current ?? loadClientState(localStorage, userId, deviceId);
            const next = {
                ...state,
                datasetRevision: bootstrap.revision,
                shadow: bootstrap.records,
                conflictedKeys: remainingKeys,
                lastSyncedAt: new Date().toISOString(),
            };
            stateRef.current = next;
            persistClientState(localStorage, userId, next);
            publish(remainingKeys.length ? 'conflict' : 'synced', next, bootstrap.conflicts);
            if (applied.status === 'applied') window.location.reload();
        } catch (error) {
            const state = stateRef.current;
            if (state) publish('error', state, undefined, 'Konflikt konnte nicht aufgelöst werden.');
            console.error('P2-9 conflict resolution failed', error instanceof Error ? error.message : 'unknown error');
        } finally {
            running.current = false;
        }
    }, [transport, userId, publish, view.conflicts]);

    useEffect(() => {
        if (!transport || !userId) return;
        void syncNow('startup');
        const unsubscribe = transport.subscribe(() => void syncNow('remote'));
        const online = () => void syncNow('online');
        const visible = () => { if (document.visibilityState === 'visible') void syncNow('local'); };
        window.addEventListener('online', online);
        document.addEventListener('visibilitychange', visible);
        const interval = window.setInterval(() => void syncNow('timer'), 15_000);
        return () => {
            unsubscribe();
            window.removeEventListener('online', online);
            document.removeEventListener('visibilitychange', visible);
            window.clearInterval(interval);
        };
    }, [transport, userId, syncNow]);

    return { ...view, syncNow: () => syncNow('local'), resolveConflict };
}
