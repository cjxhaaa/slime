/**
 * 关卡 1–99 — what the door is at each level.
 *
 * This replaced the realm as the trial's difficulty input. The realm ladder had seven rows and
 * the mode needed a longer road than that: the tower is a thing you climb *in* 历练, at its own
 * pace, and a 大乘 pet who has never fought should still start at the bottom of it. 境界 keeps the
 * two jobs it is good at — lifting the grade of what is dealt (`realmLift`) and, later, the opening
 * purse — and stops deciding how hard the fight is. See TOWER.md §2 for the cost of that: it is a
 * second progression line beside the realm, on purpose.
 *
 * ## Three curves, and they are the three that were already moving inside a run
 *
 * - **Count** — how many arrive in a wave, and how quickly they come.
 * - **Strength** — how many hits each one takes, and how fast it closes.
 * - **Composition** — how soon the later breeds turn up (`haste`).
 *
 * All three are plain lines in the level. Not because a line is the right shape for the 99-level
 * balance — that is stage six's job, measured against a merging build that does not exist yet —
 * but because a line is the shape that cannot hide a dip, and "every level is harder than the one
 * before" is the only thing this file promises today.
 */

/** The last level. */
export const TopLevel = 99;

/** A level, made whole and kept on the road. */
export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(TopLevel, Math.floor(level)));
}

/** 0 at the first level, 1 at the last. Every curve below is read off this. */
function along(level: number): number {
  return (clampLevel(level) - 1) / (TopLevel - 1);
}

/** Interpolated between the bottom of the road and the top. */
function span(level: number, bottom: number, top: number): number {
  return bottom + (top - bottom) * along(level);
}

/**
 * How many ordinary 邪气 a wave sends, counting from wave 0.
 *
 * Grows across the ten waves as well as across the levels, so the shape of one level is the shape
 * the ninety-second run had — quiet, then pressing — and a later level is that shape, bigger.
 * Wave 9 is a boss's escort and is cut down in `Waves`, not here: this is what a wave *would*
 * send.
 */
export function waveSize(level: number, wave: number): number {
  const opening = span(level, 10, 40);
  const swell = 1 + 1.4 * (Math.max(0, Math.min(9, wave)) / 9);
  return Math.round(opening * swell);
}

/**
 * Arrivals a second while a wave is coming in.
 *
 * A wave is a batch rather than a span of time, but a batch that landed in one frame would be one
 * crowd materialising on the border, so it trickles — and the trickle quickens across the level the
 * way the old run's arrival rate did across ninety seconds.
 */
export function arrivalRate(level: number, wave: number): number {
  const opening = span(level, 3.4, 8);
  return opening * (1 + 0.6 * (Math.max(0, Math.min(9, wave)) / 9));
}

/** Pixels per second an ordinary 邪气 closes at. The same 52-to-106 the realm ladder ran over. */
export function menaceSpeed(level: number): number {
  return span(level, 52, 106);
}

/**
 * How many times over everything's hits are multiplied: compounding, 4.5% a level.
 *
 * About one and a half at level ten, twice at twenty, nine at fifty, seventy-five at the top. It
 * used to be a straight line from one to three, which was right while a build grew by buying —
 * and wrong the moment merging did: a grade is worth three of the one below (`gear.power`), so a
 * build grows geometrically, and a merging 大乘 build cleared level ninety-nine nine times in nine
 * against a door that had only tripled. A door that compounds is the only kind that can keep up
 * with a build that does.
 */
export const ToughnessPerLevel = 1.045;

export function toughness(level: number): number {
  return ToughnessPerLevel ** (clampLevel(level) - 1);
}

/**
 * How much punishment the body absorbs before the level is lost.
 *
 * Starts at eight rather than five. It used to rise from five, which put the thinnest body at the
 * bottom of the tower, where somebody is still learning what the bar is for — and at level one
 * half the measured fights died to the first elite. The bottom is where a mistake should be
 * survivable.
 */
export function vitality(level: number): number {
  return span(level, 8, 13);
}

/**
 * How much of an elite's and a king's full toughness (`RANKS`) they come with at this level: half
 * at the bottom, all of it from the middle of the tower up.
 *
 * An eight-hit elite at level one, recoiling off the body and walking back in to hit it again every
 * second, was what killed most first levels — against a build of four 浅绿 things nobody has had
 * the chance to merge yet.
 */
export function rankRamp(level: number): number {
  return Math.min(1, 0.5 + along(level));
}

/**
 * How much faster a level reads the breed schedule.
 *
 * At level 1 the last breed (钉煞, due at 0.65) arrives around wave seven. At the top it is there
 * by wave four. One schedule, read at different speeds — the same idea the realms used, on a
 * longer road.
 */
export function haste(level: number): number {
  return span(level, 1, 1.9);
}

/** Where a level is on the breed schedule, given how far through it is. */
export function schedule(level: number, through: number): number {
  return Math.min(1, Math.max(0, through) * haste(level));
}
