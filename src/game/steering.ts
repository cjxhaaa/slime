/**
 * WASD —— which way you are holding, and nothing else.
 *
 * 历练 used to steer by pointing: the body hopped toward the cursor. That worked while the mouse
 * had nothing else to do, and it stops working the moment there is a panel to click — you cannot
 * reach for a button without walking into it, because reaching for the button **is** the walk.
 *
 * So the hand and the feet are separated. The keys move you; the mouse is free for the 行囊.
 *
 * ## It still hops
 *
 * The keys do not replace `pursuit`, they feed it. A held direction becomes a point one full
 * stretch ahead of the body, and the hop planner does what it already did — crouch, launch, arch,
 * land. Holding a direction is therefore a *chain* of hops rather than a glide, which is the gait
 * somebody asked for and the thing that makes the mode read as a creature rather than a cursor.
 *
 * Aiming at a point that moves with the body also means the planner never sees itself as having
 * arrived, so it keeps going for exactly as long as the key is down.
 *
 * ## Why the keys have to be cleared on blur
 *
 * A keyup that never arrives is a key that is held forever. Alt-tab away mid-hop with D down and
 * the browser delivers no keyup at all, so the body would run east until the run ended — and the
 * player, who is now in another window, cannot do anything about it. Every path out of this
 * module's attention (blur, losing focus, the run ending) drops everything.
 *
 * This is not a corner case. The overlay is click-through, so anything the player clicks takes
 * focus away from it, and that is the ordinary way to leave rather than an accident.
 */
import { MaxReach } from './pursuit.js';

/** The four, and the arrows as synonyms. */
const KEYS: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyS: { x: 0, y: 1 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowRight: { x: 1, y: 0 },
};

/** True for a key this cares about, so the caller knows whether to swallow it. */
export function steers(code: string): boolean {
  return code in KEYS;
}

export class Steering {
  private held = new Set<string>();

  /** Returns true when the key was one of ours, so the caller can stop the browser acting on it. */
  press(code: string): boolean {
    if (!steers(code)) return false;
    this.held.add(code);
    return true;
  }

  release(code: string): boolean {
    if (!steers(code)) return false;
    this.held.delete(code);
    return true;
  }

  /** Everything up. See the note above — this is the one that stops a key being held forever. */
  clear(): void {
    this.held.clear();
  }

  get moving(): boolean {
    return this.held.size > 0;
  }

  /**
   * The held direction as a unit vector, or null when nothing is held.
   *
   * Normalised, so that holding W and D is not **1.41 times faster** than holding W. Diagonal
   * speed-up is the oldest bug in the genre and it is one line to not have.
   */
  heading(): { x: number; y: number } | null {
    let x = 0;
    let y = 0;
    for (const code of this.held) {
      const push = KEYS[code];
      x += push.x;
      y += push.y;
    }
    // Opposite keys cancel, which is the right answer: holding A and D is not holding anything.
    const length = Math.hypot(x, y);
    if (length < 0.001) return null;
    return { x: x / length, y: y / length };
  }

  /**
   * Where to tell `pursue` to go, from where the body is now.
   *
   * One full stretch ahead rather than a fixed distant point: `planHop` reads the distance to
   * decide how big a hop to plan, and a target a thousand pixels away would plan the same maximum
   * hop whatever you did. At exactly `MaxReach` the answer is a full bound, every time, and the
   * target moves with the body so it is never reached.
   */
  target(x: number, y: number): { x: number; y: number } | null {
    const way = this.heading();
    if (!way) return null;
    return { x: x + way.x * MaxReach, y: y + way.y * MaxReach };
  }
}
