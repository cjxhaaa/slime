/**
 * 机缘 — the small lucky find, two to four times a day.
 *
 * The plan's §4.4 in one line: a bubble appears saying the pet came across something, clicking it
 * takes the find, and **ignoring it makes it go away for good after ninety seconds**.
 *
 * That last clause is the reason the system is allowed to exist at all, and it is worth stating
 * before any of the numbers. A reward that waits for you is a chore with a bow on it: it turns into
 * something to check, and the guardrails say nothing here may need checking on a schedule. A
 * reward that expires is a surprise. The cost of missing one has to be genuinely nothing, which is
 * what keeps the amount small — five to fifteen minutes of output, against a ladder measured in
 * days. Missing every single one costs about as much as a long lunch.
 *
 * Everything in here is pure so the scheduling can be asserted against. Nothing about *when* a
 * surprise arrives can be checked by looking at it, which is exactly the kind of thing that quietly
 * stops working.
 */

/**
 * The shortest and longest wait between finds, in seconds.
 *
 * Aimed at two to four a day for somebody with the pet up for a working day rather than for
 * twenty-four hours: the clock only runs while the app does, so this counts time in front of the
 * machine rather than time on Earth. Someone who leaves it running overnight would otherwise wake
 * up owed a queue, and a queue is the one shape this must never take.
 */
export const MinGapSeconds = 100 * 60;
export const MaxGapSeconds = 230 * 60;

/** How long an offer stands before it gives up, in seconds. §4.4 fixes this at ninety. */
export const OfferSeconds = 90;

/** What a find is worth, as seconds of the pet's current output. */
export const LeastSeconds = 5 * 60;
export const MostSeconds = 15 * 60;

/**
 * How long away from the keyboard counts as having been away.
 *
 * Coming back is when a find is most welcome — it is the one moment the pet is being looked at on
 * purpose — so a return pulls a pending one forward. Twenty minutes rather than five, because the
 * point is "went and did something else", not "read a page".
 */
export const AwaySeconds = 20 * 60;

/**
 * How far forward a return can drag a pending find, in seconds.
 *
 * Bounded, and that bound is load-bearing: without it, stepping away and coming back would *make*
 * finds rather than move them, and the whole thing would be farmable by anyone who noticed. A
 * return can only bring the next one within this much of now — it can never mint one, and it can
 * never take the gap below the floor.
 */
export const PullForwardSeconds = 8 * 60;

export interface FortuneSnapshot {
  /** Unix seconds the next find is due. */
  nextAt: number;
}

/**
 * The pool. Plain text, no branches, no rarity — §4.4 is explicit that this is a table.
 *
 * They are all findings rather than achievements, and none of them refer to the player. "You have
 * earned" is a reward system talking; "it came across something" is a pet having a small day.
 */
export const FINDS: readonly string[] = [
  '拾得下品灵石三枚',
  '偶得残卷一页',
  '石缝里挖出半截灵根',
  '檐下接了一捧晨露',
  '风里飘来一缕香火',
  '啃到一块带灵气的旧木',
  '墙角蹲出一朵灵芝',
  '捡了枚不知谁掉的玉简',
  '晒了半晌的太阳',
  '误食一颗野果，竟有药性',
  '听了半段路过的道音',
  '雨后水洼里照见星象',
  '在键盘缝里摸到一粒丹砂',
  '接住一片落下的桃花',
  '睡着时吞了口月华',
  '蹭到一线过路的剑气',
  '旧书堆里翻出一张符纸',
  '喝了口忘了倒的凉茶',
  '窗台上收了一把清风',
  '打了个嗝，竟吐出灵光',
];

/** Picks a wait until the next one. `random` returns 0 to 1. */
export function nextGap(random: () => number): number {
  return MinGapSeconds + random() * (MaxGapSeconds - MinGapSeconds);
}

/** What the next find is worth, in seconds of output. */
export function findValue(random: () => number): number {
  return LeastSeconds + random() * (MostSeconds - LeastSeconds);
}

/** Which line it says. */
export function findText(random: () => number): string {
  return FINDS[Math.min(FINDS.length - 1, Math.floor(random() * FINDS.length))];
}

/**
 * Where a pending find lands once somebody comes back to the machine.
 *
 * Only ever moves it *earlier*, only by a bounded amount, and never closer than `PullForwardSeconds`
 * from now — so a return is a nudge rather than a trigger, and no amount of stepping away and back
 * produces finds faster than the schedule allows.
 */
export function onReturn(now: number, nextAt: number): number {
  const earliest = now + PullForwardSeconds;
  return nextAt <= earliest ? nextAt : Math.max(earliest, nextAt - PullForwardSeconds);
}

export class Fortune {
  /** Unix seconds. Zero means "not scheduled yet", which is what a fresh install looks like. */
  private nextAt = 0;

  restore(snapshot: FortuneSnapshot): void {
    this.nextAt = snapshot.nextAt;
  }

  snapshot(): FortuneSnapshot {
    return { nextAt: this.nextAt };
  }

  /**
   * Makes sure something is scheduled.
   *
   * Also used to repair a save from a machine whose clock has moved: a `nextAt` further out than
   * the longest possible gap can only come from a clock that has been wound back, and waiting
   * months for a find nobody can see the timer for is indistinguishable from the feature being
   * broken.
   */
  arm(now: number, random: () => number): void {
    if (this.nextAt <= 0 || this.nextAt > now + MaxGapSeconds) {
      this.nextAt = now + nextGap(random);
    }
  }

  get dueAt(): number {
    return this.nextAt;
  }

  due(now: number): boolean {
    return this.nextAt > 0 && now >= this.nextAt;
  }

  /** Called when somebody comes back to the machine. See `onReturn`. */
  noticeReturn(now: number): void {
    if (this.nextAt > 0) this.nextAt = onReturn(now, this.nextAt);
  }

  /**
   * Books the next one, whether this one was taken or ignored.
   *
   * The same call either way, deliberately: a find that was missed must not come back sooner to
   * make up for it. Missing one is meant to cost nothing *and* change nothing.
   */
  spent(now: number, random: () => number): void {
    this.nextAt = now + nextGap(random);
  }
}
