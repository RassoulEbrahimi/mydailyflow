# P2-12 — single active device

My Daily Flow now deliberately allows one active authenticated device per
account. This replaces P2-9's simultaneous multi-device operating model without
changing task data, Backup v4, or the canonical sync record format.

## Contract

- The first valid persisted session establishes the account's active device.
- A later **explicit login** may atomically replace it. The server verifies that
  Supabase created a genuinely newer `auth.sessions` row; a restored old JWT
  cannot reclaim the account by calling the takeover RPC itself.
- Reloading an inactive old device only verifies its lease and shows a locked
  screen. It never performs an implicit takeover.
- Taking over revokes every other `sync_devices` row, revokes its Push endpoint,
  and cancels pending/leased deliveries for that endpoint.
- RLS permits direct reads of account/sync rows only for the active session.
  Existing mutation RPCs already require a non-revoked device.
- Manual logout keeps Supabase's normal account sign-out. A displaced client
  uses local-scope sign-out so it cannot sign out the newly active device.

## Offline trade-off

A strict single-device guarantee and unrestricted offline use cannot coexist:
two disconnected devices cannot ask the server which one is active. The client
therefore fails closed whenever it cannot verify the lease. Local data remains
on the device, but the app content is locked until connectivity returns.

The lease is checked at startup, every five seconds, on window focus, when the
page becomes visible, and after reconnecting. Server reads and sync mutations
are blocked immediately after takeover even before the old UI observes its next
check.

## Remote rollout

1. Apply `supabase/migrations/202608290001_p2_11_single_active_device.sql`.
2. Run `supabase/tests/p2_12_single_device_session.sql` in a disposable
   transaction.
3. Deploy the client from the same reviewed commit.
4. On Device A, verify the existing session and app data.
5. Sign in explicitly on Device B. Device A must lock within five seconds;
   refresh must not unlock it.
6. On Device A choose **Erneut anmelden** and sign in. Device B must then lock.
7. Disable connectivity on the active device: app content must lock without
   deleting local data, and unlock only after a successful online verification.

Rollback is code-first: revert the client gate before removing the server
migration. Dropping the server gate while a fail-closed client is deployed would
leave every client unable to verify its lease.
