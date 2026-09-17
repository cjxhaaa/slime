/**
 * One function, for one bug that was in every gradient in this app.
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
