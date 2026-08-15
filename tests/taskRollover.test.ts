import assert from 'node:assert/strict';
import test from 'node:test';

import type { Task } from '../src/types/task';
import { nextRecurrenceDate, rolloverTasksForDate } from '../src/utils/taskUtils';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Test task',
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed: false,
  priority: 'medium',
  createdAt: '2026-01-01T08:00:00.000Z',
  date: '2026-01-01',
  ...overrides,
});

test('rolls an incomplete past task forward and records its original date', () => {
  const original = makeTask();
  const result = rolloverTasksForDate([original], '2026-01-02');

  assert.deepEqual(result[0], {
    ...original,
    date: '2026-01-02',
    rolledOverFrom: '2026-01-01',
  });
  assert.equal(original.date, '2026-01-01');
  assert.equal(original.rolledOverFrom, undefined);
});

test('preserves the first origin across repeated rollovers', () => {
  const task = makeTask({
    date: '2026-01-02',
    rolledOverFrom: '2025-12-30',
  });

  const [result] = rolloverTasksForDate([task], '2026-01-03');

  assert.equal(result.date, '2026-01-03');
  assert.equal(result.rolledOverFrom, '2025-12-30');
});

test('does not move completed, current, or future tasks', () => {
  const completedPast = makeTask({ id: 'completed', completed: true });
  const current = makeTask({ id: 'current', date: '2026-01-02' });
  const future = makeTask({ id: 'future', date: '2026-01-03' });

  const result = rolloverTasksForDate(
    [completedPast, current, future],
    '2026-01-02',
  );

  assert.deepEqual(result, [completedPast, current, future]);
});

test('daily, every-two-days, and weekly recurrence cross date boundaries safely', () => {
  assert.equal(nextRecurrenceDate('2026-12-31', 'daily'), '2027-01-01');
  assert.equal(nextRecurrenceDate('2024-02-28', 'daily'), '2024-02-29');
  assert.equal(nextRecurrenceDate('2026-02-28', 'every2days'), '2026-03-02');
  assert.equal(nextRecurrenceDate('2026-02-28', 'weekly'), '2026-03-07');
});

// Monthly day 29-31 handling and post-rollover cadence are covered in
// tests/recurrence.test.ts.
