// ─── Pure task utility helpers ────────────────────────────────────────────────
import type { Task } from '../types/task';
import type { Recurrence } from '../types/task';

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

// Returns YYYY-MM-DD for tomorrow (local timezone).
export const getTomorrowString = (): string => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Formats a YYYY-MM-DD string into a human-readable label.
export const formatDateLabel = (dateStr: string): string => {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    if (dateStr === today) return 'Heute';
    if (dateStr === yesterday) return 'Gestern';
    const [y, mo, d] = dateStr.split('-').map(Number);
    // Use UTC noon to avoid timezone shifts when constructing the date
    const dt = new Date(Date.UTC(y, mo - 1, d, 12));
    return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(dt);
};

// Returns a concise label describing where a rolled-over task originated.
export const getRolloverLabel = (rolledOverFrom: string): string => {
    if (rolledOverFrom === getYesterdayString()) return 'Von gestern';
    return `Von ${formatDateLabel(rolledOverFrom)}`;
};

// Moves incomplete tasks from earlier dates to the supplied local date.
// The original scheduled date is retained across repeated rollovers.
export const rolloverTasksForDate = (tasks: Task[], today: string): Task[] =>
    tasks.map(task => {
        if (!task.completed && task.date < today) {
            return {
                ...task,
                date: today,
                rolledOverFrom: task.rolledOverFrom ?? task.date,
            };
        }
        return task;
    });

// Returns the default start time for a given time block.
export const defaultTimeForBlock = (block: Task['timeBlock']): string => {
    if (block === 'morning') return '09:00';
    if (block === 'afternoon') return '14:00';
    return '18:00';
};

// Derives the time block from a 24-hour time string "HH:MM".
// morning: 06:00–11:59, afternoon: 12:00–17:59, evening: 18:00–23:59 (+ 00:00–05:59 → evening).
export const deriveTimeBlock = (time: string): Task['timeBlock'] => {
    const [h] = time.split(':').map(Number);
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 18) return 'afternoon';
    return 'evening';
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
            tasks: [...group].sort(compareByTimeUntimedLast),
        }));
};

/**
 * Builds the Completed view from the task's scheduled date. Completion time is
 * deliberately not inferred: the current persisted Task shape has no
 * `completedAt`, so the UI must be explicit about what this grouping means.
 */
export const groupCompletedTasksByDate = (
    tasks: Task[],
    fallbackDate: string,
): Array<{ date: string; tasks: Task[] }> =>
    groupTasksByDate(tasks.filter(task => task.completed), fallbackDate);

export type TaskDatePeriod = 'today' | 'upcoming' | 'past';

export interface TaskDatePeriodGroup {
    period: TaskDatePeriod;
    groups: Array<{ date: string; tasks: Task[] }>;
    taskCount: number;
}

/**
 * Builds the date sections used by "Alle Aufgaben" around an explicit local
 * today anchor: today first, future dates nearest-first, then past dates
 * newest-first. The input is never mutated.
 */
export const groupTasksByDatePeriod = (
    tasks: Task[],
    fallbackDate: string,
    today: string,
): TaskDatePeriodGroup[] => {
    const groups = groupTasksByDate(tasks, fallbackDate);
    const sections: TaskDatePeriodGroup[] = [
        {
            period: 'today',
            groups: groups.filter(group => group.date === today),
            taskCount: 0,
        },
        {
            period: 'upcoming',
            groups: groups
                .filter(group => group.date > today)
                .sort((a, b) => a.date.localeCompare(b.date)),
            taskCount: 0,
        },
        {
            period: 'past',
            groups: groups
                .filter(group => group.date < today)
                .sort((a, b) => b.date.localeCompare(a.date)),
            taskCount: 0,
        },
    ];

    return sections
        .map(section => ({
            ...section,
            taskCount: section.groups.reduce((sum, group) => sum + group.tasks.length, 0),
        }))
        .filter(section => section.taskCount > 0);
};

// ─── "No time" as a first-class state ─────────────────────────────────────────
//
// `Task.time` is a "HH:MM" string, but the empty string is a legitimate value:
// a native <input type="time"> can be cleared, and the stored shape allows it.
// An untimed task is not "a task at 00:00" and is not "a task at 23:59" — it
// simply has no scheduled moment, and every comparison has to say so explicitly
// rather than let `''` sort or compare as if it were a real time.

/** True when the task carries a usable "HH:MM" time. */
export const hasTime = (task: Pick<Task, 'time'>): boolean =>
    typeof task.time === 'string' && task.time.trim().length > 0;

/**
 * Orders tasks within one date group: timed tasks first, ascending by time,
 * then every untimed task.
 *
 * Untimed tasks keep their incoming relative order — `Array.prototype.sort` is
 * stable, so equal comparisons preserve input order. The result is therefore
 * deterministic for a given input, without inventing a synthetic time that
 * would then leak into overdue checks or display.
 */
export const compareByTimeUntimedLast = (a: Task, b: Task): number => {
    const aHas = hasTime(a);
    const bHas = hasTime(b);
    if (aHas !== bHas) return aHas ? -1 : 1;
    if (!aHas) return 0;
    return a.time.localeCompare(b.time);
};

/** Formats a local wall-clock time as HH:MM. */
export const getCurrentTimeString = (date: Date = new Date()): string =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * Selects the task shown in Today's "Jetzt" focus card.
 *
 * The next incomplete timed task at or after the current time wins. Once every
 * timed task is in the past, the earliest still-open timed task is surfaced so
 * Today never hides unfinished work behind an empty focus state. Untimed tasks
 * remain valid Today items, but cannot be "next" because they have no moment to
 * compare with the wall clock.
 */
export const selectNowTask = (tasks: Task[], currentTime: string): Task | null => {
    const openTimed = tasks
        .filter(task => !task.completed && hasTime(task))
        .sort(compareByTimeUntimedLast);

    return openTimed.find(task => task.time >= currentTime) ?? openTimed[0] ?? null;
};

export interface TodayWorkSummary {
    /** Tasks intentionally scheduled for today, excluding automatic carry-over. */
    plannedTasks: Task[];
    /** Still-open tasks automatically brought forward from an earlier date. */
    carriedTasks: Task[];
    completedPlanned: number;
    totalPlanned: number;
    openPlanned: number;
    percentage: number;
}

/**
 * Separates today's plan from unfinished work automatically carried into it.
 *
 * `rolledOverFrom` is existing persisted provenance, not a second schedule.
 * Completed carry-over leaves the open carry group, but never inflates today's
 * planned denominator or numerator. This keeps the progress ring truthful:
 * it reports the plan the user made for today and names carry-over separately.
 */
export const summarizeTodayWork = (todayTasks: Task[]): TodayWorkSummary => {
    const plannedTasks = todayTasks.filter(task => !task.rolledOverFrom);
    const carriedTasks = todayTasks.filter(task => !!task.rolledOverFrom && !task.completed);
    const completedPlanned = plannedTasks.filter(task => task.completed).length;
    const totalPlanned = plannedTasks.length;

    return {
        plannedTasks,
        carriedTasks,
        completedPlanned,
        totalPlanned,
        openPlanned: totalPlanned - completedPlanned,
        percentage: totalPlanned > 0
            ? Math.round((completedPlanned / totalPlanned) * 100)
            : 0,
    };
};

// ─── Recurrence helper ────────────────────────────────────────────────────────

// Formats a local Date as YYYY-MM-DD.
const formatLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Returns the day-of-month portion of a YYYY-MM-DD string.
export const dayOfMonth = (dateStr: string): number => Number(dateStr.slice(8, 10));

// Whole days since the epoch for a YYYY-MM-DD string. UTC keeps the arithmetic
// free of DST, and the value is only ever used as a difference.
const toEpochDays = (dateStr: string): number => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return Date.UTC(y, mo - 1, d) / 86_400_000;
};

// Adds a whole number of days to a YYYY-MM-DD string (local noon avoids DST).
const addDays = (baseDate: string, days: number): string => {
    const [y, mo, d] = baseDate.split('-').map(Number);
    const date = new Date(y, mo - 1, d, 12, 0, 0);
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
};

// Adds a whole number of months, resolving the target month first and then
// clamping the day, so the native Date overflow (Jan 31 + 1 month -> Mar 3) can
// never happen. anchorDay is the day the series is pinned to; because the anchor
// is carried rather than the clamped result, the series returns to day 31 in the
// next month that has one instead of drifting earlier every month.
const addMonthsClamped = (baseDate: string, months: number, anchorDay?: number): string => {
    const [y, mo, d] = baseDate.split('-').map(Number);
    const targetMonthIndex = mo - 1 + months;
    const ty = y + Math.floor(targetMonthIndex / 12);
    const tm = ((targetMonthIndex % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(ty, tm + 1, 0).getDate();
    const desiredDay = anchorDay ?? d;
    return formatLocalDate(
        new Date(ty, tm, Math.min(desiredDay, lastDayOfTargetMonth), 12, 0, 0),
    );
};

// Fixed day step for the day-based recurrence rules.
const STEP_DAYS: Record<'daily' | 'every2days' | 'weekly', number> = {
    daily: 1,
    every2days: 2,
    weekly: 7,
};

// Given a base date string (YYYY-MM-DD) and a recurrence rule, returns the
// next occurrence date as a YYYY-MM-DD string.
export const nextRecurrenceDate = (
    baseDate: string,
    recurrence: Recurrence,
    anchorDay?: number,
): string => {
    if (recurrence === 'none') return baseDate;
    if (recurrence === 'monthly') return addMonthsClamped(baseDate, 1, anchorDay);
    return addDays(baseDate, STEP_DAYS[recurrence]);
};

// Advances a recurring series from its anchor date to the first occurrence
// strictly after afterDate.
//
// The anchor is the task's originally scheduled date (rolledOverFrom when the
// task was auto-rolled), so cadence stays pinned to the schedule rather than to
// the day the task happened to be completed: a Monday weekly task completed late
// on a Wednesday still lands on the following Monday.
//
// The result is computed rather than iterated, so an arbitrarily stale anchor
// costs the same as a fresh one and the return value is guaranteed > afterDate.
export const nextRecurrenceDateAfter = (
    anchorDate: string,
    recurrence: Recurrence,
    afterDate: string,
    anchorDay?: number,
): string => {
    if (recurrence === 'none') return anchorDate;

    if (recurrence === 'monthly') {
        // Calendar months are irregular, so jump to the month implied by the gap
        // and then step forward. Clamping can only pull a day backwards within a
        // month, so this settles in at most a couple of iterations, and each one
        // strictly increases the date — the loop cannot fail to terminate.
        const [ay, am] = anchorDate.split('-').map(Number);
        const [fy, fm] = afterDate.split('-').map(Number);
        let months = Math.max(1, (fy - ay) * 12 + (fm - am));
        let next = addMonthsClamped(anchorDate, months, anchorDay);
        while (next <= afterDate) {
            months += 1;
            next = addMonthsClamped(anchorDate, months, anchorDay);
        }
        return next;
    }

    // Smallest k >= 1 with anchor + k*step > afterDate.
    const step = STEP_DAYS[recurrence];
    const dayGap = toEpochDays(afterDate) - toEpochDays(anchorDate);
    const steps = Math.max(1, Math.floor(dayGap / step) + 1);
    return addDays(anchorDate, steps * step);
};

// Resolves the monthly anchor day for a task, given its recurrence rule, its
// scheduled date, and any anchor it already carries:
//   - not monthly            -> undefined (any stale anchor is dropped)
//   - monthly, no anchor yet -> derived from the scheduled date
//   - monthly, has an anchor -> preserved, so unrelated edits do not move it
export const resolveRecurrenceAnchorDay = (
    recurrence: Recurrence | undefined,
    scheduledDate: string,
    existingAnchorDay?: number,
): number | undefined => {
    if (recurrence !== 'monthly') return undefined;
    return existingAnchorDay ?? dayOfMonth(scheduledDate);
};

// Applies the anchor lifecycle to a task, deleting the key outright when the
// task is no longer monthly so no stale anchor is persisted to localStorage.
export const withRecurrenceAnchor = (task: Task): Task => {
    const anchorDay = resolveRecurrenceAnchorDay(
        task.recurrence,
        task.date,
        task.recurrenceAnchorDay,
    );

    if (anchorDay === undefined) {
        if (task.recurrenceAnchorDay === undefined) return task;
        const { recurrenceAnchorDay: _dropped, ...rest } = task;
        return rest;
    }

    return { ...task, recurrenceAnchorDay: anchorDay };
};

// Builds the follow-up occurrence for a task that was just completed.
// Returns null when the task does not recur, or when an occurrence has already
// been spawned from it (guards against double-toggling a completed task).
export const buildNextOccurrence = (
    target: Task,
    tasks: Task[],
    newId: () => string,
    timestamp: () => string,
): Task | null => {
    const { recurrence } = target;
    if (!recurrence || recurrence === 'none') return null;
    if (tasks.some(t => t.recurrenceSourceId === target.id)) return null;

    // A rolled-over task keeps its original scheduled date as the cadence anchor.
    // This is read-only input: rolledOverFrom is deliberately NOT copied onto the
    // new occurrence below, which is freshly scheduled and has not been rolled.
    const anchorDate = target.rolledOverFrom ?? target.date;
    const anchorDay =
        recurrence === 'monthly'
            ? target.recurrenceAnchorDay ?? dayOfMonth(anchorDate)
            : undefined;

    return {
        id: newId(),
        createdAt: timestamp(),
        completed: false,
        date: nextRecurrenceDateAfter(anchorDate, recurrence, target.date, anchorDay),
        title: target.title,
        description: target.description,
        notes: target.notes,
        time: target.time,
        duration: target.duration,
        timeBlock: target.timeBlock,
        priority: target.priority,
        recurrence,
        recurrenceSourceId: target.id,
        recurrenceAnchorDay: anchorDay,
        checklistItems: target.checklistItems
            ? target.checklistItems.map(ci => ({ ...ci, completed: false }))
            : undefined,
    };
};

// Returns true if a task is scheduled for today, incomplete, and its scheduled time has passed.
export const isTaskOverdue = (task: Task): boolean => {
    if (task.completed) return false;
    // A task with no time has no moment to be late for. Without this guard the
    // comparison below reads `'' < '14:30'` as true and marks every untimed
    // task overdue.
    if (!hasTime(task)) return false;
    const today = getTodayString();
    if (task.date !== today) return false;

    // Compare task time "HH:MM" with current local time (24-hour HH:MM format)
    const d = new Date();
    const currH = String(d.getHours()).padStart(2, '0');
    const currM = String(d.getMinutes()).padStart(2, '0');
    const currTime = `${currH}:${currM}`;
    
    return task.time < currTime;
};

// Returns a smart default start time based on the current local time.
// - Rounds up to the next hour (e.g. 10:01 -> 11:00)
// - Before 06:00 -> 06:00
// - 23:01 to 23:59 -> 06:00
// - 23:00 exactly -> 23:00
export const getSmartDefaultTime = (): string => {
    const d = new Date();
    let h = d.getHours();
    const m = d.getMinutes();

    if (m > 0) {
        h += 1;
    }

    if (h >= 24 || h < 6) {
        h = 6;
    }

    return `${String(h).padStart(2, '0')}:00`;
};
