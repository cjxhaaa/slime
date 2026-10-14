import type { Element, Way, Weapon } from '../game/kit.js';
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
  /**
   * How full the current stage is, as a word: 初凝 / 渐盈 / 将满 / 可突破, weakest first.
   *
   * Four buckets rather than a percentage, for the same reason nothing else here shows a figure.
   */
  fullness: [string, string, string, string];

  /**
   * The eight kinds, each as its common, elite and king — 哥布林, 精英哥布林, 哥布林王. Not drawn
   * on screen during a level (§6.4); the preview sheet and anything that ever names one read them
   * from here.
   */
  creatures: Record<Kind, [string, string, string]>;

  /** The twenty lines a 机缘 can say. */
  finds: string[];

  /**
   * 见闻 — what the pet has done, keyed by the ids in `game/feats.ts`.
   *
   * The seven realm rungs are **not** in here. They take their names from `realms` above, so that
   * a realm renamed in one place cannot end up called something else in the other.
   */
  feats: Record<string, Named>;
  /** The blurb every realm rung shares. `{realm}` is substituted. */
  featRealm: string;

  /**
   * What the pet says about its own state, in the bubble and in the alert.
   *
   * These lived in `main.ts` as literals longer than anything else here, because they read as part
   * of the code rather than as content — which is exactly how a string gets missed.
   */
  pet: {
    /** `{stage}`. Two lines: what it is, and what a click would do. */
    readyToBreak: string;
    /** Four verdicts on the coming ordeal. `{short}` is how many charms are still wanting. */
    ordealSure: string;
    ordealSteady: string;
    ordealFair: string;
    ordealPerilous: string;
    /** `{left}` refinings left today. */
    refineLeft: string;
    /** Two-liners, each shown for a while after the thing it describes. */
    ordealFailed: string;
    /** Said once when a 见闻 is earned. `{feat}` is substituted. */
    featEarned: string;
    ascendedIdle: string;
    firstBreath: string;
  };

  menu: {
    settings: string;
    enterTrial: string;
    leaveTrial: string;
    /** Shown greyed under 入历练 before 筑基. */
    lockedUntil: string;
  };

  /** 五行: the five phases, for grouping the ten ways. */
  elements: Record<Element, string>;
  /** 兵器: the five, by their key in `kit.ts`. */
  arms: Record<Weapon, Named>;
  /** 五行: the ten ways, by their key. */
  ways: Record<Way, Named>;

  /** The two headings over the yard's pickers in Settings: weapons, and the ten. */
  kit: {
    arm: string;
    way: string;
  };

  /** 选定: the dialog before a level, where two weapons and three ways are picked. */
  loadout: {
    title: string;
    /** The headings over the two groups. */
    arms: string;
    ways: string;
    /** The button that starts the level once all five are picked. */
    start: string;
  };

  /**
   * 装备栏, along the bottom of a level. The only numbers the mode shows while it is running, and
   * TOWER.md §4 is where that exception was made: a price you cannot read is not a price.
   */
  bar: {
    /** `{silver}` held. */
    silver: string;
    /** The button, with `{price}` on it. */
    buy: string;
    /** What an opened 宝箱 held, `{silver}`, rising off it. */
    found: string;
  };

  trial: {
    pauseTitle: string;
    pauseNote: string;
    pauseResume: string;
    pauseLeave: string;
    /**
     * `{kills}` is substituted in all three. `cleared` also takes `{level}`; `overwhelmed` takes
     * `{level}` and the `{wave}` it fell on, counted from 1.
     */
    cleared: string;
    overwhelmed: string;
    arena: string;
    /** The two-line breakthrough and failure lines. */
    nourishing: string;
    charmCount: string;
    /** The practice yard's live output readout. */
    yardOutput: string;
    /** `{rate}` hits a second, averaged over the last few. */
    yardRate: string;
    /** `{hits}` landed in `{seconds}` of standing there. */
    yardTotal: string;
  };

  settings: {
    arenaTitle: string;
    /** How many of the three 五行 slots are spent, in the yard. */
    yardTally: string;
    /** The heading over the yard's depth sliders. */
    yardDepth: string;
    start: string;
    stop: string;
    combosLabel: string;
    triadLabel: string;
    noCombo: string;
    /**
     * `{name}` and `{blurb}`, and what goes between two of them.
     *
     * Brackets and list commas are part of a script, not decoration: （）、 are full-width in
     * Chinese and Japanese and simply wrong in English and Korean, which want ( ) and a comma with
     * a space. Building the line by concatenation is how a window ends up half in one convention.
     */
    listItem: string;
    listSep: string;
    listColon: string;
    languageTitle: string;
    /** Appended to the blurb while nothing has been chosen and the system is being followed. */
    languageAuto: string;
    quitLabel: string;

    rebirthTitle: string;
    rebirthButton: string;
    /** The second of the two clicks, and the line that says what it costs. */
    rebirthConfirm: string;
    rebirthWarn: string;
    /** `{realm}`, `{times}` and `{rate}`. */
    rebirthState: string;

    quietTitle: string;
    quietLabel: string;
    quietNote: string;

    /**
     * 敛息 — stepping out of the way of a full-screen application.
     *
     * A separate switch from `quiet*` and deliberately so: one answers "do not read my keyboard",
     * the other "do not sit on top of what I am doing". Somebody can want either without the other.
     */
    lieLowTitle: string;
    lieLowLabel: string;
    /** Shown in place of the switch where the platform cannot tell who owns the screen. */
    lieLowUnsupported: string;

    featsTitle: string;
    /** What an unearned row says in place of its blurb. */
    featsLocked: string;
    /** `{done}` of `{all}`. */
    featsCount: string;

  };
}
