import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
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
import { Slime } from './slime/Slime';
import type { Skin } from './slime/skin';
import { listSkins, loadSkin } from './skins/catalog';
import { lookFor } from './game/appearance';
import { Cultivation } from './game/cultivation';
import { drawWayIcon, drawWeaponIcon, wayTint } from './ui/icons';
import { type Sheet, armsNote, waySheet, weaponSheet } from './ui/codex';
import { GRADES, Tiers, tintOf } from './game/gear';
import type { Mood } from './slime/Slime';

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

/**
 * The window has no system frame, so it closes itself: the seal in the plaque's corner, or Esc.
 * Closing only hides it — Rust turns the close into a hide, because the window is made once at
 * startup and could not be made again (see `toggle_settings` in lib.rs).
 */
function closeWindow(): void {
  try {
    void getCurrentWindow().close().catch(() => {});
  } catch {
    /* Not inside Tauri. */
  }
}
el<HTMLButtonElement>('close').addEventListener('click', closeWindow);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeWindow();
});

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
const petStateHeard = listen<{ ascended: boolean; ascensions: number; realm: string; realmLevel?: number; feats: string[] }>(
  'pet-state',
  (event) => {
    const state = event.payload;
    rebirthBox.hidden = !state.ascended;
    saveState = state;
    earned = new Set(state.feats ?? []);
    armed = false;
    el<HTMLParagraphElement>('hero-realm').textContent = state.realm;
    if (typeof state.realmLevel === 'number' && state.realmLevel !== realmLevel) {
      realmLevel = state.realmLevel;
      paintPets();
    }
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
  const done = FEAT_IDS.filter((id) => earned.has(id)).length;
  el<HTMLParagraphElement>('feats-count').textContent = fill(w.settings.featsCount, {
    done,
    all: FEAT_IDS.length,
  });
  el<HTMLElement>('feats-meter').style.width = `${(100 * done) / Math.max(1, FEAT_IDS.length)}%`;
  // Earned first, so the wall opens on what has been done rather than on a field of gaps.
  const order = [...FEAT_IDS].sort((a, b) => Number(earned.has(b)) - Number(earned.has(a)));
  el<HTMLDivElement>('feats-list').replaceChildren(
    ...order.map((id) => {
      const row = document.createElement('div');
      const got = earned.has(id);
      row.className = got ? 'feat' : 'feat todo';
      // A medal with the feat's first character on it — gold when earned, a grey disc when not.
      const medal = document.createElement('i');
      medal.className = 'medal';
      medal.textContent = Array.from(featName(id))[0] ?? '';
      const name = document.createElement('b');
      name.textContent = featName(id);
      name.title = featName(id);
      const blurb = document.createElement('span');
      // An unearned one still shows what it is called. Hiding the name behind question marks
      // would turn the wall into a puzzle to be solved, which is the nagging this has to avoid.
      blurb.textContent = got ? featBlurb(id) : w.settings.featsLocked;
      row.append(medal, name, blurb);
      return row;
    }),
  );
}
// Asked only once the answer has somewhere to land: `listen` registers asynchronously, and a
// question sent before it has finished is answered to nobody — the window then opened on a blank
// realm and an empty record until something else happened to change.
void petStateHeard.then(() => emit('want-state')).catch(() => {});

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
        // A card with the slime drawn in it, wearing that skin — the thing being chosen, rather
        // than its name in a pill.
        const card = document.createElement('button');
        card.className = 'skin';
        card.type = 'button';
        const worn = row.id === skinState?.worn;
        const thumb = document.createElement('canvas');
        thumb.dataset.skin = row.id;
        const label = document.createElement('span');
        label.textContent = skinName(row);
        card.append(thumb, label);
        if (row.author) card.title = fill(w.settings.skinBy, { author: row.author });
        // What is on the pet, not what was asked for: the two differ while a skin is loading, and
        // for good when the one asked for turned out to be broken.
        card.setAttribute('aria-pressed', String(worn));
        card.dataset.worn = w.settings.skinWorn;
        card.addEventListener('click', () => tell('skin-changed', row.id));
        return card;
      }),
  );
  paintPets();
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

const skinStateHeard = listen<{ chosen: string; worn: string; skins: SkinRow[] }>('skin-state', (event) => {
  skinState = event.payload;
  paintSkins();
});
void skinStateHeard.then(() => tell('want-skins')).catch(() => {});

/** The arena's headings and buttons, which are static markup in every other section. */
function paintArena(): void {
  const w = words();
  el<HTMLHeadingElement>('arena-title').textContent = w.settings.arenaTitle;
  el<HTMLButtonElement>('arena-start').textContent = w.settings.start;
  el<HTMLButtonElement>('arena-stop').textContent = w.settings.stop;
  el<HTMLButtonElement>('quit').textContent = w.settings.quitLabel;
}

// ---------------------------------------------------------------------------------------------
// The pet, drawn here: the hero at the top and a slime on every skin card.
//
// The same `Slime` the overlay draws, held still rather than simulated — what a card has to show is
// what the skin looks like, and the hero only has to answer a hover and a poke. Skins are loaded
// once each, by id, from the same catalogue the overlay reads.

let realmLevel = 0;
const skinCache = new Map<string, Promise<Skin | null>>();
let skinIds: Promise<Map<string, Awaited<ReturnType<typeof listSkins>>[number]>> | null = null;

function skinFor(id: string): Promise<Skin | null> {
  let found = skinCache.get(id);
  if (!found) {
    skinIds ??= listSkins().then((all) => new Map(all.map((entry) => [entry.id, entry])));
    found = skinIds
      .then((all) => {
        const entry = all.get(id);
        return entry && !entry.error ? loadSkin(entry) : null;
      })
      .catch(() => null);
    skinCache.set(id, found);
  }
  return found;
}

/**
 * One slime into a canvas: sized to the canvas's CSS box, scaled by `zoom`, standing a little below
 * the middle so the ears and the hats some skins wear have room above it.
 */
function drawPet(canvas: HTMLCanvasElement, skin: Skin, mood: Mood, zoom: number): void {
  const box = canvas.getBoundingClientRect();
  const width = box.width || canvas.width;
  const height = box.height || canvas.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
  context.clearRect(0, 0, width / zoom, height / zoom);
  const pet = new Cultivation(0);
  pet.realm = realmLevel;
  const slime = new Slime(width / 2 / zoom, (height * 0.62) / zoom);
  slime.setSkin(skin);
  slime.setLook(lookFor(pet, skin.realms));
  slime.mood = mood;
  slime.beginFrame(1);
  slime.draw(context);
}

const heroCanvas = el<HTMLCanvasElement>('hero-pet');
let heroMood: Mood = 'idle';
let heroPoke: number | null = null;

function paintHero(): void {
  const worn = skinState?.worn;
  if (!worn) return;
  void skinFor(worn).then((skin) => {
    if (skin) drawPet(heroCanvas, skin, heroMood, 0.55);
  });
}

function paintPets(): void {
  paintHero();
  for (const thumb of document.querySelectorAll<HTMLCanvasElement>('canvas[data-skin]')) {
    const id = thumb.dataset.skin ?? '';
    void skinFor(id).then((skin) => {
      if (skin) drawPet(thumb, skin, id === skinState?.worn ? 'happy' : 'idle', 0.5);
    });
  }
}

// It notices you: happy under the pointer, startled by a poke, back to itself when you leave.
heroCanvas.addEventListener('pointerenter', () => {
  heroMood = 'happy';
  paintHero();
});
heroCanvas.addEventListener('pointerleave', () => {
  heroMood = 'idle';
  paintHero();
});
heroCanvas.addEventListener('click', () => {
  heroMood = 'surprised';
  heroCanvas.classList.remove('poked');
  void heroCanvas.offsetWidth;
  heroCanvas.classList.add('poked');
  paintHero();
  if (heroPoke !== null) window.clearTimeout(heroPoke);
  heroPoke = window.setTimeout(() => {
    heroMood = heroCanvas.matches(':hover') ? 'happy' : 'idle';
    paintHero();
  }, 700);
});

// ---------------------------------------------------------------------------------------------
// Tabs. Remembered per machine, because opening on the tab you were last in is what a settings
// window that gets opened twice a week should do; forgotten without complaint where storage is not
// there.

type Tab = 'look' | 'general' | 'codex' | 'record' | 'yard';
/**
 * 演武场 only in a dev build. It is a tool for looking at one effect over and over, which is a
 * developer's job; what a player wants from this window is the codex.
 */
const ShowYard = import.meta.env.DEV;
const Tabs: Tab[] = ShowYard ? ['look', 'general', 'codex', 'record', 'yard'] : ['look', 'general', 'codex', 'record'];
el<HTMLButtonElement>('tab-yard').hidden = !ShowYard;
document.querySelector<HTMLElement>('.tabs')?.style.setProperty('grid-template-columns', `repeat(${Tabs.length}, 1fr)`);
let tab: Tab = 'look';
try {
  const kept = localStorage.getItem('settings-tab');
  if (kept && (Tabs as string[]).includes(kept)) tab = kept as Tab;
} catch {
  /* No storage; open on the first tab. */
}

function showTab(next: Tab): void {
  tab = next;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === next));
  }
  for (const panel of document.querySelectorAll<HTMLElement>('.panel')) {
    panel.hidden = panel.dataset.panel !== next;
  }
  hideTip();
  // Each hall opens at its top, not wherever the last one was scrolled to.
  document.querySelector('main')?.scrollTo(0, 0);
  try {
    localStorage.setItem('settings-tab', next);
  } catch {
    /* Not remembered, which is fine. */
  }
  // A canvas in a hidden panel has no size to draw at, so the cards are drawn when they show.
  if (next === 'look') paintPets();
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.tabs button')) {
  button.addEventListener('click', () => showTab(button.dataset.tab as Tab));
}

/** Every section title wears a seal of its own first character. Drawn by CSS from this attribute. */
function sealTitles(): void {
  for (const title of document.querySelectorAll<HTMLElement>('h2')) {
    title.dataset.seal = Array.from(title.textContent ?? '')[0] ?? '';
  }
}

function paintTabs(): void {
  const w = words();
  el<HTMLElement>('abode-title').textContent = w.settings.abodeTitle;
  el<HTMLButtonElement>('tab-look').textContent = w.settings.skinTitle;
  el<HTMLButtonElement>('tab-general').textContent = w.settings.generalTitle;
  el<HTMLButtonElement>('tab-yard').textContent = w.settings.arenaTitle;
  el<HTMLButtonElement>('tab-codex').textContent = w.settings.codexTitle;
  el<HTMLButtonElement>('tab-record').textContent = w.settings.featsTitle;
}

/** Everything in this window that has words in it. */
function paintAll(): void {
  // Tells the browser what it is laying out, which is what picks the right CJK glyph forms when a
  // font has to be fallen back to — the shapes of 直 and 類 are not the same in all three.
  document.documentElement.lang = locale();
  paintTabs();
  paintLanguage();
  paintSkins();
  paintRebirth();
  paintArena();
  paintSwitches();
  paintFeats();
  paintCodex();
  render();
  sealTitles();
}

/**
 * 图鉴. Every weapon and every way: its icon, its name and what it does in plain words with the
 * real numbers; above them the grade ladder and the merge rules, written as instructions. Hovering
 * an entry (or focusing it) shows how it grows, grade by grade, in a table.
 */
function paintCodex(): void {
  const w = words();
  el<HTMLHeadingElement>('codex-grades-title').textContent = w.settings.codexGrades;
  el<HTMLHeadingElement>('codex-arms-title').textContent = w.kit.arm;
  el<HTMLHeadingElement>('codex-ways-title').textContent = w.kit.way;
  el<HTMLParagraphElement>('codex-arms-note').textContent = armsNote();
  el<HTMLParagraphElement>('codex-ways-note').textContent = w.codex.waysNote;

  const ladder: HTMLElement[] = [];
  for (let tier = 1; tier <= Tiers; tier++) {
    if (tier > 1) {
      const step = document.createElement('i');
      step.className = 'step';
      ladder.push(step);
    }
    const rung = document.createElement('span');
    rung.className = 'rung';
    rung.style.setProperty('--grade', GRADES[tier - 1].tint);
    rung.title = fill(w.codex.grade, { n: tier });
    const label = document.createElement('small');
    label.textContent = fill(w.codex.grade, { n: tier });
    rung.append(icon((context, size) => drawWeaponIcon(context, '剑', size, tintOf(tier)), 30), label);
    ladder.push(rung);
  }
  el<HTMLDivElement>('codex-ladder').replaceChildren(...ladder);
  el<HTMLOListElement>('codex-merge').replaceChildren(
    ...w.codex.mergeHow.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }),
  );

  const card = (art: HTMLCanvasElement, name: string, sheet: Sheet): HTMLElement => {
    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.tabIndex = 0;
    const title = document.createElement('b');
    title.textContent = name;
    const line = document.createElement('span');
    line.textContent = sheet.text;
    entry.append(art, title, line);
    const show = () => showTip(entry, name, sheet);
    entry.addEventListener('pointerenter', show);
    entry.addEventListener('focus', show);
    entry.addEventListener('pointerleave', hideTip);
    entry.addEventListener('blur', hideTip);
    return entry;
  };
  el<HTMLDivElement>('codex-arms').replaceChildren(
    ...WEAPONS.map((key) =>
      card(icon((context, size) => drawWeaponIcon(context, key, size, tintOf(1)), 40), w.arms[key].name, weaponSheet(key)),
    ),
  );
  const ways: HTMLElement[] = [];
  for (const of of ELEMENTS) {
    const seal = document.createElement('span');
    seal.className = 'of';
    seal.textContent = w.elements[of];
    ways.push(seal);
    for (const key of waysOf(of)) {
      ways.push(card(icon((context, size) => drawWayIcon(context, key, size, wayTint(key)), 32), w.ways[key].name, waySheet(key)));
    }
  }
  el<HTMLDivElement>('codex-ways').replaceChildren(...ways);
}

const tip = el<HTMLDivElement>('codex-tip');

/**
 * The grade table for one entry, floated beside it: a row a grade, with the grade's colour in the
 * first column — the same colour the item wears on the bar at that grade.
 */
function showTip(anchor: HTMLElement, name: string, sheet: Sheet): void {
  const w = words();
  const title = document.createElement('b');
  title.textContent = name;
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const label of ['', ...sheet.columns.map((key) => w.codex.stat[key])]) {
    const cell = document.createElement('th');
    cell.textContent = label;
    head.append(cell);
  }
  table.append(head);
  sheet.rows.forEach((values, i) => {
    const row = document.createElement('tr');
    const grade = document.createElement('td');
    const swatch = document.createElement('i');
    swatch.style.background = GRADES[i].tint;
    grade.append(swatch, fill(w.codex.grade, { n: i + 1 }));
    row.append(grade);
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    table.append(row);
  });
  const foot = document.createElement('small');
  foot.textContent = w.codex.hoverHint;
  tip.replaceChildren(title, table, foot);
  tip.hidden = false;

  // Below the entry if it fits, above it if not, and never off the side of the window.
  const box = anchor.getBoundingClientRect();
  const frame = document.querySelector('.frame')?.getBoundingClientRect() ?? document.body.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const left = Math.max(frame.left + 8, Math.min(frame.right - width - 8, box.left + box.width / 2 - width / 2));
  const below = box.bottom + 6;
  const top = below + height <= frame.bottom - 8 ? below : Math.max(frame.top + 8, box.top - height - 6);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideTip(): void {
  tip.hidden = true;
}

// A scroll moves the entry out from under its table; the table goes rather than floating free.
document.querySelector('main')?.addEventListener('scroll', hideTip, { passive: true });

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

/** A small icon for a chip, drawn by the same code the bar draws its items with. */
function icon(draw: (context: CanvasRenderingContext2D, size: number) => void, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  const context = canvas.getContext('2d');
  if (context) {
    context.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    draw(context, size);
  }
  return canvas;
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
      chip.append(icon((context, size) => drawWeaponIcon(context, key, size, tintOf(1)), 34), w.arms[key].name);
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
      chip.append(icon((context, size) => drawWayIcon(context, key, size, wayTint(key)), 22), w.ways[key].name);
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
const localeHeard = listen<{ locale: Locale; chosen: string | null }>('locale-state', (event) => {
  chosen = isLocale(event.payload.chosen) ? event.payload.chosen : null;
  setLocale(event.payload.locale);
  paintAll();
});
void localeHeard.then(() => tell('want-locale')).catch(() => {});

paintAll();
showTab(tab);
