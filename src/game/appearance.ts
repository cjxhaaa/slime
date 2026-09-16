import type { BodyLook, Palette } from '../slime/Slime';
import type { Cultivation } from './cultivation.js';
import { Ascended } from './realms.js';

/**
 * One palette per realm, plus one past the top.
 *
 * 练气 is the teal the slime has always been, so nothing about a new install looks different from
 * before. The ramp then goes 青 → 碧 → 金 → 橙 → 赤 → 紫 → 靛 → 玄, and it is deliberately
 * back-loaded: the pacing spends five of the eight realms inside the first day, which means the
 * three that are left have to carry four days between them. Teal to green is a shade; purple to
 * near-black is an event.
 */
const REALM_PALETTES: Palette[] = [
  { core: '#8ff0d4', edge: '#33c6a6', rim: '#1d9c85' }, // 练气
  { core: '#a8f0c0', edge: '#46c47e', rim: '#26955a' }, // 筑基
  { core: '#ffe9a8', edge: '#e8b63c', rim: '#b8861c' }, // 金丹
  { core: '#ffd0a0', edge: '#f0873c', rim: '#bd5f18' }, // 元婴
  { core: '#ffb8b8', edge: '#e85555', rim: '#b32d2d' }, // 化神
  { core: '#d9bcff', edge: '#9a5fe0', rim: '#6d33ad' }, // 炼虚
  { core: '#8b9ce8', edge: '#2b3894', rim: '#141c4e' }, // 合体
  { core: '#9f96d8', edge: '#221c3d', rim: '#0d0a1a' }, // 大乘
  { core: '#fffdf0', edge: '#ffd36b', rim: '#d19b1f' }, // 飞升
];

/**
 * How much bigger each realm makes the body.
 *
 * Six percent a realm, so 大乘 is about 1.4x 练气 — a slime you would notice had changed if you
 * walked past, without becoming something that takes up a corner of the screen. It compounds with
 * the palette rather than competing: by the end it is both darker and visibly heavier.
 */
const ScalePerRealm = 0.06;

/**
 * Where the halo starts showing.
 *
 * Below this a stage is simply in progress and the pet has nothing to say about it. Above it the
 * glow comes up, so "something is about to happen" is readable across the room without the pet
 * having done anything as rude as move.
 */
const GlowFrom = 0.55;

/**
 * How much fuller a pet looks while it is digesting a window.
 *
 * Small, because the body's size is already carrying the realm and this must not be mistaken for
 * one. What actually reads as "it is working on something" is the floor it puts under the glow.
 */
const NourishedScale = 1.05;
const NourishedGlow = 0.4;

export function lookFor(cultivation: Cultivation): BodyLook {
  const realm = Math.min(cultivation.realm, Ascended);
  const progress = Math.min(1, Math.max(0, cultivation.progress));
  const nourished = cultivation.nourished;
  const glow = progress <= GlowFrom ? 0 : (progress - GlowFrom) / (1 - GlowFrom);
  return {
    scale: (1 + ScalePerRealm * realm) * (nourished ? NourishedScale : 1),
    palette: REALM_PALETTES[realm] ?? REALM_PALETTES[0],
    // Half an hour of visibly holding something, which is the whole reason the reward is a state
    // and not a lump of qi nobody can see.
    glow: nourished ? Math.max(NourishedGlow, glow) : glow,
  };
}
