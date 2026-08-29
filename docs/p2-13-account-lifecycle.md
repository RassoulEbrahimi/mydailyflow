# P2-13A — account lifecycle and production-auth safety

P2-13A completes the user-facing account lifecycle on the Frankfurt test
project. It stays behind `VITE_ACCOUNT_LIFECYCLE_ENABLED=false` by default and
does not create or switch to a production Supabase project.

## Shipped contract

- Settings shows the authenticated email, confirmation state, active-device
  state and the most recent successful lease verification.
- Unconfirmed users can request another confirmation email without exposing
  whether another address exists.
- An in-session password change requires the current password, a distinct new
  password of at least 12 characters, and exact confirmation.
- Lost-device recovery is the P2-12 explicit-login takeover: a fresh login
  atomically becomes the only active device.
- Account deletion requires a current valid Backup v4 download, no local data
  change after that export, the exact account email, and the exact phrase
  `KONTO LÖSCHEN`.
- The browser never receives an admin key. The authenticated `delete-account`
  Edge Function validates the caller with `auth.getUser()`, then verifies the
  origin, exact active device lease and both confirmations before performing a
  hard Auth deletion. Supabase's legacy-secret pre-verifier stays OFF so modern
  user access tokens reach that custom verification path. Existing foreign keys
  cascade account-owned sync, reconciliation and reminder rows.
- Existing conflict records and their recovery controls remain readable. They
  are legacy recovery evidence, not an advertised multi-device workflow.

## Rollout gate

1. Verify the GitHub Pages URL in Auth Site URL and Redirect URLs.
2. Deploy `delete-account` with the legacy-secret verifier disabled; keep its
   custom `auth.getUser()` verification and allowed origin
   `https://rassoulebrahimi.github.io` enabled.
3. Enable the lifecycle flag only on the test deployment.
4. Verify email confirmation and password recovery using a disposable account.
5. Verify password change, single-device takeover and settings layout.
6. Exercise deletion only with a disposable account after downloading Backup
   v4; verify Auth and every account-owned row are gone.

Production promotion, custom SMTP and operational monitoring are P2-13B.
