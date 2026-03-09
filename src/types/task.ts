// ─── Task domain types & runtime validators ───────────────────────────────────

export interface Task {
    id: string;
    title: string;
    description?: string;
    time: string;
    duration: string;
    timeBlock: 'morning' | 'afternoon' | 'evening';
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    createdAt: string;
    date: string;            // YYYY-MM-DD, local timezone
    rolledOverFrom?: string; // original date when rolled over
}

export interface StorageWrapper {
    version: number;
    data: Task[];
}

export const isValidTaskArray = (data: unknown): data is Task[] => {
    if (!Array.isArray(data)) return false;

    return data.every(item => {
        if (!item || typeof item !== 'object') return false;
        const t = item as Record<string, unknown>;
        return (
            typeof t.id === 'string' &&
            typeof t.title === 'string' &&
            (t.description === undefined || typeof t.description === 'string') &&
            typeof t.time === 'string' &&
            typeof t.duration === 'string' &&
            ['morning', 'afternoon', 'evening'].includes(t.timeBlock as string) &&
            typeof t.completed === 'boolean' &&
            ['low', 'medium', 'high'].includes(t.priority as string) &&
            typeof t.createdAt === 'string' &&
            // date is optional here to support migration of old data
            (t.date === undefined || typeof t.date === 'string') &&
            (t.rolledOverFrom === undefined || typeof t.rolledOverFrom === 'string')
        );
    });
};

export const isStorageWrapper = (data: unknown): data is StorageWrapper => {
    if (!data || typeof data !== 'object') return false;
    const w = data as Record<string, unknown>;
    return typeof w.version === 'number' && isValidTaskArray(w.data);
};
