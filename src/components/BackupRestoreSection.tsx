import React from 'react';
import { AlertTriangle, Download, ShieldCheck, Trash2, Upload } from 'lucide-react';

import type { BackupFileV3 } from '../types/backup';
import { listRecoverySnapshots, safeGetItem } from '../utils/appStorage';
import type { RecoverySnapshotInfo } from '../utils/appStorage';
import { parseBackupText, summarizeBackup } from '../utils/backupFormat';
import type { BackupSummary } from '../utils/backupFormat';
import type { ImportMode } from '../utils/backupMerge';
import { exportBackup, importBackup } from '../utils/backupService';
import { downloadTextFile } from '../utils/downloadFile';
import {
  getBlockedSlices,
  resolveBlockedSlice,
  subscribeStorageHealth,
} from '../utils/storageHealth';
import type { StorageSlice } from '../utils/storageHealth';
import { getTodayString } from '../utils/taskUtils';

interface BackupRestoreSectionProps {
  /** Called after storage has been written successfully, to refresh app state. */
  onImported: () => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; details?: string[] };

const SLICE_LABELS: Record<StorageSlice, string> = {
  tasks: 'Aufgaben',
  essentials: 'Tages-Essentials',
  essentialsState: 'Essentials-Fortschritt',
  essentialHistory: 'Essentials-Verlauf',
  focusState: 'Fokus-Verlauf',
};

const cardClass = 'bg-surface-raised rounded-[1.5rem] p-4 px-5 border border-edge/50';

const BackupRestoreSection = ({ onImported }: BackupRestoreSectionProps) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });
  const [pending, setPending] = React.useState<{ backup: BackupFileV3; summary: BackupSummary } | null>(null);
  const [mode, setMode] = React.useState<ImportMode>('merge');
  const [busy, setBusy] = React.useState(false);
  const [snapshots, setSnapshots] = React.useState<RecoverySnapshotInfo[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const blocked = React.useSyncExternalStore(
    subscribeStorageHealth,
    getBlockedSlices,
    getBlockedSlices,
  );

  const refreshSnapshots = React.useCallback(() => {
    setSnapshots(listRecoverySnapshots(localStorage));
  }, []);

  React.useEffect(() => {
    refreshSnapshots();
  }, [refreshSnapshots]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const result = exportBackup(localStorage, getTodayString(), new Date().toISOString());
    if (result.status === 'invalid') {
      setStatus({
        kind: 'error',
        message: 'Export abgebrochen — die aktuellen Daten sind ungültig. Es wurde nichts verändert.',
        details: result.errors,
      });
      return;
    }
    try {
      downloadTextFile(result.fileName, result.text);
      setStatus({
        kind: 'success',
        message: `${result.taskCount} Aufgaben und ${result.essentialCount} Essentials exportiert.`,
      });
    } catch (e) {
      setStatus({
        kind: 'error',
        message: 'Download fehlgeschlagen.',
        details: [e instanceof Error ? e.message : String(e)],
      });
    }
  };

  // ── Import: pick file → preview ───────────────────────────────────────────
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file after a cancelled import.
    event.target.value = '';
    if (!file) return;

    setPending(null);
    const isJson = file.type === 'application/json' || /\.json$/i.test(file.name);
    if (!isJson) {
      setStatus({ kind: 'error', message: 'Nur JSON-Dateien werden akzeptiert.' });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch (e) {
      setStatus({
        kind: 'error',
        message: 'Datei konnte nicht gelesen werden.',
        details: [e instanceof Error ? e.message : String(e)],
      });
      return;
    }

    const parsed = parseBackupText(text);
    if (parsed.status === 'invalid') {
      setStatus({
        kind: 'error',
        message: 'Backup ungültig — es wurde nichts verändert.',
        details: parsed.errors,
      });
      return;
    }

    setStatus({ kind: 'idle' });
    setPending({ backup: parsed.value, summary: summarizeBackup(parsed.value) });
  };

  // ── Import: confirm → apply ───────────────────────────────────────────────
  const handleConfirmImport = () => {
    if (!pending) return;
    setBusy(true);
    const result = importBackup(
      localStorage,
      pending.backup,
      mode,
      getTodayString(),
      new Date().toISOString(),
    );
    setBusy(false);
    refreshSnapshots();

    if (result.status === 'failed') {
      setStatus({
        kind: 'error',
        message: result.rolledBack
          ? 'Import fehlgeschlagen — alle Daten wurden unverändert wiederhergestellt.'
          : 'Import fehlgeschlagen — bitte Wiederherstellungspunkt prüfen.',
        details: result.errors,
      });
      return;
    }

    setPending(null);
    setStatus({
      kind: 'success',
      message: `${result.taskCount} Aufgaben und ${result.essentialCount} Essentials übernommen. App wird neu geladen…`,
    });
    onImported();
  };

  // ── Recovery snapshots ────────────────────────────────────────────────────
  const handleExportSnapshot = (snapshot: RecoverySnapshotInfo) => {
    const raw = safeGetItem(localStorage, snapshot.key);
    if (raw === null) {
      setStatus({ kind: 'error', message: 'Wiederherstellungspunkt nicht mehr vorhanden.' });
      refreshSnapshots();
      return;
    }
    downloadTextFile(`${snapshot.key}.json`, raw, 'application/json');
    setStatus({ kind: 'success', message: 'Wiederherstellungspunkt heruntergeladen.' });
  };

  const handleDeleteSnapshot = (snapshot: RecoverySnapshotInfo) => {
    localStorage.removeItem(snapshot.key);
    setConfirmDelete(null);
    refreshSnapshots();
    setStatus({ kind: 'success', message: 'Wiederherstellungspunkt gelöscht.' });
  };

  return (
    <div className="mb-6">
      <h3 className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">DATEN</h3>

      {/* Blocked slices — writes are suspended until the user decides */}
      {blocked.length > 0 && (
        <div className="mb-3 bg-warning-surface border border-warning-border rounded-2xl p-4" role="status">
          <p className="text-warning text-sm font-semibold mb-1 flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={2.5} aria-hidden="true" />
            Gespeicherte Daten unlesbar
          </p>
          <p className="text-fg-secondary text-sm">
            Betroffen: {blocked.map(b => SLICE_LABELS[b.slice]).join(', ')}. Speichern ist für diese
            Bereiche pausiert, damit nichts überschrieben wird.{' '}
            {blocked.some(b => b.reason === 'quarantined')
              ? 'Eine Kopie liegt als Wiederherstellungspunkt bereit.'
              : 'Der Originalwert wurde unverändert belassen.'}
          </p>
          <div className="flex flex-col gap-2 mt-3">
            {blocked.map(entry => (
              <button
                key={entry.slice}
                type="button"
                onClick={() => resolveBlockedSlice(entry.slice)}
                className="w-full bg-surface-raised border border-edge/50 text-fg-secondary hover:text-fg font-semibold py-2.5 min-h-11 rounded-2xl text-[14px] active:scale-[0.98] transition-all"
              >
                {SLICE_LABELS[entry.slice]}: fortfahren und wieder speichern
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export / Import buttons */}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={handleExport}
          className={`${cardClass} flex-1 flex items-center justify-center gap-2 min-h-11 text-fg font-semibold text-[15px] active:scale-[0.98] transition-transform`}
        >
          <Download size={18} strokeWidth={2.5} aria-hidden="true" />
          Exportieren
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`${cardClass} flex-1 flex items-center justify-center gap-2 min-h-11 text-fg font-semibold text-[15px] active:scale-[0.98] transition-transform`}
        >
          <Upload size={18} strokeWidth={2.5} aria-hidden="true" />
          Importieren
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Sicherungsdatei auswählen"
        onChange={handleFileChange}
      />
      <p className="text-fg-placeholder text-[11px] mt-2 px-1">
        Die Sicherung bleibt lokal auf diesem Gerät. Anmeldedaten werden nie exportiert.
      </p>

      {/* Import preview + explicit confirmation */}
      {pending && (
        <div className="mt-3 bg-surface-inset border border-edge/50 rounded-2xl p-4">
          <p className="text-fg font-semibold text-[15px] mb-1">Vorschau</p>
          <ul className="text-fg-secondary text-sm space-y-0.5 mb-3">
            <li>{pending.summary.taskCount} Aufgaben</li>
            <li>{pending.summary.essentialCount} Essentials</li>
            <li>{pending.summary.historyDayCount} Tage Essentials-Verlauf</li>
            <li>{pending.summary.focusSessionCount} Fokus-Sitzungen</li>
            <li>
              Fortschritt vom {pending.summary.progressDate}
              {pending.summary.progressDate !== getTodayString() && ' — wird auf 0 zurückgesetzt'}
            </li>
          </ul>

          <div className="flex gap-0 bg-surface-raised rounded-2xl p-1 border border-edge/50 mb-3">
            {([
              { value: 'merge' as ImportMode, label: 'Zusammenführen' },
              { value: 'replace' as ImportMode, label: 'Ersetzen' },
            ]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={value === mode}
                className={`flex-1 py-2.5 min-h-11 rounded-xl font-semibold text-[14px] transition-all ${
                  value === mode ? 'bg-surface-overlay text-primary-text shadow-sm' : 'text-fg-secondary hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-fg-secondary text-[12px] mb-3">
            {mode === 'merge'
              ? 'Vorhandene Daten bleiben unverändert; nur Neues wird ergänzt.'
              : 'Alle aktuellen Aufgaben und Essentials werden durch die Sicherung ersetzt.'}
          </p>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setPending(null)}
              className="flex-1 bg-surface-raised border border-edge/50 text-fg-secondary font-semibold py-3 min-h-11 rounded-2xl text-[15px] active:scale-[0.98] transition-all"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={busy}
              className="flex-1 bg-primary hover:brightness-110 disabled:opacity-40 text-white font-semibold py-3 min-h-11 rounded-2xl text-[15px] active:scale-[0.98] transition-all"
            >
              {busy ? 'Wird übernommen…' : 'Übernehmen'}
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      {status.kind === 'success' && (
        <div className="mt-3 bg-success-surface border border-success-border rounded-2xl p-4" role="status">
          <p className="text-success text-sm font-semibold flex items-center gap-2">
            <ShieldCheck size={16} strokeWidth={2.5} aria-hidden="true" />
            {status.message}
          </p>
        </div>
      )}
      {status.kind === 'error' && (
        <div className="mt-3 bg-danger-surface border border-danger-border rounded-2xl p-4" role="alert">
          <p className="text-danger text-sm font-semibold">{status.message}</p>
          {status.details && status.details.length > 0 && (
            <ul className="text-fg-secondary text-[12px] mt-1.5 space-y-0.5">
              {status.details.map(detail => (
                <li key={detail}>· {detail}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Recovery snapshots — listed and exportable, never auto-restored */}
      {snapshots.length > 0 && (
        <div className="mt-4">
          <h4 className="text-fg-secondary text-xs font-semibold tracking-wider mb-2">
            WIEDERHERSTELLUNGSPUNKTE ({snapshots.length})
          </h4>
          <div className="flex flex-col gap-2">
            {snapshots.map(snapshot => (
              <div key={snapshot.key} className={`${cardClass} flex flex-col gap-3`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-fg text-[14px] font-semibold truncate">{snapshot.sourceKey}</p>
                    <p className="text-fg text-[11px] truncate">
                      {snapshot.capturedAt} · {snapshot.size} Zeichen
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportSnapshot(snapshot)}
                      aria-label={`Wiederherstellungspunkt ${snapshot.sourceKey} exportieren`}
                      className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-surface-inset text-fg-secondary hover:text-fg active:scale-95 transition-all"
                    >
                      <Download size={16} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(snapshot.key)}
                      aria-label={`Wiederherstellungspunkt ${snapshot.sourceKey} löschen`}
                      aria-expanded={confirmDelete === snapshot.key}
                      className="min-w-11 min-h-11 flex items-center justify-center rounded-xl bg-surface-inset text-fg-secondary hover:text-danger active:scale-95 transition-all"
                    >
                      <Trash2 size={16} strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                {confirmDelete === snapshot.key && (
                  <div role="alert" className="border-t border-danger-border pt-3">
                    <p className="text-danger text-[13px] font-semibold">Wiederherstellungspunkt endgültig löschen?</p>
                    <p className="text-fg-secondary text-[12px] mt-1">Diese Aktion kann nicht rückgängig gemacht werden.</p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        type="button"
                        autoFocus
                        onClick={() => setConfirmDelete(null)}
                        className="min-h-11 rounded-xl bg-surface-inset text-fg-secondary font-semibold text-[13px]"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSnapshot(snapshot)}
                        className="min-h-11 rounded-xl bg-danger-solid text-white font-semibold text-[13px]"
                      >
                        Endgültig löschen
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-fg-placeholder text-[11px] mt-2 px-1">
            Punkte werden nie automatisch gelöscht oder eingespielt. Sie enthalten die Rohdaten von
            vor einem Import oder Lesefehler — zum Sichern herunterladen.
          </p>
        </div>
      )}
    </div>
  );
};

export default BackupRestoreSection;
