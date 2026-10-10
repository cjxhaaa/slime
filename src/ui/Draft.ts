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
 * Every card either hands you something you do not have or deepens something you do, and the card
 * says which in a phrase rather than a number. There are no numbers on these, for the same reason
 * there are none anywhere else in this app: §5 of the plan forbids a panel, and a card that reads
 * "+18% cadence" is a panel with a border.
 *
 * The one thing a card has to say that is not about itself is what a **weapon swap** costs — and
 * the answer is the reassuring half of it: the weapon goes, your three 五行 stay.
 */
import { clear } from '../slime/colour.js';
import type { Armed, Card, Walked } from '../game/Arsenal.js';
import { ARMS, PATHS } from '../game/kit.js';
import { fill, onLocaleChange, words } from '../i18n/index.js';
import { fit, wrap } from './text.js';

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

/**
 * The title's sizes, largest first.
 *
 * Four Chinese characters are 108 pixels at 27 and always were; "Ten Thousand Talismans" is 330,
 * and the card is 186 wide. So the size is not a constant any more — it is the first rung that
 * lands inside the card in at most two lines. Chinese and Korean never leave the top rung, which
 * is the point of walking down rather than picking one size that suits the worst case.
 */
const TitleSizes = [27, 24, 21, 19, 17] as const;
const TitleLines = 2;
const titleFont = (size: number): string => `600 ${size}px system-ui, sans-serif`;
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

/** Just enough of a kit for a card to describe itself against. */
export interface Kit {
  weapon: Armed | null;
  ways: Walked[];
}

export class Draft {
  private cards: Card[] = [];
  private holding: Kit = { weapon: null, ways: [] };
  private faces: Face[] = [];
  private open = false;
  private hot = -1;
  private boxes: Rect[] = [];
  /** Counts up on open, so the row can arrive rather than appear. */
  private age = 0;

  constructor() {
    // The cards are laid out once and held; a language change while they are up has to reach them.
    onLocaleChange(() => {
      if (this.open) this.relabel();
    });
  }

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
  show(cards: Card[], holding: Kit): void {
    this.cards = cards;
    this.holding = holding;
    this.faces = cards.map((card) => face(card, holding));
    this.open = true;
    this.hot = -1;
    this.age = 0;
    this.boxes = [];
  }

  /**
   * Rebuilds the wording after the language changes.
   *
   * The cards are worked out once on open and the run is **paused** while they are up — which is
   * exactly long enough for somebody to open Settings and switch language with three cards on
   * screen. Without this they would keep the old language until the next offer.
   */
  private relabel(): void {
    this.faces = this.cards.map((card) => face(card, this.holding));
  }

  hide(): void {
    this.open = false;
    this.cards = [];
    this.holding = { weapon: null, ways: [] };
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
    context.fillText(words().draft.choose, width / 2, heading);
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

    // The title is the one line with no room to wrap by default, so it is measured before it is
    // drawn rather than trusted to fit.
    const title = fit(face.title, box.width - 20, TitleSizes, TitleLines, (size, text) => {
      context.font = titleFont(size);
      return context.measureText(text).width;
    });
    context.font = titleFont(title.size);
    context.fillStyle = face.tint;
    const lead = title.size * 1.06;
    const first = y + 74 - ((title.lines.length - 1) * lead) / 2;
    title.lines.forEach((line, i) => context.fillText(line, middle, first + i * lead));

    if (face.step) {
      context.font = StepFont;
      context.fillStyle = 'rgba(255, 255, 255, 0.55)';
      context.fillText(face.step, middle, y + 104);
    }

    context.font = BodyFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.76)';
    wrapped(context, face.blurb, middle, y + 136, box.width - 26, 19, 3);

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
      wrapped(context, face.pairing, middle, line + 22, box.width - 22, 17, 2);
    }
    context.restore();
  }
}

/**
 * Lays a phrase into the card.
 *
 * `most` is a hard ceiling rather than a hint: a fourth line of blurb would be drawn straight
 * through the pairing rule underneath it, and a card that overlaps itself is worse than one that
 * says slightly less.
 */
function wrapped(
  context: CanvasRenderingContext2D,
  text: string,
  middle: number,
  top: number,
  width: number,
  step: number,
  most: number,
): void {
  const lines = wrap(text, width, (piece) => context.measureText(piece).width).slice(0, most);
  for (let i = 0; i < lines.length; i++) context.fillText(lines[i], middle, top + i * step);
}

/**
 * What a card says. Pulled out of the draw pass so the wording is in one readable place.
 *
 * Four kinds now, and every one either hands you something new or deepens something you have. The
 * old split between "take" and "raise" went with the schools: a duplicate deepens, so a card does
 * not have to say which of the two it is — it says what you would end up with.
 */
function face(card: Card, kit: { weapon: Armed | null; ways: Walked[] }): Face {
  const w = words();

  if (card.kind === 'shield') {
    return {
      title: w.draft.shieldTitle,
      // Its own colour, not a weapon's or a phase's. 金钟 is neither.
      tint: '#cfe3f2',
      blurb: w.draft.shieldBlurb,
      pairing: null,
      kind: w.draft.shield,
      step: '',
      jackpot: false,
    };
  }

  if (card.kind === 'mend') {
    return {
      title: w.draft.mendTitle,
      tint: '#ffd9a8',
      blurb: w.draft.mendBlurb,
      pairing: null,
      kind: w.draft.mend,
      step: '',
      jackpot: false,
    };
  }

  // The numerals are the realm stages' — 一二三 in Chinese and Japanese, 1 2 3 in English and
  // Korean — so a depth reads the way that language counts rather than the way the source did.
  const numeral = (n: number): string => w.stages[n - 1] ?? String(n);
  const deeper = (at: number): string =>
    at > 0 ? fill(w.draft.levelStep, { from: numeral(at), to: numeral(at + 1) }) : '';

  if (card.kind === 'arm') {
    const said = w.arms[card.weapon];
    const holding = kit.weapon;
    const same = holding?.weapon === card.weapon;
    return {
      title: said.name,
      tint: ARMS[card.weapon].tint,
      blurb: said.blurb,
      // The one thing a weapon card has to say that nothing else does: taking this puts down the
      // one in your hand — and your three ways come with you.
      pairing:
        holding && !same ? fill(w.draft.swaps, { weapon: w.arms[holding.weapon].name }) : null,
      kind: w.draft.arm,
      step: same && holding ? deeper(holding.depth) : '',
      jackpot: false,
    };
  }

  const said = w.ways[card.way];
  return {
    title: said.name,
    tint: PATHS[card.way].tint,
    blurb: said.blurb,
    pairing: null,
    kind: w.draft.way,
    step: deeper(kit.ways.find((held) => held.way === card.way)?.depth ?? 0),
    jackpot: false,
  };
}
