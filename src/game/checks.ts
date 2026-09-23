/**
 * Checks for the only part of this that is arithmetic rather than feel.
 *
 * Run with `npm run check`. There is no test framework here and this does not justify adding one —
 * what it needs is a handful of assertions that can be run after every tuning pass, because the
 * numbers in `realms.ts` are going to be re-tuned repeatedly and the piecewise integration in
 * `settle` is the piece most likely to be quietly wrong while still looking plausible.
 */

// Declared rather than pulling in @types/node for one call. This file is the only thing in the
// repo that runs outside a webview, and it exits with a status so a CI step could read it.
declare const process: { exit(code: number): never };

import { Cultivation, ExpectedKeysPerSecond, IdleFactor } from './cultivation.js';
import { Glyphs } from './Glyphs.js';
import { BreakthroughSpread, Motes, StageSpread } from './Motes.js';
import { clear, mix } from '../slime/colour.js';
import { smooth, wispFade } from '../slime/ease.js';
import { resolveErrand } from './errand.js';
import { allowance, burden, effort, engulfSeconds, spoilMinutes } from './combat.js';
import { Daily } from './daily.js';
import {
  FlingFull,
  FlingThreshold,
  LeastCharms,
  MostCharms,
  charmsForFling,
} from './Volley.js';
import {
  FINDS,
  Fortune,
  LeastSeconds,
  MaxGapSeconds,
  MinGapSeconds,
  MostSeconds,
  PullForwardSeconds,
  findText,
  findValue,
  nextGap,
  onReturn,
} from './fortune.js';
import {
  BaseOdds,
  Charms,
  FailureQiLoss,
  OddsPerCharm,
  OddsPerFailure,
  charmsForCertainty,
  odds,
} from './charms.js';
import {
  CardsPerOffer,
  COMBOS,
  EVOLUTIONS,
  MaxLevel,
  SCHOOLS,
  SPECS,
  Slots,
  activeCombos,
  cadence,
  comboFor,
  TRIADS,
  activeTriads,
  exchangeCost,
  killsForExchanges,
  partners,
} from './schools.js';
import { Arsenal, EvolveLevel } from './Arsenal.js';
import {
  ContactDamage,
  GraceSeconds,
  RunSeconds,
  SurvivalBonus,
  ThroughShare,
  Trial,
  arrivalRate,
  harvest,
  menaceSpeed,
  rung,
  spawnInterval,
  vitality,
} from './Trial.js';
import { Attacks } from './Attacks.js';
import { BREEDS, pacing, rollBreed, schedule, weightAt } from './menaces.js';
import type { School } from './schools.js';
import { Ascended, StagesPerRealm, baseRate, requirement } from './realms.js';

let failures = 0;
function check(label: string, actual: number, expected: number, tol = 1e-6): void {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${actual}, expected ${expected}`);
}
function checkTrue(label: string, actual: boolean): void {
  if (!actual) failures++;
  console.log(`${actual ? 'PASS' : 'FAIL'}  ${label}`);
}

// The first stage costs 60 at a base rate of 1, so with nobody at the keyboard it takes 60/0.35.
const FirstStage = requirement(0, 0);
const IdleSecondsToFill = FirstStage / IdleFactor;

// 1. Nothing at the keyboard means the idle floor, not the full rate.
let c = new Cultivation(0);
c.settle(30);
check('30s with nobody typing', c.qi, 30 * IdleFactor, 1e-9);
checkTrue('not ready that early', !c.readyToBreakThrough);

// 2. THE economic identity the whole design rests on: one second of idling, plus the dust one
//    second of ordinary typing knocks loose, has to come to exactly one second of working flat
//    out. If this drifts, "away" and "at the keyboard" stop meaning what the plan says they mean.
c = new Cultivation(0);
c.settle(1);
c.absorb(ExpectedKeysPerSecond);
check('idle + a second of typing == working flat out', c.qi, baseRate(0, 0), 1e-9);

// 2b. Typing at half speed lands halfway between the floor and working, not at either end.
c = new Cultivation(0);
c.settle(1);
c.absorb(ExpectedKeysPerSecond / 2);
check('half speed lands halfway', c.qi, baseRate(0, 0) * (IdleFactor + (1 - IdleFactor) / 2), 1e-9);

// 2c. Fetching a whole key is a tip, not an income. It has to stay small against what the dust
//     from the same stretch of typing is already worth, or the pet becomes better to watch than to
//     work beside — which is the failure mode the plan calls a product accident.
c = new Cultivation(0);
const keycap = c.keycapValue();
const dustOverTheSameStretch = c.moteValue() * ExpectedKeysPerSecond * 5.5;
checkTrue('a fetched key is a tip, not an income', keycap < dustOverTheSameStretch * 0.25);

// 3. The first breakthrough, and the overflow carried past it.
c = new Cultivation(0);
c.settle(IdleSecondsToFill);
checkTrue('ready once the stage is paid for', c.readyToBreakThrough);
checkTrue('breakthrough taken', c.breakThrough());
check('stage advanced', c.stage, 1);
check('nothing left over when it lands exactly', c.qi, 0, 1e-9);

// 4. The bottleneck. Ten minutes on a stage that fills in under three must not pay ten minutes:
//    the requirement at full idle rate, then the remainder at a quarter of it.
c = new Cultivation(0);
c.settle(600);
const bottlenecked = FirstStage + (600 - IdleSecondsToFill) * IdleFactor * 0.25;
check('600s, most of it stuck at the bottleneck', c.qi, bottlenecked, 1e-9);

// 5. The property that matters more than either half of that: one long settle and many short ones
//    over the same span have to agree. Offline and online are the same code path or they are a bug.
const piecewise = new Cultivation(0);
for (let t = 10; t <= 600; t += 10) piecewise.settle(t);
check('the same span in sixty steps', piecewise.qi, bottlenecked, 1e-6);

// 6. A clock that jumps backwards gives nothing, and does not go negative.
c = new Cultivation(0);
c.settle(100);
const before = c.qi;
c.settle(40);
check('clock moved back: qi unchanged', c.qi, before, 1e-9);
c.settle(70);
check('and it carries on from there, not from the old time', c.qi, before + 30 * IdleFactor, 1e-9);

// 7. Overflow earned at the bottleneck survives the breakthrough.
c = new Cultivation(0);
c.settle(600);
c.breakThrough();
check('overflow carried into the next stage', c.qi, bottlenecked - FirstStage, 1e-9);

// 8. Rebirths and modifiers both multiply into the same pipeline.
c = new Cultivation(0);
c.ascensions = 2;
c.settle(10);
check('two ascensions double the output', c.qi, 10 * IdleFactor * 2, 1e-9);

c = new Cultivation(0);
c.addModifier({ name: 'test', factor: () => 2 });
c.settle(10);
check('a x2 modifier', c.qi, 10 * IdleFactor * 2, 1e-9);

// 9. Dust is worth less while a breakthrough is waiting, same as everything else.
c = new Cultivation(0);
const openValue = c.moteValue();
c.settle(600);
checkTrue('dust is worth a quarter at the bottleneck', c.moteValue() < openValue * 0.26);

// 10. The ladder, as pure functions: what the pacing table in the plan claims.
let workingSeconds = 0;
let firstBreakthrough = 0;
for (let realm = 0; realm < Ascended; realm++) {
  for (let stage = 0; stage < StagesPerRealm; stage++) {
    workingSeconds += requirement(realm, stage) / baseRate(realm, stage);
    if (firstBreakthrough === 0) firstBreakthrough = workingSeconds;
  }
}
check('first breakthrough, seconds of working', firstBreakthrough, 60, 0.5);
check('ascension, effective hours of working', workingSeconds / 3600, 51.9, 0.3);
// A real day is eight hours at the keyboard plus sixteen at the idle floor.
check('ascension, real days', workingSeconds / 3600 / (8 + 16 * IdleFactor), 3.81, 0.05);

// 11. And the state machine agrees with those pure functions about how many rungs there are.
c = new Cultivation(0);
let clock = 0;
let breakthroughs = 0;
while (c.realm < Ascended && breakthroughs < 1000) {
  // Nudged past the exact boundary: landing on it leaves qi a float hair short of the requirement,
  // which is invisible in the app (accrual just carries on) but stalls a test that expects the
  // breakthrough on that very tick.
  clock += requirement(c.realm, c.stage) / (baseRate(c.realm, c.stage) * IdleFactor) + 1e-6;
  c.settle(clock);
  if (!c.breakThrough()) break;
  breakthroughs++;
}
check('breakthroughs to ascend', breakthroughs, Ascended * StagesPerRealm);
checkTrue('nothing further is offered once ascended', !c.readyToBreakThrough);

// ---------------------------------------------------------------- ascension and rebirth

// 28. The top of the ladder counts, and stops.
c = new Cultivation(0);
let climbed = 0;
let clockA = 0;
while (!c.ascended && climbed < 200) {
  clockA += requirement(c.realm, c.stage) / (baseRate(c.realm, c.stage) * IdleFactor) + 1e-6;
  c.settle(clockA);
  if (!c.breakThrough()) break;
  climbed++;
}
checkTrue('the ladder ends in an ascension', c.ascended);
check('which is counted', c.ascensions, 1);
check('and it takes every rung to get there', climbed, Ascended * StagesPerRealm);

// 29. Qi stops meaning anything past the top rather than climbing forever. Left alone it reached
//     two billion in a simulated month and was written to disk every five minutes.
c.settle(clockA + 3600 * 24 * 30);
check('qi does not pile up after ascending', c.qi, 0, 1e-9);
checkTrue('and nothing further is offered', !c.readyToBreakThrough);

// 30. A rebirth returns to the bottom carrying what finishing was worth.
const earned = c.ascensions;
checkTrue('rebirth is available once ascended', c.rebirth());
check('back to the first realm', c.realm, 0);
check('and the first stage', c.stage, 0);
check('ascensions survive it', c.ascensions, earned);
c.settle(clockA + 3600 * 24 * 30 + 10);
check('and the run is faster for them', c.qi, 10 * IdleFactor * (1 + 0.5 * earned), 1e-9);

// 31. It cannot be reached early: four days of progress must not be wipeable mid-run.
const midRun = new Cultivation(0);
midRun.realm = 4;
checkTrue('no rebirth before the top', !midRun.rebirth());
check('and nothing was disturbed by asking', midRun.realm, 4);

// 32. The daily allowance keeps its tier through a rebirth. Starting again at one a day would make
//     the second run meaner than the first, which is backwards for something you unlock by finishing.
check('a fresh pet gets one', allowance(0, 0), 1);
check('a top-realm pet gets eight', allowance(7, 0), 8);
check('and a reborn one keeps eight at the bottom', allowance(0, 1), 8);


// ---------------------------------------------------------------- the fight

// 20. The floor on the wrap is a safety property, not a tuning value: it is the window in which
//     pulling the pet off calls the meal off. No realm and no window size may shorten it.
let shortest = Infinity;
for (let realm = 0; realm <= 8; realm++) {
  for (const load of [0, 0.01, 0.08, 0.3, 0.5, 1, 1.6, 4]) {
    shortest = Math.min(shortest, engulfSeconds(effort(load, realm)));
  }
}
check('the abort window is never shortened', shortest, 3, 1e-9);

// 21. Progress is spent making hard things easy, not making easy things fast.
checkTrue('a junior pet labours over a big window', engulfSeconds(effort(1, 0)) > 4);
check('a senior one is back at the floor', engulfSeconds(effort(1, 7)), 3, 1e-9);
checkTrue('and every realm in between is an improvement', engulfSeconds(effort(1, 2)) > engulfSeconds(effort(1, 4)));

// 22. A window that has stopped responding is the harder opponent and the better prize.
const plain = burden({ width: 800, height: 600 }, 1920, 1080, false);
const frozen = burden({ width: 800, height: 600 }, 1920, 1080, true);
checkTrue('a hung window is the heavier load', frozen > plain);
checkTrue('and worth more', spoilMinutes(frozen) > spoilMinutes(plain));

// 23. Capability is never gated. Whatever the realm, the effort is finite and the wrap completes —
//     someone who bought this to close a frozen application must never meet a difficulty wall.
checkTrue('even the worst case resolves', Number.isFinite(engulfSeconds(effort(4, 0))));

// ---------------------------------------------------------------- nourishment

// 24. It doubles output while it lasts.
c = new Cultivation(0);
const plainRate = c.rate();
c.nourish(10);
checkTrue('nourishment doubles the rate', Math.abs(c.rate() - plainRate * 2) < 1e-9);

// 25. Two kills are twice as long, not four times as fast. Stacking the multiplier instead would
//     make a burst of window-closing the quickest way up the ladder, which the guardrails forbid.
c = new Cultivation(0);
c.nourish(10);
c.nourish(10);
check('two windows make twenty minutes of double', c.nourishSecondsLeft, 20 * 60, 1e-9);
checkTrue('and still only double', Math.abs(c.rate() - plainRate * 2) < 1e-9);

// 26. THE one that would go wrong quietly: a settle spanning the end of nourishment must not
//     credit the whole gap at the higher rate. Being away would then pay better than being there.
const once = new Cultivation(0);
once.nourish(1);
once.settle(120);
const stepped = new Cultivation(0);
stepped.nourish(1);
for (let t = 2; t <= 120; t += 2) stepped.settle(t);
check('one settle across the boundary equals sixty', once.qi, stepped.qi, 1e-6);
checkTrue('and it is not the whole gap at double', once.qi < 120 * IdleFactor * 2 * 0.9);

// ---------------------------------------------------------------- the daily allowance

// 27. Rolls once a local day, banks three, and runs out rather than going negative.
const d = new Daily();
d.roll(2, '2026-09-16');
check('a fresh day hands out the allowance', d.left, 2);
d.roll(2, '2026-09-16');
check('rolling twice in a day changes nothing', d.left, 2);
checkTrue('one can be spent', d.take());
d.roll(2, '2026-09-17');
check('tomorrow tops it up', d.left, 3);
d.roll(2, '2026-09-18');
d.roll(2, '2026-09-19');
d.roll(2, '2026-09-20');
check('but it never banks past three days', d.left, 6);
while (d.take());
checkTrue('an empty allowance says so rather than going negative', !d.take());
check('allowance grows with the realm', allowance(0), 1);
check('and is capped', allowance(20), 8);


// ---------------------------------------------------------------- glyphs

// Deterministic throws. The spread is the only random thing in here and it is not what is under
// test: where a key lands *relative to the pet* is.
const realRandom = Math.random;
Math.random = () => 0.5;

const Ground = 600;
const Width = 1600;
const Reach = 53;

// 12. A key leaves the pet, arcs, and comes down somewhere it has to be fetched from.
let g = new Glyphs();
g.spawn('K', 800, 560);
check('one key out', g.count, 1);
checkTrue('nothing to chase while it is in the air', g.nearest(800) === null);
checkTrue('and it cannot be eaten in the air either', g.eatNear(800, 560, Reach) === 0);

for (let i = 0; i < 120 && g.nearest(800) === null; i++) g.update(1 / 60, Ground, Width);
const landed = g.nearest(800);
checkTrue('it lands', landed !== null);
check('on the ground, not through it', landed ? landed.y : -1, Ground, 1e-9);
checkTrue(
  'far enough away to be worth walking to',
  landed !== null && Math.abs(landed.x - 800) > Reach,
);

// 13. Eaten once the pet is next to it, and only then. This is the one that was wrong first time:
//     keys were thrown so gently that every one landed inside the pet's own reach and vanished on
//     contact, so the errand the mechanic is built around never happened.
checkTrue('not eaten from across the room', g.eatNear(800, 560, Reach) === 0);
check('eaten from beside it', g.eatNear(landed ? landed.x : 0, Ground, Reach), 1);
check('and it is gone', g.count, 0);

// 13b. Distance is not a reason to give up on a charm. Going across the screen for one is the
//      behaviour; what was wrong was where it went afterwards, which is main.ts's business.
g = new Glyphs();
g.spawn('F', 800, 560);
for (let i = 0; i < 120 && g.nearest(800) === null; i++) g.update(1 / 60, Ground, Width);
const charm = g.nearest(800);
checkTrue('there is a charm on the ground', charm !== null);
checkTrue('and it is still worth fetching from across the screen', g.nearest(1500) !== null);


// 14. One left alone fades rather than sitting there forever.
g = new Glyphs();
g.spawn('Q', 800, 560);
for (let i = 0; i < 60 * 30; i++) g.update(1 / 60, Ground, Width);
check('an ignored key eventually clears itself', g.count, 0);

// 15. The pile stays bounded even if nothing is eating them.
g = new Glyphs();
for (let i = 0; i < 40; i++) g.spawn('Z', 800, 560);
checkTrue('the pile is bounded', g.count <= 6);

// ---------------------------------------------------------------- motes

// 16. Every key knocks one speck loose, and they start clear of the body rather than inside it.
const m = new Motes();
m.spawn(8, 500, 400, 46);
check('one speck per key', m.count, 8);

// 17. They come to the pet rather than the other way round, and all of them arrive.
let arrived = 0;
for (let i = 0; i < 300 && m.count > 0; i++) arrived += m.update(1 / 60, 500, 400, 40);
check('all of them are taken in', arrived, 8);
check('and none are left drifting', m.count, 0);

// 18. Leaning on a key is not typing. The pile is bounded however hard it is pushed.
const flood = new Motes();
flood.spawn(500, 500, 400, 46);
checkTrue('the snowstorm is bounded', flood.count <= 96);

// 18b. A breakthrough's cloud has to come from further out than a keystroke's speck.
//
// The whole first beat of a realm change is dust arriving from everywhere at once, and it only
// reads that way if it has somewhere to arrive *from*. Spawned at the typing distance the same
// thirty specks are a puff that lands instantly.
function spawnDistance(spread?: number): number {
  const set = new Motes();
  set.spawn(1, 500, 400, 46, spread);
  const box = set.bounds()!;
  return Math.hypot(box.x + box.width / 2 - 500, box.y + box.height / 2 - 400);
}
checkTrue(
  'a breakthrough draws from further out',
  spawnDistance(BreakthroughSpread) > spawnDistance() * 2,
);
// And the three tiers have to stay ordered. A stage breakthrough is the same gesture as a realm
// one at a smaller scale, and the distance the dust comes from is most of what tells them apart —
// so a stage has to reach further than a keystroke and not as far as a realm. Asserted because
// these are three numbers in two files and nothing else would notice them crossing over.
checkTrue(
  'a stage sits between a keystroke and a realm',
  spawnDistance() < spawnDistance(StageSpread) &&
    spawnDistance(StageSpread) < spawnDistance(BreakthroughSpread),
);
// And still outside the body either way: a speck must never appear on top of the pet.
checkTrue('no dust starts inside the pet', spawnDistance() > 46);

// 19. Nothing at the keyboard means nothing on screen and nothing to draw.
const still = new Motes();
still.spawn(0, 500, 400, 46);
checkTrue('an idle keyboard costs nothing', !still.busy && still.bounds() === null);


// 20. Fading to transparent black is not fading out.
//
// Canvas interpolates gradient stops in non-premultiplied RGBA, so a ramp from a colour to
// `rgba(0,0,0,0)` passes through half-alpha dark grey — which over a dark background is *darker*
// than the background. It is why a beam of light kept reading as a column of smoke. The fix is to
// end on the same colour at zero alpha, and the only thing worth asserting is that it is in fact
// the same colour.
checkTrue('a faded colour keeps its hue', clear('#8ff0d4') === 'rgba(143, 240, 212, 0)');
checkTrue('and it works on shorthand', clear('#fff') === 'rgba(255, 255, 255, 0)');

// 21. A charm is worth fetching, and being held outranks a charm.
//
// This logic has broken twice. The second time, picking the pet up set `onErrand = false` with a
// comment saying a deliberate placement outranks an errand every time — and the frame loop set it
// straight back to true one frame later, because it asked "is there a charm" without asking "is the
// pet in somebody's hand". Dragging the pet onto a charm, feeding it and throwing it somewhere else
// then left a pending walk-home against a home frozen since before the drag, and the pet trudged
// back to a spot the user never chose.
const errand = (over: Partial<Parameters<typeof resolveErrand>[0]>) =>
  resolveErrand({
    held: false,
    charmX: null,
    x: 500,
    home: 200,
    onErrand: false,
    closeEnough: 32,
    ...over,
  });

checkTrue('a charm on the desktop starts an errand', errand({ charmX: 900 }).chase === 900);
checkTrue(
  'being held never starts one, however near the charm',
  errand({ held: true, charmX: 505 }).onErrand === false,
);
checkTrue(
  'and being held calls off one already running',
  errand({ held: true, charmX: 900, onErrand: true }).onErrand === false,
);
checkTrue(
  'with the charm gone it walks back to where it was left',
  errand({ onErrand: true }).chase === 200,
);
checkTrue('and arriving there ends the errand', errand({ onErrand: true, x: 210 }).chase === null);
checkTrue(
  'no home on record means it just stops',
  errand({ onErrand: true, home: null }).onErrand === false,
);
// The case the fix must not break: letting go while a charm is still out has to hand the errand
// back, or a pet put down next to a charm would ignore it forever.
checkTrue('letting go re-arms a pending charm', errand({ charmX: 900 }).onErrand === true);
// And the case that caused the report, end to end: held over a charm, fed, thrown. `home` is null
// by then because the release cleared it, so nothing can send the pet to a stale position.
checkTrue(
  'fed while held and thrown, it goes nowhere stale',
  errand({ onErrand: true, home: null, x: 1300 }).chase === null,
);

// 22. The sleep fade has to be able to finish.
//
// Sleep is one fixed colour reached by a blend, and the blend decides whether the body gradient is
// cached or rebuilt every frame. An easing that only approaches its endpoints would leave the pet
// permanently "mid-fade" — repainting forever and never using the cache — which is the sort of
// thing that does not look like a bug, it looks like the idle cost being worse than the README says.
checkTrue('the fade reaches both ends exactly', smooth(0) === 0 && smooth(1) === 1);
checkTrue('and it is monotonic across the middle', smooth(0.3) < smooth(0.5) && smooth(0.5) < smooth(0.7));
check('half way is half way', smooth(0.5), 0.5);
// And the blend itself, since it is now what the visible body colour is made of.
checkTrue('a blend of nothing is the original', mix('#b9d8ee', '#4d86ab', 0) === '#b9d8ee');
checkTrue('and a blend of everything is the other one', mix('#b9d8ee', '#4d86ab', 1) === '#4d86ab');

// 23. A cloud would rather be gone than grey.
//
// The obvious fade is `sin(rise * PI)`: symmetric, and it spends a long stretch at low alpha. A
// light colour at low alpha over a dark desktop is grey — that is just what alpha compositing does
// — so a long soft tail turns every auspicious cloud into a puff of smoke on the way out, which is
// the exact reading the breakthrough was rebuilt to get away from.
checkTrue('a cloud arrives and leaves at nothing', wispFade(0) === 0 && wispFade(1) === 0);
checkTrue('it is at full strength for most of the way', wispFade(0.25) === 1 && wispFade(0.7) === 1);
checkTrue('and it leaves faster than it arrives', wispFade(0.06) > wispFade(0.94));

// 24. Charms: a count that buys stages and odds.
//
// The one property that is not negotiable is the one the window-eating code has in its header:
// **it must never decide whether you can.** Charms move the odds on a realm; a player with none
// still gets through. Everything else here is balance and can be retuned; this cannot.
checkTrue('an empty hoard is still a real chance', odds(0, 0) >= 0.5);
checkTrue('and the odds can never exceed certainty', odds(100000, 99) === 1);
check('the base is what it says it is', odds(0, 0), BaseOdds);
check('a charm is worth its stated slice', odds(1, 0) - odds(0, 0), OddsPerCharm, 1e-9);
check('and so is a failure', odds(0, 1) - odds(0, 0), OddsPerFailure, 1e-9);

// The pity has to actually terminate. Four failures at the base rate is a one-in-forty event, and
// four failures at the top realm is the better part of an afternoon — so the fifth attempt has to
// be a certainty however the first four went, with nothing banked at all.
checkTrue(
  'the fifth attempt is certain however the first four went',
  odds(0, Math.ceil((1 - BaseOdds) / OddsPerFailure)) === 1,
);

// What it takes to buy certainty, and that asking twice agrees with itself.
const needed = charmsForCertainty(0, 0);
check('certainty has a price', needed, Math.ceil((1 - BaseOdds) / OddsPerCharm));
checkTrue('and paying it is enough', odds(needed, 0) === 1);
checkTrue('nothing more is wanted once it is certain', charmsForCertainty(needed, 0) === 0);

// The hoard is only ever spent by failing, so gathering is the only thing that moves it upward and
// nothing quietly draws it down. Charms briefly paid for automatic stages as well, and the floor
// that had to protect the insurance from that spending meant automation did not start until a
// hundred and forty were banked — which is to say it did nothing for the whole early game.
const purse = new Charms();
purse.gather(140);
check('gathering is the only thing that fills it', purse.count, 140);

// A failure empties the pot, which is the sharpest part of the cost: it makes the *next* attempt
// worse than this one would have been, rather than merely undoing this one.
purse.fail(2);
check('a failure wipes the hoard', purse.count, 0);
check('and is remembered against that realm', purse.failuresAt(2), 1);
check('only that realm', purse.failuresAt(3), 0);
checkTrue('so the next attempt there starts better', purse.oddsAt(2) > purse.oddsAt(3));

// And a rebirth must not inherit the pity, or the second climb would be quietly easier than the
// first for a reason nobody could see.
purse.clearFailures();
check('a rebirth forgets the failures', purse.failuresAt(2), 0);

// The set-back is a share of the *stage*, and it can never cost a stage already paid for.
const knocked = new Cultivation(0);
knocked.realm = 2;
knocked.stage = 8;
knocked.qi = requirement(2, 8);
knocked.setBack(FailureQiLoss);
check('failing gives back a slice of the stage', knocked.qi, requirement(2, 8) * (1 - FailureQiLoss));
checkTrue('and it drops you below the threshold', !knocked.readyToBreakThrough);
const barely = new Cultivation(0);
barely.qi = 1;
barely.setBack(1);
check('a set-back never goes negative', barely.qi, 0);

// 25. 机缘, and the rule the whole system rests on.
//
// A reward that waits for you is a chore with a bow on it. §4.4 is explicit: ignoring one makes it
// go away for good, and the amount has to be small enough that missing every single one costs
// nothing worth minding.
checkTrue('a find is worth minutes, not hours', MostSeconds <= 20 * 60);
checkTrue('and the gap between them is hours', MinGapSeconds >= 60 * 60);
checkTrue('the pool is a table of about twenty', FINDS.length >= 18 && FINDS.length <= 24);
checkTrue('and none of them repeat', new Set(FINDS).size === FINDS.length);

// The picks stay inside their stated ranges at both extremes of `random`.
for (const roll of [0, 0.5, 0.999999]) {
  const r = () => roll;
  checkTrue(`a gap at ${roll} is within range`, nextGap(r) >= MinGapSeconds && nextGap(r) <= MaxGapSeconds);
  checkTrue(`a value at ${roll} is within range`, findValue(r) >= LeastSeconds && findValue(r) <= MostSeconds);
  checkTrue(`a line at ${roll} exists`, typeof findText(r) === 'string' && findText(r).length > 0);
}
// `random` returning exactly 1 is out of contract but costs nothing to survive, and an index past
// the end of the pool would be `undefined` reaching the bubble as the word "undefined".
checkTrue('and a line at 1 still exists', findText(() => 1).length > 0);

// Coming back nudges a pending find forward. The bound on that is what stops the whole thing being
// farmable by anyone who notices: stepping away and back must *move* finds, never mint them.
const now = 1_000_000;
check('a return pulls a distant find forward', onReturn(now, now + 3600), now + 3600 - PullForwardSeconds);
checkTrue('but never to sooner than the buffer', onReturn(now, now + 3600) >= now + PullForwardSeconds);
check('a find already inside the buffer is left alone', onReturn(now, now + 60), now + 60);
check('and one already due is left alone', onReturn(now, now - 500), now - 500);
// Repeated returns cannot walk it in: once inside the buffer it stops moving.
let walked = now + 3600;
for (let i = 0; i < 20; i++) walked = onReturn(now, walked);
checkTrue('and hammering the return does not walk it in', walked >= now + PullForwardSeconds);

const luck = new Fortune();
luck.arm(now, () => 0.5);
checkTrue('arming schedules one', luck.due(now) === false && luck.dueAt > now);
const first = luck.dueAt;
luck.arm(now, () => 0.5);
check('arming again leaves it alone', luck.dueAt, first);
checkTrue('and it comes due eventually', luck.due(luck.dueAt));

// A save from a machine whose clock was wound back leaves a `nextAt` months out. Waiting months
// for something with no visible timer is indistinguishable from the feature being broken.
luck.restore({ nextAt: now + 400 * 24 * 3600 });
luck.arm(now, () => 0.5);
checkTrue('a find stranded by a wound-back clock is re-armed', luck.dueAt <= now + MaxGapSeconds);

// Taken or ignored, the next one is booked the same way: a missed find must not come back sooner to
// make up for it. Missing one costs nothing *and* changes nothing.
const taken = new Fortune();
const ignored = new Fortune();
taken.spent(now, () => 0.25);
ignored.spent(now, () => 0.25);
check('ignoring one is booked exactly like taking one', ignored.dueAt, taken.dueAt);

// A fresh install has nothing scheduled, and must not therefore be owed one immediately.
const fresh = new Fortune();
checkTrue('a fresh install is not owed a find', !fresh.due(now));

// 26. 御符: throwing the pet hard sends charms out to explode against the edge of the desktop.
//
// It is a sink for the *surplus*, and the surplus is the whole reason it exists: the odds on a
// realm clamp at certainty, and a successful crossing spends nothing, so past the first hundred a
// charm was worth exactly zero against a supply of some four thousand a run.
//
// It pays nothing back on purpose. A sink that returns progress becomes the optimal thing to do,
// and "throw your pet at the wall repeatedly" is not a play pattern to design toward.
checkTrue('putting the pet down throws nothing', charmsForFling(0) === 0);
checkTrue('and neither does a gentle move', charmsForFling(FlingThreshold - 1) === 0);
check('a throw at the threshold sends the fewest', charmsForFling(FlingThreshold), LeastCharms);
check('a throw at full strength sends the most', charmsForFling(FlingFull), MostCharms);
check('and harder than that sends no more', charmsForFling(FlingFull * 4), MostCharms);
// Monotonic across the range, so throwing harder never sends fewer.
let sent = 0;
let rising = true;
for (let speed = 0; speed <= FlingFull * 1.5; speed += 25) {
  const now = charmsForFling(speed);
  if (now < sent) rising = false;
  sent = now;
}
checkTrue('throwing harder never sends fewer', rising);

// The insurance is untouchable. This is the automatic-stage mistake again — a spend drawn from the
// pot that keeps a realm safe, happening where the player is not looking — and worse here, because
// a throw is a playful gesture and a hidden penalty on one is a trap.
const pouch = new Charms();
pouch.gather(40);
check('with no surplus, a throw spends nothing', pouch.takeSpare(0, 5), 0);
check('and the hoard is untouched', pouch.count, 40);
check('nothing is spare while the odds are short', pouch.spareAt(0), 0);

// Exactly at the line, nothing is spare: the line is what the throw must never eat into.
pouch.gather(charmsForCertainty(40, 0));
check('sitting exactly on the line leaves nothing spare', pouch.spareAt(0), 0);
check('so a throw from there spends nothing', pouch.takeSpare(0, 3), 0);
// Above it, the excess and only the excess.
pouch.gather(7);
check('above the line, the excess is spare', pouch.spareAt(0), 7);
const stocked = pouch.count;
check('a throw takes what it asked for', pouch.takeSpare(0, 3), 3);
check('from the spare pile', pouch.count, stocked - 3);
checkTrue('and the odds are still certain afterwards', pouch.shortfallAt(0) === 0);

// Asking for more than is spare throws what there is rather than refusing: it must not scold
// somebody for throwing their pet.
const thin = new Charms();
thin.gather(charmsForCertainty(0, 0) + 2);
check('asking for five when two are spare throws two', thin.takeSpare(0, 5), 2);
checkTrue('and never digs below certainty', thin.shortfallAt(0) === 0);

// ---------------------------------------------------------------------------------------------
// 历练. The mode's claim is that a realm changes what the fight *is* rather than how easy it is,
// and that claim lives entirely in the shape of five curves.

check('筑基 is the first rung', rung(1), 0);
check('大乘 is the last', rung(Ascended - 1), 6);
check('练气 cannot sit below the bottom', rung(0), 0);
check('and nothing past 飞升 climbs further', rung(Ascended + 4), 6);

// The door gets harder at every realm. The hand is a drafted build now, so there is no column here
// to compare it against — the comparison happens further down, by fighting a whole run.
let bothHarder = true;
for (let realm = 2; realm <= Ascended - 1; realm++) {
  if (arrivalRate(realm) <= arrivalRate(realm - 1)) bothHarder = false;
  if (menaceSpeed(realm) <= menaceSpeed(realm - 1)) bothHarder = false;
  if (vitality(realm) <= vitality(realm - 1)) bothHarder = false;
}
checkTrue('every realm arrives faster, closes faster and hits harder', bothHarder);
// The door is now set against what a *build* kills rather than against one talisman a second, so
// the spread across the ladder is much narrower than it used to be: seven a second at 筑基 against
// eleven and a half at 大乘. That is not a softer ladder, it is the ladder moving to where the
// content went — what a realm mostly buys you in here is **exchanges**, six at the bottom and
// eleven at the top, and a build twice as deep is the difference you feel.
checkTrue('筑基 faces about seven a second', Math.abs(arrivalRate(1) - 7) < 0.5);
checkTrue('大乘 faces about eleven and a half', Math.abs(arrivalRate(Ascended - 1) - 11.5) < 0.6);

// Arrivals quicken across a run and then stop, rather than compounding off the end of it —
// `through` is a fraction, and a caller holding a stale one should not tighten the screw.
checkTrue('a run starts slower than it ends', spawnInterval(1, 0) > spawnInterval(1, 1));
check('and the pace is flat past the finish', spawnInterval(1, 2), spawnInterval(1, 1));

// A beat of quiet on entry: choosing the mode must not also be the first hit.
const opening = new Trial();
opening.start(1);
opening.update(0.5, { x: 400, y: 300, radius: 40 }, 800, 600);
checkTrue('nothing arrives the instant a run begins', opening.bounds() === null);
checkTrue('and leaving at once is worth nothing', harvest(opening.through, opening.outcome) < 1);

// With the random stub pinned at 0.5 every 邪气 arrives at the same point on the bottom edge, which
// is what makes the two runs below reproducible: one stands in the doorway, one shoots it.

// 1. Swarmed. However many pile onto the body, hits cannot outpace the grace window — without it a
//    crowd arriving together is not a hard moment, it is instant death.
const swarm = new Trial();
swarm.start(Ascended - 1);
let previous = swarm.integrity;
let afterOne = 1;
let swarmClock = 0;
let lastHit = -Infinity;
let hits = 0;
let tooSoon = false;
while (swarm.outcome === 'running' && swarmClock < 200) {
  swarm.update(0.05, { x: 400, y: 600, radius: 40 }, 800, 600);
  swarmClock += 0.05;
  if (swarm.integrity < previous - 1e-9) {
    hits++;
    if (hits === 1) afterOne = swarm.integrity;
    if (swarmClock - lastHit < GraceSeconds - 1e-6) tooSoon = true;
    lastHit = swarmClock;
    previous = swarm.integrity;
  }
}
checkTrue('standing in the doorway does get the body swarmed', hits > 1);
check('the first contact costs one', afterOne, 1 - ContactDamage / vitality(Ascended - 1), 1e-9);
checkTrue('and no two hits land inside the grace window', !tooSoon);
checkTrue('so a swarm is what ends the run, not the clock', swarm.outcome === 'overwhelmed');
checkTrue('an ended run pays less than a finished one', harvest(swarm.through, swarm.outcome) < harvest(1, 'survived'));

// 2. Answered. Every arrival is struck down where it lands, so nothing reaches the body and the
//    swarmClock is the only thing left that can end it.
const clean = new Trial();
clean.start(1);
let ticks = 0;
while (clean.outcome === 'running' && ticks < 4000) {
  clean.update(0.05, { x: 400, y: 300, radius: 40 }, 800, 600);
  ticks++;
  // Twice over: one talisman is a wound, two is a kill.
  clean.strike(400, 624);
  clean.strike(400, 624);
}
check('nothing reached the body', clean.integrity, 1);
checkTrue('so the clock is what ended it', clean.outcome === 'survived');
checkTrue('and the kills were counted', clean.killCount > 0);
check('a survived run pays its whole share', harvest(clean.through, clean.outcome), RunSeconds * (ThroughShare + SurvivalBonus), 1e-9);

// The ceiling, which is the whole reason the payout stopped counting kills. `harvest` takes no
// realm at all — that is the structural half of the guarantee — and what it can pay is capped near
// the time the run actually took, so grinding the minigame cannot become the fastest way up a
// ladder whose premise is that it fills while you are busy with something else.
const best = harvest(1, 'survived');
checkTrue('a run cannot outrun its own ninety seconds by much', best <= RunSeconds * 1.5);
// And it is worth strictly less than a 机缘, which arrives for free every couple of hours: the
// thing you play for should not out-earn the thing you are handed.
checkTrue('nor out-earn a 机缘', best < MostSeconds);

// Being overwhelmed near the end has to be worth nearly finishing, or the lesson is not to try.
checkTrue(
  'dying at eighty seconds still pays most of the share',
  harvest(80 / RunSeconds, 'overwhelmed') > RunSeconds * ThroughShare * 0.8,
);
check('and walking straight back out pays nothing', harvest(0, 'overwhelmed'), 0);

Math.random = realRandom;



// ---------------------------------------------------------------------------------------------
// 法脉. The nine schools and the fourteen pairings.

// The parity argument, written down as arithmetic because it is the one constraint in this design
// that no amount of cleverness gets around: every edge adds one to two degrees, so the degrees sum
// to twice the edge count and can never be odd. Nine schools with three partners each would sum to
// twenty-seven. The request asked for exactly that, and it does not exist for any choice of pairs.
check('nine schools', SCHOOLS.length, 9);
let degrees = 0;
let threes = 0;
let fours = 0;
for (const school of SCHOOLS) {
  const count = partners(school).length;
  degrees += count;
  if (count === 3) threes++;
  if (count === 4) fours++;
}
check('degrees sum to twice the pairings', degrees, COMBOS.length * 2);
checkTrue('which is even, as it has to be', degrees % 2 === 0);
check('eight schools pair with three', threes, 8);
check('and one — 符 — pairs with four', fours, 1);
check('符 is that one', partners('符').length, 4);
check('fourteen pairings', COMBOS.length, 14);

// No school pairs with itself, nothing is listed twice in either direction, and every pairing is
// findable from both ends. A duplicate would silently double a combination's effect.
let selfPaired = false;
let duplicated = false;
let asymmetric = false;
const seen = new Set<string>();
for (const combo of COMBOS) {
  const [a, b] = combo.pair;
  if (a === b) selfPaired = true;
  const key = [a, b].slice().sort().join('');
  if (seen.has(key)) duplicated = true;
  seen.add(key);
  if (comboFor(a, b) !== combo || comboFor(b, a) !== combo) asymmetric = true;
}
checkTrue('nothing pairs with itself', !selfPaired);
checkTrue('and nothing is listed twice', !duplicated);
checkTrue('and every pairing reads the same from either end', !asymmetric);
check('every pairing is named', COMBOS.filter((c) => c.name.length > 0).length, 14);
check('every school has a jackpot', Object.keys(EVOLUTIONS).length, 9);
check('and a spec', Object.keys(SPECS).length, 9);

// No two schools share a motion. A school you cannot identify by how it moves is a stat with a
// name on it, which is the thing §12 cancelled 法宝 for being.
const motions = new Set(SCHOOLS.map((s) => SPECS[s].motion));
check('nine distinct motions', motions.size, 9);

// Every school is reachable from every other, so no build is a dead end you cannot grow out of.
const reach = new Set<string>(['符']);
for (let step = 0; step < SCHOOLS.length; step++) {
  for (const school of Array.from(reach)) {
    for (const next of partners(school as never)) reach.add(next);
  }
}
check('the graph is one piece', reach.size, 9);

// **The 82%**, which is why offers are not weighted toward partners. It is a consequence of the
// graph rather than a number written anywhere in it, so retuning the pairings moves it silently.
// C(5,3)/C(8,3) = 10/56 of three-card offers miss every partner of a single held school.
const missOdds = (10 / 56) * 1;
checkTrue('a three-card offer usually contains a partner', 1 - missOdds > 0.8);
check('82%, to be exact', Math.round((1 - missOdds) * 100), 82);

// A four-slot build really can be a complete 套路: this one is a chain, so it lands three.
check('four slots, three pairings', activeCombos(['符', '雷', '火', '冰']).length, 3);
// And two disjoint pairs is the other shape of complete. 符剑 and 焚甦, with nothing else
// touching across them.
check('or two clean pairs', activeCombos(['符', '剑', '火', '毒']).length, 2);

// Drafted in bulk, by somebody taking the card that pairs best with what they already hold.
//
// This is the requested property, and the one worth pinning: **four slots must always be able to
// make a complete 套路.** It comes out at 100% over four thousand drafts, not the two thirds I
// guessed from the 82% — with four picks there are three chances to find a partner and the graph
// is dense enough that a player paying attention never misses. So the draft is not a question of
// *whether* you can assemble something, it is a question of which thing; the measurement below
// says how much of that is luck.
let seed = 20260922;
const rng = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const runs = 4000;
let twoOrMore = 0;
let none = 0;
for (let run = 0; run < runs; run++) {
  const kit = new Arsenal();
  kit.start();
  for (let pick = 0; pick < Slots; pick++) {
    const cards = kit.offer(rng);
    let best = cards[0];
    let bestScore = -1;
    for (const card of cards) {
      if (card.kind !== 'take') continue;
      const score = activeCombos(kit.schools.concat(card.school)).length;
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    kit.take(best);
  }
  const made = activeCombos(kit.schools).length;
  if (made >= 2) twoOrMore++;
  if (made === 0) none++;
}
const complete = twoOrMore / runs;
check('a steered draft always completes two or more', complete, 1);
check('so it never comes away with nothing', none, 0);

// And the same four thousand drafts taken by somebody not looking, which is what the density of
// the graph amounts to: 14 of the 36 pairs combine, so six pairs out of a random four-set average
// 6 x 14/36 = 2.33 combinations. Reported rather than bounded tightly — it is a property of the
// pairings, and the point of printing it is that retuning them moves it.
let blindTwo = 0;
let blindNone = 0;
let blindTotal = 0;
for (let run = 0; run < runs; run++) {
  const kit2 = new Arsenal();
  kit2.start();
  for (let pick = 0; pick < Slots; pick++) {
    const cards = kit2.offer(rng);
    kit2.take(cards[Math.floor(rng() * cards.length) % cards.length]);
  }
  const made = activeCombos(kit2.schools).length;
  blindTotal += made;
  if (made >= 2) blindTwo++;
  if (made === 0) blindNone++;
}
checkTrue(
  `an unsteered draft averages ${(blindTotal / runs).toFixed(2)} combinations, two or more ${((blindTwo / runs) * 100).toFixed(0)}% of the time`,
  blindTotal / runs > 2 && blindTotal / runs < 2.7,
);
checkTrue(`and comes away with nothing ${((blindNone / runs) * 100).toFixed(1)}% of the time`, blindNone / runs < 0.06);

// Four cards, four slots, and the fight has not started yet — the whole point of opening this way.
const kit = new Arsenal();
kit.start();
check('four opening drafts', kit.openingLeft, Slots);
for (let i = 0; i < Slots; i++) {
  const cards = kit.offer(rng);
  check(`offer ${i + 1} has three cards`, cards.length, CardsPerOffer);
  checkTrue(`offer ${i + 1} is all new schools`, cards.every((c) => c.kind === 'take'));
  kit.take(cards[0]);
}
check('four slots filled', kit.held.length, Slots);
check('none of them spent an exchange', kit.exchangesTaken, 0);
checkTrue('and nothing is owed any more', !kit.due);

// Once the slots are full, an offer can only deepen what is there. No swapping: a build you can
// rewrite at will is a build you never had to commit to.
const afterwards = kit.offer(rng);
checkTrue('a full build is offered raises, not replacements', afterwards.every((c) => c.kind !== 'take'));

// The meter. Escalating, because one flat figure cannot serve a realm that kills ninety things and
// one that kills six hundred — it is five exchanges at one end or fifty at the other.
checkTrue('each exchange costs more than the last', exchangeCost(3) > exchangeCost(2));
const affordable = (kills: number) => {
  let n = 0;
  while (killsForExchanges(n + 1) <= kills) n++;
  return n;
};
// Kill totals measured off whole runs further down: about 550 at 筑基 and 1050 at 大乘.
const atFoundation = affordable(550);
const atTheTop = affordable(1050);
checkTrue(`筑基 affords ${atFoundation}`, atFoundation >= 8 && atFoundation <= 10);
checkTrue(`大乘 affords ${atTheTop}`, atTheTop >= 10 && atTheTop <= 13);
checkTrue('a high realm is a longer build, not a different one', atTheTop > atFoundation);

// Levelling shows up as a school being visibly busier, since there is no damage number anywhere in
// this app to raise instead.
checkTrue('a level shortens the cadence', cadence('符', 2) < cadence('符', 1));
checkTrue('and the ceiling holds', cadence('符', MaxLevel + 5) === cadence('符', MaxLevel));

// The jackpot gate: partner held, and levelled. Without the partner term the pairings would be a
// side quest with their own rewards and this would be a slot machine that ignored them.
const lone = new Arsenal();
lone.start();
lone.take({ kind: 'take', school: '符' });
lone.take({ kind: 'take', school: '冰' });   // 冰 pairs with 火, 风, 土 — none of which is in here
lone.take({ kind: 'take', school: '剑' });   // 剑 pairs with 符
lone.take({ kind: 'take', school: '影' });   // and so does 影
check('nothing is ripe at level one', lone.evolvable().length, 0);
for (let i = 1; i < EvolveLevel; i++) lone.take({ kind: 'raise', school: '冰' });
check('冰 is levelled but has nobody to pair with', lone.evolvable().length, 0);
for (let i = 1; i < EvolveLevel; i++) lone.take({ kind: 'raise', school: '符' });
check('符 is levelled and does', lone.evolvable().length, 1);
checkTrue('and it is 符', lone.evolvable()[0].of === '符');
lone.take({ kind: 'evolve', school: '符' });
checkTrue('evolving takes the level with it', lone.levelOf('符') === MaxLevel);
checkTrue('and it cannot be drawn twice', lone.evolvable().length === 0);
checkTrue('an evolved school is not offered raises', !lone.offer(rng).some((c) => c.kind === 'raise' && c.school === '符'));



// 三合. Seven forms of three schools, sitting on top of the fourteen pairings.

check('seven 三合', TRIADS.length, 7);
check('all of three schools', TRIADS.filter((t) => new Set(t.of).size === 3).length, 7);
check('every one named', TRIADS.filter((t) => t.name.length > 0 && t.effect.length > 0).length, 7);

// **一主二辅**, and this is the load-bearing constraint: each form is a school plus two of its
// own partners, so the three already carry two pairings before the 三合 is counted. That is what
// makes somebody assembling a build the ordinary way — taking cards that pair with what they hold —
// walk into these without hunting. A form made of three schools that do not pair would be a secret
// recipe, and a secret recipe in a ninety-second mode is content nobody sees.
let everyFormIsAnchored = true;
let fewestPairings = 9;
for (const triad of TRIADS) {
  const inside = triad.of.filter((a, i) =>
    triad.of.some((b, j) => j !== i && comboFor(a, b) !== null),
  );
  // At least one of the three has to pair with both others — that is the "主".
  const anchored = triad.of.some((lead) =>
    triad.of.every((other) => other === lead || comboFor(lead, other) !== null),
  );
  if (!anchored) everyFormIsAnchored = false;
  let pairings = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) if (comboFor(triad.of[i], triad.of[j])) pairings++;
  }
  fewestPairings = Math.min(fewestPairings, pairings);
  if (inside.length !== 3) everyFormIsAnchored = false;
}
checkTrue('every 三合 has a school that pairs with both the others', everyFormIsAnchored);
checkTrue(`and carries at least two pairings of its own: ${fewestPairings}`, fewestPairings >= 2);

// Exactly two of them are triangles — all three pairing with each other — and the graph contains
// no others, so this is a fact about the pairings rather than a choice about the forms.
const triangles = TRIADS.filter((t) => {
  let pairings = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) if (comboFor(t.of[i], t.of[j])) pairings++;
  }
  return pairings === 3;
});
check('two of the seven are triangles', triangles.length, 2);
// And the graph really has no third one, which is why there are not more of them.
let allTriangles = 0;
for (let i = 0; i < SCHOOLS.length; i++) {
  for (let j = i + 1; j < SCHOOLS.length; j++) {
    for (let k = j + 1; k < SCHOOLS.length; k++) {
      if (
        comboFor(SCHOOLS[i], SCHOOLS[j]) &&
        comboFor(SCHOOLS[j], SCHOOLS[k]) &&
        comboFor(SCHOOLS[i], SCHOOLS[k])
      ) {
        allTriangles++;
      }
    }
  }
}
check('the pairings contain exactly two triangles in total', allTriangles, 2);

// No school is locked out of the layer.
let leastAppearances = 9;
for (const school of SCHOOLS) {
  leastAppearances = Math.min(leastAppearances, TRIADS.filter((t) => t.of.includes(school)).length);
}
checkTrue(`every school is in at least two 三合: ${leastAppearances}`, leastAppearances >= 2);

// A four-slot build can hold one, and holding one costs three quarters of the build — which is the
// whole reason this layer is worth having where a fifteenth pairing would not be.
check('a 三合 fits in four slots', activeTriads(['符', '剑', '雷', '冰']).length, 1);
check('and three schools is enough on their own', activeTriads(['符', '剑', '雷']).length, 1);
check('two of the three is not', activeTriads(['符', '剑']).length, 0);

// How often a steered draft walks into one without trying, which is the number the 一主二辅 rule
// exists to keep up. Reported rather than pinned tightly: it is a consequence of the pairings.
let withTriad = 0;
for (let run = 0; run < runs; run++) {
  const kit3 = new Arsenal();
  kit3.start();
  for (let pick = 0; pick < Slots; pick++) {
    const cards = kit3.offer(rng);
    let best = cards[0];
    let bestScore = -1;
    for (const card of cards) {
      if (card.kind !== 'take') continue;
      const would = kit3.schools.concat(card.school);
      const score = activeCombos(would).length * 2 + activeTriads(would).length * 5;
      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    kit3.take(best);
  }
  if (activeTriads(kit3.schools).length > 0) withTriad++;
}
checkTrue(
  `a draft that goes looking finds one ${((withTriad / runs) * 100).toFixed(0)}% of the time`,
  withTriad / runs > 0.5,
);

// ---------------------------------------------------------------------------------------------
// 邪气: the roster, and whether a run actually gets worse.
//
// It used to be one breed that homed in, and the only thing that escalated across ninety seconds
// was the arrival rate — so the last thirty seconds were the first thirty with the tap opened.
// These pin the three things that move now: how many, **what**, and how fast.

check('six breeds', BREEDS.length, 6);
check('six distinct kinds', new Set(BREEDS.map((b) => b.kind)).size, 6);

// Only the two that are drawn conspicuously bigger take more than one hit. Everything a player
// sees most of still dies to one talisman, which is the rule the roster is allowed to bend and
// not to break.
const tough = BREEDS.filter((b) => b.health > 1);
check('two breeds take more than one hit', tough.length, 2);
checkTrue('and both are drawn bigger than anything else', tough.every((b) => b.size >= 16));

// Everything is in play before a run ends, at every realm — a breed nobody meets is content that
// does not exist.
let allArrive = true;
for (let rung = 0; rung <= 6; rung++) {
  for (const breed of BREEDS) {
    if (weightAt(breed, schedule(rung, 1)) <= 0) allArrive = false;
  }
}
checkTrue('every breed is in play by the end of a run, at every realm', allArrive);

// The composition changes, which is the whole point. Early on it is the baseline and nothing else;
// late on the baseline is a minority of what arrives.
const shareOf = (kind: string, point: number) => {
  let total = 0;
  let mine = 0;
  for (const breed of BREEDS) {
    const w = weightAt(breed, point);
    total += w;
    if (breed.kind === kind) mine += w;
  }
  return total > 0 ? mine / total : 0;
};
check('a run opens as nothing but 游魂', shareOf('drift', 0), 1);
checkTrue(
  `and 游魂 is a minority by the end: ${(shareOf('drift', 1) * 100).toFixed(0)}%`,
  shareOf('drift', 1) < 0.35,
);
let thinning = true;
for (let t = 0.1; t <= 1.0001; t += 0.1) {
  if (shareOf('drift', t) > shareOf('drift', t - 0.1) + 1e-9) thinning = false;
}
checkTrue('the baseline never regains ground', thinning);

const availableAt = (rung: number, t: number) =>
  BREEDS.filter((b) => weightAt(b, schedule(rung, t)) > 0).length;
checkTrue('a tenth of the way in, most of the roster is still unseen', availableAt(0, 0.1) <= 2);
check('by the end, all of it', availableAt(0, 1), 6);

// A high realm reads the same schedule faster rather than having a different one.
checkTrue('大乘 is further along the roster at the same moment', schedule(6, 0.3) > schedule(0, 0.3));
checkTrue('and has met everything by 38% of the way in', availableAt(6, 0.38) === 6);
checkTrue('where 筑基 is still two breeds short', availableAt(0, 0.38) <= 4);

// Nothing arrives before it is due, however the dice fall.
let early = 0;
for (let i = 0; i < 5000; i++) {
  const breed = rollBreed(0, 0.1, rng);
  if (breed.from > schedule(0, 0.1)) early++;
}
check('nothing arrives ahead of its schedule', early, 0);

// Speed rises too, and only a little: it is the cheapest difficulty curve there is, and making the
// same fight faster is not the same as making it a different fight.
check('everything closes at its own pace to begin with', pacing(0), 1);
check('and a quarter faster by the end', pacing(1), 1.25);
check('clamped past the end', pacing(4), 1.25);

// ---------------------------------------------------------------------------------------------
// The AFK guard. Fourth version, and the first one that is not arithmetic.
//
// The first two compared two columns of `LADDER`, and both passed while a real run driven frame by
// frame finished at full health with the body never moving. The third fought a whole run, which at
// least caught that — and then the schools arrived and a four-slot build turned out to kill five
// to eight times what one talisman did. Chasing it with the door took about **two thousand
// arrivals in ninety seconds**, which is not a fight, it is a screensaver with a body in it.
//
// The thing that actually stops a run being farmed is structural and was sitting there all along:
// **the draft pauses the run.** Nothing moves, the clock does not advance, and `through` — which
// is the entire payout — only counts seconds that elapsed. So a run nobody is clicking earns
// nothing, however strong the build is, and that holds without a single number being tuned for it.
// The first assertion below is that structural fact, and it is the load-bearing one.
//
// What is left to tune is the case in between: somebody who takes the four opening cards, starts
// the fight, and then never spends the meter again. That build stays at level one for ninety
// seconds, and it has to lose — otherwise the exchanges are decoration.

// Pinned for the whole block below. Arrivals pick their edge with `Math.random`, and so do half a
// dozen flourishes inside the schools, so an unpinned run is a different fight every time — which
// for an assertion that sits right on a balance line means a check that fails one time in five and
// teaches everybody to re-run it. It flaked exactly once before this went in.
// Its own stream rather than the shared `rng`. These fights are long and every draw moves them,
// so reading from the shared one means that *adding an assertion anywhere above* silently changes
// the outcome of a balance guard — which happened, and cost a while to see.
let fightSeed = 990722;
const fightRandom = () => {
  fightSeed = (fightSeed * 1103515245 + 12345) & 0x7fffffff;
  return fightSeed / 0x7fffffff;
};
const wildRandom = Math.random;
Math.random = fightRandom;

interface Standing {
  outcome: string;
  kills: number;
  seconds: number;
  integrity: number;
  exchanges: number;
  paid: number;
}

function fight(
  realm: number,
  nudge: number,
  random: () => number,
  build?: School[],
  spend = true,
): Standing {
  const arena = { width: 1200, height: 800 };
  const trial = new Trial();
  const kit = new Arsenal();
  const arts = new Attacks();
  trial.start(realm);
  kit.start();
  arts.reset();

  // The opening draft. A named build when one is given — the guard has to test the *strongest*
  // thing somebody could walk away from, not whatever four cards a seed happened to deal.
  if (build) for (const school of build) kit.take({ kind: 'take', school });
  while (kit.openingLeft > 0) kit.take(kit.offer(random)[0]);
  arts.carry(kit.held, kit.combos());

  const body = { x: arena.width / 2, y: arena.height / 2, radius: 46 };
  let seconds = 0;
  let seen = 0;
  const dt = 1 / 60;
  while (trial.outcome === 'running' && seconds < RunSeconds * 2) {
    if (nudge > 0) {
      // A crude hand: away from the crowd, weighted by nearness, with a pull to the middle.
      let ax = 0;
      let ay = 0;
      for (const m of trial.targets()) {
        const dx = body.x - m.x;
        const dy = body.y - m.y;
        const d = Math.hypot(dx, dy) || 1;
        ax += dx / (d * d);
        ay += dy / (d * d);
      }
      ax += (arena.width / 2 - body.x) * 4e-4;
      ay += (arena.height / 2 - body.y) * 4e-4;
      const len = Math.hypot(ax, ay) || 1;
      body.x = Math.max(50, Math.min(arena.width - 50, body.x + (ax / len) * nudge * dt));
      body.y = Math.max(50, Math.min(arena.height - 50, body.y + (ay / len) * nudge * dt));
    }

    trial.update(dt, body, arena.width, arena.height, arts);
    arts.update(dt, body, trial);

    // Kills feed the meter, and a full meter is spent on the first card offered.
    const now = trial.killCount;
    for (let i = seen; i < now; i++) kit.countKill();
    seen = now;
    if (spend && kit.due) {
      kit.take(kit.offer(random)[0]);
      arts.carry(kit.held, kit.combos());
    }
    seconds += dt;
  }
  return {
    outcome: trial.outcome,
    kills: trial.killCount,
    seconds: Math.round(seconds * 10) / 10,
    integrity: Math.round(trial.integrity * 100) / 100,
    exchanges: kit.exchangesTaken,
    paid: Math.round(harvest(trial.through, trial.outcome)),
  };
}

// 1. The structural half. A run whose draft is never answered never starts — four cards are owed
//    before the first 邪气 arrives — so no time passes and nothing is earned. This is what makes
//    walking away worthless, and it does not depend on a single tuned number.
const abandoned = new Arsenal();
abandoned.start();
const waiting = new Trial();
waiting.start(Ascended - 1);
checkTrue('four cards are owed before a run can begin', abandoned.due && abandoned.openingLeft === 4);
check('so an unanswered run has run for no time', waiting.through, 0);
check('and is worth nothing', harvest(waiting.through, waiting.outcome), 0);

// 2. The tuned half. 符雷火冰 is a chain of three pairings and the highest kill rate measured of
//    anything tried — 6 a second at level one, 23 at level five, 33 evolved. Drafted and then
//    neglected, it stays at six, and six has to lose at every realm.
//
//    筑基 used to be exempt here, because a level-one build could ride out a run of nothing but
//    游魂. The roster closed that on its own — 钉煎 cannot be kited and 裂魄 replaces itself — so
//    neglect now loses at every realm, and earlier the higher you go. Nothing was retuned for it;
//    six breeds did what two thousand arrivals a minute could not.
const Strongest: School[] = ['符', '雷', '火', '冰'];
let neglectedSurvivals = 0;
const neglectedPay: number[] = [];
for (let realm = 1; realm <= Ascended - 1; realm++) {
  const idle = fight(realm, 0, fightRandom, Strongest, false);
  if (idle.outcome === 'survived') neglectedSurvivals++;
  neglectedPay.push(idle.paid);
  console.log(
    `NOTE  realm ${realm} drafted and then neglected: ${idle.outcome} at ${idle.seconds}s, ${idle.kills} killed, paid ${idle.paid}`,
  );
}
check('a build nobody deepens loses at every realm', neglectedSurvivals, 0);
// Over the span rather than step by step. 筑基 and 金丹 are eight percent apart in arrival rate,
// so which of the two dies first is noise, and a strict ordering across seven stochastic runs is a
// check that fails one time in five and teaches everybody to re-run it.
const lowThree = (neglectedPay[0] + neglectedPay[1] + neglectedPay[2]) / 3;
const highThree =
  (neglectedPay[4] + neglectedPay[5] + neglectedPay[6]) / 3;
checkTrue(
  `neglect costs more the higher you go: ${lowThree.toFixed(0)} paid at the bottom against ${highThree.toFixed(0)} at the top`,
  highThree < lowThree * 0.8,
);

// 3. And the same build with its exchanges taken, which is the reward for playing: it should do
//    markedly better. Reported at both ends rather than asserted as a survival, because whether a
//    *person* survives is not something a potential-field bot can tell me.
for (const realm of [1, Ascended - 1]) {
  const spent = fight(realm, 0, fightRandom, Strongest, true);
  console.log(
    `NOTE  realm ${realm} with the meter spent: ${spent.outcome} at ${spent.seconds}s, ${spent.kills} killed, ${spent.exchanges} exchanges, integrity ${spent.integrity}, paid ${spent.paid}`,
  );
}

// And the same fight with a hand on it, reported rather than asserted. A potential-field bot is a
// bad player — it corners itself, and at 700 px/s it still died to things moving at 52 — so
// "the bot survived" is worth knowing and "the bot died" proves nothing about a person.
for (const realm of [1, 4, Ascended - 1]) {
  const moved = fight(realm, 260, fightRandom, Strongest);
  console.log(
    `NOTE  realm ${realm} with a crude hand: ${moved.outcome} at ${moved.seconds}s, ${moved.kills} killed, integrity ${moved.integrity}, paid ${moved.paid}`,
  );
}

Math.random = wildRandom;

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
