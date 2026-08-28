import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseAuthAdapter } from '../auth/supabaseAuthAdapter';
import type { AuthActionResult, AuthUser } from '../auth/types';
import type { RealAuthConfig } from '../config/features';

export interface RealAuthState {
    status: 'loading' | 'signed-out' | 'signed-in' | 'password-recovery';
    user: AuthUser | null;
    signIn(email: string, password: string): Promise<AuthActionResult>;
    signUp(email: string, password: string): Promise<AuthActionResult>;
    sendPasswordReset(email: string): Promise<AuthActionResult>;
    updatePassword(password: string): Promise<AuthActionResult>;
    signOut(): Promise<void>;
    signOutLocal(): Promise<void>;
}

export function useRealAuth(config: RealAuthConfig): RealAuthState {
    const adapter = useMemo(
        () => createSupabaseAuthAdapter(config),
        [config.url, config.publishableKey, config.redirectUrl],
    );
    const [status, setStatus] = useState<RealAuthState['status']>('loading');
    const [user, setUser] = useState<AuthUser | null>(null);
    const passwordRecoveryRef = useRef(false);

    useEffect(() => {
        let active = true;
        const applyUser = (next: AuthUser | null, recoveryEvent = false) => {
            if (!active) return;
            if (!next) passwordRecoveryRef.current = false;
            else if (recoveryEvent) passwordRecoveryRef.current = true;
            setUser(next);
            setStatus(next ? (passwordRecoveryRef.current ? 'password-recovery' : 'signed-in') : 'signed-out');
        };

        const unsubscribe = adapter.onAuthStateChange(applyUser);
        void adapter.getCurrentUser().then(user => applyUser(user));
        return () => {
            active = false;
            unsubscribe();
        };
    }, [adapter]);

    const updatePassword = async (password: string): Promise<AuthActionResult> => {
        const result = await adapter.updatePassword(password);
        if (result.status === 'ok') {
            passwordRecoveryRef.current = false;
            setStatus('signed-in');
        }
        return result;
    };

    return {
        status,
        user,
        signIn: adapter.signIn,
        signUp: adapter.signUp,
        sendPasswordReset: adapter.sendPasswordReset,
        updatePassword,
        signOut: adapter.signOut,
        signOutLocal: adapter.signOutLocal,
    };
}
