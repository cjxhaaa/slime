import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { MaxLevel, SCHOOLS, type School, activeCombos, activeTriads } from './game/schools';
import {
  ENDONYMS,
  LOCALES,
  type Locale,
  combo as comboWords,
  fill,
  isLocale,
  locale,
  setLocale,
  triad as triadWords,
  words,
} from './i18n';

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
  saveState = state;
  armed = false;
  paintRebirth();
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
/** The last thing the overlay said about the save, kept so a language change can redraw it. */
let saveState: { ascensions: number; realm: string } | null = null;

/**
 * The rebirth section, in whatever language and whatever state the two clicks are in.
 *
 * `armed` is read here rather than reset, because a language change must not quietly un-arm a
 * confirmation that is on screen — the button would go back to saying "begin again" while the
 * next click still went through.
 */
function paintRebirth(): void {
  const w = words();
  el<HTMLHeadingElement>('rebirth-title').textContent = w.settings.rebirthTitle;
  el<HTMLParagraphElement>('rebirth-blurb').textContent = w.settings.rebirthBlurb;
  rebirthButton.textContent = armed ? w.settings.rebirthConfirm : w.settings.rebirthButton;
  rebirthWarn.textContent = armed ? w.settings.rebirthWarn : '';
  rebirthState.textContent = saveState
    ? fill(w.settings.rebirthState, {
        realm: saveState.realm,
        times: saveState.ascensions,
        rate: (1 + 0.5 * saveState.ascensions).toFixed(1),
      })
    : '';
}

/**
 * Whether this platform can tell who owns the screen. Starts true so the row is not momentarily
 * greyed on every open while the answer is in flight.
 */
let lieLowSupported = true;

/** The sections that are nothing but prose, plus the two switches' own words. */
function paintProse(): void {
  const w = words();
  el<HTMLHeadingElement>('quiet-title').textContent = w.settings.quietTitle;
  el<HTMLSpanElement>('quiet-label').textContent = w.settings.quietLabel;
  el<HTMLParagraphElement>('quiet-blurb').textContent = w.settings.quietBlurb;
  el<HTMLParagraphElement>('quiet-note').textContent = w.settings.quietNote;
  el<HTMLHeadingElement>('lielow-title').textContent = w.settings.lieLowTitle;
  el<HTMLSpanElement>('lielow-label').textContent = w.settings.lieLowLabel;
  el<HTMLParagraphElement>('lielow-blurb').textContent = w.settings.lieLowBlurb;
  el<HTMLParagraphElement>('lielow-note').textContent = lieLowSupported
    ? ''
    : w.settings.lieLowUnsupported;
  el<HTMLHeadingElement>('behaviour-title').textContent = w.settings.behaviourTitle;
  el<HTMLParagraphElement>('behaviour-drag').textContent = w.settings.behaviourDrag;
  el<HTMLParagraphElement>('behaviour-keys').textContent = w.settings.behaviourKeys;
  el<HTMLParagraphElement>('behaviour-eat').textContent = w.settings.behaviourEat;
  el<HTMLParagraphElement>('behaviour-quit').textContent = w.settings.behaviourQuit;
}

rebirthButton.addEventListener('click', () => {
  if (!armed) {
    armed = true;
    paintRebirth();
    if (armedTimer !== null) window.clearTimeout(armedTimer);
    armedTimer = window.setTimeout(() => {
      armed = false;
      paintRebirth();
    }, 5000);
    return;
  }
  armed = false;
  if (armedTimer !== null) window.clearTimeout(armedTimer);
  paintRebirth();
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

/**
 * 敛息. Rust owns both the detection and the window, so this is a switch and nothing more.
 *
 * Asked rather than assumed, like `quiet` above: Rust starts with it on, the overlay pushes the
 * saved value at startup, and this window renders whatever the answer turned out to be rather than
 * keeping a third copy that can disagree with the other two.
 */
const lieLowBox = el<HTMLInputElement>('lielow');

void invoke<boolean>('lie_low_supported')
  .then((supported) => {
    lieLowBox.disabled = !supported;
    lieLowSupported = supported;
    paintProse();
  })
  .catch(() => {});

void invoke<boolean>('lie_low_state')
  .then((on) => {
    lieLowBox.checked = on;
  })
  .catch(() => {});

lieLowBox.addEventListener('change', () => {
  const lieLow = lieLowBox.checked;
  void invoke('set_lie_low', { lieLow }).catch(() => {});
  // Same division as quiet: Rust acts on it, the overlay writes it down.
  void emit('lie-low-changed', lieLow);
});

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
// Build a loadout by hand and watch it fire **against posts that stand still**. It exists because
// the effects are the part of this mode that needs looking at repeatedly, and the only way to see a
// particular pairing was to keep entering trials and hoping the draft dealt it.
//
// It opened a real 历练 at first, which was the wrong shape: looking at one effect repeatedly meant
// fighting a game about it — waiting for something to walk into range, losing what you were watching
// when it died, and being thrown out after ninety seconds. Three rings of posts, no clock, no
// opponent.
//
// **It pays nothing.** No 修为, and the save is not written. That is what makes it safe to ship in
// the release build rather than hiding it behind a dev flag: it is a preview window, not a shortcut
// up the ladder, and the one debug surface this app shipped by accident before — `__setStage` and
// friends on `window` — was dangerous precisely because it *could* put the save somewhere the game
// could not reach.

/**
 * The language row.
 *
 * Every label is the language's **own name for itself**, never translated — a language menu is
 * read by somebody who cannot yet read the rest of the app, so 「日本語」 has to say 日本語 whatever
 * the app is currently set to.
 */
const languageChips = el<HTMLDivElement>('language-chips');
let chosen: Locale | null = null;

function paintLanguage(): void {
  const w = words();
  el<HTMLHeadingElement>('language-title').textContent = w.settings.languageTitle;
  // The blurb says the language is inherited; the lit chip says *which* one was inherited. Lighting
  // nothing while following the system — which is the state everybody starts in — read as a row of
  // five buttons none of which was selected, in a window that was plainly in one of them.
  el<HTMLParagraphElement>('language-blurb').textContent =
    chosen === null
      ? `${w.settings.languageBlurb} ${w.settings.languageAuto}`
      : w.settings.languageBlurb;
  const lit = locale();
  languageChips.replaceChildren(
    ...LOCALES.map((tag) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = ENDONYMS[tag];
      chip.setAttribute('aria-pressed', String(tag === lit));
      chip.addEventListener('click', () => {
        chosen = tag;
        setLocale(tag);
        tell('locale-changed', tag);
        paintAll();
      });
      return chip;
    }),
  );
}

/** The arena's headings and buttons, which are static markup in every other section. */
function paintArena(): void {
  const w = words();
  el<HTMLHeadingElement>('arena-title').textContent = w.settings.arenaTitle;
  el<HTMLParagraphElement>('arena-blurb').textContent = w.settings.arenaBlurb;
  el<HTMLParagraphElement>('arena-rings').textContent = w.settings.arenaRings;
  el<HTMLButtonElement>('arena-start').textContent = w.settings.start;
  el<HTMLButtonElement>('arena-stop').textContent = w.settings.stop;
  el<HTMLButtonElement>('quit').textContent = w.settings.quitLabel;
}

/** Everything in this window that has words in it. */
function paintAll(): void {
  // Tells the browser what it is laying out, which is what picks the right CJK glyph forms when a
  // font has to be fallen back to — the shapes of 直 and 類 are not the same in all three.
  document.documentElement.lang = locale();
  paintLanguage();
  paintRebirth();
  paintArena();
  paintProse();
  render();
}

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

// The realm picker and 护体不损 are gone. Both existed because the yard used to run a real trial;
// against posts that never move and never hit back, a realm decides nothing a level slider does
// not already decide, and there is no damage to be protected from. **A control that changes
// nothing is worse than no control** — it invites you to believe it did something.

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
  const w = words();
  chipRow.replaceChildren(
    ...SCHOOLS.map((key) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = w.schools[key].name;
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
      name.textContent = w.schools[slot.school].name;

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
        readout.textContent = slot.evolved ? '★' : String(slot.level);
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
      word.textContent = w.draft.evolve.replace('★ ', '');
      evolve.append(box, word);

      row.append(name, level, readout, evolve);
      return row;
    }),
  );

  // Naming the pairings here is most of why this screen is worth having: it is the one place the
  // graph is visible without reading the source.
  const schools = loadout.map((slot) => slot.school);
  const made = activeCombos(schools);
  const forms = activeTriads(schools);
  // 三合 first, because a build that has one is defined by it — it costs three of the four slots.
  const lines: string[] = [];
  const item = (named: { name: string; blurb: string }): string =>
    fill(w.settings.listItem, { name: named.name, blurb: named.blurb });
  for (const form of forms) {
    lines.push(`${w.settings.triadLabel} · ${item(triadWords(form.of.join('')))}`);
  }
  if (made.length) {
    const said = made.map((c) => item(comboWords(c.pair.join(''))));
    lines.push(`${w.settings.combosLabel}${w.settings.listColon}${said.join(w.settings.listSep)}`);
  }
  comboLine.textContent = lines.length
    ? lines.join('\n')
    : loadout.length > 1
      ? w.settings.noCombo
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
  tell('arena-start', { loadout });
});

el<HTMLButtonElement>('arena-stop').addEventListener('click', () => tell('arena-stop'));

render();

/**
 * Settings does not choose the language; it displays the choice and sends changes.
 *
 * Same rule as 静修 and the rebirth: the overlay owns the save, so it owns the answer. This window
 * asks on open and is told on change, so a change made here and a change made anywhere else arrive
 * by the same path.
 */
void listen<{ locale: Locale; chosen: string | null }>('locale-state', (event) => {
  chosen = isLocale(event.payload.chosen) ? event.payload.chosen : null;
  setLocale(event.payload.locale);
  paintAll();
});
tell('want-locale');

paintAll();
