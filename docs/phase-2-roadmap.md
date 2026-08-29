# My Daily Flow - Phase 2 roadmap

Proposed product promise: **"A week you can trust"**

Phase 2 extends the dependable daily loop into review, weekly planning, focused execution, and optional multi-device reliability. It is deliberately split into independent tracks so that data migration, real authentication, synchronization, and background reminders do not land as one irreversible release.

## Product principles

1. **Local-first remains the default.** The app must still open and work offline.
2. **Migration before features.** Any schema change ships with idempotent migration, rollback evidence, and old-backup import coverage.
3. **First sign-in never overwrites device data.** The user sees an explicit preview and chooses merge, keep device, or replace.
4. **History is factual.** Review uses stored completion events, not scheduled-time inference.
5. **Platform limits remain visible.** Push or sync is never promised before the selected platform proves it.
6. **Phase 1 quality gates stay mandatory.** Mobile widths, both themes, keyboard access, 44 px targets, bidi isolation, backup round trips, and physical-device acceptance remain release gates.

## Phase 2.0 - architecture and migration decisions

This is the safest next increment. It produces ADRs, migration fixtures, and failure-mode tests before changing production behaviour.

### Decisions to prove

- Schema v2 representation for `completedAt` and daily Essential history
- Time semantics: completion timestamps stored as UTC ISO strings; grouping rendered in the user's local timezone
- Backup v2 migration while retaining v1 import compatibility
- First-sign-in reconciliation of anonymous local data with an account
- Authentication/synchronization provider and offline conflict strategy
- Background reminder feasibility on installed Android PWA and supported desktop browsers

### Exit criteria

- Written ADRs name the selected designs and rejected alternatives.
- v1 fixtures migrate to v2 deterministically and twice-running migration is a no-op.
- A failed migration restores the exact pre-migration raw values.
- A Phase 1 backup imports successfully after the proposed migration.
- No production UI, storage key, or deployed bundle changes in this increment.

## Phase 2A - factual history and weekly review

### Scope

1. Add `completedAt` with a versioned Task/backup migration.
2. Record daily Essential outcomes in a new versioned local history slice.
3. Build a Weekly Review screen:
   - planned vs completed work by day
   - carried-over work
   - actual completion moments
   - Essentials consistency and trends
   - unfinished items that need a new decision
4. Add honest empty, partial-history, and migrated-history states.

### Acceptance criteria

- Completing, undoing, recurring, deleting, importing, and restoring a task preserve correct completion history.
- Weekly totals match the underlying records across timezone and daylight-saving boundaries.
- Old backups import; new backups round-trip without losing history.
- Review never invents pre-migration completion times.
- The week is readable at 360/390/430 px in both themes and with mixed-direction content.

## Phase 2B - weekly planning and focused execution

### Scope

1. Week planner with a day/time-block view and an untimed lane.
2. Drag or keyboard movement between dates and time blocks with a visible non-gesture alternative.
3. Focus session mode linked to one task, with pause, resume, finish, and interruption-safe recovery.
4. Reusable templates for recurring day shapes and routines.
5. A planning review that converts unfinished weekly work into explicit keep, move, or drop decisions.

### Acceptance criteria

- Moving a recurring task never changes its cadence accidentally.
- Untimed work stays untimed unless the user assigns a time.
- Every drag operation has an accessible keyboard/button equivalent.
- Focus state survives a reload without falsely completing its task.
- Templates create independent tasks and never share mutable checklist state.

## Phase 2C - real identity, synchronization, and background reminders

This track starts only after Phase 2.0 selects a platform and Phase 2A proves the versioned data model.

### Scope

1. Replace demo authentication with real account authentication.
2. Offer explicit first-sign-in data reconciliation with preview and recoverable backup.
3. Synchronize tasks, Essentials definitions/history, settings, and review records across devices.
4. Add conflict handling that preserves both versions when automatic resolution is unsafe.
5. Implement background reminders only on platforms proven by the feasibility work.

### Acceptance criteria

- No credential or session secret is stored in exported backups.
- Signing in, signing out, going offline, reconnecting, and using two devices cannot silently discard a local edit.
- Account deletion and remote-data deletion require explicit confirmation and a downloadable export path.
- Reminder copy states exact platform capability; foreground-only fallback remains honest.
- Android physical-device tests cover install, update, offline launch, notification permission, background delivery, and safe areas.

## Recommended PR train

| Order | Increment | Rollback boundary |
|---|---|---|
| P2-0 | ADRs, v1/v2 fixtures, migration and failure-mode harness | Documentation/tests only |
| P2-1 | Schema v2 + `completedAt` + backup migration | Revert before any history UI |
| P2-2 | Essential daily history slice — shipped with P2-1 | Independent storage slice |
| P2-3 | Weekly Review UI — implemented | Read-only consumer of history |
| P2-4 | Week planner and time-block movement — implemented | Planning UI isolated from focus |
| P2-5 | Focus sessions — implemented | Separate persisted focus state + Backup v3 |
| P2-6 | Day/routine templates — implemented | Independent template slice + Backup v4 |
| P2-7 | Real-auth and sync spike — implemented | Supabase decision + executable two-device protocol; no production SDK |
| P2-8 | Real authentication + first-sign-in reconciliation — implemented | Feature flag and local backup gate |
| P2-9 | Synchronization and conflict handling — implemented and live-tested | Server capability flag |
| P2-10 | Background reminders — implemented, activated and live-tested | Platform capability flag |
| P2-11 | Phase 2 mobile acceptance and staged rollout — accepted | No new feature scope |
| P2-12 | Single active device — implementation and controlled rollout | Session/device lease; no data-schema change |
| P2-13A | Account lifecycle and security controls — implementation | Default-OFF flag + authenticated deletion function; no data-schema change |

## Explicitly deferred

- Social or team collaboration
- Shared calendars and delegated tasks
- AI-generated life coaching or automatic reprioritization
- Health, financial, or other sensitive-domain inference
- Destructive cloud cleanup without export and recovery

## Recommended next objective

**P2-8 is implemented:** Supabase Auth and the first-sign-in reconciliation
preview are integrated behind a default-OFF feature flag. Every destructive or
merging choice is preceded by a verified Backup v4 and byte-exact recovery gate.
The Frankfurt test project enforces account ownership through RLS and narrowly
granted RPCs; credentials and session material remain outside backups and sync
payloads.

**P2-9 is implemented and live-tested:** the local-first coordinator now keeps a
per-account shadow and ordered outbox, replays idempotent mutations, merges
independent-field edits, exposes same-field conflicts and resolves them only
after an explicit user choice. First-sign-in decisions are scoped to the exact
account and device, so a new installation cannot inherit another device's
reconciliation result. A controlled two-browser test proved offline replay,
independent-field merging, visible conflict creation, `Dieses Gerät` resolution
and final convergence. Both production flags were restored to OFF after the
test.

**P2-10 is implemented and activated:** the client capability, encrypted
per-device subscription storage, timezone-derived UTC schedules, atomic
claim/lease dispatcher, generic service-worker notification and cancellation
rules remain independently gated. The foreground-only reminder remains the
truthful fallback whenever the server-backed capability is unavailable.

**P2-12 changes the operating model by product decision:** only one authenticated
device may use an account at a time. A newer explicit login atomically revokes
the previous device; restored sessions cannot take over implicitly. RLS and sync
RPCs enforce the lease server-side, while the client fails closed when offline.
The implementation and rollout protocol live in
`docs/p2-12-single-device-mode.md`.

**P2-13A completes the test-environment account lifecycle:** Settings exposes
the signed-in email, verification status and active-device state; confirmation
mail can be resent; password changes require the current password; and account
deletion is gated by a fresh Backup v4, the exact account email, an explicit
phrase and the active P2-12 device lease. The destructive operation runs in an
authenticated Edge Function whose privileged key never enters the browser.
The capability remains default-OFF and is documented in
`docs/p2-13-account-lifecycle.md`. Production project separation, custom SMTP
and operational monitoring remain the P2-13B release boundary.
