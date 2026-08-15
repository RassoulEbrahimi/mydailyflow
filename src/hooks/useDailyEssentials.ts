import { useState, useEffect } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DailyEssential, DailyEssentialState } from '../types/essential';
import { isValidEssentialArray, isValidEssentialState } from '../types/essential';
import {
    STORAGE_KEYS,
    loadEssentialsSlice,
    loadEssentialsStateSlice,
    serializeEssentials,
    serializeEssentialsState,
} from '../utils/appStorage';
import type { SliceLoadResult } from '../utils/appStorage';
import { blockReasonFor, isSliceBlocked, registerBlockedSlice, subscribeStorageHealth } from '../utils/storageHealth';
import type { StorageSlice } from '../utils/storageHealth';
import { getTodayString } from '../utils/taskUtils';

/**
 * Registers a failed slice load and keeps its writes suppressed until an
 * explicit user action (or a successful import) resolves it. Each slice is
 * tracked on its own, so an unreadable definitions blob never stops today's
 * progress from being saved, and vice versa.
 */
function useSliceGuard(slice: StorageSlice, load: SliceLoadResult<unknown>): boolean {
    const [blocked, setBlocked] = useState(load.blocked);

    useEffect(() => {
        if (!load.blocked) return;

        registerBlockedSlice({
            slice,
            reason: blockReasonFor(load.status),
            recoveryKey: load.recoveryKey,
            detail: load.detail,
        });

        return subscribeStorageHealth(() => {
            if (!isSliceBlocked(slice)) setBlocked(false);
        });
    }, [slice, load]);

    return blocked;
}

export function useDailyEssentials() {
    // Both slices are loaded once, synchronously, before any effect can write.
    const [dataLoad] = useState(() => loadEssentialsSlice(localStorage, new Date().toISOString()));
    const [stateLoad] = useState(() => loadEssentialsStateSlice(localStorage, new Date().toISOString()));

    const dataBlocked = useSliceGuard('essentials', dataLoad);
    const stateBlocked = useSliceGuard('essentialsState', stateLoad);

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

    // Handle day rollover while app is open
    useEffect(() => {
        const checkRollover = () => {
            const today = getTodayString();
            if (dailyState.date !== today) {
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
    }, [dailyState.date]);

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

    // Persist daily state
    useEffect(() => {
        if (stateBlocked) return;
        try {
            if (isValidEssentialState(dailyState)) {
                localStorage.setItem(STORAGE_KEYS.essentialsState, serializeEssentialsState(dailyState));
            } else {
                console.error('Invalid essentials daily state detected, skipping save to protect localStorage');
            }
        } catch (e) {
            console.error('Failed to save essentials daily state', e);
        }
    }, [dailyState, stateBlocked]);

    const addEssential = (title: string, targetCount: number) => {
        const newEssential: DailyEssential = {
            id: Math.random().toString(36).substring(2, 9),
            title,
            targetCount,
            order: essentials.length,
            createdAt: new Date().toISOString()
        };
        setEssentials(prev => [...prev, newEssential]);
        // Progress defaults to 0 as it's not in the state yet
    };

    const editEssential = (id: string, updates: Partial<Pick<DailyEssential, 'title' | 'targetCount' | 'order'>>) => {
        setEssentials(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
        
        // If targetCount was reduced, clamp existing progress if necessary
        if (updates.targetCount !== undefined) {
            setDailyState(prev => {
                const currentProgress = prev.progressById[id] || 0;
                if (currentProgress > updates.targetCount!) {
                    return {
                        ...prev,
                        progressById: {
                            ...prev.progressById,
                            [id]: updates.targetCount!
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
        addEssential,
        editEssential,
        deleteEssential,
        updateProgress,
        reorderEssentials
    };
}
