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
import { Motes } from './Motes.js';
import { allowance, burden, effort, engulfSeconds, spoilMinutes } from './combat.js';
import { Daily } from './daily.js';
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
c.rebirths = 2;
c.settle(10);
check('two rebirths double the output', c.qi, 10 * IdleFactor * 2, 1e-9);

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
checkTrue('the snowstorm is bounded', flood.count <= 36);

// 19. Nothing at the keyboard means nothing on screen and nothing to draw.
const still = new Motes();
still.spawn(0, 500, 400, 46);
checkTrue('an idle keyboard costs nothing', !still.busy && still.bounds() === null);


Math.random = realRandom;


console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
