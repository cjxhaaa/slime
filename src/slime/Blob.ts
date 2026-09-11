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
    this.conformSeconds = Math.max(0.0001, seconds);
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
  static rectRadii(into: Float32Array, count: number, halfWidth: number, halfHeight: number): Float32Array {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      const toVertical = cos > 1e-6 ? halfWidth / cos : Infinity;
      const toHorizontal = sin > 1e-6 ? halfHeight / sin : Infinity;
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

  /**
   * How far the outline currently reaches from the centre, deformation included.
   *
   * The caller's dirty rect is built from this. It has to be measured rather than assumed from
   * `restRadius` because a morphed body is arbitrarily larger than its resting size, and it has to
   * be measured from the *current* shape rather than from whatever the caller thinks it asked for:
   * a morph back to a circle takes time, so the body outlives the state that made it big.
   */
  get maxReach(): number {
    const scale = this.squashScale;
    const widest = Math.max(scale.x, scale.y);
    let worst = 0;
    for (let i = 0; i < this.count; i++) {
      const reach = this.rest[i] + Math.abs(this.offset[i]);
      if (reach > worst) worst = reach;
    }
    return worst * widest;
  }

  update(dt: number): void {
    if (this.conformProgress < 1) {
      this.conformProgress = Math.min(1, this.conformProgress + dt / this.conformSeconds);
      // Smoothstep, so the body leaves and arrives softly instead of starting at full speed —
      // a membrane being pulled over something, not a shape being scaled.
      const t = this.conformProgress;
      const eased = t * t * (3 - 2 * t);
      for (let i = 0; i < this.count; i++) {
        const want = this.conformTo ? this.conformTo[i] : this.restRadius;
        this.rest[i] = this.conformFrom[i] + (want - this.conformFrom[i]) * eased;
      }
    }

    // The ring. Neighbour terms are read from a snapshot so the wave does not travel a whole lap in
    // a single step, which is the difference between a wobble and a buzz.
    this.scratch.set(this.offset);
    for (let i = 0; i < this.count; i++) {
      const previous = this.scratch[(i - 1 + this.count) % this.count];
      const next = this.scratch[(i + 1) % this.count];
      const neighbourMean = (previous + next) / 2;
      const acceleration =
        -this.stiffness * this.offset[i] -
        this.damping * this.velocity[i] +
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
