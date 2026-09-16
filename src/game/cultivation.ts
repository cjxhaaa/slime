import { Ascended, StagesPerRealm, baseRate, fullness, requirement, stageName } from './realms.js';

/**
 * Everything about how fast qi comes in, other than the realm you are in.
 *
 * A list rather than a chain of hardcoded multiplications, from the first release, when there is
 * nothing in it. Twenty lines of difference now, and the difference later between dropping a
 * treasure's bonus in and rewriting how output is computed. The deferred systems are deferred in
 * the gameplay, not in the shape of the code.
 */
export interface RateModifier {
  readonly name: string;
  /** Multiplier on the base rate. 1 means "not currently doing anything". */
  factor(): number;
}

/**
 * Output while the stage is full and the breakthrough has not been taken.
 *
 * Being away has to cost something or there is no reason to ever look at the pet, but it must not
 * cost everything, or coming back to a week of nothing is the last time you come back. A quarter
 * rate is the compromise, and "stuck at a bottleneck" is exactly what the genre calls it.
 */
const BottleneckFactor = 0.25;

/**
 * What the pet earns with nobody at the keyboard.
 *
 * The floor, and it applies to being asleep, locked, at lunch and switched off alike — one rule
 * instead of an offline system, an idle system and a cap. It has to be well short of working (or
 * the pet may as well be left alone) and well clear of nothing (or a weekend away means coming
 * back to a week of no progress, which is the last time anyone comes back).
 */
export const IdleFactor = 0.35;

/**
 * Typing speed the economy is balanced around.
 *
 * Someone at this rate earns exactly the full working rate; slower earns proportionally less, and
 * the backend's cap on how fast keys can be counted stops anyone leaning on a key to earn more.
 * The number is ordinary prose typing, not a peak.
 */
export const ExpectedKeysPerSecond = 5;

/**
 * What nourishment multiplies output by, after swallowing a window.
 *
 * Doubling is the whole of it — the interest is in how long it lasts and how visible the pet is
 * while it does, not in the size of the number.
 */
export const NourishMultiplier = 2;

/**
 * How often the frontend asks what has been typed.
 *
 * Fast, because every key is supposed to knock a speck loose and a quarter-second lag on that would
 * read as the pet being slow rather than as the pet being fed. The *letters* are rationed
 * separately and on the backend, so polling faster cannot make more of them appear.
 */
export const InputPollSeconds = 0.25;

/**
 * Extra for actually fetching a whole key, in seconds of the working top-up.
 *
 * Small on purpose. The motes already add up to the full rate on their own, so this is the tip for
 * walking over there — at roughly one key every five seconds it comes to under a fifth on top, and
 * it must never grow into a reason to sit and watch the pet instead of working.
 */
const KeycapBonusSeconds = 1;

export interface CultivationSnapshot {
  realm: number;
  stage: number;
  qi: number;
  /**
   * How many times this pet has reached the top of the ladder.
   *
   * Counted at the ascension rather than at the rebirth that follows it, because that is the moment
   * something happened — and it is the only number here a rebirth does not reset.
   */
  ascensions: number;
  /** Unix seconds nourishment runs out. In the past, or zero, means none. */
  nourishUntil: number;
}

export class Cultivation {
  realm = 0;
  stage = 0;
  qi = 0;
  ascensions = 0;
  nourishUntil = 0;

  private modifiers: RateModifier[] = [];
  /** Unix seconds. The only clock this class has; everything else is derived from it. */
  private settledAt: number;

  constructor(now = Date.now() / 1000) {
    this.settledAt = now;
    // Registered rather than multiplied in, because it is exactly the kind of thing the pipeline
    // exists for — and because a treasure that raises the floor later should be one more entry
    // here, not a second special case beside this one.
    this.addModifier({ name: 'idle', factor: () => IdleFactor });
  }

  addModifier(modifier: RateModifier): void {
    this.modifiers.push(modifier);
  }

  restore(snapshot: CultivationSnapshot, settledAt: number): void {
    this.realm = snapshot.realm;
    this.stage = snapshot.stage;
    this.qi = snapshot.qi;
    this.ascensions = snapshot.ascensions;
    this.nourishUntil = snapshot.nourishUntil;
    this.settledAt = settledAt;
  }

  snapshot(): CultivationSnapshot {
    return {
      realm: this.realm,
      stage: this.stage,
      qi: this.qi,
      ascensions: this.ascensions,
      nourishUntil: this.nourishUntil,
    };
  }

  /** True while a swallowed window is still paying out. */
  get nourished(): boolean {
    return this.settledAt < this.nourishUntil;
  }

  /** Seconds of nourishment left, for the one line the pet will say about it. */
  get nourishSecondsLeft(): number {
    return Math.max(0, this.nourishUntil - this.settledAt);
  }

  /**
   * Adds to the nourishment already running rather than replacing or compounding it.
   *
   * Two windows swallowed together are an hour of double, not a quarter of an hour of quadruple.
   * The daily allowance is the only cap this needs, and stacking the multiplier instead would make
   * a burst of window-closing the fastest way to progress — which is the one thing the plan's
   * guardrails forbid outright.
   */
  nourish(minutes: number): void {
    const from = Math.max(this.nourishUntil, this.settledAt);
    this.nourishUntil = from + minutes * 60;
  }

  get settledAtSeconds(): number {
    return this.settledAt;
  }

  /** Every multiplier except the bottleneck, which is time-dependent and handled in `settle`. */
  private unthrottledRate(): number {
    let rate = baseRate(this.realm, this.stage) * (1 + 0.5 * this.ascensions);
    for (const modifier of this.modifiers) rate *= modifier.factor();
    // Not a registered modifier, for the same reason the bottleneck is not one: both depend on
    // *when* rather than on state, so both have to be resolved by whoever is integrating over an
    // interval. See `settle`.
    if (this.nourished) rate *= NourishMultiplier;
    return rate;
  }

  /** What the pet is earning right now, bottleneck included. For display, not for accrual. */
  rate(): number {
    return this.unthrottledRate() * (this.readyToBreakThrough ? BottleneckFactor : 1);
  }

  /**
   * Brings qi up to `now`. Cheap, exact, and the only thing that ever adds to it.
   *
   * Qi is never accumulated a frame at a time. It is a function of elapsed seconds, so the same
   * call covers a tick, a lunch break and a fortnight with the machine switched off — which is why
   * there is no offline-earnings screen anywhere in this design.
   *
   * The one subtlety is that the rate is not constant across a long gap: a stage that fills part
   * way through drops to the bottleneck for the rest of it. Integrating in two pieces is the
   * difference between that and being *rewarded* for staying away, which is the wrong incentive to
   * ship by accident.
   */
  settle(now = Date.now() / 1000): void {
    // The clock moved backwards — a timezone change, an NTP correction, or someone fishing. Give
    // nothing rather than negative qi, and carry on from here.
    if (now <= this.settledAt) {
      this.settledAt = now;
      return;
    }
    // Split the gap where nourishment runs out. A settle that spans the end of it would otherwise
    // credit the whole stretch at double — so coming back after lunch would pay better than having
    // been there, which is precisely backwards. At most two pieces: one nourished, one not.
    while (this.settledAt < now) {
      const boundary =
        this.nourishUntil > this.settledAt ? Math.min(this.nourishUntil, now) : now;
      this.accrue(boundary - this.settledAt);
      this.settledAt = boundary;
    }
  }

  /** Adds `seconds` of qi at the current rate, dropping to the bottleneck part way if it fills. */
  private accrue(seconds: number): void {
    if (seconds <= 0) return;
    // Nothing left to buy. Without this qi keeps climbing at the 大乘 rate forever and is written
    // to disk every five minutes — two billion of it after a month, meaning nothing to anyone.
    if (this.realm >= Ascended) {
      this.qi = 0;
      return;
    }
    const rate = this.unthrottledRate();
    if (!Number.isFinite(rate) || rate <= 0) return;

    let left = seconds;
    const need = requirement(this.realm, this.stage);
    if (this.qi < need) {
      const secondsToFill = (need - this.qi) / rate;
      if (secondsToFill >= left) {
        this.qi += rate * left;
        return;
      }
      this.qi = need;
      left -= secondsToFill;
    }
    this.qi += rate * BottleneckFactor * left;
  }

  /**
   * What one speck of dust is worth.
   *
   * The gap between idling and working, divided by how many keys a second that working is assumed
   * to be. Typing at the expected rate therefore comes to exactly the full rate, and every slower
   * rate lands proportionally between the floor and it — which is the design's 35%-against-100%
   * split, now continuous instead of arriving in lumps every five seconds.
   */
  moteValue(): number {
    return (this.rate() * (1 / IdleFactor - 1)) / ExpectedKeysPerSecond;
  }

  /** What a whole key is worth on top. See `KeycapBonusSeconds`. */
  keycapValue(): number {
    return this.rate() * (1 / IdleFactor - 1) * KeycapBonusSeconds;
  }

  /** Takes in dust. Safe between settles: qi is a plain total until the next one. */
  absorb(motes: number): void {
    this.qi += this.moteValue() * motes;
  }

  /** Swallows a fetched key. */
  swallow(): void {
    this.qi += this.keycapValue();
  }

  get readyToBreakThrough(): boolean {
    return this.realm < Ascended && this.qi >= requirement(this.realm, this.stage);
  }

  /** 0 to 1 within the current stage. Past 1 while a breakthrough is waiting to be taken. */
  get progress(): number {
    const need = requirement(this.realm, this.stage);
    if (!Number.isFinite(need)) return 1;
    return this.qi / need;
  }

  /**
   * Takes the breakthrough. The overflow carries into the next stage rather than being dropped —
   * the qi earned while waiting at the bottleneck was still earned.
   */
  breakThrough(): boolean {
    if (!this.readyToBreakThrough) return false;
    this.qi -= requirement(this.realm, this.stage);
    this.stage += 1;
    if (this.stage >= StagesPerRealm) {
      this.stage = 0;
      this.realm += 1;
    }
    if (this.realm >= Ascended) {
      // The seventy-second one is not like the other seventy-one.
      this.ascensions += 1;
      this.qi = 0;
    }
    return true;
  }

  get ascended(): boolean {
    return this.realm >= Ascended;
  }

  /**
   * Starts the ladder again, keeping what was earned by finishing it.
   *
   * Irreversible, which is why the only way to reach it is a button behind a confirmation in
   * Settings rather than a click on the pet — the same gesture that pokes it must never be able to
   * wipe four days by landing in the wrong place.
   */
  rebirth(): boolean {
    if (!this.ascended) return false;
    this.realm = 0;
    this.stage = 0;
    this.qi = 0;
    return true;
  }

  /** The one line the pet is allowed to say about any of this, and only when hovered. */
  describe(): string {
    if (this.realm >= Ascended) return '已飞升';
    return `${stageName(this.realm, this.stage)} · ${fullness(this.progress)}`;
  }
}
