/**
 * known-violations.ts — the committed axe-core baseline for Phase 1A.
 *
 * These are the accessibility violations the app has *today*. They are listed
 * here so that:
 *
 *   - the harness itself can pass, without any violation being silently
 *     swallowed — every entry is reported in the run output and written into
 *     docs/a11y-baseline-1a.md;
 *   - a *new* violation fails the suite immediately;
 *   - a *fixed* violation also fails the suite, forcing this list and the
 *     baseline document to be updated in the same PR that fixed it.
 *
 * Nothing in this file excuses a violation. It is a ratchet, not a suppression
 * list. PR3/PR4/PR5 are expected to shorten it.
 *
 * Regenerate the measured input with:
 *   MDF_AXE_BASELINE_WRITE=1 npm run test:browser -- axe.spec.ts
 * then read test-results/baseline/axe-*.json and update the sets below.
 */

export type AxeTab = 'today' | 'all' | 'done';
export type AxeTheme = 'dark' | 'light';

/** Rule IDs axe reports as violations, per theme and tab. Sorted. */
const CURRENT = ['button-name', 'color-contrast', 'label', 'select-name'];

export const KNOWN_AXE_VIOLATIONS: Record<AxeTheme, Record<AxeTab, string[]>> = {
  dark: {
    today: CURRENT,
    all: CURRENT,
    done: CURRENT,
  },
  light: {
    today: CURRENT,
    all: CURRENT,
    done: CURRENT,
  },
};

/**
 * Why each known rule is still open, and who closes it.
 * Surfaced in the run annotations so the reason travels with the failure.
 */
export const VIOLATION_OWNERS: Record<string, string> = {
  'button-name':
    'TaskCard completion checkboxes are <button>s that render nothing when unchecked and a bare icon when checked, with no aria-label. Owner: PR4.',
  'color-contrast':
    'Secondary/faint/meta foreground tokens fall below 4.5:1 against their surfaces in both palettes; the light palette is the worse of the two. Owner: PR3.',
  label:
    'The search field and the NewTaskModal inputs (title, time, duration) have neither a <label> nor an aria-label. Owner: PR4.',
  'select-name':
    'The recurrence <select> in NewTaskModal has no accessible name. Owner: PR4.',
  /* Rules not currently triggered, listed so an owner exists the moment one is. */
  'aria-allowed-attr': 'Owner: PR4.',
  'nested-interactive': 'Owner: PR4.',
  'target-size': 'Owner: PR5.',
};
