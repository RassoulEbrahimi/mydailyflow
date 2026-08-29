import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    ACCOUNT_DELETE_PHRASE,
    accountDeletionError,
    passwordChangeError,
} from '../src/auth/accountLifecycle';

const edgeFunction = readFileSync(
    new URL('../supabase/functions/delete-account/index.ts', import.meta.url),
    'utf8',
);
const functionConfig = readFileSync(
    new URL('../supabase/config.toml', import.meta.url),
    'utf8',
);

test('password changes require the current password, a distinct strong password, and confirmation', () => {
    assert.match(passwordChangeError('', 'abcdefghijkl', 'abcdefghijkl') ?? '', /aktuelles Passwort/);
    assert.match(passwordChangeError('old-password', 'short', 'short') ?? '', /mindestens 12/);
    assert.match(passwordChangeError('same-password', 'same-password', 'same-password') ?? '', /unterscheiden/);
    assert.match(passwordChangeError('old-password', 'new-password-12', 'different') ?? '', /stimmen nicht/);
    assert.equal(passwordChangeError('old-password', 'new-password-12', 'new-password-12'), null);
});

test('account deletion requires an unchanged exported backup and exact account confirmations', () => {
    const valid = {
        accountEmail: 'person@example.com',
        typedEmail: ' Person@Example.com ',
        typedPhrase: ACCOUNT_DELETE_PHRASE,
        backupMatches: true,
    };
    assert.equal(accountDeletionError(valid), null);
    assert.match(accountDeletionError({ ...valid, backupMatches: false }) ?? '', /Backup/);
    assert.match(accountDeletionError({ ...valid, typedEmail: 'other@example.com' }) ?? '', /E-Mail/);
    assert.match(accountDeletionError({ ...valid, typedPhrase: 'löschen' }) ?? '', /exakt/);
});

test('delete-account function verifies caller, active device and confirmations before admin deletion', () => {
    assert.match(edgeFunction, /auth\.getUser\(\)/);
    assert.match(edgeFunction, /rpc\('is_active_account_session'/);
    assert.match(edgeFunction, /confirmation !== 'KONTO LÖSCHEN'/);
    assert.match(edgeFunction, /user\.email\.toLowerCase\(\) !== email/);
    assert.match(edgeFunction, /auth\.admin\.deleteUser\(user\.id, false\)/);
    assert.doesNotMatch(edgeFunction, /console\.(?:log|error)/);
    assert.match(functionConfig, /\[functions\.delete-account\]\s+verify_jwt = false/);
});
