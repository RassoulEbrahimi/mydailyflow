import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RealAuthConfig } from '../config/features';

let client: SupabaseClient | null = null;
let clientKey = '';

/** The vendor SDK is constructed only after the real-auth flag and config pass. */
export function getSupabaseClient(config: RealAuthConfig): SupabaseClient {
    const nextKey = `${config.url}|${config.publishableKey}`;
    if (client && clientKey === nextKey) return client;

    client = createClient(config.url, config.publishableKey, {
        auth: {
            flowType: 'pkce',
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            storageKey: 'mdf_supabase_auth',
        },
    });
    clientKey = nextKey;
    return client;
}
