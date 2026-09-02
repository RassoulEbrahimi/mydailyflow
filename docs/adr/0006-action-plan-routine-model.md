# ADR 0006 — Separate actions, daily plans, routines and immutable facts

- **Status:** Accepted for staged implementation; production gates remain mandatory
- **Date:** 2026-09-02
- **Scope:** Audit Phase 2 product-model simplification
- **Production change in this ADR:** None

## Naming note

This is **Phase 2 of the 2026-09 product audit**, not the already delivered
Phase 2 roadmap in `docs/phase-2-roadmap.md`. The earlier roadmap added factual
history, weekly planning, focus, templates, authentication, synchronization and
background reminders. This ADR addresses a different remaining problem: the
core persisted `Task` still represents too many product concepts at once.

## Context

The current `Task` owns authored content, its planned date and time, completion,
carry-over provenance, recurrence and reminder preference. That shape made the
first product phases practical, but it now creates contradictions:

- changing the date changes both the work itself and its place in a plan;
- a missed date has no representation other than a stale task or
  `rolledOverFrom` on the same object;
- a deadline cannot be distinguished from the day the user intends to work;
- exact-time commitments and flexible work are inferred from whether `time` is
  empty;
- recurring tasks, Daily Essentials and saved routines are three independent
  repetition models;
- completion and rescheduling overwrite current state, while review needs an
  immutable statement of what happened;
- synchronization currently treats the entire task payload as one entity, so a
  content edit and a planning edit compete on the same record.

The current boundaries that a migration must preserve are:

- `src/types/task.ts`: `Task`, task schema v2 and recurrence provenance;
- `src/types/essential.ts`: Daily Essential definitions, live counters and day
  snapshots;
- `src/types/template.ts`: single-task templates and multi-item routines;
- `src/types/backup.ts`: provider-independent Backup v4;
- `src/types/focus.ts`: focus history references task IDs and title snapshots;
- `src/sync/projection.ts`: tasks, Essentials and templates project to separate
  server records;
- `src/utils/appStorage.ts`: verified multi-key transactions and byte-exact
  recovery are mandatory safety properties.

## Decision

### 1. `Action` is the durable unit of work

An Action answers **what needs to be done**. It does not answer which day or
time the user intends to do it.

```ts
type ActionStatus = 'open' | 'completed' | 'archived';

interface Action {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  checklistItems?: ChecklistItem[];
  priority: 'low' | 'medium' | 'high';
  estimatedMinutes: number | null;
  legacyDurationLabel?: string;
  status: ActionStatus;
  completedAt: string | null;
  deadlineDate: string | null;
  routineId: string | null;
  reminderEnabled: boolean;
  createdAt: string;
  updatedAt: string | null;
}
```

Rules:

- `deadlineDate` is an optional external constraint. It never places an Action
  in Today by itself.
- `completedAt` remains the current-state completion projection. A matching
  immutable event records a new completion or reopening.
- `updatedAt` is canonical UTC and is written only for real user/domain changes,
  not reads or migrations that preserve the same value. It is null when a
  trustworthy legacy update instant does not exist.
- a legacy duration label that cannot be parsed without guessing is retained
  byte-for-byte while `estimatedMinutes` remains null. The label disappears only
  after an explicit user edit selects a valid estimate.
- user-authored strings remain byte-for-byte unchanged and retain the existing
  per-string `dir="auto"` rendering contract.
- an Action without a current plan entry is Inbox/backlog work, not overdue
  merely because it is unplanned.

### 2. `DailyPlanEntry` places an Action in one day

A DailyPlanEntry answers **when the user currently intends to work on an
Action**.

```ts
interface DailyPlanEntry {
  id: string;
  actionId: string;
  date: string;                    // local YYYY-MM-DD
  commitment: 'flexible' | 'fixed';
  startTime: string | null;        // HH:MM; required for fixed
  source: 'capture' | 'triage' | 'planner' | 'routine' | 'legacy-migration';
  sourceDate: string | null;       // provenance, not a second schedule
  createdAt: string | null;        // null when legacy history is unknowable
  updatedAt: string | null;
}
```

Rules:

- an Action has at most one current DailyPlanEntry in the initial model;
- `fixed` requires a valid `startTime`; `flexible` requires `startTime: null`;
- a plan entry dated before today is shown in Morning Triage. It is never
  silently copied into Today;
- accepting, postponing or moving work changes the plan entry and appends a
  rescheduling event in the same verified transaction;
- removing work from a day removes its current plan entry and returns the Action
  to Inbox; it does not delete the Action;
- fixed commitments consume exact calendar space. Flexible entries consume
  daily capacity but do not claim a clock position;
- Today is derived from entries whose `date` is today, never from deadline,
  creation time or recurrence metadata.

The initial one-entry rule is deliberate. Splitting one Action into several
work sessions is a later product decision and must not be smuggled into the
migration.

### 3. `Routine` is the shared repetition definition

Routine replaces three overlapping definition mechanisms: task recurrence,
Daily Essential definitions and saved task/routine templates.

```ts
type RoutineTrigger =
  | { kind: 'manual' }
  | { kind: 'daily' }
  | { kind: 'interval'; days: number }
  | { kind: 'weekly'; weekdays: number[] }
  | { kind: 'monthly'; day: number };

interface Routine {
  id: string;
  name: string;
  purpose: 'essential' | 'action-generator';
  trigger: RoutineTrigger;
  tracking: { kind: 'binary' } | { kind: 'count'; target: number };
  items: RoutineActionBlueprint[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
}
```

Rules:

- a Daily Essential becomes a daily Routine with one item and binary/count
  tracking;
- a recurring task becomes an action-generator Routine with one item;
- a saved single-task template becomes a manual Routine with one item;
- a saved multi-item routine becomes a manual Routine retaining its day
  offsets;
- generation creates a fresh Action and, when the definition supplies a day,
  a fresh DailyPlanEntry. Generated Actions do not share mutable checklist
  identity;
- generation is idempotent by `(routineId, occurrenceKey, itemIndex)`;
- current Essential history remains immutable. Its migrated entries reference
  the corresponding Routine ID without rewriting recorded titles or targets.

`purpose` keeps presentation comprehensible without maintaining separate
storage engines. The Today Essentials strip may remain visually distinct even
though its definition is a Routine.

### 4. `ActionEvent` records facts without becoming the render database

```ts
type ActionEventType =
  | 'completed'
  | 'reopened'
  | 'plan-created'
  | 'plan-rescheduled'
  | 'plan-removed'
  | 'routine-generated';

interface ActionEvent {
  id: string;
  actionId: string;
  planEntryId: string | null;
  routineId: string | null;
  type: ActionEventType;
  occurredAt: string | null;
  payload: Record<string, unknown>;
  source: 'user' | 'routine' | 'legacy-migration';
}
```

Events are append-only facts used by review and diagnostics. Current screens
read the validated Action and DailyPlanEntry projections; they do not replay an
unbounded log during render.

- a new user operation updates current state and appends its event atomically;
- a migrated fact with no trustworthy instant uses `occurredAt: null`;
- migration never invents completion, rescheduling or carry-over times;
- event IDs and routine occurrence keys make retries idempotent;
- no event is automatically discarded in the first release. Retention or
  compaction requires a separate, user-visible data policy.

### 5. Product flow derived from the model

The intended daily loop becomes:

1. Inbox contains open Actions without a plan entry.
2. Morning Triage lists open Actions with stale plan entries.
3. Fixed commitments are placed first.
4. The user selects a small flexible plan within remaining capacity.
5. Today shows only today's plan, with one primary Now action.
6. Completion updates the Action and records a fact; postponement updates only
   the plan relationship.
7. Review uses completion/rescheduling events and immutable Essential history,
   rather than inferring history from current mutable fields.

### 6. Persistence and compatibility targets

This model targets:

- **local domain storage v3** with separate actions, plan entries, routines and
  events slices;
- **Backup v5**, while continuing to import Backups v1–v4;
- **sync schema v2** with new entity kinds, introduced only after the local
  migration is proven;
- an explicit compatibility window in which the app can project the new model
  back to the existing Task/Essential/Template slices because no new-only
  semantics are enabled yet.

The exact rollout and rollback rules are normative in
`docs/audit-phase2-migration-contract.md`.

## Invariants

- Action content is never changed by scheduling or postponement.
- A deadline is never used as a planned date.
- No stale plan is copied into Today without an explicit decision.
- At most one current plan entry exists per Action in the initial model.
- Fixed entries always have a valid time; flexible entries never claim one.
- Completion and rescheduling state plus their event commit atomically.
- Routine generation is deterministic and retry-safe.
- Existing focus references keep resolving because migrated Action IDs preserve
  Task IDs.
- Backup v1–v4 remains importable.
- Authentication, session, device, push and recovery credentials never enter a
  backup or domain event.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Keep adding optional fields to `Task` | Preserves the central contradiction between work identity and planning. |
| Treat `date` as both deadline and work date | Makes Today and overdue status impossible to explain truthfully. |
| Automatically copy missed plan entries into Today | Recreates the backlog explosion the Audit identified. |
| Put scheduling arrays inside Action | Couples independently changing plan state back to authored content and sync conflicts. |
| Full event sourcing for every screen | Adds replay, migration and corruption complexity without improving the daily UI. |
| Keep three unrelated recurrence/template/Essential engines | Continues duplicate generation, validation and history rules. |
| Replace all current storage in one release | Creates an unacceptable rollback and data-loss boundary. |
| Make the server canonical during local migration | Couples product-model risk to network/auth availability. |

## Consequences

Benefits:

- Today, Inbox, deadline and history acquire non-overlapping meanings;
- postponement no longer mutates the identity of the work;
- review can state what happened instead of inferring from current state;
- fixed/flexible capacity and routines share explicit domain contracts;
- content and plan changes can synchronize as separate records.

Costs:

- local storage, Backup, sync projection and UI selectors all need versioned
  migrations;
- the compatibility period temporarily maintains legacy projections;
- Routine convergence needs careful ID mapping for existing Essential history,
  recurrence chains and templates;
- `App.tsx` decomposition must continue so the cutover is not coordinated from
  one monolithic component.

## Approved decisions before enabling new semantics

The user approved these product decisions on 2026-09-02. Implementations must
follow them unless a later reviewed ADR explicitly supersedes them:

1. **Deadline UI:** store `deadlineDate` but do not expose it until planning and
   deadline labels have distinct designs.
2. **Plan multiplicity:** keep one current plan entry per Action initially.
3. **Flexible daily limit:** recommend up to three primary flexible Actions;
   warn rather than block, and never count fixed commitments against that item
   count.
4. **Event retention:** keep events until a separate export/retention policy is
   approved.
5. **Routine presentation:** preserve the current Essentials and Templates UI
   during migration; convergence begins in storage and selectors first.
