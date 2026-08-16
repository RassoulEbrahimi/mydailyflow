# ADR 0001 — Background reminders feasibility

| | |
|---|---|
| **Status** | Accepted (decision approved; implementation deferred) |
| **Date** | 2026-08-17 |
| **Decision owner** | Rassoul Ebrahimi (repository owner) |
| **Spike branch** | `claude/pr1-background-reminders-spike-jvnh44` |
| **Base commit** | `b12d98868b57e10958d60cc79533e42bd232050c` |
| **Focused time spent** | **≈ 3 hours** of a 6-hour / 1-engineer-day box. Stopped early: the decisive evidence (§5, §6) was conclusive, and the box is a ceiling, not a target. |
| **Supersedes / superseded by** | — |

This is a **feasibility spike**. No production code, test, or asset was changed. The
only tracked artefact is this document.

---

## 1. Product requirement and target platforms

Determine what architecture can *truthfully* support task reminders when:

* the app tab is backgrounded;
* the browser tab is closed;
* the installed Android Chrome PWA is not open;
* the device temporarily loses connectivity;
* a task is edited, completed, deleted, rolled over, or rescheduled.

| Target | Priority |
|---|---|
| Installed PWA on current Android Chrome | **Primary** |
| Desktop Chrome | Secondary |

The app is deployed as a **static site on GitHub Pages** (`vite.config.ts` `base: '/mydailyflow/'`),
with all task data in `localStorage` and no server involved in the task lifecycle.
That constraint drives the entire analysis.

---

## 2. Reliability terminology — six independent dimensions

These are **separate, orthogonal properties**. A mechanism can satisfy one and
fail another, and the common mistake this ADR exists to prevent is collapsing
them. In particular, **"reliable eventual delivery" and "exact-time delivery"
are not synonyms**, and neither follows from the ability to wake the app.

| # | Dimension | Question it answers | Possible values |
|---|---|---|---|
| **D1** | **Page-alive / foreground execution** | Does this need a live page running JS? | Requires a live page · Runs without a page |
| **D2** | **Ability to wake a service worker while the app is closed** | Can anything start the worker with no tab, no window, and the PWA shut? | Cannot wake · Can wake |
| **D3** | **Scheduling authority** | Who decides *when* the moment occurs? | Device page (a `setTimeout`) · User agent / OS (discretionary) · Server (authoritative) |
| **D4** | **Delivery behaviour while offline** | What happens if the device has no connectivity at the moment? | Unaffected (purely local) · Queued and delivered late · Dropped |
| **D5** | **Exact-time guarantee** | Does it display at the intended wall-clock minute, within seconds? | Guaranteed · Not guaranteed |
| **D6** | **Best-effort / eventual delivery** | If not exact, does it arrive *at all*, eventually? | Eventual delivery expected · No delivery contract |

### 2.1 What this means for Web Push specifically

Stated plainly, because these three facts are routinely conflated:

* **Web Push can wake the service worker while the app is closed** (D2). This is
  the capability no client-only mechanism has.
* **A server can authoritatively decide when to send** (D3). Scheduling moves off
  the device, so it survives the tab closing, the app being shut, and reboots.
* **Neither fact guarantees display at the intended wall-clock minute** (D5).

Delivery can be delayed or prevented by: network conditions; push-service
behaviour and queuing; OS battery policy (Android Doze / App Standby); browser
restrictions on background work; message **TTL** expiry; **subscription expiry or
invalidation**; and simple device unavailability (powered off, no connectivity
for longer than the TTL).

So Web Push offers **good eventual delivery** (D6) and **authoritative
scheduling** (D3) and **wake-while-closed** (D2) — but **no exact-time
guarantee** (D5). Any product wording must reflect that distinction.

---

## 3. Current implementation, with exact source references

### 3.1 `src/hooks/useReminders.ts` — in-page timers only

| Fact | Location |
|---|---|
| In-page `setTimeout` is the only scheduling mechanism | `src/hooks/useReminders.ts:62` |
| 10-minute lead time before task time | `src/hooks/useReminders.ts:47` — `const reminderTargetTime = taskTimeMs - 10 * 60000;` |
| Maximum 24-hour scheduling horizon | `src/hooks/useReminders.ts:52` — `if (timeToWait > 0 && timeToWait <= 24 * 60 * 60 * 1000)` |
| Uses the **page** `new Notification(...)` constructor | `src/hooks/useReminders.ts:63` |
| Timers cleared on unmount | `src/hooks/useReminders.ts:16-21` |
| Timers cleared/rescheduled on task or toggle change | `src/hooks/useReminders.ts:29-30`, `:58-61`, `:76-81` |
| Skips completed / opted-out / untimed tasks | `src/hooks/useReminders.ts:39-41` |
| Reschedules when a task's target time changes | `src/hooks/useReminders.ts:58` — `existing.targetTime !== reminderTargetTime` |

The hook is well written *for what it is*: deduplication, edit detection, and
cleanup are all correct. Its ceiling is architectural, not qualitative — a
`setTimeout` cannot outlive its page (D1, D2).

### 3.2 `public/service-worker.js` — cache/fetch/update only

Complete handler inventory (verified by grep, `public/service-worker.js`):

| Handler | Line | Purpose |
|---|---|---|
| `install` | `:14` | precache app shell |
| `activate` | `:27` | drop old caches, `clients.claim()` |
| `fetch` | `:42` | network-first HTML, stale-while-revalidate assets |
| `message` | `:99` | `SKIP_WAITING` for the update banner |

**Absent:** `push`, `notificationclick`, `periodicsync`, `sync`, and any
scheduled-notification handler. Verified — the grep for
`push|notificationclick|periodicsync|showTrigger|TimestampTrigger|showNotification`
over `public/service-worker.js` returns nothing.

### 3.3 `src/main.tsx` — registration and scope

`src/main.tsx:12-21` registers `/mydailyflow/service-worker.js` on `window.load`.
Scope is therefore `/mydailyflow/`, matching the GitHub Pages base path. The
registration is fire-and-forget; failures are logged only (`src/main.tsx:19-21`).

### 3.4 `src/components/SettingsModal.tsx` — current wording

| Element | Line | Text |
|---|---|---|
| Section heading | `:130` | „Benachrichtigungen" |
| Permission state | `:48-52` | „Erlaubt" / „Blockiert" / „Nicht konfiguriert" |
| Granted banner | `:150-151` | **„Erinnerungen aktiviert ✓"** / „Benachrichtigungen sind erlaubt." |
| Scheduling toggle | `:158` | „Erinnerungen planen" |
| Enable button | `:174` | „Erinnerungen aktivieren" |

**This wording overstates the current capability.** „Erinnerungen aktiviert ✓"
reads as an unconditional promise, while delivery is in fact foreground-only
(D1) everywhere, and on the primary target the constructor path is expected to
fail outright (§6.1). Correcting this is PR 2's job (§15).

### 3.5 Task model, preference, and backup behaviour

| Fact | Location |
|---|---|
| Per-task opt-out flag `reminderEnabled?: boolean` | `src/types/task.ts:32`, validated at `:79` |
| Set from the task form | `src/components/NewTaskModal.tsx:118` (default `true`, `:58`/`:69`) |
| Global preference `remindersEnabled` in `localStorage` | `src/App.tsx:112-113`, persisted `:165-167` |
| Preference is a backup-managed key | `src/utils/appStorage.ts:48`, `:61` |
| Preference travels in exported backups | `src/types/backup.ts:18-23` (`BackupPreferences`, `remindersEnabled` at `:20`) |
| Tasks carry no server identity, no push subscription, no device id | `src/types/task.ts:13-33` |

All reminder state is **local and device-scoped today**. Nothing in the model
anticipates a server, a subscription, or a second device.

### 3.6 Existing backend

`server.js` is a stateless Express service (`server.js:198` listens on
`process.env.PORT || 3001`) exposing only `/api/health` (`:23`) and
`/api/voice-task/transcribe` (`:134`). `Dockerfile` is Cloud Run-shaped
(`EXPOSE 8080`, `ENV PORT=8080`). `.gcloudignore` excludes `src/`, `public/`,
`dist/` — it deploys the API only. There is **no database wired up** (the
`better-sqlite3` dependency is unused by `server.js`) and **no scheduler**.

---

## 4. Official evidence

All sources retrieved **2026-08-17**. `developer.mozilla.org`, `web.dev`,
`developer.chrome.com`, `w3.org` and `chromestatus.com` are blocked by this
environment's egress proxy, so MDN and Chrome documentation were read from
**their own official source repositories** on `raw.githubusercontent.com` —
the same content, from the publisher's repository of record. Canonical URLs are
given alongside for the reader.

| # | Source | Canonical URL / retrieved from | Key statement |
|---|---|---|---|
| S1 | MDN — `Notification()` constructor | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/notification/notification/index.md) | "This constructor throws a `TypeError` when called in **nearly all mobile browsers**, and this is unlikely to change… Instead, you need to register a service worker and use `ServiceWorkerRegistration.showNotification()`. See [Chrome issue #481856](https://crbug.com/481856)." |
| S2 | Chrome for Developers — Notification Triggers | [canonical](https://developer.chrome.com/docs/web-platform/notification-triggers) · [retrieved](https://raw.githubusercontent.com/GoogleChrome/developer.chrome.com/main/site/en/docs/web-platform/notification-triggers/index.md) (doc updated 2021-12-03) | "The development of Notification Triggers API… **is no longer pursued.** … it is not clear that we would be able to provide a solid, consistent, and reliable experience across platforms." Also notes the API needed a way "to prune stale or invalidated scheduled notifications… without relying on the tab being open", that Periodic Background Sync's cadence "is not sufficient for this", and that "by virtue of being required to show a notification, the Push API is not a good solution either." |
| S3 | MDN — Web Periodic Background Synchronization API | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/web_periodic_background_synchronization_api/index.md) | Status **experimental**. "The minimum time interval is set when the API is invoked; **however the user agent might also take into account other factors** which affect when the service worker receives the event. For instance previous website engagement, or connection to a known network." Spec: WICG, not a W3C Recommendation. |
| S4 | MDN — Background Synchronization API | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/background_synchronization_api/index.md) | "enables a web app to **defer tasks so that they can be run in a service worker once the user has a stable network connection**"; the `sync` event fires "**as soon as the network becomes available**". Trigger is connectivity, never a clock. |
| S5 | MDN — Push API | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/push_api/index.md) | "gives web applications the ability to receive messages pushed to them from a server, **whether or not the web app is in the foreground, or even currently loaded**". Also: the subscription endpoint "is a unique capability URL: knowledge of the endpoint is all that is necessary to send a message to your application. The endpoint URL therefore **needs to be kept secret**." |
| S6 | MDN — `ServiceWorkerRegistration.showNotification()` | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/serviceworkerregistration/shownotification/index.md) | Rejects if permission is not granted or the worker is not `activating`/`activated`. This is the mobile-supported path for displaying a notification. |
| **S7** | **MDN — Using Service Workers** | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/service_worker_api/using_service_workers/index.md) | "**The Web Storage API (`localStorage`) works in a similar way to service worker cache, but it is synchronous, so not allowed in service workers.**" and "**IndexedDB can be used inside a service worker for data storage if you require it.**" |
| **S8** | **MDN — `PushManager.subscribe()`** | [canonical](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe) · [retrieved](https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/pushmanager/subscribe/index.md) | `applicationServerKey` is "A **P-256 public key** that the push server will use to authenticate your application server. If specified, all messages from your application server must use the [VAPID](https://datatracker.ietf.org/doc/html/rfc8292) authentication scheme". Also: Chrome and Edge "will reject the Promise if `userVisibleOnly` is not set to `true`", and "`subscribe()` calls **should be done in response to a user gesture**". |
| **S9** | **W3C — Push API** | [https://www.w3.org/TR/push-api/](https://www.w3.org/TR/push-api/) | Normative specification for the architecture relied on in §13. **Not retrievable in this environment** (`w3.org` egress-blocked), so no text is quoted from it here; the behavioural claims used in this ADR rest on S5 and S8. Read it before committing to the push design (§16, R9). |

**Not retrievable in this environment** (egress-blocked): the W3C Push API
specification (S9), the WICG Periodic Background Sync spec text,
`chromestatus.com` entries, the Chromium blink-dev intent threads, official
Cloud Scheduler / Cloud Run pages, and Capacitor docs. Statements that would have
relied on those are labelled **engineering inference** and flagged in §16.

---

## 5. Experiments

### 5.1 Setup

* Chromium **141.0.7390.37** (headless), driven by the repository's pinned
  Playwright 1.56.1.
* Throwaway page + service worker served from `http://localhost:8909`
  (a secure context, so service workers are permitted).
* Everything lived outside tracked paths, in the session scratchpad, and was
  deleted afterwards. No product file was touched, no VAPID key generated, no
  cloud resource created, no real push sent, and no real task, credential,
  subscription, or backup used.

Reproduce by serving any static page with a service worker over `localhost` and
running the feature-detection block in §5.2 from DevTools.

### 5.2 Results (observed)

| Probe | Result |
|---|---|
| `typeof Notification` | `"function"` |
| `'showTrigger' in Notification.prototype` | **`false`** |
| `typeof TimestampTrigger` | **`"undefined"`** |
| `new Notification(...)` on desktop Chromium | **did not throw** |
| `typeof PushManager` / `registration.pushManager` | `"function"` / present |
| `typeof SyncManager` / `registration.sync` | `"function"` / present |
| `typeof PeriodicSyncManager` / `registration.periodicSync` | `"function"` / present |
| `registration.pushManager.subscribe({ userVisibleOnly: true })` | **`AbortError` — "Registration failed - missing applicationServerKey, and manifest empty or missing"** |
| `registration.showNotification(...)` | `TypeError` — "No notification permission has been granted" |
| `registration.sync.register(...)` | `UnknownError` — "Background Sync is disabled." |
| `registration.periodicSync.register(...)` | `UnknownError` |
| Service worker after the last client closed | remained registered; **nothing in the platform re-invoked it on a timer** |

### 5.3 What these results do and do not prove

**Proven here:**

* **Notification Triggers is not available** in current Chromium — no
  `TimestampTrigger`, no `showTrigger`. This corroborates S2's "no longer
  pursued". *Option 5 is closed.*
* Interfaces for push and both syncs *exist* on desktop Chromium, so
  feature-detection alone would be misleading — presence ≠ usable capability.
* Nothing in the platform re-invoked the worker on a wall-clock timer once the
  last client closed (D2 for client-only mechanisms).

**What the `AbortError` does and does not establish.** It proves only that
**Chromium requires an `applicationServerKey` to create the subscription that was
tested**. It does **not** by itself prove that a backend is required, and this
ADR does not use it that way:

* `applicationServerKey` is the **public** VAPID key (P-256) and **normally
  belongs in the client** — shipping it in the bundle is the expected design
  (S8). Only the corresponding **private** key must remain protected, server-side.
* Chrome and Edge additionally reject the promise unless `userVisibleOnly: true`
  (S8), which is why the probe used it.

The server requirement is established instead by **the Push API architecture
itself**: a push message must be *sent* by an application server, signed with the
protected VAPID private key, at the moment the reminder is due (S5, S9). Something
must hold that key, hold the schedule, and be awake at the right minute. That is
a backend — not a conclusion drawn from an error message.

**Environment artefacts, NOT platform facts** — this headless sandbox
hard-denies notification permission and reports "Background Sync is disabled":

* the `showNotification` failure,
* the `sync` / `periodicSync` registration failures.

They say nothing about real Chrome behaviour and are **not** used as evidence
for any conclusion below. The corresponding real-device checks are listed in §16.

**Not tested at all:** anything on physical Android, installed-PWA behaviour,
and actual push delivery. Deliberately so — the brief forbids real push to
personal devices and cloud resources.

---

## 6. Capability matrix

Columns map to the dimensions in §2. "Wake source" answers D2; "scheduling
authority" answers D3.

| # | Option | Works with page closed (D1/D2) | Wake source (D2) | Scheduling authority (D3) | Offline behaviour (D4) | Delivery-timing guarantee (D5/D6) | Server required | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Page `setTimeout` + `new Notification` *(current)* | **No** — dies with the page | None | Device page | Unaffected (purely local) — but only while the page lives | Exact **only while the page is alive**; otherwise no delivery at all | No | **Foreground-only.** Constructor path also expected to fail on the primary target (§6.1) |
| 2 | `ServiceWorkerRegistration.showNotification()` | Displays without a page, but **cannot start itself** | Whatever invoked the worker | None — it is a display call, not a scheduler | n/a | n/a | No | Required for mobile display; **not a scheduler** |
| 3 | One-off Background Sync | Yes, when the event fires | Network connectivity returning (S4) | User agent | Fires *because* connectivity returned | **Cannot express a wall-clock time at all** | No | **Cannot express "at 09:50"** |
| 4 | Periodic Background Sync | Sometimes | User agent, on its own cadence (S3) | User agent — `minInterval` is a floor, not a promise; influenced by engagement and network | May be deferred indefinitely | **No timing contract**; best-effort at a coarse cadence | No | **Best-effort only.** Chrome itself calls the cadence insufficient for pruning stale notifications (S2) |
| 5 | Notification Triggers / `TimestampTrigger` | Would have | OS-scheduled | Device, ahead of time | Would have been unaffected | Would have been exact | No | **Dead.** "No longer pursued" (S2); absent in Chromium 141 (§5.2) |
| 6 | Web Push (Push API + `push` handler) | **Yes** (S5) | **Push service message** — wakes the worker with no page open | **Server** — authoritative | Queued by the push service subject to **TTL**; delivered late on reconnect, or dropped if TTL expires | **Eventual delivery expected; NOT an exact-time guarantee.** Network, push-service behaviour, OS battery policy, browser restrictions, TTL, subscription expiry and device availability can all delay or prevent it | **Yes** | **The only investigated standards-based browser route that can wake the app while closed. Viable for server-initiated reminders, but not an exact-time delivery guarantee.** |
| 9 | Native wrapper (e.g. Capacitor) + OS local notifications | Yes | OS alarm/scheduler | Device, ahead of time | Unaffected — fully local | Close to exact, subject to Android Doze | No server, but a **native app and store distribution** | Viable later; large scope change |

### 6.1 The finding that matters most

**The current constructor path is expected to fail on most mobile browsers,
including the target Android Chrome scenario, based on MDN guidance;
physical-device confirmation remains R1.**

`useReminders.ts:63` calls `new Notification(...)`. Per **S1**, that constructor
"throws a `TypeError` when called in nearly all mobile browsers, and this is
unlikely to change". Android Chrome is within that description; the supported
path is `ServiceWorkerRegistration.showNotification()` (S6).

If that expectation holds on device, reminders on the installed Android Chrome
PWA fail **even in the foreground with permission granted** — the timer fires and
the constructor throws. Desktop Chrome is unaffected (§5.2: the constructor did
not throw there).

This is classified as a **high-priority probable defect**, not a confirmed one.
It has **not** been observed on physical hardware (§16, R1), and it is the single
highest-value thing to validate. It is also cheap: open the installed PWA, grant
permission, schedule a task ~11 minutes out, watch the remote-debug console.

**Note on the fix.** Migrating to `ServiceWorkerRegistration.showNotification()`
corrects *mobile display compatibility only*. It does **not** add background
scheduling — the trigger would still be an in-page `setTimeout` (D1). PR 2 should
make that migration only **after the target-device check (R1)**, or alongside
automated/browser coverage that exercises the path, so the change is verified
rather than assumed.

---

## 7. Browser / PWA lifecycle limitations

* **A `setTimeout` dies with its page.** Closing the tab, closing the PWA, or
  the OS discarding the process cancels every pending reminder. The 24-hour
  horizon (`useReminders.ts:52`) is irrelevant in practice: what bounds delivery
  is how long the page stays alive, usually minutes.
* **On reopen, timers are rebuilt from `localStorage`, and anything whose moment
  has passed is silently skipped** — `timeToWait > 0` (`useReminders.ts:52`)
  excludes past times. A missed reminder is never delivered late; it simply
  never happens, with no record that it was due.
* **A service worker is not a background process.** It is event-driven and
  terminated aggressively when idle. Nothing in the platform re-invokes it on a
  wall-clock timer (§5.2). Without push, there is no clock-driven wake-up (D2).
* **A service worker cannot read `localStorage`** (S7). This is a hard
  architectural constraint on any design where the worker must display task
  content with no page open — see §8.3.
* **Android Doze / App Standby / battery optimisation** defer background work
  for non-foreground apps. *(Engineering inference — the Android developer
  documentation was reachable but not read in depth within the time box; see §16 R5.)*
* **Storage eviction.** Under storage pressure a UA may evict origin data,
  taking `localStorage` tasks *and* the service worker registration with it.
  The app has no server copy, so evicted data is gone unless the user exported a
  backup. This is a pre-existing data-durability risk, not one introduced here.
* **Device reboot** clears all in-page timers by definition. Nothing re-arms
  them until the user opens the app.

---

## 8. Security and privacy implications

Only relevant if Web Push (option 6) is later adopted.

### 8.1 Keys, endpoints and permission

* **The push endpoint is a capability URL.** Per S5, "knowledge of the endpoint
  is all that is necessary to send a message to your application… The endpoint
  URL therefore needs to be kept secret." Storing endpoints server-side creates
  a disclosure-sensitive asset that today's architecture does not have.
  Endpoints and subscription keys require **protection at rest** and **explicit
  redaction in logs and error reporting**.
* **Public vs private VAPID key.** The `applicationServerKey` passed to
  `subscribe()` is the **public** P-256 key and is expected to ship in the client
  bundle (S8). The **private** key must live only in the server environment
  (Secret Manager or equivalent) — never in the repository, never in the Vite
  bundle. Note that `.env.example` already documents `VITE_FAKE_USER_*` /
  `VITE_FAKE_PASS_*` credentials that are, by design, **visible in the client
  bundle** (`src/utils/fakeAuth.ts:1-7` says so explicitly). A push deployment
  must not extend that pattern to the VAPID **private** key.
* **Permission and user gesture.** Push subscription depends on notification/push
  permission and must be initiated from an explicit user gesture (S8:
  "`subscribe()` calls should be done in response to a user gesture"). Browser
  permission UX varies and must be validated on the target installed PWA; do not
  assume two separate prompts. Chrome and Edge additionally require
  `userVisibleOnly: true` (S8), which commits the app to showing a notification
  for every push received.

### 8.2 Identity, authorization and abuse

* **`deviceId` is not authentication or authorization.** It is an opaque
  correlation handle. Anyone who guesses or replays one must not thereby gain the
  ability to read, write, or schedule anything.
* **Every subscription and scheduling route requires authenticated ownership,
  authorization, abuse prevention and rate limiting.** Without them, the
  scheduling endpoint is an open relay for pushing arbitrary notifications to
  other people's devices.
* **CORS is not an authorization mechanism.** It constrains browser callers only;
  it stops nothing that is not a browser.
* **The current fake-auth system is insufficient** for any of this
  (`src/utils/fakeAuth.ts:1-7`: "NOT SECURE… Remove this entire auth layer before
  any real production deployment"). A real per-account identity model is a
  prerequisite, not a follow-up.

### 8.3 Where the notification content comes from — an open decision

Today every task stays in `localStorage`, and the backup format deliberately
excludes the session key (`src/utils/appStorage.ts:38-42`). Server-side reminders
put pressure on that property, and the obvious mitigation does not work:

> **A service worker cannot read `localStorage`.** Web Storage is synchronous and
> is therefore not available inside service workers; **IndexedDB is available**
> (S7). The existing task store is `localStorage`, so **the worker cannot read
> the current task store to recover a title**.

Consequently a **truly content-free push can display only a generic
notification** ("Du hast eine Erinnerung"), with no task title. To display the
task title while no page is open, one of these must be chosen **explicitly**:

| Option | Mechanism | Privacy | Offline | Storage architecture |
|---|---|---|---|---|
| **C1** | Include encrypted task content **in the push payload** | Task text leaves the device and transits the push service (encrypted per Web Push encryption) | Works without extra fetch | No client storage change |
| **C2** | **Mirror minimal reminder data into IndexedDB** for service-worker access | Task text stays on the device | Works fully offline | **New client-side store**; must be kept in sync with `localStorage` and included in backup/restore reasoning |
| **C3** | **Fetch authorized reminder content from the backend** in the `push` handler | Task text stored server-side; needs authenticated fetch | **Fails when offline** — falls back to generic text | Server becomes the source of truth for reminder content |

Each choice changes privacy posture, offline behaviour and storage architecture.
**This is an open decision for the future push phase and must be made
deliberately, not defaulted into.** It also interacts with `userVisibleOnly`
(§8.1): a notification must be shown even if content retrieval fails, so a
generic fallback string is mandatory in all three options.

---

## 9. Operational cost and maintenance

Options 1–5 and 9 add no running cost. Option 6 does:

| Component | Note |
|---|---|
| Subscription store | New persistent datastore. None exists today — `server.js` is stateless and `better-sqlite3` is unused. **Cloud Run's filesystem is ephemeral and it scales to zero**, so SQLite on the instance is not viable; a managed database is required. |
| Scheduler | Something must fire at the right minute. Cloud Run cannot hold timers across scale-to-zero, so a scheduler (e.g. Cloud Scheduler) plus a due-reminder query is needed. *(Engineering inference — the official Cloud Scheduler/Cloud Run docs were egress-blocked; see §16 R6.)* |
| Push send | VAPID signing and delivery to each browser's push service, with retry, TTL selection, and subscription-expiry handling. |
| Sync path | Tasks currently never leave the device. Reminders-by-push require the **server to know task times** — a genuine architectural change, not an add-on. |
| Identity | A real authentication/authorization system (§8.2), which does not exist today. |
| Ongoing | Key rotation, endpoint pruning, per-user quotas, rate limits, log redaction, monitoring, and a privacy policy covering the new data. |

### 9.1 Reuse the existing Cloud Run service, or build a separate one?

**Provisional preference, subject to validation of Cloud Run/Scheduler behaviour,
datastore choice, isolation requirements, authentication architecture,
operational ownership and official documentation in R6.**

The provisional leaning is to **extend the existing service** rather than add a
second one — it is already Cloud Run-shaped (`Dockerfile`), already has CORS and
env-var plumbing, and a second service would duplicate deployment and secret
management. The counter-argument is real, though: the transcription endpoint is
stateless and bursty while reminders are stateful and hold secrets, so isolation
may justify separation.

**Do not select a production backend architecture on the basis of this
time-boxed spike.** This is an input to that decision, not the decision.

---

## 10. Failure modes

Assessed against option 6 (Web Push), since options 1–5 mostly fail outright.

| Failure mode | Behaviour | Mitigation |
|---|---|---|
| **Offline device** | Push services queue undelivered messages subject to TTL; delivery happens on reconnect, i.e. **late**, or not at all if the TTL expires first (D4). | Choose TTL deliberately; drop reminders whose moment has long passed rather than surprising the user. Never advertise exact delivery. |
| **Expired / invalidated subscription** | Endpoint returns 404/410. Silent failure — the user simply gets nothing. | Prune on 404/410; re-subscribe on app open; surface "reminders may not be delivered — reopen the app" in the UI. |
| **Task edited, completed, or deleted** | The server holds a stale schedule and pushes a reminder for something already done. This is exactly the pruning problem Chrome cited when abandoning Notification Triggers (S2). | Sync on every mutation; re-check liveness at send time; have the service worker suppress a push whose task is known-completed via whichever content source §8.3 selects. |
| **Task rolled over** | `rolloverTasksForDate` (`src/hooks/useTasks.ts:88`) changes a task's date **locally, on app open**. The server would not know. | Rollover must become a synced operation, or reminders must be re-derived server-side from the same rule. |
| **Duplicate delivery** | Push services are at-least-once; retries and concurrent dispatch can double-fire. | Idempotency key per (task, occurrence); **atomic claim** in the dispatcher (§14); dedupe in the `push` handler using `tag`. |
| **Late delivery** | OS/network/push-service delay past the intended minute (D5). | Include the intended time in the payload; suppress if older than a threshold. |
| **Timezone / DST** | Task times are wall-clock strings (`src/types/task.ts:18-23`, `date` + `time`) with **no timezone stored**. A server scheduling in UTC will fire at the wrong local moment after travel or a DST shift. `useReminders.ts:46` builds the target with the *device's* current zone, so today it is implicitly correct on-device and would become incorrect server-side. | Store an IANA timezone per task or per device, and recompute the UTC instant on every change. **This is a data-model change and must not be hand-waved.** |
| **Device reboot** | In-page timers gone (options 1–5). Push unaffected once the OS is back online. | — |
| **Browser eviction** | Origin data cleared → subscription and tasks lost. | Detect a missing subscription on open and re-subscribe; keep encouraging backups. |
| **Multiple devices** | Same account on two devices → two subscriptions → two notifications. | Per-device subscription records with explicit per-device enable. |

---

## 11. Decision

**For Phase 1: keep foreground reminders, label them honestly, and defer
background delivery to a separately approved architecture phase.**

1. **Do not attempt client-only background reminders.** **No shipping
   standards-based API was found that satisfies exact local scheduling on the
   target Android Chrome and Desktop Chrome platforms.** Notification Triggers
   was the API for that job and it is dead (S2, §5.2). Background Sync is
   connectivity-triggered (S4); Periodic Background Sync is explicitly
   UA-discretionary (S3) and Chrome itself judged its cadence insufficient for
   this class of problem (S2).
2. **Do not ship Web Push in Phase 1.** It is the only investigated
   standards-based browser route that can wake the app while closed, and it is
   viable for server-initiated reminders — but it is **not an exact-time delivery
   guarantee** (§2.1), and it requires a datastore, a scheduler, a real identity
   and authorization model, a decision on notification content (§8.3), task data
   leaving the device, and a timezone model the task type does not have (§10).
   That is a separately approved phase, not a PR.
3. **Fix the honesty problem now, in PR 2**, and treat the probable Android
   constructor defect (§6.1) as a high-priority bug to be scheduled — not as part
   of this spike.

### 11.1 Go / no-go verdicts

| Capability | Verdict | Basis |
|---|---|---|
| **Client-only exact background reminders** | **NO-GO.** No shipping standards-based API was found that satisfies exact local scheduling on the target Android Chrome and Desktop Chrome platforms. | S2 + §5.2 (Triggers dead/absent); S3, S4 (neither sync API is clock-driven) |
| **Client-only best-effort background reminders** | **NO-GO for Phase 1.** Technically possible via Periodic Background Sync, but Chromium-only, experimental, requires an installed PWA plus site engagement, and gives no timing contract. Using it would let us *claim* background reminders while delivering something that misses the intended minute — precisely the outcome this ADR exists to prevent. | S3, S2 |
| **Server-backed Web Push** | **CONDITIONAL GO, deferred — viable for closed-app delivery, not exact-time delivery; requires a separately approved backend/data/privacy architecture.** | S5, S8, S9; §2.1; prerequisites in §8, §9, §14 |
| **Native-wrapper local notifications** | **NO-GO for Phase 1**, keep as a documented alternative. Would give OS-scheduled local notifications with no server, but means shipping an Android app and leaving the pure-web deployment. Reconsider only if push proves inadequate. | Engineering inference; Capacitor docs were egress-blocked (§16 R7) |

---

## 12. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Extend the `setTimeout` horizon beyond 24 h** | Solves nothing. The binding constraint is page lifetime (minutes), not the timer ceiling. |
| **Keep the page alive** (Wake Lock, audio loop, visibility hacks) | Fights the platform, drains battery, breaks when the tab closes anyway, and is hostile to the user. |
| **Periodic Background Sync as the primary mechanism** | Best-effort by specification (S3). Shipping it as "reminders" would be a truthfulness failure. |
| **Notification Triggers** | Abandoned by Chrome (S2); absent in Chromium 141 (§5.2). |
| **One-off Background Sync as a timer** | Fires on connectivity, not on a clock (S4). Cannot express a time. |
| **Poll a server from the open page** | Still requires the page to be open — no better than today, plus a server. |
| **Service worker reads `localStorage` on push** | **Not possible** — Web Storage is synchronous and unavailable in service workers (S7). See §8.3 for the three real options. |
| **Email/SMS reminders** | Different product, new PII, new cost, new consent. Out of scope. |
| **Ship push in Phase 1** | Needs identity and authorization, a datastore, a scheduler, a sync path, a content decision, and a timezone model. Too large; would also stall PR 2. |

---

## 13. Candidate architecture (for the later, separately approved push phase — not now)

```
Android/desktop client                Backend (deployment target TBD — see §9.1)
─────────────────────                 ──────────────────────────────────────────
PWA
 ├─ subscribe(applicationServerKey)   POST /api/reminders/subscribe
 │    (public VAPID key)          →     authenticate → authorize → store
 │    → {endpoint, keys}                {ownerId, deviceId, endpoint, keys, tz}
 ├─ on task create/edit/delete/       PUT  /api/reminders/schedule
 │  complete/rollover              →    authenticate → upsert/delete
 │                                      due-reminder rows (UTC instant)
 │
 └─ service-worker 'push'          ←  Scheduler (periodic)
      → resolve content (§8.3)          → atomically claim due rows
      → showNotification()              → sign with VAPID PRIVATE key
      → 'notificationclick' → focus     → send with explicit TTL
                                        → prune 404/410 endpoints
```

Key properties, each carrying a constraint established above:

* The **service worker must display via `showNotification()`** (S6) — the
  mobile-supported path the current code does not use.
* **Notification content requires an explicit choice** between C1 (encrypted
  payload), C2 (IndexedDB mirror), or C3 (authorized fetch) — because **the
  worker cannot read the existing `localStorage` task store** (S7, §8.3). A
  generic fallback string is mandatory in all three, since `userVisibleOnly`
  forces a visible notification (S8).
* The server stores a **UTC instant plus the originating timezone**, recomputed
  whenever a task or the device timezone changes (§10).
* **Every route is authenticated and authorized** (§8.2); `deviceId` alone
  authorizes nothing, and CORS authorizes nothing.
* The dispatcher **atomically claims** work before sending (§14), so retries and
  concurrent instances cannot double-send.
* Delivery remains **eventual, not exact** (§2.1) — the product wording must say so.

---

## 14. Minimal future data model / API outline (not implemented)

Sketch only — no code, no migration, nothing built in this spike.

```ts
// Server-side only. Nothing here exists today.
interface PushSubscriptionRecord {
  ownerId: string;          // authenticated account — the authorization subject
  deviceId: string;         // opaque correlation handle. NOT authentication,
                            // NOT authorization: never trust it on its own.
  endpoint: string;         // capability URL — protect at rest, redact in logs (S5)
  keys: { p256dh: string; auth: string };   // protect at rest, redact in logs
  timezone: string;         // IANA, e.g. "Europe/Berlin"
  createdAt: string;
  lastSeenAt: string;
}

interface ScheduledReminder {
  ownerId: string;
  deviceId: string;
  taskId: string;           // matches Task.id
  occurrenceKey: string;    // taskId + intended instant — idempotency (§10)
  fireAtUtc: string;        // recomputed on task edit and on timezone change

  // A lone `sent: boolean` is NOT sufficient: it cannot express "a dispatcher
  // is working on this right now", so retries and concurrent instances would
  // double-send. Claiming must be atomic.
  claimState: 'pending' | 'claimed' | 'sent' | 'failed';
  claimedBy?: string;       // dispatcher instance id
  claimExpiresAt?: string;  // lease, so a crashed dispatcher's work is retried
  attemptCount: number;
}
```

| Method | Route | Purpose | Authorization |
|---|---|---|---|
| `POST` | `/api/reminders/subscribe` | store/refresh a subscription | authenticated owner; rate-limited |
| `DELETE` | `/api/reminders/subscribe` | unsubscribe this device | authenticated owner of that subscription |
| `PUT` | `/api/reminders/schedule` | replace this device's due-reminder set | authenticated owner; quota + rate-limited |
| `POST` | `/api/reminders/dispatch` | scheduler-invoked; send due reminders | **internal only** — not reachable by end users |

The client would also need a **new `Task` field or a parallel map carrying the
resolved timezone**, since `Task` has none today (`src/types/task.ts:13-33`), and
— under option C2 — an **IndexedDB mirror** of minimal reminder data (§8.3).

---

## 15. Consequences for PR 2 and the truthful Reminders screen

**PR 2 is not blocked by this spike**, and this ADR deliberately does not
constrain its design beyond honesty. With the verdict above, PR 2 can and should:

* Build a real Reminders screen — the tab is currently inert
  (`src/App.tsx:450-455`, no `onClick`; `activeTab` is typed
  `'today' | 'all' | 'done'` at `src/App.tsx:156`).
* **Show what is scheduled**: upcoming tasks with reminders enabled, their times,
  and the 10-minute lead.
* **State the delivery capability accurately.** Concretely, the screen and
  `SettingsModal` must stop implying background delivery. Replace the
  unconditional „Erinnerungen aktiviert ✓" (`SettingsModal.tsx:150`) with
  wording equivalent to: *reminders are shown only while the app is open; if the
  app is closed at the scheduled time, no notification is delivered.*
* **Surface the mobile limitation** once §16 R1 is confirmed on a device.
* Consider migrating foreground delivery to
  `ServiceWorkerRegistration.showNotification()` (§6.1) — but only **after the
  target-device check (R1)** or with automated/browser coverage exercising the
  path. This fixes mobile display compatibility; **it does not add background
  scheduling**, and must not be described as if it did.
* Avoid promising anything from this ADR's deferred column.

---

## 16. Open risks and required physical-device validation

Nothing below was validated on real hardware. Each needs the installed PWA on a
physical Android device — the PR 8 pass is the natural home for most of them.

| # | Risk / question | Why it matters | How to validate |
|---|---|---|---|
| **R1** | **Does `new Notification()` actually throw on Android Chrome?** (§6.1) | If yes, reminders are broken today on the primary target, not merely limited. Highest-value check in this document. | Installed PWA, permission granted, task ~11 min out, app in foreground, watch remote-debug console for `TypeError`. |
| **R2** | Does `showNotification()` from the service worker display correctly in the installed PWA? | It is the required replacement path (S6) and the prerequisite for the §6.1 migration. | Call it from DevTools against the registered worker. |
| **R3** | How long do in-page timers actually survive when the PWA is backgrounded but not closed? | Determines whether "foreground-only" should be described as "while open" or "while visible". | Schedule 2/5/10-minute reminders; background the app; observe. |
| **R4** | Is Periodic Background Sync registrable at all for this origin once installed? | Bounds any future best-effort fallback. | `registration.periodicSync.register()` on-device; inspect `chrome://sync-internals`. Note the local `UnknownError` (§5.2) is a **sandbox artefact**, not a real-device result. |
| **R5** | Doze / battery-optimisation impact on delivery. | Sets the honest upper bound even for push (D5). | Observe delivery with the device idle and unplugged. |
| **R6** | Cloud Scheduler minimum granularity, retry semantics, Cloud Run cold-start latency, datastore choice, isolation and operational ownership. | Required before §9.1's provisional preference becomes a decision. Official docs were egress-blocked here. | Read the official docs from an unrestricted network before committing to the design. |
| **R7** | Capacitor's current local-notification capabilities and Android scheduling limits. | Needed before the native route can be fairly compared. Docs egress-blocked here. | Read official Capacitor docs; do not rely on this ADR's inference. |
| **R8** | Storage eviction rates for this origin on Android. | Affects both reminders and task durability. | Long-running device observation; consider `navigator.storage.persist()`. |
| **R9** | W3C Push API normative behaviour: TTL semantics, delivery guarantees, subscription expiry. | This ADR's push claims rest on MDN (S5, S8); the specification itself (S9) was egress-blocked. | Read [https://www.w3.org/TR/push-api/](https://www.w3.org/TR/push-api/) before committing to the push design. |
| **R10** | Permission UX on the target installed PWA — how many prompts, and when. | §8.1 deliberately does not assume a prompt count. | Observe on-device during first subscribe. |

---

## 17. Summary

**No shipping standards-based API was found that satisfies exact local scheduling
on the target Android Chrome and Desktop Chrome platforms.** The API designed for
that job, Notification Triggers, was abandoned by its own vendor. Neither
Background Sync nor Periodic Background Sync can express a wall-clock time.

Web Push is **the only investigated standards-based browser route that can wake
the app while closed. It is viable for server-initiated reminders, but it is not
an exact-time delivery guarantee** — network conditions, push-service behaviour,
OS battery policy, browser restrictions, TTL, subscription expiry and device
availability can all delay or prevent display. It is therefore a **conditional
go, deferred**, contingent on a separately approved backend, data and privacy
architecture.

Phase 1 should therefore **keep foreground reminders and describe them
truthfully**, and PR 2 should build a Reminders screen that says exactly what the
app does and does not do. The probable mobile constructor defect (§6.1) is the
most urgent follow-up and should be tracked as a high-priority bug in its own
right, with R1 as its confirmation step.
