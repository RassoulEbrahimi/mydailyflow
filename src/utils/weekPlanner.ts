import type { Task } from '../types/task';
import { addCalendarDays, startOfLocalWeek, weekDates } from './weeklyReview';
import { compareByTimeUntimedLast, defaultTimeForBlock, deriveTimeBlock, hasTime } from './taskUtils';

export type PlannerLane = Task['timeBlock'] | 'untimed';

export interface PlannerDestination {
    date: string;
    lane: PlannerLane;
    /** Optional explicit wall-clock value. Ignored by the untimed lane. */
    time?: string;
}

export interface PlannerDay {
    date: string;
    tasks: Task[];
    lanes: Record<PlannerLane, Task[]>;
}

export const PLANNER_LANES: PlannerLane[] = ['morning', 'afternoon', 'evening', 'untimed'];

export const PLANNER_LANE_LABELS: Record<PlannerLane, string> = {
    morning: 'Morgen',
    afternoon: 'Nachmittag',
    evening: 'Abend',
    untimed: 'Ohne Zeit',
};

export const plannerLaneForTask = (task: Task): PlannerLane =>
    hasTime(task) ? deriveTimeBlock(task.time) : 'untimed';

export const hasLockedRecurrenceDate = (task: Task): boolean =>
    Boolean(task.recurrence && task.recurrence !== 'none');

export const canMoveTaskToPlannerDestination = (
    task: Task,
    destination: PlannerDestination,
): boolean => !task.completed && (!hasLockedRecurrenceDate(task) || destination.date === task.date);

/**
 * Builds seven calendar days starting on Monday. Completed tasks stay in the
 * factual review/history views; the planner only contains work that can still
 * be scheduled.
 */
export const buildWeekPlan = (tasks: Task[], referenceDate: string): PlannerDay[] => {
    const dates = weekDates(startOfLocalWeek(referenceDate));
    return dates.map(date => {
        const dayTasks = tasks
            .filter(task => !task.completed && task.date === date)
            .sort(compareByTimeUntimedLast);
        const lanes: Record<PlannerLane, Task[]> = {
            morning: [],
            afternoon: [],
            evening: [],
            untimed: [],
        };
        for (const task of dayTasks) lanes[plannerLaneForTask(task)].push(task);
        return { date, tasks: dayTasks, lanes };
    });
};

/**
 * Moves one occurrence without touching recurrence cadence metadata, history,
 * completion state, checklist data or rollover provenance.
 *
 * - moving only to another day preserves its exact time;
 * - entering a different timed lane uses that lane's deterministic default,
 *   unless the caller supplied an explicit time;
 * - entering the untimed lane clears the time and never invents a replacement;
 * - an already-untimed task remains untimed when moved between days.
 */
export const moveTaskToPlannerDestination = (
    task: Task,
    destination: PlannerDestination,
): Task => {
    if (!canMoveTaskToPlannerDestination(task, destination)) return task;

    if (destination.lane === 'untimed') {
        return {
            ...task,
            date: destination.date,
            time: '',
        };
    }

    const currentLane = plannerLaneForTask(task);
    const explicitTime = destination.time?.trim();
    const nextTime = explicitTime
        ? explicitTime
        : currentLane === destination.lane && hasTime(task)
            ? task.time
            : defaultTimeForBlock(destination.lane);

    return {
        ...task,
        date: destination.date,
        timeBlock: deriveTimeBlock(nextTime),
        time: nextTime,
    };
};

export const previousPlannerWeek = (referenceDate: string): string =>
    addCalendarDays(startOfLocalWeek(referenceDate), -7);

export const nextPlannerWeek = (referenceDate: string): string =>
    addCalendarDays(startOfLocalWeek(referenceDate), 7);
