import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '../types/task';
import { hasTime } from '../utils/taskUtils';

export type BackgroundReminderStatus =
    | 'disabled'
    | 'misconfigured'
    | 'unsupported'
    | 'inactive'
    | 'activating'
    | 'active'
    | 'error';

export interface MinimalReminderSchedule {
    taskId: string;
    date: string;
    time: string;
}

export interface PushSubscriptionPayload {
    endpoint: string;
    p256dh: string;
    auth: string;
}

export interface BackgroundReminderTransport {
    register(deviceId: string, timezone: string, subscription: PushSubscriptionPayload): Promise<void>;
    revoke(deviceId: string): Promise<void>;
    reconcile(deviceId: string, timezone: string, schedules: MinimalReminderSchedule[]): Promise<number>;
}

export const supportsBackgroundReminders = (): boolean =>
    typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;

export function decodeVapidPublicKey(value: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const binary = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

/** No task title or notes cross this boundary. Push scheduling only needs the
 * opaque task id and its local wall-clock fields. */
export function buildMinimalReminderSchedules(tasks: Task[], enabled: boolean): MinimalReminderSchedule[] {
    if (!enabled) return [];
    return tasks
        .filter(task => !task.completed && task.reminderEnabled !== false && Boolean(task.date) && hasTime(task))
        .map(task => ({ taskId: task.id, date: task.date, time: task.time }))
        .sort((left, right) => left.taskId.localeCompare(right.taskId));
}

export function serializePushSubscription(subscription: PushSubscription): PushSubscriptionPayload {
    const json = subscription.toJSON();
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!json.endpoint || !p256dh || !auth) throw new Error('Unvollständiges Push-Abonnement.');
    return { endpoint: json.endpoint, p256dh, auth };
}

export function createBackgroundReminderTransport(client: SupabaseClient): BackgroundReminderTransport {
    return {
        async register(deviceId, timezone, subscription) {
            const { error } = await client.rpc('register_push_subscription', {
                p_device_id: deviceId,
                p_timezone: timezone,
                p_endpoint: subscription.endpoint,
                p_p256dh: subscription.p256dh,
                p_auth: subscription.auth,
            });
            if (error) throw new Error(error.message);
        },
        async revoke(deviceId) {
            const { error } = await client.rpc('revoke_push_subscription', { p_device_id: deviceId });
            if (error) throw new Error(error.message);
        },
        async reconcile(deviceId, timezone, schedules) {
            const { data, error } = await client.rpc('reconcile_reminder_schedules', {
                p_device_id: deviceId,
                p_timezone: timezone,
                p_schedules: schedules,
            });
            if (error) throw new Error(error.message);
            const value = data as { activeCount?: unknown };
            if (typeof value?.activeCount !== 'number') throw new Error('Ungültige Erinnerungsantwort.');
            return value.activeCount;
        },
    };
}
