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
import { wispFade } from './ease';

/**
 * How wide the array lies, as a multiple of the body radius.
 *
 * Two and a half rather than three. At three it is nearly three hundred and fifty pixels across by
 * the late realms, where the body itself has grown — impressive, and more of somebody's desktop
 * than a pet should be taking for four seconds.
 */
export const ArrayReach = 2.6;
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

/**
 * The bottleneck, made of stone.
 *
 * 瓶颈 is the genre's own word for a full stage waiting to be broken, and 破境 is the word for
 * breaking it, and until now neither of them was on screen: the pet simply glowed a bit more. So
 * the gather beat now hardens a crust over the body — a pale jade that is deliberately *not* the
 * realm colour, because the point of it is that it is a shell and not the pet — and it closes over
 * the face, which is the thing that makes it read as being sealed in rather than painted.
 *
 * Then it cracks, with the next realm's light coming up through the cracks, and in the last beat it
 * bursts and the pieces fly out through the dissolving cocoon.
 */
const JadeLight = '#eef3ee';
const JadeMid = '#a9b8ae';
const JadeDark = '#6b7b72';
/**
 * How many cracks, and how many segments each one walks.
 *
 * Eight short segments rather than five long ones. Long segments came out as straight lines from
 * the middle of the body outwards, which is not a crack — it is an asterisk. What reads as breaking
 * is short steps with a lot of angular jitter, and starting points scattered over the surface
 * rather than all at the centre.
 */
const Cracks = 7;
const CrackSteps = 8;
/** Pieces the shell comes apart into. */
const ShardCount = 14;

/**
 * A tiny deterministic generator.
 *
 * The cracks have to be the same shape for every frame of one breakthrough and a different shape
 * for the next one, which `Math.random` gives you exactly backwards.
 */
function seeded(seed: number): () => number {
  let state = (seed * 2654435761) % 2147483647 || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** Crack polylines in units of the body radius, from the middle outwards. */
export function makeCracks(seed: number): number[][] {
  const random = seeded(seed + 1);
  const cracks: number[][] = [];
  for (let i = 0; i < Cracks; i++) {
    // Spread around the body but not evenly — an even fan reads as a drawn asterisk.
    const outward = (i / Cracks) * Math.PI * 2 + (random() - 0.5) * 0.9;
    // Scattered over the surface, not all radiating from one point.
    const from = 0.1 + random() * 0.5;
    let angle = outward + (random() - 0.5) * 1.1;
    let x = Math.cos(outward) * from;
    let y = Math.sin(outward) * from;
    const line = [x, y];
    for (let step = 0; step < CrackSteps; step++) {
      angle += (random() - 0.5) * 1.15;
      // Pulled back towards straight-out as it goes, so a crack wanders without doubling back on
      // itself — a jitter with no bias at all produces knots rather than breaks.
      angle += (outward - angle) * 0.3;
      const reach = 0.1 + random() * 0.1;
      x += Math.cos(angle) * reach;
      y += Math.sin(angle) * reach;
      line.push(x, y);
    }
    cracks.push(line);
  }
  return cracks;
}

export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  /** 1 at the burst, 0 when it is gone. */
  life: number;
}

/** Pieces of the shell, thrown outward from the body's own edge. */
export function makeShards(radius: number, seed: number): Shard[] {
  const random = seeded(seed + 7);
  const shards: Shard[] = [];
  for (let i = 0; i < ShardCount; i++) {
    const angle = (i / ShardCount) * Math.PI * 2 + (random() - 0.5) * 0.4;
    const speed = 210 + random() * 260;
    shards.push({
      x: Math.cos(angle) * radius * 0.85,
      y: Math.sin(angle) * radius * 0.85,
      vx: Math.cos(angle) * speed,
      // Biased upward. Debris that goes out evenly in every direction reads as an explosion
      // diagram; a burst that mostly goes up reads as something being released.
      vy: Math.sin(angle) * speed - 150,
      angle: random() * Math.PI,
      spin: (random() - 0.5) * 11,
      // A wide spread of sizes. Fourteen chips of nearly one size is a pattern, and the eye finds
      // patterns in debris before it finds anything else.
      size: radius * (0.09 + random() * 0.011 + random() * 0.24),
      life: 1,
    });
  }
  return shards;
}

/** Gravity on the pieces, in pixels per second squared. Lighter than the body's, since they are. */
const ShardGravity = 900;

export function stepShards(shards: Shard[], dt: number): void {
  for (const shard of shards) {
    shard.vy += ShardGravity * dt;
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    shard.angle += shard.spin * dt;
    shard.life -= dt / 0.75;
  }
}

/**
 * The shell over the body, and the cracks in it.
 *
 * `trace` lays down the body's own outline in local space — passed in rather than recomputed,
 * because the outline is a soft-body simulation that lives in `Slime` and there must be exactly one
 * of it. Everything here is drawn clipped to that, so the crust follows the wobble instead of
 * sitting on it as a circle.
 */
export function drawShell(
  context: CanvasRenderingContext2D,
  trace: () => void,
  radius: number,
  palette: Palette,
  cracks: number[][],
  form: number,
  crack: number,
): void {
  if (form <= 0.01) return;
  context.save();
  trace();
  context.clip();

  // Stone, lit from the same corner as the body's own highlight so the two do not disagree about
  // where the light is.
  const stone = context.createLinearGradient(-radius * 0.6, -radius, radius * 0.5, radius);
  stone.addColorStop(0, JadeLight);
  stone.addColorStop(0.45, JadeMid);
  stone.addColorStop(1, JadeDark);
  context.globalAlpha = 0.93 * form;
  context.fillStyle = stone;
  context.beginPath();
  context.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
  context.fill();

  // A few dry veins, always there, so the crust has a grain before anything breaks.
  context.globalAlpha = 0.22 * form;
  context.strokeStyle = JadeDark;
  context.lineWidth = 1.2;
  context.lineCap = 'round';
  for (const line of cracks) {
    context.beginPath();
    context.moveTo(line[0] * radius, line[1] * radius);
    for (let i = 2; i < line.length; i += 2) {
      context.lineTo(line[i] * radius, line[i + 1] * radius);
    }
    context.stroke();
  }

  if (crack > 0.01) {
    // And the breaks, growing along the same lines: a dark gap with the next realm's light coming
    // up through it. Two strokes, because a single bright line on pale stone reads as a scratch
    // rather than as something opening.
    for (const [pen, width, alpha, glow] of [
      [JadeDark, 4.4, 0.85, 0],
      [palette.core, 2.2, 1, 1],
      ['#ffffff', 1, 0.9, 1],
    ] as [string, number, number, number][]) {
      context.strokeStyle = pen;
      context.lineWidth = width;
      // The light in the gap arrives later than the gap itself, so it looks like it is leaking out
      // rather than like the crack was drawn in light to begin with.
      context.globalAlpha = alpha * (glow ? Math.max(0, crack - 0.25) / 0.75 : crack);
      for (const line of cracks) {
        const reach = 2 + Math.floor((line.length - 2) * Math.min(1, crack * 1.15));
        context.beginPath();
        context.moveTo(line[0] * radius, line[1] * radius);
        for (let i = 2; i < reach; i += 2) {
          context.lineTo(line[i] * radius, line[i + 1] * radius);
        }
        context.stroke();
      }
    }
  }

  context.restore();
}

/** The pieces, once the shell has gone. Drawn in front of the cocoon they are bursting out of. */
export function drawShards(
  context: CanvasRenderingContext2D,
  shards: Shard[],
  palette: Palette,
): void {
  context.save();
  for (const shard of shards) {
    if (shard.life <= 0) continue;
    context.save();
    context.translate(shard.x, shard.y);
    context.rotate(shard.angle);
    context.globalAlpha = Math.min(1, shard.life * 1.6);
    // A four-sided sliver rather than a square: chips off a curved crust are wedges.
    context.beginPath();
    context.moveTo(-shard.size, -shard.size * 0.55);
    context.lineTo(shard.size * 1.1, -shard.size * 0.3);
    context.lineTo(shard.size * 0.7, shard.size * 0.6);
    context.lineTo(-shard.size * 0.8, shard.size * 0.4);
    context.closePath();
    // Lit on one side. A flat mid-grey fill at this size came out as confetti; stone needs a light
    // face and a dark one, and the wedges are tumbling, so which is which keeps changing.
    const face = context.createLinearGradient(-shard.size, -shard.size, shard.size, shard.size);
    face.addColorStop(0, JadeLight);
    face.addColorStop(1, JadeDark);
    context.fillStyle = face;
    context.fill();
    // A lit edge in the realm colour, which is what ties the debris to the thing it came off.
    context.strokeStyle = palette.core;
    context.lineWidth = 1.4;
    context.globalAlpha = Math.min(1, shard.life * 1.9);
    context.stroke();
    context.restore();
  }
  context.restore();
}

/**
 * Auspicious cloud, in the two places the screen has room for it.
 *
 * The one thing a straight beam of light could never do is curl, and the curl is most of what the
 * genre's imagery is made of. These are 祥云 hooks — the tangent-arc spiral that shows up on every
 * temple eave — rising off the array while the qi gathers, and venting from the bud as it opens.
 *
 * Stateless, driven off the accumulated spin, because five drifting shapes are not worth a list to
 * keep. It also means they accelerate with everything else for free.
 */
const Wisps = 5;

export function drawWisps(
  context: CanvasRenderingContext2D,
  shape: OrdealShape,
  beat: OrdealBeat,
): void {
  // Not during the swallow. That beat is a half-second of the cocoon slamming shut and anything
  // else drifting through it just softens the one hard moment in the sequence.
  const weight =
    beat.phase === 'gathering'
      ? Math.min(1, beat.progress * 1.4)
      : beat.phase === 'revealing'
        ? Math.min(1, beat.progress * 2.2)
        : 0;
  if (weight <= 0.01) return;

  context.save();
  context.lineCap = 'round';
  for (let i = 0; i < Wisps; i++) {
    const rise = (shape.spin * 0.13 + i / Wisps) % 1;
    const side = i % 2 === 0 ? 1 : -1;
    const x = shape.x + side * shape.radius * (0.7 + rise * 1.5) * Math.abs(Math.sin(i * 2.1 + 1));
    const y = shape.y - shape.radius * (0.3 + rise * 3.4);
    const size = shape.radius * (0.26 + rise * 0.3);
    // In and out over its travel, so a wisp is never seen appearing or being cut off.
    const alpha = wispFade(rise) * 0.72 * weight;
    if (alpha <= 0.02) continue;

    context.save();
    context.translate(x, y);
    context.rotate(side * (0.3 - rise * 0.7));
    drawWisp(context, 0, 0, size, side, alpha, shape.palette.core);
    context.restore();
  }
  context.restore();
}

/**
 * One auspicious cloud, centred on (x, y). `side` of -1 mirrors it.
 *
 * Extracted from the loop above so that a stage breakthrough could send up two of these. That idea
 * did not survive review — a diluted version of an impressive thing reads as weak rather than as
 * small — and the small event is its own gesture now. The extraction is kept because the loop is
 * more legible for it.
 */
function drawWisp(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  side: -1 | 1,
  alpha: number,
  colour: string,
): void {
  // save/restore per wisp, not `setTransform(1,0,0,1,0,0)` to undo it. Resetting the matrix
  // throws away the *caller's* transform as well, and everything after the first wisp lands in
  // raw canvas coordinates — which is exactly what it looked like.
  context.save();
  context.translate(x, y);
  context.scale(side, 1);

  // Filled, not stroked.
  //
  // The first pass drew a chain of tangent arcs, which is the right *construction* for 祥云 and
  // came out as a caterpillar: an unfilled scalloped line has no body to it, so at thirty pixels
  // it is a squiggle. What reads as cloud at this size is mass — three overlapping lobes — with
  // one curled tail to say which motif it is.
  const lobes: [number, number, number][] = [
    [-size * 0.55, size * 0.1, size * 0.44],
    [0, -size * 0.08, size * 0.58],
    [size * 0.62, size * 0.06, size * 0.4],
  ];
  // The lobes span about one `size` from the centre, so the colour has to still be at full
  // strength two thirds of the way out or their edges come back half-transparent and the cloud
  // reads as a smudge.
  const body = context.createRadialGradient(0, -size * 0.2, 0, 0, 0, size * 1.5);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.66, colour);
  body.addColorStop(1, clear(colour));
  context.globalAlpha = alpha;
  context.fillStyle = body;
  context.beginPath();
  for (const [lx, ly, lr] of lobes) {
    context.moveTo(lx + lr, ly);
    context.arc(lx, ly, lr, 0, Math.PI * 2);
  }
  context.fill();

  // The curl. One spiral of a little over a turn, tapering, which is the part of the motif
  // everyone actually recognises.
  context.globalAlpha = alpha * 1.15;
  context.lineCap = 'round';
  for (const [pen, width] of [
    [colour, size * 0.3],
    ['#ffffff', size * 0.12],
  ] as [string, number][]) {
    context.strokeStyle = pen;
    context.lineWidth = width;
    context.beginPath();
    for (let step = 0; step <= 14; step++) {
      const t = step / 14;
      const turn = -Math.PI * 0.4 + t * Math.PI * 1.5;
      const r = size * (0.62 - t * 0.44);
      const px = -size * 0.55 + Math.cos(turn) * r;
      const py = size * 0.1 + Math.sin(turn) * r;
      if (step === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.stroke();
  }
  context.restore();
}

