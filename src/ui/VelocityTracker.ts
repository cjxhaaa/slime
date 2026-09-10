interface Sample {
  x: number;
  y: number;
  t: number;
}

/** Samples older than this are irrelevant to where the hand was going when it let go. */
const WINDOW_MS = 90;
/** A release after the hand had already stopped is a drop, not a throw. */
const STALE_MS = 120;
const MAX_SAMPLES = 24;

/**
 * Turns a stream of pointer positions into a release velocity, in CSS pixels per second.
 *
 * The naive version of this — velocity from the last two positions — is what makes a throw feel
 * dead. People decelerate slightly in the last few milliseconds before letting go, so the final
 * delta is often near zero and the object drops instead of flying. Every touch platform solves it
 * the same way: fit the velocity over a short trailing window instead of trusting the last sample.
 *
 * A least-squares fit over the window is used rather than a plain endpoint difference, so one noisy
 * sample cannot dominate the result.
 */
export class VelocityTracker {
  private samples: Sample[] = [];

  reset(): void {
    this.samples.length = 0;
  }

  add(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Instantaneous-ish velocity, for driving the drag stretch while the hand is still moving. */
  current(now: number): { vx: number; vy: number } {
    return this.velocityAt(now);
  }

  /** Velocity to throw with. Returns zeroes when the hand had come to rest before releasing. */
  release(now: number): { vx: number; vy: number } {
    const last = this.samples[this.samples.length - 1];
    if (!last || now - last.t > STALE_MS) return { vx: 0, vy: 0 };
    return this.velocityAt(now);
  }

  private velocityAt(now: number): { vx: number; vy: number } {
    const window = this.samples.filter((sample) => now - sample.t <= WINDOW_MS);
    if (window.length < 2) return { vx: 0, vy: 0 };

    // Least-squares slope of position against time, per axis. Time is re-based to the window start
    // so the numbers stay small and well-conditioned.
    const t0 = window[0].t;
    let sumT = 0;
    let sumTT = 0;
    let sumX = 0;
    let sumY = 0;
    let sumTX = 0;
    let sumTY = 0;
    for (const sample of window) {
      const t = (sample.t - t0) / 1000;
      sumT += t;
      sumTT += t * t;
      sumX += sample.x;
      sumY += sample.y;
      sumTX += t * sample.x;
      sumTY += t * sample.y;
    }
    const n = window.length;
    const denominator = n * sumTT - sumT * sumT;
    // Every sample landed in the same millisecond: no time base to differentiate against.
    if (Math.abs(denominator) < 1e-9) return { vx: 0, vy: 0 };

    return {
      vx: (n * sumTX - sumT * sumX) / denominator,
      vy: (n * sumTY - sumT * sumY) / denominator,
    };
  }
}
