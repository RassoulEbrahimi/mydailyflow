import { useMemo } from 'react';

import type { Task } from '../types/task';
import type { TodayWorkSummary } from '../utils/taskUtils';
import {
    compareByTimeUntimedLast,
    hasTime,
    selectMorningTriageTasks,
    selectNowTask,
    summarizeTodayWork,
    taskCompletionDate,
} from '../utils/taskUtils';

export interface TodayPlanModel {
    todaySummary: TodayWorkSummary;
    pendingTaskCount: number;
    completedTodayTasks: Task[];
    nowTask: Task | null;
    morningTriageTasks: Task[];
    plannedOpenTasks: Task[];
    morningTasks: Task[];
    afternoonTasks: Task[];
    eveningTasks: Task[];
    untimedTasks: Task[];
}

const sortSectionTasks = (tasks: Task[]): Task[] =>
    [...tasks].sort(compareByTimeUntimedLast);

/**
 * Builds the complete read model for Today without mutating or rescheduling a
 * task. Keeping this boundary pure makes the product rules independently
 * testable while App remains the owner of every write handler.
 */
export const buildTodayPlanModel = (
    filteredTasks: Task[],
    today: string,
    currentTime: string,
): TodayPlanModel => {
    const todayTasks = filteredTasks.filter(task => task.date === today);
    const plannedOpenTasks = todayTasks.filter(task => !task.rolledOverFrom && !task.completed);
    const timedTasks = plannedOpenTasks.filter(hasTime);

    return {
        todaySummary: summarizeTodayWork(todayTasks),
        pendingTaskCount: todayTasks.filter(task => !task.completed).length,
        completedTodayTasks: filteredTasks
            .filter(task => task.completed && taskCompletionDate(task, today) === today)
            .sort(compareByTimeUntimedLast),
        nowTask: selectNowTask(todayTasks, currentTime),
        morningTriageTasks: sortSectionTasks(selectMorningTriageTasks(filteredTasks, today)),
        plannedOpenTasks,
        morningTasks: sortSectionTasks(timedTasks.filter(task => task.timeBlock === 'morning')),
        afternoonTasks: sortSectionTasks(timedTasks.filter(task => task.timeBlock === 'afternoon')),
        eveningTasks: sortSectionTasks(timedTasks.filter(task => task.timeBlock === 'evening')),
        untimedTasks: sortSectionTasks(plannedOpenTasks.filter(task => !hasTime(task))),
    };
};

export const useTodayPlanModel = (
    filteredTasks: Task[],
    today: string,
    currentTime: string,
): TodayPlanModel => useMemo(
    () => buildTodayPlanModel(filteredTasks, today, currentTime),
    [filteredTasks, today, currentTime],
);
