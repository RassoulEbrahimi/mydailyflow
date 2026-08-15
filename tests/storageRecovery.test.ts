import assert from 'node:assert/strict';
import test from 'node:test';

import type { BackupFileV1 } from '../src/types/backup';
import type { DailyEssential } from '../src/types/essential';
import type { Task } from '../src/types/task';
import {
  MANAGED_KEYS,
  RECOVERY_PREFIX,
  STORAGE_KEYS,
  applyStorageTransaction,
  listRecoverySnapshots,
  loadEssentialsSlice,
  loadEssentialsStateSlice,
  loadTasksSlice,
  quarantineRawValue,
  serializeEssentials,
  serializeEssentialsState,
  serializeTasks,
} from '../src/utils/appStorage';
import type { StorageLike } from '../src/utils/appStorage';
import { buildBackup } from '../src/utils/backupFormat';
import { exportBackup, importBackup, readSnapshotStrict } from '../src/utils/backupService';

// ─── In-memory storage with failure injection ─────────────────────────────────

class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  /** Throws instead of writing when this returns true. */
  failWrite: (key: string, callIndex: number) => boolean = () => false;
  /** Silently drops the write when this returns true (simulates a lying quota). */
  swallowWrite: (key: string, callIndex: number) => boolean = () => false;
  /** Throws on read when this returns true. */
  failRead: (key: string, callIndex: number) => boolean = () => false;
  failRemove: (key: string) => boolean = () => false;
  /** Silently ignores the removal when this returns true. */
  swallowRemove: (key: string) => boolean = () => false;
  writeCount = 0;
  readCount = 0;

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    this.readCount += 1;
    if (this.failRead(key, this.readCount)) {
      throw new Error('SecurityError: read blocked');
    }
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.writeCount += 1;
    if (this.failWrite(key, this.writeCount)) {
      throw new Error('QuotaExceededError');
    }
    if (this.swallowWrite(key, this.writeCount)) return;
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failRemove(key)) throw new Error('SecurityError');
    if (this.swallowRemove(key)) return;
    this.map.delete(key);
  }

  /** Test helper: seed without going through the failure hooks. */
  seed(key: string, value: string): void {
    this.map.set(key, value);
  }

  snapshotOfAllKeys(): Record<string, string> {
    return Object.fromEntries(this.map.entries());
  }
}

// ─── Synthetic fixtures ───────────────────────────────────────────────────────

const NOW = '2026-01-02T10:00:00.000Z';
const TODAY = '2026-01-02';

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Sample task',
  time: '09:00',
  duration: '30m',
  timeBlock: 'morning',
  completed: false,
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

const makeBackup = (overrides: Partial<BackupFileV1> = {}): BackupFileV1 => ({
  ...buildBackup(
    {
      tasks: [makeTask({ id: 'imported-task' })],
      essentials: [makeEssential({ id: 'imported-essential', title: 'Imported essential' })],
      essentialsState: { date: TODAY, progressById: { 'imported-essential': 1 } },
      preferences: {
        theme: 'light',
        remindersEnabled: true,
        stickyHeroEnabled: false,
        essentialsCollapsed: true,
      },
    },
    NOW,
  ),
  ...overrides,
});

/** A storage populated with valid, synthetic app data. */
function seededStorage(): FakeStorage {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, serializeTasks([makeTask({ id: 'current-task' })]));
  storage.seed(STORAGE_KEYS.essentialsData, serializeEssentials([makeEssential({ id: 'current-essential', title: 'Current essential' })]));
  storage.seed(STORAGE_KEYS.essentialsState, serializeEssentialsState({ date: TODAY, progressById: { 'current-essential': 1 } }));
  storage.seed(STORAGE_KEYS.theme, 'dark');
  storage.seed(STORAGE_KEYS.remindersEnabled, 'false');
  storage.seed(STORAGE_KEYS.stickyHeroEnabled, 'true');
  storage.seed(STORAGE_KEYS.essentialsCollapsed, 'false');
  return storage;
}

const recoveryKeys = (storage: FakeStorage): string[] =>
  Object.keys(storage.snapshotOfAllKeys()).filter(k => k.startsWith(RECOVERY_PREFIX));

// ─── Quarantine ───────────────────────────────────────────────────────────────

test('a corrupted value is copied to a recovery key before the original is removed', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, '{ broken json');

  const result = quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(storage.getItem(result.recoveryKey), '{ broken json');
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), null);
});

test('the original survives when the recovery copy cannot be written', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, '{ broken json');
  storage.failWrite = key => key.startsWith(RECOVERY_PREFIX);

  const result = quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.match(result.reason, /^snapshot-write-failed/);
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), '{ broken json');
  assert.deepEqual(recoveryKeys(storage), []);
});

test('the original survives when the recovery copy cannot be verified', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, '{ broken json');
  storage.swallowWrite = key => key.startsWith(RECOVERY_PREFIX);

  const result = quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.reason, 'snapshot-verification-failed');
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), '{ broken json');
  assert.deepEqual(recoveryKeys(storage), []);
});

test('two failures in the same millisecond keep both recovery copies', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, 'first');
  quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);
  storage.seed(STORAGE_KEYS.tasks, 'second');
  quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);

  const values = recoveryKeys(storage).map(k => storage.getItem(k)).sort();
  assert.deepEqual(values, ['first', 'second']);
});

test('recovery snapshots can be listed, newest first, without being touched', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, 'older');
  quarantineRawValue(storage, STORAGE_KEYS.tasks, '2026-01-01T10:00:00.000Z');
  storage.seed(STORAGE_KEYS.tasks, 'newer');
  quarantineRawValue(storage, STORAGE_KEYS.tasks, '2026-01-02T10:00:00.000Z');

  const listed = listRecoverySnapshots(storage);

  assert.equal(listed.length, 2);
  assert.equal(listed[0].sourceKey, STORAGE_KEYS.tasks);
  assert.equal(storage.getItem(listed[0].key), 'newer');
  assert.equal(storage.getItem(listed[1].key), 'older');
});

// ─── Slice loading is independent per slice ───────────────────────────────────

test('unreadable tasks are quarantined and their writes blocked', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.tasks, 'not json at all');

  const result = loadTasksSlice(storage, NOW);

  assert.equal(result.status, 'quarantined');
  assert.equal(result.blocked, true);
  assert.equal(result.value, null);
  assert.equal(storage.getItem(result.recoveryKey!), 'not json at all');
});

test('a task slice that cannot be quarantined stays in place and stays blocked', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.tasks, 'not json at all');
  storage.failWrite = key => key.startsWith(RECOVERY_PREFIX);

  const result = loadTasksSlice(storage, NOW);

  assert.equal(result.status, 'quarantine-failed');
  assert.equal(result.blocked, true);
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), 'not json at all');
});

test('a corrupted slice does not block the other slices', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.essentialsData, '{{{');

  const tasks = loadTasksSlice(storage, NOW);
  const essentials = loadEssentialsSlice(storage, NOW);
  const state = loadEssentialsStateSlice(storage, NOW);

  assert.equal(essentials.blocked, true);
  assert.equal(tasks.blocked, false);
  assert.equal(tasks.status, 'ok');
  assert.equal(state.blocked, false);
  assert.equal(state.status, 'ok');
});

test('a corrupted daily state does not block the essentials definitions', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.essentialsState, JSON.stringify({ version: 1, data: { date: 'yesterday', progressById: {} } }));

  const essentials = loadEssentialsSlice(storage, NOW);
  const state = loadEssentialsStateSlice(storage, NOW);

  assert.equal(state.status, 'quarantined');
  assert.equal(state.blocked, true);
  assert.equal(essentials.blocked, false);
  assert.equal(essentials.status, 'ok');
});

test('a valid legacy array still migrates without being quarantined', () => {
  const storage = new FakeStorage();
  const legacy = JSON.stringify([makeTask({ id: 'legacy-task' })]);
  storage.seed(STORAGE_KEYS.tasks, legacy);

  const result = loadTasksSlice(storage, NOW);

  assert.equal(result.status, 'migrated');
  assert.equal(result.blocked, false);
  assert.equal(result.value!.length, 1);
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), legacy);
  assert.deepEqual(recoveryKeys(storage), []);
});

test('a legacy essentials array still migrates without being quarantined', () => {
  const storage = new FakeStorage();
  const legacy = JSON.stringify([makeEssential({ id: 'legacy-essential' })]);
  storage.seed(STORAGE_KEYS.essentialsData, legacy);

  const result = loadEssentialsSlice(storage, NOW);

  assert.equal(result.status, 'migrated');
  assert.equal(result.blocked, false);
  assert.deepEqual(recoveryKeys(storage), []);
});

test('an empty slice is neither quarantined nor blocked', () => {
  const storage = new FakeStorage();

  const result = loadTasksSlice(storage, NOW);

  assert.equal(result.status, 'empty');
  assert.equal(result.blocked, false);
  assert.equal(result.value, null);
});

// ─── All-or-nothing writes ────────────────────────────────────────────────────

test('a transaction that fails on the second write restores every key', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.seed('k2', 'two');
  storage.seed('k3', 'three');
  const before = storage.snapshotOfAllKeys();
  storage.failWrite = key => key === 'k2';

  const result = applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: 'TWO' },
    { key: 'k3', value: 'THREE' },
  ]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.failedKey, 'k2');
  assert.equal(result.restored, true);
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
});

test('a transaction that silently loses the third write restores every key', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.seed('k2', 'two');
  storage.seed('k3', 'three');
  const before = storage.snapshotOfAllKeys();
  storage.swallowWrite = key => key === 'k3';

  const result = applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: 'TWO' },
    { key: 'k3', value: 'THREE' },
  ]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.error, 'verification-failed');
  assert.equal(result.failedKey, 'k3');
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
});

test('rollback restores absence, not just previous content', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.failWrite = key => key === 'k2';

  applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: 'TWO' },
  ]);

  assert.equal(storage.getItem('k1'), 'one');
  assert.equal(storage.getItem('k2'), null);
});

test('a rollback that cannot restore a key reports itself as incomplete', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.seed('k2', 'two');
  // k1 is overwritten successfully, then k2 fails, then restoring k1 also fails.
  storage.failWrite = (key, callIndex) => (key === 'k2' && callIndex === 2) || (key === 'k1' && callIndex === 3);

  const result = applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: 'TWO' },
  ]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.restored, false);
  assert.equal(storage.getItem('k1'), 'ONE');
  assert.equal(storage.getItem('k2'), 'two');
});

test('a fully successful transaction writes every key', () => {
  const storage = new FakeStorage();

  const result = applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: null },
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(storage.getItem('k1'), 'ONE');
  assert.equal(storage.getItem('k2'), null);
});

// ─── Export ───────────────────────────────────────────────────────────────────

test('export produces a valid file from stored data', () => {
  const storage = seededStorage();

  const result = exportBackup(storage, TODAY, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.taskCount, 1);
  assert.equal(result.essentialCount, 1);
  assert.equal(result.fileName, 'mydailyflow-backup-2026-01-02-1000.json');
  const parsed = JSON.parse(result.text);
  assert.equal(parsed.schemaVersion, 1);
  assert.deepEqual(parsed.preferences, {
    theme: 'dark',
    remindersEnabled: false,
    stickyHeroEnabled: true,
    essentialsCollapsed: false,
  });
});

test('export never includes the auth session, even when one is stored', () => {
  const storage = seededStorage();
  storage.seed('mdf_auth_session', JSON.stringify({ username: 'synthetic-user', expiresAt: 1 }));
  storage.seed('lastRolloverDate', TODAY);

  const result = exportBackup(storage, TODAY, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.text.includes('synthetic-user'), false);
  assert.equal(result.text.includes('mdf_auth_session'), false);
  assert.equal(result.text.includes('lastRolloverDate'), false);
});

test('stale daily progress is not exported as if it were today', () => {
  const storage = seededStorage();
  storage.seed(
    STORAGE_KEYS.essentialsState,
    serializeEssentialsState({ date: '2026-01-01', progressById: { 'current-essential': 2 } }),
  );

  const read = readSnapshotStrict(storage, TODAY);

  assert.equal(read.status, 'ok');
  if (read.status !== 'ok') return;
  assert.deepEqual(read.snapshot.essentialsState, { date: TODAY, progressById: {} });
});

// ─── Import ───────────────────────────────────────────────────────────────────

test('import preserves the exact current raw values in a recovery snapshot first', () => {
  const storage = seededStorage();
  const before = {
    tasks: storage.getItem(STORAGE_KEYS.tasks),
    essentials: storage.getItem(STORAGE_KEYS.essentialsData),
    state: storage.getItem(STORAGE_KEYS.essentialsState),
    theme: storage.getItem(STORAGE_KEYS.theme),
  };

  const result = importBackup(storage, makeBackup(), 'merge', TODAY, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  const snapshot = JSON.parse(storage.getItem(result.recoveryKey)!);
  assert.equal(snapshot.capturedAt, NOW);
  assert.equal(snapshot.raw[STORAGE_KEYS.tasks], before.tasks);
  assert.equal(snapshot.raw[STORAGE_KEYS.essentialsData], before.essentials);
  assert.equal(snapshot.raw[STORAGE_KEYS.essentialsState], before.state);
  assert.equal(snapshot.raw[STORAGE_KEYS.theme], before.theme);
});

test('import is abandoned when the recovery snapshot cannot be written', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  storage.failWrite = key => key.startsWith(RECOVERY_PREFIX);

  const result = importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.stage, 'snapshot');
  assert.equal(result.rolledBack, true);
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
});

test('merge import adds the backup data and keeps the current data intact', () => {
  const storage = seededStorage();

  const result = importBackup(storage, makeBackup(), 'merge', TODAY, NOW);

  assert.equal(result.status, 'ok');
  const tasks = JSON.parse(storage.getItem(STORAGE_KEYS.tasks)!);
  assert.deepEqual(tasks.data.map((t: Task) => t.id), ['current-task', 'imported-task']);
  const essentials = JSON.parse(storage.getItem(STORAGE_KEYS.essentialsData)!);
  assert.deepEqual(essentials.data.map((e: DailyEssential) => e.id), ['current-essential', 'imported-essential']);
  // Merge leaves preferences alone.
  assert.equal(storage.getItem(STORAGE_KEYS.theme), 'dark');
  assert.equal(storage.getItem(STORAGE_KEYS.essentialsCollapsed), 'false');
});

test('replace import swaps the data and the preferences', () => {
  const storage = seededStorage();

  const result = importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(result.status, 'ok');
  const tasks = JSON.parse(storage.getItem(STORAGE_KEYS.tasks)!);
  assert.deepEqual(tasks.data.map((t: Task) => t.id), ['imported-task']);
  assert.equal(storage.getItem(STORAGE_KEYS.theme), 'light');
  assert.equal(storage.getItem(STORAGE_KEYS.remindersEnabled), 'true');
  assert.equal(storage.getItem(STORAGE_KEYS.stickyHeroEnabled), 'false');
  assert.equal(storage.getItem(STORAGE_KEYS.essentialsCollapsed), 'true');
});

test('import resets imported progress recorded on an earlier day', () => {
  const storage = seededStorage();
  const backup = makeBackup({
    essentialsState: { date: '2026-01-01', progressById: { 'imported-essential': 5 } },
  });

  importBackup(storage, backup, 'replace', TODAY, NOW);

  const state = JSON.parse(storage.getItem(STORAGE_KEYS.essentialsState)!);
  assert.deepEqual(state.data, { date: TODAY, progressById: {} });
});

test('a failed write in the middle of an import restores every affected key', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  // Fail the second key of the transaction.
  storage.failWrite = key => key === STORAGE_KEYS.essentialsData;

  const result = importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.stage, 'write');
  assert.equal(result.rolledBack, true);

  for (const key of Object.keys(before)) {
    assert.equal(storage.getItem(key), before[key], `key ${key} was not restored exactly`);
  }
});

test('a silently dropped write on the third key restores every affected key', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  storage.swallowWrite = key => key === STORAGE_KEYS.essentialsState;

  const result = importBackup(storage, makeBackup(), 'merge', TODAY, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.rolledBack, true);
  for (const key of Object.keys(before)) {
    assert.equal(storage.getItem(key), before[key], `key ${key} was not restored exactly`);
  }
});

test('a failed import leaves the recovery snapshot in place for the user', () => {
  const storage = seededStorage();
  storage.failWrite = key => key === STORAGE_KEYS.theme;

  importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  const snapshots = listRecoverySnapshots(storage);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].sourceKey, 'preimport');
});

test('import never writes the auth session key', () => {
  const storage = seededStorage();
  const session = JSON.stringify({ username: 'synthetic-user', expiresAt: 1 });
  storage.seed('mdf_auth_session', session);

  const result = importBackup(
    storage,
    // Even a hand-edited file carrying a session cannot introduce one: the
    // validated backup type has no field for it.
    makeBackup(),
    'replace',
    TODAY,
    NOW,
  );

  assert.equal(result.status, 'ok');
  assert.equal(storage.getItem('mdf_auth_session'), session);
});

test('import does not resurrect the derived lastRolloverDate key', () => {
  const storage = seededStorage();

  importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(storage.getItem('lastRolloverDate'), null);
});

// ─── Regressions: export must be strictly read-only ───────────────────────────

test('export with corrupted current tasks fails and changes no key', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.tasks, '{ corrupted task blob');
  const before = storage.snapshotOfAllKeys();

  const result = exportBackup(storage, TODAY, NOW);

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  // No file is produced…
  assert.equal('text' in result, false);
  assert.equal(result.errors.some(e => e.startsWith('invalid-tasks')), true);
  // …and nothing was written, removed or quarantined.
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), '{ corrupted task blob');
  assert.deepEqual(recoveryKeys(storage), []);
  assert.equal(storage.writeCount, 0);
});

test('export with corrupted essentials or daily state fails without mutating', () => {
  for (const key of [STORAGE_KEYS.essentialsData, STORAGE_KEYS.essentialsState]) {
    const storage = seededStorage();
    storage.seed(key, '{{{ not json');
    const before = storage.snapshotOfAllKeys();

    const result = exportBackup(storage, TODAY, NOW);

    assert.equal(result.status, 'invalid', `expected ${key} to fail the export`);
    assert.deepEqual(storage.snapshotOfAllKeys(), before);
    assert.equal(storage.writeCount, 0);
  }
});

test('export fails without mutating when a key cannot be read', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  storage.failRead = key => key === STORAGE_KEYS.essentialsData;

  const result = exportBackup(storage, TODAY, NOW);

  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.errors.some(e => e.startsWith('capture-read-failed')), true);
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
  assert.equal(storage.writeCount, 0);
});

test('an unrecognised preference value does not fail an otherwise valid export', () => {
  const storage = seededStorage();
  storage.seed(STORAGE_KEYS.theme, 'neon');

  const result = exportBackup(storage, TODAY, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(JSON.parse(result.text).preferences.theme, 'dark');
  assert.equal(storage.getItem(STORAGE_KEYS.theme), 'neon'); // untouched
  assert.equal(storage.writeCount, 0);
});

// ─── Regressions: rollback baseline is the true pre-import state ──────────────

test('a failed import restores a corrupted task value that was there before', () => {
  const storage = seededStorage();
  const corrupted = '{ corrupted raw value the user may still want';
  storage.seed(STORAGE_KEYS.tasks, corrupted);
  const before = storage.snapshotOfAllKeys();
  // Fail the third managed write, well after the corrupted slice was read.
  storage.failWrite = key => key === STORAGE_KEYS.essentialsState;

  const result = importBackup(storage, makeBackup(), 'merge', TODAY, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.stage, 'write');
  assert.equal(result.rolledBack, true);

  // The corrupted original is back, byte for byte, and so is every other key.
  assert.equal(storage.getItem(STORAGE_KEYS.tasks), corrupted);
  for (const key of MANAGED_KEYS) {
    assert.equal(storage.getItem(key), before[key] ?? null, `key ${key} was not restored exactly`);
  }
});

test('the pre-import snapshot records the corrupted raw value, not an empty slice', () => {
  const storage = seededStorage();
  const corrupted = '{ corrupted raw value';
  storage.seed(STORAGE_KEYS.tasks, corrupted);

  const result = importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  const snapshot = JSON.parse(storage.getItem(result.recoveryKey)!);
  assert.equal(snapshot.raw[STORAGE_KEYS.tasks], corrupted);
});

test('import aborts before any write when a managed key cannot be read', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  storage.failRead = key => key === STORAGE_KEYS.essentialsState;

  const result = importBackup(storage, makeBackup(), 'replace', TODAY, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.stage, 'capture');
  assert.equal(result.rolledBack, true);
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
  assert.equal(storage.writeCount, 0);
  assert.deepEqual(recoveryKeys(storage), []);
});

test('two pre-import snapshots sharing a timestamp do not overwrite each other', () => {
  const storage = seededStorage();
  const originalTasks = storage.getItem(STORAGE_KEYS.tasks);

  const first = importBackup(storage, makeBackup(), 'merge', TODAY, NOW);
  const second = importBackup(storage, makeBackup({ tasks: [makeTask({ id: 'second-import' })] }), 'merge', TODAY, NOW);

  assert.equal(first.status, 'ok');
  assert.equal(second.status, 'ok');
  if (first.status !== 'ok' || second.status !== 'ok') return;
  assert.notEqual(first.recoveryKey, second.recoveryKey);

  const preimport = listRecoverySnapshots(storage).filter(s => s.sourceKey === 'preimport');
  assert.equal(preimport.length, 2);

  // The older snapshot still holds the state from before the first import.
  const firstSnapshot = JSON.parse(storage.getItem(first.recoveryKey)!);
  assert.equal(firstSnapshot.raw[STORAGE_KEYS.tasks], originalTasks);
});

// ─── Regressions: a thrown read is never a successful read ────────────────────

test('a thrown read during transaction capture fails before any write', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.seed('k2', 'two');
  storage.failRead = key => key === 'k2';

  const result = applyStorageTransaction(storage, [
    { key: 'k1', value: 'ONE' },
    { key: 'k2', value: 'TWO' },
  ]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.match(result.error, /^capture-read-failed/);
  assert.equal(result.failedKey, 'k2');
  assert.equal(result.restored, true); // nothing was written, so nothing to undo
  assert.equal(storage.writeCount, 0);
  assert.deepEqual(storage.snapshotOfAllKeys(), { k1: 'one', k2: 'two' });
});

test('a thrown read during verification is never reported as success', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  // The capture read succeeds; every read after it throws.
  storage.failRead = (_key, callIndex) => callIndex >= 2;

  const result = applyStorageTransaction(storage, [{ key: 'k1', value: 'ONE' }]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.error, 'verification-failed');
  assert.equal(result.failedKey, 'k1');
  // The rollback write was still attempted, but could not be confirmed.
  assert.equal(result.restored, false);
  assert.equal(storage.snapshotOfAllKeys().k1, 'one');
});

test('a removal cannot verify merely because the read threw', () => {
  const storage = new FakeStorage();
  storage.seed('k1', 'one');
  storage.swallowRemove = () => true; // the removal silently does nothing
  storage.failRead = (_key, callIndex) => callIndex >= 2;

  const result = applyStorageTransaction(storage, [{ key: 'k1', value: null }]);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.equal(result.error, 'verification-failed');
  // The key is still present: a thrown read must not be mistaken for absence.
  assert.equal(storage.snapshotOfAllKeys().k1, 'one');
});

test('an unreadable slice is blocked without being written to', () => {
  const storage = seededStorage();
  const before = storage.snapshotOfAllKeys();
  storage.failRead = key => key === STORAGE_KEYS.tasks;

  const result = loadTasksSlice(storage, NOW);

  assert.equal(result.status, 'unreadable');
  assert.equal(result.blocked, true);
  assert.equal(result.value, null);
  assert.deepEqual(storage.snapshotOfAllKeys(), before);
  assert.equal(storage.writeCount, 0);
});

test('a value that cannot be read is never quarantined away', () => {
  const storage = new FakeStorage();
  storage.seed(STORAGE_KEYS.tasks, 'irreplaceable');
  storage.failRead = key => key === STORAGE_KEYS.tasks;

  const result = quarantineRawValue(storage, STORAGE_KEYS.tasks, NOW);

  assert.equal(result.status, 'failed');
  if (result.status !== 'failed') return;
  assert.match(result.reason, /^source-read-failed/);
  assert.equal(storage.snapshotOfAllKeys()[STORAGE_KEYS.tasks], 'irreplaceable');
});
