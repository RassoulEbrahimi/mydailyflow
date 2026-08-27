import { BellRing, ShieldCheck } from 'lucide-react';
import type { BackgroundReminderStatus } from '../reminders/background';

interface Props {
  status: BackgroundReminderStatus;
  message: string;
  activeCount: number;
  onEnable(): Promise<void>;
  onDisable(): Promise<void>;
}

export default function BackgroundRemindersSection({ status, message, activeCount, onEnable, onDisable }: Props) {
  if (status === 'disabled') return null;
  const active = status === 'active';
  const busy = status === 'activating';
  const unavailable = status === 'misconfigured' || status === 'unsupported';

  return (
    <section aria-labelledby="background-reminders-heading" className="mb-6">
      <h3 id="background-reminders-heading" className="text-fg-secondary text-xs font-semibold tracking-wider mb-3">
        HINTERGRUND-ERINNERUNGEN
      </h3>
      <div className="rounded-[1.5rem] border border-edge/50 bg-surface-raised p-4">
        <div className="flex items-start gap-3">
          <BellRing size={22} className={active ? 'text-success' : 'text-primary-text'} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-fg">Best Effort bei geschlossener App</p>
            <p className="mt-1 text-sm leading-relaxed text-fg-secondary">
              {message || 'Für dieses Gerät kann Web Push eingerichtet werden.'}
              {active ? ` ${activeCount} geplante Erinnerung${activeCount === 1 ? '' : 'en'} synchronisiert.` : ''}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-inset p-3 text-xs leading-relaxed text-fg-secondary">
          <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-primary-text" aria-hidden="true" />
          <p>Push-Nachrichten enthalten keinen Aufgabentitel. Netzwerk, Browser und Energiesparen können Zustellungen verzögern oder verhindern.</p>
        </div>
        {!unavailable && (
          <button
            type="button"
            onClick={() => void (active ? onDisable() : onEnable())}
            disabled={busy}
            className="mt-4 min-h-11 w-full rounded-xl border border-edge-strong bg-surface-inset px-4 font-semibold text-fg disabled:opacity-50"
          >
            {busy ? 'Wird eingerichtet…' : active ? 'Auf diesem Gerät deaktivieren' : 'Auf diesem Gerät aktivieren'}
          </button>
        )}
      </div>
    </section>
  );
}
