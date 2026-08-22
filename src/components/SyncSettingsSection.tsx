import { AlertTriangle, CheckCircle2, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import type { SyncConflict, SyncViewState } from '../sync/types';

interface Props extends SyncViewState {
    onSync(): void;
    onResolve(conflictId: string, resolution: 'keep-server' | 'use-device'): void;
}

const statusCopy: Record<SyncViewState['status'], string> = {
    disabled: 'Aus', local: 'Nur lokal', syncing: 'Synchronisiert…', synced: 'Synchronisiert',
    pending: 'Ausstehend', conflict: 'Konflikt', offline: 'Offline', error: 'Erneut versuchen',
};

const titleOf = (conflict: SyncConflict): string => {
    const candidate = conflict.clientChanges.title ?? conflict.serverPayload.title;
    return typeof candidate === 'string' && candidate.trim() ? candidate : conflict.key;
};

export default function SyncSettingsSection(props: Props) {
    const Icon = props.status === 'offline' ? CloudOff
        : props.status === 'conflict' || props.status === 'error' ? AlertTriangle
            : props.status === 'synced' ? CheckCircle2 : Cloud;
    return (
        <section className="mb-6" aria-labelledby="sync-settings-heading">
            <h3 id="sync-settings-heading" className="mb-3 text-xs font-semibold tracking-wider text-fg-secondary">SYNCHRONISIERUNG</h3>
            <div className="rounded-[1.5rem] border border-edge/50 bg-surface-raised p-4">
                <div className="flex items-center gap-3">
                    <Icon size={22} className={props.status === 'conflict' || props.status === 'error' ? 'text-warning' : 'text-primary-text'} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-fg">{statusCopy[props.status]}</p>
                        <p className="text-xs text-fg-secondary">
                            {props.pendingCount > 0 ? `${props.pendingCount} Änderung${props.pendingCount !== 1 ? 'en' : ''} wartet` : props.message ?? (props.lastSyncedAt ? `Zuletzt ${new Date(props.lastSyncedAt).toLocaleString('de-DE')}` : 'Noch nicht abgeglichen')}
                        </p>
                    </div>
                    <button type="button" onClick={props.onSync} disabled={props.status === 'syncing'} aria-label="Jetzt synchronisieren" className="tap-target-44 flex h-11 w-11 items-center justify-center rounded-xl border border-edge text-primary-text disabled:opacity-50">
                        <RefreshCw size={19} className={props.status === 'syncing' ? 'animate-spin' : ''} aria-hidden="true" />
                    </button>
                </div>
            </div>

            {props.conflicts.length > 0 && (
                <div className="mt-3 space-y-3">
                    {props.conflicts.map(conflict => (
                        <article key={conflict.id} className="rounded-2xl border border-warning-border bg-warning-surface p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-warning">Konflikt behalten — nichts wurde überschrieben</p>
                            <h4 dir="auto" className="mt-1 break-words font-semibold text-fg">{titleOf(conflict)}</h4>
                            <p className="mt-1 text-xs text-fg-secondary">
                                {conflict.reason === 'same-field-edit'
                                    ? `Auf beiden Geräten geändert: ${conflict.conflictingFields.join(', ')}`
                                    : conflict.reason === 'edit-after-delete' ? 'Auf einem Gerät gelöscht, auf diesem bearbeitet.' : 'Auf diesem Gerät gelöscht, im Konto bearbeitet.'}
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => props.onResolve(conflict.id, 'keep-server')} className="min-h-11 rounded-xl border border-edge bg-surface-raised px-3 text-sm font-semibold text-fg">Kontoversion</button>
                                <button type="button" onClick={() => props.onResolve(conflict.id, 'use-device')} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-white">Dieses Gerät</button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}
