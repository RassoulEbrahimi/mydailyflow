# Phase 1A — Accessibility & Browser Baseline

**Status:** measured baseline only. **No product code was changed in PR0.**

This document records what My Daily Flow does *today*, as measured by the browser
suite added in the same PR. Nothing here is a fix, and nothing here was made to
pass by adjusting the app. Where the app fails, the failure is written down with
the number attached and an owner assigned to a later PR.

---

## 1. Environment and commands

| | |
|---|---|
| Commit under test | `98ddf67a15a9ea91cfc9c452c911553100f8e575` (`origin/main`) |
| Branch | `claude/pr0-a11y-baseline-jvnh44` |
| Node | v22.22.2 |
| npm | 10.9.7 |
| Browser | Chromium 141.0.7390.37 (Playwright build 1194) — **Chromium only** |
| Playwright | `@playwright/test` 1.56.1 (pinned exactly) |
| axe | `@axe-core/playwright` 4.13.0 (axe-core rules: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) |
| Build under test | production `vite build` output, served by `vite preview` |
| Base path | `/mydailyflow/` (the real GitHub Pages base) |
| Locale / timezone | `de-DE` / `Europe/Berlin` |
| Pinned clock | `2026-05-20T14:30:00+02:00` (via `page.clock.setFixedTime`) |
| Service worker | blocked, so every context is a cold start |

```bash
npm ci                # install, including the two new dev dependencies
npm run lint          # tsc --noEmit (now also type-checks e2e/**)
npm test              # existing node suite — unchanged
npm run build         # production build
npm run test:browser  # the Phase 1A browser suite (this document's source)
npm run test:browser:report   # open the HTML report
```

**`npm run test:browser` always measures a fresh build of the current HEAD.**
The script runs `npm run build` first, so `dist/` is never reused from an earlier
run, and Playwright is configured with `reuseExistingServer: false` so it always
starts its own `vite preview` on `127.0.0.1:4173`. If something unrelated already
holds that port, `--strictPort` makes the run fail loudly rather than silently
measuring the other server. Override the port with `MDF_PREVIEW_PORT`.
`forbidOnly: true` applies locally as well as in CI — a baseline measured from a
`test.only`-narrowed run is not a baseline.

Arguments still forward: `npm run test:browser -- e2e/nav.spec.ts` rebuilds and
then runs just that file. One npm quirk to know: quotes around a *multi-word*
argument are lost in `npm run … --` forwarding, so a phrase filter needs the
runner directly — `npx playwright test --grep "done tab"` — which skips the
rebuild and is therefore for ad-hoc inspection, not for producing a baseline.

### Test data and isolation

* Every test runs in a **fresh Playwright browser context** with a throwaway
  profile. No real browser profile, localStorage, backup file or Downloads
  folder is ever read or written.
* Authentication is a **synthetic session injected into `sessionStorage`** under
  `mdf_auth_session` as `{"username":"e2e-synthetic-user","expiresAt":null}` —
  the shape `fakeAuth.saveSession(user, false)` produces. The login form is
  never filled in, and **no `VITE_FAKE_USER_*` / `VITE_FAKE_PASS_*` value is
  read, typed, printed or committed.**
* Task and Essentials data is synthetic (`e2e-*` ids, German placeholder
  titles), seeded via `addInitScript` before any page script runs.
* Downloads produced by the export test are captured through Playwright's
  download API into that test's own output directory under `test-results/`.
  That directory is inside the checkout but gitignored and disposable; the
  browser's real Downloads folder, any real user file, any existing backup, and
  every tracked file in the repository are left untouched.

### ⚠️ Measurement caveat — the Inter webfont did not load

`index.html` loads Inter from `fonts.googleapis.com` through a **render-blocking**
`<link rel="stylesheet">`. The machine these numbers were measured on has no
egress to that host, so:

* every measurement below was taken with the **fallback sans-serif**, not Inter
  (`interFontLoaded: false`, recorded alongside every measurement);
* first paint is delayed until that request resets — roughly **13 seconds** here.
  That is why the harness waits up to 30 s for the app shell.

**What remains valid as measured** (all font-independent):

* **Computed colour measurements** — every foreground/background pair, ratio and
  threshold in §3, and the boundary and focus-indicator ratios in §3.3 and §5.1.
* **Fixed dimensions** — every control size in §4, the sticky-hero and bottom-nav
  geometry in §6.1–§6.2, and the 44 × 44 pass/fail verdicts.
* **DOM state and semantics** — focus order and tab-stop counts (§5.2), missing
  roles, names and ARIA state (§5.3, §5.5, §5.6), the inert Erinnerungen tab
  (§7), and the backup round-trip results (§8).

**What must be rechecked:** anything derived from *text width* — specifically the
Daily Essentials chip-row overflow figures in §6.3 (+45 px at 360, +15 px at
390). Re-verify these in the **networked PR8 live pass or real-device smoke**,
with Inter actually loaded, before PR3 sizes a fix. The *existence* of the
overflow at 360 px is not in doubt (six 32 px chips plus gaps and padding exceed
the row on their own); only the exact pixel counts are provisional. See §11.

### Build isolation — `e2e/` and `docs/` are excluded from Tailwind scanning

Tailwind v4's **automatic source detection** scans every non-ignored file in the
repository. Adding `e2e/**` and `docs/a11y-baseline-1a.md` therefore fed their
prose and identifiers into the class scanner, and three ordinary English words
used throughout both — **`ring`**, **`collapse`**, **`invisible`** — are also
bare Tailwind utility names. Left alone, the production bundle would gain three
rules the app never renders (`.ring`, `.collapse`, `.invisible`, +352 bytes).

Tailwind's only supported exclusion mechanisms are `.gitignore` (unusable here —
these files must be committed) and the CSS `@source not` directive. So PR0 makes
exactly one, explicitly approved change under `src/`, immediately after the
Tailwind import in `src/index.css`:

```css
@source not "../e2e";
@source not "../docs";
```

This is **build/tooling isolation, not a visual change**. It adds no rule,
removes no rule, and touches no token, selector or component style. With it in
place the production CSS is byte-for-byte identical to the build from base commit
`98ddf67a15a9ea91cfc9c452c911553100f8e575`:

| | Base `98ddf67` | PR0 |
|---|---|---|
| `dist/assets/index-*.css` | 53 687 bytes | 53 687 bytes |
| SHA-256 | `4b423b05…c643f2b` | `4b423b05…c643f2b` |
| Extra generated selectors | – | **none** |

No other file under `src/`, `tests/`, or `public/` is modified by this PR.

Anyone adding to `e2e/` or this document does not need to avoid Tailwind-shaped
words — the exclusion handles it. Anyone adding a *new* top-level directory of
test or documentation material should extend the two directives above.

---

## 2. Viewport / theme matrix

Three widths × two themes. All three tabs are measured in every cell.

| Viewport | Dark | Light |
|---|---|---|
| 360 × 812 | ✅ measured | ✅ measured |
| 390 × 812 | ✅ measured | ✅ measured |
| 430 × 812 | ✅ measured | ✅ measured |

Tabs measured per cell: **Heute**, **Alle Aufgaben**, **Erledigt**.
**Erinnerungen is not measurable** — it opens nothing (§7).

36 tests total: 18 axe scans (3 viewports × 2 themes × 3 tabs), 6 layout/contrast
matrix runs, and 12 behavioural/keyboard/backup tests.

---

## 3. Contrast pairs measured

Ratios are computed by resolving each colour through a canvas (Tailwind v4 emits
`oklch()`, which Chromium serialises back as `oklch()` — a regex-based reader
silently drops those), compositing the full background stack including alpha
layers, and folding in inherited `opacity`. Rows are deduplicated by
(foreground, background, size, weight).

Thresholds: **4.5:1** for normal text, **3:1** for large text (≥24px, or ≥18.66px
at weight ≥700).

### 3.1 Dark theme — failing pairs

| Surface | Foreground | Background | Ratio | Threshold | Size / weight | Element |
|---|---|---|---|---|---|---|
| Today | `#6f737a` | `#101622` | **3.80** | 4.5 | 10px / 600 | Hero date label ("Mi., 20. Mai") |
| Today | `#1254d8` | `#101622` | **2.83** | 3.0 | 20px / 700 | Hero username (`text-primary/90`) — *large-text rule* |
| Today | `#407ec8` | `#182a47` | **3.45** | 4.5 | 15px / 500 | Completed simple Essential title |
| Today | `#ffffff` | `#2b7fff` | **3.76** | 4.5 | 14px / 700 | Active Essentials chip (white on blue-500) |
| Today / All | `#1350cb` | `#182745` | **2.15** | 4.5 | 10px / 500 | Checklist badge `☑ 1/2` |
| Today / All | `#4a5a78` | `#192233` | **2.30** | 4.5 | 11.5px / 400 | Completed checklist item text |
| All / Done | `#525d6e` | `#141923` | **2.64** | 4.5 | 15px / 600 | Completed task title (line-through) |
| All / Done | `#475266` | `#141923` | **2.23** | 4.5 | 11.5px / 500 | Completed task meta ("07:00 • 10m") |
| all tabs | `#135bec` | `#0c151f` | **3.27** | 4.5 | 11px / 600 | **Active** bottom-nav label |
| all tabs | `#4e6285` | `#0c151f` | **2.98** | 4.5 | 11px / 600 | **Inactive** bottom-nav label |

Failing pairs per tab (dark): Today 8, All 6, Done 4.

### 3.2 Light theme — failing pairs

| Surface | Foreground | Background | Ratio | Threshold | Size / weight | Element |
|---|---|---|---|---|---|---|
| Today | `#9a9daa` | `#f0f2f7` | **2.41** | 4.5 | 10px / 600 | Hero date label |
| Today | `#858996` | `#f0f2f7` | **3.12** | 4.5 | 10px / 500 | Hero ring counter ("0/4") |
| Today | `#7ab6fd` | `#dbe5f7` | **1.67** | 4.5 | 15px / 500 | Completed simple Essential title |
| Today | `#e2e8f0` | `#e9ecf3` | **1.04** | 4.5 | 15px / 500 | **Incomplete Essential title** (`text-slate-200` on a light surface) |
| Today | `#90a1b9` | `#e9ecf3` | **2.22** | 4.5 | 12px / 500 | Essential progress counter ("2 / 6") |
| Today | `#ffffff` | `#2b7fff` | **3.76** | 4.5 | 14px / 700 | Active Essentials chip |
| Today | `#90a1b9` | `#eef0f6` | **2.31** | 4.5 | 14px / 700 | Inactive Essentials chip digit |
| Today | `#90a1b9` | `#f0f2f7` | **2.35** | 4.5 | 12px / 500 | Time-block range ("06:00 – 12:00") |
| Today / All | `#7a8ba8` | `#ffffff` | **3.45** | 4.5 | 11.5px / 500 | Task meta row |
| Today / All | `#ffa8b4` | `#ffe9ee` | **1.58** | 4.5 | 10px / 500 | "Überfällig" badge |
| Today / All | `#3d79f0` | `#e7eefd` | **3.48** | 4.5 | 10px / 500 | Checklist badge `☑ 1/2` |
| Today / All | `#7a8ba8` | `#ffffff` | **3.45** | 4.5 | 11.5px / 400 | Checklist item text |
| Today / All | `#a0aec0` | `#ffffff` | **2.26** | 4.5 | 11.5px / 400 | Completed checklist item text |
| All / Done | `#c8d0dc` | `#ffffff` | **1.56** | 4.5 | 15px / 600 | Completed task title |
| All / Done | `#bdc5d4` | `#ffffff` | **1.74** | 4.5 | 11.5px / 500 | Completed task meta |
| all tabs | `#8797b0` | `#e3e7f0` | **2.39** | 4.5 | 11px / 600 | Inactive bottom-nav label |

Failing pairs per tab (light): Today 14, All 8, Done 3.

**The light palette is materially worse than the dark one.** Several components
hard-code dark-palette Tailwind classes (`text-slate-200`, `text-slate-400`,
`bg-slate-800`, `[color-scheme:dark]` on the date input) instead of using the
semantic tokens, so they never switch with the theme. `#e2e8f0 on #e9ecf3 = 1.04:1`
is the clearest example: the incomplete Essential title is very nearly invisible
in light mode.

Every measured pair — passing and failing — is written to
`test-results/baseline/matrix-<viewport>-<theme>.json` (key `tabs.<tab>.contrast`)
and attached to the HTML report.

### 3.3 Non-text (boundary) contrast — WCAG 1.4.11, 3:1

| Theme | Control | Border | Background | Ratio |
|---|---|---|---|---|
| Dark | Unchecked task checkbox (`border-2 border-edge-strong`) | `#384666` | `#192233` | **1.70** |
| Light | Unchecked task checkbox | `#9babc4` | `#ffffff` | **2.33** |

That 2px ring is the *only* thing marking the checkbox, so at 1.70:1 the primary
control on every task card has no perceivable boundary in dark mode.

### 3.4 axe `incomplete` results

axe additionally reports `color-contrast` as **incomplete** for 9 nodes (dark) /
13 nodes (light) on Today — elements it cannot decide because of gradient or
alpha backgrounds (the hero, `bg-primary/15` pills). These are measured directly
by the harness instead and appear in §3.1/§3.2.

---

## 4. Interactive targets below 44 × 44 CSS px

Totals per tab are **35 (Today) / 34 (All) / 24 (Done)** at every viewport and in
both themes — these are fixed-size controls, so width and theme change nothing.
Values below are from 390 × 812; the full list is in
`matrix-<viewport>-<theme>.json` under `subFortyFourOnScreen` /
`subFortyFourInClosedOverlay`.

### 4.1 On the visible screen

Distinct undersized controls, with the tabs they appear on. Sizes are fixed and
identical at all three widths.

| Accessible name | Selector | Measured | Appears on |
|---|---|---|---|
| `Search` | `header button[aria-label="Search"]` | **22 × 22** | all tabs |
| `Settings` | `header button[aria-label="Settings"]` | **22 × 22** | all tabs |
| `Verwalten` | `section button[aria-label="Verwalten"]` | **30 × 30** | Today |
| *(none)* | `button.flex-shrink-0.mt-\[2px\].w-\[22px\]` — task completion checkbox, one per card | **22 × 22** | all tabs |
| `1` … `6` | `button.w-8.h-8.rounded-md` — Essentials multi-target chips | **32 × 32** each | Today |
| `Alle Daten` / `Heute` / `Gestern` | `AllTasksFilterBar` pills | **84.7 × 30**, **59.3 × 30**, **71.4 × 30** | All |
| *(none)* | `input[type="date"]` in the filter bar | **131 × 30** | All |
| checklist item row | `button.flex.items-center.gap-2` | **282 × 18.69** | Today, All |

Counted per tab at 390 × 812 (in-viewport only, so cards below the fold are not
double-counted): **Today 12 · Alle Aufgaben 13 · Erledigt 4.** The totals differ
only because each tab renders a different number of task cards and filter
controls, not because any control changes size.

Bottom-nav buttons (**93.5 × 56.5**) and the FAB (**56 × 56**) **do** meet
44 × 44 and are not listed.

### 4.2 Inside closed overlays (22–23 more per tab)

`NewTaskModal`, `SettingsModal`, `VoiceTaskModal` and `ManageEssentialsModal`
stay mounted when closed and are merely translated off-screen
(`translate-y-full`). Their controls are therefore measured too — for example the
duration pills (**73 × 39**), priority pills (**102 × 41**), the recurrence
`<select>` (**97 × 21**), the reminder toggle (**46 × 26**), and the modal
`Abbrechen` / `Fertig` buttons (**64 × 22.5**).

This is itself a finding, not just a counting artefact — see §5.4.

---

## 5. Keyboard and focus findings

Measured on the Today tab at 390 × 812, dark. **38 tab stops** before the ring
repeats.

### 5.1 Focus indicator — 38 / 38 stops are effectively invisible

| Measurement | Value |
|---|---|
| Stops that draw **no** indicator at all | **2** (`outline-style: none`) |
| Stops that draw only Chromium's UA ring | **36** |
| Of those, ring contrast **below 3:1** | **36 / 36** |
| Ring contrast range | **1.04 : 1 – 1.19 : 1** |

The app **defines no `:focus` or `:focus-visible` style anywhere**. `grep` over
`src/**` finds only `outline-none` / `focus:outline-none` (LoginPage ×2,
ManageEssentialsModal ×1, NewTaskModal ×5) and two `focus:border-*` rules. Where
a ring appears it is the browser default, whose colour derives from the element's
own text colour and lands at ~1.1:1 against these surfaces. **WCAG 2.4.11 needs
3:1.** The two stops with nothing at all are the NewTaskModal title and time
inputs.

> Note for whoever re-measures this: several controls use Tailwind's
> `transition-all`, which animates `outline-width`. Reading the computed style
> immediately after `Tab` catches the ring mid-transition at `0px` and produces
> a false "no focus ring" reading. The harness waits 260 ms at each stop.

### 5.2 Focus order (Today, in order)

```
 0 Search              1 Settings            2 Verwalten
 3–8  Essentials chips "1".."6"
 9 Bearbeiten*        10 Morgen*            11 Erledigt*      12 (unnamed checkbox)
13 Bearbeiten*        14 Morgen*            15 Erledigt*      16 (unnamed checkbox)
17 Bearbeiten*        18 Erledigt*          19 Löschen*       20 (unnamed checkbox)
21 Erster synthetischer Punkt   22 Zweiter synthetischer Punkt
23 Bearbeiten*        24 Erledigt*          25 Löschen*       26 (unnamed checkbox)
27 Add task menu (FAB)
28 Heute   29 Alle Aufgaben   30 Erinnerungen   31 Erledigt
32 Abbrechen†  33 Fertig†  34 (unnamed input)†  35 Notiz†  36 Checkliste†  37 (unnamed input)†
```

`*` = invisible swipe action · `†` = inside the closed NewTaskModal

**Findings:**

1. **Hidden actions are tabbed before visible ones.** The first swipe action is
   stop **#9**; the first visible task checkbox is stop **#12**. Within every
   card the action strip precedes the card body in the DOM, so a keyboard user
   walks through three invisible buttons per card before reaching the control
   they can see.
2. **The Daily Essentials collapse header and simple-essential rows never appear
   in the ring at all** — they are `<div onClick>` (§5.3).
3. **Focus leaves the viewport at stop #32** into a closed modal (§5.4).

### 5.3 Controls that are not keyboard operable, and wrong semantics

| Element | Actual markup | Missing |
|---|---|---|
| Daily Essentials collapse header | `<div class="cursor-pointer" onClick>` | not focusable; no `role`, no `tabindex`, no `aria-expanded` |
| Simple Essential row (a checkbox in behaviour) | `<div class="cursor-pointer" onClick>` | not focusable; no `role="checkbox"`, no `aria-checked` |
| "Hinzufügen" link in the empty Essentials state | `<span onClick>` | not focusable, no role |
| Multi-target Essential chips | real `<button>` | no `aria-pressed`; accessible name is only the digit ("1", "2", …) |
| Task completion checkbox | `<button>` with no text and no icon when unchecked | **no accessible name at all**; no `role="checkbox"` / `aria-checked` |
| Task card body | `<div onClick>` (closes an open swipe) | not focusable — acceptable, but the swipe gesture it belongs to has no keyboard equivalent |

### 5.4 Swipe actions are focusable while completely hidden

Measured by hit-testing each action button's own centre point with
`document.elementFromPoint`:

| Property | Value |
|---|---|
| Action buttons per card | 3 (`Bearbeiten` + `Erledigt`/`Löschen`, or `Bearbeiten`/`Morgen`/`Erledigt` when overdue) |
| Keyboard focusable | **yes** (all) |
| `aria-hidden` | **not set** (all) |
| `inert` | **not set** (all) |
| Occluded by the card body | **yes** (all — `elementFromPoint` returns the card's `h3`/`div`) |
| Example geometry | `Bearbeiten` at x=194, 59 × 84, fully covered |

They are reachable by pointer **only** through a horizontal swipe, which has no
keyboard or screen-reader equivalent. So the same buttons are simultaneously
unreachable by mouse/keyboard-without-swipe and unavoidable by Tab.

### 5.5 Unnamed controls (axe `button-name`, `label`, `select-name`)

| Control | Why |
|---|---|
| Task completion checkbox (one per card) | `<button>` with no text, no `aria-label`; renders a bare `<Check>` icon only when completed |
| Search input | no `<label>`, no `aria-label`, placeholder only |
| Search close button | accessible name is the literal character `✕` |
| NewTaskModal title / time / duration inputs | no `<label>`, no `aria-label` |
| NewTaskModal recurrence `<select>` | no accessible name |
| AllTasksFilterBar `input[type="date"]` | no `<label>`, no `aria-label` |
| Reminder toggle in SettingsModal | `<button>` with no text or label |

**6 of 38 tab stops on Today have no accessible name.**

### 5.6 Bottom navigation semantics

All four buttons are plain `<button>` elements:

| Label | `role` | `aria-selected` | `aria-current` | `aria-pressed` | `aria-label` |
|---|---|---|---|---|---|
| Heute | – | – | – | – | – |
| Alle Aufgaben | – | – | – | – | – |
| Erinnerungen | – | – | – | – | – |
| Erledigt | – | – | – | – | – |

There is no `role="tablist"`/`role="tab"`, and the active tab is signalled by
**colour alone** (`text-primary` + `bg-primary/15`). A screen reader announces
four unrelated buttons with no indication of which view is open.

---

## 6. Sticky surfaces and layout bleed

### 6.1 Sticky hero (Today, 390 × 812)

| | At scroll top | After scrolling 400px |
|---|---|---|
| `position` / `top` / `z-index` | `sticky` / `-1px` / `20` | same |
| Hero rect (top → bottom) | 53.5 → 154.5 | **−1 → 100** |
| Height | 101 px | 101 px |

The hero pins correctly at `top: -1px` and does **not** clip its own content.

### 6.2 Fixed bottom navigation

| | Value |
|---|---|
| Nav rect | top 726.5 → bottom 812 |
| Nav height (incl. safe-area padding) | **85.5 px** |
| Scroll container overlap | **85.5 px of `<main>` sits underneath the nav** |

`<main>` carries `pb-24` (96 px) of bottom padding, which covers the 85.5 px nav,
so no content is permanently unreachable. Recorded so PR4 can verify the margin
survives a taller safe-area inset on a real device (§10).

### 6.3 Horizontal bleed — the Daily Essentials chip row

Document-level horizontal scroll is **0 px at all three widths** — the page never
scrolls sideways. But the multi-target Essential row overflows *inside* its card:

| Viewport | `div.flex.items-center.justify-between` (row) | `div.flex.flex-col.gap-2.5` (list) | `section` | `main` |
|---|---|---|---|---|
| **360 × 812** | **+45 px** (337 vs 292) | +32 px (350 vs 318) | +11 px | +11 px |
| **390 × 812** | **+15 px** (337 vs 322) | +2 px (350 vs 348) | – | – |
| **430 × 812** | – | – | – | – |

At 360 px — the narrowest supported width — the six 32 px chips plus the title
need 45 px more than the row provides, and the overflow propagates up to `main`.
The chips are clipped rather than wrapped. **Both themes behave identically**;
this is pure layout.

> ⚠️ These three numbers depend on the width of the title text, which was
> measured in the fallback font (§1). Re-measure with Inter loaded before PR3
> sizes the fix. The *existence* of the overflow at 360 is not in doubt — the
> chips alone are 6 × 32 px + 5 gaps + padding — but the exact px is provisional.

### 6.4 Cards and action strips

No card or action strip bleeds outside its rounded container at any of the three
widths: the strip is `absolute inset-y-0 right-0` inside an
`overflow-hidden rounded-2xl` wrapper, and `documentBleedPx` is 0 everywhere.
The 4 px overflow observed on the All tab's group containers is the same
`overflow-hidden` wrapper measuring its own clipped child; nothing is visible.

---

## 7. Current Reminders limitation

**There is no Reminders screen. The tab does nothing.**

* `App.tsx` types `activeTab` as `'today' | 'all' | 'done'` — Reminders is not a
  value it can hold.
* The Erinnerungen `<button>` has **no `onClick`** (source comment:
  *"Reminders (non-functional tab, keep stable)"*).
* Measured: clicking it leaves `<main>`'s `innerHTML` **byte-for-byte identical**;
  the Today view stays mounted; the button never receives the `bg-primary/15`
  active pill or `text-primary` label the other three get.
* Reminder *logic* does exist — `useReminders` schedules a browser notification
  10 minutes before a task — and it is configurable from SettingsModal. Only the
  screen is missing.

This is represented in the suite two ways, and hidden neither time: a passing
test that pins the inert behaviour exactly, and an **expected failure** written
against the behaviour the app should have.

---

## 8. Backup round-trip (browser level)

Full browser round-trip was **technically reliable** and is asserted for real —
no weakened assertions, and the existing node-level backup proof
(`tests/backupFormat.test.ts`) is untouched and still runs under `npm test`.

Export is captured through Playwright's download API; import goes through the
app's real hidden `<input type="file">` via `setInputFiles`.

| Property | Measured |
|---|---|
| File name | `mydailyflow-backup-2026-05-20-1230.json` |
| Size | 2 957 bytes |
| Top-level keys | `app`, `schemaVersion`, `exportedAt`, `tasks`, `essentials`, `essentialsState`, `preferences` |
| Preferences exported | `theme`, `remindersEnabled`, `stickyHeroEnabled`, `essentialsCollapsed` |
| Tasks / Essentials exported | 6 / 2 (all synthetic) |
| `mdf_auth_session` present in file | **no** |
| Synthetic username present anywhere in file | **no** |
| `expiresAt` present anywhere in file | **no** |

Round trip (wipe the three data keys → reload → import → replace):

| Property | Measured |
|---|---|
| Task ids restored | all 6, exactly |
| Essential ids restored | both |
| Essentials progress | preserved (`e2e-ess-multi` = 2) |
| `mdf_auth_session` in **localStorage** after import | `null` |
| Live session in **sessionStorage** after import | intact — still signed in |
| Pre-import recovery snapshot created | **1** (`myDailyFlow_recovery__preimport__2026-05-20T12-30-00-000Z`) |

Authentication data is excluded from the file **and** untouched by the import.

---

## 9. Known expected failures and the axe baseline

### 9.1 Declared expected failure

| Test | Why |
|---|---|
| `nav.spec.ts › Erinnerungen tab — known gap › opens a Reminders screen` | `test.fail()`. Asserts that pressing Erinnerungen replaces the Today content. Fails today because the tab is inert. **If it ever passes, Playwright fails the run**, forcing this document to be updated with the fix. Owner: **PR2**. |

### 9.2 axe baseline — a node-level, two-directional ratchet

**What is pinned.** `e2e/baseline/axe-fingerprints.ts` commits **332
fingerprints across all 18 cells** of the matrix (`viewport|theme|tab`). Each
fingerprint is one violating node:

```
<rule id> :: <normalized axe target selector>
```

for example:

```
button-name :: .overflow-hidden.relative.rounded-2xl:nth-child(1) > … > .mt-\[2px\].w-\[22px\].h-\[22px\]
select-name :: select
```

The suite asserts **exact set equality** per cell. Pinning the *target* and not
just the rule ID is what makes this work at node granularity — a rule-ID-only
comparison cannot see a newly unnamed button appearing under the already-known
`button-name` rule.

Verified by mutation test (each mutation failed exactly the mutated cell and left
the other five `done tab` cells passing):

| Transition | Result |
|---|---|
| A violating target is **added** under an existing rule | ❌ fails |
| A violating target is **removed / fixed** | ❌ fails |
| A violating target **moves** to a different element | ❌ fails |
| A **new rule** starts firing | ❌ fails |
| An existing **rule stops** firing | ❌ fails |

A fix failing the suite is deliberate: `e2e/baseline/axe-fingerprints.ts` and
this document must be updated in the same PR that lands the fix, so the recorded
baseline can never drift from the code.

Fingerprints are deterministic — two independent full runs regenerated a
byte-identical file. They contain no element HTML, timestamps, absolute paths or
browser-generated IDs; the only inputs are the rule ID and axe's own CSS target
path over a fixed build and fixed synthetic data.

Rule meanings and PR ownership stay human-readable in
`e2e/baseline/known-violations.ts`. Regenerate with:

```bash
MDF_AXE_BASELINE_WRITE=1 npm run test:browser
node e2e/baseline/regenerate.mjs > e2e/baseline/axe-fingerprints.ts
```

**What is *not* pinned.** The harness's own measurements — sub-44px targets,
unnamed controls, boundary contrast, and the full contrast table — are
**measured, attached and annotated, but not pinned node by node**. The suite
asserts only that each probe still returns findings, which proves the probe
works, not that the exact set is unchanged. Their numbers live in this document
and in `test-results/baseline/*.json`. Two exceptions are genuinely pinned,
because they are single scalars with a clear meaning: every drawn focus ring is
below 3:1 (§5.1), and hidden swipe actions precede the visible checkbox in tab
order (§5.2).

Violating nodes per scan (390 × 812, Today):

| Category | Dark | Light |
|---|---|---|
| normal-text contrast < 4.5:1 | 6 | 14 |
| large-text contrast < 3:1 | 0 | 0 |
| interactive boundary contrast < 3:1 | 4 | 4 |
| hit area < 44 × 44 CSS px | 35 | 35 |
| unnamed buttons / inputs | 16 | 16 |
| missing / incorrect control semantics | 2 (`label`, `select-name`) | 2 |

---

## 10. What the later Phase 1A PRs must improve

### PR2 — untimed-task correctness, navigation, Reminders screen

* Build a real, truthful Reminders screen, or remove the dead tab (§7). Retire
  the expected failure in §9.1 in the same PR.
* Give the bottom nav a real fourth destination so `activeTab` is no longer typed
  `'today' | 'all' | 'done'` while four buttons are rendered.

### PR3 — tokens/contrast, names and semantics, focus/keyboard, 44 px targets

*Colour and tokens*

* Raise every pair in §3.1 and §3.2 to its threshold. The light palette is the
  bigger job.
* Remove hard-coded dark-palette Tailwind classes that never switch with the
  theme: `text-slate-200`, `text-slate-400`, `text-slate-500`, `bg-slate-800`
  (DailyEssentialsSection, App.tsx `TaskSection`, TaskCard) and
  `[color-scheme:dark]` on the All-tab date input.
* Fix `--ring-track`: `HomeHero` reads `var(--ring-track)`, but the token is
  defined as `--_ring-track` / `--color-ring-track`, so the progress ring's track
  currently resolves to nothing.
* Consider self-hosting Inter instead of a render-blocking Google Fonts link
  (§1, §11).

*Names and semantics*

* Give the task completion checkbox an accessible name and `role="checkbox"` +
  `aria-checked` (or a real `<input type="checkbox">`).
* Name the search input, the search close button, the date filter input, the
  NewTaskModal title/time/duration inputs, the recurrence `<select>`, and the
  reminder toggle.
* Turn the Essentials collapse header and simple-essential rows into real
  controls (`<button>` / `role="checkbox"`, `aria-expanded` / `aria-checked`).
  Give the chips `aria-pressed` and a name beyond the bare digit.
* Give the bottom nav tab semantics (`role="tablist"`/`tab` + `aria-selected`, or
  at minimum `aria-current`), so the active view is not colour-only.

*Focus and keyboard*

* Author a real `:focus-visible` style meeting 3:1 (§5.1), and stop removing the
  ring with `focus:outline-none`.
* Unmount closed modals, or make them `inert` + `aria-hidden`, so Tab does not
  walk into off-screen dialogs (§5.4, §4.2).
* Take the hidden swipe actions out of the tab ring until revealed, **and** give
  those actions a non-swipe path (they are otherwise keyboard-unreachable).
* Fix the focus order so visible controls precede invisible ones (§5.2).

*Target sizes and related accessibility layout*

* Bring the controls in §4.1 to 44 × 44 (Search 22×22, Settings 22×22, Verwalten
  30×30, task checkbox 22×22, Essentials chips 32×32, filter pills ×30, date
  input ×30, checklist rows ×18.69).
* Fix the Daily Essentials chip-row overflow at 360 px (§6.3) — wrap the chips or
  reflow the row.
* Size the modal controls in §4.2 once the closed-modal decision above is made.

### PR4 — sticky-surface clipping and F8 / action-strip containment

* Re-verify the 85.5 px nav / 96 px `pb-24` margin against a real safe-area
  inset, and confirm the sticky hero never clips content beneath it (§6.1, §6.2).
* Keep the F8 / task action strip contained within its rounded wrapper at every
  supported width (§6.4).

### PR5 — RTL/bidi hardening

* **Not covered by this baseline.** All synthetic data here is German (LTR), so
  no right-to-left rendering was measured. `TaskCard`, its checklist and its
  notes use `dir="auto"`; nothing else does.
* Add measured DE / EN / FA / mixed-direction coverage, and extend this harness
  with the corresponding cells.

### PR6 — safe destructive actions

* Delete and "replace" import currently commit immediately (§8 records the
  pre-import recovery snapshot that already exists). Confirmation and undo are
  PR6's scope, not PR0's.

### PR7 — date capture

* The All-tab `input[type="date"]` is unnamed and 131 × 30 (§4.1). Its naming and
  size belong to PR3; the capture flow itself is PR7.

---

## 11. Pending — physical device verification (PR8)

**Not covered by this baseline. Explicitly deferred to PR8.**

Everything above was measured in headless Chromium on a desktop machine at
emulated viewports. The following can only be verified on real hardware:

* Physical Android device, real Chrome — touch target ergonomics, actual swipe
  gestures on the task cards, drag-and-drop reordering.
* **Installed PWA** (added to home screen) — standalone display mode, real
  `env(safe-area-inset-bottom)` on a device with gesture navigation, and whether
  the 96 px `pb-24` still clears the nav (§6.2).
* Service-worker update banner and offline behaviour — blocked in this suite for
  determinism.
* TalkBack screen-reader announcement order, especially for the bottom nav
  (§5.6) and the task cards.
* Real notification permission prompt and delivery for the reminders feature.
* **Re-measurement of every font-width-dependent number with Inter actually
  loaded** (§1, §6.3) — the Daily Essentials chip-row overflow at 360 px and
  390 px is the concrete item. This is a PR8 deliverable: PR3 should not size its
  fix from the provisional numbers alone.

---

## 12. Where the raw numbers live

| Artifact | Contents |
|---|---|
| `test-results/baseline/matrix-<viewport>-<theme>.json` | every contrast pair, every hit target, overflow, sticky geometry |
| `test-results/baseline/axe-<viewport>-<theme>-<tab>.json` | node fingerprints, axe rule ids, classified findings, category counts |
| `test-results/baseline/keyboard-focus-order-today.json` | the full 38-stop traversal with focus styles and ring contrast |
| `test-results/baseline/backup-*.json` | export contents and round-trip results |
| `test-results/baseline/reminders-tab-state.json` | the inert-tab evidence |
| `playwright-report/` | HTML report with the same payloads attached per test |

All of these are gitignored — they are regenerated by `npm run test:browser`.

The committed baseline is three files:

| File | Role |
|---|---|
| `e2e/baseline/axe-fingerprints.ts` | generated; the 332 pinned node fingerprints (§9.2) |
| `e2e/baseline/known-violations.ts` | hand-written; rule meanings and PR ownership |
| `e2e/baseline/regenerate.mjs` | rebuilds the fingerprints file from a recording run |
| `docs/a11y-baseline-1a.md` | this document |
