import type { User } from '@supabase/supabase-js';
import type { RealAuthConfig } from '../config/features';
import type { AuthActionResult, AuthAdapter, AuthUser } from './types';
import { getSupabaseClient } from './supabaseClient';

const toAuthUser = (user: User | null): AuthUser | null => {
    if (!user?.email) return null;
    return { id: user.id, email: user.email };
};

const errorResult = (message: string): AuthActionResult => ({
    status: 'error',
    message: message || 'Die Anmeldung konnte nicht abgeschlossen werden.',
});

export function createSupabaseAuthAdapter(config: RealAuthConfig): AuthAdapter {
    const client = getSupabaseClient(config);

    return {
        async getCurrentUser() {
            const { data, error } = await client.auth.getUser();
            if (error) return null;
            return toAuthUser(data.user);
        },

        onAuthStateChange(listener) {
            const { data } = client.auth.onAuthStateChange((event, session) => {
                listener(toAuthUser(session?.user ?? null), event === 'PASSWORD_RECOVERY');
            });
            return () => data.subscription.unsubscribe();
        },

        async signIn(email, password) {
            const { error } = await client.auth.signInWithPassword({ email, password });
            return error ? errorResult(error.message) : { status: 'ok' };
        },

        async signUp(email, password) {
            const { data, error } = await client.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: config.redirectUrl },
            });
            if (error) return errorResult(error.message);
            return data.session ? { status: 'ok' } : { status: 'confirmation-required' };
        },

        async sendPasswordReset(email) {
            const { error } = await client.auth.resetPasswordForEmail(email, {
                redirectTo: config.redirectUrl,
            });
            return error ? errorResult(error.message) : { status: 'ok' };
        },

        async updatePassword(password) {
            const { error } = await client.auth.updateUser({ password });
            return error ? errorResult(error.message) : { status: 'ok' };
        },

        async signOut() {
            await client.auth.signOut();
        },
    };
}
