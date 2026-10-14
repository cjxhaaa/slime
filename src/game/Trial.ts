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
import { drawCreature } from '../ui/creatures.js';
import type { Depth, Painter } from './depth.js';
import { clampLevel, menaceSpeed, schedule, toughness, vitality } from './levels.js';
import {
  AimSeconds,
  BY_KIND,
  BallSpeed,
  BoltSpeed,
  ChargeBurst,
  ChargeReach,
  ChargeRest,
  ChargeRushSeconds,
  ChargeWindSeconds,
  InRangeCreep,
  type Kind,
  RANKS,
  type Rank,
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
   * Hits left. Among commons only the bigger kinds and the two that shoot start with more than
   * one; an elite or a king is bigger still. Late in the tower `levels.toughness` raises every one
   * of them.
   */
  health: number;
  /** Common, elite or boss. What it is drawn at and how much it takes — see `RANKS`. */
  rank: Rank;
  /** The wave it came with, from 0. */
  wave: number;
  /** Seconds this one has been alive, which is what every breed's own clock runs off. */
  age: number;
  /**
   * The one clock a kind gets to itself.
   *
   * A boar counts through its charge with it; the two that shoot count down to the next shot.
   * Sharing a field rather than giving each kind its own keeps `Menace` a flat record that a
   * thousand of them can exist as without a second allocation each — there are close to a thousand
   * arrivals in a level at the top of the tower.
   */
  timer: number;
  /** The heading a charging boar committed to. */
  bearing: number;
  /** 野猪: 0 trotting, 1 lowering its head, 2 charging, 3 getting its breath back. */
  mode: number;
  /** Seconds since a ranged one last fired, for the recoil and the smoke. */
  fired: number;
  /** Which way it faces, 1 or -1. Turned with some reluctance, so a crowd does not flicker. */
  facing: number;
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

/**
 * A cannonball or a bolt, in the air. Nothing the pet does can stop one; it lands on the body or it
 * flies off and is gone.
 */
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: 'ball' | 'bolt';
  /** How big, in pixels — an elite's and a king's are heavier. */
  size: number;
  age: number;
}

/** How long a shot can fly before it is given up on. Longer than any can take to reach the body. */
const ShotSeconds = 4;

/**
 * A hit that went through a flying one: an afterimage left where it was, sliding the way it went.
 * No word, no number — the shape of the dodge says it.
 */
interface Dodge {
  x: number;
  y: number;
  size: number;
  age: number;
  side: number;
}

const DodgeSeconds = 0.35;

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
  private shots: Shot[] = [];
  private dodges: Dodge[] = [];
  private readonly waves = new Waves();
  /** No waves at all: only what `hurl` puts down. See `start`. */
  private quiet = false;
  private hurt = 0;
  private grace = 0;
  private kills = 0;
  private spoils = 0;
  private stage = 1;
  outcome: Outcome = 'running';

  /**
   * A fresh level. `quiet` is for the checks: a field with nothing arriving, so what is under test
   * is only what they put on it with `hurl`.
   */
  start(level: number, quiet = false): void {
    this.quiet = quiet;
    this.menaces = [];
    this.undoing = [];
    this.shots = [];
    this.dodges = [];
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
    for (const { index } of struck) {
      const m = this.menaces[index];
      // The flying ones: some of what is thrown at them goes through. It still counts as landed —
      // whatever was thrown is spent — it just did nothing.
      if (this.dodged(m)) continue;
      m.health -= 1;
      if (m.health > 0) continue;
      dead.add(index);
      this.fall(m);
    }
    if (dead.size > 0) this.menaces = this.menaces.filter((_, i) => !dead.has(i));
    return struck.length;
  }

  /** Whether a hit passes through this one, and if so, the afterimage that says so. */
  private dodged(m: Menace): boolean {
    const miss = BY_KIND[m.kind].miss;
    if (miss <= 0 || Math.random() >= miss) return false;
    if (this.dodges.length < 40) {
      this.dodges.push({ x: m.x, y: m.y, size: girth(m), age: 0, side: Math.random() < 0.5 ? -1 : 1 });
    }
    return true;
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
    for (const d of this.dodges) d.age += dt;
    this.dodges = this.dodges.filter((d) => d.age < DodgeSeconds);
    this.flyShots(dt, body, width, height, guard);

    if (!this.quiet) for (const arrival of this.waves.tick(dt, this.menaces.length)) this.spawn(arrival, width, height);

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
          if (!this.dodged(m)) m.health -= 1;
          if (m.health <= 0) {
            this.fall(m);
            m.burnLeft = 0;
            continue;
          }
        }
      }

      const pace = speed * breed.pace * drag;
      // How hard it corrects toward where it wants to be. Low is heavy, high is nimble.
      let grip = 2.6;
      let goalX = dx / away;
      let goalY = dy / away;
      let want = pace;
      // Off the line by an angle: the weavers and skitterers steer at a heading turned off the
      // straight line, which is what makes them harder to pick off than the ones that walk in.
      const veer = (angle: number): void => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const gx = goalX * cos - goalY * sin;
        goalY = goalX * sin + goalY * cos;
        goalX = gx;
      };
      const edge = away - body.radius - girth(m);
      m.fired += dt;

      if (m.kind === 'zombie') {
        // Hops: it covers its ground in bursts, feet together, and stands between them.
        want = pace * 2 * Math.max(0, Math.sin(m.age * 4.2 + m.phase));
        grip = 6;
      } else if (m.kind === 'spider') {
        // Skitters: quick, uneven, zig-zagging in.
        want = pace * (0.55 + 0.9 * Math.abs(Math.sin(m.age * 7 + m.phase)));
        veer(Math.sin(m.age * 4 + m.phase) * 0.55);
        grip = 5;
      } else if (m.kind === 'bat') {
        // Erratic: it lurches from side to side all the way in.
        veer(Math.sin(m.age * 3.1 + m.phase) * 0.95);
        grip = 3.4;
      } else if (m.kind === 'drake') {
        // Swoops: long lazy curves rather than a line.
        veer(Math.sin(m.age * 1.3 + m.phase) * 0.5);
        grip = 1.6;
      } else if (m.kind === 'boar') {
        // Trots in, and inside its reach lowers its head and charges along the line it picked.
        // It cannot turn mid-charge; it gets its breath back after.
        if (m.mode === 0 && edge <= ChargeReach && m.timer <= 0) {
          m.mode = 1;
          m.timer = ChargeWindSeconds;
          m.bearing = Math.atan2(dy, dx);
        } else if (m.mode === 1 && m.timer <= 0) {
          m.mode = 2;
          m.timer = ChargeRushSeconds;
        } else if (m.mode === 2 && m.timer <= 0) {
          m.mode = 3;
          m.timer = ChargeRest;
        } else if (m.mode === 3 && m.timer <= 0) {
          m.mode = 0;
        }
        if (m.mode === 1) {
          want = 0;
          grip = 8;
        } else if (m.mode === 2) {
          goalX = Math.cos(m.bearing);
          goalY = Math.sin(m.bearing);
          want = pace * ChargeBurst;
          grip = 6;
        } else if (m.mode === 3) {
          want = pace * 0.6;
        }
      } else if (breed.order === 'ranged') {
        // Walks in slowly, and once the body is in range fires on a beat — and keeps creeping in
        // while it does. See `menaces.ts` for why it never stops.
        const reach = breed.range * (m.rank === 'common' ? 1 : 1.15);
        if (edge <= reach) {
          want = pace * InRangeCreep;
          if (m.timer <= 0) {
            m.timer = breed.reload * (m.rank === 'boss' ? 0.8 : 1);
            this.fire(m, body);
          }
        } else if (m.timer < AimSeconds) {
          // Out of range, the tell does not run: it holds its fire until it has something to aim at.
          m.timer = AimSeconds;
        }
      }

      // Steered rather than teleported along the line: a bit of inertia means a dodge actually
      // works, because they overshoot instead of turning on the spot.
      m.vx += (goalX * want - m.vx) * Math.min(1, dt * grip);
      m.vy += (goalY * want - m.vy) * Math.min(1, dt * grip);

      // 山崩's throw, on top of whatever it was doing.
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
      // Faces where it is going, with some reluctance — a crowd milling at the body would otherwise
      // flicker left and right every frame.
      if (m.kind === 'boar' && m.mode !== 0) m.facing = Math.cos(m.bearing) >= 0 ? 1 : -1;
      else if (m.vx > 6) m.facing = 1;
      else if (m.vx < -6) m.facing = -1;

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
          // A charging boar's charge ends where it lands.
          if (m.mode === 2) {
            m.mode = 3;
            m.timer = ChargeRest;
          }
        } else {
          // Spent on the body.
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

  /**
   * A shot, aimed at where the body is now. A king fires three in a fan; an elite's is heavier.
   */
  private fire(m: Menace, body: { x: number; y: number }): void {
    const kind = m.kind === 'gunner' ? 'ball' : 'bolt';
    const speed = kind === 'ball' ? BallSpeed : BoltSpeed;
    const aim = Math.atan2(body.y - m.y, body.x - m.x);
    const spread = m.rank === 'boss' ? [-0.18, 0, 0.18] : [0];
    const size = (kind === 'ball' ? 4.5 : 4) * (m.rank === 'common' ? 1 : m.rank === 'elite' ? 1.4 : 1.8);
    // From the muzzle or the orb rather than the feet, so the shot leaves what fired it.
    const fromX = m.x + m.facing * girth(m) * 0.9;
    const fromY = m.y - girth(m) * 0.6;
    for (const off of spread) {
      if (this.shots.length >= 80) break;
      this.shots.push({
        x: fromX,
        y: fromY,
        vx: Math.cos(aim + off) * speed,
        vy: Math.sin(aim + off) * speed,
        kind,
        size,
        age: 0,
      });
    }
    m.fired = 0;
  }

  /**
   * Moves every shot, and lands the ones that reach the body.
   *
   * A shot that lands is a contact like any other: it is what the grace window and 固土's shell
   * are for, and it costs the same.
   */
  private flyShots(
    dt: number,
    body: { x: number; y: number; radius: number },
    width: number,
    height: number,
    guard?: { absorb(): boolean },
  ): void {
    const flying: Shot[] = [];
    for (const shot of this.shots) {
      shot.age += dt;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (Math.hypot(shot.x - body.x, shot.y - body.y) <= body.radius + shot.size) {
        if (this.grace <= 0 && !guard?.absorb()) {
          this.hurt += ContactDamage;
          this.grace = GraceSeconds;
        }
        continue;
      }
      const off = shot.x < -60 || shot.y < -60 || shot.x > width + 60 || shot.y > height + 60;
      if (shot.age < ShotSeconds && !off) flying.push(shot);
    }
    this.shots = flying;
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
    const pieces = m.rank !== 'common' ? 9 : 6;
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

  /**
   * Puts one down where it is told, already arrived, through the same factory the border uses. For
   * the checks and for looking at one kind on purpose; a level never calls it.
   */
  hurl(kind: Kind, rank: Rank, x: number, y: number): void {
    this.menaces.push(born(kind, x, y, this.hits(kind, rank), { rank, arrival: 1, wave: 0 }));
  }

  /** Takes everything off the field without counting any of it. For the checks. */
  clearField(): void {
    this.menaces = [];
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
    if (this.menaces.length === 0 && this.undoing.length === 0 && this.shots.length === 0 && this.dodges.length === 0) {
      return null;
    }
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const m of this.menaces) {
      // Per kind and rank, because they are not one size: a king's aura reaches a radius and a
      // half, a drake's wings and the height it flies at more. A clipped dirty rect leaves a smear
      // on the desktop rather than a missing sprite.
      const pad = girth(m) * 2.2 + 10;
      left = Math.min(left, m.x - pad);
      top = Math.min(top, m.y - pad);
      right = Math.max(right, m.x + pad);
      bottom = Math.max(bottom, m.y + pad);
    }
    for (const shot of [...this.shots, ...this.dodges]) {
      const reach = ('kind' in shot ? shot.size * 4 : shot.size * 3) + 10;
      left = Math.min(left, shot.x - reach);
      top = Math.min(top, shot.y - reach);
      right = Math.max(right, shot.x + reach);
      bottom = Math.max(bottom, shot.y + reach);
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
   * What is on the ground under everything else: the ones coming apart. Each creature is drawn in
   * depth order by `collect`; shots and dodges are in the air and drawn last, by `drawAir`.
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
    const breed = BY_KIND[m.kind];
    context.save();
    context.translate(m.x, m.y);
    context.globalAlpha = m.arrival;
    const reach = breed.range * (m.rank === 'common' ? 1 : 1.15);
    drawCreature(context, {
      kind: m.kind,
      rank: m.rank,
      size: girth(m) * (0.4 + 0.6 * m.arrival),
      facing: m.facing,
      t: m.age + m.phase,
      stride: Math.min(1, Math.hypot(m.vx, m.vy) / 40),
      aim:
        m.kind === 'boar'
          ? m.mode === 1
            ? 1 - m.timer / ChargeWindSeconds
            : 0
          : reach > 0 && m.timer < AimSeconds
            ? 1 - m.timer / AimSeconds
            : 0,
      rush: m.kind === 'boar' && m.mode === 2,
      fired: m.fired,
    });
    context.restore();
  }

  /**
   * What is in the air: cannonballs, bolts, and the afterimages of dodges. Drawn after everything
   * standing on the ground, because nothing standing is in front of something flying over it.
   */
  drawAir(context: CanvasRenderingContext2D): void {
    context.save();
    for (const shot of this.shots) {
      if (shot.kind === 'ball') {
        // Iron, with a fuse still burning and a little smoke behind.
        context.fillStyle = 'rgba(200, 196, 186, 0.35)';
        context.beginPath();
        context.arc(shot.x - shot.vx * 0.04, shot.y - shot.vy * 0.04, shot.size * 0.9, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#2a2a34';
        context.strokeStyle = '#120e1a';
        context.lineWidth = 1.2;
        context.beginPath();
        context.arc(shot.x, shot.y, shot.size, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        context.beginPath();
        context.arc(shot.x - shot.size * 0.35, shot.y - shot.size * 0.35, shot.size * 0.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = Math.sin(shot.age * 40) > 0 ? '#ffd24a' : '#ff7a2a';
        context.beginPath();
        context.arc(shot.x + shot.size * 0.6, shot.y - shot.size * 0.8, shot.size * 0.28, 0, Math.PI * 2);
        context.fill();
      } else {
        // A bolt of dark qi: a glowing core and a tail of sparks.
        const glow = context.createRadialGradient(shot.x, shot.y, 0, shot.x, shot.y, shot.size * 2.6);
        glow.addColorStop(0, 'rgba(230, 200, 255, 0.95)');
        glow.addColorStop(0.4, 'rgba(160, 90, 240, 0.6)');
        glow.addColorStop(1, clear('#a05af0'));
        context.fillStyle = glow;
        context.beginPath();
        context.arc(shot.x, shot.y, shot.size * 2.6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(200, 150, 255, 0.5)';
        for (let i = 1; i <= 3; i++) {
          context.beginPath();
          context.arc(shot.x - shot.vx * 0.02 * i, shot.y - shot.vy * 0.02 * i, shot.size * (0.7 - i * 0.15), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    for (const d of this.dodges) {
      // The afterimage: two pale arcs where it was, sliding off to the side it went.
      const t = d.age / DodgeSeconds;
      context.globalAlpha = (1 - t) * 0.7;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      const x = d.x + d.side * t * d.size * 1.6;
      context.beginPath();
      context.arc(x, d.y, d.size * 0.9, -0.9, 0.9);
      context.stroke();
      context.beginPath();
      context.arc(x - d.side * d.size * 0.5, d.y, d.size * 0.7, -0.8, 0.8);
      context.stroke();
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
 * A factory rather than an object literal at the call site, because a `Menace` grows a field every
 * time the roster does, and a literal that missed one is the kind of bug that shows up as one kind
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
    burnLeft: 0,
    burnNext: 0,
    phase: Math.random() * Math.PI * 2,
    arrival: extra.arrival ?? 0,
    health,
    age: 0,
    // The ranged ones arrive with most of a reload to go, so a crowd of them does not open fire in
    // the same instant.
    timer: extra.timer ?? BY_KIND[kind].reload * (0.4 + Math.random() * 0.6),
    bearing: 0,
    mode: 0,
    fired: 99,
    facing: x < 0 ? 1 : -1,
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
