import React from 'react';
import { Bell, LogOut, Monitor, Moon, Sun as SunIcon } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import BackupRestoreSection from './BackupRestoreSection';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataImported: () => void;
  remindersEnabled: boolean;
  onRemindersEnabledChange: (val: boolean) => void;
  permission: NotificationPermission;
  onPermissionChange: (p: NotificationPermission) => void;
  onLogout: () => void;
  stickyHeroEnabled: boolean;
  onStickyHeroChange: (val: boolean) => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
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
}: SettingsModalProps) => {
  const [requesting, setRequesting] = React.useState(false);

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
    granted: 'text-emerald-400',
    denied: 'text-red-400',
    default: 'text-amber-400',
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Scrollable: the sheet now holds enough sections to exceed short viewports. */}
      <div className={`fixed bottom-0 left-0 w-full max-h-[92vh] overflow-y-auto overscroll-contain bg-surface-overlay rounded-t-[2.5rem] z-50 p-6 pb-10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="w-12 h-1.5 bg-handle rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-8 relative">
          <button onClick={onClose} className="text-fg-secondary active:opacity-70 transition-opacity absolute left-0 text-[15px]">Schließen</button>
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
                onClick={() => onThemeChange(value)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-semibold text-[14px] transition-all ${
                  value === theme
                    ? 'bg-surface-raised text-primary shadow-sm'
                    : 'text-fg-secondary hover:text-fg'
                }`}
              >
                <Icon size={16} strokeWidth={2.5} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Home section ─────────────────────────────────────────────── */}
        <div className="mb-6">
          <h3 className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">STARTBILDSCHIRM</h3>
          <button
            onClick={() => onStickyHeroChange(!stickyHeroEnabled)}
            className="w-full bg-surface-raised p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-edge/50 active:scale-[0.98] transition-transform"
          >
            <div>
              <span className="text-fg font-semibold text-[16px]">Kopfzeile fixieren</span>
              <p className="text-fg-secondary text-[12px] mt-0.5">Fortschritt beim Scrollen sichtbar</p>
            </div>
            <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 flex-shrink-0 ml-3 ${
              stickyHeroEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-edge'
            }`}>
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
              <div className="text-orange-500 opacity-90 drop-shadow-[0_0_4px_rgba(249,115,22,0.4)]">
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
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
            <p className="text-amber-400 text-sm font-semibold mb-1">Benachrichtigungen sind blockiert</p>
            <p className="text-fg-secondary text-sm">Um Erinnerungen zu aktivieren, öffne die Website-Einstellungen deines Browsers und erlaube Benachrichtigungen für diese Seite, lade dann neu.</p>
          </div>
        )}

        {/* Granted: show success + toggle */}
        {permission === 'granted' && (
          <div className="mb-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-4">
              <p className="text-emerald-400 text-sm font-semibold">Erinnerungen aktiviert ✓</p>
              <p className="text-fg-secondary text-sm mt-1">Benachrichtigungen sind erlaubt.</p>
            </div>
            {/* Reminders on/off toggle */}
            <button
              onClick={() => onRemindersEnabledChange(!remindersEnabled)}
              className="w-full bg-surface-raised p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-edge/50 active:scale-[0.98] transition-transform"
            >
              <span className="text-fg font-semibold text-[16px]">Erinnerungen planen</span>
              <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 ${remindersEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-edge'}`}>
                <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${remindersEnabled ? 'right-1 translate-x-0' : 'left-1 translate-x-0'}`} />
              </div>
            </button>
          </div>
        )}

        {/* Enable button (shown for default or denied) */}
        {permission !== 'granted' && (
          <button
            onClick={handleEnableClick}
            disabled={requesting || permission === 'denied'}
            className="w-full bg-primary hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-all text-[17px]"
          >
            <Bell size={22} strokeWidth={2.5} />
            {requesting ? 'Wird angefragt…' : 'Erinnerungen aktivieren'}
          </button>
        )}

        {/* ── Backup & Restore ─────────────────────────────────────────── */}
        <BackupRestoreSection onImported={onDataImported} />

        {/* ── Logout ── */}
        <div className="mt-8 pt-6 border-t border-surface-raised">
          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full bg-surface-raised hover:bg-red-500/10 border border-edge/50 hover:border-red-500/30 text-fg-secondary hover:text-red-400 font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[16px]"
          >
            <LogOut size={20} strokeWidth={2.5} />
            Abmelden
          </button>
          <p className="text-center text-[11px] text-fg-placeholder mt-3">Demo-Umgebung · Nicht sicher</p>
        </div>
      </div>
    </>
  );
};

export default SettingsModal;
