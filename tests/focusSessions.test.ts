import assert from 'node:assert/strict';
import test from 'node:test';

import type { FocusState } from '../src/types/focus';
import { isValidFocusState } from '../src/types/focus';
import type { Task } from '../src/types/task';
import {
    finishFocusState,
    formatFocusClock,
    mergeFocusStates,
    pauseFocusForBackup,
    pauseFocusState,
    remainingFocusMs,
    resumeFocusState,
    runningElapsedMs,
    startFocusSession,
} from '../src/utils/focusSessions';

const task = (): Task => ({
    id: 'task-focus',
    title: 'Synthetic focus task',
    time: '09:00',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    completedAt: null,
    priority: 'medium',
    createdAt: '2026-08-21T06:00:00.000Z',
    date: '2026-08-21',
});

const started = (): FocusState => startFocusSession(
    task(),
    25,
    '2026-08-21T08:00:00.000Z',
    'focus-1',
);

test('a focus session snapshots task identity without mutating the task', () => {
    const source = task();
    const before = structuredClone(source);
    const state = startFocusSession(source, 25, '2026-08-21T08:00:00.000Z', 'focus-1');

    assert.deepEqual(source, before);
    assert.equal(source.completed, false);
    assert.equal(state.activeSession?.taskId, source.id);
    assert.equal(state.activeSession?.taskTitle, source.title);
    assert.equal(state.activeSession?.status, 'running');
    assert.equal(state.activeSession?.activeStartedAt, '2026-08-21T08:00:00.000Z');
});

test('running elapsed time is derived from persisted timestamps after a reload', () => {
    const session = started().activeSession!;
    assert.equal(runningElapsedMs(session, '2026-08-21T08:07:30.000Z'), 450_000);
    assert.equal(remainingFocusMs(session, '2026-08-21T08:07:30.000Z'), 1_050_000);
});

test('a backwards wall clock never subtracts persisted elapsed time', () => {
    const session = started().activeSession!;
    assert.equal(runningElapsedMs(session, '2026-08-21T07:59:00.000Z'), 0);
});

test('pause freezes elapsed time and resume starts a new measured segment', () => {
    const paused = pauseFocusState(started(), '2026-08-21T08:05:00.000Z');
    assert.equal(paused.activeSession?.status, 'paused');
    assert.equal(paused.activeSession?.activeStartedAt, null);
    assert.equal(paused.activeSession?.elapsedMs, 300_000);
    assert.equal(runningElapsedMs(paused.activeSession!, '2026-08-21T09:00:00.000Z'), 300_000);

    const resumed = resumeFocusState(paused, '2026-08-21T09:00:00.000Z');
    assert.equal(resumed.activeSession?.status, 'running');
    assert.equal(runningElapsedMs(resumed.activeSession!, '2026-08-21T09:02:00.000Z'), 420_000);
});

test('finishing records history but never completes the linked task', () => {
    const source = task();
    const state = startFocusSession(source, 25, '2026-08-21T08:00:00.000Z', 'focus-1');
    const finished = finishFocusState(state, '2026-08-21T08:12:00.000Z');

    assert.equal(finished.activeSession, null);
    assert.equal(finished.history.length, 1);
    assert.deepEqual(finished.history[0], {
        id: 'focus-1',
        taskId: source.id,
        taskTitle: source.title,
        plannedDurationMinutes: 25,
        startedAt: '2026-08-21T08:00:00.000Z',
        completedAt: '2026-08-21T08:12:00.000Z',
        elapsedMs: 720_000,
    });
    assert.equal(source.completed, false);
    assert.equal(source.completedAt, null);
});

test('backup pauses a running session at the export instant without mutating live state', () => {
    const live = started();
    const backup = pauseFocusForBackup(live, '2026-08-21T08:03:00.000Z');

    assert.equal(live.activeSession?.status, 'running');
    assert.equal(backup.activeSession?.status, 'paused');
    assert.equal(backup.activeSession?.elapsedMs, 180_000);
    assert.equal(backup.activeSession?.activeStartedAt, null);
});

test('merge keeps the current active session and deduplicates history by id', () => {
    const current = finishFocusState(started(), '2026-08-21T08:10:00.000Z');
    const currentWithActive: FocusState = {
        ...startFocusSession(task(), 15, '2026-08-21T10:00:00.000Z', 'focus-live'),
        history: current.history,
    };
    const imported: FocusState = {
        activeSession: startFocusSession(task(), 45, '2026-08-21T11:00:00.000Z', 'focus-import').activeSession,
        history: [
            current.history[0],
            {
                ...current.history[0],
                id: 'focus-older',
                completedAt: '2026-08-20T08:10:00.000Z',
            },
        ],
    };

    const merged = mergeFocusStates(currentWithActive, imported);
    assert.equal(merged.activeSession?.id, 'focus-live');
    assert.deepEqual(merged.history.map(entry => entry.id), ['focus-1', 'focus-older']);
});

test('an imported active session is restored paused when no local session exists', () => {
    const merged = mergeFocusStates(
        { activeSession: null, history: [] },
        started(),
    );
    assert.equal(merged.activeSession?.status, 'paused');
    assert.equal(merged.activeSession?.activeStartedAt, null);
});

test('merge never creates a duplicate between active state and completed history', () => {
    const completed = finishFocusState(started(), '2026-08-21T08:10:00.000Z').history[0];
    const incomingActive = started().activeSession!;
    const localCompletionWins = mergeFocusStates(
        { activeSession: null, history: [completed] },
        { activeSession: incomingActive, history: [] },
    );
    assert.equal(localCompletionWins.activeSession, null);
    assert.deepEqual(localCompletionWins.history.map(entry => entry.id), ['focus-1']);
    assert.equal(isValidFocusState(localCompletionWins), true);

    const localActiveWins = mergeFocusStates(
        started(),
        { activeSession: null, history: [completed] },
    );
    assert.equal(localActiveWins.activeSession?.id, 'focus-1');
    assert.deepEqual(localActiveWins.history, []);
    assert.equal(isValidFocusState(localActiveWins), true);
});

test('focus validation rejects inconsistent states and duplicate identities', () => {
    assert.equal(isValidFocusState(started()), true);
    assert.equal(isValidFocusState({
        ...started(),
        activeSession: { ...started().activeSession!, status: 'paused', activeStartedAt: '2026-08-21T08:00:00.000Z' },
    }), false);
    const finished = finishFocusState(started(), '2026-08-21T08:10:00.000Z');
    assert.equal(isValidFocusState({
        activeSession: started().activeSession,
        history: finished.history,
    }), false);
    assert.equal(isValidFocusState({
        activeSession: { ...started().activeSession!, activeStartedAt: '2026-08-21T07:59:00.000Z' },
        history: [],
    }), false);
    assert.equal(isValidFocusState({
        activeSession: null,
        history: [{ ...finished.history[0], completedAt: '2026-08-21T07:59:00.000Z' }],
    }), false);
});

test('focus clocks are stable and clamp negative values', () => {
    assert.equal(formatFocusClock(0), '00:00');
    assert.equal(formatFocusClock(65_999), '01:05');
    assert.equal(formatFocusClock(-1), '00:00');
});
