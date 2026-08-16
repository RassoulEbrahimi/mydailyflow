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

export type AxeTab = 'today' | 'all' | 'done';
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
    'TaskCard completion checkboxes are <button>s that render nothing when unchecked and a bare icon when checked, with no aria-label. The reminder toggle and the modal close buttons are likewise unnamed. Owner: PR3.',
  'color-contrast':
    'Secondary/faint/meta foreground tokens fall below 4.5:1 against their surfaces in both palettes; the light palette is the worse of the two. Owner: PR3.',
  label:
    'The search field, the All-tab date input and the NewTaskModal inputs (title, time, duration) have neither a <label> nor an aria-label. Owner: PR3.',
  'select-name':
    'The recurrence <select> in NewTaskModal has no accessible name. Owner: PR3.',
  /* Not currently triggered. Listed so an owner exists the moment one is. */
  'aria-allowed-attr': 'Owner: PR3.',
  'aria-required-attr': 'Owner: PR3.',
  'nested-interactive': 'Owner: PR3.',
  'target-size': 'Owner: PR3.',
};
