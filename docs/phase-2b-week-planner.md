# Phase 2B week planner

Status: implemented in P2-4 as a scheduling-only surface on top of the existing
schema-v2 task slice.

## Product contract

- A planning week starts on Monday and contains seven explicit calendar days.
- Each day exposes four destinations: `Morgen`, `Nachmittag`, `Abend`, and
  `Ohne Zeit`.
- Completed tasks remain factual history and are not draggable or reschedulable
  in the planner.
- Moving a task changes only `date`, `time`, and (for timed work) `timeBlock`.
  IDs, `completedAt`, recurrence fields, monthly anchors, rollover provenance,
  notes, checklist items and reminder settings are preserved.
- Moving an untimed task to another day keeps `time: ""`. A clock time is added
  only after the user chooses a timed lane.
- Moving between timed lanes uses a visible deterministic default (09:00,
  14:00, or 18:00); the move dialog lets the user select the exact time.
- An explicit time is the final source of truth for `timeBlock`, so persisted
  time and lane cannot disagree.
- A recurring occurrence may move between time blocks on its current series
  day, but cross-day movement is locked in the planner. Changing the weekday is
  an explicit series-edit action via `Bearbeiten`, preventing an accidental
  drag from changing recurrence cadence.

## Interaction and accessibility

- Pointer/touch drag is an accelerator, not the only path.
- Every task has a persistent 44 px `Verschieben` action which opens a modal
  with seven day choices, four lane choices and an optional time field.
- The move flow supports keyboard activation, Escape, contained Tab order,
  focus restoration and a polite live announcement after success.
- Task titles remain `dir="auto"`; German application chrome remains LTR.
- Planner lanes have unique accessible names containing both date and lane.

## Release checks

- Unit coverage pins calendar arithmetic across DST boundaries, grouping,
  untimed semantics, explicit-time consistency and byte-for-byte preservation
  of recurrence/history/authored fields, including the recurring-day lock.
- Browser coverage exercises 360/390/430 px in both themes, German/Persian/mixed
  titles, axe, horizontal containment, touch target sizes, keyboard movement,
  persisted movement and pointer drag parity.
- The storage version and backup format are unchanged.

## Next increment

P2-5 can add interruption-safe focus sessions as a separate persisted slice.
The planner must stay usable if that slice is later reverted.
