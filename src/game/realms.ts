/**
 * The ladder, and the two curves along it.
 *
 * Eight realms of nine stages each, then ascension. Everything here is a pure function of
 * (realm, stage) — no state, no clock — so the pacing can be checked by reading it.
 */
import { fill, words } from '../i18n/index.js';

export const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘'] as const;
export const StagesPerRealm = 9;
/** Exported so the check suite can pin it against the dictionary, like every other table here. */
export const STAGE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** The realm index that means "past the top of the ladder". */
export const Ascended = REALMS.length;

/** Qi the first stage of 练气 costs: one minute at the starting rate. The hook has to land fast. */
const FirstRequirement = 60;
/** Growth per stage, inside a realm. */
const RequirementPerStage = 1.3;
const RatePerStage = 1.15;
/**
 * Growth per realm, measured **first stage against the previous realm's first stage** — not
 * stacked on top of the per-stage growth above.
 *
 * This distinction is the whole ballgame and the wording it replaced could be read either way.
 * Applied on top of the per-stage 1.3, each realm costs 5.8x the last: five thousand days to
 * ascension, with 83% of the run inside the final realm. As written it is 5 / 2.6 = 1.92x, and
 * about four days. Same two numbers, a factor of 1300 between the readings.
 */
const RequirementPerRealm = 5;
const RatePerRealm = 2.6;

/** Qi needed to leave (realm, stage). Infinite past the top, where there is nothing left to buy. */
export function requirement(realm: number, stage: number): number {
  if (realm >= Ascended) return Infinity;
  return FirstRequirement * RequirementPerRealm ** realm * RequirementPerStage ** stage;
}

/** Qi per second at (realm, stage), before any modifier. */
export function baseRate(realm: number, stage: number): number {
  const capped = Math.min(realm, Ascended - 1);
  const stages = realm >= Ascended ? StagesPerRealm - 1 : stage;
  return RatePerRealm ** capped * RatePerStage ** stages;
}

/**
 * "练气七层", or "已飞升" past the top.
 *
 * Built from a pattern rather than by concatenation, because the order is not the same everywhere:
 * Chinese and Japanese put the numeral inside the name and English puts it after with a space.
 */
export function stageName(realm: number, stage: number): string {
  const w = words();
  if (realm >= Ascended) return w.ascended;
  return fill(w.realmStage, {
    realm: w.realms[realm] ?? w.realms[0],
    stage: w.stages[stage] ?? w.stages[0],
  });
}

/**
 * How full the current stage is, as a word rather than a number.
 *
 * Hovering is the only place any of this is legible at all, and even there it is not allowed to be
 * a figure — see the rule about numbers never reaching the screen. Four buckets is enough to answer
 * the only question anyone actually has, which is "soon?".
 */
export function fullness(progress: number): string {
  const w = words();
  if (progress >= 1) return w.fullness[3];
  if (progress >= 0.85) return w.fullness[2];
  if (progress >= 0.45) return w.fullness[1];
  return w.fullness[0];
}
