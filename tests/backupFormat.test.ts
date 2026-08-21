import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppDataSnapshot, BackupFileV4 } from '../src/types/backup';
import { BACKUP_SCHEMA_VERSION, validateBackupObject } from '../src/types/backup';
import type { DailyEssential } from '../src/types/essential';
import {
  isValidEssentialArray,
  isValidEssentialState,
  isValidDateString,
} from '../src/types/essential';
import type { Task } from '../src/types/task';
import {
  backupFileName,
  buildBackup,
  parseBackupText,
  serializeBackup,
  summarizeBackup,
  validateSnapshot,
} from '../src/utils/backupFormat';
import {
  applyBackup,
  mergeEssentials,
  mergeTasks,
  normalizeEssentialTitle,
  resolveImportedDailyState,
} from '../src/utils/backupMerge';

// ─── Synthetic fixtures ───────────────────────────────────────────────────────
// Deliberately generic placeholder content only — no real user data.

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Sample task',
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

const makeEssential = (overrides: Partial<DailyEssential> = {}): DailyEssential => ({
  id: 'essential-1',
  title: 'Sample essential',
  targetCount: 2,
  order: 0,
  createdAt: '2026-01-01T08:00:00.000Z',
  ...overrides,
});

const makeSnapshot = (overrides: Partial<AppDataSnapshot> = {}): AppDataSnapshot => ({
  tasks: [makeTask()],
  essentials: [makeEssential()],
  essentialsState: { date: '2026-01-01', progressById: { 'essential-1': 1 } },
  essentialHistory: [],
  focusState: { activeSession: null, history: [] },
  templates: [],
  preferences: {
    theme: 'dark',
    remindersEnabled: true,
    stickyHeroEnabled: false,
    essentialsCollapsed: false,
  },
  ...overrides,
});

const makeBackup = (overrides: Partial<BackupFileV4> = {}): BackupFileV4 => ({
  ...buildBackup(makeSnapshot(), '2026-01-01T10:00:00.000Z'),
  ...overrides,
});

// ─── Export format ────────────────────────────────────────────────────────────

test('a built backup carries the schema version, timestamp and every data section', () => {
  const backup = buildBackup(makeSnapshot(), '2026-01-01T10:00:00.000Z');

  assert.equal(backup.app, 'mydailyflow');
  assert.equal(backup.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.exportedAt, '2026-01-01T10:00:00.000Z');
  assert.equal(backup.tasks.length, 1);
  assert.equal(backup.essentials.length, 1);
  assert.deepEqual(backup.essentialsState, { date: '2026-01-01', progressById: { 'essential-1': 1 } });
  assert.deepEqual(backup.essentialHistory, []);
  assert.deepEqual(backup.templates, []);
  assert.deepEqual(backup.preferences, {
    theme: 'dark',
    remindersEnabled: true,
    stickyHeroEnabled: false,
    essentialsCollapsed: false,
  });
});

test('a serialized backup survives a full round trip', () => {
  const backup = buildBackup(makeSnapshot(), '2026-01-01T10:00:00.000Z');
  const parsed = parseBackupText(serializeBackup(backup));

  assert.equal(parsed.status, 'valid');
  if (parsed.status !== 'valid') return;
  assert.deepEqual(parsed.value, backup);
});

test('a v3 backup migrates to v4 with an empty template slice', () => {
  const current = buildBackup(makeSnapshot(), '2026-01-01T10:00:00.000Z');
  const { templates: _templates, ...legacy } = current;
  const parsed = validateBackupObject({ ...legacy, schemaVersion: 3 });
  assert.equal(parsed.status, 'valid');
  if (parsed.status !== 'valid') return;
  assert.equal(parsed.value.schemaVersion, 4);
  assert.deepEqual(parsed.value.templates, []);
});

test('v4 validates and round-trips task templates', () => {
  const snapshot = makeSnapshot({
    templates: [{
      id: 'template-1',
      name: 'Morning routine',
      kind: 'routine',
      createdAt: '2026-01-01T09:00:00.000Z',
      items: [
        { dayOffset: 0, title: 'Read', time: '08:00', duration: '30m', timeBlock: 'morning', priority: 'medium', recurrence: 'none', reminderEnabled: true, checklistItems: [{ text: 'Chapter one' }] },
        { dayOffset: 0, title: 'Plan', time: '', duration: '15m', timeBlock: 'evening', priority: 'low', recurrence: 'none', reminderEnabled: false },
      ],
    }],
  });
  const backup = buildBackup(snapshot, '2026-01-01T10:00:00.000Z');
  const parsed = parseBackupText(serializeBackup(backup));
  assert.equal(parsed.status, 'valid');
  if (parsed.status !== 'valid') return;
  assert.deepEqual(parsed.value.templates, snapshot.templates);
});

test('the exported file name is derived from the export timestamp', () => {
  assert.equal(backupFileName('2026-01-01T10:04:05.000Z'), 'mydailyflow-backup-2026-01-01-1004.json');
});

test('a backup never contains authentication or session data', () => {
  // A snapshot cannot even express session data, and hand-injected fields are
  // dropped by validation rather than carried into the app.
  const backup = buildBackup(makeSnapshot(), '2026-01-01T10:00:00.000Z');
  const text = serializeBackup(backup);

  assert.equal(text.includes('mdf_auth_session'), false);
  assert.equal(text.includes('expiresAt'), false);
  assert.equal(Object.keys(backup).includes('session'), false);

  const smuggled = {
    ...backup,
    mdf_auth_session: '{"username":"synthetic","expiresAt":1}',
    session: { username: 'synthetic' },
  };
  const parsed = validateBackupObject(smuggled);
  assert.equal(parsed.status, 'valid');
  if (parsed.status !== 'valid') return;
  assert.deepEqual(Object.keys(parsed.value).sort(), [
    'app', 'essentialHistory', 'essentials', 'essentialsState', 'exportedAt', 'focusState', 'preferences', 'schemaVersion', 'tasks', 'templates',
  ]);
});

test('the current data is validated before it can be exported', () => {
  const invalid = makeSnapshot({
    essentials: [makeEssential({ targetCount: 0 })],
  });
  const result = validateSnapshot(invalid);

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.deepEqual(result.errors, ['invalid-essentials']);
});

test('snapshot validation covers preferences, not only tasks and essentials', () => {
  const result = validateSnapshot(
    makeSnapshot({ preferences: { theme: 'neon' } as never }),
  );

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.deepEqual(result.errors, ['invalid-preferences']);
});

test('the preview summarizes task and essential counts', () => {
  const summary = summarizeBackup(makeBackup());

  assert.equal(summary.taskCount, 1);
  assert.equal(summary.essentialCount, 1);
  assert.equal(summary.progressEntryCount, 1);
  assert.equal(summary.progressDate, '2026-01-01');
  assert.equal(summary.historyDayCount, 0);
  assert.equal(summary.focusSessionCount, 0);
});

// ─── Rejecting bad files ──────────────────────────────────────────────────────

test('invalid JSON is rejected with a distinct error', () => {
  const result = parseBackupText('{ "app": "mydailyflow", ');

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /^invalid-json:/);
});

test('a JSON file that is not a backup object is rejected', () => {
  const result = parseBackupText('[1, 2, 3]');

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.deepEqual(result.errors, ['not-an-object']);
});

test('a newer schema version is rejected rather than guessed at', () => {
  const result = validateBackupObject({ ...makeBackup(), schemaVersion: 5 });

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.errors.some(e => e.startsWith('unsupported-schema-version')), true);
});

test('a missing schema version is rejected', () => {
  const { schemaVersion: _dropped, ...withoutVersion } = makeBackup();
  const result = validateBackupObject(withoutVersion);

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.errors.includes('missing-schema-version'), true);
});

test('a backup from another app is rejected', () => {
  const result = validateBackupObject({ ...makeBackup(), app: 'someotherapp' });

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.errors.some(e => e.startsWith('unknown-app')), true);
});

test('a partially invalid backup is rejected as a whole, never applied in part', () => {
  const result = validateBackupObject({
    ...makeBackup(),
    tasks: [makeTask({ id: 'task-1' }), { ...makeTask({ id: 'task-2' }), priority: 'urgent' }],
    essentials: [makeEssential()],
  });

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  // The valid half is reported nowhere: there is no partial value to apply.
  assert.deepEqual(result.errors, ['invalid-tasks']);
  assert.equal('value' in result, false);
});

test('every problem in a broken backup is reported at once', () => {
  const result = validateBackupObject({
    app: 'mydailyflow',
    schemaVersion: 1,
    exportedAt: 'not-a-date',
    tasks: 'nope',
    essentials: [makeEssential({ order: -1 })],
    essentialsState: { date: '2026-02-30', progressById: {} },
    preferences: { theme: 'neon', remindersEnabled: true, stickyHeroEnabled: true, essentialsCollapsed: false },
  });

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.deepEqual(result.errors, [
    'invalid-exported-at',
    'invalid-tasks',
    'invalid-essentials',
    'invalid-essentials-state',
    'invalid-preferences',
  ]);
});

// ─── Strengthened runtime validation ──────────────────────────────────────────

test('essential target counts must be positive integers', () => {
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: 1 })]), true);
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: 0 })]), false);
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: -2 })]), false);
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: 1.5 })]), false);
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: Number.NaN })]), false);
  assert.equal(isValidEssentialArray([makeEssential({ targetCount: Number.POSITIVE_INFINITY })]), false);
});

test('essential order must be a non-negative integer', () => {
  assert.equal(isValidEssentialArray([makeEssential({ order: 0 })]), true);
  assert.equal(isValidEssentialArray([makeEssential({ order: -1 })]), false);
  assert.equal(isValidEssentialArray([makeEssential({ order: 2.5 })]), false);
});

test('progress values must be finite, non-negative whole numbers', () => {
  assert.equal(isValidEssentialState({ date: '2026-01-01', progressById: { a: 0, b: 3 } }), true);
  assert.equal(isValidEssentialState({ date: '2026-01-01', progressById: { a: -1 } }), false);
  assert.equal(isValidEssentialState({ date: '2026-01-01', progressById: { a: 1.5 } }), false);
  assert.equal(isValidEssentialState({ date: '2026-01-01', progressById: { a: Number.NaN } }), false);
  assert.equal(isValidEssentialState({ date: '2026-01-01', progressById: { a: '2' } }), false);
});

test('the state date must be a real calendar date', () => {
  assert.equal(isValidDateString('2026-01-01'), true);
  assert.equal(isValidDateString('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(isValidDateString('2024-02-29'), true);
  assert.equal(isValidDateString('2026-13-01'), false);
  assert.equal(isValidDateString('2026-1-1'), false);
  assert.equal(isValidDateString('01.01.2026'), false);
  assert.equal(isValidEssentialState({ date: '2026-02-30', progressById: {} }), false);
});

// ─── Merge behaviour ──────────────────────────────────────────────────────────

test('tasks are deduplicated by ID and current versions are never overwritten', () => {
  const current = [makeTask({ id: 'a', title: 'Current title' }), makeTask({ id: 'b' })];
  const incoming = [makeTask({ id: 'a', title: 'Backup title' }), makeTask({ id: 'c' })];

  const merged = mergeTasks(current, incoming);

  assert.deepEqual(merged.map(t => t.id), ['a', 'b', 'c']);
  assert.equal(merged[0].title, 'Current title');
});

test('a task appearing twice inside one backup is added only once', () => {
  const merged = mergeTasks([], [makeTask({ id: 'a' }), makeTask({ id: 'a', title: 'Duplicate' })]);

  assert.deepEqual(merged.map(t => t.id), ['a']);
  assert.equal(merged[0].title, 'Sample task');
});

test('essential titles are normalized for comparison only', () => {
  assert.equal(normalizeEssentialTitle('  Sample   Essential '), 'sample essential');
  assert.equal(normalizeEssentialTitle('SAMPLE ESSENTIAL'), normalizeEssentialTitle('sample essential'));
});

test('essentials are deduplicated by ID and by normalized title', () => {
  const current = [makeEssential({ id: 'e1', title: 'Item One', order: 0 })];
  const incoming = [
    makeEssential({ id: 'e1', title: 'Renamed but same id', order: 0 }),
    makeEssential({ id: 'e2', title: '  item   one  ', order: 1 }),
    makeEssential({ id: 'e3', title: 'Item Two', order: 2 }),
  ];

  const merged = mergeEssentials(current, incoming);

  assert.deepEqual(merged.map(e => e.id), ['e1', 'e3']);
  assert.equal(merged[0].title, 'Item One');
});

test('merged essentials get a stable, collision-free order', () => {
  const current = [
    makeEssential({ id: 'e2', title: 'Second', order: 5 }),
    makeEssential({ id: 'e1', title: 'First', order: 1 }),
  ];
  const incoming = [
    makeEssential({ id: 'e4', title: 'Fourth', order: 0 }),
    makeEssential({ id: 'e3', title: 'Third', order: 0 }),
  ];

  const merged = mergeEssentials(current, incoming);

  assert.deepEqual(merged.map(e => e.id), ['e1', 'e2', 'e4', 'e3']);
  assert.deepEqual(merged.map(e => e.order), [0, 1, 2, 3]);
});

test('imported daily progress from another day resets to zero', () => {
  const resolved = resolveImportedDailyState(
    { date: '2026-01-01', progressById: { 'essential-1': 3 } },
    '2026-01-02',
  );

  assert.deepEqual(resolved, { date: '2026-01-02', progressById: {} });
});

test('imported daily progress from today is kept', () => {
  const resolved = resolveImportedDailyState(
    { date: '2026-01-02', progressById: { 'essential-1': 3 } },
    '2026-01-02',
  );

  assert.deepEqual(resolved, { date: '2026-01-02', progressById: { 'essential-1': 3 } });
});

test('merge adds without overwriting tasks, essentials, progress or preferences', () => {
  const current = makeSnapshot({
    tasks: [makeTask({ id: 'a', title: 'Current' })],
    essentials: [makeEssential({ id: 'e1', title: 'Kept', order: 0 })],
    essentialsState: { date: '2026-01-02', progressById: { e1: 2 } },
    preferences: { theme: 'light', remindersEnabled: false, stickyHeroEnabled: true, essentialsCollapsed: true },
  });
  const backup = makeBackup({
    tasks: [makeTask({ id: 'a', title: 'From backup' }), makeTask({ id: 'b' })],
    essentials: [makeEssential({ id: 'e2', title: 'Added', order: 0 })],
    essentialsState: { date: '2026-01-02', progressById: { e1: 9, e2: 1 } },
    preferences: { theme: 'dark', remindersEnabled: true, stickyHeroEnabled: false, essentialsCollapsed: false },
  });

  const result = applyBackup(current, backup, 'merge', '2026-01-02');

  assert.deepEqual(result.tasks.map(t => t.id), ['a', 'b']);
  assert.equal(result.tasks[0].title, 'Current');
  assert.deepEqual(result.essentials.map(e => e.id), ['e1', 'e2']);
  assert.deepEqual(result.essentialsState, { date: '2026-01-02', progressById: { e1: 2, e2: 1 } });
  assert.deepEqual(result.preferences, current.preferences);
});

test('merge preserves current Essential history on date conflicts and adds new days', () => {
  const current = makeSnapshot({
    essentialHistory: [{
      date: '2026-01-01', recordedAt: '2026-01-02T00:00:00.000Z', source: 'daily-close',
      entries: [{ essentialId: 'e1', title: 'Current', targetCount: 1, completedCount: 1 }],
    }],
  });
  const backup = makeBackup({
    essentialHistory: [
      {
        date: '2026-01-01', recordedAt: '2026-01-02T01:00:00.000Z', source: 'daily-close',
        entries: [{ essentialId: 'e1', title: 'Incoming conflict', targetCount: 1, completedCount: 0 }],
      },
      {
        date: '2026-01-02', recordedAt: '2026-01-03T00:00:00.000Z', source: 'daily-close',
        entries: [{ essentialId: 'e2', title: 'Incoming day', targetCount: 2, completedCount: 1 }],
      },
    ],
  });

  const result = applyBackup(current, backup, 'merge', '2026-01-02');
  assert.deepEqual(result.essentialHistory.map(day => day.date), ['2026-01-01', '2026-01-02']);
  assert.equal(result.essentialHistory[0].entries[0].title, 'Current');
  assert.equal(result.essentialHistory[1].entries[0].title, 'Incoming day');
});

test('merge resets stale progress on both sides to zero', () => {
  const current = makeSnapshot({
    essentials: [makeEssential({ id: 'e1', title: 'Kept' })],
    essentialsState: { date: '2026-01-01', progressById: { e1: 4 } },
  });
  const backup = makeBackup({
    essentials: [makeEssential({ id: 'e2', title: 'Added' })],
    essentialsState: { date: '2025-12-31', progressById: { e2: 7 } },
  });

  const result = applyBackup(current, backup, 'merge', '2026-01-02');

  assert.deepEqual(result.essentialsState, { date: '2026-01-02', progressById: {} });
});

test('replace swaps in the backup contents and preferences', () => {
  const current = makeSnapshot({
    tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b' })],
    essentials: [makeEssential({ id: 'e1', title: 'Old', order: 0 })],
    essentialsState: { date: '2026-01-02', progressById: { e1: 2 } },
    preferences: { theme: 'light', remindersEnabled: false, stickyHeroEnabled: true, essentialsCollapsed: true },
  });
  const backup = makeBackup({
    tasks: [makeTask({ id: 'z', title: 'Only one' })],
    essentials: [
      makeEssential({ id: 'e9', title: 'New second', order: 7 }),
      makeEssential({ id: 'e8', title: 'New first', order: 3 }),
    ],
    essentialsState: { date: '2026-01-02', progressById: { e8: 1 } },
    preferences: { theme: 'dark', remindersEnabled: true, stickyHeroEnabled: false, essentialsCollapsed: false },
  });

  const result = applyBackup(current, backup, 'replace', '2026-01-02');

  assert.deepEqual(result.tasks.map(t => t.id), ['z']);
  assert.deepEqual(result.essentials.map(e => e.id), ['e8', 'e9']);
  assert.deepEqual(result.essentials.map(e => e.order), [0, 1]);
  assert.deepEqual(result.essentialsState, { date: '2026-01-02', progressById: { e8: 1 } });
  assert.deepEqual(result.preferences, backup.preferences);
});

test('replace restores an imported running focus session in a paused state', () => {
  const current = makeSnapshot();
  const backup = makeBackup({
    focusState: {
      activeSession: {
        id: 'focus-imported', taskId: 'task-1', taskTitle: 'Sample task',
        plannedDurationMinutes: 25, startedAt: '2026-01-01T09:00:00.000Z',
        activeStartedAt: '2026-01-01T09:05:00.000Z', elapsedMs: 300_000, status: 'running',
      },
      history: [],
    },
  });

  const result = applyBackup(current, backup, 'replace', '2026-01-02');
  assert.equal(result.focusState.activeSession?.status, 'paused');
  assert.equal(result.focusState.activeSession?.activeStartedAt, null);
  assert.equal(result.focusState.activeSession?.elapsedMs, 300_000);
});

test('replace with backup progress from another day starts today at zero', () => {
  const current = makeSnapshot({ essentialsState: { date: '2026-01-02', progressById: { e1: 2 } } });
  const backup = makeBackup({ essentialsState: { date: '2026-01-01', progressById: { e1: 5 } } });

  const result = applyBackup(current, backup, 'replace', '2026-01-02');

  assert.deepEqual(result.essentialsState, { date: '2026-01-02', progressById: {} });
});

test('applying a backup does not mutate the current snapshot or the backup', () => {
  const current = makeSnapshot({ tasks: [makeTask({ id: 'a' })] });
  const backup = makeBackup({ tasks: [makeTask({ id: 'b' })] });

  applyBackup(current, backup, 'merge', '2026-01-02');

  assert.deepEqual(current.tasks.map(t => t.id), ['a']);
  assert.deepEqual(backup.tasks.map(t => t.id), ['b']);
});
