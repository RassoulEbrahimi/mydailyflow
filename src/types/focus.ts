import { isCanonicalUtcInstant } from './task';

export type ActiveFocusStatus = 'running' | 'paused';

export interface ActiveFocusSession {
    id: string;
    taskId: string;
    taskTitle: string;
    plannedDurationMinutes: number;
    startedAt: string;
    activeStartedAt: string | null;
    elapsedMs: number;
    status: ActiveFocusStatus;
}

export interface CompletedFocusSession {
    id: string;
    taskId: string;
    taskTitle: string;
    plannedDurationMinutes: number;
    startedAt: string;
    completedAt: string;
    elapsedMs: number;
}

export interface FocusState {
    activeSession: ActiveFocusSession | null;
    history: CompletedFocusSession[];
}

export interface FocusStateWrapper {
    version: 1;
    data: FocusState;
}

const isNonNegativeFiniteInteger = (value: unknown): value is number =>
    typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0;

const isPositiveFiniteInteger = (value: unknown): value is number =>
    isNonNegativeFiniteInteger(value) && value > 0;

const hasFocusIdentity = (value: Record<string, unknown>): boolean =>
    typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.taskId === 'string'
    && value.taskId.length > 0
    && typeof value.taskTitle === 'string'
    && isPositiveFiniteInteger(value.plannedDurationMinutes)
    && isCanonicalUtcInstant(value.startedAt)
    && isNonNegativeFiniteInteger(value.elapsedMs);

export const isActiveFocusSession = (value: unknown): value is ActiveFocusSession => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const session = value as Record<string, unknown>;
    if (!hasFocusIdentity(session)) return false;
    if (session.status !== 'running' && session.status !== 'paused') return false;
    if (session.status === 'running') {
        return isCanonicalUtcInstant(session.activeStartedAt)
            && Date.parse(session.activeStartedAt) >= Date.parse(session.startedAt as string);
    }
    return session.activeStartedAt === null;
};

export const isCompletedFocusSession = (value: unknown): value is CompletedFocusSession => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const session = value as Record<string, unknown>;
    return hasFocusIdentity(session)
        && isCanonicalUtcInstant(session.completedAt)
        && Date.parse(session.completedAt as string) >= Date.parse(session.startedAt as string);
};

export const isValidFocusState = (value: unknown): value is FocusState => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as Record<string, unknown>;
    if (state.activeSession !== null && !isActiveFocusSession(state.activeSession)) return false;
    if (!Array.isArray(state.history) || !state.history.every(isCompletedFocusSession)) return false;

    const ids = new Set<string>();
    if (state.activeSession) ids.add((state.activeSession as ActiveFocusSession).id);
    for (const entry of state.history as CompletedFocusSession[]) {
        if (ids.has(entry.id)) return false;
        ids.add(entry.id);
    }
    return true;
};

export const isFocusStateWrapper = (value: unknown): value is FocusStateWrapper => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const wrapper = value as Record<string, unknown>;
    return wrapper.version === 1 && isValidFocusState(wrapper.data);
};
