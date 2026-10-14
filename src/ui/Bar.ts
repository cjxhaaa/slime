/**
 * 装备栏 — the slots along the bottom of a level, the purse, and the one button.
 *
 * Everything you do during a level happens here, by clicking: **买** spends silver on one random
 * thing from the level's five, and clicking one item and then another of the same grade merges
 * them. No drag, no panel to open, nothing that stops the fight. A whole level can be played with
 * this and nothing else — the checks do exactly that, through `click` and nothing behind it.
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
import { GRADES, type Item, canMerge, isPrism, tintOf } from '../game/gear.js';
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

export class Bar {
  private box: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** How many slots there are, and how many are drawn — the second tweens toward the first. */
  private count = 0;
  private shown = 0;
  /** The slot picked first, waiting for the one it should merge into. */
  private picked: number | null = null;

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
    const first = this.picked !== null ? (worn[this.picked] ?? null) : null;
    const pitch = this.pitch;
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
      // things in them that fade.
      const live = first === null || i === this.picked || canMerge(first, item);
      context.globalAlpha = arriving * (live ? 1 : 0.28);

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

      if (i === this.picked) {
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
