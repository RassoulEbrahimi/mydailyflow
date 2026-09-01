import type { Task } from '../types/task';
import { hasTime } from './taskUtils';

/**
 * A transparent, non-blocking reference for one intentionally planned day.
 * It is deliberately not persisted as a user preference in this schema-safe
 * package; a personalised capacity setting can replace it later.
 */
export const DAILY_ORIENTATION_MINUTES = 8 * 60;

export interface CommitmentConflict {
    first: Task;
    second: Task;
}

export interface PlanningCapacitySummary {
    fixedCommitments: Task[];
    flexibleTasks: Task[];
    fixedMinutes: number;
    flexibleMinutes: number;
    totalMinutes: number;
    capacityMinutes: number;
    remainingMinutes: number;
    overByMinutes: number;
    utilizationPercent: number;
    conflicts: CommitmentConflict[];
}

/** Parses the duration values offered by capture plus compatible mixed forms. */
export const durationToMinutes = (duration: string): number => {
    const normalized = duration.trim().toLowerCase();
    if (!normalized) return 0;

    const hours = /(?:^|\s)(\d+(?:[.,]\d+)?)\s*h(?:\s|$)/.exec(normalized);
    const minutes = /(?:^|\s)(\d+)\s*m(?:\s|$)/.exec(normalized);
    const total = (hours ? Number(hours[1].replace(',', '.')) * 60 : 0)
        + (minutes ? Number(minutes[1]) : 0);

    return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
};

export const formatPlanningMinutes = (minutes: number): string => {
    const safe = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    const remainder = safe % 60;
    if (hours === 0) return `${remainder} Min.`;
    if (remainder === 0) return `${hours} Std.`;
    return `${hours} Std. ${remainder} Min.`;
};

const clockMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

/**
 * Computes an honest read-only projection of one day's open plan.
 *
 * Exact-time work is a fixed commitment; untimed work is flexible. This uses
 * existing fields only and never mutates or reclassifies persisted tasks.
 */
export const buildPlanningCapacity = (
    tasks: Task[],
    capacityMinutes = DAILY_ORIENTATION_MINUTES,
): PlanningCapacitySummary => {
    const openTasks = tasks.filter(task => !task.completed);
    const fixedCommitments = openTasks
        .filter(hasTime)
        .sort((a, b) => a.time.localeCompare(b.time));
    const flexibleTasks = openTasks.filter(task => !hasTime(task));
    const fixedMinutes = fixedCommitments.reduce((sum, task) => sum + durationToMinutes(task.duration), 0);
    const flexibleMinutes = flexibleTasks.reduce((sum, task) => sum + durationToMinutes(task.duration), 0);
    const totalMinutes = fixedMinutes + flexibleMinutes;
    const safeCapacity = Math.max(1, capacityMinutes);
    const conflicts: CommitmentConflict[] = [];

    for (let firstIndex = 0; firstIndex < fixedCommitments.length; firstIndex += 1) {
        const first = fixedCommitments[firstIndex];
        const firstEnd = clockMinutes(first.time) + durationToMinutes(first.duration);
        for (let secondIndex = firstIndex + 1; secondIndex < fixedCommitments.length; secondIndex += 1) {
            const second = fixedCommitments[secondIndex];
            if (clockMinutes(second.time) >= firstEnd) break;
            conflicts.push({ first, second });
        }
    }

    return {
        fixedCommitments,
        flexibleTasks,
        fixedMinutes,
        flexibleMinutes,
        totalMinutes,
        capacityMinutes: safeCapacity,
        remainingMinutes: Math.max(0, safeCapacity - totalMinutes),
        overByMinutes: Math.max(0, totalMinutes - safeCapacity),
        utilizationPercent: Math.round((totalMinutes / safeCapacity) * 100),
        conflicts,
    };
};
