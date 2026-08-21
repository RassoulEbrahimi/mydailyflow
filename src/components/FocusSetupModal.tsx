import { useEffect, useRef, useState } from 'react';
import { Play, TimerReset, X } from 'lucide-react';

import type { Task } from '../types/task';
import { useDialogFocus } from '../hooks/useDialogFocus';

const PRESETS = [15, 25, 45, 60] as const;

interface FocusSetupModalProps {
    task: Task | null;
    onClose: () => void;
    onStart: (task: Task, minutes: number) => void;
}
export default function FocusSetupModal({ task, onClose, onStart }: FocusSetupModalProps) {
    const [minutes, setMinutes] = useState(25);
    const dialogRef = useRef<HTMLElement>(null);
    useDialogFocus(Boolean(task), dialogRef);

    useEffect(() => {
        if (task) setMinutes(25);
    }, [task]);

    useEffect(() => {
        if (!task) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [task, onClose]);

    if (!task) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim px-3 sm:items-center" role="presentation">
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="focus-setup-heading"
                className="w-full max-w-md rounded-t-[2rem] border border-edge bg-surface-overlay p-5 pb-8 shadow-2xl sm:rounded-[2rem]"
            >
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-surface text-primary-text">
                        <TimerReset size={21} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary-text">Fokus vorbereiten</p>
                        <h2 id="focus-setup-heading" dir="auto" className="mt-0.5 text-start text-lg font-bold text-fg break-words">
                            {task.title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-fg-secondary hover:bg-surface-control"
                        aria-label="Fokus vorbereiten schließen"
                    >
                        <X size={21} aria-hidden="true" />
                    </button>
                </div>

                <fieldset className="mt-6">
                    <legend className="text-[13px] font-bold text-fg">Wie lange möchtest du fokussieren?</legend>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {PRESETS.map(value => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setMinutes(value)}
                                aria-pressed={minutes === value}
                                className={`min-h-12 rounded-xl border text-[14px] font-bold ${
                                    minutes === value
                                        ? 'border-primary bg-primary text-white'
                                        : 'border-edge-muted bg-surface-inset text-fg-secondary'
                                }`}
                            >
                                {value} min
                            </button>
                        ))}
                    </div>
                </fieldset>

                <p className="mt-5 text-[12px] leading-5 text-fg-secondary">
                    Die Sitzung bleibt bei Reload oder App-Wechsel erhalten. Am Ende entscheidest du selbst, ob die Aufgabe erledigt ist.
                </p>

                <button
                    type="button"
                    onClick={() => onStart(task, minutes)}
                    className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-bold text-white"
                >
                    <Play size={19} fill="currentColor" aria-hidden="true" />
                    Fokus starten
                </button>
            </section>
        </div>
    );
}
