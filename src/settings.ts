import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';

// A settings page that fails silently is indistinguishable from one that never loaded, which is
// exactly the hole this fell into: a blank white window with no way to tell whether the document,
// the stylesheet, the script or the IPC was the thing that broke. Anything thrown from here on is
// painted into the page and echoed to the dev log.
console.warn(`SETTINGS_BOOT url=${location.href} ready=${document.readyState}`);
window.addEventListener('error', (event) => {
  console.warn(`SETTINGS_ERROR ${event.message} @ ${event.filename}:${event.lineno}`);
  showFatal(`${event.message}
${event.filename}:${event.lineno}`);
});
window.addEventListener('unhandledrejection', (event) => {
  console.warn(`SETTINGS_REJECTION ${String(event.reason)}`);
  showFatal(String(event.reason));
});

function showFatal(message: string): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'margin:12px;padding:12px;border-radius:8px;background:#c0483f;color:#fff;' +
    'font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap;position:relative;z-index:99';
  box.textContent = `Settings failed to start:
${message}`;
  document.body.prepend(box);
}

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const quitButton = el<HTMLButtonElement>('quit');
quitButton.addEventListener('click', () => void invoke('quit_app'));

const rebirthBox = el<HTMLElement>('rebirth-box');
const rebirthState = el<HTMLParagraphElement>('rebirth-state');
const rebirthButton = el<HTMLButtonElement>('rebirth');
const rebirthWarn = el<HTMLParagraphElement>('rebirth-warn');

/**
 * The pet window owns the save, so it owns the truth. This one asks on open and is told on change.
 *
 * The section stays hidden until there is something to do in it: a permanently greyed-out button
 * for a thing you cannot do for four days is exactly the kind of furniture the rest of this app
 * refuses to put on screen.
 */
void listen<{ ascended: boolean; ascensions: number; realm: string }>('pet-state', (event) => {
  const state = event.payload;
  rebirthBox.hidden = !state.ascended;
  rebirthState.textContent = `${state.realm} · 已飞升 ${state.ascensions} 次 · 产出 ×${(1 + 0.5 * state.ascensions).toFixed(1)}`;
  armed = false;
  rebirthButton.textContent = '转生重历';
  rebirthWarn.textContent = '';
});
void emit('want-state');

/**
 * Two clicks, because this is the one irreversible thing in the app.
 *
 * The same shape the force kill uses: the first press is the sentence, the second is the signature.
 * It disarms itself so a confirmation cannot sit around waiting to be triggered by accident later.
 */
let armed = false;
let armedTimer: number | null = null;

rebirthButton.addEventListener('click', () => {
  if (!armed) {
    armed = true;
    rebirthButton.textContent = '确定？再点一次';
    rebirthWarn.textContent = '当前境界、层数与修为会清零，无法撤销。';
    if (armedTimer !== null) window.clearTimeout(armedTimer);
    armedTimer = window.setTimeout(() => {
      armed = false;
      rebirthButton.textContent = '转生重历';
      rebirthWarn.textContent = '';
    }, 5000);
    return;
  }
  armed = false;
  if (armedTimer !== null) window.clearTimeout(armedTimer);
  rebirthButton.textContent = '转生重历';
  rebirthWarn.textContent = '';
  void emit('rebirth');
});

const quietBox = el<HTMLInputElement>('quiet');

// Rust owns whether the keyboard is being read, because it is the side that actually stops reading
// it. This window renders that answer; it does not keep its own.
void invoke<boolean>('quiet_state')
  .then((quiet) => {
    quietBox.checked = quiet;
  })
  .catch(() => {});

quietBox.addEventListener('change', () => {
  const quiet = quietBox.checked;
  void invoke('set_quiet', { quiet }).catch(() => {});
  // The overlay owns the save file — two windows writing it would take turns losing. So it is told
  // rather than asked, and it is the one that writes the setting down.
  void emit('quiet-changed', quiet);
});
