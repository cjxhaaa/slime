import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Slime, type Bite, type DevourRect } from './slime/Slime';
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
}

interface Meeting {
  id: string;
  title: string;
  start: string;
  minutes_until: number;
  meet_url: string | null;
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

let alertMeeting: Meeting | null = null;
/**
 * Why the calendar is not being read, if it is not.
 *
 * A broken connection used to be completely silent — the reminders just never came, and the
 * first sign of trouble was a missed meeting. Shown on hover rather than announced, because
 * this is a state to discover when you look, not an interruption.
 */
let calendarProblem: string | null = null;
let nextMeeting: Meeting | null = null;

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

let stillSince = 0;
let stillPoint = { x: 0, y: 0 };
/** True while a `window_at` call is in flight, so the frame loop does not stack them up. */
let askingForPrey = false;
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
    slime.beginDevour(prey.hwnd, rect);
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

function countdownText(meeting: Meeting): string {
  const start = new Date(meeting.start).getTime();
  const minutes = Math.round((start - Date.now()) / 60000);
  const when =
    minutes > 1 ? `in ${minutes} min` : minutes === 1 ? 'in 1 min' : minutes === 0 ? 'now' : 'started';
  // Not every meeting has somewhere to click through to, and one that does not is still a
  // meeting worth being told about - promising a join that cannot happen is worse than not
  // offering one.
  const action = meeting.meet_url ? 'click to join' : 'click to dismiss';
  return `${meeting.title}\n${when} · ${action}`;
}

function joinAlertMeeting(): void {
  const meeting = alertMeeting;
  if (!meeting) return;
  // A link-less meeting still dismisses on click. Returning early here, as an earlier version
  // did, would leave the slime bouncing with no way to acknowledge it.
  if (meeting.meet_url) void invoke('open_external', { url: meeting.meet_url });
  alertMeeting = null;
  bubble.hide();
  slime.clearAlert();
}

function hoverText(): string | null {
  // Outranks the next meeting: if the calendar cannot be read, whatever was last known about
  // it is stale, and saying so is more use than quoting it.
  if (calendarProblem) return `${calendarProblem}
Right-click to open settings`;
  if (!nextMeeting) return null;
  const start = new Date(nextMeeting.start).getTime();
  const minutes = Math.round((start - Date.now()) / 60000);
  if (minutes < 0 || minutes > 240) return null;
  return `Next: ${nextMeeting.title}\nin ${minutes} min`;
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

function homeSlime(width: number, height: number): void {
  // Bottom-right, out of the way of most window content.
  slime.teleportTo(width - 140, height - 80);
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
    (alertMeeting !== null && !slime.isAlertAcknowledged) ||
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
    grabbed &&
    !askingForPrey &&
    slime.devourPhase === null &&
    now - stillSince > DEVOUR_HOLD_MS
  ) {
    void tryBeginDevour();
  }
  // Handed over exactly once, when the body finishes wrapping.
  const readyToSwallow = slime.takeSwallowRequest();
  if (readyToSwallow !== null) void runSwallow(readyToSwallow);

  // What the bubble says, in priority order. An alert outranks everything: it is the reason this
  // app exists, and it must not be displaced by an idle greeting.
  if (alertMeeting) {
    // Reaching for the pet is already the gesture that says "seen it", so hovering ends the
    // hopping without dismissing the reminder — and it stops the slime flailing at the exact
    // moment you are trying to aim at it.
    if (cursor !== null && slime.hitTest(cursor.x, cursor.y)) slime.acknowledgeAlert();
    bubble.show(countdownText(alertMeeting));
  } else {
    // What the slime is doing right now outranks what the calendar says later.
    const text = devourText(now) ?? (overBody || grabbed ? hoverText() : null);
    if (text) bubble.show(text);
    else bubble.hide();
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
      bubbleRect && bubble.opacity > 0.01 ? padRect(bubbleRect, 22) : null,
      showPaw || paw.hasRipples() ? paw.bounds() : null,
    ),
  );
  // Two regions, not their union: what has to be erased (last frame) and what has to be drawn
  // (this frame). Unioning them is only cheaper when they overlap. Once the slime is moving faster
  // than its own width per frame — which a throw does immediately — the union is mostly empty
  // space between the two, several times the area actually touched.
  const regions: Rect[] = fullRepaint
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
    (alertMeeting !== null && !slime.isAlertAcknowledged);
  const shouldPaint = animating || slime.hasSlowAnimation || wasAnimating || fullRepaint;
  wasAnimating = animating;

  if (shouldPaint && regions.length > 0) {
    context.save();
    const clip = new Path2D();
    for (const region of regions) {
      clip.rect(region.x, region.y, region.width, region.height);
      context.clearRect(region.x, region.y, region.width, region.height);
    }
    context.clip(clip);

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
      if (alertMeeting) {
        // The bubble is part of the alert's target, so a click anywhere on it joins.
        joinAlertMeeting();
        paw.ping(event.clientX, event.clientY);
      } else if (slime.hitTest(event.clientX, event.clientY)) {
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


  const debugHooks = window as unknown as Record<string, unknown>;
  // Handle for inspecting the simulation from a devtools console.
  debugHooks.__slime = slime;
  // Fires the full reminder performance without waiting for a real meeting. Tuning the alert
  // animation is otherwise gated on the calendar, which makes it untunable.
  debugHooks.__simulateMeeting = (minutes = 3, title = 'Standup') => {
    alertMeeting = {
      id: 'debug',
      title,
      start: new Date(Date.now() + minutes * 60_000).toISOString(),
      minutes_until: minutes,
      meet_url: 'https://meet.google.com/debug',
    };
    slime.raiseAlert(countdownText(alertMeeting), joinAlertMeeting);
  };

  // Engulfs a rectangle without needing a real window under the slime. The real path is gated on
  // Win32 calls that only exist inside Tauri, so in a plain browser - which is the only way to see
  // this overlay at all, since a transparent WebView2 window cannot be screenshotted - the morph
  // is otherwise untunable. `swallow` then fails and is handled, which exercises the unwind too.
  debugHooks.__simulateDevour = (x = 240, y = 160, width = 1000, height = 640) => {
    devourTarget = {
      hwnd: 0,
      title: 'Simulated',
      process: 'simulated.exe',
      x,
      y,
      width,
      height,
      hung: false,
    };
    slime.beginDevour(0, { x, y, width, height });
  };

  await refreshGeometry();

  // Restored after an over-broad cleanup regex removed both of these along with a temporary
  // debug call: it matched from that call up to the next line that was exactly "  });", which was
  // the end of this block. Nothing downstream noticed, because a missing listener is silent — the
  // Rust poller went on emitting correctly into nothing for a day.
  await listen<Meeting>('meeting-soon', (event) => {
    alertMeeting = event.payload;
    slime.raiseAlert(countdownText(event.payload), joinAlertMeeting);
  });

  await listen<string | null>('calendar-problem', (event) => {
    calendarProblem = event.payload;
  });

  await listen<Meeting[]>('meetings', (event) => {
    nextMeeting = event.payload.find((meeting) => meeting.minutes_until >= 0) ?? null;
    // An alert whose meeting has drifted well past its start has done its job or been ignored;
    // either way the slime should stop bouncing about it.
    if (alertMeeting) {
      const started = (Date.now() - new Date(alertMeeting.start).getTime()) / 60000;
      if (started > 3) {
        alertMeeting = null;
        bubble.hide();
        slime.clearAlert();
      }
    }
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
