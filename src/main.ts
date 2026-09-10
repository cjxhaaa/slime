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
const appWindow = getCurrentWindow();

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
  const [position, factor] = await Promise.all([
    appWindow.outerPosition(),
    appWindow.scaleFactor(),
  ]);
  origin = { x: position.x, y: position.y };
  scaleFactor = factor || 1;
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

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  const width = window.innerWidth;
  const height = window.innerHeight;

  slime.update(dt, { width, height, cursor });

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
  bubble.update(dt);

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
      if (alertMeeting) joinAlertMeeting();
      else slime.poke(event.clientX, event.clientY);
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
  await refreshGeometry();

  // Start it resting near the bottom-right, out of the way of most window content.
  slime.x = window.innerWidth - 140;
  slime.y = window.innerHeight - 80;

  window.addEventListener('resize', () => {
    resize();
    void refreshGeometry();
  });

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

  wirePointer();
  requestAnimationFrame(frame);
}

void main();
