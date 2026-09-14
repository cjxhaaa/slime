import { Blob } from './Blob';

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
const EngulfSeconds = 3;
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
const PALETTE: Record<string, { core: string; edge: string; rim: string }> = {
  calm: { core: '#8ff0d4', edge: '#33c6a6', rim: '#1d9c85' },
  alert: { core: '#ffd48a', edge: '#f59b2c', rim: '#c9761a' },
  // Acknowledged but still pending: the same hue, drained of urgency. Still clearly not "calm",
  // because whatever raised it has not gone away.
  nudge: { core: '#ffe9c4', edge: '#e8b978', rim: '#b58a4e' },
  // Eating. Deeper and more saturated than calm - the same creature, visibly committed to
  // something, and distinct at a glance from both "fine" and "something wants you".
  devour: { core: '#7ae0bb', edge: '#18a383', rim: '#0d6f5b' },
  sleep: { core: '#b9d8ee', edge: '#6fa8cd', rim: '#4d86ab' },
};

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
  private readonly radius: number;

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

  private bodyGradient(
    context: CanvasRenderingContext2D,
    palette: { core: string; edge: string },
  ): CanvasGradient {
    const key = palette.core;
    const cached = this.gradients.get(key);
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
    return this.mood === 'asleep';
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
    const decoration = this.radius * 2.2;
    leftSpan = Math.max(leftSpan + 3, decoration);
    rightSpan = Math.max(rightSpan + 3, decoration);
    topSpan = Math.max(topSpan + 3, decoration);
    bottomSpan = Math.max(bottomSpan + 3, decoration);

    const top = Math.min(this.renderY - topSpan, this.renderY - this.radius * 0.7 - 60);
    const bottom = Math.max(this.renderY + bottomSpan, ground + this.radius * 1.1);
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
  beginDevour(hwnd: number, rect: DevourRect, buried: boolean): void {
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
      until: this.clock + (buried ? HeaveSeconds : EngulfSeconds),
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
    this.blob.morphTo(this.devourShape, EngulfSeconds);
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
    this.moodUntil = this.clock + 1.4;
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
          this.devour.until = this.clock + EngulfSeconds;
          this.devour.raisePending = true;
          this.blob.squash(-0.36);
          this.blob.pulse(90);
          if (this.devour.engulfPending) {
            this.devour.engulfPending = false;
            this.startEngulf();
          }
        }
      } else if (this.devour.phase === 'engulfing' && this.clock >= this.devour.until) {
        this.devour.phase = 'straining';
        this.devour.swallowPending = true;
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
    void dt;
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
  }

  draw(context: CanvasRenderingContext2D): void {
    const ground = this.groundFor(this.envHeight);
    const airborne = Math.max(0, ground - this.renderY);
    const palette = this.devour
      ? PALETTE.devour
      : this.mood === 'nudge'
        ? PALETTE.nudge
        : this.mood === 'alert'
        ? PALETTE.alert
        : this.mood === 'asleep' || this.mood === 'sleepy'
          ? PALETTE.sleep
          : PALETTE.calm;

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

    context.fillStyle = this.bodyGradient(context, palette);
    context.globalAlpha = 0.92;
    context.fill();

    context.globalAlpha = 1;
    context.lineWidth = 2;
    context.strokeStyle = palette.rim;
    context.stroke();

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

    this.drawFace(context);
    context.restore();

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
      context.lineWidth = 2.6;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        // Upturned arc: the whole "pleased" read comes from the eyes, not the mouth.
        context.arc(ex, ey + this.radius * 0.06, this.radius * 0.12, 1.15 * Math.PI, 1.85 * Math.PI);
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
      // A small ω, drawn as two arcs.
      const w = this.radius * 0.085;
      context.arc(lookX - w, mouthY, w, 0, Math.PI);
      context.arc(lookX + w, mouthY, w, 0, Math.PI);
      context.stroke();
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

  private drawSleepMarks(context: CanvasRenderingContext2D): void {
    context.save();
    context.fillStyle = '#4d86ab';
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
