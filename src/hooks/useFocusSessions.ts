import { useEffect, useState } from 'react';

import type { FocusState } from '../types/focus';
import type { Task } from '../types/task';
import {
    finishFocusState,
    pauseFocusState,
    resumeFocusState,
    startFocusSession,
} from '../utils/focusSessions';
import {
    STORAGE_KEYS,
    loadFocusStateSlice,
    serializeFocusState,
} from '../utils/appStorage';
import { isSliceBlocked, registerBlockedSlice, blockReasonFor } from '../utils/storageHealth';

const newId = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `focus-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function useFocusSessions() {
    const [initialLoad] = useState(() => loadFocusStateSlice(localStorage, new Date().toISOString()));
    const [state, setState] = useState<FocusState>(() => initialLoad.value ?? {
        activeSession: null,
        history: [],
    });
    const [persistBlocked] = useState(() => initialLoad.blocked || isSliceBlocked('focusState'));

    useEffect(() => {
        if (!initialLoad.blocked) return;
        registerBlockedSlice({
            slice: 'focusState',
            reason: blockReasonFor(initialLoad.status),
            recoveryKey: initialLoad.recoveryKey,
            detail: initialLoad.detail,
        });
    }, [initialLoad]);

    useEffect(() => {
        if (persistBlocked) return;
        try {
            localStorage.setItem(STORAGE_KEYS.focusState, serializeFocusState(state));
        } catch (error) {
            console.error('Failed to persist focus state', error);
        }
    }, [state, persistBlocked]);

    const start = (task: Task, minutes: number, nowISO = new Date().toISOString()) => {
        setState(previous => ({
            ...startFocusSession(task, minutes, nowISO, newId()),
            history: previous.history,
        }));
    };

    return {
        focusState: state,
        startFocus: start,
        pauseFocus: (nowISO = new Date().toISOString()) => setState(previous => pauseFocusState(previous, nowISO)),
        resumeFocus: (nowISO = new Date().toISOString()) => setState(previous => resumeFocusState(previous, nowISO)),
        finishFocus: (nowISO = new Date().toISOString()) => setState(previous => finishFocusState(previous, nowISO)),
    };
}
