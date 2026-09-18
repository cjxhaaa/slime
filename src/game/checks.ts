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

Math.random = realRandom;


console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
