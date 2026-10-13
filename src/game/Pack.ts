/**
 * 行囊 —— the six slots and what is spare.
 *
 * Replaces the fixed `1 兵器 + 3 五行` shape with six slots that hold any mix. Three 刀 and a 弓
 * and two 火爆 is a legal build, and so is six 五行 and nothing to swing them with — which is a
 * pet standing in a crowd doing nothing, so the interface says so rather than this refusing it.
 *
 * ## Picking something up never costs you a decision
 *
 * A new item goes to a free slot if there is one, and only falls through to the stash when all six
 * are full. This is the single most important rule in here, and it is a rule about **people**
 * rather than about items: it is what decides whether the 行囊 is an optional optimisation or a
 * compulsory chore.
 *
 * Somebody who never opens the panel has to get exactly the game they had before — draft a thing,
 * carry the thing. The panel is for the player who wants to merge two 蓝刀 into a 黄刀 and free a
 * slot. If picking something up could leave it sitting unused in a bag, every single drop would
 * become homework.
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

/** How many things can be carried at once. */
export const Slots = 6;

/**
 * How much spare room there is behind them.
 *
 * Finite, so that a long run cannot turn the panel into a list nobody will read. When it is full
 * the draft stops offering gear and offers 调息 instead, which is the same way the old full-kit
 * case was handled.
 */
export const Capacity = 12;

export class Pack {
  private slots: (Item | null)[] = [];
  private spare: Item[] = [];

  constructor() {
    this.start();
  }

  start(): void {
    this.slots = new Array(Slots).fill(null);
    this.spare = [];
  }

  /** The six, in order, with holes. The panel draws this directly. */
  get worn(): (Item | null)[] {
    return this.slots;
  }

  /** What is not being carried. */
  get stash(): Item[] {
    return this.spare;
  }

  get wornCount(): number {
    return this.slots.filter((s) => s !== null).length;
  }

  /** True when nothing more can be taken in at all — the one case the draft has to know about. */
  get full(): boolean {
    return this.wornCount >= Slots && this.spare.length >= Capacity;
  }

  /**
   * Takes an item in. Worn if there is a slot, stashed if not, and refused only when both are full.
   *
   * Returns where it went, because the draft says different things for each and "it vanished" is
   * not one of them.
   */
  accept(item: Item): 'worn' | 'stashed' | 'refused' {
    const free = this.slots.indexOf(null);
    if (free >= 0) {
      this.slots[free] = item;
      return 'worn';
    }
    if (this.spare.length < Capacity) {
      this.spare.push(item);
      return 'stashed';
    }
    return 'refused';
  }

  /** Finds one anywhere, or null. */
  find(id: number): Item | null {
    for (const slot of this.slots) if (slot && slot.id === id) return slot;
    return this.spare.find((i) => i.id === id) ?? null;
  }

  /** Which slot an item is in, or -1 when it is stashed or gone. */
  slotOf(id: number): number {
    return this.slots.findIndex((s) => s !== null && s.id === id);
  }

  /**
   * Moves one between the slots and the stash, whichever way round it currently is.
   *
   * One method rather than `equip`/`unequip`, because the panel has one gesture — click a thing —
   * and two methods would mean the panel deciding which to call from state it has to read back.
   */
  toggle(id: number): boolean {
    const at = this.slotOf(id);
    if (at >= 0) {
      const item = this.slots[at];
      if (!item) return false;
      if (this.spare.length >= Capacity) return false;
      this.slots[at] = null;
      this.spare.push(item);
      return true;
    }
    const held = this.spare.findIndex((i) => i.id === id);
    if (held < 0) return false;
    const free = this.slots.indexOf(null);
    if (free < 0) return false;
    this.slots[free] = this.spare.splice(held, 1)[0];
    return true;
  }

  /**
   * Swaps a stashed item into a slot that is already occupied, putting the old one back.
   *
   * Separate from `toggle` because with six slots full, `toggle` can only refuse — and "nothing
   * happened" is the worst thing an interface can do to a deliberate gesture.
   */
  swapInto(slot: number, id: number): boolean {
    if (slot < 0 || slot >= Slots) return false;
    const held = this.spare.findIndex((i) => i.id === id);
    if (held < 0) return false;
    const out = this.slots[slot];
    this.slots[slot] = this.spare.splice(held, 1)[0];
    if (out) this.spare.push(out);
    return true;
  }

  /**
   * Consumes two and puts the result where the first one was.
   *
   * In place on purpose. A merge that dropped its result into the stash would take a 黄刀 off the
   * body the moment you made it, which reads as the upgrade having cost you the weapon.
   */
  fuse(a: number, b: number, into: Item): boolean {
    const first = this.find(a);
    const second = this.find(b);
    if (!first || !second || first.id === second.id) return false;
    const slot = this.slotOf(a) >= 0 ? this.slotOf(a) : this.slotOf(b);
    this.remove(a);
    this.remove(b);
    if (slot >= 0 && this.slots[slot] === null) {
      this.slots[slot] = into;
      return true;
    }
    return this.accept(into) !== 'refused';
  }

  private remove(id: number): void {
    const at = this.slotOf(id);
    if (at >= 0) {
      this.slots[at] = null;
      return;
    }
    const held = this.spare.findIndex((i) => i.id === id);
    if (held >= 0) this.spare.splice(held, 1);
  }

  /** Every pair that could be merged, worn and stashed alike, each pair once. */
  pairs(): { a: Item; b: Item }[] {
    const all = [...this.slots.filter((s): s is Item => s !== null), ...this.spare];
    const out: { a: Item; b: Item }[] = [];
    const spent = new Set<number>();
    for (let i = 0; i < all.length; i++) {
      if (spent.has(all[i].id)) continue;
      for (let j = i + 1; j < all.length; j++) {
        if (spent.has(all[j].id)) continue;
        if (all[i].tier !== all[j].tier) continue;
        if (!sameSort(all[i], all[j])) continue;
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

  /** True while nothing that swings is being carried. The panel warns on this. */
  get unarmed(): boolean {
    return this.arms.length === 0;
  }
}
