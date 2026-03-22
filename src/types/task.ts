// ─── Task domain types & runtime validators ───────────────────────────────────

export interface ChecklistItem {
    id: string;
    text: string;
    completed: boolean;
}

export type Recurrence = 'none' | 'daily' | 'every2days' | 'weekly' | 'monthly';

export const VALID_RECURRENCES: Recurrence[] = ['none', 'daily', 'every2days', 'weekly', 'monthly'];

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
    date: string;               // YYYY-MM-DD, local timezone
    rolledOverFrom?: string;    // original date when rolled over
    checklistItems?: ChecklistItem[];
    notes?: string;
    recurrence?: Recurrence;       // recurrence rule; 'none' or undefined = no recurrence
    recurrenceSourceId?: string;   // ID of the completed task that spawned this occurrence (dedup)
    reminderEnabled?: boolean;     // whether a notification reminder is enabled for this task
}

export interface StorageWrapper {
    version: number;
    data: Task[];
}

const isChecklistItem = (item: unknown): item is ChecklistItem => {
    if (!item || typeof item !== 'object') return false;
    const c = item as Record<string, unknown>;
    return (
        typeof c.id === 'string' &&
        typeof c.text === 'string' &&
        typeof c.completed === 'boolean'
    );
};

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
            (t.rolledOverFrom === undefined || typeof t.rolledOverFrom === 'string') &&
            (t.checklistItems === undefined || (Array.isArray(t.checklistItems) && t.checklistItems.every(isChecklistItem))) &&
            (t.notes === undefined || typeof t.notes === 'string') &&
            (t.recurrence === undefined || VALID_RECURRENCES.includes(t.recurrence as Recurrence)) &&
            (t.recurrenceSourceId === undefined || typeof t.recurrenceSourceId === 'string') &&
            (t.reminderEnabled === undefined || typeof t.reminderEnabled === 'boolean')
        );
    });
};

export const isStorageWrapper = (data: unknown): data is StorageWrapper => {
    if (!data || typeof data !== 'object') return false;
    const w = data as Record<string, unknown>;
    return typeof w.version === 'number' && isValidTaskArray(w.data);
};
