# P2-10 — server-backed background reminders

## Release state

The implementation is complete behind `VITE_BACKGROUND_REMINDERS_ENABLED`,
which is strict and defaults to OFF. A normal frontend deployment without that
flag preserves the existing foreground-only behaviour and wording.

This document is an activation runbook, not authorization to create keys,
install database objects or enable public delivery. Activation is a separate,
controlled operation after explicit approval.

## Architecture and privacy boundary

1. The browser asks for notification permission only from the explicit
   **Auf diesem Gerät aktivieren** action.
2. The Push subscription is associated with the already authenticated sync
   device. Its capability URL and keys are encrypted in Supabase Vault.
3. Reconciliation sends only an opaque task id, local date and local time. Task
   titles, notes and checklist text never cross the scheduling boundary.
4. PostgreSQL derives the UTC due instant from the supplied IANA timezone and
   creates one delivery per active subscription and schedule generation.
5. The dispatcher atomically leases due deliveries, sends a generic payload and
   records sent/retry/expired-subscription outcomes.
6. The service worker displays the generic German text
   `Eine geplante Aufgabe beginnt bald.` and focuses or opens the app when the
   notification is selected.

Delivery is best effort. Network state, browser push services, OS battery
policy and subscription expiry can delay or prevent a notification.

## Fail-closed configuration

The client capability requires all of the following:

- `VITE_REAL_AUTH_ENABLED=true`
- `VITE_SYNC_ENABLED=true`
- `VITE_BACKGROUND_REMINDERS_ENABLED=true`
- `VITE_VAPID_PUBLIC_KEY=<public base64url key>`

The dispatcher requires server-side secrets only:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (a `mailto:` or HTTPS contact)
- `P2_PUSH_DISPATCH_TOKEN`
- `SUPABASE_SECRET_KEY`, or the legacy hosted fallback
  `SUPABASE_SERVICE_ROLE_KEY`

Private keys and dispatch tokens must never use the `VITE_` prefix or enter the
repository, frontend bundle, browser storage, backup files or logs.

## Controlled activation order

1. Generate a VAPID keypair and an independent high-entropy dispatch token
   without printing either secret.
2. Apply `202608270001_p2_10_background_reminders.sql` to the Frankfurt test
   project and run `supabase/tests/p2_10_background_reminders_rls.sql` in a
   disposable transaction.
3. Store dispatcher secrets with Supabase Edge Function secrets and deploy
   `dispatch-reminders`.
4. Store the dispatcher URL and bearer token in Supabase Vault, then create a
   `pg_cron`/`pg_net` job that POSTs to the function once per minute. Keep this
   scheduler step outside the schema migration so rollback does not leave a
   live sender behind.
5. Build the frontend with the public VAPID key and all three flags enabled,
   deploy only to the controlled test URL, and activate one synthetic account.
6. Execute the physical-device matrix below. If it passes, decide separately
   whether to stage wider activation.

Example scheduler shape (placeholders only; never paste literal secrets into
SQL history):

```sql
select cron.schedule(
  'mdf-dispatch-reminders',
  '* * * * *',
  $$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets
              where name = 'mdf_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret
          from vault.decrypted_secrets where name = 'mdf_dispatch_token')
      ),
      body := '{}'::jsonb
  );$$
);
```

## Acceptance matrix

Record intended and observed timestamps, browser/OS versions, install state and
battery mode for each case on one physical Android PWA and desktop Chromium:

| Case | Required result |
|---|---|
| App foreground/background/fully closed | Generic notification is observed or an honest best-effort miss is recorded |
| Edit time before dispatch | Old generation is cancelled; only the new time may notify |
| Complete/delete before dispatch | No stale notification |
| Offline, then reconnect before TTL | At most one late notification within TTL |
| Offline past TTL | No stale notification |
| Duplicate dispatcher invocation | At most one visible occurrence per subscription/generation |
| Expired subscription (404/410) | Subscription is revoked and its Vault secret removed |
| Timezone/DST change | Reconciliation derives the correct new UTC instant |
| Sign out / device disable | Subscription is revoked and pending deliveries are cancelled |

## Rollback

1. Set `VITE_BACKGROUND_REMINDERS_ENABLED=false` and deploy the frontend.
2. Unschedule the cron job.
3. Revoke/remove dispatcher secrets and undeploy the Edge Function if desired.
4. Revoke subscriptions through the RPC before dropping database objects.

The foreground reminder path remains available throughout rollback.
