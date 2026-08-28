import type { SupabaseClient } from '@supabase/supabase-js';
import type { RealAuthConfig } from '../config/features';
import { getSupabaseClient } from './supabaseClient';

export type SingleDeviceSessionResult =
    | { status: 'active'; replacedDevice: boolean }
    | { status: 'displaced'; replacedDevice: false };

export interface SingleDeviceSessionTransport {
    activate(deviceId: string, allowTakeover: boolean): Promise<SingleDeviceSessionResult>;
    verify(deviceId: string): Promise<SingleDeviceSessionResult>;
}

export function parseSingleDeviceSessionResponse(value: unknown): SingleDeviceSessionResult {
    if (!value || typeof value !== 'object') throw new Error('Ungültige Sitzungsantwort.');
    const response = value as Record<string, unknown>;
    if (response.status === 'active') {
        return { status: 'active', replacedDevice: response.replacedDevice === true };
    }
    if (response.status === 'displaced') {
        return { status: 'displaced', replacedDevice: false };
    }
    throw new Error('Ungültige Sitzungsantwort.');
}

export function createSingleDeviceSessionTransport(client: SupabaseClient): SingleDeviceSessionTransport {
    return {
        async activate(deviceId, allowTakeover) {
            const { data, error } = await client.rpc('activate_single_device_session', {
                p_device_id: deviceId,
                p_allow_takeover: allowTakeover,
            });
            if (error) throw new Error(error.message);
            return parseSingleDeviceSessionResponse(data);
        },

        async verify(deviceId) {
            const { data, error } = await client.rpc('verify_single_device_session', {
                p_device_id: deviceId,
            });
            if (error) throw new Error(error.message);
            return parseSingleDeviceSessionResponse(data);
        },
    };
}

export function singleDeviceSessionTransportFor(config: RealAuthConfig): SingleDeviceSessionTransport {
    return createSingleDeviceSessionTransport(getSupabaseClient(config));
}
