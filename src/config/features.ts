export interface RealAuthConfig {
    url: string;
    publishableKey: string;
    redirectUrl: string;
    /** Independent kill switch: authentication may run while sync stays inert. */
    syncEnabled: boolean;
    /** Independent, fail-closed Web Push capability. It never turns on merely
     * because real auth or sync is enabled. */
    backgroundReminders: BackgroundReminderCapability;
}

export type BackgroundReminderCapability =
    | { status: 'disabled' }
    | { status: 'misconfigured'; reason: string }
    | { status: 'configured'; vapidPublicKey: string };

type FeatureConfig =
    | { status: 'disabled' }
    | { status: 'misconfigured'; reason: string }
    | { status: 'configured'; value: RealAuthConfig };

type PublicEnv = Record<string, string | boolean | undefined>;
const env = (import.meta as unknown as { env?: PublicEnv }).env ?? {};

/**
 * Deliberately opt-in. A deployed build that does not set this exact value keeps
 * the existing demo gate and never initializes the Supabase SDK.
 */
export const REAL_AUTH_ENABLED = env.VITE_REAL_AUTH_ENABLED === 'true';

export function resolveRealAuthConfig(
    source: PublicEnv,
    baseUrl: string,
    origin: string,
): FeatureConfig {
    if (source.VITE_REAL_AUTH_ENABLED !== 'true') return { status: 'disabled' };

    const url = String(source.VITE_SUPABASE_URL ?? '').trim();
    const publishableKey = String(source.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
    if (!url || !publishableKey) {
        return { status: 'misconfigured', reason: 'Supabase-Konfiguration fehlt.' };
    }

    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
            return { status: 'misconfigured', reason: 'Supabase-Projekt-URL ist ungültig.' };
        }
    } catch {
        return { status: 'misconfigured', reason: 'Supabase-Projekt-URL ist ungültig.' };
    }

    const syncEnabled = source.VITE_SYNC_ENABLED === 'true';
    const backgroundRequested = source.VITE_BACKGROUND_REMINDERS_ENABLED === 'true';
    const vapidPublicKey = String(source.VITE_VAPID_PUBLIC_KEY ?? '').trim();
    let backgroundReminders: BackgroundReminderCapability = { status: 'disabled' };
    if (backgroundRequested && !syncEnabled) {
        backgroundReminders = {
            status: 'misconfigured',
            reason: 'Hintergrund-Erinnerungen benötigen die Synchronisierung.',
        };
    } else if (backgroundRequested && !/^[A-Za-z0-9_-]{80,120}$/.test(vapidPublicKey)) {
        backgroundReminders = {
            status: 'misconfigured',
            reason: 'Der öffentliche Web-Push-Schlüssel fehlt oder ist ungültig.',
        };
    } else if (backgroundRequested) {
        backgroundReminders = { status: 'configured', vapidPublicKey };
    }

    return {
        status: 'configured',
        value: {
            url,
            publishableKey,
            redirectUrl: new URL(baseUrl, origin).toString(),
            syncEnabled,
            backgroundReminders,
        },
    };
}

export function getRealAuthConfig(): FeatureConfig {
    return resolveRealAuthConfig(env, import.meta.env.BASE_URL, window.location.origin);
}
