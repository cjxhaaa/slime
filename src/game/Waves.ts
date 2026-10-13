/**
 * 波次 — ten waves to a level, and what each one sends.
 *
 * ```
 * 波1 波2 波3 [波4 精英] 波5 波6 波7 [波8 精英] 波9 [波10 首领] → 过关
 * ```
 *
 * **A wave is a batch, not a span of time.** It trickles in, it is fought, and only when the last of
 * it is gone does the next one come. There is no clock anywhere in here, and that is the point: the
 * ninety-second run had a third ending — the time ran out and you were still standing — which was
 * neither a win nor a loss and paid as if it were the first. A level ends one of two ways now. The
 * boss falls, or the body does.
 *
 * It also turns `through` into something visible. It used to be seconds over ninety, a progress
 * bar nobody could see; now it is waves cleared plus how much of this one is gone, which is the row
 * of dots on the screen.
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

/** A beat of quiet before the first arrival, so entering the mode is not also being attacked. */
export const OpeningQuiet = 1.2;
/**
 * The breath between one wave and the next.
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
  /** The wave in progress, from 0. Also how many have been cleared. */
  private current = 0;
  private queue: Arrival[] = [];
  /** Seconds to the next arrival, and to the end of a breath between waves. */
  private gap = 0;
  private rest = 0;
  /** How many this wave has sent or will send, and how many of those are gone. */
  private size = 0;
  private gone = 0;
  /**
   * The highest share of this wave that has been gone.
   *
   * Held as a high-water mark because 裂魄 comes apart into two: a kill that adds two to the wave
   * would otherwise move the dot *backwards*, and progress that retreats when you do well is the
   * one thing a progress display must never do.
   */
  private best = 0;

  start(level: number): void {
    this.level = clampLevel(level);
    this.current = 0;
    this.open(OpeningQuiet);
  }

  /** The wave in progress, counting from 0. */
  get wave(): number {
    return this.current;
  }

  /** Between waves, nothing on the way. */
  get resting(): boolean {
    return this.rest > 0;
  }

  /** How much of the wave in progress is gone, 0 to just under 1. */
  get progress(): number {
    return Math.min(0.999, this.best);
  }

  /** Waves cleared plus how far into this one, over ten. Never reaches 1 on its own — see `Trial`. */
  get through(): number {
    return (this.current + this.progress) / WavesPerLevel;
  }

  /**
   * Arrivals due this frame.
   *
   * `alive` is how many of the wave are still on the field. The next wave opens only once the queue
   * is spent **and** that is zero — "sent" is not "cleared", and a wave that moved on while three
   * of its 邪气 were still walking in would make the dots a clock again.
   *
   * The last wave never opens a next one. It ends when its boss does, which is `Trial`'s to call.
   */
  tick(dt: number, alive: number): Arrival[] {
    if (this.rest > 0) {
      this.rest -= dt;
      if (this.rest > 0) return [];
    }
    const out: Arrival[] = [];
    if (this.queue.length > 0) {
      this.gap -= dt;
      while (this.gap <= 0 && this.queue.length > 0) {
        out.push(this.queue.shift() as Arrival);
        this.gap += 1 / arrivalRate(this.level, this.current);
      }
      return out;
    }
    if (alive === 0 && this.current < BossWave) {
      this.current += 1;
      this.open(WaveRest);
    }
    return out;
  }

  /** `count` more have joined the wave mid-fight — 裂魄 coming apart. */
  swell(count: number): void {
    this.size += count;
  }

  /** `count` of the wave are gone, killed or spent on the body. */
  resolve(count: number): void {
    this.gone += count;
    if (this.size > 0) this.best = Math.max(this.best, this.gone / this.size);
  }

  private open(rest: number): void {
    this.queue = lineup(this.level, this.current);
    this.size = this.queue.length;
    this.gone = 0;
    this.best = 0;
    this.gap = 0;
    this.rest = rest;
  }
}
