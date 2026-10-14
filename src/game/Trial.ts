/**
 * 历练 — a level of the tower: ten waves, and a boss at the end of them.
 *
 * 邪气 come in from the edges of the desktop toward the slime, which holds the middle and does not
 * move. What it does about them is whatever it is carrying — see `kit.ts` for the five weapons and
 * ten ways, and `Attacks.ts` for them running. They come in waves, on a timetable that has all ten
 * out within three minutes (`Waves.ts`), and the level ends one of two ways: everything that came
 * has been killed, or the body has fallen. There is no timeout.
 *
 * **It costs nothing but time.** No charms — those are realm insurance, and a play mode that
 * quietly eats your 渡劫 odds is the same trap the automatic stages and the 御符 throw each set
 * once. Failing loses nothing either; you simply collect less, and the level is there to try again.
 * A desk pet does not get to take your progress because a fight went badly.
 *
 * What it pays is how far you got rather than how much you killed — see `harvest`, which is where
 * that reason lives.
 *
 * ## The level sets the door, not the realm
 *
 * The door — how much arrives, how tough it is, how fast it closes — is read off the level
 * (`levels.ts`), 1 to 99. It used to be read off the realm, seven rows, and the guard that kept it
 * honest was rebuilt three times before it settled where it still is: **not in a column, but in a
 * whole level fought frame by frame in the checks**, with a real build in it, asserting that a
 * build nobody deepens does not get through.
 */
import { clear } from '../slime/colour.js';
import type { Depth, Painter } from './depth.js';
import { clampLevel, menaceSpeed, schedule, toughness, vitality } from './levels.js';
import {
  BY_KIND,
  DartRushSeconds,
  DartWindSeconds,
  type Kind,
  RANKS,
  type Rank,
  RootPulseReach,
  RootPlantReach,
  RootPulseSeconds,
  RootTellSeconds,
  RootTravelSeconds,
  SplitInto,
  WeaveRadius,
  WeaveSeconds,
  pacing,
  rollBreed,
  rollChampion,
} from './menaces.js';
import { type Arrival, Waves } from './Waves.js';

/** 燎火: seconds between one tick of burning and the next. */
export const BurnBeat = 0.45;

/**
 * How fast 山崩's throw bleeds off, in seconds.
 *
 * A 邪气 thrown at 520 px/s travels about 135 pixels before this has taken it — roughly a body and
 * a half, far enough to be a reprieve and short enough that it is walking back at you inside a
 * second. Longer read as a stun, which is a different move and a much stronger one.
 */
export const FlingTau = 0.26;

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
  /**
   * Hits left. Among commons only 重煎 and 钉煎 start with more than one, and both are drawn
   * visibly bigger; an elite or a boss is bigger still. Late in the tower `levels.toughness` raises
   * every one of them.
   */
  health: number;
  /** Common, elite or boss. What it is drawn at and how much it takes — see `RANKS`. */
  rank: Rank;
  /** The wave it came with, from 0. Its 裂魄 pieces inherit it. */
  wave: number;
  /** Seconds this one has been alive, which is what every breed's own clock runs off. */
  age: number;
  /**
   * The one number a breed gets to itself.
   *
   * 奔煎 counts down to its next rush, 缠魂 counts down to cutting in, 钉煎 counts down to its
   * next pulse. Sharing a field rather than giving each breed its own keeps `Menace` a flat record
   * that a thousand of them can exist as without a second allocation each — there are close to a
   * thousand arrivals in a level at the top of the tower.
   */
  timer: number;
  /** Which way 缠魂 is going round, and the heading 奔煎 committed to. */
  bearing: number;
  /**
   * 山崩: thrown outward, decaying on its own clock.
   *
   * Its own pair of numbers rather than an impulse added to `vx`/`vy`, because the steering below
   * is a first-order lag toward the goal velocity — it would eat an impulse written there inside
   * a tenth of a second, and a throw that is corrected away before it is seen is not a throw. This
   * is added to the **position** and decays on a tau of its own, so a 邪气 is carried out and then
   * has to walk back in.
   */
  flingX: number;
  flingY: number;
  /** 缠木: seconds it is held where it stands. */
  rootLeft: number;
  /** 钉煎 has put itself down, and is not going anywhere again. */
  planted: boolean;
  /** 燎火: seconds it keeps burning, and the clock to its next tick of it. */
  burnLeft: number;
  burnNext: number;
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

/**
 * How a level stands. There is no third ending: no clock runs out on anybody.
 */
export type Outcome = 'running' | 'cleared' | 'overwhelmed';

/**
 * What a level is worth, in seconds of the pet working flat out, before the shares below.
 *
 * Ninety because that is what the old run lasted and what its payout was measured in, and nothing
 * about a level made the scale want to move: a level takes a couple of minutes, so a cleared one
 * still pays less than the time it took.
 */
export const PaySeconds = 90;

/**
 * What a level pays.
 *
 * Paid for **how far you got** rather than per kill, and the difference matters more than it
 * looks. A per-kill rate scales with difficulty on both terms at once — a higher level sends more
 * 邪气 *and* the build that can face it shreds them faster — so paying per kill makes the top of the
 * tower a faster way up the realm ladder than the ladder itself, whose whole premise is that it
 * fills while you get on with something else.
 *
 * So this takes no level and no realm. Kills still decide it — a badly fought level ends early —
 * they simply are not currency. And because the share is paid on progress, being overwhelmed at
 * the boss pays nearly what beating it does, instead of teaching people that trying and almost
 * getting there was worth the same as never starting.
 */
export const ThroughShare = 0.7;
/** Paid on top for bringing the boss down, so clearing still means something. */
export const ClearBonus = 0.6;

export function harvest(through: number, outcome: Outcome): number {
  const share = Math.max(0, Math.min(1, through)) * ThroughShare;
  return PaySeconds * (share + (outcome === 'cleared' ? ClearBonus : 0));
}

/**
 * How hard an elite or a boss is thrown back off the body after it lands a hit.
 *
 * A common is spent on contact — it touches, it does its damage, it is gone. An elite cannot be:
 * the boss is the level, and a boss that walked into the body and vanished would end the level by
 * *losing* it to a graze. So the big ones strike and recoil, about eighty pixels, and walk back in.
 * What that reads as is a heavy thing slamming into the body and staggering off it, which is what
 * a boss is supposed to look like.
 */
export const Recoil = 300;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Trial {
  private menaces: Menace[] = [];
  private undoing: Undoing[] = [];
  private readonly waves = new Waves();
  private hurt = 0;
  private grace = 0;
  private kills = 0;
  private spoils = 0;
  private stage = 1;
  outcome: Outcome = 'running';

  start(level: number): void {
    this.menaces = [];
    this.undoing = [];
    this.stage = clampLevel(level);
    this.hurt = 0;
    this.grace = 0;
    this.kills = 0;
    this.spoils = 0;
    this.outcome = 'running';
    this.waves.start(this.stage);
  }

  /** The level being fought. */
  get level(): number {
    return this.stage;
  }

  /** The newest wave that has arrived, counting from 0. */
  get wave(): number {
    return this.waves.wave;
  }

  /** Each wave's dot: -1 before it has arrived, then how much of it is gone. See `Waves.marks`. */
  marks(): number[] {
    return this.waves.marks();
  }

  /** True once all ten waves are out. After that nothing more arrives; it is down to the field. */
  get allOut(): boolean {
    return this.waves.allOut;
  }

  /** Seconds of fight so far, on the clock the timetable runs on. */
  get seconds(): number {
    return this.waves.seconds;
  }

  /**
   * How far through the level, 0 to 1: the ten dots summed, over ten.
   *
   * Exactly 1 only once the level is cleared. `Waves` stops just short of it on its own, so a level
   * lost with one 邪气 left standing is paid as nearly there rather than as there.
   */
  get through(): number {
    return this.outcome === 'cleared' ? 1 : this.waves.through;
  }

  /** 1 when untouched, 0 when the level is lost. What the body's condition is drawn from. */
  get integrity(): number {
    return Math.max(0, 1 - this.hurt / vitality(this.stage));
  }

  get killCount(): number {
    return this.kills;
  }

  /**
   * 银币 dropped so far this level, by everything that has died.
   *
   * A running total rather than a stream of events, the same as `killCount`: the caller keeps what
   * it has already banked and takes the difference, so a frame that lands three kills cannot pay
   * for two of them.
   */
  get silver(): number {
    return this.spoils;
  }

  /**
   * Gives back some 护体, for the card that does that.
   *
   * Clamped at whole, because a run cannot end up *better* defended than it started — the card is
   * a way out of a bad patch, not a way to bank a bigger pool than the level allows.
   */
  mend(points: number): void {
    this.hurt = Math.max(0, this.hurt - points);
  }
  // 荣木 calls this too, through `Battlefield`. It wanted exactly what 调息 already did, so it
  // got the same method rather than a second one beside it that drifted.

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
  /**
   * Throws everything inside a radius outward. No damage, no cap on how many.
   *
   * Uncapped on purpose, unlike `cull`: the point of the move is to clear a press, and a knockback
   * that only reached the nearest four would leave exactly the crowd that made it worth using.
   *
   * It stacks by addition rather than replacing, so two pillars catching the same 邪气 throw it
   * twice as far — which is what the overlapping rings of one eruption are for.
   */
  shove(x: number, y: number, radius: number, speed: number): void {
    for (const m of this.menaces) {
      const dx = m.x - x;
      const dy = m.y - y;
      const away = Math.hypot(dx, dy);
      if (away > radius + bulk(m)) continue;
      // **Elites and bosses are not thrown.** Twice this was tried with them throwable and twice
      // it stalled a level: first a 重煞 boss inside every pillar of an eruption at once went
      // fifteen hundred pixels off the screen; then, with the throw divided by its area, a build
      // carrying 土崩 — a shove on *every* hit — still pushed it outward faster than it walks,
      // from 350 pixels to 720 over thirty seconds while taking a hundred and sixty hits. A level
      // is only cleared once everything in it is dead, so a boss that can be held off the screen
      // is a level that cannot end. They still recoil off the body (`Recoil`); that is a
      // different thing.
      if (m.rank !== 'common') continue;
      // Straight up out of the ground at the exact centre: a divide by zero would be a NaN
      // position, and one NaN 邪气 takes the whole fight with it.
      const angle = away < 1e-3 ? Math.random() * Math.PI * 2 : Math.atan2(dy, dx);
      // Hardest at the pillar, tailing off to nothing at the rim, so the edge of a blast nudges
      // rather than launching — and the shape of the ring is readable from how far things went.
      const bite = 1 - (Math.min(away, radius) / radius) * 0.65;
      m.flingX += Math.cos(angle) * speed * bite;
      m.flingY += Math.sin(angle) * speed * bite;
    }
  }

  /**
   * 缠木. Held where it stands, not slowed — a slow is 寒水's job and having two things that are
   * almost the same is how a roster stops being readable.
   *
   * Takes the longer of what it has and what it is given rather than adding: roots that stack
   * would let one build hold a whole field still for ever, which is not a reprieve, it is a win
   * condition with no fight in it.
   */
  root(x: number, y: number, radius: number, seconds: number): void {
    for (const m of this.menaces) {
      if (Math.hypot(m.x - x, m.y - y) > radius + bulk(m)) continue;
      m.rootLeft = Math.max(m.rootLeft, seconds);
    }
  }

  /** 燎火. Alight for a while, and it travels with them. */
  burn(x: number, y: number, radius: number, seconds: number): void {
    for (const m of this.menaces) {
      if (Math.hypot(m.x - x, m.y - y) > radius + bulk(m)) continue;
      if (m.burnLeft <= 0) m.burnNext = BurnBeat;
      m.burnLeft = Math.max(m.burnLeft, seconds);
    }
  }

  cull(x: number, y: number, radius: number, most: number): number {
    if (most <= 0) return 0;
    const inside: { index: number; away: number }[] = [];
    for (let i = 0; i < this.menaces.length; i++) {
      const m = this.menaces[i];
      const away = Math.hypot(m.x - x, m.y - y);
      if (away <= radius + bulk(m)) inside.push({ index: i, away });
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
      this.fall(m);
      // 裂魄 comes apart. Spawned here rather than in `update` so that a crowd cleared in one
      // sweep is immediately replaced by what the sweep should have left behind — the whole point
      // of the breed is that clearing a press all at once is the wrong move.
      if (m.kind === 'split') {
        for (let i = 0; i < SplitInto; i++) {
          const away = (i / SplitInto) * Math.PI * 2 + m.phase;
          spawned.push(
            born('dart', m.x + Math.cos(away) * 18, m.y + Math.sin(away) * 18, this.hits('dart', 'common'), {
              arrival: 1,
              timer: DartWindSeconds * 0.4,
              wave: m.wave,
            }),
          );
        }
        this.waves.swell(m.wave, SplitInto);
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
    guard?: {
      readonly armed: boolean;
      absorb(): boolean;
      fields(): { x: number; y: number; radius: number; factor: number }[];
    },
  ): void {
    if (this.outcome !== 'running') return;
    // **Nothing arrives until something that swings is carried.** The structural half of the AFK
    // guard, and the opening draft's old job: a level opened and walked away from has not started,
    // so it has not moved and pays nothing — without a single number tuned for it. Asked of the
    // guard because the guard is what holds the weapons; a bare `update` with no guard at all is
    // the checks driving the door on its own, and that is allowed to run.
    if (guard && !guard.armed) return;
    this.grace = Math.max(0, this.grace - dt);

    const dispersing: Undoing[] = [];
    for (const u of this.undoing) {
      u.age += dt;
      if (u.age < UndoSeconds) dispersing.push(u);
    }
    this.undoing = dispersing;

    for (const arrival of this.waves.tick(dt, this.menaces.length)) this.spawn(arrival, width, height);

    // A quarter faster by the end of a level. Deliberately small — speed is the cheapest difficulty
    // curve there is, and the roster is supposed to be doing the work.
    const speed = menaceSpeed(this.stage) * pacing(this.through);
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

      // 缠木: held where it stands. Before the steering below rather than after, so a rooted 邪气
      // does not spend its half-second quietly building up a velocity to leave with.
      if (m.rootLeft > 0) {
        m.rootLeft -= dt;
        m.vx = 0;
        m.vy = 0;
      }

      // 燎火: it burns, and it burns wherever it goes. Ticked rather than applied continuously so
      // the damage is a count of beats — the same way everything else in here does damage, which
      // is what keeps one roster of numbers comparable with another.
      if (m.burnLeft > 0) {
        m.burnLeft -= dt;
        m.burnNext -= dt;
        if (m.burnNext <= 0) {
          m.burnNext = BurnBeat;
          m.health -= 1;
          if (m.health <= 0) {
            this.fall(m);
            m.burnLeft = 0;
            continue;
          }
        }
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
        // Walks in until its pulse can reach the body, then plants itself for good. It cannot be
        // kited, so it has to be killed.
        //
        // It used to plant on a timer — a moment after arriving, wherever it was — which was right
        // while the body moved: it took the ground you had been standing on. With the body holding
        // the middle that ground is the border, and a level is only cleared once everything in it
        // is dead, so a 钉煎 that planted out of reach of every weapon stalled the level for ever.
        if (!m.planted && m.age >= RootTravelSeconds && away <= RootPlantReach + body.radius) {
          m.planted = true;
          // A whole beat before the first pulse, so it is seen planting before it is felt.
          m.timer = RootPulseSeconds;
        }
        if (m.planted) {
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

      // 山崩's throw, on top of whatever it was doing. 钉煎 is not exempt: it plants itself and
      // cannot be kited, and being able to shift one is most of the reason to carry 土 at all.
      if (m.flingX !== 0 || m.flingY !== 0) {
        const keep = Math.exp(-dt / FlingTau);
        m.x += m.flingX * dt;
        m.y += m.flingY * dt;
        m.flingX *= keep;
        m.flingY *= keep;
        if (Math.abs(m.flingX) < 2) m.flingX = 0;
        if (Math.abs(m.flingY) < 2) m.flingY = 0;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (away <= body.radius + girth(m)) {
        // 山岳 first. A shell that only works after the wound is not a shell.
        if (this.grace <= 0 && !guard?.absorb()) {
          this.hurt += ContactDamage;
          this.grace = GraceSeconds;
        }
        if (m.rank !== 'common') {
          // Struck, and thrown back off the body. See `Recoil`.
          m.flingX -= (dx / away) * Recoil;
          m.flingY -= (dy / away) * Recoil;
        } else if (m.kind !== 'root') {
          // Spent on the body. 钉煎 is the exception: it stays. It does its damage from where it
          // stands, so being walked into cannot be what removes it — otherwise the breed that
          // cannot be kited would be cleared by kiting into it once.
          this.waves.resolve(m.wave, 1);
          continue;
        }
      }
      survivors.push(m);
    }
    this.menaces = survivors;

    if (this.outcome !== 'running') return;
    if (this.integrity <= 0) this.outcome = 'overwhelmed';
    // Cleared: all ten have come and nothing is left of any of them. Not "the boss is down" — the
    // escort, and whatever is still walking in from wave eight, are part of the level too.
    else if (this.waves.allOut && this.menaces.length === 0) this.outcome = 'cleared';
  }

  /** One of them is dead: counted, paid for, dispersed, and crossed off its wave. */
  private fall(m: Menace): void {
    this.kills += 1;
    this.spoils += RANKS[m.rank].silver;
    this.undo(m);
    this.waves.resolve(m.wave, 1);
  }

  /**
   * How many hits a new one of these takes, at this level.
   *
   * For an elite or a boss the breed's own toughness counts as its square root. Taken whole, a
   * 重煞 boss was four times a 游魂 boss — two hundred and forty hits at level 25 against sixty —
   * and since the boss cycles through the breeds, every fifth level had a spike in it that took a
   * level from two minutes to three and a half. Square-rooted, it is still the hardest boss, at
   * twice the others rather than four times.
   */
  private hits(kind: Kind, rank: Rank): number {
    const own = rank === 'common' ? BY_KIND[kind].health : Math.sqrt(BY_KIND[kind].health);
    return Math.max(1, Math.round(own * RANKS[rank].health * toughness(this.stage)));
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
    const pieces = m.kind === 'heavy' || m.rank !== 'common' ? 9 : 6;
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
    this.undoing.push({ x: m.x, y: m.y, size: girth(m), age: 0, shards });
  }

  /** Arrives from a random point on the border, just outside it, as whatever is due. */
  private spawn(arrival: Arrival, width: number, height: number): void {
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
    const point = schedule(this.stage, this.through);
    const kind =
      arrival.kind ??
      (arrival.rank === 'common' ? rollBreed(point, Math.random) : rollChampion(point, Math.random)).kind;
    this.menaces.push(
      born(kind, at.x, at.y, this.hits(kind, arrival.rank), { rank: arrival.rank, wave: arrival.wave ?? 0 }),
    );
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
      const pad = m.kind === 'root' ? RootPulseReach + 8 : girth(m) * 2.6 + 6;
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

    context.restore();
  }

  /**
   * One 邪气, at its own position.
   *
   * Split out of `draw` so the mode can put it in depth order against everything else
   * standing on the same ground. See `standing`.
   */
  drawMenace(context: CanvasRenderingContext2D, m: Menace): void {
    const size = girth(m) * (0.4 + 0.6 * m.arrival);
    context.save();
    context.translate(m.x, m.y);

    // 钉煎 tells you before it pulses, so standing in it is a choice rather than an ambush.
    if (m.kind === 'root' && m.planted) {
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

  /**
   * Held once rather than made per frame. See `depth.ts` for why that matters at 大乘.
   */
  private readonly paintMenace: Painter = (context, index) =>
    this.drawMenace(context, this.menaces[index]);

  /**
   * Queues every 邪气 for depth sorting.
   *
   * `y` is the position itself rather than a foot offset: in a plane seen from above, where a
   * thing *is* and where it touches the ground are the same point, which is the whole reason this
   * ordering is cheap.
   */
  collect(depth: Depth): void {
    for (let i = 0; i < this.menaces.length; i++) {
      depth.add(this.menaces[i].y, this.paintMenace, i);
    }
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
  health: number,
  extra: { arrival?: number; timer?: number; rank?: Rank; wave?: number },
): Menace {
  return {
    kind,
    rank: extra.rank ?? 'common',
    wave: extra.wave ?? 0,
    x,
    y,
    vx: 0,
    vy: 0,
    flingX: 0,
    flingY: 0,
    rootLeft: 0,
    planted: false,
    burnLeft: 0,
    burnNext: 0,
    phase: Math.random() * Math.PI * 2,
    arrival: extra.arrival ?? 0,
    health,
    age: 0,
    timer: extra.timer ?? (kind === 'root' ? RootPulseSeconds : DartWindSeconds),
    // 缠魂 uses this as which way round it goes; 奔煎 overwrites it with a heading.
    bearing: Math.random() < 0.5 ? -1 : 1,
  };
}

/** How wide one is drawn and touches at: its breed's size, scaled by its rank. */
function girth(m: Menace): number {
  return BY_KIND[m.kind].size * RANKS[m.rank].size;
}

/**
 * How much wider than an ordinary one of its breed it is. Zero for every common.
 *
 * Added to every radius that asks "is it inside", so a boss two and a half times the width is hit
 * by what passes over its edge rather than only by what passes over its middle. Without it the
 * biggest thing on the screen would be the hardest to hit, which is the wrong way round.
 */
function bulk(m: Menace): number {
  return girth(m) - BY_KIND[m.kind].size;
}
