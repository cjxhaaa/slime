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
