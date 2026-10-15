/**
 * The right-click menu on the pet.
 *
 * Drawn on the canvas rather than built as a native menu, for the same reason everything else here
 * is: this app has no DOM to speak of and no art, and a native popup would be the only piece of the
 * product that did not match the rest of it.
 *
 * It works because clicks are already **leased**. The overlay is click-through by default and the
 * frontend renews a lease while the pointer is near the body — so keeping the menu interactive is a
 * matter of continuing to renew while it is open, which is a caller decision and needs no change on
 * the Rust side.
 */
import { BodyFace, Sect } from './sect.js';

export interface MenuItem {
  id: string;
  label: string;
  /** Greyed out and unclickable. Shown rather than hidden when there is a reason worth reading. */
  enabled: boolean;
  /** A second line in smaller type, for saying *why* something is unavailable. */
  note?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PadX = 13;
const PadY = 9;
const RowHeight = 30;
const NoteHeight = 15;
const MinWidth = 132;
const Radius = 7;
const LabelFont = `600 13px ${BodyFace}`;
const NoteFont = `11px ${BodyFace}`;
/**
 * How far down and right of the click the menu opens.
 *
 * Because the drawn paw is **centred** on the pointer rather than having a hotspot at a tip, so it
 * covers about forty pixels in every direction. Resting on a body that is a hundred across, that
 * looks like a paw on a slime; opening a menu underneath it, it sits on the first row and hides the
 * label. Offsetting the menu is the local fix. Re-centring the paw would be the general one and
 * would change how every hover in the app feels, which is not a thing to do on the way past.
 *
 * The paw still covers whichever row it is actually over. That is what a large cursor does, and the
 * highlight is what says which row is selected.
 */
const CursorClearance = 26;

export class Menu {
  private items: MenuItem[] = [];
  private at = { x: 0, y: 0 };
  private open = false;
  /** Which row the pointer is over, or -1. */
  private hot = -1;
  private box: Rect | null = null;

  get isOpen(): boolean {
    return this.open;
  }

  show(items: MenuItem[], x: number, y: number): void {
    this.items = items;
    this.at = { x, y };
    this.open = true;
    this.hot = -1;
    this.box = null;
  }

  hide(): void {
    this.open = false;
    this.items = [];
    this.box = null;
    this.hot = -1;
  }

  /**
   * Works out where the menu sits, flipping it so it never hangs off the screen.
   *
   * Measured with the real font rather than guessed from character counts, because the labels are
   * Chinese and a per-character width estimate is wrong by a factor of two for exactly the strings
   * this menu actually contains.
   */
  layout(context: CanvasRenderingContext2D, width: number, height: number): Rect | null {
    if (!this.open) return null;
    let widest = MinWidth;
    for (const item of this.items) {
      context.font = LabelFont;
      widest = Math.max(widest, context.measureText(item.label).width + PadX * 2);
      if (item.note) {
        context.font = NoteFont;
        widest = Math.max(widest, context.measureText(item.note).width + PadX * 2);
      }
    }
    const tall =
      PadY * 2 +
      this.items.reduce((sum, item) => sum + RowHeight + (item.note ? NoteHeight : 0), 0);

    // Down and to the right of the cursor by default, flipped rather than clamped when there is no
    // room: a menu shoved back on screen sits *under* the pointer, and the first thing the hand
    // does after a right-click is move.
    const from = { x: this.at.x + CursorClearance, y: this.at.y + CursorClearance };
    const x = from.x + widest > width ? Math.max(0, this.at.x - widest - CursorClearance) : from.x;
    const y = from.y + tall > height ? Math.max(0, this.at.y - tall - CursorClearance) : from.y;
    this.box = { x, y, width: widest, height: tall };
    return this.box;
  }

  /** Row rectangles in the same order as the items, for hit-testing and drawing. */
  private rows(): Rect[] {
    if (!this.box) return [];
    const out: Rect[] = [];
    let y = this.box.y + PadY;
    for (const item of this.items) {
      const tall = RowHeight + (item.note ? NoteHeight : 0);
      out.push({ x: this.box.x + 4, y, width: this.box.width - 8, height: tall });
      y += tall;
    }
    return out;
  }

  /** Tracks the pointer. Returns true while it is anywhere over the menu. */
  hover(px: number, py: number): boolean {
    if (!this.box) return false;
    this.hot = -1;
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (px >= row.x && px <= row.x + row.width && py >= row.y && py <= row.y + row.height) {
        if (this.items[i].enabled) this.hot = i;
        return true;
      }
    }
    const inside =
      px >= this.box.x &&
      px <= this.box.x + this.box.width &&
      py >= this.box.y &&
      py <= this.box.y + this.box.height;
    return inside;
  }

  /**
   * What a click on the menu meant.
   *
   * Three outcomes rather than two, because **"clicked a disabled row" has to keep the menu open**
   * — closing it would look as though the click had worked. A named union rather than a magic
   * string: the first version returned a sentinel beginning with a NUL, which put a NUL byte in
   * the source and made `grep` treat the whole file as binary.
   */
  click(px: number, py: number): { kind: 'chose'; id: string } | { kind: 'inert' } | { kind: 'dismiss' } {
    if (!this.box) return { kind: 'dismiss' };
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (px >= row.x && px <= row.x + row.width && py >= row.y && py <= row.y + row.height) {
        return this.items[i].enabled ? { kind: 'chose', id: this.items[i].id } : { kind: 'inert' };
      }
    }
    return { kind: 'dismiss' };
  }

  /**
   * A slip of rice paper with a lacquer rim, like everything else in a level. The row under the
   * pointer is washed in jade with a cinnabar mark at its edge.
   */
  draw(context: CanvasRenderingContext2D): void {
    if (!this.box) return;
    const { x, y, width, height } = this.box;
    context.save();
    context.shadowColor = 'rgba(30, 15, 5, 0.4)';
    context.shadowBlur = 16;
    context.shadowOffsetY = 3;
    context.fillStyle = Sect.card;
    context.beginPath();
    context.roundRect(x, y, width, height, Radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.lineWidth = 1.5;
    context.strokeStyle = Sect.lacquerLight;
    context.stroke();
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(201, 162, 74, 0.6)';
    context.beginPath();
    context.roundRect(x + 3, y + 3, width - 6, height - 6, Radius - 3);
    context.stroke();

    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const item = this.items[i];
      const row = rows[i];
      if (i === this.hot) {
        context.fillStyle = 'rgba(108, 194, 166, 0.22)';
        context.beginPath();
        context.roundRect(row.x, row.y + 1, row.width, row.height - 2, 4);
        context.fill();
        context.fillStyle = Sect.cinnabar;
        context.fillRect(row.x, row.y + 6, 3, row.height - 12);
      }
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.font = LabelFont;
      context.fillStyle = item.enabled ? Sect.ink : 'rgba(42, 33, 27, 0.38)';
      context.fillText(item.label, x + PadX, row.y + RowHeight / 2);
      if (item.note) {
        context.font = NoteFont;
        context.fillStyle = Sect.muted;
        context.fillText(item.note, x + PadX, row.y + RowHeight + NoteHeight / 2 - 4);
      }
    }
    context.restore();
  }
}
