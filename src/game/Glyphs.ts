/**
 * The keys, once they are out of the keyboard and on the desktop.
 *
 * One pops out beside the slime when you type, arcs, lands, and sits there until the pet gets to
 * it or it fades. That is the whole of it — the throw is physics rather than a curve, so it
 * behaves the way the pet already does and needs no separate sense of weight.
 */
interface Glyph {
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left before it starts fading. Only counts down once it is on the ground. */
  life: number;
  landed: boolean;
}

/** Same gravity as the body, so the two read as being in the same world. */
const Gravity = 2100;
/** How long a landed glyph waits. Long enough to cross a screen for, short enough to feel fleeting. */
const LifeSeconds = 14;
const FadeSeconds = 1.2;
const Size = 24;
/**
 * The most that can be on screen at once.
 *
 * Reached only if the pet is somehow not eating any of them; the spawn rate alone cannot get here.
 * It exists so that a bug upstream costs a tidy pile rather than an unbounded one.
 */
const MaxGlyphs = 6;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Glyphs {
  private items: Glyph[] = [];

  get count(): number {
    return this.items.length;
  }

  /**
   * Throws a key out beside the slime.
   *
   * Upward and outward, never straight down: the arc is what makes it read as having been knocked
   * loose by the typing rather than as having been placed there.
   *
   * It is thrown *far* on purpose. The first pass dropped keys about fifty pixels away, which put
   * every one of them inside the pet's own reach — they were eaten the instant they landed, and
   * the errand that is supposed to be the whole point of the mechanic never happened. The pet has
   * to visibly go and get it or there is nothing to watch.
   */
  spawn(char: string, x: number, y: number): void {
    if (this.items.length >= MaxGlyphs) return;
    const away = Math.random() < 0.5 ? -1 : 1;
    this.items.push({
      char,
      x,
      y,
      vx: away * (190 + Math.random() * 240),
      vy: -(330 + Math.random() * 160),
      life: LifeSeconds,
      landed: false,
    });
  }

  update(dt: number, ground: number, width: number): void {
    for (const glyph of this.items) {
      if (!glyph.landed) {
        glyph.vy += Gravity * dt;
        glyph.x += glyph.vx * dt;
        glyph.y += glyph.vy * dt;
        if (glyph.x < Size || glyph.x > width - Size) {
          glyph.vx = -glyph.vx;
          glyph.x = Math.min(Math.max(glyph.x, Size), width - Size);
        }
        if (glyph.y >= ground) {
          glyph.y = ground;
          glyph.landed = true;
        }
      } else {
        glyph.life -= dt;
      }
    }
    this.items = this.items.filter((glyph) => glyph.life > -FadeSeconds);
  }

  /** The closest glyph that has landed, or null. Ones still in the air are not worth chasing. */
  nearest(x: number): Glyph | null {
    let best: Glyph | null = null;
    let bestDistance = Infinity;
    for (const glyph of this.items) {
      if (!glyph.landed || glyph.life <= 0) continue;
      const distance = Math.abs(glyph.x - x);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = glyph;
      }
    }
    return best;
  }

  /** Eats everything within `reach` of the given point, and says how many that was. */
  eatNear(x: number, y: number, reach: number): number {
    const before = this.items.length;
    this.items = this.items.filter(
      (glyph) => Math.hypot(glyph.x - x, glyph.y - y) > reach || !glyph.landed,
    );
    return before - this.items.length;
  }

  /** True while anything is moving or fading, so the loop knows not to stand down. */
  get busy(): boolean {
    return this.items.length > 0;
  }

  /** What has to be repainted, or null. Measured off the drawn size, not guessed at. */
  bounds(): Rect | null {
    if (this.items.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const glyph of this.items) {
      left = Math.min(left, glyph.x - Size);
      top = Math.min(top, glyph.y - Size);
      right = Math.max(right, glyph.x + Size);
      bottom = Math.max(bottom, glyph.y + Size);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  draw(context: CanvasRenderingContext2D): void {
    for (const glyph of this.items) {
      const fade = glyph.life >= 0 ? 1 : 1 + glyph.life / FadeSeconds;
      if (fade <= 0) continue;
      const half = Size / 2;
      context.save();
      context.globalAlpha = 0.92 * fade;
      context.translate(glyph.x, glyph.y);

      context.beginPath();
      context.roundRect(-half, -half, Size, Size, 6);
      context.fillStyle = '#fdfdfb';
      context.fill();
      context.lineWidth = 1.5;
      context.strokeStyle = '#b9bdc4';
      context.stroke();

      context.fillStyle = '#3a4048';
      context.font = '600 13px ui-monospace, "Cascadia Mono", monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(glyph.char, 0, 1);
      context.restore();
    }
  }
}
