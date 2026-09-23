/**
 * 法脉 — the nine attack schools, what pairs with what, and what a pair becomes.
 *
 * This is the 法宝 slot idea from §12, which was cancelled for being an invisible stat block. It
 * comes back here because a trial changes what the objection was: inside a ninety-second fight the
 * schools are not a configuration you forget you set, they are **the only thing on the screen**.
 * Every one of them is something you can see firing. That was the actual complaint, not the slots.
 *
 * ## The nine
 *
 * Each one is a different *shape* of attack, not a different number — a school you cannot identify
 * from across the room by how it moves is a stat with a name on it.
 *
 * | | school | how it fights |
 * |---|---|---|
 * | 符 | 符箓 | aimed talismans, one target each |
 * | 剑 | 剑气 | a sweep close in, wide and short |
 * | 雷 | 雷法 | a bolt that jumps between neighbours |
 * | 火 | 丹火 | dropped flame that stays where it fell |
 * | 冰 | 冰魄 | a slowing field around the body |
 * | 风 | 风刃 | blades orbiting the body |
 * | 土 | 山岳 | a shell that eats contact, then bursts |
 * | 毒 | 瘴气 | a trail left wherever you have been |
 * | 影 | 影卫 | a small one that fights on its own |
 *
 * ## Why every pair is not allowed
 *
 * Nine schools taken two at a time is thirty-six pairs, and thirty-six combination effects is not
 * depth, it is a spreadsheet nobody reads. Restricting it does two things at once: it cuts the
 * content to something that can each be *distinct*, and it makes the draft a decision — an offer
 * is interesting because it does or does not go with what you are already holding.
 *
 * ### The number cannot be three for all nine
 *
 * Each edge adds one to the degree of two schools, so the degrees always sum to twice the number
 * of edges — an even number. Nine schools with three partners each sums to **twenty-seven**, and
 * no graph on any nine things has odd total degree. It is not a matter of picking the pairings
 * cleverly; it does not exist.
 *
 * So eight schools have three partners and one has four. 符 is the one, because a talisman is the
 * medium the others are written onto — 雷符, 符剑, 阵符, 傀符 are all ordinary words, and "the
 * talisman school goes with slightly more things" is the least arbitrary way to spend the odd
 * degree. Fourteen combinations, every one of them a name somebody already uses.
 *
 * ### The draft works out at 82%
 *
 * Holding one school, three of the other eight are its partners, so a random three-card offer
 * contains at least one partner with probability 1 − C(5,3)/C(8,3) = **82%**. That number is why
 * the offers are *not* weighted toward partners: at 82% the graph already does the steering, and
 * weighting on top of it would make the draft a formality.
 *
 * Drafted four thousand times by something that takes the best-pairing card, **a complete 套路 comes
 * out 100% of the time** — which is the requested property rather than a surprise, and it is worth
 * knowing it is exactly 100 and not merely usually: four picks give three chances to find a
 * partner, and three partners out of eight is generous. So the draft is never about *whether* you
 * can assemble something. It is about which one, and whether you would rather have the pairing or
 * the school.
 *
 * Taken blind, the same four thousand drafts average 2.35 combinations and land two or more 82% of
 * the time, because 14 of the 36 possible pairs combine. That is the real cost of setting the
 * degree at three: the graph is dense enough that luck alone usually works out. Two would have been
 * sparse enough to bite — and two is also the only other number that fits nine schools without the
 * parity problem — but three is what was asked for, and "you can always build something" is worth
 * more here than "a bad draft can happen to you" in a mode that lasts ninety seconds.
 *
 * The checks pin all three figures, because every one of them is a consequence of the graph rather
 * than a number written anywhere in it: retune the pairings and they move without anything looking
 * wrong.
 */

/** The nine, in the order they are drawn and offered. */
export const SCHOOLS = ['符', '剑', '雷', '火', '冰', '风', '土', '毒', '影'] as const;

export type School = (typeof SCHOOLS)[number];

/**
 * How an attack behaves. Nine schools, nine of these — the mapping is one to one on purpose.
 *
 * The engine is one list of live effects with a kind each, rather than nine systems. What makes a
 * school itself is its kind plus its numbers; what makes it *recognisable* is that no two share a
 * kind, so "the one that orbits" is never ambiguous.
 */
export type Motion =
  /** Flies to a target and is spent on it. */
  | 'aimed'
  /** A crescent thrown out from the body, cutting through what it passes. */
  | 'arc'
  /** Strikes a target instantly, then jumps to a neighbour. */
  | 'chain'
  /** Dropped where it lands and burns for a while. */
  | 'zone'
  /** A field held around the body for as long as you hold the school. */
  | 'field'
  /** Circles the body at a fixed radius. */
  | 'orbit'
  /** Sits on the body and absorbs contact, then bursts. */
  | 'shell'
  /** Laid down along the path the body has taken. */
  | 'trail'
  /** Moves and fights by itself. */
  | 'ward';

export interface SchoolSpec {
  key: School;
  /** The two-character name, for the draft card. */
  name: string;
  /** One line, in the card. Says what it does, never what it is worth. */
  blurb: string;
  motion: Motion;
  /** `#rrggbb`. The same as the palette's `body`, so a draft card matches what it fires. */
  tint: string;
  /** Seconds between activations at level 1. Levels shorten it; see `cadence`. */
  interval: number;
  /** How far it works, in pixels. What that means depends on the motion. */
  reach: number;
  /**
   * How much the reach grows per level, as a fraction. Defaults to 0.13.
   *
   * 风刃 sets it low, and the reason is worth keeping: for everything else `reach` is coverage, so
   * more of it is more kills. For an **orbit** it is the radius the blades ride at, and the 邪气 are
   * all walking *inward* — so a bigger radius is not wider coverage, it is further from where
   * everything is. Measured, 风刃 peaked at two 重 and got worse every level after it.
   */
  grow?: number;
  /** How many things one activation can kill. `field` and `trail` use it per tick. */
  bite: number;
}

/**
 * What a school's light is made of.
 *
 * Three stops, not one colour, and that is most of the difference between this looking like a game
 * and looking like a diagram. A single pastel tint drawn at some alpha is **chalk**: it has no hot
 * centre, so it never reads as light, only as a coloured shape. Every glowing thing in the genre
 * these are borrowed from is a ramp from a near-white core through a saturated body to a deep
 * saturated edge, and it is the ramp that does the work.
 *
 * They are also far more saturated than the first set. The originals were picked to sit politely on
 * a desktop; sitting politely is the opposite of what an attack should do, and the pet's own body
 * colour is already the thing carrying "this is a calm object on your screen".
 */
export interface Palette {
  /** The hot centre. Near white, with a trace of the hue left in it. */
  core: string;
  /** The saturated middle. This is the colour somebody would name the school by. */
  body: string;
  /** The deep outer, where the light falls off. Saturated, never grey. */
  edge: string;
}

export const PALETTE: Record<School, Palette> = {
  符: { core: '#fffdf0', body: '#ffd24a', edge: '#ff7a14' },
  剑: { core: '#ffffff', body: '#8ceaff', edge: '#1f6ee0' },
  雷: { core: '#ffffff', body: '#cba6ff', edge: '#6b28ee' },
  火: { core: '#fff6d0', body: '#ff9a2e', edge: '#df2a18' },
  冰: { core: '#f0fdff', body: '#79e2ff', edge: '#1f7fe0' },
  风: { core: '#f4fff8', body: '#66ffb4', edge: '#0fa172' },
  土: { core: '#fff4da', body: '#f2c163', edge: '#a35b1e' },
  毒: { core: '#f2ffc4', body: '#b6f238', edge: '#3f8a0c' },
  影: { core: '#ffeeff', body: '#d489ff', edge: '#7526d6' },
};

/**
 * The same school, evolved.
 *
 * Every one of the nine evolutions changed a *behaviour* and nothing else — two talismans instead
 * of one, eight lightning hops instead of three, a shell that never breaks. All correct, all
 * invisible: an evolved 符箓 was pixel-for-pixel the ordinary one, just more often. The rarest
 * reward in the mode was the one you could not see you had, which is the exact failure §5 of the
 * plan exists to prevent.
 *
 * So the palette itself ascends. Hotter, whiter in the middle, and pulled a little toward gold —
 * gold being the one colour no school owns, so it reads as "this is above the nine" rather than as
 * "this is the fire one". Each evolution also gets its own change of shape; this is the part that
 * says *something* happened before you have worked out what.
 */
export function ascend(hue: Palette): Palette {
  return {
    core: mixHex(hue.core, '#ffffff', 0.55),
    body: mixHex(hue.body, '#fff0a8', 0.4),
    edge: mixHex(hue.edge, hue.body, 0.4),
  };
}

/** The colour of the mark an evolved school wears. Deliberately not any school's own. */
export const Crown = '#ffe58a';

/** A local copy of the blend, so this file does not depend on the drawing layer. */
function mixHex(a: string, b: string, t: number): string {
  const read = (hex: string) => {
    const raw = hex.replace('#', '');
    const full =
      raw.length === 3
        ? raw
            .split('')
            .map((c) => c + c)
            .join('')
        : raw;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = read(a);
  const [br, bg, bb] = read(b);
  const pick = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(pick(ar, br))}${hex(pick(ag, bg))}${hex(pick(ab, bb))}`;
}

export const SPECS: Record<School, SchoolSpec> = {
  符: {
    key: '符',
    name: '符箓',
    blurb: '掷符，一符一敌',
    motion: 'aimed',
    tint: '#ffd24a',
    interval: 0.9,
    reach: 520,
    bite: 1,
  },
  剑: {
    key: '剑',
    name: '剑气',
    blurb: '斩出一道，沿途尽断',
    motion: 'arc',
    tint: '#8ceaff',
    interval: 1.15,
    // How far the crescent travels, not how far the body reaches. It was a 132px swing close in;
    // 剑气 is the one school whose whole name says it leaves the hand.
    reach: 360,
    bite: 3,
  },
  雷: {
    key: '雷',
    name: '雷法',
    blurb: '落雷，并及其近者',
    motion: 'chain',
    tint: '#cba6ff',
    interval: 1.5,
    reach: 300,
    bite: 2,
  },
  火: {
    key: '火',
    name: '丹火',
    blurb: '燃于原地',
    motion: 'zone',
    tint: '#ff9a2e',
    interval: 1.7,
    reach: 74,
    bite: 2,
  },
  冰: {
    key: '冰',
    name: '冰魄',
    blurb: '周身寒域，来者迟',
    motion: 'field',
    tint: '#79e2ff',
    interval: 0.55,
    reach: 118,
    bite: 1,
  },
  风: {
    key: '风',
    name: '风刃',
    blurb: '绕身而转',
    motion: 'orbit',
    tint: '#66ffb4',
    interval: 0.3,
    reach: 96,
    grow: 0.04,
    bite: 1,
  },
  土: {
    key: '土',
    name: '山岳',
    blurb: '受击不损，碎则荡开',
    motion: 'shell',
    tint: '#f2c163',
    interval: 6,
    reach: 128,
    bite: 4,
  },
  毒: {
    key: '毒',
    name: '瘴气',
    blurb: '所过之处成瘴',
    motion: 'trail',
    tint: '#b6f238',
    interval: 0.22,
    reach: 46,
    bite: 1,
  },
  影: {
    key: '影',
    name: '影卫',
    blurb: '一影自战',
    motion: 'ward',
    tint: '#d489ff',
    interval: 1.25,
    reach: 240,
    bite: 1,
  },
};

/**
 * The fourteen. Each is a real word, and each one *changes a behaviour* rather than adding a number.
 *
 * A combination that reads "+30% damage" is the invisible stat block again, in a costume. These all
 * do something you can point at: a talisman that forks, a sweep that closes into a full circle, a
 * shell that comes back. The rule I held to while writing them: **you must be able to tell it fired
 * without being told.**
 */
export interface Combo {
  pair: [School, School];
  name: string;
  /** What it changes, in the card and in the docs. */
  effect: string;
}

export const COMBOS: Combo[] = [
  { pair: ['符', '雷'], name: '雷符', effect: '符落处再分一道，击其近者' },
  { pair: ['符', '剑'], name: '符剑', effect: '符先绕身三息，再飞出' },
  { pair: ['符', '土'], name: '阵符', effect: '符不飞了，在地上连成一圈法阵' },
  { pair: ['符', '影'], name: '傀符', effect: '影卫也会掷符' },
  { pair: ['剑', '风'], name: '风剑', effect: '四方各斩一道' },
  { pair: ['剑', '雷'], name: '雷剑', effect: '每一刀都往旁边引一道雷' },
  { pair: ['雷', '火'], name: '雷火', effect: '地火向近处引雷' },
  { pair: ['火', '冰'], name: '冰火', effect: '寒域中的敌人被点燃时炸开' },
  { pair: ['火', '毒'], name: '焚瘴', effect: '瘴气会被点着，成片烧起来' },
  { pair: ['冰', '风'], name: '风雪', effect: '风刃拖出霜迹，迹上也伤人' },
  { pair: ['冰', '土'], name: '玄冰甲', effect: '壳碎后自行重结' },
  { pair: ['风', '毒'], name: '风毒', effect: '瘴气被吹散得更宽，并会飘' },
  { pair: ['土', '影'], name: '幽壤', effect: '壳碎时从地里起两个影卫' },
  { pair: ['毒', '影'], name: '影毒', effect: '影卫的每一击都带瘴' },
];

/**
 * 三合 — seven forms that need three schools at once.
 *
 * The fourteen pairings turned out to be **dense enough**: drafted blind, four slots average 2.35
 * of them and land two or more 82% of the time; drafted deliberately, a complete build comes out
 * every single time. Adding edges to that would not add depth, it would remove the one question
 * the draft asks — *does this card go with what I have* — by making the answer almost always yes.
 *
 * So the next layer goes **up** instead of sideways. A 三合 costs you a whole slot's freedom: with
 * four slots there are only C(4,3) = 4 three-school subsets, so committing to one is committing to
 * three quarters of your build. That is a real decision in a way that a fifteenth pairing is not.
 *
 * ## 一主二辅
 *
 * Every one is a school plus **two of its own partners**, so the three of them already carry two
 * pairings between them before the 三合 is counted. That is deliberate: it means somebody
 * assembling a build the ordinary way — taking cards that pair with what they hold — walks into
 * these without being told to hunt for them. A form made of three schools that do not pair would be
 * a secret recipe, and secret recipes in a ninety-second mode are content nobody sees.
 *
 * Two of the seven (三才剑阵 and 幽都印) are **triangles** — all three pair with each other — and
 * they are the only two the graph contains. They carry three pairings each.
 *
 * Every school appears in at least two, so no draft is locked out of the layer.
 */
export interface Triad {
  /** The three, in no particular order. */
  of: [School, School, School];
  name: string;
  effect: string;
}

export const TRIADS: Triad[] = [
  { of: ['符', '剑', '雷'], name: '三才剑阵', effect: '符先落地成阵，雷引其上，剑气循阵旋出' },
  { of: ['符', '土', '影'], name: '幽都印', effect: '壳碎时地上升起符阵，阵中走出三个影卫' },
  { of: ['雷', '火', '冰'], name: '三灾劫', effect: '地火落处同时降雷，并炸开一圈寒霜' },
  { of: ['冰', '风', '土'], name: '玄霜壁', effect: '风刃不再绕身，钉在寒域边缘结成一道旋转冰墙' },
  { of: ['风', '剑', '毒'], name: '瘴风刃', effect: '剑气裹瘴而行，所过之处留下毒痕' },
  { of: ['毒', '火', '影'], name: '业火鬼', effect: '影卫浑身燃烧，走过的地方成片引火' },
  { of: ['土', '冰', '影'], name: '玄冥甲', effect: '影卫不再游走，护在身侧随甲而转' },
];

/** The 三合 a build completes. */
export function activeTriads(held: School[]): Triad[] {
  return TRIADS.filter((triad) => triad.of.every((school) => held.includes(school)));
}

/** Whether a particular form is up. Named rather than indexed, so a reorder cannot break it. */
export function hasTriad(held: School[], name: string): boolean {
  return activeTriads(held).some((triad) => triad.name === name);
}

/**
 * The nine jackpots, one per school.
 *
 * **An evolution is only ever offered for a school whose partner you are holding.** That is the one
 * decision in here that was not in the request, and it is what stops this being two unrelated
 * systems bolted together: the pairings would otherwise be a side quest with its own rewards, and
 * the jackpot a slot machine that ignores them. Gated this way, going for a combination is *how*
 * you buy a ticket, and the rarest thing in the mode is the thing the design is already about.
 */
export interface Evolution {
  of: School;
  name: string;
  effect: string;
}

export const EVOLUTIONS: Record<School, Evolution> = {
  符: { of: '符', name: '万符朝元', effect: '每息一符，永不落空' },
  剑: { of: '剑', name: '万剑归宗', effect: '扫出的不再是一道，是一片' },
  雷: { of: '雷', name: '九天神雷', effect: '雷沿着敌人一路传下去' },
  火: { of: '火', name: '焚天炉', effect: '火不熄，且随你走' },
  冰: { of: '冰', name: '玄冰狱', effect: '寒域之内，行者尽止' },
  风: { of: '风', name: '罡风阵', effect: '三重风刃，反向而转' },
  土: { of: '土', name: '不动明山', effect: '壳不再碎，只是荡开' },
  毒: { of: '毒', name: '万毒蛊', effect: '瘴气追着敌人走' },
  影: { of: '影', name: '影卫三重', effect: '三个影卫' },
};

/** How many schools you can hold in one run. Four, so two complete pairs fit exactly. */
export const Slots = 4;
/** Levels per school. Reached at all only at the high realms, which is deliberate. */
export const MaxLevel = 5;
/** Cards per offer. */
export const CardsPerOffer = 3;

/**
 * Seconds between activations at a given level.
 *
 * Levels shorten the cadence rather than raising a damage number, because there is no damage number
 * — everything in here kills what it touches. A school you have levelled is a school that is
 * visibly busier, which is the same principle as the rest of the app: the reward has to be
 * something you can see.
 */
export function cadence(school: School, level: number): number {
  const held = Math.max(1, Math.min(MaxLevel, level));
  return SPECS[school].interval * 0.85 ** (held - 1);
}

/**
 * How far it reaches at a given level.
 *
 * 13% a level rather than 9%, and the cadence eased from 0.82 to 0.85 to pay for it. The two very
 * nearly cancel — across four levels the old pair came to 2.21× the rate over 1.36× the reach, the
 * new one to 1.92× over 1.52× — so this is a trade rather than a buff, and the whole-run guard is
 * what says so.
 *
 * The trade is worth making because of which half is **visible**. Nobody can see a shorter interval;
 * everybody can see a bigger circle. 36% across a whole climb was inside the noise, and a level you
 * cannot perceive is a reward that did not arrive.
 */
export function span(school: School, level: number): number {
  const held = Math.max(1, Math.min(MaxLevel, level));
  return SPECS[school].reach * (1 + (SPECS[school].grow ?? 0.13) * (held - 1));
}

/** Everything that pairs with a school. */
export function partners(school: School): School[] {
  const out: School[] = [];
  for (const combo of COMBOS) {
    if (combo.pair[0] === school) out.push(combo.pair[1]);
    else if (combo.pair[1] === school) out.push(combo.pair[0]);
  }
  return out;
}

/** The combination two schools make, if they make one. Order does not matter. */
export function comboFor(a: School, b: School): Combo | null {
  for (const combo of COMBOS) {
    const [x, y] = combo.pair;
    if ((x === a && y === b) || (x === b && y === a)) return combo;
  }
  return null;
}

/** Every combination a set of held schools completes. */
export function activeCombos(held: School[]): Combo[] {
  const out: Combo[] = [];
  for (let i = 0; i < held.length; i++) {
    for (let j = i + 1; j < held.length; j++) {
      const combo = comboFor(held[i], held[j]);
      if (combo) out.push(combo);
    }
  }
  return out;
}

/**
 * What the meter costs for the nth exchange of a run, counting from zero.
 *
 * Escalating rather than flat, because a flat cost cannot serve both ends of the ladder: a run kills
 * between five and ten hundred things depending on the realm, so any single figure is either a
 * handful of exchanges at the bottom or dozens at the top.
 *
 * The first one costs thirty because of when it lands rather than what it is worth. At six kills a
 * second — which is what four freshly drafted schools do — a cost of eight put the first upgrade
 * at **1.3 seconds**, so the run had no opening: you were snowballing before you had looked at the
 * screen. Thirty puts it around five seconds in, which is long enough to notice that the build you
 * drafted is what is fighting.
 *
 * Growing at 18% gives nine exchanges over a 筑基 run and eleven over a 大乘 one. A high realm is a
 * deeper build, which is most of what a realm buys you in here now.
 */
export const FirstExchange = 30;
export const ExchangeGrowth = 1.18;

export function exchangeCost(taken: number): number {
  return Math.round(FirstExchange * ExchangeGrowth ** Math.max(0, taken));
}

/** Total kills to have taken `n` exchanges. */
export function killsForExchanges(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += exchangeCost(i);
  return sum;
}

/**
 * The chance an offer contains a jackpot, once one is eligible at all.
 *
 * One in six is low enough that seeing one is an event and high enough that a long run at a high
 * realm will usually show you one. It is not raised for higher realms: a 大乘 run already takes
 * twice as many exchanges, so it already sees roughly twice as many chances.
 */
export const JackpotChance = 1 / 6;
