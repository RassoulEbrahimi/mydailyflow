# P2-5 — Focus Sessions

## Product contract

A focus session is an interruption-safe timer linked to exactly one Task. It is
an execution aid, not a second task-completion system:

- starting focus snapshots the Task ID and title;
- the user chooses 15, 25, 45 or 60 minutes;
- pause, resume, minimize and finish are explicit controls;
- finishing focus records elapsed time but never completes the Task;
- deleting or renaming the Task cannot corrupt an already recorded session;
- reloading or leaving the app does not reset a running or paused session.

The entry point is visible in the Task `⋯` menu and on the Today “Jetzt” card.
If a session already exists, another Focus action opens that session rather
than silently replacing it.

## Time model

Running time is derived from persisted timestamps rather than from interval
ticks. `elapsedMs` stores completed running segments; `activeStartedAt` stores
the beginning of the current segment. Rendering calculates:

```text
elapsed = elapsedMs + max(0, now - activeStartedAt)
```

This means a React remount, page reload or backgrounded tab cannot reset the
timer. A backwards wall-clock change is clamped and cannot subtract recorded
time. Pause folds the current segment into `elapsedMs`; resume starts a new
segment. Reaching the target changes the message but does not auto-finish.

## Storage and recovery

Focus uses an independent managed localStorage slice:

```text
myDailyFlowFocusState
{ version: 1, data: { activeSession, history } }
```

The slice uses the same defensive parse, quarantine and blocked-write path as
Tasks and Essentials. Invalid or unreadable focus data cannot overwrite the
other slices.

Backup schema is v3. It adds `focusState`; v1 and v2 backups remain accepted and
migrate to an empty focus state. Export pauses a running session at the export
instant in the file only. Import restores any active session paused, so time
cannot accrue while a backup file was outside the app. Merge keeps the current
active session, deduplicates history by session ID and adds older records.
Replace restores the imported snapshot with the same paused-active rule.
Import remains an atomic managed-key transaction with the existing recovery
snapshot and exact-byte rollback behaviour.

## Acceptance evidence

- Pure tests cover start, timestamp-derived recovery, clock rollback, pause,
  resume, finish, validation, history merge and backup pause semantics.
- Browser tests cover both themes using the production build: Task-menu entry,
  duration choice, reload recovery, minimized banner, pause, resume, finish,
  persisted history and the invariant that the linked Task remains incomplete.
- Existing backup export/import browser coverage now requires Backup v3 and the
  focus slice.
- Phase 1 gates remain required: lint, Node tests, full browser suite, build and
  `git diff --check`.

## Explicitly out of scope

- automatically completing a Task when the timer reaches zero;
- sound, vibration or background notification at target time;
- productivity scoring or inferred coaching;
- cloud synchronization or cross-device timer ownership;
- templates (P2-6) and real authentication (P2-8).
