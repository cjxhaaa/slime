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
 * `absorb` is the one thing asked of it rather than fired by it — 固土's shell has to act
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
import { power } from './gear.js';

/** What the fight has to be able to answer. Implemented by `Trial`. */
export interface Battlefield {
  targets(): { x: number; y: number }[];
  /**
   * Hits up to `most` within `radius` of a point, nearest first, for `damage` each. Returns how
   * many were hit.
   */
  cull(x: number, y: number, radius: number, most: number, damage?: number): number;
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
   * Which equipped weapon put this here, or undefined for anything a 五行 spawned.
   *
   * Only 盾 reads it, and it is the whole reason it exists. 罡气 is not thrown — the swing clock
   * **tops up a ring** by counting the nodes already out there, so two shields in the six slots
   * would each see the other's nodes, believe the ring was full, and between them put out one
   * ring instead of two. Tagging the node with the slot it came from is what keeps two shields
   * two shields.
   */
  owner?: number;
  /**
   * How hard each of this weapon's hits lands: `power` of the grade it was struck at. Absent on
   * anything a 五行 spawned, which hits for one.
   */
  power?: number;
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

/**
 * The rules that turn a grade into a number, named so the codex in Settings can quote them. The
 * codex reads these and the constants in `CodexNumbers` rather than keeping its own copy, so what it
 * tells a player is whatever the fight actually does.
 */
/** 刀: 刀气 in one swing. */
export function slashBlades(depth: number): number {
  return 2 + Math.floor(depth / 2);
}
/** 盾: 罡气 in the ring. */
export function guardNodes(depth: number): number {
  return 2 + Math.floor((depth - 1) * 0.75);
}
/** 剑: flying swords out at once. */
export function flyingSwords(depth: number): number {
  return 1 + (depth >= 3 ? 1 : 0) + (depth >= 5 ? 1 : 0);
}
/** A way's reach or duration at a depth, as a multiple of its first. */
export function wayScale(depth: number): number {
  return 1 + (depth - 1) * 0.18;
}
/** 爆火: how many one burst can take. */
export function burstMost(depth: number): number {
  return 1 + Math.floor(depth / 2);
}
/** 崩土: rings of stone, the centre one included. */
export function quakeBands(depth: number): number {
  return 2 + Math.floor(depth / 2);
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
/**
 * 荣木: the most it can give back a second, per depth, and the most that can be banked.
 *
 * Per hit alone, the healing grew with the level: higher up everything takes more hits to kill,
 * so a build carrying 木荣 healed more the harder the level was — measured, a level-99 clear that
 * absorbed seventy-two damage on a body of thirteen, and levels 80 and 99 easier than 60. Capped
 * by time instead, it is a steady trickle whatever the level asks of the weapons.
 */
const LeechPerSecond = 0.06;
/** 荣木's leaves: how long one takes to fly home, how many can be in the air, the glow on landing. */
const LeafSeconds = 0.5;
const MaxLeaves = 14;
const MendSeconds = 0.45;
const LeechBank = 1;
/** 寒水: how wide the patch is and how long it lasts. */
const ChillReach = 74;
const ChillSeconds = 2.6;
/** 寒水: the pace a 邪气 keeps while it wades through one, as a fraction of its own. */
const ChillFactor = 0.62;
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
/** The arc swept at the body when the 刀 swings, in radians, and how long it shows. */
const SwingArc = 2.1;
const SwingSeconds = 0.17;
/**
 * 刀气's own colours: 血饮狂刀, a blade that drinks blood. Pale rose on the leading edge, crimson
 * through the body, near-black clotted red at the back and in the ink round it.
 */
const DaoCore = '#ffd0c8';
const DaoBody = '#d8142a';
const DaoRim = '#7c0614';
const DaoInk = '#2a0308';
/** The blood a 刀气 throws where it cuts: how long the splash lasts and how big it is. */
const GoreSeconds = 0.32;
const GoreReach = 9;

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
 * The four other weapons' own colours, for the parts of them that are **paint** rather than light.
 *
 * Their tints in `kit` are pale on purpose — they are glow colours, and a glow added to a navy
 * wallpaper wants to be pale. Painted solid on a cream one the same pale is not there, which is
 * why 刀 got a palette of its own and why these do too: a deeper stop off each weapon's hue for the
 * body, a darker one for the rim, and the tint left to do the light.
 */
/** 弓: jade, off its celadon tint. */
const GongCore = '#f2ffe2';
const GongBody = '#6cc23e';
const GongRim = '#2c6a1a';
/** 剑: 剑光, white-hot along the edge and cyan behind it. */
const JianCore = '#f4feff';
const JianBody = '#48cdf5';
const JianRim = '#106a9c';
/** 符: the paper's gold, the gold gone brown at the edges, and the cinnabar of the rune. */
const FuGold = '#ffd24a';
const FuDeep = '#a86a00';
const FuRed = '#d02a2a';
/** 盾: 罡气 as steel-blue, off its pale frost tint. */
const DunCore = '#f4f9ff';
const DunBody = '#7cb2e6';
const DunRim = '#2d5c8f';
/** The same, as the palettes `bloom` takes, so a weapon's light and its paint are one colour. */
const GongHue: Palette = { core: GongCore, body: GongBody, edge: GongRim };
const JianHue: Palette = { core: JianCore, body: JianBody, edge: JianRim };
const FuHue: Palette = { core: '#fff6c8', body: FuGold, edge: FuDeep };

/** 弓 on release: the string's snap at the body, and how long it shows. */
const TwangSeconds = 0.14;
/** 弓 on a hit: the splinters it throws on through the wound, how long and how far. */
const ShatterSeconds = 0.26;
const ShatterReach = 26;
/**
 * 剑: one cut of the flurry, drawn where it lands. Its reach is the length of the stroke, a little
 * longer than the sword's own bite so the cut visibly goes *through* what it hit.
 */
const CutSeconds = 0.2;
const CutReach = SwordBite * 1.3;
/** 符 on a hit: the seal it stamps as it goes up, how long and how wide. */
const SealSeconds = 0.34;
const SealReach = 30;
/**
 * 符 in flight: the paper motes it sheds. How far apart they are dropped and how many are still
 * showing — together they have to stay inside the talisman's own reach, which is what `bounds`
 * repaints round it.
 */
const MoteGap = 8;
const Motes = 4;
/** 盾 on contact: the shockwave off the node, how long and how wide. */
const ClangSeconds = 0.22;
const ClangReach = 22;
/** 盾: how long a node stays lit after it bites, out of its `GuardCool`. */
const ClangFlash = 0.1;

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
/** The star a hit leaves: how long it shows and how big it is at a 浅绿 hit. */
const ImpactSeconds = 0.16;
const ImpactReach = 11;
/** Past this many things in the air, a hit goes without its star rather than adding to the pile. */
const MaxLive = 320;
/** The ink every weapon's projectile is edged in — the same dark line the creatures wear. */
const Ink = '#1d1428';
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
    this.plateWay = 0;
    this.leechRoom = LeechBank;
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
      this.live.length > 0 || this.sparks.length > 0 || this.surges.length > 0 || this.armed
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
        out.push({ x: e.x, y: e.y, radius: e.reach, factor: ChillFactor });
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
    const bands = quakeBands(level);
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
  private arms: { weapon: Weapon; depth: number }[] = [];
  private ways: { way: Way; depth: number }[] = [];
  /** One countdown per equipped weapon, parallel to `arms`. */
  private swingLeft: number[] = [];

  /**
   * Equips the weapons in hand and the ways carried with them.
   *
   * A list, because the six slots hold any mix: three 刀 and a 弓 is a legal build, and every one
   * of them swings on its own clock.
   *
   * ## Why the clocks are matched by weapon rather than reset
   *
   * A newly equipped weapon swings **at once** — not after one interval. 剑 and 盾 do not fire,
   * they *place* something that then works on its own, and 剑's interval is 1.9s deep. Waiting
   * that long meant picking up a flying sword and watching nothing happen for two seconds, which
   * is indistinguishable from the weapon being broken.
   *
   * But with a backpack that can be opened mid-fight, `equip` is now called every time you move
   * anything — and resetting every clock on every call would mean a build with a slow weapon in
   * it **never swings that weapon** as long as you keep fiddling. So a weapon that was already in
   * hand keeps its countdown, and only one that was not starts at zero.
   */
  equip(arms: { weapon: Weapon; depth: number }[], ways: { way: Way; depth: number }[]): void {
    const held = this.arms.map((a, i) => ({ weapon: a.weapon, left: this.swingLeft[i] ?? 0 }));
    this.swingLeft = arms.map((arm) => {
      const at = held.findIndex((h) => h.weapon === arm.weapon);
      if (at < 0) return 0;
      // Taken, so two of the same weapon cannot both inherit the one clock and fire in lockstep.
      return held.splice(at, 1)[0].left;
    });
    this.arms = arms;
    this.ways = ways;
    // 固土 is the one of the ten that is not an on-hit effect at all — it is armour, so it is
    // settled here rather than in `land`. One layer a depth.
    this.plateWay = this.depthOf('土固');
    this.reshell();
  }

  /** True once a weapon has been drafted. An unarmed pet does not attack. */
  get armed(): boolean {
    return this.arms.length > 0;
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
  private strike(battlefield: Battlefield, arm: { weapon: Weapon; depth: number }, owner: number): void {
    // Everything this strike puts out carries the weight of the grade it was struck at.
    this.forging = power(arm.depth);
    try {
      this.strikeAt(battlefield, arm, owner);
    } finally {
      this.forging = 1;
    }
  }

  /** The power stamped on effects pushed during a strike. One outside of one. */
  private forging = 1;

  private strikeAt(battlefield: Battlefield, arm: { weapon: Weapon; depth: number }, owner: number): void {
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
      // The string's snap, off the edge of the body the way the arrow went. Light enough to go
      // without when the field is full; the arrow is the thing that matters.
      if (this.live.length < MaxLive) {
        const aim = Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX);
        this.push(
          '弓',
          'twang',
          this.bodyX + Math.cos(aim) * this.bodyR * 0.85,
          this.bodyY + Math.sin(aim) * this.bodyR * 0.85,
          0,
          0,
          aim,
          TwangSeconds,
          this.bodyR * 0.6,
          0,
        );
      }
      return;
    }
    if (arm.weapon === '刀') {
      // A fan of 刀气 along the ground, aimed at whatever is nearest. Short-lived and wide: this is
      // the weapon that asks you to be facing the right way, which is the only thing it asks.
      const mark = battlefield.closest(this.bodyX, this.bodyY, reach * 2.4);
      const aim = mark
        ? Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX)
        : Math.random() * Math.PI * 2;
      const blades = slashBlades(arm.depth);
      this.push('刀', 'swing', this.bodyX, this.bodyY, 0, 0, aim, SwingSeconds, this.bodyR, 0);
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
      const want = guardNodes(arm.depth);
      // Its own ring only. See `owner` on `Effect`: counting every guard node on the field would
      // make a second 盾 believe the ring was already full and put out nothing.
      const have = this.live.filter((e) => e.kind === 'guard' && e.owner === owner).length;
      for (let i = have; i < want; i++) {
        const node = this.push('盾', 'guard', this.bodyX, this.bodyY, 0, 0, 0, 0, reach, 1);
        node.owner = owner;
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
      const want = flyingSwords(arm.depth);
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
  private land(x: number, y: number, battlefield: Battlefield, heading: number, power = 1): void {
    // The hit itself, before anything a 五行 does with it: a star of white with an ink edge, sized
    // by how hard it landed. Drawn solid rather than as light, so it reads on a white wallpaper too.
    if (this.live.length < MaxLive) {
      this.push('符', 'impact', x, y, 0, 0, heading + ((x * 0.37 + y * 0.11) % 0.8), ImpactSeconds, ImpactReach * (1 + Math.log(power) / Math.log(9)), 0);
    }
    for (const held of this.ways) {
      const path = PATHS[held.way];
      const depth = Math.max(1, Math.min(MaxDepth, held.depth));

      // Deepening widens or lengthens, and never only raises a number. The rule the schools were
      // built on, and the one that keeps a build readable without a stat screen.
      const more = wayScale(depth);

      if (path.on === 'burst') {
        // 爆火: a small circle of fire where it hit.
        const radius = BurstReach * more;
        battlefield.cull(x, y, radius, burstMost(depth));
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
        const gift = Math.min(LeechGift * depth, this.leechRoom);
        this.leechRoom -= gift;
        if (gift > 0) battlefield.mend(gift);
        this.spark(x, y, 3, '木', 120, -Math.PI / 2, 1.1);
        // And it is *seen* coming back: a leaf lifts off the wound and flies home to the body,
        // which glows green when it lands. Only when something was actually given — a leaf for a
        // heal the budget refused would be a lie.
        if (gift > 0) this.sendLeaf(x, y);
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
   * How many layers 固土 gives: one a depth.
   *
   * There used to be a second source, 金钟罩, a card of its own that summed into the same shell.
   * It went with the draft — the shop sells the fifteen and nothing else — and the shell it fed is
   * 固土's alone now.
   */
  private plateWay = 0;

  /** Hands the body however many layers it should have now. */
  private reshell(): void {
    const layers = this.plateWay;
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

  /** Which side the next leaf home bows out to, so a stream of them fans rather than stacks. */
  private leafSide = 1;

  /**
   * A leaf from a 荣木 hit, flying back to the body on a bowed path. Its start and the bend are
   * fixed when it leaves; the end is wherever the body is when it gets there.
   */
  private sendLeaf(x: number, y: number): void {
    if (this.live.filter((e) => e.kind === 'leaf').length >= MaxLeaves) return;
    this.leafSide = -this.leafSide;
    const dx = this.bodyX - x;
    const dy = this.bodyY - y;
    const away = Math.hypot(dx, dy) || 1;
    const bow = Math.min(90, away * 0.45) * this.leafSide;
    const leaf = this.push('木', 'leaf', x, y, 0, 0, Math.atan2(dy, dx), LeafSeconds, 8, 0);
    leaf.path = [
      { x, y },
      { x: (x + this.bodyX) / 2 - (dy / away) * bow, y: (y + this.bodyY) / 2 + (dx / away) * bow },
    ];
  }

  /** 荣木's budget: what it can still give back before the trickle refills it. See `LeechPerSecond`. */
  private leechRoom = LeechBank;
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
    this.leechRoom = Math.min(LeechBank, this.leechRoom + dt * LeechPerSecond * this.depthOf('木荣'));

    this.shellBurst = Math.max(0, this.shellBurst - dt * 2);
    if (this.shellLeft <= 0 && this.shellLayers > 0) {
      this.shellBack -= dt;
      if (this.shellBack <= 0) this.shellLeft = this.shellLayers;
    }

    // One clock per weapon. Clamped to one swing a frame each: a cadence shorter than a frame
    // would otherwise fire a burst proportional to how badly the machine is struggling, which is
    // backwards.
    for (let i = 0; i < this.arms.length; i++) {
      this.swingLeft[i] -= dt;
      if (this.swingLeft[i] <= 0) {
        this.swingLeft[i] = swing(this.arms[i].weapon, this.arms[i].depth);
        this.strike(battlefield, this.arms[i], i);
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
    if (this.forging > 1) effect.power = this.forging;
    this.live.push(effect);
    return effect;
  }

  /** Moves everything that is still alive, and lets the persistent things bite. */
  private step(dt: number, battlefield: Battlefield): void {
    const alive: Effect[] = [];
    let landed = 0;
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
        if (battlefield.cull(e.x, e.y, Touch, 1, e.power) > 0) {
          const aim = Math.atan2(e.vy, e.vx);
          this.land(e.x, e.y, battlefield, aim, e.power);
          this.push('弓', 'pop', e.x, e.y, 0, 0, 0, 0.24, 26, 0);
          this.spark(e.x, e.y, 5, '弓', 180, aim, 2.1);
          // Splinters thrown on through the wound, the way the arrow was going: what says *an
          // arrow went in here* rather than *something touched it*.
          if (this.live.length < MaxLive) {
            this.push('弓', 'shatter', e.x, e.y, 0, 0, aim, ShatterSeconds, ShatterReach, 0);
          }
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
        if (e.bite > 0 && battlefield.cull(e.x, e.y, SlashWidth / 2, 1, e.power) > 0) {
          e.bite -= 1;
          this.land(e.x, e.y, battlefield, e.angle, e.power);
          this.spark(e.x, e.y, 4, '刀', 210, e.angle + Math.PI, 2.2);
          // 血饮: it drinks — and what it cuts bleeds, on along the line of the cut.
          this.push('刀', 'gore', e.x, e.y, 0, 0, e.angle, GoreSeconds, GoreReach * Math.sqrt(e.power ?? 1), 0);
        }
      } else if (e.kind === 'guard') {
        // 罡气. It turns with the body rather than being thrown from it, so it is drawn from the
        // body's position every frame instead of integrating one of its own.
        const nodes = Math.max(1, this.live.filter((n) => n.kind === 'guard').length);
        const at = this.clock * GuardRate + ((e.index ?? 0) / nodes) * Math.PI * 2;
        e.angle = at;
        e.x = this.bodyX + Math.cos(at) * e.reach;
        e.y = this.bodyY + Math.sin(at) * e.reach;
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, GuardBite, 1, e.power) > 0) {
          e.cool = GuardCool;
          this.land(e.x, e.y, battlefield, at + Math.PI / 2, e.power);
          this.spark(e.x, e.y, 4, '盾', 180, at + Math.PI / 2, 1.5);
          // The shockwave off the node, left where it struck rather than carried round with it —
          // the node goes on turning, and the ring is what says *this is where it hit*.
          if (this.live.length < MaxLive) {
            this.push('盾', 'clang', e.x, e.y, 0, 0, at, ClangSeconds, ClangReach, 0);
          }
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
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch, 1, e.power) > 0) {
          this.land(e.x, e.y, battlefield, e.angle, e.power);
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.24, 26, 0);
          this.spark(e.x, e.y, 6, '符', 190, e.angle, 2.1);
          // The paper goes up as a seal stamped where it struck. Turned by the heading it arrived
          // on, so two seals side by side are not the same stamp twice.
          if (this.live.length < MaxLive) {
            this.push('符', 'seal', e.x, e.y, 0, 0, e.angle, SealSeconds, SealReach, 0);
          }
          e.bite -= 1;
          if (e.bite <= 0) continue;
          e.cool = 0.08;
        }
      } else if (e.kind === 'sword') {
        // 飞剑. Two states and no flag for them: a positive `hits` means it is in the middle of a
        // flurry, and anything else means it is looking for the next thing to be in the middle of.
        if ((e.hits ?? 0) > 0) {
          // Standing still while it works, which is what the 剑光 behind it reads. See below.
          e.vx = 0;
          e.vy = 0;
          e.cool -= dt;
          if (e.cool <= 0) {
            e.hits = (e.hits ?? 0) - 1;
            e.angle += 1.9;
            battlefield.cull(e.x, e.y, SwordBite, 1, e.power);
            this.land(e.x, e.y, battlefield, e.angle, e.power);
            this.spark(e.x, e.y, 3, '剑', 240, e.angle, 1.6);
            // The cut itself, as a stroke of 剑光 across the target. Each one turns by the same
            // 1.9 the sword does, so four of them cross into a star of cuts rather than one line
            // drawn four times.
            if (this.live.length < MaxLive) {
              this.push('剑', 'cut', e.x, e.y, 0, 0, e.angle, CutSeconds, CutReach, 0);
            }
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
          const ux = (goal.x - e.x) / away;
          const uy = (goal.y - e.y) / away;
          e.x += ux * SwordSpeed * dt;
          e.y += uy * SwordSpeed * dt;
          // Nothing integrates a sword's velocity — it steers itself above — so these are only
          // written for the drawing, which trails 剑光 behind it by how fast it is going. Eased
          // off over the last stretch, or a sword sitting on its mark (it overshoots by a frame
          // each way) would flick a full-length trail back and forth across it.
          const glide = Math.min(1, away / 24);
          e.vx = ux * SwordSpeed * glide;
          e.vy = uy * SwordSpeed * glide;
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

      if (e.kind === 'leaf' && e.path) {
        // Along its bow to wherever the body is now, quickening as it goes.
        const t = Math.min(1, e.age / e.life);
        const k = t * t * (3 - 2 * t);
        const [from, bend] = e.path;
        const u = 1 - k;
        const x = u * u * from.x + 2 * u * k * bend.x + k * k * this.bodyX;
        const y = u * u * from.y + 2 * u * k * bend.y + k * k * this.bodyY;
        e.angle = Math.atan2(y - e.y, x - e.x);
        e.x = x;
        e.y = y;
      }

      const expired = e.life > 0 && e.age >= e.life;
      if (expired && e.kind === 'leaf') landed++;
      // Nothing left alive is spent by biting; everything expires on its own clock.
      const spent = false;
      if (!expired && !spent) alive.push(e);
    }
    this.live = alive;
    // A leaf home: the body glows green for a moment. One glow however many landed this frame.
    if (landed > 0) this.push('木', 'mend', this.bodyX, this.bodyY, 0, 0, 0, MendSeconds, this.bodyR, 0);
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
      // 盾's track is a whole circle round the body, and the nodes on it only cover the circle
      // between them when one of them happens to sit at its widest point.
      if (e.kind === 'guard') take(this.bodyX, this.bodyY, e.reach + 6);
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


    if (e.kind === 'leaf') {
      // 荣木's leaf: green, veined, inked, turning end over end as it flies home.
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.sin(e.age * 18) * 0.6);
      const r = e.reach;
      context.beginPath();
      context.moveTo(-r, 0);
      context.quadraticCurveTo(0, -r * 0.75, r, 0);
      context.quadraticCurveTo(0, r * 0.75, -r, 0);
      context.closePath();
      context.fillStyle = '#5fd36a';
      context.fill();
      context.lineWidth = 1.3;
      context.strokeStyle = '#123317';
      context.stroke();
      context.beginPath();
      context.moveTo(-r * 0.8, 0);
      context.lineTo(r * 0.7, 0);
      context.lineWidth = 0.9;
      context.strokeStyle = '#2b7a34';
      context.stroke();
      context.restore();
      this.bloom(context, e.x, e.y, 10, hue, 0.35);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'mend') {
      // A leaf home: a soft green ring swelling off the body and a few motes rising from it.
      const t = Math.min(1, e.age / Math.max(0.01, e.life));
      const fade = 1 - t;
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = fade * 0.8;
      context.lineWidth = 3 * fade + 1;
      context.strokeStyle = '#5fd36a';
      context.beginPath();
      context.arc(e.x, e.y, e.reach * (1.02 + t * 0.35), 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#9af09f';
      context.strokeStyle = '#123317';
      context.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.55;
        const out = e.reach * (0.9 + t * 0.6);
        const mx = e.x + Math.cos(a) * out;
        const my = e.y + Math.sin(a) * out - t * 16;
        const arm = 3.2 * fade + 1;
        // A small plus: the shape of being given something back.
        context.beginPath();
        context.rect(mx - arm, my - arm * 0.35, arm * 2, arm * 0.7);
        context.rect(mx - arm * 0.35, my - arm, arm * 0.7, arm * 2);
        context.fill();
      }
      context.restore();
      this.bloom(context, e.x, e.y, e.reach * 1.4, hue, 0.25 * fade);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'impact') {
      // A four-pointed star, out and gone: the frame a hit lands on.
      const t = e.age / Math.max(0.01, e.life);
      const r = e.reach * (t < 0.3 ? 0.5 + (t / 0.3) * 0.5 : 1 - (t - 0.3) * 0.9);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.beginPath();
      for (let i = 0; i < 8; i++) {
        const reach = i % 2 === 0 ? r : r * 0.32;
        const a = (i / 8) * Math.PI * 2;
        if (i === 0) context.moveTo(Math.cos(a) * reach, Math.sin(a) * reach);
        else context.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
      }
      context.closePath();
      context.fillStyle = '#fffbea';
      context.fill();
      context.lineWidth = 1.6;
      context.strokeStyle = Ink;
      context.stroke();
      context.restore();
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
      // 刀气: a crescent of qi thrown off the edge of a cut — thick in the middle, tapering to two
      // sharp horns swept back, bowed the way it travels. Three fading copies of itself trail
      // behind and speed lines run back off the horns, so it reads as something *moving fast*
      // rather than a shape that happens to be in a new place each frame.
      //
      // Solid and inked first, so it is there on a white wallpaper; the light goes on last. It
      // widens a little as it flies and thins as it spends itself, the way a wave of anything does.
      const run = Math.min(1, e.age / Math.max(0.001, e.life));
      const heavy = 1 + Math.log(e.power ?? 1) / Math.log(9) * 0.35;
      const half = SlashWidth * 0.5 * (1 + run * 0.3) * heavy;
      const thick = half * 0.3 * (1 - run * 0.4);
      const fade = 1 - run * run;
      // A blade of qi: the leading edge an arc of a circle, a third of the way round; the back
      // edge a flatter arc through the same two horns, so the wave is thick in the middle and
      // tapers to two thin, sharp points.
      const apex = half * 0.35;
      const sweep = 1.25;
      const lune = (back: number, scale: number): { ix: number; ir: number } => {
        const r = (half * scale) / Math.sin(sweep);
        const front = apex * scale - back;
        const cx = front - r;
        const tipX = cx + r * Math.cos(sweep);
        const tipY = r * Math.sin(sweep);
        // The circle through both horns and the middle of the back edge.
        const f = front - thick * scale;
        const ix = (f * f - tipX * tipX - tipY * tipY) / (2 * (f - tipX));
        const ir = f - ix;
        const inHorn = Math.atan2(tipY, tipX - ix);
        context.beginPath();
        context.arc(cx, 0, r, -sweep, sweep);
        context.arc(ix, 0, ir, inHorn, -inHorn, true);
        context.closePath();
        return { ix, ir };
      };
      const tipsBack = half / Math.sin(sweep) * (1 - Math.cos(sweep)) - apex;
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalCompositeOperation = 'source-over';
      context.lineJoin = 'round';

      // The afterimages, furthest and faintest first.
      for (let k = 3; k >= 1; k--) {
        context.globalAlpha = fade * (0.46 - k * 0.12);
        context.fillStyle = k === 1 ? DaoBody : DaoRim;
        lune(k * 10, 1 - k * 0.06);
        context.fill();
      }

      // Speed lines off the horns.
      context.globalAlpha = fade * 0.75;
      context.strokeStyle = DaoRim;
      context.lineCap = 'round';
      context.lineWidth = 1.6;
      context.beginPath();
      for (const side of [-1, 1]) {
        const y = side * half * 0.9;
        context.moveTo(-tipsBack, y);
        context.lineTo(-tipsBack - 22 - run * 12, y);
      }
      context.stroke();

      // 狂: tongues of blood-qi streaming off the back of the wave — long tapering wisps, each
      // waving on its own clock, longest through the middle. Drawn before the blade so the blade
      // covers their roots and they read as coming off it.
      context.globalAlpha = fade;
      const { ix, ir } = lune(0, 1);
      context.lineWidth = 1.5;
      context.strokeStyle = DaoInk;
      for (let j = 0; j < 4; j++) {
        const y = ((j - 1.5) / 1.5) * half * 0.62;
        const root = ix + Math.sqrt(Math.max(0, ir * ir - y * y)) + 2;
        const middle = 1 - Math.abs(y) / half;
        const long = half * (0.75 + 0.25 * Math.sin(e.age * 31 + j * 2.4)) * (0.55 + middle * 0.7);
        const wide = thick * 0.5 * (0.7 + middle * 0.5);
        const sway = Math.sin(e.age * 24 + j * 1.3) * wide * 1.4;
        const streak = context.createLinearGradient(root, 0, root - long, 0);
        streak.addColorStop(0, DaoBody);
        streak.addColorStop(1, DaoRim);
        context.beginPath();
        context.moveTo(root, y - wide);
        context.quadraticCurveTo(root - long * 0.5, y - wide * 0.6 + sway, root - long, y + sway * 0.6);
        context.quadraticCurveTo(root - long * 0.5, y + wide * 0.6 + sway, root, y + wide);
        context.closePath();
        context.fillStyle = streak;
        context.fill();
        context.stroke();
      }

      // The wave itself: inked in clotted red, pale along the edge that cuts, crimson behind it.
      const across = context.createLinearGradient(apex, 0, apex - thick, 0);
      across.addColorStop(0, DaoCore);
      across.addColorStop(0.3, DaoBody);
      across.addColorStop(1, DaoRim);
      lune(0, 1);
      context.fillStyle = across;
      context.fill();
      context.strokeStyle = DaoInk;
      context.lineWidth = 2;
      context.stroke();
      // A hot thin line along the cutting edge.
      context.globalAlpha = fade * 0.9;
      context.strokeStyle = '#fff4f0';
      context.lineWidth = 1.2;
      context.beginPath();
      const edgeR = half / Math.sin(sweep);
      context.arc(apex - edgeR - 1.2, 0, edgeR, -sweep * 0.7, sweep * 0.7);
      context.stroke();
      context.restore();

      // The light: a glow over the middle of the wave.
      this.bloom(context, e.x + Math.cos(e.angle) * apex * 0.5, e.y + Math.sin(e.angle) * apex * 0.5, half * 0.9, hue, 0.4 * fade);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'gore') {
      // Blood where a 刀气 cut: a splash at the wound and droplets flung on along the cut, each
      // inked so it reads on white. Positions come from the effect's own heading, not from a
      // random draw, so it does not shimmer between frames.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      // One wet shape: a round splash with lumps on it, and drops flung on along the cut. Every
      // circle is inked first and filled after, so where they overlap there is no line between them.
      const splash = e.reach * (0.6 + 0.4 * Math.min(1, t * 4)) * (1 - t * 0.4);
      const blobs: [number, number, number][] = [[e.x, e.y, splash]];
      for (let i = 0; i < 5; i++) {
        const a = e.angle + i * 1.26 + Math.sin(e.angle * 5 + i) * 0.3;
        blobs.push([e.x + Math.cos(a) * splash * 0.8, e.y + Math.sin(a) * splash * 0.8, splash * (0.42 + (i % 2) * 0.12)]);
      }
      for (let i = 0; i < 6; i++) {
        const a = e.angle + (i - 2.5) * 0.4 + Math.sin(e.angle * 13 + i * 2.3) * 0.2;
        const out = e.reach * (1.1 + t * (2.6 + (i % 3) * 0.9));
        const drop = e.reach * (0.3 - (i % 3) * 0.06) * (1 - t * 0.6);
        blobs.push([e.x + Math.cos(a) * out, e.y + Math.sin(a) * out + t * t * 14, drop]);
      }
      context.fillStyle = DaoInk;
      for (const [x, y, r] of blobs) {
        context.beginPath();
        context.arc(x, y, r + 1.3, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = DaoBody;
      for (const [x, y, r] of blobs) {
        context.beginPath();
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
      }
      // A glint on the splash, so it looks wet rather than painted.
      context.fillStyle = 'rgba(255, 220, 220, 0.8)';
      context.beginPath();
      context.arc(e.x - splash * 0.35, e.y - splash * 0.35, splash * 0.22, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'swing') {
      // The cut itself, at the body: one sweep of a bright arc round the side it was swung to,
      // opening and gone in a few frames. What the 刀气 come off.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      const sweep = SwingArc * (0.35 + 0.65 * Math.min(1, t * 2.5));
      const from = e.angle - SwingArc / 2;
      const to = from + sweep;
      const inner = e.reach * 1.05;
      const outer = e.reach * (1.45 + t * 0.15);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      context.beginPath();
      context.arc(e.x, e.y, outer, from, to);
      // Back along the inside, pinched at the start so the band tapers in from a point.
      context.arc(e.x, e.y, inner, to, from + sweep * 0.15, true);
      context.closePath();
      const band = context.createRadialGradient(e.x, e.y, inner, e.x, e.y, outer);
      band.addColorStop(0, DaoRim);
      band.addColorStop(0.55, DaoBody);
      band.addColorStop(1, DaoCore);
      context.fillStyle = band;
      context.fill();
      context.strokeStyle = DaoInk;
      context.lineWidth = 1.8;
      context.stroke();
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'guard') {
      // 罡气: a node on its orbit with a comet's tail of the orbit drawn behind it, over a track
      // for the whole ring. 盾 is the weapon whose whole identity is being **always on**, and two
      // small dots going round read as two small dots — the ring has to be legible as a ring at a
      // glance for the weapon to say what it is.
      //
      // The track was a faint circle of added light, which on a white wallpaper is no circle at
      // all. It is ink now, dashed, and the dashes turn at the nodes' own pace so the ring reads as
      // one thing going round rather than as a drawn guide. Once a ring, off its first node — one
      // circle per node stacked them into a hard line.
      if (e.index === 0) {
        context.save();
        context.globalCompositeOperation = 'source-over';
        context.setLineDash([5, 9]);
        context.lineDashOffset = -this.clock * GuardRate * e.reach;
        context.beginPath();
        context.arc(this.bodyX, this.bodyY, e.reach, 0, Math.PI * 2);
        context.globalAlpha = 0.45;
        context.strokeStyle = Ink;
        context.lineWidth = 2.4;
        context.stroke();
        context.globalAlpha = 0.7;
        context.strokeStyle = DunBody;
        context.lineWidth = 1.1;
        context.stroke();
        context.restore();
      }

      // The tail: a band along the orbit, a point at the far end and a node's width at this one,
      // painted solid so it is there on white. Traced round the circle rather than as a straight
      // wedge, or a fast ring of them would be a ring of spokes.
      const Tail = 1.25;
      const steps = 10;
      const tailX = this.bodyX + Math.cos(e.angle - Tail) * e.reach;
      const tailY = this.bodyY + Math.sin(e.angle - Tail) * e.reach;
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.beginPath();
      for (let j = 0; j <= steps; j++) {
        const at = e.angle - Tail * (1 - j / steps);
        const out = e.reach + 5 * Math.pow(j / steps, 1.6);
        const x = this.bodyX + Math.cos(at) * out;
        const y = this.bodyY + Math.sin(at) * out;
        if (j === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      for (let j = steps; j >= 0; j--) {
        const at = e.angle - Tail * (1 - j / steps);
        const out = e.reach - 5 * Math.pow(j / steps, 1.6);
        context.lineTo(this.bodyX + Math.cos(at) * out, this.bodyY + Math.sin(at) * out);
      }
      context.closePath();
      const comet = context.createLinearGradient(tailX, tailY, e.x, e.y);
      comet.addColorStop(0, clear(DunRim));
      comet.addColorStop(1, DunBody);
      context.globalAlpha = 0.9;
      context.fillStyle = comet;
      context.fill();
      context.globalAlpha = 0.5;
      context.strokeStyle = Ink;
      context.lineWidth = 1.1;
      context.stroke();
      context.restore();

      // The light down the middle of the tail, and round the node.
      const wake = context.createLinearGradient(tailX, tailY, e.x, e.y);
      wake.addColorStop(0, clear(hue.body));
      wake.addColorStop(1, hue.core);
      context.globalAlpha = 0.75;
      context.strokeStyle = wake;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(this.bodyX, this.bodyY, e.reach, e.angle - Tail, e.angle);
      context.stroke();
      this.bloom(context, e.x, e.y, 19, hue, 0.6);

      // The node itself, solid and inked, over its light — and swollen and white-hot for a beat
      // after it bites, read straight off its own cooldown so nothing has to remember the hit.
      const flash = Math.max(0, (e.cool - (GuardCool - ClangFlash)) / ClangFlash);
      const size = 6.5 * (1 + 0.35 * flash);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.fillStyle = flash > 0 ? mix(DunBody, '#ffffff', flash) : DunBody;
      context.strokeStyle = Ink;
      context.lineWidth = 1.8;
      context.beginPath();
      context.arc(e.x, e.y, size, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = DunCore;
      context.beginPath();
      context.arc(e.x - size * 0.25, e.y - size * 0.25, size * 0.37, 0, Math.PI * 2);
      context.fill();
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'clang') {
      // Where a 罡气 node bit: a ring knocked outward and a crown of short spikes off it, inked.
      // Small and quick — a ring of six nodes bites often, and a big ring per bite would bury the
      // fight in circles.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      const ease = 1 - (1 - t) * (1 - t);
      const r = e.reach * (0.3 + 0.7 * ease);
      const left = 1 - t;
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      context.beginPath();
      context.arc(e.x, e.y, r, 0, Math.PI * 2);
      context.strokeStyle = Ink;
      context.lineWidth = 1.4 + 3 * left;
      context.stroke();
      context.strokeStyle = DunBody;
      context.lineWidth = 0.8 + 2 * left;
      context.stroke();
      context.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = e.angle + (i / 6) * Math.PI * 2;
        const foot = r + 1.5;
        const tip = foot + 7 * left;
        context.moveTo(e.x + Math.cos(a) * foot, e.y + Math.sin(a) * foot);
        context.lineTo(e.x + Math.cos(a) * tip, e.y + Math.sin(a) * tip);
      }
      context.strokeStyle = Ink;
      context.lineWidth = 2.6;
      context.stroke();
      context.strokeStyle = DunCore;
      context.lineWidth = 1.1;
      context.stroke();
      context.restore();
      // One flat disc of light for the first frames, not a bloom: this is the effect a 盾 build puts
      // out most of, and three gradients each would be the bill for it.
      if (t < 0.4) {
        context.globalAlpha = (1 - t / 0.4) * 0.5;
        context.fillStyle = DunCore;
        context.beginPath();
        context.arc(e.x, e.y, r * 0.7, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'charm') {
      // 符 in flight: a paper talisman that flutters, turning a little about its heading and
      // flipping edge-on and back, so it reads as paper thrown rather than a tile sliding.
      const lit = Math.min(1, e.age * 12);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      // A ribbon of gold light behind it.
      context.globalAlpha = 0.4 * lit;
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-9 - Motes * MoteGap * 0.8, 0);
      context.lineTo(-7, 0);
      context.stroke();

      context.globalCompositeOperation = 'source-over';
      // The motes it sheds. Each is dropped every `MoteGap` of travel and **left where it fell**:
      // its distance behind is the travel so far modulo the gap, plus whole gaps, which is a fixed
      // point on the ground for as long as the flight is straight. Drawn here off the talisman's own
      // age rather than pushed as effects of their own, so a sky full of charms is not a list full of
      // flecks. A mote's spin and its sway are hashed from which drop it was, so it keeps them.
      const flown = e.age * CharmSpeed;
      const shed = flown % MoteGap;
      context.strokeStyle = Ink;
      context.lineWidth = 1;
      for (let k = 0; k < Motes; k++) {
        const back = 9 + shed + k * MoteGap;
        // None behind the point it was thrown from: that is the body, not the trail.
        if (back > flown) break;
        const drop = Math.floor(flown / MoteGap) - k;
        const left = 1 - (back - 9) / (Motes * MoteGap);
        const s = 0.9 + 1.8 * left;
        context.save();
        context.translate(-back, Math.sin(drop * 2.3) * 3.5);
        context.rotate(drop * 1.7 + e.age * 7);
        context.globalAlpha = left * lit;
        context.fillStyle = drop % 2 === 0 ? FuGold : '#fff0a8';
        context.beginPath();
        context.rect(-s, -s * 0.7, s * 2, s * 1.4);
        context.fill();
        context.stroke();
        context.restore();
      }

      // The talisman itself, solid and inked: yellow, a cinnabar rune down it, and its two edges
      // browned. Its height is what flips — drawn at that height rather than scaled, so the ink
      // round it stays one weight however edge-on it is.
      context.rotate(Math.sin(e.age * 13) * 0.28);
      const flip = 0.55 + 0.45 * Math.abs(Math.cos(e.age * 9));
      const h = 5.5 * flip;
      context.globalAlpha = 1;
      context.fillStyle = '#f6d65a';
      context.strokeStyle = Ink;
      context.lineWidth = 1.6;
      context.beginPath();
      context.rect(-8, -h, 16, h * 2);
      context.fill();
      context.stroke();
      context.fillStyle = FuDeep;
      context.fillRect(-8, -h, 16, 1.8 * flip);
      context.fillRect(-8, h - 1.8 * flip, 16, 1.8 * flip);
      context.strokeStyle = FuRed;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(-4, 0);
      context.lineTo(4, -1.5 * flip);
      context.moveTo(-3, 1.6 * flip);
      context.lineTo(3, 1.6 * flip);
      context.stroke();
      context.restore();
      this.bloom(context, e.x, e.y, 16, hue, 0.4);
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'seal') {
      // Where a 符 struck: the paper goes up as a seal. A ring of gold with a second inside it and
      // cinnabar 符文 marks between them, a red stamp popping in at the middle, all turning as it
      // spreads — and the shreds of the paper flung off round it. Every line inked, so the seal is
      // a seal on white and not a smudge of yellow.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      const r = e.reach * (0.3 + 0.5 * ease);
      const fade = t < 0.5 ? 1 : 1 - ((t - 0.5) / 0.5) * ((t - 0.5) / 0.5);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = fade;
      context.translate(e.x, e.y);
      context.rotate(e.angle + ease * 0.9);
      context.beginPath();
      context.arc(0, 0, r, 0, Math.PI * 2);
      context.strokeStyle = Ink;
      context.lineWidth = 3.6;
      context.stroke();
      context.strokeStyle = FuGold;
      context.lineWidth = 1.9;
      context.stroke();
      context.beginPath();
      context.arc(0, 0, r * 0.66, 0, Math.PI * 2);
      context.strokeStyle = Ink;
      context.lineWidth = 2.4;
      context.stroke();
      context.strokeStyle = FuGold;
      context.lineWidth = 1.1;
      context.stroke();
      context.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const to = r * (i % 2 === 0 ? 0.94 : 0.84);
        context.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        context.lineTo(Math.cos(a) * to, Math.sin(a) * to);
      }
      context.strokeStyle = FuRed;
      context.lineWidth = 1.5;
      context.stroke();
      // The stamp: slammed in a little too big and settling, which is what makes it land.
      const pop = t < 0.18 ? (t / 0.18) * 1.25 : 1.25 - 0.25 * Math.min(1, (t - 0.18) / 0.2);
      const s = e.reach * 0.2 * pop;
      if (s > 0.2) {
        context.rotate(Math.PI / 4);
        context.beginPath();
        context.rect(-s, -s, s * 2, s * 2);
        context.fillStyle = FuRed;
        context.fill();
        context.strokeStyle = Ink;
        context.lineWidth = 1.4;
        context.stroke();
        context.rotate(-Math.PI / 4);
        context.beginPath();
        context.moveTo(-s * 0.55, 0);
        context.lineTo(s * 0.55, 0);
        context.moveTo(0, -s * 0.55);
        context.lineTo(0, s * 0.55);
        context.strokeStyle = FuGold;
        context.lineWidth = 1.3;
        context.stroke();
      }
      context.restore();
      // The shreds, outside the turning frame so they fly straight out and fall a little.
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      context.fillStyle = '#f6d65a';
      context.strokeStyle = Ink;
      context.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = e.angle + i * 1.2566 + 0.3;
        const out = e.reach * (0.3 + 0.62 * ease);
        const size = 1.2 + 2.4 * (1 - t);
        context.save();
        context.translate(e.x + Math.cos(a) * out, e.y + Math.sin(a) * out + t * t * 6);
        context.rotate(a + t * 5 + i);
        context.beginPath();
        context.rect(-size, -size * 0.7, size * 2, size * 1.4);
        context.fill();
        context.stroke();
        context.restore();
      }
      context.restore();
      this.bloom(context, e.x, e.y, r * 1.2, FuHue, 0.5 * (1 - t));
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'sword') {
      // 飞剑: a blade pointing the way it is going, with 剑光 streaming off it while it flies. The
      // flurry is drawn as the cuts themselves (`cut`) rather than as the sword moving — at four
      // cuts in half a second, a sword that travelled between them would be a blur with no cuts in
      // it — but the blade does jab forward on each one, so it is seen doing the cutting.
      const cutting = (e.hits ?? 0) > 0;
      const moving = cutting ? 0 : Math.min(1, Math.hypot(e.vx, e.vy) / SwordSpeed);
      const lunge = cutting ? Math.pow(Math.max(0, Math.min(1, e.cool / SwordBeat)), 2) * 6 : 0;
      this.bloom(context, e.x, e.y, cutting ? 26 : 16, hue, cutting ? 0.6 : 0.35);
      const steel = (dx: number) => {
        context.beginPath();
        context.moveTo(19 + dx, 0);
        context.lineTo(dx, -3.6);
        context.lineTo(dx - 6, -3.6);
        context.lineTo(dx - 6, 3.6);
        context.lineTo(dx, 3.6);
        context.closePath();
      };
      context.save();
      context.translate(e.x + Math.cos(e.angle) * lunge, e.y + Math.sin(e.angle) * lunge);
      context.rotate(e.angle);
      context.globalCompositeOperation = 'source-over';
      if (moving > 0.05) {
        // 剑光: a long tapering streak off the whole blade, painted under it so the blade covers
        // its root, and two ghosts of the blade along it — what was a sword sliding is a sword
        // *flying*.
        const long = 36 * moving;
        const streak = context.createLinearGradient(-13 - long, 0, 4, 0);
        streak.addColorStop(0, clear(JianBody));
        streak.addColorStop(1, JianBody);
        context.globalAlpha = 0.85 * moving;
        context.beginPath();
        context.moveTo(-13 - long, 0);
        context.lineTo(4, -4.6);
        context.lineTo(4, 4.6);
        context.closePath();
        context.fillStyle = streak;
        context.fill();
        context.globalAlpha = 0.35 * moving;
        context.strokeStyle = Ink;
        context.lineWidth = 1;
        context.stroke();
        for (let g = 2; g >= 1; g--) {
          context.globalAlpha = (0.42 - g * 0.13) * moving;
          context.fillStyle = g === 1 ? JianBody : JianRim;
          steel(-g * 11);
          context.fill();
        }
      }
      // A blade you can see on white: steel, inked, with a gold guard and 剑光's cyan down its
      // spine.
      context.globalAlpha = 1;
      context.fillStyle = '#eef3fb';
      context.strokeStyle = Ink;
      context.lineWidth = 1.6;
      steel(0);
      context.fill();
      context.stroke();
      context.strokeStyle = JianBody;
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(-5, 0);
      context.lineTo(14, 0);
      context.stroke();
      context.fillStyle = '#f2c14e';
      context.strokeStyle = Ink;
      context.lineWidth = 1.4;
      context.beginPath();
      context.rect(-8, -5.5, 2.6, 11);
      context.fill();
      context.stroke();
      context.lineWidth = 2.6;
      context.strokeStyle = Ink;
      context.beginPath();
      context.moveTo(-8, 0);
      context.lineTo(-13, 0);
      context.stroke();
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'cut') {
      // One cut of a 剑 flurry: a stroke of 剑光 drawn through the target — it whips out along its
      // length, then its tail chases its head and it is gone. Bowed a little to one side, so it is
      // a cut and not a ruled line, and edged in ink so a white-hot stroke still shows on white.
      // Four of them, each turned by the sword's 1.9, cross into a star over whatever they hit.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      // Short of the reach by the ink and the bow, so what `bounds` repaints covers the stroke.
      const long = e.reach * 0.88;
      const reveal = 1 - (1 - Math.min(1, t / 0.3)) * (1 - Math.min(1, t / 0.3));
      const head = -long + 2 * long * reveal;
      const tail = -long + 2 * long * Math.pow(Math.max(0, (t - 0.35) / 0.65), 1.5);
      const wide = 3.6 * (1 - t * 0.5);
      const stroke = (bow: number) => {
        const mid = (head + tail) / 2;
        context.beginPath();
        context.moveTo(tail, 0);
        context.quadraticCurveTo(mid, -bow * 2, head, 0);
        context.quadraticCurveTo(mid, bow * 0.6, tail, 0);
        context.closePath();
      };
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = 1;
      if (head - tail > 0.5) {
        stroke(wide);
        context.fillStyle = JianBody;
        context.fill();
        context.strokeStyle = Ink;
        context.lineWidth = 1.6;
        context.stroke();
        stroke(wide * 0.45);
        context.fillStyle = JianCore;
        context.fill();
      }
      // Sparks off the cut, two to a side, splayed. Fixed angles in the cut's own frame, so they
      // are the same sparks every frame and the cut's turn is what varies them.
      const ease = 1 - (1 - t) * (1 - t);
      const out = 5 + 15 * ease;
      const size = 0.4 + 2.6 * (1 - t);
      context.fillStyle = JianCore;
      context.strokeStyle = Ink;
      context.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = (i < 2 ? -1 : 1) * Math.PI / 2 + (i % 2 === 0 ? -0.45 : 0.45);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        context.beginPath();
        context.moveTo(ca * (out + size * 1.6), sa * (out + size * 1.6));
        context.lineTo(ca * out - sa * size * 0.6, sa * out + ca * size * 0.6);
        context.lineTo(ca * (out - size * 0.8), sa * (out - size * 0.8));
        context.lineTo(ca * out + sa * size * 0.6, sa * out - ca * size * 0.6);
        context.closePath();
        context.fill();
        context.stroke();
      }
      context.restore();
      this.bloom(context, e.x, e.y, 15, JianHue, 0.55 * (1 - t));
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'arrow') {
      // 弓. A streak along its own heading, with a small inked arrow at its head. The streak alone
      // was light added to the wallpaper, and on a white one it was not there at all — so it is
      // paint first now, a jade wedge tapering back off the shaft with an ink edge fading out
      // along it, and two speed lines either side, with the light laid over that.
      //
      // Never longer than the arrow's own reach: `bounds` repaints that far round it and no further.
      const lit = Math.min(1, e.age * 14);
      const back = 26 + Math.min(14, e.age * 90);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.beginPath();
      context.moveTo(-back, 0);
      context.lineTo(-8, -3.4);
      context.lineTo(-8, 3.4);
      context.closePath();
      const wedge = context.createLinearGradient(-back, 0, -8, 0);
      wedge.addColorStop(0, clear(GongBody));
      wedge.addColorStop(1, GongBody);
      context.globalAlpha = 0.9 * lit;
      context.fillStyle = wedge;
      context.fill();
      const edge = context.createLinearGradient(-back, 0, -8, 0);
      edge.addColorStop(0, clear(Ink));
      edge.addColorStop(1, Ink);
      context.strokeStyle = edge;
      context.lineWidth = 1.2;
      context.stroke();
      context.globalAlpha = 0.7 * lit;
      context.strokeStyle = GongRim;
      context.lineCap = 'round';
      context.lineWidth = 1.3;
      context.beginPath();
      for (const side of [-1, 1]) {
        context.moveTo(-12, side * 7);
        context.lineTo(-12 - 10 - back * 0.25, side * 7);
      }
      context.stroke();
      context.restore();

      const tail = context.createLinearGradient(
        e.x - Math.cos(e.angle) * back * 0.8,
        e.y - Math.sin(e.angle) * back * 0.8,
        e.x,
        e.y,
      );
      tail.addColorStop(0, clear(GongBody));
      tail.addColorStop(1, GongCore);
      context.globalAlpha = lit;
      context.strokeStyle = tail;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(e.x - Math.cos(e.angle) * back * 0.8, e.y - Math.sin(e.angle) * back * 0.8);
      context.lineTo(e.x, e.y);
      context.stroke();
      this.bloom(context, e.x, e.y, 13, GongHue, 0.5 * lit);
      // The arrow itself, solid and inked, over its streak — painted last, since the streak is
      // added light and would wash out anything under it: a shaft, a head, two jade fletchings.
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = Math.min(1, e.age * 30);
      context.lineCap = 'round';
      context.strokeStyle = Ink;
      context.lineWidth = 4.2;
      context.beginPath();
      context.moveTo(-20, 0);
      context.lineTo(2, 0);
      context.stroke();
      context.strokeStyle = '#c8995a';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(-20, 0);
      context.lineTo(2, 0);
      context.stroke();
      context.fillStyle = '#e6edf5';
      context.strokeStyle = Ink;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(9, 0);
      context.lineTo(1, -4);
      context.lineTo(1, 4);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = GongBody;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(-15, 0);
        context.lineTo(-21, side * 4.2);
        context.lineTo(-19, 0);
        context.closePath();
        context.fill();
        context.stroke();
      }
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'twang') {
      // 弓 on release: the string's snap, as half a squashed ring thrown off the body the way the
      // arrow went, and three short lines out ahead of it. A bow that fires with nothing at the
      // body reads as an arrow appearing from nowhere.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      const swell = 1 - (1 - t) * (1 - t);
      const r = e.reach * (0.45 + 0.55 * swell);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1 - t * t;
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.beginPath();
      context.ellipse(0, 0, r * 0.34, r, 0, -Math.PI / 2, Math.PI / 2);
      context.strokeStyle = Ink;
      context.lineWidth = 3.4;
      context.stroke();
      context.strokeStyle = GongBody;
      context.lineWidth = 1.7;
      context.stroke();
      context.beginPath();
      for (const side of [-1, 0, 1]) {
        const from = r * 0.34 + 3 + swell * 6;
        context.moveTo(from, side * r * 0.42);
        context.lineTo(from + 2 + 10 * (1 - t), side * (r * 0.42 + 2));
      }
      context.strokeStyle = Ink;
      context.lineWidth = 3;
      context.stroke();
      context.strokeStyle = GongCore;
      context.lineWidth = 1.3;
      context.stroke();
      context.restore();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'shatter') {
      // Where an arrow went in: for the first frames a bright sliver along the line it passed
      // through, then splinters of shaft and jade flung on the way it was going. The spread is
      // hashed from where it landed, the way the impact star's turn is, so two arrows into one
      // crowd do not splinter identically and no frame re-rolls it.
      const t = Math.min(1, e.age / Math.max(0.001, e.life));
      const ease = 1 - (1 - t) * (1 - t);
      context.save();
      context.globalCompositeOperation = 'source-over';
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.strokeStyle = Ink;
      if (t < 0.45) {
        const k = 1 - t / 0.45;
        const long = e.reach * (0.7 + 0.5 * (1 - k));
        const wide = 3.2 * k;
        context.globalAlpha = k;
        context.beginPath();
        context.moveTo(-long * 0.6, 0);
        context.quadraticCurveTo(0, -wide * 2, long, 0);
        context.quadraticCurveTo(0, wide * 2, -long * 0.6, 0);
        context.closePath();
        context.fillStyle = GongCore;
        context.fill();
        context.lineWidth = 1.3;
        context.stroke();
      }
      const wob = (e.x * 0.37 + e.y * 0.11) % 0.8;
      context.globalAlpha = 1 - t * t;
      context.lineWidth = 1.1;
      for (let i = 0; i < 6; i++) {
        const a = (i - 2.5) * 0.38 + Math.sin(wob * 7 + i * 2.1) * 0.18;
        const out = e.reach * (0.2 + 0.75 * ease) * (0.75 + 0.125 * ((i * 7) % 3));
        const long = 7 * (1 - t * 0.5) * (i % 2 === 0 ? 1 : 0.75);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        context.beginPath();
        context.moveTo(ca * (out + long), sa * (out + long));
        context.lineTo(ca * out - sa * 1.6, sa * out + ca * 1.6);
        context.lineTo(ca * out + sa * 1.6, sa * out - ca * 1.6);
        context.closePath();
        context.fillStyle = i % 2 === 0 ? GongBody : '#c8995a';
        context.fill();
        context.stroke();
      }
      context.restore();
      // A flat disc of light at the wound: arrows land often enough that a bloom each adds up.
      context.globalAlpha = 0.4 * (1 - t);
      context.fillStyle = GongCore;
      context.beginPath();
      context.arc(e.x, e.y, 3 + 8 * (1 - t), 0, Math.PI * 2);
      context.fill();
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




/**
 * What the codex quotes. Gathered here, after everything is declared, so it is a list of the
 * numbers the fight uses rather than a second set of them.
 */
export const CodexNumbers = {
  slashSpeed: SlashSpeed,
  slashSeconds: SlashSeconds,
  shotRange: ShotRange,
  charmSeconds: 2.4,
  guardCool: GuardCool,
  swordFlurry: SwordFlurry,
  burstReach: BurstReach,
  ringReach: RingReachWay,
  rootReach: RootReach,
  rootSeconds: RootSeconds,
  leechGift: LeechGift,
  leechPerSecond: LeechPerSecond,
  chillReach: ChillReach,
  chillSeconds: ChillSeconds,
  chillFactor: ChillFactor,
  chainReach: ChainReach,
  burnSeconds: BurnSeconds,
  quakeReach: QuakeWay,
  shellBack: ShellBack,
  shellReach: ShellReach,
};
