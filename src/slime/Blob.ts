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

  update(dt: number): void {
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
      const limit = this.restRadius * 0.55;
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
      let radius = this.restRadius + this.offset[i];
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
