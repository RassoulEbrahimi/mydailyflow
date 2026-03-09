// ─── Pure task utility helpers ────────────────────────────────────────────────
import type { Task } from '../types/task';

// Returns the current local date as YYYY-MM-DD.
export const getTodayString = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Returns YYYY-MM-DD for yesterday (local timezone).
export const getYesterdayString = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Formats a YYYY-MM-DD string into a human-readable label.
export const formatDateLabel = (dateStr: string): string => {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    if (dateStr === today) return 'Today';
    if (dateStr === yesterday) return 'Yesterday';
    const [y, mo, d] = dateStr.split('-').map(Number);
    // Use UTC noon to avoid timezone shifts when constructing the date
    const dt = new Date(Date.UTC(y, mo - 1, d, 12));
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dt);
};

// Returns a concise label describing where a rolled-over task originated.
export const getRolloverLabel = (rolledOverFrom: string): string => {
    if (rolledOverFrom === getYesterdayString()) return 'From yesterday';
    return `From ${formatDateLabel(rolledOverFrom)}`;
};

// Returns the default start time for a given time block.
export const defaultTimeForBlock = (block: Task['timeBlock']): string => {
    if (block === 'morning') return '09:00';
    if (block === 'afternoon') return '14:00';
    return '18:00';
};

// Filters tasks by a search query (title or description, case-insensitive).
export const filterTasksBySearch = (tasks: Task[], query: string): Task[] => {
    if (!query.trim()) return tasks;
    const q = query.toLowerCase();
    return tasks.filter(
        t => t.title.toLowerCase().includes(q) || (t.description?.toLowerCase().includes(q) ?? false)
    );
};

// Groups tasks by date (newest first), sorting tasks within each group by time ascending.
export const groupTasksByDate = (
    tasks: Task[],
    fallbackDate: string
): Array<{ date: string; tasks: Task[] }> => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
        const key = t.date ?? fallbackDate;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
    }
    return Array.from(map.entries())
        .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
        .map(([date, group]) => ({
            date,
            tasks: [...group].sort((a, b) => a.time.localeCompare(b.time)),
        }));
};
