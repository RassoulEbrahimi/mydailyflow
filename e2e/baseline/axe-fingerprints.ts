/**
 * axe-fingerprints.ts — the committed, machine-checkable axe baseline.
 *
 * GENERATED FILE. Do not hand-edit individual entries; regenerate instead.
 *
 * One entry per cell of the measurement matrix (`viewport|theme|tab`), holding
 * every axe violating node as a `rule ID :: normalized target` fingerprint,
 * deduplicated and sorted.
 *
 * Regenerate:
 *   MDF_AXE_BASELINE_WRITE=1 npm run test:browser
 *   node e2e/baseline/regenerate.mjs > e2e/baseline/axe-fingerprints.ts
 *
 * A regenerated file is byte-identical when nothing changed, so an unexpected
 * diff here is itself the signal.
 *
 * The key set is pinned too, not just the fingerprints: axe.spec.ts asserts that
 * these keys are exactly the measured matrix, so a missing cell and a stale
 * leftover cell both fail the run.
 *
 * Since PR3 every cell is empty. That is the strongest form of this ratchet:
 * with nothing expected, any violating node anywhere fails the run.
 *
 * See known-violations.ts for what each rule means and which PR owns it.
 */

export const AXE_FINGERPRINTS: Record<string, string[]> = {
  '360x812|dark|all': [],
  '360x812|dark|done': [],
  '360x812|dark|reminders': [],
  '360x812|dark|today': [],
  '360x812|light|all': [],
  '360x812|light|done': [],
  '360x812|light|reminders': [],
  '360x812|light|today': [],
  '390x812|dark|all': [],
  '390x812|dark|done': [],
  '390x812|dark|reminders': [],
  '390x812|dark|today': [],
  '390x812|light|all': [],
  '390x812|light|done': [],
  '390x812|light|reminders': [],
  '390x812|light|today': [],
  '430x812|dark|all': [],
  '430x812|dark|done': [],
  '430x812|dark|reminders': [],
  '430x812|dark|today': [],
  '430x812|light|all': [],
  '430x812|light|done': [],
  '430x812|light|reminders': [],
  '430x812|light|today': [],
};
