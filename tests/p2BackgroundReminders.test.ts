import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Task } from '../src/types/task';
import {
    buildMinimalReminderSchedules,
    createBackgroundReminderTransport,
    decodeVapidPublicKey,
    serializePushSubscription,
} from '../src/reminders/background';

const task = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-a', title: 'خصوصی و محرمانه', notes: 'never leave the device',
    time: '09:30', duration: '30m', timeBlock: 'morning', completed: false,
    completedAt: null, priority: 'medium', createdAt: '2026-08-27T07:00:00.000Z',
    date: '2026-08-28', reminderEnabled: true, ...overrides,
});

test('minimal scheduling projection excludes private task content and cancels by omission', () => {
    const schedules = buildMinimalReminderSchedules([
        task(),
        task({ id: 'untimed', time: '' }),
        task({ id: 'completed', completed: true, completedAt: '2026-08-27T08:00:00.000Z' }),
        task({ id: 'disabled', reminderEnabled: false }),
    ], true);
    assert.deepEqual(schedules, [{ taskId: 'task-a', date: '2026-08-28', time: '09:30' }]);
    assert.doesNotMatch(JSON.stringify(schedules), /خصوصی|محرمانه|never leave|title|notes/i);
    assert.deepEqual(buildMinimalReminderSchedules([task()], false), []);
});

test('VAPID and PushSubscription helpers validate the browser boundary', () => {
    assert.deepEqual([...decodeVapidPublicKey('AQID')], [1, 2, 3]);
    const payload = serializePushSubscription({
        toJSON: () => ({ endpoint: 'https://push.example/sub', keys: { p256dh: 'public-key', auth: 'auth-key' } }),
    } as unknown as PushSubscription);
    assert.deepEqual(payload, {
        endpoint: 'https://push.example/sub', p256dh: 'public-key', auth: 'auth-key',
    });
    assert.throws(() => serializePushSubscription({ toJSON: () => ({ endpoint: 'https://push.example/sub' }) } as PushSubscription));
});

test('Supabase transport calls only owner-scoped RPCs and accepts a numeric reconciliation result', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client = {
        rpc: async (name: string, args: Record<string, unknown>) => {
            calls.push({ name, args });
            return name === 'reconcile_reminder_schedules'
                ? { data: { activeCount: 2 }, error: null }
                : { data: { status: 'ok' }, error: null };
        },
    } as unknown as SupabaseClient;
    const transport = createBackgroundReminderTransport(client);
    await transport.register('device-a', 'Europe/Berlin', { endpoint: 'https://push.example', p256dh: 'p', auth: 'a' });
    assert.equal(await transport.reconcile('device-a', 'Europe/Berlin', [{ taskId: 'task-a', date: '2026-08-28', time: '09:30' }]), 2);
    await transport.revoke('device-a');
    assert.deepEqual(calls.map(call => call.name), [
        'register_push_subscription', 'reconcile_reminder_schedules', 'revoke_push_subscription',
    ]);
    assert.equal(calls.some(call => Object.keys(call.args).some(key => /owner|user/i.test(key))), false);
});

test('P2-10 migration protects capabilities, derives UTC, and leases deliveries atomically', () => {
    const sql = readFileSync('supabase/migrations/202608270001_p2_10_background_reminders.sql', 'utf8');
    for (const table of ['push_subscriptions', 'reminder_schedules', 'reminder_deliveries']) {
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    }
    assert.match(sql, /revoke all on public\.push_subscriptions, public\.reminder_schedules, public\.reminder_deliveries\s+from public, anon, authenticated/i);
    assert.match(sql, /vault\.create_secret/i);
    assert.match(sql, /vault\.update_secret/i);
    assert.match(sql, /delete from vault\.secrets/i);
    assert.match(sql, /at time zone p_timezone - interval '10 minutes'/i);
    assert.match(sql, /for update of d skip locked/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /lease_token = gen_random_uuid\(\)/i);
    assert.match(sql, /unique \(schedule_id, schedule_generation, subscription_id\)/i);
    assert.match(sql, /d\.schedule_generation <> s\.generation/i);
    assert.match(sql, /state = 'cancelled'/i);
    assert.match(sql, /p_outcome = 'expired-subscription'/i);
    assert.match(sql, /then 'delivered' else 'expired' end/i);
    assert.doesNotMatch(sql, /task_title|task_notes|service[_-]?role[_-]?key|vapid_private/i);
});

test('dispatcher and service worker keep notification content generic', () => {
    const dispatcher = readFileSync('supabase/functions/dispatch-reminders/index.ts', 'utf8');
    const worker = readFileSync('public/service-worker.js', 'utf8');
    assert.match(dispatcher, /Deno\.env\.get\('VAPID_PRIVATE_KEY'\)/);
    assert.match(dispatcher, /claim_due_reminder_deliveries/);
    assert.match(dispatcher, /complete_reminder_delivery/);
    assert.match(dispatcher, /statusCode === 404 \|\| statusCode === 410/);
    assert.doesNotMatch(dispatcher, /console\.log|task\.title|task_title/);
    assert.match(worker, /addEventListener\('push'/);
    assert.match(worker, /Eine geplante Aufgabe beginnt bald\./);
    assert.match(worker, /addEventListener\('notificationclick'/);
});

test('the client serializes reconciliation and logout revokes the device subscription', () => {
    const hook = readFileSync('src/hooks/useBackgroundReminders.ts', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    assert.match(hook, /reconcileQueue\.current\.catch\(\(\) => undefined\)\.then/);
    assert.match(hook, /schedulesRef\.current/);
    assert.match(hook, /suppressed\.current = true/);
    assert.match(app, /await backgroundReminders\.disable\(\);\s*logout\(\);/);
});
