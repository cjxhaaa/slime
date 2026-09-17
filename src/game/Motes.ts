/**
 * The dust every keystroke knocks loose.
 *
 * One per key, which is what makes the pet look like it is eating your work rather than
 * occasionally noticing it. They carry no letter — that is the whole reason there can be one for
 * every key: a nameless speck says "you typed" and nothing else, where a letter would put a
 * password on the desktop one character at a time.
 *
 * They are also the cheap half of the pair. A mote is a filled circle that drifts in and is gone in
 * under a second; the keycaps in `Glyphs` are the rare, expensive ones the pet has to walk to.
 */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left before it gives up and fades, if it somehow never arrives. */
  life: number;
  size: number;
}

/** How hard a mote is pulled towards the body, in pixels per second squared. */
const Pull = 900;
/** Drag, so they curve in rather than orbiting forever. */
const Drag = 2.6;
const LifeSeconds = 2.4;
/** Where they appear, as a multiple of the body radius. Outside it, never on top of it. */
const SpawnNear = 1.9;
const SpawnFar = 3.4;
/**
 * The most that can exist at once.
 *
 * Someone leaning on a key is not typing, and should not be able to turn the desktop into a
 * snowstorm or the frame budget into a problem. Typing cannot get anywhere near this — the input
 * poll only ever asks for two at a time — so the whole number is headroom for a realm
 * breakthrough, which spends two seconds pulling a wave in every 160ms from up to five hundred
 * pixels out and has about sixty in the air at the peak.
 */
const MaxMotes = 96;
/**
 * How much of a mote's travel is drawn behind it, in seconds.
 *
 * Off the velocity rather than off where it was last frame. A remembered position looks like the
 * obvious way to do this and is a frame-rate bug: the streak would be three times as long on the
 * 20Hz tier the loop drops to, which is the one place nothing should suddenly change length.
 */
const TailSeconds = 0.05;

/**
 * How much wider a realm breakthrough's inrush is than a keystroke's speck.
 *
 * Exported rather than written at the call site because the checks assert against it, and a spread
 * that drifted apart from the one being tested would be a test of nothing.
 *
 * It was 3.2 first, which put the cloud up to five hundred pixels out. Seventy specks over that
 * much desktop is a light dusting of the whole screen, not something arriving at the pet.
 */
export const BreakthroughSpread = 2.2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Motes {
  private items: Mote[] = [];

  get count(): number {
    return this.items.length;
  }

  /** True while any are in flight, so the loop knows not to stand down. */
  get busy(): boolean {
    return this.items.length > 0;
  }

  /** Knocks `count` specks loose around a body at (x, y) with the given radius. */
  spawn(count: number, x: number, y: number, radius: number, spread = 1): void {
    for (let i = 0; i < count && this.items.length < MaxMotes; i++) {
      const angle = Math.random() * Math.PI * 2;
      // `spread` widens the ring they appear on. A keystroke drops one just outside the body; a
      // breakthrough pulls a cloud in from much further out, and that is the same code.
      const distance = radius * spread * (SpawnNear + Math.random() * (SpawnFar - SpawnNear));
      this.items.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        // A little sideways drift so they arc in instead of falling down a straight line.
        vx: -Math.sin(angle) * (30 + Math.random() * 70),
        vy: Math.cos(angle) * (30 + Math.random() * 70),
        life: LifeSeconds,
        // Bigger the further out they start. A speck that has to cross most of a screen and still
        // read as part of a stream cannot be the same three pixels as one dropped next to the body.
        size: (2 + Math.random() * 2.4) * (0.9 + 0.22 * spread),
      });
    }
  }

  /**
   * Draws everything towards the body and says how many arrived.
   *
   * The count is the caller's cue for both the qi and the flinch: one absorbed speck is one small
   * dent in the membrane where it went in.
   */
  update(dt: number, targetX: number, targetY: number, reach: number): number {
    let absorbed = 0;
    const survivors: Mote[] = [];
    for (const mote of this.items) {
      const dx = targetX - mote.x;
      const dy = targetY - mote.y;
      const distance = Math.hypot(dx, dy) || 1;
      mote.vx += (dx / distance) * Pull * dt;
      mote.vy += (dy / distance) * Pull * dt;
      const damping = Math.exp(-Drag * dt);
      mote.vx *= damping;
      mote.vy *= damping;
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.life -= dt;

      if (distance <= reach) {
        absorbed += 1;
        continue;
      }
      if (mote.life > 0) survivors.push(mote);
    }
    this.items = survivors;
    return absorbed;
  }

  /** The angle a mote came in from, for the dent it leaves. Null when none arrived this frame. */
  lastArrivalAngle: number | null = null;

  bounds(): Rect | null {
    if (this.items.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const mote of this.items) {
      // Both ends of the streak, not just the head, or the tail is left uncleared behind it.
      const tailX = mote.x - mote.vx * TailSeconds;
      const tailY = mote.y - mote.vy * TailSeconds;
      left = Math.min(left, Math.min(mote.x, tailX) - mote.size - 2);
      top = Math.min(top, Math.min(mote.y, tailY) - mote.size - 2);
      right = Math.max(right, Math.max(mote.x, tailX) + mote.size + 2);
      bottom = Math.max(bottom, Math.max(mote.y, tailY) + mote.size + 2);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * Painted in the body's own colour, because it is the same stuff going back in.
   *
   * Streaks rather than dots. Seventy specks converging from half a screen away were a scattering
   * of pinpricks with no direction in them — the pull was in the physics and nowhere on screen.
   * Dragging a short tail behind each one along its own velocity puts the direction back.
   *
   * A round-capped line of zero length draws as a circle, so a mote that has come to rest needs no
   * separate case.
   */
  draw(context: CanvasRenderingContext2D, colour: string): void {
    context.save();
    context.strokeStyle = colour;
    context.lineCap = 'round';
    for (const mote of this.items) {
      // Brightest on the way in, so the stream reads as being drawn rather than as scattering.
      const fade = Math.min(1, mote.life / (LifeSeconds * 0.6));
      context.globalAlpha = 0.85 * fade;
      context.lineWidth = mote.size * 2;
      context.beginPath();
      context.moveTo(mote.x - mote.vx * TailSeconds, mote.y - mote.vy * TailSeconds);
      context.lineTo(mote.x, mote.y);
      context.stroke();
    }
    context.restore();
  }
}
