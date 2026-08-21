import type { Task } from '../types/task';
import type { TaskTemplate, TaskTemplateItem } from '../types/template';

const epochDay = (date: string): number => {
    const [year, month, day] = date.split('-').map(Number);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const addTemplateDays = (date: string, days: number): string => {
    const [year, month, day] = date.split('-').map(Number);
    const result = new Date(Date.UTC(year, month - 1, day + days, 12));
    return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
};

const itemFromTask = (task: Task, firstDate: string): TaskTemplateItem => ({
    dayOffset: Math.max(0, epochDay(task.date) - epochDay(firstDate)),
    title: task.title,
    notes: task.notes ?? task.description,
    time: task.time,
    duration: task.duration,
    timeBlock: task.timeBlock,
    priority: task.priority,
    checklistItems: task.checklistItems?.map(item => ({ text: item.text })),
    recurrence: task.recurrence ?? 'none',
    reminderEnabled: Boolean(task.time) && (task.reminderEnabled ?? true),
});

export const buildTaskTemplate = (
    name: string,
    tasks: Task[],
    id: string,
    createdAt: string,
): TaskTemplate => {
    if (!name.trim()) throw new Error('template-name-required');
    if (tasks.length === 0) throw new Error('template-task-required');
    const ordered = [...tasks].sort((a, b) =>
        a.date.localeCompare(b.date)
        || (a.time || '99:99').localeCompare(b.time || '99:99')
        || a.id.localeCompare(b.id));
    const firstDate = ordered[0].date;
    return {
        id,
        name: name.trim(),
        kind: ordered.length === 1 ? 'task' : 'routine',
        createdAt,
        items: ordered.map(task => itemFromTask(task, firstDate)),
    };
};

export type TemplateTaskDraft = Omit<Task,
    'id' | 'createdAt' | 'completed' | 'completedAt' | 'rolledOverFrom' | 'recurrenceSourceId' | 'recurrenceAnchorDay'>;

/** Every invocation returns fresh checklist objects and IDs. */
export const instantiateTaskTemplate = (
    template: TaskTemplate,
    baseDate: string,
    checklistId: () => string,
): TemplateTaskDraft[] => template.items.map(item => ({
    title: item.title,
    description: item.notes ?? '',
    notes: item.notes ?? '',
    time: item.time,
    duration: item.duration,
    timeBlock: item.timeBlock,
    priority: item.priority,
    date: addTemplateDays(baseDate, item.dayOffset),
    checklistItems: item.checklistItems?.map(entry => ({
        id: checklistId(),
        text: entry.text,
        completed: false,
    })),
    recurrence: item.recurrence,
    reminderEnabled: Boolean(item.time) && item.reminderEnabled,
}));

export const mergeTemplates = (current: TaskTemplate[], incoming: TaskTemplate[]): TaskTemplate[] => {
    const seen = new Set(current.map(template => template.id));
    return [...current, ...incoming.filter(template => {
        if (seen.has(template.id)) return false;
        seen.add(template.id);
        return true;
    })];
};
