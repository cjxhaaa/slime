/**
 * The ladder, and the two curves along it.
 *
 * Eight realms of nine stages each, then ascension. Everything here is a pure function of
 * (realm, stage) — no state, no clock — so the pacing can be checked by reading it.
 */
export const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘'] as const;
export const StagesPerRealm = 9;
const STAGE_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

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

/** "练气七层", or "已飞升" past the top. */
export function stageName(realm: number, stage: number): string {
  if (realm >= Ascended) return '已飞升';
  return `${REALMS[realm]}${STAGE_NUMERALS[stage] ?? '一'}层`;
}

/**
 * How full the current stage is, as a word rather than a number.
 *
 * Hovering is the only place any of this is legible at all, and even there it is not allowed to be
 * a figure — see the rule about numbers never reaching the screen. Four buckets is enough to answer
 * the only question anyone actually has, which is "soon?".
 */
export function fullness(progress: number): string {
  if (progress >= 1) return '可突破';
  if (progress >= 0.85) return '修为将满';
  if (progress >= 0.45) return '修为渐盈';
  return '修为初凝';
}
