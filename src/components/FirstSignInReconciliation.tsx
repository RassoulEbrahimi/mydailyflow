import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Cloud, Download, HardDrive, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AuthUser } from '../auth/types';
import type { RealAuthConfig } from '../config/features';
import {
    prepareFirstSignInSafetyBoundary,
    readLocalManifest,
    recommendedDecision,
    type DatasetManifest,
    type FirstSignInDecision,
    type SafetyBoundary,
} from '../sync/reconciliation';
import { reconciliationTransportFor } from '../sync/supabaseReconciliation';
import { downloadTextFile } from '../utils/downloadFile';
import { getTodayString } from '../utils/taskUtils';
import {
    hasPreparedReconciliation,
    loadOrCreateDeviceId,
    persistPreparedReconciliation,
} from '../sync/clientState';

interface FirstSignInReconciliationProps {
    config: RealAuthConfig;
    user: AuthUser;
    onContinueLocal(): void;
    onLogout(): void;
}

const syncDecisionCopy: Record<FirstSignInDecision, { title: string; detail: string }> = {
    'start-empty': {
        title: 'Leer beginnen',
        detail: 'Gerät und Konto sind leer. Nur die Startentscheidung wird vorgemerkt.',
    },
    'upload-local': {
        title: 'Dieses Gerät als Startpunkt',
        detail: 'Die geprüfte lokale Kopie wird beim Fortfahren sicher in dein Konto übertragen.',
    },
    'download-account': {
        title: 'Kontodaten später verwenden',
        detail: 'Die Kontodaten werden beim Fortfahren atomar auf diesem Gerät übernommen.',
    },
    'merge-with-conflicts': {
        title: 'Später mit Konfliktprüfung zusammenführen',
        detail: 'Unabhängige Änderungen werden verbunden; gleiche Felder bleiben als sichtbarer Konflikt erhalten.',
    },
    'keep-device-separate': {
        title: 'Dieses Gerät getrennt halten',
        detail: 'Kein Upload, kein Download und keine automatische Zusammenführung.',
    },
};

const boundaryDecisionCopy: Record<FirstSignInDecision, { title: string; detail: string }> = {
    'start-empty': { title: 'Leer beginnen', detail: 'Gerät und Konto sind leer. Die Startentscheidung wird sicher vorgemerkt.' },
    'upload-local': { title: 'Dieses Gerät als Startpunkt', detail: 'Bereitet dieses Gerät als späteren Startpunkt vor; Sync bleibt noch ausgeschaltet.' },
    'download-account': { title: 'Kontodaten später verwenden', detail: 'Merkt die Kontokopie als späteren Startpunkt vor; lokale Daten bleiben unverändert.' },
    'merge-with-conflicts': { title: 'Zusammenführung vorbereiten', detail: 'Merkt eine spätere konfliktgeprüfte Zusammenführung vor; jetzt werden keine Daten übertragen.' },
    'keep-device-separate': { title: 'Dieses Gerät getrennt halten', detail: 'Kein Upload, kein Download und keine automatische Zusammenführung.' },
};

const ManifestCard = ({ title, icon, manifest }: { title: string; icon: 'device' | 'cloud'; manifest: DatasetManifest }) => {
    const Icon = icon === 'device' ? HardDrive : Cloud;
    return (
        <section className="rounded-2xl border border-edge bg-surface-raised p-4" aria-label={title}>
            <div className="mb-3 flex items-center gap-2">
                <Icon size={19} className="text-primary-text" aria-hidden="true" />
                <h2 className="font-bold text-fg">{title}</h2>
            </div>
            <p className="text-2xl font-bold text-fg">{manifest.itemCount}</p>
            <p className="text-xs text-fg-secondary">gespeicherte Bereiche/Einträge</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-fg-secondary">
                <dt>Aufgaben</dt><dd className="text-right font-semibold text-fg">{manifest.counts.tasks}</dd>
                <dt>Essentials</dt><dd className="text-right font-semibold text-fg">{manifest.counts.essentials}</dd>
                <dt>Fokus</dt><dd className="text-right font-semibold text-fg">{manifest.counts.focusSessions}</dd>
                <dt>Vorlagen</dt><dd className="text-right font-semibold text-fg">{manifest.counts.templates}</dd>
            </dl>
        </section>
    );
};

export default function FirstSignInReconciliation({ config, user, onContinueLocal, onLogout }: FirstSignInReconciliationProps) {
    const decisionCopy = config.syncEnabled ? syncDecisionCopy : boundaryDecisionCopy;
    const transport = useMemo(() => reconciliationTransportFor(config), [config.url, config.publishableKey]);
    const [local, setLocal] = useState<DatasetManifest | null>(null);
    const [account, setAccount] = useState<DatasetManifest | null>(null);
    const [safety, setSafety] = useState<SafetyBoundary | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'preparing' | 'prepared' | 'error'>('loading');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setStatus('loading');
        setError('');
        try {
            const [localResult, remote] = await Promise.all([
                readLocalManifest(localStorage, getTodayString()),
                transport.getAccountManifest(),
            ]);
            if (localResult.status === 'failed') {
                setError(`Lokale Daten konnten nicht sicher gelesen werden: ${localResult.errors.join(', ')}`);
                setStatus('error');
                return;
            }
            setLocal(localResult.value);
            setAccount(remote);
            setStatus(hasPreparedReconciliation(localStorage, user.id) ? 'prepared' : 'ready');
        } catch {
            setError('Das Kontomanifest konnte nicht geladen werden. Lokale Daten wurden nicht verändert.');
            setStatus('error');
        }
    }, [transport, user.id]);

    useEffect(() => { void load(); }, [load]);

    const prepareSafety = async () => {
        setStatus('preparing');
        setError('');
        const result = await prepareFirstSignInSafetyBoundary(
            localStorage,
            getTodayString(),
            new Date().toISOString(),
        );
        if (result.status === 'failed') {
            setError(`Sicherheitskopie fehlgeschlagen: ${result.errors.join(', ')}`);
            setStatus('error');
            return;
        }
        setSafety(result.value);
        setLocal(result.value.manifest);
        downloadTextFile(result.value.backupFileName, result.value.backupText);
        setStatus('ready');
    };

    const prepareChoice = async (choice: FirstSignInDecision) => {
        if (!safety || !account) return;
        setStatus('preparing');
        setError('');
        try {
            const deviceId = loadOrCreateDeviceId(localStorage);
            await transport.prepare(choice, safety.manifest, account, deviceId);
            persistPreparedReconciliation(localStorage, user.id, deviceId, choice);
            setStatus('prepared');
        } catch {
            setError('Die Entscheidung wurde nicht gespeichert. Backup und lokale Daten bleiben erhalten.');
            setStatus('error');
        }
    };

    const recommended = local && account ? recommendedDecision(local, account) : null;
    const choices: FirstSignInDecision[] = recommended === 'merge-with-conflicts'
        ? ['merge-with-conflicts', 'keep-device-separate']
        : recommended ? [recommended] : [];

    return (
        <main className="min-h-screen bg-page px-5 py-8 font-display text-fg">
            <div className="mx-auto max-w-lg">
                <div className="mb-6 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-primary-text">Erste sichere Anmeldung</p>
                        <h1 className="mt-1 text-2xl font-bold">Gerät und Konto abgleichen</h1>
                        <p className="mt-2 break-all text-xs text-fg-secondary">{user.email}</p>
                    </div>
                    <button type="button" onClick={onLogout} aria-label="Abmelden" className="tap-target-44 flex h-11 w-11 items-center justify-center rounded-xl border border-edge bg-surface-raised text-fg-secondary">
                        <LogOut size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="mb-5 rounded-2xl border border-warning-border bg-warning-surface p-4 text-sm leading-6 text-fg-secondary">
                    <strong className="text-fg">Du entscheidest vor dem ersten Sync:</strong> {config.syncEnabled
                        ? 'Erst nach geprüftem Backup und deiner Auswahl werden Daten übertragen. Gleichzeitige Änderungen werden nie still überschrieben.'
                        : 'Sync ist in diesem Build noch ausgeschaltet. Backup und Auswahl bereiten nur den sicheren späteren Start vor.'}
                </div>

                {status === 'loading' && <div role="status" className="py-12 text-center text-fg-secondary">Manifest wird sicher gelesen…</div>}

                {local && account && (
                    <div className="mb-5 grid grid-cols-2 gap-3">
                        <ManifestCard title="Dieses Gerät" icon="device" manifest={local} />
                        <ManifestCard title="Konto" icon="cloud" manifest={account} />
                    </div>
                )}

                {error && (
                    <div role="alert" className="mb-4 rounded-2xl border border-danger-border bg-danger-surface p-4 text-sm text-danger">
                        {error}
                        <button type="button" onClick={() => void load()} className="mt-3 flex min-h-11 items-center gap-2 font-semibold text-primary-text"><RefreshCw size={17} aria-hidden="true" />Erneut versuchen</button>
                    </div>
                )}

                {status === 'ready' && !safety && (
                    <section className="rounded-2xl border border-edge bg-surface-overlay p-4">
                        <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 flex-shrink-0 text-success" size={22} aria-hidden="true" />
                            <div>
                                <h2 className="font-bold">Sicherheitsgrenze zuerst</h2>
                                <p className="mt-1 text-sm leading-5 text-fg-secondary">Erstellt einen geprüften Backup-v4-Download und einen byte-genauen Wiederherstellungspunkt. Verwaltete Daten werden nicht verändert.</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => void prepareSafety()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
                            <Download size={19} aria-hidden="true" />Backup erstellen und prüfen
                        </button>
                    </section>
                )}

                {status === 'ready' && safety && (
                    <section className="space-y-3">
                        <div role="status" className="rounded-2xl border border-success-border bg-success-surface p-4 text-sm text-success">
                            Backup v4 und Wiederherstellungspunkt wurden verifiziert. Wähle jetzt den sicheren Startpfad.
                        </div>
                        {choices.map(choice => (
                            <button key={choice} type="button" onClick={() => void prepareChoice(choice)} className="w-full rounded-2xl border border-edge bg-surface-raised p-4 text-left active:scale-[0.99]">
                                <span className="font-bold text-fg">{decisionCopy[choice].title}</span>
                                <span className="mt-1 block text-sm leading-5 text-fg-secondary">{decisionCopy[choice].detail}</span>
                            </button>
                        ))}
                    </section>
                )}

                {status === 'preparing' && <div role="status" className="py-8 text-center text-fg-secondary">Sicherheitsprüfung läuft…</div>}

                {status === 'prepared' && (
                    <section className="rounded-2xl border border-success-border bg-success-surface p-5 text-center">
                        <CheckCircle2 className="mx-auto text-success" size={34} aria-hidden="true" />
                        <h2 className="mt-3 text-lg font-bold text-fg">Vorbereitung abgeschlossen</h2>
                        <p className="mt-2 text-sm leading-5 text-fg-secondary">{config.syncEnabled
                            ? 'Deine Auswahl ist gespeichert. Der erste Abgleich beginnt erst nach dem Fortfahren.'
                            : 'Deine Auswahl ist gespeichert. Dieses Gerät arbeitet weiter lokal; Sync bleibt ausgeschaltet.'}</p>
                        <button type="button" onClick={onContinueLocal} className="mt-5 min-h-12 w-full rounded-xl bg-primary px-4 font-semibold text-white">{config.syncEnabled ? 'Sicher synchronisieren' : 'Lokal fortfahren'}</button>
                    </section>
                )}
            </div>
        </main>
    );
}
