import React from 'react';
import { AlertTriangle, BellOff, BellRing, Clock, Info } from 'lucide-react';
import type { Task } from '../types/task';
import { getTodayString, hasTime, compareByTimeUntimedLast, formatDateLabel } from '../utils/taskUtils';
import type { BackgroundReminderStatus } from '../reminders/background';

/**
 * RemindersView — the Erinnerungen screen.
 *
 * Deliberately truthful. The app schedules reminders with an in-page
 * `setTimeout`, so delivery only happens while a page is open; there is no
 * background, closed-app, or exact-time guarantee, and nothing here may imply
 * one. See docs/adr/0001-background-reminders-feasibility.md.
 *
 * The screen reads the same task data the rest of the app uses. It invents no
 * scheduling state, shows no fake "delivered"/"pending" status, and talks to no
 * backend.
 */

interface RemindersViewProps {
    tasks: Task[];
    /** Global "Erinnerungen planen" preference from Settings. */
    remindersEnabled: boolean;
    /** Current browser notification permission. */
    permission: NotificationPermission;
    /** Opens the existing edit sheet — the app's established task interaction. */
    onEditTask: (task: Task) => void;
    onOpenSettings: () => void;
    backgroundStatus?: BackgroundReminderStatus;
}

/** A reminder that the app can still deliver, if the app stays open. */
interface PlannedReminder {
    task: Task;
    /** Local wall-clock instant of the task, used for ordering only. */
    isToday: boolean;
}

const REMINDER_LEAD_MINUTES = 10;

/** Tasks the user has asked to be reminded about, excluding completed ones. */
const wantsReminder = (task: Task): boolean =>
    !task.completed && task.reminderEnabled !== false;

export default function RemindersView({
    tasks,
    remindersEnabled,
    permission,
    onEditTask,
    onOpenSettings,
    backgroundStatus = 'disabled',
}: RemindersViewProps) {
    const today = getTodayString();

    const candidates = tasks.filter(wantsReminder);

    // Deliverable: has a real time and is not in the past. Everything else is
    // shown separately rather than being quietly dropped — a task the user
    // believes is covered must not vanish from this screen.
    const planned: PlannedReminder[] = [];
    const untimed: Task[] = [];
    const past: Task[] = [];

    for (const task of candidates) {
        if (!hasTime(task)) {
            untimed.push(task);
            continue;
        }
        if (!task.date || task.date < today) {
            past.push(task);
            continue;
        }
        planned.push({ task, isToday: task.date === today });
    }

    planned.sort((a, b) => {
        if (a.task.date !== b.task.date) return a.task.date < b.task.date ? -1 : 1;
        return compareByTimeUntimedLast(a.task, b.task);
    });

    const blocked = permission !== 'granted' || !remindersEnabled;
    const totalTracked = planned.length + untimed.length + past.length;

    return (
        <div className="flex flex-col gap-6 px-5 pb-4">
            <section aria-labelledby="reminders-heading" className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="h-7 w-[3px] rounded-full bg-current accent-glow text-warning" aria-hidden="true" />
                    <h2 id="reminders-heading" className="text-[16px] font-bold text-fg tracking-tight">
                        Erinnerungen
                    </h2>
                </div>

                {/* ── The truth statement. This is the point of the screen. ── */}
                <div className="bg-surface-raised border border-edge/50 rounded-2xl p-4 flex gap-3">
                    <Info size={18} strokeWidth={2.5} className="text-primary-text flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-fg-secondary text-[13.5px] leading-relaxed">
                        {backgroundStatus === 'active'
                            ? 'Hintergrund-Erinnerungen sind auf diesem Gerät als Best-Effort-Zustellung aktiv. Netzwerk, Browser und Energiesparen können sie verzögern oder verhindern.'
                            : 'Erinnerungen werden nur ausgelöst, solange My Daily Flow geöffnet ist. Wenn du die App oder den Browser schließt, können geplante Erinnerungen ausbleiben.'}
                    </p>
                </div>

                {blocked && (
                    <div className="bg-warning-surface border border-warning-border rounded-2xl p-4" role="status">
                        <p className="text-fg text-[13.5px] font-semibold mb-1">
                            {permission !== 'granted'
                                ? 'Benachrichtigungen sind nicht erlaubt'
                                : 'Erinnerungen sind ausgeschaltet'}
                        </p>
                        <p className="text-fg text-[13px] leading-relaxed mb-3">
                            {permission !== 'granted'
                                ? 'Solange die Berechtigung fehlt, wird nichts angezeigt — auch nicht bei geöffneter App.'
                                : 'Die geplanten Zeiten unten werden derzeit nicht ausgelöst.'}
                        </p>
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="bg-surface-inset border border-edge/50 text-fg font-semibold py-2.5 px-4 min-h-11 rounded-xl text-[14px] active:scale-[0.98] transition-transform"
                        >
                            In den Einstellungen öffnen
                        </button>
                    </div>
                )}
            </section>

            {totalTracked === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-3">
                    <BellOff size={44} className="text-fg-faint" aria-hidden="true" />
                    <p className="text-fg font-semibold">Keine Erinnerungen geplant</p>
                    <p className="text-fg-secondary text-sm max-w-[36ch] leading-relaxed">
                        Aufgaben mit einer Uhrzeit erinnern dich {REMINDER_LEAD_MINUTES} Minuten
                        vorher — solange die App geöffnet ist. Du kannst die Erinnerung beim
                        Anlegen oder Bearbeiten einer Aufgabe einschalten.
                    </p>
                </div>
            ) : (
                <>
                    {planned.length > 0 && (
                        <ReminderGroup
                            title="Geplant"
                            count={planned.length}
                            accent="text-success"
                            description={backgroundStatus === 'active'
                                ? `Wird ${REMINDER_LEAD_MINUTES} Minuten vorher geplant; Hintergrund-Zustellung bleibt Best Effort.`
                                : `Wird ${REMINDER_LEAD_MINUTES} Minuten vorher angezeigt, wenn die App dann geöffnet ist.`}
                        >
                            {planned.map(({ task, isToday }) => (
                                <ReminderRow
                                    key={task.id}
                                    task={task}
                                    onEditTask={onEditTask}
                                    detail={`${isToday ? 'Heute' : formatDateLabel(task.date)} · ${task.time}`}
                                />
                            ))}
                        </ReminderGroup>
                    )}

                    {untimed.length > 0 && (
                        <ReminderGroup
                            title="Ohne Zeit — keine Erinnerung möglich"
                            count={untimed.length}
                            accent="text-fg-secondary"
                            description="Ohne Uhrzeit gibt es keinen Zeitpunkt, an dem erinnert werden könnte. Ergänze eine Uhrzeit, um eine Erinnerung zu planen."
                        >
                            {untimed.map(task => (
                                <ReminderRow
                                    key={task.id}
                                    task={task}
                                    onEditTask={onEditTask}
                                    detail="Ohne Zeit"
                                    muted
                                />
                            ))}
                        </ReminderGroup>
                    )}

                    {past.length > 0 && (
                        <ReminderGroup
                            title="Zeitpunkt vergangen"
                            count={past.length}
                            accent="text-fg-secondary"
                            description="Der geplante Zeitpunkt liegt in der Vergangenheit. Diese Erinnerungen werden nicht mehr ausgelöst."
                        >
                            {past.map(task => (
                                <ReminderRow
                                    key={task.id}
                                    task={task}
                                    onEditTask={onEditTask}
                                    detail={`${formatDateLabel(task.date)} · ${task.time}`}
                                    muted
                                />
                            ))}
                        </ReminderGroup>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Building blocks ──────────────────────────────────────────────────────────

interface ReminderGroupProps {
    title: string;
    count: number;
    accent: string;
    description: string;
    children: React.ReactNode;
}

function ReminderGroup({ title, count, accent, description, children }: ReminderGroupProps) {
    return (
        <section className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
                <div className={`h-7 w-[3px] rounded-full bg-current ${accent}`} aria-hidden="true" />
                <h3 className="text-[15px] font-bold text-fg tracking-tight">{title}</h3>
                <span className="text-[12px] font-semibold text-fg-secondary bg-surface-raised px-2 py-0.5 rounded-full">
                    {count}
                </span>
            </div>
            <p className="text-fg-secondary text-[12.5px] leading-relaxed">{description}</p>
            <ul className="flex flex-col gap-2 list-none p-0 m-0">{children}</ul>
        </section>
    );
}

interface ReminderRowProps {
    task: Task;
    detail: string;
    muted?: boolean;
    onEditTask: (task: Task) => void;
    /** React key — declared to satisfy this project's stricter tsconfig. */
    key?: React.Key;
}

function ReminderRow({ task, detail, muted, onEditTask }: ReminderRowProps) {
    return (
        <li>
            {/* A real button: keyboard reachable, and it reuses the app's existing
                "edit this task" interaction rather than inventing a new one. The
                accessible name carries the task title and its schedule, so the
                control is not announced as a bare row. */}
            <button
                type="button"
                onClick={() => onEditTask(task)}
                aria-label={`${task.title} — ${detail}. Aufgabe bearbeiten.`}
                className={`w-full min-h-[44px] flex items-center justify-between gap-3 text-left bg-surface border rounded-2xl px-4 py-3 transition-colors active:scale-[0.99] ${
                    muted ? 'border-edge/60' : 'border-edge'
                }`}
            >
                <span className="min-w-0 flex flex-col gap-0.5">
                    {/* dir="auto" so a DE/EN/FA/mixed title renders in its own
                        direction while the surrounding German chrome stays LTR. */}
                    <span dir="auto" className="min-w-0 text-start text-fg font-semibold text-[15px] leading-snug break-words">
                        {task.title}
                    </span>
                    {/* Schedule detail is German chrome — pinned LTR so the
                        icon and the text keep their order beside an RTL title. */}
                    <span dir="ltr" className="flex items-center gap-1.5 text-[11.5px] text-fg-secondary font-medium">
                        {task.time ? (
                            <Clock size={12} className="flex-shrink-0" aria-hidden="true" />
                        ) : (
                            <BellOff size={12} className="flex-shrink-0" aria-hidden="true" />
                        )}
                        {detail}
                    </span>
                </span>
                {muted ? (
                    <AlertTriangle size={16} className="text-warning flex-shrink-0" aria-hidden="true" />
                ) : (
                    <BellRing size={16} className="text-success flex-shrink-0" aria-hidden="true" />
                )}
            </button>
        </li>
    );
}
