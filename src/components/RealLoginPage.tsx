import React, { useState } from 'react';
import { KeyRound, LogIn, Mail, Waves } from 'lucide-react';
import type { AuthActionResult } from '../auth/types';

interface RealLoginPageProps {
    syncEnabled?: boolean;
    onSignIn(email: string, password: string): Promise<AuthActionResult>;
    onSignUp(email: string, password: string): Promise<AuthActionResult>;
    onReset(email: string): Promise<AuthActionResult>;
}

type Mode = 'sign-in' | 'sign-up' | 'reset';

const messageFor = (result: AuthActionResult, mode: Mode): string => {
    if (result.status === 'error') return result.message;
    if (result.status === 'confirmation-required') {
        return 'Prüfe dein E-Mail-Postfach und bestätige die Adresse, bevor du dich anmeldest.';
    }
    return mode === 'reset'
        ? 'Wenn die Adresse registriert ist, wurde eine E-Mail zum Zurücksetzen gesendet.'
        : '';
};

export default function RealLoginPage({ syncEnabled = false, onSignIn, onSignUp, onReset }: RealLoginPageProps) {
    const [mode, setMode] = useState<Mode>('sign-in');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const selectMode = (next: Mode) => {
        setMode(next);
        setError('');
        setNotice('');
        setPassword('');
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || (mode !== 'reset' && password.length < 8)) {
            setError(mode === 'reset'
                ? 'Bitte gib deine E-Mail-Adresse ein.'
                : 'Bitte gib eine E-Mail-Adresse und ein Passwort mit mindestens 8 Zeichen ein.');
            return;
        }

        setBusy(true);
        setError('');
        setNotice('');
        const result = mode === 'sign-in'
            ? await onSignIn(normalizedEmail, password)
            : mode === 'sign-up'
                ? await onSignUp(normalizedEmail, password)
                : await onReset(normalizedEmail);
        const message = messageFor(result, mode);
        if (result.status === 'error') setError(message);
        else if (message) setNotice(message);
        setBusy(false);
    };

    return (
        <div className="min-h-screen bg-page px-5 font-display flex flex-col items-center justify-center selection:bg-primary selection:text-white">
            <div className="mb-8 flex items-center gap-2 text-primary-text">
                <Waves size={32} strokeWidth={2.5} aria-hidden="true" />
                <span className="text-2xl font-bold tracking-tight text-fg">My Daily Flow</span>
            </div>

            <div className="w-full max-w-sm rounded-[2rem] border border-edge bg-surface-overlay p-7 shadow-2xl">
                <div className="mb-6">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary-text">Sicherer Testzugang</p>
                    <h1 className="text-xl font-bold text-fg">
                        {mode === 'sign-in' ? 'Mit deinem Konto anmelden' : mode === 'sign-up' ? 'Testkonto erstellen' : 'Passwort zurücksetzen'}
                    </h1>
                    <p className="mt-2 text-sm leading-5 text-fg-secondary">
                        Lokale Daten bleiben auf diesem Gerät. Eine neue Anmeldung sperrt automatisch das zuvor aktive Gerät.
                    </p>
                </div>

                <form onSubmit={submit} noValidate>
                    <label htmlFor="real-auth-email" className="mb-2 block text-xs font-semibold tracking-wider text-fg-secondary">E-MAIL</label>
                    <div className="relative mb-4">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint" size={18} aria-hidden="true" />
                        <input
                            id="real-auth-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={event => { setEmail(event.target.value); setError(''); }}
                            className="w-full rounded-2xl border border-edge/50 bg-surface-raised py-3.5 pl-11 pr-4 text-[15px] text-fg placeholder:text-fg-placeholder focus:border-primary/60"
                            placeholder="name@example.com"
                        />
                    </div>

                    {mode !== 'reset' && (
                        <>
                            <label htmlFor="real-auth-password" className="mb-2 block text-xs font-semibold tracking-wider text-fg-secondary">PASSWORT</label>
                            <div className="relative mb-5">
                                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint" size={18} aria-hidden="true" />
                                <input
                                    id="real-auth-password"
                                    type="password"
                                    autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                                    value={password}
                                    onChange={event => { setPassword(event.target.value); setError(''); }}
                                    className="w-full rounded-2xl border border-edge/50 bg-surface-raised py-3.5 pl-11 pr-4 text-[15px] text-fg placeholder:text-fg-placeholder focus:border-primary/60"
                                    placeholder="Mindestens 8 Zeichen"
                                />
                            </div>
                        </>
                    )}

                    {error && <div role="alert" className="mb-4 rounded-2xl border border-danger-border bg-danger-surface px-4 py-3 text-sm font-medium text-danger">{error}</div>}
                    {notice && <div role="status" className="mb-4 rounded-2xl border border-success-border bg-success-surface px-4 py-3 text-sm font-medium text-success">{notice}</div>}

                    <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] bg-primary px-4 font-semibold text-white shadow-[0_8px_25px_rgba(19,91,236,0.35)] disabled:opacity-60">
                        <LogIn size={20} aria-hidden="true" />
                        {busy ? 'Bitte warten…' : mode === 'sign-in' ? 'Anmelden' : mode === 'sign-up' ? 'Konto erstellen' : 'E-Mail senden'}
                    </button>
                </form>

                <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
                    {mode !== 'sign-in' && <button type="button" onClick={() => selectMode('sign-in')} className="min-h-11 font-semibold text-primary-text">Anmelden</button>}
                    {mode !== 'sign-up' && <button type="button" onClick={() => selectMode('sign-up')} className="min-h-11 font-semibold text-primary-text">Registrieren</button>}
                    {mode !== 'reset' && <button type="button" onClick={() => selectMode('reset')} className="min-h-11 font-semibold text-fg-secondary">Passwort vergessen?</button>}
                </div>
            </div>

            <p className="mt-6 max-w-sm text-center text-[11px] leading-5 text-fg-placeholder">
                Sicherer Ein-Gerät-Betrieb · Frankfurt · {syncEnabled ? 'Synchronisierung aktiv' : 'Synchronisierung deaktiviert'}
            </p>
        </div>
    );
}
