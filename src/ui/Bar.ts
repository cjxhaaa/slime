/**
 * 装备栏 — the slots along the bottom of a level, the purse, and the one button.
 *
 * Everything you do during a level happens here, by clicking: **买** spends silver on one random
 * thing, and clicking one item and then another of the same kind and grade merges them. No drag,
 * no panel to open, nothing that stops the fight.
 *
 * This is the first cut, put in with the purse so that a level can be played at all. Stage five of
 * TOWER.md is the bar done properly — greying what cannot merge, the quality ring that is not a
 * frame inside a frame, the slots narrowing smoothly rather than the bar growing — and none of that
 * is attempted here.
 */
import type { Pack } from '../game/Pack.js';
import type { Purse } from '../game/purse.js';
import type { Rect } from '../game/Trial.js';
import { canMerge, tintOf } from '../game/gear.js';
import { fill, words } from '../i18n/index.js';
import { drawItemIcon } from './icons.js';

/** A slot's side, the gap between two, and the plate's padding. */
const Slot = 44;
const Gap = 6;
const Pad = 10;
/** The buy button, and the room to its left that the silver is written in. */
export const ButtonWidth = 92;
const ButtonHeight = 30;
/** How far up from the bottom edge the plate sits. Clear of a taskbar that auto-hides over it. */
const Lift = 18;
const Height = Slot + Pad * 2;

export type BarHit = { kind: 'buy' } | { kind: 'slot'; index: number } | { kind: 'plate' };

export class Bar {
  private box: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private count = 0;
  /** The slot picked first, waiting for the one it should merge into. */
  private picked: number | null = null;

  /** Places the bar for a screen this size with this many slots. Cheap; call every frame. */
  layout(width: number, height: number, slots: number): void {
    this.count = slots;
    const across = Pad + slots * (Slot + Gap) + Pad + ButtonWidth + Pad;
    this.box = { x: Math.round(width / 2 - across / 2), y: height - Lift - Height, width: across, height: Height };
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

  /** What a click at this point lands on. Null when it is not on the bar at all. */
  click(x: number, y: number): BarHit | null {
    if (!this.contains(x, y)) return null;
    const button = this.button();
    if (x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height) {
      return { kind: 'buy' };
    }
    for (let i = 0; i < this.count; i++) {
      const at = this.slotAt(i);
      if (x >= at.x && x <= at.x + Slot && y >= at.y && y <= at.y + Slot) return { kind: 'slot', index: i };
    }
    return { kind: 'plate' };
  }

  draw(context: CanvasRenderingContext2D, pack: Pack, purse: Purse, now: number): void {
    const w = words().bar;
    const b = this.box;
    const worn = pack.worn;
    const first = this.picked !== null ? worn[this.picked] : null;
    context.save();

    // The same plate the yard's readout and the wave row sit on.
    context.fillStyle = 'rgba(10, 12, 18, 0.6)';
    context.beginPath();
    context.roundRect(b.x, b.y, b.width, b.height, 14);
    context.fill();

    for (let i = 0; i < this.count; i++) {
      const at = this.slotAt(i);
      const item = worn[i] ?? null;
      context.fillStyle = 'rgba(255, 255, 255, 0.06)';
      context.beginPath();
      context.roundRect(at.x, at.y, Slot, Slot, 8);
      context.fill();
      if (item) {
        context.save();
        context.translate(at.x + Slot / 2, at.y + Slot / 2);
        drawItemIcon(context, item.sort, Slot - 4, tintOf(item.tier));
        context.restore();
      }
      // The one picked, and what it could become part of.
      const ring =
        i === this.picked ? 'rgba(255, 255, 255, 0.95)' : first && item && canMerge(first, item) ? tintOf(item.tier) : null;
      if (ring) {
        context.strokeStyle = ring;
        context.lineWidth = i === this.picked ? 3 : 2;
        context.beginPath();
        context.roundRect(at.x - 2, at.y - 2, Slot + 4, Slot + 4, 10);
        context.stroke();
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
    context.fillText(fill(w.silver, { silver: purse.silver }), button.x + button.width / 2, b.y + Pad + 6);
    context.restore();
  }

  private slotAt(index: number): { x: number; y: number } {
    return { x: this.box.x + Pad + index * (Slot + Gap), y: this.box.y + Pad };
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

/** Exported so the checks can measure the strings against the button they are drawn on. */
export const BarFont = '600 13px system-ui, sans-serif';
export const SilverFont = '500 12px system-ui, sans-serif';
