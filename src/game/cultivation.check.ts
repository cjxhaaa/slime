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

import { Cultivation } from './cultivation.js';
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

// 1. accrual at the starting rate
let c = new Cultivation(0);
c.settle(30);
check('30s of a fresh run', c.qi, 30, 1e-9);
checkTrue('not ready at 30s', !c.readyToBreakThrough);

// 2. the first breakthrough lands at 60s
c = new Cultivation(0);
c.settle(60);
checkTrue('ready at 60s', c.readyToBreakThrough);
checkTrue('breakthrough taken', c.breakThrough());
check('stage advanced', c.stage, 1);
check('overflow carried, nothing left over', c.qi, 0, 1e-9);

// 3. the bottleneck. 600s on a stage that fills at 60s must NOT be 600 qi:
//    60 at full rate, then 540 at a quarter = 60 + 135 = 195.
c = new Cultivation(0);
c.settle(600);
check('600s with 540s of it stuck at the bottleneck', c.qi, 195, 1e-9);

// 4. the same gap, taken in ten pieces, must land in the same place
let piecewise = new Cultivation(0);
for (let t = 60; t <= 600; t += 60) piecewise.settle(t);
check('same gap split into ten settles', piecewise.qi, 195, 1e-6);

// 5. a clock that goes backwards gives nothing and does not go negative
c = new Cultivation(0);
c.settle(100);
const before = c.qi;
c.settle(40);
check('clock moved back: qi unchanged', c.qi, before, 1e-9);
c.settle(70);
check('and it carries on from the new time, not the old', c.qi, before + 30 * 0.25, 1e-9);

// 6. overflow earned at the bottleneck is kept across the breakthrough
c = new Cultivation(0);
c.settle(600);
c.breakThrough();
check('overflow carried into the next stage', c.qi, 195 - 60, 1e-9);

// 7. rebirth multiplies output
c = new Cultivation(0);
c.rebirths = 2;
c.settle(10);
check('two rebirths double output', c.qi, 10 * (1 + 0.5 * 2), 1e-9);

// 8. modifiers multiply into the pipeline
c = new Cultivation(0);
c.addModifier({ name: 'test', factor: () => 2 });
c.settle(10);
check('a x2 modifier', c.qi, 20, 1e-9);

// 9. walking the whole ladder lands on ascension and stops
c = new Cultivation(0);
let clock = 0;
let breakthroughs = 0;
while (c.realm < Ascended && breakthroughs < 1000) {
  // Nudged past the exact boundary: landing on it leaves qi a float hair short of the
  // requirement, which is invisible in the app (accrual just carries on) but stalls a test
  // that expects the breakthrough on that very tick.
  clock += requirement(c.realm, c.stage) / baseRate(c.realm, c.stage) + 1e-6;
  c.settle(clock);
  if (!c.breakThrough()) break;
  breakthroughs++;
}
check('breakthroughs to ascend', breakthroughs, Ascended * StagesPerRealm);
check('ascension in effective days', clock / 3600 / 13.6, 3.81, 0.05);
checkTrue('nothing further is offered once ascended', !c.readyToBreakThrough);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
