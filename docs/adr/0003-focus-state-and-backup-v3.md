# ADR 0003 — Focus state and Backup v3

- **Status:** Accepted and implemented in P2-5
- **Date:** 2026-08-21
- **Scope:** Focus-session persistence, time semantics and backup compatibility

## Decision

Focus state is stored separately from Tasks. An active session snapshots only
the Task identity needed to keep the session understandable if the Task later
changes. Task completion remains exclusively owned by the Task workflow.

Elapsed time is timestamp-derived. Intervals update the display but are never
the source of truth. The persisted model supports one active session and an
append-only completed-session history, validated with canonical UTC instants,
non-negative integer elapsed time and unique session IDs.

Backup schema advances from v2 to v3 to include this real user history. Import
of v1 and v2 remains supported. Active sessions are inert while represented in
a backup: export and restore both normalize them to paused state. Backup merge
keeps the device's active session and deduplicates completed history by ID.

## Rejected alternatives

- **Store focus fields on Task:** rejected because deleting, recurring or
  rescheduling a Task would couple timer history to task lifecycle mutations.
- **Persist a decrementing counter every second:** rejected because it creates
  excessive writes and loses time while JavaScript is suspended.
- **Auto-complete at zero:** rejected because elapsed attention does not prove
  the work itself is complete.
- **Exclude focus from backup:** rejected because completed focus sessions are
  user-created historical data.

## Compatibility and rollback

No Task, Essential or preference shape changes. The new local slice is
independent. A code rollback leaves an unknown key that older builds ignore.
Backup v3 requires the P2-5 build to restore focus history; v1/v2 imports remain
lossless for all fields they know. Import writes focus in the existing atomic
transaction, so a failed write restores every captured raw value and key
absence.
