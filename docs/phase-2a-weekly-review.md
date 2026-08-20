# Phase 2A weekly review

Status: implemented in P2-3 as a read-only consumer of the schema-v2 task and
Essential history introduced by P2-1/P2-2.

## Product contract

- The week starts on Monday and uses calendar-day arithmetic, not elapsed local
  hours.
- `Geplant` counts tasks scheduled for a day in the selected week, excluding
  tasks marked as carried over.
- `Erledigt` counts only stored `completedAt` instants that fall within the
  selected week in the user's timezone.
- `Übernommen` counts tasks explicitly carrying `rolledOverFrom`; it is never
  folded into the planned total.
- The completion timeline never invents a time for migrated legacy tasks whose
  `completedAt` is `null`.
- Missing Essential history renders as missing (`–`), not as zero progress.
  Migration snapshots and the current live day are identified separately.
- `Neu entscheiden` contains open work due through the selected decision
  boundary, including work that originated in the week and was later rolled
  forward.

## Release checks

- Calendar and timezone tests cover both Berlin daylight-saving transitions.
- Unit tests pin task totals, legacy completion handling, rollover origin and
  partial/migrated/live Essential history.
- Browser tests cover 360, 390 and 430 px in dark and light themes, axe checks,
  week navigation, return-to-origin navigation and German/Persian/mixed content.
- The screen is deliberately read-only; task rescheduling remains in the
  existing task flows.

## Next increment

P2-4 can now build the week planner and time-block movement as a separate,
revertible feature. It must not change recurrence cadence when moving tasks and
must give every drag operation an accessible button or keyboard equivalent.
