import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Clock3, X } from 'lucide-react';
import type { Task } from '../types/task';
import { defaultTimeForBlock, deriveTimeBlock, hasTime } from '../utils/taskUtils';
import {
    PLANNER_LANES,
    PLANNER_LANE_LABELS,
    hasLockedRecurrenceDate,
    plannerLaneForTask,
    type PlannerDestination,
    type PlannerLane,
} from '../utils/weekPlanner';

interface MoveTaskModalProps {
    task: Task | null;
    weekDates: string[];
    onClose: () => void;
    onMove: (taskId: string, destination: PlannerDestination) => void;
}

const dateLabel = (date: string): string => {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
    }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

export default function MoveTaskModal({ task, weekDates, onClose, onMove }: MoveTaskModalProps) {
    const [date, setDate] = useState('');
    const [lane, setLane] = useState<PlannerLane>('untimed');
    const [time, setTime] = useState('09:00');
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (!task) return;
        const initialLane = plannerLaneForTask(task);
        setDate(task.date);
        setLane(initialLane);
        setTime(hasTime(task) ? task.time : defaultTimeForBlock('morning'));
        requestAnimationFrame(() => closeButtonRef.current?.focus());
    }, [task]);

    useEffect(() => {
        if (!task) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )];
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [task, onClose]);

    const originalLane = useMemo(() => task ? plannerLaneForTask(task) : 'untimed', [task]);
    if (!task) return null;

    const recurrenceDateLocked = hasLockedRecurrenceDate(task);

    const selectLane = (nextLane: PlannerLane) => {
        setLane(nextLane);
        if (nextLane !== 'untimed' && (originalLane !== nextLane || !hasTime(task))) {
            setTime(defaultTimeForBlock(nextLane));
        } else if (nextLane !== 'untimed' && hasTime(task)) {
            setTime(task.time);
        }
    };

    const submit = () => {
        onMove(task.id, {
            date,
            lane,
            time: lane === 'untimed' ? undefined : time,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim px-3 sm:items-center" role="presentation">
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="move-task-heading"
                className="w-full max-w-md rounded-t-[2rem] border border-edge bg-surface-overlay p-5 pb-8 shadow-2xl sm:rounded-[2rem]"
            >
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-surface text-primary-text">
                        <CalendarDays size={21} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-text">Planung ändern</p>
                        <h2 id="move-task-heading" dir="auto" className="mt-0.5 text-start text-lg font-bold text-fg">{task.title}</h2>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg-secondary hover:bg-surface-control"
                        aria-label="Verschieben abbrechen"
                    >
                        <X size={21} aria-hidden="true" />
                    </button>
                </div>

                <fieldset className="mt-5">
                    <legend className="text-[13px] font-bold text-fg">Tag</legend>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                        {weekDates.map(weekDate => (
                            <button
                                key={weekDate}
                                type="button"
                                onClick={() => setDate(weekDate)}
                                disabled={recurrenceDateLocked && weekDate !== task.date}
                                aria-pressed={date === weekDate}
                                title={recurrenceDateLocked && weekDate !== task.date ? 'Serientag über Bearbeiten ändern' : undefined}
                                className={`min-h-11 rounded-xl border px-1 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${
                                    date === weekDate
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-edge-muted bg-surface-inset text-fg-secondary'
                                }`}
                            >
                                {dateLabel(weekDate)}
                            </button>
                        ))}
                    </div>
                </fieldset>

                <fieldset className="mt-5">
                    <legend className="text-[13px] font-bold text-fg">Tagesbereich</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        {PLANNER_LANES.map(value => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => selectLane(value)}
                                aria-pressed={lane === value}
                                className={`min-h-11 rounded-xl border px-3 text-[13px] font-semibold ${
                                    lane === value
                                        ? 'border-primary bg-primary-surface text-primary-text'
                                        : 'border-edge-muted bg-surface-inset text-fg-secondary'
                                }`}
                            >
                                {PLANNER_LANE_LABELS[value]}
                            </button>
                        ))}
                    </div>
                </fieldset>

                {lane !== 'untimed' && (
                    <label className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-edge-muted bg-surface-inset px-3 text-[13px] font-semibold text-fg">
                        <span className="flex items-center gap-2"><Clock3 size={17} aria-hidden="true" />Startzeit</span>
                        <input
                            type="time"
                            aria-label="Neue Startzeit"
                            value={time}
                            onChange={event => {
                                setTime(event.target.value);
                                if (event.target.value) setLane(deriveTimeBlock(event.target.value));
                            }}
                            className="min-h-11 rounded-lg bg-surface px-2 text-base font-bold text-fg"
                        />
                    </label>
                )}

                <p className="mt-4 text-[12px] leading-5 text-fg-secondary">
                    {recurrenceDateLocked
                        ? 'Der Serientag bleibt geschützt. Hier kannst du Tagesbereich und Uhrzeit ändern; den Wochentag änderst du bewusst über Bearbeiten.'
                        : 'Nur Tag und Tagesbereich dieses Tasks ändern sich. Checkliste und Verlauf bleiben erhalten.'}
                </p>

                <button
                    type="button"
                    onClick={submit}
                    className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-bold text-white"
                >
                    <Check size={19} aria-hidden="true" />
                    Verschieben
                </button>
            </section>
        </div>
    );
}
