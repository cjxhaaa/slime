/**
 * How many windows a day come with nourishment.
 *
 * This is the cap that keeps swallowing windows a *bonus* rather than the fastest way to progress.
 * Without it the quickest route up the ladder would be to spend the afternoon closing things, and a
 * game that trains people to close windows they still need is not a difficulty curve, it is a
 * product accident.
 *
 * It is an allowance and not a task. Nothing counts down at you, nothing turns red, and a day where
 * none of it is used is a day where nothing was owed — the plan is emphatic about this, because the
 * same numbers framed as a checklist produce the opposite feeling.
 */
export interface DailySnapshot {
  /** Local date the allowance was last rolled over, `YYYY-MM-DD`. */
  date: string;
  remaining: number;
}

/**
 * Days' worth that can pile up while nobody is at the machine.
 *
 * Three, so a weekend away comes back to something waiting rather than to three days of nothing
 * having happened — and capped at three so it never becomes a backlog to work through.
 */
const BankDays = 3;

/**
 * Today, as a local date.
 *
 * Built by hand rather than taken from a locale format, because this string is compared against one
 * written to disk possibly in another timezone, and the only property it needs is that it changes
 * exactly once per local midnight.
 */
export function localDate(at = new Date()): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, '0');
  const day = String(at.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class Daily {
  private date = '';
  private remaining = 0;

  restore(snapshot: DailySnapshot): void {
    this.date = snapshot.date;
    this.remaining = snapshot.remaining;
  }

  snapshot(): DailySnapshot {
    return { date: this.date, remaining: this.remaining };
  }

  get left(): number {
    return this.remaining;
  }

  /**
   * Rolls the allowance over if the local date has moved on.
   *
   * Once per call rather than once per missed day, which comes to the same thing given the cap and
   * avoids having to count days across months and leap years to arrive there. A date *ahead* of
   * today — a clock that was wound back — rolls as well: this is a single-player allowance and
   * refusing to refill it would punish the wrong person.
   */
  roll(allowance: number, today = localDate()): void {
    if (this.date === today) return;
    this.date = today;
    this.remaining = Math.min(this.remaining + allowance, allowance * BankDays);
  }

  /** Spends one if there is one. False means the kill still happens, just without the spoils. */
  take(): boolean {
    if (this.remaining <= 0) return false;
    this.remaining -= 1;
    return true;
  }
}
