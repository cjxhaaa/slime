/**
 * Colour arithmetic, and the mistake that made it necessary.
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
 * ---
 *
 * `mix` exists for the sleep fade. There was briefly a `drowsy` in here too, which derived a
 * dimmed-but-in-hue palette per realm so that a sleeping pet still showed which realm it had
 * reached; it needed HSL to avoid turning 金丹 into khaki, it worked, and it was rejected on
 * looks — nine dim colours were more of a palette than the pet wanted. Sleep is one fixed colour
 * again, arrived at by a fade rather than a substitution. Noted here because "tint sleep per realm"
 * is an idea that will occur to somebody again, and it has been tried.
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

/**
 * Ease in and out, with exact endpoints.
 *
 * The endpoints matter more than the curve here: the sleep fade builds a gradient per frame while it
 * is in progress and uses a cached one when it is not, so "in progress" has to be able to end.
 */
export function smooth(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}
