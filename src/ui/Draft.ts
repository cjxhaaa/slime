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
import { ARMS, MaxDepth, PATHS, type Way, type Weapon } from '../game/kit.js';
import { tintOf } from '../game/gear.js';
import { drawItemIcon } from './icons.js';
import { fill, onLocaleChange, words } from '../i18n/index.js';
import { fit, wrap } from './text.js';

const clamp = (v: number): number => Math.max(0, Math.min(1, v));

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
 * 开箱 — the chest, in seconds.
 *
 * An offer used to appear. Three cards simply were there, on the frame the meter filled, and the
 * one genuinely good moment this mode has — **you earned a pick** — went by without anything
 * happening. So it is opened now: the chest lands, the lid goes, and the cards come out of it.
 *
 * The whole thing is under a second because it is in the way. A run is ninety seconds and the
 * clock is stopped while this is up; a celebration you have to sit through twice a minute stops
 * being a celebration on about the third one.
 */
const Landing = 0.16;
const LidOpen = 0.3;
const FlyAt = 0.28;
const FlyFor = 0.42;
/** Clicks are ignored until the cards have arrived. Mis-clicking a card in flight is not a choice. */
const Settled = FlyAt + FlyFor + 0.06;

const ChestWidth = 148;
const ChestHeight = 92;

/** A coin or a scrap of confetti, thrown out of the chest and falling back. */
interface Fleck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  life: number;
  born: number;
  /** A coin flips edge-on and a scrap tumbles; which one decides how it is drawn. */
  coin: boolean;
  tint: string;
}

const ConfettiTints = ['#ff7a6b', '#ffd24a', '#8ceaff', '#9ae66a', '#d489ff'];
/**
 * Pixels a second squared, against a launch of 700 to 900.
 *
 * That pairing puts the apex about 180 pixels over the lid — up past the cards rather than a
 * shrug at the rim, which is what 1500 against 400 came to. Steeper than real gravity on purpose:
 * a slow arc reads as floating, and these are supposed to have been *thrown* out.
 */
const FleckFall = 1900;

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
  /** 品质 — its name and its colour. Null for 金钟 and 调息, which have no grade. */
  grade: { name: string; tint: string } | null;
  /** The item's own mark, or null for the two cards that are not items. */
  icon: { sort: 'arm'; weapon: Weapon } | { sort: 'way'; way: Way } | null;
  /** The jackpot is drawn differently, and it is the only thing that is. */
  jackpot: boolean;
}

/** Just enough of a kit for a card to describe itself against. */
export interface Kit {
  /** Every weapon being carried, not one — the six slots hold any mix. */
  arms: Armed[];
  ways: Walked[];
}

export class Draft {
  private cards: Card[] = [];
  private holding: Kit = { arms: [], ways: [] };
  private faces: Face[] = [];
  private open = false;
  private hot = -1;
  private boxes: Rect[] = [];
  /** Seconds since the chest landed. The whole opening is driven off this. */
  private clock = 0;
  private flecks: Fleck[] = [];
  /** Where the chest sits. Worked out in `layout`, because the cards fly *from* it. */
  private chest = { x: 0, y: 0 };

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
  /** True once the cards have landed and a click means what it looks like it means. */
  get ready(): boolean {
    return this.clock >= Settled;
  }

  show(cards: Card[], holding: Kit): void {
    this.cards = cards;
    this.holding = holding;
    this.faces = cards.map((card) => face(card, holding));
    this.open = true;
    this.hot = -1;
    this.clock = 0;
    this.boxes = [];
    this.flecks = [];
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
    this.flecks = [];
    this.cards = [];
    this.holding = { arms: [], ways: [] };
    this.faces = [];
    this.boxes = [];
    this.hot = -1;
  }

  advance(dt: number): void {
    if (!this.open) return;
    const was = this.clock;
    this.clock += dt;
    // The spray is seeded the moment the lid goes, not on `show` — seeded earlier it would be
    // mid-flight before anything had opened.
    if (was < Landing && this.clock >= Landing) this.spray();

    const falling: Fleck[] = [];
    for (const fleck of this.flecks) {
      fleck.life -= dt;
      if (fleck.life <= 0) continue;
      fleck.vy += FleckFall * dt;
      fleck.x += fleck.vx * dt;
      fleck.y += fleck.vy * dt;
      fleck.spin += fleck.turn * dt;
      falling.push(fleck);
    }
    this.flecks = falling;
  }

  /**
   * What comes out with the cards.
   *
   * Thrown up and outward from the chest's mouth, and the coins are thrown harder than the
   * confetti — a coin is heavy and a scrap of paper is not, and the two arcs separating is most
   * of what makes this read as a spray rather than as one puff of particles.
   */
  private spray(): void {
    const count = 54;
    for (let i = 0; i < count; i++) {
      const coin = i % 3 === 0;
      // Up and out, never down: it is coming out of a box, so nothing starts by going into it.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const rush = (coin ? 900 : 700) * (0.55 + Math.random() * 0.6);
      const life = (coin ? 1.5 : 1.2) * (0.7 + Math.random() * 0.6);
      this.flecks.push({
        x: this.chest.x + (Math.random() - 0.5) * ChestWidth * 0.7,
        y: this.chest.y - ChestHeight * 0.35,
        vx: Math.cos(angle) * rush,
        vy: Math.sin(angle) * rush,
        spin: Math.random() * Math.PI * 2,
        turn: (Math.random() - 0.5) * 16,
        life,
        born: life,
        coin,
        tint: coin ? '#ffd24a' : ConfettiTints[i % ConfettiTints.length],
      });
    }
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
    // Under the row rather than behind it: the cards have to be seen coming *out*, and a chest
    // behind them is a chest they are standing in front of.
    this.chest = { x: Math.round(width / 2), y: top + CardHeight + 54 };
    return this.boxes;
  }

  /** The whole row plus a margin, for the dirty rect. */
  bounds(): Rect | null {
    if (!this.open || this.boxes.length === 0) return null;
    const first = this.boxes[0];
    const last = this.boxes[this.boxes.length - 1];
    // The row, plus the chest under it and whatever is still in the air over it. The draft forces
    // a full repaint while it is up, so this is only ever a floor — but a wrong floor here is a
    // smear of coins left on the desktop the frame the panel closes.
    const top = first.y - 160;
    const bottom = this.chest.y + 60;
    return {
      x: first.x - 220,
      y: top,
      width: last.x + last.width - first.x + 440,
      height: bottom - top,
    };
  }

  hover(px: number, py: number): boolean {
    this.hot = -1;
    // Nothing is hot until the cards have arrived — a card lighting up while it is still in
    // flight invites the click that `click` is about to refuse.
    if (!this.ready) return false;
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
    // Not until they have landed. The boxes hold the *final* positions from the moment the panel
    // opens, so without this a click where a card is about to be would take it before it arrived
    // — and the pick would be one the player never saw.
    if (!this.ready) return null;
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

    const t = this.clock;
    // The heading waits for the cards. Asking somebody to choose before there is anything to
    // choose between is what makes a celebration feel like a loading screen.
    const asked = clamp((t - (FlyAt + FlyFor * 0.6)) / 0.22);
    const heading = this.boxes[0].y - 30;

    this.drawChest(context, t);
    for (const fleck of this.flecks) this.drawFleck(context, fleck);

    for (let i = 0; i < this.boxes.length; i++) {
      // Each leaves a beat after the one before, so three come out of the box in a run rather
      // than as one object that happens to be three cards wide.
      const flown = clamp((t - (FlyAt + i * 0.07)) / FlyFor);
      if (flown <= 0) continue;
      this.drawFlying(context, this.boxes[i], this.faces[i], i === this.hot, flown);
    }

    context.globalAlpha = asked;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = HeadFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.86)';
    context.shadowColor = 'rgba(0, 0, 0, 0.55)';
    context.shadowBlur = 8;
    context.fillText(words().draft.choose, width / 2, heading);
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.restore();
  }

  /**
   * A card on its way out of the chest.
   *
   * It leaves small and spinning from the chest's mouth and arrives full size and square. The arc
   * is the part that sells it: a card travelling in a straight line reads as a card *sliding*, and
   * a thrown thing goes up before it comes down into place.
   */
  private drawFlying(
    context: CanvasRenderingContext2D,
    box: Rect,
    face: Face,
    hot: boolean,
    flown: number,
  ): void {
    if (flown >= 1) {
      this.drawCard(context, box, face, hot, 1);
      return;
    }
    // Fast out of the box and easing into place, which is how a thrown thing arrives.
    const ease = 1 - (1 - flown) * (1 - flown) * (1 - flown);
    const fromY = this.chest.y - ChestHeight * 0.4;
    const home = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const x = this.chest.x + (home.x - this.chest.x) * ease;
    // The hop over the straight line, zero at both ends so it starts and lands where it should.
    const y = fromY + (home.y - fromY) * ease - Math.sin(ease * Math.PI) * 90;
    const scale = 0.16 + 0.84 * ease;

    context.save();
    context.translate(x, y);
    context.rotate((1 - ease) * (1 - ease) * 1.3);
    context.scale(scale, scale);
    context.translate(-box.width / 2, -box.height / 2);
    this.drawCard(context, { x: 0, y: 0, width: box.width, height: box.height }, face, false, 1);
    context.restore();
  }

  /**
   * The chest: it lands, the lid goes over, and light comes out of it.
   *
   * It fades once the cards are out. It has done its job by then and the thing being chosen is
   * above it — a chest that stayed would be a second thing on screen competing for the look.
   */
  private drawChest(context: CanvasRenderingContext2D, t: number): void {
    const fade = 1 - clamp((t - (FlyAt + FlyFor * 0.5)) / 0.5);
    if (fade <= 0) return;
    // Overshoots and settles: it is dropped, not placed.
    const land = 1 - (1 - clamp(t / Landing)) * (1 - clamp(t / Landing));
    const lid = clamp((t - Landing) / LidOpen);
    const w = ChestWidth / 2;
    const h = ChestHeight;
    const y = this.chest.y - (1 - land) * 150;

    context.save();
    context.globalAlpha = fade;
    context.translate(this.chest.x, y);

    // The light out of the open box, brightest just as it goes.
    if (lid > 0) {
      const spill = lid * (1 - clamp((t - Landing - LidOpen) / 0.6));
      const glow = context.createRadialGradient(0, -h * 0.4, 0, 0, -h * 0.4, 160);
      glow.addColorStop(0, 'rgba(255, 238, 180, ' + (0.8 * spill).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255, 238, 180, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, -h * 0.4, 160, 0, Math.PI * 2);
      context.fill();
    }

    // The lid, hinged at the back edge and thrown over.
    context.save();
    context.translate(0, -h * 0.42);
    context.rotate((-Math.PI / 1.5) * (1 - (1 - lid) * (1 - lid)));
    context.fillStyle = '#6b4a22';
    context.beginPath();
    context.roundRect(-w, -17, w * 2, 19, 6);
    context.fill();
    context.fillStyle = '#c99a52';
    context.fillRect(-w * 0.18, -17, w * 0.36, 19);
    context.restore();

    // The dark of the inside over the lip, then the box.
    context.fillStyle = '#17110a';
    context.beginPath();
    context.ellipse(0, -h * 0.42, w * 0.92, 10, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#7a5528';
    context.beginPath();
    context.roundRect(-w, -h * 0.42, w * 2, h * 0.9, 7);
    context.fill();
    context.fillStyle = '#c99a52';
    context.fillRect(-w * 0.18, -h * 0.42, w * 0.36, h * 0.9);
    context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(-w, -h * 0.42, w * 2, h * 0.9, 7);
    context.stroke();

    context.restore();
  }

  private drawFleck(context: CanvasRenderingContext2D, fleck: Fleck): void {
    context.save();
    context.globalAlpha = Math.min(1, fleck.life / Math.max(0.001, fleck.born * 0.4));
    context.translate(fleck.x, fleck.y);
    context.fillStyle = fleck.tint;
    if (fleck.coin) {
      // Edge-on and back: a spinning coin is a circle whose width goes to nothing and returns,
      // which costs one cosine and reads better than any number of drawn faces.
      context.beginPath();
      context.ellipse(0, 0, 5 * Math.abs(Math.cos(fleck.spin)) + 0.6, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(140, 92, 20, 0.7)';
      context.lineWidth = 1;
      context.stroke();
    } else {
      context.rotate(fleck.spin);
      context.fillRect(-3.5, -2, 7, 4);
    }
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
    // The mark, above the name. It is what you will be reading off the 装备栏 in a moment, so the
    // card is where you learn it — a slot you have never seen the card for is a slot you have to
    // guess at.
    if (face.icon) {
      context.save();
      context.translate(middle, y + 46);
      drawItemIcon(context, face.icon, 30, face.tint);
      context.restore();
    }

    const title = fit(face.title, box.width - 20, TitleSizes, TitleLines, (size, text) => {
      context.font = titleFont(size);
      return context.measureText(text).width;
    });
    context.font = titleFont(title.size);
    context.fillStyle = face.tint;
    const lead = title.size * 1.06;
    const first = y + 74 - ((title.lines.length - 1) * lead) / 2;
    title.lines.forEach((line, i) => context.fillText(line, middle, first + i * lead));

    if (face.grade) {
      // In its own colour, not in grey. The grade is the thing you are choosing between when two
      // cards are the same weapon, and a 黄 that looks like a 浅绿 makes that choice invisible.
      context.font = StepFont;
      context.fillStyle = face.grade.tint;
      context.fillText(face.grade.name, middle, y + 104);
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
function face(card: Card, kit: Kit): Face {
  const w = words();

  if (card.kind === 'shield') {
    return {
      title: w.draft.shieldTitle,
      // Its own colour, not a weapon's or a phase's. 金钟 is neither.
      tint: '#cfe3f2',
      blurb: w.draft.shieldBlurb,
      pairing: null,
      kind: w.draft.shield,
      grade: null,
      icon: null,
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
      grade: null,
      icon: null,
      jackpot: false,
    };
  }

  // The numerals are the realm stages' — 一二三 in Chinese and Japanese, 1 2 3 in English and
  // Korean — so a depth reads the way that language counts rather than the way the source did.
  const numeral = (n: number): string => w.stages[n - 1] ?? String(n);

  // 品质 is the line under the title now. It used to say "二重 → 三重", which was the answer to a
  // question the draft no longer asks: a card does not deepen anything any more, it **is** a
  // thing, at a grade, and the grade is the single most important fact on the face.
  const grade = (tier: number): { name: string; tint: string } => ({
    name: w.draft.grades[tier - 1] ?? String(tier),
    tint: tintOf(tier),
  });

  if (card.kind === 'arm') {
    const said = w.arms[card.weapon];
    const already = kit.arms.filter((a) => a.weapon === card.weapon).length;
    return {
      title: said.name,
      tint: ARMS[card.weapon].tint,
      blurb: said.blurb,
      // No longer "this puts down the one in your hand" — it does not. A second 刀 is a second
      // 刀, swinging on its own clock, so what the card has to say is how many you would then
      // have.
      pairing: already > 0 ? fill(w.draft.alsoCarry, { count: String(already) }) : null,
      kind: w.draft.arm,
      grade: grade(card.tier),
      icon: { sort: 'arm', weapon: card.weapon },
      jackpot: false,
    };
  }

  const said = w.ways[card.way];
  // Ways sum where weapons count, so the useful thing to say about a second 火爆 is what the pair
  // comes to — which is not the same as what the card is worth on its own.
  const held = kit.ways.find((w2) => w2.way === card.way)?.depth ?? 0;
  const summed = Math.min(MaxDepth, held + card.tier);
  return {
    title: said.name,
    tint: PATHS[card.way].tint,
    blurb: said.blurb,
    pairing: held > 0 ? fill(w.draft.stacksTo, { depth: numeral(summed) }) : null,
    kind: w.draft.way,
    grade: grade(card.tier),
    icon: { sort: 'way', way: card.way },
    jackpot: false,
  };
}
