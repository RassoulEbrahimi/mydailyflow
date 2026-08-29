import React from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Bell, LogOut, Monitor, Moon, Sun as SunIcon } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import BackupRestoreSection from './BackupRestoreSection';
import SyncSettingsSection from './SyncSettingsSection';
import BackgroundRemindersSection from './BackgroundRemindersSection';
import type { SyncConflict, SyncViewState } from '../sync/types';
import type { BackgroundReminderStatus } from '../reminders/background';
import type { AccountLifecycleController } from '../auth/types';
import AccountSecuritySection from './AccountSecuritySection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataImported: () => void;
  remindersEnabled: boolean;
  onRemindersEnabledChange: (val: boolean) => void;
  permission: NotificationPermission;
  onPermissionChange: (p: NotificationPermission) => void;
  onLogout: () => void | Promise<void>;
  stickyHeroEnabled: boolean;
  onStickyHeroChange: (val: boolean) => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  authMode?: 'demo' | 'supabase';
  accountLabel?: string;
  accountLifecycle?: AccountLifecycleController;
  sync?: SyncViewState & {
    onSync(): void;
    onResolve(conflictId: string, resolution: 'keep-server' | 'use-device'): void;
  };
  backgroundReminders?: {
    status: BackgroundReminderStatus;
    message: string;
    activeCount: number;
    onEnable(): Promise<void>;
    onDisable(): Promise<void>;
  };
}

const SettingsModal = ({
  isOpen,
  onClose,
  onDataImported,
  remindersEnabled,
  onRemindersEnabledChange,
  permission,
  onPermissionChange,
  onLogout,
  stickyHeroEnabled,
  onStickyHeroChange,
  theme,
  onThemeChange,
  authMode = 'demo',
  accountLabel,
  accountLifecycle,
  sync,
  backgroundReminders,
}: SettingsModalProps) => {
  const [requesting, setRequesting] = React.useState(false);

  const sheetRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, sheetRef);

  const handleEnableClick = async () => {
    if (!('Notification' in window)) return;
    setRequesting(true);
    const result = await Notification.requestPermission();
    onPermissionChange(result);
    if (result === 'granted') {
      onRemindersEnabledChange(true);
    }
    setRequesting(false);
  };

  const permissionLabel: Record<NotificationPermission, string> = {
    granted: 'Erlaubt',
    denied: 'Blockiert',
    default: 'Nicht konfiguriert',
  };

  const permissionColor: Record<NotificationPermission, string> = {
    granted: 'text-success',
    denied: 'text-danger',
    default: 'text-warning',
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Scrollable: the sheet now holds enough sections to exceed short viewports. */}
      {/* `inert` while closed — the sheet stays mounted off-screen, and without
          it every control inside sits in the Tab ring of the page behind. */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        inert={!isOpen}
        className={`fixed bottom-0 left-0 w-full max-h-[92vh] overflow-y-auto overscroll-contain bg-surface-overlay rounded-t-[2.5rem] z-50 p-6 pb-10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="w-12 h-1.5 bg-handle rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-8 relative">
          <button type="button" onClick={onClose} className="text-fg-secondary active:opacity-70 transition-opacity absolute left-0 text-[15px] min-h-11">Schließen</button>
          <h2 className="text-fg font-bold text-lg w-full text-center">Einstellungen</h2>
        </div>

        {/* ── Theme section ────────────────────────────────────────────── */}
        <div className="mb-6">
          <h3 className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">ERSCHEINUNGSBILD</h3>
          <div className="flex gap-0 bg-surface-inset rounded-2xl p-1 border border-edge/50">
            {([
              { value: 'light'  as Theme, label: 'Hell',   Icon: SunIcon },
              { value: 'dark'   as Theme, label: 'Dunkel', Icon: Moon },
              { value: 'system' as Theme, label: 'System', Icon: Monitor },
            ]).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onThemeChange(value)}
                aria-pressed={value === theme}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-11 rounded-xl font-semibold text-[14px] transition-all ${
                  value === theme
                    ? 'bg-surface-raised text-primary-text shadow-sm'
                    : 'text-fg-secondary hover:text-fg'
                }`}
              >
                <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Home section ─────────────────────────────────────────────── */}
        <div className="mb-6">
          <h3 className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">STARTBILDSCHIRM</h3>
          <button
            type="button"
            onClick={() => onStickyHeroChange(!stickyHeroEnabled)}
            role="switch"
            aria-checked={stickyHeroEnabled}
            className="w-full bg-surface-raised p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-edge/50 active:scale-[0.98] transition-transform"
          >
            <div>
              <span className="text-fg font-semibold text-[16px]">Kopfzeile fixieren</span>
              <p className="text-fg-secondary text-[12px] mt-0.5">Fortschritt beim Scrollen sichtbar</p>
            </div>
            <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 flex-shrink-0 ml-3 ${
              stickyHeroEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-surface-control border border-edge-strong'
            }`} aria-hidden="true">
              <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${
                stickyHeroEnabled ? 'right-1' : 'left-1'
              }`} />
            </div>
          </button>
        </div>

        {/* Notification Permission Status */}
        <div className="mb-6">
          <h3 className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">BENACHRICHTIGUNGEN</h3>
          <div className="bg-surface-raised rounded-[1.5rem] p-4 px-5 border border-edge/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-warning" aria-hidden="true">
                <Bell size={22} strokeWidth={2.5} className="fill-current" />
              </div>
              <span className="text-fg font-semibold text-[16px]">Benachrichtigungen</span>
            </div>
            <span className={`text-sm font-semibold ${permissionColor[permission]}`}>
              {permissionLabel[permission]}
            </span>
          </div>
        </div>

        {/* Denied warning */}
        {permission === 'denied' && (
          <div className="mb-6 bg-warning-surface border border-warning-border rounded-2xl p-4" role="status">
            <p className="text-warning text-sm font-semibold mb-1">Benachrichtigungen sind blockiert</p>
            <p className="text-fg-secondary text-sm">Um Erinnerungen zu aktivieren, öffne die Website-Einstellungen deines Browsers und erlaube Benachrichtigungen für diese Seite, lade dann neu.</p>
          </div>
        )}

        {/* Granted: show success + toggle */}
        {permission === 'granted' && (
          <div className="mb-6">
            {/* The foreground fallback remains truthful. A separately guarded
                Web Push section below may add best-effort closed-app delivery. */}
            <div className="bg-surface-raised border border-edge/50 rounded-2xl p-4 mb-4">
              <p className="text-fg text-sm font-semibold">Benachrichtigungen sind erlaubt</p>
              <p className="text-fg-secondary text-sm mt-1 leading-relaxed">
                {backgroundReminders
                  ? 'Die lokale Erinnerung funktioniert, solange My Daily Flow geöffnet ist. Eine aktivierte Hintergrund-Zustellung bleibt Best Effort und kann sich verzögern.'
                  : 'Erinnerungen werden nur ausgelöst, solange My Daily Flow geöffnet ist. Wenn du die App oder den Browser schließt, können geplante Erinnerungen ausbleiben.'}
              </p>
            </div>
            {/* Reminders on/off toggle */}
            <button
              type="button"
              onClick={() => onRemindersEnabledChange(!remindersEnabled)}
              role="switch"
              aria-checked={remindersEnabled}
              className="w-full bg-surface-raised p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-edge/50 active:scale-[0.98] transition-transform"
            >
              <span className="text-fg font-semibold text-[16px]">Erinnerungen planen</span>
              <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 ${remindersEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-surface-control border border-edge-strong'}`} aria-hidden="true">
                <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${remindersEnabled ? 'right-1 translate-x-0' : 'left-1 translate-x-0'}`} />
              </div>
            </button>
          </div>
        )}

        {/* Enable button (shown for default or denied) */}
        {permission !== 'granted' && (
          <button
            type="button"
            onClick={handleEnableClick}
            disabled={requesting || permission === 'denied'}
            className="w-full bg-primary hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-all text-[17px]"
          >
            <Bell size={22} strokeWidth={2.5} aria-hidden="true" />
            {requesting ? 'Wird angefragt…' : 'Erinnerungen aktivieren'}
          </button>
        )}

        {authMode === 'supabase' && backgroundReminders && (
          <BackgroundRemindersSection {...backgroundReminders} />
        )}

        {authMode === 'supabase' && sync && <SyncSettingsSection {...sync} />}

        {authMode === 'supabase' && accountLifecycle && <AccountSecuritySection {...accountLifecycle} />}

        {/* ── Backup & Restore ─────────────────────────────────────────── */}
        <BackupRestoreSection onImported={onDataImported} />

        {/* ── Logout ── */}
        <div className="mt-8 pt-6 border-t border-surface-raised">
          <button
            type="button"
            onClick={() => { onClose(); void onLogout(); }}
            className="w-full bg-surface-raised hover:bg-danger-surface border border-edge/50 hover:border-danger-border text-fg-secondary hover:text-danger font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[16px]"
          >
            <LogOut size={20} strokeWidth={2.5} aria-hidden="true" />
            Abmelden
          </button>
          <p className="text-center text-[11px] text-fg-placeholder mt-3">
            {authMode === 'supabase'
              ? `Supabase-Testzugang · ${sync ? 'Sync aktiv' : 'Sync nicht bereit'}${accountLabel ? ` · ${accountLabel}` : ''}`
              : 'Demo-Umgebung · Nicht sicher'}
          </p>
        </div>
      </div>
    </>
  );
};

export default SettingsModal;
