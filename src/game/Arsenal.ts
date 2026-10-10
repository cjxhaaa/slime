/**
 * What you are carrying this run, and what the next offer looks like.
 *
 * Per run, and it does not persist. A 历练 build that carried over would be a second progression
 * ladder running alongside 境界, competing with it for the same attention and quietly deciding how
 * hard the fight is before you enter it — and the realm is supposed to be the thing that decides
 * that. You walk in with nothing every time and the first four offers hand you a build.
 *
 * ## Why four picks are free at the start
 *
 * A survivors run normally opens with one weapon and earns the rest, and that is fine over twenty
 * minutes. This run is **ninety seconds.** Earning the fourth slot at minute four does not make the
 * first minute exciting, it makes it the part you sit through — and the ramp is most of what people
 * mean when they say the early game of that genre drags. So the whole kit is drafted before the
 * first 邪气 arrives, three cards at a time, and the run starts with a build already on the screen.
 * Everything the meter buys after that is depth on top, never the thing you were waiting for.
 *
 * ## One weapon, three ways
 *
 * The opening deals a **weapon first**, then three 五行. That order is not decoration: the opening
 * picks are what make an unattended run worth nothing, and a run that opened by drafting three
 * elements and no weapon would be a pet standing in a crowd with nothing to swing.
 *
 * ## Duplicates deepen
 *
 * There is no separate "raise" card. Drafting a weapon you already carry deepens it; a different
 * one swaps it and **keeps your three ways**, which is the whole reason swapping is interesting
 * rather than a reset. Drafting a way you already walk deepens that. So every card in the pool
 * either gives you something new or makes something you have better, and there is no third kind.
 */
import {
  MaxDepth,
  type Way,
  WAYS,
  type Weapon,
  WEAPONS,
  Ways,
} from './kit.js';

/** The weapon in hand, and how deep it is carried. */
export interface Armed {
  weapon: Weapon;
  depth: number;
}

/** One of the ten, and how deep. */
export interface Walked {
  way: Way;
  depth: number;
}

/**
 * One card in an offer.
 *
 * `mend` exists so an offer is never empty. Every other card can run out — a full kit with
 * everything at its ceiling is a real state at 大乘 — and a meter that fills up with nothing to
 * spend it on would read as broken rather than as finished.
 */
export type Card =
  | { kind: 'arm'; weapon: Weapon }
  | { kind: 'way'; way: Way }
  | { kind: 'mend' }
  | { kind: 'shield' };

/** Cards per offer. */
export const CardsPerOffer = 3;

/**
 * What the meter costs for the nth exchange of a run, counting from zero.
 *
 * Escalating rather than flat, because a flat cost cannot serve both ends of the ladder: a run kills
 * between five and ten hundred things depending on the realm, so any single figure is either a
 * handful of exchanges at the bottom or dozens at the top.
 *
 * The first one costs thirty because of when it lands rather than what it is worth. At six kills a
 * second — which is what a freshly drafted kit does — a cost of eight put the first upgrade
 * at **1.3 seconds**, so the run had no opening: you were snowballing before you had looked at the
 * screen. Thirty puts it around five seconds in, which is long enough to notice that the build you
 * drafted is what is fighting.
 *
 * Growing at 18% gives nine exchanges over a 筑基 run and eleven over a 大乘 one. A high realm is a
 * deeper build, which is most of what a realm buys you in here now.
 */
export const FirstExchange = 30;
export const ExchangeGrowth = 1.18;

export function exchangeCost(taken: number): number {
  return Math.round(FirstExchange * ExchangeGrowth ** Math.max(0, taken));
}

/** Total kills to have taken `n` exchanges. */
export function killsForExchanges(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += exchangeCost(i);
  return sum;
}

/** What `mend` gives back, in points of 护体. */
export const MendAmount = 3;

/**
 * 金钟 — how many layers of shell you can draft.
 *
 * Three is the cap because a fourth layer stops being insurance and starts being a licence to
 * stand in the crowd — which is the one thing this mode is built to punish.
 */
export const MaxShields = 3;

/** How many picks the opening owes: one weapon, then the three ways. */
export const Opening = 1 + Ways;

export class Arsenal {
  private arm: Armed | null = null;
  private walked: Walked[] = [];
  private exchanges = 0;
  /** Kills banked toward the next exchange, and the total for the run. */
  private credit = 0;
  private total = 0;
  /** Opening drafts still owed before the fight starts. */
  private opening = 0;
  private shieldsTaken = 0;

  start(): void {
    this.arm = null;
    this.walked = [];
    this.exchanges = 0;
    this.credit = 0;
    this.total = 0;
    this.opening = Opening;
    this.shieldsTaken = 0;
  }

  /** The weapon in hand, or null before the opening has dealt one. */
  get weapon(): Armed | null {
    return this.arm;
  }

  get ways(): Walked[] {
    return this.walked;
  }

  get openingLeft(): number {
    return this.opening;
  }

  get exchangesTaken(): number {
    return this.exchanges;
  }

  get killsBanked(): number {
    return this.total;
  }

  /** How many layers of 金钟 have been drafted. */
  get shields(): number {
    return this.shieldsTaken;
  }

  /** How deep a way is walked, or 0. */
  depthOf(way: Way): number {
    return this.walked.find((w) => w.way === way)?.depth ?? 0;
  }

  /** How full the meter is, 0 to 1. Drawn, so it has to be a fraction rather than a count. */
  get meter(): number {
    const cost = exchangeCost(this.exchanges);
    return Math.min(1, this.credit / cost);
  }

  /** True when an exchange has been paid for and is waiting to be spent. */
  get due(): boolean {
    return this.opening > 0 || this.credit >= exchangeCost(this.exchanges);
  }

  /** One more dead 邪气. Returns true when that was the one that filled the meter. */
  countKill(): boolean {
    this.total += 1;
    const cost = exchangeCost(this.exchanges);
    const wasShort = this.credit < cost;
    this.credit += 1;
    return wasShort && this.credit >= cost;
  }

  /**
   * The next three cards.
   *
   * Offers are **not** weighted toward what your build wants. The draft is a choice between three
   * things you did not pick, and a thumb on the scale would turn it into a formality with three
   * cards drawn on it.
   */
  offer(random: () => number): Card[] {
    const pool: Card[] = [];

    if (this.opening === Opening) {
      // The first card of the run is a weapon, full stop. See the note at the top.
      for (const weapon of WEAPONS) pool.push({ kind: 'arm', weapon });
    } else if (this.opening > 0) {
      // And the rest of the opening fills the three ways, so the run starts able to fight.
      for (const way of WAYS) if (this.depthOf(way) === 0) pool.push({ kind: 'way', way });
    } else {
      // A weapon you hold deepens; one you do not swaps in and keeps your ways. Both are worth
      // offering, so all five are in the pool until the one in hand is at its ceiling — and then
      // only that one drops out.
      for (const weapon of WEAPONS) {
        if (this.arm?.weapon === weapon && this.arm.depth >= MaxDepth) continue;
        pool.push({ kind: 'arm', weapon });
      }
      for (const way of WAYS) {
        const depth = this.depthOf(way);
        // A way you do not walk is only worth offering while there is a slot for it.
        if (depth === 0 && this.walked.length >= Ways) continue;
        if (depth >= MaxDepth) continue;
        pool.push({ kind: 'way', way });
      }
      // 金钟 is a real trade against a level rather than a free extra, and it drops out once it is
      // maxed — which is what stops a late offer being three of them.
      //
      // **Never in the opening.** Those picks are owed before the first 邪气 arrives and they are
      // what makes an unattended run worth nothing; a shell among them is a run that starts a way
      // short, which the checks caught the first time this was written.
      if (this.shieldsTaken < MaxShields) pool.push({ kind: 'shield' });
    }

    const cards = pick(pool, CardsPerOffer, random);
    while (cards.length < CardsPerOffer) cards.push({ kind: 'mend' });
    return cards;
  }

  /**
   * Takes one. Returns what it gave back in 护体, which is nothing for everything but 调息.
   *
   * Every card either hands you something you did not have or deepens something you did. There is
   * no third outcome, which is why this has no branch for "you already had that".
   */
  take(card: Card): { mend: number } {
    if (this.opening > 0) this.opening -= 1;
    else {
      this.credit = Math.max(0, this.credit - exchangeCost(this.exchanges));
      this.exchanges += 1;
    }

    if (card.kind === 'arm') {
      if (this.arm?.weapon === card.weapon) {
        this.arm = { weapon: card.weapon, depth: Math.min(MaxDepth, this.arm.depth + 1) };
      } else {
        // A swap keeps the ways. The weapon is how they come out, not what they are.
        this.arm = { weapon: card.weapon, depth: 1 };
      }
      return { mend: 0 };
    }

    if (card.kind === 'way') {
      const held = this.walked.find((w) => w.way === card.way);
      if (held) held.depth = Math.min(MaxDepth, held.depth + 1);
      else if (this.walked.length < Ways) this.walked.push({ way: card.way, depth: 1 });
      return { mend: 0 };
    }

    if (card.kind === 'shield') {
      this.shieldsTaken = Math.min(MaxShields, this.shieldsTaken + 1);
      return { mend: 0 };
    }

    return { mend: MendAmount };
  }
}

/** `count` of them, without repeats, in the order the generator happens to give. */
function pick<T>(from: T[], count: number, random: () => number): T[] {
  const pool = [...from];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const at = Math.floor(random() * pool.length) % pool.length;
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}
