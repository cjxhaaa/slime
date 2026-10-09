/**
 * The pause panel: Esc during a 历练.
 *
 * ## Why a run needed a way out that is not the context menu
 *
 * There already was one — 结束历练 sits in the right-click menu. It is the wrong shape for the
 * moment it is needed: it does not stop the run, so the thing you are trying to get away from
 * keeps happening while you aim at a menu item, and reaching it means getting the pointer onto
 * the body, which during a chase is wherever the body has hopped to. A key that stops everything
 * and then asks is the one that works while something is going wrong.
 *
 * ## It says what leaving costs
 *
 * Walking out of a run earns nothing. That is not new and it is not a penalty — the payout counts
 * seconds survived and a run you abandoned did not finish — but it was never written down
 * anywhere, and a button that quietly throws away ninety seconds of work is a trap. So the panel
 * says it, and the leave button is the quieter of the two.
 *
 * ## The clock stops
 *
 * Same as the draft, and for the same reason: `through` only counts seconds that `Trial.update`
 * was actually given, so nothing accrues while this is up. Pausing cannot be farmed.
 */
import { words } from '../i18n/index.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Choice = 'resume' | 'leave';

const PanelWidth = 300;
const PanelHeight = 158;
const ButtonHeight = 38;
const ButtonGap = 10;
const Radius = 14;

const TitleFont = '600 22px system-ui, sans-serif';
const NoteFont = '13px system-ui, sans-serif';
const ButtonFont = '600 14px system-ui, sans-serif';

export class Pause {
  private open = false;
  private hot: Choice | null = null;
  /** Counts up on open, so the panel arrives rather than appears. */
  private age = 0;
  private panel: Rect = { x: 0, y: 0, width: PanelWidth, height: PanelHeight };
  private buttons: { choice: Choice; box: Rect }[] = [];

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.age = 0;
    // Nothing is hot until the pointer says so. Opening with the resume button already lit would
    // be a default, and a panel whose default is reached by pressing the key that opened it is a
    // panel you can dismiss without reading.
    this.hot = null;
  }

  hide(): void {
    this.open = false;
    this.hot = null;
  }

  advance(dt: number): void {
    if (this.open) this.age = Math.min(1, this.age + dt * 7);
  }

  /** Where the panel and its buttons are this frame. Recomputed because the overlay can resize. */
  layout(width: number, height: number): void {
    const x = Math.round(width / 2 - PanelWidth / 2);
    const y = Math.round(height / 2 - PanelHeight / 2);
    this.panel = { x, y, width: PanelWidth, height: PanelHeight };
    const inner = PanelWidth - 40;
    const half = (inner - ButtonGap) / 2;
    const top = y + PanelHeight - 20 - ButtonHeight;
    this.buttons = [
      { choice: 'resume', box: { x: x + 20, y: top, width: half, height: ButtonHeight } },
      {
        choice: 'leave',
        box: { x: x + 20 + half + ButtonGap, y: top, width: half, height: ButtonHeight },
      },
    ];
  }

  bounds(): Rect | null {
    return this.open ? this.panel : null;
  }

  hover(px: number, py: number): void {
    if (!this.open) return;
    this.hot = this.at(px, py);
  }

  click(px: number, py: number): Choice | null {
    if (!this.open) return null;
    return this.at(px, py);
  }

  private at(px: number, py: number): Choice | null {
    for (const { choice, box } of this.buttons) {
      if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) {
        return choice;
      }
    }
    return null;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.open) return;
    const w = words().trial;
    const rise = 1 - (1 - this.age) * (1 - this.age);

    context.save();
    // The same light wash the draft uses. This is a transparent overlay and the desktop under it
    // is the user's own, not a backdrop to be blacked out.
    context.fillStyle = 'rgba(10, 16, 28, 0.34)';
    context.fillRect(0, 0, width, height);

    const { x, y } = this.panel;
    const lift = (1 - rise) * 18;
    context.globalAlpha = rise;
    context.translate(0, lift);

    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = 24;
    context.shadowOffsetY = 6;
    context.fillStyle = 'rgba(18, 24, 36, 0.96)';
    context.beginPath();
    context.roundRect(x, y, PanelWidth, PanelHeight, Radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    context.beginPath();
    context.roundRect(x, y, PanelWidth, PanelHeight, Radius);
    context.stroke();

    const middle = x + PanelWidth / 2;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    context.font = TitleFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillText(w.pauseTitle, middle, y + 40);

    context.font = NoteFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    context.fillText(w.pauseNote, middle, y + 72);

    for (const { choice, box } of this.buttons) {
      const hot = this.hot === choice;
      // Resume is the filled one. Leaving a run throws it away, so it does not get to be the
      // button the eye lands on first.
      const leaving = choice === 'leave';
      context.fillStyle = hot
        ? leaving
          ? 'rgba(198, 86, 72, 0.22)'
          : 'rgba(51, 198, 166, 0.3)'
        : leaving
          ? 'rgba(255, 255, 255, 0.04)'
          : 'rgba(51, 198, 166, 0.18)';
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, 9);
      context.fill();
      context.lineWidth = hot ? 1.6 : 1;
      context.strokeStyle = leaving
        ? hot
          ? 'rgba(226, 122, 106, 0.75)'
          : 'rgba(255, 255, 255, 0.16)'
        : 'rgba(96, 222, 192, 0.7)';
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, 9);
      context.stroke();

      context.font = ButtonFont;
      context.fillStyle = leaving ? 'rgba(255, 210, 200, 0.82)' : '#b9f6e4';
      context.fillText(
        leaving ? w.pauseLeave : w.pauseResume,
        box.x + box.width / 2,
        box.y + box.height / 2 + 1,
      );
    }

    context.globalAlpha = 1;
    context.restore();
  }
}
