import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { Task } from '../src/types/task';
import {
    compareByTimeUntimedLast,
    getTodayString,
    groupCompletedTasksByDate,
    groupTasksByDate,
    groupTasksByDatePeriod,
    hasTime,
    isTaskOverdue,
} from '../src/utils/taskUtils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const today = getTodayString();

const task = (over: Partial<Task> & { id: string }): Task => ({
    title: `Task ${over.id}`,
    time: '09:00',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    priority: 'medium',
    createdAt: '2026-01-01T00:00:00.000Z',
    date: today,
    ...over,
});

/** A time guaranteed to be in the past relative to now, on today's date. */
const PAST_TIME = '00:00';
/** A time guaranteed to be in the future relative to now, on today's date. */
const FUTURE_TIME = '23:59';

// ─── hasTime ──────────────────────────────────────────────────────────────────

describe('hasTime', () => {
    it('is false for an empty or whitespace-only time', () => {
        assert.equal(hasTime({ time: '' }), false);
        assert.equal(hasTime({ time: '   ' }), false);
    });

    it('is true for a real time', () => {
        assert.equal(hasTime({ time: '09:00' }), true);
        assert.equal(hasTime({ time: '00:00' }), true);
    });

    it('is false when the field is absent entirely', () => {
        assert.equal(hasTime({ time: undefined as unknown as string }), false);
    });
});

// ─── Overdue ──────────────────────────────────────────────────────────────────

describe('isTaskOverdue — untimed tasks', () => {
    it('an untimed task dated today is NOT overdue', () => {
        // Regression: `'' < '14:30'` is true, which marked every untimed task
        // overdue regardless of the clock.
        assert.equal(isTaskOverdue(task({ id: 'untimed', time: '' })), false);
    });

    it('an untimed task is not overdue on a past date either', () => {
        assert.equal(
            isTaskOverdue(task({ id: 'untimed-past', time: '', date: '2020-01-01' })),
            false,
        );
    });

    it('a whitespace-only time is treated as untimed, not as a time', () => {
        assert.equal(isTaskOverdue(task({ id: 'blank', time: '   ' })), false);
    });

    it('missing time is not reinterpreted as end-of-day', () => {
        // If '' were coerced to '23:59', this task would be "not overdue" for the
        // wrong reason. Assert the untimed task and a real 23:59 task are not
        // treated as the same thing: the untimed one is never overdue, at any hour.
        const untimed = task({ id: 'u', time: '' });
        assert.equal(isTaskOverdue(untimed), false);
        assert.equal(hasTime(untimed), false);
        assert.equal(hasTime(task({ id: 't', time: '23:59' })), true);
    });
});

describe('isTaskOverdue — timed tasks still behave correctly', () => {
    it('a past time today IS overdue', () => {
        assert.equal(isTaskOverdue(task({ id: 'past', time: PAST_TIME })), true);
    });

    it('a future time today is NOT overdue', () => {
        assert.equal(isTaskOverdue(task({ id: 'future', time: FUTURE_TIME })), false);
    });

    it('a completed task is never overdue', () => {
        assert.equal(
            isTaskOverdue(task({ id: 'done', time: PAST_TIME, completed: true })),
            false,
        );
    });

    it('a task on another date is not overdue', () => {
        assert.equal(
            isTaskOverdue(task({ id: 'other', time: PAST_TIME, date: '2020-01-01' })),
            false,
        );
    });
});

// ─── Ordering ─────────────────────────────────────────────────────────────────

describe('compareByTimeUntimedLast', () => {
    it('sorts timed tasks ascending by time', () => {
        const sorted = [
            task({ id: 'c', time: '18:00' }),
            task({ id: 'a', time: '06:00' }),
            task({ id: 'b', time: '12:00' }),
        ].sort(compareByTimeUntimedLast);
        assert.deepEqual(sorted.map(t => t.id), ['a', 'b', 'c']);
    });

    it('places untimed tasks after every timed task', () => {
        const sorted = [
            task({ id: 'untimed', time: '' }),
            task({ id: 'late', time: '23:00' }),
            task({ id: 'early', time: '01:00' }),
        ].sort(compareByTimeUntimedLast);
        assert.deepEqual(sorted.map(t => t.id), ['early', 'late', 'untimed']);
    });

    it('keeps multiple untimed tasks in a deterministic, stable order', () => {
        const input = [
            task({ id: 'u1', time: '' }),
            task({ id: 'u2', time: '' }),
            task({ id: 'u3', time: '' }),
        ];
        const once = [...input].sort(compareByTimeUntimedLast).map(t => t.id);
        const twice = [...input].sort(compareByTimeUntimedLast).map(t => t.id);
        assert.deepEqual(once, ['u1', 'u2', 'u3']);
        assert.deepEqual(once, twice, 'sorting the same input twice gives the same order');

        // Sorting an already-sorted list must be a no-op, not a shuffle.
        const idempotent = [...input]
            .sort(compareByTimeUntimedLast)
            .sort(compareByTimeUntimedLast)
            .map(t => t.id);
        assert.deepEqual(idempotent, once);
    });

    it('interleaves correctly with a mix of timed and untimed tasks', () => {
        const sorted = [
            task({ id: 'u1', time: '' }),
            task({ id: 't2', time: '14:00' }),
            task({ id: 'u2', time: '' }),
            task({ id: 't1', time: '08:30' }),
        ].sort(compareByTimeUntimedLast);
        assert.deepEqual(sorted.map(t => t.id), ['t1', 't2', 'u1', 'u2']);
    });
});

describe('groupTasksByDate — untimed tasks sort last within a group', () => {
    it('orders a single date group timed-first, untimed-last', () => {
        const groups = groupTasksByDate(
            [
                task({ id: 'u', time: '', date: '2026-05-20' }),
                task({ id: 'b', time: '17:00', date: '2026-05-20' }),
                task({ id: 'a', time: '07:00', date: '2026-05-20' }),
            ],
            '2026-05-20',
        );
        assert.equal(groups.length, 1);
        assert.deepEqual(groups[0].tasks.map(t => t.id), ['a', 'b', 'u']);
    });

    it('applies the rule independently per date group', () => {
        const groups = groupTasksByDate(
            [
                task({ id: 'd1-untimed', time: '', date: '2026-05-20' }),
                task({ id: 'd1-timed', time: '09:00', date: '2026-05-20' }),
                task({ id: 'd2-untimed', time: '', date: '2026-05-19' }),
                task({ id: 'd2-timed', time: '10:00', date: '2026-05-19' }),
            ],
            '2026-05-20',
        );
        // Groups are newest-first.
        assert.deepEqual(groups.map(g => g.date), ['2026-05-20', '2026-05-19']);
        assert.deepEqual(groups[0].tasks.map(t => t.id), ['d1-timed', 'd1-untimed']);
        assert.deepEqual(groups[1].tasks.map(t => t.id), ['d2-timed', 'd2-untimed']);
    });

    it('does not mutate the caller\'s array', () => {
        const input = [
            task({ id: 'u', time: '', date: '2026-05-20' }),
            task({ id: 'a', time: '07:00', date: '2026-05-20' }),
        ];
        const order = input.map(t => t.id);
        groupTasksByDate(input, '2026-05-20');
        assert.deepEqual(input.map(t => t.id), order);
    });
});

describe('groupCompletedTasksByDate — Completed history uses scheduled dates', () => {
    it('keeps only completed tasks, groups dates newest-first, and times ascending', () => {
        const groups = groupCompletedTasksByDate(
            [
                task({ id: 'older-late', completed: true, date: '2026-05-18', time: '18:00' }),
                task({ id: 'today-late', completed: true, date: '2026-05-20', time: '20:00' }),
                task({ id: 'ignored-open', completed: false, date: '2026-05-20', time: '07:00' }),
                task({ id: 'today-early', completed: true, date: '2026-05-20', time: '08:00' }),
                task({ id: 'older-early', completed: true, date: '2026-05-18', time: '09:00' }),
            ],
            '2026-05-20',
        );

        assert.deepEqual(groups.map(group => group.date), ['2026-05-20', '2026-05-18']);
        assert.deepEqual(groups[0].tasks.map(item => item.id), ['today-early', 'today-late']);
        assert.deepEqual(groups[1].tasks.map(item => item.id), ['older-early', 'older-late']);
    });

    it('does not mutate the task list or add a completion timestamp', () => {
        const input = [task({ id: 'done', completed: true, date: '2026-05-19' })];
        const snapshot = structuredClone(input);

        groupCompletedTasksByDate(input, '2026-05-20');

        assert.deepEqual(input, snapshot);
        assert.equal('completedAt' in input[0], false);
    });
});

describe('groupTasksByDatePeriod — All Tasks is anchored on today', () => {
    const anchor = '2026-05-20';

    it('orders today first, future ascending, then past descending', () => {
        const periods = groupTasksByDatePeriod(
            [
                task({ id: 'past-far', date: '2026-05-10' }),
                task({ id: 'future-far', date: '2026-06-01' }),
                task({ id: 'today', date: anchor }),
                task({ id: 'future-near', date: '2026-05-21' }),
                task({ id: 'past-near', date: '2026-05-19' }),
            ],
            anchor,
            anchor,
        );

        assert.deepEqual(periods.map(period => period.period), ['today', 'upcoming', 'past']);
        assert.deepEqual(periods[0].groups.map(group => group.date), [anchor]);
        assert.deepEqual(periods[1].groups.map(group => group.date), ['2026-05-21', '2026-06-01']);
        assert.deepEqual(periods[2].groups.map(group => group.date), ['2026-05-19', '2026-05-10']);
    });

    it('reports period counts and omits empty periods', () => {
        const periods = groupTasksByDatePeriod(
            [
                task({ id: 'future-a', date: '2026-05-21' }),
                task({ id: 'future-b', date: '2026-05-21' }),
                task({ id: 'future-c', date: '2026-05-22' }),
            ],
            anchor,
            anchor,
        );

        assert.deepEqual(periods.map(period => period.period), ['upcoming']);
        assert.equal(periods[0].taskCount, 3);
        assert.deepEqual(periods[0].groups.map(group => group.tasks.length), [2, 1]);
    });

    it('does not mutate the caller or its tasks', () => {
        const input = [
            task({ id: 'future', date: '2026-05-21', time: '14:00' }),
            task({ id: 'today', date: anchor, time: '08:00' }),
        ];
        const snapshot = structuredClone(input);
        groupTasksByDatePeriod(input, anchor, anchor);
        assert.deepEqual(input, snapshot);
    });
});
