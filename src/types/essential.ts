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

export type EssentialHistorySource = 'legacy-snapshot' | 'daily-close';

export interface EssentialHistoryEntry {
    essentialId: string;
    title: string | null;
    targetCount: number | null;
    completedCount: number;
}

export interface EssentialHistoryDay {
    date: string;
    recordedAt: string | null;
    source: EssentialHistorySource;
    entries: EssentialHistoryEntry[];
}

export interface EssentialHistoryWrapper {
    version: 2;
    data: EssentialHistoryDay[];
}

export interface EssentialsDataWrapper {
    version: number;
    data: DailyEssential[];
}

export interface EssentialsStateWrapper {
    version: number;
    data: DailyEssentialState;
}

// ─── Shared primitive validators ──────────────────────────────────────────────
// Number.isInteger already rejects NaN, Infinity and non-numbers, so these also
// cover "finite" without a separate check.

/** A count that must be at least 1 (e.g. targetCount). */
export const isPositiveInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1;

/** A count that may be 0 (e.g. order, progress). */
export const isNonNegativeInteger = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, 2026-13-01, …). */
export const isValidDateString = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const dt = new Date(Date.UTC(year, month - 1, day));
    return dt.getUTCFullYear() === year
        && dt.getUTCMonth() === month - 1
        && dt.getUTCDate() === day;
};

export const isValidEssentialArray = (data: unknown): data is DailyEssential[] => {
    if (!Array.isArray(data)) return false;
    return data.every(item => {
        if (!item || typeof item !== 'object') return false;
        const e = item as Record<string, unknown>;
        return typeof e.id === 'string' &&
            typeof e.title === 'string' &&
            isPositiveInteger(e.targetCount) &&
            isNonNegativeInteger(e.order) &&
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
    return isValidEssentialState(w.data);
};

export const isValidEssentialState = (data: unknown): data is DailyEssentialState => {
    if (!data || typeof data !== 'object') return false;
    const state = data as Record<string, unknown>;
    if (!isValidDateString(state.date)) return false;
    if (!state.progressById || typeof state.progressById !== 'object') return false;
    if (Array.isArray(state.progressById)) return false;

    // Progress is a count of completions: finite, non-negative, whole.
    return Object.values(state.progressById as Record<string, unknown>).every(isNonNegativeInteger);
};

export const isValidEssentialHistory = (data: unknown): data is EssentialHistoryDay[] => {
    if (!Array.isArray(data)) return false;
    const dates = new Set<string>();
    return data.every(dayValue => {
        if (!dayValue || typeof dayValue !== 'object') return false;
        const day = dayValue as Record<string, unknown>;
        if (!isValidDateString(day.date) || dates.has(day.date)) return false;
        dates.add(day.date);
        if (day.recordedAt !== null && (
            typeof day.recordedAt !== 'string'
            || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(day.recordedAt)
            || Number.isNaN(Date.parse(day.recordedAt))
        )) return false;
        if (day.source !== 'legacy-snapshot' && day.source !== 'daily-close') return false;
        if (!Array.isArray(day.entries)) return false;
        const ids = new Set<string>();
        return day.entries.every(entryValue => {
            if (!entryValue || typeof entryValue !== 'object') return false;
            const entry = entryValue as Record<string, unknown>;
            if (typeof entry.essentialId !== 'string' || ids.has(entry.essentialId)) return false;
            ids.add(entry.essentialId);
            return (entry.title === null || typeof entry.title === 'string')
                && (entry.targetCount === null || isPositiveInteger(entry.targetCount))
                && isNonNegativeInteger(entry.completedCount);
        });
    });
};

export const isEssentialHistoryWrapper = (data: unknown): data is EssentialHistoryWrapper => {
    if (!data || typeof data !== 'object') return false;
    const wrapper = data as Record<string, unknown>;
    return wrapper.version === 2 && isValidEssentialHistory(wrapper.data);
};
