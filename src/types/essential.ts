export interface DailyEssential {
    id: string;
    title: string;
    targetCount: number; // 1 for simple toggle, > 1 for multi-check
    order: number;
    createdAt: string;
}

export interface DailyEssentialState {
    date: string; // YYYY-MM-DD
    progressById: Record<string, number>;
}

export interface EssentialsDataWrapper {
    version: number;
    data: DailyEssential[];
}

export interface EssentialsStateWrapper {
    version: number;
    data: DailyEssentialState;
}

export const isValidEssentialArray = (data: unknown): data is DailyEssential[] => {
    if (!Array.isArray(data)) return false;
    return data.every(item => {
        if (!item || typeof item !== 'object') return false;
        const e = item as Record<string, unknown>;
        return typeof e.id === 'string' &&
            typeof e.title === 'string' &&
            typeof e.targetCount === 'number' &&
            typeof e.order === 'number' &&
            typeof e.createdAt === 'string';
    });
};

export const isEssentialsDataWrapper = (data: unknown): data is EssentialsDataWrapper => {
    if (!data || typeof data !== 'object') return false;
    const w = data as Record<string, unknown>;
    return typeof w.version === 'number' && isValidEssentialArray(w.data);
};

export const isEssentialsStateWrapper = (data: unknown): data is EssentialsStateWrapper => {
    if (!data || typeof data !== 'object') return false;
    const w = data as Record<string, unknown>;
    if (typeof w.version !== 'number') return false;
    const state = w.data as Record<string, unknown>;
    if (!state || typeof state !== 'object') return false;
    if (typeof state.date !== 'string') return false;
    if (!state.progressById || typeof state.progressById !== 'object') return false;
    
    // Check that progressById values are numbers
    return Object.values(state.progressById).every(val => typeof val === 'number');
};
