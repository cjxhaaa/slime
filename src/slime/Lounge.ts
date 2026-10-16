/**
 * 海边躺椅 — the second idle. Left alone long enough, the slime sometimes skips the nap: it rolls
 * out a patch of sand, drags out a folded deck chair and snaps it open, plants a parasol, and hops up
 * to lie back in the sea breeze. Touch it and it sits up, hops down and packs the lot away again.
 *
 * This file is the scene and its timeline. The body — where it stands, the hop up and the hop down,
 * the lean back, which face it wears — stays in `Slime`, which reads the beats from here.
 *
 * ## Getting in and out is the animation
 *
 * A scene that simply appears around a pet that is suddenly lying down is a costume change, not
 * something the pet did. So the set-up is a sequence with an order a person could follow — sand
 * first, then the chair dragged in folded and opened, then the parasol, and only then the hop up —
 * and packing away runs it backwards, with the pet getting down *before* the chair folds under it.
 * Being picked up, or anything else that needs the body, cannot wait for that: the props let go and
 * fade where they stand, and the body is free that frame.
 *
 * Drawn in the same cartoon hand as the rest of the pet, but with volume: a sandbank with a lit top
 * and a darker edge, soft shadows on the sand, bevelled wood, cloth and canopy shaded across their
 * curve, waves with a lit face and white water — light from the upper left throughout. Everything is
 * sized off the body's radius so it fits a realm-9 pet as well as a newborn one.
 */

/** How long the set-up and the packing-away take, in seconds. */
export const SetUpSeconds = 2.6;
export const PackSeconds = 1.8;
/** How long the props take to fade when the scene is cut short. */
export const DropSeconds = 0.4;

/** Where, in the set-up, the body hops onto the chair — from here to the end. */
export const HopOnFrom = 0.78;
/** Where, in the packing-away, the body has finished hopping down. */
export const HopOffUntil = 0.42;
/** How far back it leans in the chair, in radians. */
export const Recline = 0.32;

/** How far the prop scene reaches from the body's centre, in body radii, every way. */
export const LoungeReach = 4.4;

/** One moment of the scene: how far along each prop is, 0 (packed away) to 1 (out). */
export interface Beats {
  sand: number;
  /** The chair: how far it has slid in from the side, and how far it is unfolded. */
  slide: number;
  unfold: number;
  parasol: number;
  /** The sea and the breeze, together. */
  sea: number;
  /** Everything at once, for a scene that is being dropped. */
  alpha: number;
}

const ease = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
/** Overshoots a little and settles, for things that snap open. */
const snap = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return 1 - (1 - x) ** 3 + Math.sin(x * Math.PI) * 0.12;
};
const span = (t: number, from: number, to: number) => (t - from) / (to - from);

/** The set-up, `t` 0 to 1. */
export function settingBeats(t: number): Beats {
  return {
    sand: ease(span(t, 0, 0.28)),
    slide: ease(span(t, 0.12, 0.42)),
    unfold: snap(span(t, 0.42, 0.62)),
    parasol: snap(span(t, 0.5, 0.74)),
    sea: ease(span(t, 0.35, 0.9)),
    alpha: 1,
  };
}

/** The packing-away, `t` 0 to 1 — the set-up backwards, after the body is down. */
export function packingBeats(t: number): Beats {
  return {
    sand: 1 - ease(span(t, 0.78, 1)),
    slide: 1 - ease(span(t, 0.7, 0.92)),
    unfold: 1 - ease(span(t, 0.48, 0.7)),
    parasol: 1 - ease(span(t, 0.38, 0.6)),
    sea: 1 - ease(span(t, 0.3, 0.7)),
    alpha: 1,
  };
}

export const RestBeats: Beats = { sand: 1, slide: 1, unfold: 1, parasol: 1, sea: 1, alpha: 1 };

/** Where the scene is laid out: the chair's middle, the ground, the side the sea is on. */
export interface Spot {
  /** The chair's centre, along the ground. */
  x: number;
  ground: number;
  radius: number;
  /** 1 when the sea is to the right and the chair faces it, -1 to the left. */
  side: 1 | -1;
  clock: number;
}

/** The sand's surface, which everything stands on: a little below the body's resting centre. */
function floorOf(spot: Spot): number {
  return spot.ground + spot.radius * 0.62;
}

/**
 * The chair, laid out from its middle: a long deck chair, low seat towards the sea and a tall
 * backrest at the other end. Long on purpose — the body lies on the front of it and covers the
 * middle, so the backrest and the legs are what has to say "deck chair".
 */
function chairPoints(spot: Spot, cx: number, unfold: number) {
  const r = spot.radius;
  const side = spot.side;
  const floor = floorOf(spot);
  const rise = unfold;
  return {
    footFront: { x: cx + side * r * 1.2, y: floor },
    footBack: { x: cx - side * r * 1.25, y: floor },
    seatFront: { x: cx + side * r * 1.25, y: floor - r * 0.48 * rise },
    seatBack: { x: cx - side * r * 0.75, y: floor - r * 0.44 * rise },
    top: { x: cx - side * r * (0.75 + 0.75 * rise), y: floor - r * (0.44 + 1.35 * rise) * rise },
    cross: { x: cx - side * r * 0.1, y: floor - r * 0.26 * rise },
  };
}

/** Where the body sits once it is up: on the seat, towards the sea end, low in the sling. */
export function seat(spot: Spot): { x: number; y: number } {
  return { x: spot.x + spot.side * spot.radius * 0.2, y: floorOf(spot) - spot.radius * 1.22 };
}

const Ink = '#4a3524';
const Wood = '#d39656';
const WoodLight = '#f0c28a';
const WoodDark = '#8f5a2c';
const Canvas = ['#ff7565', '#fff4e2'];
const Shade = ['#ff6a5c', '#fff2de'];
const SandLight = '#fbf0c8';
const SandTop = '#f2d891';
const SandEdge = '#e0bb70';
const SandSide = '#c4934b';
/** One wave washing up the beach and back, in seconds. */
const SwashSeconds = 4.2;
const smooth01 = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const Foam = '#ffffff';
const FoamShade = '#cdeef8';

/** Light comes from the upper left of the scene, whichever way the chair faces. */
const LightX = -1;

/**
 * Strokes a piece of wood with some body to it: a dark underside, the wood, and a thin lit edge on
 * the side the light is on — three strokes that read as a rounded bar rather than a line.
 */
function plank(context: CanvasRenderingContext2D, path: () => void, width: number): void {
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = WoodDark;
  context.lineWidth = width * 1.25;
  path();
  context.stroke();
  context.strokeStyle = Wood;
  context.lineWidth = width;
  path();
  context.stroke();
  context.save();
  context.translate(LightX * width * 0.18, -width * 0.22);
  context.strokeStyle = WoodLight;
  context.lineWidth = width * 0.32;
  path();
  context.stroke();
  context.restore();
}

/** A soft shadow lying on the sand. */
function castShadow(context: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, strength: number): void {
  const shade = context.createRadialGradient(x, y, 0, x, y, rx);
  shade.addColorStop(0, `rgba(110, 70, 25, ${0.28 * strength})`);
  shade.addColorStop(1, 'rgba(110, 70, 25, 0)');
  context.save();
  context.translate(x, y);
  context.scale(1, ry / rx);
  context.translate(-x, -y);
  context.fillStyle = shade;
  context.beginPath();
  context.arc(x, y, rx, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * The parts that sit behind the body: the sandbank, the sea, the shadows on the sand, the parasol,
 * and the far side of the chair with the sling the body lies in.
 *
 * Drawn for depth rather than as flat shapes: the sand is a bank with a lit top and a darker front
 * edge, things cast soft shadows on it, the wood is bevelled, the canvas and the parasol are shaded
 * across their curve, and the sea is waves with a light face and white water on their crests.
 */
export function drawLoungeBehind(context: CanvasRenderingContext2D, spot: Spot, beats: Beats): void {
  const { x, radius: r, side, clock } = spot;
  const floor = floorOf(spot);
  context.save();
  context.globalAlpha *= beats.alpha;
  context.lineJoin = 'round';
  context.lineCap = 'round';

  // The sandbank: its front edge first, a slab of darker sand, then the lit top over it. There is no
  // sea drawn beside it or on it — only the waves washing up its sea end, which say "the sea is just
  // there" without a second shape whose motion never quite matched theirs.
  if (beats.sand > 0.01) {
    const grow = beats.sand;
    const cx = x + side * r * 0.25;
    const rx = r * 3.0 * grow;
    const ry = r * 0.46 * grow;
    const thick = r * 0.2 * grow;
    const slab = () => {
      context.beginPath();
      context.ellipse(cx, floor + thick, rx, ry, 0, 0, Math.PI * 2);
      context.fill();
      context.fillRect(cx - rx, floor, rx * 2, thick);
    };
    context.fillStyle = SandSide;
    slab();
    const top = context.createRadialGradient(cx + LightX * rx * 0.35, floor - ry * 0.5, r * 0.1, cx, floor, rx);
    top.addColorStop(0, SandLight);
    top.addColorStop(0.45, SandTop);
    top.addColorStop(1, SandEdge);
    context.fillStyle = top;
    context.beginPath();
    context.ellipse(cx, floor, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    // Ripples the wind has left in it: short arcs, lit above and shaded below — on the sand only.
    for (let k = 0; k < 4; k++) {
      const rx2 = cx - side * r * 0.4 + Math.sin(k * 2.3) * rx * 0.42;
      const ry2 = floor + Math.cos(k * 1.7) * ry * 0.45;
      const w = rx * 0.16;
      context.lineWidth = Math.max(1, r * 0.03);
      context.strokeStyle = 'rgba(196, 147, 75, 0.45)';
      context.beginPath();
      context.ellipse(rx2, ry2 + 1, w, w * 0.18, 0, Math.PI * 0.1, Math.PI * 0.9);
      context.stroke();
      context.strokeStyle = 'rgba(255, 250, 225, 0.7)';
      context.beginPath();
      context.ellipse(rx2, ry2 - 1, w, w * 0.18, 0, Math.PI * 1.1, Math.PI * 1.9);
      context.stroke();
    }
    // A starfish, because it is a beach.
    if (grow > 0.7) {
      const sx = cx - side * rx * 0.55;
      const sy = floor + ry * 0.35;
      const arm = r * 0.16;
      context.save();
      context.translate(sx, sy);
      context.scale(1, 0.55);
      context.beginPath();
      for (let k = 0; k < 10; k++) {
        const reach = k % 2 === 0 ? arm : arm * 0.42;
        const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
        if (k === 0) context.moveTo(Math.cos(a) * reach, Math.sin(a) * reach);
        else context.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
      }
      context.closePath();
      const star = context.createRadialGradient(-arm * 0.2, -arm * 0.3, 0, 0, 0, arm);
      star.addColorStop(0, '#ffb07a');
      star.addColorStop(1, '#f06a3c');
      context.fillStyle = star;
      context.fill();
      context.restore();
    }
  }

  // The wash: each wave runs a thin sheet of water up the beach — quickly at first, slowing as it
  // climbs, its front a lumpy line of white surf with bubbles behind it — hangs there for a moment,
  // and slides back. Where it reached, the sand stays dark and wet and dries slowly, so the next
  // wave arrives over the mark the last one left. Every wave reaches a different height. All of it
  // is clipped to the top of the sandbank, so no water ever spills over the bank's edge.
  if (beats.sea > 0.01 && beats.sand > 0.5) {
    context.save();
    context.globalAlpha *= beats.sea;
    const cx = x + side * r * 0.25;
    const rx = r * 3.0 * beats.sand;
    const ry = r * 0.46 * beats.sand;
    context.beginPath();
    context.ellipse(cx, floor, rx, ry, 0, 0, Math.PI * 2);
    context.clip();

    const cycle = clock / SwashSeconds;
    const n = Math.floor(cycle);
    const p = cycle - n;
    // How far up this wave gets, and the last one: fixed per wave, so a wave does not change its
    // mind half way up.
    const height = (k: number) => r * (1.0 + 0.7 * (0.5 + 0.5 * Math.sin(k * 2.39 + 1.1)));
    const up = height(n);
    const reach =
      p < 0.32 ? up * (1 - (1 - p / 0.32) ** 2.2) : p < 0.42 ? up : up * (1 - smooth01((p - 0.42) / 0.58));
    // The wet mark: as high as this wave has got, or what is left of the last one's, drying.
    const left = height(n - 1) * Math.max(0, 1 - (p + 0.6) / 1.4);
    const wet = Math.max(p < 0.42 ? reach : up, left);
    const dry = p < 0.42 ? 1 : 1 - (p - 0.42) / 0.58 * 0.55;

    // The wash runs up the beach parallel to the shore. The shore is the sandbank's sea end, and on
    // screen a line along it runs up and down across the bank's top — so the wash's front is a near
    // upright line `depth` in from the end, wobbling, and bowed a little inland in the middle where
    // the water has most push. Following the bank's curved rim instead drew it as a chevron.
    const end = cx + side * rx;
    const frontAt = (depth: number, y: number, wobble: number) => {
      const across = (y - floor) / ry;
      const bow = r * 0.14 * Math.max(0, 1 - across * across);
      const lump = wobble * Math.sin(across * 5.5 + clock * 2.4 + n) * r * 0.05;
      return end - side * (depth + bow + lump);
    };
    const sheet = (depth: number, wobble: number) => {
      const steps = 14;
      context.beginPath();
      context.moveTo(end + side * r * 0.4, floor - ry - r * 0.1);
      for (let k = 0; k <= steps; k++) {
        const y = floor - ry - r * 0.1 + ((2 * ry + r * 0.2) * k) / steps;
        context.lineTo(frontAt(depth, y, wobble), y);
      }
      context.lineTo(end + side * r * 0.4, floor + ry + r * 0.1);
      context.closePath();
    };
    const front = (depth: number, wobble: number) => {
      const steps = 14;
      context.beginPath();
      for (let k = 0; k <= steps; k++) {
        const y = floor - ry - r * 0.1 + ((2 * ry + r * 0.2) * k) / steps;
        const px = frontAt(depth, y, wobble);
        if (k === 0) context.moveTo(px, y);
        else context.lineTo(px, y);
      }
    };
    if (wet > r * 0.02) {
      context.fillStyle = `rgba(160, 112, 52, ${0.32 * dry})`;
      sheet(wet + r * 0.04, 0.5);
      context.fill();
    }
    if (reach > r * 0.02) {
      // The sheet of water: clear blue, deeper towards the sea.
      const water = context.createLinearGradient(end, 0, end - side * reach, 0);
      water.addColorStop(0, 'rgba(62, 170, 224, 0.88)');
      water.addColorStop(1, 'rgba(150, 226, 248, 0.6)');
      context.fillStyle = water;
      sheet(reach, 1);
      context.fill();
      // Its front: a lumpy line of surf, shaded underneath, with bubbles left behind it.
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = FoamShade;
      context.lineWidth = Math.max(2.5, r * 0.15);
      front(reach - r * 0.03, 1);
      context.stroke();
      context.strokeStyle = Foam;
      context.lineWidth = Math.max(1.5, r * 0.09);
      front(reach, 1);
      context.stroke();
      context.fillStyle = 'rgba(255, 255, 255, 0.85)';
      for (let k = 0; k < 7; k++) {
        const y = floor + ry * (-0.75 + (1.5 * k) / 6);
        const behind = r * (0.1 + (k % 3) * 0.07);
        context.beginPath();
        context.arc(frontAt(reach - behind, y, 1), y + Math.sin(k * 2.1) * r * 0.03, r * (0.025 + (k % 2) * 0.015), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  const parasolX = x - side * r * 1.6;
  const chairX = x + side * r * 2.2 * (1 - beats.slide);

  // Shadows on the sand: the parasol's, thrown towards the sea, and the chair's under it.
  if (beats.sand > 0.5) {
    if (beats.parasol > 0.2) castShadow(context, parasolX + side * r * 0.7, floor + r * 0.05, r * 1.4 * Math.min(1, beats.parasol), r * 0.26, beats.sand);
    if (beats.slide > 0.2) castShadow(context, chairX, floor + r * 0.04, r * 1.4, r * 0.2, beats.sand * Math.max(0.3, beats.unfold));
  }

  // The parasol: a striped dome on a wooden pole, dropping in and snapping open, swaying a little.
  if (beats.parasol > 0.01) {
    const drop = (1 - Math.min(1, beats.parasol * 1.4)) * r * 1.2;
    const footY = floor + r * 0.04;
    const height = r * 2.75;
    const tip = { x: parasolX + side * r * 0.3, y: footY - height - drop };
    plank(
      context,
      () => {
        context.beginPath();
        context.moveTo(parasolX, footY - drop);
        context.lineTo(tip.x, tip.y);
      },
      Math.max(1.6, r * 0.06),
    );
    const open = Math.max(0, Math.min(1.1, beats.parasol));
    const sway = Math.sin(clock * 1.6) * 0.04 * beats.sea;
    const halfWidth = r * 1.4 * open;
    const depth = r * 0.3 * open;
    const drape = r * 0.52 * open + r * 0.04;
    context.save();
    context.translate(tip.x, tip.y);
    context.rotate(-side * 0.16 + sway);
    // The rim is an ellipse seen from a little above; the dome is everything from the apex down to
    // its near half. Panels are wedges from the apex to points along that near half.
    const rim = (a: number) => ({ x: Math.cos(a) * halfWidth, y: drape + Math.sin(a) * depth });
    const panels = 8;
    for (let k = 0; k < panels; k++) {
      const a0 = Math.PI - (Math.PI * k) / panels;
      const a1 = Math.PI - (Math.PI * (k + 1)) / panels;
      const p0 = rim(a0);
      const p1 = rim(a1);
      const mid = rim((a0 + a1) / 2);
      context.fillStyle = Shade[k % 2];
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(p0.x * 0.55, p0.y * 0.25 - r * 0.12, p0.x, p0.y);
      // Each panel's edge scallops down between its ribs.
      context.quadraticCurveTo(mid.x, mid.y + r * 0.1 * open, p1.x, p1.y);
      context.quadraticCurveTo(p1.x * 0.55, p1.y * 0.25 - r * 0.12, 0, 0);
      context.closePath();
      context.fill();
    }
    // Shading across the dome: lit on the light's side, falling into shade on the other.
    const across = context.createLinearGradient(-halfWidth, 0, halfWidth, 0);
    across.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    across.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    across.addColorStop(1, 'rgba(80, 20, 10, 0.28)');
    context.fillStyle = across;
    context.beginPath();
    context.moveTo(rim(Math.PI).x, rim(Math.PI).y);
    context.quadraticCurveTo(-halfWidth * 0.6, -r * 0.3 * open, 0, 0);
    context.quadraticCurveTo(halfWidth * 0.6, -r * 0.3 * open, rim(0).x, rim(0).y);
    for (let n = 0; n <= 12; n++) {
      const p = rim((n / 12) * Math.PI);
      context.lineTo(p.x, p.y);
    }
    context.closePath();
    context.fill();
    context.strokeStyle = Ink;
    context.lineWidth = Math.max(0.8, r * 0.025);
    context.globalAlpha *= 0.55;
    context.stroke();
    context.globalAlpha /= 0.55;
    // The finial.
    const knob = context.createRadialGradient(-r * 0.02, -r * 0.05, 0, 0, -r * 0.02, r * 0.08);
    knob.addColorStop(0, '#fff3d6');
    knob.addColorStop(1, Wood);
    context.fillStyle = knob;
    context.beginPath();
    context.arc(0, -r * 0.02, r * 0.07, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  // The chair's far side and its sling. The near side is drawn over the body, in the front pass, so
  // the body lies between the two frames like something in a chair rather than in front of one.
  if (beats.slide > 0.01) {
    const p = chairPoints(spot, chairX, Math.max(0, beats.unfold));
    const far = { x: side * r * 0.1, y: -r * 0.12 };
    const width = Math.max(1.8, r * 0.07);
    context.save();
    context.translate(far.x, far.y);
    context.globalAlpha *= 0.85;
    plank(
      context,
      () => {
        context.beginPath();
        context.moveTo(p.footBack.x, p.footBack.y);
        context.lineTo(p.seatFront.x, p.seatFront.y);
        context.moveTo(p.footFront.x, p.footFront.y);
        context.lineTo(p.seatBack.x, p.seatBack.y);
        context.moveTo(p.seatBack.x, p.seatBack.y);
        context.lineTo(p.top.x, p.top.y);
      },
      width * 0.9,
    );
    context.restore();

    // The sling, slung between the two sides: stripes down the backrest and along the seat,
    // shaded darker where it sags so it reads as cloth with weight in it.
    const sag = { x: (p.seatBack.x + p.seatFront.x) / 2, y: (p.seatBack.y + p.seatFront.y) / 2 + r * 0.14 * beats.unfold };
    const along = (t: number) => {
      if (t < 0.45) {
        const u = t / 0.45;
        return { x: p.top.x + (p.seatBack.x - p.top.x) * u, y: p.top.y + (p.seatBack.y - p.top.y) * u };
      }
      const u = (t - 0.45) / 0.55;
      const v = 1 - u;
      return {
        x: v * v * p.seatBack.x + 2 * v * u * sag.x + u * u * p.seatFront.x,
        y: v * v * p.seatBack.y + 2 * v * u * sag.y + u * u * p.seatFront.y,
      };
    };
    const stripes = 10;
    const band = Math.max(4, r * 0.26);
    context.lineCap = 'butt';
    for (let k = 0; k < stripes; k++) {
      const p0 = along(k / stripes);
      const p1 = along((k + 1) / stripes + 0.01);
      context.strokeStyle = Canvas[k % 2];
      context.lineWidth = band;
      context.beginPath();
      context.moveTo(p0.x + far.x * 0.5, p0.y + far.y * 0.5);
      context.lineTo(p1.x + far.x * 0.5, p1.y + far.y * 0.5);
      context.stroke();
    }
    // Shade along the sling's lower edge and a light along its upper one: the cloth's curve.
    const trace = (lift: number) => {
      context.beginPath();
      for (let n = 0; n <= 20; n++) {
        const q = along(n / 20);
        const px = q.x + far.x * 0.5;
        const py = q.y + far.y * 0.5 + lift;
        if (n === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
    };
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(90, 25, 15, 0.25)';
    context.lineWidth = band * 0.35;
    trace(band * 0.32);
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    context.lineWidth = band * 0.18;
    trace(-band * 0.34);
    context.stroke();
  }
  context.restore();
}

/**
 * The parts in front of the body: the chair's near side — legs, backrest rail and armrest — so the
 * body sits *in* the chair, and the sea breeze drifting across from the water.
 */
export function drawLoungeFront(context: CanvasRenderingContext2D, spot: Spot, beats: Beats): void {
  const { x, ground, radius: r, side, clock } = spot;
  context.save();
  context.globalAlpha *= beats.alpha;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (beats.slide > 0.01) {
    const chairX = x + side * r * 2.2 * (1 - beats.slide);
    const p = chairPoints(spot, chairX, Math.max(0, beats.unfold));
    const width = Math.max(2, r * 0.08);
    const armY = p.seatBack.y - r * 0.34 * beats.unfold;
    plank(
      context,
      () => {
        context.beginPath();
        context.moveTo(p.footBack.x, p.footBack.y);
        context.lineTo(p.seatFront.x, p.seatFront.y);
        context.moveTo(p.footFront.x, p.footFront.y);
        context.lineTo(p.seatBack.x, p.seatBack.y);
        context.lineTo(p.top.x, p.top.y);
        if (beats.unfold > 0.2) {
          context.moveTo(p.seatBack.x - side * r * 0.05, armY);
          context.lineTo(p.seatFront.x - side * r * 0.3, armY + r * 0.02);
          context.lineTo(p.seatFront.x - side * r * 0.3, p.seatFront.y);
        }
      },
      width,
    );
  }

  // The breeze: soft curls blowing in from the sea, each on its own loop, white with a pale blue
  // edge so it shows on a white desktop as well as a dark one.
  if (beats.sea > 0.01) {
    for (let k = 0; k < 3; k++) {
      const life = (clock * 0.22 + k / 3) % 1;
      const fade = Math.sin(life * Math.PI) * beats.sea;
      const startX = x + side * r * (2.6 - life * 4.2);
      const y = ground - r * (1.6 + k * 0.45) + Math.sin(clock * 1.4 + k) * r * 0.08;
      const length = r * 0.95;
      const curl = () => {
        context.beginPath();
        context.moveTo(startX, y);
        context.bezierCurveTo(startX - side * length * 0.35, y - r * 0.18, startX - side * length * 0.7, y + r * 0.18, startX - side * length, y);
        context.arc(startX - side * length, y - r * 0.1, r * 0.1, Math.PI / 2, side > 0 ? Math.PI * 1.6 : -Math.PI * 0.6, side < 0);
      };
      context.globalAlpha = beats.alpha * fade * 0.8;
      context.strokeStyle = '#8fb9cf';
      context.lineWidth = Math.max(2, r * 0.07);
      curl();
      context.stroke();
      context.strokeStyle = '#ffffff';
      context.lineWidth = Math.max(1, r * 0.035);
      curl();
      context.stroke();
    }
  }
  context.restore();
}
