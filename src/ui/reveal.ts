/**
 * How the pet comes back after 敛息 — which is **not** an entrance.
 *
 * The first version was a flourish: the body condensed out of a shower of motes and sprang to full
 * size through an overshoot. It read as an arrival, and an arrival is the wrong thing. The pet has
 * just spent an hour out of the way while somebody played a game; the moment they alt-tab out, a
 * creature announcing itself in the middle of the screen is exactly the interruption the whole
 * feature exists to avoid. It should look like something checking whether the coast is clear.
 *
 * ## It comes back from behind an edge
 *
 * The second version sank in place, which was quiet but did not say where it had *been*. This one
 * crawls in from the nearest screen edge, and the geometry makes that nearly free: the pet is a
 * side-view creature with gravity, so it is always standing on the floor, and `GROUND_MARGIN`
 * leaves its feet **12 pixels** above the bottom of the overlay. The overlay is placed over the
 * work area, so that bottom edge is the top of the taskbar — which means the natural reading is
 * already true. It climbs out from behind the taskbar, and the whole trip is about 115 px.
 *
 * A pet jammed into a left or right corner comes in sideways instead, from whichever edge is
 * actually closest. The distance is capped so that the rare case with no edge nearby — the middle
 * of the screen during a 历练 — slides a short way rather than travelling half the desktop.
 *
 * ## The four beats
 *
 * 1. **A beat of nothing.** It does not start the instant the window is back. The pause before
 *    anything moves is what makes the climb read as deliberate rather than triggered.
 * 2. **Squeezed past the edge.** Compressed along the direction it is travelling and bulging
 *    across it — the shape of a body being pushed through a gap, anchored on the edge side so it
 *    presses against the edge instead of sinking through it.
 * 3. **Out most of the way, then a hold.** The hesitation does most of the work. A creature that
 *    emerges and *stops* is looking around; one that slides smoothly all the way is just arriving.
 * 4. **A glance, then the rest.** One sweep across the direction of travel during the hold, and
 *    only then does it come the rest of the way out.
 *
 * Everything is returned in pixels, already resolved against the body and the stage, so the caller
 * only applies a transform. The endpoints being exact is the part worth asserting rather than
 * eyeballing — a posture that lands at 0.98 leaves the body permanently slightly squashed, which is
 * invisible in motion and wrong in every screenshot afterwards.
 */
import { smooth } from '../slime/ease.js';

/** Nothing happens before this. A fraction of the whole, so the timing scales with the duration. */
const Beat = 0.14;
/** When the cautious emergence finishes and the looking-around begins. */
const Peeked = 0.46;
/** When the looking-around ends and it comes the rest of the way. */
const Settled = 0.7;
/** How far out the first push goes, as a fraction of the whole distance. */
const PeekOut = 0.72;

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
/** How far the glance sweeps, in body radii. */
const GlanceRadii = 0.12;

export type Edge = 'bottom' | 'top' | 'left' | 'right';

export interface Posture {
  /** Where the body is drawn relative to where it belongs, in pixels. Both 0 once it is back. */
  dx: number;
  dy: number;
  /** Scale about `anchorX`/`anchorY`. Both exactly 1 once it is back. */
  scaleX: number;
  scaleY: number;
  /** The point the squash pivots about: the side of the body facing the edge it came from. */
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
 * pixels either side of equidistant would have its nearest edge flip mid-climb: it would be
 * halfway out of the floor on one frame and halfway out of the left wall on the next. A frame
 * strip caught exactly that — the offsets ran backwards through the animation — and it is the kind
 * of thing that happens rarely enough in use to be reported as "it glitched once" and never found.
 */
export interface Plan {
  edge: Edge;
  /** Pixels from home to fully behind that edge. */
  distance: number;
}

/** Works out where it is coming from. Call once, when the return begins. */
export function planCrawl(body: Body, stage: Stage): Plan {
  const edge = nearestEdge(body, stage);
  return { edge, distance: crawlDistance(edge, body, stage) };
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

/**
 * How far out it is, 0 to 1, with the hold in the middle.
 *
 * Deliberately **not** monotone-smooth: the flat stretch between `Peeked` and `Settled` is the
 * hesitation, and it is the single thing that makes this read as furtive rather than as an
 * animation easing in.
 */
export function emerged(t: number): number {
  if (t <= Beat) return 0;
  if (t >= 1) return 1;
  if (t < Peeked) return PeekOut * smooth((t - Beat) / (Peeked - Beat));
  if (t < Settled) return PeekOut;
  return PeekOut + (1 - PeekOut) * smooth((t - Settled) / (1 - Settled));
}

/** The sweep across the direction of travel, in body radii. Zero outside the hold. */
function glanceAt(t: number): number {
  if (t <= Peeked || t >= Settled) return 0;
  return Math.sin(((t - Peeked) / (Settled - Peeked)) * Math.PI * 2) * GlanceRadii;
}

/**
 * The whole posture at a moment of the return, in pixels.
 *
 * `plan` is fixed for the whole animation; `body` is live, so the squash keeps pivoting on the
 * right side of a pet that is still breathing.
 */
export function crawl(t: number, plan: Plan, body: Body): Posture {
  const { edge, distance } = plan;
  const settled: Posture = {
    dx: 0,
    dy: 0,
    scaleX: 1,
    scaleY: 1,
    anchorX: body.x,
    anchorY: body.y,
    edge,
  };
  if (t >= 1 || t < 0) return settled;

  const out = emerged(t);
  const behind = (1 - out) * distance;
  const glance = glanceAt(t) * body.radius;
  // Squeezed along the way it is going, bulging the other way. Roughly area-preserving, so it
  // reads as a body being pressed through a gap rather than a sprite being stretched.
  const along = 1 - 0.18 * (1 - out);
  const across = 1 + 0.16 * (1 - out);
  const vertical = edge === 'bottom' || edge === 'top';
  const outward = edge === 'bottom' || edge === 'right' ? 1 : -1;

  return {
    dx: vertical ? glance : outward * behind,
    dy: vertical ? outward * behind : glance,
    scaleX: vertical ? across : along,
    scaleY: vertical ? along : across,
    // The side facing the edge, so the squash presses the body against it rather than through it.
    anchorX: vertical ? body.x : body.x + outward * body.radius,
    anchorY: vertical ? body.y + outward * body.radius : body.y,
    edge,
  };
}
