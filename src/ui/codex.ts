/**
 * 图鉴 — what each weapon and way does, in words a player reads, and how it grows with its grade.
 *
 * Nothing here is a number of its own. Every value is read off the constants and the rules the
 * fight itself runs on (`CodexNumbers`, `swing`, `span`, `power` and the count rules beside them in
 * `Attacks`), so a retune changes the codex in the same edit and the two cannot disagree. The words
 * live in the dictionary under `codex`; this fills them in.
 */
import { ARMS, MaxDepth, type Way, type Weapon, span, swing } from '../game/kit.js';
import {
  CodexNumbers as N,
  burstMost,
  flyingSwords,
  guardNodes,
  quakeBands,
  slashBlades,
  wayScale,
} from '../game/Attacks.js';
import { BurnBeat, SpillReach } from '../game/Trial.js';
import { power } from '../game/gear.js';
import { fill, words } from '../i18n/index.js';
import type { Dictionary } from '../i18n/types.js';

export type Stat = keyof Dictionary['codex']['stat'];

/** One entry: its description at the first grade, and a table of how it grows. */
export interface Sheet {
  text: string;
  columns: Stat[];
  /** One row per grade, lowest first; each row has a value per column. */
  rows: string[][];
}

const grades = Array.from({ length: MaxDepth }, (_, i) => i + 1);

/** A number as a player wants to read it: whole where it is whole, two places at most. */
function plain(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Seconds with their unit, for the tables. The descriptions carry their own unit. */
function seconds(value: number): string {
  return fill(words().codex.seconds, { v: plain(value) });
}

function round(value: number): string {
  return String(Math.round(value));
}

export function weaponSheet(weapon: Weapon): Sheet {
  const text = words().codex.arms[weapon];
  const damage = (tier: number) => String(power(tier));
  switch (weapon) {
    case '刀':
      return {
        text: fill(text, {
          every: plain(swing('刀', 1)),
          blades: slashBlades(1),
          travel: round(N.slashSpeed * N.slashSeconds),
          bite: ARMS['刀'].bite,
        }),
        columns: ['damage', 'every', 'blades'],
        rows: grades.map((t) => [damage(t), seconds(swing('刀', t)), String(slashBlades(t))]),
      };
    case '剑':
      return {
        text: fill(text, { swords: flyingSwords(1), flurry: N.swordFlurry }),
        columns: ['damage', 'swords'],
        rows: grades.map((t) => [damage(t), String(flyingSwords(t))]),
      };
    case '盾':
      return {
        text: fill(text, { nodes: guardNodes(1), ring: round(span('盾', 1)), cool: plain(N.guardCool) }),
        columns: ['damage', 'nodes', 'ring'],
        rows: grades.map((t) => [damage(t), String(guardNodes(t)), round(span('盾', t))]),
      };
    case '弓':
      return {
        text: fill(text, { every: plain(swing('弓', 1)), range: N.shotRange }),
        columns: ['damage', 'every'],
        rows: grades.map((t) => [damage(t), seconds(swing('弓', t))]),
      };
    case '符':
      return {
        text: fill(text, { every: plain(swing('符', 1)), life: plain(N.charmSeconds) }),
        columns: ['damage', 'every'],
        rows: grades.map((t) => [damage(t), seconds(swing('符', t))]),
      };
  }
}

export function waySheet(way: Way): Sheet {
  const text = words().codex.ways[way];
  const one = (columns: Stat[], value: (t: number) => string[], filled: Record<string, string | number>): Sheet => ({
    text: fill(text, filled),
    columns,
    rows: grades.map(value),
  });
  switch (way) {
    case '金锐':
      return one(['pierce'], (t) => [String(t)], { pierce: 1 });
    case '金鸣':
      return one(['knock'], (t) => [round(N.ringReach * wayScale(t))], { reach: round(N.ringReach) });
    case '木缠':
      return one(['hold'], (t) => [seconds(N.rootSeconds * wayScale(t))], {
        reach: N.rootReach,
        hold: plain(N.rootSeconds),
      });
    case '木荣':
      // As the time one point of 护体 takes to come back, which is a number a player can picture;
      // "0.06 a second" is not.
      return one(['heal'], (t) => [seconds(1 / (N.leechPerSecond * t))], { per: round(1 / N.leechPerSecond) });
    case '水寒':
      return one(['patch'], (t) => [round(N.chillReach * wayScale(t))], {
        patch: round(N.chillReach),
        last: plain(N.chillSeconds),
        slow: round((1 - N.chillFactor) * 100),
      });
    case '水流':
      return one(['jump'], (t) => [round(N.chainReach * wayScale(t))], { jump: round(N.chainReach) });
    case '火燎':
      return one(['burn'], (t) => [seconds(N.burnSeconds * wayScale(t))], {
        burn: plain(N.burnSeconds),
        beat: plain(BurnBeat),
      });
    case '火爆':
      return one(['blast', 'targets'], (t) => [round(N.burstReach * wayScale(t)), String(burstMost(t))], {
        blast: round(N.burstReach),
        targets: burstMost(1),
      });
    case '土崩':
      return one(['rings', 'reach'], (t) => [String(quakeBands(t)), round(N.quakeReach * wayScale(t))], {
        rings: quakeBands(1),
        reach: round(N.quakeReach),
      });
    case '土固':
      return one(['layers'], (t) => [String(t)], {
        layers: 1,
        shove: N.shellReach,
        back: plain(N.shellBack),
      });
  }
}

/** The note under the weapons: copies attack on their own, and what overkill does. */
export function armsNote(): string {
  return fill(words().codex.armsNote, { spill: SpillReach });
}
