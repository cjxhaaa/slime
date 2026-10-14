/**
 * 银币 — what a level pays as it goes, and what spending it costs.
 *
 * This is the draft's replacement. The draft handed you three cards whenever a kill meter filled
 * and stopped the fight until you chose; buying hands you **one random thing from the level's five
 * whenever you ask**, and the fight never stops for it. So the decisions left in the mode are which
 * five to open with and what to merge, because what you buy is not yours to pick (TOWER.md §3).
 *
 * ## Where silver comes from
 *
 * Kills. One for a common, twelve for an elite, sixty for the boss (`RANKS`), and a little to start
 * with from the realm. It does not carry from one level to the next (TOWER.md §9.3): carried, the
 * ninety-ninth level would be paid for by the first ninety-eight, and the curve in `levels.ts`
 * would be measuring hoarding rather than play.
 *
 * ## Why the price climbs
 *
 * By its own hundreds: below 100 each purchase costs 10 more than the last, from 100 to 200 it is
 * 20 more, from 200 to 300 it is 30 — and past a thousand the same rule, so 1000 to 1100 climbs by
 * 110 a time. Ten purchases bring it from 10 to 100; the next ten take it past 300.
 *
 * Steep on purpose. A flat price either starves the opening or, late in a level, buys a row of
 * everything — and a row of everything is a build with no merges left to make, which is the part
 * that is supposed to be interesting. Each new thing being harder to buy than the last is what
 * pushes a level from buying into merging.
 *
 * ## Why slots grow
 *
 * One every five purchases, to twelve. Six slots that never grew would turn the second half of a
 * level into merging and nothing else; twelve at the start would mean nothing ever had to be
 * merged. Growing with what you have bought puts the bar about one purchase ahead of you — full
 * often enough to force a merge, rarely enough that buying stays the default.
 */
import { type Item, dropTier, forge } from './gear.js';
import { type Loadout, rollSort } from './loadout.js';
import { type Pack, Slots } from './Pack.js';

/** What the first purchase of a level costs. */
export const FirstPrice = 10;

/** How much dearer the next purchase is than one costing `current`: 10 per hundred it has reached, plus 10. */
export function priceStep(current: number): number {
  return 10 * (Math.floor(Math.max(0, current) / 100) + 1);
}

/** What the purchase after `bought` of them costs. */
export function price(bought: number): number {
  let current = FirstPrice;
  for (let i = 0; i < bought; i++) current += priceStep(current);
  return current;
}

/** Silver for the purchases from the first to the `n`th, together. */
export function costOf(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += price(i);
  return sum;
}

/** Purchases per extra slot, and the most slots there can be. */
export const BuysPerSlot = 5;
export const MostSlots = 12;

/** How many slots there are after `bought` purchases. */
export function slotsAfter(bought: number): number {
  return Math.min(MostSlots, Slots + Math.floor(Math.max(0, bought) / BuysPerSlot));
}

/** How many purchases the opening purse is sized for: the four cards the draft used to deal. */
export const OpeningBuys = 4;

/**
 * What a level opens with: four purchases, and a little more for each realm.
 *
 * Four because that is what the opening draft handed over before the first 邪气, and the reason
 * has not changed — a level is two minutes, and earning a build one kill at a time would make the
 * first of them the part you sit through. Sized at one purchase it was a single random weapon
 * against the whole first wave, and a measured level-one fight died on wave two with the dice
 * deciding everything.
 *
 * The realm's share is the "a little" TOWER.md §4 asks for: the opening of a 大乘 pet is about one
 * purchase richer than a 筑基 one, not a different game.
 */
export function startingSilver(realm: number): number {
  return costOf(OpeningBuys) + 6 * Math.max(0, Math.floor(realm));
}

/**
 * What the shop hands over: one of the level's five (`loadout.ts`), at the grade this moment of
 * the level deals.
 *
 * **A weapon while you have none.** The draft had the same rule — its first card was a weapon,
 * full stop — and for the same reason: a pet carrying three 五行 and nothing to deliver them is a
 * pet standing in a crowd. Otherwise each of the five is equally likely; the shop does not lean
 * toward what your build wants, because a thumb on that scale would make merging a formality.
 */
export function stock(pack: Pack, loadout: Loadout, random: () => number, through: number, realm: number): Item {
  const tier = dropTier(through, realm, random);
  return forge(rollSort(loadout, random, pack.unarmed), tier);
}

export class Purse {
  private coins = 0;
  private buys = 0;

  start(realm: number): void {
    this.coins = startingSilver(realm);
    this.buys = 0;
  }

  get silver(): number {
    return this.coins;
  }

  /** Purchases made this level. */
  get bought(): number {
    return this.buys;
  }

  /** What the next one costs. */
  get price(): number {
    return price(this.buys);
  }

  earn(silver: number): void {
    if (silver > 0) this.coins += silver;
  }

  /**
   * Whether a purchase would go through.
   *
   * Two reasons it would not, and the bar draws them the same way — greyed — because both have the
   * same answer from the player's side: not now. A full bar is the one that matters. It is the
   * moment the mode stops being "buy" and becomes "merge", and refusing here rather than dropping
   * the purchase on the floor is what makes that a decision instead of a loss.
   */
  canBuy(pack: Pack): boolean {
    return this.coins >= this.price && !pack.full;
  }

  /** Spends, stocks and stows one. Null when it cannot — see `canBuy`. */
  buy(pack: Pack, loadout: Loadout, random: () => number, through: number, realm: number): Item | null {
    if (!this.canBuy(pack)) return null;
    const item = stock(pack, loadout, random, through, realm);
    this.coins -= this.price;
    this.buys += 1;
    pack.accept(item);
    pack.grow(slotsAfter(this.buys));
    return item;
  }
}
