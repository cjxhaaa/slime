/**
 * The nine schools, running.
 *
 * One list of live effects and one timer per held school, rather than nine systems. What makes a
 * school itself is its motion plus its numbers; a combination sets a flag that bends one of those
 * behaviours, and an evolution overrides them. Written that way because fourteen combinations and
 * nine evolutions as twenty-three separate implementations is how a feature this size stops being
 * finishable — and because the flags are then the same shape as the design document, which is the
 * only reason anyone will be able to check one against the other later.
 *
 * ## What it does not own
 *
 * It never touches the 邪气 list. It asks a `Battlefield` what is nearby, tells it what died, and
 * — since 山崩 — tells it what to throw. The trial owns the fight; this owns what the pet is doing
 * about it.
 *
 * ## 山岳 used to be the exception
 *
 * It was a shell: a question the trial asked *before* applying damage (`absorb`), the only thing
 * in the game that ate a hit. It is an eruption now, and nothing absorbs anything. The shell is
 * meant to come back as its own draftable pick rather than as this school's second job; until it
 * does, **the body has no defence but moving**, which is a real change to how a run plays and not
 * a side effect of this one.
 */
import { clear, mix } from '../slime/colour.js';
import type { Depth, Painter } from './depth.js';
/**
 * What an effect can be coloured by, while two systems are live at once.
 *
 * The nine schools are being replaced by 兵器 + 五行 (see `COMBAT.md`), and for the three
 * stages in between, effects from both exist in the same list. Some keys sit in two of the
 * three sets — 符 and 剑 are a school **and** a weapon, 火 and 土 a school **and** a phase —
 * which is fine because in every such case they mean the same thing and are nearly the same
 * colour. `hueOf` resolves schools first so the game as it is actually played today does not
 * shift under the rewrite; once the schools go, the lookup falls through to the other two and
 * this union narrows back to a single set.
 */
export type Hued = School | Weapon | Element;

import {
  ARMS,
  MaxDepth,
  PATHS,
  FIVE,
  type Element,
  type Way,
  type Weapon,
  span as weaponSpan,
  swing,
} from './kit.js';
import {
  type Combo,
  Crown,
  PALETTE,
  type Palette,
  type School,
  SPECS,
  activeTriads,
  ascend,
  cadence,
  comboFor,
  span,
} from './schools.js';

/** What the fight has to be able to answer. Implemented by `Trial`. */
export interface Battlefield {
  targets(): { x: number; y: number }[];
  /** Kills up to `most` within `radius` of a point, nearest first. Returns how many died. */
  cull(x: number, y: number, radius: number, most: number): number;
  /** The nearest 邪气 within `within`, or null. */
  closest(x: number, y: number, within: number): { x: number; y: number } | null;
  /**
   * Throws everything within `radius` outward from a point at `speed` pixels a second.
   *
   * The first thing in here that moves a 邪气 instead of killing it. It is deliberately not
   * damage and not a stun: what it buys is **the ground back**. A press that has closed on the
   * body is the losing position in this mode, and before this there was no answer to it except
   * killing fast enough — which is why 山崩 trades almost all of its damage for this.
   */
  shove(x: number, y: number, radius: number, speed: number): void;
  /**
   * 缠木: holds everything within `radius` where it stands, for `seconds`.
   *
   * Short on purpose. A root long enough to be a stun is a different move and a much stronger one;
   * what this buys is the half-second that turns a press into a line you can walk out of.
   */
  root(x: number, y: number, radius: number, seconds: number): void;
  /**
   * 燎火: sets everything within `radius` alight for `seconds`.
   *
   * On the 邪气 rather than on the ground it was standing on. A patch of burning ground is a
   * thing you can walk out of, and 「中者带火」 says the opposite — it goes with them.
   */
  burn(x: number, y: number, radius: number, seconds: number): void;
  /** 荣木: gives back a share of 护体. */
  mend(amount: number): void;
}

/** A slowing region the trial reads back each frame. 冰魄 is the only thing that makes them. */
export interface Field {
  x: number;
  y: number;
  radius: number;
  /** Multiplier on closing speed inside. 0.5 is half pace. */
  factor: number;
}

interface Effect {
  school: Hued;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading, or orbit phase. */
  angle: number;
  age: number;
  life: number;
  reach: number;
  /** How many more it can kill before it is spent. */
  bite: number;
  /** Seconds until it can bite again, for the things that persist. */
  cool: number;
  /** For 雷法: the points the bolt passed through, so it can be drawn as one polyline. */
  path?: { x: number; y: number }[];
  /** For 影卫: which one it is, so three of them do not stack on the same pixel. */
  index?: number;
  /**
   * Radians a second this bends its own heading by. Zero, and absent, for everything that flies
   * straight.
   *
   * Its own field rather than a flag smuggled into another one. 三才剑阵 was first written by
   * adding 1000 to `index`, which the drawing layer reads as `index / 100` for the form's scale —
   * so a curving crescent came out **eleven times its size**, as a band across the whole screen.
   * Two meanings in one number is a bug with a delay on it.
   */
  curve?: number;
  /**
   * 山崩: where the stone is headed, fixed when it is thrown.
   *
   * Carried rather than recomputed from the velocity on landing, because a stone that lands on
   * whatever happens to be nearest at that moment is a stone that lands somewhere nobody aimed —
   * and the half-second warning is only honest if the mark does not move after it is drawn.
   */
  at?: { x: number; y: number };
  /**
   * 剑: cuts left in the flurry this sword is in the middle of.
   *
   * Its own field rather than borrowed from `bite`, which already means "how many more things this
   * can hit before it is spent" — a flying sword is never spent, and two meanings in one number is
   * a bug with a delay on it. (三才剑阵 taught that lesson through `index`.)
   */
  hits?: number;
}

/** How long each motion's effect lives, in seconds. */
const LIFE: Record<string, number> = {
  aimed: 1.4,
  sweep: 0.2,
  chain: 0.26,
  zone: 3.2,
  field: 0,
  orbit: 0,
  quake: 0,
  trail: 2.6,
  ward: 0,
};

/** How fast an aimed talisman flies. */
const AimedSpeed = 980;

/** 弓: how fast an arrow flies, and how far it will look for something to shoot. */
const ArrowSpeed = 1180;
const ShotRange = 620;
/** 爆火: how wide the burst is at the first depth. */
const BurstReach = 54;
/** 鸣金: how far the knock reaches, and how hard. */
const RingReachWay = 110;
const RingShove = 460;
/** 缠木: how wide it catches, and how long it holds. Short — a long root is a stun. */
const RootReach = 52;
const RootSeconds = 0.4;
/** 荣木: 护体 given back per hit, which is small on purpose. */
const LeechGift = 0.06;
/** 寒水: how wide the patch is and how long it lasts. */
const ChillReach = 74;
const ChillSeconds = 2.6;
/** 流水: how far it looks for the next one. */
const ChainReach = 150;
/** 燎火: how wide it catches and how long it burns. */
const BurnReach = 40;
const BurnSeconds = 1.6;
/** 土崩: the blast a hit opens, which is smaller than 山崩's own. */
const QuakeWay = 92;

/** 刀: how fast a 刀气 travels along the ground, and how wide its cut is. */
const SlashSpeed = 540;
const SlashSeconds = 0.44;
const SlashWidth = 46;
/** How far apart the blades of one swing are fanned, in radians. */
const SlashFan = 0.34;

/** 盾: how fast the 罡气 turns, and how long a node waits between bites. */
const GuardRate = 2.1;
const GuardCool = 0.42;

/** 符箓: slower than an arrow, but it turns. Radians a second it can bend its own heading by. */
const CharmSpeed = 430;
const CharmTurn = 4.2;

/** 剑: how fast the flying sword travels, how close it has to be, and the flurry it lands. */
const SwordSpeed = 520;
const SwordBite = 30;
const SwordFlurry = 4;
const SwordBeat = 0.11;
/** How long it rests after a flurry before it goes looking again. */
const SwordRest = 0.3;

/**
 * 山崩, in order: the stone leaves, it lands, the ground waits, the ground opens.
 *
 * **The wait is the move.** Half a second between the stone landing and the first pillar is long
 * enough to be read as a warning and short enough that a 邪气 closing at 106 px/s covers barely
 * fifty pixels of it — so the mark it leaves is a place you can step out of and they cannot, which
 * is the whole trade for how little damage it does.
 *
 * The ring opens from the inside out at `RingStep` a band, so one eruption reads as a single thing
 * travelling rather than as several going off at once.
 */
const StoneSpeed = 620;
/** Seconds between the stone landing and the first pillar. */
export const QuakeTell = 0.5;
/** Seconds between one band of pillars and the next, outward. */
const RingStep = 0.075;
/** How long a single pillar is up, from first breaking the ground to gone back into it. */
const PillarLife = 0.58;
/**
 * How hard a pillar throws what it catches, in pixels a second.
 *
 * Against `FlingTau` this is 182 pixels of travel — three body widths, and two pillars
 * catching the same 邪气 throw it twice that. 520 was tried first and came to 135, which the
 * checks showed did not clear the ground even at the centre of a blast: a nudge, and this
 * school has traded away almost all of its damage to buy a throw.
 */
export const PillarShove = 700;
/** A pillar reaches a little past where it kills, so the edge of a blast throws without killing. */
const ShoveSpread = 1.5;

/**
 * How far over the view is tilted: the ratio of a circle's drawn height to its width.
 *
 * The desktop is a plane seen from almost straight down, but not quite — which is the only reason
 * a column can be drawn at all. At 1 nothing has a side to show; this is the single number that
 * says how much side there is, and everything round that 山崩 draws is squashed by it.
 */
const Tilt = 0.42;

/**
 * A column's width and height, as multiples of its own ground radius.
 *
 * Tuned against the body, which is 40 to 46 pixels across: the outermost band comes out about a
 * body wide and a little taller than one, and the crater at the middle about half that. The first
 * pass had them at 2.5× height and they stopped being pillars — twelve of them closed into a
 * solid wall with the fight behind it, which is a screen you cannot play through.
 */
const HalfWidth = 0.46;
const Height = 1.05;
// Roughly as wide as it is tall. At 0.38 wide and 1.35 tall the slabs converged into a point and
// the stone came out a stalagmite — which is a cave, not a mountainside. 山石 is blocky.

/** How many vertical facets a stone is built from. Four is a crag; more is gravel. */
const Facets = 5;

/**
 * How many extra splits run up a stone's face, on top of the seams between its facets.
 *
 * Kept low for the reason the horizontal bands before them had to be: a stone is about forty-five
 * pixels across on screen, and anything finer than this stops reading as rock and starts reading
 * as hatching. The texture has to survive being small, which is the size it is actually seen at.
 */
const Splits = 3;

/**
 * A stone's own grain: the same number every frame, a different one for every stone.
 *
 * Hashed from the pillar's angle rather than drawn from `Math.random`, because a shape re-rolled
 * each frame is not a shape — the first faceted version did exactly that and the rock boiled.
 */
function grain(seed: number, n: number): number {
  const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * How far a pillar has come up, 0 to 1, over its life.
 *
 * Up hard, stand, and then **back down into the ground** rather than fading out where it is. A
 * column that dissolves in mid-air is a sprite being removed; one that sinks is the ground
 * closing, and the sinking is half of what makes the whole move read as earth rather than as an
 * effect played on top of it.
 */
export function heaved(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 0;
  const Up = 0.3;
  const Down = 0.6;
  if (t < Up) {
    // A touch past full and then settling back, which is the shove at the bottom of it.
    const u = t / Up;
    return Math.min(1.12, 1.12 * (1 - (1 - u) * (1 - u)));
  }
  if (t < Down) return 1;
  const d = (t - Down) / (1 - Down);
  return 1 - d * d;
}
/** How wide one pillar's own kill radius is. Small: the ring's coverage comes from the count. */
const PillarReach = 34;
/** How far the stone can be thrown. Past this there is no eruption at all rather than a short one. */
const QuakeRange = 520;

/**
 * 金钟罩: seconds a broken shell takes to come back, and how hard it throws when it goes.
 *
 * Nine seconds is deliberately long. A shell that re-forms quickly is a licence to stand in the
 * crowd, and this mode is built on not being able to do that — what it buys is the mistake you
 * get to survive, not a place to stand.
 *
 * The break throws but does **not** kill. Damage is what the nine schools are for; this card's
 * whole offer is staying alive, and giving it a kill as well would make it the first pick every
 * time rather than a trade.
 */
const ShellBack = 9;
const ShellShove = 620;
const ShellReach = 150;
/**
 * How fast a 剑气 crescent travels, how long it lives, and how wide the cut is.
 *
 * It used to be a cone swept close to the body — a 132-pixel arc that appeared and vanished in a
 * fifth of a second. That is a *swing*, and 剑气 is the one school whose name says the opposite:
 * the qi leaves the sword. So it is thrown now, cuts through whatever it passes, and keeps going.
 */
const ArcSpeed = 660;
const ArcSeconds = 0.75;
const ArcWidth = 88;

/**
 * 剑气's three forms, and the rest after them.
 *
 * A metronome is not a swordsman. One crescent every 1.15 seconds, always at the nearest thing, is
 * *correct* and it is the least interesting way a sword could possibly behave — there is no
 * phrasing in it, so there is nothing to recognise and nothing to look forward to.
 *
 * So it is a form of three: **起手** off the left shoulder, **反手** back across it, and **收势**
 * through the middle as a cross. The first two come fast, and then it holds — the pause is what
 * makes the three read as one phrase instead of as three events, and it is the only part of this
 * that a player will actually feel.
 *
 * `beat` is a multiple of the school's cadence and the three **sum to 3.0**, so the rate is exactly
 * what it was before. This buys phrasing and costs nothing, which is the only honest way to add
 * showmanship to something already balanced.
 */
interface Form {
  /** Radians off the aim, so consecutive cuts do not lie on top of each other. */
  tilt: number;
  /** A cross, thrown along the aim and across it at once. */
  cross: boolean;
  /** How big the crescent is drawn and how far it reaches, as a multiple. */
  scale: number;
  /** Cadence multiples until the next form. */
  beat: number;
}

const FORMS: Form[] = [
  { tilt: -0.44, cross: false, scale: 0.95, beat: 0.3 },
  { tilt: 0.44, cross: false, scale: 0.95, beat: 0.3 },
  { tilt: 0, cross: true, scale: 1.35, beat: 2.4 },
];

/** How long the qi gathers at the shoulder before a cut leaves. */
const WindUpSeconds = 0.1;
/** How fast 风刃 goes round, in radians a second. */
const OrbitRate = 3.1;
/** How fast an 影卫 moves, and how often it can kill. */
const WardSpeed = 190;
const WardCool = 0.55;
/** How close a thing has to be to count as touched by a persistent effect. */
const Touch = 22;

/**
 * 共鸣 — the pet answering, on its own body, when a pairing fires.
 *
 * Every combination's effect happens **somewhere else**: 雷符 forks where the talisman landed,
 * 冰火 goes off inside the cold field, 焚瘴 lights a trail thirty pixels behind you. All correct,
 * and all of it reads as *the world doing something* rather than as **you** doing it, because the
 * one thing on screen that never reacted was the pet.
 *
 * So a pairing that fires now also throws a ring off the body, in the two schools' own colours.
 * It costs nothing, it kills nothing, and it is the whole difference between watching an effect and
 * having cast one.
 */
interface Surge {
  x: number;
  y: number;
  age: number;
  life: number;
  /** Two colours for a pairing, three for a 三合. */
  hues: Palette[];
  /** The body's radius when it fired, so the rings leave its edge at any realm. */
  from: number;
}

/**
 * How often one pairing may answer, in seconds.
 *
 * 风雪 fires nine times a second and 冰火 can go off several times in one frame. Without a
 * throttle the body would strobe, which is not excitement, it is noise — and the ring means "that
 * just happened" only while it is rare enough to be read.
 */
const SurgeEvery = 0.4;
const SurgeSeconds = 0.42;

/**
 * Grit.
 *
 * The dust is the benchmark for this whole layer and the reason is not the colour — it is that a
 * mote is **one of many small things with a direction drawn into it**. A streak along its own
 * velocity, brightest on the way in. Every school here now throws a handful of the same thing when
 * it connects, which is the cheapest impact feedback there is and the one that was missing
 * entirely: before this, something died and simply stopped being on the screen.
 */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left, and how many it started with, so the fade is a fraction. */
  life: number;
  born: number;
  size: number;
  hue: Palette;
}

/** How much of a spark's travel is drawn behind it, in seconds. Off velocity, never off the last
 * frame's position — a remembered position makes the streak three times as long on the 20Hz tier,
 * which is the one place nothing should change length. */
const SparkTail = 0.045;
/** Drag, so they slow into nothing rather than flying off the desktop. */
const SparkDrag = 3.4;
/**
 * The most that can exist at once.
 *
 * A 大乘 run kills a thousand things, and eight sparks each with nothing stopping them is eight
 * thousand line segments a frame. The cap is what keeps the worst case a fixed cost rather than
 * one proportional to how well the run is going.
 */
const MaxSparks = 170;

export class Attacks {
  private live: Effect[] = [];
  private sparks: Spark[] = [];
  private surges: Surge[] = [];
  /** When each pairing last answered, so a fast one cannot strobe. */
  private lastSurge = new Map<string, number>();
  /** Seconds since this arsenal started, for anything that wants to turn or waver. */
  private clock = 0;
  private timers = new Map<School, number>();
  /** Everything the current build holds, refreshed whenever the arsenal changes. */
  private held: { school: School; level: number; evolved: boolean }[] = [];
  private combos: Combo[] = [];
  /** Names of the 三合 the build completes, worked out once per change rather than per frame. */
  private forms = new Set<string>();

  reset(): void {
    this.shellLeft = 0;
    this.shellLayers = 0;
    this.shieldCards = 0;
    this.plateWay = 0;
    this.shellBack = 0;
    this.shellBurst = 0;
    this.arena = null;
    this.live = [];
    this.sparks = [];
    this.surges = [];
    this.lastSurge.clear();
    this.clock = 0;
    this.timers.clear();
    this.held = [];
    this.combos = [];
  }

  /**
   * Tells it what is being carried.
   *
   * Pushed in rather than read out of an `Arsenal`, so this class can be driven straight from a
   * literal in the checks and in the probe harness without standing a draft up first.
   */
  carry(held: { school: School; level: number; evolved: boolean }[], combos: Combo[]): void {
    this.held = held;
    this.combos = combos;
    this.forms = new Set(activeTriads(held.map((h) => h.school)).map((t) => t.name));
    for (const h of held) if (!this.timers.has(h.school)) this.timers.set(h.school, 0.25);
    // 玄冥甲 parks the wards on an orbit and 玄霜壁 parks the blades on the cold rim; both are
    // read at draw time, so nothing has to be rebuilt when a form completes mid-run.
  }

  private has(school: School): boolean {
    return this.held.some((h) => h.school === school);
  }

  private levelOf(school: School): number {
    return this.held.find((h) => h.school === school)?.level ?? 1;
  }

  /**
   * Whether a school is evolved. Only a school can be — a weapon deepens instead, and asking
   * this of one is a question with a plain answer rather than an error.
   */
  private evolved(key: Hued): boolean {
    const school = key as School;
    return this.held.find((h) => h.school === school)?.evolved ?? false;
  }

  /**
   * How far up a school is, as 0 through 4.
   *
   * Every density below is driven off this and nothing else, so "a level looks like something"
   * lives in one expression rather than in nine scattered `levelOf` calls that can drift apart.
   */
  /** How deep a school is held. A weapon or a phase is not, so it answers zero. */
  private rung(key: Hued): number {
    const school = key as School;
    return Math.max(0, Math.min(4, this.levelOf(school) - 1));
  }

  /**
   * The colours this school is drawn in right now.
   *
   * One call rather than nine `evolved ? ... : ...` at every draw site. The evolved ramp is hotter
   * and pulled toward gold, which is the colour none of the nine owns — so it reads as "above the
   * nine" instead of "the fire one".
   */
  private hueOf(key: Hued): Palette {
    const base = (PALETTE as Partial<Record<Hued, Palette>>)[key];
    // Schools first, deliberately: see `Hued`.
    if (base) return this.evolved(key as School) ? ascend(base) : base;
    const arm = (ARMS as Partial<Record<Hued, { tint: string }>>)[key];
    const tint = arm?.tint ?? (FIVE as Partial<Record<Hued, { tint: string }>>)[key]?.tint;
    // A weapon or a phase carries one colour rather than three, so the body and the rim are
    // derived from it instead of being three more numbers to keep in step.
    const lit = tint ?? '#ffffff';
    return { core: mix(lit, '#ffffff', 0.55), body: lit, edge: mix(lit, '#1a1208', 0.5) };
  }

  /**
   * The mark an evolved school wears: a slow gold four-pointed star.
   *
   * Drawn on top of whatever the school already does. It is small, and that is on purpose — its
   * job is to answer "did that evolve?" at a glance, not to become the effect. The shape changes
   * underneath it are what make each one its own thing.
   */
  private mark(context: CanvasRenderingContext2D, x: number, y: number, size: number, alpha = 1): void {
    const turn = this.clock * 1.1;
    context.save();
    context.translate(x, y);
    context.rotate(turn);
    context.globalAlpha = alpha;
    context.fillStyle = Crown;
    for (const spin of [0, Math.PI / 2]) {
      context.save();
      context.rotate(spin);
      context.beginPath();
      context.moveTo(0, -size);
      context.quadraticCurveTo(size * 0.22, 0, 0, size);
      context.quadraticCurveTo(-size * 0.22, 0, 0, -size);
      context.closePath();
      context.fill();
      context.restore();
    }
    context.globalAlpha = alpha * 0.8;
    context.beginPath();
    context.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.restore();
  }

  /**
   * The pet answers a pairing, on its own body.
   *
   * Named by the pairing so the throttle is per combination: 冰火 going off constantly must not
   * silence 雷符. Ignored when the pairing is not actually held, so a call site cannot announce
   * something the build does not have.
   */
  private surge(a: School, b: School): void {
    if (!this.paired(a, b)) return;
    const key = `${a}${b}`;
    if ((this.lastSurge.get(key) ?? -99) > this.clock - SurgeEvery) return;
    this.lastSurge.set(key, this.clock);
    this.surges.push({
      x: this.bodyX,
      y: this.bodyY,
      age: 0,
      life: SurgeSeconds,
      hues: [this.hueOf(a), this.hueOf(b)],
      from: this.bodyR,
    });
  }

  /** The same, for a 三合: three colours, and a beat longer. */
  private surgeTriad(name: string, of: [School, School, School]): void {
    if (!this.triad(name)) return;
    if ((this.lastSurge.get(name) ?? -99) > this.clock - SurgeEvery * 1.4) return;
    this.lastSurge.set(name, this.clock);
    this.surges.push({
      x: this.bodyX,
      y: this.bodyY,
      age: 0,
      life: SurgeSeconds * 1.5,
      hues: of.map((school) => this.hueOf(school)),
      from: this.bodyR,
    });
  }

  /** True when a 三合 is complete. By name, so reordering `TRIADS` cannot silently rewire one. */
  private triad(name: string): boolean {
    return this.forms.has(name);
  }

  /** True when both halves of a named pairing are held. */
  private paired(a: School, b: School): boolean {
    const combo = comboFor(a, b);
    return combo !== null && this.combos.includes(combo);
  }

  get busy(): boolean {
    return (
      this.live.length > 0 || this.sparks.length > 0 || this.surges.length > 0 || this.held.length > 0
    );
  }

  /** The slowing regions, for the trial to apply to its own units. */
  fields(): Field[] {
    const out: Field[] = [];
    if (this.has('冰')) {
      const level = this.levelOf('冰');
      out.push({
        x: this.bodyX,
        y: this.bodyY,
        radius: span('冰', level),
        // 玄冰狱 stops them outright; otherwise it is a wade rather than a wall.
        factor: this.evolved('冰') ? 0.12 : 0.55,
      });
    }
    // 冻土's patches. They are live effects rather than a second list, so they expire with their
    // own drawing and nothing has to remember to clean them up.
    for (const e of this.live) {
      // Any frost, whoever laid it: 冻土 lays one where the ground opened, 寒水 where a hit
      // landed, and the slow a 邪气 wades through does not care which.
      if (e.kind === 'frost') {
        out.push({ x: e.x, y: e.y, radius: e.reach, factor: 0.62 });
      }
    }
    return out;
  }

  /**
   * 山崩: one stone, thrown at whatever is worth throwing it at.
   *
   * Aimed at the **crowd** rather than at the nearest thing. A ring that opens outward is worth
   * exactly as much as the number of 邪气 standing in it, and the nearest one is usually the one
   * already on top of you — which is the one place an eruption centred there would also be
   * throwing them straight back through you.
   */
  private throwStone(level: number): void {
    const battlefield = this.arena;
    if (!battlefield) return;
    const reach = span('土', level);
    const at = this.bestGround(battlefield, reach);
    if (!at) return;
    // 地龙翻身 breaks the stone into three, landing around the same spot and opening in turn, so
    // the ground keeps moving for a second instead of all at once.
    const marks = this.evolved('土') ? 3 : 1;
    for (let i = 0; i < marks; i++) {
      const spread = i === 0 ? 0 : reach * 0.85;
      const angle = (i / marks) * Math.PI * 2 + Math.random();
      const spot = { x: at.x + Math.cos(angle) * spread, y: at.y + Math.sin(angle) * spread };
      const away = Math.hypot(spot.x - this.bodyX, spot.y - this.bodyY) || 1;
      const stone = this.push(
        '土',
        'stone',
        this.bodyX,
        this.bodyY,
        ((spot.x - this.bodyX) / away) * StoneSpeed,
        ((spot.y - this.bodyY) / away) * StoneSpeed,
        Math.random() * Math.PI * 2,
        away / StoneSpeed + i * 0.22,
        reach,
        0,
      );
      stone.at = spot;
    }
  }

  /**
   * Where the stone goes: the spot inside range with the most 邪气 within one blast of it.
   *
   * Scored over the 邪气 themselves as candidate centres rather than over a grid — the best
   * centre is always on or near one of them, there are at most a few hundred, and a grid fine
   * enough to beat that would cost more than the fight does.
   */
  private bestGround(battlefield: Battlefield, reach: number): { x: number; y: number } | null {
    const seen = battlefield.targets();
    let best: { x: number; y: number } | null = null;
    let most = 0;
    for (const candidate of seen) {
      const out = Math.hypot(candidate.x - this.bodyX, candidate.y - this.bodyY);
      // Not past throwing distance, and not on top of the body: an eruption underfoot throws the
      // press onto you from the far side rather than away.
      if (out > QuakeRange || out < reach * 0.5) continue;
      let count = 0;
      for (const other of seen) {
        if (Math.hypot(other.x - candidate.x, other.y - candidate.y) <= reach) count++;
      }
      if (count > most) {
        most = count;
        best = { x: candidate.x, y: candidate.y };
      }
    }
    return best;
  }

  /**
   * The ground opens: bands of pillars from the middle outward.
   *
   * Each band is pushed with a **negative age** so it is inert until its turn comes — the same
   * trick the staggered rings elsewhere use, and the reason this is one thing travelling rather
   * than several going off together.
   *
   * Damage is deliberately almost nothing (`SPECS` gives it a bite of 1). What a pillar is for is
   * `shove`, and it throws over a wider circle than it kills in, so the rim of an eruption clears
   * ground without clearing the field.
   */
  private erupt(x: number, y: number, reach: number, level: number): void {
    const bands = 2 + Math.floor(level / 2);
    const bite = SPECS['土'].bite;
    for (let band = 0; band < bands; band++) {
      // The first band is the stone's own crater: one pillar, dead centre.
      const radius = band === 0 ? 0 : (reach * band) / (bands - 1);
      const count = band === 0 ? 1 : 3 + band * 3;
      const spin = Math.random() * Math.PI * 2;
      // **Small inside, big outside.** The crater is a heave; the rim is a wall going up. One size
      // for all of them read as a pattern stamped on the ground rather than as something that
      // started in one place and got worse on its way out.
      const grade = bands === 1 ? 1 : band / (bands - 1);
      const size = PillarReach * (0.42 + 1.05 * grade);
      for (let i = 0; i < count; i++) {
        const angle = spin + (i / count) * Math.PI * 2;
        const pillar = this.push(
          '土',
          'pillar',
          x + Math.cos(angle) * radius,
          y + Math.sin(angle) * radius,
          0,
          0,
          angle,
          PillarLife,
          size,
          bite,
        );
        // Its band's turn, plus a little of its own, so a ring comes up as a run of separate
        // shoves rather than as one lid lifting off.
        pillar.age = -(band * RingStep + (i / count) * RingStep * 0.7);
      }
    }
    // 冻土: the opened ground stays cold. `fields()` reads these back, so the slow is the same
    // one 冰魄 makes rather than a second system — and it is laid where the throw lands them.
    if (this.paired('土', '冰')) {
      this.push('土', 'frost', x, y, 0, 0, 0, 3.2, reach, 0);
    }

    // 幽壤 and 幽都印: the 影卫 come up out of the broken ground, where it broke.
    this.surge('土', '冰');
    this.surge('土', '影');
    this.surgeTriad('幽都印', ['符', '土', '影']);
    this.surgeTriad('玄冥卫', ['土', '冰', '影']);
    this.surgeTriad('玄霜壁', ['冰', '风', '土']);
    if (this.triad('幽都印')) {
      for (let i = 0; i < 3; i++) this.spawnWard(i + 7);
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        this.push(
          '符',
          'ward-glyph',
          x + Math.cos(angle) * 96,
          y + Math.sin(angle) * 96,
          0,
          0,
          angle,
          2.2,
          28,
          1,
        );
      }
    } else if (this.paired('土', '影')) {
      for (let i = 0; i < 2; i++) this.spawnWard(i + 7);
    }
  }

  /**
   * 兵器与五行, when one is equipped.
   *
   * **This is the switch between the two systems.** A weapon in here means the pet fights with it
   * and the nine schools are not consulted; nothing in here means the schools run as before. That
   * is deliberately not a flag: a flag can be set with no weapon behind it, and then the pet
   * stands there doing nothing while every check still passes.
   */
  private arm: { weapon: Weapon; depth: number } | null = null;
  private ways: { way: Way; depth: number }[] = [];
  private swingLeft = 0;

  /**
   * Equips a weapon and the ways carried with it. Passing null hands the fight back to the
   * schools, which is what the arena and every un-migrated caller still want.
   */
  equip(arm: { weapon: Weapon; depth: number } | null, ways: { way: Way; depth: number }[]): void {
    // A newly equipped weapon swings **at once**, and a swap restarts the clock so changing to
    // something slower cannot ride the old one's timer.
    //
    // At once rather than after one interval: 剑 and 盾 do not fire, they *place* something that
    // then works on its own, and 剑's interval is 1.9s deep. Waiting that long meant picking up a
    // flying sword and watching nothing happen for two seconds — which is how it looked in the
    // first frame strip, and is indistinguishable from the weapon being broken.
    if (arm?.weapon !== this.arm?.weapon) this.swingLeft = 0;
    this.arm = arm;
    this.ways = ways;
    // 固土 is the one of the ten that is not an on-hit effect at all — it is armour, so it is
    // settled here rather than in `land`. One layer a depth.
    this.plateWay = this.depthOf('土固');
    this.reshell();
  }

  /** True while the pet is fighting with 兵器 rather than with the nine schools. */
  get armed(): boolean {
    return this.arm !== null;
  }

  /** How deep a way is carried, or 0 if it is not carried at all. */
  private depthOf(way: Way): number {
    return this.ways.find((w) => w.way === way)?.depth ?? 0;
  }

  /**
   * 锐金: how many more things one shot can pass through.
   *
   * Asked by the weapons rather than settled in `land`, because what it changes is whether the
   * thing that hit is **spent** — and that is a fact about the projectile, not about the point it
   * arrived at. It is the one of the ten that reaches back into delivery, and saying so here is
   * cheaper than pretending the split is tidier than it is.
   */
  private pierce(): number {
    return this.depthOf('金锐');
  }

  /**
   * One swing of whatever is equipped.
   *
   * Five branches, one per weapon, and **none of them knows an element exists**. What a swing does
   * on contact is `land`'s business, which is the whole split this system is built on: a weapon
   * decides what goes out and where, a way decides what happens where it arrives.
   */
  private strike(battlefield: Battlefield): void {
    const arm = this.arm;
    if (!arm) return;
    const reach = weaponSpan(arm.weapon, arm.depth);

    if (arm.weapon === '弓') {
      // One arrow at the nearest thing. The plainest of the five on purpose: it is the one that
      // has to make a way legible without any delivery of its own to confuse it.
      const mark = battlefield.closest(this.bodyX, this.bodyY, ShotRange);
      if (!mark) return;
      const away = Math.hypot(mark.x - this.bodyX, mark.y - this.bodyY) || 1;
      this.push(
        '符',
        'arrow',
        this.bodyX,
        this.bodyY,
        ((mark.x - this.bodyX) / away) * ArrowSpeed,
        ((mark.y - this.bodyY) / away) * ArrowSpeed,
        Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX),
        LIFE.aimed,
        Touch + reach,
        ARMS[arm.weapon].bite + this.pierce(),
      );
      return;
    }
    if (arm.weapon === '刀') {
      // A fan of 刀气 along the ground, aimed at whatever is nearest. Short-lived and wide: this is
      // the weapon that asks you to be facing the right way, which is the only thing it asks.
      const mark = battlefield.closest(this.bodyX, this.bodyY, reach * 2.4);
      const aim = mark
        ? Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX)
        : Math.random() * Math.PI * 2;
      const blades = 2 + Math.floor(arm.depth / 2);
      for (let i = 0; i < blades; i++) {
        const heading = aim + (i - (blades - 1) / 2) * SlashFan;
        this.push(
          '刀',
          'slash',
          this.bodyX + Math.cos(heading) * this.bodyR * 0.7,
          this.bodyY + Math.sin(heading) * this.bodyR * 0.7,
          Math.cos(heading) * SlashSpeed,
          Math.sin(heading) * SlashSpeed,
          heading,
          SlashSeconds,
          reach,
          ARMS[arm.weapon].bite + this.pierce(),
        );
      }
      return;
    }

    if (arm.weapon === '盾') {
      // 罡气 does not get thrown; it is simply there. The swing clock tops the ring up rather than
      // launching anything, so a 盾 build is the one that never has to aim and never stops working.
      const want = 2 + Math.floor((arm.depth - 1) * 0.75);
      const have = this.live.filter((e) => e.kind === 'guard').length;
      for (let i = have; i < want; i++) {
        const node = this.push('盾', 'guard', this.bodyX, this.bodyY, 0, 0, 0, 0, reach, 1);
        node.index = i;
      }
      return;
    }

    if (arm.weapon === '符') {
      // A charm that steers. Slower than an arrow on purpose — what it buys is that it arrives,
      // and a thing that both arrives and arrives quickly has nothing left to trade.
      const mark = this.pickAway(battlefield, [], ShotRange);
      const aim = mark
        ? Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX)
        : Math.random() * Math.PI * 2;
      this.push(
        '符',
        'charm',
        this.bodyX,
        this.bodyY,
        Math.cos(aim) * CharmSpeed,
        Math.sin(aim) * CharmSpeed,
        aim,
        2.4,
        Touch + reach,
        ARMS[arm.weapon].bite + this.pierce(),
      );
      return;
    }

    if (arm.weapon === '剑') {
      // One flying sword, and another at the third and fifth depth. It is never spent, so the
      // swing clock only decides whether there is one — after that it keeps itself busy.
      const want = 1 + (arm.depth >= 3 ? 1 : 0) + (arm.depth >= 5 ? 1 : 0);
      const have = this.live.filter((e) => e.kind === 'sword').length;
      for (let i = have; i < want; i++) {
        const blade = this.push(
          '剑',
          'sword',
          this.bodyX,
          this.bodyY,
          0,
          0,
          0,
          0,
          reach,
          ARMS[arm.weapon].bite,
        );
        blade.index = i;
        blade.hits = 0;
      }
      return;
    }
  }

  /**
   * Where a swing landed, and what the ways do about it.
   *
   * **This is the fifty.** Five weapons times ten ways is fifty pairings and not one of them is
   * written down: a weapon calls this with a point, and every way carried applies itself there.
   * 爆 on an arrow is an exploding arrow and 爆 on a 刀气 is a row of bursting slashes, out of one
   * piece of code — which is the only reason this system is affordable at all.
   *
   * Ways settle **in the order they are carried**, each doing its own thing, so two that both act
   * on the same hit compound rather than one winning.
   */
  private land(x: number, y: number, battlefield: Battlefield, heading: number): void {
    for (const held of this.ways) {
      const path = PATHS[held.way];
      const depth = Math.max(1, Math.min(MaxDepth, held.depth));

      // Deepening widens or lengthens, and never only raises a number. The rule the schools were
      // built on, and the one that keeps a build readable without a stat screen.
      const more = 1 + (depth - 1) * 0.18;

      if (path.on === 'burst') {
        // 爆火: a small circle of fire where it hit.
        const radius = BurstReach * more;
        battlefield.cull(x, y, radius, 1 + Math.floor(depth / 2));
        this.push('火', 'burst', x, y, 0, 0, 0, 0.42, radius, 0);
        this.spark(x, y, 7, '火', 260, heading, 2.2);
      } else if (path.on === 'shove') {
        // 鸣金: the ground back, which is the thing this mode has least of.
        battlefield.shove(x, y, RingReachWay * more, RingShove);
        this.push('金', 'burst', x, y, 0, 0, 0, 0.3, RingReachWay * more, 0);
        this.spark(x, y, 6, '金', 300, heading, Math.PI * 2);
      } else if (path.on === 'root') {
        // 缠木: held where it stands. Deepening holds longer rather than wider — reaching
        // further would make it a crowd answer, and it is meant to be a *moment*.
        battlefield.root(x, y, RootReach, RootSeconds * more);
        this.push('木', 'snare', x, y, 0, 0, heading, RootSeconds * more, RootReach, 0);
      } else if (path.on === 'leech') {
        // 荣木: a sliver of 护体 back per hit. Small, because a weapon that swings fast would
        // otherwise make the body unkillable rather than durable.
        battlefield.mend(LeechGift * depth);
        this.spark(x, y, 3, '木', 120, -Math.PI / 2, 1.1);
      } else if (path.on === 'chill') {
        // 寒水: the ground stays cold. `fields()` reads these back, so the slow is the one the
        // 邪气 already know how to wade through rather than a second system.
        this.push('水', 'frost', x, y, 0, 0, 0, ChillSeconds, ChillReach * more, 0);
      } else if (path.on === 'chain') {
        // 流水: on to the next one. One hop rather than a cascade — a chain that keeps going is
        // a screen-clear, and this is supposed to be a reach extension.
        const next = battlefield.closest(x, y, ChainReach * more);
        if (next) {
          battlefield.cull(next.x, next.y, Touch, 1);
          const fork = this.push('水', 'chain', x, y, 0, 0, 0, 0.2, ChainReach, 0);
          fork.path = [
            { x, y },
            { x: next.x, y: next.y },
          ];
        }
      } else if (path.on === 'burn') {
        // 燎火: alight, and it goes with them.
        battlefield.burn(x, y, BurnReach, BurnSeconds * more);
        this.spark(x, y, 4, '火', 150, heading, Math.PI);
      } else if (path.on === 'quake') {
        // 土崩: the ground opens where it landed. The same eruption 山崩 throws a stone for,
        // smaller and with no stone and no warning — a weapon hit is the warning.
        this.erupt(x, y, QuakeWay * more, depth);
      } else if (path.on === 'pierce' || path.on === 'plate') {
        // Neither of these happens at a landing point. 金锐 decides whether the thing that landed
        // is spent (the weapon's business, in `step`), and 固土 is armour (`equip`'s).
      }
    }
  }

  /** 金钟罩: layers still unbroken, and the clock on the ones that are. */
  private shellLeft = 0;
  private shellLayers = 0;
  private shellBack = 0;
  /** Counts down from 1 after a break, for the ring that goes out with it. */
  private shellBurst = 0;

  /**
   * How many layers of 金钟 are drafted.
   *
   * Pushed in rather than read from `Arsenal`, because this module already takes its holdings that
   * way and a second path to the same source is a second thing that can disagree with the first.
   */
  guard(layers: number): void {
    this.shieldCards = layers;
    this.reshell();
  }

  /** How many layers the card gave. 固土 keeps its own count beside it. */
  private shieldCards = 0;
  private plateWay = 0;

  /**
   * Totals the two sources of shell and hands the difference to the body.
   *
   * 金钟罩 is a card and 固土 is one of the ten, and they are the same armour — so they are
   * summed rather than kept as two shells with two clocks, which would mean two sets of plates
   * turning around the pet at two radii and no way to tell what either one was.
   */
  private reshell(): void {
    const layers = this.shieldCards + this.plateWay;
    if (layers === this.shellLayers) return;
    // A layer gained mid-run is a layer you have now, not one you have in nine seconds.
    const gained = Math.max(0, layers - this.shellLayers);
    this.shellLayers = layers;
    this.shellLeft = Math.min(layers, this.shellLeft + gained);
    if (this.shellLeft > 0) this.shellBack = 0;
  }

  /** Layers currently standing, for anything that wants to draw them. */
  get shell(): number {
    return this.shellLeft;
  }

  /**
   * 金钟罩, asked before the body takes a hit.
   *
   * A question rather than an effect, because the shell has to act *between* the contact and the
   * damage and everything else in here acts on its own timer. Returns true when a layer ate it.
   */
  absorb(): boolean {
    if (this.shellLeft <= 0) return false;
    this.shellLeft -= 1;
    if (this.shellLeft > 0) return true;

    // The last one. It goes out as a shove rather than as a kill — see `ShellBack`.
    this.shellBack = ShellBack;
    this.shellBurst = 1;
    this.arena?.shove(this.bodyX, this.bodyY, ShellReach, ShellShove);
    // The ring is drawn from `shellBurst` rather than pushed as an effect: an effect would need a
    // kind, a draw branch and a slot in the live list for half a second, to say one thing that one
    // counter already says.
    this.spark(this.bodyX, this.bodyY, 16, '冰', 320);
    return true;
  }

  private arena: Battlefield | null = null;
  private bodyX = 0;
  private bodyY = 0;
  private bodyR = 44;
  private lastDropX = 0;
  private lastDropY = 0;

  update(
    dt: number,
    body: { x: number; y: number; radius?: number },
    battlefield: Battlefield,
  ): void {
    this.arena = battlefield;
    this.bodyX = body.x;
    this.bodyY = body.y;
    // The rings leave the body's edge, and the body grows with the realm — a hard-coded radius put
    // them *inside* a 大乘 slime, which reads as the pet being hit rather than as it casting.
    if (body.radius) this.bodyR = body.radius;
    this.clock += dt;

    this.shellBurst = Math.max(0, this.shellBurst - dt * 2);
    if (this.shellLeft <= 0 && this.shellLayers > 0) {
      this.shellBack -= dt;
      if (this.shellBack <= 0) this.shellLeft = this.shellLayers;
    }

    // A branch rather than an early return. Everything after this — sparks ageing out, a pairing's
    // rings expiring, the shell re-forming — has to keep running whichever system is live, and a
    // return here would quietly strand all of it.
    if (this.arm) {
      // One weapon, one clock. The schools keep a timer each because four run at once; there is
      // only ever one of these.
      this.swingLeft -= dt;
      if (this.swingLeft <= 0) {
        this.swingLeft = swing(this.arm.weapon, this.arm.depth);
        this.strike(battlefield);
      }
    } else {
      for (const h of this.held) {
        const period = h.evolved ? this.evolvedCadence(h.school) : cadence(h.school, h.level);
        let left = (this.timers.get(h.school) ?? period) - dt;
        // Clamped to one activation a frame: a cadence shorter than a frame would otherwise fire a
        // burst proportional to how badly the machine is struggling, which is backwards.
        if (left <= 0) {
          // A school may ask for a different gap before its next turn — 剑气 does, because its
          // three forms are not evenly spaced. Everything else returns nothing and keeps the flat
          // cadence.
          left = period * (this.fire(h.school, battlefield) ?? 1);
        }
        this.timers.set(h.school, left);
      }
    }

    this.step(dt, battlefield);

    const ringing: Surge[] = [];
    for (const surge of this.surges) {
      surge.age += dt;
      if (surge.age < surge.life) ringing.push(surge);
    }
    this.surges = ringing;

    const burning: Spark[] = [];
    for (const spark of this.sparks) {
      spark.life -= dt;
      if (spark.life <= 0) continue;
      const slow = Math.max(0, 1 - SparkDrag * dt);
      spark.vx *= slow;
      spark.vy *= slow;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      burning.push(spark);
    }
    this.sparks = burning;
  }

  /** An evolution's cadence, where it changes one. */
  private evolvedCadence(school: School): number {
    const base = cadence(school, 5);
    if (school === '符') return 0.12;
    if (school === '雷') return base * 0.7;
    if (school === '影') return base;
    return base * 0.8;
  }

  /** Which form 剑气 is on. */
  private form = 0;

  /** One activation of one school. Returns a multiple of the cadence to wait, if it wants one. */
  private fire(school: School, battlefield: Battlefield): number | void {
    const level = this.levelOf(school);
    const reach = span(school, level);
    const spec = SPECS[school];

    if (school === '符') {
      // 阵符: the talismans stop flying and stand in a ring on the ground instead.
      if (this.paired('符', '土')) {
        this.surge('符', '土');
        const count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const radius = 108;
          this.push(
            '符',
            'ward-glyph',
            this.bodyX + Math.cos(angle) * radius,
            this.bodyY + Math.sin(angle) * radius,
            0,
            0,
            angle,
            1.4,
            26,
            1,
          );
        }
        return;
      }
      const shots = this.evolved('符') ? 2 : 1;
      const seen: { x: number; y: number }[] = [];
      for (let i = 0; i < shots; i++) {
        const mark = this.pickAway(battlefield, seen, reach);
        if (!mark) break;
        seen.push(mark);
        const away = Math.hypot(mark.x - this.bodyX, mark.y - this.bodyY) || 1;
        // 符剑: it circles for a moment first, then goes.
        const orbit = this.paired('符', '剑');
        if (orbit) this.surge('符', '剑');
        this.push(
          '符',
          orbit ? 'aimed-orbit' : 'aimed',
          this.bodyX,
          this.bodyY,
          ((mark.x - this.bodyX) / away) * AimedSpeed,
          ((mark.y - this.bodyY) / away) * AimedSpeed,
          Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX),
          LIFE.aimed,
          Touch,
          1,
        );
      }
      return;
    }

    if (school === '剑') {
      const mark = battlefield.closest(this.bodyX, this.bodyY, reach * 1.4);
      const aim = mark
        ? Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX)
        : Math.random() * Math.PI * 2;
      const form = FORMS[this.form % FORMS.length];
      this.form += 1;

      const heading = aim + form.tilt;
      const headings: number[] = [];
      if (this.evolved('剑')) {
        // 万剑归宗: a fan of five, and 收势 widens it.
        const spread = form.cross ? 0.72 : 0.5;
        for (let i = 0; i < 5; i++) headings.push(heading + (i - 2) * spread);
      } else if (this.paired('剑', '风')) {
        for (let i = 0; i < 4; i++) headings.push(heading + (i * Math.PI) / 2);
      } else if (form.cross) {
        // 收势: through the middle and across it at once.
        headings.push(heading, heading + Math.PI / 2);
      } else {
        headings.push(heading);
      }

      // **The cut is shared out between the crescents.** Giving each its own full bite made the
      // count multiply by how many went out, and measuring it showed the result: an evolved 剑气
      // killed 30 a second against 1.2 for the same school one card short of it, a twenty-five-fold
      // cliff. Extra crescents buy *coverage*; the total this school can cut in one swing is one
      // number, and the evolution adds two to it rather than multiplying it by five.
      const total = spec.bite + level + (this.evolved('剑') ? 2 : 0);
      const bite = Math.max(1, Math.ceil(total / headings.length));
      // 三才剑阵: the cut leaves on a curve instead of a line, as though it were following the ring
      // of talismans round.
      const circling = this.triad('三才剑阵');
      // The sword answers on the third beat only — 收势. Ringing on all three would be three rings
      // a quarter second apart, which is a strobe rather than a flourish.
      if (form.cross) {
        this.surge('剑', '风');
        this.surge('剑', '雷');
        this.surgeTriad('三才剑阵', ['符', '剑', '雷']);
        this.surgeTriad('瘴风刃', ['风', '剑', '毒']);
      }
      for (const way of headings) {
        const blade = this.push(
          '剑',
          'arc',
          this.bodyX + Math.cos(way) * 34,
          this.bodyY + Math.sin(way) * 34,
          Math.cos(way) * ArcSpeed,
          Math.sin(way) * ArcSpeed,
          way,
          ArcSeconds,
          reach * form.scale,
          bite,
        );
        // Held back a breath, so the qi visibly gathers before the cut leaves. `push` stores the
        // scale on an effect that has no other use for `index`.
        blade.age = -WindUpSeconds;
        blade.index = Math.round(form.scale * 100);
        if (circling) blade.curve = 1.9;
        // The gather itself, at the shoulder, on the way the cut is going.
        this.push('剑', 'gather', this.bodyX, this.bodyY, 0, 0, way, WindUpSeconds, 46, 0);
      }
      return form.beat;
    }

    if (school === '雷') {
      let mark = battlefield.closest(this.bodyX, this.bodyY, reach);
      if (!mark) return;
      const hops = this.evolved('雷') ? 8 : spec.bite + Math.floor(level / 2);
      const path = [{ x: this.bodyX, y: this.bodyY }];
      for (let i = 0; i < hops && mark; i++) {
        path.push({ x: mark.x, y: mark.y });
        battlefield.cull(mark.x, mark.y, Touch, 1);
        mark = battlefield.closest(mark.x, mark.y, reach * 0.55);
      }
      const bolt = this.push('雷', 'chain', this.bodyX, this.bodyY, 0, 0, 0, LIFE.chain, reach, 0);
      bolt.path = path;
      // Skip the first node: that one is the pet, and nothing was struck there.
      for (let i = 1; i < path.length; i++) {
        this.spark(path[i].x, path[i].y, 8, '雷', 250);
      }
      return;
    }

    if (school === '火') {
      // 焚天炉 burns under the pet and goes where it goes; otherwise it is dropped on something.
      const at = this.evolved('火')
        ? { x: this.bodyX, y: this.bodyY }
        : (battlefield.closest(this.bodyX, this.bodyY, reach * 5) ?? {
            x: this.bodyX,
            y: this.bodyY,
          });
      this.push('火', 'zone', at.x, at.y, 0, 0, 0, LIFE.zone, reach, spec.bite + level);
      // 三灾劫: the three disasters land together. Lightning into the pool, then a ring of frost
      // out of it — one event with three colours in it, which is what a 三合 should look like.
      if (this.triad('三灾劫')) {
        this.surgeTriad('三灾劫', ['雷', '火', '冰']);
        const bolt = this.push('雷', 'chain', at.x, at.y - 300, 0, 0, 0, 0.3, 300, 0);
        bolt.path = [
          { x: at.x, y: at.y - 300 },
          { x: at.x, y: at.y },
        ];
        battlefield.cull(at.x, at.y, 60, 2);
        this.push('冰', 'burst', at.x, at.y, 0, 0, 0, 0.5, reach * 1.5, 0);
        battlefield.cull(at.x, at.y, reach * 1.5, 2);
        this.spark(at.x, at.y, 10, '冰', 260);
      }
      return;
    }

    if (school === '冰') {
      // The field itself is reported through `fields()`; this is the bite that comes with it.
      const bit = battlefield.cull(this.bodyX, this.bodyY, reach, spec.bite + Math.floor(level / 2));
      if (bit > 0) {
        // Only when it actually caught something. A field that flashes on a timer teaches nothing;
        // one that flashes when it bites is telling you what it just did.
        this.push('冰', 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.42, reach, 0);
        this.spark(this.bodyX, this.bodyY, 10, '冰', 210);
      }
      return;
    }

    if (school === '风') {
      // Blades are persistent, so this only tops them up to the number the level allows. The level
      // buys **blades** here rather than radius — see `grow` on the spec for why.
      // 玄霜壁 doubles them, because a wall needs enough of them to read as a wall.
      const wall = this.triad('玄霜壁');
      const want = (this.evolved('风') ? 3 : 1) * (1 + Math.floor((level - 1) * 0.75)) * (wall ? 2 : 1);
      const have = this.live.filter((e) => e.school === '风' && e.kind === 'orbit').length;
      for (let i = have; i < want; i++) {
        const blade = this.push(
          '风',
          'orbit',
          this.bodyX,
          this.bodyY,
          0,
          0,
          (i / want) * Math.PI * 2,
          0,
          reach,
          1,
        );
        blade.index = i;
      }
      return;
    }

    if (school === '土') {
      this.throwStone(level);
      return;
    }

    if (school === '毒') {
      const moved = Math.hypot(this.bodyX - this.lastDropX, this.bodyY - this.lastDropY);
      // Only where you have actually been. A trail that pools while you stand still is a field,
      // and 冰魄 is already the field.
      if (moved < 14) return;
      this.lastDropX = this.bodyX;
      this.lastDropY = this.bodyY;
      const wide = this.paired('毒', '风') ? reach * 1.7 : reach;
      const burning = this.paired('毒', '火');
      const puff = this.push(
        '毒',
        burning ? 'trail-fire' : 'trail',
        this.bodyX,
        this.bodyY,
        0,
        0,
        Math.random() * Math.PI * 2,
        LIFE.trail,
        wide,
        burning ? 2 : 1,
      );
      // 风毒 drifts; 万毒蛊 follows.
      if (this.paired('毒', '风')) this.surge('毒', '风');
      this.surgeTriad('业火鬼', ['毒', '火', '影']);
      if (this.paired('毒', '风')) {
        puff.vx = (Math.random() - 0.5) * 34;
        puff.vy = (Math.random() - 0.5) * 34;
      }
      return;
    }

    if (school === '影') {
      // floor(level/3) gave one ward at 一重 and two from 三重 up — so 四重 and 五重 bought nothing
      // at all, which the level sweep caught as a flat line rather than an inverted one.
      const want = this.evolved('影') ? 3 : 1 + Math.floor((level - 1) / 2);
      const have = this.live.filter((e) => e.school === '影' && e.kind === 'ward').length;
      for (let i = have; i < want; i++) this.spawnWard(i);
      return;
    }
  }

  private spawnWard(index: number): void {
    const ward = this.push(
      '影',
      'ward',
      this.bodyX + Math.cos(index * 2.1) * 40,
      this.bodyY + Math.sin(index * 2.1) * 40,
      0,
      0,
      0,
      0,
      span('影', this.levelOf('影')),
      1,
    );
    ward.index = index;
  }

  /** The nearest thing that is not already in `seen`. Keeps two talismans off one target. */
  private pickAway(
    battlefield: Battlefield,
    seen: { x: number; y: number }[],
    within: number,
  ): { x: number; y: number } | null {
    const all = battlefield.targets();
    let best: { x: number; y: number } | null = null;
    let closest = within;
    for (const t of all) {
      if (seen.some((s) => Math.hypot(s.x - t.x, s.y - t.y) < 1)) continue;
      const away = Math.hypot(t.x - this.bodyX, t.y - this.bodyY);
      if (away <= closest) {
        closest = away;
        best = t;
      }
    }
    return best;
  }

  /**
   * The moment a school evolves.
   *
   * Taking the card used to be silent: the build changed and nothing on the screen said so, so the
   * rarest thing in the mode arrived without an announcement. Three rings and a crown of sparks,
   * all in gold, all centred on the pet — whatever else is going on, this is the thing that
   * happened.
   */
  /**
   * The moment a pairing completes.
   *
   * Quieter than an evolution — one ring in each school's own colour rather than three in gold —
   * because a pairing is the ordinary good outcome of a draft and an evolution is the jackpot. But
   * it is not *nothing*, which is what it was: the card said "与雷法合 · 雷符" while you were
   * choosing and then the screen never mentioned it again. You were left to notice that your
   * talismans had started forking.
   */
  heraldCombo(a: School, b: School): void {
    for (const [i, school] of [a, b].entries()) {
      const ring = this.push(school, 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.6, 118, 0);
      ring.age = -i * 0.12;
    }
    this.spark(this.bodyX, this.bodyY, 9, a, 200);
    this.spark(this.bodyX, this.bodyY, 9, b, 200);
  }

  /**
   * The moment a 三合 completes.
   *
   * Three rings in the three schools' own colours, and a crown of sparks from each. Louder than a
   * pairing's single ring and quieter than an evolution's gold, which is where it belongs: a 三合
   * costs three quarters of a build, and an evolution is still the rarer thing.
   */
  heraldTriad(of: [School, School, School]): void {
    for (const [i, school] of of.entries()) {
      const ring = this.push(school, 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.7 + i * 0.1, 120 + i * 55, 0);
      ring.age = -i * 0.11;
      this.spark(this.bodyX, this.bodyY, 10, school, 250);
    }
  }

  herald(school: School): void {
    const hue = ascend(PALETTE[school]);
    for (let i = 0; i < 3; i++) {
      const wave = this.push(school, 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.75 + i * 0.18, 150 + i * 60, 0);
      wave.age = -i * 0.1;
    }
    for (let i = 0; i < 26; i++) {
      if (this.sparks.length >= MaxSparks) break;
      const angle = (i / 26) * Math.PI * 2;
      const rush = 240 + Math.random() * 220;
      const life = 0.5 + Math.random() * 0.4;
      this.sparks.push({
        x: this.bodyX,
        y: this.bodyY,
        vx: Math.cos(angle) * rush,
        vy: Math.sin(angle) * rush,
        life,
        born: life,
        size: 1.6 + Math.random() * 1.8,
        hue: { core: '#ffffff', body: Crown, edge: hue.edge },
      });
    }
  }

  /**
   * Throws `count` sparks from a point.
   *
   * `aim` of null scatters them evenly; a heading sends them out in a cone, which is what a hit
   * wants — debris off a strike goes the way the strike was going.
   */
  private spark(
    x: number,
    y: number,
    count: number,
    school: Hued,
    speed: number,
    aim: number | null = null,
    cone = Math.PI * 2,
  ): void {
    const hue = this.hueOf(school);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= MaxSparks) return;
      const angle = aim === null ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * cone;
      const rush = speed * (0.45 + Math.random() * 0.9);
      const life = 0.22 + Math.random() * 0.3;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * rush,
        vy: Math.sin(angle) * rush,
        life,
        born: life,
        size: 1.1 + Math.random() * 1.5,
        hue,
      });
    }
  }

  private push(
    school: Hued,
    kind: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle: number,
    life: number,
    reach: number,
    bite: number,
  ): Effect {
    const effect: Effect = { school, kind, x, y, vx, vy, angle, age: 0, life, reach, bite, cool: 0 };
    this.live.push(effect);
    return effect;
  }

  /** Moves everything that is still alive, and lets the persistent things bite. */
  private step(dt: number, battlefield: Battlefield): void {
    const alive: Effect[] = [];
    for (const e of this.live) {
      e.age += dt;
      // A staggered ring starts with a negative age so it opens late. Nothing else should touch it
      // until its turn comes.
      if (e.age < 0) {
        alive.push(e);
        continue;
      }
      e.cool = Math.max(0, e.cool - dt);

      if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
        // 符剑 holds it in a circle for a third of a second before letting it go.
        if (e.kind === 'aimed-orbit' && e.age < 0.34) {
          const turn = e.age * 9;
          e.x = this.bodyX + Math.cos(e.angle + turn) * 46;
          e.y = this.bodyY + Math.sin(e.angle + turn) * 46;
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        }
        if (battlefield.cull(e.x, e.y, e.reach, 1) > 0) {
          // 雷符: where a talisman lands, one more jumps to whatever is nearest.
          if (this.paired('符', '雷')) {
            this.surge('符', '雷');
            const next = battlefield.closest(e.x, e.y, 150);
            if (next) {
              battlefield.cull(next.x, next.y, Touch, 1);
              const fork = this.push('符', 'chain', e.x, e.y, 0, 0, 0, 0.2, 150, 0);
              fork.path = [
                { x: e.x, y: e.y },
                { x: next.x, y: next.y },
              ];
            }
          }
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.26, 30, 0);
          this.spark(e.x, e.y, 7, '符', 190, Math.atan2(e.vy, e.vx), 2.1);
          continue;
        }
      } else if (e.kind === 'arc') {
        // 三才剑阵 bends the flight, so a volley sweeps round rather than out.
        if (e.curve) {
          const turn = e.curve * dt;
          const vx = e.vx * Math.cos(turn) - e.vy * Math.sin(turn);
          const vy = e.vx * Math.sin(turn) + e.vy * Math.cos(turn);
          e.vx = vx;
          e.vy = vy;
        }
        const flew = Math.hypot(e.vx, e.vy) * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.cool += flew;
        e.angle = Math.atan2(e.vy, e.vx);
        // Wide across its travel rather than a point: a crescent is a *cut*, and something that
        // only connected on its centre line would read as a thrown stick.
        if (e.bite > 0 && battlefield.cull(e.x, e.y, (ArcWidth / 2) * (1 + this.rung('剑') * 0.1), 1) > 0) {
          e.bite -= 1;
          this.spark(e.x, e.y, 5, '剑', 230, e.angle + Math.PI, 2.2);
          // 雷剑: every cut earths itself into whatever is nearest.
          if (this.paired('剑', '雷')) {
            const next = battlefield.closest(e.x, e.y, 160);
            if (next) {
              battlefield.cull(next.x, next.y, Touch, 1);
              const bolt = this.push('剑', 'chain', e.x, e.y, 0, 0, 0, 0.22, 160, 0);
              bolt.path = [
                { x: e.x, y: e.y },
                { x: next.x, y: next.y },
              ];
            }
          }
        }
        // 瘴风刃: it lays miasma along its whole path, so a cut becomes a line you cannot follow
        // it through.
        if (this.triad('瘴风刃') && Math.random() < dt * 22) {
          this.push('毒', 'trail', e.x, e.y, 0, 0, Math.random() * Math.PI * 2, 1.8, 40, 1);
        }
        // Spent when it has cut its fill or flown its distance, whichever comes first.
        if (e.bite <= 0 || e.cool >= e.reach) continue;
      } else if (e.kind === 'orbit') {
        // 罡风阵 turns its rings against each other, which is the whole reason it reads as three.
        const way = this.evolved('风') && (e.index ?? 0) % 2 === 1 ? -1 : 1;
        e.angle += OrbitRate * dt * way;
        // **Only an evolved 风刃 uses more than one ring.** This formula was written for 罡风阵's
        // three counter-turning rings and was running for ordinary levels too, so five 重 put its
        // three blades on orbits of 146, 178 and 210 — further out every level, while everything it
        // was meant to hit walked inward. That is why levelling it made it *worse*.
        const rings = this.evolved('风') ? 3 : 1;
        // 玄霜壁 takes the blades off their own orbit and pins them to the edge of the cold field,
        // so the two schools stop being two things happening near each other and become one wall.
        const ring = this.triad('玄霜壁')
          ? span('冰', this.levelOf('冰'))
          : e.reach * (1 + 0.22 * ((e.index ?? 0) % rings));
        e.x = this.bodyX + Math.cos(e.angle) * ring;
        e.y = this.bodyY + Math.sin(e.angle) * ring;
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 6, 1) > 0) {
          e.cool = 0.18;
          this.spark(e.x, e.y, 6, '风', 220, e.angle + Math.PI / 2 * way, 1.4);
        }
        // 风雪: the blades leave frost behind them, and the frost bites too.
        if (this.paired('风', '冰') && Math.random() < dt * 9) {
          this.surge('风', '冰');
          this.push('风', 'frost', e.x, e.y, 0, 0, 0, 0.7, 20, 1);
        }
      } else if (e.kind === 'zone' || e.kind === 'frost' || e.kind === 'trail' || e.kind === 'trail-fire') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // 万毒蛊: the cloud goes after them.
        if (e.school === '毒' && this.evolved('毒')) {
          const mark = battlefield.closest(e.x, e.y, 260);
          if (mark) {
            const away = Math.hypot(mark.x - e.x, mark.y - e.y) || 1;
            e.vx += ((mark.x - e.x) / away) * 90 * dt;
            e.vy += ((mark.y - e.y) / away) * 90 * dt;
          }
        }
        if (e.cool <= 0 && e.bite > 0) {
          const killed = battlefield.cull(e.x, e.y, e.reach, 1);
          if (killed > 0) {
            e.bite -= killed;
            e.cool = 0.3;
            this.spark(e.x, e.y, 5, e.school, 150);
            // 雷火: the ground fire reaches out for a neighbour every time it catches something.
            if (e.school === '火' && this.paired('火', '雷')) {
              this.surge('火', '雷');
              const next = battlefield.closest(e.x, e.y, 170);
              if (next) {
                battlefield.cull(next.x, next.y, Touch, 1);
                const arc = this.push('火', 'chain', e.x, e.y, 0, 0, 0, 0.2, 170, 0);
                arc.path = [
                  { x: e.x, y: e.y },
                  { x: next.x, y: next.y },
                ];
              }
            }
            // 冰火: anything that dies burning inside the cold field goes off.
            if (e.school === '火' && this.paired('火', '冰')) {
              const inside = Math.hypot(e.x - this.bodyX, e.y - this.bodyY) < span('冰', this.levelOf('冰'));
              if (inside) {
                this.surge('火', '冰');
                battlefield.cull(e.x, e.y, 72, 2);
                this.push('火', 'burst', e.x, e.y, 0, 0, 0, 0.36, 72, 0);
              }
            }
            // 焚瘴: a cloud that catches fire takes the rest of the cloud with it.
            if (e.kind === 'trail-fire') {
              this.surge('火', '毒');
              for (const other of this.live) {
                if (other.kind === 'trail-fire' && other !== e && other.cool <= 0) {
                  if (Math.hypot(other.x - e.x, other.y - e.y) < e.reach * 2.4) other.cool = 0.06;
                }
              }
            }
          }
        }
      } else if (e.kind === 'ward') {
        // 玄冥卫: they stop hunting and turn around the body instead.
        if (this.triad('玄冥卫')) {
          const spin = this.clock * 1.1 + ((e.index ?? 0) / 3) * Math.PI * 2;
          const ring = 92;
          e.x = this.bodyX + Math.cos(spin) * ring;
          e.y = this.bodyY + Math.sin(spin) * ring;
          e.angle = spin + Math.PI / 2;
          if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 10, 1) > 0) {
            e.cool = WardCool * 0.7;
            this.spark(e.x, e.y, 6, '冰', 210, e.angle, 1.8);
          }
          alive.push(e);
          continue;
        }
        const mark = battlefield.closest(e.x, e.y, 900);
        const goal = mark ?? { x: this.bodyX, y: this.bodyY };
        const away = Math.hypot(goal.x - e.x, goal.y - e.y) || 1;
        e.x += ((goal.x - e.x) / away) * WardSpeed * dt;
        e.y += ((goal.y - e.y) / away) * WardSpeed * dt;
        e.angle = Math.atan2(goal.y - e.y, goal.x - e.x);
        // 业火鬼: it burns as it travels, setting light to the ground behind it rather than only
        // to what it touches.
        if (this.triad('业火鬼') && Math.random() < dt * 9) {
          this.push('毒', 'trail-fire', e.x, e.y, 0, 0, Math.random() * Math.PI * 2, 1.5, 44, 1);
        }
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 8, 1) > 0) {
          e.cool = WardCool;
          this.spark(e.x, e.y, 6, '影', 200, e.angle, 1.8);
          // 影毒: everything it touches is left poisoned.
          if (this.paired('影', '毒')) {
            this.surge('影', '毒');
            this.push('影', 'trail', e.x, e.y, 0, 0, 0, 1.4, 34, 1);
          }
        }
        // 傀符: it throws talismans as well.
        if (this.paired('影', '符') && mark && e.cool <= 0 && Math.random() < dt * 1.2) {
          this.surge('影', '符');
          const to = Math.hypot(mark.x - e.x, mark.y - e.y) || 1;
          this.push(
            '符',
            'aimed',
            e.x,
            e.y,
            ((mark.x - e.x) / to) * AimedSpeed,
            ((mark.y - e.y) / to) * AimedSpeed,
            e.angle,
            LIFE.aimed,
            Touch,
            1,
          );
        }
      } else if (e.kind === 'arrow') {
        // 弓. It flies until it reaches something, and then the ways have their turn. The arrow
        // itself does **one** thing — it hits — and everything else about what that means belongs
        // to whatever is carried with it.
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (battlefield.cull(e.x, e.y, Touch, 1) > 0) {
          const aim = Math.atan2(e.vy, e.vx);
          this.land(e.x, e.y, battlefield, aim);
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.24, 26, 0);
          this.spark(e.x, e.y, 5, '符', 180, aim, 2.1);
          // 锐金 is why this is a count rather than a `continue`: without it the arrow is spent
          // on the first thing it reaches, and with it it keeps going.
          e.bite -= 1;
          if (e.bite <= 0) continue;
          e.cool = 0.05;
        }
      } else if (e.kind === 'slash') {
        // 刀气. It travels along the ground and cuts through what it passes — wide across its
        // travel rather than a point, because a slash is a *cut* and something that only connected
        // on its centre line would read as a thrown stick.
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.bite > 0 && battlefield.cull(e.x, e.y, SlashWidth / 2, 1) > 0) {
          e.bite -= 1;
          this.land(e.x, e.y, battlefield, e.angle);
          this.spark(e.x, e.y, 4, '刀', 210, e.angle + Math.PI, 2.2);
        }
      } else if (e.kind === 'guard') {
        // 罡气. It turns with the body rather than being thrown from it, so it is drawn from the
        // body's position every frame instead of integrating one of its own.
        const nodes = Math.max(1, this.live.filter((n) => n.kind === 'guard').length);
        const at = this.clock * GuardRate + ((e.index ?? 0) / nodes) * Math.PI * 2;
        e.angle = at;
        e.x = this.bodyX + Math.cos(at) * e.reach;
        e.y = this.bodyY + Math.sin(at) * e.reach;
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 8, 1) > 0) {
          e.cool = GuardCool;
          this.land(e.x, e.y, battlefield, at + Math.PI / 2);
          this.spark(e.x, e.y, 4, '盾', 180, at + Math.PI / 2, 1.5);
        }
      } else if (e.kind === 'charm') {
        // It bends toward what it is chasing rather than turning on the spot, so a target that
        // moves is still caught and one that moves *hard* can still make it miss.
        const mark = battlefield.closest(e.x, e.y, 700);
        if (mark) {
          const want = Math.atan2(mark.y - e.y, mark.x - e.x);
          let off = want - e.angle;
          while (off > Math.PI) off -= Math.PI * 2;
          while (off < -Math.PI) off += Math.PI * 2;
          const turn = Math.max(-CharmTurn * dt, Math.min(CharmTurn * dt, off));
          e.angle += turn;
          e.vx = Math.cos(e.angle) * CharmSpeed;
          e.vy = Math.sin(e.angle) * CharmSpeed;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch, 1) > 0) {
          this.land(e.x, e.y, battlefield, e.angle);
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.24, 26, 0);
          this.spark(e.x, e.y, 6, '符', 190, e.angle, 2.1);
          e.bite -= 1;
          if (e.bite <= 0) continue;
          e.cool = 0.08;
        }
      } else if (e.kind === 'sword') {
        // 飞剑. Two states and no flag for them: a positive `hits` means it is in the middle of a
        // flurry, and anything else means it is looking for the next thing to be in the middle of.
        if ((e.hits ?? 0) > 0) {
          e.cool -= dt;
          if (e.cool <= 0) {
            e.hits = (e.hits ?? 0) - 1;
            e.angle += 1.9;
            battlefield.cull(e.x, e.y, SwordBite, 1);
            this.land(e.x, e.y, battlefield, e.angle);
            this.spark(e.x, e.y, 3, '剑', 240, e.angle, 1.6);
            // `cool` is the beat between cuts while there are cuts left, and the rest after the
            // last one. One timer, two jobs, and which job it is doing is `hits`.
            //
            // The first version rested *unconditionally* at the end of every frame the sword was
            // not cutting — so the timer was re-armed to 0.3s a frame after it expired, the
            // "ready to cut" test was almost never true, and the sword chased things forever
            // without ever landing anything. The checks caught it at zero hits in six seconds.
            e.cool = (e.hits ?? 0) > 0 ? SwordBeat : SwordRest;
          }
        } else {
          e.cool = Math.max(0, e.cool - dt);
          const mark = battlefield.closest(e.x, e.y, 1200);
          const goal = mark ?? { x: this.bodyX, y: this.bodyY };
          const away = Math.hypot(goal.x - e.x, goal.y - e.y) || 1;
          e.x += ((goal.x - e.x) / away) * SwordSpeed * dt;
          e.y += ((goal.y - e.y) / away) * SwordSpeed * dt;
          e.angle = Math.atan2(goal.y - e.y, goal.x - e.x);
          // Close enough, rested, and there is something to cut: it stops and goes to work.
          if (mark && away <= SwordBite && e.cool <= 0) e.hits = SwordFlurry;
        }
      } else if (e.kind === 'stone') {
        // In flight it is inert — it does not cut what it passes. A stone thrown at the ground is
        // not a projectile, and making it one would quietly give 山崩 back the damage the whole
        // design trades away.
        if (e.age < e.life) {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        } else {
          const at = e.at ?? { x: e.x, y: e.y };
          this.push('土', 'quake-tell', at.x, at.y, 0, 0, 0, QuakeTell, e.reach, 0);
          this.spark(at.x, at.y, 6, '土', 140);
          continue;
        }
      } else if (e.kind === 'quake-tell') {
        // The warning itself does nothing. Its whole job is to be visible for half a second.
        if (e.age >= e.life) {
          this.erupt(e.x, e.y, e.reach, this.levelOf('土'));
          continue;
        }
      } else if (e.kind === 'pillar') {
        // One pillar, one moment: it strikes on the frame it comes up and is scenery after that.
        if (e.bite > 0) {
          battlefield.cull(e.x, e.y, e.reach, e.bite);
          battlefield.shove(e.x, e.y, e.reach * ShoveSpread, PillarShove);
          this.spark(e.x, e.y, 3, '土', 210, e.angle, 1.3);
          e.bite = 0;
        }
      } else if (e.kind === 'ward-glyph') {
        // 阵符: a standing ring. It bites what walks into it and then that post is spent.
        if (e.bite > 0 && battlefield.cull(e.x, e.y, e.reach, 1) > 0) e.bite -= 1;
      }

      const expired = e.life > 0 && e.age >= e.life;
      const spent = e.bite <= 0 && (e.kind === 'ward-glyph' || e.kind === 'zone');
      if (!expired && !spent) alive.push(e);
    }
    this.live = alive;
  }

  bounds(): { x: number; y: number; width: number; height: number } | null {
    if (
      this.live.length === 0 &&
      this.sparks.length === 0 &&
      this.surges.length === 0 &&
      this.shellLeft === 0 &&
      this.shellBurst === 0 &&
      // 冰魄 is a standing field and is drawn whether or not anything is live. 土 was in this list
      // for the same reason when it was a shell worn on the body; it draws nothing at rest now, so
      // holding it no longer costs a repaint of the whole blast radius every frame of a run.
      !this.has('冰')
    ) {
      return null;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const take = (x: number, y: number, r: number) => {
      left = Math.min(left, x - r);
      top = Math.min(top, y - r);
      right = Math.max(right, x + r);
      bottom = Math.max(bottom, y + r);
    };
    for (const e of this.live) {
      take(e.x, e.y, Math.max(e.reach, 40));
      if (e.path) for (const p of e.path) take(p.x, p.y, 30);
    }
    // Both ends of a spark's streak, not just the head, or the tail is left smeared on the desktop.
    for (const s of this.sparks) {
      take(s.x, s.y, s.size + 3);
      take(s.x - s.vx * SparkTail, s.y - s.vy * SparkTail, s.size + 3);
    }
    for (const surge of this.surges) take(surge.x, surge.y, surge.from + 190);
    if (this.has('冰')) take(this.bodyX, this.bodyY, span('冰', this.levelOf('冰')) + 16);
    if (this.shellLeft > 0) take(this.bodyX, this.bodyY, this.bodyR + 32);
    if (this.shellBurst > 0) take(this.bodyX, this.bodyY, ShellReach + 8);
    if (left === Infinity) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * Everything the pet is doing, drawn.
   *
   * Two passes. The first is `source-over` and draws only the things that need to be *dark* —
   * outlines and backing plates, which exist so an effect has an edge on a cream wallpaper as well
   * as a navy one. The second is `lighter`, and everything else lives in it: additive, so
   * overlapping light climbs toward white instead of averaging out.
   *
   * Every lit thing follows the same recipe — **bloom, body, core** — out of the school's three-stop
   * palette. The version before this used one pastel per school at some alpha, which is chalk: no
   * hot centre, so it read as a coloured shape rather than as light.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Structure first, while black still means something.
    for (const e of this.live) this.drawBacking(context, e);

    context.globalCompositeOperation = 'lighter';
    if (this.has('冰')) this.drawField(context);
    if (this.shellLeft > 0 || this.shellBurst > 0) this.drawShell(context);
    // 山崩's stones are not drawn here. They are solid things standing on the ground, so the mode
    // paints them in depth order with the 邪气 and the pet — see `collectStones` and `depth.ts`.
    for (const e of this.live) if (e.kind !== 'pillar') this.drawOne(context, e);
    this.drawSurges(context);
    this.drawSparks(context);

    context.restore();
  }

  private readonly paintStone: Painter = (context, index) => {
    const stone = this.live[index];
    // The queue is filled and drained inside one frame, so an index cannot go stale — but it
    // costs one comparison to be sure, and a wrong index here would paint a lightning bolt as a
    // boulder.
    if (stone && stone.kind === 'pillar') this.drawOne(context, stone);
  };

  /**
   * Queues 山崩's stones for depth sorting against everything else on the ground.
   *
   * Only the stones. Everything else this module draws is light rather than an object: a talisman
   * in flight is above the ground, not on it, and additive light that something else can cover
   * stops reading as light.
   */
  collectStones(depth: Depth): void {
    for (let i = 0; i < this.live.length; i++) {
      const e = this.live[i];
      if (e.kind === 'pillar' && e.age >= 0) depth.add(e.y, this.paintStone, i);
    }
  }

  /**
   * 金钟罩: one plate per layer, turning slowly around the body.
   *
   * Counting the plates is how you know how many hits are left, which is the only number this card
   * has — and it is a number you read by looking at the pet rather than at a corner of the screen.
   * Pale rather than coloured: it belongs to no school, and nine of those already own a hue each.
   */
  private drawShell(context: CanvasRenderingContext2D): void {
    const reach = this.bodyR + 26;
    context.save();
    context.translate(this.bodyX, this.bodyY);
    context.rotate(this.clock * 0.55);

    for (let i = 0; i < this.shellLeft; i++) {
      const at = (i / Math.max(1, this.shellLeft)) * Math.PI * 2;
      const span = Math.PI / Math.max(2.2, this.shellLeft * 1.15);
      context.globalAlpha = 0.5;
      context.strokeStyle = '#cfe3f2';
      context.lineWidth = 3.5;
      context.beginPath();
      context.arc(0, 0, reach, at - span, at + span);
      context.stroke();
      // A hotter inner line, so a plate is a plate and not a pencil arc.
      context.globalAlpha = 0.8;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.2;
      context.beginPath();
      context.arc(0, 0, reach - 2.5, at - span * 0.82, at + span * 0.82);
      context.stroke();
    }
    context.restore();

    // And the moment the last one goes: a ring thrown outward, the same shape the shove has.
    if (this.shellBurst > 0) {
      const out = ShellReach * (1.15 - this.shellBurst);
      context.globalAlpha = this.shellBurst * 0.55;
      context.strokeStyle = '#dff0ff';
      context.lineWidth = 1.5 + this.shellBurst * 4;
      context.beginPath();
      context.arc(this.bodyX, this.bodyY, Math.max(1, out), 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  /**
   * The rings the body throws when a pairing fires.
   *
   * One ring per school, staggered, each easing outward fast and thinning as it goes — plus a
   * short crown of spokes at the start, which is what makes the first frame read as a *shove*
   * rather than as something expanding gently. Drawn last so they sit over everything, because the
   * point of them is to say **this came from here**.
   */
  private drawSurges(context: CanvasRenderingContext2D): void {
    for (const surge of this.surges) {
      // Two frames of white over the body before anything expands. The rings alone read as a nice
      // ripple; the flash is what reads as a *hit*, and it is the cheapest frame in the file.
      const blink = 1 - Math.min(1, surge.age / 0.09);
      if (blink > 0) {
        const pop = context.createRadialGradient(
          surge.x,
          surge.y,
          0,
          surge.x,
          surge.y,
          surge.from * (1.1 + 0.9 * (1 - blink)),
        );
        pop.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        pop.addColorStop(0.55, surge.hues[0].core);
        pop.addColorStop(1, clear(surge.hues[0].edge));
        context.globalAlpha = blink * blink;
        context.fillStyle = pop;
        context.beginPath();
        context.arc(surge.x, surge.y, surge.from * (1.1 + 0.9 * (1 - blink)), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
      for (const [i, hue] of surge.hues.entries()) {
        const at = (surge.age - i * 0.06) / surge.life;
        if (at <= 0 || at >= 1) continue;
        // Fast out, slow at the end: a ring that expands linearly reads as a bubble.
        const eased = 1 - (1 - at) * (1 - at) * (1 - at);
        const r = surge.from + eased * (150 + i * 26);
        const fade = 1 - at;

        const ring = context.createRadialGradient(surge.x, surge.y, r * 0.72, surge.x, surge.y, r);
        ring.addColorStop(0, clear(hue.edge));
        ring.addColorStop(0.55, hue.body);
        ring.addColorStop(0.8, hue.core);
        ring.addColorStop(1, clear(hue.core));
        context.globalAlpha = fade * fade * 0.9;
        context.fillStyle = ring;
        context.beginPath();
        context.arc(surge.x, surge.y, r, 0, Math.PI * 2);
        context.fill();

        // The shove: spokes, only in the first third, shortening as the ring outruns them.
        if (at < 0.34) {
          const kick = 1 - at / 0.34;
          context.globalAlpha = kick * 0.85;
          context.strokeStyle = hue.core;
          context.lineWidth = 2.4 * kick + 0.6;
          const spokes = 10;
          for (let k = 0; k < spokes; k++) {
            const angle = (k / spokes) * Math.PI * 2 + i * 0.3;
            context.beginPath();
            const foot = surge.from + 2;
            context.moveTo(surge.x + Math.cos(angle) * foot, surge.y + Math.sin(angle) * foot);
            context.lineTo(
              surge.x + Math.cos(angle) * (foot + 34 * kick),
              surge.y + Math.sin(angle) * (foot + 34 * kick),
            );
            context.stroke();
          }
        }
      }
      context.globalAlpha = 1;
    }
  }

  /** The dark side of an effect: a silhouette under the light, so it has an edge anywhere. */
  private drawBacking(context: CanvasRenderingContext2D, e: Effect): void {
    context.globalAlpha = 0.5;
    context.fillStyle = 'rgba(14, 10, 26, 0.85)';
    if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(
        e.kind === 'aimed-orbit' && e.age < 0.34 ? e.angle + e.age * 9 : Math.atan2(e.vy, e.vx),
      );
      context.fillRect(-13, -8, 26, 16);
      context.restore();
      // 山崩's stones are drawn solid and have edges of their own, so they are not in this pass.
      // It exists to put a dark silhouette under *additive* effects, which have none.
    } else if (e.kind === 'orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      crescent(context, 26, 12);
      context.fill();
      context.restore();
    } else if (e.kind === 'ward') {
      context.beginPath();
      context.arc(e.x, e.y, 14, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'ward-glyph') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2 + Math.sin(this.clock * 2 + e.x) * 0.06);
      context.fillRect(-11, -15, 22, 30);
      context.restore();
    }
    context.globalAlpha = 1;
  }

  /**
   * A bloom: wide and faint, then narrower and brighter, then a hot point.
   *
   * Three gradients rather than one. One gradient gives a soft ball; three nested give something
   * with a centre, and the centre is what the eye reads as brightness.
   */
  private bloom(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    hue: Palette,
    alpha: number,
  ): void {
    if (radius <= 0 || alpha <= 0) return;
    const ring = (r: number, colour: string, a: number) => {
      const ramp = context.createRadialGradient(x, y, 0, x, y, r);
      ramp.addColorStop(0, colour);
      ramp.addColorStop(0.5, mix(colour, hue.edge, 0.45));
      ramp.addColorStop(1, clear(hue.edge));
      context.globalAlpha = a;
      context.fillStyle = ramp;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    };
    ring(radius, hue.edge, alpha * 0.34);
    ring(radius * 0.55, hue.body, alpha * 0.55);
    ring(radius * 0.24, hue.core, alpha * 0.9);
    context.globalAlpha = 1;
  }

  /**
   * 冰魄: a cold rim with crystals standing on it and frost drifting inside.
   *
   * Almost nothing in the middle, still — a wide translucent fill is the background with the
   * contrast taken out, whatever the blend mode. What additive buys here is that the rim, the
   * crystals and the frost all brighten where they cross.
   */
  private drawField(context: CanvasRenderingContext2D): void {
    const r = span('冰', this.levelOf('冰'));
    const hue = this.hueOf('冰');
    const deep = this.evolved('冰');
    context.save();
    context.translate(this.bodyX, this.bodyY);

    // No floor. Three versions have now tried to fill this area — at 19% in source-over, at 18%
    // additive — and every one came out as a wash of haze over the desktop, because what a wide
    // faint fill mostly contributes is alpha. The rim, the crystals and the frost carry it, and
    // they brighten where they cross, which is the whole reason for drawing additively.
    const lip = context.createRadialGradient(0, 0, r * 0.82, 0, 0, r * 1.1);
    lip.addColorStop(0, clear(hue.edge));
    lip.addColorStop(0.55, hue.edge);
    lip.addColorStop(1, clear(hue.edge));
    context.globalAlpha = deep ? 0.55 : 0.36;
    context.fillStyle = lip;
    context.beginPath();
    context.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = 0.5;
    context.strokeStyle = hue.body;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.95;
    context.strokeStyle = hue.core;
    context.lineWidth = 1.8;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.stroke();

    const spin = this.clock * 0.35;
    // Crystals are the countable thing on this school, so they are what the level is spent on.
    const points = (deep ? 10 : 5) + this.rung('冰') * 2;
    for (let i = 0; i < points; i++) {
      const angle = spin + (i / points) * Math.PI * 2;
      const tall = 10 + 5 * Math.sin(this.clock * 2 + i);
      context.save();
      context.rotate(angle);
      context.translate(r, 0);
      context.globalAlpha = 0.85;
      context.fillStyle = hue.body;
      context.beginPath();
      context.moveTo(tall, 0);
      context.lineTo(-2, 4.6);
      context.lineTo(-6, 0);
      context.lineTo(-2, -4.6);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.beginPath();
      context.moveTo(tall * 0.64, 0);
      context.lineTo(-1, 1.7);
      context.lineTo(-1, -1.7);
      context.closePath();
      context.fill();
      context.restore();
    }

    // 玄冰狱: pillars standing inside the ring, tall and gold-edged. The school stops being a
    // line on the floor and becomes somewhere you have been shut into — which is what it does,
    // since nothing inside it can really move any more.
    if (deep) {
      for (let i = 0; i < 9; i++) {
        const angle = (i / 9) * Math.PI * 2 - this.clock * 0.18;
        const out = r * (0.32 + 0.42 * ((i * 0.37) % 1));
        const tall = 26 + 12 * Math.sin(this.clock * 1.6 + i * 2.1);
        const px = Math.cos(angle) * out;
        const py = Math.sin(angle) * out;
        context.globalAlpha = 0.5;
        context.fillStyle = hue.edge;
        context.beginPath();
        context.moveTo(px - 7, py + 5);
        context.lineTo(px, py - tall);
        context.lineTo(px + 7, py + 5);
        context.closePath();
        context.fill();
        context.globalAlpha = 0.95;
        context.fillStyle = hue.core;
        context.beginPath();
        context.moveTo(px - 2.4, py + 3);
        context.lineTo(px, py - tall * 0.86);
        context.lineTo(px + 2.4, py + 3);
        context.closePath();
        context.fill();
        context.globalAlpha = 0.55;
        context.strokeStyle = Crown;
        context.lineWidth = 1.3;
        context.beginPath();
        context.moveTo(px - 7, py + 5);
        context.lineTo(px, py - tall);
        context.lineTo(px + 7, py + 5);
        context.stroke();
      }
      this.mark(context, 0, 0, 13, 0.8);
    }

    context.globalAlpha = 0.7;
    context.strokeStyle = hue.core;
    context.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const drift = this.clock * 0.6 + i * 2.4;
      const at = (i * 0.618) % 1;
      const rr = r * (0.2 + 0.72 * at);
      const px = Math.cos(drift) * rr;
      const py = Math.sin(drift * 1.13) * rr;
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px - Math.sin(drift) * 6, py + Math.cos(drift) * 6);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  private drawSparks(context: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const fade = Math.max(0, s.life / s.born);
      // Two strokes: a fat soft one in the body colour and a thin hot one over it. One stroke is a
      // scratch; two is an ember.
      context.globalAlpha = 0.5 * fade;
      context.strokeStyle = s.hue.body;
      context.lineWidth = s.size * 3.2 * (0.4 + 0.6 * fade);
      context.beginPath();
      context.moveTo(s.x - s.vx * SparkTail, s.y - s.vy * SparkTail);
      context.lineTo(s.x, s.y);
      context.stroke();
      context.globalAlpha = fade * fade;
      context.strokeStyle = s.hue.core;
      context.lineWidth = s.size * 1.2 * (0.4 + 0.6 * fade);
      context.beginPath();
      context.moveTo(s.x - s.vx * SparkTail * 0.7, s.y - s.vy * SparkTail * 0.7);
      context.lineTo(s.x, s.y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  private drawOne(context: CanvasRenderingContext2D, e: Effect): void {
    if (e.age < 0) return;
    const hue = this.hueOf(e.school);
    const risen = this.evolved(e.school);
    const fade = e.life > 0 ? Math.max(0, 1 - e.age / e.life) : 1;
    const grown = e.life > 0 ? Math.min(1, e.age / Math.max(0.0001, e.life * 0.25)) : 1;

    if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
      const heading = Math.atan2(e.vy, e.vx);
      const held = e.kind === 'aimed-orbit' && e.age < 0.34;
      const rung = this.rung(e.school);
      // A ribbon of afterimages, brightening toward the head, then the talisman itself with a lit
      // face and a mark on it. The ribbon lengthens with the level: a thing that visibly *drags
      // more of itself along* is the cheapest possible reading of "this got stronger".
      const ghosts = 3 + rung;
      for (let ghost = ghosts; ghost >= 0; ghost--) {
        const back = ghost * 0.016;
        const gx = e.x - e.vx * back;
        const gy = e.y - e.vy * back;
        const heat = 1 - ghost / (ghosts + 1);
        this.bloom(context, gx, gy, (14 + 10 * heat) * (1 + rung * 0.07), hue, 0.3 * heat + 0.12);
      }
      context.save();
      context.translate(e.x, e.y);
      context.rotate(held ? e.angle + e.age * 9 : heading);
      // The plate itself grows, and gains a line of script for every level. Three marks at one
      // 重 and seven at five is something you can count without meaning to.
      const wide = 11 * (1 + rung * 0.1);
      const tall = 6.5 * (1 + rung * 0.1);
      context.globalAlpha = 0.85;
      const face = context.createLinearGradient(-wide, 0, wide, 0);
      face.addColorStop(0, hue.edge);
      face.addColorStop(0.55, hue.body);
      face.addColorStop(1, hue.core);
      context.fillStyle = face;
      context.fillRect(-wide, -tall, wide * 2, tall * 2);
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.fillRect(-wide, -tall, wide * 2, tall * 0.22);
      context.fillRect(-wide, tall * 0.78, wide * 2, tall * 0.22);
      context.fillStyle = '#ff5a4a';
      const marks = 3 + rung;
      for (let i = 0; i < marks; i++) {
        const at = -wide * 0.62 + (i / Math.max(1, marks - 1)) * wide * 1.24;
        const high = tall * (i % 2 === 0 ? 0.72 : 0.56);
        context.fillRect(at - 1, -high, 2, high * 2);
      }
      context.restore();
      // 万符朝元 trails a gold streamer and carries the mark, so a wall of them reads as one
      // thing happening rather than as the ordinary school running faster.
      if (risen) {
        context.globalAlpha = 0.5;
        context.strokeStyle = Crown;
        context.lineWidth = 3.5;
        context.beginPath();
        context.moveTo(e.x - e.vx * 0.075, e.y - e.vy * 0.075);
        context.lineTo(e.x, e.y);
        context.stroke();
        context.globalAlpha = 1;
        this.mark(context, e.x, e.y, 9);
      }
      return;
    }

    if (e.kind === 'pop' || e.kind === 'burst') {
      const swell = e.age / Math.max(0.01, e.life);
      const r = e.reach * (0.25 + 0.95 * swell);
      this.bloom(context, e.x, e.y, r * 0.8, hue, 0.7 * fade);
      // A ring with the ramp across its thickness, so the shockwave has a hot inside edge.
      const ring = context.createRadialGradient(e.x, e.y, r * 0.7, e.x, e.y, r * 1.15);
      ring.addColorStop(0, clear(hue.edge));
      ring.addColorStop(0.5, hue.core);
      ring.addColorStop(1, clear(hue.edge));
      context.globalAlpha = fade * fade;
      context.fillStyle = ring;
      context.beginPath();
      context.arc(e.x, e.y, r * 1.15, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'snare') {
      // 缠木: roots closing over the spot, drawn as a few arcs tightening rather than as a ring.
      // A ring would read as a radius you must stay out of, and this is a thing that has already
      // happened to whatever is inside it.
      const shut = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
      const grip = e.reach * (1 - shut * 0.45);
      context.globalAlpha = 0.5 * (1 - shut * shut);
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const at = e.angle + (i / 4) * Math.PI * 2;
        context.beginPath();
        context.arc(e.x, e.y, grip, at, at + 0.9 + shut * 0.6);
        context.stroke();
      }
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'slash') {
      // 刀气: a crescent lying along its travel, thinning as it spends itself. Drawn from the
      // heading rather than rotated into place, so a fan of them opens outward correctly.
      const run = Math.min(1, e.age / Math.max(0.001, e.life));
      const thin = 1 - run * 0.55;
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = 0.85 * (1 - run * run);
      const edge = context.createLinearGradient(-SlashWidth * 0.5, 0, SlashWidth * 0.5, 0);
      edge.addColorStop(0, clear(hue.body));
      edge.addColorStop(0.5, hue.core);
      edge.addColorStop(1, clear(hue.body));
      context.strokeStyle = edge;
      context.lineWidth = 3.5 * thin;
      context.beginPath();
      // Bowed backward along the travel: a straight bar is a plank, a bow is a cut.
      context.moveTo(-10, -SlashWidth * 0.5 * thin);
      context.quadraticCurveTo(10, 0, -10, SlashWidth * 0.5 * thin);
      context.stroke();
      context.restore();
      this.bloom(context, e.x, e.y, 18 * thin, hue, 0.3 * (1 - run));
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'guard') {
      // 罡气: a mote on its orbit with a short arc of the orbit drawn behind it, so the ring is
      // legible as a ring even when only two of them are up.
      // A long wake rather than a short one, and a faint full circle under it. 盾 is the weapon
      // whose whole identity is being **always on**, and two small dots going round read as two
      // small dots — the ring has to be legible as a ring at a glance for the weapon to say what
      // it is.
      context.globalAlpha = 0.1;
      context.strokeStyle = hue.body;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(this.bodyX, this.bodyY, e.reach, 0, Math.PI * 2);
      context.stroke();
      const wake = context.createLinearGradient(
        this.bodyX + Math.cos(e.angle - 1.1) * e.reach,
        this.bodyY + Math.sin(e.angle - 1.1) * e.reach,
        e.x,
        e.y,
      );
      wake.addColorStop(0, clear(hue.body));
      wake.addColorStop(1, hue.core);
      context.globalAlpha = 0.75;
      context.strokeStyle = wake;
      context.lineWidth = 3.5;
      context.beginPath();
      context.arc(this.bodyX, this.bodyY, e.reach, e.angle - 1.1, e.angle);
      context.stroke();
      this.bloom(context, e.x, e.y, 19, hue, 0.6);
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.beginPath();
      context.arc(e.x, e.y, 5.5, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'charm') {
      // The charm itself, turned to face where it is going, with a short wake. It is slow enough
      // that the shape is actually seen, which is why this one is drawn and the arrow is a streak.
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = 0.4;
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-22, 0);
      context.lineTo(-7, 0);
      context.stroke();
      context.globalAlpha = 0.9;
      context.fillStyle = hue.body;
      context.fillRect(-7, -5, 14, 10);
      context.fillStyle = hue.core;
      context.fillRect(-7, -5, 14, 2);
      context.fillRect(-7, 3, 14, 2);
      context.restore();
      this.bloom(context, e.x, e.y, 16, hue, 0.4);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'sword') {
      // 飞剑: a blade pointing the way it is going, and a flurry drawn as the cuts themselves
      // rather than as the sword moving — at four cuts in half a second, a sword that travelled
      // between them would be a blur with no cuts in it.
      const cutting = (e.hits ?? 0) > 0;
      if (cutting) {
        context.globalAlpha = 0.75;
        context.strokeStyle = hue.core;
        context.lineWidth = 2.5;
        for (let i = 0; i < 2; i++) {
          const at = e.angle - i * 1.1;
          context.beginPath();
          context.moveTo(e.x - Math.cos(at) * SwordBite, e.y - Math.sin(at) * SwordBite);
          context.lineTo(e.x + Math.cos(at) * SwordBite, e.y + Math.sin(at) * SwordBite);
          context.stroke();
        }
      }
      this.bloom(context, e.x, e.y, cutting ? 26 : 16, hue, cutting ? 0.6 : 0.35);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.beginPath();
      context.moveTo(17, 0);
      context.lineTo(-2, -3.5);
      context.lineTo(-11, 0);
      context.lineTo(-2, 3.5);
      context.closePath();
      context.fill();
      context.restore();
      return;
    }

    if (e.kind === 'arrow') {
      // 弓. A streak along its own heading rather than a drawn arrow: at this speed the shape is
      // never seen, only the line it leaves, and a shaft with fletchings on it reads as a smear.
      const lit = Math.min(1, e.age * 14);
      const back = 26 + Math.min(16, e.age * 90);
      const tail = context.createLinearGradient(
        e.x - Math.cos(e.angle) * back,
        e.y - Math.sin(e.angle) * back,
        e.x,
        e.y,
      );
      tail.addColorStop(0, clear(hue.body));
      tail.addColorStop(1, hue.core);
      context.globalAlpha = lit;
      context.strokeStyle = tail;
      context.lineWidth = 2.6;
      context.beginPath();
      context.moveTo(e.x - Math.cos(e.angle) * back, e.y - Math.sin(e.angle) * back);
      context.lineTo(e.x, e.y);
      context.stroke();
      this.bloom(context, e.x, e.y, 13, hue, 0.5 * lit);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'stone') {
      // Arced, so it is thrown rather than slid. There is no gravity in a plane seen from above,
      // so the height is a drawing offset and the shadow stays on the ground underneath it — the
      // same trick the pet's own hop uses, and the only thing that says the stone is in the air.
      const flight = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
      const up = Math.sin(flight * Math.PI) * 44;
      const spin = e.angle + e.age * 11;
      // Its shadow, and then the rock itself, both **solid**. Everything else this module draws is
      // additive light, which is right for fire and lightning and wrong for a lump of earth: added
      // to the desktop it came out glowing, and the shadow added nothing at all because adding a
      // dark colour is the same as not drawing it.
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 0.3;
      context.fillStyle = '#140e06';
      context.beginPath();
      context.ellipse(e.x, e.y, 9 - up * 0.08, 4 - up * 0.04, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
      this.bloom(context, e.x, e.y - up, 20, hue, 0.22);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y - up);
      context.rotate(spin);
      context.fillStyle = hue.body;
      context.beginPath();
      // A lump, not a disc: five unequal corners read as rock at any size.
      context.moveTo(11, 0);
      context.lineTo(4, 9);
      context.lineTo(-8, 7);
      context.lineTo(-10, -4);
      context.lineTo(1, -10);
      context.closePath();
      context.fill();
      context.strokeStyle = hue.core;
      context.lineWidth = 1.4;
      context.stroke();
      context.restore();
      return;
    }

    if (e.kind === 'quake-tell') {
      // Half a second of ground that is about to open. It tightens rather than swells: something
      // closing in on a point reads as a countdown, something spreading reads as an effect that
      // has already happened.
      const due = e.life > 0 ? Math.min(1, e.age / e.life) : 1;
      // Exactly the footprint the pillars will fill, held still for the whole half second. It was
      // drawn starting a quarter wider and tightening onto this, which made the countdown read
      // better and **lied about where the blast reached** — a warning you can trust the edge of is
      // the only reason to draw one. The cracks are the countdown instead.
      const ring = e.reach;
      context.globalAlpha = 0.25 + due * 0.5;
      context.strokeStyle = hue.core;
      context.lineWidth = 1 + due * 2;
      context.setLineDash([9, 7]);
      context.lineDashOffset = -e.age * 26;
      context.beginPath();
      context.arc(e.x, e.y, ring, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      // Cracks reaching out from the middle, lengthening as the moment comes.
      context.lineWidth = 1 + due * 1.6;
      for (let i = 0; i < 6; i++) {
        const angle = e.angle + (i / 6) * Math.PI * 2 + i * 0.21;
        const out = ring * (0.2 + 0.78 * due);
        context.beginPath();
        context.moveTo(e.x + Math.cos(angle) * 6, e.y + Math.sin(angle) * 6);
        context.lineTo(e.x + Math.cos(angle) * out, e.y + Math.sin(angle) * out);
        context.stroke();
      }
      context.globalAlpha = 1;
      this.bloom(context, e.x, e.y, e.reach * 0.5 * due, hue, 0.28 * due);
      return;
    }

    if (e.kind === 'pillar') {
      // A stone shoved up out of the ground, drawn for a tilted overhead view.
      //
      // Built from `Facets` vertical slabs side by side, each with its **own height**, so the top
      // is a ragged ridge rather than a lid. That is the whole difference between this and a post:
      // the shape before it was two straight sides and a flat cap, which is the definition of a
      // sawn stake, and no amount of colour was going to argue otherwise.
      //
      // `angle` is not a heading here — it is the stone's identity, and every irregularity below
      // is hashed from it so a given stone looks the same for every frame it is standing.
      const t = e.life > 0 ? e.age / e.life : 1;
      const stand = heaved(t);
      if (stand <= 0.001) return;
      const seed = e.angle;
      // Some squat, some tall. One set of proportions for all of them is the other half of why a
      // ring of these read as something stamped rather than something broken.
      const half = e.reach * HalfWidth * (0.82 + grain(seed, 0) * 0.42);
      const tall = e.reach * Height * stand * (0.78 + grain(seed, 1) * 0.5);
      const squat = half * Tilt;
      // Pushed up crooked. Nothing comes out of broken ground plumb.
      const lean = (grain(seed, 2) - 0.5) * half * 1.1;
      const taper = 0.74 + grain(seed, 3) * 0.2;

      context.save();
      context.globalCompositeOperation = 'source-over';
      // The ground it came through, thrown open around the foot. Solid: this block otherwise runs
      // inside the module's additive pass, where a near-black fill is the same as not drawing.
      context.globalAlpha = 0.6 * Math.min(1, stand * 2.2);
      context.fillStyle = '#140e06';
      context.beginPath();
      context.ellipse(e.x, e.y, half * 1.6, squat * 1.6, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      // Explicitly additive. A stone is painted from the depth pass now, not from inside the
      // module's own `lighter` block, so it can no longer assume the composite it inherits — and
      // a glow drawn source-over is a beige disc sitting on the ground.
      context.save();
      context.globalCompositeOperation = 'lighter';
      this.bloom(context, e.x, e.y - tall * 0.5, e.reach * 0.7 * stand, hue, 0.1);
      context.restore();

      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y);
      context.globalAlpha = 1;

      // Worked out once and kept, because the faces and the strata over them have to agree about
      // exactly where the edges are — a seam drawn a pixel off is worse than no seam.
      const slabs: { foot: number; head: number; crest: number }[] = [];
      for (let k = 0; k <= Facets; k++) {
        const foot = -half + (2 * half * k) / Facets;
        slabs.push({
          foot,
          head: foot * taper + lean,
          // Each slab stops at its own height, which is what makes the ridge ragged.
          crest: -tall * (0.74 + grain(seed, k + 4) * 0.26),
        });
      }

      for (let k = 0; k < Facets; k++) {
        const a = slabs[k];
        const b = slabs[k + 1];
        // Lit from the upper left. A flat shade per slab rather than a gradient across the whole
        // stone: facets are what a rock has instead of a round side, and shading them separately
        // is the only thing that says so — **plus a step of its own per facet**, because a smooth
        // ramp across five of them is exactly how a cylinder is shaded.
        const ramp = k / Math.max(1, Facets - 1);
        const face = Math.max(0, Math.min(1, ramp + (grain(seed, 130 + k) - 0.5) * 0.34));
        context.fillStyle =
          face < 0.5
            ? mix(mix(hue.core, hue.body, 0.4), hue.body, face * 2)
            : mix(hue.body, hue.edge, (face - 0.5) * 1.5);
        context.beginPath();
        context.moveTo(a.foot, 0);
        context.lineTo(a.head, a.crest);
        context.lineTo(b.head, b.crest);
        context.lineTo(b.foot, 0);
        context.closePath();
        context.fill();

        // The sliver of top surface a tilted view sees over each slab. Without it the stone is a
        // cut-out; with it, it has thickness.
        context.fillStyle = mix(hue.core, hue.body, 0.18 + face * 0.4);
        context.beginPath();
        context.moveTo(a.head, a.crest);
        context.lineTo(a.head + squat * 0.35, a.crest - squat);
        context.lineTo(b.head + squat * 0.35, b.crest - squat);
        context.lineTo(b.head, b.crest);
        context.closePath();
        context.fill();
      }

      // 山壁. Vertical jointing — the stone is a bundle of upright prisms, not a layered one.
      //
      // This is what stops a stone reading as a cylinder. Shading five facets says there are
      // facets only if something marks them; on a blank face the eye reads the shading as a round
      // side lit from one edge, which is exactly what it did.
      //
      // It was bands running *across* the face first. Those are bedding — sedimentary, soft, and
      // at the size this is actually seen at they read as wood grain. What says 山石 is the
      // up-and-down split: a hard groove at every seam, so each facet is its own column of rock
      // standing against the next one.
      //
      // Everything here follows `taper` and `lean`, so the joints converge the way the stone does
      // rather than running parallel up a shape that is narrowing.
      //
      // Clipped to the stone's own silhouette, so nothing has to be fitted to the ragged top by
      // hand.
      context.save();
      context.beginPath();
      context.moveTo(slabs[0].foot, 0);
      for (const slab of slabs) context.lineTo(slab.head, slab.crest);
      context.lineTo(slabs[Facets].foot, 0);
      context.closePath();
      context.clip();

      context.lineCap = 'butt';

      // The seams between the facets, cut hard. A dark groove with a thin lit edge beside it on
      // the sunward side: one line alone is a scratch, and it is the pair that reads as an arris
      // with light catching along it.
      for (let k = 1; k < Facets; k++) {
        const slab = slabs[k];
        context.globalAlpha = 0.34;
        context.strokeStyle = mix(hue.edge, '#180d03', 0.45);
        context.lineWidth = 1.3;
        context.beginPath();
        context.moveTo(slab.foot, 0);
        context.lineTo(slab.head, slab.crest);
        context.stroke();

        context.globalAlpha = 0.3;
        context.strokeStyle = mix(hue.core, hue.body, 0.25);
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(slab.foot - 1.8, 0);
        context.lineTo(slab.head - 1.8, slab.crest);
        context.stroke();
      }

      // Splits that do not reach the top: short, angular, kinked once. Rock breaks in facets, and
      // a kinked line is the cheapest way to say a face changed plane halfway up.
      for (let g = 0; g < Splits; g++) {
        const foot = -half + 2 * half * grain(seed, 70 + g);
        const head = foot * taper + lean;
        const reaches = 0.42 + grain(seed, 80 + g) * 0.5;
        const bend = 0.3 + grain(seed, 90 + g) * 0.34;
        const skew = (grain(seed, 100 + g) - 0.5) * half * 0.3;
        context.globalAlpha = 0.16 + grain(seed, 110 + g) * 0.16;
        context.strokeStyle = mix(hue.edge, '#180d03', 0.3);
        context.lineWidth = 0.9 + grain(seed, 120 + g) * 0.9;
        context.beginPath();
        context.moveTo(foot, 0);
        context.lineTo(foot + (head - foot) * bend + skew, -tall * bend);
        context.lineTo(foot + (head - foot) * reaches, -tall * reaches);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.restore();
      context.restore();
      return;
    }

    if (e.kind === 'gather') {
      // Qi drawn to the shoulder before the cut leaves: four lines closing onto one bright point,
      // on the heading the crescent is about to take. A tenth of a second, and it is the whole
      // difference between a sword that swings and a sword that is *about to*.
      const t = Math.min(1, e.age / Math.max(0.0001, e.life));
      const at = { x: e.x + Math.cos(e.angle) * 30, y: e.y + Math.sin(e.angle) * 30 };
      context.save();
      context.translate(at.x, at.y);
      context.rotate(e.angle);
      context.globalAlpha = 0.85 * t;
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const around = (i / 4) * Math.PI * 2 + this.clock * 3;
        const out = e.reach * (1 - t);
        context.beginPath();
        context.moveTo(Math.cos(around) * out, Math.sin(around) * out);
        context.lineTo(Math.cos(around) * out * 0.3, Math.sin(around) * out * 0.3);
        context.stroke();
      }
      this.bloom(context, 0, 0, 8 + 16 * t, hue, 0.5 + 0.5 * t);
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (e.kind === 'arc') {
      // A blade, not a saucer.
      //
      // The first pass made it as thick as it was long and drew the wake as three copies of itself
      // strung out behind — which came out as a stack of concentric discs rather than as something
      // travelling. So: long across the cut and thin along it, and the wake is one tapered band
      // that narrows to nothing behind, the way a thrown edge actually leaves the air.
      const rung = this.rung('剑');
      // 收势 is drawn bigger than the two cuts that set it up, which is most of what makes the
      // third beat land as the end of a phrase rather than as one more swing.
      const form = (e.index ?? 100) / 100;
      const half = (ArcWidth / 2) * (1 + rung * 0.1) * form;
      const bow = (11 + rung * 1.6) * form;
      const shape = (scale: number, lead: number) => {
        context.beginPath();
        context.moveTo(lead, -half * scale);
        context.quadraticCurveTo(lead + bow * scale, 0, lead, half * scale);
        context.quadraticCurveTo(lead - bow * 0.55 * scale, 0, lead, -half * scale);
        context.closePath();
      };

      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);

      // The wake: speed lines, not a shape.
      //
      // Version one strung three copies of the blade out behind it, which came out as a stack of
      // concentric discs. Version two joined the blade's two tips back to a point, which is a
      // **solid triangle** — it read as a paper dart, and five of them fanned out at once read as
      // one big fan. Lines are the answer and always were: they say "this is moving" without
      // occupying any area, so five of them overlapping is still five things.
      // Three, short, and very nearly parallel. Five long ones converging on a point behind the
      // blade drew the spokes of a fan — and five blades doing that at once was a peacock.
      const drag = 38 + rung * 5;
      context.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        const at = i * half * 0.6;
        const len = drag * (1 - Math.abs(i) * 0.3);
        const streak = context.createLinearGradient(0, 0, -len, 0);
        streak.addColorStop(0, hue.core);
        streak.addColorStop(0.35, hue.body);
        streak.addColorStop(1, clear(hue.edge));
        context.globalAlpha = 0.7 - Math.abs(i) * 0.2;
        context.strokeStyle = streak;
        context.lineWidth = 3 - Math.abs(i) * 0.9;
        context.beginPath();
        context.moveTo(-2, at);
        context.lineTo(-len, at * 0.88);
        context.stroke();
      }
      context.globalAlpha = 1;

      this.bloom(context, bow * 0.4, 0, 24 + rung * 3, hue, 0.45);

      // The blade: deep at the back, white along the leading edge.
      const face = context.createLinearGradient(-bow * 0.6, 0, bow, 0);
      face.addColorStop(0, clear(hue.edge));
      face.addColorStop(0.4, hue.edge);
      face.addColorStop(0.8, hue.body);
      face.addColorStop(1, hue.core);
      context.globalAlpha = 0.95;
      context.fillStyle = face;
      shape(1, 0);
      context.fill();

      context.globalAlpha = 1;
      context.strokeStyle = hue.core;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(0, -half * 0.95);
      context.quadraticCurveTo(bow, 0, 0, half * 0.95);
      context.stroke();

      if (this.evolved('剑')) this.mark(context, bow * 0.4, 0, 7, 0.9);
      if (this.paired('剑', '雷')) {
        const spark = seeded(Math.round(e.x + e.y));
        context.globalAlpha = 0.9;
        context.strokeStyle = PALETTE['雷'].core;
        context.lineWidth = 1.4;
        context.beginPath();
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const along = -half * 0.9 + t * half * 1.8;
          const out = bow * Math.sin(t * Math.PI) + (spark() - 0.5) * 6;
          if (i === 0) context.moveTo(out, along);
          else context.lineTo(out, along);
        }
        context.stroke();
      }
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (e.kind === 'chain') {
      const path = e.path;
      if (!path || path.length < 2) return;
      const jitter = seeded(Math.round(e.x * 7 + e.y * 13));
      const points: { x: number; y: number }[] = [];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        if (i === 1) points.push(a);
        const steps = 6;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const wobble = step === steps ? 0 : (jitter() - 0.5) * 30 * Math.sin(t * Math.PI);
          points.push({
            x: a.x + (b.x - a.x) * t + (nx / len) * wobble,
            y: a.y + (b.y - a.y) * t + (ny / len) * wobble,
          });
        }
      }
      const trace = () => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
      };
      // Four passes, wide and deep to thin and white. Flicker, because lightning that holds still
      // for a quarter second is a neon sign.
      const flare = 0.62 + 0.38 * Math.abs(Math.sin(e.age * 95));
      // The trunk thickens with the level. A bolt is one of the few things where "more of it" and
      // "heavier" are the same reading.
      const heft = 1 + this.rung(e.school) * 0.22;
      const passes: [string, number, number][] = [
        [hue.edge, 20 * heft, 0.3],
        [hue.edge, 11 * heft, 0.55],
        [hue.body, 5 * heft, 0.85],
        [hue.core, 1.7 * heft, 1],
      ];
      for (const [colour, width, alpha] of passes) {
        context.globalAlpha = fade * alpha * flare;
        context.strokeStyle = colour;
        context.lineWidth = width;
        trace();
        context.stroke();
      }
      // Dead-end forks, off the joints, so it branches like the real thing.
      context.globalAlpha = fade * 0.7 * flare;
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      // Forks every third joint at one 重, every joint at five.
      const forkEvery = Math.max(1, 4 - this.rung(e.school));
      for (let i = 2; i < points.length - 1; i += forkEvery) {
        const from = points[i];
        const angle = Math.atan2(points[i + 1].y - from.y, points[i + 1].x - from.x);
        const off = angle + (jitter() - 0.5) * 2.4;
        const reach = 14 + jitter() * 26;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(from.x + Math.cos(off) * reach, from.y + Math.sin(off) * reach);
        context.stroke();
      }
      for (let i = 1; i < path.length; i++) {
        this.bloom(context, path[i].x, path[i].y, 34 * fade + 10, hue, 0.9 * fade);
      }
      // 九天神雷 falls from above onto the first thing it strikes. A column is the one shape
      // that says "this came from somewhere else" rather than "the pet threw it".
      if (risen && path.length > 1) {
        const head = path[1];
        const shaft = context.createLinearGradient(head.x, head.y - 420, head.x, head.y);
        shaft.addColorStop(0, clear(hue.edge));
        shaft.addColorStop(0.7, hue.body);
        shaft.addColorStop(1, hue.core);
        context.globalAlpha = fade * flare * 0.8;
        context.fillStyle = shaft;
        context.beginPath();
        context.moveTo(head.x - 26 * fade, head.y - 420);
        context.lineTo(head.x + 26 * fade, head.y - 420);
        context.lineTo(head.x + 9 * fade, head.y);
        context.lineTo(head.x - 9 * fade, head.y);
        context.closePath();
        context.fill();
        context.globalAlpha = 1;
        this.mark(context, head.x, head.y, 16 * fade + 4);
      }
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'zone') {
      // One wavering body — three sine waves of different periods beating against each other — in
      // three nested sizes, deep outside and white in the middle. Nested is what gives it heat;
      // one filled shape at one colour is a puddle.
      const r = e.reach * (0.6 + 0.4 * grown);
      const t = this.clock;
      // Through the midpoints as quadratics rather than straight between the samples. A polygon
      // of twenty-odd sides is obviously a polygon at ninety pixels across, and fire has no
      // corners in it.
      // The number of tongues in the silhouette is the lowest sine's frequency, so raising it with
      // the level makes the fire visibly busier without making the pool any bigger.
      const licks = 3 + this.rung(e.school);
      const body = (scale: number, phase: number) => {
        const steps = 22 + this.rung(e.school) * 4;
        const at = (i: number) => {
          const angle = ((i % steps) / steps) * Math.PI * 2;
          const reach =
            r *
            scale *
            (0.74 +
              0.13 * Math.sin(angle * licks + t * 4.2 + phase) +
              0.09 * Math.sin(angle * (licks + 2) - t * 6.1) +
              0.06 * Math.sin(angle * (licks + 5) + t * 9.3));
          return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
        };
        context.beginPath();
        let previous = at(0);
        let middle = { x: (previous.x + at(1).x) / 2, y: (previous.y + at(1).y) / 2 };
        context.moveTo(middle.x, middle.y);
        for (let i = 1; i <= steps; i++) {
          const here = at(i);
          const next = at(i + 1);
          middle = { x: (here.x + next.x) / 2, y: (here.y + next.y) / 2 };
          context.quadraticCurveTo(here.x, here.y, middle.x, middle.y);
          previous = here;
        }
        context.closePath();
      };

      context.save();
      context.translate(e.x, e.y);
      this.bloom(context, 0, 0, r * 1.25, hue, 0.5 * fade);
      context.globalAlpha = 0.55 * fade;
      context.fillStyle = hue.edge;
      body(1, 0);
      context.fill();
      context.globalAlpha = 0.6 * fade;
      context.fillStyle = hue.body;
      body(0.68, 1.7);
      context.fill();
      context.globalAlpha = 0.75 * fade;
      context.fillStyle = hue.core;
      body(0.3 + 0.05 * Math.sin(t * 7), 3.4);
      context.fill();
      context.globalAlpha = 1;
      context.restore();

      // 焚天炉 travels with the body, so it is drawn as a furnace *around* it: a gold ring at
      // the rim with tongues climbing off it. Without this it is the ordinary pool that happens to
      // keep up, which is exactly how it read.
      if (risen) {
        context.save();
        context.translate(e.x, e.y);
        context.globalAlpha = 0.5 * fade;
        context.strokeStyle = Crown;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(0, 0, r * 0.92, 0, Math.PI * 2);
        context.stroke();
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2 - this.clock * 1.4;
          const tall = r * (0.26 + 0.16 * Math.abs(Math.sin(this.clock * 6 + i * 1.9)));
          context.globalAlpha = 0.75 * fade;
          context.strokeStyle = i % 2 === 0 ? Crown : hue.core;
          context.lineWidth = 4;
          context.beginPath();
          context.moveTo(Math.cos(angle) * r * 0.92, Math.sin(angle) * r * 0.92);
          context.lineTo(Math.cos(angle) * (r * 0.92 + tall), Math.sin(angle) * (r * 0.92 + tall));
          context.stroke();
        }
        context.globalAlpha = 1;
        context.restore();
        this.mark(context, e.x, e.y, 11);
      }

      if (Math.random() < 0.34) {
        const angle = Math.random() * Math.PI * 2;
        this.spark(e.x + Math.cos(angle) * r * 0.6, e.y + Math.sin(angle) * r * 0.6, 1, '火', 85, -Math.PI / 2, 1.4);
      }
      return;
    }

    if (e.kind === 'trail' || e.kind === 'trail-fire' || e.kind === 'frost') {
      // Very faint per puff: fifteen of these overlap along the path, and additive stacking is
      // exactly what turns fifteen faint ones into a glowing bank instead of a flat tube.
      const hot = e.kind === 'trail-fire';
      const r = e.reach * (0.5 + 0.5 * grown);
      context.save();
      context.translate(e.x, e.y);
      context.globalAlpha = (hot ? 0.24 : 0.13) * fade;
      context.fillStyle = hue.edge;
      const lobes = 3 + this.rung(e.school);
      for (let i = 0; i < lobes; i++) {
        const angle = e.angle + (i / lobes) * Math.PI * 2 + this.clock * (hot ? 1.6 : 0.4);
        const lobe = r * (0.5 + 0.22 * Math.sin(this.clock * 1.6 + i * 2.1 + e.x * 0.03));
        context.beginPath();
        context.arc(Math.cos(angle) * r * 0.34, Math.sin(angle) * r * 0.34, lobe, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = (hot ? 0.9 : 0.6) * fade;
      context.fillStyle = hue.core;
      for (let i = 0; i < 2; i++) {
        const angle = e.angle * 1.7 + i * 3.1 + this.clock * 0.8;
        context.beginPath();
        context.arc(Math.cos(angle) * r * 0.55, Math.sin(angle) * r * 0.55, 2.1, 0, Math.PI * 2);
        context.fill();
      }
      // 万毒蛊 hunts, so it is drawn reaching: feelers along the way it is travelling. A cloud
      // that chases you and a cloud that sits there looked identical, which is the whole complaint.
      if (risen) {
        const heading = Math.atan2(e.vy, e.vx);
        context.globalAlpha = 0.7 * fade;
        context.strokeStyle = Crown;
        context.lineWidth = 1.7;
        for (const side of [-0.5, 0, 0.5]) {
          const reach = r * (1.1 + 0.3 * Math.sin(this.clock * 4 + side * 3));
          context.beginPath();
          context.moveTo(0, 0);
          context.quadraticCurveTo(
            Math.cos(heading + side * 1.5) * reach * 0.6,
            Math.sin(heading + side * 1.5) * reach * 0.6,
            Math.cos(heading + side) * reach,
            Math.sin(heading + side) * reach,
          );
          context.stroke();
        }
        context.globalAlpha = 1;
        this.mark(context, 0, 0, 7, 0.9);
      }
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (e.kind === 'orbit') {
      // The trail is a real ribbon: an arc of its own path, ramped from gone to hot along its
      // length, with the blade at the bright end.
      context.save();
      context.translate(this.bodyX, this.bodyY);
      const ring = Math.hypot(e.x - this.bodyX, e.y - this.bodyY) || e.reach;
      for (let i = 0; i < 5; i++) {
        const span = 1.1 * (1 - i / 5);
        context.globalAlpha = 0.16 + 0.12 * i;
        context.strokeStyle = i < 2 ? hue.edge : i < 4 ? hue.body : hue.core;
        context.lineWidth = 9 - i * 1.5;
        context.beginPath();
        context.arc(0, 0, ring, e.angle - span, e.angle);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.restore();

      // 罡风阵: the ring each blade rides is drawn, faintly and in gold. Three counter-turning
      // rings were already in the physics and were completely invisible — all you saw was more
      // blades.
      if (risen) {
        context.save();
        context.translate(this.bodyX, this.bodyY);
        context.globalAlpha = 0.22;
        context.strokeStyle = Crown;
        context.lineWidth = 1.6;
        context.beginPath();
        context.arc(0, 0, Math.hypot(e.x - this.bodyX, e.y - this.bodyY) || e.reach, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 1;
        context.restore();
      }

      this.bloom(context, e.x, e.y, 20, hue, 0.55);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      const blade = context.createLinearGradient(0, -24, 9, 24);
      blade.addColorStop(0, hue.core);
      blade.addColorStop(0.5, hue.body);
      blade.addColorStop(1, hue.edge);
      context.globalAlpha = 0.95;
      context.fillStyle = blade;
      crescent(context, 24, 10);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = hue.core;
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(0, -22);
      context.quadraticCurveTo(9, 0, 0, 22);
      context.stroke();
      context.restore();
      if (risen) this.mark(context, e.x, e.y, 8, 0.85);
      return;
    }

    if (e.kind === 'ward') {
      const heading = e.angle;
      const speed = Math.hypot(e.vx, e.vy);
      for (let ghost = 3; ghost >= 0; ghost--) {
        const back = ghost * 0.045;
        const gx = e.x - Math.cos(heading) * speed * back;
        const gy = e.y - Math.sin(heading) * speed * back;
        const heat = 1 - ghost / 4;
        this.bloom(context, gx, gy, 12 + 12 * heat, hue, 0.22 * heat + 0.12);
      }
      context.globalAlpha = 0.95;
      const fat = 11.5 * (1 + this.rung('影') * 0.13);
      const skin = context.createRadialGradient(e.x - 3, e.y - 4, 1, e.x, e.y, fat + 0.5);
      skin.addColorStop(0, hue.core);
      skin.addColorStop(0.6, hue.body);
      skin.addColorStop(1, hue.edge);
      context.fillStyle = skin;
      context.beginPath();
      context.arc(e.x, e.y, fat, 0, Math.PI * 2);
      context.fill();
      // 影卫三重: each wears a gold halo, and they are tied to one another, so three of them read
      // as a formation rather than as three copies of the same thing wandering about.
      if (risen) {
        context.globalAlpha = 0.85;
        context.strokeStyle = Crown;
        context.lineWidth = 1.8;
        context.beginPath();
        context.arc(e.x, e.y, 15 + Math.sin(this.clock * 3 + (e.index ?? 0)) * 1.6, 0, Math.PI * 2);
        context.stroke();
        context.globalAlpha = 0.3;
        context.lineWidth = 1.4;
        for (const other of this.live) {
          if (other.kind !== 'ward' || other === e) continue;
          if ((other.index ?? 0) <= (e.index ?? 0)) continue;
          context.beginPath();
          context.moveTo(e.x, e.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
        context.globalAlpha = 1;
      }
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'ward-glyph') {
      this.bloom(context, e.x, e.y, 22, hue, (e.bite > 0 ? 0.6 : 0.2));
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2 + Math.sin(this.clock * 2 + e.x) * 0.06);
      const face = context.createLinearGradient(-9, 0, 9, 0);
      face.addColorStop(0, hue.edge);
      face.addColorStop(0.55, hue.body);
      face.addColorStop(1, hue.core);
      context.globalAlpha = fade * 0.9;
      context.fillStyle = face;
      context.fillRect(-9, -13, 18, 26);
      context.globalAlpha = fade;
      context.fillStyle = hue.core;
      context.fillRect(-9, -13, 18, 1.3);
      context.fillRect(-9, 11.7, 18, 1.3);
      context.fillStyle = '#ff5a4a';
      context.fillRect(-4.5, -8, 2.4, 16);
      context.fillRect(0.6, -6, 2, 12);
      context.globalAlpha = 1;
      context.restore();
    }
  }
}

/** A crescent, pointing along +y. Used for both kinds of blade. */
function crescent(context: CanvasRenderingContext2D, long: number, wide: number): void {
  context.beginPath();
  context.moveTo(0, -long);
  context.quadraticCurveTo(wide, 0, 0, long);
  context.quadraticCurveTo(wide * 0.3, 0, 0, -long);
  context.closePath();
}

/**
 * A repeatable pseudo-random stream from one integer.
 *
 * So a bolt's wobble is the same on every frame it is drawn. Seeding it off the effect's own
 * position rather than off `Math.random` is the difference between lightning and television static
 * — the same lesson the breakthrough's cracks needed.
 */
function seeded(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}



