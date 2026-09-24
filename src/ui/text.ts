/**
 * Fitting words into a fixed box, in five languages.
 *
 * The cards are a fixed 186 pixels wide because three of them have to sit in a row on a laptop, and
 * that number was chosen while every string in the app was Chinese. Chinese is the easy case: every
 * glyph is one em, the titles are four characters, and a title fits or it does not. English broke
 * both halves of that assumption at once — 「万符齐发」 is 108 pixels and "Ten Thousand Talismans"
 * is 330 — so this file exists to do the two things the old code did not.
 *
 * ## Breaking in the right places
 *
 * Han, kana and fullwidth punctuation break **between any two characters**; Latin and Hangul break
 * **at spaces**, because both write words with gaps in them and a reader of either sees a word cut
 * in half as an error rather than as a line break. Getting this wrong is not subtle: the old
 * per-character loop turned "…every breath, and none of them miss" into "…breath, an / d none of
 * them miss", which is the kind of thing that makes a build look unfinished in one language while
 * looking perfect in another.
 *
 * A short 禁则 table comes with it. Chinese and Japanese do not start a line with 、。」）— the
 * punctuation hangs at the end of the line it belongs to — and do not end one with 「（. Four lines
 * of code, and without them the closing bracket of a blurb lands alone at the left margin often
 * enough to notice.
 *
 * ## Shrinking, only as far as it has to
 *
 * `fit` walks a ladder of sizes and takes the first that lands inside the box in at most `maxLines`
 * lines, so Chinese keeps the full 27 pixels it was designed at and English drops only as far as it
 * needs to. Shrinking everything to the worst case would cost the language that has no problem.
 *
 * ## Measuring is injected
 *
 * Every function here takes a `measure` callback rather than a canvas context. That is what lets
 * the check suite run them under Node against a fake monospace metric and assert where the breaks
 * land, which is the part that actually goes wrong.
 */

/** Measures one string, at whatever font the caller has already set. */
export type Measure = (text: string) => number;

/** Measures one string at a given pixel size, for the ladder in `fit`. */
export type MeasureAt = (size: number, text: string) => number;

/**
 * Characters that may be broken between without a space: Han, kana, and the fullwidth forms.
 *
 * Hangul is deliberately **not** here. Korean syllables look like CJK and behave like Latin: the
 * script puts spaces between words, so it breaks at them.
 */
function breaksFreely(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // kana
    (code >= 0x3400 && code <= 0x4dbf) || // extension A
    (code >= 0x4e00 && code <= 0x9fff) || // unified ideographs
    (code >= 0xf900 && code <= 0xfaff) || // compatibility ideographs
    (code >= 0x3000 && code <= 0x303f) || // CJK punctuation
    (code >= 0xff00 && code <= 0xff60) // fullwidth forms
  );
}

/** 禁则: never the first thing on a line. The punctuation hangs off the end of the line before. */
const NoLead = '、。，．：；！？）」』】〉》”’%）］,.!?:;';

/** 禁则: never the last thing on a line. The bracket goes down with what it opens. */
const NoTrail = '（「『【〈《“‘（［';

/**
 * Splits text into the units a line may be built from.
 *
 * A Latin or Hangul word arrives whole, with any trailing space attached to it — so the space
 * disappears at a line end instead of being pushed to the front of the next line. A CJK character
 * arrives on its own, except where the 禁则 table says it has to stay with a neighbour.
 */
export function segments(text: string): string[] {
  const out: string[] = [];
  let word = '';

  const flush = (): void => {
    if (word) out.push(word);
    word = '';
  };

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;

    if (ch === ' ' || ch === '\t') {
      // The space rides on the end of the word it follows, so a break there costs nothing.
      if (word) {
        out.push(word + ch);
        word = '';
      }
      continue;
    }

    if (breaksFreely(code)) {
      flush();
      const last = out[out.length - 1];
      // 、 joins the character before it; 「 waits for the character after.
      if (last !== undefined && (NoLead.includes(ch) || NoTrail.includes(last[last.length - 1]))) {
        out[out.length - 1] = last + ch;
      } else {
        out.push(ch);
      }
      continue;
    }

    if (NoLead.includes(ch) && !word && out.length > 0) {
      // Latin punctuation after a CJK run — ") ." and friends belong to what they close.
      out[out.length - 1] += ch;
      continue;
    }

    word += ch;
  }
  flush();
  return out;
}

/**
 * Greedy line filling.
 *
 * A single segment wider than the whole box is broken by character rather than allowed to hang out
 * of it. That is the last resort and it only fires on a word longer than the card — a German
 * compound, or a name somebody typed without spaces — but silently overflowing is worse than an
 * ugly break.
 */
export function wrap(text: string, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = '';

  const hardBreak = (piece: string): void => {
    let part = '';
    for (const ch of piece) {
      if (part && measure(part + ch) > width) {
        lines.push(part);
        part = ch;
      } else {
        part += ch;
      }
    }
    line = part;
  };

  for (const piece of segments(text)) {
    const next = line + piece;
    if (!line) {
      if (measure(piece.trimEnd()) > width) hardBreak(piece);
      else line = piece;
      continue;
    }
    if (measure(next.trimEnd()) > width) {
      lines.push(line.trimEnd());
      if (measure(piece.trimEnd()) > width) hardBreak(piece);
      else line = piece;
    } else {
      line = next;
    }
  }
  if (line.trimEnd()) lines.push(line.trimEnd());
  return lines.length > 0 ? lines : [''];
}

/**
 * The largest size on the ladder at which the text fits the box in `maxLines` lines.
 *
 * Falls through to the smallest size and returns whatever that produces, clipped to `maxLines`.
 * Returning something too long would put a title through the blurb underneath it, and there is no
 * size at which a sentence fits in a card — the ladder's job is to handle names, not paragraphs.
 */
export function fit(
  text: string,
  width: number,
  sizes: readonly number[],
  maxLines: number,
  measure: MeasureAt,
): { size: number; lines: string[] } {
  let last: string[] = [text];
  for (const size of sizes) {
    const lines = wrap(text, width, (s) => measure(size, s));
    if (lines.length <= maxLines) return { size, lines };
    last = lines;
  }
  return { size: sizes[sizes.length - 1], lines: last.slice(0, maxLines) };
}
