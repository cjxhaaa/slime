/**
 * 装备 —— what a thing you are carrying actually is.
 *
 * An item is a **kind** and a **品质**, and nothing else. The kind is one of the five 兵器 or one
 * of the ten 五行 that already exist; this file adds no content at all. What it adds is that two
 * copies of the same thing are no longer the same thing: a 蓝刀 and a 黄刀 are both 刀, and the
 * difference between them is the one number every weapon and every way already reads.
 *
 * ## 品质 is 深浅 with a colour on it
 *
 * `swing`, `span` and every one of the ten take a `depth`. A tier **is** that depth. There is no
 * second set of numbers, no multiplier table, no stat block — a 黄 item is a depth-3 item, and the
 * reason it looks different is that it is drawn in a different colour.
 *
 * Writing it any other way was the obvious trap. Two systems that both mean "how strong" drift
 * apart on the first tuning pass, and the one that drifts is whichever one the player can see.
 *
 * ## Merging
 *
 * Any two **at the same tier** merge, one tier up. Two of the same kind stay that kind; two
 * different kinds become a random one of the five the level was opened with — see `loadout.ts`,
 * which is where the roll lives, because only the level knows what the five are.
 *
 * Note what that trade actually is, because it is not a free upgrade. Two 蓝刀 equipped in two
 * slots carry more weight between them than the one 黄刀 they merge into. What the merge buys is
 * **a slot back**. That is the whole decision.
 *
 * ## Why what is sold climbs
 *
 * Merging alone would need 32 浅绿 to reach 彩, and a two-minute level does not sell 32 of
 * anything. So what the shop deals gets better as the level goes on, and merging is for
 * consolidating what arrives rather than being the only way up.
 */
import { MaxDepth } from './kit.js';
import type { Way, Weapon } from './kit.js';

/** How many 品质 there are. The same number as `MaxDepth`, because they are the same number. */
export const Tiers = MaxDepth;

/**
 * The ladder, lowest first.
 *
 * `key` is what the dictionaries are keyed by; the colour words are the names, and names are
 * translated. Keying the table by '浅绿' would have put a Chinese string in the save file and in
 * every comparison, which is the kind of thing that works until somebody plays in English.
 */
export interface Grade {
  key: string;
  tint: string;
}

export const GRADES: Grade[] = [
  { key: 'plain', tint: '#9ae66a' },
  { key: 'blue', tint: '#5aa9ff' },
  { key: 'gold', tint: '#ffd24a' },
  { key: 'red', tint: '#ff5a5a' },
  { key: 'white', tint: '#f2f4f8' },
  { key: 'prism', tint: '#ff8ae0' },
];

/** The colour a tier is drawn in. Clamped, so an out-of-range tier draws rather than throwing. */
export function tintOf(tier: number): string {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, tier - 1))].tint;
}

/**
 * What one item of this grade is worth, counted in 浅绿: **it doubles with every grade.**
 *
 * This is what makes a merge worth making. Two of a grade become one of the next, so with power
 * doubling the merge keeps everything the two were worth and hands back a slot — and a weapon also
 * swings a little faster a grade up (`kit.swing`), so merging two weapons comes out ahead outright.
 * Before this a grade was one more point of depth, two 蓝刀 out-hit the 黄刀 they made, and a merge
 * was a loss you took only for the slot — measured, a build that never merged did as well as one
 * that did.
 */
export function power(tier: number): number {
  return PowerPerGrade ** (Math.max(1, Math.min(Tiers, Math.round(tier))) - 1);
}

/** How many times over each grade is worth the one below it. */
export const PowerPerGrade = 3;

/** True for the top tier, which is drawn as a sweep through the ladder rather than one colour. */
export function isPrism(tier: number): boolean {
  return tier >= Tiers;
}

/** What an item is. A weapon or a way — never both, and never neither. */
export type Sort = { sort: 'arm'; weapon: Weapon } | { sort: 'way'; way: Way };

export interface Item {
  sort: Sort;
  tier: number;
  /**
   * Distinct per item, so the interface can follow one as it moves between a slot and the stash.
   *
   * Two 蓝刀 are interchangeable to the engine and are **not** interchangeable to somebody
   * dragging one of them: without an identity the panel re-sorts under the hand and the item you
   * meant to move is no longer the one you are holding.
   */
  id: number;
}

let nextId = 1;

/** Mints one. The only way to make an item, so no two ever share an id. */
export function forge(sort: Sort, tier: number): Item {
  return { sort, tier: Math.max(1, Math.min(Tiers, Math.round(tier))), id: nextId++ };
}

/** Same thing, ignoring tier and identity. */
export function sameSort(a: Item, b: Item): boolean {
  if (a.sort.sort !== b.sort.sort) return false;
  if (a.sort.sort === 'arm' && b.sort.sort === 'arm') return a.sort.weapon === b.sort.weapon;
  if (a.sort.sort === 'way' && b.sort.sort === 'way') return a.sort.way === b.sort.way;
  return false;
}

/**
 * Whether these two can become one: the same tier, below the top, and not the same item twice.
 * What they become is `loadout.mergeOf`'s to say.
 */
export function canMerge(a: Item, b: Item): boolean {
  return a.id !== b.id && a.tier === b.tier && a.tier < Tiers;
}

/**
 * The band a drop comes from, as `through` runs 0 to 1.
 *
 * Two tiers per band from the second onward, so the same moment in a level does not always sell
 * the same thing — a shop whose every purchase is predictable is a shop with nothing to gamble on.
 */
const BANDS: { until: number; from: number; to: number }[] = [
  { until: 0.2, from: 1, to: 1 },
  { until: 0.45, from: 1, to: 2 },
  { until: 0.7, from: 2, to: 3 },
  { until: 0.9, from: 3, to: 4 },
  { until: Infinity, from: 4, to: 5 },
];

/**
 * How much the realm lifts the whole ladder.
 *
 * This is most of what a realm buys inside 历练 now. One step every three rungs rather than one
 * per rung: at one per rung 大乘 would open on 白, and an opening hand of top-tier gear is a run
 * with nothing left to find.
 */
export function realmLift(realm: number): number {
  return Math.floor(Math.max(0, realm) / 3);
}

/** What tier a drop is, at this point in this run. */
export function dropTier(through: number, realm: number, random: () => number): number {
  const band = BANDS.find((b) => through < b.until) ?? BANDS[BANDS.length - 1];
  const span = band.to - band.from;
  const rolled = band.from + Math.floor(random() * (span + 1));
  return Math.max(1, Math.min(Tiers, rolled + realmLift(realm)));
}
