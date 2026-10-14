/**
 * 木人桩 — the 演武场's targets.
 *
 * The arena used to start a real 历练: 邪气 arriving on a schedule, closing in, and a ninety-second
 * clock. Which meant that looking at one effect repeatedly involved fighting a game about it —
 * waiting for something to walk into range, losing the thing you were watching when it died, and
 * being thrown out after a minute and a half.
 *
 * So it is a practice yard now. The targets **stand still**, four of them in an arc in front of the
 * pet, and they flinch rather than die. Nothing arrives, nothing attacks, nothing ends.
 *
 * ## Four, all at the same distance
 *
 * It used to be thirty posts in three rings at 150, 290 and 430 pixels, as a ruler for reach. That
 * answered a question the yard is no longer being asked: with the whole kit rebuilt around a
 * weapon plus three 五行, the thing you come in here to find out is **how hard a build hits**, and
 * thirty posts spread over three distances answer that badly. Half of them are out of range of
 * whatever you are carrying, so the number they produce is mostly a statement about geometry.
 *
 * Four, on one arc, all exactly `Range` from the body, and the distance is chosen so that every
 * one of the five reaches them — including 盾, whose 罡气 orbits at 104 and would simply never
 * touch a post on the old inner ring at 150.
 *
 * ## Why they go numb instead of falling
 *
 * A struck post stops *taking* hits for a moment, but it is still standing and is still a target.
 * The distinction matters at both ends.
 *
 * It has to stop taking them, because a 刀气 crossing a post is within cutting distance of it for
 * about **0.14 seconds** and has no cooldown of its own — only `bite`. Against something that
 * never flinched it would spend all three cuts on the same post in three consecutive frames and
 * report a number three times too high.
 *
 * It has to stay a target, because 剑 and 符 both steer toward the nearest one. The old posts
 * dropped out of `targets()` while they were down, so a flying sword lost its mark every time it
 * connected and spent the next moment wandering — which is not what it does to a 邪气, and the
 * whole point of the yard is that nothing in here behaves specially.
 *
 * The window is still a **ceiling on the number the yard reports**: four posts at the old 0.55s
 * could never show more than 7.3 hits a second, well under what a deep build does, and a readout
 * that silently flattens out is worse than none — it says "these two builds are the same" when
 * what happened is the bench ran out of room. At 0.2s the ceiling is 20 a second. That is above
 * anything measured so far but not enormously, so **the readout says when it is capped** rather
 * than quietly reporting the ceiling as if it were the build.
 *
 * It implements the same `Battlefield` the trial does, so `Attacks` cannot tell the difference and
 * has no branch in it for practice.
 */

/** How many posts, and where they stand relative to the body. */
export const PostCount = 4;
/**
 * How far out the arc sits.
 *
 * Inside 盾's orbit-plus-reach window (59 to 149 at the first level) and inside 刀's 150, so a
 * stationary pet engages all four with every weapon. Everything else — 弓, 符, 剑 — travels, and
 * was never the constraint.
 */
export const Range = 118;
/** How wide the arc opens, in radians. */
export const Spread = 1.9;

/**
 * How long a struck post stops taking hits. See the note above: it is a ceiling on the reported
 * rate at one end and the guard against a single 刀气 counting three times at the other, and 0.14s
 * of slash contact is the floor it has to clear.
 */
export const NumbSeconds = 0.2;
/** How close something has to be to count as hitting a post. */
export const PostRadius = 15;

/** How long a window the reported rate is averaged over. */
export const RateWindow = 3;

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

import type { Depth, Painter } from './depth.js';
import { fill, words } from '../i18n/index.js';

export class Dummies {
  private posts: Post[] = [];
  private clock = 0;
  private felled = 0;
  /** Where the arc was stood up, kept rather than averaged back out of the posts. */
  private originX = 0;
  private originY = 0;
  /**
   * When each of the recent hits landed, oldest first, trimmed to `RateWindow`.
   *
   * Timestamps rather than a running counter, because a counter divided by elapsed time is a
   * *lifetime average* — it keeps sinking while you stand still reading it, and swapping a weapon
   * barely moves it. What the bench is for is comparing two builds back to back, which needs the
   * number to be about the last few seconds and nothing else.
   */
  private struck: number[] = [];
  /** See `capped`. */
  private cappedFor = 0;

  /**
   * Stands the four up in front of a point.
   *
   * "In front" is **down the screen**: 历练 is a plane seen from above, so the near side of the
   * body is the one toward the viewer, and posts placed above it would be read as standing behind
   * the pet. Which also keeps them clear of the readout, which goes along the top.
   */
  place(x: number, y: number): void {
    this.posts = [];
    this.clock = 0;
    this.felled = 0;
    this.struck = [];
    this.cappedFor = 0;
    this.originX = x;
    this.originY = y;
    for (let i = 0; i < PostCount; i++) {
      // Spread evenly across the arc, measured from its middle rather than from one end, so an
      // even count straddles straight-ahead instead of standing one post directly on it.
      const offset = (i / (PostCount - 1) - 0.5) * Spread;
      const angle = Math.PI / 2 + offset;
      this.posts.push({
        x: x + Math.cos(angle) * Range,
        y: y + Math.sin(angle) * Range,
        down: 0,
        shake: 0,
        lean: 0,
      });
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
    // Eased toward 1 while there is nothing standing that can be hit, and back down otherwise,
    // over about a second.
    const full = this.posts.length > 0 && this.posts.every((p) => p.down > 0);
    const toward = full ? 1 : 0;
    this.cappedFor += (toward - this.cappedFor) * Math.min(1, dt * 1.6);

    // Drop what has aged out of the window. From the front, because the list is in order.
    const cutoff = this.clock - RateWindow;
    let drop = 0;
    while (drop < this.struck.length && this.struck[drop] < cutoff) drop++;
    if (drop > 0) this.struck.splice(0, drop);
  }

  /**
   * Hits a second over the last few seconds.
   *
   * Divided by how long the yard has actually been open while that is shorter than the window,
   * otherwise the first three seconds would read low for a reason that has nothing to do with the
   * build — the bench would be telling you about its own warm-up.
   */
  get rate(): number {
    const over = Math.min(RateWindow, Math.max(0.5, this.clock));
    return this.struck.length / over;
  }

  /** How long the yard has been open, for the readout. */
  get elapsed(): number {
    return this.clock;
  }

  /**
   * How much of the recent past the bench spent with nothing left to hit, 0 to 1.
   *
   * The one state in which `rate` is not a measurement but a **floor**: every post numb means the
   * build landed something it had nowhere to put, and the number stops rising however much harder
   * it hits. Smoothed rather than read instantaneously, because at four posts a strong build
   * flickers in and out of it several times a second and a readout that blinked would be ignored.
   */
  get capped(): number {
    return this.cappedFor;
  }

  // --- Battlefield -------------------------------------------------------------------------

  /**
   * All four, always.
   *
   * A numb post is still a post standing in the ground. Filtering it out here is what used to make
   * a 飞剑 lose its mark on every hit and go wandering between flurries — a 邪气 it is cutting does
   * not blink out between strikes, so neither may these.
   */
  targets(): { x: number; y: number }[] {
    return this.posts.map((p) => ({ x: p.x, y: p.y }));
  }

  closest(x: number, y: number, within: number): { x: number; y: number } | null {
    let best: Post | null = null;
    let closest = within;
    for (const post of this.posts) {
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
  /**
   * Nothing. 木人桩 are posts in the ground — they do not get thrown.
   *
   * Which makes the yard the one place 山崩's knockback cannot be judged, and that is worth
   * knowing rather than faking: a post that flew would say the move does something to a 邪气 that
   * it does not, because a 邪气 walks back and a post was never going anywhere.
   */
  shove(): void {}

  /**
   * Nothing, three times over. 木人桩 are posts: they do not get held where they stand because
   * they were never going anywhere, they do not burn, and nothing in the yard has 护体 to give
   * back.
   *
   * Which makes the yard the one place three of the ten cannot be judged — worth knowing rather
   * than faking, the same way the knockback already is.
   */
  root(): void {}

  burn(): void {}

  mend(): void {}

  cull(x: number, y: number, radius: number, most: number, damage = 1): number {
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
      post.down = NumbSeconds;
      post.shake = 1;
      post.lean = Math.random() < 0.5 ? -1 : 1;
      // Counted by weight, so the readout says what a grade is worth rather than how often it swung.
      this.felled += damage;
      for (let i = 0; i < damage; i++) this.struck.push(this.clock);
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

    // The arc the four stand on, very faint. Only the span they occupy, not a closed ring: a full
    // circle would claim the yard measures something all the way round, and it no longer does.
    if (this.posts.length > 0) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      context.lineWidth = 1;
      context.setLineDash([5, 9]);
      const centre = this.centre();
      context.beginPath();
      context.arc(centre.x, centre.y, Range, Math.PI / 2 - Spread / 2, Math.PI / 2 + Spread / 2);
      context.stroke();
      context.setLineDash([]);
    }

    context.restore();
  }

  /**
   * One post.
   *
   * Split out of `draw` for the same reason the trial split its 邪气: the yard draws 山崩,
   * and a stone standing in front of a post has to be painted after it.
   */
  drawPost(context: CanvasRenderingContext2D, index: number): void {
    const post = this.posts[index];
    if (!post) return;
    const felled = post.down > 0;
    const tip = felled ? 1 - post.down / NumbSeconds : 1;
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
    // It **rocks**, it does not fall. At 0.15s a fall-and-rise is four frames each way, which does
    // not read as falling over — it reads as the post glitching. A hard knock away from the blow
    // that springs back is what a struck post actually does, and it is legible at that length.
    context.rotate(felled ? post.lean * (1 - tip) * 0.34 + wobble : wobble);
    // Rocked back on its heel with it, so the knock has some weight behind it rather than being
    // a pure rotation about a point.
    context.translate(0, felled ? (1 - tip) * 2.5 : 0);
    context.globalAlpha = felled ? 0.72 + 0.28 * tip : 1;

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

  /**
   * The output readout, along the top of the screen.
   *
   * **This is the reason the yard exists now.** Watching an effect tells you what it looks like;
   * it does not tell you whether the build you just assembled hits harder than the one before it,
   * and that is the question a bench is for. A rate over the last few seconds answers it directly:
   * swap a weapon, wait three seconds, read it again.
   *
   * Drawn last and in screen space rather than in the yard, so it cannot end up behind a 石柱 or
   * slide off with the pet when it hops.
   */
  drawReadout(context: CanvasRenderingContext2D, width: number): void {
    const w = words().trial;
    const middle = width / 2;
    context.save();
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic';

    // A plate behind it. The overlay is transparent, so a bare number sits on whatever wallpaper
    // happens to be there and is unreadable against about half of them.
    context.fillStyle = 'rgba(10, 12, 18, 0.55)';
    context.beginPath();
    context.roundRect(middle - 92, 16, 184, 86, 12);
    context.fill();

    context.fillStyle = 'rgba(255, 255, 255, 0.5)';
    context.font = '500 13px system-ui, sans-serif';
    context.fillText(w.yardOutput, middle, 40);

    // One decimal, because the difference between two builds is routinely under a whole hit a
    // second and rounding it away would make the bench say they are the same.
    // Amber once the bench is spending a quarter of its time with nothing left to hit: at that
    // point the number below is a floor, and saying so is the difference between an instrument and
    // a decoration.
    context.fillStyle = this.capped > 0.25 ? '#ffbf6a' : '#ffffff';
    context.font = '600 26px system-ui, sans-serif';
    context.fillText(fill(w.yardRate, { rate: this.rate.toFixed(1) }), middle, 70);

    context.fillStyle = 'rgba(255, 255, 255, 0.45)';
    context.font = '400 12px system-ui, sans-serif';
    context.fillText(
      fill(w.yardTotal, { hits: String(this.felled), seconds: String(Math.floor(this.clock)) }),
      middle,
      92,
    );
    context.restore();
  }

  /** What the readout covers, so the dirty rect can include it. */
  readoutBounds(width: number): Rect {
    return { x: width / 2 - 92, y: 16, width: 184, height: 86 };
  }

  private readonly paintPost: Painter = (context, index) => this.drawPost(context, index);

  /** Queues every post for depth sorting, the same way the trial queues 邪气. */
  collect(depth: Depth): void {
    for (let i = 0; i < this.posts.length; i++) depth.add(this.posts[i].y, this.paintPost, i);
  }

  /**
   * Where the arc was stood up.
   *
   * Stored rather than averaged back out of the posts. It used to be the average, which was exact
   * while they sat in closed rings around the body and is simply wrong for an arc — the mean of
   * four points on a 109° arc lands most of the way out to the arc itself.
   */
  private centre(): { x: number; y: number } {
    return { x: this.originX, y: this.originY };
  }
}
