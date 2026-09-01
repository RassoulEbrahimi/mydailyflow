import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTodayPlanModel } from '../src/hooks/useTodayPlanModel';
import type { Task } from '../src/types/task';

const TODAY = '2026-09-02';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Test task',
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed: false,
  completedAt: null,
  priority: 'medium',
  createdAt: '2026-09-01T08:00:00.000Z',
  date: TODAY,
  ...overrides,
});

test('builds the complete Today read model without mixing planned, carry-over, or future work', () => {
  const input = [
    makeTask({ id: 'future', date: '2026-09-03', time: '09:00' }),
    makeTask({ id: 'untimed', time: '', timeBlock: 'evening' }),
    makeTask({ id: 'stale', date: '2026-09-01', time: '08:00' }),
    makeTask({ id: 'planned-next', time: '10:00' }),
    makeTask({
      id: 'carried',
      time: '11:00',
      rolledOverFrom: '2026-09-01',
    }),
    makeTask({
      id: 'planned-done',
      time: '07:00',
      completed: true,
      completedAt: '2026-09-02T05:00:00.000Z',
    }),
    makeTask({
      id: 'completed-today-from-past',
      date: '2026-09-01',
      time: '16:00',
      timeBlock: 'afternoon',
      completed: true,
      completedAt: '2026-09-02T14:00:00.000Z',
    }),
  ];

  const model = buildTodayPlanModel(input, TODAY, '09:30');

  assert.equal(model.todaySummary.totalPlanned, 3);
  assert.equal(model.todaySummary.completedPlanned, 1);
  assert.equal(model.todaySummary.openPlanned, 2);
  assert.equal(model.todaySummary.percentage, 33);
  assert.equal(model.pendingTaskCount, 3);
  assert.equal(model.nowTask?.id, 'planned-next');
  assert.deepEqual(model.morningTriageTasks.map(task => task.id), ['stale', 'carried']);
  assert.deepEqual(model.plannedOpenTasks.map(task => task.id), ['untimed', 'planned-next']);
  assert.deepEqual(model.morningTasks.map(task => task.id), ['planned-next']);
  assert.deepEqual(model.afternoonTasks, []);
  assert.deepEqual(model.eveningTasks, []);
  assert.deepEqual(model.untimedTasks.map(task => task.id), ['untimed']);
  assert.deepEqual(
    model.completedTodayTasks.map(task => task.id),
    ['planned-done', 'completed-today-from-past'],
  );
});

test('sorts each Today section by time while preserving the caller order', () => {
  const input = [
    makeTask({ id: 'late-morning', time: '11:30' }),
    makeTask({ id: 'first-untimed', time: '', timeBlock: 'evening' }),
    makeTask({ id: 'early-morning', time: '06:30' }),
    makeTask({ id: 'second-untimed', time: '', timeBlock: 'morning' }),
  ];
  const originalIds = input.map(task => task.id);

  const model = buildTodayPlanModel(input, TODAY, '06:00');

  assert.deepEqual(model.morningTasks.map(task => task.id), ['early-morning', 'late-morning']);
  assert.deepEqual(model.untimedTasks.map(task => task.id), ['first-untimed', 'second-untimed']);
  assert.deepEqual(input.map(task => task.id), originalIds);
});

test('uses completedAt rather than the scheduled date for the Today completed group', () => {
  const model = buildTodayPlanModel([
    makeTask({
      id: 'completed-today',
      date: '2026-08-30',
      completed: true,
      completedAt: '2026-09-02T10:00:00.000Z',
    }),
    makeTask({
      id: 'completed-yesterday',
      completed: true,
      completedAt: '2026-09-01T10:00:00.000Z',
    }),
  ], TODAY, '12:00');

  assert.deepEqual(model.completedTodayTasks.map(task => task.id), ['completed-today']);
});
