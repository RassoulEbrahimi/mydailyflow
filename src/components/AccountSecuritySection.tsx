import { useState, type FormEvent } from 'react';
import { CheckCircle2, Download, KeyRound, MailCheck, ShieldCheck, Trash2 } from 'lucide-react';
import type { AccountDeletionRequest, AuthActionResult, AuthUser } from '../auth/types';
import {
    ACCOUNT_DELETE_PHRASE,
    accountDeletionError,
    passwordChangeError,
} from '../auth/accountLifecycle';
import { useSingleDeviceStatus } from './SingleDeviceGate';
import { exportBackup } from '../utils/backupService';
import { downloadTextFile } from '../utils/downloadFile';
import { getTodayString } from '../utils/taskUtils';

interface AccountSecuritySectionProps {
    user: AuthUser;
    resendConfirmation(email: string): Promise<AuthActionResult>;
    changePassword(currentPassword: string, password: string): Promise<AuthActionResult>;
    deleteAccount(request: AccountDeletionRequest): Promise<AuthActionResult>;
}

type Status = { kind: 'success' | 'error'; message: string } | null;

const inputClass = 'w-full rounded-2xl border border-edge bg-surface-inset px-4 py-3 text-fg';

export default function AccountSecuritySection({
    user,
    resendConfirmation,
    changePassword: changeAccountPassword,
    deleteAccount: deleteAuthenticatedAccount,
}: AccountSecuritySectionProps) {
    const device = useSingleDeviceStatus();
    const [status, setStatus] = useState<Status>(null);
    const [busy, setBusy] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [typedEmail, setTypedEmail] = useState('');
    const [typedPhrase, setTypedPhrase] = useState('');
    const [exportedSnapshot, setExportedSnapshot] = useState<string | null>(null);
    const [exportedAt, setExportedAt] = useState<string | null>(null);

    const currentBackup = (timestamp = new Date().toISOString()) =>
        exportBackup(localStorage, getTodayString(), timestamp);

    const resend = async () => {
        setBusy(true);
        setStatus(null);
        const result = await resendConfirmation(user.email);
        setStatus(result.status === 'error'
            ? { kind: 'error', message: result.message }
            : { kind: 'success', message: 'Bestätigungs-E-Mail wurde angefordert.' });
        setBusy(false);
    };

    const changePassword = async (event: FormEvent) => {
        event.preventDefault();
        const validation = passwordChangeError(currentPassword, password, passwordConfirmation);
        if (validation) {
            setStatus({ kind: 'error', message: validation });
            return;
        }
        setBusy(true);
        setStatus(null);
        const result = await changeAccountPassword(currentPassword, password);
        if (result.status === 'error') {
            setStatus({ kind: 'error', message: result.message });
        } else {
            setCurrentPassword('');
            setPassword('');
            setPasswordConfirmation('');
            setPasswordOpen(false);
            setStatus({ kind: 'success', message: 'Passwort wurde sicher geändert.' });
        }
        setBusy(false);
    };

    const exportBeforeDeletion = () => {
        const timestamp = new Date().toISOString();
        const result = currentBackup(timestamp);
        if (result.status === 'invalid') {
            setStatus({ kind: 'error', message: 'Backup konnte wegen ungültiger lokaler Daten nicht erstellt werden.' });
            return;
        }
        downloadTextFile(result.fileName, result.text);
        setExportedSnapshot(result.text);
        setExportedAt(timestamp);
        setStatus({ kind: 'success', message: 'Aktuelles Backup heruntergeladen. Ändere vor dem Löschen keine Daten mehr.' });
    };

    const deleteAccount = async () => {
        const latest = currentBackup(exportedAt ?? undefined);
        const backupMatches = latest.status === 'ok' && latest.text === exportedSnapshot;
        const validation = accountDeletionError({
            accountEmail: user.email,
            typedEmail,
            typedPhrase,
            backupMatches,
        });
        if (validation) {
            setStatus({ kind: 'error', message: validation });
            if (!backupMatches) {
                setExportedSnapshot(null);
                setExportedAt(null);
            }
            return;
        }
        if (!device) {
            setStatus({ kind: 'error', message: 'Die aktive Gerätesitzung konnte nicht bestätigt werden.' });
            return;
        }
        setBusy(true);
        setStatus(null);
        const result = await deleteAuthenticatedAccount({
            email: typedEmail.trim(),
            confirmation: typedPhrase,
            deviceId: device.deviceId,
        });
        if (result.status === 'error') {
            setStatus({ kind: 'error', message: result.message });
            setBusy(false);
        }
    };

    return (
        <section className="mb-6" aria-labelledby="account-security-heading">
            <h3 id="account-security-heading" className="mb-3 text-xs font-semibold tracking-wider text-fg-secondary">KONTO & SICHERHEIT</h3>
            <div className="rounded-[1.5rem] border border-edge/50 bg-surface-raised p-4">
                <div className="flex items-start gap-3">
                    <ShieldCheck size={22} className="mt-0.5 flex-shrink-0 text-success" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p dir="auto" className="break-all font-semibold text-fg">{user.email}</p>
                        <p className="mt-1 text-xs text-fg-secondary">
                            {user.emailConfirmedAt ? 'E-Mail bestätigt' : 'E-Mail noch nicht bestätigt'}
                            {' · '}Dieses Gerät aktiv
                        </p>
                        {device?.lastVerifiedAt && (
                            <p className="mt-1 text-[11px] text-fg-placeholder">
                                Sitzung zuletzt geprüft: {new Date(device.lastVerifiedAt).toLocaleString('de-DE')}
                            </p>
                        )}
                    </div>
                </div>
                {!user.emailConfirmedAt && (
                    <button type="button" onClick={() => void resend()} disabled={busy} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-surface-inset px-3 text-sm font-semibold text-primary-text disabled:opacity-50">
                        <MailCheck size={18} aria-hidden="true" />Bestätigungs-E-Mail erneut senden
                    </button>
                )}
            </div>

            <button type="button" onClick={() => setPasswordOpen(value => !value)} aria-expanded={passwordOpen} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] border border-edge/50 bg-surface-raised px-4 font-semibold text-fg">
                <KeyRound size={19} aria-hidden="true" />Passwort ändern
            </button>
            {passwordOpen && (
                <form onSubmit={changePassword} className="mt-3 space-y-3 rounded-2xl border border-edge bg-surface-inset p-4">
                    <label className="block text-xs font-semibold text-fg-secondary">AKTUELLES PASSWORT<input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    <label className="block text-xs font-semibold text-fg-secondary">NEUES PASSWORT<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    <label className="block text-xs font-semibold text-fg-secondary">NEUES PASSWORT BESTÄTIGEN<input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-white disabled:opacity-50">Passwort speichern</button>
                </form>
            )}

            <button type="button" onClick={() => setDeleteOpen(value => !value)} aria-expanded={deleteOpen} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[1.5rem] border border-danger-border bg-danger-surface px-4 font-semibold text-danger">
                <Trash2 size={19} aria-hidden="true" />Konto löschen vorbereiten
            </button>
            {deleteOpen && (
                <div className="mt-3 rounded-2xl border border-danger-border bg-danger-surface p-4">
                    <p className="font-semibold text-danger">Konto und synchronisierte Daten endgültig löschen</p>
                    <p className="mt-1 text-xs leading-5 text-fg-secondary">Diese Aktion löscht Auth-Konto, Sync-Daten und Server-Erinnerungen. Sie kann nicht rückgängig gemacht werden.</p>
                    <button type="button" onClick={exportBeforeDeletion} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-edge bg-surface-raised px-3 text-sm font-semibold text-fg">
                        {exportedSnapshot ? <CheckCircle2 size={18} className="text-success" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                        {exportedSnapshot ? 'Backup erstellt' : 'Zuerst aktuelles Backup herunterladen'}
                    </button>
                    <label className="mt-3 block text-xs font-semibold text-fg-secondary">KONTO-E-MAIL<input value={typedEmail} onChange={event => setTypedEmail(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    <label className="mt-3 block text-xs font-semibold text-fg-secondary">ZUR BESTÄTIGUNG „{ACCOUNT_DELETE_PHRASE}“ EINGEBEN<input value={typedPhrase} onChange={event => setTypedPhrase(event.target.value)} className={`${inputClass} mt-2`} /></label>
                    <button type="button" onClick={() => void deleteAccount()} disabled={busy || !exportedSnapshot} className="mt-4 min-h-12 w-full rounded-xl bg-danger-solid px-4 font-semibold text-white disabled:opacity-40">Konto endgültig löschen</button>
                </div>
            )}

            {status && (
                <div role={status.kind === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-2xl border p-3 text-sm font-semibold ${status.kind === 'error' ? 'border-danger-border bg-danger-surface text-danger' : 'border-success-border bg-success-surface text-success'}`}>
                    {status.message}
                </div>
            )}
        </section>
    );
}
