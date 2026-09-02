# Audit Phase 2 — model migration and rollback contract

- **Status:** Proposed implementation manifest for ADR 0006
- **Date:** 2026-09-02
- **Production change in this document:** None

## Objective

Move from mutable all-in-one Tasks plus separate Essential/Template recurrence
models to Actions, DailyPlanEntries, Routines and ActionEvents without losing,
inventing, duplicating or silently reinterpreting user data.

This contract is intentionally stricter than a TypeScript refactor. The current
application has local Backup v4, transactional recovery, optional server sync,
focus history and a single-device account lease. Every one of those boundaries
must remain valid throughout the migration.

## Version boundaries

| Boundary | Current | Target | Compatibility rule |
|---|---:|---:|---|
| Task local wrapper | 2 | Domain storage 3 | Old keys remain a verified projection during the compatibility window. |
| Backup file | 4 | 5 | Import v1–v5; export v5 after cutover. |
| Sync client/server records | 1 | 2 | Remains on v1 until local cutover and rollback are proven. |
| Focus state | 1 | 1 initially | Task IDs become Action IDs unchanged. |
| Essential history | 2 | 3 only when Routine IDs land | Existing snapshots remain immutable. |

Version numbers are independent. Code must not infer one boundary from another.

## Deterministic legacy mapping

### Task → Action

For every valid current Task:

- `Action.id = Task.id`;
- authored title, description, notes, checklist and priority copy byte-for-byte;
- `duration` parses through the existing duration parser into
  `estimatedMinutes`; an unparseable legacy label is preserved byte-for-byte in
  `legacyDurationLabel` while the numeric estimate remains null;
- `completed`/`completedAt` map to Action status without inventing a timestamp;
- `deadlineDate = null`; the old `date` was a plan date, never proven deadline;
- `reminderEnabled` copies exactly;
- `createdAt` copies exactly;
- migration does not fabricate `updatedAt`; it remains null until the first real
  post-migration edit.

### Task → DailyPlanEntry

Every Task has a current date, so every migrated Task receives one entry:

- ID: `plan:${task.id}`;
- `actionId = task.id`;
- `date = task.date`;
- non-empty valid `time` becomes `fixed` with that `startTime`;
- empty time becomes `flexible` with `startTime: null`;
- `rolledOverFrom`, when present, becomes `sourceDate` only;
- otherwise `sourceDate = null`;
- `source = legacy-migration`;
- unknown creation/rescheduling instants remain null.

No migration step moves a stale date to today.

### Legacy completion and rollover facts

- a Task with canonical `completedAt` receives a `completed` event at that
  instant;
- a completed legacy Task with `completedAt: null` remains completed and gets a
  legacy event with `occurredAt: null`;
- `rolledOverFrom` may produce migration provenance with `occurredAt: null`, but
  never a fabricated reschedule time;
- event IDs are deterministic from source entity ID and fact type, making the
  migration idempotent.

### Recurring Task → Routine

The mapper follows `recurrenceSourceId` backwards through the available Task
set to the oldest reachable source. The deterministic routine ID is
`routine:task:<root-id>`. If an ancestor is missing, the oldest reachable ID is
used and the routine records `legacyChainIncomplete: true` in migration
metadata.

- `daily`, `every2days`, `weekly` and `monthly` map without changing cadence;
- monthly `recurrenceAnchorDay` is retained;
- generated occurrence identity is based on routine, occurrence date and item
  index, not device clock;
- no occurrence is generated during migration;
- two apparent chains are never merged by matching title.

### Daily Essential → Routine

- ID: `routine:essential:<essential.id>`;
- trigger: daily;
- purpose: essential;
- target 1 maps to binary tracking; target greater than 1 maps to count tracking;
- title, order and createdAt remain unchanged in migration metadata/projection;
- live progress remaps by ID;
- every history entry keeps its recorded title, target and completed count;
- orphan history/progress remains orphaned and visible, never assigned to a
  guessed Routine.

### TaskTemplate → Routine

- ID: `routine:template:<template.id>`;
- trigger: manual;
- single-task and multi-item templates retain item order and day offsets;
- checklist text copies, but generated checklist IDs remain fresh per run;
- recurrence and reminder defaults copy exactly;
- migration creates definitions only, never Actions or plan entries.

### Focus state

Focus `taskId` already equals the future `actionId`, so active/history records
remain valid. Stored title snapshots remain immutable even if an Action is later
renamed or deleted.

## Atomic local migration

The runtime migration must perform these steps in order:

1. Read every currently managed raw value without writing.
2. Validate the complete current snapshot and all cross-slice references.
3. Build the complete destination in memory deterministically.
4. Validate every destination slice and cross-slice invariant.
5. Serialize the destination twice and prove byte equality.
6. Capture exact old bytes plus the absence of every new key.
7. Write and verify a recovery snapshot containing that capture.
8. Write all new slices and the migration marker through one verified
   transaction.
9. Read all new slices back and compare their canonical snapshot to the
   in-memory destination.
10. Produce and verify the legacy compatibility projection.
11. Only then mark migration complete.
12. On any error, restore all old bytes and all previously absent keys to
   absence; keep the recovery snapshot downloadable.

No hook or component may write a new slice directly during migration.

## Compatibility and rollback window

### Compatibility release

The first production release containing domain storage v3 enables **no new-only
semantics**. It must:

- read the new model;
- write the new model and a verified legacy projection atomically;
- compare new and legacy projections after every domain mutation in development
  and browser tests;
- continue producing a lossless Backup v4 compatibility projection in addition
  to the reviewed Backup v5 export path;
- leave the old storage keys present and readable;
- keep sync schema v1 operating on the legacy projection.

Because one current plan entry and the old UI are retained, every compatibility
operation remains representable in both models.

### Rollback during compatibility

A rollback build may switch back to old reads only after verifying the legacy
projection is current. It must not reset storage or import an older backup over
newer data. The recovery snapshot is an emergency escape hatch, not the normal
rollback mechanism.

### End of compatibility

New-only semantics—deadline UI, unplanned Inbox Actions, Routine convergence or
new sync kinds—remain disabled until:

- at least one deployed compatibility release has passed physical-device use;
- Backup v5 export/import has passed an exact round trip;
- legacy projection equality has remained green;
- an explicit release decision ends old-build rollback support.

Old keys are not deleted in the same release that enables new semantics. Their
eventual removal is a separate reversible housekeeping PR after a retention
period.

## Backup v5 contract

Backup v5 contains only provider-independent product data:

```ts
interface BackupFileV5 {
  app: 'mydailyflow';
  schemaVersion: 5;
  exportedAt: string;
  actions: Action[];
  planEntries: DailyPlanEntry[];
  routines: Routine[];
  actionEvents: ActionEvent[];
  essentialHistory: EssentialHistoryDayV3[];
  focusState: FocusState;
  preferences: BackupPreferences;
}
```

Rules:

- importer accepts v1, v2, v3, v4 and v5 and normalizes fully in memory before
  writing;
- v1–v4 migration uses exactly the deterministic mapping above;
- authentication sessions, account IDs, device leases, sync shadow/outbox,
  push subscriptions, recovery snapshots and provider configuration are never
  exported;
- import preview reports Action, planned-entry, Routine, event and history
  counts separately;
- merge never matches by title; identity and explicit migration mapping only;
- current local records win ID collisions until a dedicated conflict preview is
  approved;
- replace/merge remains all-or-nothing and keeps its pre-import recovery point.

## Sync schema v2 gate

Sync migration starts only after local storage and Backup v5 are accepted.

Required entity kinds:

- `action`
- `plan-entry`
- `routine`
- `action-event`
- `essential-history`
- existing focus/preference entities

Server rollout order:

1. Add new kinds, validators and owner-scoped RLS without exposing client use.
2. Backfill new records from the canonical account snapshot idempotently.
3. Compare server legacy/new projections for the single active device.
4. Enable sync schema v2 behind a server capability and client feature flag.
5. Keep v1 records until the same compatibility exit gate is approved.

The current single-device lease reduces concurrent conflicts but does not waive
ownership, idempotency, tombstone or rollback requirements.

## PR sequence and rollback boundaries

| PR | Scope | Production behavior | Rollback boundary |
|---|---|---|---|
| A | Executable pure types, validators, fixtures and v4→v5 mapper | None | Delete test-only additions. |
| B | New storage serializers, transaction and recovery tests behind flag | None by default | Flag off; no new key written. |
| C | Compatibility cutover: new canonical reads + atomic legacy projection | Same UI/semantics | Switch reads back only after projection verification. |
| D | Today/All/Planner selectors consume Action + PlanEntry directly | Same visible behavior | Revert selectors; data remains dual-representable. |
| E | Backup v5 UI and physical-device import/export acceptance | Adds current-format backup | v4 importer/export compatibility remains. |
| F | Routine storage convergence, current UI preserved | No redesigned UI | Retain legacy projections. |
| G | Sync schema v2 backfill and gated client | No change while flag off | Disable capability; v1 records remain. |
| H | New product semantics and simplified UI | User-visible, separately approved | Forward data migration required; old builds no longer assumed safe. |
| I | Retire legacy projections after retention window | Housekeeping only | Restore from still-supported v5 canonical data. |

No PR may combine local migration, sync migration and user-visible model changes.

## Required automated evidence

Before compatibility deployment:

- all existing Node and browser tests remain green;
- a frozen production-like Backup v4 fixture maps to one reviewed v5 fixture;
- migration is deterministic, idempotent and does not mutate input;
- every failure position in the multi-key write restores exact previous bytes;
- absent new keys return to absence on rollback;
- v5 serializes and imports byte-for-structure identically;
- every Task maps to exactly one Action and one plan entry;
- every focus reference resolves to an Action;
- no deadline, completion instant or reschedule instant is invented;
- no recurring occurrence is generated during migration;
- Routine occurrence generation is idempotent;
- Essential live progress and immutable history totals are unchanged;
- user strings remain byte-identical across German, Persian, emoji and mixed
  content;
- legacy and new projections remain equivalent after create, edit, complete,
  reopen, triage, move tomorrow, planner move, recurrence and delete/undo;
- Backup and sync projections contain no auth, device or push secrets.

Before enabling new semantics:

- 360/390/430 px, Light/Dark, keyboard, touch-target and bidi suites are green;
- physical-device backup export, replace, merge and rollback pass;
- a full day transition proves stale entries enter triage and never auto-enter
  Today;
- fixed/flexible capacity and Now selection match the accepted Audit flow;
- the user approves the five product decisions listed in ADR 0006.

## Stop conditions

Implementation stops without writing or deploying if:

- any source slice is invalid or unreadable;
- a deterministic ID collision cannot be resolved without guessing;
- destination validation or legacy projection equality fails;
- recovery snapshot write/read-back fails;
- Backup v4 cannot be represented losslessly during compatibility;
- focus, recurrence or Essential history references become orphaned;
- server capability/RLS cannot prove owner isolation;
- any test requires real user data to pass.

## Explicitly out of scope

- visual redesign of Today, Essentials, Templates or Week Planner;
- multiple active plan sessions for one Action;
- automatic AI prioritization or scheduling;
- automatic deadline inference;
- changing the one-active-device account policy;
- deleting current local keys or old server records;
- deploying a migration from this documentation PR.
