import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { Slime } from './slime/Slime';
import { Bubble } from './ui/Bubble';

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

/** Screen-space to canvas-space conversion state, refreshed whenever the window moves or rescales. */
let origin = { x: 0, y: 0 };
let scaleFactor = 1;
let cursor: { x: number; y: number } | null = null;

let clickThrough = true;
let grabbed = false;
let pressedAt = 0;
let pressedPoint = { x: 0, y: 0 };

let alertMeeting: Meeting | null = null;
let nextMeeting: Meeting | null = null;

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    const [position, factor] = await Promise.all([
      petWindow().outerPosition(),
      petWindow().scaleFactor(),
    ]);
    origin = { x: position.x, y: position.y };
    scaleFactor = factor || 1;
  } catch (error) {
    console.warn('could not read window geometry; assuming the monitor origin', error);
    origin = { x: 0, y: 0 };
    scaleFactor = window.devicePixelRatio || 1;
  }
}

function toLocal(screenX: number, screenY: number): { x: number; y: number } {
  return {
    x: (screenX - origin.x) / scaleFactor,
    y: (screenY - origin.y) / scaleFactor,
  };
}

async function setClickThrough(next: boolean): Promise<void> {
  if (next === clickThrough) return;
  clickThrough = next;
  await invoke('set_click_through', { through: next });
}

function countdownText(meeting: Meeting): string {
  const start = new Date(meeting.start).getTime();
  const minutes = Math.round((start - Date.now()) / 60000);
  const when =
    minutes > 1 ? `in ${minutes} min` : minutes === 1 ? 'in 1 min' : minutes === 0 ? 'now' : 'started';
  return `${meeting.title}\n${when} · click to join`;
}

function joinAlertMeeting(): void {
  const meeting = alertMeeting;
  if (!meeting?.meet_url) return;
  void invoke('open_external', { url: meeting.meet_url });
  alertMeeting = null;
  bubble.hide();
  slime.clearAlert();
}

function hoverText(): string | null {
  if (!nextMeeting) return null;
  const start = new Date(nextMeeting.start).getTime();
  const minutes = Math.round((start - Date.now()) / 60000);
  if (minutes < 0 || minutes > 240) return null;
  return `Next: ${nextMeeting.title}\nin ${minutes} min`;
}

let lastFrame = performance.now();
let bubbleRect: { x: number; y: number; width: number; height: number } | null = null;

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
let accumulator = 0;

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
  slime.x = width - 140;
  slime.y = height - 80;
  homed = true;
}

function frame(now: number): void {
  const elapsed = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;

  const width = window.innerWidth;
  const height = window.innerHeight;

  if (width < 2 * slime.blob.restRadius || height < 2 * slime.blob.restRadius) {
    requestAnimationFrame(frame);
    return;
  }
  if (!homed) homeSlime(width, height);

  accumulator += elapsed;
  // Capped so a long stall (the machine asleep, the window occluded for a minute) is dropped rather
  // than simulated in one enormous burst on the frame it wakes up.
  const steps = Math.min(MAX_CATCHUP_STEPS, Math.floor(accumulator / STEP));
  accumulator -= steps * STEP;
  for (let i = 0; i < steps; i++) {
    slime.update(STEP, { width, height, cursor });
  }

  // What the bubble says, in priority order. An alert outranks everything: it is the reason this
  // app exists, and it must not be displaced by an idle greeting.
  if (alertMeeting) {
    bubble.show(countdownText(alertMeeting));
  } else {
    const overBody = cursor ? slime.hitTest(cursor.x, cursor.y) : false;
    const text = overBody ? hoverText() : null;
    if (text) bubble.show(text);
    else bubble.hide();
  }
  bubble.update(elapsed);

  context.clearRect(0, 0, width, height);
  slime.draw(context);

  const anchorY = slime.y - slime.blob.restRadius * slime.blob.squashScale.y - 4;
  bubbleRect = bubble.layout(context, slime.x, anchorY, width);
  if (bubbleRect) bubble.draw(context, bubbleRect, slime.x, anchorY);

  // Clicks are only taken while the pointer is actually over something interactive, so the rest of
  // the desktop keeps working normally underneath a window that covers all of it.
  const wantsClicks =
    grabbed ||
    (cursor !== null &&
      (slime.hitTest(cursor.x, cursor.y) ||
        (bubbleRect !== null &&
          bubble.opacity > 0.5 &&
          cursor.x >= bubbleRect.x &&
          cursor.x <= bubbleRect.x + bubbleRect.width &&
          cursor.y >= bubbleRect.y &&
          cursor.y <= bubbleRect.y + bubbleRect.height)));
  void setClickThrough(!wantsClicks);

  requestAnimationFrame(frame);
}

function wirePointer(): void {
  canvas.addEventListener('pointerdown', (event) => {
    pressedAt = performance.now();
    pressedPoint = { x: event.clientX, y: event.clientY };
    if (slime.hitTest(event.clientX, event.clientY)) {
      grabbed = true;
      slime.grab(event.clientX, event.clientY);
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    // While dragging, trust the DOM stream over the polled one: it is not rate-limited.
    cursor = { x: event.clientX, y: event.clientY };
    if (grabbed) slime.dragTo(event.clientX, event.clientY);
  });

  const finish = (event: PointerEvent) => {
    const heldFor = performance.now() - pressedAt;
    const moved = Math.hypot(event.clientX - pressedPoint.x, event.clientY - pressedPoint.y);
    if (grabbed) {
      grabbed = false;
      slime.release();
    }
    // A short press that barely moved is a poke, not a throw.
    if (heldFor < 260 && moved < 6) {
      if (alertMeeting) {
        // The bubble is part of the alert's target, so a click anywhere on it joins.
        joinAlertMeeting();
      } else if (slime.hitTest(event.clientX, event.clientY)) {
        // Only the body gets poked. Clicks land here from the hover bubble too, and denting the
        // slime from an inch away because the pointer was over its speech bubble looks like a bug.
        slime.poke(event.clientX, event.clientY);
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
    if (homed && slime.x > maxX) slime.x = Math.max(slime.blob.restRadius, maxX);
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

  await refreshGeometry();

  await listen<{ x: number; y: number }>('cursor', (event) => {
    const local = toLocal(event.payload.x, event.payload.y);
    // Off this monitor: drop it, so the eyes settle instead of pointing at a clamped edge.
    const outside =
      local.x < -40 ||
      local.y < -40 ||
      local.x > window.innerWidth + 40 ||
      local.y > window.innerHeight + 40;
    cursor = outside ? null : local;
    if (grabbed && cursor) slime.dragTo(cursor.x, cursor.y);
  });

  await listen<Meeting>('meeting-soon', (event) => {
    const meeting = event.payload;
    if (!meeting.meet_url) return;
    alertMeeting = meeting;
    slime.raiseAlert(countdownText(meeting), joinAlertMeeting);
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
