import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Waves } from 'lucide-react';
import type { AuthActionResult } from '../auth/types';

interface PasswordRecoveryPageProps {
    onUpdate(password: string): Promise<AuthActionResult>;
    onLogout(): void;
}

export default function PasswordRecoveryPage({ onUpdate, onLogout }: PasswordRecoveryPageProps) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (password.length < 8) {
            setError('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
            return;
        }
        if (password !== confirmation) {
            setError('Die Passwörter stimmen nicht überein.');
            return;
        }
        setBusy(true);
        setError('');
        const result = await onUpdate(password);
        if (result.status === 'error') setError(result.message);
        setBusy(false);
    };

    return (
        <main className="min-h-screen bg-page px-5 font-display flex items-center justify-center text-fg">
            <div className="w-full max-w-sm">
                <div className="mb-7 flex items-center justify-center gap-2">
                    <Waves size={30} className="text-primary-text" aria-hidden="true" />
                    <span className="text-2xl font-bold">My Daily Flow</span>
                </div>
                <section className="rounded-[2rem] border border-edge bg-surface-overlay p-7 shadow-2xl">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary-text">Sichere Wiederherstellung</p>
                    <h1 className="mt-1 text-xl font-bold">Neues Passwort festlegen</h1>
                    <p className="mt-2 text-sm leading-5 text-fg-secondary">Der Wiederherstellungslink wurde bestätigt. Lege jetzt dein neues Passwort fest.</p>
                    <form onSubmit={submit} className="mt-6">
                        <label htmlFor="recovery-password" className="mb-2 block text-xs font-semibold text-fg-secondary">NEUES PASSWORT</label>
                        <div className="relative mb-4">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint" size={18} aria-hidden="true" />
                            <input id="recovery-password" type="password" autoComplete="new-password" value={password} onChange={event => { setPassword(event.target.value); setError(''); }} className="w-full rounded-2xl border border-edge bg-surface-raised py-3.5 pl-11 pr-4 text-fg" />
                        </div>
                        <label htmlFor="recovery-confirmation" className="mb-2 block text-xs font-semibold text-fg-secondary">PASSWORT BESTÄTIGEN</label>
                        <input id="recovery-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => { setConfirmation(event.target.value); setError(''); }} className="mb-5 w-full rounded-2xl border border-edge bg-surface-raised px-4 py-3.5 text-fg" />
                        {error && <div role="alert" className="mb-4 rounded-2xl border border-danger-border bg-danger-surface p-3 text-sm text-danger">{error}</div>}
                        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-2xl bg-primary px-4 font-semibold text-white disabled:opacity-60">{busy ? 'Wird gespeichert…' : 'Passwort sicher speichern'}</button>
                    </form>
                    <button type="button" onClick={onLogout} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 text-sm font-semibold text-fg-secondary"><LogOut size={17} aria-hidden="true" />Abbrechen und abmelden</button>
                </section>
            </div>
        </main>
    );
}
