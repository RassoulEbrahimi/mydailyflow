/**
 * fakeAuth.ts — Demo-only fake authentication utility.
 *
 * ⚠️  NOT SECURE. For development/demo use only.
 *     Credentials are embedded in Vite env variables and visible in the bundle.
 *     Remove this entire auth layer before any real production deployment.
 */

const SESSION_KEY = 'mdf_auth_session';
const SESSION_DAYS = 5;

interface AuthSession {
    username: string;
    expiresAt: number | null; // null = sessionStorage (no expiry tracking needed)
}

// ─── Credential validation ────────────────────────────────────────────────────

/**
 * Returns the normalized username if credentials match any of the 5 env-variable
 * users, or null if they do not.
 */
export function validateCredentials(username: string, password: string): string | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env: Record<string, string | undefined> = (import.meta as any).env ?? {};
    for (let i = 1; i <= 5; i++) {
        const envUser = (env[`VITE_FAKE_USER_${i}`] ?? '').trim();
        const envPass = (env[`VITE_FAKE_PASS_${i}`] ?? '').trim();
        if (!envUser) continue;

        const usernameMatch = envUser.toLowerCase() === username.trim().toLowerCase();
        const passwordMatch = envPass === password; // exact match

        if (usernameMatch && passwordMatch) {
            return envUser; // return the canonical username from env
        }
    }
    return null;
}

// ─── Session persistence ──────────────────────────────────────────────────────

/**
 * Persists the auth session.
 * - remember=true  → localStorage with a 5-day expiry timestamp
 * - remember=false → sessionStorage (cleared on browser restart)
 */
export function saveSession(username: string, remember: boolean): void {
    const session: AuthSession = {
        username,
        expiresAt: remember ? Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 : null,
    };
    const value = JSON.stringify(session);
    if (remember) {
        localStorage.setItem(SESSION_KEY, value);
    } else {
        sessionStorage.setItem(SESSION_KEY, value);
    }
}

/**
 * Reads the current session from localStorage or sessionStorage.
 * Returns the username string if a valid (non-expired) session exists, else null.
 */
export function loadSession(): string | null {
    // Check localStorage first (remember me)
    let raw = localStorage.getItem(SESSION_KEY);
    let fromLocal = true;

    if (!raw) {
        raw = sessionStorage.getItem(SESSION_KEY);
        fromLocal = false;
    }

    if (!raw) return null;

    try {
        const session: AuthSession = JSON.parse(raw);
        if (!session?.username) return null;

        // Check expiry (only localStorage sessions have an expiresAt)
        if (fromLocal && session.expiresAt !== null) {
            if (Date.now() > session.expiresAt) {
                // Expired — force logout
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
        }

        return session.username;
    } catch {
        // Corrupted session
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        return null;
    }
}

/**
 * Removes the auth session from both storage types.
 */
export function clearSession(): void {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
}
