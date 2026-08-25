import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealAuthConfig } from '../config/features';
import { getSupabaseClient } from '../auth/supabaseClient';
import {
    emptyManifest,
    type DatasetManifest,
    type FirstSignInDecision,
    type ManifestCounts,
} from './reconciliation';

interface DatasetRow {
    revision: number;
    item_count: number;
    item_counts: ManifestCounts;
    digest: string | null;
    latest_activity: string | null;
    reconciliation_status: 'none' | 'prepared' | 'active';
}

export interface ReconciliationTransport {
    getAccountManifest(): Promise<DatasetManifest>;
    prepare(choice: FirstSignInDecision, local: DatasetManifest, account: DatasetManifest, deviceId: string): Promise<string>;
}

const manifestFromRow = (row: DatasetRow): DatasetManifest => ({
    itemCount: row.item_count,
    revision: row.revision,
    digest: row.digest,
    latestActivity: row.latest_activity,
    counts: row.item_counts,
    reconciliationStatus: row.reconciliation_status,
});

export function createReconciliationTransport(client: SupabaseClient): ReconciliationTransport {
    return {
        async getAccountManifest() {
            const { data, error } = await client
                .from('datasets')
                .select('revision,item_count,item_counts,digest,latest_activity,reconciliation_status')
                .maybeSingle();
            if (error) throw new Error(error.message);
            return data ? manifestFromRow(data as DatasetRow) : emptyManifest();
        },

        async prepare(choice, local, account, deviceId) {
            const { data, error } = await client.rpc('prepare_first_sign_in_reconciliation', {
                p_choice: choice,
                p_local_manifest: local,
                p_expected_remote_revision: account.revision,
                p_device_id: deviceId,
            });
            if (error) throw new Error(error.message);
            if (typeof data !== 'string') throw new Error('Ungültige Reconciliation-Antwort.');
            return data;
        },
    };
}

export function reconciliationTransportFor(config: RealAuthConfig): ReconciliationTransport {
    return createReconciliationTransport(getSupabaseClient(config));
}
