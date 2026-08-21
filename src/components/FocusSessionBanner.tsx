import { Pause, Play, TimerReset } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { ActiveFocusSession } from '../types/focus';
import { formatFocusClock, remainingFocusMs } from '../utils/focusSessions';

interface FocusSessionBannerProps {
    session: ActiveFocusSession;
    onOpen: () => void;
}
export default function FocusSessionBanner({ session, onOpen }: FocusSessionBannerProps) {
    const [nowISO, setNowISO] = useState(() => new Date().toISOString());

    useEffect(() => {
        if (session.status !== 'running') return;
        const tick = () => setNowISO(new Date().toISOString());
        tick();
        const intervalId = window.setInterval(tick, 1000);
        return () => window.clearInterval(intervalId);
    }, [session.id, session.status]);

    const remaining = remainingFocusMs(session, nowISO);
    return (
        <button
            type="button"
            onClick={onOpen}
            className="mx-5 mb-3 flex min-h-14 w-[calc(100%-2.5rem)] items-center gap-3 rounded-2xl border border-primary-border bg-primary-surface px-4 text-left shadow-sm"
            aria-label={`Fokus öffnen: ${session.taskTitle}, ${session.status === 'paused' ? 'pausiert' : `${formatFocusClock(remaining)} verbleibend`}`}
        >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                {session.status === 'paused'
                    ? <Pause size={18} fill="currentColor" aria-hidden="true" />
                    : <TimerReset size={19} aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-start text-[14px] font-bold text-fg">{session.taskTitle}</span>
                <span className="mt-0.5 block text-[12px] font-semibold text-primary-text" dir="ltr">
                    {session.status === 'paused' ? 'Pausiert' : `${formatFocusClock(remaining)} verbleibend`}
                </span>
            </span>
            <Play size={18} className="flex-shrink-0 text-primary-text" aria-hidden="true" />
        </button>
    );
}
