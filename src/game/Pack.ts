/**
 * 装备栏 —— the slots, and nothing behind them.
 *
 * Any mix goes in any slot. Three 刀 and a 弓 and two 火爆 is a legal build, and so is six 五行 and
 * nothing to swing them with — the shop will not deal you that while you are unarmed (`purse.ts`),
 * but this does not refuse it either.
 *
 * ## No stash
 *
 * There used to be twelve spare places behind the six, and a panel to shuffle between them. The
 * tower took that away on purpose (TOWER.md §1): with a stash, a full bar is an inconvenience —
 * put something in the bag and carry on. Without one, a full bar is the moment you **have** to
 * merge, and merging is the decision this mode is built around.
 *
 * So the slot count grows instead (`grow`, driven by `purse.slotsAfter`), and a thing that does not
 * fit is never bought in the first place.
 *
 * ## What the engine is handed
 *
 * Two shapes, and they are **not** symmetric, because a weapon and a way are not the same kind of
 * thing:
 *
 * - **Weapons are counted.** Two 蓝刀 are two sabres, each swinging on its own clock. That falls
 *   out of `Attacks` holding a list, and it is why `arms` returns one entry per slot.
 * - **Ways are summed.** Two 蓝火爆 are not two explosions, they are a bigger one — a way is how
 *   strongly something happens, and the only number it has is depth. Capped at `MaxDepth`.
 *
 * Which also puts a real decision on the merge. Two 蓝火爆 sum to depth 4; merged they are one
 * 黄火爆 at depth 3 **and a slot back**. The merge is not a free upgrade, it is a trade.
 */
import { MaxDepth, type Way, type Weapon } from './kit.js';
import { type Item, sameSort } from './gear.js';

/** How many slots a level opens with. `purse.slotsAfter` says how many it grows to. */
export const Slots = 6;

export class Pack {
  private slots: (Item | null)[] = [];

  constructor() {
    this.start();
  }

  start(): void {
    this.slots = new Array(Slots).fill(null);
  }

  /** Every slot, in order, with holes. The bar draws this directly. */
  get worn(): (Item | null)[] {
    return this.slots;
  }

  /** How many slots there are, filled or not. */
  get size(): number {
    return this.slots.length;
  }

  get wornCount(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  /** Nowhere to put anything. The shop refuses rather than dropping a purchase on the floor. */
  get full(): boolean {
    return !this.slots.includes(null);
  }

  /**
   * Adds empty slots up to `count`. Never takes any away — a slot that vanished with something in
   * it would be a purchase quietly confiscated.
   */
  grow(count: number): void {
    while (this.slots.length < count) this.slots.push(null);
  }

  /** Takes an item into the first free slot. False when there is none. */
  accept(item: Item): boolean {
    const free = this.slots.indexOf(null);
    if (free < 0) return false;
    this.slots[free] = item;
    return true;
  }

  /** Finds one, or null. */
  find(id: number): Item | null {
    for (const slot of this.slots) if (slot && slot.id === id) return slot;
    return null;
  }

  /** Which slot an item is in, or -1. */
  slotOf(id: number): number {
    return this.slots.findIndex((s) => s !== null && s.id === id);
  }

  /**
   * Consumes two and puts the result where the first one was; the second one's slot comes free.
   *
   * In place on purpose: the bar merges by clicking one thing and then the thing it should become
   * part of, and the result belongs where the hand ended up — not wherever a free slot happened to
   * be.
   */
  fuse(a: number, b: number, into: Item): boolean {
    const at = this.slotOf(a);
    const other = this.slotOf(b);
    if (at < 0 || other < 0 || at === other) return false;
    this.slots[other] = null;
    this.slots[at] = into;
    return true;
  }

  /**
   * Pairs that could be merged, each item in at most one pair.
   *
   * By default only pairs of **the same thing** — the merges whose result is known. `loose` takes
   * any two of a grade, the merges that roll.
   */
  pairs(loose = false): { a: Item; b: Item }[] {
    const all = this.slots.filter((s): s is Item => s !== null);
    const out: { a: Item; b: Item }[] = [];
    const spent = new Set<number>();
    for (let i = 0; i < all.length; i++) {
      if (spent.has(all[i].id)) continue;
      for (let j = i + 1; j < all.length; j++) {
        if (spent.has(all[j].id)) continue;
        if (all[i].tier !== all[j].tier) continue;
        if (!loose && !sameSort(all[i], all[j])) continue;
        out.push({ a: all[i], b: all[j] });
        spent.add(all[i].id);
        spent.add(all[j].id);
        break;
      }
    }
    return out;
  }

  /** One entry per worn weapon. Counted, not summed — see the note at the top. */
  get arms(): { weapon: Weapon; depth: number }[] {
    const out: { weapon: Weapon; depth: number }[] = [];
    for (const slot of this.slots) {
      if (slot && slot.sort.sort === 'arm') out.push({ weapon: slot.sort.weapon, depth: slot.tier });
    }
    return out;
  }

  /** One entry per distinct worn way, tiers summed. Summed, not counted — see the note at the top. */
  get ways(): { way: Way; depth: number }[] {
    const depths = new Map<Way, number>();
    for (const slot of this.slots) {
      if (!slot || slot.sort.sort !== 'way') continue;
      const way = slot.sort.way;
      depths.set(way, Math.min(MaxDepth, (depths.get(way) ?? 0) + slot.tier));
    }
    return [...depths].map(([way, depth]) => ({ way, depth }));
  }

  /** True while nothing that swings is being carried. The level does not begin until it is false. */
  get unarmed(): boolean {
    return this.arms.length === 0;
  }
}
