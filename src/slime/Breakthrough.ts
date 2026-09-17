/**
 * What a realm breakthrough looks like, once it stopped being a beam of light.
 *
 * The first three attempts at this all ended up somewhere in the visual language of science
 * fiction: a vertical shaft with soft gradients in it is a transporter beam or a loot pillar, and
 * no amount of retinting makes it read as cultivation. Four things were wrong with it, and they
 * are worth writing down because each one points at what replaced it.
 *
 * **It was straight.** The genre's imagery is curvilinear — cloud, qi, veins, lotus. Straight
 * vertical shafts belong to transporters. So the enclosure here is a *bud*: two curves bowing out
 * from a ring on the ground and converging above the pet.
 *
 * **It had no writing in it.** Seal script is central to the genre, and this repo already draws a
 * decent talisman — yellow paper, cinnabar ink, two border rules. The breakthrough used none of
 * it. Now eight of them wheel out and close around the body, and they carry 道 气 玄 元 灵 真 虚 极
 * rather than the letter a falling charm carries, because the ones that come out of the keyboard
 * are keys you pressed and these are not.
 *
 * **It had no structure.** Light in this genre is structured: arrays, a dais, the layers of a
 * sunset, the run of a vein. A uniform gradient has no structure, so it can only read as glow.
 * Hence the formation array on the ground, in perspective, turning.
 *
 * **Nothing in it was an object.** A breakthrough in the genre involves *things* — pills, charms,
 * arrays, ley lines. That one had only light.
 *
 * Everything here is still Canvas primitives. There is no art in this repo.
 */
import { drawTalisman } from '../game/Glyphs';
import type { Palette } from './Slime';
import { clear } from './colour';

/** How wide the array lies, as a multiple of the body radius. */
export const ArrayReach = 3;
/** How much of that is its apparent depth. A ring seen from a desk chair, not from above. */
const GroundSquash = 0.3;
/** How high the bud closes over, likewise. */
export const BudReach = 3.4;
/**
 * How far out the bud bows at its widest, and how wide it sits where it meets the array.
 *
 * The belly has to be wider than the foot. The first pass had the foot on the array's inner ring —
 * wider than the belly — and a shape that is widest at the bottom and comes to a point is a cone,
 * which is to say a wizard hat. A bud is pinched at both ends.
 */
const BudWidth = 2.3;
const BudFoot = 1.35;
/** How many charms wheel out. Eight, because the array has eight points and they land on them. */
const Charms = 8;
/**
 * What they carry.
 *
 * Not the letter a falling charm carries. Those are keys somebody pressed and this is not a
 * keystroke — it is the one moment in the run that is about the ladder rather than about typing.
 */
const CharmGlyphs = ['道', '气', '玄', '元', '灵', '真', '虚', '极'];
/** Ticks around the array's rim. */
const Ticks = 24;
/**
 * Threads in the cage.
 *
 * Fewer than the array has ticks. At twenty-four, evenly lit, the cage read as a mosquito net — a
 * regular mesh is a manufactured object, and this is supposed to be qi standing up off a ring.
 */
const Threads = 16;

export interface OrdealShape {
  /** Body centre, in canvas pixels. */
  x: number;
  y: number;
  radius: number;
  /**
   * Where the array lies, in canvas pixels.
   *
   * Under the *body*, not on the floor. Anchoring it to the ground looked more physical and breaks
   * the moment the pet is off it — one click can land mid-hop, and the composition would come apart
   * into an array on the carpet with a long spike reaching up to a slime in the air. An array
   * holding station under something that is floating is the more genre-correct picture anyway.
   */
  groundY: number;
  palette: Palette;
  /** Accumulated rotation, in radians. Accelerates, so it cannot come off the wall clock. */
  spin: number;
}

export interface OrdealBeat {
  phase: 'gathering' | 'kindling' | 'revealing';
  /** 0 to 1 through the current beat. */
  progress: number;
  /** How far the bud has closed, 0 to 1. */
  bud: number;
  /** How completely the body is hidden, 0 to 1. Falls before `bud` does. */
  veil: number;
}

/** 0 while nothing is drawn, 1 at full strength. Shared by the array and the charms. */
function presence(beat: OrdealBeat): number {
  if (beat.phase === 'gathering') return Math.min(1, beat.progress * 1.6);
  if (beat.phase === 'kindling') return 1;
  // Holds, then goes. The array is the last thing to leave, the way the stage empties after.
  return 1 - Math.max(0, (beat.progress - 0.45) / 0.55);
}

/**
 * The formation array, flat on the ground and turning.
 *
 * Drawn in circle space with a vertical squash applied, which is both simpler and more correct
 * than working out ellipse points by hand: a real ring in perspective *does* look thinner at its
 * near and far edges, and squashing the stroke reproduces that for free.
 */
export function drawArray(
  context: CanvasRenderingContext2D,
  shape: OrdealShape,
  beat: OrdealBeat,
): void {
  const strength = presence(beat);
  if (strength <= 0.01) return;
  const outer = shape.radius * ArrayReach;

  context.save();
  context.translate(shape.x, shape.groundY);
  context.scale(1, GroundSquash);

  // The lit ground inside it. Without this the rings float on the desktop with nothing between
  // them, which reads as a wireframe rather than as something burning into the floor.
  const pool = context.createRadialGradient(0, 0, 0, 0, 0, outer);
  pool.addColorStop(0, '#ffffff');
  pool.addColorStop(0.35, shape.palette.core);
  pool.addColorStop(1, clear(shape.palette.core));
  context.globalAlpha = 0.34 * strength;
  context.fillStyle = pool;
  context.beginPath();
  context.arc(0, 0, outer, 0, Math.PI * 2);
  context.fill();

  context.lineCap = 'round';

  // Every line of the array is stroked twice: the dark `rim` colour wide and underneath, the pale
  // `core` narrow on top.
  //
  // This is not styling, it is the only way a line survives an unknown desktop. A pale pink array
  // on a near-white wallpaper is invisible, and a dark one on a dark wallpaper is invisible; laid
  // over each other one of the two always reads, and on a mid-tone background the pair looks like
  // an engraved line that is lit, which is what was wanted anyway.
  const engrave = (width: number, alpha: number, trace: () => void) => {
    for (const [pen, extra, weight] of [
      [shape.palette.rim, 1.8, 0.5],
      [shape.palette.core, 0, 1],
    ] as [string, number, number][]) {
      context.strokeStyle = pen;
      context.lineWidth = width + extra;
      context.globalAlpha = alpha * strength * weight;
      trace();
    }
  };

  // Three rings, and the ticks between the outer two. The ticks are what make it read as graduated
  // rather than as a set of circles.
  for (const [radius, width, alpha] of [
    [outer, 3.4, 0.85],
    [outer * 0.82, 1.8, 0.6],
    [outer * 0.34, 2.4, 0.7],
  ]) {
    engrave(width, alpha, () => {
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
    });
  }

  engrave(2, 0.55, () => {
    context.beginPath();
    for (let i = 0; i < Ticks; i++) {
      const angle = shape.spin + (i / Ticks) * Math.PI * 2;
      // Every third one reaches further in, so the rim has a rhythm instead of a uniform comb.
      const inner = outer * (i % 3 === 0 ? 0.72 : 0.84);
      context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    context.stroke();
  });

  // An octagram, turning the other way. Two squares offset by an eighth of a turn is the cheapest
  // shape that is unmistakably a formation rather than a target reticle, and counter-rotation is
  // what stops the whole array reading as one rigid disc being spun.
  const star = outer * 0.78;
  engrave(2.2, 0.7, () => {
    for (const offset of [0, Math.PI / 4]) {
      context.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = -shape.spin * 0.62 + offset + (i / 4) * Math.PI * 2;
        const px = Math.cos(angle) * star;
        const py = Math.sin(angle) * star;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.stroke();
    }
  });

  context.restore();
}

/** Where charm `i` sits, in canvas pixels, plus how near the viewer it is (-1 far, 1 near). */
function charmAt(
  shape: OrdealShape,
  beat: OrdealBeat,
  index: number,
): { x: number; y: number; depth: number; lean: number } {
  const angle = shape.spin * 1.35 + (index / Charms) * Math.PI * 2;
  // They close in as the sequence goes: wheeling wide while the qi gathers, tight against the
  // body by the time the bud shuts.
  const orbit =
    beat.phase === 'gathering'
      ? shape.radius * (2.9 - 1.15 * beat.progress)
      : beat.phase === 'kindling'
        ? shape.radius * (2.3 - 0.4 * beat.progress)
        // Out at the bud's widest, not inside it. Tucked in at 1.3 they ended up under the
        // silhouette, which put the eight things this sequence is *about* behind the one opaque
        // object on screen.
        : shape.radius * 1.9;
  // And they rise. A ring at the pet's waist reads as a belt; one at its shoulders reads as lift.
  const lift =
    beat.phase === 'gathering' ? shape.radius * 0.5 * beat.progress : shape.radius * 0.5;
  const depth = Math.sin(angle);
  return {
    x: shape.x + Math.cos(angle) * orbit,
    y: shape.y - lift + depth * orbit * 0.34,
    depth,
    // Banked into the turn, like something being carried around a circle rather than hung on one.
    lean: Math.cos(angle) * 0.42,
  };
}

/**
 * The charms, on one side of the body.
 *
 * Called twice per frame with `side` -1 and 1, so the half of the ring that is behind the pet is
 * drawn before it and the half in front after it. A ring that all sits in front of the body is not
 * a ring, it is a bracelet worn on the outside of a photograph.
 */
export function drawCharms(
  context: CanvasRenderingContext2D,
  shape: OrdealShape,
  beat: OrdealBeat,
  side: -1 | 1,
): void {
  const strength = presence(beat);
  if (strength <= 0.01) return;
  for (let i = 0; i < Charms; i++) {
    const at = charmAt(shape, beat, i);
    if ((at.depth >= 0 ? 1 : -1) !== side) continue;
    // They arrive one at a time over the first part of the gather. All eight appearing together
    // is a spawn; one after another is something being assembled.
    const due = (i / Charms) * 0.62;
    const arrived =
      beat.phase === 'gathering' ? Math.min(1, Math.max(0, (beat.progress - due) / 0.22)) : 1;
    if (arrived <= 0) continue;
    // Burning away from the outside in as the new form comes back into view.
    const spent = beat.phase === 'revealing' ? Math.max(0, 1 - beat.progress / 0.7) : 1;
    const fade = strength * arrived * spent;
    if (fade <= 0.01) continue;

    context.save();
    context.translate(at.x, at.y);
    // Nearer ones bigger. The scale is the only depth cue a flat ring of identical objects has.
    const scale = (0.72 + 0.3 * ((at.depth + 1) / 2)) * (0.6 + 0.4 * arrived);
    context.scale(scale, scale);
    context.rotate(at.lean);
    // Brightest just as it snaps into place and again as it burns: the halo is doing the work the
    // paper cannot, since the paper is the same yellow at every point in the sequence.
    const breath = 0.8 + 0.5 * (1 - arrived) + (beat.phase === 'kindling' ? 0.6 : 0);
    drawTalisman(context, CharmGlyphs[i % CharmGlyphs.length], shape.palette.core, fade, breath);
    context.restore();
  }
}

/**
 * The bud: a cage of qi threads rising off the array and closing above the pet, and — once it is
 * shut — a filled silhouette that is what actually hides the old form.
 *
 * The fill is the load-bearing part, exactly as the column's was. Threads are thin; a body behind
 * twenty-four thin lines is a body you can still see, and the entire mechanism of this sequence is
 * that the change happens where it cannot be watched. What is different from the column is the
 * *shape* of the thing doing the hiding: two curves bowing out of a ring and meeting at a point,
 * rather than a rectangle with the corners fogged.
 */
export function drawBud(
  context: CanvasRenderingContext2D,
  shape: OrdealShape,
  beat: OrdealBeat,
): void {
  if (beat.bud <= 0.01) return;
  const base = shape.groundY;
  const rim = shape.radius * BudFoot;
  // Grows to its full height as it shuts, so the cage reads as being drawn up off the array
  // rather than as fading in around the pet.
  const apex = shape.y - shape.radius * BudReach * (0.45 + 0.55 * beat.bud);
  const belly = shape.radius * BudWidth * (0.8 + 0.2 * beat.bud);
  // Level with the body, so the widest part of the bud is around what it is holding. Above it, the
  // bulge is over the pet's head and the whole thing tapers away from it into a cone.
  const waist = shape.y + shape.radius * 0.1;

  context.save();

  // The threads. Drawn before the fill so the fill's own light sits on top of them, which is what
  // makes the closed bud look lit from the inside instead of papered over.
  context.lineCap = 'round';
  for (let i = 0; i < Threads; i++) {
    const angle = -shape.spin * 0.8 + (i / Threads) * Math.PI * 2;
    const spread = Math.cos(angle);
    const baseX = shape.x + spread * rim;
    const baseY = base + Math.sin(angle) * rim * GroundSquash;
    const bellyX = shape.x + spread * belly * 1.25;
    // Threads on the far side of the ring are dimmer, which is the only thing separating the back
    // of the cage from the front once they all converge on the same point.
    const behind = Math.sin(angle) < 0 ? 0.45 : 1;
    // Uneven on purpose. Every fifth thread is bright and white and the rest are faint, which is
    // what separates a bundle of qi from a wire frame with a regular pitch.
    // Uneven on purpose, and mixed light and dark for the same reason the array is engraved: a
    // cage drawn entirely in white vanishes on a pale desktop and one drawn entirely in the rim
    // colour vanishes on a dark one. Split between the two and some of it always reads.
    const bright = i % 5 === 0;
    context.globalAlpha = (bright ? 0.62 : 0.34) * beat.bud * behind;
    context.lineWidth = (bright ? 2.2 : 1.3) + 1.2 * beat.bud;
    // Faded out towards the tip, per thread.
    //
    // Sixteen curves all end at the same point, so whatever alpha each one carries stacks sixteen
    // deep there. At a flat alpha that put a hard opaque knot at the apex — and since most of the
    // threads are the dark rim colour, the knot was a dirty smudge sitting above the pet. Tapering
    // them also happens to be what makes the cage read as qi standing up rather than as wire.
    const pen = bright ? '#ffffff' : shape.palette.rim;
    const thread = context.createLinearGradient(0, baseY, 0, apex);
    thread.addColorStop(0, pen);
    thread.addColorStop(0.45, pen);
    thread.addColorStop(1, clear(pen));
    context.strokeStyle = thread;
    context.beginPath();
    context.moveTo(baseX, baseY);
    // Not quite the same point at the top. Twenty-four curves through one pixel is a seam; a
    // little scatter makes the tip read as gathered rather than as pinned.
    const drift = Math.cos(angle * 2.3 + 1.1) * shape.radius * 0.1;
    context.quadraticCurveTo(bellyX, waist, shape.x + drift, apex + Math.abs(drift) * 0.7);
    context.stroke();
  }

  // The silhouette. Its alpha is `veil`, not `bud`, which is what lets the figure come back inside
  // a cage that is still standing — fading the two together would be a crossfade between slimes.
  const skin = context.createLinearGradient(0, base, 0, apex);
  // White only at the foot, where the array's own light is. The first pass put it at a fifth of
  // the way up, which is where the bud is widest — so most of the visible area was interpolating
  // white against a pale core and the whole thing came out as a white teardrop with no realm in it.
  skin.addColorStop(0, '#ffffff');
  skin.addColorStop(0.18, shape.palette.core);
  skin.addColorStop(0.68, shape.palette.core);
  skin.addColorStop(1, clear(shape.palette.core));
  context.globalAlpha = Math.min(1, beat.veil * 0.92);
  context.fillStyle = skin;
  context.beginPath();
  context.moveTo(shape.x - rim, base);
  context.quadraticCurveTo(shape.x - belly * 1.25, waist, shape.x, apex);
  context.quadraticCurveTo(shape.x + belly * 1.25, waist, shape.x + rim, base);
  // Closed along the array's own ellipse, so the bud is planted in the ring rather than standing
  // on a flat chord across it.
  context.ellipse(shape.x, base, rim, rim * GroundSquash, 0, 0, Math.PI, false);
  context.closePath();
  context.fill();

  context.restore();
}
