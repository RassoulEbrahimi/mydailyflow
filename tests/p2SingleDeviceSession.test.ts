import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseSingleDeviceSessionResponse } from '../src/auth/singleDeviceSession';

const migration = readFileSync(
    new URL('../supabase/migrations/202608290001_p2_11_single_active_device.sql', import.meta.url),
    'utf8',
);

test('single-device RPC responses fail closed unless status is recognized', () => {
    assert.deepEqual(parseSingleDeviceSessionResponse({ status: 'active', replacedDevice: true }), {
        status: 'active', replacedDevice: true,
    });
    assert.deepEqual(parseSingleDeviceSessionResponse({ status: 'displaced', replacedDevice: true }), {
        status: 'displaced', replacedDevice: false,
    });
    assert.throws(() => parseSingleDeviceSessionResponse({ status: 'unknown' }), /Ungültige Sitzungsantwort/);
    assert.throws(() => parseSingleDeviceSessionResponse(null), /Ungültige Sitzungsantwort/);
});

test('single-device migration makes explicit takeover distinct from restored-session verification', () => {
    assert.match(migration, /p_allow_takeover boolean default false/);
    assert.match(migration, /elsif not p_allow_takeover or v_session_created_at <= v_existing\.session_created_at then/);
    assert.match(migration, /from auth\.sessions[\s\S]*?id = v_session and user_id = v_owner/);
    assert.match(migration, /session_id = v_session[\s\S]*?device_id = p_device_id/);
    assert.match(migration, /perform public\.assert_active_account_session\(p_device_id\)/);
});

test('single-device migration revokes old sync and push paths and gates every direct sync read', () => {
    assert.match(migration, /update public\.sync_devices[\s\S]*?id = p_device_id/);
    assert.match(migration, /update public\.push_subscriptions[\s\S]*?device_id <> p_device_id/);
    assert.match(migration, /delivery\.state in \('pending', 'leased'\)/);
    for (const table of ['datasets', 'reconciliation_intents', 'sync_devices', 'sync_records', 'sync_mutation_receipts', 'sync_conflicts']) {
        assert.match(migration, new RegExp(`public\\.${table} for select to authenticated[\\s\\S]*?is_active_account_session\\(null\\)`));
    }
});
