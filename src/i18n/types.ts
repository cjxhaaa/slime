/**
 * 语言 — what a dictionary has to provide, and nothing about how it is chosen.
 *
 * Five languages, and the interesting problem is not the plumbing. It is that this game is built
 * out of **修仙 vocabulary**, and those words sit very differently in each of them:
 *
 * - **繁體中文** is the same words in traditional forms. Nearly mechanical, but not entirely — a
 *   few terms genuinely differ in usage, and 「一律轉繁」 produces things no reader would write.
 * - **日本語** already owns most of this vocabulary: 練気, 築基, 金丹, 元嬰 are read as 漢語 and are
 *   how the genre is actually published in Japan. Translating them into native Japanese would be
 *   *less* legible to the audience that wants this, not more.
 * - **한국어** has the same words as 한자어 — 연기, 축기, 금단 — and modern Korean writes them in
 *   Hangul. Writing 練氣 in Hanja would look like a textbook, not a game.
 * - **English** is the only one with no shared vocabulary at all, so it is the only one that has to
 *   *decide* between transliterating (Qi Refining) and translating (Breath Forging). This file's
 *   English is translated where a phrase carries meaning and transliterated where it is a name,
 *   which is the convention the genre's English-language publishing has settled on.
 *
 * ## The keys are Chinese characters, and they are not text
 *
 * `School` is `'符' | '剑' | …`. That is a **TypeScript union used as an identifier**, the same way
 * another codebase would use `'fire' | 'ice'`, and it never reaches a screen. Nothing in here
 * translates it; the dictionary is keyed *by* it. Keeping it means the keys cannot drift as the
 * translations change, which is the failure this shape exists to prevent.
 */
import type { School } from '../game/schools.js';
import type { Kind } from '../game/menaces.js';

/**
 * The five, as BCP 47 tags.
 *
 * `zh-Hans` and `zh-Hant` rather than `zh-CN` and `zh-TW`, because the difference being selected
 * here is the **script**, not the region — a reader in Hong Kong or Malaysia wants the traditional
 * forms without any of the regional vocabulary that a `zh-TW` tag would imply.
 */
export const LOCALES = ['zh-Hans', 'zh-Hant', 'en', 'ja', 'ko'] as const;

export type Locale = (typeof LOCALES)[number];

/** What each one calls itself. Never translated — a language menu is read by people who cannot yet read the app. */
export const ENDONYMS: Record<Locale, string> = {
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

/** A name and the one line that says what it does. */
export interface Named {
  name: string;
  blurb: string;
}

export interface Dictionary {
  /** The eight realms, 练气 through 大乘, plus what is said past the top of them. */
  realms: [string, string, string, string, string, string, string, string];
  ascended: string;
  /** The nine stages within a realm, and the pattern that puts a realm and a stage together. */
  stages: [string, string, string, string, string, string, string, string, string];
  /** `{realm}` and `{stage}` are substituted. Separate because word order is not the same in all five. */
  realmStage: string;

  schools: Record<School, Named>;
  /** Keyed by the two school characters in the order `COMBOS` declares them. */
  combos: Record<string, Named>;
  /** Keyed by the three school characters in the order `TRIADS` declares them. */
  triads: Record<string, Named>;
  evolutions: Record<School, Named>;
  breeds: Record<Kind, string>;

  /** The twenty lines a 机缘 can say. */
  finds: string[];

  menu: {
    settings: string;
    enterTrial: string;
    leaveTrial: string;
    /** Shown greyed under 入历练 before 筑基. */
    lockedUntil: string;
  };

  draft: {
    /** The heading over the three cards. */
    choose: string;
    /** The four kinds of card. */
    newSchool: string;
    raise: string;
    evolve: string;
    mend: string;
    mendBlurb: string;
    /** `{from}` and `{to}` are stage numerals. */
    levelStep: string;
    /** `{school}` and `{combo}` are substituted. */
    pairsWith: string;
    triadWith: string;
  };

  trial: {
    /** `{kills}` is substituted in all three. */
    survived: string;
    overwhelmed: string;
    arena: string;
    /** The two-line breakthrough and failure lines. */
    nourishing: string;
    charmCount: string;
  };

  settings: {
    arenaTitle: string;
    arenaBlurb: string;
    arenaRings: string;
    start: string;
    stop: string;
    combosLabel: string;
    triadLabel: string;
    noCombo: string;
    languageTitle: string;
    languageBlurb: string;
    quitLabel: string;
  };
}
