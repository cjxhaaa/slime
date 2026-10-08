/**
 * How the pet comes back after 敛息 — which is **not** an entrance.
 *
 * The first version of this was a flourish: the body condensed out of a shower of motes and sprang
 * to full size through an overshoot. It read as a arrival, and an arrival is the wrong thing. The
 * pet has just spent an hour out of the way while somebody played a game; the moment they alt-tab
 * out, a creature announcing itself in the middle of the screen is exactly the interruption the
 * whole feature exists to avoid. It should look like something *checking whether the coast is
 * clear*, and then settling back in as if it had never left.
 *
 * So the shape is four things, none of which is a particle:
 *
 * 1. **A beat of nothing.** It does not start the instant the window is back. The pause before
 *    anything moves is what makes the rise read as deliberate rather than triggered.
 * 2. **Sunk and squashed.** It starts pressed into the desktop — wider than it is tall — which is
 *    the posture of a thing that has been keeping its head down.
 * 3. **Up halfway, then a hold.** The hesitation is doing most of the work. A creature that rises
 *    and *stops* is looking around; one that rises smoothly all the way is just appearing.
 * 4. **A glance, then the rest.** One small lateral sweep during the hold — left, right, back to
 *    centre — and only then does it come the rest of the way up.
 *
 * Everything is returned normalised: `lift` and `glance` are fractions of the body radius for the
 * caller to scale, and the two squashes are multipliers that are exactly 1 when it is over. The
 * endpoints being exact is the part worth asserting rather than eyeballing — a curve that lands at
 * 0.98 leaves the body permanently slightly squashed, which is invisible in motion and wrong in
 * every screenshot afterwards.
 */
import { smooth } from '../slime/ease.js';

/** Nothing happens before this. A fraction of the whole, so the timing scales with the duration. */
const Beat = 0.14;
/** When the cautious first rise has finished and the looking-around begins. */
const Peeked = 0.46;
/** When the looking-around ends and it comes the rest of the way. */
const Settled = 0.70;
/** How far up the first rise goes, as a fraction of the whole distance. */
const PeekHeight = 0.72;

/** How far it sinks before rising, in body radii. */
export const SinkRadii = 0.85;
/** How far the glance sweeps, in body radii. */
export const GlanceRadii = 0.12;

export interface Creeping {
  /** How far below its resting place the body is drawn, in body radii. 0 once it is back. */
  lift: number;
  /** Lateral offset of the glance, in body radii. Signed, and 0 at both ends. */
  glance: number;
  /** Horizontal and vertical scale. Both exactly 1 once it is back. */
  squashX: number;
  squashY: number;
}

/** Nothing offset, nothing squashed — what the pet looks like when it is simply there. */
const Settled_: Creeping = { lift: 0, glance: 0, squashX: 1, squashY: 1 };

/**
 * How far back up it is, 0 to 1, with the hold in the middle.
 *
 * Deliberately **not** monotone-smooth: the flat stretch between `Peeked` and `Settled` is the
 * hesitation, and it is the single thing that makes this read as furtive rather than as an
 * animation easing in.
 */
export function risen(t: number): number {
  if (t <= Beat) return 0;
  if (t >= 1) return 1;
  if (t < Peeked) return PeekHeight * smooth((t - Beat) / (Peeked - Beat));
  if (t < Settled) return PeekHeight;
  return PeekHeight + (1 - PeekHeight) * smooth((t - Settled) / (1 - Settled));
}

/** The whole posture at a moment of the return. */
export function creep(t: number): Creeping {
  if (t >= 1 || t < 0) return Settled_;
  const up = risen(t);

  // One sweep — out one way, through centre, back — and only while it is holding still. A glance
  // during the rise would read as a stumble rather than as looking around.
  let glance = 0;
  if (t > Peeked && t < Settled) {
    const through = (t - Peeked) / (Settled - Peeked);
    glance = Math.sin(through * Math.PI * 2) * GlanceRadii;
  }

  // Pressed flat at the bottom, round by the top. Area is roughly kept, so it reads as a body
  // being squeezed rather than as a sprite being stretched.
  const flat = 1 - up;
  return {
    lift: flat * SinkRadii,
    glance,
    squashX: 1 + 0.16 * flat,
    squashY: 1 - 0.18 * flat,
  };
}
