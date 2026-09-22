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
import {
  BY_KIND,
  DartRushSeconds,
  DartWindSeconds,
  type Kind,
  RootPulseReach,
  RootPulseSeconds,
  RootTellSeconds,
  RootTravelSeconds,
  SplitInto,
  WeaveRadius,
  WeaveSeconds,
  pacing,
  rollBreed,
} from './menaces.js';

/** How long a run lasts, in seconds. */
export const RunSeconds = 90;

/** 筑基 is realm 1, and the trial is gated there. This maps a realm onto 0 (筑基) through 6 (大乘). */
export function rung(realm: number): number {
  return Math.max(0, Math.min(6, realm - 1));
}

/**
 * The door: how much arrives, how fast it closes, and how much the body can take.
 *
 * One row per rung, and **only the door.** It had two more columns once — talismans per volley and
 * seconds between them — because the pet's whole offence used to be one number this file owned.
 * It is a drafted build now (`schools.ts`), so there is nothing here to compare against and the
 * comparison moved to where it can actually be made: a whole run, fought frame by frame in the
 * checks, with a real build in it.
 *
 * | rung | realm | arrivals/s | over a run | opens at | ends at | speed | vitality |
 * |---|---|---|---|---|---|---|---|
 * | 0 | 筑基 | 7.0 | 629 | 4.0/s | 26.8/s | 52 | 5 |
 * | 1 | 金丹 | 7.6 | 682 | 4.4/s | 29.2/s | 61 | 6.2 |
 * | 2 | 元婴 | 8.2 | 738 | 4.7/s | 31.4/s | 70 | 7.4 |
 * | 3 | 化神 | 8.8 | 793 | 5.1/s | 33.8/s | 79 | 8.6 |
 * | 4 | 煉虚 | 9.6 | 865 | 5.5/s | 36.8/s | 88 | 9.8 |
 * | 5 | 合体 | 10.4 | 938 | 6.0/s | 39.8/s | 97 | 11 |
 * | 6 | 大乘 | 11.5 | 1034 | 6.6/s | 44.1/s | 106 | 12.2 |
 *
 * The spread across the ladder is much narrower than the 115-to-1034 it used to be, and that is
 * not the ladder going soft: what a realm mostly buys you in here now is **exchanges** — nine over
 * a 筑基 run against twelve at 大乘 — so the difference moved into the build. The arrival column
 * only has to keep up with what a build of that depth can kill.
 *
 * ## Three versions of this table were wrong, and the fourth one is not a number
 *
 * The first two set the player's side ahead of the door (a ratio of 2.9, then 1.16) and argued it
 * from these columns. Both passed their checks while a real run, driven frame by frame, finished at
 * **full health with the body never moving** — because the attacks aim at the nearest 邪气, which is
 * optimal defence, so the moment the fire rate matches the arrival rate nothing crosses the last
 * two hundred pixels and standing still is the best play there is.
 *
 * The third fought a whole run, which at least caught that. Then the schools arrived, four slots
 * turned out to kill five to eight times what one talisman had, and out-scaling *that* with the
 * door needed about two thousand arrivals in ninety seconds, which is not a fight.
 *
 * So the guard is structural instead: **the draft pauses the run**, `through` counts only elapsed
 * seconds, and four cards are owed before the first arrival — an unattended run earns nothing, at
 * any build strength, with nothing tuned for it. These columns are tuned against the case in
 * between, somebody who drafts and then ignores the meter, and what closed that last gap was not a
 * column either: it was giving 邪气 six breeds instead of one (`menaces.ts`).
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
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, for the ragged edge. Drifts, so it writhes rather than sliding. */
  phase: number;
  /** Counts up from 0 as it arrives, so nothing pops into existence at full size. */
  arrival: number;
  /** Hits left. Only 重煎 and 钉煎 have more than one, and both are drawn visibly bigger. */
  health: number;
  /** Seconds this one has been alive, which is what every breed's own clock runs off. */
  age: number;
  /**
   * The one number a breed gets to itself.
   *
   * 奔煎 counts down to its next rush, 缠魂 counts down to cutting in, 钉煎 counts down to its
   * next pulse. Sharing a field rather than giving each breed its own keeps `Menace` a flat record
   * that a thousand of them can exist as without a second allocation each — there are a thousand
   * arrivals in a 大乘 run.
   */
  timer: number;
  /** Which way 缠魂 is going round, and the heading 奔煎 committed to. */
  bearing: number;
}

/**
 * A 邪气 coming apart.
 *
 * There was nothing here before: something died and simply stopped being in the array, so a run
 * where you were killing eight things a second had **no feedback for killing anything**. Every
 * flash on the screen belonged to the attack, and none of it belonged to the hit landing.
 *
 * Drawn as the dark thing breaking up rather than as another bright burst — the pet's light and
 * the 邪气's dark are the only two visual languages in this mode, and a kill is the second one
 * losing.
 */
interface Undoing {
  x: number;
  y: number;
  size: number;
  age: number;
  /** Where the pieces went, fixed at death so they do not crawl between frames. */
  shards: { vx: number; vy: number; spin: number }[];
}

/** How long one takes to disperse. Short: at eight kills a second these overlap constantly. */
const UndoSeconds = 0.42;
/** The most that can be dispersing at once, for the same reason the sparks are capped. */
const MaxUndoing = 60;

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
  private undoing: Undoing[] = [];
  private nextSpawn = 0;
  private elapsed = 0;
  private hurt = 0;
  private grace = 0;
  private kills = 0;
  private realm = 1;
  outcome: Outcome = 'running';

  start(realm: number): void {
    this.menaces = [];
    this.undoing = [];
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
   * Lands up to `most` hits within a radius, nearest first. Returns how many **landed**.
   *
   * Hits rather than kills, and the distinction only appeared with 重煎: a talisman that strikes
   * something with four hit points has connected, and a caller asking "did I hit anything" — which
   * is what every projectile in `Attacks` asks before it detonates — would otherwise be told no and
   * sail straight through. Deaths are counted separately, in `killCount`, which is what the meter
   * spends.
   *
   * Nearest first rather than in list order, because list order is arrival order, and an area
   * effect that hits the three oldest things in a radius instead of the three closest looks broken
   * in exactly the situation where it matters — a crowd pressed against the body.
   */
  cull(x: number, y: number, radius: number, most: number): number {
    if (most <= 0) return 0;
    const inside: { index: number; away: number }[] = [];
    for (let i = 0; i < this.menaces.length; i++) {
      const away = Math.hypot(this.menaces[i].x - x, this.menaces[i].y - y);
      if (away <= radius) inside.push({ index: i, away });
    }
    if (inside.length === 0) return 0;
    inside.sort((a, b) => a.away - b.away);

    const struck = inside.slice(0, most);
    const dead = new Set<number>();
    const spawned: Menace[] = [];
    for (const { index } of struck) {
      const m = this.menaces[index];
      m.health -= 1;
      if (m.health > 0) continue;
      dead.add(index);
      this.kills += 1;
      this.undo(m);
      // 裂魄 comes apart. Spawned here rather than in `update` so that a crowd cleared in one
      // sweep is immediately replaced by what the sweep should have left behind — the whole point
      // of the breed is that clearing a press all at once is the wrong move.
      if (m.kind === 'split') {
        for (let i = 0; i < SplitInto; i++) {
          const away = (i / SplitInto) * Math.PI * 2 + m.phase;
          spawned.push(
            born('dart', m.x + Math.cos(away) * 18, m.y + Math.sin(away) * 18, {
              arrival: 1,
              timer: DartWindSeconds * 0.4,
            }),
          );
        }
      }
    }
    if (dead.size > 0) this.menaces = this.menaces.filter((_, i) => !dead.has(i));
    if (spawned.length > 0) this.menaces = this.menaces.concat(spawned);
    return struck.length;
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

    const dispersing: Undoing[] = [];
    for (const u of this.undoing) {
      u.age += dt;
      if (u.age < UndoSeconds) dispersing.push(u);
    }
    this.undoing = dispersing;

    this.nextSpawn -= dt;
    if (this.nextSpawn <= 0) {
      this.nextSpawn = spawnInterval(this.realm, this.through);
      this.spawn(width, height);
    }

    // A quarter faster by the end of a run. Deliberately small — speed is the cheapest difficulty
    // curve there is, and the roster is supposed to be doing the work.
    const speed = menaceSpeed(this.realm) * pacing(this.through);
    const fields = guard?.fields() ?? [];
    const survivors: Menace[] = [];
    for (const m of this.menaces) {
      m.arrival = Math.min(1, m.arrival + dt * 2.2);
      m.phase += dt * 2.6;
      m.age += dt;
      m.timer -= dt;
      const breed = BY_KIND[m.kind];
      const dx = body.x - m.x;
      const dy = body.y - m.y;
      const away = Math.hypot(dx, dy) || 1;
      // 冰魄. The slowest field wins rather than the factors multiplying: there is only ever one
      // of them today, and a stack that compounds is how a slow becomes a stop by accident.
      let drag = 1;
      for (const field of fields) {
        if (Math.hypot(m.x - field.x, m.y - field.y) <= field.radius) drag = Math.min(drag, field.factor);
      }

      const pace = speed * breed.pace * drag;
      // How hard it corrects toward where it wants to be. Low is heavy, high is nimble; the
      // difference between 重煎 and 奔煎 is mostly this number.
      let grip = 2.6;
      let goalX = dx / away;
      let goalY = dy / away;
      let want = pace;

      if (m.kind === 'heavy') {
        // Slow and hard to turn: it commits to a line and you go round it.
        grip = 0.8;
      } else if (m.kind === 'dart') {
        // Gathers, then rushes along a heading it picked when it started. It cannot correct
        // mid-rush, which is the whole point — a straight-line kite gets caught, a sidestep does
        // not.
        if (m.timer <= 0) {
          const rushing = m.age % (DartWindSeconds + DartRushSeconds) >= DartWindSeconds;
          m.timer = rushing ? DartRushSeconds : DartWindSeconds;
          if (!rushing) m.bearing = Math.atan2(dy, dx);
        }
        const rushing = m.age % (DartWindSeconds + DartRushSeconds) >= DartWindSeconds;
        if (rushing) {
          goalX = Math.cos(m.bearing);
          goalY = Math.sin(m.bearing);
          want = pace * 2.1;
          grip = 5;
        } else {
          want = pace * 0.12;
          grip = 3.5;
        }
      } else if (m.kind === 'weave') {
        // Circles at a distance and then cuts in. Until it commits it is steering at a point
        // tangential to you, so it builds up on the edges of the screen while you watch the middle.
        if (m.age < WeaveSeconds) {
          const around = Math.atan2(-dy, -dx) + m.bearing * 0.9;
          const ring = { x: body.x + Math.cos(around) * WeaveRadius, y: body.y + Math.sin(around) * WeaveRadius };
          const to = Math.hypot(ring.x - m.x, ring.y - m.y) || 1;
          goalX = (ring.x - m.x) / to;
          goalY = (ring.y - m.y) / to;
          grip = 1.8;
        } else {
          want = pace * 1.7;
          grip = 4;
        }
      } else if (m.kind === 'root') {
        // Travels for a moment, then plants itself for good and starts pulsing. It cannot be
        // kited, so it has to be killed — and it takes the ground you were standing on.
        if (m.age >= RootTravelSeconds) {
          want = 0;
          m.vx = 0;
          m.vy = 0;
          if (m.timer <= 0) {
            m.timer = RootPulseSeconds;
            if (away <= RootPulseReach + body.radius && this.grace <= 0 && !guard?.absorb()) {
              this.hurt += ContactDamage;
              this.grace = GraceSeconds;
            }
          }
        }
      }

      // Steered rather than teleported along the line: a bit of inertia means a dodge actually
      // works, because they overshoot instead of turning on the spot.
      m.vx += (goalX * want - m.vx) * Math.min(1, dt * grip);
      m.vy += (goalY * want - m.vy) * Math.min(1, dt * grip);
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (away <= body.radius + breed.size) {
        // 山岳 first. A shell that only works after the wound is not a shell.
        if (this.grace <= 0 && !guard?.absorb()) {
          this.hurt += ContactDamage;
          this.grace = GraceSeconds;
        }
        // 钉煎 is the exception: it stays. It does its damage from where it stands, so being
        // walked into cannot be what removes it — otherwise the breed that cannot be kited would
        // be cleared by kiting into it once.
        if (m.kind !== 'root') continue;
      }
      survivors.push(m);
    }
    this.menaces = survivors;

    if (this.integrity <= 0) this.outcome = 'overwhelmed';
    else if (this.elapsed >= RunSeconds) this.outcome = 'survived';
  }

  /**
   * Records one coming apart.
   *
   * Capped, because a 大乘 run kills a thousand things and a 剑气 sweep can take four in a frame.
   * The cap drops the *newest* rather than the oldest, so a burst of kills still shows something
   * and the ones already dispersing are allowed to finish instead of popping out of existence.
   */
  private undo(m: Menace): void {
    if (this.undoing.length >= MaxUndoing) return;
    const breed = BY_KIND[m.kind];
    const pieces = m.kind === 'heavy' ? 9 : 6;
    const shards: { vx: number; vy: number; spin: number }[] = [];
    for (let i = 0; i < pieces; i++) {
      const angle = (i / pieces) * Math.PI * 2 + Math.random() * 0.5;
      const rush = 40 + Math.random() * 110;
      shards.push({
        vx: Math.cos(angle) * rush,
        vy: Math.sin(angle) * rush,
        spin: (Math.random() - 0.5) * 12,
      });
    }
    this.undoing.push({ x: m.x, y: m.y, size: breed.size, age: 0, shards });
  }

  /** Arrives from a random point on the border, just outside it, as whatever is due. */
  private spawn(width: number, height: number): void {
    const side = Math.floor(Math.random() * 4);
    const along = Math.random();
    const out = 30;
    const at =
      side === 0
        ? { x: along * width, y: -out }
        : side === 1
          ? { x: width + out, y: along * height }
          : side === 2
            ? { x: along * width, y: height + out }
            : { x: -out, y: along * height };
    const breed = rollBreed(rung(this.realm), this.through, Math.random);
    this.menaces.push(born(breed.kind, at.x, at.y, {}));
  }

  bounds(): Rect | null {
    if (this.menaces.length === 0 && this.undoing.length === 0) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const m of this.menaces) {
      // Per breed, because they are no longer one size. 重煞's halo alone reaches sixty-two pixels
      // and 钉煞 draws a ring at ninety-six — a flat thirty would have clipped both, and a clipped
      // dirty rect leaves a smear on the desktop rather than a missing sprite.
      const pad =
        m.kind === 'root' ? RootPulseReach + 8 : BY_KIND[m.kind].size * 2.6 + 6;
      left = Math.min(left, m.x - pad);
      top = Math.min(top, m.y - pad);
      right = Math.max(right, m.x + pad);
      bottom = Math.max(bottom, m.y + pad);
    }
    for (const u of this.undoing) {
      const reach = u.size + 150 * UndoSeconds + 8;
      left = Math.min(left, u.x - reach);
      top = Math.min(top, u.y - reach);
      right = Math.max(right, u.x + reach);
      bottom = Math.max(bottom, u.y + reach);
    }
    if (left === Infinity) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * 邪气: a dark ragged blot with a soft halo.
   *
   * Dark on purpose, and it is the one thing in this app that is. Everything the pet produces is
   * light — dust, talismans, the cocoon, the blast — so the thing that is coming for it reads at a
   * glance by being the opposite, on any wallpaper, without needing a colour anybody has to learn.
   */
  /**
   * 邪气, six ways.
   *
   * All of them dark, and they are still the only dark things in this app — everything the pet
   * makes is light, so the things coming for it read at a glance on any wallpaper. What separates
   * the breeds is **silhouette**, not colour: the same red eyes on six shapes, one of them twice
   * the size of the rest and one of them all angles. A player has to be able to tell a 奔煎 from a
   * 游魂 while looking at something else, which rules out telling them apart by hue.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();

    for (const u of this.undoing) {
      const t = u.age / UndoSeconds;
      const fade = 1 - t;
      // A pale flash first, for two frames only: the qi coming out of it. It is the one moment a
      // 邪气 is light rather than dark, and it is what makes a kill feel like it landed.
      if (t < 0.22) {
        const flash = 1 - t / 0.22;
        const ring = context.createRadialGradient(u.x, u.y, 0, u.x, u.y, u.size * 2.4);
        ring.addColorStop(0, 'rgba(255, 236, 224, 0.9)');
        ring.addColorStop(1, clear('#ffece0'));
        context.globalAlpha = flash * 0.8;
        context.fillStyle = ring;
        context.beginPath();
        context.arc(u.x, u.y, u.size * 2.4 * (0.5 + 0.5 * (1 - flash)), 0, Math.PI * 2);
        context.fill();
      }
      // Then the pieces, thrown outward and turning, fading as they go.
      context.globalAlpha = fade * fade * 0.85;
      context.fillStyle = '#1b1226';
      for (const shard of u.shards) {
        const px = u.x + shard.vx * u.age;
        const py = u.y + shard.vy * u.age;
        const size = u.size * 0.34 * fade;
        context.save();
        context.translate(px, py);
        context.rotate(shard.spin * u.age);
        context.beginPath();
        context.moveTo(-size, -size * 0.6);
        context.lineTo(size, 0);
        context.lineTo(-size, size * 0.6);
        context.closePath();
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;
    }

    for (const m of this.menaces) {
      const breed = BY_KIND[m.kind];
      const size = breed.size * (0.4 + 0.6 * m.arrival);
      context.save();
      context.translate(m.x, m.y);

      // 钉煎 tells you before it pulses, so standing in it is a choice rather than an ambush.
      if (m.kind === 'root' && m.age >= RootTravelSeconds) {
        const due = m.timer;
        if (due <= RootTellSeconds) {
          const swell = 1 - due / RootTellSeconds;
          context.globalAlpha = 0.5 * swell;
          context.strokeStyle = 'rgba(228, 88, 88, 0.9)';
          context.lineWidth = 2 + swell * 2;
          context.beginPath();
          context.arc(0, 0, RootPulseReach * (0.55 + 0.45 * swell), 0, Math.PI * 2);
          context.stroke();
        }
        context.globalAlpha = 0.16;
        context.strokeStyle = 'rgba(210, 120, 120, 0.7)';
        context.lineWidth = 1;
        context.beginPath();
        context.arc(0, 0, RootPulseReach, 0, Math.PI * 2);
        context.stroke();
      }

      const halo = context.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
      halo.addColorStop(0, 'rgba(24, 14, 34, 0.5)');
      halo.addColorStop(1, clear('#180e22'));
      context.globalAlpha = 0.85 * m.arrival;
      context.fillStyle = halo;
      context.beginPath();
      context.arc(0, 0, size * 2.6, 0, Math.PI * 2);
      context.fill();

      const look = Math.atan2(m.vy, m.vx);
      context.globalAlpha = m.arrival;
      context.fillStyle = m.kind === 'heavy' ? '#140c1e' : '#1b1226';

      if (m.kind === 'root') {
        // All angles, and it does not point anywhere, because it is not going anywhere.
        context.beginPath();
        for (let i = 0; i <= 12; i++) {
          const angle = (i / 12) * Math.PI * 2;
          const reach = size * (i % 2 === 0 ? 1.15 : 0.6);
          const px = Math.cos(angle + m.phase * 0.2) * reach;
          const py = Math.sin(angle + m.phase * 0.2) * reach;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
      } else {
        // A ragged ring rather than a circle: a smooth blob reads as a bubble, and this is supposed
        // to read as something with an intent. 奔煎 is stretched along its heading, which is the
        // one silhouette cue that survives at ten pixels.
        context.save();
        context.rotate(look);
        // 奔煎 is drawn long, with a wake behind it, because at ten pixels across a silhouette is
        // the only cue that survives — and it is the breed you most need to recognise early.
        if (m.kind === 'dart') {
          context.globalAlpha = 0.34 * m.arrival;
          context.beginPath();
          context.moveTo(-size * 1.6, -size * 0.42);
          context.lineTo(-size * 4.4, 0);
          context.lineTo(-size * 1.6, size * 0.42);
          context.closePath();
          context.fill();
          context.globalAlpha = m.arrival;
        }
        // Mass, not spikes. 重煎 gets two shallow lobes so it reads as something heavy; 钉煎 is
        // the angular one, and the first version gave them both five deep ones, which made the two
        // of them the same silhouette at a glance.
        const stretch = m.kind === 'dart' ? 2.1 : 1;
        const lobes = m.kind === 'heavy' ? 2 : 3;
        const ripple = m.kind === 'heavy' ? 0.1 : 0.3;
        context.beginPath();
        for (let i = 0; i <= 15; i++) {
          const angle = (i / 15) * Math.PI * 2;
          const reach = size * (0.9 + ripple * Math.sin(angle * lobes + m.phase));
          const px = Math.cos(angle) * reach * stretch;
          const py = Math.sin(angle) * reach;
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.closePath();
        context.fill();
        context.restore();
      }

      // 裂魄 carries the seam it is going to come apart along. The tell is the whole reason the
      // breed is fair: clearing a press all at once is a mistake you can see coming.
      if (m.kind === 'split') {
        context.globalAlpha = 0.75 * m.arrival;
        context.strokeStyle = 'rgba(226, 120, 120, 0.85)';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(Math.cos(m.phase * 0.3) * size, Math.sin(m.phase * 0.3) * size);
        context.lineTo(-Math.cos(m.phase * 0.3) * size, -Math.sin(m.phase * 0.3) * size);
        context.stroke();
      }

      // 缠魂 wears the ring it is circling on, so a screen edge filling up with them is legible
      // as a thing that is happening rather than as clutter.
      if (m.kind === 'weave' && m.age < WeaveSeconds) {
        context.globalAlpha = 0.85 * m.arrival;
        context.strokeStyle = 'rgba(232, 140, 166, 0.95)';
        context.lineWidth = 2.6;
        context.beginPath();
        context.arc(0, 0, size * 1.75, look + 0.5, look + 2.7);
        context.stroke();
      }

      // Eyes: an enemy the player is meant to read as aimed at them needs a front. 重煎 has four,
      // which is the cheapest way to say "this one is more than the others".
      context.globalAlpha = 0.9 * m.arrival;
      context.fillStyle = 'rgba(232, 96, 96, 0.95)';
      if (m.kind === 'root') {
        context.beginPath();
        context.arc(0, 0, size * 0.3, 0, Math.PI * 2);
        context.fill();
      } else {
        const sides = m.kind === 'heavy' ? [-0.62, -0.2, 0.2, 0.62] : [-0.42, 0.42];
        for (const side of sides) {
          context.beginPath();
          context.arc(
            Math.cos(look + side) * size * 0.4,
            Math.sin(look + side) * size * 0.4,
            size * (m.kind === 'heavy' ? 0.11 : 0.15),
            0,
            Math.PI * 2,
          );
          context.fill();
        }
      }
      context.restore();
    }
    context.restore();
  }
}

/**
 * One of them, ready to go.
 *
 * A factory rather than an object literal at each call site, because there are two of those — the
 * border spawner and 裂魄 coming apart — and a `Menace` gained four fields when the roster did.
 * Two literals drifting apart on a record this hot is the kind of bug that shows up as one breed
 * behaving oddly and nothing else.
 */
function born(
  kind: Kind,
  x: number,
  y: number,
  extra: { arrival?: number; timer?: number },
): Menace {
  const breed = BY_KIND[kind];
  return {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    phase: Math.random() * Math.PI * 2,
    arrival: extra.arrival ?? 0,
    health: breed.health,
    age: 0,
    timer: extra.timer ?? (kind === 'root' ? RootPulseSeconds : DartWindSeconds),
    // 缠魂 uses this as which way round it goes; 奔煎 overwrites it with a heading.
    bearing: Math.random() < 0.5 ? -1 : 1,
  };
}
