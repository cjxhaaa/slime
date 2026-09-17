/**
 * The keys, once they are out of the keyboard and on the desktop.
 *
 * One pops out beside the slime when you type, arcs, lands, and sits there until the pet gets to
 * it or it fades. That is the whole of it — the throw is physics rather than a curve, so it
 * behaves the way the pet already does and needs no separate sense of weight.
 */

import { clear } from '../slime/colour';
interface Glyph {
  char: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left before it starts fading. Only counts down once it is on the ground. */
  life: number;
  landed: boolean;
  /** Which way up it is. Tumbles in the air, settles upright and sways where it lands. */
  spin: number;
  /** Per-slip offset so a row of them does not bob in unison like a chorus line. */
  phase: number;
}

/** Same gravity as the body, so the two read as being in the same world. */
const Gravity = 2100;
/** How long a landed glyph waits. Long enough to cross a screen for, short enough to feel fleeting. */
const LifeSeconds = 14;
const FadeSeconds = 1.2;
/**
 * A talisman slip: narrow and upright, the shape of a paper charm rather than a keycap.
 *
 * The first pass drew a rounded white square with the letter in a monospace face, which is exactly
 * what it looked like — a key that had fallen off a keyboard. Nothing about it said this was
 * something a cultivating slime had condensed out of the air.
 */
export const SlipWidth = 19;
export const SlipHeight = 28;
/** How far the glow reaches, and therefore what has to be repainted around one. */
export const HaloReach = 34;
/** Clearance kept from the screen edges while one is in the air. */
const Margin = 16;
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
      spin: (Math.random() - 0.5) * 0.6,
      phase: Math.random() * Math.PI * 2,
    });
  }

  /** Seconds since this set was created, for the drift of a landed slip. */
  private clock = 0;

  update(dt: number, ground: number, width: number): void {
    this.clock += dt;
    for (const glyph of this.items) {
      if (!glyph.landed) {
        glyph.vy += Gravity * dt;
        glyph.x += glyph.vx * dt;
        glyph.y += glyph.vy * dt;
        // Tumbling, and faster the harder it was thrown.
        glyph.spin += glyph.vx * dt * 0.004;
        if (glyph.x < Margin || glyph.x > width - Margin) {
          glyph.vx = -glyph.vx;
          glyph.x = Math.min(Math.max(glyph.x, Margin), width - Margin);
        }
        if (glyph.y >= ground) {
          glyph.y = ground;
          glyph.landed = true;
          glyph.spin = 0;
        }
      } else {
        glyph.life -= dt;
      }
    }
    this.items = this.items.filter((glyph) => glyph.life > -FadeSeconds);
  }

  /**
   * The closest landed charm, or null. No distance limit: a charm is worth going for wherever it
   * is, and the pet crossing the screen to fetch one is the behaviour, not a bug in it.
   *
   * Ones still in the air are skipped because they have nowhere to be walked to yet, and ones
   * already fading are skipped because arriving to watch something vanish is worse than not going.
   */
  nearest(x: number): Glyph | null {
    let best: Glyph | null = null;
    let bestDistance = Infinity;
    for (const glyph of this.items) {
      if (!glyph.landed || glyph.life <= 0) continue;
      const distance = Math.abs(glyph.x - x);
      if (distance <= bestDistance) {
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
      left = Math.min(left, glyph.x - HaloReach);
      top = Math.min(top, glyph.y - HaloReach);
      right = Math.max(right, glyph.x + HaloReach);
      bottom = Math.max(bottom, glyph.y + HaloReach);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * A paper charm, not a keycap.
   *
   * Yellow paper and cinnabar ink is the shape everyone already reads as a talisman, and it does
   * the two jobs a small object on an unknown desktop background has to do: the warm paper stands
   * off a dark wallpaper, and the halo — in the pet's own realm colour, so the charm is visibly
   * *its* — stands off a pale one.
   *
   * Everything here is drawn from primitives, same as the pet. There is still no art in this repo.
   */
  draw(context: CanvasRenderingContext2D, auraColour: string): void {
    for (const glyph of this.items) {
      const fade = glyph.life >= 0 ? 1 : 1 + glyph.life / FadeSeconds;
      if (fade <= 0) continue;

      // A landed charm is not inert: it rides a slow current, which is most of what separates
      // "hovering by its own power" from "dropped on the floor".
      const drift = glyph.landed ? Math.sin(this.clock * 1.9 + glyph.phase) : 0;
      const lean = glyph.landed ? drift * 0.05 : glyph.spin;
      const breath = 0.8 + 0.2 * Math.sin(this.clock * 2.6 + glyph.phase * 1.7);

      context.save();
      context.translate(glyph.x, glyph.y + drift * 2.2);
      context.rotate(lean);
      drawTalisman(context, glyph.char, auraColour, fade, breath);
      context.restore();
    }
  }
}

/**
 * One charm, centred on the current origin. The caller owns the transform.
 *
 * Extracted from the loop above because the realm breakthrough needs the same object: eight of
 * these wheel out and close around the body, and drawing a second, similar-looking charm somewhere
 * else would have been two things to keep in step. `fade` scales every alpha in here, and `breath`
 * is the slow pulse of the glow — 0.8 to 1 is the range the falling ones use.
 */
export function drawTalisman(
  context: CanvasRenderingContext2D,
  char: string,
  auraColour: string,
  fade: number,
  breath: number,
): void {
  // The glow, first and underneath. It breathes slightly out of step with any drift the caller
  // applies, so the two never line up into a single obvious pulse.
  const halo = context.createRadialGradient(0, 0, SlipHeight * 0.3, 0, 0, HaloReach);
  halo.addColorStop(0, auraColour);
  halo.addColorStop(1, clear(auraColour));
  context.globalAlpha = 0.4 * fade * breath;
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, 0, HaloReach, 0, Math.PI * 2);
  context.fill();

  // A rim of the pet's own qi, hugging the edge. The halo alone is diffuse enough to vanish
  // against a pale wallpaper, and without this the charm reads as a piece of paper lying on the
  // floor rather than as one something has charged. The paper covers its inner half, leaving a
  // tight outer glow.
  context.globalAlpha = 0.6 * fade * breath;
  context.lineWidth = 2.5;
  context.strokeStyle = auraColour;
  context.beginPath();
  context.roundRect(-SlipWidth / 2 - 1, -SlipHeight / 2 - 1, SlipWidth + 2, SlipHeight + 2, 4);
  context.stroke();

  // The paper. Warm at the top edge and deeper at the bottom, the way a hanging slip catches
  // light — a flat fill reads as a sticker.
  context.globalAlpha = 0.95 * fade;
  const paper = context.createLinearGradient(0, -SlipHeight / 2, 0, SlipHeight / 2);
  paper.addColorStop(0, '#fff3cf');
  paper.addColorStop(1, '#efd79a');
  context.beginPath();
  context.roundRect(-SlipWidth / 2, -SlipHeight / 2, SlipWidth, SlipHeight, 3);
  context.fillStyle = paper;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(176, 132, 52, 0.85)';
  context.stroke();

  // Two cinnabar strokes, above and below, where the border script would be. They are what
  // stop the middle of the slip reading as a blank label with a letter typed on it.
  context.strokeStyle = 'rgba(178, 54, 40, 0.75)';
  context.lineWidth = 1.4;
  context.lineCap = 'round';
  for (const y of [-SlipHeight / 2 + 5, SlipHeight / 2 - 5]) {
    context.beginPath();
    context.moveTo(-SlipWidth / 2 + 4.5, y);
    context.lineTo(SlipWidth / 2 - 4.5, y);
    context.stroke();
  }

  // The key itself, in cinnabar, in a serif face. The letter is the one thing here that has to
  // stay plainly legible — it is the point of the charm, and it is a letter you really pressed.
  context.fillStyle = '#9d2f22';
  context.font = '700 15px Georgia, "Songti SC", "SimSun", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(char, 0, 0.5);
}
