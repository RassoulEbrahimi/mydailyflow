# ADR 0002 — Phase 2 history model and Backup v2 migration

- **Status:** Accepted for Phase 2 implementation
- **Date:** 2026-08-20
- **Scope:** Data history, local migration, backup compatibility and rollback
- **Production change in this ADR:** None

## Context

Phase 1 intentionally records only the current task state and the current day's
Daily Essentials progress. A completed task has `completed: true`, but no fact
about *when* completion happened. The Completed screen therefore groups by the
scheduled date, not the completion date. Essentials progress is replaced when a
new day starts, so it cannot support weekly review.

The existing backup contract is schema v1. Import is already transactional: it
captures exact raw values, writes a verified recovery snapshot, writes all
managed keys, and restores the captured bytes if any write or verification
fails. Phase 2 must extend that safety property rather than bypass it.

## Decision

### 1. Task completion time is required and nullable in schema v2

The v2 persisted task has:

```ts
completedAt: string | null
```

Rules:

- A new completion writes a canonical UTC ISO instant, for example
  `2026-08-20T12:34:56.789Z`.
- Rendering converts that instant to the device's local timezone.
- Reopening a task sets `completedAt` back to `null`.
- An incomplete task with a non-null `completedAt` is invalid.
- A legacy completed task migrates to `completedAt: null`. The exact instant is
  unknown and must never be inferred from its scheduled date, `createdAt`, the
  import time, or the migration time.

`null` therefore means either “not completed” or “completed before timestamps
were recorded.” The `completed` boolean remains the completion-state source of
truth; `completedAt` adds historical precision without falsifying legacy data.

### 2. Daily Essential history stores immutable day snapshots

History is a list with at most one entry per local calendar date:

```ts
interface EssentialHistoryDay {
  date: string;                         // local YYYY-MM-DD
  recordedAt: string | null;            // UTC ISO; null for legacy snapshot
  source: 'legacy-snapshot' | 'daily-close';
  entries: Array<{
    essentialId: string;
    title: string | null;
    targetCount: number | null;
    completedCount: number;
  }>;
}
```

The title and target are copied into the day snapshot. Later editing or deleting
an Essential must not rewrite the past. An orphan progress ID from v1 is kept
with a null title and target rather than silently discarded or given invented
metadata.

When v1 migrates, the current `essentialsState` becomes one
`legacy-snapshot` day if it contains definitions or progress. Its
`recordedAt` is null because the backup export time is not the time the user did
the activity. The existing current-day state also remains present; history does
not replace today's live counters.

### 3. Backup schema v2

Backup v2 retains all v1 sections and adds `essentialHistory`; every task carries
the required nullable `completedAt` field.

```ts
interface BackupFileV2 {
  app: 'mydailyflow';
  schemaVersion: 2;
  exportedAt: string;
  tasks: TaskV2[];
  essentials: DailyEssential[];
  essentialsState: DailyEssentialState;
  essentialHistory: EssentialHistoryDay[];
  preferences: BackupPreferences;
}
```

Authentication sessions, refresh tokens, provider identities, device IDs and
sync credentials remain outside backups.

### 4. Compatibility and migration order

The Phase 2 importer accepts both v1 and v2:

1. Parse without mutating storage.
2. Validate the complete source version.
3. Convert v1 to an in-memory v2 object deterministically.
4. Validate the complete v2 destination.
5. Capture all old managed raw values **plus absence of every new v2 key**.
6. Write and verify a recovery snapshot containing that exact baseline.
7. Apply all writes as one verified transaction.
8. On any failure, restore every captured raw value and restore absent keys to
   absence. Keep the recovery snapshot for manual download.

Migration is idempotent: migrating valid v2 input produces the same v2 data.
Unknown top-level fields are dropped at the validation boundary, matching the v1
security behaviour.

The local storage wrapper version and backup schema version remain distinct.
They may both become `2`, but code must not assume they advance together.

## Invariants required before shipping

- A checked legacy task never receives an invented completion timestamp.
- The v1 fixture migrates byte-for-structure to the reviewed v2 fixture.
- Running migration twice produces the same result.
- A failed second or later write restores exact whitespace and bytes of existing
  raw values and removes newly-created keys that were previously absent.
- Current Phase 1 backups remain accepted after the v2 importer ships.
- Exporting v2 never includes authentication or sync secrets.
- Migration does not reorder current tasks or Essentials.

The executable reference and synthetic fixtures live in:

- `tests/phase2MigrationContract.ts`
- `tests/phase2Migration.test.ts`
- `tests/fixtures/phase1-backup-v1.json`
- `tests/fixtures/phase2-backup-v2.json`

They are intentionally test-only. Production stays on v1 until a separate,
reviewed implementation PR adopts this contract.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Infer `completedAt` from task date/time | Converts a schedule into a false historical fact. |
| Use migration/export time for legacy completions | Records when software ran, not when the task was completed. |
| Store only Essential IDs in history | Editing/deleting definitions would rewrite or erase the meaning of past days. |
| Drop orphan Essential progress | Silent data loss. |
| Store an unbounded event log now | More sync/conflict complexity than weekly review requires; immutable daily snapshots are sufficient for Phase 2A. |
| Upgrade backups but not local transaction handling | A partial write could strand mixed v1/v2 storage. |
| Replace v1 import support | Breaks the user's existing recovery files at the moment they are most needed. |

## Consequences

Phase 2A can implement accurate completion grouping and seven-day Essentials
review. Storage and backup code will require a coordinated migration PR with a
new managed history key. That implementation must reuse the existing verified
transaction and recovery machinery; direct piecemeal localStorage writes are not
allowed.
