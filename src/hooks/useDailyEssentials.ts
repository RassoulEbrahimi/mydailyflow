import { useState, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DailyEssential, DailyEssentialState, EssentialHistoryDay } from '../types/essential';
import { clampDailyEssentialTarget, isValidEssentialArray, isValidEssentialHistory, isValidEssentialState } from '../types/essential';
import {
    STORAGE_KEYS,
    loadEssentialsSlice,
    loadEssentialsStateSlice,
    loadEssentialHistorySlice,
    applyStorageTransaction,
    serializeEssentials,
    serializeEssentialsState,
    serializeEssentialHistory,
} from '../utils/appStorage';
import type { SliceLoadResult } from '../utils/appStorage';
import { blockReasonFor, isSliceBlocked, registerBlockedSlice, subscribeStorageHealth } from '../utils/storageHealth';
import type { StorageSlice } from '../utils/storageHealth';
import { getTodayString } from '../utils/taskUtils';
import { closeEssentialHistoryDay } from '../utils/phase2Migration';

/**
 * Registers a failed slice load and keeps its writes suppressed until an
 * explicit user action (or a successful import) resolves it. Each slice is
 * tracked on its own, so an unreadable definitions blob never stops today's
 * progress from being saved, and vice versa.
 */
function useSliceGuard(slice: StorageSlice, load: SliceLoadResult<unknown>): boolean {
    const [blocked, setBlocked] = useState(load.blocked || isSliceBlocked(slice));

    useEffect(() => {
        if (load.blocked) {
            registerBlockedSlice({
                slice,
                reason: blockReasonFor(load.status),
                recoveryKey: load.recoveryKey,
                detail: load.detail,
            });
        }
        if (!load.blocked && !isSliceBlocked(slice)) return;

        return subscribeStorageHealth(() => {
            setBlocked(isSliceBlocked(slice));
        });
    }, [slice, load]);

    return blocked;
}

export function useDailyEssentials() {
    // Both slices are loaded once, synchronously, before any effect can write.
    const [dataLoad] = useState(() => loadEssentialsSlice(localStorage, new Date().toISOString()));
    const [stateLoad] = useState(() => loadEssentialsStateSlice(localStorage, new Date().toISOString()));
    const [historyLoad] = useState(() => loadEssentialHistorySlice(localStorage, new Date().toISOString()));

    const dataBlocked = useSliceGuard('essentials', dataLoad);
    const stateBlocked = useSliceGuard('essentialsState', stateLoad);
    const historyBlocked = useSliceGuard('essentialHistory', historyLoad);

    const [essentials, setEssentials] = useState<DailyEssential[]>(() => {
        if (dataLoad.value) return dataLoad.value;
        if (dataLoad.blocked) {
            console.warn('Essentials data unreadable — persistence suspended', dataLoad.detail);
        }
        return []; // Empty state by default
    });

    const [dailyState, setDailyState] = useState<DailyEssentialState>(() => {
        const today = getTodayString();
        // Yesterday's progress is intentionally not carried over.
        if (stateLoad.value && stateLoad.value.date === today) return stateLoad.value;
        if (stateLoad.blocked) {
            console.warn('Essentials state unreadable — persistence suspended', stateLoad.detail);
        }
        return { date: today, progressById: {} };
    });

    const [history, setHistory] = useState<EssentialHistoryDay[]>(() => historyLoad.value ?? []);

    const closeDay = (state: DailyEssentialState, recordedAt: string) => {
        setHistory(previous => closeEssentialHistoryDay(previous, essentials, state, recordedAt));
    };

    // Handle day rollover while app is open
    useEffect(() => {
        const checkRollover = () => {
            const today = getTodayString();
            if (dailyState.date !== today) {
                closeDay(dailyState, new Date().toISOString());
                setDailyState({ date: today, progressById: {} });
            }
        };

        // Check every minute just in case user leaves app open overnight
        const intervalId = setInterval(checkRollover, 60000);
        // Also check on visibility change (coming back to the app)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkRollover();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [dailyState.date, essentials]);

    // Persist essentials definitions
    useEffect(() => {
        if (dataBlocked) return;
        try {
            if (isValidEssentialArray(essentials)) {
                localStorage.setItem(STORAGE_KEYS.essentialsData, serializeEssentials(essentials));
            } else {
                console.error('Invalid essentials state detected, skipping save to protect localStorage');
            }
        } catch (e) {
            console.error('Failed to save essentials data', e);
        }
    }, [essentials, dataBlocked]);

    // Progress and its immutable daily history are one consistency boundary.
    // A verified transaction prevents a day reset from landing without its
    // matching history record (or vice versa).
    useEffect(() => {
        if (stateBlocked || historyBlocked) return;
        try {
            if (isValidEssentialState(dailyState) && isValidEssentialHistory(history)) {
                const result = applyStorageTransaction(localStorage, [
                    { key: STORAGE_KEYS.essentialsState, value: serializeEssentialsState(dailyState) },
                    { key: STORAGE_KEYS.essentialHistory, value: serializeEssentialHistory(history) },
                ]);
                if (result.status === 'failed') {
                    console.error('Failed to persist essentials state/history atomically', result.error);
                    registerBlockedSlice({ slice: 'essentialsState', reason: 'quarantine-failed', detail: result.error });
                    registerBlockedSlice({ slice: 'essentialHistory', reason: 'quarantine-failed', detail: result.error });
                }
            } else {
                console.error('Invalid essentials state/history detected, skipping save to protect localStorage');
            }
        } catch (e) {
            console.error('Failed to save essentials daily state/history', e);
        }
    }, [dailyState, history, stateBlocked, historyBlocked]);

    const addEssential = (title: string, targetCount: number) => {
        const newEssential: DailyEssential = {
            id: Math.random().toString(36).substring(2, 9),
            title,
            targetCount: clampDailyEssentialTarget(targetCount),
            order: essentials.length,
            createdAt: new Date().toISOString()
        };
        setEssentials(prev => [...prev, newEssential]);
        // Progress defaults to 0 as it's not in the state yet
    };

    const editEssential = (id: string, updates: Partial<Pick<DailyEssential, 'title' | 'targetCount' | 'order'>>) => {
        const normalizedUpdates = updates.targetCount === undefined
            ? updates
            : { ...updates, targetCount: clampDailyEssentialTarget(updates.targetCount) };
        setEssentials(prev => prev.map(e => e.id === id ? { ...e, ...normalizedUpdates } : e));
        
        // If targetCount was reduced, clamp existing progress if necessary
        if (normalizedUpdates.targetCount !== undefined) {
            setDailyState(prev => {
                const currentProgress = prev.progressById[id] || 0;
                if (currentProgress > normalizedUpdates.targetCount!) {
                    return {
                        ...prev,
                        progressById: {
                            ...prev.progressById,
                            [id]: normalizedUpdates.targetCount!
                        }
                    };
                }
                return prev;
            });
        }
    };

    const deleteEssential = (id: string) => {
        setEssentials(prev => prev.filter(e => e.id !== id));
        // Also clean up from state to avoid memory leak if many are created and deleted
        setDailyState(prev => {
            const newProgress = { ...prev.progressById };
            delete newProgress[id];
            return { ...prev, progressById: newProgress };
        });
    };

    const updateProgress = (id: string, progress: number) => {
        setDailyState(prev => ({
            ...prev,
            progressById: {
                ...prev.progressById,
                [id]: progress
            }
        }));
    };

    const reorderEssentials = (activeId: string, overId: string) => {
        setEssentials(prev => {
            const sorted = [...prev].sort((a, b) => a.order - b.order);
            const oldIndex = sorted.findIndex(e => e.id === activeId);
            const newIndex = sorted.findIndex(e => e.id === overId);
            if (oldIndex !== -1 && newIndex !== -1) {
                const reordered = arrayMove(sorted, oldIndex, newIndex);
                return reordered.map((e, index) => ({ ...e, order: index }));
            }
            return prev;
        });
    };

    // Helper for easy consumption
    const sortedEssentials = [...essentials].sort((a, b) => a.order - b.order);

    return {
        essentials: sortedEssentials,
        progressById: dailyState.progressById,
        history,
        addEssential,
        editEssential,
        deleteEssential,
        updateProgress,
        reorderEssentials
    };
}
