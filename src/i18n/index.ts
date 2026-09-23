/**
 * Which language, and how the rest of the app asks for a string.
 *
 * ## It is read, never awaited
 *
 * `t()` is called from inside the draw loop — the draft card's wording, the menu's rows, a bubble's
 * two lines — so it has to be a **plain synchronous lookup against an object already in memory**.
 * That rules out the usual shape where a locale is fetched and the UI re-renders when it lands: all
 * five dictionaries are bundled, which costs a few kilobytes and buys a function that can be called
 * sixty times a second without anybody thinking about it.
 *
 * ## The pet window owns it, like everything else
 *
 * Settings displays the choice and sends it; the overlay writes it into the save, because the
 * overlay owns the save. Same rule as 静修 and the rebirth. Both windows then set their own copy,
 * so a change is felt in both at once without either reloading.
 *
 * ## Falling back
 *
 * A missing key returns the **simplified Chinese** string rather than the key, because that is the
 * source text: a half-translated dictionary should read as a half-translated game, not as
 * `draft.pairsWith` on a card. The checks assert that no dictionary is missing anything, so this
 * path should be dead — it exists for the release where somebody adds a key and forgets four files.
 */
import type { Dictionary, Locale } from './types.js';
import { LOCALES } from './types.js';
import { zhHans } from './zh-Hans.js';
import { zhHant } from './zh-Hant.js';
import { en } from './en.js';
import { ja } from './ja.js';
import { ko } from './ko.js';

export * from './types.js';

export const DICTIONARIES: Record<Locale, Dictionary> = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  en,
  ja,
  ko,
};

/**
 * What the system asks for, mapped onto the five.
 *
 * Chinese is the case that needs care. `zh-TW`, `zh-HK` and `zh-MO` are traditional; plain `zh` and
 * `zh-CN` are simplified; and `zh-Hant` may arrive with no region at all. Anything unrecognised
 * lands on English, which is the safest default for a language nobody here speaks — a reader who
 * gets English can at least find the language menu.
 */
export function localeFor(tags: readonly string[]): Locale {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('zh')) {
      const traditional =
        tag.includes('hant') || tag.includes('tw') || tag.includes('hk') || tag.includes('mo');
      return traditional ? 'zh-Hant' : 'zh-Hans';
    }
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

/** Whether a stored value is still one of the five. Guards a save written by an older build. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

let current: Locale = 'zh-Hans';
let dictionary: Dictionary = zhHans;
const listeners = new Set<() => void>();

export function locale(): Locale {
  return current;
}

/** Sets it and tells anything that is holding rendered text. Returns whether it actually changed. */
export function setLocale(next: Locale): boolean {
  if (next === current) return false;
  current = next;
  dictionary = DICTIONARIES[next];
  for (const listener of listeners) listener();
  return true;
}

/** Called when the language changes, so a canvas that caches laid-out text can drop it. */
export function onLocaleChange(listener: () => void): void {
  listeners.add(listener);
}

/**
 * The dictionary, for the places that want a whole table rather than one string.
 *
 * Returned live rather than copied: callers read it per frame and a copy per call would be the one
 * allocation in the draw loop that nothing else here makes.
 */
export function words(): Dictionary {
  return dictionary;
}

/** The source text, for falling back to when a key is missing from a translation. */
export function source(): Dictionary {
  return zhHans;
}

/**
 * Fills `{name}` holes in a pattern.
 *
 * Positional `{0}` would be shorter and is the wrong choice: word order is not the same in all five,
 * and a translator moving `{stage}` before `{realm}` must not have to count arguments to do it.
 */
export function fill(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
