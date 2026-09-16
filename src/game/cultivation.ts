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
 * How often a glyph is offered while someone is typing.
 *
 * This number is doing two unrelated jobs at once, which is why it is not simply "as often as
 * looks nice". It sets the recurring render cost — a chase is about a second and a half of
 * full-rate animation, so one every five seconds is roughly a quarter duty cycle against 38% of a
 * core — and it sets how much of the keyboard ever reaches the screen, which at five keys a second
 * is about four percent of it. Both want the same answer.
 */
export const GatherSeconds = 5.5;

export interface CultivationSnapshot {
  realm: number;
  stage: number;
  qi: number;
  rebirths: number;
}

export class Cultivation {
  realm = 0;
  stage = 0;
  qi = 0;
  rebirths = 0;

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
    this.rebirths = snapshot.rebirths;
    this.settledAt = settledAt;
  }

  snapshot(): CultivationSnapshot {
    return { realm: this.realm, stage: this.stage, qi: this.qi, rebirths: this.rebirths };
  }

  get settledAtSeconds(): number {
    return this.settledAt;
  }

  /** Every multiplier except the bottleneck, which is time-dependent and handled in `settle`. */
  private unthrottledRate(): number {
    let rate = baseRate(this.realm, this.stage) * (1 + 0.5 * this.rebirths);
    for (const modifier of this.modifiers) rate *= modifier.factor();
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
    let elapsed = now - this.settledAt;
    this.settledAt = now;
    // The clock moved backwards — a timezone change, an NTP correction, or someone fishing. Give
    // nothing rather than negative qi, and carry on from here.
    if (elapsed <= 0) return;

    const rate = this.unthrottledRate();
    if (!Number.isFinite(rate) || rate <= 0) return;

    const need = requirement(this.realm, this.stage);
    if (this.qi < need) {
      const secondsToFill = (need - this.qi) / rate;
      if (secondsToFill >= elapsed) {
        this.qi += rate * elapsed;
        return;
      }
      this.qi = need;
      elapsed -= secondsToFill;
    }
    this.qi += rate * BottleneckFactor * elapsed;
  }

  /**
   * What one glyph is worth.
   *
   * Sized as the gap between idling and working, over one spawn interval, so that someone typing
   * steadily earns the full rate and someone away from the desk earns the floor. The design states
   * that split as 35% against 100%; this is the only place it turns into a number.
   */
  gatherValue(): number {
    return this.rate() * (1 / IdleFactor - 1) * GatherSeconds;
  }

  /** Swallows a glyph. Safe between settles: qi is a plain total until the next one. */
  gather(): void {
    this.qi += this.gatherValue();
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
    return true;
  }

  /** The one line the pet is allowed to say about any of this, and only when hovered. */
  describe(): string {
    if (this.realm >= Ascended) return '已飞升';
    return `${stageName(this.realm, this.stage)} · ${fullness(this.progress)}`;
  }
}
