/**
 * known-violations.ts — human-readable side of the committed axe baseline.
 *
 * The machine-checkable side lives in `axe-fingerprints.ts`. This file holds
 * only what a person needs: which rule means what, and which PR in the approved
 * Phase 1A queue owns closing it.
 *
 * Nothing here suppresses a violation. Every violating node is fingerprinted,
 * asserted, annotated in the run output, and written to
 * `test-results/baseline/axe-*.json`.
 */

export type AxeTab = 'today' | 'all' | 'done' | 'reminders';
export type AxeTheme = 'dark' | 'light';

/**
 * Key for one cell of the measurement matrix.
 *
 * Stable and sortable, and deliberately free of anything environment-specific:
 * no paths, no timestamps, no machine names.
 */
export function cellKey(viewport: string, theme: string, tab: string): string {
  return `${viewport}|${theme}|${tab}`;
}

/**
 * Deterministic identity for one violating node.
 *
 * `rule ID :: normalized axe target`. The axe target is a CSS selector path
 * derived from the rendered DOM — stable across runs for the same build and the
 * same seeded data, and free of the things that make snapshots rot: no element
 * HTML, no timestamps, no absolute paths, no browser-generated IDs.
 *
 * Including the *target* and not just the rule ID is what makes the ratchet
 * two-directional at node granularity: a newly unnamed button under the
 * already-known `button-name` rule changes the fingerprint set, and the run
 * fails, where a rule-ID-only comparison would have said nothing.
 */
export function axeFingerprint(ruleId: string, target: unknown): string {
  const parts = Array.isArray(target) ? target : [target];
  const normalized = parts
    .map((part) => (Array.isArray(part) ? part.join(' ') : String(part)))
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    // Nested frames come through as an ordered path; keep the order, make the
    // separator explicit so it can never be confused with a descendant combinator.
    .join(' >>> ');
  return `${ruleId} :: ${normalized}`;
}

/**
 * Why each rule is still open, and which PR in the approved Phase 1A queue
 * closes it. Surfaced in the run annotations so the reason travels with the
 * finding.
 *
 * **As of PR3 the committed baseline is empty: axe reports zero violating nodes
 * in all 24 cells.** This map is therefore no longer a list of open debt — it is
 * the triage table the ratchet reaches for if a rule ever comes back, so an
 * annotation always carries a reason and an owner instead of a bare rule ID.
 *
 * Queue for reference:
 *   PR2 untimed-task correctness, navigation, the functional Reminders screen
 *   PR3 tokens/contrast, accessible names and semantics, focus/keyboard, 44px
 *       targets, related accessibility layout work
 *   PR4 sticky-surface clipping and F8/action-strip containment
 *   PR5 RTL/bidi hardening, measured DE/EN/FA/mixed coverage
 *   PR6 safe destructive actions
 *   PR7 date capture
 *   PR8 physical Android / installed-PWA verification
 */
export const VIOLATION_OWNERS: Record<string, string> = {
  'button-name':
    'Closed in PR3: every button carries an aria-label or visible text, including the TaskCard completion checkboxes, the reminder toggles and the modal close buttons. A recurrence here is a regression, not known debt. Owner: whoever reintroduced it.',
  'color-contrast':
    'Closed in PR3: the foreground ramp, the status token families and primary-as-text were re-tuned in both palettes, and e2e/viewports.spec.ts asserts an empty failure set across the matrix. A recurrence is a regression. Owner: whoever reintroduced it.',
  label:
    'Closed in PR3: the search field, the All-tab date input and every NewTaskModal input carry an aria-label or a <label for>. A recurrence is a regression.',
  'select-name':
    'Closed in PR3: the recurrence <select> has an aria-label. A recurrence is a regression.',
  'aria-allowed-attr':
    'Not currently triggered. PR3 introduced role="checkbox"/"switch" with aria-checked and aria-pressed; a violation here means an ARIA attribute was put on an element whose role does not allow it.',
  'aria-required-attr':
    'Not currently triggered. A violation here means a role="checkbox"/"switch" lost its aria-checked.',
  'nested-interactive':
    'Not currently triggered. Watch the TaskCard checklist rows and the Daily Essentials rows, which are buttons containing other content.',
  'target-size':
    'Not currently triggered as an axe violation. The harness measures target size itself; the two classes still below 44x44 are enumerated with owners in TARGET_SIZE_EXCEPTIONS in e2e/viewports.spec.ts. Owner: PR4.',
};
