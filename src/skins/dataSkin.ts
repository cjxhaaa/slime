import {
  ClassicBlush,
  ClassicInk,
  ClassicMoods,
  type FaceFrame,
  type Reach,
  type Skin,
  drawClassicFace,
} from '../slime/skin.js';
import { type AccessorySpec, type FaceSlot, type SkinSpec, faceSlotFor } from './manifest.js';

/**
 * A skin made of a `skin.json` and some pictures.
 *
 * Every picture is decoded before the skin is handed over, so a skin either arrives whole or not
 * at all. The alternative — swap now, let pictures pop in as they load — would show a pet with
 * no face for a frame or two, and the overlay only repaints when something moves, so a picture that
 * finished loading while the pet sat still would not appear until it was next poked.
 */
export async function buildSkin(
  id: string,
  spec: SkinSpec,
  urlFor: (file: string) => string,
): Promise<Skin> {
  const wanted = new Set<string>();
  for (const file of Object.values(spec.face.images)) if (file) wanted.add(file);
  for (const item of spec.accessories) wanted.add(item.image);
  if (spec.body.overlay) wanted.add(spec.body.overlay);

  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [...wanted].map(async (file) => {
      const picture = new Image();
      picture.src = urlFor(file);
      try {
        await picture.decode();
      } catch {
        throw new Error(`${file} could not be read as a picture`);
      }
      if (picture.naturalWidth === 0 || picture.naturalHeight === 0) {
        throw new Error(`${file} has no size`);
      }
      images.set(file, picture);
    }),
  );

  const placed = spec.accessories.map((item) => {
    const picture = images.get(item.image)!;
    return {
      ...item,
      picture,
      aspect: picture.naturalHeight / picture.naturalWidth,
      radians: (item.rotation * Math.PI) / 180,
    };
  });
  const behind = placed.filter((item) => item.layer === 'behind');
  const front = placed.filter((item) => item.layer === 'front');

  const ink = spec.face.ink ?? ClassicInk;
  const blush = spec.face.blush ?? ClassicBlush;
  const faces = new Map<FaceSlot, HTMLImageElement>();
  for (const [slot, file] of Object.entries(spec.face.images)) {
    if (file) faces.set(slot as FaceSlot, images.get(file)!);
  }
  const overlay = spec.body.overlay ? images.get(spec.body.overlay)! : null;

  return {
    id,
    realms: spec.colors.realms,
    moods: {
      alert: spec.colors.alert ?? ClassicMoods.alert,
      nudge: spec.colors.nudge ?? ClassicMoods.nudge,
      sleep: spec.colors.sleep ?? ClassicMoods.sleep,
    },
    body: { opacity: spec.body.opacity, rimWidth: spec.body.rimWidth, shine: spec.body.shine },
    reach: reachOf(placed, spec.face.style === 'images' ? faces : new Map(), spec.face),
    drawBehind: (context, frame) => drawAccessories(context, frame, behind),
    drawOverlay: overlay
      ? (context, frame) => {
          const width = frame.radius * 2.3;
          context.scale(frame.squash.x, frame.squash.y);
          context.drawImage(
            overlay,
            -width / 2,
            (-width * overlay.naturalHeight) / overlay.naturalWidth / 2,
            width,
            (width * overlay.naturalHeight) / overlay.naturalWidth,
          );
        }
      : null,
    drawFace:
      spec.face.style === 'none'
        ? () => {}
        : spec.face.style === 'classic'
          ? (context, frame) => drawClassicFace(context, frame, ink, blush)
          : (context, frame) => drawPictureFace(context, frame, faces, spec.face),
    drawFront: (context, frame) => drawAccessories(context, frame, front),
  };
}

/**
 * The moods whose eyes are open, and therefore the ones a blink picture interrupts. A sleeping or
 * grinning face already has its eyes shut, and blinking those would flash open eyes for a frame.
 */
const Blinks = new Set(['idle', 'surprised', 'alert', 'nudge', 'dragged', 'devouring']);

function drawPictureFace(
  context: CanvasRenderingContext2D,
  frame: FaceFrame,
  faces: Map<FaceSlot, HTMLImageElement>,
  spec: SkinSpec['face'],
): void {
  const blinking = frame.open < 0.35 && Blinks.has(frame.mood) && faces.has('blink');
  const slot = blinking ? 'blink' : faceSlotFor(frame.mood, (at) => faces.has(at));
  const picture = slot ? faces.get(slot) : undefined;
  if (!picture) return;
  const width = frame.radius * spec.size;
  const height = (width * picture.naturalHeight) / picture.naturalWidth;
  // Follows the gaze the way the classic face does, and squashes with the body so it stays painted
  // on rather than floating over it.
  context.translate(
    frame.look.x * frame.radius * 0.16,
    spec.y * frame.radius * frame.squash.y + frame.look.y * frame.radius * 0.12,
  );
  context.scale(frame.squash.x, frame.squash.y);
  context.drawImage(picture, -width / 2, -height / 2, width, height);
}

interface Placed extends AccessorySpec {
  picture: HTMLImageElement;
  aspect: number;
  radians: number;
}

function drawAccessories(
  context: CanvasRenderingContext2D,
  frame: FaceFrame,
  items: readonly Placed[],
): void {
  const { radius, squash } = frame;
  for (const item of items) {
    if (item.moods && !item.moods.includes(frame.mood)) continue;
    const width = radius * item.width;
    const height = width * item.aspect;
    context.save();
    // Pinned to a point on the body that moves with the squash, and squashed with it: an ear on a
    // body that lands flat spreads out with it, which is most of what makes it look attached.
    context.translate(item.x * radius * squash.x, item.y * radius * squash.y);
    context.scale(squash.x, squash.y);
    if (item.radians !== 0) context.rotate(item.radians);
    context.drawImage(item.picture, -width / 2, -height / 2, width, height);
    context.restore();
  }
}

/**
 * The furthest anything here can reach from the centre, in body radii.
 *
 * Generous on purpose: the corner of a rotated picture, at the most the body ever squashes. Too
 * small and a piece of ear is left on the desktop; too large costs a little repaint area.
 */
const MostSquash = 1.4;

function reachOf(
  placed: readonly Placed[],
  faces: ReadonlyMap<FaceSlot, HTMLImageElement>,
  face: SkinSpec['face'],
): Reach {
  const reach = { left: 0, right: 0, top: 0, bottom: 0 };
  // A picture of half-diagonal `corner` centred on (x, y) stays inside that square whatever it is
  // rotated to.
  const cover = (x: number, y: number, corner: number) => {
    reach.left = Math.max(reach.left, corner - x);
    reach.right = Math.max(reach.right, corner + x);
    reach.top = Math.max(reach.top, corner - y);
    reach.bottom = Math.max(reach.bottom, corner + y);
  };
  for (const item of placed) {
    cover(item.x, item.y, Math.hypot(item.width / 2, (item.width * item.aspect) / 2));
  }
  // The face also drifts with the gaze, by up to a sixth of a radius each way.
  for (const picture of faces.values()) {
    const aspect = picture.naturalHeight / picture.naturalWidth;
    const corner = Math.hypot(face.size / 2, (face.size * aspect) / 2) + 0.2;
    cover(0, face.y, corner);
  }
  return {
    left: reach.left * MostSquash,
    right: reach.right * MostSquash,
    top: reach.top * MostSquash,
    bottom: reach.bottom * MostSquash,
  };
}
