/**
 * The three-card offer, drawn on the canvas.
 *
 * Same reasoning as the right-click menu: this app has no DOM to speak of and no art, so a native
 * dialog would be the one piece of the product that did not match the rest of it. Unlike the menu,
 * this one **stops the run** while it is up — see `main.ts`. That pause is not a convenience. It is
 * the thing that makes an unattended trial worth nothing, because the payout counts seconds that
 * elapsed and none elapse while three cards are waiting to be read.
 *
 * ## What a card has to say
 *
 * The decision this mode is built on is whether a school pairs with what you are already holding,
 * so the pairing is the one thing that gets its own line and its own colour. Everything else —
 * what the school does, what a level buys — is a phrase. There are no numbers on these cards, for
 * the same reason there are no numbers anywhere else in this app: §5 of the plan forbids a panel,
 * and a card that reads "+18% cadence" is a panel with a border.
 */
import { clear } from '../slime/colour.js';
import type { Card } from '../game/Arsenal.js';
import { EVOLUTIONS, SPECS, type School, comboFor } from '../game/schools.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const CardWidth = 186;
const CardHeight = 232;
const Gap = 18;
const Radius = 14;
/** How far above the middle of the screen the row sits. A little high, so the body is still visible. */
const Rise = 26;

const TitleFont = '600 27px system-ui, sans-serif';
const BodyFont = '13px system-ui, sans-serif';
const PairFont = '600 13px system-ui, sans-serif';
const HeadFont = '600 15px system-ui, sans-serif';
const StepFont = '12px system-ui, sans-serif';

/** What one card is going to say, worked out once so the draw pass is only drawing. */
interface Face {
  title: string;
  tint: string;
  /** The line under the title. */
  blurb: string;
  /** "与 雷法 合：雷符", when it pairs with something held. */
  pairing: string | null;
  /** A word for what kind of card this is, along the top. */
  kind: string;
  /** Level one to two, and so on. Empty when it does not apply. */
  step: string;
  /** The jackpot is drawn differently, and it is the only thing that is. */
  jackpot: boolean;
}

const LEVELS = ['', '一', '二', '三', '四', '五'];

/** Just enough of a holding for a card to describe itself. */
export interface Held {
  school: School;
  level: number;
}

export class Draft {
  private cards: Card[] = [];
  private faces: Face[] = [];
  private open = false;
  private hot = -1;
  private boxes: Rect[] = [];
  /** Counts up on open, so the row can arrive rather than appear. */
  private age = 0;

  get isOpen(): boolean {
    return this.open;
  }

  /**
   * What is on offer, and what the pet is already carrying.
   *
   * The holdings are only here so a card can name the pairing it would complete and print the
   * level a raise is raising from. Passed in rather than read off an `Arsenal`, so this file knows
   * nothing about the run's state — it is a renderer with an opinion about wording.
   */
  show(cards: Card[], holding: Held[]): void {
    this.cards = cards;
    this.faces = cards.map((card) => face(card, holding));
    this.open = true;
    this.hot = -1;
    this.age = 0;
    this.boxes = [];
  }

  hide(): void {
    this.open = false;
    this.cards = [];
    this.faces = [];
    this.boxes = [];
    this.hot = -1;
  }

  advance(dt: number): void {
    if (this.open) this.age = Math.min(1, this.age + dt * 5.5);
  }

  layout(width: number, height: number): Rect[] {
    if (!this.open) {
      this.boxes = [];
      return [];
    }
    const count = this.cards.length;
    const span = count * CardWidth + (count - 1) * Gap;
    const left = Math.round((width - span) / 2);
    const top = Math.round((height - CardHeight) / 2 - Rise);
    this.boxes = this.cards.map((_, i) => ({
      x: left + i * (CardWidth + Gap),
      y: top,
      width: CardWidth,
      height: CardHeight,
    }));
    return this.boxes;
  }

  /** The whole row plus a margin, for the dirty rect. */
  bounds(): Rect | null {
    if (!this.open || this.boxes.length === 0) return null;
    const first = this.boxes[0];
    const last = this.boxes[this.boxes.length - 1];
    return {
      x: first.x - 26,
      y: first.y - 52,
      width: last.x + last.width - first.x + 52,
      height: CardHeight + 96,
    };
  }

  hover(px: number, py: number): boolean {
    this.hot = -1;
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) {
        this.hot = i;
        return true;
      }
    }
    return false;
  }

  /**
   * Which card was clicked, or null.
   *
   * Null keeps the offer up. **There is no way to decline**, and that is deliberate: the run is
   * paused, so a dismissed offer would leave the fight stopped with nothing asking to be answered,
   * and the only way out would be a control that does not exist yet.
   */
  click(px: number, py: number): Card | null {
    for (let i = 0; i < this.boxes.length; i++) {
      const box = this.boxes[i];
      if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) {
        return this.cards[i];
      }
    }
    return null;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.open || this.boxes.length === 0) return;
    context.save();

    // A wash over the desktop, so the cards are readable on a wallpaper nobody described. Kept
    // light: this is a transparent overlay and the desktop underneath is the user's, not a
    // backdrop to be blacked out.
    context.fillStyle = 'rgba(10, 16, 28, 0.34)';
    context.fillRect(0, 0, width, height);

    const rise = 1 - (1 - this.age) * (1 - this.age);
    const heading = this.boxes[0].y - 30;
    context.globalAlpha = rise;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = HeadFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.86)';
    context.shadowColor = 'rgba(0, 0, 0, 0.55)';
    context.shadowBlur = 8;
    context.fillText('择一', width / 2, heading);
    context.shadowBlur = 0;

    for (let i = 0; i < this.boxes.length; i++) {
      this.drawCard(context, this.boxes[i], this.faces[i], i === this.hot, rise);
    }
    context.globalAlpha = 1;
    context.restore();
  }

  private drawCard(
    context: CanvasRenderingContext2D,
    box: Rect,
    face: Face,
    hot: boolean,
    rise: number,
  ): void {
    const lift = hot ? 6 : 0;
    const y = box.y - lift + (1 - rise) * 22;

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.42)';
    context.shadowBlur = hot ? 26 : 16;
    context.shadowOffsetY = 4;
    context.fillStyle = face.jackpot ? 'rgba(38, 30, 16, 0.96)' : 'rgba(18, 24, 36, 0.95)';
    context.beginPath();
    context.roundRect(box.x, y, box.width, box.height, Radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    // The tint is the school's own, so a card is recognisable before it is read.
    const glow = context.createLinearGradient(box.x, y, box.x, y + box.height);
    glow.addColorStop(0, face.tint);
    glow.addColorStop(0.55, clear(face.tint));
    context.globalAlpha = (hot ? 0.24 : 0.14) * rise;
    context.fillStyle = glow;
    context.beginPath();
    context.roundRect(box.x, y, box.width, box.height, Radius);
    context.fill();
    context.globalAlpha = rise;

    context.lineWidth = hot ? 2 : 1;
    context.strokeStyle = hot ? face.tint : 'rgba(255, 255, 255, 0.16)';
    context.beginPath();
    context.roundRect(box.x, y, box.width, box.height, Radius);
    context.stroke();

    const middle = box.x + box.width / 2;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    context.font = StepFont;
    context.fillStyle = face.jackpot ? '#ffd98a' : 'rgba(255, 255, 255, 0.45)';
    context.fillText(face.kind, middle, y + 26);

    context.font = TitleFont;
    context.fillStyle = face.tint;
    context.fillText(face.title, middle, y + 74);

    if (face.step) {
      context.font = StepFont;
      context.fillStyle = 'rgba(255, 255, 255, 0.55)';
      context.fillText(face.step, middle, y + 104);
    }

    context.font = BodyFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.76)';
    wrapped(context, face.blurb, middle, y + 136, box.width - 26, 19);

    if (face.pairing) {
      // The one line that gets a rule above it, because it is the decision the mode is about.
      const line = y + box.height - 54;
      context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(box.x + 18, line);
      context.lineTo(box.x + box.width - 18, line);
      context.stroke();
      context.font = PairFont;
      context.fillStyle = '#9fe8b4';
      wrapped(context, face.pairing, middle, line + 22, box.width - 22, 17);
    }
    context.restore();
  }
}

/** Fits a line into the card, breaking between characters when it has to. */
function wrapped(
  context: CanvasRenderingContext2D,
  text: string,
  middle: number,
  top: number,
  width: number,
  step: number,
): void {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    const next = line + ch;
    if (context.measureText(next).width > width && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  for (let i = 0; i < lines.length; i++) context.fillText(lines[i], middle, top + i * step);
}

/** What a card says. Pulled out of the draw pass so the wording is in one readable place. */
function face(card: Card, holding: Held[]): Face {
  if (card.kind === 'mend') {
    return {
      title: '护体',
      tint: '#ffd9a8',
      blurb: '回复三分护体',
      pairing: null,
      kind: '调息',
      step: '',
      jackpot: false,
    };
  }

  const spec = SPECS[card.school];

  if (card.kind === 'evolve') {
    const evolution = EVOLUTIONS[card.school];
    return {
      title: evolution.name,
      tint: '#ffd98a',
      blurb: evolution.effect,
      pairing: null,
      kind: '★ 进化',
      step: spec.name,
      jackpot: true,
    };
  }

  // Which held school this one pairs with, if any. The first is enough — a card naming three
  // pairings is a card nobody reads under a paused clock.
  let pairing: string | null = null;
  for (const other of holding) {
    if (other.school === card.school) continue;
    const combo = comboFor(card.school, other.school);
    if (combo) {
      pairing = `与${SPECS[other.school].name}合 · ${combo.name}`;
      break;
    }
  }

  if (card.kind === 'raise') {
    const level = holding.find((h) => h.school === card.school)?.level ?? 1;
    return {
      title: spec.name,
      tint: spec.tint,
      blurb: spec.blurb,
      pairing,
      kind: '精进',
      step: level > 0 ? `${LEVELS[level] ?? ''}重 → ${LEVELS[level + 1] ?? '五'}重` : '',
      jackpot: false,
    };
  }

  return {
    title: spec.name,
    tint: spec.tint,
    blurb: spec.blurb,
    pairing,
    kind: '新法',
    step: '',
    jackpot: false,
  };
}
