import { invoke } from '@tauri-apps/api/core';

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
