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
 * mean when they say the early game of that genre drags. So all four slots are drafted before the
 * first 邪气 arrives, three cards at a time, and the run starts with a whole build already on the
 * screen. Everything the meter buys after that is depth on top, never the thing you were waiting
 * for.
 */
import {
  CardsPerOffer,
  type Combo,
  type Evolution,
  EVOLUTIONS,
  JackpotChance,
  MaxLevel,
  SCHOOLS,
  type School,
  Slots,
  type Triad,
  activeCombos,
  activeTriads,
  exchangeCost,
  partners,
} from './schools.js';

export interface Holding {
  school: School;
  level: number;
  evolved: boolean;
}

/**
 * One card in an offer.
 *
 * `mend` exists so an offer is never empty. Every other card can run out — all four slots filled
 * and everything at its ceiling is a real state at 大乘 — and a meter that fills up with nothing to
 * spend it on would read as broken rather than as finished.
 */
export type Card =
  | { kind: 'take'; school: School }
  | { kind: 'raise'; school: School }
  | { kind: 'evolve'; school: School }
  | { kind: 'mend' }
  | { kind: 'shield' };

/** What `mend` gives back, in points of 护体. */
export const MendAmount = 3;

/**
 * 金钟 — how many layers of shell you can draft, and how long a broken one takes to re-form.
 *
 * This used to be 山岳's passive, and it was the only thing in the mode that ate a hit. 山岳 became
 * an eruption, which left the body with **no defence but moving** — a real change to how a run
 * plays, and not one anybody asked for. So it comes back on its own card rather than as some
 * school's second job: you can choose to be harder to kill, and it costs you the exchange you
 * would have spent getting stronger.
 *
 * Three is the cap because a fourth layer stops being insurance and starts being a licence to
 * stand in the crowd — which is the one thing this mode is built to punish.
 */
export const MaxShields = 3;

/**
 * The level a school has to reach before its jackpot can appear.
 *
 * Three of five rather than five of five, which is where the genre normally puts it. Five is
 * reachable in a twenty-minute run and not in a ninety-second one, and a jackpot nobody can draw
 * is a jackpot that does not exist. Three is two raises past the draft: affordable at every realm,
 * comfortable at the high ones.
 */
export const EvolveLevel = 3;

export class Arsenal {
  private slots: Holding[] = [];
  private exchanges = 0;
  /** Kills banked toward the next exchange, and the total for the run. */
  private credit = 0;
  private total = 0;
  /** Opening drafts still owed before the fight starts. */
  private opening = 0;

  start(): void {
    this.shieldsTaken = 0;
    this.slots = [];
    this.exchanges = 0;
    this.credit = 0;
    this.total = 0;
    this.opening = Slots;
  }

  get held(): Holding[] {
    return this.slots;
  }

  get schools(): School[] {
    return this.slots.map((h) => h.school);
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

  has(school: School): boolean {
    return this.slots.some((h) => h.school === school);
  }

  levelOf(school: School): number {
    return this.slots.find((h) => h.school === school)?.level ?? 0;
  }

  isEvolved(school: School): boolean {
    return this.slots.find((h) => h.school === school)?.evolved ?? false;
  }

  /** Every combination the current build completes. */
  combos(): Combo[] {
    return activeCombos(this.schools);
  }

  /** Every 三合 the current build completes. */
  triads(): Triad[] {
    return activeTriads(this.schools);
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
   * Offers are **not** weighted toward what pairs with your build. Holding one school, three of the
   * other eight are its partners, so a random three already contains a partner 82% of the time —
   * the graph does the steering, and putting a thumb on it as well would turn the draft into a
   * formality with three cards drawn on it.
   */
  offer(random: () => number): Card[] {
    const pool: Card[] = [];

    if (this.slots.length < Slots) {
      for (const school of SCHOOLS) if (!this.has(school)) pool.push({ kind: 'take', school });
    } else {
      for (const h of this.slots) {
        if (h.level < MaxLevel && !h.evolved) pool.push({ kind: 'raise', school: h.school });
      }
    }

    // 金钟 sits in the same pool as everything else, so taking it is a real trade rather than a
    // free extra — a layer of shell instead of a level. It drops out once it is maxed, which is
    // what stops a late offer being three of them.
    //
    // **Never in the opening four.** Those are owed before the first 邪气 arrives and they are what
    // makes an unattended run worth nothing; a shell among them is a run that starts with three
    // schools instead of four, and the checks caught exactly that. It is a mid-run trade, which is
    // also when you know whether you need it.
    if (this.opening <= 0 && this.shieldsTaken < MaxShields) pool.push({ kind: 'shield' });

    const cards = pick(pool, CardsPerOffer, random);

    // The jackpot replaces a card rather than being a fourth one, so the offer is always a choice
    // of three and never "the good one plus two others you are not going to read".
    const ripe = this.evolvable();
    if (ripe.length > 0 && random() < JackpotChance) {
      const chosen = ripe[Math.floor(random() * ripe.length) % ripe.length];
      const card: Card = { kind: 'evolve', school: chosen.of };
      if (cards.length === 0) cards.push(card);
      else cards[Math.floor(random() * cards.length) % cards.length] = card;
    }

    while (cards.length < CardsPerOffer) cards.push({ kind: 'mend' });
    return cards;
  }

  /**
   * Which jackpots are live.
   *
   * Gated on **holding the school's partner**, which ties the two systems into one: the pairings
   * would otherwise be a side quest with its own rewards and the jackpot a slot machine that
   * ignores them. This way, going for a combination is how you buy the ticket.
   */
  evolvable(): Evolution[] {
    const out: Evolution[] = [];
    for (const h of this.slots) {
      if (h.evolved || h.level < EvolveLevel) continue;
      if (partners(h.school).some((p) => this.has(p))) out.push(EVOLUTIONS[h.school]);
    }
    return out;
  }

  /**
   * Spends the offer. Returns what to do about it, for the things this class does not own.
   *
   * `mend` is somebody else's business — 护体 belongs to the run, not to the build — so it comes
   * back as a value rather than being reached for from in here.
   */
  /** How many layers of 金钟 have been drafted. */
  get shields(): number {
    return this.shieldsTaken;
  }

  private shieldsTaken = 0;

  take(card: Card): { mend: number } {
    if (this.opening > 0) this.opening -= 1;
    else {
      this.credit = Math.max(0, this.credit - exchangeCost(this.exchanges));
      this.exchanges += 1;
    }

    if (card.kind === 'take') {
      if (!this.has(card.school) && this.slots.length < Slots) {
        this.slots.push({ school: card.school, level: 1, evolved: false });
      }
      return { mend: 0 };
    }
    if (card.kind === 'raise') {
      const h = this.slots.find((x) => x.school === card.school);
      if (h && h.level < MaxLevel) h.level += 1;
      return { mend: 0 };
    }
    if (card.kind === 'evolve') {
      const h = this.slots.find((x) => x.school === card.school);
      if (h) {
        h.evolved = true;
        // An evolution is the ceiling, so it takes the level with it. Otherwise the card would
        // compete with its own raises for the rest of the run.
        h.level = MaxLevel;
      }
      return { mend: 0 };
    }
    if (card.kind === 'shield') {
      this.shieldsTaken = Math.min(MaxShields, this.shieldsTaken + 1);
      return { mend: 0 };
    }
    return { mend: MendAmount };
  }
}

/** `count` distinct entries, or all of them when there are fewer. Fisher–Yates on a copy. */
function pick<T>(from: T[], count: number, random: () => number): T[] {
  const bag = from.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.slice(0, Math.min(count, bag.length));
}
