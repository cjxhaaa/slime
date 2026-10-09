/**
 * Depth order for 历练 — what is in front of what, in a plane seen from above.
 *
 * The mode draws in fixed layers: 邪气, then attacks, then the pet. That is correct exactly half
 * the time. A 邪气 standing **below** the slime on screen is nearer the viewer and should cover
 * it, and the fixed order says it never does; 山崩's stones made it obvious because a stone is
 * tall and solid, but the slime has been walking through things the whole time.
 *
 * ## Why `y` alone is enough
 *
 * In a plane seen from above, where a thing *is* and where it touches the ground are the same
 * point. So the sort key is just `y`, and nothing has to carry a separate foot position or a
 * bounding volume. That is the whole reason this is affordable in a mode that can have six hundred
 * things on the field at 大乘.
 *
 * ## Why this is not a list of objects
 *
 * The obvious shape is `{ y, draw }[]`, rebuilt every frame. At 大乘 that is six hundred object
 * literals and six hundred closures a frame, thrown away immediately — and `Menace` is a flat
 * record specifically so that a thousand of them cost one allocation each, which that would undo
 * at the last step.
 *
 * So the queue is flat arrays reused across frames, and a painter is a function held once by
 * whoever owns the things being painted. Nothing here allocates after the first few frames except
 * the arrays growing to their high-water mark.
 *
 * ## What is in it, and what is not
 *
 * **In:** anything solid that stands on the ground — 邪气, the pet, 山崩's stones, 木人桩.
 *
 * **Out:** light. Talismans, bolts, blades, frost, trails and the rings a pairing throws are drawn
 * additively in one pass afterwards, and they stay there. Not for want of effort: a projectile in
 * flight is *above* the ground rather than on it, so its `y` is not where it would be occluded
 * from anyway — and additive light that something else can cover stops reading as light at all.
 */

/** Paints item `index` of whatever queued it. */
export type Painter = (context: CanvasRenderingContext2D, index: number) => void;

export class Depth {
  private ys: number[] = [];
  private painters: Painter[] = [];
  private items: number[] = [];
  private order: number[] = [];
  private count = 0;

  /** Empties the queue without releasing its arrays, which is the point of it. */
  reset(): void {
    this.count = 0;
  }

  add(y: number, painter: Painter, index: number): void {
    const at = this.count++;
    this.ys[at] = y;
    this.painters[at] = painter;
    this.items[at] = index;
  }

  get size(): number {
    return this.count;
  }

  /**
   * Draws everything queued, furthest first.
   *
   * The sort runs over an index array rather than over the entries, so nothing is copied and the
   * three parallel arrays stay put.
   */
  paint(context: CanvasRenderingContext2D): void {
    const n = this.count;
    if (n === 0) return;
    const order = this.order;
    for (let i = 0; i < n; i++) order[i] = i;
    // `length` is set rather than the array rebuilt, so a frame with fewer things than the last
    // one does not sort the leftovers of that one.
    order.length = n;
    const ys = this.ys;
    order.sort((a, b) => ys[a] - ys[b]);
    for (let i = 0; i < n; i++) {
      const at = order[i];
      this.painters[at](context, this.items[at]);
    }
  }
}
