/**
 * The soft body.
 *
 * A ring of points, each free to move radially, each pulled back to the rest radius by a spring and
 * coupled to its two neighbours. The coupling is the whole trick: a poke on one side does not just
 * dent that one point, it sends a wave travelling around the ring and back, which is what reads as
 * jelly rather than as a circle being scaled. Nothing here is keyframed — every wobble in the app
 * comes out of this simulation, which is why a slime was the right character to pick for a pet with
 * no art assets.
 *
 * Global squash is kept separate from the ring and is volume-preserving (`sx = 1/sy`), because that
 * is what makes a landing look like a landing instead of a shrink.
 */
/**
 * Fraction of the morph by which a point with nothing to travel has already arrived. The furthest
 * point always lands exactly at the end.
 */
const NearFinish = 0.45;

/**
 * How hard the surface is dragged behind its own rest shape while that shape is moving.
 *
 * Paired with `MaxWobble` below, which is what actually bounds the result — this only has to be
 * large enough to reach that bound while the shape is moving quickly.
 */
const MembraneLag = 34;

/**
 * How hard the membrane slaps when it arrives, as a fraction of the local radius.
 *
 * Without this the wrap ends dead still. A smoothstep ramp brings its own velocity to zero, so a
 * surface driven purely by the lag above is gently set down and rings not at all — the shape simply
 * stopped, which is what made the engulf read as flat. Each point is therefore kicked outward at
 * the instant it reaches its edge, and because the arrivals are staggered the slaps travel around
 * the ring as a wave and leave it wobbling after the shape itself has finished.
 */
const SlapFraction = 0.11;

/**
 * The most any point may deviate from its rest radius, as a fraction of that radius.
 *
 * Everything above is bounded here rather than in pixels, because one ring spans both ends of that
 * scale at once: wrapped around a window from near its corner, the near edge sits sixty pixels away
 * and the far one seventeen hundred. A pixel budget generous enough to be visible on the far side
 * turns the near side inside out, and one safe for the near side is invisible on the far. Held as a
 * velocity ceiling, since a spring's amplitude is its velocity over its natural frequency.
 */
const MaxWobble = 0.16;

/**
 * How much of the ring's usual damping applies while it is settling onto or off a shape, and how
 * long that relief outlasts the morph.
 *
 * The standing damping is tuned for a small blob taking a poke, where a wobble that carries on
 * would read as instability. At that setting the arrival wobble above was gone inside a third of a
 * second — under one full oscillation, so it landed as a single bounce rather than as jelly. Held
 * loose here the same slap rings three or four times over about a second, which is the difference
 * between something soft and something merely soft-edged. It is also not a cheat: a membrane
 * stretched taut across a window really is a lighter-damped oscillator than a blob at rest, and the
 * relief lapses on its own, so nothing else the slime does inherits it.
 */
const MorphDamping = 0.42;
const MorphDampingTail = 0.9;

export class Blob {
  readonly count: number;
  private readonly offset: Float32Array;
  private readonly velocity: Float32Array;
  private readonly scratch: Float32Array;

  /**
   * The radius each ring point springs back to, per point rather than one number for the whole
   * ring. A circle is every entry equal to `restRadius`; anything else is a shape the body settles
   * into and wobbles around, which is what lets it wrap a window rather than merely grow.
   *
   * Deliberately separate from `offset`: the offsets are the jelly, and they stay a deviation from
   * whatever shape is currently being held. Encoding a rectangle as a set of large static offsets
   * instead would have the springs fighting to erase it every step.
   */
  private readonly rest: Float32Array;
  /** Where the morph started, so it can be paced rather than eased asymptotically. */
  private readonly conformFrom: Float32Array;
  private conformTo: Float32Array | null = null;
  private conformProgress = 1;
  private conformSeconds = 1;
  private conformSpan = 0;
  private conformPrevious = 1;
  private dampingRelief = 0;

  /** Squash along y; x is derived so area stays roughly constant. */
  private squashY = 1;
  private squashVelocity = 0;

  constructor(
    public restRadius: number,
    count = 40,
    private readonly stiffness = 220,
    private readonly damping = 7.5,
    private readonly coupling = 380,
  ) {
    this.count = count;
    this.offset = new Float32Array(count);
    this.velocity = new Float32Array(count);
    this.scratch = new Float32Array(count);
    this.rest = new Float32Array(count).fill(restRadius);
    this.conformFrom = new Float32Array(count);
  }

  /**
   * Changes the radius the ring settles back to.
   *
   * Mid-morph the ring is on its way to a window's outline, and overwriting `rest` there would
   * snap it out of a three-second animation the user is still allowed to call off. Setting the
   * radius alone is enough in that case: the unwind reads it when it goes back to being a circle.
   */
  resize(radius: number): void {
    this.restRadius = radius;
    if (this.conformTo === null) this.rest.fill(radius);
  }

  /**
   * Morphs the ring onto an arbitrary shape over a fixed duration, or back to a circle with `null`.
   *
   * Paced, not eased: an exponential approach never actually arrives, and here the duration *is*
   * the interaction — the morph is the window in which the user can still call the whole thing off,
   * so it has to take the time it claims to take and then be finished.
   */
  morphTo(target: Float32Array | null, seconds: number): void {
    this.conformFrom.set(this.rest);
    this.conformTo = target;
    this.conformProgress = 0;
    this.conformPrevious = 0;
    this.conformSeconds = Math.max(0.0001, seconds);
    this.dampingRelief = this.conformSeconds + MorphDampingTail;
    // The longest journey any point on the ring has to make, which is what the others are staggered
    // against in `update`.
    let span = 0;
    for (let i = 0; i < this.count; i++) {
      const want = target ? target[i] : this.restRadius;
      const travel = Math.abs(want - this.conformFrom[i]);
      if (travel > span) span = travel;
    }
    this.conformSpan = span;
  }

  /** 0 to 1 across the current morph. Reads 1 when there is nothing in flight. */
  get morphProgress(): number {
    return this.conformProgress;
  }

  /**
   * True while the rest shape itself is still moving.
   *
   * `energy()` cannot see this: it measures deviation *from* the rest shape, and a morph moves the
   * rest shape with the offsets sitting quietly at zero. Without this the render loop stands down
   * in the middle of an engulf and the body freezes halfway onto the window.
   */
  get isMorphing(): boolean {
    return this.conformProgress < 1;
  }

  /**
   * Per-angle radii that trace a rectangle of the given half-extents, for `morphTo`.
   *
   * The corners come out rounded because the outline is drawn as quadratics through the midpoints
   * between samples, which is the right look anyway — a slime stretched over a window should read
   * as a membrane pulled taut, not as a crisp rectangle.
   */
  static rectRadii(
    into: Float32Array,
    count: number,
    left: number,
    top: number,
    right: number,
    bottom: number,
  ): Float32Array {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Slab method: how far along this direction the first edge is. Distances are given per edge
      // rather than as half-extents because the body wraps a window from wherever it happens to be
      // sitting on it, which is almost never the middle.
      const toVertical = cos > 1e-6 ? right / cos : cos < -1e-6 ? left / -cos : Infinity;
      const toHorizontal = sin > 1e-6 ? bottom / sin : sin < -1e-6 ? top / -sin : Infinity;
      into[i] = Math.min(toVertical, toHorizontal);
    }
    return into;
  }

  /** Dents the surface around `angle` — used for pokes, landings and the cursor pushing in. */
  poke(angle: number, depth: number, spread = 1.1): void {
    for (let i = 0; i < this.count; i++) {
      const pointAngle = (i / this.count) * Math.PI * 2;
      // Shortest angular distance, so the dent wraps across the seam at 0/2π.
      let delta = Math.abs(pointAngle - angle) % (Math.PI * 2);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta > spread) continue;
      const falloff = Math.cos((delta / spread) * (Math.PI / 2));
      this.velocity[i] += depth * falloff;
    }
  }

  /** A ring-wide pulse: the body swelling with surprise, or bracing before a jump. */
  pulse(depth: number): void {
    for (let i = 0; i < this.count; i++) {
      this.velocity[i] += depth;
    }
  }

  /**
   * Squashes the body. `amount` of 0 is at rest; 0.4 is a hard landing.
   * Positive flattens, negative stretches into a droplet.
   */
  squash(amount: number): void {
    this.squashVelocity += -amount * 14;
  }

  get squashScale(): { x: number; y: number } {
    const y = this.squashY;
    return { x: 1 / y, y };
  }

  /**
   * How much deformation is still in flight, in pixels. Zero means the ring has settled back to a
   * circle and redrawing it would produce the same image.
   */
  energy(): number {
    let worst = Math.abs(this.squashY - 1) * this.restRadius + Math.abs(this.squashVelocity);

    for (let i = 0; i < this.count; i++) {
      const magnitude = Math.abs(this.offset[i]) + Math.abs(this.velocity[i]) * 0.02;
      if (magnitude > worst) worst = magnitude;
    }
    return worst;
  }

  update(dt: number): void {
    if (this.conformProgress < 1) {
      this.conformPrevious = this.conformProgress;
      this.conformProgress = Math.min(1, this.conformProgress + dt / this.conformSeconds);
      const t = this.conformProgress;
      // Undamped natural frequency of the ring spring, which converts a wanted slap amplitude into
      // the velocity that produces it.
      const omega = Math.sqrt(this.stiffness);
      for (let i = 0; i < this.count; i++) {
        const want = this.conformTo ? this.conformTo[i] : this.restRadius;
        const travel = want - this.conformFrom[i];

        // Staggered arrival. Every point moving on the same clock is what made the engulf read as
        // a shape being scaled: the whole outline arriving at once has no direction to it. Points
        // with less ground to cover finish early and the furthest corner lands last, so the shape
        // spreads out from the near edge like something being poured over the window. Everything
        // still completes by t = 1, because the duration of this morph is a promise to the user —
        // it is the window in which pulling the slime off still calls the meal off.
        const share = this.conformSpan > 0 ? Math.abs(travel) / this.conformSpan : 1;
        const finishBy = NearFinish + (1 - NearFinish) * share;
        const u = Math.min(1, t / finishBy);
        const eased = u * u * (3 - 2 * u);

        // The slap, at the step this point reaches its edge and not before.
        if (u >= 1 && this.conformPrevious / finishBy < 1) {
          this.velocity[i] += Math.abs(this.rest[i]) * SlapFraction * omega;
        }

        const before = this.rest[i];
        this.rest[i] = this.conformFrom[i] + travel * eased;

        // Membrane lag. The surface does not keep up with the shape it is being pulled onto, so it
        // trails behind and then springs past — which is the entire difference between jelly and a
        // balloon inflating. Injecting into the ring's own velocity rather than adding a decorative
        // wobble on top means the existing springs and neighbour coupling carry it: the lag travels
        // around the ring as a wave and keeps ringing after the morph itself has finished.
        //
        // The per-step injection is proportional to that step's movement, so the total is the same
        // whatever the timestep, and the existing offset clamp bounds the result.
        this.velocity[i] -= (this.rest[i] - before) * MembraneLag;

        const ceiling = Math.abs(this.rest[i]) * MaxWobble * omega;
        if (this.velocity[i] > ceiling) this.velocity[i] = ceiling;
        else if (this.velocity[i] < -ceiling) this.velocity[i] = -ceiling;
      }
    }

    // The ring. Neighbour terms are read from a snapshot so the wave does not travel a whole lap in
    // a single step, which is the difference between a wobble and a buzz.
    let damping = this.damping;
    if (this.dampingRelief > 0) {
      this.dampingRelief = Math.max(0, this.dampingRelief - dt);
      damping *= MorphDamping;
    }
    this.scratch.set(this.offset);
    for (let i = 0; i < this.count; i++) {
      const previous = this.scratch[(i - 1 + this.count) % this.count];
      const next = this.scratch[(i + 1) % this.count];
      const neighbourMean = (previous + next) / 2;
      const acceleration =
        -this.stiffness * this.offset[i] -
        damping * this.velocity[i] +
        this.coupling * (neighbourMean - this.offset[i]);
      this.velocity[i] += acceleration * dt;
    }
    for (let i = 0; i < this.count; i++) {
      this.offset[i] += this.velocity[i] * dt;
      // Hard clamp so an extreme throw cannot invert the outline through the centre.
      const limit = this.rest[i] * 0.55;
      if (this.offset[i] > limit) {
        this.offset[i] = limit;
        this.velocity[i] *= 0.4;
      } else if (this.offset[i] < -limit) {
        this.offset[i] = -limit;
        this.velocity[i] *= 0.4;
      }
    }

    // Global squash, on its own critically-damped-ish spring.
    const squashAcceleration = -150 * (this.squashY - 1) - 16 * this.squashVelocity;
    this.squashVelocity += squashAcceleration * dt;
    this.squashY += this.squashVelocity * dt;
    this.squashY = Math.max(0.45, Math.min(1.7, this.squashY));
  }

  /**
   * The outline in local space, before the caller's own transform. Returned as a flat array to
   * avoid allocating forty objects every frame.
   */
  /// Produces the shape that gets both drawn and measured for the dirty rect.
  ///
  /// There used to be a `maxReach` getter alongside this that estimated the same extent from the
  /// rest radii, for the caller to build its dirty rect from. It could not see the stretch applied
  /// below, so the two disagreed by up to half a body-length whenever the body was moving, and the
  /// caller painted outside the region it had cleared. An estimate of what this returns cannot be
  /// kept honest; callers measure the array itself.
  outline(into: Float32Array, stretchAngle = 0, stretch = 0): Float32Array {
    const scale = this.squashScale;
    for (let i = 0; i < this.count; i++) {
      const angle = (i / this.count) * Math.PI * 2;
      let radius = this.rest[i] + this.offset[i];
      if (stretch !== 0) {
        // Directional stretch: the body elongates along the travel direction, which is what turns a
        // dragged blob into a droplet rather than an oval.
        const alignment = Math.cos(angle - stretchAngle);
        radius *= 1 + stretch * alignment;
      }
      into[i * 2] = Math.cos(angle) * radius * scale.x;
      into[i * 2 + 1] = Math.sin(angle) * radius * scale.y;
    }
    return into;
  }

  /**
   * Traces the outline as a closed smooth path.
   *
   * Curves run through the midpoints between consecutive samples, with each sample as the control
   * point. Interpolating the points directly would put a visible corner at every one of the forty
   * samples, and raising the sample count to hide that costs simulation time for no gain.
   */
  static trace(context: CanvasRenderingContext2D, points: Float32Array, count: number): void {
    const midX = (a: number, b: number) => (points[a * 2] + points[b * 2]) / 2;
    const midY = (a: number, b: number) => (points[a * 2 + 1] + points[b * 2 + 1]) / 2;

    context.beginPath();
    context.moveTo(midX(count - 1, 0), midY(count - 1, 0));
    for (let i = 0; i < count; i++) {
      const next = (i + 1) % count;
      context.quadraticCurveTo(points[i * 2], points[i * 2 + 1], midX(i, next), midY(i, next));
    }
    context.closePath();
  }
}
