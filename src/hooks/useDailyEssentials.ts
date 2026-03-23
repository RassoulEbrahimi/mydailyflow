import { useState, useEffect } from 'react';
import type { DailyEssential, DailyEssentialState, EssentialsDataWrapper, EssentialsStateWrapper } from '../types/essential';
import { isEssentialsDataWrapper, isEssentialsStateWrapper, isValidEssentialArray } from '../types/essential';
import { getTodayString } from '../utils/taskUtils';

const ESSENTIALS_DATA_KEY = 'myDailyFlowEssentialsData';
const ESSENTIALS_STATE_KEY = 'myDailyFlowEssentialsState';

export function useDailyEssentials() {
    const [essentials, setEssentials] = useState<DailyEssential[]>(() => {
        const saved = localStorage.getItem(ESSENTIALS_DATA_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (isEssentialsDataWrapper(parsed)) return parsed.data;
                if (isValidEssentialArray(parsed)) return parsed; // Migration fallback
            } catch (e) {
                console.error('Failed to parse essentials data', e);
            }
        }
        return []; // Empty state by default
    });

    const [dailyState, setDailyState] = useState<DailyEssentialState>(() => {
        const today = getTodayString();
        const defaultState: DailyEssentialState = { date: today, progressById: {} };
        const saved = localStorage.getItem(ESSENTIALS_STATE_KEY);
        
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (isEssentialsStateWrapper(parsed)) {
                    // Check if date matches today, otherwise reset
                    if (parsed.data.date === today) {
                        return parsed.data;
                    }
                }
            } catch (e) {
                console.error('Failed to parse essentials state', e);
            }
        }
        return defaultState;
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
        const wrapper: EssentialsDataWrapper = { version: 1, data: essentials };
        localStorage.setItem(ESSENTIALS_DATA_KEY, JSON.stringify(wrapper));
    }, [essentials]);

    // Persist daily state
    useEffect(() => {
        const wrapper: EssentialsStateWrapper = { version: 1, data: dailyState };
        localStorage.setItem(ESSENTIALS_STATE_KEY, JSON.stringify(wrapper));
    }, [dailyState]);

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

    // Helper for easy consumption
    const sortedEssentials = [...essentials].sort((a, b) => a.order - b.order);

    return {
        essentials: sortedEssentials,
        progressById: dailyState.progressById,
        addEssential,
        editEssential,
        deleteEssential,
        updateProgress
    };
}
