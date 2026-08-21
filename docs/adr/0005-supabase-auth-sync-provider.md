# ADR 0005 — Supabase for real identity and the sync authority

- **Status:** Accepted for P2-8/P2-9 implementation behind feature flags
- **Date:** 2026-08-21
- **Scope:** P2-7 provider spike; architecture and executable protocol prototype only
- **Production change:** None

## Decision

Use a managed **Supabase** project in the specific AWS region
`eu-central-1` (Frankfurt) for real authentication and the account-owned sync
authority. Keep the current device dataset as the offline working copy. Put the
provider behind `AuthAdapter` and `SyncTransport`; no component or domain hook
may call the vendor SDK directly.

The app will use:

- Supabase Auth with Authorization Code + PKCE for OAuth sign-in;
- verified email/password as the initial non-OAuth recovery path;
- short-lived access tokens and provider-managed refresh sessions;
- Postgres tables protected by RLS policies based on `auth.uid()`;
- one account-owned dataset, opaque device IDs and ordered server revisions;
- a transactional Postgres RPC for idempotent mutation application;
- tombstones and visible conflict records instead of timestamp-only
  last-write-wins;
- the existing provider-independent JSON backup as the user-controlled export
  and rollback boundary.

The static GitHub Pages client may contain only the Supabase project URL and
publishable key. The secret/service-role key must never enter Vite variables,
the repository, browser storage, logs or a backup. Privileged account deletion
must run in a server-side function.

## Why Supabase

| Gate | Supabase | Firebase/Firestore fallback | Decision |
|---|---|---|---|
| Static/PWA auth | Supabase JS supports PKCE and exact redirect allowlists | Firebase Auth supports web identity providers | Supabase |
| Record ownership | Postgres RLS with `auth.uid()` on every row | Firestore Security Rules | Both viable |
| Conflict contract | Transactional Postgres RPC can check base/field revisions and retain conflicts | Offline sync resolves multiple changes to one document with last-write-wins; transactions fail offline | Supabase fits the existing contract |
| EU location | Exact `eu-central-1` is available | Firestore location is selected per resource | Both viable; pin Frankfurt |
| Portability | Standard Postgres, SQL migrations and logical export | Managed NoSQL export requires billing and Cloud Storage | Supabase |
| Cost for spike | Free: 50k MAU, 500 MB DB, 5 GB egress; pauses after inactivity | Free quotas: 1 GiB, 50k reads/day, 20k writes/day | Both viable |
| Production operations | Pro starts at USD 25/month and includes daily backups; choose before real rollout | Usage-based reads/writes/egress | Supabase is simpler to budget for this app |

Firebase remains the rejected fallback for this architecture, not because it is
insecure, but because adopting its automatic last-write-wins offline model would
replace the already accepted visible-conflict contract. Rebuilding a custom
operation log on top of Firestore would remove its primary advantage here.

## Identity and session boundary

1. Configure the production site URL and exact callback URL under
   `https://rassoulebrahimi.github.io/mydailyflow/`; broad production wildcards
   are forbidden.
2. Use `flowType: 'pkce'` and `detectSessionInUrl: true` through `AuthAdapter`.
3. Browser session persistence is provider-managed and namespaced separately
   from every `STORAGE_KEYS` entry.
4. `mdf_auth_session` and all `VITE_FAKE_USER_*` / `VITE_FAKE_PASS_*` handling
   are removed only when the feature-flagged real-auth flow passes every P2-8
   gate.
5. Auth/session material is never included in app backup, recovery snapshots,
   sync payload content, error reports or URLs after the one-time code exchange.
6. TOTP MFA remains opt-in after the first real-auth release; the adapter must
   not prevent adding it.

Because this remains a client-rendered PWA, XSS is the principal browser-session
risk. P2-8 must add a restrictive Content Security Policy, keep third-party
scripts out of the authenticated app shell, and verify that no user-authored
HTML is injected. Moving to an HttpOnly-cookie BFF is a later hosting decision,
not something GitHub Pages can provide by itself.

## Server-side prototype model

The provider implementation should start with these conceptual tables:

| Table | Purpose |
|---|---|
| `datasets` | one account-owned dataset, current ordered revision |
| `devices` | opaque device handle, last observed revision, revocation state |
| `records` | typed entity payload, field revisions, tombstone, server revision |
| `mutation_receipts` | unique mutation ID, device/base/applied revisions, result |
| `conflicts` | both values and touched fields until the user resolves them |

Every table carries `owner_id`; RLS requires `(select auth.uid()) = owner_id`
for reads and writes. The client never supplies a trusted owner. A transactional
RPC derives it from the verified JWT, locks the dataset revision, rejects a
foreign device/dataset, returns an existing receipt on retry, applies safe
different-field changes, and records same-field or delete/edit races as a
conflict.

The executable contract is in `spikes/p2-7-auth-sync/protocol.ts`, with synthetic
two-device coverage in `tests/authSyncProtocol.test.ts`. It is intentionally not
production code.

## First sign-in reconciliation

Signing in does not immediately enable writes. The flow is:

1. Capture the exact raw managed local values and produce a verified local
   recovery point and downloadable Backup v4.
2. Fetch only the account manifest: dataset ID, revision, item counts, latest
   activity, digest and deletion status. Do not fetch/apply records yet.
3. Show local and account manifests side by side.
4. Require one explicit choice:
   - empty/empty: start empty;
   - local/non-empty + account/empty: preview and upload this device;
   - local/empty + account/non-empty: preview and use account data;
   - both non-empty: merge with conflicts or keep this device separate.
5. Apply the selected operation under one reconciliation ID. A retry returns the
   original receipt and cannot duplicate records.
6. Verify the resulting local snapshot before enabling normal sync. On any
   failure, restore the exact captured local bytes and leave remote reconciliation
   marked incomplete.

There is no automatic remote-wins or local-wins path.

## Sync contract

- Local writes remain immediate and append an outbox mutation.
- Each mutation contains `mutationId`, `deviceId`, `entityKey`, operation,
  `baseRevision` and touched fields. Client timestamps are audit/display data.
- Server revision is the ordering authority.
- Different fields may auto-merge only if neither changed after the shared base.
- Same-field edits, completion/undo races and delete/edit races create visible
  conflicts; neither value is discarded.
- Deletions remain tombstones for at least 30 days and until every non-revoked
  device has observed the tombstone.
- Recurrence and rollover creation keep their source identity as a uniqueness
  constraint so retries/two devices cannot generate duplicates.
- Essentials progress uses a named domain operation and mutation receipt, never
  blind replacement of the whole day object.
- The UI exposes `Nur lokal`, `Synchronisiert`, `Ausstehend`, `Konflikt` and
  `Offline`; it never presents sign-in as proof of synchronization.

## Export and deletion safety

- “Download my data” builds the existing provider-independent backup from a
  verified synchronized snapshot, not a vendor dump.
- Account deletion requires recent re-authentication, a downloadable export,
  explicit typed confirmation, revocation of devices/sessions and server-side
  deletion with `on delete cascade`.
- The access-token expiry remains short because deleting an Auth user revokes
  refresh sessions but cannot retroactively revoke an already-issued stateless
  JWT before its expiry.
- The deletion receipt contains no task text and is retained only for the legal/
  operational minimum documented before production.

## Cost and operational decision

The Free plan is acceptable only for P2-8 development and synthetic testing; it
can pause after a week of inactivity and lacks production backup guarantees.
Before inviting real users, choose Supabase Pro (currently starting at USD 25 /
month) or document why the service can safely tolerate Free-plan suspension.
Enable spend controls/alerts, Frankfurt residency, daily logical export to a
separate operator-controlled location and restore drills. Pricing and DPA terms
must be rechecked immediately before purchase because they can change.

## P2-8 implementation gates

- A Supabase account/project exists in exact Frankfurt region; no production
  user data is used during development.
- Exact production/local redirect allowlists and email verification/recovery are
  proven on desktop and installed Android PWA.
- RLS negative tests prove user A cannot select, insert, update or delete user B.
- Publishable key only in the client; secret/service-role key scanner is green.
- The four first-sign-in paths have preview, Backup v4 gate and byte-exact local
  rollback tests.
- Feature flag defaults OFF; disabling it restores the current demo gate without
  migrating or deleting local data.
- Account export and deletion pass end-to-end in a synthetic project.
- No production sync starts in P2-8; P2-9 owns outbox/conflict implementation.

## Sources checked for this spike

- Supabase PKCE: https://supabase.com/docs/guides/auth/sessions/pkce-flow
- Supabase sessions: https://supabase.com/docs/guides/auth/sessions
- Supabase redirect allowlists: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase regions: https://supabase.com/docs/guides/platform/regions
- Supabase MFA: https://supabase.com/docs/guides/auth/auth-mfa
- Supabase user deletion/export: https://supabase.com/docs/guides/auth/managing-user-data
- Supabase pricing: https://supabase.com/pricing
- Firebase offline conflict behaviour: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firebase transactions: https://firebase.google.com/docs/firestore/manage-data/transactions
- Firebase pricing: https://firebase.google.com/pricing
