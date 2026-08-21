import type {
    ActiveFocusSession,
    CompletedFocusSession,
    FocusState,
} from '../types/focus';
import type { Task } from '../types/task';

export const EMPTY_FOCUS_STATE: FocusState = { activeSession: null, history: [] };

const instantMs = (iso: string): number => Date.parse(iso);

export const runningElapsedMs = (session: ActiveFocusSession, nowISO: string): number => {
    if (session.status === 'paused' || session.activeStartedAt === null) return session.elapsedMs;
    return session.elapsedMs + Math.max(0, instantMs(nowISO) - instantMs(session.activeStartedAt));
};

export const remainingFocusMs = (session: ActiveFocusSession, nowISO: string): number =>
    Math.max(0, session.plannedDurationMinutes * 60_000 - runningElapsedMs(session, nowISO));

export const startFocusSession = (
    task: Task,
    plannedDurationMinutes: number,
    nowISO: string,
    id: string,
): FocusState => ({
    activeSession: {
        id,
        taskId: task.id,
        taskTitle: task.title,
        plannedDurationMinutes,
        startedAt: nowISO,
        activeStartedAt: nowISO,
        elapsedMs: 0,
        status: 'running',
    },
    history: [],
});

export const pauseFocusState = (state: FocusState, nowISO: string): FocusState => {
    const session = state.activeSession;
    if (!session || session.status === 'paused') return state;
    return {
        ...state,
        activeSession: {
            ...session,
            status: 'paused',
            elapsedMs: runningElapsedMs(session, nowISO),
            activeStartedAt: null,
        },
    };
};

export const resumeFocusState = (state: FocusState, nowISO: string): FocusState => {
    const session = state.activeSession;
    if (!session || session.status === 'running') return state;
    return {
        ...state,
        activeSession: {
            ...session,
            status: 'running',
            activeStartedAt: nowISO,
        },
    };
};

export const finishFocusState = (state: FocusState, nowISO: string): FocusState => {
    const session = state.activeSession;
    if (!session) return state;
    const completed: CompletedFocusSession = {
        id: session.id,
        taskId: session.taskId,
        taskTitle: session.taskTitle,
        plannedDurationMinutes: session.plannedDurationMinutes,
        startedAt: session.startedAt,
        completedAt: nowISO,
        elapsedMs: runningElapsedMs(session, nowISO),
    };
    return {
        activeSession: null,
        history: [completed, ...state.history.filter(entry => entry.id !== completed.id)],
    };
};

/** A backup never claims that focus continued while the file was outside the app. */
export const pauseFocusForBackup = (state: FocusState, exportedAt: string): FocusState =>
    pauseFocusState(state, exportedAt);

export const mergeFocusStates = (current: FocusState, incoming: FocusState): FocusState => {
    const currentHistoryIds = new Set(current.history.map(entry => entry.id));
    const activeSession = current.activeSession
        ? { ...current.activeSession }
        : incoming.activeSession && !currentHistoryIds.has(incoming.activeSession.id)
            ? { ...incoming.activeSession, status: 'paused' as const, activeStartedAt: null }
            : null;
    const seen = new Set<string>();
    const history: CompletedFocusSession[] = [];
    for (const entry of current.history) {
        if (entry.id === activeSession?.id || seen.has(entry.id)) continue;
        seen.add(entry.id);
        history.push({ ...entry });
    }
    for (const entry of incoming.history) {
        if (entry.id === activeSession?.id || seen.has(entry.id)) continue;
        seen.add(entry.id);
        history.push({ ...entry });
    }
    history.sort((a, b) => b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
    return {
        activeSession,
        history,
    };
};

export const formatFocusClock = (milliseconds: number): string => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
