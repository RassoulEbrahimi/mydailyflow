import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { RealAuthConfig } from '../config/features';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { MutationReceipt, SyncConflict, SyncMutation, SyncRecord } from './types';

interface RecordRow {
    entity_key: string;
    kind: SyncRecord['kind'];
    payload: Record<string, unknown>;
    field_revisions: Record<string, number>;
    revision: number;
    tombstone: boolean;
}

interface ConflictRow {
    id: string;
    mutation_id: string;
    entity_key: string;
    kind: SyncConflict['kind'];
    conflicting_fields: string[];
    reason: SyncConflict['reason'];
    server_payload: Record<string, unknown>;
    client_changes: Record<string, unknown>;
    client_removed_fields: string[];
    client_operation: SyncConflict['clientOperation'];
    created_at: string;
}

export interface SyncBootstrap {
    revision: number;
    records: Record<string, SyncRecord>;
    conflicts: SyncConflict[];
    reconciliationChoice: string | null;
}

export interface SyncTransport {
    registerDevice(deviceId: string, revision: number): Promise<number>;
    fetchBootstrap(deviceId: string): Promise<SyncBootstrap>;
    applyMutation(mutation: SyncMutation): Promise<MutationReceipt>;
    resolveConflict(
        conflictId: string,
        resolution: 'keep-server' | 'use-device',
        deviceId: string,
        deviceRecord: { present: boolean; payload: Record<string, unknown> | null },
    ): Promise<number>;
    acknowledge(deviceId: string, revision: number): Promise<void>;
    subscribe(onRemoteChange: () => void): () => void;
}

const mapRecord = (row: RecordRow): SyncRecord => ({
    key: row.entity_key,
    kind: row.kind,
    payload: row.payload,
    fieldRevisions: row.field_revisions,
    revision: row.revision,
    tombstone: row.tombstone,
});

const mapConflict = (row: ConflictRow): SyncConflict => ({
    id: row.id,
    mutationId: row.mutation_id,
    key: row.entity_key,
    kind: row.kind,
    conflictingFields: row.conflicting_fields,
    reason: row.reason,
    serverPayload: row.server_payload,
    clientChanges: row.client_changes,
    clientRemovedFields: row.client_removed_fields,
    clientOperation: row.client_operation,
    createdAt: row.created_at,
});

export function createSyncTransport(client: SupabaseClient): SyncTransport {
    return {
        async registerDevice(deviceId, revision) {
            const { data, error } = await client.rpc('register_sync_device', {
                p_device_id: deviceId,
                p_last_observed_revision: revision,
            });
            if (error) throw new Error(error.message);
            const value = data as { revision?: unknown };
            if (typeof value?.revision !== 'number') throw new Error('Ungültige Geräteantwort.');
            return value.revision;
        },

        async fetchBootstrap(deviceId) {
            const [datasetResult, recordsResult, conflictsResult, intentResult] = await Promise.all([
                client.from('datasets').select('revision').single(),
                client.from('sync_records').select('entity_key,kind,payload,field_revisions,revision,tombstone'),
                client.from('sync_conflicts')
                    .select('id,mutation_id,entity_key,kind,conflicting_fields,reason,server_payload,client_changes,client_removed_fields,client_operation,created_at')
                    .is('resolved_at', null)
                    .order('created_at', { ascending: true }),
                client.from('reconciliation_intents').select('choice').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
            ]);
            for (const result of [datasetResult, recordsResult, conflictsResult, intentResult]) {
                if (result.error) throw new Error(result.error.message);
            }
            const records = Object.fromEntries((recordsResult.data as RecordRow[]).map(row => {
                const entry = mapRecord(row);
                return [entry.key, entry];
            }));
            return {
                revision: Number((datasetResult.data as { revision: number }).revision),
                records,
                conflicts: (conflictsResult.data as ConflictRow[]).map(mapConflict),
                reconciliationChoice: (intentResult.data as { choice?: string } | null)?.choice ?? null,
            };
        },

        async applyMutation(mutation) {
            const { data, error } = await client.rpc('apply_sync_mutation', {
                p_mutation_id: mutation.mutationId,
                p_device_id: mutation.deviceId,
                p_entity_key: mutation.key,
                p_kind: mutation.kind,
                p_base_revision: mutation.baseRevision,
                p_operation: mutation.operation,
                p_changes: mutation.changes ?? {},
                p_removed_fields: mutation.removedFields ?? [],
                p_client_timestamp: mutation.clientTimestamp,
            });
            if (error) throw new Error(error.message);
            const value = data as Record<string, unknown>;
            if ((value.status !== 'applied' && value.status !== 'conflict') || typeof value.revision !== 'number') {
                throw new Error('Ungültige Mutationsantwort.');
            }
            return {
                mutationId: String(value.mutationId),
                status: value.status,
                revision: value.revision,
                conflictId: typeof value.conflictId === 'string' ? value.conflictId : null,
            };
        },

        async resolveConflict(conflictId, resolution, deviceId, deviceRecord) {
            const { data, error } = await client.rpc('resolve_sync_conflict', {
                p_conflict_id: conflictId,
                p_resolution: resolution,
                p_device_id: deviceId,
                p_device_present: deviceRecord.present,
                p_device_payload: deviceRecord.payload,
            });
            if (error) throw new Error(error.message);
            const value = data as { revision?: unknown };
            if (typeof value?.revision !== 'number') throw new Error('Ungültige Konfliktantwort.');
            return value.revision;
        },

        async acknowledge(deviceId, revision) {
            const { error } = await client.rpc('acknowledge_sync_revision', {
                p_device_id: deviceId,
                p_revision: revision,
            });
            if (error) throw new Error(error.message);
        },

        subscribe(onRemoteChange) {
            let channel: RealtimeChannel | null = client
                .channel(`mdf-sync-${Math.random().toString(36).slice(2)}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'datasets' }, onRemoteChange)
                .subscribe();
            return () => {
                if (!channel) return;
                void client.removeChannel(channel);
                channel = null;
            };
        },
    };
}

export function syncTransportFor(config: RealAuthConfig): SyncTransport {
    return createSyncTransport(getSupabaseClient(config));
}
