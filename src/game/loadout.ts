/**
 * 开局选定 — the five things a level is allowed to contain.
 *
 * Before a level starts you pick **two weapons and three ways**, and from then on everything the
 * shop sells and everything a merge makes is one of those five (TOWER.md §3). A shop that sells
 * all fifteen is a gacha; a build you pick outright has no surprises in it. Drawing the circle
 * first and then rolling inside it means you set a direction for the level and gamble within it —
 * and since what you buy is not yours to choose, the merge is where the thinking happens.
 *
 * ## The merge
 *
 * Two of the same grade, always. Then:
 *
 * - **The same thing** → that thing, a grade up. Collecting a pair is worth something.
 * - **Two different things** → **one of the five at random**, a grade up. Not being able to make a
 *   pair is never a dead end; you can always trade two things you do not want for a roll.
 *
 * ## Never unarmed by a merge
 *
 * A level holds still while nothing that swings is carried (`Trial.update`). So a merge that ate
 * the last weapon and rolled a way would freeze the fight mid-wave, with 邪气 hanging in the air
 * and possibly no silver to buy a way out. When the two being merged are the only weapons
 * carried, the roll is among the weapons — the same rule the shop has for an empty hand.
 */
import { type Item, type Sort, canMerge, forge, sameSort } from './gear.js';
import { WAYS, WEAPONS, type Way, type Weapon } from './kit.js';
import type { Pack } from './Pack.js';

/** How many of each are picked. */
export const PickArms = 2;
export const PickWays = 3;

export interface Loadout {
  arms: Weapon[];
  ways: Way[];
}

/** Exactly two distinct weapons and three distinct ways, every one of them real. */
export function complete(loadout: Loadout): boolean {
  const arms = new Set(loadout.arms);
  const ways = new Set(loadout.ways);
  return (
    loadout.arms.length === PickArms &&
    arms.size === PickArms &&
    loadout.arms.every((a) => (WEAPONS as readonly string[]).includes(a)) &&
    loadout.ways.length === PickWays &&
    ways.size === PickWays &&
    loadout.ways.every((w) => (WAYS as readonly string[]).includes(w))
  );
}

/** A loadout read back from somewhere untrusted, or null if it is not a complete one. */
export function readLoadout(raw: unknown): Loadout | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { arms, ways } = raw as { arms?: unknown; ways?: unknown };
  if (!Array.isArray(arms) || !Array.isArray(ways)) return null;
  const loadout = { arms: arms as Weapon[], ways: ways as Way[] };
  return complete(loadout) ? { arms: [...loadout.arms], ways: [...loadout.ways] } : null;
}

/** The five kinds, as sorts. */
export function sortsOf(loadout: Loadout): Sort[] {
  return [
    ...loadout.arms.map((weapon): Sort => ({ sort: 'arm', weapon })),
    ...loadout.ways.map((way): Sort => ({ sort: 'way', way })),
  ];
}

/** Whether an item is one of the five. */
export function within(loadout: Loadout, item: Item): boolean {
  return item.sort.sort === 'arm'
    ? loadout.arms.includes(item.sort.weapon)
    : loadout.ways.includes(item.sort.way);
}

/** One of the five at random — or, with `armsOnly`, one of the two weapons. */
export function rollSort(loadout: Loadout, random: () => number, armsOnly = false): Sort {
  const pool = armsOnly ? sortsOf(loadout).filter((s) => s.sort === 'arm') : sortsOf(loadout);
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/**
 * What two items become. Null when they cannot merge (different grades, the top grade, or the
 * same item twice).
 *
 * `armed` is whether anything that swings would still be carried without these two — see the note
 * at the top for why that changes the roll.
 */
export function mergeOf(a: Item, b: Item, loadout: Loadout, random: () => number, armed: boolean): Item | null {
  if (!canMerge(a, b)) return null;
  if (sameSort(a, b)) return forge(a.sort, a.tier + 1);
  return forge(rollSort(loadout, random, !armed), a.tier + 1);
}

/**
 * Merges `picked` into `target` on the bar: the result lands in `target`'s slot and `picked`'s
 * comes free. Returns what it made, or null when nothing happened.
 */
export function fuseOnBar(
  pack: Pack,
  target: Item,
  picked: Item,
  loadout: Loadout,
  random: () => number,
): Item | null {
  const othersArmed = pack.worn.some(
    (slot) => slot !== null && slot.id !== target.id && slot.id !== picked.id && slot.sort.sort === 'arm',
  );
  const into = mergeOf(target, picked, loadout, random, othersArmed);
  if (!into) return null;
  return pack.fuse(target.id, picked.id, into) ? into : null;
}
