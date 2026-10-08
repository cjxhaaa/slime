/**
 * The two curves that decide how long something spends looking wrong.
 *
 * Both are here rather than beside the code that draws with them because both are pure, both are
 * asserted against, and the assertions run in Node — a renderer module reachable from the check
 * suite drags its own imports along with it for no gain.
 */

/**
 * Ease in and out, with exact endpoints.
 *
 * The endpoints matter more than the curve: the sleep fade builds a gradient per frame while it is
 * in progress and uses a cached one when it is not, so "in progress" has to be able to end.
 */
export function smooth(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * How visible an auspicious cloud is, given how far along its travel it is.
 *
 * Fades in quickly, holds, and then leaves in a hurry. The obvious curve is `sin(rise * PI)`, which
 * is symmetric and spends a long stretch at low alpha — and a light colour at low alpha over a dark
 * desktop is **grey**, because that is simply what alpha compositing does to it. So a long soft
 * tail turns every one of these into a puff of smoke on the way out, which is precisely the reading
 * the breakthrough was rebuilt to get away from.
 *
 * Better to be gone than to be grey.
 */
export function wispFade(rise: number): number {
  return Math.min(1, rise / 0.18) * Math.min(1, (1 - rise) / 0.25);
}

/**
 * Eases to 1 by overshooting it first — the classic "back out".
 *
 * `backOut(0)` is exactly 0 and `backOut(1)` is exactly 1; in between it rises past 1 by about a
 * tenth and settles. The endpoints being exact is the part worth asserting rather than eyeballing:
 * a curve that lands at 0.98 leaves whatever it scales permanently slightly wrong, which is
 * invisible in motion and obvious in a screenshot nobody takes.
 *
 * The constants are the usual ones. `c1` is the overshoot and `c3 = c1 + 1` is what forces the
 * value at 0 back down to exactly 0 — they are not independently tunable, and changing one without
 * the other is how this curve normally gets broken.
 */
const Overshoot = 1.70158;

export function backOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = t - 1;
  return 1 + u * u * ((Overshoot + 1) * u + Overshoot);
}
