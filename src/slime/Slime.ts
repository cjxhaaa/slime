import { Blob } from './Blob';
import {
  ArrayReach,
  BudReach,
  drawArray,
  drawBud,
  drawCharms,
  drawShards,
  drawShell,
  drawWisps,
  makeCracks,
  makeShards,
  type OrdealBeat,
  type OrdealShape,
  type Shard,
  stepShards,
} from './Breakthrough';
import { HaloReach } from '../game/Glyphs';
import { BreakthroughSpread, StageSpread } from '../game/Motes';
import { clear, mix } from './colour';
import { smooth } from './ease';

export type Mood =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'asleep'
  | 'surprised'
  | 'alert'
  | 'nudge'
  | 'dragged'
  | 'devouring';

/** What became of a window the slime tried to eat. Mirrors the `Bite` enum on the Rust side. */
export type Bite = 'closed' | 'resisting' | 'hung' | 'killed' | 'too-tough' | 'gone';

export interface DevourRect {
  /** Canvas CSS pixels, already converted from the physical screen rect Rust reports. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How long the body takes to engulf a window, and therefore how long there is to change your mind.
 *
 * This is the whole safety margin of the feature, so it is spent on screen rather than on a timer:
 * the membrane visibly creeps over the window for all three seconds, and grabbing the slime and
 * pulling it off at any point during them calls the whole thing off. Nothing about the commitment
 * is invisible, which is what makes a gesture this destructive safe to trigger by holding still.
 */
/**
 * The floor on how long a wrap takes, and therefore the floor on the abort window.
 *
 * This is the whole safety margin of the feature, so it is spent on screen rather than on a
 * confirmation: the membrane visibly creeps over the window, and grabbing the pet and pulling it
 * off at any point calls the whole thing off. A bigger window against a junior pet takes *longer*
 * than this — see `engulfSeconds` in `game/combat.ts` — but nothing ever makes it shorter, because
 * a stronger pet earning a snappier animation would be buying a flourish with the only chance
 * anyone gets to change their mind.
 */
const MinEngulfSeconds = 3;

/**
 * The ordeal at the top of the ladder.
 *
 * Seventy-one breakthroughs have used the same swell-and-hop, and the seventy-second must not. It
 * gathers — held down, trembling faster and brighter — and then goes off: the body throws itself
 * open and upward and comes down wearing a colour it has never worn.
 *
 * No chance of failing it. Losing four days to a dice roll on a desk toy buys drama with a refund.
 */
const AscendGatherSeconds = 1.7;
const AscendBurstSeconds = 1.4;

/**
 * A major realm breakthrough — eight of them in a run, against seventy-two small ones.
 *
 * It had been using the same thing as a stage: the alert stops and the face looks pleased. Eight
 * genuine milestones indistinguishable from the seventy-one steps between them.
 *
 * Shorter than the ascension on purpose. There are eight of these and one of that, so this has to
 * be an event without competing with the ending.
 */
/**
 * The three beats of a realm breakthrough: drawn in, taken into the light, and revealed.
 *
 * The first attempt at this kept the body visible the whole way through and slid the new colour up
 * it. That is a repaint, not a transformation — what makes this read as becoming something else is
 * that the old form **goes away** inside the column and a different one comes out of it.
 */
/**
 * Nearly twice what it first was, and the length is the point.
 *
 * At 2.3 seconds the whole thing was over before it had been read: the dust arrived, the light went
 * up and the new form was standing there, and what you took away was that something had flashed.
 * Eight of these happen in a run — they can afford four seconds each, and the middle beat is the
 * only one that still wants to be quick.
 *
 * It is now marginally longer than the ascension, which the plan said it must not out-do. That rule
 * is still intact, it is just no longer carried by the clock: the ascension is the only thing in the
 * app that leaves something permanent behind, and no realm change does.
 */
const RealmGatherSeconds = 2;
const RealmKindleSeconds = 0.55;
const RealmRevealSeconds = 1.35;
/** Seconds between waves of dust while the qi is being drawn in. */
const RealmWaveSeconds = 0.13;
/**
 * How fast the array and the ring of charms turn, in radians per second, at the start and the end.
 *
 * It accelerates, so it cannot come off the wall clock — a rotation read as `clock * rate` jumps
 * the instant the rate changes, because the whole history gets remultiplied. The angle has to be
 * accumulated.
 */
const SpinFrom = 0.9;
const SpinTo = 4.2;
/**
 * How much of the reveal the body spends hidden, and how much of it the column spends thinning.
 *
 * The two are deliberately out of step. The figure has to come back into view *inside* a column
 * that is still standing — if both faded together the whole beat would read as a crossfade between
 * two slimes rather than as something emerging from the light.
 */
const VeilFraction = 0.6;
const PillarHoldFraction = 0.35;
/** How long the shockwave takes to cross the screen-space it is allowed. */
const RingSeconds = 0.85;
/** Where the ring stops, as a multiple of the body radius. Also what `bounds` has to reserve. */
const RingReach = 3.2;
/**
 * A stage breakthrough briefly had a small one of these too, at half the reach and a third of the
 * width. It went, and stayed gone through two more rewrites of that sequence: a stage is one thing
 * happening, and a ring going out beside that thing is a second announcement of it. The ring is the
 * realm's, and has always been.
 */
/** How long the slime spends hauling a buried window to the front before it starts eating. */
const HeaveSeconds = 1;
/** How long the body takes to peel back off, whether it ate or gave up. */
const ReleaseSeconds = 0.45;

export interface Env {
  width: number;
  height: number;
  /** Cursor in canvas CSS pixels, or null when it is off this monitor. */
  cursor: { x: number; y: number } | null;
}

const GRAVITY = 2100;
const GROUND_MARGIN = 12;
/** Bouncier than a water balloon, deader than a rubber ball. */
const RESTITUTION = 0.34;
/**
 * Fraction of the hand's speed the body actually leaves with, and the ceiling on the result.
 *
 * Together these are the whole "it has some weight" feel: a flick that would fit 3000 px/s of hand
 * motion becomes a throw of at most 1400, and the drag below bleeds it off over about a second
 * instead of letting it ricochet.
 */
const ThrowTransfer = 0.45;
const MaxThrowSpeed = 1400;
/**
 * Time constant of the air drag, in seconds — applied to horizontal travel only.
 *
 * Damping the vertical axis too was physically tidier and felt wrong: it fights gravity, so a fall
 * turns slow and floaty, which reads as *less* weight rather than more. Weight comes from a fall
 * that commits. Drag's job here is only to stop a throw from crossing the whole screen.
 */
const AirDragTau = 1.6;
const HOP_SPEED = 780;
const WALK_SPEED = 130;
/** How far away the pointer can be and still be watched, in CSS pixels. */
const LookRange = 520;
const SLEEPY_AFTER = 75;
const ASLEEP_AFTER = 95;

/**
 * Seconds between hops while an alert is up.
 *
 * A hop leaves the ground at 0.72 * 780 px/s against 2100 px/s^2 of gravity, so it is airborne for
 * about 0.54s. At the original 0.85s that left barely three tenths of a second on the ground, which
 * is not a pulse — it is continuous bouncing, and it reads as panic rather than as a summons.
 * Landing and visibly resting between hops is what makes it a beat.
 */
const AlertBounceInterval = 1.5;

/** Seconds between the soft pulses of an acknowledged alert. Slow enough to be peripheral. */
const NudgeBreathInterval = 3.2;

/** Body palette per mood. Colour is reserved for state — it is the one thing that must read instantly. */
export interface Palette {
  core: string;
  edge: string;
  rim: string;
}

/**
 * What the body looks like when nothing is happening to it.
 *
 * Handed in from outside rather than derived here, because this class has no idea what a realm is
 * and should not learn: it draws a soft body and runs an alert, and every feature so far has been
 * cheaper for keeping it that way.
 */
export interface BodyLook {
  /** Multiplier on the resting radius. 1 is the size it has always been. */
  scale: number;
  /** Stands in for the calm palette. Alert, sleep and devour still outrank it. */
  palette: Palette;
  /** 0 to 1. A halo under the body, brightest when something is about to happen. */
  glow: number;
  /**
   * How many times this pet has ascended, and therefore how many bands of light it trails.
   *
   * Everything else here says where you are on *this* run. This is the only thing that says how
   * many runs there have been, so it is the one piece of the body that a rebirth does not undo.
   */
  aura: number;
  /**
   * How many qi veins run through the body: one per stage within the current realm, 1 to 9.
   *
   * The realm is carried by the palette and the size, and both of those move once every nine
   * stages. This is what carries the nine.
   */
  veins: number;
}

/**
 * 七彩霞光 — one hue per ascension, in order.
 *
 * Seven, because that is what the phrase is: the seventh ascension is the full spread and there is
 * nothing after it to wait for. Red through violet rather than a gradient of the realm colour,
 * because these bands have to read as something separate from the body — the realm is what the pet
 * *is* right now, and this is what it has already done.
 */
const AURA_HUES = ['#ff5f5a', '#ff9d3d', '#f5d63f', '#63dd77', '#45d6d0', '#5b8cf0', '#a86fe8'];
export const MaxAura = AURA_HUES.length;

const PALETTE: Record<string, Palette> = {
  calm: { core: '#8ff0d4', edge: '#33c6a6', rim: '#1d9c85' },
  alert: { core: '#ffd48a', edge: '#f59b2c', rim: '#c9761a' },
  // Acknowledged but still pending: the same hue, drained of urgency. Still clearly not "calm",
  // because whatever raised it has not gone away.
  nudge: { core: '#ffe9c4', edge: '#e8b978', rim: '#b58a4e' },
  // Eating. Deeper and more saturated than calm - the same creature, visibly committed to
  // something, and distinct at a glance from both "fine" and "something wants you".
  devour: { core: '#7ae0bb', edge: '#18a383', rim: '#0d6f5b' },
  // One colour for every realm, arrived at by a fade rather than by a substitution. Deriving a
  // dimmed version of each realm's own palette was tried — see the note in `colour.ts` — and nine
  // dim colours turned out to be more of a palette than the pet wanted.
  sleep: { core: '#b9d8ee', edge: '#6fa8cd', rim: '#4d86ab' },
};

/**
 * How long the body takes to take on the sleeping colour, and to lose it again.
 *
 * Asymmetric on purpose. Dozing off is a drift and waking is a start, so the way back is under half
 * as long — a slime that took a leisurely second to notice you had poked it would read as
 * unresponsive rather than as sleepy.
 */
const SleepFadeSeconds = 1.1;
const WakeFadeSeconds = 0.4;

/**
 * A stage breakthrough: the small one, seventy-two times a run.
 *
 * It took five goes. The four that failed are worth listing, because none of them failed for the
 * reason I expected going in:
 *
 * 1. **Nothing at all.** `clearAlert` left a pleased face, and a poke leaves the same face, so
 *    advancing a stage looked exactly like being prodded.
 * 2. **Two auspicious clouds** — a scaled-down realm breakthrough. A diluted version of an
 *    impressive thing reads as weak rather than as small, and it happened beside the body rather
 *    than to it.
 * 3. **A spark, a breath, a ripple and a vein** — four effects standing in for one event.
 * 4. **A shed skin**, peeling off and fluttering away. That one was at least a real event with a
 *    before and an after, and it went on looks: a torn crescent coming off a soft round body is a
 *    faintly alarming image for something that is meant to be good news.
 *
 * What it is now is the **first beat of a realm breakthrough at a smaller scale**. Qi dust arrives
 * from outside and is taken in, the body brightens as it absorbs, and that is the event.
 *
 * Which looks like mistake 2 and is not, and the difference is the whole lesson. The clouds were a
 * *decoration* of the big sequence scaled down — the part of it with no mechanism behind it. The
 * dust is the part that means something: it is literally 修为 arriving, it is the same dust the
 * keyboard knocks loose, and a stage filling up is exactly that having happened. Borrowing the
 * mechanism reads as the same event at a smaller size; borrowing the flourish reads as a cheap
 * copy of a better one.
 */
const StageSeconds = 1.6;
/** Seconds between waves of dust while it comes in. */
const StageWaveSeconds = 0.16;
/**
 * When the glow reaches full, and when it starts going out, as fractions of the sequence.
 *
 * There is a **hold** in the middle, and that is the whole of this revision. The first cut of it
 * put a spike on the brightness and called that "亮一下" — but a spike is a flicker, and a body
 * that flickers has not done anything. What reads as a breakthrough is the body becoming a lantern
 * and *staying* one for long enough to be looked at.
 */
const StageGlowFull = 0.4;
const StageGlowUntil = 0.72;

/**
 * A realm breakthrough that did not take.
 *
 * Deliberately built out of the *absence* of the things a success is made of. A success draws qi in
 * and turns the body into a lantern; this one has the body sag, the colour drain towards a flat
 * grey and come back, and nothing arrive at all. The point is that it should be legible in
 * peripheral vision as "that was the bad one" without needing a word of text — and the cheapest
 * way to be unmistakably not-a-success is to run the success's own channels backwards.
 *
 * It does not get more than this. Eight realm edges a run and some fraction of them failing is not
 * a lot of screen time, and a long, elaborate failure animation is a punishment on top of the
 * punishment.
 */
const FailSeconds = 1.5;
/** How far the colour drains towards grey at the worst of it. */
const FailDrain = 0.55;
const FailGrey = '#8d9195';
/** How long the new vein takes to fade in. Short: it arrives under the brightening. */
const VeinGrowSeconds = 0.4;

/**
 * How many veins the body can hold, and how they are drawn.
 *
 * One per stage, so nine at 九层. They are deliberately faint: this is texture that tells you where
 * in a realm you are at a glance, not decoration, and nine bright lines on a forty-six pixel body
 * would be a diagram.
 */
const MaxVeins = 9;
const VeinReach = 0.82;

export class Slime {
  x: number;
  y: number;
  vx = 0;
  vy = 0;

  mood: Mood = 'idle';
  readonly blob: Blob;

  /** Set while an alert is live; the caller supplies the words, the slime supplies the performance. */
  alertText: string | null = null;
  alertAction: (() => void) | null = null;

  private readonly points: Float32Array;
  private radius: number;
  private readonly baseRadius: number;

  private blinkAt = 2;
  private blinkPhase = 0;
  private look = { x: 0, y: 0 };
  private lookTargetJitter = { x: 0, y: 0 };
  /** Where the eyes are currently easing toward — the cursor if there is one, else the idle jitter. */
  private lookTarget = { x: 0, y: 0 };
  private clock = 0;
  private lastInteraction = 0;
  private nextDecisionAt = 3;
  private hopsLeft = 0;
  private facing = 1;
  private grabbed = false;
  private grabOffset = { x: 0, y: 0 };
  private trail = { x: 0, y: 0 };
  private moodUntil = 0;
  private nextAlertBounceAt = 0;
  /**
   * Set once the person has visibly noticed the alert, which ends the hopping.
   *
   * Hovering is the acknowledgement rather than clicking: reaching for the pet is already the
   * gesture that says "I have seen this", and it has the side benefit that the slime stops
   * flailing exactly when you are trying to aim at it. The alert does not go away though — it
   * drops to something quiet, because it has been seen rather than answered.
   */
  private alertAcknowledged = false;
  private dragTarget = { x: 0, y: 0 };
  /**
   * The position one simulation step ago, and the position the renderer should actually draw at.
   *
   * Physics runs on a fixed 1/120s step while frames arrive every ~16.7ms, so a frame advances the
   * simulation by a whole number of steps — usually two, periodically three as the leftover
   * accumulates. Drawing the raw simulated position therefore moves the body in uneven jumps even
   * though the frame loop is perfectly steady, and fast continuous motion is where that shows:
   * a throw is nothing but the simulation, and it juddered.
   *
   * So the renderer draws between the last two simulated states, at the fraction of a step the
   * accumulator is still holding. This is the standard fixed-timestep interpolation and it decouples
   * how smooth the motion looks from how the step count happens to land in each frame.
   */
  /**
   * The window being eaten, or null. Owns position and shape for as long as it exists, which is
   * why it is a record rather than another `mood` - every other mood is a way of sitting on the
   * floor, and this one is not on the floor at all.
   */
  private devour: {
    hwnd: number;
    rect: DevourRect;
    phase: 'heaving' | 'engulfing' | 'straining';
    /** Set when the heave finishes, cleared once the caller has picked it up. */
    raisePending: boolean;
    /** Cleared once the engulf has been started, so it is only started once. */
    engulfPending: boolean;
    /** Set when the engulf completes, cleared once the caller has picked it up. */
    swallowPending: boolean;
    outcome: Bite | null;
    until: number;
    /** How long the wrap takes for *this* window. Never under `MinEngulfSeconds`. */
    engulfSeconds: number;
    /** 0 to 1, how visibly it is working for it. Drives the tremble and nothing else. */
    strain: number;
  } | null = null;
  private readonly devourShape: Float32Array;
  private heaveTremble = 0;

  private prevX = 0;
  private prevY = 0;
  private renderX = 0;
  private renderY = 0;
  /**
   * One gradient per palette, built once.
   *
   * Gradient coordinates are resolved in the user space in effect when they are painted, so a
   * gradient defined around the origin follows the per-frame translate and can be reused. Building
   * one every frame allocated an object per frame for a shape whose geometry never changes.
   */
  private readonly gradients = new Map<string, CanvasGradient>();

  constructor(x: number, y: number, radius = 46) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.baseRadius = radius;
    this.blob = new Blob(radius);
    this.points = new Float32Array(this.blob.count * 2);
    this.devourShape = new Float32Array(this.blob.count);
  }

  get groundY(): number {
    return this.groundFor(this.envHeight);
  }

  private envHeight = 800;

  private groundFor(height: number): number {
    return height - GROUND_MARGIN - this.radius;
  }

  /**
   * The resting appearance, from whatever owns the progression.
   *
   * Cheap to call every tick: a scale that has not moved touches neither the ring nor the gradient
   * cache. The cache has to go when it does, because the gradient's geometry is built from the
   * radius and a stale one would paint the old size's falloff onto the new body.
   */
  setLook(look: BodyLook): void {
    if (look.scale !== this.bodyLook.scale) {
      this.radius = this.baseRadius * look.scale;
      this.blob.resize(this.radius);
      this.gradients.clear();
    }
    this.bodyLook = look;
  }

  /**
   * 0 awake, 1 asleep, and everything in between while it is on its way to one of those.
   *
   * Raw and un-eased; `sleepTint` is the eased version. Kept separate so the easing can be changed
   * without the timing meaning something different.
   */
  private sleepFade = 0;

  /** 0 to 1 through a stage breakthrough, or null when there is not one. */
  private stageBreak: number | null = null;
  /**
   * The newest vein's own progress, 0 to 1, drawn separately from the beat above.
   *
   * Separate because the vein has to be *finished* and stay finished: it outlives the sequence, and
   * on a restore from disk it has to start at 1 rather than draw itself in for a save file that was
   * loaded an hour after the breakthrough happened.
   */
  private veinGrow = 1;
  /** Vein paths in body-local units, regenerated when the realm changes. */
  private veins: number[][] = [];
  /** What `veins` was generated for, so it is not rebuilt every frame. */
  private veinsKey = '';

  /**
   * The small breakthrough. One flash, a stretch, and a couple of clouds going up.
   *
   * Unlike `breakRealm` this does not hide anything and the caller has already applied the new
   * look — there is nothing to reveal, because a stage does not change the colour or the size. What
   * it changes is that something visibly happened.
   */
  /** Draws qi in from outside and takes it up. Nothing else — see the note on `StageSeconds`. */
  breakStage(): void {
    this.lastInteraction = this.clock;
    this.stageBreak = 0;
    this.stageWave = StageWaveSeconds;
    // The newest vein starts empty and fades in under the brightening.
    this.veinGrow = 0;
    // An opening handful, so there is dust on screen from the first frame rather than a beat of
    // nothing while the first wave is waited for.
    this.dustRequest = 5;
    this.dustSpread = StageSpread;
  }

  /** How much of the sleeping colour is showing, eased. */
  private get sleepTint(): number {
    return smooth(this.sleepFade);
  }

  /**
   * True while the colour is still on its way.
   *
   * The renderer has to know, because a fade is the one thing this pet does that changes what is on
   * screen without moving anything: without this, hovering a sleeping slime awake and then not
   * touching it again would leave the body frozen half blue until something else happened to
   * trigger a repaint.
   */
  private get sleepFading(): boolean {
    return this.sleepFade > 0 && this.sleepFade < 1;
  }

  private bodyLook: BodyLook = { scale: 1, palette: PALETTE.calm, glow: 0, aura: 0, veins: 1 };
  private chaseX: number | null = null;
  private ascension: { until: number; phase: 'gathering' | 'burst'; tremble: number } | null = null;
  private realmBreak: {
    phase: 'gathering' | 'kindling' | 'revealing';
    until: number;
    tremble: number;
    /** Seconds until the next wave of dust is asked for. */
    wave: number;
    /** 0 to 1 through the current beat, kept for the draw pass. */
    progress: number;
    /** Accumulated rotation of the array and the ring, in radians. */
    spin: number;
    /** 0 to 1: how solid the column is. Peaks while the body is inside it. */
    pillar: number;
    /** 0 to 1: how completely the body is hidden. Drops before the column does. */
    veil: number;
    /** 0 to 1: how far the stone crust has closed over the body. */
    crust: number;
    /** 0 to 1: how far the cracks in it have run. */
    crack: number;
    /** Fixed for the length of one breakthrough, so the cracks do not crawl between frames. */
    cracks: number[][];
    /** Pieces of the crust, once it has gone. Empty until the burst. */
    shards: Shard[];
  } | null = null;
  /**
   * Set once, at the instant the body is hidden inside the column.
   *
   * The new size and colour must not be applied before then or the reveal has nothing to reveal —
   * the pet would already be wearing them while still in plain sight. Same hand-off shape as the
   * raise and swallow requests the devour uses.
   */
  private lookPending = false;

  /** 0 to 1 while a shockwave is travelling outward, null when there is none. */
  private ring: number | null = null;
  /**
   * How lit up the membrane is from something just going into it, 0 to 1, decaying.
   *
   * The dent alone was not enough to read at a glance — a two-pixel ripple on a forty-six pixel
   * body is invisible from across a desk. What sells swallowing something is the body brightening
   * around where it went in, which is also the one thing a soft body can do that a sprite cannot
   * fake cheaply.
   */
  private absorbFlash = 0;

  /**
   * A realm breakthrough. Brace, burst, and a ring of the *new* colour going out.
   *
   * The ring is the part that makes this read as a breakthrough rather than as a big hop: a body
   * changing colour is a state, and a shockwave leaving it is an event. It works because the
   * caller has already applied the new palette by the time this is drawn.
   */
  breakRealm(): void {
    this.lastInteraction = this.clock;
    this.chaseX = null;
    this.hopsLeft = 0;
    this.realmBreak = {
      phase: 'gathering',
      until: this.clock + RealmGatherSeconds,
      tremble: 0,
      wave: RealmWaveSeconds,
      progress: 0,
      spin: 0,
      pillar: 0,
      veil: 0,
      crust: 0,
      crack: 0,
      // Seeded off the realm being left, so every breakthrough in a run breaks differently and any
      // one of them breaks the same way on every frame of itself.
      cracks: makeCracks(this.realmSeed),
      shards: [],
    };
    // An opening handful, and then `takeDustRequest` keeps it coming for the whole two seconds.
    // One burst at the start was all there was before, and with the beat this long the cloud had
    // arrived and gone by the time a third of it had played.
    this.dustRequest = 14;
    this.dustSpread = BreakthroughSpread;
    // Not a smile. `clearAlert` sets one — it is the right reply to answering a full stage — and
    // for eight frames out of the year that reply is being hauled into a column of light, where a
    // pleased face is the wrong thing on screen and the first thing anybody notices.
    this.mood = 'surprised';
    this.moodUntil = Infinity;
    this.blob.squash(0.32);
  }

  /**
   * True once, when the new form should be put on — while it is hidden inside the column.
   *
   * Unlike every other look change this one is *timed*, because it is the reveal. The caller has to
   * hold off until this says so.
   */
  takeLookRequest(): boolean {
    if (!this.lookPending) return false;
    this.lookPending = false;
    return true;
  }

  /**
   * What the cracks and the pieces are generated from.
   *
   * Off the realm rather than off the clock, so the eight breakthroughs in a run each break
   * differently while any one of them is stable for its own length — `Math.random` per frame would
   * make the cracks crawl, which is the one thing a crack must not do.
   */
  private get realmSeed(): number {
    return 31 + Math.round(this.bodyLook.scale * 1000) + Math.round(this.radius);
  }

  private dustRequest = 0;
  /** How far out the pending dust should be scattered. A realm draws from further than a stage. */
  private dustSpread = BreakthroughSpread;
  /** Seconds until the next wave of a stage breakthrough's dust. */
  private stageWave = 0;

  /** 0 to 1 through a failed realm breakthrough, or null when there is not one. */
  private realmFail: number | null = null;
  /** Seconds until the next slump while one is playing. */
  private failSag = 0;

  /**
   * The qi did not hold. Sags, drains, and comes back.
   *
   * No dust and no light: see `FailSeconds` for why the absence is the design rather than a corner
   * being cut.
   */
  failRealm(): void {
    this.lastInteraction = this.clock;
    this.chaseX = null;
    this.hopsLeft = 0;
    this.realmFail = 0;
    this.failSag = 0;
    // Everything a success would have built up, let go of at once.
    this.stageBreak = null;
    this.absorbFlash = 0;
    this.blob.squash(0.46);
    this.mood = 'surprised';
    this.moodUntil = this.clock + FailSeconds;
  }

  /** True for the length of one, so the caller can hold off on anything else. */
  get isFailingRealm(): boolean {
    return this.realmFail !== null;
  }

  /** How far the colour has drained, 0 to 1: in quickly, out slowly. */
  private get failTint(): number {
    const beat = this.realmFail;
    if (beat === null) return 0;
    return beat < 0.2 ? smooth(beat / 0.2) : smooth(1 - (beat - 0.2) / 0.8);
  }

  /**
   * How hard the body is shining, 0 to 1: up, held, and out.
   *
   * Its own quantity rather than a bigger `absorbFlash`, because that one is shared with typing and
   * with eating and decays in a fifth of a second by design — a sustained light cannot be built out
   * of something whose whole purpose is to be brief.
   */
  private get stageGlow(): number {
    const beat = this.stageBreak;
    if (beat === null) return 0;
    if (beat < StageGlowFull) return smooth(beat / StageGlowFull);
    if (beat < StageGlowUntil) return 1;
    return smooth(1 - (beat - StageGlowUntil) / (1 - StageGlowUntil));
  }

  /**
   * How many specks to knock loose this frame, and zero the rest of the time.
   *
   * The beats live here and the particles live in the caller, so the timing has to cross over
   * somehow; this is the same hand-off shape as the look request above and the devour's raise and
   * swallow requests. The alternative was exposing the phase and letting the caller run its own
   * timer off it, which puts half of one animation in two files.
   */
  takeDustRequest(): { count: number; spread: number } | null {
    if (this.dustRequest <= 0) return null;
    const ask = { count: this.dustRequest, spread: this.dustSpread };
    this.dustRequest = 0;
    return ask;
  }

  /** Starts the ordeal. The caller has already advanced the realm; this is the performance. */
  ascend(): void {
    this.lastInteraction = this.clock;
    this.chaseX = null;
    this.hopsLeft = 0;
    this.ascension = { until: this.clock + AscendGatherSeconds, phase: 'gathering', tremble: 0 };
    // Same reason as `breakRealm`: `clearAlert` leaves a pleased face behind, and an ordeal that
    // opens with one has no arc left to play.
    this.mood = 'surprised';
    this.moodUntil = Infinity;
    // Bracing. Everything after this is the body deciding it can take it.
    this.blob.squash(0.34);
  }

  get isAscending(): boolean {
    return this.ascension !== null;
  }

  /** True for the length of a realm breakthrough, while the form on show is not the current one. */
  get isChangingRealm(): boolean {
    return this.realmBreak !== null;
  }

  /**
   * A speck of dust going in. Small, frequent, and barely more than a ripple.
   *
   * Deliberately does *not* count as being interacted with: motes arrive several times a second
   * while someone is typing, and treating each as a poke would mean a pet that can never fall
   * asleep at a desk that is being worked at. It is eating, not playing.
   */
  absorb(angle: number): void {
    this.blob.poke(angle, -85, 1.0);
    this.absorbFlash = Math.min(1, this.absorbFlash + 0.45);
  }

  /**
   * A whole key going down. The loud version of the same thing.
   *
   * Leans into it, dents deep where it went in, and squashes on the swallow — the sequence a
   * throw already uses, aimed rather than random. This one does count as interaction: the pet went
   * and fetched it.
   */
  gulp(angle: number): void {
    this.lastInteraction = this.clock;
    this.blob.poke(angle, -330, 1.5);
    this.blob.squash(0.2);
    this.blob.pulse(44);
    this.absorbFlash = 1;
  }

  /**
   * Somewhere on the ground to go and get, or null to stop going anywhere in particular.
   *
   * Being given a target counts as being interacted with, which is what wakes a sleeping pet when
   * you start typing. It also means the pet will not doze off mid-errand, since the caller keeps
   * handing it the same target until it arrives.
   */
  chaseTo(x: number | null): void {
    if (x !== null) this.lastInteraction = this.clock;
    this.chaseX = x;
  }

  /**
   * `cache` is false while the sleep fade is mid-flight.
   *
   * The cache is keyed on the core colour, and a fade produces a new one every frame — so caching
   * through a transition would add a gradient per frame, forever, for every time the pet ever dozed
   * off. Building one per frame instead costs four `addColorStop` calls, which is what half the
   * things in this file already do, and only for the second or so the colour is moving.
   */
  private bodyGradient(
    context: CanvasRenderingContext2D,
    palette: { core: string; edge: string },
    cache = true,
  ): CanvasGradient {
    const key = palette.core;
    const cached = cache ? this.gradients.get(key) : undefined;
    if (cached) return cached;
    const gradient = context.createRadialGradient(
      -this.radius * 0.3,
      -this.radius * 0.45,
      this.radius * 0.15,
      0,
      0,
      this.radius * 1.25,
    );
    gradient.addColorStop(0, palette.core);
    gradient.addColorStop(1, palette.edge);
    this.gradients.set(key, gradient);
    return gradient;
  }

  /**
   * Chooses the position to draw at, `alpha` being the fraction of a simulation step the frame's
   * accumulator still holds. Must be called before `bounds()` or `draw()` each frame, or both will
   * describe different frames and the dirty rect will not cover what gets painted.
   */
  beginFrame(alpha: number): void {
    if (this.grabbed) {
      // A dragged position is assigned, not integrated. Interpolating toward it would draw the
      // body behind the hand — the very lag that made smoothing the wrong answer for the drag.
      this.renderX = this.x;
      this.renderY = this.y;
    } else {
      const t = Math.max(0, Math.min(1, alpha));
      this.renderX = this.prevX + (this.x - this.prevX) * t;
      this.renderY = this.prevY + (this.y - this.prevY) * t;
    }

    // Directional stretch: the body elongates along the travel direction, which is what turns a
    // dragged blob into a droplet rather than an oval.
    //
    // Traced here rather than in `draw()` so that `bounds()` can measure the shape that is actually
    // about to be painted. It used to be a draw-time step, with the dirty rect estimating the reach
    // from the ring's rest radii instead — an estimate that omitted this stretch, because nothing
    // outside `draw()` knew it was applied. A resting body hid that: the rect has a floor of a
    // couple of body-widths for the sleep marks, which swallowed a stretch measured in tens of
    // pixels. A body still wrapped around a window does not, and dragging one off mid-engulf left
    // a smear of unerased outline along the direction of travel, because the half of the stretch
    // pointing that way reached past a rect built as though there were no stretch at all.
    const speed = Math.hypot(this.trail.x, this.trail.y);
    const stretch = Math.min(0.32, speed / 3600);
    const stretchAngle = Math.atan2(this.trail.y, this.trail.x);
    this.blob.outline(this.points, stretchAngle, this.grabbed ? stretch * 1.6 : stretch);
  }

  /**
   * Whether anything about this slime's appearance is still changing.
   *
   * A desk pet spends almost all of its life doing nothing, and every frame it draws makes the
   * compositor recombine an eight-megapixel transparent layer over the desktop. Knowing when there
   * is genuinely nothing to redraw is what lets the loop stand down.
   *
   * Sleep counts as animating: the drifting "z" marks are drawn from the clock, so an asleep slime
   * is never static — only slow, which the caller handles by ticking it less often rather than by
   * not drawing it.
   */
  get isAnimating(): boolean {
    return (
      this.grabbed ||
      this.devour !== null ||
      // A morph moves the rest shape while the offsets sit quietly at zero, so `energy()` below
      // reads it as settled. Without this the loop stands down mid-engulf and the body freezes
      // halfway onto the window.
      this.blob.isMorphing ||
      Math.abs(this.vx) > 0.5 ||
      Math.abs(this.vy) > 0.5 ||
      Math.abs(this.x - this.renderX) > 0.05 ||
      Math.abs(this.y - this.renderY) > 0.05 ||
      this.blinkPhase > 0.001 ||
      this.absorbFlash > 0.01 ||
      // A fade is the one thing here that changes the screen without moving anything, so nothing
      // else in this list would catch it.
      this.sleepFading ||
      this.stageBreak !== null ||
      this.realmFail !== null ||
      this.ascension !== null ||
      this.realmBreak !== null ||
      this.ring !== null ||
      this.blob.energy() > 0.08 ||
      // Against the target the eyes are actually easing toward, which is the cursor whenever there
      // is one. Comparing against the idle jitter target instead — as the first version did — is
      // never satisfied while the pointer is on screen, so this always answered "yes" and the whole
      // stand-down never engaged.
      Math.abs(this.look.x - this.lookTarget.x) > 0.002 ||
      Math.abs(this.look.y - this.lookTarget.y) > 0.002
    );
  }

  /**
   * Motion slow enough to redraw at the idle rate rather than at full frame rate.
   *
   * Sleep is the case: the drifting "z" marks never stop, so an asleep slime always needs painting,
   * but at 20 Hz they read exactly the same as at 60 and cost a third as much. Keeping this separate
   * from `isAnimating` is what lets the common case — asleep in the corner all afternoon — stand
   * down without freezing the one thing on screen that is supposed to move.
   */
  get hasSlowAnimation(): boolean {
    // The bands turn whether or not anything else is happening, so a pet that has ascended never
    // fully stands down. Twenty hertz is the same allowance sleep already gets and looks identical
    // at this speed — but it is a real cost, and it is one nobody pays until they have finished a
    // run, which makes it an earned one rather than a default.
    return this.mood === 'asleep' || this.bodyLook.aura > 0;
  }

  /** The colour the body is currently wearing, for anything drawn as part of the same stuff. */
  get bodyColour(): string {
    return this.bodyLook.palette.core;
  }

  /** True while an alert is still standing, acknowledged or not. */
  get hasLiveAlert(): boolean {
    return this.alertText !== null;
  }

  /** Where the body is being drawn this frame, which is what the bubble anchors to. */
  get drawX(): number {
    return this.renderX;
  }

  get drawY(): number {
    return this.renderY;
  }

  /**
   * Everything this slime paints, in CSS pixels — body at full stretch, contact shadow, and the
   * sleep marks that drift up and to the right. Used to repaint only the part of the screen that
   * changed instead of the whole overlay.
   */
  bounds(): { x: number; y: number; width: number; height: number } {
    const ground = this.groundFor(this.envHeight);

    // Measured off the outline `beginFrame` just traced, so this covers exactly what `draw` is
    // about to paint — squash, wobble, morph and stretch included — rather than a padded guess at
    // it. Separate spans per axis rather than one radius: a body wrapped around a wide window is a
    // wide rectangle, and treating its half-diagonal as a radius asks the compositor to recombine
    // several times the area actually touched.
    // Per side rather than per axis. The body now wraps a window from wherever it landed on it, so
    // reaching a hundred pixels one way and two thousand the other is the normal case, and a rect
    // sized to the larger reach in both directions asks the compositor to recombine most of the
    // screen to redraw a body that is nowhere near it.
    let leftSpan = 0;
    let rightSpan = 0;
    let topSpan = 0;
    let bottomSpan = 0;
    for (let i = 0; i < this.blob.count; i++) {
      const px = this.points[i * 2];
      const py = this.points[i * 2 + 1];
      if (-px > leftSpan) leftSpan = -px;
      if (px > rightSpan) rightSpan = px;
      if (-py > topSpan) topSpan = -py;
      if (py > bottomSpan) bottomSpan = py;
    }
    // The rim is stroked 2px centred on the path, so half of it falls outside, and the edge is
    // antialiased past that.
    // A floor for what is drawn near the body but not out of the ring: the contact shadow, and the
    // sleep marks that drift up and to the right.
    // The bands sit further out than anything else the body draws, so they set the floor when
    // there are any. Measured off the same numbers `drawAura` uses rather than guessed at.
    const decoration = Math.max(
      // The array is the widest thing the breakthrough draws, and the charms wheel almost as far
      // out with a fixed-size halo on top — which is why this one is in pixels rather than in body
      // radii. A halo that scaled with the body would be a different charm at every realm.
      this.realmBreak ? this.radius * (ArrayReach + 0.2) + HaloReach : 0,
      this.radius *
        (this.ring !== null
          ? RingReach + 0.2
          : this.bodyLook.aura > 0
            ? 2.5
            : 2.2),
    );
    // The bud closes well above the body, so while one is out the top of the damaged region is set
    // by its apex rather than by anything the body itself draws.
    const pillar = this.realmBreak ? this.radius * (BudReach + 0.6) : 0;
    leftSpan = Math.max(leftSpan + 3, decoration);
    rightSpan = Math.max(rightSpan + 3, decoration);
    topSpan = Math.max(topSpan + 3, decoration);
    bottomSpan = Math.max(bottomSpan + 3, decoration);

    // The crust's pieces are the one thing here whose reach cannot be written down as a multiple of
    // the body radius: they are thrown at a range of speeds and they keep going. So they are
    // measured rather than reserved, the same way the dust and the charms are.
    for (const shard of this.realmBreak?.shards ?? []) {
      if (shard.life <= 0) continue;
      const span = shard.size * 1.6 + 2;
      leftSpan = Math.max(leftSpan, span - shard.x);
      rightSpan = Math.max(rightSpan, shard.x + span);
      topSpan = Math.max(topSpan, span - shard.y);
      bottomSpan = Math.max(bottomSpan, shard.y + span);
    }

    const top = Math.min(
      this.renderY - topSpan,
      this.renderY - this.radius * 0.7 - 60,
      this.renderY - pillar,
      Infinity,
    );
    const bottom = Math.max(
      this.renderY + bottomSpan,
      ground + this.radius * 1.1,
      // The array lies flat under the body and its near edge reaches further down than anything
      // else here. Without this it is left uncleared on the desktop when the sequence ends.
      this.realmBreak ? this.renderY + this.radius * (0.8 + ArrayReach * 0.32) : 0,
    );
    return {
      x: this.renderX - leftSpan,
      y: top,
      width: leftSpan + rightSpan,
      height: bottom - top,
    };
  }

  hitTest(px: number, py: number): boolean {
    const scale = this.blob.squashScale;
    // Against the drawn position, not the simulated one: the pointer is aimed at what is on screen.
    const dx = (px - this.renderX) / (this.radius * scale.x);
    const dy = (py - this.renderY) / (this.radius * scale.y);
    // Slightly generous, so grabbing it does not require pixel precision on a wobbling target.
    return dx * dx + dy * dy < 1.35;
  }

  /**
   * Places the body with no motion history, so the renderer has nothing stale to interpolate from.
   * Used for the initial placement and for keeping it on screen after a resize — anywhere the
   * position changes without the simulation having moved it there.
   */
  teleportTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.renderX = x;
    this.renderY = y;
  }

  /** Null unless a window is being eaten. */
  get devourPhase(): 'heaving' | 'engulfing' | 'straining' | null {
    return this.devour?.phase ?? null;
  }

  /**
   * True once the body is wrapped around a window that will not respond.
   *
   * This is the only state a force kill is offered from, and it is deliberately narrow: everything
   * else the slime can be doing, including wrapped around a window that merely refuses to close,
   * reads false.
   */
  get isChewing(): boolean {
    return this.devour?.phase === 'straining' && this.devour.outcome === 'hung';
  }

  /** The window currently being eaten, for a caller that needs to name it. */
  get devouringHwnd(): number | null {
    return this.devour?.hwnd ?? null;
  }

  /**
   * Latches onto a window.
   *
   * The body stays exactly where it landed and grows outward from there. It used to slide to the
   * middle of the window first, which put the face somewhere the user had not pointed at and made
   * every meal look the same regardless of where it started — and on a maximized window the slide
   * was most of the animation. Eating something starts where you put the pet.
   *
   * `buried` sends it through a heave first: a window that is behind other windows has to be pulled
   * to the front before there is anything to see being eaten.
   */
  beginDevour(
    hwnd: number,
    rect: DevourRect,
    buried: boolean,
    engulfSeconds = MinEngulfSeconds,
    strain = 0,
  ): void {
    this.grabbed = false;
    this.mood = 'devouring';
    this.vx = 0;
    this.vy = 0;
    this.trail = { x: 0, y: 0 };
    this.lastInteraction = this.clock;
    this.hopsLeft = 0;
    this.devour = {
      hwnd,
      rect,
      phase: buried ? 'heaving' : 'engulfing',
      raisePending: false,
      engulfPending: buried,
      swallowPending: false,
      outcome: null,
      engulfSeconds: Math.max(MinEngulfSeconds, engulfSeconds),
      strain: Math.max(0, Math.min(1, strain)),
      until: this.clock + (buried ? HeaveSeconds : Math.max(MinEngulfSeconds, engulfSeconds)),
    };
    if (buried) {
      // Bracing to take the weight.
      this.blob.squash(0.3);
    } else {
      this.startEngulf();
    }
  }

  /**
   * Grows the ring out to the window's edges from wherever the body is sitting on it.
   *
   * The four distances are measured from the body rather than passed as half-extents, because the
   * body is not in the middle: from a corner of a maximized window the far edge is twenty times
   * further away than the near one, and that asymmetry is most of what makes the wrap read as this
   * particular window rather than as a rectangle.
   */
  private startEngulf(): void {
    if (!this.devour) return;
    const rect = this.devour.rect;
    Blob.rectRadii(
      this.devourShape,
      this.blob.count,
      Math.max(1, this.x - rect.x),
      Math.max(1, this.y - rect.y),
      Math.max(1, rect.x + rect.width - this.x),
      Math.max(1, rect.y + rect.height - this.y),
    );
    this.blob.morphTo(this.devourShape, this.devour.engulfSeconds);
  }

  /**
   * The window to pull to the front, handed over exactly once when the heave finishes.
   *
   * Polled for the same reason as `takeSwallowRequest`: this is reached from inside the fixed-step
   * simulation, which runs more than once per frame, and raising a window is an async round trip.
   */
  takeRaiseRequest(): number | null {
    if (!this.devour?.raisePending) return null;
    this.devour.raisePending = false;
    return this.devour.hwnd;
  }

  /**
   * The handle to close, handed over exactly once when the engulf finishes.
   *
   * Polled rather than pushed through a callback because closing is asynchronous while this is
   * reached from inside the fixed-step simulation, which runs several times per frame - a callback
   * from here would fire the close two or three times for one meal.
   */
  takeSwallowRequest(): number | null {
    if (!this.devour?.swallowPending) return null;
    this.devour.swallowPending = false;
    return this.devour.hwnd;
  }

  /**
   * What the window did. A clean close ends in a burp; anything still standing is spat back out.
   *
   * `hung` is the one outcome that does not end the state: the body stays wrapped and keeps
   * working at it, because that is the only position a force is offered from.
   */
  finishDevour(outcome: Bite): void {
    if (!this.devour) return;
    this.devour.outcome = outcome;
    if (outcome === 'hung') {
      this.devour.phase = 'straining';
      return;
    }
    this.letGo();
    if (outcome === 'closed' || outcome === 'killed') {
      // The burp. What a swallow that went down looks like from the outside.
      this.mood = 'happy';
      this.moodUntil = this.clock + 1.6;
      this.blob.squash(0.34);
      this.blob.pulse(120);
    } else {
      // Spat out: it would not go, so the body recoils off it instead of settling. The difference
      // matters - a window that is still there after a clean-looking swallow is the one case where
      // the animation would otherwise lie about what happened.
      this.mood = 'surprised';
      this.moodUntil = this.clock + 1.2;
      this.blob.pulse(-150);
      this.vy = -260;
    }
  }

  /**
   * Called off a window without eating it - the user grabbed the slime and pulled it away.
   *
   * The same unwind as a refusal: from the body's point of view nothing was swallowed either way,
   * and the only difference is whose decision it was.
   */
  abortDevour(): void {
    if (!this.devour) return;
    this.letGo();
    this.mood = 'surprised';
    this.moodUntil = this.clock + 0.6;
    this.blob.pulse(-90);
  }

  /** Peels the ring back to a circle and hands the body back to gravity. */
  private letGo(): void {
    this.devour = null;
    this.blob.morphTo(null, ReleaseSeconds);
  }

  grab(px: number, py: number): void {
    // Grabbing is the abort gesture, so taking hold of a slime mid-meal always calls it off.
    // Whether a grab was committed enough to count is the caller's decision, and by the time it
    // calls here it has made it.
    if (this.devour) this.abortDevour();
    this.grabbed = true;
    this.mood = 'dragged';
    // Anchored to the drawn position rather than the simulated one, so a pet caught mid-flight does
    // not jump by the fraction of a step it was being interpolated across.
    this.x = this.renderX;
    this.y = this.renderY;
    this.grabOffset = { x: this.x - px, y: this.y - py };
    this.dragTarget = { x: this.x, y: this.y };
    this.lastInteraction = this.clock;
    this.blob.pulse(-60);
    this.hopsLeft = 0;
  }

  /**
   * Aims the body at the hand. Velocity comes from the caller's tracker rather than being
   * differenced here: a single frame's delta over an assumed timestep is both wrong in magnitude
   * and dominated by whatever the last pointer event happened to be, which is what made throws
   * feel dead.
   *
   * The position is a target rather than an assignment because pointer input is slower than the
   * display. Measured on this machine, a drag delivers about 24 position updates a second — the
   * mouse's own report rate, not a coalescing artefact — so assigning straight to `x`/`y` moved the
   * body in 24 visible jumps a second while the renderer ran at 60. The pointer arrow gets away
   * with that because it is a few pixels across; a 92-pixel jelly does not.
   */
  dragTo(px: number, py: number, vx: number, vy: number): void {
    if (!this.grabbed) return;
    this.dragTarget = { x: px + this.grabOffset.x, y: py + this.grabOffset.y };
    this.vx = vx;
    this.vy = vy;
  }

  release(vx: number, vy: number): void {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.mood = 'surprised';
    this.moodUntil = this.clock + 0.7;
    // A thrown object does not leave with the hand's full speed, and a slime least of all — some of
    // that momentum goes into deforming it rather than moving it. Handing over the raw fitted
    // velocity made every flick launch it across the screen like a ping-pong ball.
    this.vx = Math.max(-MaxThrowSpeed, Math.min(MaxThrowSpeed, vx * ThrowTransfer));
    this.vy = Math.max(-MaxThrowSpeed, Math.min(MaxThrowSpeed, vy * ThrowTransfer));
    // The body keeps the elongation it had in the hand and unwinds from there, so the throw leaves
    // continuously instead of snapping back to a circle at the moment of release.
    this.trail.x = this.vx;
    this.trail.y = this.vy;
  }

  /** A click that was not a drag: the slime reacts and says so. */
  poke(px: number, py: number): void {
    this.lastInteraction = this.clock;
    if (this.alertText && this.alertAction) {
      this.alertAction();
      return;
    }
    if (this.mood === 'asleep' || this.mood === 'sleepy') {
      this.mood = 'surprised';
      this.moodUntil = this.clock + 1.2;
      this.blob.pulse(90);
      this.vy = -320;
      return;
    }
    const angle = Math.atan2(py - this.y, px - this.x);
    this.blob.poke(angle, -260, 1.4);
    this.blob.squash(0.22);
    this.mood = 'happy';
    // Long enough to be read rather than glimpsed. A poke is the most common thing anyone does to
    // this pet and the reply was over before it registered.
    this.moodUntil = this.clock + 1.9;
  }

  /**
   * Starts the attention performance: swell, then hop on a beat until it is answered.
   *
   * Persists until `clearAlert` — this is the one thing it must not drop. The caller owns what
   * clicking it means, because the slime has no idea what it is alerting about: `poke` runs
   * `action` and nothing else, so whatever raised the alert also decides how it ends.
   */
  raiseAlert(text: string, action: () => void): void {
    this.alertText = text;
    this.alertAction = action;
    this.alertAcknowledged = false;
    this.mood = 'alert';
    this.moodUntil = Infinity;
    this.hopsLeft = 0;
    // Positive pulse drives every ring point outward, so the body swells before the first hop.
    // A negative one would shrink it first, which reads as flinching rather than as alarm.
    this.blob.pulse(150);
    this.vy = -HOP_SPEED * 0.8;
    this.nextAlertBounceAt = this.clock + AlertBounceInterval;
  }

  /** Stops the hopping without dismissing the alert. Idempotent: hovering repeatedly is normal. */
  acknowledgeAlert(): void {
    if (!this.alertText || this.alertAcknowledged) return;
    this.alertAcknowledged = true;
    // One settling squash so the transition out of bouncing is a landing, not a cut.
    this.blob.squash(0.16);
    this.nextAlertBounceAt = this.clock + NudgeBreathInterval;
  }

  get isAlertAcknowledged(): boolean {
    return this.alertAcknowledged;
  }

  clearAlert(): void {
    this.alertText = null;
    this.alertAction = null;
    this.mood = 'happy';
    this.moodUntil = this.clock + 1.5;
  }

  update(dt: number, env: Env): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.clock += dt;
    this.envHeight = env.height;
    const ground = this.groundFor(env.height);

    if (this.devour) {
      // Latched on. Neither gravity nor the walls apply: the body is held against a window, and a
      // maximized one extends past every edge of the work area the overlay is sized to.
      //
      // It also does not move. The position it was launched from is the position it eats from —
      // see `beginDevour`.
      this.vx = 0;
      this.vy = 0;
      this.trail.x *= Math.max(0, 1 - dt * 6);
      this.trail.y *= Math.max(0, 1 - dt * 6);

      if (this.devour.phase === 'heaving') {
        // Hauling the window out from under the ones on top of it. The strain is a squash that
        // deepens and a tremble that quickens, so the second reads as effort building rather than
        // as a pause with a wobble in it.
        const left = Math.max(0, this.devour.until - this.clock);
        const effort = 1 - left / HeaveSeconds;
        this.heaveTremble -= dt;
        if (this.heaveTremble <= 0) {
          this.heaveTremble = 0.09 - effort * 0.05;
          const angle = Math.random() * Math.PI * 2;
          this.blob.poke(angle, 26 + effort * 46, 1.5);
        }
        if (this.clock >= this.devour.until) {
          // It comes free. The recoil is the body letting go of the weight it was pulling against.
          this.devour.phase = 'engulfing';
          this.devour.until = this.clock + this.devour.engulfSeconds;
          this.devour.raisePending = true;
          this.blob.squash(-0.36);
          this.blob.pulse(90);
          if (this.devour.engulfPending) {
            this.devour.engulfPending = false;
            this.startEngulf();
          }
        }
      } else if (this.devour.phase === 'engulfing') {
        // Working for it. The same tremble the heave uses, but keyed to how far beyond comfortable
        // this particular window is rather than to how far through the heave we are — so a small
        // dialog goes down smoothly and a maximised one visibly costs something.
        if (this.devour.strain > 0.02) {
          this.heaveTremble -= dt;
          if (this.heaveTremble <= 0) {
            this.heaveTremble = 0.14 - this.devour.strain * 0.07;
            const angle = Math.random() * Math.PI * 2;
            this.blob.poke(angle, 12 + this.devour.strain * 38, 1.5);
          }
        }
        if (this.clock >= this.devour.until) {
          this.devour.phase = 'straining';
          this.devour.swallowPending = true;
        }
      }

      this.updateFace(dt, env);
      this.blob.update(dt);
      return;
    }

    if (this.grabbed) {
      // Straight to the hand, no smoothing.
      //
      // Interpolation was tried here on the assumption that pointer input was slower than the
      // display. It is not: measured, a drag delivers ~127 raw mouse samples a second which
      // Chromium coalesces to one event per animation frame, so the position already updates
      // exactly once per rendered frame. Easing toward it only added about two frames of lag to a
      // gesture whose whole job is to feel attached to the hand.
      this.x = this.dragTarget.x;
      this.y = this.dragTarget.y;
      this.trail.x += (this.vx - this.trail.x) * Math.min(1, dt * 8);
      this.trail.y += (this.vy - this.trail.y) * Math.min(1, dt * 8);
    } else {
      this.vy += GRAVITY * dt;
      // Air drag, horizontal only. Without any, a throw kept every pixel per second it was given
      // until it hit something; with it on both axes, the fall floated.
      this.vx *= Math.exp(-dt / AirDragTau);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trail.x += (this.vx - this.trail.x) * Math.min(1, dt * 6);
      this.trail.y += (this.vy - this.trail.y) * Math.min(1, dt * 6);

      // Walls. Bouncing off the screen edge rather than clamping keeps a hard throw playful instead
      // of ending with the slime stuck to the border.
      const minX = this.radius * 0.6;
      const maxX = env.width - this.radius * 0.6;
      if (this.x < minX) {
        this.x = minX;
        this.vx = Math.abs(this.vx) * RESTITUTION;
        this.onImpact(Math.PI, Math.abs(this.vx));
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = -Math.abs(this.vx) * RESTITUTION;
        this.onImpact(0, Math.abs(this.vx));
      }

      if (this.y >= ground) {
        const impact = this.vy;
        this.y = ground;
        if (impact > 140) {
          this.vy = -impact * RESTITUTION;
          this.onImpact(Math.PI / 2, impact);
        } else {
          this.vy = 0;
          // Ground friction, so it comes to rest instead of sliding forever.
          this.vx *= Math.pow(0.02, dt);
          if (Math.abs(this.vx) < 4) this.vx = 0;
        }
      }
    }

    this.updateMood(dt, env, ground);
    this.updateFace(dt, env);
    this.blob.update(dt);
  }

  private onImpact(angle: number, strength: number): void {
    const normalised = Math.min(1, strength / 1400);
    this.blob.poke(angle, -420 * normalised, 1.5);
    this.blob.squash(0.5 * normalised);
  }

  private updateMood(dt: number, env: Env, ground: number): void {
    // Before any of the early returns below: the colour has to keep arriving while the pet is held,
    // eating, breaking through or anything else that cuts this function short.
    const sleeping = this.mood === 'asleep' || this.mood === 'sleepy';
    const step = dt / (sleeping ? SleepFadeSeconds : WakeFadeSeconds);
    this.sleepFade = Math.min(1, Math.max(0, this.sleepFade + (sleeping ? step : -step)));

    if (this.realmFail !== null) {
      this.realmFail += dt / FailSeconds;
      this.failSag -= dt;
      if (this.failSag <= 0) {
        // Downwards, repeatedly. A single slump is a flinch; three in a row is something giving up.
        this.failSag = 0.34;
        this.blob.poke(Math.PI / 2, 150, 1.7);
      }
      if (this.realmFail >= 1) this.realmFail = null;
    }

    if (this.stageBreak !== null) {
      const progress = this.stageBreak;
      this.stageBreak += dt / StageSeconds;
      this.stageWave -= dt;
      // Stops asking well before the beat ends, so the last specks have time to arrive and the
      // light has the back half of the sequence to itself.
      if (this.stageWave <= 0 && this.stageBreak < 0.5) {
        this.stageWave = StageWaveSeconds;
        this.dustRequest += 2 + Math.round((1 - progress) * 3);
        this.dustSpread = StageSpread;
      }
      // Arriving dust still lights the membrane on its own — `absorb` does that — and that flicker
      // is worth keeping on top of the steady light, because it is what ties the glow to the specks
      // rather than making the two look like separate things happening at the same time.
      if (this.stageBreak >= 1) this.stageBreak = null;
    }
    // Runs whether or not the beat is still going: the vein has to finish even if something
    // interrupts, because it is the part that stays.
    if (this.veinGrow < 1) this.veinGrow = Math.min(1, this.veinGrow + dt / VeinGrowSeconds);

    const idleFor = this.clock - this.lastInteraction;

    if (this.grabbed || this.devour) return;

    // Keyed off the live alert rather than the current mood, so picking the slime up mid-alert
    // interrupts the performance instead of cancelling it. The mood does change while it is held
    // and for the startle right after, and without this the alert would never come back.
    if (this.alertText) {
      this.mood = this.alertAcknowledged ? 'nudge' : 'alert';
      if (this.alertAcknowledged) {
        // A slow breath in place. No hop, no travel — just enough motion that the pet still reads
        // as holding something for you rather than as having forgotten it.
        if (this.clock >= this.nextAlertBounceAt) {
          this.blob.pulse(26);
          this.nextAlertBounceAt = this.clock + NudgeBreathInterval;
        }
        return;
      }
      // Bounce on a beat rather than continuously: a steady pulse reads as insistent, whereas
      // constant motion just reads as noise you learn to ignore.
      if (this.clock >= this.nextAlertBounceAt && this.y >= ground - 1) {
        this.vy = -HOP_SPEED * 0.72;
        this.blob.squash(-0.18);
        this.nextAlertBounceAt = this.clock + AlertBounceInterval;
      }
      return;
    }

    if (this.realmBreak) {
      const beat = this.realmBreak;
      const left = Math.max(0, beat.until - this.clock);

      // Faster as it goes, and it keeps going through all three beats: an array that slowed down
      // the moment the bud shut would say the working was over halfway through it.
      beat.spin += dt * (SpinFrom + (SpinTo - SpinFrom) * Math.max(beat.progress, beat.pillar));

      if (beat.phase === 'gathering') {
        // Qi being pulled in. The caller has already thrown a cloud of dust at the body; all this
        // has to do is look like it is holding on against the pull.
        const progress = 1 - left / RealmGatherSeconds;
        beat.progress = progress;
        // Set every frame rather than once, so being picked up and put down mid-sequence cannot
        // leave the dragged face on for the rest of it.
        this.mood = 'surprised';
        this.moodUntil = Infinity;
        beat.tremble -= dt;
        if (beat.tremble <= 0) {
          beat.tremble = 0.11 - progress * 0.07;
          this.blob.poke(Math.random() * Math.PI * 2, 26 + progress * 74, 1.5);
        }
        beat.wave -= dt;
        if (beat.wave <= 0) {
          beat.wave = RealmWaveSeconds;
          // Thickening as it goes, so the inrush builds instead of running at one density.
          this.dustRequest += 3 + Math.round(progress * 10);
          this.dustSpread = BreakthroughSpread;
        }
        this.absorbFlash = Math.max(this.absorbFlash, progress * 0.6);
        // The bottleneck, arriving as a crust and then failing. Both are on this beat because this
        // is the only one where the body can still be seen — after it, the cocoon is shut.
        beat.crust = Math.min(1, progress / 0.55);
        beat.crack = Math.max(0, (progress - 0.6) / 0.4);
        if (this.clock >= beat.until) {
          beat.phase = 'kindling';
          beat.until = this.clock + RealmKindleSeconds;
          this.absorbFlash = 1;
          this.blob.squash(-0.42);
          this.blob.pulse(130);
          this.vy = -HOP_SPEED * 0.8;
        }
      } else if (beat.phase === 'kindling') {
        // The column coming up around it, to near-solid. By the end of this the body is inside.
        beat.progress = 1 - left / RealmKindleSeconds;
        beat.pillar = beat.progress;
        beat.veil = beat.pillar;
        beat.crust = 1;
        beat.crack = 1;
        this.absorbFlash = Math.max(this.absorbFlash, 0.9);
        if (this.clock >= beat.until) {
          beat.phase = 'revealing';
          beat.until = this.clock + RealmRevealSeconds;
          beat.pillar = 1;
          beat.veil = 1;
          beat.crust = 0;
          // It breaks where it cannot be watched, same as everything else on this beat, and the
          // pieces come out through the cocoon on their own.
          beat.shards = makeShards(this.radius, this.realmSeed);
          // Now, while nothing can be seen of it. The new form is put on inside the light.
          this.lookPending = true;
          this.ring = 0;
        }
      } else {
        // The figure coming back first, the column going second.
        const progress = 1 - left / RealmRevealSeconds;
        beat.progress = progress;
        stepShards(beat.shards, dt);
        beat.veil = Math.max(0, 1 - progress / VeilFraction) ** 1.4;
        beat.pillar =
          progress < PillarHoldFraction
            ? 1
            : (1 - (progress - PillarHoldFraction) / (1 - PillarHoldFraction)) ** 1.1;
        // Still lit from the inside on the way out, so what emerges looks newly made rather than
        // like the old body with a different fill.
        this.absorbFlash = Math.max(this.absorbFlash, 0.9 * (1 - progress));
        if (this.clock >= beat.until) {
          this.realmBreak = null;
          this.mood = 'happy';
          this.moodUntil = this.clock + 1.6;
        }
      }
      return;
    }

    if (this.ascension) {
      const ordeal = this.ascension;
      if (ordeal.phase === 'gathering') {
        // The tremble quickens and deepens together, so the wait reads as pressure building rather
        // than as a pause with a wobble in it — the same trick the heave uses, turned up.
        const progress = 1 - Math.max(0, ordeal.until - this.clock) / AscendGatherSeconds;
        ordeal.tremble -= dt;
        if (ordeal.tremble <= 0) {
          ordeal.tremble = 0.12 - progress * 0.092;
          this.blob.poke(Math.random() * Math.PI * 2, 28 + progress * 96, 1.5);
        }
        this.absorbFlash = Math.max(this.absorbFlash, progress * 0.8);
        if (this.clock >= ordeal.until) {
          ordeal.phase = 'burst';
          ordeal.until = this.clock + AscendBurstSeconds;
          this.absorbFlash = 1;
          // Outward, not inward: this is the body opening, not flinching.
          this.blob.pulse(230);
          this.blob.squash(-0.42);
          this.vy = -HOP_SPEED * 1.15;
        }
      } else if (this.clock >= ordeal.until) {
        this.ascension = null;
        this.mood = 'happy';
        this.moodUntil = this.clock + 2;
      }
      return;
    }

    if (this.moodUntil > this.clock) return;

    if (env.cursor && this.hitTest(env.cursor.x, env.cursor.y)) {
      this.lastInteraction = this.clock;
    }

    if (idleFor > ASLEEP_AFTER) {
      if (this.mood !== 'asleep') {
        this.mood = 'asleep';
        this.blob.squash(0.14);
      }
      return;
    }
    if (idleFor > SLEEPY_AFTER) {
      this.mood = 'sleepy';
      return;
    }

    this.mood = 'idle';

    if (this.clock < this.nextDecisionAt) return;

    // An errand outranks the idle scheduler entirely. Short hops rather than one long leap, and
    // the speed is capped by how far there is left to go so the last hop does not sail past the
    // thing it was aiming at and have to come back.
    if (this.chaseX !== null) {
      const dx = this.chaseX - this.x;
      if (Math.abs(dx) > this.radius * 0.7 && this.y >= ground - 1) {
        this.facing = dx > 0 ? 1 : -1;
        this.vy = -HOP_SPEED * 0.46;
        this.vx = this.facing * Math.min(WALK_SPEED * 1.5, Math.abs(dx) * 2.2);
        this.blob.squash(-0.14);
        this.nextDecisionAt = this.clock + 0.3;
      }
      this.hopsLeft = 0;
      return;
    }

    if (this.hopsLeft > 0 && this.y >= ground - 1) {
      this.hopsLeft -= 1;
      this.vy = -HOP_SPEED * (0.55 + Math.random() * 0.25);
      this.vx = this.facing * WALK_SPEED * (0.8 + Math.random() * 0.6);
      this.blob.squash(-0.2);
      this.nextDecisionAt = this.clock + 0.45 + Math.random() * 0.2;
      return;
    }

    // Pick something to do. Mostly nothing — a pet that fidgets constantly is exhausting to have
    // on screen, so stillness is the common case and movement is the exception.
    const roll = Math.random();
    if (roll < 0.45) {
      this.nextDecisionAt = this.clock + 2.5 + Math.random() * 5;
    } else if (roll < 0.62) {
      this.lookTargetJitter = {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 1.2,
      };
      this.nextDecisionAt = this.clock + 1.5 + Math.random() * 2.5;
    } else if (roll < 0.78) {
      this.blob.pulse(-24);
      this.nextDecisionAt = this.clock + 2 + Math.random() * 3;
    } else {
      const target = this.radius + Math.random() * (env.width - this.radius * 2);
      this.facing = target > this.x ? 1 : -1;
      this.hopsLeft = 1 + Math.floor(Math.random() * 3);
      this.nextDecisionAt = this.clock;
    }
  }

  private updateFace(dt: number, env: Env): void {
    // Eyes track the cursor, which is most of what makes it feel aware of you.
    let targetX = this.lookTargetJitter.x;
    let targetY = this.lookTargetJitter.y;
    if (env.cursor && this.mood !== 'asleep') {
      const dx = env.cursor.x - this.x;
      const dy = env.cursor.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      // Beyond this the pointer is ignored entirely. Partly because a pet that tracks something
      // right across the room reads as staring rather than as noticing, and partly for cost: the
      // eyes easing toward a new target counts as animating, so following a pointer anywhere on a
      // 2560-wide screen kept the whole loop at full frame rate whenever the mouse so much as
      // twitched — which is most of the time the app is open.
      if (distance < LookRange) {
        const reach = Math.min(1, distance / 260);
        targetX = (dx / distance) * reach;
        targetY = (dy / distance) * reach;
      }
    }
    this.lookTarget.x = targetX;
    this.lookTarget.y = targetY;
    const ease = Math.min(1, dt * 6);
    this.look.x += (targetX - this.look.x) * ease;
    this.look.y += (targetY - this.look.y) * ease;

    if (this.mood === 'asleep') {
      this.blinkPhase = 1;
      return;
    }
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blinkPhase = 1;
      this.blinkAt = 2.2 + Math.random() * 4;
    }
    this.blinkPhase = Math.max(0, this.blinkPhase - dt * 7);
    // Fast enough to be a flicker rather than a glow. A slow decay here reads as the pet being
    // permanently lit while someone types, which is the opposite of the intended "it just took
    // something in".
    this.absorbFlash = Math.max(0, this.absorbFlash - dt * 4.5);
    if (this.ring !== null) {
      this.ring += dt / RingSeconds;
      if (this.ring >= 1) this.ring = null;
    }
  }

  /** What the array and the ring need to know about the body they are working on. */
  private ordealShape(): OrdealShape {
    return {
      x: this.renderX,
      y: this.renderY,
      radius: this.radius,
      // Under the body rather than on the floor — see `OrdealShape.groundY`.
      groundY: this.renderY + this.radius * 0.8,
      palette: this.bodyLook.palette,
      spin: this.realmBreak?.spin ?? 0,
    };
  }

  private ordealBeat(): OrdealBeat | null {
    const beat = this.realmBreak;
    if (!beat || this.devour) return null;
    return { phase: beat.phase, progress: beat.progress, bud: beat.pillar, veil: beat.veil };
  }

  /**
   * The array on the ground and the far half of the ring of charms. Behind the body.
   *
   * Split from the near half rather than drawn in one pass because a ring of objects that all sit
   * in front of the pet is not a ring — it is a bracelet laid on top of a photograph. Half behind
   * and half in front is the only thing here that makes the orbit read as an orbit.
   */
  private drawOrdealBehind(context: CanvasRenderingContext2D): void {
    const beat = this.ordealBeat();
    if (!beat) return;
    const shape = this.ordealShape();
    drawArray(context, shape, beat);
    drawWisps(context, shape, beat);
    drawCharms(context, shape, beat, -1);
  }

  /**
   * The bud, the light inside it, and the near half of the ring. In front of the body.
   *
   * The whole mechanism of the sequence lives in this being in *front*: at full strength there is
   * nothing to see of whatever is inside, so the form can be changed unobserved, and the reveal is
   * the light thinning out over something that is already different. No cross-dissolve, no second
   * body drawn at some blend.
   */
  private drawOrdealFront(context: CanvasRenderingContext2D): void {
    const beat = this.ordealBeat();
    if (!beat) return;
    const shape = this.ordealShape();
    drawBud(context, shape, beat);

    // The bloom, and still the part that guarantees the hide.
    //
    // The bud's silhouette is a gradient that has to reach transparent at its top, so it cannot be
    // relied on to be opaque everywhere the body is. This is a disc of light centred on the body,
    // opaque well past its own edge. Two passes rather than one: a single white-into-colour ramp
    // has to hold full alpha through the colour shift to stay opaque, and that opaque coloured band
    // draws a hard ring around the light — on a pale desktop it looked like a soap bubble.
    context.save();
    for (const [reach, stop, colour, alpha] of [
      [2.4, 0, this.bodyLook.palette.core, 0.6],
      // Just wide enough: opaque out to 1.15 body radii and no further. At 1.9 it was washing the
      // bud's own colour out of the one frame that is supposed to be the most saturated.
      [1.75, 0.66, '#ffffff', 1.15],
    ] as [number, number, string, number][]) {
      const bloom = context.createRadialGradient(
        this.renderX,
        this.renderY,
        0,
        this.renderX,
        this.renderY,
        this.radius * reach,
      );
      bloom.addColorStop(0, colour);
      if (stop > 0) bloom.addColorStop(stop, colour);
      bloom.addColorStop(1, clear(colour));
      context.globalAlpha = Math.min(1, beat.veil * alpha);
      context.fillStyle = bloom;
      context.beginPath();
      context.arc(this.renderX, this.renderY, this.radius * reach, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    // The pieces of the crust, in front of the cocoon they are coming out through.
    const burst = this.realmBreak;
    if (burst && burst.shards.length > 0) {
      context.save();
      context.translate(this.renderX, this.renderY);
      drawShards(context, burst.shards, this.bodyLook.palette);
      context.restore();
    }

    drawCharms(context, shape, beat, 1);
  }

  /**
   * The shockwave from a realm breakthrough, in the colour just arrived at.
   *
   * Widest and brightest when it leaves and thin by the time it stops, which is what makes it read
   * as something that was released rather than as a circle being animated. Drawn behind the body
   * so it appears to come out from under it.
   */
  private drawRing(context: CanvasRenderingContext2D): void {
    if (this.ring === null || this.devour) return;
    context.save();
    // Two waves, the second lagging. One ring reads as a circle being animated; two read as
    // something having gone off. The lag is small enough that they are one gesture rather than a
    // pulse and an echo.
    for (const [lag, weight] of [
      [0, 1],
      [0.2, 0.55],
    ]) {
      const t = this.ring - lag;
      if (t <= 0 || t >= 1) continue;
      const radius = this.radius * (0.9 + (RingReach - 0.9) * t);
      // Linear, not eased. The first version fell off as (1-t)^1.4, which left the wave visible
      // for under half its travel — it read as a blink at the body rather than as a wave leaving.
      context.globalAlpha = 0.58 * (1 - t) * weight;
      context.lineWidth = 7 * (1 - t) + 1.2;
      context.strokeStyle = this.bodyLook.palette.edge;
      context.beginPath();
      context.arc(this.renderX, this.renderY, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  /**
   * The bands of light an ascended pet trails, drawn behind everything else.
   *
   * Each is stroked twice — wide and faint, then narrow and brighter — because a single stroke
   * reads as a wireframe ring and two read as light. Cheaper and more predictable than a shadow
   * blur, which is the other way to get this and costs far more per frame.
   *
   * They turn at different speeds and alternate direction, so seven of them weave instead of
   * sitting in a fixed rosette.
   */
  private drawAura(context: CanvasRenderingContext2D): void {
    const layers = Math.min(MaxAura, Math.floor(this.bodyLook.aura));
    if (layers <= 0 || this.devour) return;
    context.save();
    context.lineCap = 'round';
    for (let i = 0; i < layers; i++) {
      const radius = this.radius * (1.45 + i * 0.12);
      const direction = i % 2 === 0 ? 1 : -1;
      const start = this.clock * (0.24 + i * 0.06) * direction + i * 0.92;
      context.strokeStyle = AURA_HUES[i];
      for (const [width, alpha] of [
        [9, 0.11],
        [3, 0.36],
      ]) {
        context.lineWidth = width;
        context.globalAlpha = alpha;
        context.beginPath();
        context.arc(this.renderX, this.renderY, radius, start, start + 2.15);
        context.stroke();
      }
    }
    context.restore();
  }

  draw(context: CanvasRenderingContext2D): void {
    const ground = this.groundFor(this.envHeight);
    const airborne = Math.max(0, ground - this.renderY);
    // Sleep is no longer a branch in here, it is a blend laid over whatever the answer would
    // otherwise have been. Which also means an alert that fires on a sleeping pet slides from blue
    // to amber instead of cutting, and that is the right behaviour for free.
    const awake = this.devour
      ? PALETTE.devour
      : this.mood === 'nudge'
        ? PALETTE.nudge
        : this.mood === 'alert'
          ? PALETTE.alert
          : this.bodyLook.palette;
    // Hoisted above the halo, which is drawn before the body and needs it too.
    const shining = this.stageGlow;
    const tint = this.sleepTint;
    const dozing =
      tint <= 0
        ? awake
        : {
            core: mix(awake.core, PALETTE.sleep.core, tint),
            edge: mix(awake.edge, PALETTE.sleep.edge, tint),
            rim: mix(awake.rim, PALETTE.sleep.rim, tint),
          };
    // And the drain of a failed breakthrough over the top of that, towards a flat grey. Laid on
    // last so it applies whatever else the body happens to be doing, the same way sleep is.
    const drained = this.failTint * FailDrain;
    const palette =
      drained <= 0
        ? dozing
        : {
            core: mix(dozing.core, FailGrey, drained),
            edge: mix(dozing.edge, FailGrey, drained),
            rim: mix(dozing.rim, FailGrey, drained),
          };

    this.drawRing(context);
    this.drawAura(context);
    this.drawOrdealBehind(context);

    // The halo. Drawn under everything, and only when there is something to say — a body that is
    // barely into a stage has none at all, so this is not permanent glare around the pet. It stays
    // well inside the decoration margin `bounds()` already reserves, so it costs no extra area.
    // A body that is shining has to light what is around it. Without this the pet goes pale and
    // nothing else changes, which reads as the colour being turned down rather than as light coming
    // out of it — and "发强光" is about what leaves the body, not about what the body looks like.
    //
    // The reach stays inside the 2.2 radii `bounds()` already reserves for decoration, so a
    // breakthrough costs no extra repaint area.
    const glowing = Math.max(this.bodyLook.glow * 0.34, shining * 0.58);
    if (glowing > 0.004 && !this.devour) {
      const reach = this.radius * (1.5 + 0.6 * shining);
      const halo = context.createRadialGradient(
        this.renderX,
        this.renderY,
        this.radius * 0.7,
        this.renderX,
        this.renderY,
        reach,
      );
      // The mood's palette, not the raw realm one. A dimmed sleeping body with a full-brightness
      // halo around it looks like two different pets overlaid — and the same mismatch was already
      // there awake, with a gold alert body inside a realm-coloured glow.
      halo.addColorStop(0, palette.core);
      halo.addColorStop(1, clear(palette.core));
      context.save();
      context.globalAlpha = glowing;
      context.fillStyle = halo;
      context.beginPath();
      context.arc(this.renderX, this.renderY, reach, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Contact shadow. It shrinks and fades with height, which is most of what sells the jump -
    // and means nothing for a body latched onto a window halfway up the screen, where it would be
    // an ellipse sitting on the taskbar with nothing above it.
    if (!this.devour) {
      const shadowScale = Math.max(0.35, 1 - airborne / 420);
      context.save();
      context.globalAlpha = 0.22 * shadowScale;
      context.fillStyle = '#0b2a24';
      context.beginPath();
      context.ellipse(
        this.renderX,
        ground + this.radius * 0.72,
        this.radius * 0.95 * shadowScale,
        this.radius * 0.24 * shadowScale,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();
    }

    // `this.points` was traced by `beginFrame`. Retracing it here would let the two describe
    // different shapes, which is the whole reason the dirty rect could be wrong.
    context.save();
    context.translate(this.renderX, this.renderY);

    Blob.trace(context, this.points, this.blob.count);

    context.fillStyle = this.bodyGradient(context, palette, !this.sleepFading);
    context.globalAlpha = 0.92;
    context.fill();

    context.globalAlpha = 1;
    context.lineWidth = 2;
    context.strokeStyle = palette.rim;
    context.stroke();

    // The swallow. Clipped to the body, so it lights the membrane from inside rather than washing
    // a disc over the top of it.
    if (this.absorbFlash > 0.01) {
      context.save();
      Blob.trace(context, this.points, this.blob.count);
      context.clip();
      context.globalAlpha = 0.5 * this.absorbFlash;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(0, 0, this.radius * 1.3, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Specular blob, clipped to the body so it never leaks past a squashed silhouette.
    context.save();
    Blob.trace(context, this.points, this.blob.count);
    context.clip();
    context.globalAlpha = 0.55;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(
      -this.radius * 0.32,
      -this.radius * 0.42,
      this.radius * 0.26,
      this.radius * 0.16,
      -0.5,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 0.18;
    context.beginPath();
    context.ellipse(
      this.radius * 0.3,
      this.radius * 0.3,
      this.radius * 0.34,
      this.radius * 0.2,
      0.4,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();

    // Under the face, over the body's own shading: they are *in* the membrane.
    this.drawVeins(context, palette);

    // And the light, over the veins and under the face. A radial rather than a flat white fill:
    // white at the middle and the realm's own colour at the rim, so a shining body is still visibly
    // *this* body. A flat fill at the strength this needs washes it to a white ball.
    if (shining > 0.01) {
      context.save();
      Blob.trace(context, this.points, this.blob.count);
      context.clip();
      const lit = context.createRadialGradient(0, 0, 0, 0, 0, this.radius * 1.15);
      lit.addColorStop(0, '#ffffff');
      lit.addColorStop(0.55, '#ffffff');
      lit.addColorStop(1, clear(palette.core));
      context.globalAlpha = 0.78 * shining;
      context.fillStyle = lit;
      context.beginPath();
      context.arc(0, 0, this.radius * 1.15, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    this.drawFace(context);
    // The crust, over everything the body draws including the face. Covering the face is most of
    // what makes it read as being sealed in rather than as a change of paint.
    const sealing = this.realmBreak;
    if (sealing && !this.devour) {
      drawShell(
        context,
        () => Blob.trace(context, this.points, this.blob.count),
        this.radius,
        this.bodyLook.palette,
        sealing.cracks,
        sealing.crust,
        sealing.crack,
      );
    }
    context.restore();

    this.drawOrdealFront(context);
    if (this.mood === 'asleep') this.drawSleepMarks(context);
  }

  private drawFace(context: CanvasRenderingContext2D): void {
    const scale = this.blob.squashScale;
    const eyeGap = this.radius * 0.34;
    const eyeY = -this.radius * 0.08 * scale.y;
    const lookX = this.look.x * this.radius * 0.16;
    const lookY = this.look.y * this.radius * 0.12;
    const open = 1 - this.blinkPhase;

    context.fillStyle = '#12332e';
    context.strokeStyle = '#12332e';
    context.lineCap = 'round';

    const eyes: Array<[number, number]> = [
      [-eyeGap * scale.x + lookX, eyeY + lookY],
      [eyeGap * scale.x + lookX, eyeY + lookY],
    ];

    if (this.mood === 'asleep' || (this.mood === 'sleepy' && open < 0.5)) {
      context.lineWidth = 2.4;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        context.arc(ex, ey, this.radius * 0.12, 0.25 * Math.PI, 0.75 * Math.PI);
        context.stroke();
      }
    } else if (this.mood === 'happy') {
      // Blush first, so the eye arcs sit on top of it. Two soft patches are what turn "eyes
      // closed" into "pleased" — without them an upturned arc reads much the same as a squint.
      //
      // Drawn as a gradient at high alpha rather than a flat patch at low alpha, and that is not a
      // style choice. Red composited over this body at 0.4 lands on a grey-beige, because the
      // green channel it is blending into is almost maxed — two dirty smudges instead of a blush.
      // At 0.75 the centre is actually pink, and the gradient is what keeps it from being a disc.
      context.save();
      for (const side of [-1, 1]) {
        const cx = side * this.radius * 0.36 * scale.x + lookX;
        const cy = eyeY + this.radius * 0.2 + lookY;
        const spread = this.radius * 0.16;
        const blush = context.createRadialGradient(cx, cy, 0, cx, cy, spread);
        blush.addColorStop(0, 'rgba(255, 122, 122, 0.78)');
        blush.addColorStop(1, 'rgba(255, 122, 122, 0)');
        context.fillStyle = blush;
        context.beginPath();
        context.ellipse(cx, cy, spread, spread * 0.62, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();

      context.lineWidth = 2.6;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        context.arc(ex, ey + this.radius * 0.07, this.radius * 0.135, 1.1 * Math.PI, 1.9 * Math.PI);
        context.stroke();
      }
    } else {
      const wide = this.mood === 'surprised' || this.mood === 'alert' ? 1.35 : 1;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        context.ellipse(
          ex,
          ey,
          this.radius * 0.105 * wide,
          this.radius * 0.13 * wide * Math.max(0.06, open),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        if (open > 0.6) {
          context.save();
          context.fillStyle = '#ffffff';
          context.globalAlpha = 0.9;
          context.beginPath();
          context.ellipse(
            ex - this.radius * 0.035,
            ey - this.radius * 0.05 * wide,
            this.radius * 0.032,
            this.radius * 0.038,
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
          context.restore();
        }
      }
    }

    const mouthY = this.radius * 0.26 * scale.y;
    context.lineWidth = 2.2;
    context.beginPath();
    if (this.mood === 'happy') {
      // An ω, as two arcs in two separate paths.
      //
      // In one path the canvas joins the end of the first arc to the start of the second with a
      // straight line, which draws a bar across the top and closes the whole thing into a dark
      // blob. And at the old radius — 0.085, under four pixels — a 2.2px stroke was wider than the
      // arcs were tall, so what little survived filled in solid. Both of those were invisible at
      // the size the pet is normally drawn and obvious the moment it was magnified.
      const w = this.radius * 0.115;
      context.lineWidth = 2;
      for (const side of [-1, 1]) {
        context.beginPath();
        context.arc(lookX + side * w, mouthY, w, 0, Math.PI);
        context.stroke();
      }
    } else if (this.mood === 'surprised' || this.mood === 'alert') {
      context.ellipse(lookX, mouthY, this.radius * 0.075, this.radius * 0.1, 0, 0, Math.PI * 2);
      context.fill();
    } else if (this.mood === 'dragged') {
      context.ellipse(lookX, mouthY, this.radius * 0.11, this.radius * 0.07, 0, 0, Math.PI * 2);
      context.fill();
    } else if (this.mood === 'asleep' || this.mood === 'sleepy') {
      context.moveTo(lookX - this.radius * 0.07, mouthY);
      context.lineTo(lookX + this.radius * 0.07, mouthY);
      context.stroke();
    } else {
      context.arc(lookX, mouthY - this.radius * 0.04, this.radius * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
      context.stroke();
    }
  }

  /**
   * The qi veins, laid out once per realm.
   *
   * Nine curved strokes running outward from just off centre, each one bending as it goes so that
   * nine of them read as a grain in the body rather than as a starburst. Seeded off the realm, so
   * the pattern is stable for the whole nine stages it is being built up over and different for the
   * next realm — which matters, because the newest one draws itself in and a pattern that moved
   * between frames would make that impossible to see.
   */
  private veinsFor(key: string): number[][] {
    if (this.veinsKey === key) return this.veins;
    let state = 0;
    for (let i = 0; i < key.length; i++) state = (state * 31 + key.charCodeAt(i)) % 2147483647;
    const random = () => {
      state = (state * 48271) % 2147483647;
      return state / 2147483647;
    };
    const built: number[][] = [];
    for (let i = 0; i < MaxVeins; i++) {
      // `[radius, start, sweep, drift]`: an arc that wanders outward or inward as it goes.
      //
      // Tangential, not radial. The first pass drew them as spokes from the middle outward and they
      // read as **cracks** — which is not a near miss, it is the exact thing the jade shell of a
      // realm breakthrough draws, so the two would have been telling contradictory stories with the
      // same marks. Qi circulating inside a membrane goes *around*.
      const radius = 0.3 + (i / MaxVeins) * 0.42 + (random() - 0.5) * 0.1;
      built.push([
        Math.min(VeinReach, radius),
        random() * Math.PI * 2,
        (1.1 + random() * 1.5) * (random() < 0.5 ? -1 : 1),
        (random() - 0.5) * 0.22,
      ]);
    }
    this.veins = built;
    this.veinsKey = key;
    return built;
  }

  /**
   * The veins, clipped to the body.
   *
   * Drawn in the body's local space, so they travel and squash with it without having to be
   * deformed by the soft-body simulation themselves — and clipped to the real outline, so they
   * never leak past a wobble.
   *
   * The newest one grows. That is the entire point of the feature: it is the only thing a stage
   * breakthrough changes that is still there afterwards.
   */
  private drawVeins(context: CanvasRenderingContext2D, palette: Palette): void {
    const count = Math.min(MaxVeins, Math.max(0, Math.round(this.bodyLook.veins)));
    if (count <= 0 || this.devour) return;
    const paths = this.veinsFor(`${palette.core}:${this.bodyLook.aura}`);

    context.save();
    Blob.trace(context, this.points, this.blob.count);
    context.clip();
    context.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const newest = i === count - 1;
      const grown = newest ? this.veinGrow : 1;
      if (grown <= 0.001) continue;
      const [radius, start, sweep, drift] = paths[i];
      const r = this.radius;

      // Traced as a short polyline rather than an `arc`, because the radius drifts as it goes —
      // a true circle inside a wobbling body reads as a machined part.
      const steps = 12;
      const trace = () => {
        context.beginPath();
        for (let step = 0; step <= steps; step++) {
          const t = (step / steps) * grown;
          const angle = start + sweep * t;
          const at = (radius + drift * t) * r;
          const px = Math.cos(angle) * at;
          const py = Math.sin(angle) * at;
          if (step === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.stroke();
      };

      // Drawn twice: a wide faint pass for the bloom in the membrane and a narrow bright one for
      // the strand itself. The same trick the aura bands use, and for the same reason — one stroke
      // reads as a wireframe, two read as light under a surface.
      for (const [width, alpha, pen] of [
        [r * 0.13, 0.15, palette.core],
        [r * 0.042, 0.4, '#ffffff'],
      ] as [number, number, string][]) {
        // A strand still arriving is brighter than the settled ones, which is what makes it
        // possible to see *which* one is new without counting.
        context.globalAlpha = alpha * (newest ? 1 + (1 - grown) * 1.4 : 1);
        context.lineWidth = width;
        context.strokeStyle = pen;
        trace();
      }

      // A bright head on the one still being drawn, so it reads as being written rather than as
      // fading up.
      if (newest && grown < 1) {
        const angle = start + sweep * grown;
        const at = (radius + drift * grown) * r;
        const hx = Math.cos(angle) * at;
        const hy = Math.sin(angle) * at;
        const head = context.createRadialGradient(hx, hy, 0, hx, hy, r * 0.2);
        head.addColorStop(0, '#ffffff');
        head.addColorStop(1, clear(palette.core));
        context.globalAlpha = 0.95;
        context.fillStyle = head;
        context.beginPath();
        context.arc(hx, hy, r * 0.2, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  private drawSleepMarks(context: CanvasRenderingContext2D): void {
    context.save();
    // Off the palette rather than a copy of its literal, which is what this was before.
    context.fillStyle = PALETTE.sleep.rim;
    context.font = '600 14px system-ui, sans-serif';
    for (let i = 0; i < 3; i++) {
      // Each z rises and fades on its own offset phase, so they read as a drift rather than a blink.
      const phase = (this.clock / 2.6 + i * 0.33) % 1;
      context.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
      const size = 10 + i * 3;
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.fillText(
        'z',
        this.renderX + this.radius * 0.5 + phase * 22,
        this.renderY - this.radius * 0.7 - phase * 46,
      );
    }
    context.restore();
  }
}
