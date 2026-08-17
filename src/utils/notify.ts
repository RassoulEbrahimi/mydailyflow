/**
 * notify.ts — display a single foreground notification, safely.
 *
 * This is a *display* helper, not a scheduler. It does not add background
 * delivery of any kind: the caller is still an in-page `setTimeout`, so nothing
 * here fires while the app is closed. See
 * docs/adr/0001-background-reminders-feasibility.md §6.1.
 *
 * Why it exists: `new Notification(...)` throws a `TypeError` in nearly all
 * mobile browsers, including the Android Chrome target, and the supported path
 * there is `ServiceWorkerRegistration.showNotification()`. The app registers a
 * service worker already, so the fix is to prefer that path and keep the
 * constructor as a fallback for browsers where it works (desktop Chrome).
 *
 * Both paths are feature-detected and every failure is contained: a reminder
 * that cannot be displayed must never take the app down with it.
 */

export interface NotifyOptions {
    body?: string;
    tag?: string;
}

/** The slice of the platform this helper touches. Injectable so it can be tested. */
export interface NotifyEnvironment {
    /** Resolves the active service worker registration, if there is one. */
    getRegistration?: () => Promise<{
        showNotification?: (title: string, options?: NotifyOptions) => Promise<void>;
    } | undefined | null>;
    /** The page `Notification` constructor, when the browser exposes a usable one. */
    NotificationCtor?: new (title: string, options?: NotifyOptions) => unknown;
    /** Current permission state; delivery is skipped unless this is 'granted'. */
    permission?: string;
}

export type NotifyResult =
    | 'service-worker'
    | 'page-constructor'
    | 'unsupported'
    | 'permission-denied'
    | 'failed';

/** Reads the real browser environment. Kept separate so tests never touch globals. */
function defaultEnvironment(): NotifyEnvironment {
    const hasNotification = typeof Notification !== 'undefined';
    return {
        getRegistration:
            typeof navigator !== 'undefined' && 'serviceWorker' in navigator
                ? () => navigator.serviceWorker.getRegistration()
                : undefined,
        NotificationCtor: hasNotification ? Notification : undefined,
        permission: hasNotification ? Notification.permission : undefined,
    };
}

/**
 * Shows a notification, preferring the service-worker path.
 *
 * Never throws. Returns which path was used, so callers and tests can assert on
 * the outcome instead of inferring it from side effects.
 */
export async function deliverNotification(
    title: string,
    options: NotifyOptions = {},
    environment: NotifyEnvironment = defaultEnvironment(),
): Promise<NotifyResult> {
    if (environment.permission !== 'granted') return 'permission-denied';

    // 1) Service worker — the path that works on Android Chrome.
    if (environment.getRegistration) {
        try {
            const registration = await environment.getRegistration();
            if (registration && typeof registration.showNotification === 'function') {
                await registration.showNotification(title, options);
                return 'service-worker';
            }
        } catch {
            // Fall through to the page constructor.
        }
    }

    // 2) Page constructor — works on desktop, throws on most mobile browsers.
    if (environment.NotificationCtor) {
        try {
            new environment.NotificationCtor(title, options);
            return 'page-constructor';
        } catch {
            return 'failed';
        }
    }

    return 'unsupported';
}
