import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { deliverNotification } from '../src/utils/notify';
import type { NotifyEnvironment } from '../src/utils/notify';

/**
 * Covers the display path only. `deliverNotification` schedules nothing and
 * grants no background capability — the caller is still an in-page timer.
 *
 * The point of these tests is that the Android-Chrome failure mode
 * (`new Notification()` throwing a TypeError) can no longer crash a reminder.
 */

const swEnvironment = (calls: { title: string; body?: string }[]): NotifyEnvironment => ({
    permission: 'granted',
    getRegistration: async () => ({
        showNotification: async (title, options) => {
            calls.push({ title, body: options?.body });
        },
    }),
    // A constructor that would throw, exactly like a mobile browser.
    NotificationCtor: class {
        constructor() {
            throw new TypeError('Illegal constructor');
        }
    } as unknown as NotifyEnvironment['NotificationCtor'],
});

describe('deliverNotification', () => {
    it('prefers the service worker when a registration is available', async () => {
        const calls: { title: string; body?: string }[] = [];
        const result = await deliverNotification('Titel', { body: 'Text' }, swEnvironment(calls));

        assert.equal(result, 'service-worker');
        assert.deepEqual(calls, [{ title: 'Titel', body: 'Text' }]);
    });

    it('does not throw when the page constructor is unusable (the Android case)', async () => {
        // Service worker present, constructor throws — the reminder must still
        // be delivered and must not propagate the TypeError.
        const calls: { title: string; body?: string }[] = [];
        await assert.doesNotReject(() =>
            deliverNotification('Titel', {}, swEnvironment(calls)),
        );
        assert.equal(calls.length, 1);
    });

    it('swallows a throwing constructor when there is no service worker', async () => {
        const result = await deliverNotification('Titel', {}, {
            permission: 'granted',
            getRegistration: undefined,
            NotificationCtor: class {
                constructor() {
                    throw new TypeError('Illegal constructor');
                }
            } as unknown as NotifyEnvironment['NotificationCtor'],
        });
        assert.equal(result, 'failed');
    });

    it('falls back to the page constructor when no registration exists', async () => {
        const made: string[] = [];
        const result = await deliverNotification('Titel', { body: 'B' }, {
            permission: 'granted',
            getRegistration: async () => undefined,
            NotificationCtor: class {
                constructor(title: string) {
                    made.push(title);
                }
            } as unknown as NotifyEnvironment['NotificationCtor'],
        });

        assert.equal(result, 'page-constructor');
        assert.deepEqual(made, ['Titel']);
    });

    it('falls back when the registration cannot show notifications', async () => {
        const made: string[] = [];
        const result = await deliverNotification('Titel', {}, {
            permission: 'granted',
            getRegistration: async () => ({}),
            NotificationCtor: class {
                constructor(title: string) {
                    made.push(title);
                }
            } as unknown as NotifyEnvironment['NotificationCtor'],
        });

        assert.equal(result, 'page-constructor');
        assert.deepEqual(made, ['Titel']);
    });

    it('falls back when getRegistration rejects', async () => {
        const made: string[] = [];
        const result = await deliverNotification('Titel', {}, {
            permission: 'granted',
            getRegistration: async () => {
                throw new Error('no registration');
            },
            NotificationCtor: class {
                constructor(title: string) {
                    made.push(title);
                }
            } as unknown as NotifyEnvironment['NotificationCtor'],
        });

        assert.equal(result, 'page-constructor');
        assert.deepEqual(made, ['Titel']);
    });

    it('does nothing without permission', async () => {
        const calls: { title: string; body?: string }[] = [];
        const env = swEnvironment(calls);
        const result = await deliverNotification('Titel', {}, { ...env, permission: 'default' });

        assert.equal(result, 'permission-denied');
        assert.equal(calls.length, 0, 'no notification is shown without permission');
    });

    it('reports unsupported when the platform offers neither path', async () => {
        const result = await deliverNotification('Titel', {}, {
            permission: 'granted',
            getRegistration: undefined,
            NotificationCtor: undefined,
        });
        assert.equal(result, 'unsupported');
    });
});
