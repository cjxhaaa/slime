import type { Mood, Palette } from '../slime/Slime.js';

/**
 * `skin.json`: what a skin folder says about itself, and everything that is checked before any of
 * it is believed.
 *
 * Pure, with no DOM and no Tauri, so `npm run check` can feed it broken files. The same parser
 * reads the skins shipped inside the app and the ones somebody dropped into the skins folder,
 * which is the point — a built-in skin is just a mod that happens to be bundled, so the format is
 * exercised by every launch rather than only by whoever writes the first mod.
 *
 * Errors are in English on purpose. They name fields and file names in a file the author wrote by
 * hand, they are read by the person making a skin rather than the person wearing one, and the
 * English build is checked for Chinese leaking out of anything that is not the dictionary.
 */

/** Bumped only when an old `skin.json` would be read *wrongly*. Adding a field does not bump it. */
export const SkinFormat = 1;

export const Moods: readonly Mood[] = [
  'idle',
  'happy',
  'sleepy',
  'asleep',
  'surprised',
  'alert',
  'nudge',
  'dragged',
  'devouring',
];

/** A face picture per mood, plus the one shown mid-blink. */
export type FaceSlot = Mood | 'blink';

/**
 * Which picture stands in for a mood that has none of its own, one step at a time until something
 * is found or `idle` is reached. A skin with only `idle` is complete; every other picture is an
 * improvement on it.
 */
export const FaceFallback: Record<Mood, Mood | null> = {
  idle: null,
  happy: 'idle',
  sleepy: 'asleep',
  asleep: 'idle',
  surprised: 'alert',
  alert: 'idle',
  nudge: 'alert',
  dragged: 'surprised',
  devouring: 'happy',
};

/** What can be drawn from a skin folder. SVG is fine: an `<img>` never runs a script inside one. */
export const ImageExtensions = ['png', 'webp', 'jpg', 'jpeg', 'gif', 'svg'];

/** A name or a line of text, either plain or one per language tag. */
export type LocalText = string | Record<string, string>;

export interface AccessorySpec {
  image: string;
  /** Centre of the picture from the centre of the body, in body radii. -y is up. */
  x: number;
  y: number;
  /** Width in body radii. The height follows the picture. */
  width: number;
  /** Degrees, clockwise. */
  rotation: number;
  layer: 'behind' | 'front';
  /** Only shown in these moods. Null for always. */
  moods: Mood[] | null;
}

export interface SkinSpec {
  name: LocalText;
  author: string | null;
  description: LocalText | null;
  colors: {
    realms: Palette[] | null;
    alert: Palette | null;
    nudge: Palette | null;
    sleep: Palette | null;
  };
  body: {
    opacity: number;
    rimWidth: number;
    shine: boolean;
    /** A picture laid inside the body, clipped to it. */
    overlay: string | null;
  };
  face: {
    style: 'classic' | 'images' | 'none';
    /** For the classic face: the colour of the eyes and mouth, and of the blush. */
    ink: string | null;
    blush: string | null;
    /** For a picture face: its width and where its centre sits, in body radii. */
    size: number;
    y: number;
    images: Partial<Record<FaceSlot, string>>;
  };
  accessories: AccessorySpec[];
}

export type Parsed = { ok: true; spec: SkinSpec } | { ok: false; error: string };

/** Hard limits, so a typo cannot make a skin that repaints the whole screen every frame. */
export const Limits = {
  /** How far out anything may be placed, in body radii. */
  offset: 2,
  /** How wide one picture may be, in body radii. */
  width: 2.5,
  accessories: 16,
};

class Refusal extends Error {}

function refuse(message: string): never {
  throw new Refusal(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const HexColour = /^#[0-9a-fA-F]{6}$/;

function colour(value: unknown, path: string): string {
  if (typeof value !== 'string' || !HexColour.test(value)) {
    refuse(`${path} must be a colour written as #rrggbb`);
  }
  return value.toLowerCase();
}

function palette(value: unknown, path: string): Palette {
  if (!isObject(value)) refuse(`${path} must be an object with core, edge and rim`);
  return {
    core: colour(value.core, `${path}.core`),
    edge: colour(value.edge, `${path}.edge`),
    rim: colour(value.rim, `${path}.rim`),
  };
}

function optionalPalette(value: unknown, path: string): Palette | null {
  return value === undefined ? null : palette(value, path);
}

function number(value: unknown, path: string, fallback: number, low: number, high: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) refuse(`${path} must be a number`);
  if (value < low || value > high) refuse(`${path} must be between ${low} and ${high}`);
  return value;
}

function boolean(value: unknown, path: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') refuse(`${path} must be true or false`);
  return value;
}

function localText(value: unknown, path: string): LocalText {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (isObject(value)) {
    const out: Record<string, string> = {};
    for (const [tag, text] of Object.entries(value)) {
      if (typeof text === 'string' && text.trim() !== '') out[tag] = text.trim();
    }
    if (Object.keys(out).length > 0) return out;
  }
  return refuse(`${path} must be text, or an object of language tag to text`);
}

/**
 * A picture the folder actually has.
 *
 * A bare file name, nothing else: no folders, no `..`, no URL. The folder is the whole world a skin
 * gets to see, and checking that here means the loader never has to be careful about it.
 */
function image(value: unknown, path: string, files: ReadonlySet<string>): string {
  if (typeof value !== 'string' || value === '') refuse(`${path} must be a file name`);
  if (/[\\/]/.test(value) || value.includes('..') || value.includes(':')) {
    refuse(`${path} must be a file in the skin's own folder, not a path`);
  }
  const extension = value.slice(value.lastIndexOf('.') + 1).toLowerCase();
  if (!ImageExtensions.includes(extension)) {
    refuse(`${path}: ${value} is not one of ${ImageExtensions.join(', ')}`);
  }
  if (!files.has(value)) refuse(`${path}: ${value} is not in the folder`);
  return value;
}

function moodList(value: unknown, path: string): Mood[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) refuse(`${path} must be a list of moods`);
  for (const mood of value) {
    if (!Moods.includes(mood as Mood)) {
      refuse(`${path}: ${String(mood)} is not a mood (${Moods.join(', ')})`);
    }
  }
  return value as Mood[];
}

function accessory(value: unknown, path: string, files: ReadonlySet<string>): AccessorySpec {
  if (!isObject(value)) refuse(`${path} must be an object`);
  const layer = value.layer ?? 'front';
  if (layer !== 'front' && layer !== 'behind') refuse(`${path}.layer must be "front" or "behind"`);
  return {
    image: image(value.image, `${path}.image`, files),
    x: number(value.x, `${path}.x`, 0, -Limits.offset, Limits.offset),
    y: number(value.y, `${path}.y`, 0, -Limits.offset, Limits.offset),
    width: number(value.width, `${path}.width`, 1, 0.05, Limits.width),
    rotation: number(value.rotation, `${path}.rotation`, 0, -360, 360),
    layer,
    moods: moodList(value.moods, `${path}.moods`),
  };
}

function face(value: unknown, files: ReadonlySet<string>): SkinSpec['face'] {
  if (value === undefined) value = {};
  if (!isObject(value)) refuse('face must be an object');
  const images: Partial<Record<FaceSlot, string>> = {};
  if (value.images !== undefined) {
    if (!isObject(value.images)) refuse('face.images must be an object of mood to file name');
    for (const [slot, file] of Object.entries(value.images)) {
      if (slot !== 'blink' && !Moods.includes(slot as Mood)) {
        refuse(`face.images.${slot} is not a mood (${Moods.join(', ')}, or blink)`);
      }
      images[slot as FaceSlot] = image(file, `face.images.${slot}`, files);
    }
  }
  const style = value.style ?? (Object.keys(images).length > 0 ? 'images' : 'classic');
  if (style !== 'classic' && style !== 'images' && style !== 'none') {
    refuse('face.style must be "classic", "images" or "none"');
  }
  if (style === 'images' && images.idle === undefined) {
    refuse('face.images.idle is required for a picture face: it is what every other mood falls back to');
  }
  return {
    style,
    ink: value.ink === undefined ? null : colour(value.ink, 'face.ink'),
    blush: value.blush === undefined ? null : colour(value.blush, 'face.blush'),
    size: number(value.size, 'face.size', 1, 0.2, Limits.width),
    y: number(value.y, 'face.y', 0.09, -1, 1),
    images,
  };
}

/**
 * Reads a `skin.json` that has already been through `JSON.parse`.
 *
 * `files` is what is actually in the folder, so a picture that is named but missing is caught
 * here, with its name, rather than turning into an invisible ear at runtime.
 */
export function parseManifest(raw: unknown, files: ReadonlySet<string>): Parsed {
  try {
    if (!isObject(raw)) refuse('skin.json must hold one object');
    if (raw.kind === 'script') {
      refuse('script skins are not supported yet; only picture-and-colour skins are');
    }
    if (raw.format !== SkinFormat) {
      refuse(
        typeof raw.format === 'number' && raw.format > SkinFormat
          ? `format ${raw.format} is newer than this build understands (${SkinFormat})`
          : `format must be ${SkinFormat}`,
      );
    }

    const colours = raw.colors === undefined ? {} : raw.colors;
    if (!isObject(colours)) refuse('colors must be an object');
    let realms: Palette[] | null = null;
    if (colours.realms !== undefined) {
      if (!Array.isArray(colours.realms) || colours.realms.length === 0) {
        refuse('colors.realms must be a list of palettes, one per realm');
      }
      realms = colours.realms.map((entry, index) => palette(entry, `colors.realms[${index}]`));
    }

    const body = raw.body === undefined ? {} : raw.body;
    if (!isObject(body)) refuse('body must be an object');

    const accessories = raw.accessories === undefined ? [] : raw.accessories;
    if (!Array.isArray(accessories)) refuse('accessories must be a list');
    if (accessories.length > Limits.accessories) {
      refuse(`at most ${Limits.accessories} accessories`);
    }

    return {
      ok: true,
      spec: {
        name: localText(raw.name, 'name'),
        author: typeof raw.author === 'string' && raw.author.trim() ? raw.author.trim() : null,
        description: raw.description === undefined ? null : localText(raw.description, 'description'),
        colors: {
          realms,
          alert: optionalPalette(colours.alert, 'colors.alert'),
          nudge: optionalPalette(colours.nudge, 'colors.nudge'),
          sleep: optionalPalette(colours.sleep, 'colors.sleep'),
        },
        body: {
          opacity: number(body.opacity, 'body.opacity', 0.92, 0.3, 1),
          rimWidth: number(body.rimWidth, 'body.rimWidth', 2, 0, 6),
          shine: boolean(body.shine, 'body.shine', true),
          overlay: body.overlay === undefined ? null : image(body.overlay, 'body.overlay', files),
        },
        face: face(raw.face, files),
        accessories: accessories.map((entry, index) =>
          accessory(entry, `accessories[${index}]`, files),
        ),
      },
    };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * One language's version of a name: the exact tag, then the same language in any script or region,
 * then English, then whatever there is.
 */
export function pickText(text: LocalText, locale: string): string {
  if (typeof text === 'string') return text;
  if (text[locale]) return text[locale];
  const language = locale.split('-')[0];
  for (const [tag, value] of Object.entries(text)) {
    if (tag.split('-')[0] === language) return value;
  }
  return text.en ?? Object.values(text)[0] ?? '';
}

/** Which picture a mood shows, walking the fallbacks until one exists. */
export function faceSlotFor(mood: Mood, has: (slot: FaceSlot) => boolean): FaceSlot | null {
  let at: Mood | null = mood;
  while (at !== null) {
    if (has(at)) return at;
    at = FaceFallback[at];
  }
  return null;
}
