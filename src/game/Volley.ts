/**
 * 御符 — charms thrown as an attack, and the explosions where they land.
 *
 * Throw the pet hard enough and a handful of talismans go with it, fly to the edge of the desktop
 * and detonate against it. That is the whole feature, and it exists because the charm hoard had no
 * bottom to it.
 *
 * **The problem it solves is not "charms have too few uses".** The odds on a realm cap at certainty
 * at a hundred banked, and a successful crossing spends nothing, so past the first hundred a charm
 * was worth *exactly zero* — against a supply of about four thousand a run. Three quarters of every
 * charm the pet ever fetched was already worthless.
 *
 * Which is why this deliberately **pays nothing back**. Trying to make the surplus *useful* was the
 * wrong instinct: a sink that returns progress becomes the optimal thing to do, and "throw your pet
 * at the wall repeatedly" is not a play pattern worth designing toward. A sink that returns
 * *spectacle* costs the economy nothing and gives a number that was already dead something to be.
 *
 * Two rules it has to keep:
 *
 * **It only ever spends the surplus.** Never the hundred that keeps the next realm safe. This is the
 * same mistake the automatic stages made — convenience drawn from the insurance pot, with the
 * spending happening where the player was not looking — and it is worse here, because a throw is a
 * playful gesture and a hidden penalty on one is a trap.
 *
 * **It is free when you are flush and silent when you are not.** Nothing tells you off for throwing
 * the pet with an empty hoard; the throw just works the way it always did.
 */
import { clear } from '../slime/colour.js';
import { drawTalisman } from './Glyphs.js';

/**
 * How hard the hand has to move for charms to go with the throw, in pixels per second, and where
 * the count stops climbing.
 *
 * Off the *raw* hand speed rather than the velocity the body leaves with, which is that number
 * scaled by `ThrowTransfer` and clamped — two transformations that exist to make the pet feel
 * right, and neither of which has anything to say about how hard somebody meant to throw it.
 *
 * Eighteen hundred is well clear of putting the pet down: a deliberate flick runs two to four
 * thousand, and placing it somewhere gently is under three hundred.
 */
export const FlingThreshold = 1800;
export const FlingFull = 3600;
/** How many go out, at the threshold and at full strength. */
export const LeastCharms = 1;
export const MostCharms = 5;

/** How fast they leave, and how much they spread around the throw direction. */
const Speed = 1250;
const SpreadRadians = 0.5;
/** Light, because a talisman flies rather than falls — but not zero, or it reads as a laser. */
const Gravity = 260;
/** How long an explosion lasts, in seconds. */
const BlastSeconds = 0.5;
/** How far it reaches, in pixels. */
const BlastReach = 86;
/**
 * How far inside the edge the burst is centred, as a fraction of its reach.
 *
 * Pinning it exactly to the pixel it struck is what actually happened and throws half the flash off
 * the canvas — correct, and it halves the one frame anybody sees. Nudged in, most of it lands on
 * screen while the bright core still sits against the wall, which is what reads as an impact.
 */
const BlastInset = 0.42;
/** Charms carry these, same as the ones that fall out of the keyboard do not. */
const Marks = ['敕', '令', '雷', '斩', '镇', '破'];

/** How many charms a throw of this speed sends out. Zero below the threshold. */
export function charmsForFling(speed: number): number {
  if (speed < FlingThreshold) return 0;
  const hard = Math.min(1, (speed - FlingThreshold) / (FlingFull - FlingThreshold));
  return LeastCharms + Math.round((MostCharms - LeastCharms) * hard);
}

interface Flying {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  mark: string;
}

interface Blast {
  x: number;
  y: number;
  /** 0 at the moment of impact, 1 when it is gone. */
  life: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Volley {
  private flying: Flying[] = [];
  private blasts: Blast[] = [];

  /** True while anything is in the air or still burning, so the loop knows not to stand down. */
  get busy(): boolean {
    return this.flying.length > 0 || this.blasts.length > 0;
  }

  get inFlight(): number {
    return this.flying.length;
  }

  /**
   * Fires `count` at a point, flat and fast.
   *
   * Separate from `launch` because the two have different jobs: a thrown 御符 inherits the hand's
   * velocity and arcs, while covering fire has to actually arrive. Aiming is done here rather than
   * by the caller working out a velocity, so the speed stays this class's business. Callers who
   * want several talismans to go several ways pass one target each and `count` of 1 — the fan in
   * `launch` is for fireworks, and it is far too wide to hit anything with.
   */
  fireAt(count: number, x: number, y: number, tx: number, ty: number): void {
    const away = Math.hypot(tx - x, ty - y) || 1;
    this.launch(count, x, y, ((tx - x) / away) * Speed, ((ty - y) / away) * Speed);
  }

  /**
   * Sends `count` charms out from (x, y), fanned around the direction of the throw.
   *
   * Fanned rather than launched along one line, because several charms on exactly the same heading
   * arrive at the same pixel and read as one charm that got thicker.
   */
  launch(count: number, x: number, y: number, vx: number, vy: number): void {
    const heading = Math.atan2(vy, vx);
    for (let i = 0; i < count; i++) {
      // Spread evenly across the fan rather than randomly, so a throw of five never happens to put
      // four of them on top of each other.
      const across = count === 1 ? 0 : (i / (count - 1) - 0.5) * 2;
      const angle = heading + across * SpreadRadians;
      const speed = Speed * (0.88 + Math.random() * 0.24);
      this.flying.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI * 2,
        mark: Marks[Math.floor(Math.random() * Marks.length)],
      });
    }
  }

  /**
   * Flies everything on, and detonates whatever reached an edge.
   *
   * The edge is the work area this canvas covers, which is the desktop — so "it hit the edge of the
   * screen" needs no window list and no compositor question, just the canvas size.
   */
  update(
    dt: number,
    width: number,
    height: number,
    /**
     * Anything a talisman should detonate on before it reaches a wall, and what counts as a hit.
     *
     * Passed in rather than known about. This class is the pet's 御符 throw as well as a trial's
     * covering fire, and it has no business knowing that trials exist — so the caller answers
     * “is there something at this pixel” and owns what counts as close enough.
     */
    hit?: { at: (x: number, y: number) => boolean },
  ): void {
    const survivors: Flying[] = [];
    for (const charm of this.flying) {
      charm.vy += Gravity * dt;
      charm.x += charm.vx * dt;
      charm.y += charm.vy * dt;
      charm.angle += charm.spin * dt;

      // Targets before walls: something standing against the edge should be struck rather than
      // watched as the talisman sails past it into the wall behind.
      if (hit && hit.at(charm.x, charm.y)) {
        this.blasts.push({ x: charm.x, y: charm.y, life: 0 });
        continue;
      }
      const offLeft = charm.x <= 2;
      const offRight = charm.x >= width - 2;
      const offTop = charm.y <= 2;
      const offBottom = charm.y >= height - 2;
      if (offLeft || offRight || offTop || offBottom) {
        const inset = BlastReach * BlastInset;
        this.blasts.push({
          // Clamped to the wall it struck and then nudged back inside it — see `BlastInset`.
          x: offLeft ? inset : offRight ? width - inset : Math.min(width, Math.max(0, charm.x)),
          y: offTop ? inset : offBottom ? height - inset : Math.min(height, Math.max(0, charm.y)),
          life: 0,
        });
        continue;
      }
      survivors.push(charm);
    }
    this.flying = survivors;

    const burning: Blast[] = [];
    for (const blast of this.blasts) {
      blast.life += dt / BlastSeconds;
      if (blast.life < 1) burning.push(blast);
    }
    this.blasts = burning;
  }

  bounds(): Rect | null {
    if (!this.busy) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const take = (x: number, y: number, reach: number) => {
      left = Math.min(left, x - reach);
      top = Math.min(top, y - reach);
      right = Math.max(right, x + reach);
      bottom = Math.max(bottom, y + reach);
    };
    // A charm in flight covers the distance between where it was and where it is, because at this
    // speed that is most of a body-length per frame — the same reason the dust is measured off both
    // ends of its streak rather than off its head.
    for (const charm of this.flying) take(charm.x, charm.y, 40);
    for (const blast of this.blasts) take(blast.x, blast.y, BlastReach + 6);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  draw(context: CanvasRenderingContext2D, colour: string): void {
    for (const blast of this.blasts) {
      const out = blast.life;
      const fade = 1 - out;
      context.save();
      context.translate(blast.x, blast.y);

      // The flash, which is most of it. White at the centre going to the realm's colour, and gone
      // in half a second — an explosion that lingers is a smoke cloud.
      const reach = BlastReach * (0.3 + 0.7 * out);
      const flash = context.createRadialGradient(0, 0, 0, 0, 0, reach);
      flash.addColorStop(0, '#ffffff');
      flash.addColorStop(0.45, colour);
      flash.addColorStop(1, clear(colour));
      context.globalAlpha = fade * fade * 0.85;
      context.fillStyle = flash;
      context.beginPath();
      context.arc(0, 0, reach, 0, Math.PI * 2);
      context.fill();

      // And sparks, thrown along the wall rather than in every direction: this went off *against*
      // something, and debris off a flat surface goes sideways.
      context.globalAlpha = fade * 0.8;
      context.strokeStyle = '#ffffff';
      context.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + blast.x * 0.01;
        const from = reach * 0.35;
        const to = reach * (0.7 + 0.5 * out);
        context.lineWidth = 2.6 * fade;
        context.beginPath();
        context.moveTo(Math.cos(angle) * from, Math.sin(angle) * from);
        context.lineTo(Math.cos(angle) * to, Math.sin(angle) * to);
        context.stroke();
      }
      context.restore();
    }

    for (const charm of this.flying) {
      context.save();
      context.translate(charm.x, charm.y);
      // A streak behind it, in the direction of travel, for the same reason the dust has one: at
      // this speed a charm crosses more than its own length between frames, and without the streak
      // it reads as a series of stamps rather than as something moving.
      context.globalAlpha = 0.5;
      context.lineCap = 'round';
      context.lineWidth = 7;
      const tail = context.createLinearGradient(0, 0, -charm.vx * 0.04, -charm.vy * 0.04);
      tail.addColorStop(0, colour);
      tail.addColorStop(1, clear(colour));
      context.strokeStyle = tail;
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(-charm.vx * 0.04, -charm.vy * 0.04);
      context.stroke();

      context.rotate(charm.angle);
      context.globalAlpha = 1;
      drawTalisman(context, charm.mark, colour, 1, 1.1);
      context.restore();
    }
  }
}
