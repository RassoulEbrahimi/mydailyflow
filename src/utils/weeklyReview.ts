import type { DailyEssential, EssentialHistoryDay } from '../types/essential';
import type { Task } from '../types/task';

const DAY_MS = 86_400_000;

export interface LiveEssentialDay {
    date: string;
    essentials: DailyEssential[];
    progressById: Record<string, number>;
}

export interface WeeklyEssentialDay {
    date: string;
    source: EssentialHistoryDay['source'] | 'live' | null;
    completed: number;
    total: number;
}

export interface WeeklyTaskDay {
    date: string;
    planned: number;
    completed: number;
    carried: number;
}

export interface CompletionMoment {
    taskId: string;
    title: string;
    completedAt: string;
    date: string;
    time: string;
}

export interface WeeklyReviewSummary {
    startDate: string;
    endDate: string;
    days: WeeklyTaskDay[];
    plannedTotal: number;
    completedTotal: number;
    carriedTotal: number;
    completionMoments: CompletionMoment[];
    unfinishedTasks: Task[];
    essentialDays: WeeklyEssentialDay[];
    trackedEssentialDays: number;
    historicalEssentialDays: number;
    migratedEssentialDays: number;
    legacyCompletionCount: number;
}

const parseDate = (date: string): Date => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
};

const dateString = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const addCalendarDays = (date: string, days: number): string =>
    dateString(new Date(parseDate(date).getTime() + days * DAY_MS));

/** Monday-based week anchor, calculated in calendar space (never elapsed local hours). */
export const startOfLocalWeek = (date: string): string => {
    const parsed = parseDate(date);
    const mondayOffset = (parsed.getUTCDay() + 6) % 7;
    return addCalendarDays(date, -mondayOffset);
};

export const weekDates = (startDate: string): string[] =>
    Array.from({ length: 7 }, (_, index) => addCalendarDays(startDate, index));

/** Converts a UTC instant to a calendar date in an explicit IANA timezone. */
export const dateInTimeZone = (instant: string, timeZone: string): string => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(instant));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(part => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
};

export const timeInTimeZone = (instant: string, timeZone: string): string =>
    new Intl.DateTimeFormat('de-DE', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(instant));

const essentialMetric = (day: EssentialHistoryDay): WeeklyEssentialDay => {
    const assessable = day.entries.filter(entry => entry.targetCount !== null);
    return {
        date: day.date,
        source: day.source,
        completed: assessable.filter(entry => entry.completedCount >= entry.targetCount!).length,
        total: assessable.length,
    };
};

const liveEssentialMetric = (day: LiveEssentialDay): WeeklyEssentialDay => ({
    date: day.date,
    source: 'live',
    completed: day.essentials.filter(
        essential => (day.progressById[essential.id] ?? 0) >= essential.targetCount,
    ).length,
    total: day.essentials.length,
});

/**
 * Builds a factual, read-only weekly projection. Missing history stays missing:
 * it is never converted into zero completions, and legacy completions never get
 * an invented completion date or time.
 */
export function buildWeeklyReview(
    tasks: Task[],
    history: EssentialHistoryDay[],
    referenceDate: string,
    today: string,
    timeZone: string,
    liveEssentials?: LiveEssentialDay,
): WeeklyReviewSummary {
    const startDate = startOfLocalWeek(referenceDate);
    const dates = weekDates(startDate);
    const endDate = dates[6];
    const dateSet = new Set(dates);

    const completionMoments = tasks
        .filter(task => task.completedAt && dateSet.has(dateInTimeZone(task.completedAt, timeZone)))
        .map(task => ({
            taskId: task.id,
            title: task.title,
            completedAt: task.completedAt!,
            date: dateInTimeZone(task.completedAt!, timeZone),
            time: timeInTimeZone(task.completedAt!, timeZone),
        }))
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt));

    const days = dates.map(date => ({
        date,
        planned: tasks.filter(task => task.date === date && !task.rolledOverFrom).length,
        completed: completionMoments.filter(moment => moment.date === date).length,
        carried: tasks.filter(task => task.date === date && Boolean(task.rolledOverFrom)).length,
    }));

    const decisionBoundary = today < endDate ? today : endDate;
    const unfinishedTasks = tasks
        .filter(task => {
            if (task.completed) return false;
            const dueInWeek = task.date >= startDate && task.date <= decisionBoundary;
            const originatedInWeek = Boolean(
                task.rolledOverFrom
                && task.rolledOverFrom >= startDate
                && task.rolledOverFrom <= endDate,
            );
            return dueInWeek || originatedInWeek;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '23:59').localeCompare(b.time || '23:59'));

    const historyInWeek = history.filter(day => dateSet.has(day.date));
    const essentialsByDate = new Map(historyInWeek.map(day => [day.date, essentialMetric(day)]));
    if (liveEssentials && dateSet.has(liveEssentials.date)) {
        // Today's live state is newer than a migration snapshot for the same day.
        essentialsByDate.set(liveEssentials.date, liveEssentialMetric(liveEssentials));
    }
    const essentialDays = dates.map(date => essentialsByDate.get(date) ?? {
        date,
        source: null,
        completed: 0,
        total: 0,
    });

    return {
        startDate,
        endDate,
        days,
        plannedTotal: days.reduce((sum, day) => sum + day.planned, 0),
        completedTotal: days.reduce((sum, day) => sum + day.completed, 0),
        carriedTotal: days.reduce((sum, day) => sum + day.carried, 0),
        completionMoments,
        unfinishedTasks,
        essentialDays,
        trackedEssentialDays: essentialDays.filter(day => day.source !== null).length,
        historicalEssentialDays: historyInWeek.length,
        migratedEssentialDays: historyInWeek.filter(day => day.source === 'legacy-snapshot').length,
        legacyCompletionCount: tasks.filter(
            task => task.completed && task.completedAt === null && dateSet.has(task.date),
        ).length,
    };
}
