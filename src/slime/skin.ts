import { withAlpha } from './colour.js';
import type { Mood, Palette } from './Slime.js';

/**
 * What a skin is allowed to change, and the one it is changing it from.
 *
 * The split is behaviour versus paint. Everything that moves — the soft-body ring, the hops, the
 * squash, the moods, the blink, where it is looking, the devour and the breakthroughs — stays in
 * `Slime` and is the same for every skin. A skin is handed the result once a frame and only decides
 * what it looks like. That is what makes a new character cost a folder of pictures rather than a
 * second animation system: every motion the slime already has, a skin gets for free.
 *
 * Today the only implementation is the data skin in `skins/dataSkin.ts`, built from a `skin.json`
 * and a handful of images. A scripted skin would implement this same interface — which is why it
 * is an interface and not a config object — but running somebody else's code in a window that can
 * close and kill other applications needs a sandbox first, so that is deliberately not here yet.
 */
export interface Skin {
  readonly id: string;
  /**
   * Stands in for the realm ramp, one palette per realm, the last one repeated past the end.
   * Null keeps the ramp, which is what a skin should do unless it has a reason not to: the colour
   * is how the pet says which realm it has reached.
   */
  readonly realms: readonly Palette[] | null;
  /** The three states that outrank the realm colour. */
  readonly moods: MoodPalettes;
  readonly body: BodyStyle;
  /**
   * How far from the body's centre anything this skin draws can reach, per side, in body radii.
   *
   * `Slime.bounds()` folds this into the area it repaints. Without it an ear that sticks out past
   * the reserved margin is drawn once and never cleared, and leaves a trail across the desktop.
   * Per side because nearly everything a skin adds goes upwards, and reserving the height of an
   * ear on all four sides would repaint close to twice the area for nothing.
   */
  readonly reach: Reach;
  /** Under the body, already translated to its centre. Not called while it is wrapping a window. */
  drawBehind(context: CanvasRenderingContext2D, frame: FaceFrame): void;
  /**
   * Inside the body, already clipped to it, under the specular highlight. Null when there is
   * nothing to draw there, which saves the clip — every frame, for the skin nearly everybody wears.
   */
  readonly drawOverlay: ((context: CanvasRenderingContext2D, frame: FaceFrame) => void) | null;
  drawFace(context: CanvasRenderingContext2D, frame: FaceFrame): void;
  /** Over the face. Not called while it is wrapping a window. */
  drawFront(context: CanvasRenderingContext2D, frame: FaceFrame): void;
}

export interface Reach {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface MoodPalettes {
  alert: Palette;
  nudge: Palette;
  sleep: Palette;
}

export interface BodyStyle {
  /** How see-through the jelly is. 0.92 is what it has always been. */
  opacity: number;
  /** The outline. 0 for none. */
  rimWidth: number;
  /** The two white highlights that make it read as wet. */
  shine: boolean;
}

/**
 * Everything a skin is told about the body each frame. One object, reused, so drawing a face does
 * not allocate.
 */
export interface FaceFrame {
  mood: Mood;
  radius: number;
  /** How far the soft body is squashed on each axis. 1 is round. */
  squash: { x: number; y: number };
  /** Where it is looking, each axis roughly -1 to 1. */
  look: { x: number; y: number };
  /** 1 eyes open, 0 shut mid-blink. */
  open: number;
  /** Seconds, for anything that wants to drift. */
  clock: number;
}

export const ClassicMoods: MoodPalettes = {
  alert: { core: '#ffd48a', edge: '#f59b2c', rim: '#c9761a' },
  // Acknowledged but still pending: the same hue, drained of urgency. Still clearly not "calm",
  // because whatever raised it has not gone away.
  nudge: { core: '#ffe9c4', edge: '#e8b978', rim: '#b58a4e' },
  // One colour for every realm, arrived at by a fade rather than by a substitution. Deriving a
  // dimmed version of each realm's own palette was tried — see the note in `colour.ts` — and nine
  // dim colours turned out to be more of a palette than the pet wanted.
  sleep: { core: '#b9d8ee', edge: '#6fa8cd', rim: '#4d86ab' },
};

export const ClassicBody: BodyStyle = { opacity: 0.92, rimWidth: 2, shine: true };

export const ClassicInk = '#12332e';
export const ClassicBlush = '#ff7a7a';

/** The face the slime has always had, in whatever ink and blush a skin asks for. */
export function drawClassicFace(
  context: CanvasRenderingContext2D,
  frame: FaceFrame,
  ink = ClassicInk,
  blushColour = ClassicBlush,
): void {
  const { mood, radius } = frame;
  const scale = frame.squash;
  const eyeGap = radius * 0.34;
  const eyeY = -radius * 0.08 * scale.y;
  const lookX = frame.look.x * radius * 0.16;
  const lookY = frame.look.y * radius * 0.12;
  const open = frame.open;

  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineCap = 'round';

  const eyes: Array<[number, number]> = [
    [-eyeGap * scale.x + lookX, eyeY + lookY],
    [eyeGap * scale.x + lookX, eyeY + lookY],
  ];

  if (mood === 'asleep' || (mood === 'sleepy' && open < 0.5)) {
    context.lineWidth = 2.4;
    for (const [ex, ey] of eyes) {
      context.beginPath();
      context.arc(ex, ey, radius * 0.12, 0.25 * Math.PI, 0.75 * Math.PI);
      context.stroke();
    }
  } else if (mood === 'happy') {
    // Blush first, so the eye arcs sit on top of it. Two soft patches are what turn "eyes
    // closed" into "pleased" — without them an upturned arc reads much the same as a squint.
    //
    // Drawn as a gradient at high alpha rather than a flat patch at low alpha, and that is not a
    // style choice. Red composited over this body at 0.4 lands on a grey-beige, because the
    // green channel it is blending into is almost maxed — two dirty smudges instead of a blush.
    // At 0.75 the centre is actually pink, and the gradient is what keeps it from being a disc.
    context.save();
    for (const side of [-1, 1]) {
      const cx = side * radius * 0.36 * scale.x + lookX;
      const cy = eyeY + radius * 0.2 + lookY;
      const spread = radius * 0.16;
      const blush = context.createRadialGradient(cx, cy, 0, cx, cy, spread);
      blush.addColorStop(0, withAlpha(blushColour, 0.78));
      blush.addColorStop(1, withAlpha(blushColour, 0));
      context.fillStyle = blush;
      context.beginPath();
      context.ellipse(cx, cy, spread, spread * 0.62, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.lineWidth = 2.6;
    for (const [ex, ey] of eyes) {
      context.beginPath();
      context.arc(ex, ey + radius * 0.07, radius * 0.135, 1.1 * Math.PI, 1.9 * Math.PI);
      context.stroke();
    }
  } else {
    const wide = mood === 'surprised' || mood === 'alert' ? 1.35 : 1;
    for (const [ex, ey] of eyes) {
      context.beginPath();
      context.ellipse(
        ex,
        ey,
        radius * 0.105 * wide,
        radius * 0.13 * wide * Math.max(0.06, open),
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      if (open > 0.6) {
        context.save();
        context.fillStyle = '#ffffff';
        context.globalAlpha = 0.9;
        context.beginPath();
        context.ellipse(
          ex - radius * 0.035,
          ey - radius * 0.05 * wide,
          radius * 0.032,
          radius * 0.038,
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.restore();
      }
    }
  }

  const mouthY = radius * 0.26 * scale.y;
  context.lineWidth = 2.2;
  context.beginPath();
  if (mood === 'happy') {
    // An ω, as two arcs in two separate paths.
    //
    // In one path the canvas joins the end of the first arc to the start of the second with a
    // straight line, which draws a bar across the top and closes the whole thing into a dark
    // blob. And at the old radius — 0.085, under four pixels — a 2.2px stroke was wider than the
    // arcs were tall, so what little survived filled in solid. Both of those were invisible at
    // the size the pet is normally drawn and obvious the moment it was magnified.
    const w = radius * 0.115;
    context.lineWidth = 2;
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(lookX + side * w, mouthY, w, 0, Math.PI);
      context.stroke();
    }
  } else if (mood === 'surprised' || mood === 'alert') {
    context.ellipse(lookX, mouthY, radius * 0.075, radius * 0.1, 0, 0, Math.PI * 2);
    context.fill();
  } else if (mood === 'dragged') {
    context.ellipse(lookX, mouthY, radius * 0.11, radius * 0.07, 0, 0, Math.PI * 2);
    context.fill();
  } else if (mood === 'asleep' || mood === 'sleepy') {
    context.moveTo(lookX - radius * 0.07, mouthY);
    context.lineTo(lookX + radius * 0.07, mouthY);
    context.stroke();
  } else {
    context.arc(lookX, mouthY - radius * 0.04, radius * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
    context.stroke();
  }
}

const nothing = (): void => {};

/**
 * The slime as it has always been. What the pet wears before any skin has loaded, and what it
 * falls back to when the chosen one is missing or broken.
 */
export const Classic: Skin = {
  id: 'classic',
  realms: null,
  moods: ClassicMoods,
  body: ClassicBody,
  reach: { left: 0, right: 0, top: 0, bottom: 0 },
  drawBehind: nothing,
  drawOverlay: null,
  drawFace: (context, frame) => drawClassicFace(context, frame),
  drawFront: nothing,
};
