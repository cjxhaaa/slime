/**
 * 木人桩 — the 演武场's targets.
 *
 * The arena used to start a real 历练: 邪气 arriving on a schedule, closing in, and a ninety-second
 * clock. Which meant that looking at one effect repeatedly involved fighting a game about it —
 * waiting for something to walk into range, losing the thing you were watching when it died, and
 * being thrown out after a minute and a half.
 *
 * So it is a practice yard now. The targets **stand still**, in three rings, and they come back up
 * a moment after they go down. Nothing arrives, nothing attacks, nothing ends.
 *
 * ## The rings are the ruler
 *
 * Three of them, at 150, 290 and 430 pixels. That is not decoration: with the targets at known
 * distances you can see **exactly how far a school reaches** by which ring stops lighting up — and
 * reach is the one property that is otherwise invisible, because normally the 邪气 come to you.
 * It is the quickest read available on what a level actually bought.
 *
 * It implements the same `Battlefield` the trial does, so `Attacks` cannot tell the difference and
 * has no branch in it for practice.
 */

/** Where the rings sit, and how many posts on each. */
const RINGS: { radius: number; count: number }[] = [
  { radius: 150, count: 8 },
  { radius: 290, count: 10 },
  { radius: 430, count: 12 },
];

/** How long a post lies down after it is felled. */
const DownSeconds = 0.55;
/** How close something has to be to count as hitting a post. */
const PostRadius = 15;

interface Post {
  x: number;
  y: number;
  /** Seconds left lying down. Zero means standing. */
  down: number;
  /** Counts up while it is being struck, for the wobble. */
  shake: number;
  /** Which way it fell, so it does not all fall the same way. */
  lean: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Dummies {
  private posts: Post[] = [];
  private clock = 0;
  private felled = 0;

  /** Stands the rings up around a point. */
  place(x: number, y: number): void {
    this.posts = [];
    this.clock = 0;
    this.felled = 0;
    for (const ring of RINGS) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + (ring.radius * 0.01);
        this.posts.push({
          x: x + Math.cos(angle) * ring.radius,
          y: y + Math.sin(angle) * ring.radius,
          down: 0,
          shake: 0,
          lean: 0,
        });
      }
    }
  }

  get count(): number {
    return this.posts.length;
  }

  get hits(): number {
    return this.felled;
  }

  update(dt: number): void {
    this.clock += dt;
    for (const post of this.posts) {
      post.down = Math.max(0, post.down - dt);
      post.shake = Math.max(0, post.shake - dt * 3);
    }
  }

  // --- Battlefield -------------------------------------------------------------------------

  /** Only the standing ones. A post on the ground is not a target. */
  targets(): { x: number; y: number }[] {
    return this.posts.filter((p) => p.down <= 0).map((p) => ({ x: p.x, y: p.y }));
  }

  closest(x: number, y: number, within: number): { x: number; y: number } | null {
    let best: Post | null = null;
    let closest = within;
    for (const post of this.posts) {
      if (post.down > 0) continue;
      const away = Math.hypot(post.x - x, post.y - y);
      if (away <= closest) {
        closest = away;
        best = post;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Fells up to `most` standing posts within a radius, nearest first.
   *
   * Returns hits landed, the same as the trial's, so an effect that asks "did I connect" before
   * detonating behaves identically here. A post going down and coming back up is what makes the
   * yard readable: you can watch a school's coverage as a pattern of gaps rather than having to
   * count anything.
   */
  cull(x: number, y: number, radius: number, most: number): number {
    if (most <= 0) return 0;
    const inside: { post: Post; away: number }[] = [];
    for (const post of this.posts) {
      if (post.down > 0) continue;
      const away = Math.hypot(post.x - x, post.y - y);
      if (away <= radius + PostRadius) inside.push({ post, away });
    }
    if (inside.length === 0) return 0;
    inside.sort((a, b) => a.away - b.away);
    const struck = inside.slice(0, most);
    for (const { post } of struck) {
      post.down = DownSeconds;
      post.shake = 1;
      post.lean = Math.random() < 0.5 ? -1 : 1;
      this.felled += 1;
    }
    return struck.length;
  }

  bounds(): Rect | null {
    if (this.posts.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const post of this.posts) {
      left = Math.min(left, post.x - 30);
      top = Math.min(top, post.y - 44);
      right = Math.max(right, post.x + 30);
      bottom = Math.max(bottom, post.y + 22);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * Posts, and the rings they stand on.
   *
   * Drawn as **wood** rather than in the 邪气's dark language, and that is the point: this is not a
   * fight and should not look like one. A player who glances at the screen has to be able to tell
   * that nothing here is coming for the pet.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();

    // The rings themselves, very faint, as a ruler for reach.
    context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.setLineDash([5, 9]);
    const middle = this.posts[0];
    if (middle) {
      // Recovered from the posts rather than stored, so there is one source of truth for where the
      // yard is centred.
      const centre = this.centre();
      for (const ring of RINGS) {
        context.beginPath();
        context.arc(centre.x, centre.y, ring.radius, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.setLineDash([]);

    for (const post of this.posts) {
      const felled = post.down > 0;
      const tip = felled ? 1 - post.down / DownSeconds : 1;
      const wobble = Math.sin(this.clock * 26) * post.shake * 0.14;

      // The flash of being struck, drawn before the post so it does not wash the post out. This is
      // the single most useful thing on the screen in here: it is how you read a school's coverage
      // — which posts lit up, and therefore how far and how wide it actually reached.
      if (post.shake > 0) {
        const glow = context.createRadialGradient(post.x, post.y - 12, 0, post.x, post.y - 12, 34);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.globalAlpha = post.shake;
        context.fillStyle = glow;
        context.beginPath();
        context.arc(post.x, post.y - 12, 34, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }

      context.save();
      context.translate(post.x, post.y);
      // Falls over and gets back up rather than vanishing: something that disappears reads as a
      // kill, and nothing in here is supposed to be dying.
      context.rotate(felled ? post.lean * (1 - tip) * 1.35 + wobble : wobble);
      // And dims while it is down, so "which ones are currently out" is legible at a glance across
      // thirty of them.
      context.globalAlpha = felled ? 0.45 + 0.55 * tip : 1;

      context.save();
      context.globalAlpha *= 0.25;
      context.fillStyle = '#000000';
      context.beginPath();
      context.ellipse(0, 19, 15, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      // The stake, with a lit side so it is not a flat bar.
      context.fillStyle = '#7a5733';
      context.fillRect(-5.5, -12, 11, 32);
      context.fillStyle = '#a37b49';
      context.fillRect(-5.5, -12, 4, 32);

      // The straw head.
      context.fillStyle = '#c9a463';
      context.beginPath();
      context.arc(0, -19, 14, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e6c88c';
      context.beginPath();
      context.arc(-4, -23, 8, 0, Math.PI * 2);
      context.fill();
      // Two bands, so it reads as bound straw rather than as a ball.
      context.strokeStyle = 'rgba(84, 58, 30, 0.85)';
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(-12, -22);
      context.lineTo(12, -17);
      context.moveTo(-12, -16);
      context.lineTo(12, -21);
      context.stroke();
      context.restore();
    }
    context.restore();
  }

  /** Where the yard is centred, averaged off the posts. */
  private centre(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const post of this.posts) {
      x += post.x;
      y += post.y;
    }
    return { x: x / this.posts.length, y: y / this.posts.length };
  }
}
