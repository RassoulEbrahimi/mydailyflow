import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { Task } from '../src/types/task';
import {
    buildWeekPlan,
    canMoveTaskToPlannerDestination,
    moveTaskToPlannerDestination,
    nextPlannerWeek,
    plannerLaneForTask,
    previousPlannerWeek,
} from '../src/utils/weekPlanner';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
    id,
    title: id,
    time: '09:15',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    completedAt: null,
    priority: 'medium',
    createdAt: '2026-08-01T06:00:00.000Z',
    date: '2026-08-17',
    ...overrides,
});

describe('week planner calendar', () => {
    it('groups open work into Monday-Sunday lanes and excludes completed work', () => {
        const days = buildWeekPlan([
            task('morning'),
            task('afternoon', { time: '14:00', timeBlock: 'afternoon' }),
            task('untimed', { time: '', timeBlock: 'evening' }),
            task('tomorrow', { date: '2026-08-18', time: '19:00', timeBlock: 'evening' }),
            task('done', { completed: true, completedAt: '2026-08-17T10:00:00.000Z' }),
            task('outside', { date: '2026-08-24' }),
        ], '2026-08-20');

        assert.equal(days.length, 7);
        assert.equal(days[0].date, '2026-08-17');
        assert.deepEqual(days[0].lanes.morning.map(item => item.id), ['morning']);
        assert.deepEqual(days[0].lanes.afternoon.map(item => item.id), ['afternoon']);
        assert.deepEqual(days[0].lanes.untimed.map(item => item.id), ['untimed']);
        assert.deepEqual(days[1].lanes.evening.map(item => item.id), ['tomorrow']);
        assert.equal(days.flatMap(day => day.tasks).some(item => item.id === 'done'), false);
        assert.equal(days.flatMap(day => day.tasks).some(item => item.id === 'outside'), false);
    });

    it('uses calendar-week arithmetic across DST boundaries', () => {
        assert.equal(previousPlannerWeek('2026-03-30'), '2026-03-23');
        assert.equal(nextPlannerWeek('2026-03-23'), '2026-03-30');
        assert.equal(nextPlannerWeek('2026-10-19'), '2026-10-26');
    });
});

describe('moveTaskToPlannerDestination', () => {
    it('moves a timed task to another day without changing its time or lane', () => {
        const original = task('timed');
        const moved = moveTaskToPlannerDestination(original, { date: '2026-08-19', lane: 'morning' });
        assert.equal(moved.date, '2026-08-19');
        assert.equal(moved.time, '09:15');
        assert.equal(moved.timeBlock, 'morning');
        assert.equal(plannerLaneForTask(moved), 'morning');
    });

    it('keeps an untimed task untimed when it moves between days', () => {
        const original = task('untimed', { time: '', timeBlock: 'evening', reminderEnabled: false });
        const moved = moveTaskToPlannerDestination(original, { date: '2026-08-21', lane: 'untimed' });
        assert.equal(moved.date, '2026-08-21');
        assert.equal(moved.time, '');
        assert.equal(moved.timeBlock, 'evening', 'no synthetic lane is persisted for untimed work');
        assert.equal(moved.reminderEnabled, false);
    });

    it('uses a deterministic time when an untimed task enters a timed lane', () => {
        const moved = moveTaskToPlannerDestination(
            task('untimed', { time: '', timeBlock: 'evening' }),
            { date: '2026-08-18', lane: 'afternoon' },
        );
        assert.equal(moved.time, '14:00');
        assert.equal(moved.timeBlock, 'afternoon');
    });

    it('derives the stored lane from an explicit time so time and block cannot disagree', () => {
        const moved = moveTaskToPlannerDestination(
            task('explicit'),
            { date: '2026-08-18', lane: 'morning', time: '19:30' },
        );
        assert.equal(moved.time, '19:30');
        assert.equal(moved.timeBlock, 'evening');
    });

    it('clears time deliberately when a timed task enters Ohne Zeit', () => {
        const moved = moveTaskToPlannerDestination(
            task('timed', { reminderEnabled: true }),
            { date: '2026-08-22', lane: 'untimed' },
        );
        assert.equal(moved.time, '');
        assert.equal(moved.reminderEnabled, true, 'planner movement does not rewrite unrelated settings');
    });

    it('preserves recurrence cadence fields, rollover provenance, history and authored content byte-for-byte within its series day', () => {
        const original = task('monthly', {
            date: '2026-08-31',
            recurrence: 'monthly',
            recurrenceAnchorDay: 31,
            recurrenceSourceId: 'source-1',
            rolledOverFrom: '2026-08-30',
            checklistItems: [{ id: 'c1', text: 'مرحله اول', completed: false }],
            notes: 'Notiz یادداشت',
            completedAt: null,
        });
        const moved = moveTaskToPlannerDestination(original, { date: '2026-08-31', lane: 'evening' });

        assert.deepEqual({
            recurrence: moved.recurrence,
            recurrenceAnchorDay: moved.recurrenceAnchorDay,
            recurrenceSourceId: moved.recurrenceSourceId,
            rolledOverFrom: moved.rolledOverFrom,
            checklistItems: moved.checklistItems,
            notes: moved.notes,
            completedAt: moved.completedAt,
        }, {
            recurrence: original.recurrence,
            recurrenceAnchorDay: original.recurrenceAnchorDay,
            recurrenceSourceId: original.recurrenceSourceId,
            rolledOverFrom: original.rolledOverFrom,
            checklistItems: original.checklistItems,
            notes: original.notes,
            completedAt: original.completedAt,
        });
    });

    it('protects a recurring series from accidental cross-day movement', () => {
        const recurring = task('weekly', { recurrence: 'weekly' });
        const destination = { date: '2026-08-18', lane: 'afternoon' } as const;
        assert.equal(canMoveTaskToPlannerDestination(recurring, destination), false);
        assert.equal(moveTaskToPlannerDestination(recurring, destination), recurring);
    });

    it('refuses to reschedule completed history', () => {
        const completed = task('done', { completed: true, completedAt: '2026-08-17T10:00:00.000Z' });
        assert.equal(moveTaskToPlannerDestination(completed, { date: '2026-08-20', lane: 'evening' }), completed);
    });
});
