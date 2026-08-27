import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BackgroundReminderCapability, RealAuthConfig } from '../config/features';
import { getSupabaseClient } from '../auth/supabaseClient';
import { loadOrCreateDeviceId } from '../sync/clientState';
import type { Task } from '../types/task';
import {
    buildMinimalReminderSchedules,
    createBackgroundReminderTransport,
    decodeVapidPublicKey,
    serializePushSubscription,
    supportsBackgroundReminders,
    type BackgroundReminderStatus,
} from '../reminders/background';

interface BackgroundReminderView {
    status: BackgroundReminderStatus;
    message: string;
    activeCount: number;
    enable(): Promise<void>;
    disable(): Promise<void>;
}

const statusFor = (capability: BackgroundReminderCapability): Pick<BackgroundReminderView, 'status' | 'message'> => {
    if (capability.status === 'disabled') return { status: 'disabled', message: '' };
    if (capability.status === 'misconfigured') return { status: 'misconfigured', message: capability.reason };
    if (!supportsBackgroundReminders()) return {
        status: 'unsupported',
        message: 'Dieser Browser unterstützt keine Hintergrund-Erinnerungen.',
    };
    return { status: 'inactive', message: 'Auf diesem Gerät noch nicht aktiviert.' };
};

export function useBackgroundReminders(
    config: RealAuthConfig | null,
    userId: string | undefined,
    tasks: Task[],
    remindersEnabled: boolean,
    onPermissionChange: (permission: NotificationPermission) => void,
): BackgroundReminderView {
    const capability = config?.backgroundReminders ?? { status: 'disabled' as const };
    const initial = statusFor(capability);
    const [status, setStatus] = useState<BackgroundReminderStatus>(initial.status);
    const [message, setMessage] = useState(initial.message);
    const [activeCount, setActiveCount] = useState(0);
    const mounted = useRef(true);
    const schedules = buildMinimalReminderSchedules(tasks, remindersEnabled);
    const schedulesRef = useRef(schedules);
    schedulesRef.current = schedules;
    const reconcileQueue = useRef<Promise<void>>(Promise.resolve());
    const suppressed = useRef(false);
    const transport = useMemo(
        () => config && capability.status === 'configured'
            ? createBackgroundReminderTransport(getSupabaseClient(config))
            : null,
        [config?.url, config?.publishableKey, capability.status],
    );

    const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

    const reconcile = useCallback(async (subscription?: PushSubscription | null) => {
        if (!transport || !userId || capability.status !== 'configured') return;
        const run = reconcileQueue.current.catch(() => undefined).then(async () => {
            if (suppressed.current) return;
            const registration = await navigator.serviceWorker.ready;
            const current = subscription ?? await registration.pushManager.getSubscription();
            if (!current) {
                if (mounted.current) {
                    setStatus('inactive');
                    setMessage('Auf diesem Gerät noch nicht aktiviert.');
                    setActiveCount(0);
                }
                return;
            }
            const deviceId = loadOrCreateDeviceId(localStorage);
            await transport.register(deviceId, timezone, serializePushSubscription(current));
            const count = await transport.reconcile(deviceId, timezone, schedulesRef.current);
            if (mounted.current) {
                setStatus('active');
                setMessage('Best-Effort-Zustellung ist für dieses Gerät aktiv.');
                setActiveCount(count);
            }
        });
        reconcileQueue.current = run;
        await run;
    }, [transport, userId, capability.status, timezone]);

    const enable = useCallback(async () => {
        if (!transport || !userId || capability.status !== 'configured') return;
        suppressed.current = false;
        setStatus('activating');
        setMessage('Gerät wird registriert…');
        try {
            const permission = Notification.permission === 'granted'
                ? 'granted'
                : await Notification.requestPermission();
            onPermissionChange(permission);
            if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');
            const registration = await navigator.serviceWorker.ready;
            const existing = await registration.pushManager.getSubscription();
            const subscription = existing ?? await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: decodeVapidPublicKey(capability.vapidPublicKey),
            });
            await reconcile(subscription);
        } catch (error) {
            if (mounted.current) {
                setStatus('error');
                setMessage(error instanceof Error ? error.message : 'Aktivierung fehlgeschlagen.');
            }
        }
    }, [transport, userId, capability, onPermissionChange, reconcile]);

    const disable = useCallback(async () => {
        if (!transport || !userId) return;
        suppressed.current = true;
        try {
            const run = reconcileQueue.current.catch(() => undefined).then(async () => {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                const deviceId = loadOrCreateDeviceId(localStorage);
                let serverError: unknown;
                try {
                    await transport.revoke(deviceId);
                } catch (error) {
                    serverError = error;
                }
                // Always invalidate the browser capability even if the server
                // is temporarily unreachable. This prevents a logout from
                // leaving a locally usable endpoint behind.
                const unsubscribed = subscription ? await subscription.unsubscribe() : true;
                if (serverError) throw serverError;
                if (!unsubscribed) throw new Error('Push-Abonnement konnte nicht entfernt werden.');
            });
            reconcileQueue.current = run;
            await run;
            if (mounted.current) {
                setStatus('inactive');
                setMessage('Auf diesem Gerät deaktiviert.');
                setActiveCount(0);
            }
        } catch (error) {
            if (mounted.current) {
                setStatus('error');
                setMessage(error instanceof Error ? error.message : 'Deaktivierung fehlgeschlagen.');
            }
        }
    }, [transport, userId]);

    useEffect(() => {
        mounted.current = true;
        const next = statusFor(capability);
        setStatus(next.status);
        setMessage(next.message);
        setActiveCount(0);
        return () => { mounted.current = false; };
    }, [capability.status, transport, userId]);

    useEffect(() => {
        if (capability.status !== 'configured' || !transport || !userId) return;
        void reconcile().catch(error => {
            if (!mounted.current) return;
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'Status konnte nicht geladen werden.');
        });
    }, [capability.status, transport, userId, reconcile, tasks, remindersEnabled]);

    return { status, message, activeCount, enable, disable };
}
