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
import { Glyphs, LongestFlightSeconds, SlipHeight } from './Glyphs.js';
import { FEAT_IDS, Feats, REALM_FEATS, featBlurb, featName } from './feats.js';
import { BreakthroughSpread, Motes, StageSpread } from './Motes.js';
import { Slime } from '../slime/Slime.js';
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
  ClearBonus,
  ContactDamage,
  GraceSeconds,
  PaySeconds,
  ThroughShare,
  FlingTau,
  Trial,
  harvest,
} from './Trial.js';
import {
  TopLevel,
  arrivalRate,
  clampLevel,
  haste,
  menaceSpeed,
  schedule,
  toughness,
  vitality,
  waveSize,
} from './levels.js';
import {
  BossWave,
  EliteWaves,
  SpawnSeconds,
  WaveRest,
  Waves,
  WavesPerLevel,
  bossOf,
  elitesAt,
  latestStart,
  lineup,
  rankOf,
} from './Waves.js';
import { Attacks } from './Attacks.js';
import type { Battlefield } from './Attacks.js';
import { GuardBite, PillarShove, QuakeTell, SlashSpeed, SlashWidth } from './Attacks.js';
import {
  Dummies,
  NumbSeconds,
  PostCount,
  PostRadius,
  Range as YardRange,
  RateWindow,
  Spread as YardSpread,
} from './Dummies.js';
import { Depth } from './depth.js';
import { Pack, Slots } from './Pack.js';
import {
  BuysPerSlot,
  FirstPrice,
  MostSlots,
  PriceGrowth,
  OpeningBuys,
  Purse,
  costOf,
  price,
  slotsAfter,
  startingSilver,
  stock,
} from './purse.js';
import { type Item, Tiers, canMerge, dropTier, forge } from './gear.js';
import { type Loadout, complete, fuseOnBar, mergeOf, readLoadout, within } from './loadout.js';
import { LoadoutPanel, Pitch, togglePick } from '../ui/Loadout.js';
import {
  ARMS,
  MaxDepth,
  PATHS,
  WAYS,
  WEAPONS,
  type Weapon,
  span,
  swing,
} from './kit.js';
import { BurnBeat } from './Trial.js';
import { BREEDS, RANKS, pacing, rollBreed, rollChampion, weightAt } from './menaces.js';
import {
  Ascended,
  StagesPerRealm,
  baseRate,
  fullness,
  requirement,
  stageName,
} from './realms.js';
import { DICTIONARIES, LOCALES, fill, isLocale, locale, localeFor, setLocale } from '../i18n/index.js';
import { fit, wrap } from '../ui/text.js';
import { drawWayIcon, drawWeaponIcon } from '../ui/icons.js';
import { ButtonWidth } from '../ui/Bar.js';
import {
  HiddenUntil,
  crawl,
  crawlDistance,
  emerged,
  nearestEdge,
  planCrawl,
  squeezeAt,
} from '../ui/reveal.js';
import { MaxReach, MinReach, Settle, arch, cycleSeconds, pace, planHop } from './pursuit.js';

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
// 历练 — 关卡与波次. The level is the door now, and the claim is that every level is a harder door
// than the one below it, on every curve, with nothing allowed to dip.

check('below the bottom is level one', clampLevel(0), 1);
check('past the top is the top', clampLevel(TopLevel + 40), TopLevel);
check('a broken number is level one', clampLevel(Number.NaN), 1);
check('and a fraction is the level it is in', clampLevel(7.9), 7);

{
  // Never easier, at any step, on any curve. Per wave for the count, because a level whose fourth
  // wave shrank while its total grew would be a dip nobody could see in a sum.
  const dips: string[] = [];
  for (let level = 2; level <= TopLevel; level++) {
    for (let wave = 0; wave < WavesPerLevel; wave++) {
      if (waveSize(level, wave) < waveSize(level - 1, wave)) dips.push(`size ${level}/${wave}`);
      if (arrivalRate(level, wave) <= arrivalRate(level - 1, wave)) dips.push(`rate ${level}/${wave}`);
    }
    if (menaceSpeed(level) <= menaceSpeed(level - 1)) dips.push(`speed ${level}`);
    if (toughness(level) <= toughness(level - 1)) dips.push(`toughness ${level}`);
    if (haste(level) <= haste(level - 1)) dips.push(`haste ${level}`);
  }
  check(`every curve climbs at every level${dips.length ? ': ' + dips.slice(0, 6).join(', ') : ''}`, dips.length, 0);

  // And inside a level, the waves press harder as they go — the shape the ninety-second run had.
  let shrinking = 0;
  for (let level = 1; level <= TopLevel; level++) {
    for (let wave = 1; wave < WavesPerLevel; wave++) {
      if (waveSize(level, wave) < waveSize(level, wave - 1)) shrinking++;
      if (arrivalRate(level, wave) <= arrivalRate(level, wave - 1)) shrinking++;
    }
  }
  check('and every wave of a level sends at least as many as the one before, faster', shrinking, 0);
}

// What "level 50 is clearly harder" means in numbers, before anything is fought.
const sentIn = (level: number) => {
  let all = 0;
  for (let wave = 0; wave < WavesPerLevel; wave++) all += lineup(level, wave).length;
  return all;
};
checkTrue(`level 50 sends half again what level 1 does: ${sentIn(50)} against ${sentIn(1)}`, sentIn(50) > sentIn(1) * 1.5);
checkTrue(`and closes a third faster: ${menaceSpeed(50).toFixed(0)} against ${menaceSpeed(1).toFixed(0)}`, menaceSpeed(50) > menaceSpeed(1) * 1.3);
checkTrue('and takes more to kill', toughness(50) >= toughness(1) * 1.5);
checkTrue(`the top of the tower sends ${sentIn(TopLevel)}`, sentIn(TopLevel) > sentIn(50));

// 波次. Ten, the fourth and the eighth bring elites, the tenth a boss.
check('ten waves to a level', WavesPerLevel, 10);
checkTrue(
  'waves 4 and 8 are elite, 10 is the boss, the rest are common',
  Array.from({ length: WavesPerLevel }, (_, w) => rankOf(w)).join() ===
    'common,common,common,elite,common,common,common,elite,common,boss',
);
{
  let wrong = 0;
  for (let level = 1; level <= TopLevel; level++) {
    const boss = lineup(level, BossWave);
    if (boss[0].rank !== 'boss' || boss.filter((a) => a.rank === 'boss').length !== 1) wrong++;
    for (const wave of EliteWaves) {
      const elites = lineup(level, wave).filter((a) => a.rank === 'elite').length;
      if (elites !== elitesAt(level)) wrong++;
      // Not at the front: an elite is picked out of a crowd, not met alone.
      if (lineup(level, wave)[0].rank === 'elite') wrong++;
    }
    for (let wave = 0; wave < WavesPerLevel; wave++) {
      if (rankOf(wave) === 'common' && lineup(level, wave).some((a) => a.rank !== 'common')) wrong++;
    }
  }
  check('every level has one boss leading its last wave, and its elites where they belong', wrong, 0);
}
check('one elite at the bottom of the tower', elitesAt(1), 1);
check('three at the top', elitesAt(TopLevel), 3);

// Elites and bosses are the six, bigger. Three numbers apiece, and they are the ones TOWER.md set.
check('an elite is drawn at 1.7', RANKS.elite.size, 1.7);
check('and takes eight times the hits', RANKS.elite.health, 8);
check('a boss is drawn at 2.6', RANKS.boss.size, 2.6);
check('and takes forty times', RANKS.boss.health, 40);
check('a common is neither', RANKS.common.size * RANKS.common.health, 1);
{
  // Never 钉煞: it plants on the border, and a boss that never arrives is a level won by waiting.
  let seed = 20261013;
  const roll = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let rooted = 0;
  for (let i = 0; i < 4000; i++) if (rollChampion(roll(), roll).kind === 'root') rooted++;
  for (let level = 1; level <= TopLevel; level++) if (bossOf(level) === 'root') rooted++;
  check('no elite and no boss is ever a 钉煞', rooted, 0);
  check('and the first boss anybody meets is the breed they have met most of', bossOf(1) === 'drift' ? 1 : 0, 1);
}

{
  // **The timetable.** Three minutes is when the 邪气 stop *arriving*, not when the level stops. So
  // with something left standing the whole time — nothing ever cleared — every wave still comes, in
  // full, and the last of them is out inside `SpawnSeconds`. At every level.
  let late = 0;
  let short = 0;
  for (let level = 1; level <= TopLevel; level += 7) {
    const waves = new Waves();
    waves.start(level);
    let sent = 0;
    let lastAt = 0;
    for (let i = 0; i < 60 * (SpawnSeconds + 30); i++) {
      const n = waves.tick(1 / 60, 1).length;
      if (n > 0) {
        sent += n;
        lastAt = waves.seconds;
      }
    }
    let due = 0;
    for (let wave = 0; wave < WavesPerLevel; wave++) due += lineup(level, wave).length;
    if (lastAt > SpawnSeconds + 1e-6 || !waves.allOut) late++;
    if (sent !== due) short++;
  }
  check(`with the field never cleared, all ten waves are out within ${SpawnSeconds}s at every level`, late, 0);
  check('and every one of them is sent in full', short, 0);
  let ordered = true;
  for (let wave = 1; wave < WavesPerLevel; wave++) if (latestStart(50, wave) <= latestStart(50, wave - 1)) ordered = false;
  checkTrue('one after another, never two at the same moment', ordered);

  // **Clear the field and the next one comes early**, after a breath — the timetable is when a
  // wave arrives at the latest, not the earliest.
  const quick = new Waves();
  quick.start(1);
  let sent = 0;
  while (sent < lineup(1, 0).length) sent += quick.tick(1 / 60, 1).length;
  const clearedAt = quick.seconds;
  for (let i = 0; i < Math.round((WaveRest / 2) * 60); i++) quick.tick(1 / 60, 0);
  check('with the field just cleared, a breath first', quick.wave, 0);
  while (quick.wave === 0 && quick.seconds < 60) quick.tick(1 / 60, 0);
  const calledIn = quick.seconds - clearedAt;
  checkTrue(`then the next one, ${calledIn.toFixed(2)}s after the field went empty`, Math.abs(calledIn - WaveRest) < 0.05);
  checkTrue(
    `well ahead of its place on the timetable (${latestStart(1, 1).toFixed(0)}s)`,
    quick.seconds < latestStart(1, 1) - 5,
  );

  // **The dots.** One per wave, -1 until it arrives; it fills as that wave's 邪气 die, never goes
  // backwards, and is solid only once all of it has come and gone.
  const counted = new Waves();
  counted.start(1);
  check('no dot is open before anything arrives', counted.marks().filter((m) => m >= 0).length, 0);
  counted.tick(2, 1);
  const size = lineup(1, 0).length;
  checkTrue('the first opens when its wave does', counted.marks()[0] === 0 && counted.marks()[1] === -1);
  counted.resolve(0, Math.floor(size / 2));
  const half = counted.marks()[0];
  counted.swell(0, 4);
  checkTrue(`a 裂魄 coming apart does not move the dot back (${half.toFixed(2)})`, counted.marks()[0] >= half);
  counted.resolve(0, size + 10);
  checkTrue('and a wave still walking in never reads as finished', counted.marks()[0] < 1);
  for (let i = 0; i < 60 * 20; i++) counted.tick(1 / 60, 1);
  check('once all of it has come and gone, it is solid', counted.marks()[0], 1);
}

// A beat of quiet on entry: choosing the mode must not also be the first hit.
const opening = new Trial();
opening.start(1);
opening.update(0.5, { x: 400, y: 300, radius: 40 }, 800, 600);
checkTrue('nothing arrives the instant a level begins', opening.bounds() === null);
checkTrue('and leaving at once is worth nothing', harvest(opening.through, opening.outcome) < 1);

// With the random stub pinned at 0.5 every 邪气 arrives at the same point on the bottom edge, which
// is what makes the two levels below reproducible: one stands in the doorway, one shoots it.

// 1. Swarmed. However many pile onto the body, hits cannot outpace the grace window — without it a
//    crowd arriving together is not a hard moment, it is instant death.
const swarm = new Trial();
swarm.start(TopLevel);
let previous = swarm.integrity;
let afterOne = 1;
let swarmClock = 0;
let lastHit = -Infinity;
let hits = 0;
let tooSoon = false;
while (swarm.outcome === 'running' && swarmClock < 300) {
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
check('the first contact costs one', afterOne, 1 - ContactDamage / vitality(TopLevel), 1e-9);
checkTrue('and no two hits land inside the grace window', !tooSoon);
checkTrue('so the body falls, and that is a lost level', swarm.outcome === 'overwhelmed');
checkTrue('one that never saw its boss', swarm.wave < BossWave);
checkTrue('and it pays less than a cleared one', harvest(swarm.through, swarm.outcome) < harvest(1, 'cleared'));

// 2. Answered. Every arrival is struck down where it lands, so nothing reaches the body, and the
//    only way left for the level to end is the boss going down.
const clean = new Trial();
clean.start(1);
let ticks = 0;
let wavesSeen = 0;
let throughBack = false;
let lastThrough = 0;
let bossMet = false;
while (clean.outcome === 'running' && ticks < 20000) {
  clean.update(0.05, { x: 400, y: 300, radius: 40 }, 800, 600);
  ticks++;
  // Several times over: the elites take eight and the boss forty.
  for (let i = 0; i < 6; i++) clean.strike(400, 624);
  wavesSeen = Math.max(wavesSeen, clean.wave + 1);
  if (clean.through < lastThrough - 1e-9) throughBack = true;
  lastThrough = clean.through;
  if (clean.wave === BossWave && clean.targets().length > 0) bossMet = true;
}
check('nothing reached the body', clean.integrity, 1);
checkTrue('all ten waves came', wavesSeen === WavesPerLevel && bossMet);
checkTrue('and the boss falling is what ended it', clean.outcome === 'cleared');
check('which is all the way through', clean.through, 1);
checkTrue('and the dots never went backwards on the way', !throughBack);
checkTrue('and the kills were counted', clean.killCount > sentIn(1) * 0.8);
check('a cleared level pays its whole share', harvest(clean.through, clean.outcome), PaySeconds * (ThroughShare + ClearBonus), 1e-9);
checkTrue(
  `and even struck down on arrival, a level is a minute of fighting: ${(ticks * 0.05).toFixed(0)}s`,
  ticks * 0.05 >= 45 && ticks * 0.05 < 150,
);

{
  // **A boss is not thrown.** Fought to the last wave the same way as above, then the boss — which
  // leads its wave, so it is alone on the field — is hit with four pillars' worth of 山崩 from just
  // on the far side of it. Throwable, it was once pushed off the screen and held there by a build
  // that shoved on every hit, and a level whose boss never comes back is a level that never ends.
  const run = new Trial();
  run.start(1);
  const body = { x: 400, y: 300, radius: 40 };
  let ticks = 0;
  while (!(run.wave === BossWave && run.targets().length > 0) && ticks++ < 20000) {
    run.update(0.05, body, 800, 600);
    if (run.wave < BossWave) for (let i = 0; i < 6; i++) run.strike(400, 624);
  }
  const alone = run.targets();
  checkTrue(`the boss walks in alone: ${alone.length} on the field`, alone.length === 1);
  const from = Math.hypot(alone[0].x - body.x, alone[0].y - body.y);
  run.shove(alone[0].x, alone[0].y - 30, 200, PillarShove * 4);
  for (let i = 0; i < 18; i++) run.update(1 / 120, body, 800, 600);
  const to = Math.hypot(run.targets()[0].x - body.x, run.targets()[0].y - body.y);
  checkTrue(`and a throw does not move it back: ${from.toFixed(0)}px before, ${to.toFixed(0)}px after`, to <= from + 1);
}

// The ceiling, which is the whole reason the payout stopped counting kills. `harvest` takes no
// level and no realm — that is the structural half of the guarantee — and what it can pay is capped
// below the time a level actually takes, so grinding the minigame cannot become the fastest way up
// a ladder whose premise is that it fills while you are busy with something else.
const best = harvest(1, 'cleared');
checkTrue('a level cannot outrun the time it took by much', best <= PaySeconds * 1.5);
// And it is worth strictly less than a 机缘, which arrives for free every couple of hours: the
// thing you play for should not out-earn the thing you are handed.
checkTrue('nor out-earn a 机缘', best < MostSeconds);

// Being overwhelmed at the boss has to be worth nearly clearing, or the lesson is not to try.
checkTrue(
  'falling at the boss still pays most of the share',
  harvest((BossWave + 0.5) / WavesPerLevel, 'overwhelmed') > PaySeconds * ThroughShare * 0.8,
);
check('and walking straight back out pays nothing', harvest(0, 'overwhelmed'), 0);

Math.random = realRandom;



// ---------------------------------------------------------------------------------------------
// 装备栏 and 银币: the slots, the purse, and the shop between them.
//
// The draft is gone, and some of what it asserted was load-bearing, so it is named here rather
// than quietly dropped. **The first thing you get is a weapon** — that survives, as a rule of the
// shop. **Four cards before the first 邪气** — that survives as a rule of the level: nothing
// arrives until something that swings is carried (asserted with the fight, further down). **An
// offer is never empty** — gone, because nothing is offered; a full bar refuses the purchase
// instead, and that refusal is the point.

// Its own generator, so this block's outcome does not depend on how many draws happened above it.
let shopSeed = 20261010;
const shopRandom = (): number => {
  shopSeed = (shopSeed * 1103515245 + 12345) & 0x7fffffff;
  return shopSeed / 0x7fffffff;
};

// The five every shop and merge in this block rolls from.
const Five: Loadout = { arms: ['刀', '弓'], ways: ['水流', '火爆', '土固'] };
const nameOf = (item: Item): string => (item.sort.sort === 'arm' ? item.sort.weapon : item.sort.way);

{
  // 0. **The five.** Exactly two weapons and three ways, all different, all real.
  checkTrue('two weapons and three ways is a loadout', complete(Five));
  checkTrue('one weapon short is not', !complete({ arms: ['刀'], ways: Five.ways }));
  checkTrue('nor is the same weapon twice', !complete({ arms: ['刀', '刀'], ways: Five.ways }));
  checkTrue('nor four ways', !complete({ arms: Five.arms, ways: [...Five.ways, '金锐'] }));
  checkTrue('nor a way that does not exist', !complete({ arms: Five.arms, ways: ['水流', '火爆', '土裂' as never] }));
  checkTrue('a save holding one reads back', readLoadout(JSON.parse(JSON.stringify(Five))) !== null);
  checkTrue('and a mangled one reads back as nothing', readLoadout({ arms: '刀弓', ways: [] }) === null);
  // Picking past the limit lets go of the earliest pick rather than refusing.
  check('a third weapon lets go of the first', togglePick(['刀', '弓'], '剑', 2).join() === '弓,剑' ? 1 : 0, 1);
  check('and picking one again puts it down', togglePick(['刀', '弓'], '刀', 2).join() === '弓' ? 1 : 0, 1);
  const panel = new LoadoutPanel();
  panel.show(null);
  checkTrue('the dialog opens with nothing picked the first time', panel.choice === null);
  panel.show(Five);
  checkTrue('and on the last five after that', panel.choice !== null && complete(panel.choice));
}

{
  // 1. **A weapon while you have none**, and it is one of the two picked. Every time.
  let notWeapons = 0;
  for (let i = 0; i < 1000; i++) {
    const item = stock(new Pack(), Five, shopRandom, 0, 1);
    if (item.sort.sort !== 'arm' || !within(Five, item)) notWeapons++;
  }
  check('an empty-handed purchase is always one of the two weapons', notWeapons, 0);
  // And after that, any of the five and nothing else.
  const armed = new Pack();
  armed.accept(forge({ sort: 'arm', weapon: '弓' }, 1));
  const seen = new Set<string>();
  let outside = 0;
  for (let i = 0; i < 3000; i++) {
    const item = stock(armed, Five, shopRandom, 0, 1);
    seen.add(nameOf(item));
    if (!within(Five, item)) outside++;
  }
  check('and once armed, every one of the five turns up', seen.size, 5);
  check('and nothing outside them', outside, 0);
}

{
  // 2. **A duplicate is a second item**, which is the rule the whole merge system rests on.
  const bag = new Pack();
  bag.accept(forge({ sort: 'arm', weapon: '弓' }, 1));
  bag.accept(forge({ sort: 'arm', weapon: '弓' }, 1));
  check('the same weapon twice is two weapons', bag.arms.length, 2);
  checkTrue('both of them 弓', bag.arms.every((a) => a.weapon === '弓'));

  // **Weapons are counted, ways are summed.** They are different kinds of thing: one acts, the
  // other says how hard. Backwards, and a second 火爆 becomes a second explosion.
  bag.accept(forge({ sort: 'way', way: '火爆' }, 2));
  check('a way arrives at the grade it was bought at', bag.ways[0].depth, 2);
  bag.accept(forge({ sort: 'way', way: '火爆' }, 2));
  check('and a second one sums rather than counting', bag.ways[0].depth, 4);
  check('still one way, not two', bag.ways.length, 1);
}

{
  // 3. Summed depth stops at the ceiling rather than running past it, because `swing` and `span`
  //    clamp there — and a number the engine clamps is a number the bar must not promise.
  const bag = new Pack();
  for (let i = 0; i < Slots; i++) bag.accept(forge({ sort: 'way', way: '水寒' }, Tiers));
  check('a stack of ways stops at the ceiling', bag.ways[0].depth, MaxDepth);
}

{
  // 4. **No stash.** Six slots, and the seventh thing is refused rather than put somewhere else.
  const bag = new Pack();
  for (let i = 0; i < Slots; i++) bag.accept(forge({ sort: 'arm', weapon: '弓' }, 1));
  check('six slots fill', bag.wornCount, Slots);
  checkTrue('and then it is full', bag.full);
  checkTrue('and the seventh has nowhere to go', !bag.accept(forge({ sort: 'arm', weapon: '弓' }, 1)));
  check('so nothing was carried that is not on the bar', bag.wornCount, Slots);

  // Growing adds empty slots, and never takes one away — a slot that vanished with something in
  // it would be a purchase quietly confiscated.
  bag.grow(Slots + 1);
  checkTrue('a grown bar has room again', !bag.full && bag.size === Slots + 1);
  bag.grow(Slots - 2);
  check('and asking it to shrink does nothing', bag.size, Slots + 1);
}

{
  // 5. **The purse.** What things cost, and what the bar grows to.
  check('the first purchase costs ten', price(0), FirstPrice);
  let steady = true;
  for (let n = 1; n < 40; n++) {
    if (price(n) < price(n - 1)) steady = false;
    if (Math.abs(price(n) / price(n - 1) - PriceGrowth) > 0.12) steady = false;
  }
  checkTrue('and each one after it is about 18% dearer', steady);
  check('six slots to begin with', slotsAfter(0), Slots);
  check('still six after four purchases', slotsAfter(BuysPerSlot - 1), Slots);
  check('seven after five', slotsAfter(BuysPerSlot), Slots + 1);
  check('and never more than twelve', slotsAfter(10_000), MostSlots);
  check('which takes thirty purchases', slotsAfter((MostSlots - Slots) * BuysPerSlot), MostSlots);

  // The opening purse buys what the opening draft used to deal — four things — at every realm the
  // trial is open at. The level does not begin until something swings, so the first of them is
  // what makes it possible to begin at all.
  let cannotStart = 0;
  for (let realm = 1; realm <= Ascended; realm++) if (startingSilver(realm) < costOf(OpeningBuys)) cannotStart++;
  check('every realm walks in able to buy the opening four', cannotStart, 0);
  checkTrue('and a higher realm walks in with more', startingSilver(Ascended - 1) > startingSilver(1));

  // What one kill is worth, by rank — the three numbers TOWER.md set.
  check('a common drops one', RANKS.common.silver, 1);
  check('an elite twelve', RANKS.elite.silver, 12);
  check('a boss sixty', RANKS.boss.silver, 60);
}

{
  // 6. **Buying.** Spend, stock, stow, and refuse for the two reasons there are.
  const bag = new Pack();
  const purse = new Purse();
  purse.start(1);
  const opening = purse.silver;
  const first = purse.buy(bag, Five, shopRandom, 0, 1);
  checkTrue('the opening silver buys something', first !== null);
  check('and it costs what the button said', opening - purse.silver, FirstPrice);
  checkTrue('it is on the bar', bag.wornCount === 1 && first !== null && bag.find(first.id) !== null);
  checkTrue('and it is a weapon', !bag.unarmed);

  while (purse.silver >= purse.price) purse.buy(bag, Five, shopRandom, 0, 1);
  check('the opening purse buys the opening four', purse.bought, OpeningBuys);
  const poor = purse.silver;
  checkTrue('and with too little, the purchase is refused', purse.buy(bag, Five, shopRandom, 0, 1) === null);
  check('and nothing is taken for it', purse.silver, poor);

  purse.earn(100_000);
  while (!bag.full) purse.buy(bag, Five, shopRandom, 0, 1);
  const rich = purse.silver;
  const bought = purse.bought;
  checkTrue('a full bar refuses however rich you are', !purse.canBuy(bag) && purse.buy(bag, Five, shopRandom, 0, 1) === null);
  checkTrue('and keeps its silver and its count', purse.silver === rich && purse.bought === bought);
  check('the bar grew as it was bought for', bag.size, slotsAfter(bought));
  checkTrue(`every slot filled: ${bag.wornCount} of ${bag.size}`, bag.wornCount === bag.size);
}

{
  // 7. **品质 climbs with the level.** Otherwise the top half of the ladder is decoration: merging
  //    alone needs thirty-two 浅绿 to reach 彩.
  const early: number[] = [];
  const late: number[] = [];
  for (let i = 0; i < 400; i++) {
    early.push(dropTier(0.05, 0, shopRandom));
    late.push(dropTier(0.95, 0, shopRandom));
  }
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  check('the first purchases of a level are all the lowest grade', Math.max(...early), 1);
  checkTrue(
    `and the last are far better (${mean(late).toFixed(1)} against ${mean(early).toFixed(1)})`,
    mean(late) > mean(early) + 2,
  );
  checkTrue('without ever exceeding the ladder', Math.max(...late) <= Tiers);

  // And the realm lifts the whole thing, which is most of what a realm buys in here now.
  const low = mean(Array.from({ length: 400 }, () => dropTier(0.5, 0, shopRandom)));
  const high = mean(Array.from({ length: 400 }, () => dropTier(0.5, Ascended - 1, shopRandom)));
  checkTrue(
    `大乘 is dealt better than 筑基 at the same moment (${high.toFixed(1)} against ${low.toFixed(1)})`,
    high > low,
  );
}

{
  // 8. **Merging.** Any two of a grade, one step up. The same thing stays itself; two different
  //    things roll one of the five.
  const a = forge({ sort: 'arm', weapon: '刀' }, 2);
  const b = forge({ sort: 'arm', weapon: '刀' }, 2);
  const c = forge({ sort: 'arm', weapon: '刀' }, 3);
  const d = forge({ sort: 'way', way: '火爆' }, 2);
  checkTrue('two of the same thing at the same grade merge', canMerge(a, b));
  const same = mergeOf(a, b, Five, shopRandom, true);
  checkTrue('into that thing, one grade higher', same !== null && nameOf(same) === '刀' && same.tier === 3);
  checkTrue('different grades do not', !canMerge(a, c));
  checkTrue('different things at the same grade do', canMerge(a, d));
  checkTrue('nor does an item with itself', !canMerge(a, a));
  checkTrue(
    'and the top of the ladder has nowhere to go',
    !canMerge(forge({ sort: 'arm', weapon: '刀' }, Tiers), forge({ sort: 'arm', weapon: '刀' }, Tiers)),
  );

  // Two different things: a grade up, one of the five, and over enough rolls every one of them.
  const rolled = new Set<string>();
  let wrong = 0;
  for (let i = 0; i < 2000; i++) {
    const into = mergeOf(a, d, Five, shopRandom, true);
    if (!into || into.tier !== 3 || !within(Five, into)) wrong++;
    else rolled.add(nameOf(into));
  }
  check('two different things become one of the five, a grade up, every time', wrong, 0);
  check('and any of the five', rolled.size, 5);

  // **Never unarmed by a merge.** A level holds still while nothing swings, so a merge that ate the
  // last weapon and rolled a way would freeze the fight with no way out but silver.
  let disarmed = 0;
  for (let i = 0; i < 2000; i++) {
    const bag = new Pack();
    const blade = forge({ sort: 'arm', weapon: '刀' }, 1);
    const fire = forge({ sort: 'way', way: '火爆' }, 1);
    bag.accept(blade);
    bag.accept(fire);
    bag.accept(forge({ sort: 'way', way: '水流' }, 2));
    fuseOnBar(bag, fire, blade, Five, shopRandom);
    if (bag.unarmed) disarmed++;
  }
  check('merging away the only weapon always gives a weapon back', disarmed, 0);
  // While another weapon is carried, the roll is the whole five again.
  const free = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const bag = new Pack();
    const blade = forge({ sort: 'arm', weapon: '刀' }, 1);
    const fire = forge({ sort: 'way', way: '火爆' }, 1);
    bag.accept(forge({ sort: 'arm', weapon: '弓' }, 2));
    bag.accept(blade);
    bag.accept(fire);
    const into = fuseOnBar(bag, fire, blade, Five, shopRandom);
    if (into) free.add(into.sort.sort);
  }
  checkTrue('and with another weapon in hand it can roll a way', free.has('way'));

  // **The merge buys a slot and costs weight.** Two 蓝刀 worn are two sabres; the 黄刀 they make
  // is one. That trade is the whole decision, so it is asserted rather than assumed.
  const bag = new Pack();
  const x = forge({ sort: 'arm', weapon: '刀' }, 2);
  const y = forge({ sort: 'arm', weapon: '刀' }, 2);
  bag.accept(forge({ sort: 'way', way: '火爆' }, 1));
  bag.accept(x);
  bag.accept(y);
  check('two worn sabres are two weapons', bag.arms.length, 2);
  const into = fuseOnBar(bag, y, x, Five, shopRandom);
  checkTrue('they can be fused', into !== null);
  check('leaving one weapon', bag.arms.length, 1);
  check('a grade higher', bag.arms[0].depth, 3);
  check('in the slot the hand ended on', bag.slotOf(into?.id ?? -1), 2);
  checkTrue('and the other slot free', bag.worn[1] === null && bag.wornCount === 2);
}

{
  // 9. Every pair it could fuse, each item in at most one of them.
  const bag = new Pack();
  for (let i = 0; i < 3; i++) bag.accept(forge({ sort: 'arm', weapon: '刀' }, 2));
  bag.accept(forge({ sort: 'way', way: '火爆' }, 1));
  const pairs = bag.pairs();
  check('three of a kind is one pair, not three', pairs.length, 1);
  const named = new Set(pairs.flatMap((p) => [p.a.id, p.b.id]));
  check('and no item appears twice across the pairs', named.size, pairs.length * 2);
  // Loosely, the odd 刀 pairs with nothing — the 火爆 is a grade below it.
  check('loose pairs still need the same grade', bag.pairs(true).length, 1);
  bag.accept(forge({ sort: 'way', way: '水流' }, 2));
  check('and find the odd one a partner once there is one', bag.pairs(true).length, 2);
}

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

// Everything is in play before a level ends, at every level — a breed nobody meets is content that
// does not exist.
let allArrive = true;
for (let level = 1; level <= TopLevel; level++) {
  for (const breed of BREEDS) {
    if (weightAt(breed, schedule(level, 1)) <= 0) allArrive = false;
  }
}
checkTrue('every breed is in play by the end of a level, at every level', allArrive);

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

const availableAt = (level: number, t: number) =>
  BREEDS.filter((b) => weightAt(b, schedule(level, t)) > 0).length;
checkTrue('a tenth of the way in, most of the roster is still unseen', availableAt(1, 0.1) <= 2);
check('by the end, all of it', availableAt(1, 1), 6);

// A high level reads the same schedule faster rather than having a different one.
checkTrue('the top of the tower is further along the roster at the same moment', schedule(TopLevel, 0.3) > schedule(1, 0.3));
checkTrue('and has met everything by wave four', availableAt(TopLevel, 0.38) === 6);
checkTrue('where level one is still two breeds short', availableAt(1, 0.38) <= 4);

// Nothing arrives before it is due, however the dice fall.
//
// On a seed of its own. It used to borrow one declared up in the draft checks, which went
// with them — and a shared generator also means adding an assertion anywhere above silently
// changes what this one rolls.
let seed = 20260922;
const rng = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
let early = 0;
for (let i = 0; i < 5000; i++) {
  const breed = rollBreed(schedule(1, 0.1), rng);
  if (breed.from > schedule(1, 0.1)) early++;
}
check('nothing arrives ahead of its schedule', early, 0);

// Speed rises too, and only a little: it is the cheapest difficulty curve there is, and making the
// same fight faster is not the same as making it a different fight.
check('everything closes at its own pace to begin with', pacing(0), 1);
check('and a quarter faster by the end', pacing(1), 1.25);
check('clamped past the end', pacing(4), 1.25);

// ---------------------------------------------------------------------------------------------
// The AFK guard, now that a build is bought rather than drafted.
//
// The history matters, because it was rebuilt five times. The first two compared columns of the
// realm ladder and passed while a real run, fought frame by frame, finished at full health with
// the body never moving. The third fought a whole run, which caught that — and then four drafted
// slots turned out to kill five to eight times what one talisman had, and chasing that with the
// door took two thousand arrivals in ninety seconds. What finally held was structural: **the
// draft paused the run until four cards were taken**, so walking away earned nothing whatever the
// build.
//
// The draft is gone and that guarantee is kept in a different place: **nothing arrives until
// something that swings is carried** (`Trial.update`). A level opened and walked away from has
// not started. That is the first assertion below, and the load-bearing one.
//
// What is left to tune is the case in between: somebody who buys a weapon to start the level and
// then never touches the bar again. Past the bottom of the tower, that has to lose — otherwise the
// bar is decoration. Stage six of TOWER.md restates it for merging (a build that never merges does
// not get past wave ten); this is the version a meter-free, merge-light build can be held to now.

// Pinned for the whole block. Arrivals pick their edge with `Math.random`, and so do half a dozen
// flourishes inside the attacks, so an unpinned level is a different fight every time — which for
// an assertion on a balance line is a check that fails one time in five.
//
// Its own stream rather than the shared `rng`: these fights are long and every draw moves them, so
// a shared stream means adding an assertion anywhere above silently changes a balance guard.
let fightSeed = 990722;
const fightRandom = () => {
  fightSeed = (fightSeed * 1103515245 + 12345) & 0x7fffffff;
  return fightSeed / 0x7fffffff;
};
const wildRandom = Math.random;
Math.random = fightRandom;

/**
 * How the bar is worked.
 *
 * - **neglect**: buys the one weapon the level will not start without, and never touches the bar
 *   again. Silver piles up unspent.
 * - **buyer**: buys whenever it can afford to and there is room. Never merges, so the bar fills
 *   and stays full.
 * - **player**: buys whenever it can, and when the bar is full with silver still to spend, merges a
 *   pair to make room — which is the behaviour the whole shape is meant to force.
 */
type Hand = 'neglect' | 'buyer' | 'player';

interface Standing {
  outcome: string;
  /** The wave it ended on, counted from 1. */
  wave: number;
  kills: number;
  seconds: number;
  integrity: number;
  bought: number;
  merges: number;
  /** Seconds in when the bar was first full with the next purchase affordable, or -1. */
  forcedAt: number;
  /** Times anything outside the level's five was bought, made or carried. Has to be zero. */
  strays: number;
  /** Fight seconds when the last of the ten waves was out, or -1 if the level ended first. */
  outAt: number;
  paid: number;
}

/**
 * One whole level, fought frame by frame, with the body standing in the middle as it does now.
 *
 * `kit`, when given, is carried from the start instead of the opening purchases — a fixed build,
 * for the questions that are about the door rather than about the shop's dice.
 */
function fight(level: number, hand: Hand, kit?: Item[], five: Loadout = Five, realm = 1): Standing {
  const arena = { width: 1200, height: 800 };
  const trial = new Trial();
  const bag = new Pack();
  const purse = new Purse();
  const arts = new Attacks();
  trial.start(level);
  purse.start(realm);
  arts.reset();
  const rearm = (): void => arts.equip(bag.arms, bag.ways);
  for (const item of kit ?? []) bag.accept(item);
  rearm();

  const body = { x: arena.width / 2, y: arena.height / 2, radius: 46 };
  let seconds = 0;
  let banked = 0;
  let merges = 0;
  let forcedAt = -1;
  let strays = 0;
  let outAt = -1;
  const dt = 1 / 60;
  while (trial.outcome === 'running' && seconds < 900) {
    purse.earn(trial.silver - banked);
    banked = trial.silver;

    const shopping = hand !== 'neglect' || bag.unarmed;
    while (shopping && purse.canBuy(bag)) {
      const item = purse.buy(bag, five, fightRandom, trial.through, realm);
      if (item && !within(five, item)) strays++;
      rearm();
    }
    if (bag.full && purse.silver >= purse.price && forcedAt < 0) forcedAt = seconds;
    if (hand === 'player' && bag.full && purse.silver >= purse.price) {
      // Only when the merge is what stands between it and the next purchase — the situation the
      // whole shape is built to force. A known merge if there is one, a rolled one if not.
      const pair = bag.pairs()[0] ?? bag.pairs(true)[0];
      const into = pair ? fuseOnBar(bag, pair.b, pair.a, five, fightRandom) : null;
      if (into) {
        merges++;
        if (!within(five, into)) strays++;
        rearm();
      }
    }
    for (const slot of bag.worn) if (slot && !kit && !within(five, slot)) strays++;

    trial.update(dt, body, arena.width, arena.height, arts);
    arts.update(dt, body, trial);
    if (outAt < 0 && trial.allOut) outAt = trial.seconds;
    seconds += dt;
  }
  return {
    outcome: trial.outcome,
    wave: trial.wave + 1,
    kills: trial.killCount,
    seconds: Math.round(seconds * 10) / 10,
    integrity: Math.round(trial.integrity * 100) / 100,
    bought: purse.bought,
    merges,
    forcedAt: Math.round(forcedAt * 10) / 10,
    strays,
    outAt: Math.round(outAt * 10) / 10,
    paid: Math.round(harvest(trial.through, trial.outcome)),
  };
}

const say = (at: number, hand: string, s: Standing) =>
  console.log(
    `NOTE  level ${at}, ${hand}: ${s.outcome} on wave ${s.wave} at ${s.seconds}s (all out at ${s.outAt}s), ${s.kills} killed, ${s.bought} bought, ${s.merges} merged, full at ${s.forcedAt}s, integrity ${s.integrity}, paid ${s.paid}${s.strays ? `, ${s.strays} STRAYS` : ''}`,
  );

// 1. The structural half. Open a level and buy nothing: it does not start.
{
  const idle = new Trial();
  const empty = new Attacks();
  idle.start(TopLevel);
  empty.reset();
  const body = { x: 600, y: 400, radius: 46 };
  for (let i = 0; i < 60 * 60; i++) {
    idle.update(1 / 60, body, 1200, 800, empty);
    empty.update(1 / 60, body, idle);
  }
  checkTrue('a level nobody has bought a weapon for has nothing in it after a minute', idle.targets().length === 0);
  check('so it has gone nowhere', idle.through, 0);
  check('and is worth nothing', harvest(idle.through, idle.outcome), 0);
  empty.equip([{ weapon: '弓', depth: 1 }], []);
  for (let i = 0; i < 60 * 3; i++) idle.update(1 / 60, body, 1200, 800, empty);
  checkTrue('and the first weapon is what starts it', idle.targets().length > 0);
}

// Every fight below has to end — cleared or overwhelmed — inside the harness's fifteen minutes. A
// wave is over only when all of it is dead, so a 邪气 that cannot be reached or cannot be kept on
// the screen is a level that never ends; this has caught that three times.
const fought: Standing[] = [];
const run = (level: number, hand: Hand, kit?: Item[]): Standing => {
  const s = fight(level, hand, kit);
  fought.push(s);
  say(level, kit ? `${hand}, fixed build` : hand, s);
  return s;
};

// 2. Neglect, and the door. One fixed build — 弓 with 金锐水流火爆, every one at 浅绿, the
//    strongest four-piece measured — carried and never added to. Fixed, because both questions
//    here are about the levels, and a build the shop rolled would make them about the dice: the
//    same hand on the same level cleared it one time and fell on wave two the next.
//
//    From level 50 up it has to lose; otherwise the bar is decoration. And it clears level 1 but
//    falls well short of the boss at 50, which is what "level 50 is clearly harder" means.
//
//    This line was at 25 until the 重煞 boss stopped being four times every other boss. That boss
//    was the whole wall at 25; without it the reference build gets through with a quarter of its
//    护体 left. Where between 25 and 50 an untouched build ought to stop is stage six's question.
const Reference = (): Item[] => [
  forge({ sort: 'arm', weapon: '弓' }, 1),
  forge({ sort: 'way', way: '金锐' }, 1),
  forge({ sort: 'way', way: '水流' }, 1),
  forge({ sort: 'way', way: '火爆' }, 1),
];
const fixed = new Map<number, Standing>();
for (const level of [1, 10, 25, 50, TopLevel]) fixed.set(level, run(level, 'neglect', Reference()));
check(
  'a build nobody adds to clears nothing from level 50 up',
  [50, TopLevel].filter((level) => fixed.get(level)?.outcome === 'cleared').length,
  0,
);
checkTrue('the same build clears level 1', fixed.get(1)?.outcome === 'cleared');
checkTrue(
  `and level 50 is clearly harder: it falls on wave ${fixed.get(50)?.wave}`,
  fixed.get(50)?.outcome === 'overwhelmed' && (fixed.get(50)?.wave ?? 99) <= 7,
);
// The opening four from the shop and then nothing, reported: whatever the dice dealt.
for (const level of [1, 10, 25]) run(level, 'neglect');

// 3. The landing standard for 银币与购买: inside one level, buying fills the bar and leaves you with
//    silver you cannot spend — the state in which the only thing left to do is merge.
//
//    Three of each rather than one. The shop is dice, and one level-one fight on one seed is the
//    dice as much as the curve.
const atOne = [0, 1, 2].map(() => run(1, 'player'));
// Over the fights that got through. One that falls on wave five never lived long enough to fill
// anything, and what it says is about level one's difficulty, which is asserted just below.
const through = atOne.filter((r) => r.outcome === 'cleared');
checkTrue(
  `every level-1 fight that is played through fills the bar with silver still to spend: at ${through.map((r) => r.forcedAt).join('s, ')}s`,
  through.length > 0 && through.every((r) => r.forcedAt >= 0),
);
checkTrue(
  `level 1 is cleared by somebody who keeps buying: ${atOne.filter((r) => r.outcome === 'cleared').length} of 3`,
  atOne.filter((r) => r.outcome === 'cleared').length >= 2,
);
// And now that two different things merge, a full bar always has a merge in it — which is what
// "forced to merge" was waiting on. With all fifteen in the shop it was mostly not there to make.
checkTrue(
  `and the full bar is merged, every time: ${through.map((r) => r.merges).join(', ')} merges`,
  through.every((r) => r.merges > 0),
);
for (const level of [50]) run(level, 'player');
// Buying without merging, reported. With all fifteen kinds in the shop two of the same kind at
// the same grade rarely meet, so the merge that a full bar forces is mostly not there to make —
// stage four narrows the shop to five kinds and lets two different things merge, which is when
// "player" and "buyer" are supposed to come apart.
for (const level of [10, 25]) run(level, 'buyer');
for (const level of [10, 25]) run(level, 'player');

// Other fives, so the scope check below is not about one loadout.
const Others: Loadout[] = [
  { arms: ['剑', '符'], ways: ['金鸣', '木缠', '水寒'] },
  { arms: ['盾', '刀'], ways: ['木荣', '火燎', '土崩'] },
];
for (const five of Others) {
  const s = fight(10, 'player', undefined, five);
  fought.push(s);
  say(10, `player with ${five.arms.join('')} ${five.ways.join(' ')}`, s);
}

// 4. The landing standard for 开局选定: **nothing outside the five, ever, in a whole level** —
//    bought, rolled out of a merge, or sitting on the bar.
check(
  "nothing outside a level's five was bought, merged into being or carried, in any level fought here",
  fought.reduce((sum, f) => sum + f.strays, 0),
  0,
);

check('every level fought here ended, one way or the other', fought.filter((f) => f.outcome === 'running').length, 0);
// And in every one that lasted that long, the last wave was out inside the timetable. There is no
// bound on how long a level *lasts* — that is up to how fast the field is cleared, and a level
// only ends cleared or lost — but the 邪气 stop coming at three minutes, whatever is happening.
const latest = Math.max(...fought.map((f) => f.outAt));
checkTrue(`and all ten waves were out by ${SpawnSeconds}s in every level: the latest at ${latest}s`, latest <= SpawnSeconds + 0.1);

Math.random = wildRandom;


// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// 演武场. A bench, and whether the number on it means anything.
//
// The yard had no assertions at all until now, which is how it kept a `centre()` that averaged the
// posts' own positions — exact for closed rings around the body, and most of the way out to the
// arc itself for an arc.

{
  const yard = new Dummies();
  yard.place(500, 400);
  check('four posts', yard.count, PostCount);

  // **All at the same distance.** The bench compares one build against another, so no part of the
  // answer may be about which post happened to be nearer.
  let nearest = Infinity;
  let furthest = 0;
  let behind = 0;
  for (const post of yard.targets()) {
    const away = Math.hypot(post.x - 500, post.y - 400);
    nearest = Math.min(nearest, away);
    furthest = Math.max(furthest, away);
    if (post.y <= 400) behind++;
  }
  check('all of them exactly the same distance out', furthest - nearest, 0, 1e-9);
  check('at the range the arc is drawn at', nearest, YardRange, 1e-9);
  check('and every one of them in front of the body', behind, 0);
  checkTrue('spread wide enough to be four targets rather than one', YardSpread > 1);

  // **Every weapon can engage them**, which is the whole reason the range is the number it is. 盾
  // is the binding one by a long way: its 罡气 orbits at `span` and never touches anything outside
  // that orbit plus a node's own bite.
  const offOrbit = Math.abs(YardRange - span('盾', 1));
  checkTrue(
    `盾 reaches the arc at the first level (${offOrbit.toFixed(0)}px off an orbit of ${span('盾', 1).toFixed(0)}, against a bite of ${GuardBite + PostRadius})`,
    offOrbit <= GuardBite + PostRadius,
  );
  checkTrue(`刀 reaches it (${span('刀', 1)} against ${YardRange})`, span('刀', 1) >= YardRange);
  // And the inner ring this replaced did not, which is what makes the line above a fix rather than
  // a number that happens to work.
  checkTrue(
    'where the 150px ring it replaced was outside 盾 entirely',
    Math.abs(150 - span('盾', 1)) > GuardBite + PostRadius,
  );

  // **One pass counts once.** A 刀气 is within cutting distance of a post for this long and has no
  // cooldown of its own — only `bite`. If a struck post took hits again before the slash had gone
  // by, one cut would be counted three times and the bench would report triple.
  const brush = ((SlashWidth / 2 + PostRadius) * 2) / SlashSpeed;
  checkTrue(
    `a post stays numb longer than a 刀气 takes to cross it (${NumbSeconds}s against ${brush.toFixed(3)}s)`,
    NumbSeconds > brush,
  );

  // **And the ceiling is above anything a build does.** Four posts that each refuse hits for
  // `NumbSeconds` cannot report more than this however hard they are hit, which is why the readout
  // says when it is sitting on it.
  const ceiling = PostCount / NumbSeconds;
  checkTrue(`the bench can show at least 20 hits a second (${ceiling})`, ceiling >= 20);
}

{
  // The rate is over a window, not over the lifetime. A lifetime average keeps sinking while you
  // stand still reading it and barely moves when you swap a weapon, which is the opposite of what
  // a bench is for.
  const bench = new Dummies();
  bench.place(0, 0);
  for (let i = 0; i < 40; i++) {
    const post = bench.targets()[i % PostCount];
    bench.cull(post.x, post.y, 4, 1);
    bench.update(NumbSeconds + 1e-6);
  }
  checkTrue(`a bench being hit reads a rate (${bench.rate.toFixed(1)}/s)`, bench.rate > 0);
  for (let i = 0; i < 100; i++) bench.update(RateWindow / 20);
  check('and falls to zero once nothing is landing', bench.rate, 0);
}

{
  // Numb means it stops taking hits, not that it stops being a target: 剑 and 符 both steer at the
  // nearest one, and a post that blinked out of the list on every hit would send a 飞剑 wandering
  // between flurries — which is not what it does to a 邪气.
  const marked = new Dummies();
  marked.place(0, 0);
  const first = marked.targets()[0];
  check('a hit lands', marked.cull(first.x, first.y, 4, 1), 1);
  check('and the same blow does not land twice', marked.cull(first.x, first.y, 4, 1), 0);
  checkTrue(
    'but it is still standing there to be aimed at',
    marked.closest(first.x, first.y, 10) !== null,
  );
  check('and still in the target list', marked.targets().length, PostCount);
}

// ---------------------------------------------------------------------------------------------
// 道具图标. Fifteen marks, and whether each of them is actually a mark.
//
// The failure this exists for has happened twice in this repo already: 山崩 drew nothing in the
// 演武场 and the broken-ground ellipse was never visible at all, and in both cases every
// assertion passed because not one of them asked whether anything reached the screen.
//
// An icon that draws nothing looks exactly like an icon for a slot you have not filled yet, and
// one `switch` arm falling through to another looks exactly like two items that happen to be
// similar. So: every one of the fifteen has to put ink down, and no two may put down the *same*
// ink.

{
  /** Counts marks, and fingerprints the path that produced them. */
  const tracer = (): { context: CanvasRenderingContext2D; marks: () => number; trace: () => string } => {
    let marks = 0;
    const path: string[] = [];
    const gradient = { addColorStop: () => {} };
    const held: Record<string | symbol, unknown> = {
      globalAlpha: 1,
      lineWidth: 1,
      lineJoin: 'round',
      lineCap: 'round',
      globalCompositeOperation: 'source-over',
    };
    const shaping = ['moveTo', 'lineTo', 'arc', 'quadraticCurveTo', 'bezierCurveTo', 'roundRect', 'closePath'];
    const context = new Proxy(held, {
      get(obj, key) {
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'fill' || key === 'stroke') {
          return () => {
            marks++;
            path.push('!');
          };
        }
        if (typeof key === 'string' && shaping.includes(key)) {
          return (...args: number[]) => {
            // Rounded, so that a tweak of half a pixel does not make this a change-detector test.
            path.push(`${key}:${args.map((n) => Math.round(n)).join(',')}`);
          };
        }
        if (key in obj) return obj[key];
        return () => {};
      },
      set(obj, key, value) {
        obj[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { context, marks: () => marks, trace: () => path.join('|') };
  };

  const traces = new Map<string, string>();
  let silent = 0;

  for (const weapon of WEAPONS) {
    const pen = tracer();
    drawWeaponIcon(pen.context, weapon, 30, ARMS[weapon].tint);
    if (pen.marks() === 0) silent++;
    traces.set(`arm:${weapon}`, pen.trace());
  }
  for (const way of WAYS) {
    const pen = tracer();
    drawWayIcon(pen.context, way, 30, PATHS[way].tint);
    if (pen.marks() === 0) silent++;
    traces.set(`way:${way}`, pen.trace());
  }

  check('every one of the fifteen puts ink down', silent, 0);
  check('fifteen of them', traces.size, WEAPONS.length + WAYS.length);
  // Distinct shapes, not just distinct names. A `switch` arm that fell through to the next one
  // would leave two items drawing the same mark in two different colours, which at twenty-six
  // pixels is two items you cannot tell apart.
  check('and no two draw the same shape', new Set(traces.values()).size, traces.size);

  // The one that is easy to get wrong without noticing: a mark drawn outside the box it was
  // given, which in a 装备栏 slot means it laps over its neighbour.
  //
  // Measured per method rather than by scanning every number, because the numbers are not all
  // coordinates — `roundRect` carries a width and a height, `arc` carries a radius and two
  // angles, and a check that treated those as positions reported 符 as overflowing by its own
  // height. It failed loudly, which was lucky; the same shape of mistake in the other direction
  // is an assertion that passes and means nothing.
  const reach = (trace: string): number => {
    let far = 0;
    const see = (x: number, y: number): void => {
      far = Math.max(far, Math.abs(x), Math.abs(y));
    };
    for (const step of trace.split('|')) {
      const [name, packed] = step.split(':');
      if (!packed) continue;
      const a = packed.split(',').map(Number);
      if (name === 'moveTo' || name === 'lineTo') see(a[0], a[1]);
      else if (name === 'quadraticCurveTo') {
        see(a[0], a[1]);
        see(a[2], a[3]);
      } else if (name === 'bezierCurveTo') {
        see(a[0], a[1]);
        see(a[2], a[3]);
        see(a[4], a[5]);
      } else if (name === 'arc') {
        // Centre plus radius, which is the only honest bound without integrating the angles.
        see(a[0] + a[2], a[1] + a[2]);
        see(a[0] - a[2], a[1] - a[2]);
      } else if (name === 'roundRect') {
        see(a[0], a[1]);
        see(a[0] + a[2], a[1] + a[3]);
      }
    }
    return far;
  };

  let widest = 0;
  let widestName = '';
  for (const [name, trace] of traces) {
    const far = reach(trace);
    if (far > widest) {
      widest = far;
      widestName = name;
    }
  }
  // Half of 30, plus a pixel of stroke either side. An icon wider than its own box laps into the
  // slot beside it, and in a row of six that reads as one smeared item rather than as two.
  checkTrue(`every mark fits the box it was given (widest ${widestName} at ${widest})`, widest <= 16);
}

// 语言. Five dictionaries, and the ways a translation goes wrong quietly.
//
// TypeScript already forces the fixed-shape parts — `realms`, `schools`, `evolutions`, `breeds`
// are `Record`s over closed unions and a missing one will not compile. What it cannot check is the
// three things below, and all three produce a game that *runs* and reads wrong.

check('five locales', LOCALES.length, 5);

// 2. Nothing is blank. An empty string type-checks and draws as a gap on a card.
let blanks = 0;
const walk = (value: unknown, path: string): void => {
  if (typeof value === 'string') {
    if (value.trim().length === 0) blanks++;
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`);
  }
};
for (const tag of LOCALES) walk(DICTIONARIES[tag], tag);
check('no dictionary has a blank string in it', blanks, 0);

// 3. **The placeholders have to match**, and this is the one that actually bites. A line that says
//    `{kills}` in one language and `{kill}` in another draws the literal braces on screen, and it
//    only shows up on the day somebody plays in that language and finishes a run.
//
//    Walked rather than listed. The list this used to be was correct on the day it was written and
//    was already three patterns behind by the time anybody looked — a check that has to be edited
//    whenever a pattern is added is a check that silently stops covering the newest thing, which is
//    exactly the thing most likely to be wrong.
const holes = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).slice().sort();
const patterns = (value: unknown, path: string, into: Map<string, string>): void => {
  if (typeof value === 'string') {
    const found = holes(value);
    if (found.length > 0) into.set(path, found.join(','));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => patterns(item, `${path}[${i}]`, into));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) patterns(inner, `${path}.${key}`, into);
  }
};
const source = new Map<string, string>();
patterns(DICTIONARIES['zh-Hans'], '', source);
let mismatched: string[] = [];
for (const tag of LOCALES) {
  const theirs = new Map<string, string>();
  patterns(DICTIONARIES[tag], '', theirs);
  for (const [where, want] of source) {
    const got = theirs.get(where) ?? '(none)';
    if (got !== want) mismatched.push(`${where} in ${tag}: ${got} vs ${want}`);
  }
  for (const where of theirs.keys()) {
    if (!source.has(where)) mismatched.push(`${where} in ${tag}: a hole the source does not have`);
  }
}
check(`every pattern takes the same holes${mismatched.length ? ': ' + mismatched.join('; ') : ''}`, mismatched.length, 0);
checkTrue('and there are patterns to check', source.size > 10);

// Counts that are fixed by the game rather than by the language.
let wrongCounts = 0;
for (const tag of LOCALES) {
  const dict = DICTIONARIES[tag];
  if (dict.realms.length !== Ascended) wrongCounts++;
  if (dict.stages.length !== StagesPerRealm) wrongCounts++;
  if (dict.finds.length !== FINDS.length) wrongCounts++;
}
check('every dictionary has the right number of realms, stages and finds', wrongCounts, 0);

// Filling in.
check('a hole is filled', fill('{a}-{b}', { a: 1, b: 2 }) === '1-2' ? 1 : 0, 1);
check('an unknown hole is left alone', fill('{a}{z}', { a: 'x' }) === 'x{z}' ? 1 : 0, 1);

// What the system asks for, mapped onto the five. Chinese is the case that needs care: the script
// is what is being chosen, and the region is only evidence about it.
checkTrue('zh-TW is traditional', localeFor(['zh-TW']) === 'zh-Hant');
checkTrue('zh-HK is traditional', localeFor(['zh-HK']) === 'zh-Hant');
checkTrue('zh-Hant with no region is traditional', localeFor(['zh-Hant']) === 'zh-Hant');
checkTrue('zh-CN is simplified', localeFor(['zh-CN']) === 'zh-Hans');
checkTrue('bare zh is simplified', localeFor(['zh']) === 'zh-Hans');
checkTrue('ja-JP lands on Japanese', localeFor(['ja-JP']) === 'ja');
checkTrue('ko-KR lands on Korean', localeFor(['ko-KR']) === 'ko');
checkTrue('en-GB lands on English', localeFor(['en-GB']) === 'en');
// Anything nobody here speaks falls to English, not to the source: a reader who gets English can at
// least find the language menu.
checkTrue('an unsupported language falls to English', localeFor(['de-DE']) === 'en');
checkTrue('and the first understood tag wins', localeFor(['de-DE', 'ko-KR']) === 'ko');
checkTrue('an empty list still returns something', localeFor([]) === 'en');

checkTrue('a stored locale is recognised', isLocale('ja'));
checkTrue('and junk in the save is not', !isLocale('xx') && !isLocale(7) && !isLocale(null));

// -------------------------------------------------------------------------------------------------
// Script leaks.
//
// Four of the five dictionaries share a writing system and none of them share a *script*. A string
// copied out of the wrong one type-checks perfectly, reads almost right, and is simply wrong —
// 「修為將満」 in 日本語 is the traditional 將 where Japanese writes 将, and the only way anybody
// was ever going to notice is by reading all five columns side by side. So it is asserted instead.
//
// 简体中文 is the standard: it is the source text, and the other four are measured against it.

/** Simplified and traditional forms of the same character, for the two Chinese dictionaries. */
const CHINESE_VARIANTS = '练練,气氣,筑築,婴嬰,炼煉,虚虛,体體,飞飛,层層,剑劍,风風,药藥,发發,极極,灵靈,万萬,与與,断斷,尽盡,归歸,单單,边邊,关關,静靜,战戰,择擇,击擊,产產,当當,画畫,团團,图圖,压壓,医醫,乱亂,乐樂,虫蟲,烧燒,灯燈,炉爐,独獨,听聽,觉覺,丰豐,轻輕,辞辭,铁鐵,随隨,验驗,盐鹽,场場,过過,这這,个個,说說,读讀,转轉,传傳,续續,应應,对對,证證,变變,齐齊,旧舊,来來,两兩,会會,经經,实實,数數,点點,国國,学學,从從,稳穩,现現,样樣,让讓,识識,记記,设設,语語,种種,无無,还還,为為,处處,们們,门門,时時,长長,东東,纹紋,满滿,悪惡,广廣,总總,将將,装裝,欢歡,权權,观觀,岁歲,价價,儿兒,杂雜,担擔,绘繪,争爭,兽獸,宝寶'
  .split(',')
  .map((pair) => [pair[0], pair[1]] as const);

/**
 * Traditional forms that Japanese replaced with a 新字体.
 *
 * Separate from the list above because the answer is not the same: 為 and 虛 are traditional for
 * Chinese but perfectly ordinary Japanese, so a shared table would fire on every correct string.
 */
const SHINJITAI = '穩穏,將将,從従,學学,國国,會会,經経,實実,氣気,數数,點点,說説,讀読,轉転,傳伝,續続,應応,對対,證証,變変,體体,齊斉,舊旧,來来,兩両,萬万,與与,斷断,盡尽,歸帰,單単,發発,邊辺,關関,靜静,戰戦,擇択,擊撃,產産,當当,畫画,團団,圖図,壓圧,醫医,亂乱,樂楽,蟲虫,燒焼,燈灯,爐炉,獨独,聽聴,覺覚,豐豊,輕軽,辭辞,鐵鉄,隨随,驗験,鹽塩,劍剣,廣広,總総,裝装,歡歓,權権,觀観,歲歳,價価,兒児,雜雑,擔担,繪絵,爭争,獸獣,寶宝'
  .split(',')
  .map((pair) => [pair[0], pair[1]] as const);

const strings = (value: unknown, out: [string, string][], path: string): void => {
  if (typeof value === 'string') {
    out.push([path, value]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => strings(item, out, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) strings(inner, out, `${path}.${key}`);
  }
};

const said = (tag: (typeof LOCALES)[number]): [string, string][] => {
  const out: [string, string][] = [];
  strings(DICTIONARIES[tag], out, tag);
  return out;
};

let leaks: string[] = [];
for (const [where, text] of said('zh-Hans')) {
  for (const [simple, full] of CHINESE_VARIANTS) {
    if (text.includes(full) && full !== simple) leaks.push(`${where}: traditional ${full}`);
  }
}
for (const [where, text] of said('zh-Hant')) {
  for (const [simple, full] of CHINESE_VARIANTS) {
    if (text.includes(simple) && full !== simple) leaks.push(`${where}: simplified ${simple}`);
  }
}
for (const [where, text] of said('ja')) {
  for (const [old, now] of SHINJITAI) {
    if (text.includes(old)) leaks.push(`${where}: ${old} where Japanese writes ${now}`);
  }
}
check(`no dictionary is written in another one's script${leaks.length ? ': ' + leaks.join(', ') : ''}`, leaks.length, 0);

// 한국어 is written in Hangul — the vocabulary is 한자어, but 練氣 on screen would look like a
// textbook rather than a game. A Han character in this dictionary is a line somebody forgot to
// translate, and it is the one kind of leak that is completely unambiguous.
const Han = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
let hanInKorean: string[] = [];
for (const [where, text] of said('ko')) if (Han.test(text)) hanInKorean.push(where);
check(`한국어 carries no Han characters${hanInKorean.length ? ': ' + hanInKorean.join(', ') : ''}`, hanInKorean.length, 0);

// And English carries nothing CJK at all, for the same reason.
const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;
let cjkInEnglish: string[] = [];
for (const [where, text] of said('en')) if (CJK.test(text)) cjkInEnglish.push(where);
check(`English carries nothing CJK${cjkInEnglish.length ? ': ' + cjkInEnglish.join(', ') : ''}`, cjkInEnglish.length, 0);

// And the tables really were walked, rather than a typo in a path quietly checking nothing.
checkTrue('every dictionary was read', said('ko').length > 150);

// -------------------------------------------------------------------------------------------------
// Fitting words into a fixed box.
//
// The card is 186 pixels wide and was sized when every string in it was Chinese. Both of the bugs
// this section guards were invisible in the language the app was written in and unmissable in the
// other four, which is the whole reason the measurement is injected: these run under Node against
// a fake metric, so the breaks can be asserted without a canvas.

/**
 * How wide a string is, in ems, **over-estimated on purpose**.
 *
 * Measured off the real thing, in the shipping fonts, across all 1471 strings that ship: Han,
 * Hangul and kana are exactly 1.000 em, a space is 0.296 em, and Latin averages 0.603 em at 13px
 * regular and 0.639 em at 600 weight — but the *worst whole string* runs to 0.761 em a character
 * and the widest single glyph to 1.080 em.
 *
 * That spread is why **this is an approximation, and says so**. A per-character constant tight
 * enough not to cry wolf cannot also certify the last pixel, and one wide enough to certify it
 * rejects strings that fit. The numbers below sit a little above the average: enough to catch a
 * string that is *clearly* over its budget — which is the bug that actually happened, a title
 * 330 px wide in a 166 px card — and not enough to settle a string that is one pixel over. That
 * one needs a real canvas, and is checked by driving the app in a browser.
 *
 * The first version used 0.5 em for Latin, was therefore *optimistic*, and duly passed the title
 * that overflowed by a factor of two. Erring high is the point; erring high by a fifth was not.
 */
const LatinEm = 0.66;
const SpaceEm = 0.32;
const WideEm = 1.02;

const ems = (text: string): number => {
  let sum = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x3000 && code <= 0x30ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    sum += ch === ' ' ? SpaceEm : wide ? WideEm : LatinEm;
  }
  return sum;
};

/** The same, at a pixel size. */
const atSize =
  (size: number) =>
  (text: string): number =>
    ems(text) * size;

// The old name, kept for the rules below, which only care about relative widths.
const metric = (text: string): number => ems(text) * 16;

// 1. **A Latin word is never cut in half.** This is the bug that shipped: the old loop broke
//    between any two characters, so an English blurb read "…breath, an / d none of them miss".
const english = wrap('A charm every breath, and none of them miss', 160, metric);
const cut = english.filter((line, i) => i > 0 && !/^[A-Za-z]*\b/.test(line));
checkTrue('English wraps onto more than one line at that width', english.length > 1);
check(`no English line starts mid-word${cut.length ? ': ' + cut.join(' | ') : ''}`, cut.length, 0);
checkTrue(
  'and the words all survive the trip',
  english.join(' ') === 'A charm every breath, and none of them miss',
);

// 2. **Chinese still breaks between characters**, which is the behaviour the old code had right.
const chinese = wrap('\u4e00\u606f\u4e00\u7b26\uff0c\u4e14\u7bad\u7bad\u4e0d\u7a7a', 64, metric);
checkTrue('Chinese breaks between characters', chinese.length > 1);
checkTrue('and loses nothing doing it', chinese.join('') === '\u4e00\u606f\u4e00\u7b26\uff0c\u4e14\u7bad\u7bad\u4e0d\u7a7a');

// 3. 禁则: a line does not begin with the punctuation that closes the line before it.
const leading = wrap('\u4e00\u606f\u4e00\u7b26\uff0c\u4e14\u7bad\u7bad\u4e0d\u7a7a\u3002', 64, metric).filter((line) =>
  '\uff0c\u3002\u3001'.includes(line[0] ?? ''),
);
check('no line starts with closing punctuation', leading.length, 0);

// 4. Korean has spaces in it, so it breaks at them like English rather than like Chinese.
const korean = wrap('\uc228\ud560 \ub54c\ub9c8\ub2e4 \ubd80\uc801 \ud558\ub098', 90, metric);
checkTrue('Korean breaks at its spaces', korean.every((line) => !line.startsWith(' ')));
checkTrue('and keeps its words whole', korean.join(' ') === '\uc228\ud560 \ub54c\ub9c8\ub2e4 \ubd80\uc801 \ud558\ub098');

// 5. A word longer than the whole box is broken rather than allowed to hang out of it.
const long = wrap('Supercalifragilisticexpialidocious', 80, metric);
checkTrue('an over-long word is broken up', long.length > 1);
checkTrue('and every piece fits', long.every((line) => metric(line) <= 80));

// 6. **The title ladder.** Four Chinese characters keep the top size; the English evolution names
//    do not, and the point of walking down is that the language with no problem pays nothing.
const sizes = [27, 24, 21, 19, 17];
const at = (size: number, text: string): number => ems(text) * size;
const zhTitle = fit('\u4e07\u7b26\u9f50\u53d1', 166, sizes, 2, at);
check('Chinese keeps the full title size', zhTitle.size, 27);
check('on one line', zhTitle.lines.length, 1);

// The fake metric is kinder to English than Segoe UI is, so what is asserted is the property that
// has to hold under any metric: it lands inside the card, in at most two lines, by wrapping or by
// shrinking or by both. Pinning the size here would pin the fake.
const enTitle = fit('Ten Thousand Talismans', 166, sizes, 2, at);
checkTrue('English takes the room it needs', enTitle.lines.length > 1 || enTitle.size < 27);
checkTrue('never more than two lines', enTitle.lines.length <= 2);
checkTrue(
  'and every line is inside the card',
  enTitle.lines.every((line) => at(enTitle.size, line) <= 166),
);

// 7. **The whole layout budget, for every string that ships, in all five languages.**
//
//    Each of these has a hard ceiling in the drawing code — nothing here clips, and a string over
//    budget is silently cut off or drawn across its neighbour rather than visibly wrong. That is
//    the failure this replaces: it used to be found by opening a browser and looking.
//
//    The draft's cards had most of the budgets that used to be here — titles through a size
//    ladder, blurbs, the lines under them. They went with the cards.
const BubbleWidth = 260; // Bubble's MAX_WIDTH, 13px, five lines
const BuyRoom = ButtonWidth - 12; // the buy button, one line, with the widest price it will show

let overBudget: string[] = [];
const budget = (what: string, text: string, width: number, size: number, most: number): void => {
  const lines = wrap(text, width, atSize(size));
  if (lines.length > most) overBudget.push(`${what} needs ${lines.length} lines, has ${most}: ${text}`);
};

for (const tag of LOCALES) {
  const dict = DICTIONARIES[tag];

  // 选定: the title and headings across the panel, each name under its tile in two lines at
  // most, and the start button in half the width.
  const across = Pitch * 5;
  budget(`${tag} loadout title`, dict.loadout.title, across, 20, 1);
  budget(`${tag} loadout arms`, dict.loadout.arms, across, 12, 1);
  budget(`${tag} loadout ways`, dict.loadout.ways, across, 12, 1);
  budget(`${tag} loadout start`, dict.loadout.start, (across - 10) / 2 - 12, 14, 1);
  for (const k of WEAPONS) budget(`${tag} loadout name`, dict.arms[k].name, Pitch - 4, 12, 2);
  for (const k of WAYS) budget(`${tag} loadout name`, dict.ways[k].name, Pitch - 4, 12, 2);

  // The bar: the button and the silver over it, each with five digits in it.
  budget(`${tag} buy`, fill(dict.bar.buy, { price: '99999' }), BuyRoom, 13, 1);
  budget(`${tag} silver`, fill(dict.bar.silver, { silver: '99999' }), ButtonWidth, 12, 1);

  // The bubble: every announcement, every verdict, every result. Two paragraphs where the
  // announcement has a name above its blurb.
  const bubbles = [
    ...WEAPONS.map((k) => dict.arms[k].name),
    ...Object.values(dict.pet),
    ...Object.values(dict.trial),
  ];
  for (const text of bubbles) {
    let used = 0;
    for (const paragraph of text.split('\n')) used += wrap(paragraph, BubbleWidth, atSize(13)).length;
    if (used > 5) overBudget.push(`${tag} bubble needs ${used} lines, has 5: ${text.replace(/\n/g, ' / ')}`);
  }
}
check(`every string fits the box it is drawn in${overBudget.length ? ': ' + overBudget.join('; ') : ''}`, overBudget.length, 0);
checkTrue('and the budget really was walked', LOCALES.length * 9 * 14 > 600);

// -------------------------------------------------------------------------------------------------
// How the pet comes back.
//
// 敛息 is a feature about not interrupting anybody, so a return that reads as an entrance undoes
// it. Two versions were wrong before this one and both failures were in the *shape*, not the code:
// a mote shower that read as an arrival, then a rise-stop-sweep that read as a judder. What is
// asserted here is therefore the shape itself — a soft body forced through a gap — because that is
// the thing a later tidy-up is most likely to smooth away without noticing.

// A pet with gravity stands GROUND_MARGIN + radius above the bottom, which is where these numbers
// come from: a 46-radius body on an 800-tall stage rests at y = 742 with its feet 12 px up.
const stage = { width: 1200, height: 800 };
const standing = { x: 700, y: 800 - 12 - 46, radius: 46 };
const plan = planCrawl(standing, stage);
// Mirrors `RevealMs` in main.ts; the wait below is asserted in seconds, so it needs the duration.
const RevealSeconds = 3.6;

// **It comes from the floor**, because that is the edge it is nearest — the whole reading ("it
// climbs out from behind the taskbar") rests on this being true by default rather than chosen.
check('a grounded pet comes back from the bottom edge', nearestEdge(standing, stage) === 'bottom' ? 1 : 0, 1);
checkTrue(
  'and only travels far enough to have been hidden',
  crawlDistance('bottom', standing, stage) > 2 * standing.radius &&
    crawlDistance('bottom', standing, stage) < 3.3 * standing.radius,
);
const cornered = { x: 20, y: 800 - 12 - 46, radius: 46 };
check('a cornered pet comes from the side it is against', nearestEdge(cornered, stage) === 'left' ? 1 : 0, 1);
const adrift = { x: 600, y: 400, radius: 46 };
checkTrue('an adrift pet does not cross the desktop', crawlDistance(nearestEdge(adrift, stage), adrift, stage) <= 3.2 * 46 + 1e-9);

// It ends exactly where it belongs, with nothing offset and nothing squashed. A posture that lands
// at 0.98 leaves the body permanently slightly deformed.
const home = crawl(1, plan, standing);
checkTrue(
  'a return ends with the body exactly as it was',
  home.dx === 0 && home.dy === 0 && home.scaleX === 1 && home.scaleY === 1,
);
const nearlyHome = squeezeAt(0.999);
checkTrue(
  'and is already almost there a moment before',
  Math.abs(nearlyHome.along - 1) < 0.02 && Math.abs(nearlyHome.across - 1) < 0.02,
);

// It starts behind the edge, spread flat against the underside of it.
const hidden = crawl(0, plan, standing);
checkTrue('and starts below the floor', hidden.dy > 2 * standing.radius);
checkTrue('spread wide and flat under the edge', hidden.scaleY < 0.8 && hidden.scaleX > 1.2);
checkTrue('pivoting on the side facing the edge', hidden.anchorY === standing.y + standing.radius);

// **The funnel.** Partway through it must cross over: narrow across the gap and stretched along
// it. Without this crossover the body merely slides up, which is the version this replaced.
let reached = false;
for (let i = 0; i <= 1000; i++) {
  const k = squeezeAt(i / 1000);
  if (k.along > 1.12 && k.across < 0.9) reached = true;
}
checkTrue('it funnels — narrow across the gap, stretched along it', reached);

// **The charm goes first, alone.** The pet must still be completely out of sight when its own
// charm lands, or the throw and the emergence read as one cluttered event instead of two beats.
// Checked against the charm's own worst-case flight rather than against a number typed here, so
// that changing how hard a slip is thrown cannot silently put the two back on top of each other.
checkTrue(
  `the pet does not move until the charm has landed (${(HiddenUntil * RevealSeconds).toFixed(2)}s against ${LongestFlightSeconds.toFixed(2)}s of flight)`,
  HiddenUntil * RevealSeconds > LongestFlightSeconds,
);
let stirred = 0;
for (let i = 0; i <= 2000; i++) {
  if (emerged(i / 2000) > 0) {
    stirred = i / 2000;
    break;
  }
}
checkTrue(`and is flat behind the edge until then (first stirs at ${stirred.toFixed(2)})`, stirred >= HiddenUntil);

// **And the charm must not be wearing the pet's posture.** Two beats that are correctly *timed*
// still arrive as one if the second one's transform is applied to the first one as well — which is
// what happened: `crawl` was applied around the whole frame rather than around the body, so the
// charm that had already landed was dragged down behind the taskbar with the pet and rose back
// into view riding the same squeeze. Measured, asserted, and then composited back on top of each
// other.
//
// What makes that a real hazard rather than a typo is the size of the displacement: at the moment
// the charm lands, the crawl is still pushing anything drawn inside it **further than a charm is
// tall**, so a charm caught in it is not merely nudged — it is somewhere else entirely.
const landedAt = LongestFlightSeconds / RevealSeconds;
const whileStillHidden = crawl(landedAt, plan, standing);
checkTrue(
  `the crawl is still displacing by ${whileStillHidden.dy.toFixed(0)}px when the charm lands, against a ${SlipHeight}px slip`,
  whileStillHidden.dy > SlipHeight,
);
// Belt and braces on the direction: downward, i.e. behind the edge it is climbing out of. A crawl
// that displaced upward would hide the pet off the top of the screen instead.
checkTrue('and it is displacing away from the screen, not into it', whileStillHidden.dy > 0);

// **A head next.** Something is through, and then it stops — that nub sitting in the gap while the
// body works is what the rhythm is built on.
const head = emerged(0.3);
checkTrue(`a head gets out (${head.toFixed(2)})`, head > 0.1 && head < 0.25);
checkTrue('and then it stalls', emerged(0.4) - head < 0.05);

// **The wait.** A full second with the head out and nothing happening. This is the beat the whole
// sequence hangs off, and it is the first thing a later "this feels slow" edit would take out — so
// its length is asserted in fractions of the duration, against the duration itself.
let stillSteps = 0;
for (let i = 0; i < 2000; i++) {
  const a = emerged(i / 2000);
  const b = emerged((i + 1) / 2000);
  if (Math.abs(b - a) < 2e-4 && a > 0.1 && a < 0.3) stillSteps++;
}
const waitSeconds = (stillSteps / 2000) * RevealSeconds;
checkTrue(
  `it waits with its head out (${waitSeconds.toFixed(2)}s of ${RevealSeconds}s)`,
  waitSeconds > 0.8,
);

// **The pushes.** Sample the scale along the direction of travel and count how many times it peaks
// past 1. Each peak is an extension — the body driving a little more of itself through — and the
// count is pinned rather than merely required to be "several", so that a later edit that smooths
// the table into one long stretch fails here instead of quietly removing the rhythm.
const along: number[] = [];
for (let i = 0; i <= 2000; i++) along.push(squeezeAt(i / 2000).along);
const peaks: number[] = [];
const troughs: number[] = [];
for (let i = 1; i < along.length - 1; i++) {
  if (along[i] > along[i - 1] && along[i] >= along[i + 1] && along[i] > 1) peaks.push(i / 2000);
  if (along[i] < along[i - 1] && along[i] <= along[i + 1] && along[i] < 1) troughs.push(i / 2000);
}
// Four extensions: the head coming out, the two shoves that are not enough, and the one that is.
// Pinned as a count rather than "several" so that a later edit which smooths the table into one
// long stretch fails here instead of quietly removing the rhythm.
check(`it extends four times (at ${peaks.map((p) => p.toFixed(2)).join(', ')})`, peaks.length, 4);
// Three gathers between the four pushes, and then one more at the end — which is not a gather but
// the squat of landing. Counted together because they are the same measurement; named apart here
// so the four is not read as four efforts.
check(`gathering before each, then the landing squat (at ${troughs.map((t) => t.toFixed(2)).join(', ')})`, troughs.length, 4);

// **Every push gains ground.** This is the line between a muscle and a tremor: a body that
// deforms without advancing is vibrating. From each gather to the extension that follows it, the
// amount that is through must go up.
let wasted = 0;
for (const trough of troughs) {
  const next = peaks.find((peak) => peak > trough);
  if (next === undefined) continue;
  if (emerged(next) - emerged(trough) < 0.05) wasted++;
}
check('and none of them is wasted effort', wasted, 0);

// **The last one is the one that works.** Everything before it is insufficient on purpose.
//
// Measured between the keyframes those efforts actually span — gather to push, for each of the
// three. An earlier version of this check kept the sample points of a previous table and so
// compared two intervals that no longer contained the pushes; it passed, and it was measuring
// nothing. The numbers in the label are there to be read for that reason.
const shoveOne = emerged(0.71) - emerged(0.64);
const shoveTwo = emerged(0.83) - emerged(0.76);
const shoveFree = emerged(0.95) - emerged(0.89);
checkTrue(`the two shoves gain ground (${shoveOne.toFixed(2)}, ${shoveTwo.toFixed(2)})`, shoveOne > 0.1 && shoveTwo > 0.1);
checkTrue(
  `and the last one frees it (${shoveFree.toFixed(2)} against ${Math.max(shoveOne, shoveTwo).toFixed(2)})`,
  shoveFree > 2 * Math.max(shoveOne, shoveTwo),
);
checkTrue('with over half still stuck right up to then', emerged(0.89) < 0.6);

// **The hop.** What finally gets it through is a shove, not a slide, so it goes *past* where it
// belongs and drops back. The old assertions here demanded a curve that stopped exactly at 1 and
// correctly failed the moment the shove was added — so what is asserted now is the shape the shove
// actually has: up without ever sliding back, past home, then down onto it and no further.
let peak = 0;
let peakAt = 0;
for (let i = 0; i <= 2000; i++) {
  const value = emerged(i / 2000);
  if (value > peak) {
    peak = value;
    peakAt = i / 2000;
  }
}
checkTrue(`it overshoots home on the way out (${peak.toFixed(2)})`, peak > 1.05 && peak < 1.25);
checkTrue(`and only right at the end (t=${peakAt.toFixed(2)})`, peakAt > 0.88);

let slipped = false;
let highWater = 0;
for (let i = 0; i <= 2000; i++) {
  const t = i / 2000;
  if (t > peakAt) break;
  const value = emerged(t);
  if (value < highWater - 1e-12) slipped = true;
  highWater = Math.max(highWater, value);
}
checkTrue('never sliding back on the way', !slipped);

// And the drop back is a landing, not a bounce: after the peak it falls to home and stops there.
let dippedUnder = false;
for (let i = 0; i <= 2000; i++) {
  const t = i / 2000;
  if (t <= peakAt) continue;
  if (emerged(t) < 1 - 1e-9) dippedUnder = true;
}
checkTrue('and it lands on home rather than bouncing through it', !dippedUnder);
check('finishing exactly there', emerged(1), 1);

// **No sideways shake.** An earlier version swept laterally to suggest looking around and it read
// as a shake. Coming up from the floor, nothing moves sideways at all — every bit of the pulse is
// along the axis the work is being done on.
let sideways = 0;
for (let i = 0; i <= 1000; i++) sideways = Math.max(sideways, Math.abs(crawl(i / 1000, plan, standing).dx));
check('nothing moves sideways on the way up', sideways, 0);

// **The edge is decided once.** A wandering pet that drifts past the midpoint between two edges
// must not change which one it is emerging from halfway through emerging from it.
const wandered = { x: 40, y: standing.y, radius: 46 };
check('a pet that wanders keeps the edge it started from', crawl(0.3, plan, wandered).edge === 'bottom' ? 1 : 0, 1);
let wentBackwards = false;
let closest = Infinity;
for (let i = 0; i <= 400; i++) {
  const walking = { x: 700 - i, y: standing.y, radius: 46 };
  const dy = crawl(i / 400, plan, walking).dy;
  // Only while it is still below home. Past that it is airborne from the shove, and coming back
  // down to land is an increase in `dy` that is the landing rather than a retreat.
  if (dy > 0 && dy > closest + 1e-9) wentBackwards = true;
  closest = Math.min(closest, dy);
}
checkTrue('and never retreats behind the edge while walking out of it', !wentBackwards);

// -------------------------------------------------------------------------------------------------
// 见闻.
//
// A list, which §6 rejects three times over — so most of what is asserted here is the set of lines
// that make having one survivable, rather than the list itself working.

check('every feat id is distinct', new Set(FEAT_IDS).size, FEAT_IDS.length);

// **Ids are permanent.** They go into the save, so renaming one silently un-earns whatever somebody
// did. Pinned by name here so a rename has to be a deliberate act that updates this line too.
checkTrue(
  'the ids in the save are the ones this build writes',
  FEAT_IDS.includes('ascend') && FEAT_IDS.includes('trialUnhurt') && FEAT_IDS.includes('lieLow'),
);

// **The realm rungs borrow the realm's own name** rather than having a second copy in the feats
// table — so a realm renamed in one place cannot end up called something else in the other.
let strayFeats: string[] = [];
let namelessFeats: string[] = [];
for (const tag of LOCALES) {
  setLocale(tag);
  for (const id of FEAT_IDS) {
    if (featName(id).trim().length === 0) namelessFeats.push(`${tag} ${id}`);
    if (featBlurb(id).trim().length === 0) namelessFeats.push(`${tag} ${id} blurb`);
  }
  for (const id of Object.keys(DICTIONARIES[tag].feats)) {
    if (!(FEAT_IDS as readonly string[]).includes(id)) strayFeats.push(`${tag} ${id}`);
    if (id in REALM_FEATS) strayFeats.push(`${tag} ${id} duplicates a realm name`);
  }
}
setLocale('zh-Hans');
check(`every feat is named in every language${namelessFeats.length ? ': ' + namelessFeats.join(', ') : ''}`, namelessFeats.length, 0);
check(`and the table carries nothing spare${strayFeats.length ? ': ' + strayFeats.join(', ') : ''}`, strayFeats.length, 0);
checkTrue('a realm rung is named after its realm', featName('realm1') === DICTIONARIES['zh-Hans'].realms[1]);

// **Earning one is idempotent.** Callers fire these from the frame loop without checking first, so
// the second call has to be free and silent rather than a second announcement.
const record = new Feats();
checkTrue('the first time counts', record.mark('ascend'));
checkTrue('the second does not', !record.mark('ascend'));
check('and it is recorded once', record.done, 1);

// **A save from a newer build survives being opened by an older one.** Ids this build has never
// heard of are carried through rather than dropped, or downgrading once would erase them forever.
record.restore(['ascend', 'somethingFromTheFuture']);
checkTrue('unknown ids are kept', record.snapshot().includes('somethingFromTheFuture'));
check('but not counted', record.done, 1);
checkTrue('and known ones still read back', record.has('ascend'));

// The rung a breakthrough earns, at both ends of the ladder and past it.
checkTrue('筑基 earns the first rung', Feats.forRealm(1) === 'realm1');
checkTrue('大乘 earns the last', Feats.forRealm(7) === 'realm7');
checkTrue('and 练气 earns none', Feats.forRealm(0) === null);
checkTrue('nor does anything past the top', Feats.forRealm(Ascended + 1) === null);

// -------------------------------------------------------------------------------------------------
// 山崩 — the one move that moves 邪气 instead of killing them.
//
// It replaced a shell that ate contact, so two things that used to be free are now claims that have
// to be checked: that the warning is long enough to step out of, and that the throw is worth
// carrying a school for. Both are arithmetic over a real run, so both are here.

{
  // A frame-by-frame run of 土崩 on a bow, watching one eruption from the shot landing to the
  // last pillar. Driven through the real `Attacks`, not a model of it — the timings are spread
  // across four constants and a negative age, and a model would be checking my arithmetic twice.
  const pillars: { at: number; radius: number }[] = [];
  let shoves = 0;
  let culls = 0;
  const mark = { x: 760, y: 400 };

  const field: Battlefield = {
    targets: () => [mark, { x: 800, y: 420 }, { x: 740, y: 440 }],
    // A bow asks `closest` for somewhere to shoot. 山崩 used to pick its own ground out of
    // `targets`, so this stub answered null and nothing ever fired.
    closest: () => mark,
    cull: (x: number, y: number, radius: number, most: number) => {
      culls += most;
      // And it has to **connect**, or the arrow flies for ever and the way it carries never
      // settles. Only near the mark, so the eruption opens where it was aimed.
      return Math.hypot(x - mark.x, y - mark.y) <= radius + 18 ? 1 : 0;
    },
    shove: (x: number, y: number, _radius: number, _speed: number) => {
      shoves++;
      pillars.push({ at: clock, radius: Math.hypot(x - mark.x, y - mark.y) });
    },
    root: () => {},
    burn: () => {},
    mend: () => {},
  };

  const kit = new Attacks();
  kit.equip([{ weapon: '弓', depth: 1 }], [{ way: '土崩', depth: 1 }]);
  let clock = 0;
  const dt = 1 / 120;
  for (let i = 0; i < 120 * 7; i++) {
    kit.update(dt, { x: 600, y: 400, radius: 46 }, field);
    clock += dt;
  }

  checkTrue(`the ground opens: ${shoves} pillars over seven seconds`, shoves > 0);
  // Every pillar throws, and every pillar also tries to kill — but for almost nothing.
  // 土崩's own damage, which is almost nothing — what it is for is the throw.
  check('a pillar hits for one', PATHS['土崩'].on === 'quake' ? 1 : 0, 1);
  checkTrue(
    `and less than the weapon that carries it: 1 against ${ARMS['刀'].bite}`,
    1 <= ARMS['刀'].bite,
  );

  // From the inside out. The first pillar of an eruption is at the middle; later ones are further.
  const firstWave = pillars.filter((p) => p.at < pillars[0].at + 0.05);
  const lastWave = pillars.filter((p) => p.at > pillars[pillars.length - 1].at - 0.05);
  const near = Math.min(...firstWave.map((p) => p.radius));
  const far = Math.max(...lastWave.map((p) => p.radius));
  checkTrue(`it opens outward: first band at ${near.toFixed(0)}px, last at ${far.toFixed(0)}px`, far > near);
}

// The warning. Half a second between the stone landing and the first pillar — against 邪气 closing
// at 106 px/s at 大乘, that is about fifty pixels of ground, which is what makes the mark a place
// you can leave and they cannot.
check('the ground is marked for half a second before it opens', QuakeTell, 0.5);
checkTrue(
  `which the fastest 邪气 covers ${(106 * QuakeTell).toFixed(0)}px of — under half the blast`,
  106 * QuakeTell < 128 / 2,
);

{
  // The throw, through a whole trial.
  //
  // **On its own seed.** The first version of this read the shared `Math.random` and failed three
  // runs in five — not because the throw did not work, but because 邪气 outside the ring walk into
  // it during the window and four or five of them is small enough for one to decide the answer.
  // A guard that fails at random teaches everybody to re-run it, which is worse than not having it.
  //
  // Measured as how many are inside a circle, not as where one of them went: `targets` hands out
  // bare points with no identity, so following "whichever is nearest to where that one was last
  // frame" hops onto a different 邪气 the moment two cross, and duly reported one being thrown
  // *towards* the body.
  let shoveSeed = 20261009;
  const loaded = Math.random;
  Math.random = () => {
    shoveSeed = (shoveSeed * 1103515245 + 12345) & 0x7fffffff;
    return shoveSeed / 0x7fffffff;
  };

  // Level ten for fourteen seconds: the first wave is a front rather than a stream now, and this
  // is the first point at which it has closed into a press around the body.
  const run = new Trial();
  run.start(10);
  const body = { x: 600, y: 400, radius: 46 };
  const dt = 1 / 120;
  const Ring = 150;
  // **How far away the nearest one is**, which is the number the body actually lives or dies by,
  // and the only one that survives having no identities to follow. Counting how many are left
  // inside a ring was the version before this: it is deterministically *unchanged* by one shove,
  // because the 邪气 nearest the middle have the furthest to travel to leave and one throw does
  // not carry them that far. That was the measurement being wrong about the move, not the move
  // being wrong — but a guard that reports a real effect as nothing is worse than no guard.
  const nearest = () =>
    run.targets().reduce((best, m) => Math.min(best, Math.hypot(m.x - body.x, m.y - body.y)), Infinity);

  for (let i = 0; i < 120 * 14; i++) run.update(dt, body, 1200, 800, undefined);
  const before = nearest();
  checkTrue(`something is on top of the body: nearest at ${before.toFixed(0)}px`, before < Ring);

  run.shove(body.x, body.y, Ring, PillarShove);
  for (let i = 0; i < Math.round(0.15 * 120); i++) run.update(dt, body, 1200, 800, undefined);
  const after = nearest();
  checkTrue(
    `and the throw buys ground back: nearest ${before.toFixed(0)}px before, ${after.toFixed(0)}px after`,
    after > before * 1.5,
  );

  Math.random = loaded;
}

{
  // What one throw is worth, as arithmetic rather than as a fight. An impulse decaying on `FlingTau`
  // carries exactly `speed * tau` before it is spent, which is the number the whole move is tuned
  // around — and the one that would quietly change if somebody touched the tau for feel.
  const speed = PillarShove;
  let carried = 0;
  let left = speed;
  const dt = 1 / 2000;
  for (let t = 0; t < FlingTau * 8; t += dt) {
    carried += left * dt;
    left *= Math.exp(-dt / FlingTau);
  }
  check(`a throw at ${speed} px/s carries about ${Math.round(carried)}px`, carried, speed * FlingTau, 1);
  // Three body widths, and two pillars catching the same 邪气 throw it twice that. The ceiling is
  // what keeps it a reprieve rather than a stun: thrown further than the screen is wide and the
  // 邪气 would simply be gone for the rest of the run, which is a kill without the kill count.
  checkTrue(
    `which is about three body widths — a reprieve, not a stun: ${Math.round(speed * FlingTau)}px`,
    speed * FlingTau > 140 && speed * FlingTau < 260,
  );
  // And it ends. A throw still pushing after a second would read as a knockdown, which is a much
  // stronger move than this one is paid for.
  checkTrue(
    `and it is spent inside a second: ${Math.round((left / speed) * 100)}% of it left`,
    left < speed * 0.01,
  );
}

// A shove at the exact centre of a pillar must not produce a NaN position. One NaN 邪气 takes the
// whole fight with it, and dividing by a zero distance is the obvious way to make one.
{
  const run = new Trial();
  run.start(1);
  const body = { x: 300, y: 300, radius: 46 };
  for (let i = 0; i < 120 * 5; i++) run.update(1 / 120, body, 900, 600, undefined);
  const live = run.targets();
  if (live.length > 0) {
    run.shove(live[0].x, live[0].y, 200, 500);
    run.update(1 / 120, body, 900, 600, undefined);
    const bad = run.targets().filter((m) => !Number.isFinite(m.x) || !Number.isFinite(m.y));
    check('a shove dead on top of something does not make a NaN', bad.length, 0);
  }
}

// -------------------------------------------------------------------------------------------------
// 兵器与五行 — the first vertical slice: 弓 + 爆火.
//
// The system this replaces the nine schools with rests on one bet: that a weapon decides delivery,
// a way decides what happens on contact, and the fifty pairings are what comes out rather than
// what is written. If that is wrong the whole plan costs three times as much, so the first thing
// built is one weapon and one way, end to end, where the bet can be looked at.

check('five weapons', WEAPONS.length, 5);
check('ten ways, two to a phase', WAYS.length, 10);
{
  const perPhase = new Map<string, number>();
  for (const way of WAYS) {
    const of = PATHS[way].of;
    perPhase.set(of, (perPhase.get(of) ?? 0) + 1);
  }
  check('across five phases', perPhase.size, 5);
  checkTrue('two each, none with one or three', [...perPhase.values()].every((n) => n === 2));
  // Every way names a distinct mechanic, or two of them are the same way with two names.
  const mechanics = new Set(WAYS.map((way) => PATHS[way].on));
  check('and ten distinct mechanics', mechanics.size, 10);
}
{
  // Deepening buys cadence, and it is a real amount rather than a rounding.
  for (const weapon of WEAPONS) {
    const first = swing(weapon, 1);
    const last = swing(weapon, 5);
    checkTrue(
      `${weapon} swings faster as it deepens: ${first.toFixed(2)}s to ${last.toFixed(2)}s`,
      last < first * 0.8,
    );
    check(`and ${weapon} at depth 1 is its own interval`, first, ARMS[weapon].interval, 1e-9);
  }
}

{
  // The slice, driven through the real engine.
  const standing = [
    { x: 700, y: 400 },
    { x: 716, y: 412 },
    { x: 690, y: 420 },
  ];
  let struck = 0;
  let widest = 0;
  const field: Battlefield = {
    targets: () => standing,
    closest: (x, y, within) => {
      const near = standing[0];
      return Math.hypot(near.x - x, near.y - y) <= within ? near : null;
    },
    cull: (_x, _y, radius, most) => {
      struck += most;
      widest = Math.max(widest, radius);
      return 1;
    },
    shove: () => {},
    root: () => {},
    burn: () => {},
    mend: () => {},
  };
  const body = { x: 400, y: 400, radius: 46 };

  // 1. Nothing equipped, nothing swung. There is no second system behind it any more — an
  //    unarmed pet simply does not attack, which is the state between entering 历练 and taking
  //    the first card.
  const unarmed = new Attacks();
  checkTrue('an unarmed pet is not armed', !unarmed.armed);

  // 2. A bow alone hits, and hits for exactly what a bow hits for.
  const bare = new Attacks();
  bare.equip([{ weapon: '弓', depth: 1 }], []);
  checkTrue('a weapon equipped takes the fight over', bare.armed);
  for (let i = 0; i < 120 * 2; i++) bare.update(1 / 120, body, field);
  checkTrue(`the bow lands hits on its own: ${struck}`, struck > 0);
  const alone = struck;
  const plain = widest;

  // 3. And the same bow carrying 爆火 does more where it lands — which is the bet, in one number.
  struck = 0;
  widest = 0;
  const fired = new Attacks();
  fired.equip([{ weapon: '弓', depth: 1 }], [{ way: '火爆', depth: 1 }]);
  for (let i = 0; i < 120 * 2; i++) fired.update(1 / 120, body, field);
  checkTrue(
    `爆火 on the same bow lands more: ${struck} against ${alone}`,
    struck > alone,
  );
  checkTrue(
    `and over a wider circle: ${widest.toFixed(0)}px against ${plain.toFixed(0)}px`,
    widest > plain,
  );

  // 4. Deepening the way widens the burst rather than raising a number nobody can see.
  struck = 0;
  widest = 0;
  const deep = new Attacks();
  deep.equip([{ weapon: '弓', depth: 1 }], [{ way: '火爆', depth: 5 }]);
  for (let i = 0; i < 120 * 2; i++) deep.update(1 / 120, body, field);
  checkTrue(`and deepening it widens it further: ${widest.toFixed(0)}px`, widest > plain);
}

{
  // All five weapons, driven through the engine against a standing crowd. The point is not what
  // each one does — that is what looking at them is for — but that each one **lands hits at all**
  // and that **each one settles its ways**, which is the seam the whole system hangs on and the
  // one that fails silently.
  const mob = [
    { x: 520, y: 400 },
    { x: 545, y: 415 },
    { x: 500, y: 425 },
  ];
  for (const weapon of WEAPONS) {
    let hits = 0;
    let bursts = 0;
    const field: Battlefield = {
      targets: () => mob,
      closest: (x, y, within) =>
        Math.hypot(mob[0].x - x, mob[0].y - y) <= within ? mob[0] : null,
      cull: (_x, _y, radius) => {
        hits++;
        // 爆火's circle is far wider than any weapon's own contact, so counting the wide ones
        // counts the ways settling rather than the weapon landing.
        if (radius >= 40) bursts++;
        return 1;
      },
      shove: () => {},
    root: () => {},
    burn: () => {},
    mend: () => {},
    };
    const kit = new Attacks();
    kit.equip([{ weapon, depth: 3 }], [{ way: '火爆', depth: 1 }]);
    const body = { x: 400, y: 400, radius: 46 };
    for (let i = 0; i < 120 * 6; i++) kit.update(1 / 120, body, field);
    checkTrue(`${weapon} lands hits: ${hits}`, hits > 0);
    checkTrue(`and ${weapon} settles its ways: ${bursts} bursts`, bursts > 0);
  }
}

{
  // Swapping a weapon does not fire the new one instantly off the old one's clock — which it
  // would, going from something slow to something fast.
  const field: Battlefield = {
    targets: () => [{ x: 500, y: 400 }],
    closest: () => ({ x: 500, y: 400 }),
    cull: () => 1,
    shove: () => {},
    root: () => {},
    burn: () => {},
    mend: () => {},
  };
  const kit = new Attacks();
  const body = { x: 400, y: 400, radius: 46 };
  kit.equip([{ weapon: '剑', depth: 1 }], []);
  for (let i = 0; i < 60; i++) kit.update(1 / 120, body, field);
  kit.equip([{ weapon: '盾', depth: 1 }], []);
  // One frame after the swap is far less than 盾's own interval, so nothing should have fired.
  for (let i = 0; i < 3; i++) kit.update(1 / 120, body, field);
  checkTrue('a swap starts the new weapon on its own clock', swing('盾', 1) > 3 / 120);
}

{
  // **Six slots means more than one weapon, and every one of them swings.**
  //
  // `Attacks` held a single `arm` and `strike()` had five branches that each assumed it. Carrying
  // two 刀 and a 弓 has to be three weapons working, not one weapon working and two slots of
  // decoration — and "it compiles" says nothing at all about that.
  //
  // So: run each weapon by itself, then run them together, and the pair has to land about what
  // the two landed apart. Not exactly — 盾's ring tops up on a clock and 剑 only flurries once it
  // has caught something, so the arithmetic is approximate by construction. Comfortably more than
  // either alone is the real claim, and it is the one that fails if the second slot is dead.
  let culls = 0;
  const mob = [
    { x: 500, y: 400 },
    { x: 530, y: 412 },
    { x: 476, y: 420 },
  ];
  const field = (): Battlefield => ({
    targets: () => mob,
    closest: (x, y, within) => (Math.hypot(mob[0].x - x, mob[0].y - y) <= within ? mob[0] : null),
    cull: () => {
      culls++;
      return 1;
    },
    shove: () => {},
    root: () => {},
    burn: () => {},
    mend: () => {},
  });
  const over = (arms: { weapon: Weapon; depth: number }[]): number => {
    culls = 0;
    const kit = new Attacks();
    kit.equip(arms, []);
    const body = { x: 400, y: 400, radius: 46 };
    for (let i = 0; i < 120 * 6; i++) kit.update(1 / 120, body, field());
    return culls;
  };

  const bow = over([{ weapon: '弓', depth: 1 }]);
  const blade = over([{ weapon: '刀', depth: 1 }]);
  const both = over([
    { weapon: '弓', depth: 1 },
    { weapon: '刀', depth: 1 },
  ]);
  checkTrue(`a bow alone lands ${bow}`, bow > 0);
  checkTrue(`a sabre alone lands ${blade}`, blade > 0);
  checkTrue(
    `and the two together land more than either (${both} against ${bow} and ${blade})`,
    both > bow && both > blade,
  );
  checkTrue(
    `— about the sum of them (${both} against ${bow + blade})`,
    both >= (bow + blade) * 0.8 && both <= (bow + blade) * 1.2,
  );

  // **Two of the same weapon are two weapons**, which is the case a list gets wrong most easily:
  // one shared clock, or one of them inheriting the other's countdown, and the second is free.
  const twoBows = over([
    { weapon: '弓', depth: 1 },
    { weapon: '弓', depth: 1 },
  ]);
  checkTrue(`two bows land about twice one (${twoBows} against ${bow})`, twoBows >= bow * 1.7);

  // **And two shields are two rings.** 罡气 is not thrown — the swing tops up a ring by counting
  // what is already out there, so without the `owner` tag the second 盾 would look at the first
  // one's nodes, decide the ring was full, and put out nothing at all.
  const shield = over([{ weapon: '盾', depth: 1 }]);
  const twoShields = over([
    { weapon: '盾', depth: 1 },
    { weapon: '盾', depth: 1 },
  ]);
  checkTrue(
    `two shields are two rings (${twoShields} against ${shield})`,
    twoShields >= shield * 1.7,
  );
}

{
  // **Every one of the ten, through the real engine.** Each is given a bow to ride on — the
  // plainest of the five — and watched for the verb it is supposed to produce.
  //
  // This is the check the whole system needs most. A way that silently does nothing looks exactly
  // like a way that is working but subtle, and there are ten of them.
  const seen = {
    culls: 0,
    wide: 0,
    shoves: 0,
    roots: 0,
    burns: 0,
    mends: 0,
  };
  const mob = [
    { x: 520, y: 400 },
    { x: 548, y: 406 },
    { x: 500, y: 418 },
  ];
  const field = (): Battlefield => ({
    targets: () => mob,
    closest: (x, y, within) => (Math.hypot(mob[0].x - x, mob[0].y - y) <= within ? mob[0] : null),
    cull: (_x, _y, radius) => {
      seen.culls++;
      if (radius >= 40) seen.wide++;
      return 1;
    },
    shove: () => {
      seen.shoves++;
    },
    root: () => {
      seen.roots++;
    },
    burn: () => {
      seen.burns++;
    },
    mend: () => {
      seen.mends++;
    },
  });

  const ran = (ways: { way: (typeof WAYS)[number]; depth: number }[]): typeof seen => {
    seen.culls = 0;
    seen.wide = 0;
    seen.shoves = 0;
    seen.roots = 0;
    seen.burns = 0;
    seen.mends = 0;
    const kit = new Attacks();
    kit.equip([{ weapon: '弓', depth: 1 }], ways);
    const body = { x: 400, y: 400, radius: 46 };
    for (let i = 0; i < 120 * 4; i++) kit.update(1 / 120, body, field());
    return { ...seen };
  };
  const with1 = (way: (typeof WAYS)[number]) => ran([{ way, depth: 2 }]);

  // **A bow carrying nothing**, which is what everything else is measured against.
  //
  // The first version of this used 金锐 as the baseline and called it bare — so the yardstick was
  // an arrow already passing through three things, and 水流 duly came out "worse than nothing".
  // A wrong baseline does not fail, it lies, and this one lied in the direction of a real way
  // looking broken.
  const bare = ran([]);
  checkTrue(`a bare bow lands hits: ${bare.culls}`, bare.culls > 0);

  {
    const pierced = with1('金锐');
    checkTrue(
      `金锐 passes through rather than stopping: ${pierced.culls} against ${bare.culls} bare`,
      pierced.culls > bare.culls,
    );
  }
  checkTrue(`金鸣 throws: ${with1('金鸣').shoves} shoves`, with1('金鸣').shoves > 0);
  checkTrue(`木缠 holds: ${with1('木缠').roots} roots`, with1('木缠').roots > 0);
  checkTrue(`木荣 gives back: ${with1('木荣').mends} mends`, with1('木荣').mends > 0);
  checkTrue(`火燎 sets alight: ${with1('火燎').burns} burns`, with1('火燎').burns > 0);
  {
    const wide = with1('火爆');
    checkTrue(`火爆 opens a wide circle: ${wide.wide}`, wide.wide > 0);
  }
  {
    const quake = with1('土崩');
    checkTrue(`土崩 opens the ground: ${quake.shoves} pillars throwing`, quake.shoves > 0);
  }
  {
    // 水寒 lays a field rather than calling anything, so it is read back off `fields`.
    const kit = new Attacks();
    kit.equip([{ weapon: '弓', depth: 1 }], [{ way: '水寒', depth: 1 }]);
    const body = { x: 400, y: 400, radius: 46 };
    for (let i = 0; i < 120 * 2; i++) kit.update(1 / 120, body, field());
    checkTrue(`水寒 leaves cold ground: ${kit.fields().length} patches`, kit.fields().length > 0);
  }
  {
    // 水流 hops to a second target, so it lands more hits than the bow alone does.
    const flowed = with1('水流');
    checkTrue(
      `水流 reaches a second: ${flowed.culls} hits against ${bare.culls} bare`,
      flowed.culls > bare.culls,
    );
  }
  {
    // 土固 is armour, not a landing. It is read off the shell.
    const kit = new Attacks();
    kit.equip([{ weapon: '弓', depth: 1 }], [{ way: '土固', depth: 2 }]);
    kit.update(1 / 120, { x: 400, y: 400, radius: 46 }, field());
    check('土固 is armour, one layer a depth', kit.shell, 2);
    checkTrue('and it eats a hit', kit.absorb());
  }
}

{
  // 缠木 and 燎火 act on the 邪气 themselves, so they are checked against a real trial rather than
  // against a stub that only counts the call.
  const run = new Trial();
  run.start(3);
  const body = { x: 600, y: 400, radius: 46 };
  for (let i = 0; i < 120 * 8; i++) run.update(1 / 120, body, 1200, 800, undefined);
  const before = run.targets();
  checkTrue('a field to work on', before.length > 2);

  // Held where it stands: after a root, the nearest one has not closed any further.
  const near = before.reduce((best, m) =>
    Math.hypot(m.x - body.x, m.y - body.y) < Math.hypot(best.x - body.x, best.y - body.y) ? m : best,
  );
  run.root(near.x, near.y, 40, 0.5);
  const held = Math.hypot(near.x - body.x, near.y - body.y);
  for (let i = 0; i < 24; i++) run.update(1 / 120, body, 1200, 800, undefined);
  const stillThere = run
    .targets()
    .some((m) => Math.abs(Math.hypot(m.x - body.x, m.y - body.y) - held) < 1.5);
  checkTrue(`a rooted 邪气 does not close while it is held (${held.toFixed(0)}px)`, stillThere);

  // And burning kills on its own, with nothing else touching it.
  const lit = new Trial();
  lit.start(1);
  for (let i = 0; i < 120 * 6; i++) lit.update(1 / 120, body, 1200, 800, undefined);
  const alive = lit.targets().length;
  const killsBefore = lit.killCount;
  for (const m of lit.targets()) lit.burn(m.x, m.y, 10, BurnBeat * 4);
  for (let i = 0; i < Math.round(BurnBeat * 5 * 120); i++) {
    lit.update(1 / 120, body, 1200, 800, undefined);
  }
  checkTrue(
    `burning kills on its own: ${lit.killCount - killsBefore} died of ${alive} alight`,
    lit.killCount > killsBefore,
  );
}

// -------------------------------------------------------------------------------------------------
// 金钟罩 — the shell 固土 raises.
//
// It used to have a second source, a card of its own drafted beside the ten. The card went with
// the draft; the shell is 固土's now, one layer a depth, and what it does is unchanged.

{
  // The shell itself: it eats one hit per layer, the last one throws, and it comes back.
  let shoved = 0;
  const field: Battlefield = {
    targets: () => [],
    // A bow asks `closest` for somewhere to shoot, where 山崩 used to pick its own ground
    // out of `targets`. A stub that answers null is a stub where nothing ever fires.
    closest: () => ({ x: 760, y: 400 }),
    cull: () => 0,
    shove: () => {
      shoved++;
    },
    root: () => {},
    burn: () => {},
    mend: () => {},
  };
  const kit = new Attacks();
  const body = { x: 400, y: 300, radius: 46 };
  kit.equip([{ weapon: '弓', depth: 1 }], []);
  kit.update(1 / 120, body, field);
  checkTrue('nothing absorbs anything without 固土', !kit.absorb());

  kit.equip([{ weapon: '弓', depth: 1 }], [{ way: '土固', depth: 2 }]);
  check('two deep is two layers standing', kit.shell, 2);
  checkTrue('the first hit is eaten', kit.absorb());
  check('and costs a layer', kit.shell, 1);
  checkTrue('the second is eaten too', kit.absorb());
  check('which is the last of them', kit.shell, 0);
  check('and the last one throws what is near', shoved, 1);
  checkTrue('a third hit gets through', !kit.absorb());

  // It comes back, and slowly. A shell that re-forms quickly is a place to stand.
  for (let i = 0; i < 120 * 8; i++) kit.update(1 / 120, body, field);
  check('eight seconds later it is still down', kit.shell, 0);
  for (let i = 0; i < 120 * 2; i++) kit.update(1 / 120, body, field);
  check('and by ten it is whole', kit.shell, 2);

  // A layer taken mid-run is a layer you have now, not one you have in nine seconds.
  kit.absorb();
  kit.absorb();
  check('broken again', kit.shell, 0);
  kit.equip([{ weapon: '弓', depth: 1 }], [{ way: '土固', depth: 3 }]);
  checkTrue(`going a layer deeper while it is down gives that layer at once: ${kit.shell}`, kit.shell > 0);
}

// -------------------------------------------------------------------------------------------------
// Did it reach the screen?
//
// Every check in this file until now asks what a number is. **None of them asks whether anything
// was drawn**, and that gap cost a release: 山崩's stones were taken out of the additive pass and
// put into the depth queue, the 演武场 does not use the depth queue, and so in the yard the stones
// drew nowhere at all. tsc passed, 394 assertions passed, the bundle built. The only way to find
// it was to look.
//
// A canvas that counts marks instead of making them closes that. It is not a picture test — it
// cannot say a stone looks like a stone — but it can say the difference between *something* and
// *nothing*, which is the failure that actually happens.

/** A stand-in canvas that records how many fills and strokes it was asked for. */
/** The colour of the broken ground at a stone's foot. See `drawOne`'s 'pillar' arm. */
const Hole = '#140e06';

function recorder(): {
  context: CanvasRenderingContext2D;
  marks: () => number;
  stones: () => number;
} {
  let marks = 0;
  let stones = 0;
  const gradient = { addColorStop: () => {} };
  // Numeric and string properties that the drawing code reads back as well as writes.
  const held: Record<string | symbol, unknown> = {
    globalAlpha: 1,
    lineWidth: 1,
    globalCompositeOperation: 'source-over',
    filter: 'none',
  };
  const context = new Proxy(held, {
    get(obj, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'measureText') return () => ({ width: 10 });
      if (key === 'fill' || key === 'stroke' || key === 'fillRect' || key === 'strokeRect') {
        return () => {
          marks++;
          // The hole a stone comes up through, which nothing else in this module draws. Counting
          // it is the difference between "a pillar was painted" and "something was painted".
          if (obj.fillStyle === Hole) stones++;
        };
      }
      if (key in obj) return obj[key];
      return () => {};
    },
    set(obj, key, value) {
      obj[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, marks: () => marks, stones: () => stones };
}

{
  const yard = { x: 600, y: 400, radius: 46 };
  const mob = [
    { x: 760, y: 330 },
    { x: 790, y: 360 },
    { x: 770, y: 390 },
  ];
  const field: Battlefield = {
    targets: () => mob,
    // A bow needs somewhere to shoot and something to connect with, or the arrow flies for ever
    // and the way it carries never settles — which is a stub that reports "nothing was drawn"
    // for a reason that has nothing to do with drawing.
    closest: () => mob[0],
    cull: (x: number, y: number, radius: number) =>
      Math.hypot(x - mob[0].x, y - mob[0].y) <= radius + 18 ? 1 : 0,
    shove: () => {},
    root: () => {},
    burn: () => {},
    mend: () => {},
  };
  const kit = new Attacks();
  kit.equip([{ weapon: '弓', depth: 3 }], [{ way: '土崩', depth: 3 }]);

  // Run until the ground has opened and stones are standing.
  let standing = 0;
  let clock = 0;
  for (let i = 0; i < 120 * 3 && standing === 0; i++) {
    kit.update(1 / 120, yard, field);
    clock += 1 / 120;
    const probe = new Depth();
    kit.collectStones(probe);
    standing = probe.size;
  }
  checkTrue(`stones are standing ${clock.toFixed(2)}s in: ${standing} of them`, standing > 0);

  // 1. The depth pass draws them. This is the assertion the missing yard would have failed.
  const sorted = recorder();
  const queue = new Depth();
  kit.collectStones(queue);
  queue.paint(sorted.context);
  checkTrue(`painting the queue puts ink down: ${sorted.marks()} marks`, sorted.marks() > 0);

  checkTrue(`and what it painted was stones: ${sorted.stones()}`, sorted.stones() > 0);

  // 2. And the additive pass does **not** paint them, because they are solid things standing on
  //    the ground and something else may have to cover them. Drawn in both places they would be
  //    painted twice, once in the wrong order.
  //
  //    Counted by the hole at a stone's foot rather than by a total. The total was the first
  //    version and it stopped meaning anything the moment a weapon's own arrow and sparks joined
  //    that pass — twenty marks against twenty-five is not evidence of anything.
  const flat = recorder();
  const bare = new Attacks();
  bare.equip([{ weapon: '弓', depth: 3 }], [{ way: '土崩', depth: 3 }]);
  let alone = 0;
  for (let i = 0; i < 120 * 3; i++) {
    bare.update(1 / 120, yard, field);
    const probe = new Depth();
    bare.collectStones(probe);
    if (probe.size > 0) {
      const before = flat.marks();
      bare.draw(flat.context);
      alone = flat.marks() - before;
      break;
    }
  }
  checkTrue(
    `and the additive pass leaves the stones alone: ${flat.stones()} of its ${alone} marks were stone`,
    flat.stones() === 0,
  );
}

// -------------------------------------------------------------------------------------------------
// 深浅 — what covers what, in a plane seen from above.
//
// The mode drew in fixed layers, which is right exactly half the time: a 邪气 below the pet on
// screen is nearer the viewer and should cover it. Three things about the queue are worth pinning,
// because all three are invisible until something is drawn in the wrong order and nobody can say
// why it looks wrong.

{
  const depth = new Depth();
  const painted: number[] = [];
  const note = (_context: CanvasRenderingContext2D, index: number) => painted.push(index);
  const canvas = null as unknown as CanvasRenderingContext2D;

  // 1. Furthest first. Lower on screen is nearer, so it is painted last and covers the rest.
  depth.add(300, note, 0);
  depth.add(100, note, 1);
  depth.add(200, note, 2);
  depth.paint(canvas);
  check('painted back to front: three queued', painted.length, 3);
  checkTrue(`and in order of depth: ${painted.join(', ')}`, painted.join(',') === '1,2,0');

  // 2. **A reset leaves nothing behind.** The arrays are reused across frames rather than rebuilt,
  //    which is the whole reason this is affordable at 大乘 — and the obvious way to get that
  //    wrong is to drop the count and keep painting last frame's leftovers.
  painted.length = 0;
  depth.reset();
  check('a reset empties it', depth.size, 0);
  depth.add(50, note, 7);
  check('and one thing queued is one thing', depth.size, 1);
  depth.paint(canvas);
  checkTrue(`only the new one is painted: ${painted.join(', ')}`, painted.join(',') === '7');

  // 3. An empty queue paints nothing and does not throw. It is called every frame of every run,
  //    including the ones before anything has arrived.
  painted.length = 0;
  depth.reset();
  depth.paint(canvas);
  check('an empty queue paints nothing', painted.length, 0);
}

{
  // And the same thing through the real 邪气 list: whatever `Trial` queues has to come out
  // ordered by where each one actually is.
  const run = new Trial();
  run.start(4);
  const body = { x: 600, y: 400, radius: 46 };
  for (let i = 0; i < 120 * 8; i++) run.update(1 / 120, body, 1200, 800, undefined);
  const live = run.targets();
  checkTrue(`a field to sort: ${live.length} of them`, live.length > 3);

  const depth = new Depth();
  const seen: number[] = [];
  const note = (_context: CanvasRenderingContext2D, index: number) => seen.push(index);
  // `collect` holds its own painter, so this drives the queue directly with the same positions.
  for (let i = 0; i < live.length; i++) depth.add(live[i].y, note, i);
  depth.paint(null as unknown as CanvasRenderingContext2D);
  let outOfOrder = 0;
  for (let i = 1; i < seen.length; i++) {
    if (live[seen[i]].y < live[seen[i - 1]].y) outOfOrder++;
  }
  check('nothing is painted in front of something nearer than it', outOfOrder, 0);
  check('and every one of them was painted', seen.length, live.length);
}

// -------------------------------------------------------------------------------------------------
// 追形 — the hop that carries the body to where you are pointing.
//
// The mode is steered by a cursor now rather than by a drag, and a chase has two ways to be wrong
// that are invisible in a screenshot: it can fail to converge, and it can be slower than the thing
// chasing *it*. Both are arithmetic, so both are checked here rather than discovered at 大乘.

// 1. It never lands past what it was aiming at. An overshoot does not read as a miss, it reads as
//    indecision — the body ends up oscillating either side of a stationary cursor forever.
let overshot = 0;
for (let distance = 1; distance <= 2000; distance += 1) {
  const hop = planHop(distance);
  if (hop !== null && hop.reach > distance + 1e-9) overshot++;
}
check('no hop lands past the point it was aimed at', overshot, 0);

// 2. Inside the settle radius there is nothing to do. Without this the body twitches under a
//    resting cursor, which is the single most visible thing a follow mode can get wrong.
checkTrue('arrived is a state with no hop in it', planHop(Settle) === null && planHop(0) === null);
checkTrue('and one pixel further out there is', planHop(Settle + 1) !== null);

// 3. Bigger hops take longer to wind up, go higher, stay up longer, and barely pause on landing.
const near = planHop(Settle + 2);
const far = planHop(5_000);
if (near === null || far === null) {
  checkTrue('both ends of the range plan a hop', false);
} else {
  checkTrue('a long hop crouches longer than a short one', far.gather > near.gather);
  checkTrue('and is in the air longer', far.air > near.air);
  checkTrue('and gets higher', far.rise > near.rise);
  // The pause is what gives a shuffle its beat; a bound has somewhere to be.
  checkTrue('and spends less time standing afterwards', far.rest < near.rest);
  check('a hop is capped rather than scaled without limit', far.reach, MaxReach);
}

// 4. Reach only ever grows with distance. A dip would mean some band of distances is approached
//    more slowly than a band further out, which is the kind of thing nobody ever finds by playing.
let dipped = 0;
let previousReach = 0;
for (let distance = Settle + 1; distance <= 2000; distance += 1) {
  const hop = planHop(distance);
  if (hop === null) continue;
  if (hop.reach < previousReach - 1e-9) dipped++;
  previousReach = hop.reach;
}
check('reach never goes backwards as the target gets further away', dipped, 0);

// 5. **It outpaces what is chasing it.** 邪气 close in at 52 px/s at 筑基 and 106 at 大乘. A
//    pursuit that cannot clear that by a wide margin is not a control scheme, it is a handicap —
//    and this is the number that would quietly rot if somebody retuned the cycle for feel.
const FastestMenace = 106;
const flatOut = planHop(5_000);
checkTrue(
  `at full stretch the chase runs at ${flatOut === null ? 0 : Math.round(pace(flatOut))} px/s, against ${FastestMenace} for the fastest 邪气`,
  flatOut !== null && pace(flatOut) > FastestMenace * 5,
);

// 6. And it converges. Hop by hop from a corner-to-corner distance, counting both the hops and the
//    seconds — a scheme that arrives in forty small hops is convergent and still unplayable.
let left = 1_200;
let hops = 0;
let seconds = 0;
while (hops < 100) {
  const hop = planHop(left);
  if (hop === null) break;
  left -= hop.reach;
  seconds += cycleSeconds(hop);
  hops++;
}
checkTrue(`1200 px takes ${hops} hops`, hops <= 10);
checkTrue(`and ${seconds.toFixed(2)}s to cross`, seconds < 3.5);
checkTrue('and it does arrive', left <= Settle);

// 7. The arch. It has to leave and land at exactly zero — the contact shadow is drawn from this,
//    and a shadow that is still shrunk at the moment of touchdown is a body hovering.
check('the hop starts on the ground', arch(0, 40), 0);
check('and ends on it', arch(1, 40), 0);
check('and is at its highest halfway', arch(0.5, 40), 40);
let turns = 0;
let climbing = true;
let height = arch(0, 40);
for (let i = 1; i <= 200; i++) {
  const next = arch(i / 200, 40);
  const rising = next > height;
  if (rising !== climbing) turns++;
  climbing = rising;
  height = next;
}
// Exactly one: up, then down. Two would be a bounce in mid-air.
check('and it goes up once and comes down once', turns, 1);
checkTrue('the shortest hop still leaves the ground', (planHop(Settle + 1)?.rise ?? 0) > 1);
checkTrue('and the smallest reach is not below the floor', (planHop(1_000)?.reach ?? 0) >= MinReach);

// 8. **Leaving the plane takes the hop with it.**
//
//    A run that ends mid-air was the one case nothing cleaned up. The hop is stepped only while
//    `planar` is true, so switching the plane off while one was in flight froze it there — and a
//    frozen hop is not cosmetic. `isPursuing` reads `hop !== null`, and `main.ts` refuses to count
//    the pointer as being over the body while the body is pursuing, so **the pet could not be
//    clicked again for the rest of the session.** The lift the arch had it at stayed subtracted
//    from the drawn position on every later frame, and the hop's travel velocity — up to 638 px/s
//    — was handed back to gravity.
//
//    These drive the real class rather than a model of it, which is the whole point: the previous
//    version of this leak survived a passing suite because nothing here had ever constructed a
//    Slime.
const onThePlane = (): Slime => {
  const pet = new Slime(100, 100);
  pet.planar = true;
  pet.centreIn(800, 600);
  return pet;
};

// Mid-air: far enough away that the hop is a long one, stepped past the crouch and into the arch.
let flier = onThePlane();
flier.pursue({ x: 760, y: 560 });
flier.update(0.2, { width: 800, height: 600, cursor: null });
checkTrue('a chased slime is airborne after 0.2s', flier.isPursuing);
flier.beginFrame(1);
checkTrue('and the arch has it off the ground', flier.drawY < flier.y);

flier.planar = false;
checkTrue('leaving the plane ends the chase', !flier.isPursuing);
flier.beginFrame(1);
// The one that matters. `hitTest` measures against the drawn position, so a leftover lift moves
// the clickable region off the body as well as drawing it in the wrong place.
check('and the body is drawn where it actually is', flier.drawY - flier.y, 0);
checkTrue('and it is not still travelling at hop speed', Math.hypot(flier.vx, flier.vy) < 1);
// Not "quiet immediately" — the body is still unwinding the crouch, and that is motion the loop
// is right to keep drawing. The property is that it ever goes quiet at all: a frozen hop makes
// `isAnimating` answer yes forever, so the overlay never stands down to 20 Hz again for the rest
// of the session.
let everQuiet = false;
for (let i = 0; i < 600 && !everQuiet; i++) {
  flier.update(1 / 60, { width: 800, height: 600, cursor: null });
  // The frame has to be begun as well as stepped: `isAnimating` asks whether the drawn position
  // has caught up with the simulated one, and nothing ever moves it without this.
  flier.beginFrame(1);
  if (!flier.isAnimating) everQuiet = true;
}
checkTrue('and the loop can stand down again', everQuiet);

// And the same thing through the grab path, because `pursue` refuses while grabbed and a run can
// end on any frame at all.
flier = onThePlane();
flier.pursue({ x: 760, y: 560 });
flier.update(0.2, { width: 800, height: 600, cursor: null });
flier.planar = false;
flier.planar = true;
checkTrue('coming back onto the plane does not resurrect the old hop', !flier.isPursuing);

// -------------------------------------------------------------------------------------------------
// What actually reaches the screen.
//
// Every check above this line reads the **dictionaries**. That is not the same question. A string
// can be perfectly translated in all five files and still never be asked for, because some function
// between the dictionary and the canvas returns a literal instead — which is exactly what
// `Cultivation.describe()` did:
//
//     if (this.realm >= Ascended) return '\u5df2\u98de\u5347';
//
// `words().ascended` was there, `stageName` used it, and this branch returned before reaching it.
// An English player who ascended saw Chinese in the bubble and in the settings window, and every
// assertion above passed, because none of them ever called the function.
//
// So these call the functions. Under English, nothing they produce may contain a CJK character.

const Ideograph = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const wasLocale = locale();
setLocale('en');

let leaked: string[] = [];
const englishOnly = (what: string, produced: string): void => {
  if (Ideograph.test(produced)) leaked.push(`${what} → ${produced}`);
};

// Every rung of the ladder, and the one past the top — which is the rung that was wrong.
for (let realm = 0; realm <= Ascended; realm++) {
  for (let stage = 0; stage < StagesPerRealm; stage++) {
    englishOnly(`stageName(${realm}, ${stage})`, stageName(realm, stage));
  }
}
// Every bucket of the fullness word.
for (const progress of [0, 0.44, 0.45, 0.84, 0.85, 0.99, 1, 1.5]) {
  englishOnly(`fullness(${progress})`, fullness(progress));
}
// Every line a find can say.
for (let i = 0; i < FINDS.length; i++) {
  englishOnly(`findText(${i})`, findText(() => (i + 0.5) / FINDS.length));
}
// And the hover line itself, at every realm including the ascended one.
for (let realm = 0; realm <= Ascended; realm++) {
  const pet = new Cultivation(0);
  pet.realm = realm;
  pet.stage = realm >= Ascended ? 0 : 3;
  englishOnly(`describe() at realm ${realm}`, pet.describe());
}

check(`nothing outside the dictionary speaks Chinese in English${leaked.length ? ': ' + leaked.join(', ') : ''}`, leaked.length, 0);
checkTrue('and the functions really were called', FINDS.length + Ascended > 20);

setLocale(wasLocale);
checkTrue('the locale is put back', locale() === wasLocale);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
