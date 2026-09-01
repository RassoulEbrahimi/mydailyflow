import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '../src/types/task';
import {
    buildPlanningCapacity,
    durationToMinutes,
    formatPlanningMinutes,
} from '../src/utils/planningCapacity';

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
    id,
    title: id,
    time: '',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    completedAt: null,
    priority: 'medium',
    createdAt: '2026-09-01T07:00:00.000Z',
    date: '2026-09-01',
    ...overrides,
});

describe('planning duration', () => {
    it('parses the capture choices and compatible mixed durations', () => {
        assert.equal(durationToMinutes('15m'), 15);
        assert.equal(durationToMinutes('1h'), 60);
        assert.equal(durationToMinutes('1h 30m'), 90);
        assert.equal(durationToMinutes('1.5h'), 90);
        assert.equal(durationToMinutes('unknown'), 0);
    });

    it('formats a compact German duration', () => {
        assert.equal(formatPlanningMinutes(45), '45 Min.');
        assert.equal(formatPlanningMinutes(60), '1 Std.');
        assert.equal(formatPlanningMinutes(135), '2 Std. 15 Min.');
    });
});

describe('buildPlanningCapacity', () => {
    it('separates exact-time commitments from flexible work without mutating tasks', () => {
        const input = [
            task('flexible', { duration: '2h' }),
            task('appointment', { time: '09:00', duration: '45m' }),
            task('done', { time: '12:00', duration: '2h', completed: true, completedAt: '2026-09-01T12:00:00.000Z' }),
        ];
        const before = structuredClone(input);

        const summary = buildPlanningCapacity(input);

        assert.deepEqual(summary.fixedCommitments.map(item => item.id), ['appointment']);
        assert.deepEqual(summary.flexibleTasks.map(item => item.id), ['flexible']);
        assert.equal(summary.fixedMinutes, 45);
        assert.equal(summary.flexibleMinutes, 120);
        assert.equal(summary.totalMinutes, 165);
        assert.deepEqual(input, before);
    });

    it('reports a non-blocking over-capacity amount against the explicit reference', () => {
        const summary = buildPlanningCapacity([
            task('deep-work', { duration: '6h' }),
            task('admin', { duration: '3h' }),
        ]);

        assert.equal(summary.capacityMinutes, 480);
        assert.equal(summary.overByMinutes, 60);
        assert.equal(summary.remainingMinutes, 0);
        assert.equal(summary.utilizationPercent, 113);
    });

    it('finds overlaps only between fixed commitments', () => {
        const summary = buildPlanningCapacity([
            task('train', { time: '08:00', duration: '1h' }),
            task('meeting', { time: '08:30', duration: '30m' }),
            task('later', { time: '09:00', duration: '30m' }),
            task('flexible', { duration: '2h' }),
        ]);

        assert.deepEqual(
            summary.conflicts.map(conflict => [conflict.first.id, conflict.second.id]),
            [['train', 'meeting']],
        );
    });
});
