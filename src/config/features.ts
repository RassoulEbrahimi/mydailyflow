export interface RealAuthConfig {
    url: string;
    publishableKey: string;
    redirectUrl: string;
}

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

    return {
        status: 'configured',
        value: { url, publishableKey, redirectUrl: new URL(baseUrl, origin).toString() },
    };
}

export function getRealAuthConfig(): FeatureConfig {
    return resolveRealAuthConfig(env, import.meta.env.BASE_URL, window.location.origin);
}
