/**
 * 追形 — how the body gets to where you are pointing, during 历练.
 *
 * The mode used to be steered by dragging, on the argument that it added no controls. What it
 * actually did was hold the pointer hostage: the overlay has to take clicks for the whole gesture,
 * so for ninety seconds the desktop underneath was unclickable, and the hand that was steering was
 * the same hand that could not do anything else. Following the cursor costs nothing — the position
 * already arrives from Rust at 30 Hz while the window stays click-through, because the eyes have
 * always tracked it.
 *
 * ## Why hops rather than a glide
 *
 * A body that slides to the cursor is a cursor with a bigger sprite. The hop is what makes it a
 * creature going somewhere: it gathers, it commits to a distance, it lands, and for a moment it is
 * nowhere near where you are pointing. That moment is the whole mode — the gap between where you
 * want to be and where the body has got to is the thing you are playing against, and a glide has
 * no gap in it.
 *
 * So the plan here is deliberately **not** a velocity. It is one hop at a time, decided at the
 * moment the body leaves the ground, and the target may have moved by the time it lands.
 *
 * ## The two numbers that matter
 *
 * **Height.** `rise` is in pixels against a body that is 46 of them across at 练气 and grows with
 * the realm, so these are deliberately large: at full stretch a hop clears more than a body width.
 * Two thirds of a radius was tried first and the result was a slime *sliding* with a slight bob —
 * the lift has to be big enough that the contact shadow visibly detaches, or none of this reads as
 * leaving the ground at all.
 *
 * **`Pull`** — a hop covers this fraction of what is left, so the approach is geometric and the
 * body shuffles as it arrives instead of stamping down on the target. Converging rather than
 * arriving is also what keeps it from oscillating under a stationary cursor.
 *
 * **Average speed.** 邪气 close in at 52 px/s at 筑基 and 106 at 大乘 (`Trial.ts`). A pursuit that
 * cannot outpace the fastest of those is not a control scheme, it is a handicap — so the cycle is
 * tuned for roughly 600 px/s at full stretch, which is the same order as the 700 px/s the checks
 * already drive a bot at. Nothing in the ladder was retuned for this; the asserted runs there are
 * all driven with the body held still, and the one that moves is reported rather than asserted.
 */

/** Closer than this and it has arrived: no hop is planned and the body holds still. */
export const Settle = 16;

/** The furthest a single hop carries, in pixels. Past this, distance buys more hops, not bigger ones. */
export const MaxReach = 300;

/** The shortest hop worth leaving the ground for. Below it the body would be twitching, not hopping. */
export const MinReach = 24;

/** How much of the remaining distance one hop takes. */
export const Pull = 0.62;

export interface Hop {
  /** Seconds crouched before it leaves the ground. */
  gather: number;
  /** Seconds in the air. */
  air: number;
  /** Seconds standing after it lands, before the next gather. */
  rest: number;
  /** How far this hop carries, in pixels. */
  reach: number;
  /** How far off the plane it gets at the top, in pixels. */
  rise: number;
}

/**
 * The next hop toward something `distance` away, or null if it is already there.
 *
 * Everything scales off `reach` rather than off `distance`, so a hop that was capped behaves like
 * the long hop it is rather than like the enormous distance it came from. A big hop crouches
 * longer, goes higher, stays up longer and barely pauses on landing; a small one is a quick shuffle
 * with a beat after it.
 */
export function planHop(distance: number): Hop | null {
  if (distance <= Settle) return null;
  // Never past the target: a hop that overshoots turns the approach into an oscillation around the
  // cursor, which looks like indecision rather than like arriving.
  const reach = Math.min(distance, Math.max(MinReach, Math.min(MaxReach, distance * Pull)));
  // Clamped because `reach` is clipped to the distance on the last hop of an approach, which
  // can put it under `MinReach` and would otherwise run every number below out of its range.
  const effort = Math.max(0, Math.min(1, (reach - MinReach) / (MaxReach - MinReach)));
  return {
    gather: 0.085 + effort * 0.055,
    air: 0.15 + effort * 0.15,
    rest: 0.075 - effort * 0.045,
    reach,
    rise: 14 + effort * 44,
  };
}

/** Seconds from one launch to the next, at a given plan. */
export function cycleSeconds(hop: Hop): number {
  return hop.gather + hop.air + hop.rest;
}

/** Pixels per second a run of this hop averages, including the time spent not moving. */
export function pace(hop: Hop): number {
  return hop.reach / cycleSeconds(hop);
}

/**
 * How far off the plane the body is, `t` of the way through the air.
 *
 * A sine arch rather than a parabola. There is no gravity in a plane seen from above, so nothing
 * here is simulating a fall — this is the shape a hop reads as, and the sine is the one that
 * leaves and lands at exactly zero with a single peak in the middle, which is what the contact
 * shadow needs to grow back to full size on touchdown.
 */
export function arch(t: number, rise: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.sin(t * Math.PI) * rise;
}
