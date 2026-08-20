import assert from 'node:assert/strict';
import test from 'node:test';

import type { Task } from '../src/types/task';
import { isValidAnchorDay, isValidTaskArray } from '../src/types/task';
import {
  buildNextOccurrence,
  nextRecurrenceDate,
  nextRecurrenceDateAfter,
  resolveRecurrenceAnchorDay,
  withRecurrenceAnchor,
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

// Deterministic injections so spawned occurrences are fully predictable.
const newId = () => 'spawned-id';
const timestamp = () => '2026-08-12T10:00:00.000Z';

// ─── Monthly clamping ─────────────────────────────────────────────────────────

test('monthly recurrence clamps to the last day of a shorter target month', () => {
  assert.equal(nextRecurrenceDate('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextRecurrenceDate('2026-01-30', 'monthly'), '2026-02-28');
  assert.equal(nextRecurrenceDate('2026-01-29', 'monthly'), '2026-02-28');
  assert.equal(nextRecurrenceDate('2026-03-31', 'monthly'), '2026-04-30');
  assert.equal(nextRecurrenceDate('2026-05-31', 'monthly'), '2026-06-30');
});

test('monthly recurrence leaves ordinary days untouched and wraps the year', () => {
  assert.equal(nextRecurrenceDate('2026-01-15', 'monthly'), '2026-02-15');
  assert.equal(nextRecurrenceDate('2026-12-31', 'monthly'), '2027-01-31');
  assert.equal(nextRecurrenceDate('2026-12-15', 'monthly'), '2027-01-15');
});

test('monthly recurrence respects leap and non-leap Februaries', () => {
  assert.equal(nextRecurrenceDate('2028-01-31', 'monthly'), '2028-02-29');
  assert.equal(nextRecurrenceDate('2028-01-29', 'monthly'), '2028-02-29');
  assert.equal(nextRecurrenceDate('2026-01-31', 'monthly'), '2026-02-28');
  // 2100 is divisible by 4 but not a leap year.
  assert.equal(nextRecurrenceDate('2100-01-31', 'monthly'), '2100-02-28');
});

test('an anchor day restores day 31 after a clamped month instead of drifting', () => {
  // Jan 31 -> Feb 28 -> Mar 31 (anchor carried, not the clamped day).
  assert.equal(nextRecurrenceDate('2026-01-31', 'monthly', 31), '2026-02-28');
  assert.equal(nextRecurrenceDate('2026-02-28', 'monthly', 31), '2026-03-31');
  // Mar 31 -> Apr 30 -> May 31.
  assert.equal(nextRecurrenceDate('2026-03-31', 'monthly', 31), '2026-04-30');
  assert.equal(nextRecurrenceDate('2026-04-30', 'monthly', 31), '2026-05-31');
});

test('without an anchor day a clamped monthly series would drift earlier', () => {
  // Documents why recurrenceAnchorDay exists: clamping alone loses day 31.
  assert.equal(nextRecurrenceDate('2026-02-28', 'monthly'), '2026-03-28');
});

// ─── Cadence after rollover ───────────────────────────────────────────────────

test('a weekly task completed late keeps its original weekday', () => {
  // Scheduled Monday 2026-08-03, rolled forward to Wednesday 2026-08-12.
  assert.equal(
    nextRecurrenceDateAfter('2026-08-03', 'weekly', '2026-08-12'),
    '2026-08-17', // the following Monday, not the following Wednesday
  );
});

test('weekly cadence is unchanged for a task that was never rolled over', () => {
  assert.equal(
    nextRecurrenceDateAfter('2026-08-12', 'weekly', '2026-08-12'),
    '2026-08-19',
  );
});

test('daily and every-two-days cadence advance past the current scheduled date', () => {
  assert.equal(nextRecurrenceDateAfter('2026-08-03', 'daily', '2026-08-12'), '2026-08-13');
  // Every-two-days keeps the anchor's parity: 03, 05, 07, 09, 11, 13.
  assert.equal(nextRecurrenceDateAfter('2026-08-03', 'every2days', '2026-08-12'), '2026-08-13');
  // An anchor of even parity lands on the even day instead.
  assert.equal(nextRecurrenceDateAfter('2026-08-04', 'every2days', '2026-08-12'), '2026-08-14');
});

test('monthly cadence after a long rollover skips to the next unclaimed month', () => {
  assert.equal(
    nextRecurrenceDateAfter('2026-01-31', 'monthly', '2026-03-05', 31),
    '2026-03-31',
  );
});

test('a non-recurring rule terminates instead of looping', () => {
  assert.equal(nextRecurrenceDateAfter('2026-08-03', 'none', '2026-08-12'), '2026-08-03');
});

test('a very stale daily anchor still lands on the day after afterDate', () => {
  // 2015-08-29 is exactly 4001 days before 2026-08-12, past the old iteration cap.
  assert.equal(
    nextRecurrenceDateAfter('2015-08-29', 'daily', '2026-08-12'),
    '2026-08-13',
  );
  // And well beyond it.
  assert.equal(
    nextRecurrenceDateAfter('2014-04-17', 'daily', '2026-08-12'),
    '2026-08-13',
  );
});

test('stale weekly and monthly anchors stay strictly after afterDate', () => {
  // 2015-08-29 was a Saturday; the result must be the first Saturday after.
  const weekly = nextRecurrenceDateAfter('2015-08-29', 'weekly', '2026-08-12');
  assert.equal(weekly, '2026-08-15');
  assert.ok(weekly > '2026-08-12');

  const monthly = nextRecurrenceDateAfter('2015-01-31', 'monthly', '2026-08-12', 31);
  assert.equal(monthly, '2026-08-31');
  assert.ok(monthly > '2026-08-12');
});

// Local date arithmetic, independent of the implementation under test.
const shiftDays = (dateStr: string, days: number): string => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y, mo - 1, d, 12, 0, 0);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

test('the result is always strictly after afterDate across a long sweep', () => {
  const rules = ['daily', 'every2days', 'weekly', 'monthly'] as const;
  const after = '2026-08-12';

  for (const rule of rules) {
    // Anchors from ~12 years back up to afterDate itself.
    for (let back = 4400; back >= 0; back -= 13) {
      const anchorDate = shiftDays(after, -back);
      const result = nextRecurrenceDateAfter(anchorDate, rule, after);
      assert.ok(
        result > after,
        `${rule} from ${anchorDate} returned ${result}, which is not after ${after}`,
      );
    }
  }
});

// ─── Occurrence spawning ──────────────────────────────────────────────────────

test('completing a rolled weekly task spawns the next occurrence on its weekday', () => {
  const target = makeTask({
    id: 'weekly-1',
    recurrence: 'weekly',
    date: '2026-08-12',
    rolledOverFrom: '2026-08-03',
    completed: true,
  });

  const next = buildNextOccurrence(target, [target], newId, timestamp);

  assert.ok(next);
  assert.equal(next.date, '2026-08-17');
  assert.equal(next.recurrenceSourceId, 'weekly-1');
  assert.equal(next.completed, false);
  assert.equal(next.title, target.title);
  assert.equal(next.time, target.time);
});

test('a spawned monthly occurrence carries the anchor day forward', () => {
  const target = makeTask({
    id: 'monthly-1',
    recurrence: 'monthly',
    date: '2026-01-31',
    completed: true,
  });

  const feb = buildNextOccurrence(target, [target], newId, timestamp);
  assert.ok(feb);
  assert.equal(feb.date, '2026-02-28');
  assert.equal(feb.recurrenceAnchorDay, 31);

  // Completing the clamped February occurrence returns the series to day 31.
  const mar = buildNextOccurrence(
    { ...feb, id: 'monthly-2', completed: true },
    [],
    newId,
    timestamp,
  );
  assert.ok(mar);
  assert.equal(mar.date, '2026-03-31');
  assert.equal(mar.recurrenceAnchorDay, 31);
});

test('non-monthly occurrences do not carry an anchor day', () => {
  const target = makeTask({ id: 'daily-1', recurrence: 'daily', completed: true });
  const next = buildNextOccurrence(target, [target], newId, timestamp);

  assert.ok(next);
  assert.equal(next.recurrenceAnchorDay, undefined);
});

test('no occurrence is spawned twice for the same source task', () => {
  const target = makeTask({ id: 'weekly-1', recurrence: 'weekly', completed: true });
  const existing = makeTask({
    id: 'weekly-2',
    date: '2026-01-08',
    recurrenceSourceId: 'weekly-1',
  });

  assert.equal(buildNextOccurrence(target, [target, existing], newId, timestamp), null);
});

test('non-recurring tasks never spawn an occurrence', () => {
  const noRule = makeTask({ id: 'plain', completed: true });
  const explicitNone = makeTask({ id: 'plain-2', recurrence: 'none', completed: true });

  assert.equal(buildNextOccurrence(noRule, [noRule], newId, timestamp), null);
  assert.equal(buildNextOccurrence(explicitNone, [explicitNone], newId, timestamp), null);
});

test('a spawned occurrence is not itself marked as rolled over', () => {
  const target = makeTask({
    id: 'weekly-1',
    recurrence: 'weekly',
    date: '2026-08-12',
    rolledOverFrom: '2026-08-03',
    completed: true,
  });

  const next = buildNextOccurrence(target, [target], newId, timestamp);

  assert.ok(next);
  // The anchor is read-only input; the fresh occurrence has not been rolled.
  assert.equal(next.rolledOverFrom, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(next, 'rolledOverFrom'), false);
});

test('a spawned occurrence resets checklist items', () => {
  const target = makeTask({
    id: 'daily-1',
    recurrence: 'daily',
    completed: true,
    checklistItems: [
      { id: 'c1', text: 'Step one', completed: true },
      { id: 'c2', text: 'Step two', completed: true },
    ],
  });

  const next = buildNextOccurrence(target, [target], newId, timestamp);

  assert.ok(next);
  assert.deepEqual(next.checklistItems, [
    { id: 'c1', text: 'Step one', completed: false },
    { id: 'c2', text: 'Step two', completed: false },
  ]);
});

// ─── Anchor lifecycle on create / edit ────────────────────────────────────────

test('a new monthly task derives its anchor from its scheduled date', () => {
  const created = withRecurrenceAnchor(
    makeTask({ id: 'new-monthly', recurrence: 'monthly', date: '2026-01-31' }),
  );

  assert.equal(created.recurrenceAnchorDay, 31);
});

test('switching a task to monthly derives a fresh anchor from its scheduled date', () => {
  const weekly = makeTask({ id: 'switch-1', recurrence: 'weekly', date: '2026-03-31' });
  assert.equal(weekly.recurrenceAnchorDay, undefined);

  const nowMonthly = withRecurrenceAnchor({ ...weekly, recurrence: 'monthly' });

  assert.equal(nowMonthly.recurrenceAnchorDay, 31);
});

test('switching away from monthly removes the stale anchor entirely', () => {
  const monthly = makeTask({
    id: 'switch-2',
    recurrence: 'monthly',
    date: '2026-01-31',
    recurrenceAnchorDay: 31,
  });

  for (const rule of ['weekly', 'daily', 'every2days', 'none'] as const) {
    const switched = withRecurrenceAnchor({ ...monthly, recurrence: rule });
    assert.equal(switched.recurrenceAnchorDay, undefined);
    // Deleted, not merely undefined, so nothing stale reaches localStorage.
    assert.equal(
      Object.prototype.hasOwnProperty.call(switched, 'recurrenceAnchorDay'),
      false,
      `anchor key survived a switch to ${rule}`,
    );
  }
});

test('editing other fields of a monthly task preserves its existing anchor', () => {
  const monthly = makeTask({
    id: 'edit-1',
    recurrence: 'monthly',
    date: '2026-02-28',      // a clamped occurrence
    recurrenceAnchorDay: 31, // anchored to 31, must survive the edit
  });

  const edited = withRecurrenceAnchor({
    ...monthly,
    title: 'Renamed',
    time: '18:30',
    priority: 'high',
  });

  assert.equal(edited.recurrenceAnchorDay, 31);
  assert.equal(edited.title, 'Renamed');
  // And the preserved anchor still drives the cadence back to day 31.
  assert.equal(
    nextRecurrenceDate(edited.date, 'monthly', edited.recurrenceAnchorDay),
    '2026-03-31',
  );
});

test('resolveRecurrenceAnchorDay covers the lifecycle directly', () => {
  assert.equal(resolveRecurrenceAnchorDay('monthly', '2026-01-31'), 31);
  assert.equal(resolveRecurrenceAnchorDay('monthly', '2026-02-28', 31), 31);
  assert.equal(resolveRecurrenceAnchorDay('weekly', '2026-01-31', 31), undefined);
  assert.equal(resolveRecurrenceAnchorDay(undefined, '2026-01-31', 31), undefined);
});

test('a task with no anchor is returned unchanged by reference', () => {
  const plain = makeTask({ id: 'plain', recurrence: 'weekly' });
  assert.equal(withRecurrenceAnchor(plain), plain);
});

// ─── Runtime validation of recurrenceAnchorDay ────────────────────────────────

test('isValidAnchorDay accepts only integers within 1..31', () => {
  for (const valid of [1, 31, 15, 28, 29, 30]) {
    assert.equal(isValidAnchorDay(valid), true, `${valid} should be valid`);
  }
  for (const invalid of [0, -1, 32, 100, 1.5, 30.9, NaN, Infinity, -Infinity]) {
    assert.equal(isValidAnchorDay(invalid), false, `${String(invalid)} should be invalid`);
  }
  for (const invalid of ['31', '', null, undefined, {}, [], true]) {
    assert.equal(isValidAnchorDay(invalid), false, `${String(invalid)} should be invalid`);
  }
});

test('isValidTaskArray rejects tasks carrying an out-of-range anchor', () => {
  const withAnchor = (recurrenceAnchorDay: unknown) => [
    { ...makeTask({ recurrence: 'monthly' }), recurrenceAnchorDay },
  ];

  // Boundary values are accepted.
  assert.equal(isValidTaskArray(withAnchor(1)), true);
  assert.equal(isValidTaskArray(withAnchor(31)), true);
  // Absent is accepted (the field is optional).
  assert.equal(isValidTaskArray([makeTask({ recurrence: 'monthly' })]), true);

  // Everything out of range is rejected.
  assert.equal(isValidTaskArray(withAnchor(0)), false);
  assert.equal(isValidTaskArray(withAnchor(32)), false);
  assert.equal(isValidTaskArray(withAnchor(15.5)), false);
  assert.equal(isValidTaskArray(withAnchor('31')), false);
  assert.equal(isValidTaskArray(withAnchor(NaN)), false);
  assert.equal(isValidTaskArray(withAnchor(null)), false);
});
