import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { Task } from '../src/types/task';
import { getCurrentTimeString, selectNowTask, summarizeTodayWork } from '../src/utils/taskUtils';

const task = (id: string, time: string, completed = false): Task => ({
  id,
  title: id,
  time,
  duration: '30m',
  timeBlock: 'morning',
  completed,
  completedAt: null,
  priority: 'medium',
  createdAt: '2026-05-20T06:00:00.000Z',
  date: '2026-05-20',
});

describe('selectNowTask', () => {
  it('selects the earliest open task at or after the current time', () => {
    const selected = selectNowTask([
      task('later', '18:00'),
      task('past', '09:00'),
      task('next', '14:30'),
    ], '14:30');
    assert.equal(selected?.id, 'next');
  });

  it('falls back to the earliest unfinished timed task when the day is past schedule', () => {
    const selected = selectNowTask([
      task('late', '18:00'),
      task('early', '08:00'),
    ], '23:00');
    assert.equal(selected?.id, 'early');
  });

  it('ignores completed and untimed tasks', () => {
    const selected = selectNowTask([
      task('untimed', ''),
      task('done', '15:00', true),
      task('open', '16:00'),
    ], '14:30');
    assert.equal(selected?.id, 'open');
  });

  it('returns null when no incomplete timed task exists', () => {
    assert.equal(selectNowTask([task('untimed', ''), task('done', '12:00', true)], '14:30'), null);
  });

  it('does not mutate the caller task order', () => {
    const input = [task('later', '18:00'), task('earlier', '15:00')];
    selectNowTask(input, '14:30');
    assert.deepEqual(input.map(item => item.id), ['later', 'earlier']);
  });
});

describe('getCurrentTimeString', () => {
  it('formats local hours and minutes as HH:MM', () => {
    assert.equal(getCurrentTimeString(new Date(2026, 4, 20, 7, 5)), '07:05');
  });
});

describe('summarizeTodayWork', () => {
  it('counts only the plan made for today in the progress fraction', () => {
    const plannedDone = { ...task('planned-done', '08:00', true) };
    const plannedOpen = task('planned-open', '09:00');
    const carriedOpen = {
      ...task('carried-open', '10:00'),
      rolledOverFrom: '2026-05-19',
    };
    const carriedDone = {
      ...task('carried-done', '11:00', true),
      rolledOverFrom: '2026-05-18',
    };

    const summary = summarizeTodayWork([
      carriedOpen,
      plannedOpen,
      carriedDone,
      plannedDone,
    ]);

    assert.equal(summary.completedPlanned, 1);
    assert.equal(summary.totalPlanned, 2);
    assert.equal(summary.openPlanned, 1);
    assert.equal(summary.percentage, 50);
    assert.deepEqual(summary.plannedTasks.map(item => item.id), ['planned-open', 'planned-done']);
    assert.deepEqual(summary.carriedTasks.map(item => item.id), ['carried-open']);
  });

  it('reports zero progress for a carry-over-only day', () => {
    const carried = {
      ...task('carried', '10:00'),
      rolledOverFrom: '2026-05-19',
    };

    const summary = summarizeTodayWork([carried]);

    assert.equal(summary.totalPlanned, 0);
    assert.equal(summary.completedPlanned, 0);
    assert.equal(summary.openPlanned, 0);
    assert.equal(summary.percentage, 0);
    assert.equal(summary.carriedTasks.length, 1);
  });

  it('does not mutate the input or its task order', () => {
    const input = [
      { ...task('carried', '10:00'), rolledOverFrom: '2026-05-19' },
      task('planned', '09:00'),
    ];

    summarizeTodayWork(input);

    assert.deepEqual(input.map(item => item.id), ['carried', 'planned']);
  });
});
