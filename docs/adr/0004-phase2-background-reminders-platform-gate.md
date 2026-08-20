# ADR 0004 — Phase 2 background-reminder platform gate

- **Status:** Accepted gate; delivery implementation remains deferred
- **Date:** 2026-08-20
- **Supersedes:** No part of ADR 0001; this ADR turns its findings into a Phase 2 gate
- **Production change in this ADR:** None

## Context

ADR 0001 established that the current foreground timer cannot reliably notify
after the app closes, that a service worker cannot read the app's localStorage,
and that browser Web Push requires identity, synchronized schedule data, a
scheduler and explicit privacy choices. Phase 1 therefore shipped a truthful
foreground-only Reminders screen.

Phase 2 must not weaken that wording merely because authentication or history
exists. Closed-app delivery becomes eligible only after it is proven on the
target Android PWA and desktop browsers.

## Decision

### 1. Preserve the truthful foreground path

Until the platform gate passes, the shipped feature remains foreground-only.
The current Reminders screen must continue to say that delivery can be missed
when the app/browser is closed. Permission “allowed” is not displayed as proof
that scheduling works in the background.

### 2. Evaluate two viable routes, reject timing hacks

The spike compares:

1. **Server-backed Web Push** — preferred web route if real auth/sync already
   exists. The backend stores authorized per-device subscriptions and due UTC
   instants; a service-worker `push` handler displays notifications.
2. **Native wrapper local notifications** — fallback if reliable local OS
   scheduling is a stronger product requirement than remaining pure PWA.

Long `setTimeout`, Wake Lock/audio tricks, one-off Background Sync, Periodic
Background Sync as a clock, or “keep the app alive” are rejected. They do not
provide an honest wall-clock delivery contract.

### 3. Web Push cannot precede sync/timezone foundations

Web Push implementation is blocked until:

- real identity and per-record authorization exist;
- a task schedule is synchronized to the server;
- each scheduled reminder has an IANA timezone and derived UTC instant;
- edit, completion, delete, rollover and recurrence update/cancel the server
  schedule idempotently;
- subscription endpoints and keys are encrypted/redacted and removable;
- the service worker has a privacy-reviewed content strategy that does not rely
  on localStorage;
- duplicate, stale, late and expired-subscription behaviour is specified.

The server uses an atomic claim/lease per occurrence. A simple `sent: boolean`
is insufficient under retries and concurrent dispatchers.

### 4. Delivery claim is “best effort,” never exact

Even a passed Web Push implementation cannot promise an exact minute. Network,
OS battery policy, push service delay, TTL, browser restrictions and device
availability can delay or prevent display. Product copy must expose the intended
time and the best-effort nature of closed-app delivery.

## Time-boxed validation matrix

Run on at least one physical Android device with the installed PWA and one
desktop Chromium browser:

| Case | Foreground | Background | Fully closed | Offline then reconnect | Expected evidence |
|---|---:|---:|---:|---:|---|
| Current foreground timer | yes | measure | no | no | Existing truthful baseline |
| `showNotification()` display path | yes | yes | n/a | n/a | Notification displayed without `new Notification()` crash |
| Web Push prototype | yes | yes | yes | late/drop per explicit TTL | Server send log + worker display + device timestamp |
| Edit/complete/delete before fire | n/a | n/a | n/a | n/a | No stale notification |
| Duplicate send/retry | n/a | n/a | n/a | n/a | One visible occurrence |
| Expired subscription | n/a | n/a | n/a | n/a | Endpoint pruned; user sees recoverable status |
| DST/timezone change | n/a | n/a | n/a | n/a | Recomputed intended local time |

The spike records OS/browser versions, battery mode, intended time, actual
display time and whether the app was foreground/background/terminated. A demo
that works once is not a pass.

## Go/no-go

- **Web Push GO:** closed-app delivery succeeds across the matrix, stale and
  duplicate reminders are suppressed, privacy/authorization review passes, and
  wording remains best-effort.
- **Native wrapper GO:** Web Push cannot meet the user's reliability needs and a
  separately approved mobile-app distribution/maintenance plan exists.
- **NO-GO:** neither route meets the reliability/privacy bar. Keep the truthful
  foreground feature; do not ship a misleading partial background mode.

## Rejected alternatives

| Alternative | Reason |
|---|---|
| Implement push before auth/sync | The backend cannot safely know whose task or current schedule it is sending. |
| Service worker reads localStorage | Not available in service workers. |
| Periodic Background Sync as scheduler | Browser-controlled cadence, not a wall-clock guarantee. |
| Exact-time marketing language | False even for server-backed push. |
| Store full private task text by default in push infrastructure | Unnecessary privacy exposure; content strategy requires explicit review. |

## Consequence

Phase 2 can design week planning and local history without waiting for push.
Background reminders remain a later gated capability. The next engineering step
after schema v2 is not “turn on push”; it is the provider/sync and physical-device
spike described above.
