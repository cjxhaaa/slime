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
 * Two of the **same kind at the same tier** become one of that kind, one tier up. Same kind
 * matters: if any two same-tier items merged, 刀 + 火爆 would have to produce either a random
 * thing or a prompt, and both of those take the point out of hoarding sabres — which is the
 * feeling merging exists for.
 *
 * Note what that trade actually is, because it is not a free upgrade. Two 蓝刀 equipped in two
 * slots carry more weight between them than the one 黄刀 they merge into. What the merge buys is
 * **a slot back**. That is the whole decision.
 *
 * ## Why drops climb
 *
 * Merging alone would need 32 浅绿 to reach 彩, and a ninety-second run does not deal 32 of
 * anything. So what drops gets better as the run goes on, and merging is for consolidating the
 * duplicates that arrive rather than being the only way up.
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

/** Whether these two can become one. Not against itself — an item cannot merge with itself. */
export function canMerge(a: Item, b: Item): boolean {
  return a.id !== b.id && a.tier === b.tier && a.tier < Tiers && sameSort(a, b);
}

/** The thing two of them become. Returns null rather than guessing when they cannot merge. */
export function merged(a: Item, b: Item): Item | null {
  if (!canMerge(a, b)) return null;
  return forge(a.sort, a.tier + 1);
}

/**
 * The band a drop comes from, as `through` runs 0 to 1.
 *
 * Two tiers per band from the second onward, so the same moment in a run does not always hand out
 * the same thing — a run where every drop is predictable is a run where the draft is a formality.
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
