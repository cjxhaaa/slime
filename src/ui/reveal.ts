/**
 * How the pet comes back after 敛息 — which is **not** an entrance.
 *
 * The first version was a flourish: the body condensed out of a shower of motes and sprang to full
 * size through an overshoot. It read as an arrival, and an arrival is the wrong thing. The pet has
 * just spent an hour out of the way while somebody played a game; the moment they alt-tab out, a
 * creature announcing itself in the middle of the screen is exactly the interruption the whole
 * feature exists to avoid.
 *
 * The second tried furtive by rising partway, stopping, and sweeping side to side to "look
 * around". The stop-and-sweep read as a **judder** rather than as caution — a lateral sine on a
 * body that is otherwise still is a shake, whatever it was meant to be.
 *
 * ## It squeezes out, like an octopus through a crack
 *
 * So the motion is not a translation with a wobble on top. It is a soft body being forced through
 * a gap, and the gap is real: the overlay's own bottom edge clips it, and the pet stands twelve
 * pixels above that edge because `GROUND_MARGIN` puts it there. The overlay covers the work area,
 * so the edge is the top of the taskbar — the pet genuinely climbs out from behind it, and the
 * whole trip is about 115 px.
 *
 * ## There is a charm, and that is the reason it comes out
 *
 * A charm is flicked out of the gap first, and once the pet is through it goes and eats it. That
 * is not decoration on top of the animation — it is the thing that makes the animation make sense.
 * Every version before it was a creature appearing *because the window came back*, which is a
 * reason the pet does not have. This one is a creature coming out **to get something**, and the
 * fetching is not even new behaviour: a landed charm is already worth an errand, so the walk and
 * the meal are the ordinary rules taking over the moment the squeeze lets go.
 *
 * ## And it does it in pushes
 *
 * A soft body does not pour through a hole at a constant rate; it works at it. It gathers —
 * bunching up behind the gap — and then extends, driving a little more of itself through. Gather,
 * push, gather, push. Peristalsis, and the reason an octopus looks like it is *trying*.
 *
 * So the order is:
 *
 * 1. **Spreads.** Pressed against the underside, flattened and wide, because the way out is not
 *    open yet and the mass has to go sideways.
 * 2. **A head gets through.** A small nub, and then it stops — that is all that is coming for now.
 * 3. **Three pushes.** Bunch, extend, gain a little. Bunch, extend, gain a little. Each one makes
 *    visible but insufficient progress, which is what reads as effort.
 * 4. **Through.** Once the widest part is past there is nothing left to resist and the rest
 *    arrives at once.
 * 5. **Settles.** One soft rebound — squat and wide for an instant — and then it is simply there.
 *
 * ## Why this pulse is not the judder that was removed
 *
 * The version before this swept the body **sideways** while it was otherwise still, and a lateral
 * sine on a motionless body is a shake however it was meant. This pulses **along the direction it
 * is travelling**, which is the axis the work is being done on, and every pulse advances it. One
 * is a tremor; the other is a muscle. The checks pin that distinction: lateral movement is
 * asserted to be exactly zero, and every extension is asserted to gain ground.
 */
import { smooth } from '../slime/ease.js';

/** How far past the edge it waits, over and above simply clearing it, in body radii. */
const ClearRadii = 0.25;
/**
 * The furthest it will travel, in body radii.
 *
 * Only reached when there is no edge nearby, which on a floor-standing pet means a 历练 — the one
 * mode that puts the body in the middle of the screen. Without the cap that case would cross half
 * the desktop in plain sight, which is the opposite of the point.
 */
const MaxOutRadii = 3.2;

export type Edge = 'bottom' | 'top' | 'left' | 'right';

/**
 * The squeeze, as keyframes.
 *
 * A table rather than a formula because the shape is the content here, and this is the form in
 * which it can be read and argued with. `out` is how far through it is; `along` and `across` are
 * the scales parallel and perpendicular to the way it is travelling.
 *
 * Read the `out` column on its own and the effort is visible: **a tenth of the way out after a
 * third of the time**, then under half by two thirds, then all of it in the last fifth. Read the
 * two scale columns and the funnel is visible: wide and flat while it is stuck, then crossing over
 * to narrow and long as it goes through, then rebounding once.
 */
interface Key {
  at: number;
  out: number;
  along: number;
  across: number;
}

const SQUEEZE: readonly Key[] = [
  // Flattened under the edge, going nowhere. The charm is in the air through all of this.
  { at: 0.0, out: 0.0, along: 0.7, across: 1.3 },
  { at: 0.14, out: 0.02, along: 0.76, across: 1.24 },
  // A head gets through — and that is all that is coming for now.
  { at: 0.26, out: 0.15, along: 1.08, across: 0.93 },
  // **The wait.** A full second of a nub sitting in the gap, deciding. The transform barely moves;
  // the body underneath is still breathing, which is what keeps a held pose from reading as a
  // frozen frame.
  { at: 0.6, out: 0.15, along: 1.05, across: 0.95 },
  // Gather, push. Twice, and neither is enough.
  { at: 0.66, out: 0.16, along: 0.88, across: 1.12 },
  { at: 0.73, out: 0.32, along: 1.22, across: 0.83 },
  { at: 0.78, out: 0.33, along: 0.9, across: 1.1 },
  { at: 0.85, out: 0.5, along: 1.26, across: 0.79 },
  // One last crouch, and then the whole thing comes out at once — past where it belongs, because
  // what gets it through is a shove rather than a slide.
  { at: 0.9, out: 0.52, along: 0.92, across: 1.08 },
  { at: 0.95, out: 1.1, along: 1.14, across: 0.9 },
  // Lands, squashes, done.
  { at: 0.98, out: 1.0, along: 0.9, across: 1.11 },
  { at: 1.0, out: 1.0, along: 1.0, across: 1.0 },
];

export interface Posture {
  /** Where the body is drawn relative to where it belongs, in pixels. Both 0 once it is back. */
  dx: number;
  dy: number;
  /** Scale about `anchorX`/`anchorY`. Both exactly 1 once it is back. */
  scaleX: number;
  scaleY: number;
  /** The point the squeeze pivots about: the side of the body facing the edge it came from. */
  anchorX: number;
  anchorY: number;
  /** Which edge it decided to come from. Returned for the sake of being able to assert it. */
  edge: Edge;
}

export interface Body {
  x: number;
  y: number;
  radius: number;
}

export interface Stage {
  width: number;
  height: number;
}

/**
 * Which edge it is coming from and how far it has to travel — **decided once, at the start**.
 *
 * Not recomputed per frame, and that is not an optimisation. The pet wanders, and a body a few
 * pixels either side of equidistant would have its nearest edge flip mid-climb: halfway out of the
 * floor on one frame and halfway out of the left wall on the next. A frame strip caught exactly
 * that — the offsets ran backwards through the animation — and it is the kind of thing that
 * happens rarely enough in use to be reported as "it glitched once" and never found.
 */
export interface Plan {
  edge: Edge;
  /** Pixels from home to fully behind that edge. */
  distance: number;
}

/** Which edge the body is closest to, measured from its surface rather than its centre. */
export function nearestEdge(body: Body, stage: Stage): Edge {
  const gaps: [Edge, number][] = [
    ['bottom', stage.height - (body.y + body.radius)],
    ['top', body.y - body.radius],
    ['left', body.x - body.radius],
    ['right', stage.width - (body.x + body.radius)],
  ];
  // Bottom first in the list and compared with `<` rather than `<=`, so a tie goes to the floor —
  // which is where a pet with gravity actually lives.
  let best = gaps[0];
  for (const gap of gaps) if (gap[1] < best[1]) best = gap;
  return best[0];
}

/** How far it has to travel to be completely behind that edge, in pixels, capped. */
export function crawlDistance(edge: Edge, body: Body, stage: Stage): number {
  const gap =
    edge === 'bottom'
      ? stage.height - (body.y + body.radius)
      : edge === 'top'
        ? body.y - body.radius
        : edge === 'left'
          ? body.x - body.radius
          : stage.width - (body.x + body.radius);
  const needed = Math.max(0, gap) + 2 * body.radius + ClearRadii * body.radius;
  return Math.min(needed, MaxOutRadii * body.radius);
}

/** Works out where it is coming from. Call once, when the return begins. */
export function planCrawl(body: Body, stage: Stage): Plan {
  const edge = nearestEdge(body, stage);
  return { edge, distance: crawlDistance(edge, body, stage) };
}

/** The keyframe table, read at a moment, eased between the rows it falls between. */
export function squeezeAt(t: number): { out: number; along: number; across: number } {
  if (t <= 0) return { out: SQUEEZE[0].out, along: SQUEEZE[0].along, across: SQUEEZE[0].across };
  const last = SQUEEZE[SQUEEZE.length - 1];
  if (t >= 1) return { out: last.out, along: last.along, across: last.across };
  for (let i = 1; i < SQUEEZE.length; i++) {
    const b = SQUEEZE[i];
    if (t > b.at) continue;
    const a = SQUEEZE[i - 1];
    const k = smooth((t - a.at) / (b.at - a.at));
    return {
      out: a.out + (b.out - a.out) * k,
      along: a.along + (b.along - a.along) * k,
      across: a.across + (b.across - a.across) * k,
    };
  }
  return { out: last.out, along: last.along, across: last.across };
}

/** How far out it is, 0 to 1. Slow while it is stuck, then all at once. */
export function emerged(t: number): number {
  return squeezeAt(t).out;
}

/**
 * The whole posture at a moment of the return, in pixels.
 *
 * `plan` is fixed for the whole animation; `body` is live, so the squeeze keeps pivoting on the
 * right side of a pet that is still breathing.
 */
export function crawl(t: number, plan: Plan, body: Body): Posture {
  const { edge, distance } = plan;
  if (t >= 1 || t < 0) {
    return { dx: 0, dy: 0, scaleX: 1, scaleY: 1, anchorX: body.x, anchorY: body.y, edge };
  }

  const { out, along, across } = squeezeAt(t);
  const behind = (1 - out) * distance;
  const vertical = edge === 'bottom' || edge === 'top';
  const outward = edge === 'bottom' || edge === 'right' ? 1 : -1;

  return {
    dx: vertical ? 0 : outward * behind,
    dy: vertical ? outward * behind : 0,
    scaleX: vertical ? across : along,
    scaleY: vertical ? along : across,
    // The side facing the edge, so the squeeze presses the body against it rather than through it,
    // and the reach happens in the direction it is actually going.
    anchorX: vertical ? body.x : body.x + outward * body.radius,
    anchorY: vertical ? body.y + outward * body.radius : body.y,
    edge,
  };
}
