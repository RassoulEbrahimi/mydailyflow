import assert from 'node:assert/strict';
import test from 'node:test';

import type { Task } from '../src/types/task';
import {
  acceptRescheduledTask,
  acceptTaskForToday,
  isReminderTriggerPast,
  nextRecurrenceDate,
  reminderTriggerTimestamp,
  selectMorningTriageTasks,
} from '../src/utils/taskUtils';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Test task',
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed: false,
  completedAt: null,
  priority: 'medium',
  createdAt: '2026-01-01T08:00:00.000Z',
  date: '2026-01-01',
  ...overrides,
});

test('morning triage finds stale open work without moving or mutating it', () => {
  const stale = makeTask({ id: 'stale', date: '2026-01-01' });
  const legacyCarry = makeTask({
    id: 'legacy',
    date: '2026-01-02',
    rolledOverFrom: '2025-12-30',
  });
  const completedPast = makeTask({ id: 'completed', completed: true });
  const current = makeTask({ id: 'current', date: '2026-01-02' });
  const future = makeTask({ id: 'future', date: '2026-01-03' });
  const input = [stale, legacyCarry, completedPast, current, future];

  const result = selectMorningTriageTasks(input, '2026-01-02');

  assert.deepEqual(result.map(task => task.id), ['stale', 'legacy']);
  assert.equal(stale.date, '2026-01-01');
  assert.deepEqual(input, [stale, legacyCarry, completedPast, current, future]);
});

test('accepting a triage task adds it to today and removes legacy carry-over state', () => {
  const stale = makeTask({
    date: '2026-01-01',
    rolledOverFrom: '2025-12-30',
  });

  const accepted = acceptTaskForToday(stale, '2026-01-02');

  assert.equal(accepted.date, '2026-01-02');
  assert.equal(accepted.rolledOverFrom, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(accepted, 'rolledOverFrom'), false);
  assert.equal(stale.date, '2026-01-01');
  assert.equal(stale.rolledOverFrom, '2025-12-30');
});

test('an intentional date or time change accepts the new plan and clears rollover provenance', () => {
  const carried = makeTask({ date: '2026-01-02', rolledOverFrom: '2026-01-01' });

  for (const edited of [
    { ...carried, date: '2026-01-03' },
    { ...carried, time: '14:00', timeBlock: 'afternoon' as const },
  ]) {
    const accepted = acceptRescheduledTask(carried, edited);
    assert.equal(accepted.rolledOverFrom, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(accepted, 'rolledOverFrom'), false);
  }
});

test('editing authored content without rescheduling preserves rollover provenance', () => {
  const carried = makeTask({ date: '2026-01-02', rolledOverFrom: '2026-01-01' });
  const renamed = acceptRescheduledTask(carried, { ...carried, title: 'Renamed' });

  assert.equal(renamed.rolledOverFrom, '2026-01-01');
  assert.equal(renamed.title, 'Renamed');
});

test('reminder status changes exactly when its lead-time trigger is reached', () => {
  const reminder = makeTask({ date: '2026-05-20', time: '15:00' });

  assert.equal(
    reminderTriggerTimestamp(reminder),
    new Date(2026, 4, 20, 14, 50).getTime(),
  );
  assert.equal(isReminderTriggerPast(reminder, new Date(2026, 4, 20, 14, 49, 59)), false);
  assert.equal(isReminderTriggerPast(reminder, new Date(2026, 4, 20, 14, 50)), true);
  assert.equal(isReminderTriggerPast({ ...reminder, time: '' }, new Date(2026, 4, 20, 20)), false);
});

test('daily, every-two-days, and weekly recurrence cross date boundaries safely', () => {
  assert.equal(nextRecurrenceDate('2026-12-31', 'daily'), '2027-01-01');
  assert.equal(nextRecurrenceDate('2024-02-28', 'daily'), '2024-02-29');
  assert.equal(nextRecurrenceDate('2026-02-28', 'every2days'), '2026-03-02');
  assert.equal(nextRecurrenceDate('2026-02-28', 'weekly'), '2026-03-07');
});

// Monthly day 29-31 handling and stale-series catch-up are covered in
// tests/recurrence.test.ts.
