/**
 * 历练 — the survivors run, and what makes each realm feel different to play.
 *
 * 邪气 drift in from the edges of the desktop toward the slime. What the slime does about them is
 * whatever it drafted — see `schools.ts` for the nine, and `Attacks.ts` for them running. You steer
 * by dragging, which is the gesture that already moved the pet, so the mode adds no controls.
 * Ninety seconds, then it is over.
 *
 * **It costs nothing but time.** No charms — those are realm insurance now, and a play mode that
 * quietly eats your 渡劫 odds is the same trap the automatic stages and the 御符 throw each set
 * once. Failing loses nothing either; you simply do not collect. A desk pet does not get to take
 * your progress because a fight went badly.
 *
 * What it pays is time survived rather than kills — see `harvest`, which is where that reason
 * lives.
 *
 * ## Why the realms play differently
 *
 * The obvious way to scale a fight by realm is to make the player stronger, and it is wrong on its
 * own: 大乘 would be 筑基 with the difficulty turned off, which is not a different experience, it
 * is the same experience without the interesting part.
 *
 * So **both sides scale hard, and the door stays a little ahead of the hand at every realm.** 筑基
 * is a handful of things closing in slowly. 大乘 is six hundred arrivals at twice the speed.
 * Neither can be won by standing still, and nothing else about them is alike.
 *
 * What changed when the schools arrived: the hand is no longer one number this file owns, it is a
 * drafted build that gets stronger over the run. So the door is not tuned against a column here
 * any more — it is tuned against a **whole run driven frame by frame in the checks**, with a real
 * build fighting it, and the thing being asserted is that standing still still loses. That is a
 * better guard than any arithmetic I could do on two columns, and it is the third time this
 * particular guard has had to be rebuilt.
 */
import { clear } from '../slime/colour.js';

/** How long a run lasts, in seconds. */
export const RunSeconds = 90;

/** 筑基 is realm 1, and the trial is gated there. This maps a realm onto 0 (筑基) through 6 (大乘). */
export function rung(realm: number): number {
  return Math.max(0, Math.min(6, realm - 1));
}

/**
 * Both sides of the fight, one row per rung — a table rather than a pair of exponentials.
 *
 * They *were* exponentials, and the formulas were the problem. A stepped `volley` over a smoothly
 * shortening `fire` makes the thing that actually matters — kills per second — come out as a
 * sawtooth, and whether the quotient of two exponentials stays monotone is a question you have to
 * do algebra to answer. Here the answer is a column you can read, and the checks walk it.
 *
 * `ratio` is kills per second over arrivals per second, and it is the whole design:
 *
 * | rung | realm | per volley | seconds | kills/s | arrivals/s | ratio | arrivals per run |
 * |---|---|---|---|---|---|---|---|
 * | 0 | 筑基 | 1 | 0.95 | 1.05 | 1.28 | **0.82** | 115 |
 * | 1 | 金丹 | 1 | 0.82 | 1.22 | 1.45 | 0.84 | 130 |
 * | 2 | 元婴 | 2 | 0.78 | 2.56 | 2.96 | 0.87 | 267 |
 * | 3 | 化神 | 2 | 0.66 | 3.03 | 3.42 | 0.89 | 308 |
 * | 4 | 炼虚 | 3 | 0.66 | 4.55 | 4.96 | 0.92 | 447 |
 * | 5 | 合体 | 3 | 0.56 | 5.36 | 5.70 | 0.94 | 513 |
 * | 6 | 大乘 | 4 | 0.56 | 7.14 | 7.33 | **0.98** | 659 |
 *
 * **The ratio never reaches one, and that is the whole design.** It took three versions and two
 * rounds of driving the real fight frame by frame to believe it. The first table had the player's
 * side running away to 2.9 at 大乘; the second pulled it back to 1.16. Both measured the same way:
 * from about halfway up the ladder, a run finished at **full health with the body never moving.**
 *
 * The reason is the turret, not the ratio. Talismans fire themselves at the **nearest** 邪气, which
 * is exactly optimal defence — so the moment the fire rate can match the arrival rate, the thing
 * closest to you is always the thing dying, nothing crosses the last two hundred pixels, and
 * standing perfectly still is the best play available. A capped payout for walking away from the
 * keyboard is still an AFK button, and it was arriving precisely at the realms somebody has spent
 * days reaching.
 *
 * So the door stays ahead of the hand, everywhere. The crowd grows all run at every realm, which
 * means lasting ninety seconds always means **moving away from where it is thickest** — the one
 * thing the turret cannot do for you. What the realm changes is not whether you can win but what
 * winning looks like: a hundred-odd things arrive at 筑基, slowly, one at a time, answered one
 * talisman a second. Six hundred and fifty arrive at 大乘 at twice the speed, answered four at a
 * time, twice a second. Same arithmetic at both ends, and nothing alike about the two minutes.
 *
 * (I wrote "both sides scale, and the player's side scales faster" in the first version of this
 * file and put it in both design documents. It was a nice sentence and it was wrong — measurement
 * killed it twice before I stopped defending it. The player's side does still gain, which is why
 * 筑基 is the realm most likely to end early; it simply never gets to the front.)
 */
interface Rung {
  /** Seconds between arrivals, at the start of a run and at the end of it. */
  open: number;
  close: number;
  /** Pixels per second the 邪气 close in at. */
  speed: number;
  /** How much punishment the body absorbs before the run ends. */
  vitality: number;
}

const LADDER: Rung[] = [
  { open: 0.2484, close: 0.0373, speed: 52, vitality: 5 },
  { open: 0.2288, close: 0.0343, speed: 61, vitality: 6.2 },
  { open: 0.2121, close: 0.0318, speed: 70, vitality: 7.4 },
  { open: 0.1976, close: 0.0296, speed: 79, vitality: 8.6 },
  { open: 0.1812, close: 0.0272, speed: 88, vitality: 9.8 },
  { open: 0.1672, close: 0.0251, speed: 97, vitality: 11 },
  { open: 0.1512, close: 0.0227, speed: 106, vitality: 12.2 },
];

/** Arrivals a second, averaged across a run. What the door amounts to, for comparing realms. */
export function arrivalRate(realm: number): number {
  const { open, close } = LADDER[rung(realm)];
  return 2 / (open + close);
}

/** How much punishment the body absorbs before the run ends. */
export function vitality(realm: number): number {
  return LADDER[rung(realm)].vitality;
}

/** Seconds between arrivals, tightening across a run. */
export function spawnInterval(realm: number, through: number): number {
  const { open, close } = LADDER[rung(realm)];
  return open + (close - open) * Math.min(1, Math.max(0, through));
}

/** How fast 邪气 close in. */
export function menaceSpeed(realm: number): number {
  return LADDER[rung(realm)].speed;
}
/**
 * What touching the body costs, and how long the body is untouchable afterwards.
 *
 * Exported so the checks can state the rule in terms of the numbers behind it rather than in
 * duplicated literals, which is the form that goes stale the first time either one is retuned.
 */
export const ContactDamage = 1;
export const GraceSeconds = 0.9;
/** How close a talisman has to pass to count as a hit. */
export const StrikeRadius = 26;

export interface Menace {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, for the ragged edge. Drifts, so it writhes rather than sliding. */
  phase: number;
  /** Counts up from 0 as it arrives, so nothing pops into existence at full size. */
  arrival: number;
}

export type Outcome = 'running' | 'survived' | 'overwhelmed';

/**
 * What a run pays, in seconds of the pet working flat out.
 *
 * Paid for **time survived** rather than per kill, and the difference matters more than it looks.
 * A per-kill rate scales with the realm on both terms at once — 大乘 meets more 邪气 *and* shreds
 * them faster — so a run at the top came to twenty-five minutes of work for ninety seconds of play.
 * That quietly makes grinding a minigame the fastest way up a ladder whose whole premise is that it
 * fills while you get on with something else.
 *
 * Time is bounded by the clock, so this pays the same at every realm and cannot be farmed faster
 * than real time. Kills still decide it — a badly fought run ends early — they simply are not
 * currency. And because the share is paid on progress rather than on arriving, being overwhelmed at
 * eighty seconds pays nearly what surviving does, instead of teaching people that trying and almost
 * getting there was worth the same as never starting.
 */
export const ThroughShare = 0.7;
/** Paid on top for lasting the whole run, so finishing still means something. */
export const SurvivalBonus = 0.6;

export function harvest(through: number, outcome: Outcome): number {
  const share = Math.max(0, Math.min(1, through)) * ThroughShare;
  return RunSeconds * (share + (outcome === 'survived' ? SurvivalBonus : 0));
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Trial {
  private menaces: Menace[] = [];
  private nextSpawn = 0;
  private elapsed = 0;
  private hurt = 0;
  private grace = 0;
  private kills = 0;
  private realm = 1;
  outcome: Outcome = 'running';

  start(realm: number): void {
    this.menaces = [];
    this.realm = realm;
    this.elapsed = 0;
    this.hurt = 0;
    this.grace = 0;
    this.kills = 0;
    this.outcome = 'running';
    // A beat of quiet before the first arrival, so entering the mode is not also being attacked.
    this.nextSpawn = 1.2;
  }

  get through(): number {
    return Math.min(1, this.elapsed / RunSeconds);
  }

  /** 1 when untouched, 0 when the run is over. What the body's condition is drawn from. */
  get integrity(): number {
    return Math.max(0, 1 - this.hurt / vitality(this.realm));
  }

  get killCount(): number {
    return this.kills;
  }

  /**
   * Gives back some 护体, for the card that does that.
   *
   * Clamped at whole, because a run cannot end up *better* defended than it started — the card is
   * a way out of a bad patch, not a way to bank a bigger pool than the realm allows.
   */
  mend(points: number): void {
    this.hurt = Math.max(0, this.hurt - points);
  }

  get untouchable(): boolean {
    return this.grace > 0;
  }

  /** Where everything is, for the schools to be tested against. */
  targets(): { x: number; y: number }[] {
    return this.menaces.map((m) => ({ x: m.x, y: m.y }));
  }

  /**
   * The nearest 邪气 within a distance, or null.
   *
   * Handed out as a copied point rather than the unit itself, so nothing outside this class can
   * hold a reference to something that is about to be spliced out of the list.
   */
  closest(x: number, y: number, within: number): { x: number; y: number } | null {
    let best: Menace | null = null;
    let closest = within;
    for (const m of this.menaces) {
      const away = Math.hypot(m.x - x, m.y - y);
      if (away <= closest) {
        closest = away;
        best = m;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  /**
   * Kills up to `most` within a radius, nearest first. Returns how many died.
   *
   * Nearest first rather than in list order, because list order is arrival order and an area
   * effect that kills the three oldest things in a radius instead of the three closest looks
   * broken in exactly the situation it matters — a crowd pressed against the body.
   */
  cull(x: number, y: number, radius: number, most: number): number {
    if (most <= 0) return 0;
    const inside: { index: number; away: number }[] = [];
    for (let i = 0; i < this.menaces.length; i++) {
      const away = Math.hypot(this.menaces[i].x - x, this.menaces[i].y - y);
      if (away <= radius) inside.push({ index: i, away });
    }
    inside.sort((a, b) => a.away - b.away);
    const doomed = inside.slice(0, most).map((e) => e.index);
    if (doomed.length === 0) return 0;
    const dead = new Set(doomed);
    this.menaces = this.menaces.filter((_, i) => !dead.has(i));
    this.kills += doomed.length;
    return doomed.length;
  }

  /**
   * One hit at a point, the way a single projectile lands. Sugar over `cull`.
   *
   * **One talisman, one 邪气.** An earlier version gave them two hit points and let one wound
   * everything within reach, which sounds like a detonation and played like a cheat: in a crowd
   * something is always already wounded, so every shot killed anyway and the second hit point meant
   * nothing. A health bar on a thirteen-pixel blot would also have been a number on the screen,
   * which the guardrails rule out in any case. Area effects exist — several schools are nothing
   * else — but they say so by asking to kill more than one.
   */
  strike(x: number, y: number): boolean {
    return this.cull(x, y, StrikeRadius, 1) > 0;
  }

  /**
   * Runs the clock: arrivals, closing, contact, and the two ways a run ends.
   *
   * `guard` is whatever is defending the body — in practice the arsenal. It is asked two things:
   * where it is slowing 邪气 down, and whether it will eat a contact **before** that contact turns
   * into damage. The second is why it is a parameter rather than something that fires on its own
   * timer: 山岳 has to act between the touch and the wound, and there is no ordering of two
   * independent update calls that puts it there.
   */
  update(
    dt: number,
    body: { x: number; y: number; radius: number },
    width: number,
    height: number,
    guard?: { absorb(): boolean; fields(): { x: number; y: number; radius: number; factor: number }[] },
  ): void {
    if (this.outcome !== 'running') return;
    this.elapsed += dt;
    this.grace = Math.max(0, this.grace - dt);

    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.nextSpawn = spawnInterval(this.realm, this.through);
      this.spawn(width, height);
    }

    const speed = menaceSpeed(this.realm);
    const fields = guard?.fields() ?? [];
    const survivors: Menace[] = [];
    for (const m of this.menaces) {
      m.arrival = Math.min(1, m.arrival + dt * 2.2);
      m.phase += dt * 2.6;
      const dx = body.x - m.x;
      const dy = body.y - m.y;
      const away = Math.hypot(dx, dy) || 1;
      // 冰魄. The slowest field wins rather than the factors multiplying: there is only ever one
      // of them today, and a stack that compounds is how a slow becomes a stop by accident.
      let drag = 1;
      for (const field of fields) {
        if (Math.hypot(m.x - field.x, m.y - field.y) <= field.radius) drag = Math.min(drag, field.factor);
      }
      // Steered rather than teleported along the line: a bit of inertia means a dodge actually
      // works, because they overshoot instead of turning on the spot.
      m.vx += ((dx / away) * speed * drag - m.vx) * Math.min(1, dt * 2.6);
      m.vy += ((dy / away) * speed * drag - m.vy) * Math.min(1, dt * 2.6);
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (away <= body.radius + 14) {
        // 山岳 first. A shell that only works after the wound is not a shell.
        if (this.grace <= 0 && !guard?.absorb()) {
          this.hurt += ContactDamage;
          this.grace = GraceSeconds;
        }
        // Consumed on contact either way. Something that lands a hit and then sits inside the body
        // draining it is not a fight, it is a leak.
        continue;
      }
      survivors.push(m);
    }
    this.menaces = survivors;

    if (this.integrity <= 0) this.outcome = 'overwhelmed';
    else if (this.elapsed >= RunSeconds) this.outcome = 'survived';
  }

  /** Arrives from a random point on the border, just outside it. */
  private spawn(width: number, height: number): void {
    const side = Math.floor(Math.random() * 4);
    const along = Math.random();
    const out = 24;
    const at =
      side === 0
        ? { x: along * width, y: -out }
        : side === 1
          ? { x: width + out, y: along * height }
          : side === 2
            ? { x: along * width, y: height + out }
            : { x: -out, y: along * height };
    this.menaces.push({
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      arrival: 0,
    });
  }

  bounds(): Rect | null {
    if (this.menaces.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const m of this.menaces) {
      left = Math.min(left, m.x - 30);
      top = Math.min(top, m.y - 30);
      right = Math.max(right, m.x + 30);
      bottom = Math.max(bottom, m.y + 30);
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * 邪气: a dark ragged blot with a soft halo.
   *
   * Dark on purpose, and it is the one thing in this app that is. Everything the pet produces is
   * light — dust, talismans, the cocoon, the blast — so the thing that is coming for it reads at a
   * glance by being the opposite, on any wallpaper, without needing a colour anybody has to learn.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();
    for (const m of this.menaces) {
      const size = 13 * (0.4 + 0.6 * m.arrival);
      context.save();
      context.translate(m.x, m.y);

      const halo = context.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
      halo.addColorStop(0, 'rgba(24, 14, 34, 0.5)');
      halo.addColorStop(1, clear('#180e22'));
      context.globalAlpha = 0.85 * m.arrival;
      context.fillStyle = halo;
      context.beginPath();
      context.arc(0, 0, size * 2.6, 0, Math.PI * 2);
      context.fill();

      // A ragged ring rather than a circle: a smooth blob reads as a bubble, and this is supposed
      // to read as something with an intent.
      context.globalAlpha = m.arrival;
      context.fillStyle = '#1b1226';
      context.beginPath();
      for (let i = 0; i <= 11; i++) {
        const angle = (i / 11) * Math.PI * 2;
        const reach = size * (0.82 + 0.3 * Math.sin(angle * 3 + m.phase));
        const px = Math.cos(angle) * reach;
        const py = Math.sin(angle) * reach;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();

      // Two eyes, because an enemy the player is meant to read as aimed at them needs a front.
      context.globalAlpha = 0.9 * m.arrival;
      context.fillStyle = 'rgba(232, 96, 96, 0.95)';
      const look = Math.atan2(m.vy, m.vx);
      for (const side of [-0.42, 0.42]) {
        context.beginPath();
        context.arc(
          Math.cos(look + side) * size * 0.4,
          Math.sin(look + side) * size * 0.4,
          size * 0.15,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      context.restore();
    }
    context.restore();
  }
}
