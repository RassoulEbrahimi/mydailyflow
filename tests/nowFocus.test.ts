import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { Task } from '../src/types/task';
import { getCurrentTimeString, selectNowTask } from '../src/utils/taskUtils';

const task = (id: string, time: string, completed = false): Task => ({
  id,
  title: id,
  time,
  duration: '30m',
  timeBlock: 'morning',
  completed,
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
