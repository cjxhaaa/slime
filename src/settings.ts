import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { MaxLevel, SCHOOLS, SPECS, type School, activeCombos } from './game/schools';

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

// ---------------------------------------------------------------------------------------------
// 演武场
//
// Build a loadout by hand and watch it fire, without drafting for it or reaching the realm it
// belongs to. It exists because the effects are the part of this mode that needs looking at
// repeatedly, and the only way to see a particular pairing was to keep entering trials and hoping
// the draft dealt it.
//
// **It pays nothing.** No 修为, and the save is not written. That is what makes it safe to ship in
// the release build rather than hiding it behind a dev flag: it is a preview window, not a shortcut
// up the ladder, and the one debug surface this app shipped by accident before — `__setStage` and
// friends on `window` — was dangerous precisely because it *could* put the save somewhere the game
// could not reach.

const SCHOOL_NAMES: [School, string][] = SCHOOLS.map((key) => [key, SPECS[key].name]);
const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炉虚', '合体', '大乘'];

interface Slot {
  school: School;
  level: number;
  evolved: boolean;
}

/**
 * Every message out of here is wrapped.
 *
 * `render` calls `push` at the end, so an IPC that throws takes the whole screen down with it —
 * which is how a broken pipe turns into "the settings window is blank", the exact failure this
 * file already has a `showFatal` banner for. A control that cannot reach the overlay should stop
 * working; it should not stop drawing.
 */
function tell(name: string, payload?: unknown): void {
  try {
    void emit(name, payload).catch(() => {});
  } catch {
    /* The overlay is gone or this is not running inside Tauri. Nothing to do about it here. */
  }
}

const MaxSlots = 4;
let loadout: Slot[] = [{ school: '符', level: 1, evolved: false }];

const chipRow = el<HTMLDivElement>('arena-schools');
const pickedRow = el<HTMLDivElement>('arena-picked');
const comboLine = el<HTMLParagraphElement>('arena-combos');
const realmPick = el<HTMLSelectElement>('arena-realm');
const safeBox = el<HTMLInputElement>('arena-safe');

for (let realm = 1; realm < REALMS.length; realm++) {
  const option = document.createElement('option');
  option.value = String(realm);
  option.textContent = REALMS[realm];
  if (realm === 4) option.selected = true;
  realmPick.append(option);
}

function held(school: School): boolean {
  return loadout.some((slot) => slot.school === school);
}

function toggle(school: School): void {
  if (held(school)) loadout = loadout.filter((slot) => slot.school !== school);
  else if (loadout.length < MaxSlots) loadout.push({ school, level: 1, evolved: false });
  render();
}

/**
 * Redrawn wholesale on every change.
 *
 * Nine chips and at most four rows is nothing, and rebuilding is the version that cannot drift out
 * of sync with `loadout` — which is the entire failure mode of a hand-patched list.
 */
function render(): void {
  chipRow.replaceChildren(
    ...SCHOOL_NAMES.map(([key, name]) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = name;
      chip.setAttribute('aria-pressed', String(held(key)));
      chip.disabled = !held(key) && loadout.length >= MaxSlots;
      chip.addEventListener('click', () => toggle(key));
      return chip;
    }),
  );

  pickedRow.replaceChildren(
    ...loadout.map((slot) => {
      const row = document.createElement('div');
      row.className = 'slot';

      const name = document.createElement('b');
      name.textContent = SPECS[slot.school].name;

      const level = document.createElement('input');
      level.type = 'range';
      level.min = '1';
      level.max = String(MaxLevel);
      level.step = '1';
      level.value = String(slot.level);
      level.disabled = slot.evolved;

      const readout = document.createElement('span');
      readout.className = 'lv';
      const showLevel = () => {
        readout.textContent = slot.evolved ? '★' : `${slot.level} 重`;
      };
      showLevel();
      level.addEventListener('input', () => {
        slot.level = Number(level.value);
        showLevel();
        push();
      });

      const evolve = document.createElement('label');
      evolve.className = 'check inline';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = slot.evolved;
      box.addEventListener('change', () => {
        slot.evolved = box.checked;
        if (slot.evolved) slot.level = MaxLevel;
        render();
        push();
      });
      const word = document.createElement('span');
      word.textContent = '进化';
      evolve.append(box, word);

      row.append(name, level, readout, evolve);
      return row;
    }),
  );

  // Naming the pairings here is most of why this screen is worth having: it is the one place the
  // graph is visible without reading the source.
  const made = activeCombos(loadout.map((slot) => slot.school));
  comboLine.textContent = made.length
    ? `合：${made.map((combo) => `${combo.name}（${combo.effect}）`).join('、')}`
    : loadout.length > 1
      ? '这几个不相合。'
      : '';
  push();
}

/**
 * Sends the loadout across while a bout is already running, so a slider is felt immediately.
 *
 * The overlay ignores it when nothing is running, which is why this can be called from every
 * change handler without asking whether it is worth sending.
 */
function push(): void {
  tell('arena-loadout', { loadout });
}

el<HTMLButtonElement>('arena-start').addEventListener('click', () => {
  if (loadout.length === 0) return;
  tell('arena-start', {
    realm: Number(realmPick.value),
    loadout,
    safe: safeBox.checked,
  });
});

el<HTMLButtonElement>('arena-stop').addEventListener('click', () => tell('arena-stop'));
safeBox.addEventListener('change', () => push());

render();
