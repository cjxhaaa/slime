/**
 * 波次 — ten waves to a level, and what each one sends.
 *
 * ```
 * 波1 波2 波3 [波4 精英] 波5 波6 波7 [波8 精英] 波9 [波10 首领] → 过关
 * ```
 *
 * ## The three minutes are a timetable, not a time limit
 *
 * **All ten waves are out within `SpawnSeconds` of the level starting**, every one of them on a
 * latest-start time. Nothing waits for you: a wave you have not finished is still there when the
 * next one arrives on top of it. That is what keeps a level at a desk-pet length whoever is
 * playing — a strong build cannot be made to wait for the clock, and a weak one cannot stretch the
 * level out by being slow.
 *
 * And **clear the field and the next wave comes early**, after a breath. The timetable is when a
 * wave arrives at the latest, never the earliest; somebody killing everything as it lands should
 * not stand in an empty field waiting for a clock.
 *
 * **There is no timeout.** The three minutes say when the 邪气 stop *arriving*, not when the level
 * stops. A level ends one of two ways: everything that came has been killed, or the body has
 * fallen. The ninety-second run had a third ending — time ran out and you were still standing —
 * which was neither, and paid as if it were a win; there is no such thing here.
 *
 * ## The dots
 *
 * `through` used to be seconds over ninety, a progress bar nobody could see. Now each wave has a
 * dot that fills as its 邪气 are killed, and since waves can overlap, each 邪气 carries the wave it
 * came in with — killing a straggler from wave two finishes wave two's dot, wherever the timetable
 * has got to.
 *
 * This class knows nothing about where anything is. It says *what* is due and *when*; `Trial` puts
 * it on the border and tells this what became of it.
 */
import { arrivalRate, clampLevel, waveSize } from './levels.js';
import { Champions, type Kind, type Rank } from './menaces.js';

/** Waves to a level. */
export const WavesPerLevel = 10;

/** Which waves bring something bigger, counting from 0. The 4th and 8th, and the 10th. */
export const EliteWaves = [3, 7];
export const BossWave = WavesPerLevel - 1;

/**
 * The whole timetable: by this many seconds into a level, all ten waves have arrived.
 *
 * Counted on the fight's own clock — the one `Trial.update` is given — so a pause, the dialog
 * before the level and the wait for a first weapon are none of them in it.
 */
export const SpawnSeconds = 180;

/** A beat of quiet before the first arrival, so entering the mode is not also being attacked. */
export const OpeningQuiet = 1.2;
/**
 * The breath between clearing the field and the next wave being called early.
 *
 * Long enough to see that the field is empty and the next dot has lit, short enough that it is a
 * breath rather than a wait — the desk-pet version of this mode cannot afford dead air.
 */
export const WaveRest = 2.4;

/** One thing due on the border. Commons and elites have their breed rolled when they arrive. */
export interface Arrival {
  rank: Rank;
  /** Fixed in advance only for a boss, whose breed belongs to the level rather than the moment. */
  kind?: Kind;
  /** Which wave it came with, from 0. Filled in when the wave opens. */
  wave?: number;
}

/** Seconds a wave takes to come in, start to last arrival. */
export function spawnTime(level: number, wave: number): number {
  return lineup(level, wave).length / arrivalRate(level, wave);
}

/**
 * When a wave arrives at the latest, in seconds from the start of the level.
 *
 * Evenly spaced from the end of the opening quiet to the point where the last wave still has time
 * to finish coming in before `SpawnSeconds`. Even rather than front-loaded because the waves grow:
 * a timetable that crowded the start would put the biggest waves on top of each other at the end.
 */
export function latestStart(level: number, wave: number): number {
  const last = SpawnSeconds - spawnTime(level, BossWave);
  return OpeningQuiet + ((last - OpeningQuiet) * Math.max(0, Math.min(BossWave, wave))) / BossWave;
}

/** What rank a wave is headlined by. */
export function rankOf(wave: number): Rank {
  if (wave === BossWave) return 'boss';
  return EliteWaves.includes(wave) ? 'elite' : 'common';
}

/**
 * The boss of a level.
 *
 * Fixed per level rather than rolled, so "the boss of level twelve" is a thing that exists and can
 * be learned. It cycles through the five that are allowed to be one (`Champions`), starting with
 * 游魂 — the first boss anybody meets should be the breed they have already met three hundred of.
 */
export function bossOf(level: number): Kind {
  return Champions[(clampLevel(level) - 1) % Champions.length];
}

/** How many elites an elite wave brings: one, then two past a third of the way up, then three. */
export function elitesAt(level: number): number {
  return 1 + Math.floor((clampLevel(level) - 1) / 33);
}

/**
 * Everything a wave will send, in order.
 *
 * - **Common** waves are `waveSize` of the ordinary kind.
 * - **Elite** waves trade a quarter of that for their elites, spread through the batch rather than
 *   bunched at the front — the first one walks in a third of the way through, when there is
 *   already a crowd it has to be picked out of.
 * - **The boss** leads its wave, with half a wave behind it. It leads because it is slow to kill
 *   and the level ends the moment it does; at the back, the whole escort would have to be fought
 *   through first, and the last wave would be the longest wait of the level.
 */
export function lineup(level: number, wave: number): Arrival[] {
  const size = waveSize(level, wave);
  const rank = rankOf(wave);
  if (rank === 'common') return new Array(size).fill(null).map(() => ({ rank: 'common' }));

  if (rank === 'boss') {
    const escort = Math.round(size * 0.5);
    return [
      { rank: 'boss', kind: bossOf(level) },
      ...new Array(escort).fill(null).map((): Arrival => ({ rank: 'common' })),
    ];
  }

  const commons = Math.round(size * 0.75);
  const elites = elitesAt(level);
  const out: Arrival[] = new Array(commons).fill(null).map(() => ({ rank: 'common' }));
  for (let i = elites - 1; i >= 0; i--) {
    // Inserted from the back so the earlier indices are not shifted by the later inserts.
    const at = Math.round((commons * (i + 1)) / (elites + 2));
    out.splice(at, 0, { rank: 'elite' });
  }
  return out;
}

export class Waves {
  private level = 1;
  /** Seconds the fight has been given. */
  private clock = 0;
  /** How many waves have opened. */
  private opened = 0;
  /** Everything opened and not yet on the border, in order, each tagged with its wave. */
  private queue: Arrival[] = [];
  /** Seconds to the next arrival. */
  private gap = 0;
  /** Counting down to calling the next wave early, once the field is empty; null when not. */
  private calling: number | null = null;
  /** Per wave: how many it sent or will send, how many of those are gone, and the high-water mark. */
  private size: number[] = [];
  private gone: number[] = [];
  /**
   * The highest share of each wave that has been gone.
   *
   * A high-water mark, so a dot can only ever fill. Nothing in the roster adds to a wave mid-fight
   * today — the 裂魄 that came apart into two is gone — but progress that retreats when you do
   * well is the one thing a progress display must never do, and this is what guarantees it.
   */
  private best: number[] = [];

  start(level: number): void {
    this.level = clampLevel(level);
    this.clock = 0;
    this.opened = 0;
    this.queue = [];
    this.gap = 0;
    this.calling = null;
    this.size = new Array(WavesPerLevel).fill(0);
    this.gone = new Array(WavesPerLevel).fill(0);
    this.best = new Array(WavesPerLevel).fill(0);
  }

  /** The newest wave that has opened, counting from 0. 0 before the first one, too. */
  get wave(): number {
    return Math.max(0, this.opened - 1);
  }

  /** True once all ten have opened and the last of them is on the field. */
  get allOut(): boolean {
    return this.opened === WavesPerLevel && this.queue.length === 0;
  }

  /** Seconds of fight so far. */
  get seconds(): number {
    return this.clock;
  }

  /**
   * Each wave's dot: -1 before it has opened, then how much of it is gone, 0 to 1. Exactly 1 only
   * once every one it sent has arrived and gone.
   */
  marks(): number[] {
    return this.size.map((_, i) => {
      if (i >= this.opened) return -1;
      if (this.cleared(i)) return 1;
      return Math.min(0.999, this.best[i]);
    });
  }

  /** The dots summed, over ten. Never 1 on its own — see `Trial.through`. */
  get through(): number {
    return Math.min(0.999, this.marks().reduce((sum, mark) => sum + Math.max(0, mark), 0) / WavesPerLevel);
  }

  /**
   * Arrivals due this frame.
   *
   * `alive` is how many are on the field. Two things open the next wave: its latest start time
   * coming round, or the field being empty with nothing left to come — after a breath.
   */
  tick(dt: number, alive: number): Arrival[] {
    this.clock += dt;
    if (this.opened < WavesPerLevel) {
      if (this.queue.length === 0 && alive === 0 && this.opened > 0) {
        this.calling = (this.calling ?? WaveRest) - dt;
      } else {
        this.calling = null;
      }
      const due = this.clock >= latestStart(this.level, this.opened);
      if (due || (this.calling !== null && this.calling <= 0)) this.open();
    }

    const out: Arrival[] = [];
    if (this.queue.length === 0) return out;
    this.gap -= dt;
    while (this.gap <= 0 && this.queue.length > 0) {
      const next = this.queue.shift() as Arrival;
      out.push(next);
      this.gap += 1 / arrivalRate(this.level, next.wave ?? 0);
    }
    return out;
  }

  /** `count` of a wave are gone, killed or spent on the body. */
  resolve(wave: number, count: number): void {
    this.gone[wave] += count;
    if (this.size[wave] > 0) this.best[wave] = Math.max(this.best[wave], this.gone[wave] / this.size[wave]);
  }

  /** Everything a wave sent is out and gone. */
  private cleared(wave: number): boolean {
    if (wave >= this.opened || this.gone[wave] < this.size[wave]) return false;
    return !this.queue.some((a) => a.wave === wave);
  }

  private open(): void {
    const wave = this.opened;
    const sent = lineup(this.level, wave).map((a) => ({ ...a, wave }));
    // Straight onto the end of the queue: if the wave before is still coming in, this one follows
    // it rather than interleaving, and the gap carries on from wherever it had got to.
    if (this.queue.length === 0) this.gap = 0;
    this.queue.push(...sent);
    this.size[wave] = sent.length;
    this.opened += 1;
    this.calling = null;
  }
}
