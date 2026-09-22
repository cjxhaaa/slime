/**
 * 邪气 — the roster, and how a run gets worse.
 *
 * Before this there was one of them: a blot that homed in with a little inertia. The only thing
 * that escalated over ninety seconds was how often they arrived, so the last thirty seconds were
 * the first thirty with the tap opened — more of exactly what you had already solved. A survivors
 * run is supposed to force you to keep re-solving it.
 *
 * ## Six, and every one of them a different verb
 *
 * | | breed | what it does | what it punishes |
 * |---|---|---|---|
 * | 游魂 | drift | homes in steadily, overshoots when you dodge | nothing; it is the baseline |
 * | 奔煞 | dart | waits, then rushes in a straight line | kiting in a straight line |
 * | 缠魂 | weave | circles at a distance, then cuts in | not looking at the edges |
 * | 裂魄 | split | comes apart into two darts when killed | clearing a crowd all at once |
 * | 重煞 | heavy | slow, large, takes four | pointing everything at one thing |
 * | 钉煞 | root | stops where it lands and pulses | standing still, and ignoring things |
 *
 * The roster is deliberately not a stat table with six rows of different numbers. Each one is meant
 * to break a habit: 奔煞 catches somebody who has learned to kite in a straight line, 钉煞 takes
 * away the corner you were standing in, and 裂魄 makes clearing a crowd at once the wrong move. A
 * breed you beat the same way you beat the last one is a reskin.
 *
 * ## Difficulty inside a run
 *
 * Three things move, and only one of them was here before:
 *
 * 1. **How many arrive** — already ramped, `open` to `close` in `Trial`, and it is steep.
 * 2. **What arrives** — this file. Breeds come in on a schedule, and the baseline's share falls as
 *    they do, so the *composition* at eighty seconds is not the composition at ten.
 * 3. **How fast** — a quarter faster by the end. Small on purpose; it is the composition that is
 *    meant to do the work, and speed alone is the cheapest possible difficulty curve.
 *
 * A higher realm runs the schedule faster rather than having a different one (`haste`), so 大乘
 * has met the whole roster 38% of the way in, where 筑基 is still two breeds short and does not
 * meet its last one until fifty-eight seconds. One ladder, read at different speeds.
 */

export type Kind = 'drift' | 'dart' | 'weave' | 'split' | 'heavy' | 'root';

export interface Breed {
  kind: Kind;
  /** The two-character name. Used in the docs and nowhere on screen — §5 forbids the panel. */
  name: string;
  /** Fraction of a run before which it never appears. */
  from: number;
  /** Relative weight at the start of a run and at the end, interpolated between. */
  weight0: number;
  weight1: number;
  /** Multiplier on the realm's closing speed. */
  pace: number;
  /** Drawn radius, in pixels. */
  size: number;
  /** How many hits it takes. */
  health: number;
}

/**
 * The six.
 *
 * `health` above one is a reversal, and worth saying so plainly: the one-hit rule was written down
 * with reasons. Those reasons were that a crowd where *everything* has two hit points just has a
 * longer time-to-kill — in a press, something is always already wounded, so every shot kills anyway
 * and the second point is invisible — and that a bar over a thirteen-pixel blot is a number on the
 * screen. Neither applies to one rare breed that is drawn **twice the size of anything else**. You
 * can see that it is big. That is the bar.
 */
export const BREEDS: Breed[] = [
  { kind: 'drift', name: '游魂', from: 0, weight0: 10, weight1: 3, pace: 1, size: 13, health: 1 },
  { kind: 'dart', name: '奔煞', from: 0.12, weight0: 0, weight1: 5, pace: 1.9, size: 10, health: 1 },
  { kind: 'weave', name: '缠魂', from: 0.25, weight0: 0, weight1: 4, pace: 1.15, size: 12, health: 1 },
  { kind: 'split', name: '裂魄', from: 0.4, weight0: 0, weight1: 3, pace: 0.9, size: 15, health: 1 },
  { kind: 'heavy', name: '重煞', from: 0.5, weight0: 0, weight1: 2.5, pace: 0.55, size: 24, health: 4 },
  { kind: 'root', name: '钉煞', from: 0.65, weight0: 0, weight1: 2, pace: 0.8, size: 16, health: 2 },
];

export const BY_KIND: Record<Kind, Breed> = BREEDS.reduce(
  (all, breed) => {
    all[breed.kind] = breed;
    return all;
  },
  {} as Record<Kind, Breed>,
);

/** How much faster a realm reads the schedule. 大乘 has met the whole roster 38% of the way in. */
export function haste(rung: number): number {
  return 1 + rung * 0.12;
}

/** Where a realm is on the schedule, given how far through the run it is. */
export function schedule(rung: number, through: number): number {
  return Math.min(1, Math.max(0, through) * haste(rung));
}

/** A breed's share at a point on the schedule. Zero before it is due. */
export function weightAt(breed: Breed, point: number): number {
  if (point < breed.from) return 0;
  return Math.max(0, breed.weight0 + (breed.weight1 - breed.weight0) * point);
}

/**
 * Which breed arrives next.
 *
 * Weighted rather than a fixed rotation, so the mix drifts instead of stepping — you notice that
 * there are suddenly a lot of 奔煞 about, rather than watching a switch flip.
 */
export function rollBreed(rung: number, through: number, random: () => number): Breed {
  const point = schedule(rung, through);
  let total = 0;
  for (const breed of BREEDS) total += weightAt(breed, point);
  if (total <= 0) return BREEDS[0];
  let roll = random() * total;
  for (const breed of BREEDS) {
    roll -= weightAt(breed, point);
    if (roll <= 0) return breed;
  }
  return BREEDS[0];
}

/**
 * How much faster everything closes by the end of a run.
 *
 * A quarter, and no more. Speed is the cheapest difficulty curve there is and the least
 * interesting — it makes the same fight harder rather than making it a different fight, which is
 * what the roster is for.
 */
export function pacing(through: number): number {
  return 1 + 0.25 * Math.min(1, Math.max(0, through));
}

/** What 钉煞 does once it has planted itself. */
export const RootTravelSeconds = 1.4;
export const RootPulseSeconds = 2.2;
export const RootPulseReach = 96;
/** How long the ring shows before the pulse lands, so it can be walked out of. */
export const RootTellSeconds = 0.55;

/** 奔煞: how long it gathers, and how long the rush lasts. */
export const DartWindSeconds = 0.9;
export const DartRushSeconds = 0.75;

/** 缠魂: how far out it circles before it commits, and how long it circles for. */
export const WeaveRadius = 210;
export const WeaveSeconds = 3.4;

/** 裂魄: what it leaves behind. */
export const SplitInto = 2;
