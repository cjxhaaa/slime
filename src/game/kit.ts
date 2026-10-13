/**
 * 兵器与五行 — what the pet fights with, and what happens where it lands.
 *
 * ## The one idea this is built on
 *
 * A weapon is **delivery**: what shape goes out, how often, and how it finds something. An element
 * is **what happens on contact**, and it never attacks on its own.
 *
 * That split is the whole reason this is affordable. Five weapons times ten ways is fifty pairings,
 * and fifty bespoke implementations would be more content than the nine schools this replaces —
 * which took months. Written as delivery × modifier it is **five plus ten**, and the fifty are
 * what comes out the other side: 爆 on a 刀 is a row of ground slashes that burst, 爆 on a 弓 is an
 * exploding arrow, and it is one piece of code reading two ways.
 *
 * Three element slots on one weapon is 120 element combinations across 5 weapons — 600 builds out
 * of fifteen implementations.
 *
 * ## What is not in here
 *
 * Numbers that are really one number. "+30% damage" is a hidden stat block wearing a costume; the
 * rule carried over from the schools is that **every way has to change a behaviour you can point
 * at**, and that you must be able to tell it fired without being told.
 */

/** The five. One equipped at a time, swapped by drafting another. */
export const WEAPONS = ['刀', '剑', '盾', '弓', '符'] as const;

export type Weapon = (typeof WEAPONS)[number];

/** The five phases. Each has two ways, so ten in all. */
export const ELEMENTS = ['金', '木', '水', '火', '土'] as const;

export type Element = (typeof ELEMENTS)[number];

/**
 * The ten ways, keyed by the pair that names them.
 *
 * Two per element on purpose: one element with one effect is a colour, and two gives the phase a
 * choice inside it — 火 can be the one that keeps burning or the one that goes off at once, and
 * which you took is a thing about your build rather than a thing about the element.
 */
export const WAYS = [
  '金锐',
  '金鸣',
  '木缠',
  '木荣',
  '水寒',
  '水流',
  '火燎',
  '火爆',
  '土崩',
  '土固',
] as const;

export type Way = (typeof WAYS)[number];

/**
 * How far a way can be deepened — and, since 品质 and 深浅 are the same number, how many 品质
 * there are.
 *
 * Six rather than five because the ladder somebody named has six rungs on it: 浅绿, 蓝, 黄, 红,
 * 白, 彩. `gear.ts` takes `Tiers` from here rather than declaring its own, so there is one answer
 * to "how strong can this get" instead of two that agree today.
 */
export const MaxDepth = 6;

/** How many ways can be carried at once. One weapon, three of these. */
export const Ways = 3;

/**
 * How a weapon delivers.
 *
 * `motion` is the shape; the rest is how often and how much. Deliberately the same vocabulary the
 * nine schools used, because four of the five already have a close relative in the effect engine
 * — the schools were nine delivery patterns with element meanings welded on, and this prises the
 * two apart rather than starting over.
 */
export interface WeaponSpec {
  key: Weapon;
  name: string;
  blurb: string;
  /** Which delivery the effect engine runs for it. */
  motion: 'slash' | 'sword' | 'guard' | 'shot' | 'charm';
  /** The colour it is drawn in when no element has coloured it. */
  tint: string;
  /** Seconds between swings at the first level. Deepening shortens it. */
  interval: number;
  /** How far it reaches at the first level. */
  reach: number;
  /** How far a level widens it, as a fraction. */
  grow?: number;
  /** How many it can hit before that swing is spent. */
  bite: number;
}

export const ARMS: Record<Weapon, WeaponSpec> = {
  刀: {
    key: '刀',
    name: '刀',
    blurb: '就地斩出数道刀气',
    motion: 'slash',
    tint: '#ffd9a0',
    interval: 1.1,
    reach: 150,
    grow: 0.1,
    bite: 3,
  },
  剑: {
    key: '剑',
    name: '剑',
    blurb: '飞剑自去追敌，追上便连斩',
    motion: 'sword',
    tint: '#9fe6ff',
    interval: 2.6,
    reach: 60,
    grow: 0.08,
    bite: 1,
  },
  盾: {
    key: '盾',
    name: '盾',
    blurb: '罡气绕身，所过者伤',
    motion: 'guard',
    tint: '#cfe3f2',
    interval: 0.34,
    reach: 104,
    grow: 0.12,
    bite: 1,
  },
  弓: {
    key: '弓',
    name: '弓',
    blurb: '一箭穿出，去势不改',
    motion: 'shot',
    tint: '#d8f0c0',
    interval: 0.5,
    reach: 20,
    grow: 0.06,
    bite: 1,
  },
  符: {
    key: '符',
    name: '符箓',
    blurb: '符自寻敌，不中不止',
    motion: 'charm',
    tint: '#ffd24a',
    interval: 0.78,
    reach: 24,
    grow: 0.06,
    bite: 1,
  },
};

/**
 * What a way does where a weapon lands.
 *
 * `on` names the mechanic the effect engine runs. Nine of the ten already exist in some form,
 * built for the schools or for 山崩 and 金钟罩 — which is most of why this plan is a rewrite of
 * the front half rather than of everything.
 */
export interface WaySpec {
  key: Way;
  of: Element;
  name: string;
  blurb: string;
  /** The mechanic. See `Attacks` for each. */
  on: 'pierce' | 'shove' | 'root' | 'leech' | 'chill' | 'chain' | 'burn' | 'burst' | 'quake' | 'plate';
  tint: string;
}

export const FIVE: Record<Element, { name: string; tint: string }> = {
  金: { name: '金', tint: '#ffe9a8' },
  木: { name: '木', tint: '#9ae66a' },
  水: { name: '水', tint: '#79d8ff' },
  火: { name: '火', tint: '#ff9a4a' },
  土: { name: '土', tint: '#c49a63' },
};

export const PATHS: Record<Way, WaySpec> = {
  金锐: {
    key: '金锐',
    of: '金',
    name: '锐金',
    blurb: '穿身而过，不为一人停',
    on: 'pierce',
    tint: '#fff3c4',
  },
  金鸣: {
    key: '金鸣',
    of: '金',
    name: '鸣金',
    blurb: '一击荡开四方',
    on: 'shove',
    tint: '#ffe9a8',
  },
  木缠: {
    key: '木缠',
    of: '木',
    name: '缠木',
    blurb: '中者生根，一瞬动不得',
    on: 'root',
    tint: '#7fdc55',
  },
  木荣: {
    key: '木荣',
    of: '木',
    name: '荣木',
    blurb: '每中一下，护体回一分',
    on: 'leech',
    tint: '#b6f28a',
  },
  水寒: {
    key: '水寒',
    of: '水',
    name: '寒水',
    blurb: '落处成寒，过者迟滞',
    on: 'chill',
    tint: '#9fe8ff',
  },
  水流: {
    key: '水流',
    of: '水',
    name: '流水',
    blurb: '一击连环，自去寻下一个',
    on: 'chain',
    tint: '#79d8ff',
  },
  火燎: {
    key: '火燎',
    of: '火',
    name: '燎火',
    blurb: '中者带火，烧上一阵',
    on: 'burn',
    tint: '#ff7a3c',
  },
  火爆: {
    key: '火爆',
    of: '火',
    name: '爆火',
    blurb: '落处炸开，近旁俱伤',
    on: 'burst',
    tint: '#ffb04a',
  },
  土崩: {
    key: '土崩',
    of: '土',
    name: '崩土',
    blurb: '落处地裂，石柱冲起',
    on: 'quake',
    tint: '#c49a63',
  },
  土固: {
    key: '土固',
    of: '土',
    name: '固土',
    blurb: '身披石甲，挨打不损',
    on: 'plate',
    tint: '#d8b98a',
  },
};

/** Every way of one phase. */
export function waysOf(element: Element): Way[] {
  return WAYS.filter((way) => PATHS[way].of === element);
}

/** Seconds between swings, at a given depth. */
export function swing(weapon: Weapon, depth: number): number {
  const held = Math.max(1, Math.min(MaxDepth, depth));
  return ARMS[weapon].interval * 0.85 ** (held - 1);
}

/** How far it reaches, at a given depth. */
export function span(weapon: Weapon, depth: number): number {
  const held = Math.max(1, Math.min(MaxDepth, depth));
  return ARMS[weapon].reach * (1 + (ARMS[weapon].grow ?? 0.1) * (held - 1));
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

/** The colour of the mark an evolved school wears. Deliberately not any school's own. */
export const Crown = '#ffe58a';


