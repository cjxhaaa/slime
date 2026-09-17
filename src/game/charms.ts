/**
 * The hoard of talisman charms, and what it buys.
 *
 * Charms used to be worth a sliver of qi and nothing else — `keycapValue`, about 1.86 seconds of
 * output each. Picking one up was a reward you could not see, which is a strange thing to send the
 * pet across the desktop for. They are counted now, and the count spends on two things:
 *
 * - **Advancing a stage without being asked.** A full stage hops at you for a click; with charms
 *   banked the pet just gets on with it.
 * - **The odds on a realm.** 修为 gets you to the threshold; charms decide whether crossing it
 *   works.
 *
 * Taking their qi away costs the economy almost nothing — 1.86 seconds against a ladder measured in
 * days — so this is a re-purposing rather than a nerf. It is also the reason the number can be
 * priced in the hundreds without unbalancing anything: the supply is capped in Rust at one charm
 * per 5.5 seconds of typing, so a heavy run banks something like four thousand of them, and a cost
 * of forty is a real decision while a cost of two would be noise.
 */

/**
 * What a stage costs to take automatically.
 *
 * Forty, against roughly four thousand a run and seventy-two stages to spend them on. It is meant
 * to be affordable and not free: somebody who types all day never sees the breakthrough alert
 * again, and somebody who barely types clicks it themselves, which costs nothing.
 */
export const StageCost = 40;

/**
 * The floor automatic breakthroughs will not spend below.
 *
 * This is the whole reason the feature needs no setting. Convenience and insurance are drawn from
 * the same pot, so without a floor a run of cheap automatic stages would quietly empty the hoard
 * that was keeping the next realm safe — and the player would have no lever to stop it, because
 * the spending happens while they are not looking. Holding a hundred back means the pot is never
 * raided below the point where a realm is a certainty.
 */
export const StageSpendFloor = 100;

/** Where the odds on a realm start with nothing banked, and what a charm adds. */
export const BaseOdds = 0.6;
export const OddsPerCharm = 0.004;
/**
 * What each failure adds to that realm's floor, permanently.
 *
 * Not in the brief, and it is here anyway, because sixty percent with no pity has a tail: four
 * failures in a row is a one-in-forty event, and four failures at 大乘 is something like three and
 * a half hours. A desk pet costing twenty-five yuan does not get to take an afternoon off somebody
 * because of dice. With this, the fifth attempt is a certainty however the first four went.
 */
export const OddsPerFailure = 0.1;

/**
 * What a failed realm breakthrough takes off the qi bar, as a fraction of the current stage's
 * requirement.
 *
 * Of the *stage*, which is the only reading that maps onto anything that exists: qi is a single
 * running number holding progress through the stage you are on, and the eight stages behind it
 * spent theirs on the way past. There is no stored "realm total" to take a fifth of.
 *
 * Worth knowing what it means in time, since the same fraction is two very different prices at the
 * two ends of the ladder: about half a minute at 练气, two minutes at 金丹, and **roughly fifty
 * minutes at 大乘** at full output — two and a half hours at the idle floor.
 */
export const FailureQiLoss = 0.2;

export interface CharmSnapshot {
  /** How many are banked. */
  held: number;
  /** How many realm breakthroughs have failed, per realm index. Sparse; missing means none. */
  failures: Record<string, number>;
}

/**
 * The odds of a realm breakthrough landing, 0 to 1.
 *
 * Never zero and never impossible without charms, which matters more than the exact numbers: the
 * same rule that stops the realm deciding whether a window can be eaten applies here. Charms move
 * the odds. They are not a ticket.
 */
export function odds(held: number, failures: number): number {
  const earned = BaseOdds + OddsPerFailure * failures + OddsPerCharm * Math.max(0, held);
  return Math.min(1, earned);
}

/** How many charms it would take, from here, to make the next attempt a certainty. */
export function charmsForCertainty(held: number, failures: number): number {
  const missing = 1 - odds(held, failures);
  return Math.max(0, Math.ceil(missing / OddsPerCharm));
}

/** True when a stage can be taken automatically, leaving the insurance floor intact. */
export function canAutoAdvance(held: number): boolean {
  return held - StageCost >= StageSpendFloor;
}

export class Charms {
  private held = 0;
  private failures: Record<string, number> = {};

  restore(snapshot: CharmSnapshot): void {
    this.held = Math.max(0, Math.floor(snapshot.held));
    this.failures = { ...snapshot.failures };
  }

  snapshot(): CharmSnapshot {
    return { held: this.held, failures: { ...this.failures } };
  }

  get count(): number {
    return this.held;
  }

  /** One went in. */
  gather(many = 1): void {
    this.held += many;
  }

  failuresAt(realm: number): number {
    return this.failures[String(realm)] ?? 0;
  }

  oddsAt(realm: number): number {
    return odds(this.held, this.failuresAt(realm));
  }

  /** How many more would make the next attempt at this realm certain. */
  shortfallAt(realm: number): number {
    return charmsForCertainty(this.held, this.failuresAt(realm));
  }

  /** Spends a stage's worth if that can be done without touching the floor. */
  takeStage(): boolean {
    if (!canAutoAdvance(this.held)) return false;
    this.held -= StageCost;
    return true;
  }

  /**
   * Wipes the hoard and remembers the failure.
   *
   * All of it, not just a stake — the whole pot was in play, which is what "your charms decide the
   * odds" has to mean if there is no interface for choosing a stake. It is also the sharpest part
   * of the cost, because it is what makes the *next* attempt worse than this one would have been.
   */
  fail(realm: number): void {
    this.held = 0;
    const key = String(realm);
    this.failures[key] = (this.failures[key] ?? 0) + 1;
  }

  /**
   * Clears the failures for a realm once it is behind you.
   *
   * Otherwise a rebirth would inherit the pity from the previous run, and the second time up the
   * ladder would be easier than the first for a reason nobody could see.
   */
  clearFailures(): void {
    this.failures = {};
  }
}
