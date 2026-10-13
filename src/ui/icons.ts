/**
 * 道具图标 —— fifteen marks, drawn rather than drafted.
 *
 * Every slot in the 装备栏 holds one of five 兵器 or one of ten 五行, and at a glance you have to
 * know which — a row of six two-character labels is a row you have to *read*, and reading is the
 * one thing you cannot do while something is walking at you.
 *
 * ## They are drawn, not packed
 *
 * Nothing in this app is an asset and these are not either. Fifteen PNGs would need a sprite
 * sheet, a loader, a decision about device pixel ratio, and a second copy of every colour that
 * already lives in `kit.ts` — and the first time somebody retuned a tint, the icons would quietly
 * stop matching the thing they stand for. Drawn from the same table, they cannot drift.
 *
 * ## What makes them read at twenty-six pixels
 *
 * Three rules, learned from the attack effects rather than invented here:
 *
 * - **One silhouette each, no interior detail.** At this size a second shape inside the first is
 *   mud. 刀 is a curve, 剑 is a cross, 弓 is an arc — you should be able to tell them apart from
 *   the outline alone, with the fill removed.
 * - **A hot centre, never a flat fill.** The same reason `Palette` has three stops: a single
 *   colour at some alpha reads as chalk, and a ramp from near-white through the hue reads as
 *   light. These are things made of 气; they should look lit from inside.
 * - **The ten 五行 are built from their element's shape, not from ten unrelated doodles.** Both
 *   金 are angular, both 木 grow, both 水 flow, both 火 flame, both 土 are blocks. Which element
 *   something is should be legible before which of its two ways it is.
 */
import { type Element, type Way, type Weapon, FIVE, PATHS } from '../game/kit.js';

/** A hot core for a tint, so a shape reads as lit rather than filled. */
function lit(
  context: CanvasRenderingContext2D,
  tint: string,
  size: number,
): CanvasGradient {
  const glow = context.createRadialGradient(0, -size * 0.12, 0, 0, 0, size * 0.72);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.45, tint);
  glow.addColorStop(1, tint);
  return glow;
}

/** The outline every icon shares, so they sit together as a set. */
function edge(context: CanvasRenderingContext2D, tint: string, size: number): void {
  context.lineWidth = Math.max(1, size * 0.07);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = tint;
}

/**
 * One item's mark, centred on the origin, fitting a box of `size`.
 *
 * The caller owns the transform and the alpha. Nothing here translates, so an icon can be drawn
 * into a slot, onto a card, or at three times the size in a test without knowing the difference.
 */
export function drawWeaponIcon(
  context: CanvasRenderingContext2D,
  weapon: Weapon,
  size: number,
  tint: string,
): void {
  const r = size / 2;
  context.save();
  context.fillStyle = lit(context, tint, size);
  edge(context, tint, size);

  if (weapon === '刀') {
    // A single curve with a spine. A sabre is the one weapon whose whole identity is that it is
    // *bent*, so the back of the blade carries the shape and the edge is the thin side.
    context.beginPath();
    context.moveTo(-r * 0.72, r * 0.68);
    context.quadraticCurveTo(r * 0.1, r * 0.34, r * 0.74, -r * 0.72);
    context.quadraticCurveTo(r * 0.3, r * 0.1, -r * 0.5, r * 0.84);
    context.closePath();
    context.fill();
    context.stroke();
    // The guard, a short bar across the heel.
    context.beginPath();
    context.moveTo(-r * 0.86, r * 0.42);
    context.lineTo(-r * 0.34, r * 0.9);
    context.stroke();
  } else if (weapon === '剑') {
    // Straight, double-edged, with a crossguard: the silhouette is a cross, which is the one
    // thing 刀 can never be mistaken for.
    context.beginPath();
    context.moveTo(0, -r * 0.92);
    context.lineTo(r * 0.2, -r * 0.34);
    context.lineTo(r * 0.2, r * 0.3);
    context.lineTo(-r * 0.2, r * 0.3);
    context.lineTo(-r * 0.2, -r * 0.34);
    context.closePath();
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(-r * 0.62, r * 0.34);
    context.lineTo(r * 0.62, r * 0.34);
    context.moveTo(0, r * 0.4);
    context.lineTo(0, r * 0.88);
    context.stroke();
  } else if (weapon === '盾') {
    // Not a shield shape — 罡气 is not held up, it **goes round you**. The first pass drew a ring
    // with a dot in it, which at slot size is a camera aperture: a closed circle says "lens" to
    // everyone and "orbit" to nobody.
    //
    // So the nodes are drawn as nodes. A body, three beads around it, and only the thin arcs
    // *between* them — the gaps are what stop it closing into a ring, and three beads at rest is
    // the one arrangement that reads as rotating.
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      context.globalAlpha = 0.42;
      context.beginPath();
      context.arc(0, 0, r * 0.66, a + 0.34, a + Math.PI * 0.62);
      context.stroke();
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.19, 0, Math.PI * 2);
      context.fill();
    }
    context.beginPath();
    context.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (weapon === '弓') {
    // The arc, its string, and the arrow on it. Nocked rather than at rest, because at rest a bow
    // is just a curve and a curve on its own is not obviously a bow.
    //
    // The numbers are worked from the arc rather than eyeballed. Centre at 0.28r with radius
    // 0.70r over 0.62π to 1.38π puts the belly out at -0.42r and both tips at **+0.02r** — so
    // that is where the string goes. The first pass put the string at -0.14r, which is on the
    // far side of the tips: a bow strung through its own belly. It also reached 1.4px outside
    // the box, which in a row of slots laps over the neighbour.
    // A **quadratic limb**, not an arc. An arc of the radius this box allows is very nearly a
    // circle over the span a bow needs, and with the string across it the whole thing closed into
    // a ring with a line through it — which read as a lens, not as a bow. A quadratic bulges and
    // then comes to a point at each tip, which is the shape that says "drawn bow".
    context.beginPath();
    context.moveTo(r * 0.16, -r * 0.88);
    context.quadraticCurveTo(-r * 0.94, 0, r * 0.16, r * 0.88);
    context.stroke();
    // The string, thin, exactly between the tips.
    context.lineWidth = Math.max(1, size * 0.035);
    context.beginPath();
    context.moveTo(r * 0.16, -r * 0.88);
    context.lineTo(r * 0.16, r * 0.88);
    context.stroke();
    edge(context, tint, size);
    // The arrow nocked on it, head clear of the string so it reads as about to go.
    context.beginPath();
    context.moveTo(-r * 0.3, 0);
    context.lineTo(r * 0.6, 0);
    context.stroke();
    context.beginPath();
    context.moveTo(r * 0.88, 0);
    context.lineTo(r * 0.52, -r * 0.22);
    context.lineTo(r * 0.52, r * 0.22);
    context.closePath();
    context.fill();
  } else {
    // 符: the paper slip, upright, with a mark down it. The one icon that is a *thing* rather than
    // an implement, which is the right reading — a 符 is not swung, it is sent.
    context.beginPath();
    context.roundRect(-r * 0.42, -r * 0.88, r * 0.84, r * 1.76, r * 0.12);
    context.fill();
    context.stroke();
    context.strokeStyle = 'rgba(40, 20, 10, 0.72)';
    context.lineWidth = Math.max(1, size * 0.06);
    context.beginPath();
    context.moveTo(0, -r * 0.56);
    context.lineTo(0, r * 0.52);
    context.moveTo(-r * 0.2, -r * 0.24);
    context.lineTo(r * 0.2, -r * 0.24);
    context.moveTo(-r * 0.2, r * 0.18);
    context.lineTo(r * 0.2, r * 0.18);
    context.stroke();
  }
  context.restore();
}

export function drawWayIcon(
  context: CanvasRenderingContext2D,
  way: Way,
  size: number,
  tint: string,
): void {
  const r = size / 2;
  context.save();
  context.fillStyle = lit(context, tint, size);
  edge(context, tint, size);

  switch (way) {
    case '金锐': {
      // Angular, and pointed through: three chevrons, the point of 锐金 being that it does not
      // stop at the first thing.
      for (let i = 0; i < 3; i++) {
        const at = -r * 0.62 + i * r * 0.56;
        context.beginPath();
        context.moveTo(at, -r * 0.6);
        context.lineTo(at + r * 0.44, 0);
        context.lineTo(at, r * 0.6);
        context.stroke();
      }
      break;
    }
    case '金鸣': {
      // The same angular language, opened outward: a struck bell is rings leaving a centre.
      for (let i = 0; i < 3; i++) {
        context.globalAlpha = 1 - i * 0.26;
        context.beginPath();
        context.arc(0, 0, r * (0.3 + i * 0.26), Math.PI * 1.18, Math.PI * 1.82);
        context.stroke();
        context.beginPath();
        context.arc(0, 0, r * (0.3 + i * 0.26), Math.PI * 0.18, Math.PI * 0.82);
        context.stroke();
      }
      context.globalAlpha = 1;
      break;
    }
    case '木缠': {
      // It grows and it *holds*: a tendril that coils back on itself.
      context.beginPath();
      context.moveTo(-r * 0.1, r * 0.88);
      context.bezierCurveTo(-r * 0.9, r * 0.2, r * 0.8, -r * 0.1, -r * 0.2, -r * 0.84);
      context.stroke();
      context.beginPath();
      context.arc(-r * 0.2, -r * 0.84, r * 0.16, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(-r * 0.46, r * 0.26);
      context.quadraticCurveTo(-r * 0.86, -r * 0.08, -r * 0.5, -r * 0.3);
      context.stroke();
      break;
    }
    case '木荣': {
      // Growth that gives back: a leaf, with the vein that makes it a leaf rather than an eye.
      context.beginPath();
      context.moveTo(0, r * 0.9);
      context.bezierCurveTo(-r * 1, r * 0.2, -r * 0.6, -r * 0.9, 0, -r * 0.9);
      context.bezierCurveTo(r * 0.6, -r * 0.9, r * 1, r * 0.2, 0, r * 0.9);
      context.closePath();
      context.fill();
      context.stroke();
      context.strokeStyle = 'rgba(28, 54, 20, 0.6)';
      context.beginPath();
      context.moveTo(0, r * 0.74);
      context.lineTo(0, -r * 0.7);
      context.stroke();
      break;
    }
    case '水寒': {
      // Water that has stopped: six arms, the one shape nobody mistakes for anything else.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
        context.stroke();
        context.beginPath();
        context.moveTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
        context.lineTo(Math.cos(a + 0.5) * r * 0.76, Math.sin(a + 0.5) * r * 0.76);
        context.moveTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52);
        context.lineTo(Math.cos(a - 0.5) * r * 0.76, Math.sin(a - 0.5) * r * 0.76);
        context.lineWidth = Math.max(1, size * 0.045);
        context.stroke();
        edge(context, tint, size);
      }
      break;
    }
    case '水流': {
      // Water that has not: one line, carrying on past where it entered — which is what 流水 does
      // to a target.
      context.beginPath();
      context.moveTo(-r * 0.88, -r * 0.3);
      context.bezierCurveTo(-r * 0.2, -r * 0.9, r * 0.2, r * 0.3, r * 0.88, -r * 0.2);
      context.stroke();
      context.beginPath();
      context.moveTo(-r * 0.88, r * 0.42);
      context.bezierCurveTo(-r * 0.2, -r * 0.18, r * 0.2, r * 0.9, r * 0.88, r * 0.46);
      context.globalAlpha = 0.6;
      context.stroke();
      context.globalAlpha = 1;
      break;
    }
    case '火燎': {
      // It stays lit: a flame, tall, with the inner tongue that says it is still burning.
      context.beginPath();
      context.moveTo(0, r * 0.9);
      context.bezierCurveTo(-r * 0.92, r * 0.2, -r * 0.3, -r * 0.3, -r * 0.16, -r * 0.92);
      context.bezierCurveTo(r * 0.24, -r * 0.34, r * 0.92, r * 0.18, 0, r * 0.9);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = 'rgba(255, 240, 200, 0.85)';
      context.beginPath();
      context.moveTo(0, r * 0.66);
      context.bezierCurveTo(-r * 0.36, r * 0.2, -r * 0.08, -r * 0.08, 0, -r * 0.38);
      context.bezierCurveTo(r * 0.14, -r * 0.04, r * 0.36, r * 0.2, 0, r * 0.66);
      context.closePath();
      context.fill();
      break;
    }
    case '火爆': {
      // It does not: a burst, all at once, spikes alternating long and short so it reads as an
      // explosion rather than as a star.
      context.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const far = i % 2 === 0 ? r * 0.96 : r * 0.44;
        const x = Math.cos(a) * far;
        const y = Math.sin(a) * far;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
      break;
    }
    case '土崩': {
      // Ground opening: three shards of different heights coming up, which is exactly what the
      // effect does.
      const shards = [
        { x: -r * 0.62, h: 0.62, w: 0.26 },
        { x: 0, h: 1, w: 0.3 },
        { x: r * 0.6, h: 0.76, w: 0.24 },
      ];
      for (const s of shards) {
        context.beginPath();
        context.moveTo(s.x - r * s.w, r * 0.86);
        context.lineTo(s.x - r * s.w * 0.6, r * (0.86 - s.h * 1.5));
        context.lineTo(s.x + r * s.w * 0.4, r * (0.86 - s.h * 1.3));
        context.lineTo(s.x + r * s.w, r * 0.86);
        context.closePath();
        context.fill();
        context.stroke();
      }
      break;
    }
    default: {
      // 土固: the same blocks, lying down and overlapping — armour is ground that stays put.
      context.beginPath();
      context.roundRect(-r * 0.88, r * 0.1, r * 1.76, r * 0.56, r * 0.1);
      context.fill();
      context.stroke();
      context.beginPath();
      context.roundRect(-r * 0.6, -r * 0.62, r * 1.2, r * 0.56, r * 0.1);
      context.fill();
      context.stroke();
      break;
    }
  }
  context.restore();
}

/** The colour an element's icons are drawn in. */
export function elementTint(element: Element): string {
  return FIVE[element].tint;
}

/** One entry point, so a caller holding an item does not have to branch on what it is. */
export function drawItemIcon(
  context: CanvasRenderingContext2D,
  sort: { sort: 'arm'; weapon: Weapon } | { sort: 'way'; way: Way },
  size: number,
  tint: string,
): void {
  if (sort.sort === 'arm') drawWeaponIcon(context, sort.weapon, size, tint);
  else drawWayIcon(context, sort.way, size, tint);
}

/** What a way is drawn in by default: its own phase's colour. */
export function wayTint(way: Way): string {
  return PATHS[way].tint;
}
