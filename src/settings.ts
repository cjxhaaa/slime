import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import {
  ELEMENTS,
  MaxDepth,
  WEAPONS,
  type Way,
  Ways,
  type Weapon,
  waysOf,
} from './game/kit';
import { FEAT_IDS, featBlurb, featName } from './game/feats';
import {
  ENDONYMS,
  LOCALES,
  type Locale,
  fill,
  isLocale,
  locale,
  setLocale,
  words,
} from './i18n';
import { type LocalText, pickText } from './skins/manifest';

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
void listen<{ ascended: boolean; ascensions: number; realm: string; feats: string[] }>(
  'pet-state',
  (event) => {
    const state = event.payload;
    rebirthBox.hidden = !state.ascended;
    saveState = state;
    earned = new Set(state.feats ?? []);
    armed = false;
    paintRebirth();
    paintFeats();
  },
);

/**
 * 见闻. The overlay owns the record; this renders it.
 *
 * Everything about this section is built to be ignorable, because a list is the one thing the
 * plan's guardrails reject outright and the only honest way to have one is to make sure it never
 * asks for anything. No badge, no count anywhere but inside here, no colour that reads as
 * attention, and an unearned row that recedes rather than nags.
 */
let earned = new Set<string>();

function paintFeats(): void {
  const w = words();
  el<HTMLHeadingElement>('feats-title').textContent = w.settings.featsTitle;
  el<HTMLParagraphElement>('feats-count').textContent = fill(w.settings.featsCount, {
    done: FEAT_IDS.filter((id) => earned.has(id)).length,
    all: FEAT_IDS.length,
  });
  el<HTMLDivElement>('feats-list').replaceChildren(
    ...FEAT_IDS.map((id) => {
      const row = document.createElement('div');
      const got = earned.has(id);
      row.className = got ? 'feat' : 'feat todo';
      const name = document.createElement('b');
      name.textContent = featName(id);
      const blurb = document.createElement('span');
      // An unearned row still shows what it is called. Hiding the name behind question marks
      // would turn the list into a puzzle to be solved, which is the nagging this has to avoid.
      blurb.textContent = got ? featBlurb(id) : w.settings.featsLocked;
      row.append(name, blurb);
      return row;
    }),
  );
}
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

/**
 * The two switches.
 *
 * Only one of them carries a line of text. 静修's note stays because it is the disclosure, not a
 * description: it says the keyboard is read at all, and what turning this on actually does about
 * that. 敛息's line is empty unless the platform cannot answer, in which case it says why the
 * switch is dead rather than leaving it greyed with no reason.
 */
function paintSwitches(): void {
  const w = words();
  el<HTMLHeadingElement>('quiet-title').textContent = w.settings.quietTitle;
  el<HTMLSpanElement>('quiet-label').textContent = w.settings.quietLabel;
  el<HTMLParagraphElement>('quiet-note').textContent = w.settings.quietNote;
  el<HTMLHeadingElement>('lielow-title').textContent = w.settings.lieLowTitle;
  el<HTMLSpanElement>('lielow-label').textContent = w.settings.lieLowLabel;
  el<HTMLParagraphElement>('lielow-note').textContent = lieLowSupported
    ? ''
    : w.settings.lieLowUnsupported;
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
    paintSwitches();
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
  // A chip is always lit, including before anything has been picked, because a row of five with
  // none selected read as broken in a window that was plainly in one of them. This line is the
  // difference: it says the lit one was inherited rather than chosen.
  el<HTMLParagraphElement>('language-auto').textContent =
    chosen === null ? w.settings.languageAuto : '';
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

/**
 * 形象. The overlay reads the skins and wears one; this lists them and says which to wear.
 *
 * A skin that is in the folder but cannot be worn is listed under the chips with the reason rather
 * than left out. Somebody who just made one and does not see it needs to be told what is wrong with
 * it, and nothing else in the app is going to tell them.
 */
interface SkinRow {
  id: string;
  source: 'classic' | 'builtin' | 'mod';
  folder: string;
  name: LocalText;
  author: string | null;
  error: string | null;
}
let skinState: { chosen: string; worn: string; skins: SkinRow[] } | null = null;

function skinName(row: SkinRow): string {
  return row.source === 'classic' ? words().settings.skinClassic : pickText(row.name, locale());
}

function paintSkins(): void {
  const w = words();
  el<HTMLHeadingElement>('skin-title').textContent = w.settings.skinTitle;
  el<HTMLParagraphElement>('skin-note').textContent = w.settings.skinNote;
  el<HTMLButtonElement>('skin-folder').textContent = w.settings.skinFolder;
  el<HTMLButtonElement>('skin-rescan').textContent = w.settings.skinRescan;
  const rows = skinState?.skins ?? [];
  el<HTMLDivElement>('skin-chips').replaceChildren(
    ...rows
      .filter((row) => row.error === null)
      .map((row) => {
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.type = 'button';
        chip.textContent = skinName(row);
        if (row.author) chip.title = fill(w.settings.skinBy, { author: row.author });
        // What is on the pet, not what was asked for: the two differ while a skin is loading, and
        // for good when the one asked for turned out to be broken.
        chip.setAttribute('aria-pressed', String(row.id === skinState?.worn));
        chip.addEventListener('click', () => tell('skin-changed', row.id));
        return chip;
      }),
  );
  el<HTMLDivElement>('skin-broken').replaceChildren(
    ...rows
      .filter((row) => row.error !== null)
      .map((row) => {
        const line = document.createElement('p');
        line.className = 'muted';
        line.textContent = fill(w.settings.skinBroken, {
          name: row.folder || skinName(row),
          error: row.error ?? '',
        });
        return line;
      }),
  );
}

el<HTMLButtonElement>('skin-folder').addEventListener('click', () => {
  void invoke('open_skins_folder').catch((error) => console.warn(`SKINS_FOLDER ${String(error)}`));
});
el<HTMLButtonElement>('skin-rescan').addEventListener('click', () => tell('skins-rescan'));

void listen<{ chosen: string; worn: string; skins: SkinRow[] }>('skin-state', (event) => {
  skinState = event.payload;
  paintSkins();
});
tell('want-skins');

/** The arena's headings and buttons, which are static markup in every other section. */
function paintArena(): void {
  const w = words();
  el<HTMLHeadingElement>('arena-title').textContent = w.settings.arenaTitle;
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
  paintSkins();
  paintRebirth();
  paintArena();
  paintSwitches();
  paintFeats();
  render();
}

/**
 * The yard's kit: one weapon and up to three 五行, with a depth each.
 *
 * Chosen rather than drafted, which is the whole point of the yard — it is the one place you can
 * put a build together on purpose and watch it, instead of taking what the cards gave you.
 */
interface Pick {
  weapon: Weapon;
  depth: number;
}

interface Walk {
  way: Way;
  depth: number;
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

let arm: Pick = { weapon: '弓', depth: 1 };
let walked: Walk[] = [];

const armRow = el<HTMLDivElement>('arena-arms');
const wayGrid = el<HTMLDivElement>('arena-ways');
const depthRows = el<HTMLDivElement>('arena-picked');

// The realm picker and 护体不损 are gone. Both existed because the yard used to run a real trial;
// against posts that never move and never hit back, a realm decides nothing a depth slider does
// not already decide, and there is no damage to be protected from. **A control that changes
// nothing is worse than no control** — it invites you to believe it did something.

function walks(way: Way): boolean {
  return walked.some((w) => w.way === way);
}

function toggle(way: Way): void {
  if (walks(way)) walked = walked.filter((w) => w.way !== way);
  else if (walked.length < Ways) walked.push({ way, depth: 1 });
  render();
}

/** A depth slider with its readout, which both rows want and neither wants twice. */
function depthRow(label: string, depth: number, onChange: (next: number) => void): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'slot';
  const name = document.createElement('b');
  name.textContent = label;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = String(MaxDepth);
  slider.step = '1';
  slider.value = String(depth);
  const readout = document.createElement('span');
  readout.className = 'lv';
  readout.textContent = String(depth);
  slider.addEventListener('input', () => {
    readout.textContent = slider.value;
    onChange(Number(slider.value));
    push();
  });
  row.append(name, slider, readout);
  return row;
}

/**
 * Redrawn wholesale on every change.
 *
 * Five chips plus ten and at most four rows is nothing, and rebuilding is the version that cannot
 * drift out of sync with the kit — which is the entire failure mode of a hand-patched list.
 */
function render(): void {
  const w = words();

  armRow.replaceChildren(
    ...WEAPONS.map((key) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = w.arms[key].name;
      chip.setAttribute('aria-pressed', String(arm.weapon === key));
      chip.addEventListener('click', () => {
        // One at a time, and swapping keeps the depth — the yard is for comparing deliveries, and
        // re-dragging the slider after every swap is the thing that stops you doing that.
        arm = { weapon: key, depth: arm.depth };
        render();
      });
      return chip;
    }),
  );

  // Five phases, two ways each, laid out as a grid of pairs. The 五行 are a *shape*, and a flat
  // row of ten hides it — which was the whole complaint about the screen this replaced.
  const cells: HTMLElement[] = [];
  for (const of of ELEMENTS) {
    const label = document.createElement('span');
    label.className = 'of';
    label.textContent = w.elements[of];
    cells.push(label);
    for (const key of waysOf(of)) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = w.ways[key].name;
      chip.setAttribute('aria-pressed', String(walks(key)));
      chip.disabled = !walks(key) && walked.length >= Ways;
      chip.addEventListener('click', () => toggle(key));
      cells.push(chip);
    }
  }
  wayGrid.replaceChildren(...cells);

  el<HTMLSpanElement>('arena-arm-label').textContent = w.kit.arm;
  el<HTMLSpanElement>('arena-way-label').textContent = w.kit.way;
  el<HTMLSpanElement>('arena-depth-label').textContent = w.settings.yardDepth;
  el<HTMLSpanElement>('arena-way-count').textContent = fill(w.settings.yardTally, {
    have: walked.length,
    all: Ways,
  });

  // One slider a line, weapon first. Only what is actually carried gets one: a depth control for
  // something you have not chosen is a control that changes nothing.
  depthRows.replaceChildren(
    depthRow(w.arms[arm.weapon].name, arm.depth, (next) => {
      arm = { weapon: arm.weapon, depth: next };
    }),
    ...walked.map((held) =>
      depthRow(w.ways[held.way].name, held.depth, (next) => {
        held.depth = next;
      }),
    ),
  );

  push();
}

/**
 * Sends the kit across while a bout is already running, so a slider is felt immediately.
 *
 * The overlay ignores it when nothing is running, which is why this can be called from every
 * change handler without asking whether it is worth sending.
 */
function push(): void {
  tell('arena-loadout', { weapon: arm, ways: walked });
}

el<HTMLButtonElement>('arena-start').addEventListener('click', () => {
  tell('arena-start', { weapon: arm, ways: walked });
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
