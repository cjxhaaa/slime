/**
 * 宗门 — the look every panel in a level shares, in the canvas.
 *
 * The settings window became a sect's hall — rice paper, ink, a lacquered plaque, cinnabar seals,
 * jade for what is chosen and gold for what is earned — and the panels in a level were still dark
 * slate cards from before it. They are the same app, and the level is the part people actually
 * look at, so they get the same hall: these are the same colours as `settings.css`, and the same
 * few shapes drawn with a canvas instead of CSS.
 *
 * Kept to a handful of helpers on purpose. Each panel still lays itself out and owns its own hit
 * areas; this only decides what a panel, a plaque, a plate and a button look like.
 */
import type { Rect } from './Pause.js';

export const Sect = {
  paper: '#f4ead3',
  paperDeep: '#eadbb9',
  card: '#fbf5e6',
  ink: '#2a211b',
  muted: '#7b6a58',
  line: '#d8c5a0',
  lineStrong: '#b89a64',
  jade: '#3f8f7a',
  jadeLight: '#6cc2a6',
  cinnabar: '#b8322a',
  cinnabarLight: '#d5523f',
  gold: '#c9a24a',
  goldLight: '#e8cf8a',
  lacquer: '#3b1d16',
  lacquerLight: '#5a2a1e',
} as const;

/** The brush hand for titles, and the plain hand for everything that has to be read quickly. */
export const TitleFace = '"KaiTi", "STKaiti", "Kaiti SC", "BiauKai", "SimKai", serif';
export const BodyFace = '"Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif';

/** Tracking for a title, where the canvas supports it; ignored where it does not. */
function track(context: CanvasRenderingContext2D, spacing: string): void {
  const spaced = context as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in spaced) spaced.letterSpacing = spacing;
}

/**
 * A sheet of rice paper: a soft shadow so it has an edge on any desktop, a warm wash, a lacquer rim
 * with a thin gold rule inside it, and gold brackets in two corners.
 */
export function paperPanel(context: CanvasRenderingContext2D, box: Rect, radius = 8): void {
  const { x, y, width, height } = box;
  context.save();
  context.shadowColor = 'rgba(30, 15, 5, 0.45)';
  context.shadowBlur = 22;
  context.shadowOffsetY = 6;
  const wash = context.createLinearGradient(x, y, x, y + height);
  wash.addColorStop(0, Sect.card);
  wash.addColorStop(1, Sect.paperDeep);
  context.fillStyle = wash;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.restore();

  context.save();
  context.lineWidth = 2;
  context.strokeStyle = Sect.lacquerLight;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(201, 162, 74, 0.7)';
  context.beginPath();
  context.roundRect(x + 4, y + 4, width - 8, height - 8, Math.max(2, radius - 3));
  context.stroke();
  // Corner brackets, top left and bottom right.
  context.lineWidth = 2;
  context.strokeStyle = Sect.gold;
  const arm = 12;
  context.beginPath();
  context.moveTo(x + 7, y + 7 + arm);
  context.lineTo(x + 7, y + 7);
  context.lineTo(x + 7 + arm, y + 7);
  context.moveTo(x + width - 7, y + height - 7 - arm);
  context.lineTo(x + width - 7, y + height - 7);
  context.lineTo(x + width - 7 - arm, y + height - 7);
  context.stroke();
  context.restore();
}

/**
 * The lacquered board a panel's title hangs on, centred at `cx`, `cy`: dark red wood, a gold edge,
 * and the title in the brush hand in gold leaf between two diamond knots.
 */
export function plaque(context: CanvasRenderingContext2D, title: string, cx: number, cy: number, size = 19): Rect {
  context.save();
  context.font = `700 ${size}px ${TitleFace}`;
  // Tracking adds space after the last character too, so the text is set half a gap right of the
  // middle to sit centred.
  const gap = Math.round(size * 0.35);
  track(context, `${gap}px`);
  const textWidth = context.measureText(title).width;
  const width = textWidth + 64;
  const height = size + 16;
  const box = { x: cx - width / 2, y: cy - height / 2, width, height };
  const wood = context.createLinearGradient(0, box.y, 0, box.y + height);
  wood.addColorStop(0, Sect.lacquerLight);
  wood.addColorStop(1, Sect.lacquer);
  context.shadowColor = 'rgba(30, 10, 5, 0.4)';
  context.shadowBlur = 6;
  context.shadowOffsetY = 2;
  context.fillStyle = wood;
  context.beginPath();
  context.roundRect(box.x, box.y, width, height, 4);
  context.fill();
  context.shadowColor = 'transparent';
  context.lineWidth = 1.5;
  context.strokeStyle = Sect.gold;
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(232, 207, 138, 0.35)';
  context.beginPath();
  context.roundRect(box.x + 3, box.y + 3, width - 6, height - 6, 2);
  context.stroke();
  // The knots.
  context.fillStyle = Sect.gold;
  for (const side of [-1, 1]) {
    const kx = cx + side * (textWidth / 2 + 18);
    context.beginPath();
    context.moveTo(kx, cy - 4);
    context.lineTo(kx + 4, cy);
    context.lineTo(kx, cy + 4);
    context.lineTo(kx - 4, cy);
    context.closePath();
    context.fill();
  }
  context.fillStyle = Sect.goldLight;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title, cx + gap / 2, cy + 1);
  context.restore();
  return box;
}

/**
 * A plate of dark lacquer with a gold edge — for the things that sit over the desktop all level
 * long (the bar, the row of waves), which have to read on any wallpaper and must not shout.
 */
export function lacquerPlate(context: CanvasRenderingContext2D, box: Rect, radius: number, alpha = 0.9): void {
  const { x, y, width, height } = box;
  context.save();
  context.globalAlpha *= alpha;
  const wood = context.createLinearGradient(0, y, 0, y + height);
  wood.addColorStop(0, '#4a2219');
  wood.addColorStop(1, '#2a130d');
  context.fillStyle = wood;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.restore();
  context.save();
  context.lineWidth = 1.5;
  context.strokeStyle = 'rgba(201, 162, 74, 0.85)';
  context.beginPath();
  context.roundRect(x + 0.75, y + 0.75, width - 1.5, height - 1.5, radius);
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(232, 207, 138, 0.18)';
  context.beginPath();
  context.roundRect(x + 3.5, y + 3.5, width - 7, height - 7, Math.max(2, radius - 3));
  context.stroke();
  context.restore();
}

export type Tone = 'cinnabar' | 'jade' | 'paper';

/**
 * A button: cinnabar lacquer for the one thing a panel is for, jade for going on, paper for the
 * quieter choice. Gold-edged, brightening under the pointer, faded when it cannot be pressed.
 */
export function sealButton(
  context: CanvasRenderingContext2D,
  box: Rect,
  label: string,
  tone: Tone,
  state: { hot?: boolean; disabled?: boolean } = {},
  font = `700 15px ${BodyFace}`,
): void {
  const { x, y, width, height } = box;
  const hot = !!state.hot && !state.disabled;
  context.save();
  if (state.disabled) context.globalAlpha *= 0.45;
  let fill: string | CanvasGradient;
  let ink: string;
  let edge: string;
  if (tone === 'paper') {
    fill = hot ? Sect.card : Sect.paper;
    ink = Sect.ink;
    edge = hot ? Sect.cinnabar : Sect.lineStrong;
  } else {
    const [top, bottom] = tone === 'cinnabar' ? [Sect.cinnabarLight, Sect.cinnabar] : [Sect.jadeLight, Sect.jade];
    const ramp = context.createLinearGradient(0, y, 0, y + height);
    ramp.addColorStop(0, top);
    ramp.addColorStop(1, bottom);
    fill = ramp;
    ink = '#fff3e0';
    edge = Sect.gold;
    if (hot) {
      context.shadowColor = tone === 'cinnabar' ? 'rgba(213, 82, 63, 0.55)' : 'rgba(108, 194, 166, 0.55)';
      context.shadowBlur = 10;
    }
  }
  context.fillStyle = fill;
  context.beginPath();
  context.roundRect(x, y, width, height, 5);
  context.fill();
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.lineWidth = hot ? 1.8 : 1.2;
  context.strokeStyle = edge;
  context.stroke();
  if (tone !== 'paper') {
    // The lacquer's highlight along the top.
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 5, y + 1.5);
    context.lineTo(x + width - 5, y + 1.5);
    context.stroke();
  }
  context.font = font;
  track(context, '2px');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = ink;
  // Half the tracking right of centre, for the same reason as in `plaque`.
  context.fillText(label, x + width / 2 + 1, y + height / 2 + 1);
  context.restore();
}

/** A small cinnabar seal with one character on it, the mark every section title wears. */
export function seal(context: CanvasRenderingContext2D, char: string, x: number, y: number, size = 18): void {
  context.save();
  context.fillStyle = Sect.cinnabar;
  context.beginPath();
  context.roundRect(x, y, size, size, 3);
  context.fill();
  context.strokeStyle = 'rgba(255, 243, 224, 0.55)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.roundRect(x + 2, y + 2, size - 4, size - 4, 2);
  context.stroke();
  context.fillStyle = '#fff3e0';
  context.font = `700 ${Math.round(size * 0.66)}px ${TitleFace}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(char, x + size / 2, y + size / 2 + 1);
  context.restore();
}

/** The wash behind a panel that stops the level: warm rather than blue-black, and light. */
export function veil(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = 'rgba(28, 16, 8, 0.32)';
  context.fillRect(0, 0, width, height);
}
