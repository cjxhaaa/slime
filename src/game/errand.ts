/**
 * Where the pet should be walking, and whether it is on an errand.
 *
 * This is nine lines of logic that has now broken twice, which is why it is a function in its own
 * file with assertions against it rather than a branch in the frame loop.
 *
 * The first break was one nullable doing two jobs — "is there an errand" and "where is home" — so
 * nothing invalidated home afterwards and a pet thrown across the screen walked all the way back to
 * where it had been standing when a charm dropped minutes earlier.
 *
 * The second break was subtler and is the reason this file exists. Picking the pet up set
 * `onErrand = false` with a comment saying that a deliberate placement outranks an errand every
 * time — and then the frame loop set it straight back to true, because the loop asked "is there a
 * charm on the desktop" without ever asking "is the pet in somebody's hand". So dragging the pet
 * onto a charm, feeding it, and throwing it somewhere else left a pending walk-home against a
 * `home` that had been frozen since before the drag started, and the pet trudged back to a spot the
 * user had not chosen. The comment was right; the code did not implement it.
 *
 * The rule, stated once: **a charm is worth fetching, and being held outranks a charm.**
 */
export interface ErrandInput {
  /** True while the user has hold of the pet. Nothing is an errand while this is true. */
  held: boolean;
  /** The nearest landed charm's x, or null when there is nothing to fetch. */
  charmX: number | null;
  /** Where the pet is now. */
  x: number;
  /** Where it was last put down, or null if that is not known yet. */
  home: number | null;
  /** Whether it was on an errand as of last frame. */
  onErrand: boolean;
  /** How near home counts as arrived. */
  closeEnough: number;
}

export interface ErrandOutput {
  onErrand: boolean;
  /** Where to walk, or null to stop and stay. */
  chase: number | null;
}

export function resolveErrand(input: ErrandInput): ErrandOutput {
  // Being carried is not an errand, and it is not a *paused* errand either. Whatever the pet was
  // doing before it was picked up, the placement that ends the gesture replaces it.
  if (input.held) return { onErrand: false, chase: null };

  if (input.charmX !== null) return { onErrand: true, chase: input.charmX };

  if (!input.onErrand) return { onErrand: false, chase: null };

  // Nothing left to fetch. Walk back to where it was left, and only then call the errand done.
  if (input.home === null || Math.abs(input.x - input.home) < input.closeEnough) {
    return { onErrand: false, chase: null };
  }
  return { onErrand: true, chase: input.home };
}
