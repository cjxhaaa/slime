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
 * stop matching the thing they stand for. The tint still comes from the table: it is the light
 * behind each object and the colour of the tile it sits on, so the two cannot drift.
 *
 * ## Why they are tiles now, and why the objects are *things*
 *
 * The first set was fifteen glowing outlines on nothing — legible, and every one of them looked
 * like a diagram of the item rather than the item. The genre these borrow from (Warcraft III's
 * command card is the reference everyone has in their head) solves that in four moves, and these
 * copy all four:
 *
 * - **A tile, not a floating mark.** Each icon owns a dark square with its tint glowing up out of
 *   the middle, a bevel, and a hard rim. A row of tiles reads as a row of slots holding things; a
 *   row of outlines reads as a row of symbols.
 * - **The object is a real object.** A 刀 is steel with a wrapped grip and a red tassel, a 符 is
 *   yellow paper with vermilion on it, 金鸣 is a bronze bell. Material is what makes the 修仙
 *   reading land — a cyan outline of a sword is any sword, a sword with a cloud guard trailing 剑气
 *   is a 飞剑.
 * - **Cartoon, not painterly.** Every shape gets a thick dark ink line and is shaded in two flat
 *   tones — lit side and shadow side — with a white streak on the edge that catches the light. At
 *   thirty pixels a soft painterly ramp turns to mush; two tones and an outline stay a silhouette.
 * - **One glint.** A four-point sparkle on the hardest edge, which is cheap and is most of what
 *   makes an icon look *precious* rather than merely drawn.
 *
 * ## What still has to hold at thirty pixels
 *
 * - **The silhouette is the identity.** The five weapons lean different ways on purpose — 刀 up
 *   to the right with a tassel hanging, 剑 up to the left trailing light, 盾 a disc, 弓 a crescent
 *   with an arrow across it, 符 an upright slip — so the outline alone separates them.
 * - **The ten 五行 share their element's material.** Both 金 are bright metal, both 木 are green
 *   and growing, both 水 are blue and cold, both 火 are flame, both 土 are stone. Which element it
 *   is reads before which of its two ways.
 * - **Nothing leaves the tile.** Everything is clipped to it, and every coordinate is inside it,
 *   so a slot never laps over its neighbour — `checks.ts` measures that.
 */
import { type Element, type Way, type Weapon, FIVE, PATHS } from '../game/kit.js';
import { clear, mix } from '../slime/colour.js';

/** The line every shape is drawn round with. Not black: a black ink line on a dark tile vanishes. */
const Ink = '#1a1024';

/** The near-black the tiles fall off to at the corners. */
const Night = '#07060c';

type Stops = [number, string][];

/**
 * A pen that draws in units of the icon's half-size, optionally along a turned axis.
 *
 * `u` runs along the axis and `v` across it, so a sword can be described as "from the pommel to
 * the tip" and then laid diagonally without every coordinate being worked out by hand. Turning is
 * done here rather than with `context.rotate`, so the numbers that reach the canvas are the real
 * positions — which is what lets `checks.ts` measure the icons against their box.
 */
class Pen {
  constructor(
    readonly c: CanvasRenderingContext2D,
    /** Half the icon's size, in pixels. */
    readonly r: number,
    /** The ink line's width, in pixels. */
    readonly ink: number,
    private readonly ox = 0,
    private readonly oy = 0,
    private readonly turn = 0,
  ) {}

  /** The same pen, with its origin moved and its axis turned. */
  along(ox: number, oy: number, turn: number): Pen {
    return new Pen(this.c, this.r, this.ink, ox, oy, turn);
  }

  x(u: number, v: number): number {
    return (this.ox + u * Math.cos(this.turn) - v * Math.sin(this.turn)) * this.r;
  }

  y(u: number, v: number): number {
    return (this.oy + u * Math.sin(this.turn) + v * Math.cos(this.turn)) * this.r;
  }

  begin(): this {
    this.c.beginPath();
    return this;
  }

  move(u: number, v: number): this {
    this.c.moveTo(this.x(u, v), this.y(u, v));
    return this;
  }

  line(u: number, v: number): this {
    this.c.lineTo(this.x(u, v), this.y(u, v));
    return this;
  }

  quad(cu: number, cv: number, u: number, v: number): this {
    this.c.quadraticCurveTo(this.x(cu, cv), this.y(cu, cv), this.x(u, v), this.y(u, v));
    return this;
  }

  curve(au: number, av: number, bu: number, bv: number, u: number, v: number): this {
    this.c.bezierCurveTo(
      this.x(au, av),
      this.y(au, av),
      this.x(bu, bv),
      this.y(bu, bv),
      this.x(u, v),
      this.y(u, v),
    );
    return this;
  }

  arc(u: number, v: number, radius: number, from: number, to: number, back = false): this {
    this.c.arc(this.x(u, v), this.y(u, v), radius * this.r, from + this.turn, to + this.turn, back);
    return this;
  }

  /** A closed polygon from a flat list of `u, v` pairs. */
  poly(...points: number[]): this {
    this.begin().move(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) this.line(points[i], points[i + 1]);
    return this.close();
  }

  close(): this {
    this.c.closePath();
    return this;
  }

  linear(u0: number, v0: number, u1: number, v1: number, stops: Stops): CanvasGradient {
    const g = this.c.createLinearGradient(this.x(u0, v0), this.y(u0, v0), this.x(u1, v1), this.y(u1, v1));
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    return g;
  }

  radial(u: number, v: number, radius: number, stops: Stops): CanvasGradient {
    const x = this.x(u, v);
    const y = this.y(u, v);
    const g = this.c.createRadialGradient(x, y, 0, x, y, radius * this.r);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    return g;
  }
}

// ---------------------------------------------------------------- the cartoon kit

/**
 * A shape, in the house style: filled, its shadow side darkened, then inked round.
 *
 * `shape` is called more than once — fill, clip, ink — because a canvas path is consumed by the
 * clip. `shadow` is drawn inside the shape and only inside it, which is what a cel shadow is: the
 * same flat colour, darker, cut off by the object's own edge.
 */
function solid(
  p: Pen,
  shape: () => void,
  fill: string | CanvasGradient,
  shadow?: { shape: () => void; colour: string },
): void {
  const { c } = p;
  shape();
  c.fillStyle = fill;
  c.fill();
  if (shadow) {
    c.save();
    shape();
    c.clip();
    shadow.shape();
    c.fillStyle = shadow.colour;
    c.fill();
    c.restore();
  }
  shape();
  outline(p);
}

function outline(p: Pen, width = p.ink): void {
  p.c.lineWidth = width;
  p.c.lineJoin = 'round';
  p.c.lineCap = 'round';
  p.c.strokeStyle = Ink;
  p.c.stroke();
}

/**
 * A stroked line with an ink edge either side — a vine, a stem, a shaft.
 *
 * Drawn as three passes of the same path: ink wide, colour narrower, a thin light line down the
 * middle. That is how a tube is drawn in every cartoon, and it is the only way to give a line an
 * outline without tracing its two edges by hand.
 */
function tube(p: Pen, path: () => void, width: number, colour: string, shine?: string): void {
  const { c, r } = p;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  path();
  c.strokeStyle = Ink;
  c.lineWidth = width * r + p.ink * 2;
  c.stroke();
  path();
  c.strokeStyle = colour;
  c.lineWidth = width * r;
  c.stroke();
  if (shine) {
    path();
    c.strokeStyle = shine;
    c.lineWidth = Math.max(0.8, width * r * 0.3);
    c.stroke();
  }
}

/** A white streak where an edge catches the light. */
function streak(p: Pen, path: () => void, alpha = 0.85, width = 0.07): void {
  const { c } = p;
  path();
  c.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  c.lineWidth = Math.max(0.8, width * p.r);
  c.lineCap = 'round';
  c.stroke();
}

/** The four-point glint. One per icon, on the thing that is supposed to look sharp or precious. */
function sparkle(p: Pen, u: number, v: number, size: number): void {
  const s = size;
  const k = s * 0.22;
  p.poly(u, v - s, u + k, v - k, u + s, v, u + k, v + k, u, v + s, u - k, v + k, u - s, v, u - k, v - k);
  p.c.fillStyle = '#ffffff';
  p.c.fill();
}

/** Light behind the object, in the item's own tint. It is what ties an icon to `kit.ts`. */
function aura(p: Pen, u: number, v: number, radius: number, tint: string, strength = 0.75): void {
  const { c } = p;
  c.fillStyle = p.radial(u, v, radius, [
    [0, mixAlpha(tint, strength)],
    [0.45, mixAlpha(tint, strength * 0.35)],
    [1, clear(tint)],
  ]);
  c.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
}

/** `#rrggbb` at an alpha. */
function mixAlpha(hex: string, alpha: number): string {
  return clear(hex).replace(/, 0\)$/, `, ${alpha.toFixed(3)})`);
}

// ---------------------------------------------------------------- the tile

const Corner = 0.24;

function tilePath(p: Pen, inset = 0): void {
  const { c, r } = p;
  c.beginPath();
  c.roundRect(-r + inset, -r + inset, (r - inset) * 2, (r - inset) * 2, Math.max(0, r * Corner - inset));
}

/**
 * The square the object sits on: dark, lit from the middle in the item's tint, with faint rays.
 *
 * The rays are the cheapest way to make the back of the tile feel like *light* rather than a
 * gradient fill — the same reason a Warcraft icon is almost never on a flat colour.
 */
function backdrop(p: Pen, tint: string): void {
  const { c } = p;
  tilePath(p);
  c.fillStyle = p.radial(0, -0.1, 1.45, [
    [0, deepen(tint, 0.34)],
    [0.55, deepen(tint, 0.16)],
    [1, Night],
  ]);
  c.fill();

  c.save();
  c.globalAlpha = 0.16;
  c.fillStyle = tint;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    p.begin().move(0, 0);
    p.line(Math.cos(a - 0.12) * 1, Math.sin(a - 0.12) * 1);
    p.line(Math.cos(a + 0.12) * 1, Math.sin(a + 0.12) * 1);
    p.close();
    c.fill();
  }
  c.restore();
}

/**
 * The tint, saturated and darkened to a given lightness.
 *
 * Every tint in `kit.ts` is a pastel, picked to glow on a desktop — and a pastel darkened toward
 * black goes *grey*, which made the first pass of these tiles look like fifteen squares of slate.
 * Pulling the saturation up as the lightness comes down is what gives a Warcraft tile its deep,
 * rich back, while keeping the hue that ties it to the table.
 */
function deepen(hex: string, lightness: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const sat = d === 0 ? 0 : d / (1 - Math.abs(max + min - 1));
  const s = Math.min(1, Math.max(sat, 0.55));
  const chroma = (1 - Math.abs(2 * lightness - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const m = lightness - chroma / 2;
  const [r1, g1, b1] =
    h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const hexOf = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hexOf(r1)}${hexOf(g1)}${hexOf(b1)}`;
}

/** The bevel and the rim, drawn last so they sit over anything that ran to the tile's edge. */
function frame(p: Pen): void {
  const { c } = p;
  const bevel = Math.max(1, p.ink * 0.9);
  tilePath(p, bevel);
  c.lineWidth = bevel;
  c.strokeStyle = p.linear(-1, -1, 1, 1, [
    [0, 'rgba(255, 255, 255, 0.42)'],
    [0.45, 'rgba(255, 255, 255, 0.06)'],
    [1, 'rgba(0, 0, 0, 0.5)'],
  ]);
  c.stroke();
  tilePath(p, p.ink * 0.5);
  c.lineWidth = p.ink;
  c.strokeStyle = Ink;
  c.stroke();
  // A vignette, so the object is the brightest thing on the tile and the corners are not.
  c.fillStyle = p.radial(0, 0, 1.42, [
    [0.62, 'rgba(7, 6, 12, 0)'],
    [1, 'rgba(7, 6, 12, 0.55)'],
  ]);
  tilePath(p);
  c.fill();
}

/** Sets up a tile, runs `art` clipped to it, and finishes it. */
function tile(
  context: CanvasRenderingContext2D,
  size: number,
  tint: string,
  art: (p: Pen) => void,
): void {
  const p = new Pen(context, size / 2, Math.max(1, size * 0.05));
  context.save();
  backdrop(p, tint);
  context.save();
  tilePath(p);
  context.clip();
  art(p);
  context.restore();
  frame(p);
  context.restore();
}

// ---------------------------------------------------------------- materials

const Steel = {
  light: '#f4fbff',
  mid: '#b9d3e6',
  dark: '#6f8ea8',
};
const Gold = {
  light: '#fff2b0',
  mid: '#f2b632',
  dark: '#a8681a',
};
const Lacquer = {
  light: '#ff8a5c',
  mid: '#c23a24',
  dark: '#7a1a14',
};

// ---------------------------------------------------------------- 兵器

/**
 * One weapon's tile, centred on the origin, fitting a box of `size`.
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
  tile(context, size, tint, (p) => {
    if (weapon === '刀') sabre(p, tint);
    else if (weapon === '剑') flyingSword(p, tint);
    else if (weapon === '盾') guard(p, tint);
    else if (weapon === '弓') bow(p, tint);
    else talisman(p, tint);
  });
}

/**
 * 刀 — a broad 大刀, up to the right, with a red tassel hanging off the pommel.
 *
 * The blade is the one weapon whose identity is that it is *bent* and *heavy*: the back is nearly
 * straight, the edge bellies out toward the tip, and the tip curls back up to the spine. The tassel
 * is not decoration — it is the one thing hanging *down* in a set where everything else points, and
 * it is the most 武侠 thing a weapon can wear.
 */
function sabre(p: Pen, tint: string): void {
  aura(p, 0.2, -0.2, 1.1, tint);
  const a = p.along(0.06, -0.06, -Math.PI / 4);

  // The tassel first, so the pommel sits over its knot. It hangs straight down whatever the blade
  // is doing, which is what makes it read as cord rather than as part of the hilt.
  const tx = a.x(-0.84, 0) / p.r;
  const ty = a.y(-0.84, 0) / p.r;
  const tassel = (): void => {
    p.begin().move(tx, ty);
    p.quad(tx - 0.08, ty + 0.16, tx - 0.22, ty + 0.42);
    p.line(tx + 0.14, ty + 0.42);
    p.quad(tx + 0.04, ty + 0.16, tx, ty);
    p.close();
  };
  solid(p, tassel, p.linear(tx, ty, tx, ty + 0.42, [[0, '#ff6a50'], [1, '#a3161a']]), {
    shape: () => p.poly(tx - 0.02, ty, tx + 0.2, ty, tx + 0.2, ty + 0.44, tx - 0.02, ty + 0.44),
    colour: 'rgba(90, 8, 12, 0.45)',
  });
  // The knot binding the strands, a band of gold across the top of the tassel.
  p.begin().move(tx - 0.07, ty + 0.15).line(tx + 0.06, ty + 0.15);
  p.c.strokeStyle = Gold.mid;
  p.c.lineWidth = Math.max(1, p.r * 0.07);
  p.c.stroke();

  // Grip, wrapped.
  solid(a, () => a.poly(-0.8, -0.075, -0.32, -0.075, -0.32, 0.075, -0.8, 0.075), '#5a2418');
  for (const u of [-0.7, -0.57, -0.44]) {
    a.begin().move(u, -0.075).line(u + 0.08, 0.075);
    a.c.strokeStyle = '#c8603c';
    a.c.lineWidth = Math.max(0.8, p.r * 0.05);
    a.c.stroke();
  }
  solid(a, () => a.begin().arc(-0.86, 0, 0.09, 0, Math.PI * 2), Gold.mid);

  // The blade: a near-straight back, an edge that bellies out, a tip that sweeps back to the spine.
  const blade = (): void => {
    a.begin().move(-0.26, -0.13);
    a.quad(0.42, -0.19, 0.98, -0.12);
    a.quad(1.2, -0.07, 1.08, 0.13);
    a.quad(0.6, 0.44, -0.26, 0.15);
    a.close();
  };
  solid(a, blade, a.linear(0, -0.18, 0, 0.3, [[0, Steel.light], [1, Steel.mid]]), {
    // The edge side in shadow, cut along a line that follows the blade's own curve.
    shape: () => {
      a.begin().move(-0.3, 0.04);
      a.quad(0.5, 0.06, 1.1, -0.02);
      a.line(1.1, 0.26);
      a.line(-0.3, 0.3);
      a.close();
    },
    colour: Steel.dark,
  });
  streak(a, () => a.begin().move(-0.12, -0.085).quad(0.45, -0.13, 0.92, -0.075));

  // 九环: rings threaded through the spine. Three, because three is what survives at slot size,
  // and they are what turn "a big knife" into a 刀 nobody would mistake for a kitchen one.
  for (const u of [0.04, 0.26, 0.48]) {
    a.begin().arc(u, -0.2, 0.075, 0, Math.PI * 2);
    a.c.lineWidth = Math.max(1, p.r * 0.045) + p.ink;
    a.c.strokeStyle = Ink;
    a.c.stroke();
    a.c.lineWidth = Math.max(1, p.r * 0.045);
    a.c.strokeStyle = Gold.mid;
    a.c.stroke();
  }

  // The guard: a gold disc seen edge-on, which is how a 刀's 护手 reads from the side.
  solid(
    a,
    () => a.poly(-0.36, -0.25, -0.24, -0.25, -0.24, 0.27, -0.36, 0.27),
    a.linear(-0.3, -0.25, -0.3, 0.27, [[0, Gold.light], [0.5, Gold.mid], [1, Gold.dark]]),
  );
  sparkle(a, 0.98, -0.1, 0.17);
}

/**
 * 剑 — a 飞剑, up to the left, with 剑气 streaming off it.
 *
 * Straight and double-edged against the 刀's curve, and it leans the *other* way so the two never
 * share a silhouette. The blade is split down its ridge into a lit half and a shadowed half, which
 * is the single most recognisable way a 剑 is drawn in this genre. What makes it a *flying* sword
 * rather than a sword is the trail: three streaks of its tint running back off the hilt, because a
 * 剑 in this game is not held — it goes after things on its own.
 */
function flyingSword(p: Pen, tint: string): void {
  aura(p, -0.15, -0.15, 1.15, tint, 0.85);
  const a = p.along(0.06, 0.06, (-3 * Math.PI) / 4);

  // 剑气: tapered streaks behind the hilt.
  const { c } = p;
  for (const [v, len, alpha] of [
    [0, 1.15, 0.9],
    [-0.28, 0.85, 0.6],
    [0.28, 0.85, 0.6],
  ] as const) {
    a.begin().move(-0.3, v - 0.07).quad(-0.3 - len * 0.6, v, -0.3 - len, v).quad(-0.3 - len * 0.6, v, -0.3, v + 0.07);
    a.close();
    c.fillStyle = a.linear(-0.3, v, -0.3 - len, v, [[0, mixAlpha('#ffffff', alpha)], [0.3, mixAlpha(tint, alpha)], [1, clear(tint)]]);
    c.fill();
  }

  // Grip and pommel.
  solid(a, () => a.poly(-0.7, -0.065, -0.3, -0.065, -0.3, 0.065, -0.7, 0.065), '#1e4a5e');
  for (const u of [-0.62, -0.5, -0.38]) {
    a.begin().move(u, -0.065).line(u + 0.06, 0.065);
    c.strokeStyle = '#6fc4dc';
    c.lineWidth = Math.max(0.8, p.r * 0.045);
    c.stroke();
  }
  solid(a, () => a.poly(-0.7, 0, -0.78, -0.09, -0.88, 0, -0.78, 0.09), Gold.mid);

  // The blade, split at the ridge.
  const blade = (): void => {
    a.poly(-0.24, -0.13, 0.86, -0.13, 1.14, 0, 0.86, 0.13, -0.24, 0.13);
  };
  solid(a, blade, Steel.light, {
    shape: () => a.poly(-0.3, 0, 1.2, 0, 1.2, 0.3, -0.3, 0.3),
    colour: Steel.mid,
  });
  a.begin().move(-0.2, 0).line(1, 0);
  c.strokeStyle = 'rgba(70, 110, 140, 0.55)';
  c.lineWidth = Math.max(0.6, p.r * 0.03);
  c.stroke();

  // The guard, a pair of swept-back points, like a cloud's edge.
  const guard = (): void => {
    a.begin().move(-0.18, 0);
    a.quad(-0.18, -0.24, -0.4, -0.36);
    a.quad(-0.26, -0.12, -0.32, 0);
    a.quad(-0.26, 0.12, -0.4, 0.36);
    a.quad(-0.18, 0.24, -0.18, 0);
    a.close();
  };
  solid(a, guard, a.linear(-0.2, -0.36, -0.2, 0.36, [[0, Gold.light], [0.5, Gold.mid], [1, Gold.dark]]));
  streak(a, () => a.begin().move(-0.1, -0.075).line(0.84, -0.075), 0.9, 0.06);
  sparkle(a, 1.0, 0, 0.18);
}

/**
 * 盾 — a bronze round shield with a 太极 at its heart, and 罡气 going round it.
 *
 * The first set refused to draw a shield at all, on the grounds that 罡气 is not held up — it
 * circles you. Both halves of that are true, so this draws both: the disc says "defence" faster
 * than anything else could, and the swept arc round it, thick at the front and trailing to nothing,
 * says it *moves*. A closed ring would say neither, which is why the arc stops short.
 */
function guard(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, 0, 1.1, tint, 0.7);

  // The back of the orbit, behind the disc.
  swoosh(p, tint, Math.PI * 0.85, Math.PI * 1.55, 0.5);

  const disc = (): void => {
    p.begin().arc(0, 0, 0.66, 0, Math.PI * 2);
  };
  solid(p, disc, p.radial(-0.25, -0.3, 1.0, [[0, Gold.light], [0.45, '#d9962e'], [1, '#6e3f12']]), {
    shape: () => {
      p.begin().arc(0, 0, 0.7, -Math.PI * 0.15, Math.PI * 0.85);
      p.arc(-0.1, -0.1, 0.7, Math.PI * 0.85, -Math.PI * 0.15, true);
      p.close();
    },
    colour: 'rgba(80, 40, 10, 0.4)',
  });
  // The inner field, a step down from the rim.
  p.begin().arc(0, 0, 0.5, 0, Math.PI * 2);
  c.lineWidth = Math.max(0.8, p.ink * 0.8);
  c.strokeStyle = 'rgba(70, 36, 8, 0.75)';
  c.stroke();

  taiji(p, 0.3);
  streak(p, () => p.begin().arc(0, 0, 0.58, Math.PI * 1.08, Math.PI * 1.42), 0.8, 0.06);

  // The front of the orbit, over the disc.
  swoosh(p, tint, -Math.PI * 0.15, Math.PI * 0.55, 1);
  sparkle(p, -0.36, -0.42, 0.16);
}

/** A crescent of 罡气 round the origin, thick in the middle of its sweep and gone at both ends. */
function swoosh(p: Pen, tint: string, from: number, to: number, alpha: number): void {
  const { c } = p;
  const mid = (from + to) / 2;
  p.begin().arc(0, 0, 0.9, from, to);
  p.arc(Math.cos(mid) * 0.1, Math.sin(mid) * 0.1, 0.78, to, from, true);
  p.close();
  c.fillStyle = mixAlpha(mix(tint, '#ffffff', 0.5), alpha);
  c.fill();
  c.lineWidth = Math.max(0.8, p.ink * 0.7);
  c.strokeStyle = mixAlpha(Ink, alpha * 0.8);
  c.stroke();
}

/** A 太极, centred, of radius `size`. */
function taiji(p: Pen, size: number): void {
  const { c } = p;
  const light = '#f7f0dc';
  const dark = '#24394e';
  p.begin().arc(0, 0, size, 0, Math.PI * 2);
  c.fillStyle = light;
  c.fill();
  p.begin().arc(0, 0, size, -Math.PI / 2, Math.PI / 2);
  p.arc(0, size / 2, size / 2, Math.PI / 2, (3 * Math.PI) / 2);
  p.arc(0, -size / 2, size / 2, Math.PI / 2, -Math.PI / 2, true);
  p.close();
  c.fillStyle = dark;
  c.fill();
  p.begin().arc(0, -size / 2, size * 0.17, 0, Math.PI * 2);
  c.fill();
  p.begin().arc(0, size / 2, size * 0.17, 0, Math.PI * 2);
  c.fillStyle = light;
  c.fill();
  p.begin().arc(0, 0, size, 0, Math.PI * 2);
  outline(p, Math.max(0.8, p.ink * 0.8));
}

/**
 * 弓 — a lacquered bow, drawn, with an arrow on the string whose head is lit with qi.
 *
 * Drawn rather than at rest, because a bow at rest is a curve and a curve on its own is not
 * obviously a bow. The string comes back to a point — the V is what reads as "about to loose" —
 * and the arrow crosses the whole tile corner to corner, which makes it the one weapon whose
 * silhouette is a long line *through* a crescent.
 */
function bow(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0.45, -0.45, 0.9, tint, 0.8);
  const a = p.along(0, 0, -Math.PI / 4);

  // The string, back to the nock.
  a.begin().move(-0.24, -0.9).line(-0.52, 0).line(-0.24, 0.9);
  c.strokeStyle = '#f4ead0';
  c.lineWidth = Math.max(0.8, p.r * 0.045);
  c.stroke();

  // The limbs, one crescent: outer curve out to the tips, inner curve back.
  const limbs = (): void => {
    a.begin().move(-0.24, -0.9);
    a.quad(0.7, 0, -0.24, 0.9);
    a.quad(0.26, 0, -0.24, -0.9);
    a.close();
  };
  solid(a, limbs, a.linear(0.3, -0.5, 0.3, 0.5, [[0, Lacquer.light], [0.5, Lacquer.mid], [1, Lacquer.dark]]), {
    shape: () => a.poly(-0.4, 0.1, 0.5, 0.1, 0.5, 1, -0.4, 1),
    colour: 'rgba(60, 8, 6, 0.35)',
  });
  // Gold caps on the tips and a wrap at the grip.
  solid(a, () => a.begin().arc(-0.24, -0.9, 0.08, 0, Math.PI * 2), Gold.mid);
  solid(a, () => a.begin().arc(-0.24, 0.9, 0.08, 0, Math.PI * 2), Gold.mid);
  solid(a, () => a.poly(0.1, -0.13, 0.26, -0.13, 0.26, 0.13, 0.1, 0.13), Gold.mid);

  // The arrow: shaft, fletching, a lit head.
  tube(a, () => a.begin().move(-0.66, 0).line(0.72, 0), 0.07, '#e8d2a0');
  solid(a, () => a.poly(-0.68, 0, -0.5, -0.17, -0.38, -0.17, -0.5, 0), '#f4f4f4');
  solid(a, () => a.poly(-0.68, 0, -0.5, 0.17, -0.38, 0.17, -0.5, 0), '#e04a3c');
  a.c.fillStyle = a.radial(0.86, 0, 0.42, [[0, mixAlpha('#ffffff', 0.9)], [0.4, mixAlpha(tint, 0.6)], [1, clear(tint)]]);
  a.c.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
  solid(a, () => a.poly(1.06, 0, 0.7, -0.17, 0.78, 0, 0.7, 0.17), a.linear(0.7, -0.17, 0.7, 0.17, [[0, '#ffffff'], [1, mix(tint, '#3a7a2a', 0.4)]]));
  streak(a, () => a.begin().move(0.04, -0.62).quad(0.3, -0.3, 0.32, -0.04), 0.7, 0.05);
  sparkle(a, 1.02, -0.02, 0.16);
}

/**
 * 符 — a slip of yellow paper, tilted, with vermilion down it and light coming off its edges.
 *
 * The one icon that is a thing rather than an implement, which is the right reading: a 符 is not
 * swung, it is sent. Yellow and red is the whole of its identity — nobody who has seen a 僵尸
 * film needs the script to be legible, only to be red and to look written.
 */
function talisman(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, 0, 1.15, tint, 0.9);
  const a = p.along(0, 0, -0.2);

  const slip = (): void => {
    a.begin().move(-0.4, -0.84);
    a.line(0.4, -0.84);
    a.line(0.4, 0.74);
    // A torn foot, so it reads as paper rather than as a card.
    a.line(0.24, 0.84);
    a.line(0.1, 0.74);
    a.line(-0.06, 0.86);
    a.line(-0.22, 0.75);
    a.line(-0.4, 0.84);
    a.close();
  };
  solid(a, slip, a.linear(0, -0.84, 0, 0.84, [[0, '#fff2a6'], [0.6, '#ffd24a'], [1, '#e6a628']]), {
    shape: () => a.poly(0.12, -1, 0.6, -1, 0.6, 1, 0.12, 1),
    colour: 'rgba(170, 100, 10, 0.32)',
  });

  // The script. A cap, a long stroke with hooks off it, and a seal at the foot.
  const red = '#d4231a';
  c.strokeStyle = red;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(1, p.r * 0.085);
  a.begin().move(-0.24, -0.62).line(0.24, -0.62);
  a.move(-0.18, -0.5).quad(0, -0.62, 0.18, -0.5);
  c.stroke();
  a.begin().move(0, -0.44);
  a.curve(-0.2, -0.24, 0.2, -0.1, 0, 0.08);
  a.curve(-0.2, 0.22, 0.14, 0.3, 0, 0.42);
  a.move(-0.22, -0.18).line(-0.06, -0.24);
  a.move(0.22, 0.02).line(0.06, -0.02);
  a.move(-0.2, 0.24).line(-0.05, 0.2);
  c.stroke();
  a.begin().arc(0, 0.58, 0.11, 0, Math.PI * 2);
  c.lineWidth = Math.max(0.8, p.r * 0.06);
  c.stroke();

  streak(a, () => a.begin().move(-0.31, -0.74).line(-0.31, 0.62), 0.55, 0.05);
  sparkle(p, 0.5, -0.66, 0.2);
  sparkle(p, -0.62, 0.3, 0.1);
}

// ---------------------------------------------------------------- 五行

export function drawWayIcon(
  context: CanvasRenderingContext2D,
  way: Way,
  size: number,
  tint: string,
): void {
  tile(context, size, tint, (p) => {
    switch (way) {
      case '金锐':
        return piercing(p, tint);
      case '金鸣':
        return bell(p, tint);
      case '木缠':
        return vines(p, tint);
      case '木荣':
        return sprout(p, tint);
      case '水寒':
        return ice(p, tint);
      case '水流':
        return wave(p, tint);
      case '火燎':
        return flame(p, tint);
      case '火爆':
        return blast(p, tint);
      case '土崩':
        return quake(p, tint);
      default:
        return shell(p, tint);
    }
  });
}

/**
 * 锐金 — a golden needle of 金气 through a ring it has already passed.
 *
 * The ring is the whole point. A spike on its own says "sharp"; a spike with a ring round its
 * middle — half behind it and half in front — says "went *through*", which is what 锐金 does to
 * everything in a line.
 */
function piercing(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0.1, -0.1, 1.1, tint, 0.8);
  const a = p.along(-0.04, 0.04, -Math.PI / 4);

  // Speed behind it.
  for (const [v, from] of [
    [-0.3, -0.5],
    [0.3, -0.5],
    [0, -0.78],
  ] as const) {
    a.begin().move(from, v).line(from - 0.55, v);
    c.strokeStyle = 'rgba(255, 246, 210, 0.55)';
    c.lineWidth = Math.max(0.8, p.r * 0.06);
    c.lineCap = 'round';
    c.stroke();
  }

  const ring = (from: number, to: number): void => {
    c.save();
    c.translate(a.x(-0.1, 0), a.y(-0.1, 0));
    c.rotate(-Math.PI / 4);
    c.scale(0.32, 1);
    c.beginPath();
    c.arc(0, 0, p.r * 0.5, from, to);
    c.restore();
  };
  const band = (from: number, to: number): void => {
    ring(from, to);
    c.lineWidth = p.r * 0.13 + p.ink * 2;
    c.strokeStyle = Ink;
    c.stroke();
    ring(from, to);
    c.lineWidth = p.r * 0.13;
    c.strokeStyle = '#fff1b8';
    c.stroke();
  };
  band(Math.PI / 2, (3 * Math.PI) / 2);

  const needle = (): void => {
    a.poly(1.12, 0, 0.18, -0.22, -0.9, 0, 0.18, 0.22);
  };
  solid(a, needle, Gold.light, {
    shape: () => a.poly(-0.92, 0, 1.14, 0, 1.14, 0.24, -0.92, 0.24),
    colour: Gold.mid,
  });
  streak(a, () => a.begin().move(-0.5, -0.06).line(0.7, -0.11), 0.9, 0.05);

  band(-Math.PI / 2, Math.PI / 2);
  sparkle(a, 1.04, 0, 0.2);
}

/**
 * 鸣金 — a bronze bell, struck, with the sound going out both ways.
 *
 * 金 that does not cut: it *rings*, and what is near it is pushed off. The bell is the most 修仙
 * object the element has, and the arcs either side are the shove.
 */
function bell(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, 0, 1.1, tint, 0.7);

  for (const [radius, alpha] of [
    [0.74, 0.85],
    [0.92, 0.5],
  ] as const) {
    for (const mid of [0, Math.PI]) {
      p.begin().arc(0, 0.04, radius, mid - 0.5, mid + 0.5);
      c.strokeStyle = `rgba(255, 240, 190, ${alpha})`;
      c.lineWidth = Math.max(1, p.r * 0.09);
      c.lineCap = 'round';
      c.stroke();
    }
  }

  // The hanging loop.
  p.begin().arc(0, -0.66, 0.11, Math.PI, 0);
  c.lineWidth = p.r * 0.09 + p.ink * 2;
  c.strokeStyle = Ink;
  c.stroke();
  p.begin().arc(0, -0.66, 0.11, Math.PI, 0);
  c.lineWidth = p.r * 0.09;
  c.strokeStyle = Gold.mid;
  c.stroke();

  // The clapper, under the mouth.
  solid(p, () => p.begin().arc(0, 0.64, 0.1, 0, Math.PI * 2), Gold.dark);

  const body = (): void => {
    p.begin().move(-0.3, -0.48);
    p.quad(0, -0.7, 0.3, -0.48);
    p.curve(0.38, -0.26, 0.34, 0.2, 0.54, 0.4);
    p.quad(0.6, 0.52, 0.44, 0.54);
    p.line(-0.44, 0.54);
    p.quad(-0.6, 0.52, -0.54, 0.4);
    p.curve(-0.34, 0.2, -0.38, -0.26, -0.3, -0.48);
    p.close();
  };
  solid(p, body, p.linear(-0.5, 0, 0.5, 0, [[0, Gold.light], [0.4, Gold.mid], [1, Gold.dark]]), {
    shape: () => p.poly(0.14, -0.8, 0.8, -0.8, 0.8, 0.8, 0.14, 0.8),
    colour: 'rgba(110, 60, 10, 0.4)',
  });
  // Two bands and three bosses between them, the way a 编钟 is cast.
  c.strokeStyle = 'rgba(90, 50, 10, 0.75)';
  c.lineWidth = Math.max(0.8, p.r * 0.05);
  p.begin().move(-0.33, -0.2).line(0.33, -0.2);
  p.move(-0.44, 0.3).line(0.44, 0.3);
  c.stroke();
  c.fillStyle = 'rgba(90, 50, 10, 0.8)';
  for (const u of [-0.18, 0, 0.18]) {
    p.begin().arc(u, 0.05, 0.05, 0, Math.PI * 2);
    c.fill();
  }
  streak(p, () => p.begin().move(-0.2, -0.42).quad(-0.28, 0, -0.34, 0.36), 0.8, 0.06);
  sparkle(p, -0.22, -0.5, 0.16);
}

/**
 * 缠木 — two vines out of the ground, twisting up into a hook.
 *
 * It grows and it *holds*. The curl at the top is the snare: a thing that has grown round
 * something, rather than a plant that happens to be there.
 */
function vines(p: Pen, tint: string): void {
  aura(p, 0, -0.1, 1.1, tint, 0.65);

  // Earth.
  solid(p, () => p.begin().move(-1, 1).line(-1, 0.74).quad(0, 0.5, 1, 0.74).line(1, 1).close(), '#5a3a1e');

  const dark = '#2f7a24';
  const light = mix(tint, '#2f9a2a', 0.35);
  tube(
    p,
    () => p.begin().move(0.36, 0.78).curve(0.9, 0.2, -0.7, 0.06, -0.32, -0.42).quad(-0.12, -0.68, 0.18, -0.56),
    0.13,
    dark,
    'rgba(200, 255, 170, 0.55)',
  );
  tube(
    p,
    () => p.begin().move(-0.38, 0.78).curve(-0.9, 0.1, 0.72, 0.0, 0.32, -0.46).quad(0.12, -0.84, -0.22, -0.74).quad(-0.42, -0.62, -0.3, -0.48),
    0.17,
    light,
    'rgba(230, 255, 200, 0.7)',
  );
  // Thorns, on the outside of the bends.
  for (const [x, y, dx, dy] of [
    [-0.5, 0.3, -0.16, -0.06],
    [0.46, -0.06, 0.16, -0.04],
    [-0.2, -0.14, -0.06, -0.15],
  ] as const) {
    solid(p, () => p.poly(x, y - 0.05, x + dx, y + dy, x + 0.05, y + 0.04), '#d8f0a0');
  }
  leaf(p, 0.52, 0.38, 0.62, -0.06, 0.24, light);
  sparkle(p, 0.5, -0.62, 0.15);
}

/** A small leaf from a stem point toward a tip, with a vein. */
function leaf(p: Pen, x: number, y: number, tx: number, ty: number, width: number, colour: string): void {
  const nx = -(ty - y);
  const ny = tx - x;
  const n = Math.hypot(nx, ny) || 1;
  const ox = (nx / n) * width;
  const oy = (ny / n) * width;
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  const shape = (): void => {
    p.begin().move(x, y);
    p.quad(mx + ox, my + oy, tx, ty);
    p.quad(mx - ox, my - oy, x, y);
    p.close();
  };
  solid(p, shape, colour, {
    shape: () => p.poly(x, y, tx, ty, mx - ox * 2, my - oy * 2),
    colour: 'rgba(20, 70, 20, 0.35)',
  });
  p.begin().move(x, y).line(mx + (tx - mx) * 0.6, my + (ty - my) * 0.6);
  p.c.strokeStyle = 'rgba(20, 60, 20, 0.6)';
  p.c.lineWidth = Math.max(0.6, p.r * 0.035);
  p.c.stroke();
}

/**
 * 荣木 — a sprout cupping an orb of 灵气.
 *
 * Growth that gives back. The leaves say 木; the lit drop between them says "this comes back to
 * you", which is what 荣木 is — every hit returns a little 护体.
 */
function sprout(p: Pen, tint: string): void {
  aura(p, 0, -0.38, 0.95, tint, 0.85);

  solid(p, () => p.begin().move(-0.6, 0.86).quad(0, 0.46, 0.6, 0.86).close(), '#6a4426', {
    shape: () => p.poly(0, 0.4, 1, 0.4, 1, 1, 0, 1),
    colour: 'rgba(30, 14, 4, 0.35)',
  });
  tube(p, () => p.begin().move(0, 0.7).quad(0.06, 0.4, 0, 0.12), 0.12, '#4aa83a', 'rgba(220, 255, 190, 0.6)');

  const green = mix(tint, '#3fae34', 0.3);
  leaf(p, 0, 0.18, -0.86, -0.2, 0.3, green);
  leaf(p, 0, 0.18, 0.86, -0.28, 0.3, green);

  // The orb.
  const orb = (): void => {
    p.begin().arc(0, -0.42, 0.24, 0, Math.PI * 2);
  };
  solid(p, orb, p.radial(-0.07, -0.5, 0.3, [[0, '#ffffff'], [0.45, mix(tint, '#ffffff', 0.4)], [1, mix(tint, '#2f8a2a', 0.35)]]));
  sparkle(p, 0.36, -0.7, 0.13);
  sparkle(p, -0.1, -0.5, 0.09);
}

/**
 * 寒水 — water that has stopped: a cluster of ice coming up out of frost.
 *
 * Three faceted shards rather than a snowflake. A snowflake is "weather"; ice standing up out of
 * the ground is "the ground here is now cold", which is what 寒水 leaves where it lands.
 */
function ice(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, -0.1, 1.1, tint, 0.75);

  const shard = (ox: number, oy: number, turn: number, length: number, width: number): void => {
    const s = p.along(ox, oy, turn);
    const body = (): void => {
      s.poly(0, -width, length - width * 1.1, -width, length, 0, length - width * 1.1, width, 0, width);
    };
    solid(s, body, mix(tint, '#ffffff', 0.55), {
      shape: () => s.poly(-0.05, 0, length + 0.02, 0, length + 0.02, width * 1.05, -0.05, width * 1.05),
      colour: mix(tint, '#2a6fb0', 0.45),
    });
    s.begin().move(0.05, 0).line(length - 0.02, 0);
    c.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    c.lineWidth = Math.max(0.6, p.r * 0.035);
    c.stroke();
  };
  shard(-0.28, 0.82, -Math.PI / 2 - 0.5, 1.0, 0.18);
  shard(0.3, 0.82, -Math.PI / 2 + 0.52, 0.94, 0.17);
  shard(0, 0.84, -Math.PI / 2, 1.66, 0.25);

  // Frost along the foot.
  c.fillStyle = 'rgba(235, 250, 255, 0.85)';
  p.begin().move(-0.8, 0.95).quad(-0.5, 0.66, -0.2, 0.8).quad(0, 0.64, 0.24, 0.8).quad(0.52, 0.64, 0.8, 0.95).close();
  c.fill();

  // One small flake, off to the side, for the word "cold".
  c.strokeStyle = '#ffffff';
  c.lineWidth = Math.max(0.8, p.r * 0.05);
  for (let i = 0; i < 3; i++) {
    const t = (i / 3) * Math.PI;
    p.begin().move(-0.6 + Math.cos(t) * 0.16, -0.56 + Math.sin(t) * 0.16).line(-0.6 - Math.cos(t) * 0.16, -0.56 - Math.sin(t) * 0.16);
    c.stroke();
  }
  sparkle(p, 0.08, -0.72, 0.17);
}

/**
 * 流水 — a wave rising and curling over.
 *
 * Water that has not stopped. The curl is the 海水江崖 wave every robe and screen in the genre
 * has on its hem, and a crest breaking forward is the right picture for a hit that carries on to
 * the next one.
 */
function wave(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, -0.2, 1.1, tint, 0.6);

  // A lower swell behind, darker, so the main wave has something to rise out of.
  solid(p, () => p.begin().move(-1, 0.62).quad(-0.5, 0.36, 0.1, 0.58).quad(0.6, 0.3, 1, 0.5).line(1, 1).line(-1, 1).close(), '#164a8c');

  const crest = (): void => {
    p.begin().move(-0.9, 0.92);
    p.curve(-0.96, 0.1, -0.6, -0.74, 0.06, -0.76);
    p.curve(0.58, -0.78, 0.84, -0.36, 0.6, -0.08);
    p.curve(0.44, 0.1, 0.12, 0.02, 0.2, -0.24);
    p.curve(0.24, -0.42, -0.16, -0.46, -0.3, -0.12);
    p.curve(-0.42, 0.22, -0.06, 0.6, 0.86, 0.66);
    p.line(0.86, 0.92);
    p.close();
  };
  solid(p, crest, p.linear(0, -0.8, 0, 0.9, [[0, mix(tint, '#ffffff', 0.45)], [0.45, mix(tint, '#2a7fd0', 0.55)], [1, '#123e88']]), {
    shape: () => p.begin().move(-0.2, 0.2).quad(0.2, 0.6, 1, 0.5).line(1, 1).line(-1, 1).close(),
    colour: 'rgba(10, 30, 80, 0.35)',
  });
  // Foam on the lip.
  tube(p, () => p.begin().move(-0.66, -0.26).curve(-0.42, -0.7, 0.1, -0.8, 0.46, -0.58), 0.1, '#f2fcff');
  c.fillStyle = '#f2fcff';
  for (const [x, y, s] of [
    [0.66, -0.36, 0.07],
    [0.74, -0.16, 0.05],
    [0.62, 0.04, 0.04],
  ] as const) {
    p.begin().arc(x, y, s, 0, Math.PI * 2);
    c.fill();
  }
  sparkle(p, -0.5, -0.56, 0.15);
}

/** The flame's outline: a main tongue up the middle and a smaller one either side. */
function tongue(p: Pen): void {
  p.begin().move(0, 0.9);
  p.curve(-0.7, 0.9, -0.88, 0.32, -0.56, -0.16);
  p.quad(-0.48, 0.08, -0.3, 0.1);
  p.curve(-0.46, -0.34, -0.16, -0.56, 0.06, -0.96);
  p.curve(0.16, -0.56, 0.5, -0.46, 0.4, -0.06);
  p.quad(0.56, -0.2, 0.64, -0.42);
  p.curve(0.98, 0.1, 0.76, 0.9, 0, 0.9);
  p.close();
}

/**
 * 燎火 — a flame that stays lit: tall, three tongues, burning down to a white heart.
 *
 * Layered the way cartoon fire always is — red outside, orange, then near-white — because that
 * is what makes it read as *hot* rather than as an orange shape. Built from one outline at three
 * sizes, so the layers can never disagree about which way the fire leans.
 */
function flame(p: Pen, tint: string): void {
  const { c, r } = p;
  aura(p, 0, 0.1, 1.15, tint, 0.85);
  solid(p, () => tongue(p), p.linear(0, -0.96, 0, 0.9, [[0, '#ff7a3c'], [1, '#c41a0e']]));
  for (const [scale, colour] of [
    [0.7, '#ff9f2a'],
    [0.42, '#fff1b0'],
  ] as const) {
    c.save();
    c.translate(0, 0.9 * r * (1 - scale));
    c.scale(scale, scale);
    tongue(p);
    c.fillStyle = colour;
    c.fill();
    c.restore();
  }
  // Embers going up off it.
  c.fillStyle = '#ffd77a';
  for (const [x, y, s] of [
    [-0.62, -0.58, 0.06],
    [0.6, -0.72, 0.05],
    [0.34, -0.9, 0.04],
  ] as const) {
    p.begin().arc(x, y, s, 0, Math.PI * 2);
    c.fill();
  }
  streak(p, () => p.begin().move(-0.44, 0.5).quad(-0.66, 0.1, -0.5, -0.1), 0.55, 0.06);
  sparkle(p, 0.06, -0.12, 0.13);
}

/**
 * 爆火 — the other kind of fire: all at once.
 *
 * A burst with jagged, uneven spikes and debris flying off — uneven because an even star reads as a
 * star, and nothing about this is supposed to look like it was arranged.
 */
function blast(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, 0, 1.2, tint, 0.85);

  const burst = (points: number, far: number[], near: number, turn: number): void => {
    p.begin();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + turn;
      const reach = i % 2 === 0 ? far[(i / 2) % far.length] : near;
      const x = Math.cos(a) * reach;
      const y = Math.sin(a) * reach;
      if (i === 0) p.move(x, y);
      else p.line(x, y);
    }
    p.close();
  };
  solid(p, () => burst(9, [0.98, 0.78, 0.92, 0.72, 0.96, 0.8, 0.9, 0.7, 0.86], 0.5, -Math.PI / 2), '#d8261a');
  solid(p, () => burst(9, [0.74, 0.6, 0.7, 0.56, 0.72], 0.38, -Math.PI / 2 + 0.35), '#ff9a2a');
  p.begin().arc(0, 0, 0.3, 0, Math.PI * 2);
  c.fillStyle = p.radial(0, 0, 0.3, [[0, '#ffffff'], [0.6, '#fff4b8'], [1, '#ffd24a']]);
  c.fill();

  // Debris: dark chunks thrown clear.
  for (const [x, y, s] of [
    [-0.74, -0.72, 0.1],
    [0.76, 0.66, 0.09],
    [0.72, -0.66, 0.07],
    [-0.7, 0.7, 0.07],
  ] as const) {
    solid(p, () => p.poly(x - s, y, x, y - s, x + s, y + s * 0.4, x - s * 0.2, y + s), '#4a2016');
  }
  sparkle(p, 0, 0, 0.2);
}

/**
 * 崩土 — the ground split, and stone coming up through it.
 *
 * Three pillars of different heights out of a cracked slab, each with a lit face and a shadowed
 * one so it reads as a block rather than a flat shape — which is exactly what the effect does.
 */
function quake(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, -0.2, 1.1, tint, 0.6);

  // Pebbles thrown up.
  for (const [x, y, s] of [
    [-0.66, -0.62, 0.08],
    [0.62, -0.78, 0.07],
    [0.12, -0.92, 0.06],
  ] as const) {
    solid(p, () => p.poly(x - s, y + s * 0.3, x - s * 0.2, y - s, x + s, y - s * 0.2, x + s * 0.4, y + s), '#b48a56');
  }

  const pillar = (x: number, top: number, w: number, lean: number): void => {
    const body = (): void => {
      p.poly(x - w, 0.86, x - w * 0.8 + lean, top + 0.1, x + lean, top, x + w * 0.8 + lean, top + 0.12, x + w, 0.86);
    };
    solid(p, body, p.linear(x - w, 0, x, 0, [[0, '#f0d8a8'], [1, '#d2a96e']]), {
      shape: () => p.poly(x + lean * 0.5, top - 0.2, x + w + 0.3, top - 0.2, x + w + 0.3, 1, x + lean * 0.5, 1),
      colour: '#7a5230',
    });
    // The lit cap.
    p.poly(x - w * 0.8 + lean, top + 0.1, x + lean, top, x + w * 0.8 + lean, top + 0.12, x + lean, top + 0.2);
    c.fillStyle = '#fff2d0';
    c.fill();
    outline(p, Math.max(0.6, p.ink * 0.6));
  };
  pillar(-0.56, -0.12, 0.24, -0.06);
  pillar(0.56, -0.28, 0.22, 0.06);
  pillar(0, -0.76, 0.3, 0);

  // The slab, with the crack running through it.
  solid(p, () => p.begin().move(-1, 0.72).quad(0, 0.6, 1, 0.72).line(1, 1).line(-1, 1).close(), '#6a4a2a');
  p.begin().move(-0.82, 0.98).line(-0.6, 0.8).line(-0.42, 0.9).line(-0.22, 0.74);
  p.move(0.24, 0.74).line(0.4, 0.92).line(0.62, 0.8).line(0.84, 0.98);
  c.strokeStyle = Ink;
  c.lineWidth = Math.max(1, p.ink);
  c.stroke();
  sparkle(p, 0.06, -0.7, 0.15);
}

/**
 * 固土 — a 玄武 shell: stone plates, interlocked, domed over.
 *
 * Armour made of ground. A tortoise shell is the oldest picture of "cannot be hurt" the genre has,
 * and the plates are what make it stone rather than a helmet.
 */
function shell(p: Pen, tint: string): void {
  const { c } = p;
  aura(p, 0, 0, 1.1, tint, 0.65);

  const dome = (): void => {
    p.begin().move(-0.86, 0.36);
    p.curve(-0.86, -0.68, 0.86, -0.68, 0.86, 0.36);
    p.quad(0.86, 0.56, 0.62, 0.56);
    p.line(-0.62, 0.56);
    p.quad(-0.86, 0.56, -0.86, 0.36);
    p.close();
  };
  solid(p, dome, p.radial(-0.2, -0.3, 1.1, [[0, '#f4dcae'], [0.5, mix(tint, '#b08450', 0.4)], [1, '#6e4a26']]), {
    shape: () => p.begin().move(-1, 0.1).quad(0.2, 0.2, 1, -0.3).line(1, 1).line(-1, 1).close(),
    colour: 'rgba(60, 34, 10, 0.32)',
  });

  // The plates: a hexagon in the middle and the seams running out from its corners.
  const hex: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    hex.push(Math.cos(a) * 0.28, -0.08 + Math.sin(a) * 0.24);
  }
  c.strokeStyle = 'rgba(50, 28, 10, 0.85)';
  c.lineWidth = Math.max(0.8, p.ink * 0.75);
  c.lineJoin = 'round';
  p.poly(...hex);
  c.stroke();
  // The seams run out to the edge of the dome and no further.
  c.save();
  dome();
  c.clip();
  p.begin();
  for (let i = 0; i < 6; i++) {
    const x = hex[i * 2];
    const y = hex[i * 2 + 1];
    p.move(x, y).line(x * 2.3, -0.08 + (y + 0.08) * 2.6);
  }
  c.stroke();
  c.restore();
  // The rim band along the foot.
  p.begin().move(-0.8, 0.38).quad(0, 0.46, 0.8, 0.38);
  c.stroke();
  streak(p, () => p.begin().move(-0.6, -0.08).quad(-0.46, -0.42, -0.1, -0.48), 0.75, 0.06);
  sparkle(p, -0.3, -0.38, 0.15);
}

// ---------------------------------------------------------------- entry points

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
