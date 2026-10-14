/**
 * 装备栏 — the slots along the bottom of a level, the purse, and the one button.
 *
 * Everything you do during a level happens here: **买** spends silver on one random thing from the
 * level's five, and **dragging one item onto another of the same grade merges them**. Clicking one
 * and then the other does the same, for anyone who would rather click — the checks play whole
 * levels that way, through `click` and nothing behind it. Nothing opens a panel and nothing stops
 * the fight.
 *
 * ## Dragging, because clicking was not discoverable
 *
 * Click-then-click is a rule you have to be told. Dragging one thing onto another is the gesture
 * every merge game has taught already, and the bar answers it as it happens: the thing in hand
 * follows the pointer, everything it could merge with lights up and everything it could not steps
 * back, and over a partner a bubble shows **what the two will become** — the item one grade up when
 * they are the same thing, a question mark one grade up when they are not and the result is rolled.
 * Dropped on an empty slot or on something it cannot merge with, it moves there instead, so the
 * bar can be arranged. Dropped anywhere else it goes back.
 *
 * Even before anything is picked up, a thing with a partner on the bar breathes a little, in its
 * grade's colour: there is a merge here, and these are the two.
 *
 * ## Slots you can count, grades you can read
 *
 * Every slot is a cell sunk into the bar, empty or not, so how many there are is never a question.
 * The cell is dark and neutral on purpose: the icons bring their own plate, tinted by grade, and a
 * cell with a colour of its own would be a second plate fighting the first. The grade — **the one
 * fact that says which two can merge** — is a thick ring round the icon, inside the cell, where
 * nothing is drawn over it. 彩 is a ring that runs through the whole ladder, because it is the top
 * of all of it.
 *
 * Over the buy button, five pips: one fills with each purchase, and the fifth is a new slot. The
 * rule that slots come from buying is otherwise invisible until it happens.
 *
 * ## What can merge is seen, not tried
 *
 * Pick one and everything that cannot merge with it fades back. What is left at full strength is
 * the whole of your choice; nobody should have to click a thing to find out it was the wrong grade.
 *
 * ## Growing without moving
 *
 * Every fifth purchase adds a slot. The bar does **not** get wider: its width is fixed, the slots
 * share it, and a new slot means each of them narrows a little over a third of a second while the
 * new one fades in. Nothing on the screen moves — the buy button, the purse and the bar's edges stay
 * exactly where they were — because a panel that suddenly grows sideways mid-fight pulls the eye
 * away from the fight, which is the one thing it must not do.
 */
import type { Pack } from '../game/Pack.js';
import type { Purse } from '../game/purse.js';
import type { Rect } from '../game/Trial.js';
import { GRADES, type Item, canMerge, isPrism, sameSort, tintOf } from '../game/gear.js';
import { BuysPerSlot, MostSlots } from '../game/purse.js';
import { type Loadout, fuseOnBar } from '../game/loadout.js';
import { fill, words } from '../i18n/index.js';
import { drawItemIcon } from './icons.js';

/** The strip the slots share, whatever their number. Sized so twelve are still big enough to hit. */
export const SlotRun = MostSlots * 42;
/** The largest an icon is drawn, so six slots are not six enormous tiles. */
const MostIcon = 50;
const Pad = 10;
/** The buy button, and the room above it that the silver is written in. */
export const ButtonWidth = 92;
const ButtonHeight = 30;
/** How far up from the bottom edge the plate sits. Clear of a taskbar that auto-hides over it. */
const Lift = 18;
const Height = MostIcon + Pad * 2 + 14;
/** How long the slots take to narrow when one is added. */
export const GrowSeconds = 0.35;
/** The grade ring's width, and how far it sits outside the icon. */
const Ring = 3;
const RingGap = 3;

export type BarHit = { kind: 'buy' } | { kind: 'slot'; index: number } | { kind: 'plate' };

/** What letting go of a held item did. */
export type BarDrop =
  /** It never left its slot far enough to count as a drag: treat the gesture as a click. */
  | { kind: 'click'; index: number }
  | { kind: 'merged'; item: Item }
  | { kind: 'moved' }
  /** Let go somewhere that is not a slot; it went back. */
  | { kind: 'back' };

/** How far the pointer has to travel before a press on an item becomes a drag. */
const DragFrom = 6;
/** How far above the bar a drop still finds the slot under it — a hand lets go a little high. */
const DropSlack = 34;
/** The bubble over a merge partner that shows what the two become: its size and its lift. */
const PreviewIcon = 34;
const PreviewLift = 52;

export class Bar {
  private box: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** How many slots there are, and how many are drawn — the second tweens toward the first. */
  private count = 0;
  private shown = 0;
  /** The slot picked first, waiting for the one it should merge into. */
  private picked: number | null = null;
  /**
   * An item held by the pointer: which slot it came from, where the pointer pressed, where it is
   * now, and whether it has travelled far enough to be a drag rather than a click.
   */
  private held: { index: number; fromX: number; fromY: number; x: number; y: number; lifted: boolean } | null =
    null;

  /**
   * Places the bar for a screen this size. Cheap; call every frame.
   *
   * The first call snaps rather than tweens: a level that opens with six slots should not open
   * with six slots growing out of nothing.
   */
  layout(width: number, height: number, slots: number): void {
    if (this.shown === 0) this.shown = slots;
    this.count = slots;
    const across = Pad + SlotRun + Pad + ButtonWidth + Pad;
    this.box = { x: Math.round(width / 2 - across / 2), y: height - Lift - Height, width: across, height: Height };
  }

  /** Moves the narrowing along. Linear in time, eased in `pitch`. */
  advance(dt: number): void {
    if (this.shown < this.count) this.shown = Math.min(this.count, this.shown + dt / GrowSeconds);
    else if (this.shown > this.count) this.shown = this.count;
  }

  /** Forgets the tween, for a fresh level. */
  reset(): void {
    this.shown = 0;
    this.picked = null;
    this.held = null;
  }

  /** Something is in the pointer's hand — pressed on, whether or not it has moved yet. */
  get holding(): boolean {
    return this.held !== null;
  }

  /** Something is being dragged: pressed on and carried past `DragFrom`. */
  get dragging(): boolean {
    return this.held?.lifted ?? false;
  }

  /**
   * A press on the bar. Takes hold of the item under it, if there is one, and says whether it did.
   * Nothing moves until the pointer does — a press and release in place is still a click.
   */
  grab(x: number, y: number, pack: Pack): boolean {
    const hit = this.click(x, y);
    if (!hit || hit.kind !== 'slot' || !pack.worn[hit.index]) return false;
    this.held = { index: hit.index, fromX: x, fromY: y, x, y, lifted: false };
    return true;
  }

  /** The pointer moved while holding something. */
  drag(x: number, y: number): void {
    const held = this.held;
    if (!held) return;
    held.x = x;
    held.y = y;
    if (!held.lifted && Math.hypot(x - held.fromX, y - held.fromY) >= DragFrom) {
      held.lifted = true;
      // Picking something up by dragging puts down whatever was picked by clicking.
      this.picked = null;
    }
  }

  /**
   * Lets go. Over a partner of the same grade the two merge, and the result lands where it was
   * dropped — the same rule as clicking one and then the other. Over an empty slot or something it
   * cannot merge with, it moves there and whatever was there takes its place. Anywhere else it goes
   * back where it came from.
   */
  drop(x: number, y: number, pack: Pack, loadout: Loadout, random: () => number): BarDrop {
    const held = this.held;
    this.held = null;
    if (!held) return { kind: 'back' };
    if (!held.lifted) return { kind: 'click', index: held.index };
    const to = this.slotUnder(x, y);
    const moving = pack.worn[held.index] ?? null;
    if (to === null || to === held.index || !moving) return { kind: 'back' };
    const there = pack.worn[to] ?? null;
    if (there && canMerge(moving, there)) {
      const made = fuseOnBar(pack, there, moving, loadout, random);
      if (made) return { kind: 'merged', item: made };
    }
    return pack.move(held.index, to) ? { kind: 'moved' } : { kind: 'back' };
  }

  /** Puts down whatever is held without doing anything with it, for a gesture that was called off. */
  letGo(): void {
    this.held = null;
  }

  /** The slot a drop at this point lands on: the column under it, a little above the bar included. */
  private slotUnder(x: number, y: number): number | null {
    const b = this.box;
    if (y < b.y - DropSlack || y > b.y + b.height) return null;
    const along = x - b.x - Pad;
    if (along < 0 || along >= SlotRun) return null;
    const index = Math.floor(along / this.pitch);
    return index < this.count ? index : null;
  }

  /**
   * Everything the bar might paint this frame: the plate, the glow and the preview bubble over it,
   * and while something is being dragged, the thing in hand wherever it has been carried.
   */
  get paintBounds(): Rect {
    const b = this.box;
    let left = b.x;
    let top = b.y - PreviewLift - PreviewIcon;
    let right = b.x + b.width;
    let bottom = b.y + b.height;
    const held = this.held;
    if (held?.lifted) {
      const reach = MostIcon;
      left = Math.min(left, held.x - reach);
      top = Math.min(top, held.y - reach);
      right = Math.max(right, held.x + reach);
      bottom = Math.max(bottom, held.y + reach);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  get bounds(): Rect {
    return this.box;
  }

  get selected(): number | null {
    return this.picked;
  }

  select(index: number | null): void {
    this.picked = index;
  }

  contains(x: number, y: number): boolean {
    const b = this.box;
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }

  /**
   * The width a whole slot gets right now: the strip shared by however many are drawn.
   *
   * A slot still arriving counts as the fraction of one it has grown to, and takes that fraction of
   * a pitch — so the slots always add up to exactly the strip, and the newest never pokes out over
   * the purse while the others are making room for it.
   */
  get pitch(): number {
    return SlotRun / Math.max(1, this.shown);
  }

  /** How much of a whole slot this one is yet, 0 to 1. */
  private grown(index: number): number {
    return Math.max(0, Math.min(1, this.shown - index));
  }

  /** The middle of a slot, for anything that needs to point at one. */
  slotCentre(index: number): { x: number; y: number } {
    return {
      x: this.box.x + Pad + this.pitch * (index + this.grown(index) / 2),
      y: this.box.y + this.box.height / 2,
    };
  }

  /** The middle of the buy button. */
  buttonCentre(): { x: number; y: number } {
    const b = this.button();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** What a click at this point lands on. Null when it is not on the bar at all. */
  click(x: number, y: number): BarHit | null {
    if (!this.contains(x, y)) return null;
    const button = this.button();
    if (x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height) {
      return { kind: 'buy' };
    }
    const along = x - this.box.x - Pad;
    if (along >= 0 && along < SlotRun) {
      const index = Math.floor(along / this.pitch);
      if (index < this.count) return { kind: 'slot', index };
    }
    return { kind: 'plate' };
  }

  /**
   * A click on a slot: pick it, put it down, or merge it into the one already picked. Returns what
   * a merge made, or null when nothing was merged.
   *
   * The result lands in the slot clicked **second** — you pick a thing up and put it onto the thing
   * it should become part of, so that is where the hand ends and where the new one belongs.
   * Clicking something it cannot merge with is a change of mind, not a mistake: that becomes the
   * one picked.
   */
  press(index: number, pack: Pack, loadout: Loadout, random: () => number): Item | null {
    const item = pack.worn[index] ?? null;
    const first = this.picked !== null ? (pack.worn[this.picked] ?? null) : null;
    if (this.picked === index) {
      this.picked = null;
      return null;
    }
    if (first && item && canMerge(first, item)) {
      this.picked = null;
      return fuseOnBar(pack, item, first, loadout, random);
    }
    this.picked = item ? index : null;
    return null;
  }

  draw(context: CanvasRenderingContext2D, pack: Pack, purse: Purse, now: number): void {
    const w = words().bar;
    const b = this.box;
    const worn = pack.worn;
    const held = this.held?.lifted ? this.held : null;
    const from = held ? held.index : this.picked;
    const first = from !== null ? (worn[from] ?? null) : null;
    const over = held ? this.slotUnder(held.x, held.y) : null;
    const pitch = this.pitch;
    // Before anything is picked up: which things have a partner on the bar.
    const partnered = new Set<number>();
    if (first === null) {
      for (let i = 0; i < worn.length; i++) {
        const a = worn[i];
        if (!a) continue;
        for (let j = 0; j < worn.length; j++) {
          const other = worn[j];
          if (j !== i && other && canMerge(a, other)) {
            partnered.add(i);
            break;
          }
        }
      }
    }
    const breathe = 0.5 + 0.5 * Math.sin(now / 320);
    const cell = Math.min(MostIcon + (Ring + RingGap) * 2, pitch - 6);
    const icon = Math.min(MostIcon, cell - (Ring + RingGap) * 2 - 2);
    context.save();

    // The one plate there is: the bar's own. The overlay is transparent, and pale icons on a pale
    // wallpaper are not there.
    context.fillStyle = 'rgba(10, 12, 18, 0.6)';
    context.beginPath();
    context.roundRect(b.x, b.y, b.width, b.height, 14);
    context.fill();

    for (let i = 0; i < this.count; i++) {
      const centre = this.slotCentre(i);
      // A slot still arriving fades in as it grows.
      const arriving = this.grown(i);
      const item = worn[i] ?? null;
      const half = icon / 2;

      // The cell, always, so the slots can be counted at a glance.
      context.globalAlpha = arriving;
      context.fillStyle = 'rgba(0, 0, 0, 0.38)';
      context.beginPath();
      context.roundRect(centre.x - cell / 2, centre.y - cell / 2, cell, cell, 9);
      context.fill();
      context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      context.lineWidth = 1;
      context.stroke();
      if (!item) continue;

      // Picked: everything that could not merge with it steps back. The cells stay; it is the
      // things in them that fade. The one in hand leaves only a ghost of itself behind.
      const live = first === null || i === from || canMerge(first, item);
      const ghost = held !== null && i === held.index;
      context.globalAlpha = arriving * (ghost ? 0.22 : live ? 1 : 0.28);

      // A partner on the bar: breathing in its grade's colour before anything is picked up, and
      // lit plainly while the thing it could merge with is in hand — brighter still under it.
      const partner = (first === null && partnered.has(i)) || (first !== null && i !== from && live);
      if (partner && !ghost) {
        const under = held !== null && over === i;
        context.save();
        context.shadowColor = under ? 'rgba(255, 255, 255, 0.95)' : tintOf(item.tier);
        context.shadowBlur = under ? 18 : first === null ? 6 + 8 * breathe : 12;
        context.fillStyle = under ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.08)';
        context.beginPath();
        context.roundRect(centre.x - cell / 2 + 2, centre.y - cell / 2 + 2, cell - 4, cell - 4, 8);
        context.fill();
        context.restore();
      }

      context.save();
      context.translate(centre.x, centre.y);
      drawItemIcon(context, item.sort, icon, tintOf(item.tier));
      context.restore();

      const reach = half + RingGap + Ring / 2;
      context.lineWidth = Ring;
      context.strokeStyle = isPrism(item.tier) ? prism(context, centre.x, centre.y, reach) : tintOf(item.tier);
      context.beginPath();
      context.roundRect(centre.x - reach, centre.y - reach, reach * 2, reach * 2, 10);
      context.stroke();

      if (i === this.picked && held === null) {
        // Lifted off the bar: a white ring outside the grade, so the grade still shows.
        const lifted = reach + Ring + 1;
        context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        context.lineWidth = 2;
        context.beginPath();
        context.roundRect(centre.x - lifted, centre.y - lifted, lifted * 2, lifted * 2, 12);
        context.stroke();
      }
    }
    context.globalAlpha = 1;

    // Over a partner: what the two become, in a bubble over it. The item one grade up when they
    // are the same thing; a question mark one grade up when the result is rolled.
    if (held && over !== null && first && over !== held.index) {
      const target = worn[over] ?? null;
      if (target && canMerge(first, target)) {
        const at = this.slotCentre(over);
        const py = b.y - PreviewLift + 6;
        const tier = target.tier + 1;
        const r = PreviewIcon / 2 + 6;
        context.save();
        context.fillStyle = 'rgba(10, 12, 18, 0.78)';
        context.beginPath();
        context.roundRect(at.x - r, py - r, r * 2, r * 2, 10);
        context.moveTo(at.x - 6, py + r);
        context.lineTo(at.x, py + r + 7);
        context.lineTo(at.x + 6, py + r);
        context.fill();
        if (sameSort(first, target)) {
          context.translate(at.x, py);
          drawItemIcon(context, target.sort, PreviewIcon, tintOf(tier));
          context.translate(-at.x, -py);
        } else {
          context.fillStyle = tintOf(tier);
          context.beginPath();
          context.roundRect(at.x - PreviewIcon / 2, py - PreviewIcon / 2, PreviewIcon, PreviewIcon, 8);
          context.fill();
          context.fillStyle = '#ffffff';
          context.strokeStyle = 'rgba(0, 0, 0, 0.55)';
          context.lineWidth = 3;
          context.font = '800 22px system-ui, sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.strokeText('?', at.x, py + 1);
          context.fillText('?', at.x, py + 1);
        }
        const ring = PreviewIcon / 2 + 2;
        context.lineWidth = 2.5;
        context.strokeStyle = isPrism(tier) ? prism(context, at.x, py, ring) : tintOf(tier);
        context.beginPath();
        context.roundRect(at.x - ring, py - ring, ring * 2, ring * 2, 8);
        context.stroke();
        context.restore();
      }
    }

    const button = this.button();
    const open = purse.canBuy(pack);
    // While the level is waiting for its first weapon, the button breathes. It is the only thing on
    // the screen that can start the fight, and nothing else says so.
    const waiting = open && pack.unarmed;
    const glow = waiting ? 0.5 + 0.5 * Math.sin(now / 260) : 0;
    context.fillStyle = open ? `rgba(255, 210, 120, ${0.85 + 0.15 * glow})` : 'rgba(255, 255, 255, 0.12)';
    if (waiting) {
      context.shadowColor = 'rgba(255, 210, 120, 0.9)';
      context.shadowBlur = 8 + 10 * glow;
    }
    context.beginPath();
    context.roundRect(button.x, button.y, button.width, button.height, 9);
    context.fill();
    context.shadowBlur = 0;

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = BarFont;
    context.fillStyle = open ? '#2a1a08' : 'rgba(255, 255, 255, 0.4)';
    context.fillText(fill(w.buy, { price: purse.price }), button.x + button.width / 2, button.y + button.height / 2 + 1);

    context.font = SilverFont;
    context.fillStyle = 'rgba(255, 230, 170, 0.9)';
    context.fillText(fill(w.silver, { silver: purse.silver }), button.x + button.width / 2, b.y + Pad + 7);

    // Toward the next slot: one pip a purchase, five to a slot. Gone once there are twelve.
    if (pack.size < MostSlots) {
      const toward = purse.bought % BuysPerSlot;
      for (let i = 0; i < BuysPerSlot; i++) {
        context.fillStyle = i < toward ? 'rgba(255, 210, 120, 0.95)' : 'rgba(255, 255, 255, 0.18)';
        context.beginPath();
        context.arc(button.x + button.width / 2 + (i - (BuysPerSlot - 1) / 2) * 11, b.y + Pad + 21, 3, 0, Math.PI * 2);
        context.fill();
      }
    }

    // The one in hand, over everything, a little bigger than it sits and with a shadow under it.
    if (held && first) {
      const size = icon * 1.12;
      context.save();
      context.translate(held.x, held.y);
      context.shadowColor = 'rgba(0, 0, 0, 0.45)';
      context.shadowBlur = 10;
      context.shadowOffsetY = 5;
      drawItemIcon(context, first.sort, size, tintOf(first.tier));
      context.restore();
      const reach = size / 2 + RingGap;
      context.lineWidth = Ring;
      context.strokeStyle = isPrism(first.tier) ? prism(context, held.x, held.y, reach) : tintOf(first.tier);
      context.beginPath();
      context.roundRect(held.x - reach, held.y - reach, reach * 2, reach * 2, 10);
      context.stroke();
    }
    context.restore();
  }

  private button(): Rect {
    return {
      x: this.box.x + this.box.width - Pad - ButtonWidth,
      y: this.box.y + this.box.height - Pad - ButtonHeight,
      width: ButtonWidth,
      height: ButtonHeight,
    };
  }
}

/** 彩's ring: the whole ladder, once round. */
function prism(context: CanvasRenderingContext2D, x: number, y: number, reach: number): CanvasGradient {
  const sweep = context.createLinearGradient(x - reach, y - reach, x + reach, y + reach);
  GRADES.forEach((grade, i) => sweep.addColorStop(i / (GRADES.length - 1), grade.tint));
  return sweep;
}

/** Exported so the checks can measure the strings against the button they are drawn on. */
export const BarFont = '600 13px system-ui, sans-serif';
export const SilverFont = '500 12px system-ui, sans-serif';
