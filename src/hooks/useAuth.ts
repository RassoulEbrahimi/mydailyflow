/**
 * useAuth.ts — React hook for demo-only fake authentication.
 *
 * ⚠️  NOT SECURE. Demo use only.
 */

import { useState } from 'react';
import { validateCredentials, saveSession, loadSession, clearSession } from '../utils/fakeAuth';

export interface AuthState {
    /** Authenticated username, or null if not logged in. */
    user: string | null;
    /** Attempt login. Returns true on success, false on failure. */
    login: (username: string, password: string, remember: boolean) => boolean;
    /** Clear the session and reset auth state. */
    logout: () => void;
}

export function useAuth(): AuthState {
    // Synchronous initial state read from storage
    const [user, setUser] = useState<string | null>(() => loadSession());

    const login = (username: string, password: string, remember: boolean): boolean => {
        const canonicalUser = validateCredentials(username, password);
        if (canonicalUser === null) return false;
        saveSession(canonicalUser, remember);
        setUser(canonicalUser);
        return true;
    };

    const logout = (): void => {
        clearSession();
        setUser(null);
    };

    return { user, login, logout };
}
