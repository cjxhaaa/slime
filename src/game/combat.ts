/**
 * Eating a window, as a fight.
 *
 * The feature was already shaped like one and nobody had said so: the pet latches on, the window
 * resists, a hung one escalates, an elevated one cannot be taken at all, and pulling the pet off
 * mid-way calls the whole thing off. What it lacked was stakes that scaled — every window was the
 * same amount of work, so the realm you had climbed to changed nothing about it.
 *
 * It does now. A big window is a big opponent, a hung one is worse, and how hard that lands depends
 * on where you are on the ladder.
 *
 * **One thing this must never do is decide whether you can.** Someone bought this to close a window
 * that has stopped responding; finding out that the pet is too junior to try would be a product
 * mistake dressed up as difficulty. The realm changes how much it costs and how much it pays. It
 * never changes what is possible.
 */

/**
 * How big an opponent the window is, roughly 0 to 1, and occasionally past it.
 *
 * Its share of the work area, because that is what the body has to stretch around — and it is the
 * same number the player is looking at, so a maximised window reading as the hard one needs no
 * explanation.
 */
export function burden(
  rect: { width: number; height: number },
  areaWidth: number,
  areaHeight: number,
  hung: boolean,
): number {
  const area = (rect.width * rect.height) / Math.max(1, areaWidth * areaHeight);
  // A window that has stopped answering is a worse thing to swallow than a window that is merely
  // large. The plan calls these 凶煞之物 and it was already the word for them.
  return Math.max(0, Math.min(1.6, area)) * (hung ? 1.6 : 1);
}

/**
 * What a realm can take on without straining.
 *
 * 练气 is comfortable with a small dialog and visibly struggles with a maximised window; 大乘 takes
 * anything in one go. Steeper than the output curve on purpose, so that the realms people reach in
 * the first day are the ones where this is felt most.
 */
export function might(realm: number): number {
  return 0.12 * 1.45 ** realm;
}

/**
 * 0 is trivial, 1 is right at the limit, above 1 is beyond it.
 *
 * The cap is five rather than three because at three the early realms all saturate: 练气 and 金丹
 * both hit it against a half-screen window and the breakthrough between them changed nothing about
 * the fight. That is the stretch where most of the first day is spent, so it is the last place the
 * curve should go flat.
 */
export function effort(load: number, realm: number): number {
  return Math.min(5, load / might(realm));
}

/**
 * How long the body takes to wrap the window.
 *
 * **Three seconds is a floor and not a starting point.** That interval is the entire safety margin
 * of this feature — it is the window in which pulling the pet off calls the meal off, and the
 * commitment is deliberately spent on screen rather than behind a confirmation. Making a strong
 * pet faster would buy a flourish by shortening the only chance anyone gets to change their mind.
 *
 * So progress is spent on the other end: a junior pet against a large window takes *longer*, and
 * looks like it is working for it.
 */
export function engulfSeconds(currentEffort: number): number {
  const beyond = Math.max(0, currentEffort - 1);
  return 3 * (1 + beyond * 0.42);
}

/** How visibly it is straining, 0 to 1. Drives the tremble, and nothing else. */
export function strain(currentEffort: number): number {
  return Math.max(0, Math.min(1, (currentEffort - 0.45) / 3.5));
}

/** Minutes of nourishment a kill is worth. A bigger opponent is worth more of them. */
export function spoilMinutes(load: number): number {
  return 20 + 30 * Math.min(1.6, load);
}

/**
 * How many kills a day come with nourishment.
 *
 * Grows with the realm, and **an ascended pet keeps the top tier through a rebirth**. Starting a
 * fresh run back at one a day would make the second run meaner than the first, which is the wrong
 * way round for something you only unlock by finishing.
 */
export function allowance(realm: number, ascensions = 0): number {
  if (ascensions > 0) return 8;
  return Math.min(8, realm + 1);
}
