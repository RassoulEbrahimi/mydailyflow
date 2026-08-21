import type { Recurrence, Task } from './task';

export interface TemplateChecklistItem {
    text: string;
}

export interface TaskTemplateItem {
    dayOffset: number;
    title: string;
    notes?: string;
    time: string;
    duration: string;
    timeBlock: Task['timeBlock'];
    priority: Task['priority'];
    checklistItems?: TemplateChecklistItem[];
    recurrence: Recurrence;
    reminderEnabled: boolean;
}

export interface TaskTemplate {
    id: string;
    name: string;
    kind: 'task' | 'routine';
    createdAt: string;
    items: TaskTemplateItem[];
}

export interface TemplatesWrapper {
    version: 1;
    data: TaskTemplate[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTemplateChecklistItem = (value: unknown): value is TemplateChecklistItem =>
    isPlainObject(value)
    && typeof value.text === 'string'
    && value.text.trim().length > 0;

const isTemplateItem = (value: unknown): value is TaskTemplateItem => {
    if (!isPlainObject(value)) return false;
    return Number.isSafeInteger(value.dayOffset)
        && (value.dayOffset as number) >= 0
        && typeof value.title === 'string'
        && value.title.trim().length > 0
        && (value.notes === undefined || typeof value.notes === 'string')
        && typeof value.time === 'string'
        && typeof value.duration === 'string'
        && ['morning', 'afternoon', 'evening'].includes(value.timeBlock as string)
        && ['low', 'medium', 'high'].includes(value.priority as string)
        && ['none', 'daily', 'every2days', 'weekly', 'monthly'].includes(value.recurrence as string)
        && typeof value.reminderEnabled === 'boolean'
        && (value.checklistItems === undefined
            || Array.isArray(value.checklistItems) && value.checklistItems.every(isTemplateChecklistItem));
};

export const isValidTemplateArray = (value: unknown): value is TaskTemplate[] => {
    if (!Array.isArray(value)) return false;
    const ids = new Set<string>();
    return value.every(candidate => {
        if (!isPlainObject(candidate)
            || typeof candidate.id !== 'string'
            || candidate.id.length === 0
            || ids.has(candidate.id)
            || typeof candidate.name !== 'string'
            || candidate.name.trim().length === 0
            || (candidate.kind !== 'task' && candidate.kind !== 'routine')
            || typeof candidate.createdAt !== 'string'
            || Number.isNaN(Date.parse(candidate.createdAt))
            || !Array.isArray(candidate.items)
            || candidate.items.length === 0
            || !candidate.items.every(isTemplateItem)) return false;

        const items = candidate.items as TaskTemplateItem[];
        if (Math.min(...items.map(item => item.dayOffset)) !== 0) return false;
        if (candidate.kind === 'task' && (items.length !== 1 || items[0].dayOffset !== 0)) return false;
        if (candidate.kind === 'routine' && items.length < 2) return false;
        ids.add(candidate.id);
        return true;
    });
};

export const isTemplatesWrapper = (value: unknown): value is TemplatesWrapper =>
    isPlainObject(value) && value.version === 1 && isValidTemplateArray(value.data);
