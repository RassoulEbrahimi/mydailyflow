# P2-8 Supabase test setup

This phase enables real identity and a first-sign-in reconciliation **preview**.
It does not upload or download tasks. Normal sync remains P2-9.

## Project controls

- Organization: synthetic/test organization only.
- Region: `eu-central-1` (Frankfurt).
- Data API: enabled.
- Automatically expose new tables: disabled.
- Automatic RLS: enabled.
- Never put a secret/service-role key in Vite, Git, browser storage, logs or a backup.

Apply `supabase/migrations/202608210001_p2_8_auth_reconciliation.sql` with the
Supabase SQL editor or CLI. The migration exposes only account manifests and
prepared reconciliation intents; there is no record-payload table.

## Authentication URLs

Set the Auth Site URL to exactly:

`https://rassoulebrahimi.github.io/mydailyflow/`

Add these exact redirect URLs (no production wildcard):

- `https://rassoulebrahimi.github.io/mydailyflow/`
- `http://localhost:3000/mydailyflow/`

Keep email confirmation enabled. Password recovery uses the same exact callback.

## Client configuration

Copy only the project URL and **publishable** key:

```dotenv
VITE_REAL_AUTH_ENABLED=false
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

The committed/default flag is `false`. Turn it on only in a test build after the
redirect allowlist, migration and RLS negative tests pass. Turning it off returns
to the demo gate without reading, migrating or deleting local app data.

## P2-8 acceptance boundary

1. Sign-up requires email verification; sign-in and password recovery reach a
   dedicated new-password screen before the reconciliation flow.
2. The client reads only `datasets` manifest columns.
3. Before a reconciliation intent, Backup v4 is parsed/validated and a byte-exact
   `first-sign-in` recovery snapshot is written and verified.
4. The RPC stores only manifests and a prepared choice. It never stores task text.
5. Authenticated clients can select only their own dataset manifest. Direct table
   writes are revoked; the security-definer RPC owns the only P2-8 write path.
6. User A cannot read, insert, update or delete User B rows.
7. No SDK call exists in task, essential, focus or template hooks.
