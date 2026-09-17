/**
 * Colour arithmetic, and the two mistakes that made it necessary.
 *
 * **The first was in every gradient in this app.**
 *
 * `addColorStop(1, 'rgba(0, 0, 0, 0)')` is the obvious way to fade something out, and it is wrong.
 * Canvas interpolates gradient stops in **non-premultiplied** RGBA, so a ramp from `#ffe9a8` to
 * transparent *black* passes through half-alpha dark grey on the way: the midpoint is the average
 * of the two colours, and one of them is black. The falloff comes out muddy, and over a dark
 * background it comes out visibly **darker than the background** — a glow with a dirty ring around
 * it, or in the worst case a beam of light that reads as a column of smoke.
 *
 * I spent two rounds retinting a light column that kept looking like smoke before noticing that the
 * smoke was coming from the transparent stop rather than from the opaque one.
 *
 * The fix is to fade to the same colour at zero alpha, so only the alpha moves.
 *
 * **The second was sleeping in blue**, and it is the reason there is HSL in here. See `drowsy`.
 *
 * Both of them are the same shape of error: reaching for the nearest expression of "less of this"
 * without checking which axis it actually moves.
 */

/** The same colour, fully transparent. Takes `#rgb` or `#rrggbb`. */
export function clear(hex: string): string {
  const body = hex.slice(1);
  const wide = body.length >= 6;
  const part = (index: number) =>
    wide
      ? parseInt(body.slice(index * 2, index * 2 + 2), 16)
      : parseInt(body[index] + body[index], 16);
  return `rgba(${part(0)}, ${part(1)}, ${part(2)}, 0)`;
}

/** Blend two `#rrggbb` colours. `t` of 0 is all `a`, 1 is all `b`. */
export function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, index: number) =>
    parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const at = (index: number) =>
    Math.round(channel(a, index) * (1 - t) + channel(b, index) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${at(0)}${at(1)}${at(2)}`;
}

/** Hue in degrees, saturation and lightness as 0 to 1. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function toHsl(hex: string): Hsl {
  const at = (index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  const r = at(0);
  const g = at(1);
  const b = at(2);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { h: 0, s: 0, l };
  const s = span / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / span + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / span + 2) * 60
        : ((r - g) / span + 4) * 60;
  return { h, s, l };
}

export function fromHsl({ h, s, l }: Hsl): string {
  const chroma = (1 - Math.abs(2 * l - 1)) * Math.min(1, Math.max(0, s));
  const sector = (((h % 360) + 360) % 360) / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base: [number, number, number] =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second];
  const lift = l - chroma / 2;
  return `#${base
    .map((part) =>
      Math.round(Math.min(1, Math.max(0, part + lift)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Where a sleeping colour's lightness is pulled to, and how far.
 *
 * Lightness only, which is the whole point — see `drowsy`.
 */
const SleepLightness = 0.22;
const SleepPull = 0.78;
/**
 * And saturation is *kept*, near enough.
 *
 * Trimming it is the obvious move and it is what makes dark warm colours turn to mud: pale gold at
 * low saturation and low lightness is khaki, and pale orange is brown. Deep gold is still gold.
 */
const SleepSaturation = 0.72;

/**
 * The same colour, asleep.
 *
 * Sleep used to be one fixed pale blue that replaced the realm palette outright, which meant a
 * 大乘 pet and a 练气 pet were the same colour every time they dozed off — and since a desk pet
 * spends most of its life asleep, the thing you spent four days climbing was invisible most of the
 * time. The whole design rests on the body *being* the progress bar, and sleep was switching it off.
 *
 * So: **hue untouched, lightness pulled down.** Depth, not a different colour.
 *
 * The first attempt at that did it in RGB — drain towards grey, then blend towards a cool dark — and
 * it worked for the greens and purples and turned 金丹 into khaki and 元婴 into brown. Both of
 * those mistakes are the same mistake: the palettes are not all in the same register, so nothing
 * expressed as a blend between two RGB colours can darken all nine without dragging some of their
 * hues somewhere else. Lightness is the axis being asked for, so it is the axis to work in.
 *
 * Note also that darkening a *pale* colour requires holding saturation up rather than dropping it,
 * because a pale colour is pale by having little chroma at high lightness, and taking the lightness
 * away without giving chroma back leaves grey.
 *
 * One free property of pulling towards a *target* lightness rather than multiplying: the band
 * closes from both ends. 练气's pale rim comes down and 大乘's near-black rim comes **up**, so the
 * late realms keep an outline while they doze instead of going to a silhouette — and the core still
 * lands lighter than the rim in all nine, which is what keeps the body lit from above.
 */
export function drowsy(hex: string): string {
  const { h, s, l } = toHsl(hex);
  return fromHsl({
    h,
    s: s * SleepSaturation,
    l: l * (1 - SleepPull) + SleepLightness * SleepPull,
  });
}
