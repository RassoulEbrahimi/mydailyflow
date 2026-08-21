import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Pause, Play, TimerReset } from 'lucide-react';

import type { ActiveFocusSession } from '../types/focus';
import { formatFocusClock, remainingFocusMs, runningElapsedMs } from '../utils/focusSessions';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface FocusSessionPanelProps {
    session: ActiveFocusSession | null;
    isOpen: boolean;
    onMinimize: () => void;
    onPause: () => void;
    onResume: () => void;
    onFinish: () => void;
}
export default function FocusSessionPanel({
    session,
    isOpen,
    onMinimize,
    onPause,
    onResume,
    onFinish,
}: FocusSessionPanelProps) {
    const dialogRef = useRef<HTMLElement>(null);
    const [nowISO, setNowISO] = useState(() => new Date().toISOString());
    useDialogFocus(isOpen, dialogRef);

    useEffect(() => {
        if (!isOpen || !session || session.status !== 'running') return;
        const tick = () => setNowISO(new Date().toISOString());
        tick();
        const intervalId = window.setInterval(tick, 1000);
        return () => window.clearInterval(intervalId);
    }, [isOpen, session?.id, session?.status]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onMinimize();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onMinimize]);

    const timing = useMemo(() => {
        if (!session) return { elapsed: 0, remaining: 0, reached: false, progress: 0 };
        const elapsed = runningElapsedMs(session, nowISO);
        const target = session.plannedDurationMinutes * 60_000;
        return {
            elapsed,
            remaining: remainingFocusMs(session, nowISO),
            reached: elapsed >= target,
            progress: Math.min(100, Math.round(elapsed / target * 100)),
        };
    }, [session, nowISO]);

    if (!session || !isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-scrim px-3 sm:items-center" role="presentation">
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="focus-session-heading"
                className="w-full max-w-md rounded-t-[2rem] border border-edge bg-surface-overlay p-5 pb-8 shadow-2xl sm:rounded-[2rem]"
            >
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-primary-text">
                        <TimerReset size={19} aria-hidden="true" />
                        <p className="text-[12px] font-semibold uppercase tracking-[0.14em]">
                            {session.status === 'paused' ? 'Pausiert' : timing.reached ? 'Zielzeit erreicht' : 'Fokus läuft'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onMinimize}
                        className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-[13px] font-semibold text-fg-secondary hover:bg-surface-control"
                        aria-label="Fokus minimieren"
                    >
                        <ChevronDown size={19} aria-hidden="true" />
                        Minimieren
                    </button>
                </div>

                <h2 id="focus-session-heading" dir="auto" className="mt-5 text-start text-xl font-bold leading-snug text-fg break-words">
                    {session.taskTitle}
                </h2>

                <div className="mt-7 text-center" aria-live="polite">
                    <p className="font-mono text-6xl font-bold tracking-tight text-fg" dir="ltr">
                        {timing.reached ? formatFocusClock(timing.elapsed) : formatFocusClock(timing.remaining)}
                    </p>
                    <p className="mt-2 text-[13px] font-medium text-fg-secondary">
                        {timing.reached
                            ? `${formatFocusClock(timing.elapsed)} fokussiert · Ziel ${session.plannedDurationMinutes} min`
                            : `noch übrig · ${session.plannedDurationMinutes} min geplant`}
                    </p>
                </div>

                <div
                    className="mt-7 h-2 overflow-hidden rounded-full bg-ring-track"
                    role="progressbar"
                    aria-label="Fokusfortschritt"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={timing.progress}
                >
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${timing.progress}%` }} />
                </div>

                <div className="mt-7 grid grid-cols-2 gap-2.5">
                    <button
                        type="button"
                        onClick={session.status === 'running' ? onPause : onResume}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-edge-strong bg-surface-inset px-3 font-bold text-fg"
                    >
                        {session.status === 'running'
                            ? <Pause size={19} fill="currentColor" aria-hidden="true" />
                            : <Play size={19} fill="currentColor" aria-hidden="true" />}
                        {session.status === 'running' ? 'Pause' : 'Fortsetzen'}
                    </button>
                    <button
                        type="button"
                        onClick={onFinish}
                        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 font-bold text-white"
                    >
                        <Check size={20} aria-hidden="true" />
                        Fokus beenden
                    </button>
                </div>

                <p className="mt-4 text-center text-[12px] leading-5 text-fg-secondary">
                    Beenden speichert die Fokuszeit. Die Aufgabe bleibt unverändert, bis du sie selbst als erledigt markierst.
                </p>
            </section>
        </div>
    );
}
