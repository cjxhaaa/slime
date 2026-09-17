import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Slime, type Bite, type DevourRect } from './slime/Slime';
import { lookFor } from './game/appearance';
import { allowance, burden, effort, engulfSeconds, spoilMinutes, strain } from './game/combat';
import { Daily } from './game/daily';
import { Cultivation, ExpectedKeysPerSecond, InputPollSeconds } from './game/cultivation';
import { Glyphs } from './game/Glyphs';
import { Motes } from './game/Motes';
import { requirement, stageName } from './game/realms';
import { allowSaving, loadSave, requestSave, type SaveState } from './save';
import { Bubble } from './ui/Bubble';
import { PawCursor } from './ui/PawCursor';
import { VelocityTracker } from './ui/VelocityTracker';

/** A window the slime could eat, as Rust reports it. All coordinates are physical screen pixels. */
interface Prey {
  hwnd: number;
  title: string;
  process: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hung: boolean;
  /** Fraction of the window hidden behind other windows, 0 to 1. */
  occlusion: number;
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const context = canvas.getContext('2d')!;

// Resolved lazily. Calling into the Tauri API at module scope means a failure there stops the whole
// module from evaluating — no frame loop, no error handler, and a transparent window that looks
// exactly like one that never opened.
let cachedWindow: ReturnType<typeof getCurrentWindow> | null = null;
function petWindow(): ReturnType<typeof getCurrentWindow> {
  cachedWindow ??= getCurrentWindow();
  return cachedWindow;
}

const slime = new Slime(0, 0);
const cultivation = new Cultivation();
const glyphs = new Glyphs();
const motes = new Motes();
const daily = new Daily();
const bubble = new Bubble();
const paw = new PawCursor();
const dragVelocity = new VelocityTracker();

/** Screen-space to canvas-space conversion state, refreshed whenever the window moves or rescales. */
let origin = { x: 0, y: 0 };
/**
 * Physical screen pixels per CSS pixel in this webview, measured from the window's own two sizes.
 *
 * The cursor stream from Rust is in physical screen pixels; everything drawn here is in CSS pixels
 * relative to the window. Something has to convert between them, and `devicePixelRatio` is in fact
 * the right number — on this 150% display it reports 1.5, the window is 3840 physical pixels wide,
 * and the CSS viewport is 2560, so they agree exactly.
 *
 * It is measured rather than read anyway, because the window's own physical width over its own CSS
 * width cannot disagree with itself, and this removes the need to trust that any single API means
 * what we assume. Beware of checking it against Win32 tools: a process that is not per-monitor DPI
 * aware sees virtualised (logical) window rects, and comparing a logical 2560 against the CSS 2560
 * makes the ratio look like 1 when it is really 1.5.
 */
let pixelsPerCssPx = 1;
let cursor: { x: number; y: number } | null = null;

let grabbed = false;
/**
 * A press that has landed on a slime mid-meal and has not yet travelled far enough to be a pull.
 *
 * It cannot become a grab immediately, because grabbing calls the meal off and a plain click is
 * not meant to: on a window that has stopped responding, that click is the separate consent for a
 * force kill.
 */
let pullPending = false;
let pressedAt = 0;
let pressedPoint = { x: 0, y: 0 };

/**
 * Sizes the backing store to the window's real device pixels, so the slime rasterises at native
 * resolution rather than being scaled up from a smaller buffer.
 *
 * On this display that is 3840x2088 — eight megapixels. Which is correct, and is also precisely why
 * the renderer must not clear and repaint the whole thing every frame; see the dirty-rect note.
 */
function resize(): void {
  const ratio = pixelsPerCssPx;
  canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  fullRepaint = true;
}

async function refreshGeometry(): Promise<void> {
  // The cursor stream arrives in physical screen pixels; everything drawn here is in CSS pixels
  // relative to the window. Without both the origin and the scale factor the slime's eyes track a
  // point that drifts further off the further the pointer is from the top-left of the monitor —
  // and on a scaled display it is wrong even at the origin.
  //
  // Never allowed to be fatal. This is a nicety about where the slime looks, and an overlay that
  // fails to draw at all because a geometry read was denied is a far worse outcome than one whose
  // gaze is slightly off.
  try {
    const [position, size] = await Promise.all([
      petWindow().outerPosition(),
      petWindow().innerSize(),
    ]);
    // No decorations, so the outer origin is also the client origin.
    origin = { x: position.x, y: position.y };
    const measured = window.innerWidth > 0 ? size.width / window.innerWidth : 1;
    if (measured !== pixelsPerCssPx) {
      pixelsPerCssPx = measured;
      // The first resize() ran before this measurement existed, so redo it now that it does.
      resize();
    }
  } catch (error) {
    console.warn('could not read window geometry; assuming the monitor origin', error);
    origin = { x: 0, y: 0 };
    pixelsPerCssPx = 1;
  }
}

function toLocal(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - origin.x) / pixelsPerCssPx,
    y: (screenY - origin.y) / pixelsPerCssPx,
  };
}

function toScreen(localX: number, localY: number): { x: number; y: number } {
  return {
    x: localX * pixelsPerCssPx + origin.x,
    y: localY * pixelsPerCssPx + origin.y,
  };
}

/**
 * Eating a window.
 *
 * Hold the slime still over something for two seconds and it latches on and starts to engulf it.
 * Releasing the button does *not* call it off - once it has committed it finishes the meal on its
 * own. The way to stop it is to take hold of it and pull it away, which is the same gesture as
 * picking it up, and reads as peeling it off the window rather than as cancelling a dialog.
 *
 * That split is deliberate. A dead-man's switch would mean the safe action is to keep holding
 * perfectly still, which is the opposite of the instinct when something unexpected starts
 * happening on screen. Here the instinct - grab it - is the abort.
 */
const DEVOUR_HOLD_MS = 2000;
/** How far the hand may wander and still count as holding still. Loose enough for hand tremor. */
const STILL_RADIUS = 10;
/** How far a press has to travel before it counts as pulling the slime off a meal. */
const DEVOUR_PULL_PX = 8;
/**
 * How much of a window has to be buried before the slime hauls it to the front first.
 *
 * Not zero: a window overlapped by a couple of percent is one you can plainly see being eaten, and
 * heaving for it would put a second of animation in front of every meal on a busy desktop. Not high
 * either — the slime only needs one visible sliver to land on, so a window can be almost entirely
 * hidden and still be a legal target.
 */
const BURIED_ENOUGH = 0.06;

let stillSince = 0;
let stillPoint = { x: 0, y: 0 };
/** True while a `window_at` call is in flight, so the frame loop does not stack them up. */
let askingForPrey = false;
/**
 * Whether the backend can see other applications' windows at all — false on macOS and Linux.
 *
 * Optimistic until told otherwise, so that a failed query leaves the feature on rather than
 * silently killing it on the one platform where it works. Being wrong in this direction costs a
 * round trip that answers `null`, which is a case the meal already handles.
 */
let devourSupported = true;
/** What is being eaten, for the bubble. Kept here rather than in the slime, which does not read. */
let devourTarget: Prey | null = null;
let devourNote: { text: string; until: number } | null = null;

function noteDevour(text: string, seconds: number): void {
  devourNote = { text, until: performance.now() + seconds * 1000 };
}

/**
 * Targets whatever is under the body and begins the engulf.
 *
 * The probe point is the slime's drawn centre, not the pointer: the slime is what is sitting on the
 * window, and after a release there is no pointer to ask about at all.
 */
async function tryBeginDevour(): Promise<void> {
  askingForPrey = true;
  try {
    const at = toScreen(slime.drawX, slime.drawY);
    const prey = await invoke<Prey | null>('window_at', {
      x: Math.round(at.x),
      y: Math.round(at.y),
    });
    // The gesture can end, or a meal can already have started, while this round trip was in flight.
    if (!prey || !grabbed || slime.devourPhase) return;
    const topLeft = toLocal(prey.x, prey.y);
    const rect: DevourRect = {
      x: topLeft.x,
      y: topLeft.y,
      width: prey.width / pixelsPerCssPx,
      height: prey.height / pixelsPerCssPx,
    };
    devourTarget = prey;
    devourNote = null;
    // How big an opponent this is, and how far past comfortable it is for the realm the pet has
    // reached. A junior pet against a maximised window takes visibly longer and trembles doing it;
    // a senior one swallows the same window in the floor time. What never changes is whether it
    // *can* — see the note at the top of game/combat.ts.
    const load = burden(rect, window.innerWidth, window.innerHeight, prey.hung);
    const work = effort(load, cultivation.realm);
    slime.beginDevour(
      prey.hwnd,
      rect,
      prey.occlusion > BURIED_ENOUGH,
      engulfSeconds(work),
      strain(work),
    );
  } catch (error) {
    console.warn('could not look for a window to eat', error);
  } finally {
    askingForPrey = false;
    // Whether or not anything was found, the hold is spent. Without this a slime resting over bare
    // desktop asks again on every single frame.
    stillSince = performance.now();
  }
}

function reportBite(outcome: Bite): void {
  const name = devourTarget?.process || devourTarget?.title || 'it';
  switch (outcome) {
    case 'closed':
    case 'killed':
      // No words. The window is gone and the slime just burped, which is the whole report.
      break;
    case 'resisting':
      noteDevour(`${name} is asking you something`, 4);
      break;
    case 'too-tough':
      noteDevour(`Can't chew ${name}`, 4);
      break;
    case 'hung':
    case 'gone':
      break;
  }
}

/**
 * Hauls a buried window to the front, at the moment the heave animation finishes.
 *
 * The result is the occlusion that is left, because the raise can fail — Windows can refuse the
 * z-order change, and a window sitting under a topmost one stays partly buried even when it does
 * not. Saying so is better than letting the slime eat something the user still cannot see and
 * appear to have swallowed nothing.
 */
async function runRaise(hwnd: number): Promise<void> {
  let left = 1;
  try {
    left = await invoke<number>('raise', { hwnd });
  } catch (error) {
    console.warn('could not raise the window', error);
  }
  if (left > BURIED_ENOUGH) {
    const name = devourTarget?.process || 'it';
    noteDevour(`Can't get ${name} out from under`, 3);
  }
}

/** The polite close, once the body has finished wrapping. */
async function runSwallow(hwnd: number): Promise<void> {
  let outcome: Bite = 'gone';
  try {
    outcome = await invoke<Bite>('swallow', { hwnd });
  } catch (error) {
    console.warn('the swallow failed', error);
  }
  slime.finishDevour(outcome);
  reportBite(outcome);
  if (outcome === 'closed' || outcome === 'killed') claimSpoils();
}

/**
 * The reward for a kill: a stretch of doubled output, if the day's allowance covers it.
 *
 * Past the allowance the window still closes and the pet still eats it — the allowance caps the
 * *spoils*, never the capability. That difference is the whole reason someone can buy this to deal
 * with a frozen application and not discover a game standing in the way.
 */
function claimSpoils(): void {
  cultivation.settle();
  daily.roll(allowance(cultivation.realm, cultivation.ascensions));
  if (!daily.take()) return;
  const prey = devourTarget;
  const load = prey
    ? burden(
        { width: prey.width / pixelsPerCssPx, height: prey.height / pixelsPerCssPx },
        window.innerWidth,
        window.innerHeight,
        prey.hung,
      )
    : 0;
  cultivation.nourish(spoilMinutes(load));
  applyLook();
  requestSave(currentSave());
}

/**
 * The force kill, which is reached only by clicking a slime that is already wrapped around a
 * window that will not answer. Never automatic, and never the tail of a polite close.
 */
async function forceSwallow(): Promise<void> {
  const hwnd = slime.devouringHwnd;
  if (hwnd === null) return;
  let outcome: Bite = 'gone';
  try {
    outcome = await invoke<Bite>('force', { hwnd });
  } catch (error) {
    console.warn('the force kill failed', error);
  }
  slime.finishDevour(outcome);
  reportBite(outcome);
}

function devourText(now: number): string | null {
  if (slime.devourPhase === 'heaving') {
    return `Digging ${devourTarget?.process || 'it'} out`;
  }
  if (slime.isChewing) {
    const name = devourTarget?.process || 'it';
    return `${name} is not responding\nClick to force it, or pull me off`;
  }
  if (devourNote && now < devourNote.until) return devourNote.text;
  return null;
}

/**
 * Asks the Rust side to let clicks through to this window, or stops asking.
 *
 * Deliberately not a cached two-state setter. This side must not believe it knows the current mode:
 * a webview reload resets any flag kept here while the process on the other side keeps its actual
 * state, and a setter that skips the call when it thinks the mode already matches then goes silent
 * forever — leaving a full-screen window eating every click on the desktop. So the request is
 * renewed on a timer and expires on its own if this loop ever stops running.
 */
let holdingClicks = false;
let holdingDrag = false;
let lastHoldAt = 0;
const RENEW_EVERY_MS = 150;

function requestClicks(wantsClicks: boolean, dragging: boolean, now: number): void {
  if (wantsClicks) {
    // The lease is 400ms, so renewing at 150ms keeps it alive with wide margin while keeping the
    // IPC off the per-frame path. `dragging` rides along on the renewal rather than being latched
    // separately, so it expires with the lease instead of being able to strand the cursor poll.
    if (holdingClicks && dragging === holdingDrag && now - lastHoldAt < RENEW_EVERY_MS) return;
    holdingClicks = true;
    holdingDrag = dragging;
    lastHoldAt = now;
    void invoke('hold_clicks', { dragging }).catch(() => {
      // Drop the flag so the next frame asks again rather than assuming the hold took effect.
      holdingClicks = false;
    });
    return;
  }
  if (!holdingClicks) return;
  holdingClicks = false;
  // Best-effort: if this never lands, the lease lapses by itself.
  void invoke('release_clicks').catch(() => {});
}

let bubbleRect: Rect | null = null;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Only the part of the overlay that changed gets repainted.
 *
 * The window spans the whole work area but the slime occupies a couple of hundred pixels of it.
 * Clearing and recompositing the full transparent surface every frame — which a layered
 * always-on-top window makes DWM do as well — costs orders of magnitude more than the drawing
 * itself. The union of this frame's bounds and last frame's is what has to be cleared: this
 * frame's to draw into, last frame's to erase what is no longer there.
 */
let previousDirty: Rect | null = null;
let fullRepaint = true;
let pointerDown = false;
let showingPaw = false;

function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function rectsOverlap(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function padRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/**
 * Physics runs on a fixed timestep, decoupled from the frame rate.
 *
 * Explicit Euler gains energy when the step grows, and a bounce is where that shows: a long frame
 * gap turns a landing into a launch, and the slime ends up pinned to the top of the screen. A desk
 * pet gets long frame gaps constantly — it is a background window that the compositor throttles
 * whenever something else wants the GPU — so this is a normal operating condition, not an edge case.
 */
const STEP = 1 / 120;
const MAX_CATCHUP_STEPS = 8;
/**
 * The most simulation a single frame is allowed to owe. Anything beyond it is dropped outright: a
 * stall (the machine asleep, the window occluded for a minute) must not come back as a backlog that
 * the following frames burn through at several times real speed.
 */
const MAX_BACKLOG = MAX_CATCHUP_STEPS * STEP;
let accumulator = 0;

/**
 * Rate to tick at when nothing is happening, and the bookkeeping for standing down.
 *
 * A desk pet spends nearly all of its life doing nothing, and this one was costing 31% of a core to
 * do it: every frame it touched the canvas, which makes the compositor recombine an eight-megapixel
 * transparent layer over the whole desktop whether the pixels changed or not. So an idle frame is
 * both rarer and cheaper now — the loop drops to 20 Hz, and a frame where nothing visible changed
 * does not paint at all.
 *
 * 20 Hz is chosen against MAX_CATCHUP_STEPS: a 50 ms gap is six 1/120 s steps, comfortably under the
 * cap, so the simulation still advances in real time rather than being throttled along with the
 * drawing. That matters because the idle behaviour scheduler lives in the simulation.
 */
const IDLE_INTERVAL_MS = 1000 / 20;
/**
 * When the simulation last advanced. Elapsed time is measured from here, not from the previous
 * `requestAnimationFrame` callback: while standing down, two of every three callbacks return
 * without simulating, and measuring from them silently threw that time away — the idle clock ran
 * at a third of real time, so the slime took nearly five minutes to fall asleep instead of 95 s.
 */
let lastTick = performance.now();
let wasAnimating = true;

/**
 * The slime cannot be placed until the webview reports a real viewport.
 *
 * At startup `innerWidth`/`innerHeight` can still be 0 — the window is created before its content
 * has been laid out. Placing it from those numbers puts it at negative coordinates, permanently off
 * screen, and a zero width also inverts the wall clamps (`minX` ends up greater than `maxX`). So
 * homing waits for the first frame with real dimensions, and a degenerate viewport skips the frame
 * outright rather than simulating against nonsense.
 */
let homed = false;

/**
 * Whether the saved position is still on its way.
 *
 * Homing waits for it rather than racing it. Placing the slime in the default corner and then
 * teleporting it to the restored point a few frames later is a visible jump, on every single
 * launch, and it would be the first thing anyone sees.
 */
let restorePending = true;
let restoredPoint: { x: number; y: number } | null = null;
/**
 * When the one line a first run is allowed to say stops being said.
 *
 * Nothing else here announces itself, which is the point — but it does mean someone who has never
 * seen this can watch a slime sit there and never learn there is anything going on. The first
 * breakthrough lands inside a minute and explains itself; this covers the minute before it.
 */
let introUntil = 0;
let ascendUntil = 0;
let seenIntro = true;

/** Everything worth keeping, assembled in one place so every writer stores the same shape. */
function currentSave(): SaveState {
  return {
    // Rounded to whole pixels. Sub-pixel precision in a save file is noise, and rounding is what
    // makes "this is the same position we already stored" an equality that actually holds.
    slime: { x: Math.round(slime.x), y: Math.round(slime.y) },
    cultivation: cultivation.snapshot(),
    settledAt: cultivation.settledAtSeconds,
    daily: daily.snapshot(),
    seenIntro,
    quiet,
  };
}

/**
 * Puts the breakthrough up as something to answer, reusing the machinery the calendar left behind.
 *
 * That machinery never knew what it was alerting about — `poke` runs whatever action came with it —
 * so this needed no new animation at all: the swell, the beat, the quietening on hover and the
 * clearing on click were all already here and already tuned.
 */
/**
 * Seconds between "has anything changed" checks.
 *
 * The only periodic work cultivation adds, and deliberately not in the frame loop: qi is a function
 * of elapsed time rather than a counter, so this is two multiplications and a comparison every ten
 * seconds. The render loop's stand-down — 31% of a core down to 4% — is the thing a gameplay system
 * wrecks most easily, so it does not get the chance.
 */
const CultivationTickMs = 10_000;
/** How long the save sits between heartbeats, when nothing has happened worth writing on its own. */
const HeartbeatMs = 5 * 60_000;
/**
 * How long a breakthrough hops before it settles down.
 *
 * An unanswered alert hops on a beat, and hopping is full-rate rendering. Left overnight that is
 * the entire stand-down thrown away, plus a pet flailing at an empty chair. Quietening is the same
 * state hovering produces, so the breakthrough is still waiting when you come back — just calm.
 */
const AlertPatienceMs = 3 * 60_000;
/** How long the first-run line stays up. Long enough to read, short enough not to be furniture. */
const IntroMs = 8_000;
/** How long the one line after an ascension stays up. */
const AscendBubbleMs = 12_000;

let alertRaisedAt = 0;
/**
 * Where the pet belongs: the last place it came to rest of its own accord.
 *
 * Updated every time the body settles while it is not on an errand, which covers all three ways it
 * can end up somewhere — thrown there, dragged there, or wandered there. Frozen for the duration of
 * an errand, so fetching a charm never overwrites it.
 *
 * The first version folded this together with "is there an errand" into one nullable, and captured
 * it when a charm appeared. Nothing invalidated it afterwards, so throwing the pet across the
 * screen and waiting had it walk all the way back to where it had been standing when the charm
 * dropped — which from the outside is indistinguishable from a pet still chasing a charm that
 * expired minutes ago.
 */
let restX: number | null = null;
/** True while the pet is fetching a charm or walking back from one. */
let onErrand = false;
let quiet = false;

/**
 * How far the pet can take a glyph from, and it grows with the realm.
 *
 * A second axis for a breakthrough to be felt on that is not a number going up: later on it picks
 * things up without having to shuffle over to them.
 */
function gatherReach(): number {
  return slime.blob.restRadius * (1.15 + 0.06 * cultivation.realm);
}
/** What `applyLook` last handed over, so an unchanged look costs nothing and forces no repaint. */
let appliedLook = { scale: 0, core: '', glow: -1, aura: -1 };

/**
 * Pushes the realm onto the body: size, palette, and how close the stage is to full.
 *
 * Has to ask for a repaint itself. The loop only paints while something is moving, and a halo
 * coming up on a slime that has been sitting still for ten minutes is a change nothing else in the
 * frame would report — it would simply not appear until the next time the pet happened to twitch.
 */
/**
 * The only place any of this is legible, and even here it is phrases rather than figures.
 *
 * The allowance line is absent when there is none left, rather than reading zero. A zero is a
 * deficit and this is not one — an unused allowance is nothing owed, and the plan is emphatic that
 * the same numbers framed as a shortfall produce the opposite feeling.
 */
function hoverLines(): string {
  const lines = [cultivation.describe()];
  const nourishLeft = cultivation.nourishSecondsLeft;
  if (nourishLeft > 0) {
    lines.push(`温养中 · 还余 ${Math.max(1, Math.round(nourishLeft / 60))} 分钟`);
  }
  if (daily.left > 0) {
    lines.push(`今日尚可炼化 ${daily.left} 次`);
  }
  return lines.join('\n');
}

/** Tells the settings window what it is looking at. That window keeps no state of its own. */
function emitPetState(): void {
  void emit('pet-state', {
    ascended: cultivation.ascended,
    ascensions: cultivation.ascensions,
    realm: cultivation.describe(),
  }).catch(() => {});
}

function applyLook(): void {
  const look = lookFor(cultivation);
  // Every field that can change has to be in here. `aura` was left out of the first version and
  // the symptom was quiet: a pet that gained a band of light kept the one it had, because the look
  // was judged unchanged and never handed over. It happened to work through an ascension only
  // because the realm moves at the same moment and the palette comparison caught that instead.
  if (
    look.scale === appliedLook.scale &&
    look.palette.core === appliedLook.core &&
    look.aura === appliedLook.aura &&
    Math.abs(look.glow - appliedLook.glow) <= 0.02
  ) {
    return;
  }
  appliedLook = {
    scale: look.scale,
    core: look.palette.core,
    glow: look.glow,
    aura: look.aura,
  };
  slime.setLook(look);
  fullRepaint = true;
}

function offerBreakThrough(): void {
  // Seclusion means nothing asks for anything. The breakthrough still waits, and hovering still
  // says so — it just does not come and find you.
  if (quiet || slime.hasLiveAlert) return;
  alertRaisedAt = performance.now();
  slime.raiseAlert(`${stageName(cultivation.realm, cultivation.stage)} · 可突破\n点击渡劫`, () => {
    const wasAscended = cultivation.ascended;
    const fromRealm = cultivation.realm;
    cultivation.breakThrough();
    bubble.hide();
    slime.clearAlert();
    // Applied before the performance starts, so the shockwave and the body are already wearing the
    // colour that was just arrived at — the new colour leaving the body *is* the event.
    applyLook();
    if (!wasAscended && cultivation.ascended) {
      slime.ascend();
      // Said once, on the one occasion someone has just finished the whole thing. Not an
      // interruption — they pressed the button a second ago — and it is the only place the rebirth
      // is mentioned at all, because the rebirth itself lives where a stray poke cannot reach it.
      ascendUntil = performance.now() + AscendBubbleMs;
      emitPetState();
    } else if (cultivation.realm !== fromRealm) {
      // Eight of these in a run against seventy-two stages, and until now they looked identical.
      slime.breakRealm();
    }
    // Straight to disk rather than on the next heartbeat. This is the one moment a player would
    // genuinely mind losing, and it happens rarely enough to be worth a write of its own.
    requestSave(currentSave());
  });
}

function homeSlime(width: number, height: number): void {
  const margin = slime.blob.restRadius;
  // Bottom-right by default, out of the way of most window content.
  const point = restoredPoint ?? { x: width - 140, y: height - 80 };
  // Clamped, because the display this was saved on may not be the display it comes back onto: a
  // point that sat comfortably on screen at 3840 wide is past the edge at 1920, and a slime
  // placed off screen cannot be dragged back.
  const limitX = Math.max(margin, width - margin);
  const limitY = Math.max(margin, height - margin);
  slime.teleportTo(
    Math.min(Math.max(point.x, margin), limitX),
    Math.min(Math.max(point.y, margin), limitY),
  );
  homed = true;
}

function frame(now: number): void {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (width < 2 * slime.blob.restRadius || height < 2 * slime.blob.restRadius) {
    // Time spent without a viewport is dropped, not owed.
    lastTick = now;
    requestAnimationFrame(frame);
    return;
  }
  if (restorePending) {
    // Same shape as the degenerate-viewport case above: not ready is not the same as idle, and a
    // frame spent waiting is dropped rather than owed.
    lastTick = now;
    requestAnimationFrame(frame);
    return;
  }
  if (!homed) homeSlime(width, height);

  // Anything the user is engaged with keeps the loop at full rate even when the body is still: a
  // hover, a held button, a live alert, a bubble mid-fade.
  // The hover test is against the live cursor rather than last frame's paw state, so moving onto
  // the slime wakes the loop on the same frame instead of up to an idle interval later.
  const engaged =
    grabbed ||
    pullPending ||
    slime.devourPhase !== null ||
    showingPaw ||
    paw.hasRipples() ||
    bubble.isSettling ||
    glyphs.busy ||
    motes.busy ||
    (slime.hasLiveAlert && !slime.isAlertAcknowledged) ||
    (cursor !== null && slime.hitTest(cursor.x, cursor.y));
  if (!engaged && !slime.isAnimating && now - lastTick < IDLE_INTERVAL_MS) {
    requestAnimationFrame(frame);
    return;
  }
  const elapsed = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;

  // Clamped, not merely rate-limited. Limiting only the steps per frame left the remainder in the
  // accumulator, so a 250 ms stall came back as a dozen frames of four-times-speed catch-up.
  accumulator = Math.min(MAX_BACKLOG, accumulator + elapsed);
  const steps = Math.floor(accumulator / STEP);
  accumulator -= steps * STEP;
  for (let i = 0; i < steps; i++) {
    slime.update(STEP, { width, height, cursor });
  }
  // Whatever time is left in the accumulator has not been simulated, so the body is drawn that far
  // between its last two simulated states. Without this the rendered position snaps to 1/120s
  // increments and a throw judders even though the frame loop is steady.
  slime.beginFrame(accumulator / STEP);

  // One hit test per frame, against the position that is about to be drawn — which is what the
  // pointer is aimed at. Both the bubble text and the click lease below hang off it.
  //
  // `hitTest` is deliberately still measured against the resting body radius while a window is
  // being eaten, rather than against the engulfed shape. The lease below is granted from it, and a
  // slime wrapped around a maximized window would otherwise claim every click inside that window
  // for the duration — which is the exact failure the lease exists to make impossible. So the
  // handle stays a body-sized patch in the middle of the meal.
  const overBody = cursor !== null && slime.hitTest(cursor.x, cursor.y);

  // Holding the slime still over a window starts a meal. Measured from the last time the hand
  // moved appreciably, so this fires on stillness rather than on elapsed grab time.
  if (
    devourSupported &&
    grabbed &&
    !askingForPrey &&
    slime.devourPhase === null &&
    now - stillSince > DEVOUR_HOLD_MS
  ) {
    void tryBeginDevour();
  }
  // Both handed over exactly once: the raise when the heave finishes, the close when the body
  // finishes wrapping.
  const readyToRaise = slime.takeRaiseRequest();
  if (readyToRaise !== null) void runRaise(readyToRaise);
  const readyToSwallow = slime.takeSwallowRequest();
  if (readyToSwallow !== null) void runSwallow(readyToSwallow);

  // What the bubble says, in priority order. An alert outranks everything: it is the one thing
  // on screen asking for an answer, and it must not be displaced by an idle greeting.
  if (slime.alertText) {
    // Reaching for the pet is already the gesture that says "seen it", so hovering ends the
    // hopping without dismissing the alert - and it stops the slime flailing at the exact
    // moment you are trying to aim at it.
    if (cursor !== null && slime.hitTest(cursor.x, cursor.y)) slime.acknowledgeAlert();
    bubble.show(slime.alertText);
  } else {
    const text =
      devourText(now) ??
      (now < ascendUntil ? '此身已证大道\n设置中可转生重历' : null) ??
      (now < introUntil ? '此物似有灵性\n正吞吐天地之气' : null) ??
      // Hovering is the only way any of the cultivation is legible, and even then it is a phrase
      // rather than a figure — no number ever reaches the screen.
      (overBody || grabbed ? hoverLines() : null);
    if (text) bubble.show(text);
    else bubble.hide();
  }
  // The dust first: it comes to the pet rather than the other way round, so it needs no errand and
  // no decision — just a dent where each speck went in.
  const absorbed = motes.update(elapsed, slime.x, slime.y, slime.blob.restRadius * 0.85);
  if (absorbed > 0) {
    cultivation.absorb(absorbed);
    slime.absorb(Math.random() * Math.PI * 2);
  }

  // The errand, resolved once per frame: go to the nearest landed glyph, or back to where the pet
  // was standing before all this started.
  const ground = height - 12 - slime.blob.restRadius;
  glyphs.update(elapsed, ground, width);
  const reached = glyphs.nearest(slime.x);
  const eaten = glyphs.eatNear(slime.x, slime.y, gatherReach());
  for (let i = 0; i < eaten; i++) {
    cultivation.swallow();
    slime.gulp(reached ? Math.atan2(reached.y - slime.y, reached.x - slime.x) : 0);
  }
  if (absorbed > 0 || eaten > 0) applyLook();

  const target = glyphs.nearest(slime.x);
  if (target) {
    onErrand = true;
    slime.chaseTo(target.x);
  } else if (onErrand) {
    // Nothing left to fetch. Walk back to where it was left, and only then call the errand done.
    if (restX === null || Math.abs(slime.x - restX) < slime.blob.restRadius * 0.7) {
      slime.chaseTo(null);
      onErrand = false;
    } else {
      slime.chaseTo(restX);
    }
  }

  bubble.update(elapsed);
  paw.update(elapsed);

  // Clicks are only taken while the pointer is actually over something interactive, so the rest of
  // the desktop keeps working normally underneath a window that covers all of it.
  const anchorY = slime.drawY - slime.blob.restRadius * slime.blob.squashScale.y - 4;
  // Laid out before anything is cleared: measuring the text needs no clip, and the resulting rect
  // is part of what decides which region to clear.
  bubbleRect = bubble.layout(context, slime.drawX, anchorY, width);
  const overBubble =
    cursor !== null &&
    bubbleRect !== null &&
    bubble.opacity > 0.5 &&
    cursor.x >= bubbleRect.x &&
    cursor.x <= bubbleRect.x + bubbleRect.width &&
    cursor.y >= bubbleRect.y &&
    cursor.y <= bubbleRect.y + bubbleRect.height;
  const wantsClicks = grabbed || overBody || overBubble;

  // The drawn paw replaces the OS cursor exactly while the overlay is taking clicks, so the two
  // can never both be visible and the real pointer can never be hidden by a window that is
  // ignoring the mouse anyway.
  const showPaw = wantsClicks && cursor !== null;
  if (showPaw !== showingPaw) {
    showingPaw = showPaw;
    canvas.classList.toggle('hide-cursor', showPaw);
  }
  paw.visible = showPaw;
  paw.pose = grabbed ? 'grab' : 'open';
  paw.setPressed(pointerDown);
  if (cursor) paw.moveTo(cursor.x, cursor.y);

  // Repaint just what moved.
  const painted = unionRect(
    slime.bounds(),
    unionRect(
      unionRect(glyphs.bounds(), motes.bounds()),
      unionRect(
        bubbleRect && bubble.opacity > 0.01 ? padRect(bubbleRect, 22) : null,
        showPaw || paw.hasRipples() ? paw.bounds() : null,
      ),
    ),
  );
  // Two regions, not their union: what has to be erased (last frame) and what has to be drawn
  // (this frame). Unioning them is only cheaper when they overlap. Once the slime is moving faster
  // than its own width per frame — which a throw does immediately — the union is mostly empty
  // space between the two, several times the area actually touched.
  // Read before it is cleared below, and used twice: once to widen the region to the whole canvas,
  // and again to force the paint itself. Those were the same flag read either side of the reset,
  // which meant the second read was always false — so anything that asked for a repaint without
  // also moving the slime got the full-screen clip and then no paint at all. Resizing the window
  // while the pet sat still left the canvas blank until it happened to twitch.
  const forced = fullRepaint;
  const regions: Rect[] = forced
    ? [{ x: 0, y: 0, width, height }]
    : rectsOverlap(previousDirty, painted)
      ? [unionRect(previousDirty, painted)!]
      : ([previousDirty, painted].filter(Boolean) as Rect[]);
  previousDirty = painted;
  fullRepaint = false;

  // One more paint after motion stops, then nothing. Without that trailing frame the screen keeps
  // whatever was drawn mid-movement, because the frame that would have settled it is the first one
  // to report nothing moving.
  const animating =
    slime.isAnimating ||
    showPaw ||
    paw.hasRipples() ||
    bubble.isSettling ||
    bubble.takeTextDirty() ||
    glyphs.busy ||
    motes.busy ||
    (slime.hasLiveAlert && !slime.isAlertAcknowledged);
  // The frame the body stops moving is the frame its resting place becomes final, so that is the
  // moment the position is worth writing down. Cheap enough to sit in the loop — one boolean edge
  // and two numbers — because the write itself is debounced well outside it.
  if (wasAnimating && !animating) {
    // Coming to rest anywhere that was not an errand *is* the placement. Throwing it, dragging it
    // and letting it wander all end here, which is why this needs no separate case for each.
    if (!onErrand) restX = Math.round(slime.x);
    // Rounded to whole pixels. Sub-pixel precision in a save file is noise, and rounding is what
    // makes "this is the same position we already stored" an equality that actually holds.
    requestSave(currentSave());
  }
  const shouldPaint = animating || slime.hasSlowAnimation || wasAnimating || forced;
  wasAnimating = animating;

  if (shouldPaint && regions.length > 0) {
    context.save();
    const clip = new Path2D();
    for (const region of regions) {
      clip.rect(region.x, region.y, region.width, region.height);
      context.clearRect(region.x, region.y, region.width, region.height);
    }
    context.clip(clip);

    motes.draw(context, slime.bodyColour);
    glyphs.draw(context, slime.bodyColour);
    slime.draw(context);
    if (bubbleRect) bubble.draw(context, bubbleRect, slime.drawX, anchorY);
    paw.draw(context);

    context.restore();
  }
  requestClicks(wantsClicks, grabbed, now);

  requestAnimationFrame(frame);
}

function wirePointer(): void {
  canvas.addEventListener('pointerdown', (event) => {
    pressedAt = performance.now();
    pressedPoint = { x: event.clientX, y: event.clientY };
    pointerDown = true;
    paw.setPressed(true);
    cursor = { x: event.clientX, y: event.clientY };
    if (slime.hitTest(event.clientX, event.clientY)) {
      if (slime.devourPhase !== null) {
        // Touching a slime mid-meal is not yet an abort. Wait to see whether this becomes a pull.
        pullPending = true;
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch {
          // Not fatal; see the note on the capture below.
        }
        return;
      }
      grabbed = true;
      slime.grab(event.clientX, event.clientY);
      // Picking it up calls the errand off. Wherever it is put down becomes the new home when it
      // settles there — a deliberate placement outranks an errand every time.
      onErrand = false;
      slime.chaseTo(null);
      stillSince = performance.now();
      stillPoint = { x: event.clientX, y: event.clientY };
      dragVelocity.reset();
      dragVelocity.add(event.clientX, event.clientY, event.timeStamp);
      // Capture keeps the move and up events coming to this element for the whole gesture, so a
      // fast flick cannot hand the stream to something else mid-throw and strand `grabbed`.
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Not fatal: without capture the overlay still covers everything while it holds clicks.
      }
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    // The DOM stream is the only drag input. The polled cursor from Rust arrives at 30Hz, and
    // feeding both meant the drag moved in visible 33ms steps while everything else ran at 60.
    cursor = { x: event.clientX, y: event.clientY };

    if (pullPending) {
      const pulled = Math.hypot(event.clientX - pressedPoint.x, event.clientY - pressedPoint.y);
      if (pulled < DEVOUR_PULL_PX) return;
      // Far enough to be a pull. `grab` calls the meal off, and the body unwinds back to a blob
      // in the hand rather than snapping, so peeling it off looks like peeling it off.
      pullPending = false;
      grabbed = true;
      slime.grab(event.clientX, event.clientY);
      onErrand = false;
      slime.chaseTo(null);
      stillSince = performance.now();
      stillPoint = { x: event.clientX, y: event.clientY };
      dragVelocity.reset();
    }

    if (!grabbed) return;

    // The hold that starts a meal is reset by movement, not by the press ending, so pausing
    // mid-drag is what arms it and carrying on disarms it again.
    if (Math.hypot(event.clientX - stillPoint.x, event.clientY - stillPoint.y) > STILL_RADIUS) {
      stillPoint = { x: event.clientX, y: event.clientY };
      stillSince = performance.now();
    }

    // Chromium coalesces pointermove down to one event per animation frame, so this handler sees
    // roughly 20-60 positions a second no matter how fast the mouse actually reports. The samples
    // it merged are still available, and they are what a velocity fit needs: measured on a real
    // drag, the throttled stream gave the 90ms window barely two samples, which is the bare
    // minimum for a fit and makes the resulting throw speed noisy.
    const merged = event.getCoalescedEvents?.() ?? [];
    if (merged.length > 1) {
      for (const sample of merged) {
        dragVelocity.add(sample.clientX, sample.clientY, sample.timeStamp);
      }
    } else {
      dragVelocity.add(event.clientX, event.clientY, event.timeStamp);
    }

    const velocity = dragVelocity.current(event.timeStamp);
    slime.dragTo(event.clientX, event.clientY, velocity.vx, velocity.vy);
  });

  const finish = (event: PointerEvent) => {
    const heldFor = performance.now() - pressedAt;
    const moved = Math.hypot(event.clientX - pressedPoint.x, event.clientY - pressedPoint.y);
    pointerDown = false;
    paw.setPressed(false);
    if (pullPending) {
      pullPending = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      // A press that never became a pull. On a window that has stopped answering, that press is
      // the second consent a force kill needs; on anything else it means nothing and the meal
      // carries on. It is never a poke — the slime has its mouth full.
      if (slime.isChewing) {
        void forceSwallow();
        paw.ping(event.clientX, event.clientY);
      }
      return;
    }
    if (grabbed) {
      grabbed = false;
      const thrown = dragVelocity.release(event.timeStamp);
      slime.release(thrown.vx, thrown.vy);
      dragVelocity.reset();
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }
    // A short press that barely moved is a poke, not a throw.
    if (heldFor < 260 && moved < 6) {
      if (slime.hasLiveAlert) {
        // The bubble is part of the alert's target, so a click anywhere on it answers it.
        slime.poke(event.clientX, event.clientY);
        paw.ping(event.clientX, event.clientY);
      } else if (slime.hitTest(event.clientX, event.clientY)) {
        // In seclusion nothing hops to tell you a stage is full, so a poke on a pet that is ready
        // takes the breakthrough. Otherwise progress would be stuck behind a trip to Settings.
        if (quiet && cultivation.breakThrough()) {
          applyLook();
          requestSave(currentSave());
        }
        // Only the body gets poked. Clicks land here from the hover bubble too, and denting the
        // slime from an inch away because the pointer was over its speech bubble looks like a bug.
        slime.poke(event.clientX, event.clientY);
        paw.ping(event.clientX, event.clientY);
      }
    }
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    void invoke('open_settings');
  });
}

async function main(): Promise<void> {
  resize();

  // Started before the loop and deliberately not awaited: the loop holds off homing until this
  // settles (see `restorePending`), so the slime does not appear in one place and jump to another,
  // but a read that never comes back must not mean a pet that never appears either.
  void loadSave()
    .then((saved) => {
      restoredPoint = saved?.slime ?? null;
      if (saved) {
        cultivation.restore(saved.cultivation, saved.settledAt);
        daily.restore(saved.daily);
        seenIntro = saved.seenIntro;
        quiet = saved.quiet;
        // Rust starts out listening, so a save that says otherwise has to say so out loud.
        if (quiet) void invoke('set_quiet', { quiet: true }).catch(() => {});
      } else {
        seenIntro = false;
      }
      if (!seenIntro) {
        introUntil = performance.now() + IntroMs;
        seenIntro = true;
      }
      // Every second the machine was switched off is collected here, in one call. There is no
      // offline-earnings screen in this design because there is nothing for one to announce.
      cultivation.settle();
      applyLook();
      // Only a load that actually finished earns the right to write. A fresh install comes back
      // null, which counts; a thrown read does not, and leaves saving off for the session.
      allowSaving();
      requestSave(currentSave());
    })
    .catch((error) => {
      console.warn(`SAVE_LOAD_FAILED ${String(error)}`);
    })
    .finally(() => {
      restorePending = false;
    });
  // The pet still has to turn up if that read hangs. It simply will not save this session.
  setTimeout(() => {
    restorePending = false;
  }, 1000);

  window.setInterval(() => {
    cultivation.settle();
    // Rolled here rather than on hover: a render path is the wrong place for something that
    // changes state, even something this cheap and this idempotent.
    daily.roll(allowance(cultivation.realm, cultivation.ascensions));
    applyLook();
    if (cultivation.readyToBreakThrough) offerBreakThrough();
    if (
      slime.hasLiveAlert &&
      !slime.isAlertAcknowledged &&
      performance.now() - alertRaisedAt > AlertPatienceMs
    ) {
      slime.acknowledgeAlert();
    }
  }, CultivationTickMs);

  // Asking is also how the pet finds out anyone is there: nothing typed means a count of zero,
  // which means no dust, no chase and no frame drawn. An idle machine costs nothing.
  window.setInterval(() => {
    if (quiet) return;
    void invoke<{ presses: number; key: string | null }>('take_input')
      .then((input) => {
        if (quiet) return;
        // Capped at the rate the economy is balanced around, so leaning on a key is worth no more
        // than typing — and cannot turn the desktop into a snowstorm either.
        const counted = Math.min(input.presses, Math.ceil(ExpectedKeysPerSecond * InputPollSeconds));
        if (counted > 0) motes.spawn(counted, slime.x, slime.y, slime.blob.restRadius);
        if (input.key) {
          glyphs.spawn(input.key, slime.x, slime.y - slime.blob.restRadius * 0.4);
        }
      })
      .catch(() => {});
  }, InputPollSeconds * 1000);

  // Qi is worth a write on its own schedule: it changes every tick, so waiting for the body to
  // come to rest would mean a session spent entirely still saves nothing at all.
  window.setInterval(() => {
    cultivation.settle();
    requestSave(currentSave());
  }, HeartbeatMs);

  window.addEventListener('resize', () => {
    resize();
    const maxX = window.innerWidth - slime.blob.restRadius;
    if (homed && slime.x > maxX) {
      slime.teleportTo(Math.max(slime.blob.restRadius, maxX), slime.y);
    }
    void refreshGeometry();
  });

  // The frame loop and the pointer wiring come up first and depend on nothing asynchronous. The
  // whole point of this window is that something is visible on it; if a later await rejects, the
  // slime should still be there, just less aware of its surroundings.
  wirePointer();
  requestAnimationFrame(frame);

  // Asked once, and not awaited before the loop starts: holding the slime still for two seconds is
  // the earliest this can matter, which is far longer than a local IPC call.
  void invoke<boolean>('devour_supported')
    .then((supported) => {
      devourSupported = supported;
    })
    .catch(() => {});


  const debugHooks = window as unknown as Record<string, unknown>;
  // Handle for inspecting the simulation from a devtools console.
  debugHooks.__slime = slime;
  // Fires the full alert performance without needing anything to raise one. The animation is
  // otherwise only reachable from whatever feature happens to be driving alerts.
  debugHooks.__raiseAlert = (text = 'Something happened\nclick to dismiss') => {
    slime.raiseAlert(text, () => {
      bubble.hide();
      slime.clearAlert();
    });
  };

  // Drops a key beside the pet without anyone having typed one. The real path needs Raw Input,
  // which only exists inside Tauri, and the overlay can only be *seen* in an ordinary browser —
  // so without this the arc, the chase and the reach are all untunable.
  // Knocks dust loose without a keyboard, for tuning the stream's density and the dent it leaves.
  debugHooks.__typed = (count = 5) => {
    motes.spawn(count, slime.x, slime.y, slime.blob.restRadius);
    return motes.count;
  };

  debugHooks.__dropGlyph = (char = 'A') => {
    glyphs.spawn(String(char).toUpperCase().slice(0, 1), slime.x, slime.y - slime.blob.restRadius * 0.4);
    return glyphs.count;
  };

  // Jumps the body to any point on the ladder and repaints it immediately. Tuning the palette
  // ramp and the size growth is otherwise gated on actually playing to 大乘, which is four days.
  debugHooks.__setStage = (realm = 0, stage = 0, progress = 0, ascensions = -1) => {
    cultivation.realm = realm;
    cultivation.stage = stage;
    cultivation.qi = requirement(realm, stage) * progress;
    if (ascensions >= 0) cultivation.ascensions = ascensions;
    applyLook();
    return cultivation.describe();
  };

  // The ordeal, without four days of climbing first.
  debugHooks.__ascend = () => slime.ascend();

  // Engulfs a rectangle without needing a real window under the slime. The real path is gated on
  // Win32 calls that only exist inside Tauri, so in a plain browser - which is the only way to see
  // this overlay at all, since a transparent WebView2 window cannot be screenshotted - the morph
  // is otherwise untunable. `swallow` then fails and is handled, which exercises the unwind too.
  debugHooks.__simulateDevour = (x = 240, y = 160, width = 1000, height = 640, buried = false) => {
    devourTarget = {
      hwnd: 0,
      title: 'Simulated',
      process: 'simulated.exe',
      x,
      y,
      width,
      height,
      hung: false,
      occlusion: buried ? 1 : 0,
    };
    slime.beginDevour(0, { x, y, width, height }, buried);
  };

  await refreshGeometry();

  // Settings has no state of its own: it asks, and this window — which owns the save — answers.
  await listen('want-state', () => emitPetState());

  await listen('rebirth', () => {
    cultivation.settle();
    if (!cultivation.rebirth()) return;
    applyLook();
    requestSave(currentSave());
    emitPetState();
  });

  // Settings changes it; this window is what writes it down, because this window owns the save.
  await listen<boolean>('quiet-changed', (event) => {
    quiet = event.payload;
    if (quiet) slime.clearAlert();
    requestSave(currentSave());
  });

  await listen<{ x: number; y: number }>('cursor', (event) => {
    // Never while dragging: the DOM stream owns the gesture. Feeding both meant this 30Hz poll
    // overwrote the per-frame DOM position with a staler, coarser one, which is what actually made
    // dragging look like it was running at a low frame rate.
    if (grabbed) return;
    const local = toLocal(event.payload.x, event.payload.y);
    // Off this monitor: drop it, so the eyes settle instead of pointing at a clamped edge.
    const outside =
      local.x < -40 ||
      local.y < -40 ||
      local.x > window.innerWidth + 40 ||
      local.y > window.innerHeight + 40;
    cursor = outside ? null : local;
  });

}

// A transparent always-on-top window that draws nothing is indistinguishable from a window that
// never opened, which makes a startup failure here invisible and maddening to diagnose. Paint it.
main().catch((error) => {
  const message = String(error?.message ?? error);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = 'rgba(180, 30, 20, 0.92)';
  context.fillRect(12, 12, 640, 56);
  context.fillStyle = '#fff';
  context.font = '600 14px system-ui, sans-serif';
  context.fillText('Slime failed to start:', 24, 36);
  context.fillText(message.slice(0, 90), 24, 56);
  context.restore();
});
