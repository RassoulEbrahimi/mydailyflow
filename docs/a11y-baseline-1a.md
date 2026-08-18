# Phase 1A — Accessibility & Browser Baseline

**Status:** living document. It began as a measured baseline (PR0, no product
code changed) and is updated by each Phase 1A PR that closes part of it. PR2
resolved §7; **PR3 resolved §3, §5 and reduced the §9.2 axe baseline to zero**;
**PR4 resolved §6.1, §6.3, §6.4 and the last two entries in §4**. Sections carry
a status banner where they have been closed, and the original PR0 measurements
are preserved beneath each one — including where a PR0 conclusion later turned
out to be wrong (§6.4).

This document records what My Daily Flow does *today*, as measured by the browser
suite added in the same PR. Nothing here is a fix, and nothing here was made to
pass by adjusting the app. Where the app fails, the failure is written down with
the number attached and an owner assigned to a later PR.

---

## 1. Environment and commands

| | |
|---|---|
| Commit under test (PR0 baseline) | `98ddf67a15a9ea91cfc9c452c911553100f8e575` (`origin/main`) |
| Branch (PR0) | `claude/pr0-a11y-baseline-jvnh44` |
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
npm test              # node suite — pure logic, storage, notify, theme tokens
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

Tabs measured per cell: **Heute**, **Alle Aufgaben**, **Erledigt**, and — since
PR2 — **Erinnerungen** (§7).

Test counts by suite: 24 axe scans (3 viewports × 2 themes × 4 tabs), 6
layout/contrast matrix runs, 24 Daily Essentials contrast tests (3 viewports × 2
themes × 4 assertions), the keyboard/focus suite in both themes, plus the
navigation and backup round-trip tests.

> **Measured-at note.** The tables in §3–§6 are the PR0 baseline, measured on
> `98ddf67` before the Reminders screen existed. PR2 added a fourth surface and
> changed no pre-existing fingerprint (§9.2). **PR3 changed many of these
> numbers**; each affected section carries a status banner saying what the
> current invariant is and where it is asserted, and the PR0 tables are kept
> beneath so the before/after is visible in one place.

---

## 3. Contrast pairs measured — resolved in PR3

> **Status: every failing pair below was fixed in PR3.**
> `e2e/viewports.spec.ts` no longer asserts "failures exist"; it asserts the
> opposite — the set of failing pairs must be **empty** for all 24 cells of the
> matrix, and the failure message names the offending pair. Verified green at
> 360/390/430 × Dark/Light on all four tabs.
>
> How it was fixed, by root cause:
>
> | Root cause | Fix |
> |---|---|
> | `--_fg-meta` / `--_fg-faint` / `--_fg-disabled` / `--_fg-placeholder` too pale | The whole foreground ramp was re-tuned in both palettes so every step clears 4.5:1 against the surfaces it is used on. Hierarchy is preserved by the remaining spread (Dark 6.88 → 4.46 on `--_surface`; Light 7.6 → 5.9 on `--_surface`) plus size and weight. |
> | Opacity fades compositing text into the card (`opacity-50` on a completed task's title block, `opacity-40` on its checklist and notes) | Removed. De-emphasis for a completed task is now expressed with tokens (`text-fg-secondary` + `line-through` + `decoration-fg-faint`), which reads the same and measures 4.5:1+. |
> | `text-primary` (#135bec) used as *text* on page surfaces — 3.27:1 in Dark on the nav inset | New `--color-primary-text` token, palette-specific (`#7fb0ff` Dark, `#0f4fbe` Light). `--color-primary` stays #135bec and is still the fill behind white text (5.62:1). |
> | Status badges built from literal palette classes plus alpha tints (`text-rose-300/90 bg-rose-500/10`, `text-amber-300/90`, `text-violet-300`, `text-primary/80 bg-primary/10`) | Replaced by `danger` / `warning` / `success` / `accent` / `primary` token families, each with a text colour, an opaque tinted surface, a border and a saturated `-solid` fill that carries white text. |
> | Theme-blind literal classes (`text-slate-200/300/400/500`, `bg-slate-700/800`, `bg-blue-*`, `bg-red-*`, `bg-emerald-*`, `bg-amber-*`, `bg-[#1d4aba]`, `bg-[#475569]`, `[color-scheme:dark]`) | All removed across the 11 components that carried them. |
>
> The original PR0 measurements are preserved below for the record.

Two exclusions the probe applies, both recorded rather than dropped (they land
in the evidence JSON as `contrastExcluded`, with the reason attached):

* **Text that is not displayed** — effective `opacity` of 0, from the element or
  any ancestor. The collapsed *Aufgabendetails* panel in `NewTaskModal` is the
  case: folding a zero opacity into the composite reports the foreground exactly
  on top of its own background, a 1:1 "failure" for text nobody can see. WCAG
  1.4.3 applies to text that is displayed.
* **Text inside a programmatically disabled control** — `[disabled]` or
  `[aria-disabled="true"]`. 1.4.3 exempts "text that is part of an inactive user
  interface component"; the exemption is honoured only for a control that says
  it is inactive, never for one that merely looks faded.

Both were latent at the PR0 baseline. They surfaced in PR3 only because the
assertion flipped from *"failures exist"* to *"the failure set is empty"* — the
old assertion could not tell a real defect from a measurement artefact, because
it only ever needed one of either.

Sheets are measured while closed by the matrix (their colours are real whether
open or not), and `e2e/modals.spec.ts` opens `NewTaskModal` — with the
disclosure expanded — and `SettingsModal` in both themes, so the controls hidden
behind that `opacity-0` panel are judged too.

Ratios are computed by resolving each colour through a canvas (Tailwind v4 emits
`oklch()`, which Chromium serialises back as `oklch()` — a regex-based reader
silently drops those), compositing the full background stack including alpha
layers, and folding in inherited `opacity`. Rows are deduplicated by
(foreground, background, size, weight).

Thresholds: **4.5:1** for normal text, **3:1** for large text (≥24px, or ≥18.66px
at weight ≥700).

### 3.1 Dark theme — failing pairs *(PR0 measurement; all now pass)*

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

### 3.2 Light theme — failing pairs *(PR0 measurement; all now pass)*

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

> **Resolved in PR3.** `--_edge-strong` was re-tuned to `#64769e` (Dark) and
> `#71839b` (Light), giving the unchecked checkbox 3.51:1 and 3.87:1 against
> `--_surface`. The switch tracks in `SettingsModal` and `NewTaskModal` gained
> the same `border-edge-strong` in their off state, so "off" is no longer marked
> by fill alone.
>
> The probe was sharpened in the same PR. It previously compared a control's
> border against the surface behind it and stopped there; it now also composites
> the control's **own fill** and reports `borderIsSoleAffordance`. WCAG 1.4.11
> asks for 3:1 on whichever affordance identifies the component, so the two
> cases are no longer conflated:
>
> * **Border is the sole affordance** (transparent control — the unchecked
>   checkbox). Asserted at 3:1 in `e2e/axe.spec.ts`; currently empty in all 24
>   cells.
> * **Control also paints a fill** (filter pills, reminder rows, the
>   "In den Einstellungen öffnen" button). Recorded under a separate category,
>   not asserted.
>
> **Open — needs a design decision, not assigned to a PR.** In the second class
> neither the container border (`--_edge`, 1.35:1 on the page in Dark) nor the
> fill (`--_surface-raised`, 1.21:1) reaches 3:1, so under the strict reading of
> 1.4.11 those controls have no 3:1 affordance. Closing it means making every
> card and pill outline substantially heavier across the whole app, which is a
> visual redesign rather than a token fix — outside what PR3 was asked to do, and
> outside the stated scope of PR4–PR8. It is recorded here so the choice is
> explicit rather than silently inherited.

### 3.4 axe `incomplete` results

axe additionally reports `color-contrast` as **incomplete** for 9 nodes (dark) /
13 nodes (light) on Today — elements it cannot decide because of gradient or
alpha backgrounds (the hero, `bg-primary/15` pills). These are measured directly
by the harness instead and appear in §3.1/§3.2.

---

## 4. Interactive targets below 44 × 44 CSS px — mostly resolved in PR3

> **Status: closed in PR3 except two enumerated classes.**
>
> Controls that could grow were given `min-w-11 min-h-11` (or a real `w-11 h-11`
> where an expanded box had to push a neighbour aside). Controls whose painted
> size is part of the design — the 22 px task checkbox, the "remember me" box,
> the 46 × 26 reminder switch, the small icon buttons in the modals — carry the
> new `.tap-target-44` utility instead: a transparent, absolutely positioned
> `::after` overlay that grows the *hit* area to 44 × 44 without changing the
> painted size or the surrounding layout.
>
> `getBoundingClientRect()` cannot see that overlay, so the harness was taught
> about it: `HitTarget` now reports `effectiveWidth`/`effectiveHeight` alongside
> the painted box, and `meets44` is computed from the effective one. Only
> pseudo-elements that actually generate a box, are positioned out of flow and
> do not set `pointer-events: none` count.
>
> The overlay is deliberately *not* used where controls sit in a tight cluster —
> a 44 px overlay would sit on top of its neighbour and steal its taps. Those
> controls (the snapshot export/delete pair, the Essentials edit/delete pair, the
> search-clear button next to the search field) were grown for real instead.
>
> **Two classes remained below 44 × 44 after PR3 — both closed in PR4:**
>
> | Control | PR3 | PR4 | How |
> |---|---|---|---|
> | Daily Essentials counter chips | 32 × 32 | **44 × 44** | The counter row was side-by-side with the title, where five 44 px chips need 244 px plus padding against ~272 px of usable width at 360 — leaving nothing for the title. The row now **stacks**: title and progress on one line, counters full-width beneath, `flex-wrap` for targets above five. |
> | Inline checklist preview rows on a task card | 282 × 28 | **252 × 44** | Raised to a 44 px activation height across the full row width. Rows are stacked with a 2 px gap, so the enlarged areas abut rather than overlap, and no pseudo-element is involved. |
>
> `TARGET_SIZE_EXCEPTIONS` in `e2e/viewports.spec.ts` is now **empty**: every
> on-screen control must meet 44 × 44. The constant is kept rather than deleted,
> so a future deferral has to be written down with a reason and an owner instead
> of quietly weakening the assertion.
>
> Size alone was not the requirement. `e2e/touch-targets.spec.ts` also asserts
> pairwise non-overlap of every counter chip and every checklist row, no
> horizontal overflow of the page or the Essentials card, and that the enlarged
> controls kept their semantics — `aria-pressed` on the counters, `aria-checked`
> and Enter activation on the rows — using German, Persian and mixed content at
> 360/390/430 × Dark/Light, including a 10-counter Essential.

Totals per tab are **35 (Today) / 34 (All) / 24 (Done)** at every viewport and in
both themes — these are fixed-size controls, so width and theme change nothing.
Values below are from 390 × 812; the full list is in
`matrix-<viewport>-<theme>.json` under `subFortyFourOnScreen` /
`subFortyFourInClosedOverlay`.

### 4.1 On the visible screen

*(PR0 measurement. Post-PR3 outcome in the rightmost column.)*

Distinct undersized controls, with the tabs they appear on. Sizes are fixed and
identical at all three widths.

| Accessible name | Selector | Measured | Appears on | After PR3 |
|---|---|---|---|---|
| `Search` | `header button[aria-label="Search"]` | **22 × 22** | all tabs | ✅ 44 × 44 (`min-w-11 min-h-11`), renamed "Aufgaben durchsuchen" |
| `Settings` | `header button[aria-label="Settings"]` | **22 × 22** | all tabs | ✅ 44 × 44, renamed "Einstellungen" |
| `Verwalten` | `section button[aria-label="Verwalten"]` | **30 × 30** | Today | ✅ 44 × 44, renamed "Essentials verwalten" |
| *(none)* | `button.flex-shrink-0.mt-\[2px\].w-\[22px\]` — task completion checkbox, one per card | **22 × 22** | all tabs | ✅ 44 × 44 hit area via `.tap-target-44`; painted size unchanged; now named and `role="checkbox"` |
| `1` … `6` | `button.w-8.h-8.rounded-md` — Essentials multi-target chips | **32 × 32** each | Today | ⬜ unchanged — deferred to PR4 with the row overflow (§6.3) |
| `Alle Daten` / `Heute` / `Gestern` | `AllTasksFilterBar` pills | **84.7 × 30**, **59.3 × 30**, **71.4 × 30** | All | ✅ `min-h-11` |
| *(none)* | `input[type="date"]` in the filter bar | **131 × 30** | All | ✅ `min-h-11`, named "Nach Datum filtern" |
| checklist item row | `button.flex.items-center.gap-2` | **282 × 18.69** | Today, All | ⬜ raised to 28 px; 44 deferred to PR4 |

Counted per tab at 390 × 812 (in-viewport only, so cards below the fold are not
double-counted): **Today 12 · Alle Aufgaben 13 · Erledigt 4.** The totals differ
only because each tab renders a different number of task cards and filter
controls, not because any control changes size.

Bottom-nav buttons (**93.5 × 56.5**) and the FAB (**56 × 56**) **do** meet
44 × 44 and are not listed.

### 4.2 Inside closed overlays (22–23 more per tab) *(PR0 measurement)*

`NewTaskModal`, `SettingsModal`, `VoiceTaskModal` and `ManageEssentialsModal`
stay mounted when closed and are merely translated off-screen
(`translate-y-full`). Their controls are therefore measured too — for example the
duration pills (**73 × 39**), priority pills (**102 × 41**), the recurrence
`<select>` (**97 × 21**), the reminder toggle (**46 × 26**), and the modal
`Abbrechen` / `Fertig` buttons (**64 × 22.5**).

This is itself a finding, not just a counting artefact — see §5.4.

> **Resolved in PR3.** The four sheets now carry `inert` while closed, so their
> controls leave the tab ring, the accessibility tree and pointer hit-testing
> until the sheet opens.
>
> The harness follows suit: `measurePage` skips any control inside an `[inert]`
> subtree, because reporting it as undersized or unnamed would describe a defect
> the user cannot reach. Text contrast inside the sheets is still measured — the
> colours are real whether the sheet is open or not — and the sheets are still
> exercised directly when a test opens one.

---

## 5. Keyboard and focus findings — resolved in PR3

> **Status: §5.1, §5.3, §5.4, §5.5 and §5.6 were all closed in PR3.**
> `e2e/keyboard.spec.ts` was rewritten to assert the fixed invariants instead of
> the recorded defects, and now runs in **both** themes:
>
> * **Focus indicator.** A single base rule — `:focus-visible { outline: 2px
>   solid var(--_focus); outline-offset: 2px; transition: none }` — replaces the
>   UA ring everywhere and removes every `focus:outline-none`. `transition: none`
>   is deliberate: several controls carry `transition-all`, which animates
>   `outline-width` up from 0 and left the ring invisible for the first frames
>   after focus moved (and unmeasurable — this was the PR0 "0 px ring" artefact).
>   The spec asserts every stop draws an indicator and every indicator clears
>   3:1.
> * **Accessible names.** Every keyboard-reachable control now has one; the spec
>   asserts the set of unnamed stops is empty.
> * **Focus never leaves the screen.** The four sheets are `inert` while closed.
> * **Swipe actions.** They stay in the tab ring — they are the *only* keyboard
>   route to Bearbeiten / Erledigt / Löschen — but focusing one now opens the
>   action strip, exactly as a swipe would, and blurring out of the card closes
>   it. The spec hit-tests the focused button to prove it is no longer covered by
>   the card body.
> * **Daily Essentials.** The collapse header is a `<button aria-expanded>`; a
>   simple essential row is a `<button role="checkbox" aria-checked>`; counter
>   chips carry `aria-pressed` and a name that says what they do rather than a
>   bare digit. A spec toggles a row with Enter alone.
> * **Bottom navigation.** `<nav aria-label="Hauptnavigation">` with
>   `aria-current="page"` on the active destination — the active state is no
>   longer colour-only.
>
> The original PR0 measurements are preserved below for the record.

Measured on the Today tab at 390 × 812, dark. **38 tab stops** before the ring
repeats.

### 5.1 Focus indicator — 38 / 38 stops were effectively invisible

*(PR0 measurement. Closed in PR3 — see the banner at the top of §5.)*

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

> **PR3 changed three of these, and deliberately left one.**
> Findings 2 and 3 are closed: the Essentials collapse header and simple rows are
> real controls and now appear in the ring, and stops 32+ are gone because the
> closed modal is `inert`. Every stop is named. Finding 1 — hidden actions before
> visible ones — is **unchanged on purpose**: the swipe actions are the only
> keyboard route to Bearbeiten / Erledigt / Löschen, and focusing one now reveals
> the strip, so the order is coherent rather than confusing. See §10, PR3.

**Findings (PR0 baseline):**

1. **Hidden actions are tabbed before visible ones.** The first swipe action is
   stop **#9**; the first visible task checkbox is stop **#12**. Within every
   card the action strip precedes the card body in the DOM, so a keyboard user
   walks through three invisible buttons per card before reaching the control
   they can see.
2. **The Daily Essentials collapse header and simple-essential rows never appear
   in the ring at all** — they are `<div onClick>` (§5.3).
3. **Focus leaves the viewport at stop #32** into a closed modal (§5.4).

### 5.3 Controls that were not keyboard operable, and wrong semantics

| Element | Actual markup | Missing | After PR3 |
|---|---|---|---|
| Daily Essentials collapse header | `<div class="cursor-pointer" onClick>` | not focusable; no `role`, no `tabindex`, no `aria-expanded` | ✅ `<button aria-expanded>` with a name that includes the x/y count |
| Simple Essential row (a checkbox in behaviour) | `<div class="cursor-pointer" onClick>` | not focusable; no `role="checkbox"`, no `aria-checked` | ✅ `<button role="checkbox" aria-checked>`; toggling with Enter is asserted |
| "Hinzufügen" link in the empty Essentials state | `<span onClick>` | not focusable, no role | ✅ real `<button>` |
| Multi-target Essential chips | real `<button>` | no `aria-pressed`; accessible name is only the digit ("1", "2", …) | ✅ `aria-pressed` + "«Titel»: n von m" |
| Task completion checkbox | `<button>` with no text and no icon when unchecked | **no accessible name at all**; no `role="checkbox"` / `aria-checked` | ✅ `role="checkbox"` + `aria-checked` + "«Titel» als erledigt markieren" |
| Task card body | `<div onClick>` (closes an open swipe) | not focusable — acceptable, but the swipe gesture it belongs to has no keyboard equivalent | ✅ the swipe gesture now has one: focusing an action opens the strip (§5.4) |

### 5.4 Swipe actions were focusable while completely hidden

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

> **Resolved in PR3 — by revealing them, not by hiding them.** The obvious fix
> (take them out of the tab ring) would have removed the only keyboard route to
> Bearbeiten / Erledigt / Löschen. Instead the strip's container listens for
> `focus`/`blur`: focusing any action opens the card exactly as a swipe would,
> and moving focus out of the strip closes it. The regression test focuses the
> first `Bearbeiten` and hit-tests its centre point — the same probe used above —
> and asserts the button is no longer covered by the card body.

### 5.5 Unnamed controls (axe `button-name`, `label`, `select-name`)

*(PR0 measurement. Every entry closed in PR3; the suite now asserts the set of
unnamed controls is empty in all 24 cells.)*

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

### 5.6 Bottom navigation semantics *(PR0 measurement; resolved in PR3)*

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

> **Resolved in PR3**, with a deliberate deviation from the suggestion above.
> The nav is now `<nav aria-label="Hauptnavigation">` and the active destination
> carries `aria-current="page"`. `role="tablist"`/`role="tab"` was **not** used:
> these buttons swap whole views, not panels inside a composite widget, and tab
> semantics would promise arrow-key navigation within a tab list that the app
> does not implement. `aria-current` is the accurate mapping and needs no extra
> keyboard contract.

---

## 6. Sticky surfaces and layout bleed

### 6.1 Sticky hero (Today, 390 × 812)

| | At scroll top | After scrolling 400px |
|---|---|---|
| `position` / `top` / `z-index` | `sticky` / `-1px` / `20` | same |
| Hero rect (top → bottom) | 53.5 → 154.5 | **−1 → 100** |
| Height | 101 px | 101 px |

The hero pins correctly at `top: -1px` and does **not** clip its own content.

> **Corrected in PR4 — it clipped *other* content.** The PR0 measurement only
> asked whether the hero clipped itself. What it never checked is whether
> anything could still be reached underneath it: the scroll container had
> `scroll-padding-top: auto`, so every programmatic scroll — focus,
> `scrollIntoView`, an anchor — parked content behind the pinned surface. Measured
> at 390 × 812 after scrolling: a time-block heading sat at y = 71 while the hero
> occupied y = 0 → 100.
>
> PR4 gives the shell a measured layout contract. `App.tsx` observes the pinned
> element and publishes its height as **`--mdf-pinned-top`** on the scroll
> container; `scroll-padding-top` is derived from it, and the sticky date headers
> read the same property for their own `top`. Nothing hard-codes an offset — the
> hero's height changes with the German greeting, the viewport width, the font
> that actually loaded, and whether the user pinned it at all, so a constant is
> wrong most of the time. When nothing is pinned the property is `0px`, so the
> non-sticky case falls out of the same contract rather than needing a second
> code path.
>
> Two smaller corrections in the same place: the sticky *wrapper* now carries an
> opaque `bg-page` (the panel is `rounded-b-[2rem]`, so content scrolling
> underneath previously showed through the two bottom corner arcs), and `top` is
> `calc(env(safe-area-inset-top, 0px) - 1px)` so the pinned surface clears a
> notch instead of sliding under it.
>
> Asserted in `e2e/sticky-layout.spec.ts` at 360/390/430 × Dark/Light: the
> contract equals the pinned element's height, `scroll-padding-top` equals the
> contract, and scrolling to **every** section heading, Essentials row and task
> title lands it clear of the pinned surface. Disabling the setting is asserted
> too — `position: static`, contract `0px`, no reserved gap, and the hero
> genuinely scrolls out of view.

### 6.2 Fixed bottom navigation

| | Value |
|---|---|
| Nav rect | top 726.5 → bottom 812 |
| Nav height (incl. safe-area padding) | **85.5 px** |
| Scroll container overlap | **85.5 px of `<main>` sits underneath the nav** |

`<main>` carries `pb-24` (96 px) of bottom padding, which covers the 85.5 px nav,
so no content is permanently unreachable. Recorded so PR4 can verify the margin
survives a taller safe-area inset on a real device (§10).

> **PR4 status: unchanged and still adequate.** PR4 made the top inset explicit
> (`env(safe-area-inset-top)` on the app bar and the pinned offset); the bottom
> margin already used `max(1.25rem, env(safe-area-inset-bottom))` on the nav
> against `pb-24`. Verifying the *real* bottom inset still needs hardware and
> stays with PR8.

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
> measured in the fallback font (§1). Re-measure with Inter loaded before sizing
> the fix. The *existence* of the overflow at 360 is not in doubt — the chips
> alone are 6 × 32 px + 5 gaps + padding — but the exact px is provisional.
>
> **Closed in PR4, together with the chip size.** The two were always the same
> problem: the row overflowed because a title and a horizontal run of counters
> were competing for one line. PR4 stacks them — title and progress on one line,
> counters full-width beneath with `flex-wrap` — which both removes the overflow
> and makes room for 44 × 44 counters.
>
> Re-measured after the change at 360 × 812 with a 10-counter Essential and
> Persian, German and mixed titles: **page overflow 0 px, Essentials card
> overflow 0 px**, every counter 44 × 44, no two counters intersecting.

### 6.4 Cards and action strips

No card or action strip bleeds outside its rounded container at any of the three
widths: the strip is `absolute inset-y-0 right-0` inside an
`overflow-hidden rounded-2xl` wrapper, and `documentBleedPx` is 0 everywhere.
The 4 px overflow observed on the All tab's group containers is the same
`overflow-hidden` wrapper measuring its own clipped child; nothing is visible.

> **This conclusion was wrong, and PR4 corrected it.** The measurement was
> geometric — box overflow — and geometry was never the problem. A real device
> showed a blue/green/red line at the edge of resting cards ("F8").
>
> **Root cause.** The strip painted at full opacity directly underneath the card
> body. The body is a *separately rasterised layer* — it carries a `transform`
> and `will-change: transform` — so its antialiased 16 px corner arcs never
> coincide exactly with the wrapper's own rounded clip. The two rounded rects are
> composited independently, and the seam between them shows whatever is beneath.
>
> **Measured, before the fix**, by screenshotting a resting card, hiding the
> strip, screenshotting again and comparing the decoded rasters — so the finding
> is the strip's own contribution, not a guess about colours:
>
> | Device pixel ratio | Strip-coloured pixels per card | Worst per-channel delta |
> |---|---|---|
> | 1 | 31–47 | 68 |
> | 1.25 | 31–47 | 68 |
> | 1.5 | 33–47 | 80 |
> | 2 | 33–47 | 80 |
> | 3 | 33–47 | 80 |
>
> Concentrated at x ≈ 334 of a 350 px card — the right-hand 16 px corner arcs.
>
> **Fix.** Nothing painted underneath a rounded, composited layer can be relied
> on to stay hidden, so the strip does not paint until it is actually being
> revealed: `opacity-0 pointer-events-none` at rest, full opacity as soon as a
> drag exposes it or focus enters it. Its buttons stay in the DOM and in the tab
> ring, so PR3's focus-reveals-the-actions behaviour is unchanged. This is
> deliberately not a matching background colour, which would only hide the seam
> against one palette.
>
> **After the fix: 0 pixels, delta 0, at every ratio above, in both themes.**
> Asserted in `e2e/card-containment.spec.ts`, along with the strip being inert to
> pointers while hidden, the swipe still revealing it, keyboard focus still
> revealing and operating it, and a Persian task title not moving the actions to
> the wrong edge.

---

## 7. Reminders — resolved in PR2

> **Status: the limitation below was fixed in PR2.** The Erinnerungen tab now
> opens a real screen that lists tasks with reminders enabled, split into
> *Geplant*, *Ohne Zeit — keine Erinnerung möglich*, and *Zeitpunkt vergangen*,
> and states plainly: „Erinnerungen werden nur ausgelöst, solange My Daily Flow
> geöffnet ist. Wenn du die App oder den Browser schließt, können geplante
> Erinnerungen ausbleiben." The underlying delivery mechanism is unchanged and
> remains foreground-only — PR2 corrected the *claim*, not the capability.
> `SettingsModal`'s „Erinnerungen aktiviert ✓" was replaced with the same
> truthful wording.
>
> The original PR0 finding is preserved below for the record.

**PR0 baseline finding — there was no Reminders screen; the tab did nothing.**

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
| *(none)* | The PR0 baseline declared one expected failure — `nav.spec.ts › Erinnerungen tab — known gap › opens a Reminders screen`, pinned against the inert tab. **PR2 built the screen, so that entry is resolved and removed**; it is now an ordinary passing regression test (`Erinnerungen tab › opens a real Reminders screen`). No expected failures remain. |

### 9.2 axe baseline — a node-level, two-directional ratchet

> **Updated in PR3: the committed baseline is now empty.** axe reports **0
> violating nodes in all 24 cells**. The ratchet itself is unchanged and is now
> doing the more valuable job — with an empty expected set, *any* new violating
> node in any cell fails the run immediately.
>
> **Fingerprint delta, inspected node by node** (committed set before PR3 → after):
>
> | Rule | Removed | Added | Re-spelled |
> |---|---|---|---|
> | `color-contrast` | 173 | 0 | 0 |
> | `button-name` | 144 | 0 | 0 |
> | `label` | 30 | 0 | 0 |
> | `select-name` | 24 | 0 | 0 |
> | **Total** | **371** | **0** | **0** |
>
> Every removal is a fix, not a re-spelling: each corresponds to a change in this
> PR (a token, an `aria-label`, a `<label for>`). No fingerprint changed target
> while keeping its rule, and no new fingerprint appeared in any cell. Per-cell
> removals ranged from 8 (`*|*|reminders`) to 27 (`430x812|light|all`); the light
> palette carried the larger share, as §3.2 predicted.
>
> *(The PR0 document quoted 401 here. The committed file at the PR3 base commit
> held 371 — PR2 rebuilt the matrix when it added the Reminders surface and fixed
> the contrast violations it would otherwise have introduced. 371 is the number
> that was actually pinned and is the number this delta is measured against.)*
>
> Two of the harness's own probes graduated from "recorded only" to asserted in
> the same PR, because PR3 closed them:
>
> * **Unnamed controls** — asserted empty per cell.
> * **Boundary contrast where the border is the sole affordance** — asserted
>   empty per cell (see §3.3 for the sharpened probe and the one class that is
>   recorded but not asserted).
>
> The remaining probes stay recorded-only, and the "still returns findings"
> assertions were replaced with "still inspected controls", which is what those
> assertions were actually for.

**What was pinned before PR3.** `e2e/baseline/axe-fingerprints.ts` committed
**371 fingerprints across all 24 cells** of the matrix (`viewport|theme|tab`).
Each fingerprint is one violating node:

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

**The matrix key set is pinned as well.** Before any fingerprint is compared,
the run asserts that the keys of `AXE_FINGERPRINTS` are exactly the 24 cells
derived from `VIEWPORTS × THEMES × TABS` (3 × 2 × 4 = 24). Without that, a *missing* cell would
merely leave `AXE_FINGERPRINTS[key]` undefined and a *stale* cell — left behind
after a viewport or tab is renamed — would never be compared against at all.
Both are silent holes in the baseline, so both fail. The expected keys are
derived from the same constants the tests iterate, never hand-listed, so the
expectation cannot drift from what actually runs. `regenerate.mjs` enforces the
same completeness on the way in, and additionally refuses to overwrite duplicate
evidence for a cell.

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

**What is *not* pinned.** The harness's own measurements — sub-44px targets and
the full contrast table — are **measured, attached and annotated, but not pinned
node by node**. Their numbers live in this document and in
`test-results/baseline/*.json`. What *is* asserted, after PR3:

| Measurement | Assertion | Where |
|---|---|---|
| Text contrast | the set of failing pairs is empty, per cell | `viewports.spec.ts` |
| Target size | no on-screen control below 44 × 44 outside `TARGET_SIZE_EXCEPTIONS` | `viewports.spec.ts` |
| Accessible names | the set of unnamed controls is empty, per cell | `axe.spec.ts` |
| Boundary contrast (border is the sole affordance) | the set of failures is empty, per cell | `axe.spec.ts` |
| Focus indicator | every stop draws one, and every one clears 3:1 | `keyboard.spec.ts` |
| Focus scope | no focus stop is outside the viewport | `keyboard.spec.ts` |
| Theme tokens | the two Light palette blocks are identical; no `@theme` token points at an undeclared value | `tests/themeTokens.test.ts` |

Violating nodes per scan at the **PR0 baseline** (390 × 812, Today) — all now 0:

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

### PR3 — tokens/contrast, names and semantics, focus/keyboard, 44 px targets — **delivered**

Every item below is checked against what actually landed. Items that were *not*
done carry the reason and, where one exists, the owner.

*Colour and tokens*

* ✅ Every pair in §3.1 and §3.2 now meets its threshold, asserted as an empty
  failure set across all 24 cells.
* ✅ All theme-blind literal palette classes removed across 11 components —
  `text-slate-*`, `bg-slate-*`, `bg-blue-*`, `bg-red-*`, `bg-rose-*`,
  `bg-amber-*`, `bg-emerald-*`, `text-violet-*`, `bg-[#1d4aba]`, `bg-[#475569]`,
  and `[color-scheme:dark]` on the All-tab date input.
* ✅ `--ring-track` fixed — `HomeHero` now reads `var(--color-ring-track)`, so
  the progress ring has a visible track again.
* ✅ New token families: `primary-text` / `primary-surface` / `primary-border`,
  `danger` / `warning` / `success` / `accent` (each with text, surface, border
  and a `-solid` fill), `neutral-solid`, `focus`, four `block-*` time-block
  accents and three `priority-*` values — declared in both palettes.
* ✅ The two hardcoded `rgba()` glows (time-block bars, priority dots) replaced
  with `.accent-glow` / `.dot-glow`, which take their hue from `currentColor`
  and therefore follow the palette.
* ⬜ **Not done — self-hosting Inter.** This was a "consider", and it is a
  network and build change rather than an accessibility one. The render-blocking
  Google Fonts link and its ~13 s stall in a no-egress environment are unchanged;
  the measurement caveat in §1 still applies. No owner assigned.

*Names and semantics*

* ✅ Task completion checkbox: `role="checkbox"` + `aria-checked` + a name that
  includes the task title.
* ✅ Named: search input and its close button, the date filter input, the
  NewTaskModal title / notes / time / duration / checklist inputs, the recurrence
  `<select>`, both reminder toggles, every modal close button, and the swipe
  actions. Zero unnamed controls in all 24 cells.
* ✅ Essentials collapse header is a `<button aria-expanded>`; simple rows are
  `<button role="checkbox" aria-checked>`; chips carry `aria-pressed` and a name
  that says what they do.
* ✅ Bottom nav: `<nav aria-label>` + `aria-current="page"` on the active
  destination. `role="tablist"`/`tab` was **not** used — these buttons swap whole
  views rather than panels within a composite widget, and `aria-current` is the
  accurate mapping.
* ✅ Colour-only state removed elsewhere too: the priority dot carries
  `role="img"` and a German name ("Priorität: hoch/mittel/niedrig"); the
  recurrence badge, which renders only an icon, is named "Wiederholende
  Aufgabe"; overdue and rollover badges already carried text.

*Focus and keyboard*

* ✅ A single base rule authors the focus indicator; every `focus:outline-none`
  is gone. Asserted: every stop draws one, every one clears 3:1, in both themes.
* ✅ Closed modals are `inert`, so Tab no longer walks off-screen. Asserted: no
  focus stop is outside the viewport.
* ⚠️ **Deliberately not done — removing the swipe actions from the tab ring.**
  The baseline suggested taking them out *and* adding a non-swipe path. They are
  already the only keyboard route to Bearbeiten / Erledigt / Löschen, so removing
  them would have deleted keyboard access rather than fixed it. Instead, focusing
  one now opens the action strip exactly as a swipe would, and blurring out of
  the card closes it — the control is visible while focused. The spec hit-tests
  the focused button to prove it is no longer covered by the card body.
* ⚠️ **Focus order unchanged.** The action strip still precedes the card body in
  the DOM, so a card's actions are tabbed before its checkbox. With the strip now
  revealing itself on focus this is coherent rather than confusing, and
  reordering the DOM would move the swipe layer above the card body. Left as-is
  deliberately; revisit with PR4's action-strip containment work.

*Target sizes and related accessibility layout*

* ✅ Search, Settings, Verwalten, the task checkbox, filter pills, the date
  input, the modal buttons and the icon buttons in the sheets all reach 44 × 44,
  by real sizing or by the `.tap-target-44` overlay (§4).
* ⬜ **Deferred to PR4 with reasons recorded** — Essentials chips (32 × 32) and
  inline checklist rows (28 px tall). Both are enumerated in
  `TARGET_SIZE_EXCEPTIONS`; see §4.
* ⬜ **Not done — the Daily Essentials chip-row overflow at 360 px (§6.3).**
  This is layout containment, which the queue assigns to PR4, and enlarging the
  chips here would have made it worse. Owner: PR4.

### PR4 — sticky-surface clipping and F8 / action-strip containment — **delivered**

* ✅ **Sticky clipping.** Replaced by a measured, shell-owned layout contract
  (`--mdf-pinned-top`) driving `scroll-padding-top` and the date headers' `top`.
  See §6.1.
* ✅ **Sticky date headers.** They now pin *below* the contract instead of at
  `top: 0`, and are opaque — `bg-page/95` let task titles smear through as they
  scrolled underneath. Asserted at all three widths in both themes.
* ✅ **F8 / action-strip containment.** Root-caused and fixed; see §6.4.
* ✅ **The two 44 × 44 exceptions PR3 deferred.** Both closed; see §4.
  `TARGET_SIZE_EXCEPTIONS` is now empty.
* ✅ **Deployment pruning.** `gh-pages` defaults `remove` to `'.'`, and globby
  runs that pattern with `dot: false` — so dotfiles on the branch were never
  matched and `.env.example` / `.gitignore` survived every deploy. The `deploy`
  script now passes `--remove "{**/*,**/.*}"`, a supported option; no force, no
  history rewrite, no dependency change.
* ⬜ **Still with PR8.** Re-verifying the 85.5 px nav / 96 px `pb-24` margin
  against a *real* safe-area inset needs hardware (§6.2).

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
  390 px is the concrete item.
* **Whether the `.tap-target-44` overlay behaves on a real touchscreen.** The
  suite measures the pseudo-element's box and Chromium's hit-testing; a finger
  has a contact patch and Android applies its own touch-slop and fuzzing on top.
  Worth confirming that the enlarged areas help and that none of them steals a
  tap from a neighbour (§4).
* **TalkBack announcement of the new roles** — `role="checkbox"` on a `<button>`
  for task completion and simple Essentials, `role="switch"` on the two settings
  toggles, and `aria-current="page"` on the bottom nav (§5).

---

## 12. Where the raw numbers live

| Artifact | Contents |
|---|---|
| `test-results/baseline/matrix-<viewport>-<theme>.json` | every contrast pair, every hit target, overflow, sticky geometry |
| `test-results/baseline/axe-<viewport>-<theme>-<tab>.json` | node fingerprints, axe rule ids, classified findings, category counts |
| `test-results/baseline/keyboard-focus-order-today-<theme>.json` | the full traversal with focus styles and ring contrast, per theme |
| `test-results/baseline/essentials-contrast-<viewport>-<theme>.json` | composited Daily Essentials text contrast (DE/FA/emoji/mixed) |
| `test-results/artifacts/**` | Playwright traces and failure screenshots, including the card rasters the F8 containment test compares |
| `test-results/baseline/modal-new-task-<theme>.json` / `modal-settings-<theme>.json` | the sheets measured while **open**, with the NewTaskModal disclosure expanded |
| `test-results/baseline/backup-*.json` | export contents and round-trip results |
| `test-results/baseline/reminders-tab-state.json` | the inert-tab evidence |
| `playwright-report/` | HTML report with the same payloads attached per test |

All of these are gitignored — they are regenerated by `npm run test:browser`.

The committed baseline is three files:

| File | Role |
|---|---|
| `e2e/baseline/axe-fingerprints.ts` | generated; the pinned node fingerprints — **0 across all 24 cells after PR3** (§9.2) |
| `e2e/baseline/known-violations.ts` | hand-written; rule meanings and PR ownership |
| `e2e/baseline/regenerate.mjs` | rebuilds the fingerprints file from a recording run |
| `docs/a11y-baseline-1a.md` | this document |

Two guards live outside the browser suite:

| File | Role |
|---|---|
| `tests/themeTokens.test.ts` | parses `src/index.css`: the two Light palette blocks must stay identical, no `@theme` token may point at an undeclared private value, and the Dark palette must define everything the Light one does |
| `e2e/viewports.spec.ts` `TARGET_SIZE_EXCEPTIONS` | the two control classes still below 44 × 44, each with a reason and an owner |
