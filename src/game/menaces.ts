/**
 * 邪物 — the roster: eight kinds, three orders, three ranks each.
 *
 * | | kind | order | what it does |
 * |---|---|---|---|
 * | 哥布林 | goblin | 近战 | the baseline: walks in at a steady pace |
 * | 丧尸 | zombie | 近战 | hops — slow, in bursts, and takes three |
 * | 蜘蛛 | spider | 近战 | skitters in, quick and zig-zagging |
 * | 野猪 | boar | 近战 | trots in, then lowers its head and charges the last stretch |
 * | 小蝙蝠 | bat | 飞行 | fast and erratic; some hits pass straight through it |
 * | 小恶龙 | drake | 飞行 | swoops in, tough, and dodges some of what is thrown at it |
 * | 炮手哥布林 | gunner | 远程 | slow; once the body is in range it fires a cannonball as it walks |
 * | 法师 | mage | 远程 | slower; a longer range, and a bolt on a slower beat |
 *
 * ## Three orders
 *
 * - **近战** walk in at middling speed and do their damage by arriving.
 * - **飞行** are quick, and a share of hits **miss** them (`miss`) — they are in the air, and a
 *   talisman thrown at a bat does not always find it.
 * - **远程** are slow, but once the body is inside their `range` they fire on a beat. They **keep
 *   walking** while they do, at a creep: a ranged unit that stopped at its range would, against a
 *   build whose reach is shorter, be a unit nothing can ever reach — and a level is only cleared
 *   once everything in it is dead.
 *
 * ## Three ranks
 *
 * Each kind comes as the common one, an elite and a king (`RANKS`): 哥布林, 精英哥布林, 哥布林王.
 * The ranks are bigger and tougher, and they are drawn as themselves — armour and a fiercer look
 * on the elite, a crown and regalia on the king (`ui/creatures.ts`) — rather than as the same
 * creature scaled up.
 *
 * ## Difficulty inside a level
 *
 * What arrives drifts across the level: it opens on 哥布林 alone, and the rest join on a schedule
 * (`from`) while the goblins' share falls. A higher level reads the same schedule faster
 * (`levels.haste`), so the top of the tower has met everything by wave four.
 */

export type Kind = 'goblin' | 'zombie' | 'spider' | 'boar' | 'bat' | 'drake' | 'gunner' | 'mage';

export type Order = 'melee' | 'flying' | 'ranged';

export interface Breed {
  kind: Kind;
  order: Order;
  /** Fraction of a level before which it never appears. */
  from: number;
  /** Relative weight at the start of a level and at the end, interpolated between. */
  weight0: number;
  weight1: number;
  /** Multiplier on the level's closing speed. */
  pace: number;
  /** Drawn radius, in pixels, at common rank. */
  size: number;
  /** How many hits it takes, at common rank and level one. */
  health: number;
  /** Chance a hit passes through it without landing. Only the flying have any. */
  miss: number;
  /** How far it fires from, in pixels from the body's edge. Zero for everything that does not. */
  range: number;
  /** Seconds between shots. */
  reload: number;
}

/**
 * The eight.
 *
 * Hits above one are carried by the bigger ones — 丧尸, 野猪, 小恶龙 — and by the two that hang
 * back and shoot, which would otherwise be the easiest thing on the screen to clear. Nothing that
 * arrives in numbers takes more than one at level one.
 */
export const BREEDS: Breed[] = [
  { kind: 'goblin', order: 'melee', from: 0, weight0: 10, weight1: 3, pace: 1, size: 15, health: 1, miss: 0, range: 0, reload: 0 },
  { kind: 'bat', order: 'flying', from: 0.08, weight0: 0, weight1: 4, pace: 1.75, size: 11, health: 1, miss: 0.3, range: 0, reload: 0 },
  { kind: 'zombie', order: 'melee', from: 0.18, weight0: 0, weight1: 3.5, pace: 0.7, size: 16, health: 3, miss: 0, range: 0, reload: 0 },
  { kind: 'spider', order: 'melee', from: 0.28, weight0: 0, weight1: 4, pace: 1.3, size: 14, health: 1, miss: 0, range: 0, reload: 0 },
  { kind: 'gunner', order: 'ranged', from: 0.38, weight0: 0, weight1: 2.5, pace: 0.5, size: 15, health: 2, miss: 0, range: 300, reload: 2.6 },
  { kind: 'boar', order: 'melee', from: 0.48, weight0: 0, weight1: 3, pace: 0.85, size: 18, health: 3, miss: 0, range: 0, reload: 0 },
  { kind: 'mage', order: 'ranged', from: 0.58, weight0: 0, weight1: 2, pace: 0.45, size: 15, health: 2, miss: 0, range: 340, reload: 3 },
  { kind: 'drake', order: 'flying', from: 0.7, weight0: 0, weight1: 2, pace: 1.25, size: 17, health: 3, miss: 0.2, range: 0, reload: 0 },
];

export const BY_KIND: Record<Kind, Breed> = BREEDS.reduce(
  (all, breed) => {
    all[breed.kind] = breed;
    return all;
  },
  {} as Record<Kind, Breed>,
);

/** A breed's share at a point on the schedule. Zero before it is due. */
export function weightAt(breed: Breed, point: number): number {
  if (point < breed.from) return 0;
  return Math.max(0, breed.weight0 + (breed.weight1 - breed.weight0) * point);
}

/**
 * Which breed arrives next, at a point on the schedule (`levels.schedule`).
 *
 * Weighted rather than a fixed rotation, so the mix drifts instead of stepping — you notice that
 * there are suddenly a lot of bats about, rather than watching a switch flip.
 */
export function rollBreed(point: number, random: () => number): Breed {
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

export type Rank = 'common' | 'elite' | 'boss';

export interface Standing {
  /** Multiplier on the breed's drawn radius. */
  size: number;
  /** Multiplier on the breed's hits. */
  health: number;
  /** 银币 dropped when it dies. See `purse.ts`. */
  silver: number;
}

/**
 * 精英 and 王: bigger, tougher, worth more — and drawn as themselves.
 *
 * Size is still most of the announcement: something half again as wide as anything else walking
 * in is an elite, something two and a half times as wide is the king. No bar and no label; the
 * armour and the crown say the rest.
 */
export const RANKS: Record<Rank, Standing> = {
  common: { size: 1, health: 1, silver: 1 },
  elite: { size: 1.7, health: 8, silver: 12 },
  boss: { size: 2.6, health: 40, silver: 60 },
};

/** Every kind can come as an elite or a king. Listed in the order the kings take their turn. */
export const Champions: Kind[] = ['goblin', 'bat', 'zombie', 'spider', 'gunner', 'boar', 'mage', 'drake'];

/**
 * How much faster everything closes by the end of a level.
 *
 * A quarter, and no more. Speed is the cheapest difficulty curve there is and the least
 * interesting — it makes the same fight harder rather than making it a different fight, which is
 * what the roster is for.
 */
export function pacing(through: number): number {
  return 1 + 0.25 * Math.min(1, Math.max(0, through));
}

/**
 * Which breed an elite arrives as.
 *
 * Off the same schedule as everything else, so an elite at wave four is one of the kinds wave four
 * is sending — an enlarged spider before anybody has met a spider would be teaching two things at
 * once.
 */
export function rollChampion(point: number, random: () => number): Breed {
  return rollBreed(point, random);
}

/** 野猪: how near it gets before it lowers its head, how long it does, and the charge itself. */
export const ChargeReach = 230;
export const ChargeWindSeconds = 0.5;
export const ChargeRushSeconds = 0.75;
export const ChargeRest = 2.4;
/** How much faster than its trot it charges. */
export const ChargeBurst = 2.8;

/** 远程: how long the tell lasts before a shot, and how slow it creeps once it is in range. */
export const AimSeconds = 0.55;
export const InRangeCreep = 0.35;
/** Pixels per second a cannonball and a bolt travel at. */
export const BallSpeed = 230;
export const BoltSpeed = 290;
