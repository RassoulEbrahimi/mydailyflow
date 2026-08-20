import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { DailyEssential, EssentialHistoryDay } from '../src/types/essential';
import type { Task } from '../src/types/task';
import {
  addCalendarDays,
  buildWeeklyReview,
  dateInTimeZone,
  startOfLocalWeek,
  weekDates,
} from '../src/utils/weeklyReview';

const task = (id: string, date: string, overrides: Partial<Task> = {}): Task => ({
  id,
  title: id,
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed: false,
  completedAt: null,
  priority: 'medium',
  createdAt: `${date}T06:00:00.000Z`,
  date,
  ...overrides,
});

const essential: DailyEssential = {
  id: 'water',
  title: 'Wasser',
  targetCount: 3,
  order: 0,
  createdAt: '2026-08-01T06:00:00.000Z',
};

describe('weekly calendar arithmetic', () => {
  it('anchors weeks on Monday without depending on elapsed local hours', () => {
    assert.equal(startOfLocalWeek('2026-08-20'), '2026-08-17');
    assert.deepEqual(weekDates('2026-08-17'), [
      '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20',
      '2026-08-21', '2026-08-22', '2026-08-23',
    ]);
    assert.equal(addCalendarDays('2026-03-29', 1), '2026-03-30');
  });

  it('maps completion instants correctly across both Berlin DST transitions', () => {
    assert.equal(dateInTimeZone('2026-03-29T22:30:00.000Z', 'Europe/Berlin'), '2026-03-30');
    assert.equal(dateInTimeZone('2026-10-25T23:30:00.000Z', 'Europe/Berlin'), '2026-10-26');
  });
});

describe('buildWeeklyReview', () => {
  it('keeps planned, completed and carried work factually separate', () => {
    const review = buildWeeklyReview([
      task('planned-open', '2026-08-17'),
      task('carried', '2026-08-20', { rolledOverFrom: '2026-08-16' }),
      task('completed-late', '2026-08-17', {
        completed: true,
        completedAt: '2026-08-19T21:30:00.000Z', // 23:30 Berlin
      }),
      task('legacy-done', '2026-08-18', { completed: true, completedAt: null }),
      task('outside', '2026-08-24'),
    ], [], '2026-08-20', '2026-08-20', 'Europe/Berlin');

    assert.equal(review.startDate, '2026-08-17');
    assert.equal(review.endDate, '2026-08-23');
    assert.equal(review.plannedTotal, 3);
    assert.equal(review.completedTotal, 1);
    assert.equal(review.carriedTotal, 1);
    assert.equal(review.days.find(day => day.date === '2026-08-19')?.completed, 1);
    assert.equal(review.completionMoments[0].time, '23:30');
    assert.deepEqual(review.unfinishedTasks.map(item => item.id), ['planned-open', 'carried']);
    assert.equal(review.legacyCompletionCount, 1);
  });

  it('keeps an unfinished rollover visible in the week where it originated', () => {
    const review = buildWeeklyReview([
      task('rolled-beyond-week', '2026-08-24', { rolledOverFrom: '2026-08-21' }),
      task('unrelated-future', '2026-08-24'),
    ], [], '2026-08-20', '2026-08-24', 'Europe/Berlin');

    assert.deepEqual(review.unfinishedTasks.map(item => item.id), ['rolled-beyond-week']);
  });

  it('shows missing, migrated and live Essential days without turning missing days into zeroes', () => {
    const history: EssentialHistoryDay[] = [{
      date: '2026-08-19',
      recordedAt: null,
      source: 'legacy-snapshot',
      entries: [{
        essentialId: 'water',
        title: 'Wasser',
        targetCount: 3,
        completedCount: 1,
      }],
    }];

    const review = buildWeeklyReview(
      [],
      history,
      '2026-08-20',
      '2026-08-20',
      'Europe/Berlin',
      { date: '2026-08-20', essentials: [essential], progressById: { water: 3 } },
    );

    assert.equal(review.trackedEssentialDays, 2);
    assert.equal(review.historicalEssentialDays, 1);
    assert.equal(review.migratedEssentialDays, 1);
    assert.deepEqual(
      review.essentialDays.map(day => ({ date: day.date, source: day.source, value: `${day.completed}/${day.total}` })),
      [
        { date: '2026-08-17', source: null, value: '0/0' },
        { date: '2026-08-18', source: null, value: '0/0' },
        { date: '2026-08-19', source: 'legacy-snapshot', value: '0/1' },
        { date: '2026-08-20', source: 'live', value: '1/1' },
        { date: '2026-08-21', source: null, value: '0/0' },
        { date: '2026-08-22', source: null, value: '0/0' },
        { date: '2026-08-23', source: null, value: '0/0' },
      ],
    );
  });

  it('uses live state instead of a stale migration snapshot for the same date', () => {
    const history: EssentialHistoryDay[] = [{
      date: '2026-08-20',
      recordedAt: null,
      source: 'legacy-snapshot',
      entries: [{ essentialId: 'water', title: 'Wasser', targetCount: 3, completedCount: 0 }],
    }];
    const review = buildWeeklyReview(
      [], history, '2026-08-20', '2026-08-20', 'Europe/Berlin',
      { date: '2026-08-20', essentials: [essential], progressById: { water: 3 } },
    );

    const today = review.essentialDays.find(day => day.date === '2026-08-20');
    assert.deepEqual(today, { date: '2026-08-20', source: 'live', completed: 1, total: 1 });
    assert.equal(review.migratedEssentialDays, 1);
  });
});
