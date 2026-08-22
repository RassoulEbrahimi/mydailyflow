# P2-9 multi-device synchronization

P2-9 keeps My Daily Flow local-first while adding an account-owned canonical
copy in Supabase. The production defaults remain safe:

```dotenv
VITE_REAL_AUTH_ENABLED=false
VITE_SYNC_ENABLED=false
```

Both flags must be exactly `true` before the sync coordinator exists. Real Auth
can therefore be exercised without transmitting task or Essential payloads.

## Protocol

- Each installation has a random device UUID. Per-account client metadata holds
  the last canonical shadow, ordered dataset revision, pending outbox and keys
  currently in conflict.
- Local writes continue to use the existing verified localStorage transactions.
  The coordinator observes differences against its last shadow and queues one
  idempotent mutation per entity.
- The server assigns the only authoritative dataset revision. Mutation UUIDs
  have permanent receipts, so retries cannot apply the same write twice.
- Field revisions allow edits to different fields to merge. Concurrent edits to
  the same field, edit-after-delete and delete-after-edit create visible conflict
  records; the server never silently chooses a winner.
- Optional-field removals are explicit mutation data, not `null` guesses. A
  removed note/checklist field disappears remotely while unrelated fields from
  another device remain intact.
- The coordinator snapshots local data at the start and end of every cycle.
  Edits made while a request is in flight become a new outbox mutation; fresh
  independent remote fields are not misclassified as local edits.
- Deletes are tombstones. A stale offline edit cannot resurrect a deleted record.
- Supabase Realtime is only a wake-up hint. Every wake-up is followed by a fresh
  canonical read protected by RLS. Online, visibility and a 15-second timer are
  fallback triggers.
- Applying a remote snapshot is all-or-nothing through the existing storage
  transaction. A failed write restores every prior local byte.

## Remote boundary

Apply `supabase/migrations/202608210002_p2_9_multidevice_sync.sql` after the
P2-8 migration. It creates `sync_devices`, `sync_records`,
`sync_mutation_receipts`, and `sync_conflicts`.

Direct writes by `anon` and `authenticated` are revoked. Authenticated users can
select only rows whose `owner_id` equals `auth.uid()`. All writes use narrowly
granted security-definer RPCs with an empty `search_path`; the caller cannot
supply an owner or dataset ID.

The remotely synchronized payload boundary is exactly Backup v4's managed
slices: tasks, Essential definitions/progress/history, focus state/history,
templates and preferences. Authentication/session keys, recovery snapshots and
sync metadata never enter remote records or backups.

## First sign-in

The P2-8 backup + byte-exact recovery gate remains mandatory. The recorded
choice controls the first sync:

- `upload-local`: local records seed the account.
- `download-account`: the verified account snapshot replaces managed local data
  atomically.
- `merge-with-conflicts`: remote-only and local-only records merge; same-entity
  differences enter the ordinary visible conflict path.
- `keep-device-separate`: no upload, download or automatic merge occurs.

## Acceptance

1. Account A cannot select or mutate account B data.
2. Replaying a mutation UUID returns its first receipt and does not advance the
   revision.
3. Two devices editing independent fields merge; editing the same field creates
   one visible conflict.
4. Offline mutations survive reload and replay in order after reconnect.
5. Conflict resolution is explicit (`Kontoversion` or `Dieses Gerät`) and itself
   advances the canonical revision only when the device copy is chosen.
6. A malformed remote snapshot cannot partially overwrite localStorage.
7. A default production build issues no Supabase request and shows no sync UI.
8. Turning off `VITE_SYNC_ENABLED` is an immediate client kill switch; local data
   remains intact.
9. The disposable SQL test in `supabase/tests/p2_9_sync_rls.sql` proves RLS,
   idempotency, independent-field merge, explicit field removal and current-copy
   conflict resolution inside a transaction that always rolls back.
