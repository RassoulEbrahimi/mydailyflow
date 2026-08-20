# ADR 0003 — Real authentication, local-first sync and first-sign-in reconciliation

- **Status:** Accepted architecture; vendor selection is a separate gated spike
- **Date:** 2026-08-20
- **Scope:** Phase 2C identity and multi-device data safety
- **Production change in this ADR:** None

## Context

The current login is explicitly a demo gate. All user data is localStorage-only,
there is no account-owned dataset, no server authorization model and no conflict
metadata. Replacing the screen with a real login provider would not make the
data multi-device safe. The first sign-in is especially dangerous: a device may
already contain valuable local data while the new account may also contain a
remote dataset.

Authentication, authorization, storage synchronization and first-sign-in data
reconciliation are four separate responsibilities. Phase 2 must not describe a
successful login as successful sync.

## Decision

### 1. Keep a local-first working copy

The app remains usable offline. The device keeps the working dataset and an
outbox of mutations. A server stores the account-owned canonical dataset and
acknowledges ordered revisions. UI writes succeed locally first and later reach
the server; sync state is visible rather than hidden.

The production design uses:

- standards-based hosted authentication with Authorization Code + PKCE;
- short-lived access credentials and provider-managed refresh/session handling;
- a server API that derives the owner from the verified credential;
- an account dataset ID and per-device opaque ID;
- item-level `updatedAt`/revision metadata and tombstones for deletions;
- idempotency keys for retried mutations;
- server-side authorization on every read and write.

CORS, a device ID, a username string, or possession of a task ID is never
authorization.

### 2. Provider selection is gated, not embedded in the data migration

No vendor SDK enters the Phase 2A schema-v2 PR. Before Phase 2C implementation,
a time-boxed provider spike must compare at least two managed options against:

- PKCE support for a static/PWA client;
- server-side token verification and row/record ownership controls;
- EU data location and deletion/export obligations;
- offline mutation support or compatibility with our outbox;
- account recovery, MFA and provider linking;
- cost ceilings and operational ownership;
- ability to export all user data without the vendor SDK.

The chosen provider sits behind `AuthAdapter` and `SyncTransport` boundaries.
This is an intentional architecture decision: selecting a vendor before the
identity/data ownership spike would couple the irreversible migration to an
unverified service. The spike must end with one named provider, one rejected
fallback and a cost/privacy record before application code starts.

### 3. First sign-in is explicit and recoverable

Before reconciliation, the app captures and verifies a local backup/recovery
point. It then compares local and account manifests without writing either side.

| Local dataset | Account dataset | Required action |
|---|---|---|
| Empty | Empty | Start empty. |
| Non-empty | Empty | Offer “Use data from this device”; upload only after a reviewed preview. |
| Empty | Non-empty | Offer “Use account data”; download only after a reviewed preview. |
| Non-empty | Non-empty | Show counts/dates and require explicit merge or keep-separate decision. Never auto-replace. |

“Merge” is ID-based and conflict-aware. Equal IDs with unequal content never
silently pick one side: the system retains both versions or asks the user. A
verified rollback restores the exact pre-reconciliation local bytes if any step
fails. The account side uses a server transaction/idempotency key so a retry
cannot duplicate the import.

The Phase 1 backup file remains a portable, provider-independent escape hatch.
Auth/session material is not exported.

### 4. Conflict strategy

- Mutations carry base revision, mutation ID, device ID and client timestamp.
- Server revisions determine ordering; device wall-clock time is display/audit
  context, not the sole last-write-wins authority.
- Different fields may merge only when their base revision proves they were
  edited independently.
- Same-field concurrent edits create a visible conflict copy/choice.
- Deletions are tombstones until every active device has observed them or the
  retention window expires.
- Completion/undo and Essential counters are domain operations, not generic
  object replacement.
- Recurrence generation and rollover use idempotency keys already implied by
  their source IDs, preventing duplicate occurrences across devices.

## Required implementation sequence

1. Ship and validate schema v2 history locally.
2. Run the provider spike and record the selected vendor in a follow-up ADR.
3. Add sync metadata through a separately versioned migration; do not overload
   Backup v2 silently.
4. Build read-only account manifest and first-sign-in preview.
5. Build upload/download with recovery and idempotency.
6. Add offline outbox and conflict tests.
7. Only then replace the demo gate in production.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Treat login as sync | Identity alone neither moves nor reconciles data. |
| Automatic remote-wins on first sign-in | Can erase the user's only local copy. |
| Automatic local-wins | Can erase valid data from another device. |
| Timestamp-only last-write-wins | Device clocks drift; same-field conflicts become silent loss. |
| Put provider tokens in backup/local data exports | Credential leakage and broken revocation boundary. |
| Make the server the only working copy | Removes offline use and makes daily planning depend on connectivity. |
| Choose a vendor inside the schema-v2 migration | Couples two high-risk changes and makes rollback/provider change harder. |

## Acceptance gate for Phase 2C

- Real provider selected by a documented spike, including cost and privacy.
- A synthetic two-device suite proves offline edits, retry idempotency,
  completion/undo, deletions and recurrence deduplication.
- Every first-sign-in path has preview, verified recovery and failure rollback.
- No credential appears in backup, logs, analytics or URL query parameters.
- Account deletion and full data export are tested end-to-end.
- The demo account gate remains until all above checks pass.
