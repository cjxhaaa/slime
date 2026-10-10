import { fill, words } from '../i18n/index.js';

/**
 * 见闻 — a record of what has happened to this pet.
 *
 * ## What this is allowed to be, and what it is not
 *
 * The plan's guardrails (§6) reject lists three separate times — 法宝, 丹药, 宗门 — and the stated
 * reason each time is the same: they need somewhere you go and look. §6.1 forbids 未完成状态
 * outright, and an unearned achievement is one by definition. This was asked for anyway, which is
 * the designer's call to make; what follows is the set of lines that are **not** crossed while
 * making it:
 *
 * - **Nothing nags.** No badge, no red dot, no count anywhere outside the settings window, nothing
 *   that appears on the overlay because something is unfinished. You can never open this and it
 *   will never ask you to. (§6.1, §6.5)
 * - **Nothing interrupts.** Earning one says a single line in the bubble that fades like any
 *   other, and it is outranked by anything that is actually waiting for an answer. (§6.2)
 * - **Nothing is granted.** These are a record, not a progression. No feat changes a rate, unlocks
 *   a school, or touches a balance number — so none of them is a chore you are made to do.
 * - **Keystrokes are never counted.** This is the important one. "Ate ten thousand keys" is the
 *   first achievement anybody would write for this pet and it is **forbidden**: §6.7 says a key is
 *   used to pick a glyph and then dropped, never written down, never totalled. An achievement
 *   system is the single most likely way for that promise to be broken by accident, so it is said
 *   here as well as there. Nothing in this file derives from what was typed.
 *
 * ## Latched, not derived
 *
 * Most of these could in principle be recomputed from the save, and they are stored instead,
 * because the save does not keep enough history: a rebirth resets `realm` to zero, so "reached
 * 大乘" is unanswerable an hour later. Recording the moment is the only thing that survives it.
 */

/**
 * Every feat, in the order the settings window lists them.
 *
 * The ids are stable strings and go into the save, so they are never renamed — a rename silently
 * un-earns something somebody did. Their wording lives in the dictionary, keyed by these.
 */
export const FEAT_IDS = [
  // 修行. The realm rungs are generated rather than listed, because their names already exist in
  // the dictionary and a second copy would be a second thing to keep in step.
  'realm1',
  'realm2',
  'realm3',
  'realm4',
  'realm5',
  'realm6',
  'realm7',
  'ascend',
  'reborn',
  'thrice',
  'ordealFailed',
  // 历练.
  'trialFirst',
  'trialSurvived',
  'trialUnhurt',
  'trialSlayer',
  'fullSet',
  // 日常.
  'devour',
  'fortune',
  'lieLow',
] as const;

export type FeatId = (typeof FEAT_IDS)[number];

/** The realm rungs, which take their name from the realm itself. `realm1` is 筑基. */
export const REALM_FEATS: Record<string, number> = {
  realm1: 1,
  realm2: 2,
  realm3: 3,
  realm4: 4,
  realm5: 5,
  realm6: 6,
  realm7: 7,
};

/** How many kills in a single run earns 除邪. */
export const SlayerKills = 300;

export class Feats {
  private earned = new Set<string>();

  /**
   * Reads the save. Unknown ids are kept rather than dropped.
   *
   * A save written by a newer build may hold feats this one has never heard of, and discarding
   * them would mean downgrading once permanently erased them. They are carried through untouched
   * and simply not displayed.
   */
  restore(ids: readonly string[]): void {
    this.earned = new Set(ids.filter((id) => typeof id === 'string'));
  }

  snapshot(): string[] {
    return [...this.earned];
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  /** How many of the ones this build knows about have been earned. */
  get done(): number {
    return FEAT_IDS.filter((id) => this.earned.has(id)).length;
  }

  /**
   * Records one. Returns true only the **first** time, which is what the caller announces on.
   *
   * Callers fire these from inside the frame loop and from event handlers without checking first,
   * so this has to be cheap and idempotent rather than correct-if-called-carefully.
   */
  mark(id: FeatId): boolean {
    if (this.earned.has(id)) return false;
    this.earned.add(id);
    return true;
  }

  /** The rung feat for a realm, or null below 筑基 and above the ladder. */
  static forRealm(realm: number): FeatId | null {
    const id = `realm${realm}`;
    return (FEAT_IDS as readonly string[]).includes(id) ? (id as FeatId) : null;
  }
}

/**
 * What a feat is called, and what it says underneath.
 *
 * The realm rungs are not in the dictionary's `feats` table: they borrow the realm's own name, so
 * that renaming 元婴 in one place cannot leave it called something else in the other. Everything
 * else is a plain lookup.
 */
export function featName(id: string): string {
  const realm = REALM_FEATS[id];
  if (realm !== undefined) return words().realms[realm] ?? words().ascended;
  return words().feats[id]?.name ?? id;
}

export function featBlurb(id: string): string {
  const realm = REALM_FEATS[id];
  if (realm !== undefined) return fill(words().featRealm, { realm: featName(id) });
  return words().feats[id]?.blurb ?? '';
}
