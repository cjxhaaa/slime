/**
 * 兵器与五行, running.
 *
 * One list of live effects, one weapon's clock, and three ways that settle wherever a swing lands.
 * A weapon decides **delivery** — what goes out, how often, how it finds something; a way decides
 * **what happens on contact**, and never attacks on its own.
 *
 * That split is why this is affordable. Five weapons by ten ways is fifty pairings, and fifty
 * bespoke implementations would be more content than the nine schools this replaced, which took
 * months. Written as delivery × modifier it is five plus ten, and the fifty are what comes out
 * the other side.
 *
 * ## What it does not own
 *
 * It never touches the 邪气 list. It asks a `Battlefield` what is nearby and tells it what to do:
 * kill, throw, hold, set alight, give back. The trial owns the fight; this owns what the pet is
 * doing about it.
 *
 * `absorb` is the one thing asked of it rather than fired by it — 金钟罩 and 固土 have to act
 * *between* a contact and the damage it would do, and everything else in here acts on its own
 * timer.
 */
import { clear, mix } from '../slime/colour.js';
import type { Depth, Painter } from './depth.js';
/**
 * What an effect can be coloured by: a weapon, or one of the five phases.
 *
 * A weapon or a phase carries one colour rather than a palette of three; `hueOf` derives the core
 * and the rim from it, so there is one number to keep in step rather than three.
 */
export type Hued = Weapon | Element;

import {
  ARMS,
  MaxDepth,
  PATHS,
  Crown,
  FIVE,
  type Element,
  type Palette,
  type Way,
  type Weapon,
  span as weaponSpan,
  swing,
} from './kit.js';

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
export const SlashSpeed = 540;
const SlashSeconds = 0.44;
export const SlashWidth = 46;
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
/**
 * 金钟罩: seconds a broken shell takes to come back, and how hard it throws when it goes.
 *
 * Nine seconds is deliberately long. A shell that re-forms quickly is a licence to stand in the
 * crowd, and this mode is built on not being able to do that — what it buys is the mistake you
 * get to survive, not a place to stand.
 *
 * The break throws but does **not** kill. Damage is the weapon's job; this card's
 * whole offer is staying alive, and giving it a kill as well would make it the first pick every
 * time rather than a trade.
 */
const ShellBack = 9;
const ShellShove = 620;
const ShellReach = 150;
/** How close a thing has to be to count as touched by a persistent effect. */
const Touch = 22;
/**
 * How far from a 罡气 node something is still cut.
 *
 * Exported because the 演武场 depends on it: the posts stand on an arc whose distance has to put
 * them inside the orbit plus this, or 盾 is the one weapon the bench cannot measure at all.
 */
export const GuardBite = Touch + 8;

/**
 * 共鸣 — the pet answering, on its own body, when a pairing fires.
 *
 * Every combination's effect happens **somewhere else**: 雷符 forks where the talisman landed,
 * 冰火 goes off inside the cold field, 焚瘴 lights a trail thirty pixels behind you. All correct,
 * and all of it reads as *the world doing something* rather than as **you** doing it, because the
 * one thing on screen that never reacted was the pet.
 *
 * So a card taken now also throws a ring off the body, in that card's own colour.
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
  /** Everything the current build holds, refreshed whenever the arsenal changes. */
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
  }

  /**
   * How far up a school is, as 0 through 4.
   *
   * Every density below is driven off this and nothing else, so "a level looks like something"
   * lives in one expression rather than in nine scattered `levelOf` calls that can drift apart.
   */
  /**
   * The colours this school is drawn in right now.
   *
   * One call rather than nine `evolved ? ... : ...` at every draw site. The evolved ramp is hotter
   * and pulled toward gold, which is the colour none of the nine owns — so it reads as "above the
   * nine" instead of "the fire one".
   */
  private hueOf(key: Hued): Palette {
    const arm = (ARMS as Partial<Record<Hued, { tint: string }>>)[key];
    const tint = arm?.tint ?? (FIVE as Partial<Record<Hued, { tint: string }>>)[key]?.tint;
    // A weapon or a phase carries one colour rather than three, so the body and the rim are
    // derived from it instead of being three more numbers to keep in step.
    const lit = tint ?? '#ffffff';
    return { core: mix(lit, '#ffffff', 0.55), body: lit, edge: mix(lit, '#1a1208', 0.5) };
  }

  get busy(): boolean {
    return (
      // A weapon counts: 盾's ring and 剑's flying sword are effects that never expire, but a
      // bow between shots has nothing live and is still very much fighting.
      this.live.length > 0 || this.sparks.length > 0 || this.surges.length > 0 || this.arm !== null
    );
  }

  /** The slowing regions, for the trial to apply to its own units. */
  fields(): Field[] {
    const out: Field[] = [];
    // 寒水's patches. Live effects rather than a second list, so they expire with their own
    // drawing and nothing has to remember to clean them up.
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
   * The ground opens: bands of pillars from the middle outward.
   *
   * Each band is pushed with a **negative age** so it is inert until its turn comes — the same
   * trick the staggered rings elsewhere use, and the reason this is one thing travelling rather
   * than several going off together.
   *
   * Damage is deliberately almost nothing — one. What a pillar is for is
   * `shove`, and it throws over a wider circle than it kills in, so the rim of an eruption clears
   * ground without clearing the field.
   */
  private erupt(x: number, y: number, reach: number, level: number): void {
    const bands = 2 + Math.floor(level / 2);
    const bite = 1;
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
  }

  /**
   * 兵器与五行, when one is equipped.
   *
   * Nothing in here means the pet does not attack, which is its state between entering 历练 and
   * taking the first card. Deliberately not a flag: a flag can be set with no weapon behind it,
   * and then the pet stands there doing nothing while every check still passes.
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

  /** True once a weapon has been drafted. An unarmed pet does not attack. */
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
    this.spark(this.bodyX, this.bodyY, 16, '水', 320);
    return true;
  }

  private arena: Battlefield | null = null;
  private bodyX = 0;
  private bodyY = 0;
  private bodyR = 44;
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

    // One weapon, one clock. Clamped to one swing a frame: a cadence shorter than a frame would
    // otherwise fire a burst proportional to how badly the machine is struggling, which is
    // backwards.
    if (this.arm) {
      this.swingLeft -= dt;
      if (this.swingLeft <= 0) {
        this.swingLeft = swing(this.arm.weapon, this.arm.depth);
        this.strike(battlefield);
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
  herald(key: Hued): void {
    const hue = this.hueOf(key);
    for (let i = 0; i < 3; i++) {
      const wave = this.push(key, 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.75 + i * 0.18, 150 + i * 60, 0);
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

      if (e.kind === 'frost') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.cool <= 0 && e.bite > 0) {
          const killed = battlefield.cull(e.x, e.y, e.reach, 1);
          if (killed > 0) {
            e.bite -= killed;
            e.cool = 0.3;
            this.spark(e.x, e.y, 5, e.school, 150);
            // 焚瘴: a cloud that catches fire takes the rest of the cloud with it.
          }
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
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, GuardBite, 1) > 0) {
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
      } else if (e.kind === 'pillar') {
        // One pillar, one moment: it strikes on the frame it comes up and is scenery after that.
        if (e.bite > 0) {
          battlefield.cull(e.x, e.y, e.reach, e.bite);
          battlefield.shove(e.x, e.y, e.reach * ShoveSpread, PillarShove);
          this.spark(e.x, e.y, 3, '土', 210, e.angle, 1.3);
          e.bite = 0;
        }
      }

      const expired = e.life > 0 && e.age >= e.life;
      // Nothing left alive is spent by biting; everything expires on its own clock.
      const spent = false;
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
      true
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

    context.globalCompositeOperation = 'lighter';
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
    const fade = e.life > 0 ? Math.max(0, 1 - e.age / e.life) : 1;
    const grown = e.life > 0 ? Math.min(1, e.age / Math.max(0.0001, e.life * 0.25)) : 1;


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
      const heft = 1;
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
      const forkEvery = 3;
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
      context.globalAlpha = 1;
      return;
    }


    if (e.kind === 'frost') {
      // Very faint per puff: fifteen of these overlap along the path, and additive stacking is
      // exactly what turns fifteen faint ones into a glowing bank instead of a flat tube.
      const hot = false;
      const r = e.reach * (0.5 + 0.5 * grown);
      context.save();
      context.translate(e.x, e.y);
      context.globalAlpha = (hot ? 0.24 : 0.13) * fade;
      context.fillStyle = hue.edge;
      const lobes = 4;
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
      context.globalAlpha = 1;
      context.restore();
      return;
    }



  }
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



