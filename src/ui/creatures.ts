/**
 * 邪物 — what the eight kinds look like, at all three ranks, and how they move.
 *
 * Cartoon, in the way the pet itself is: chunky shapes, a thick dark ink line round everything,
 * big eyes, and an animation loop on every one of them — a walk, a hop, a skitter, a flap. The
 * world is a 修仙 one, so the goblins wear topknots, the kings wear 冠 rather than European
 * crowns, the 丧尸 is a 僵尸 in a Qing official's hat with a talisman on its forehead, and the mage
 * is a 魔修 in a hood with a staff.
 *
 * ## Read at a glance, on any wallpaper
 *
 * The 邪气 these replaced were dark blots, because the pet's world is light and the things coming
 * for it had to read as the opposite on any background. These are coloured, so what does that job
 * now is the **ink**: a dark outline round every shape, and a soft shadow on the ground under each
 * one. A green goblin on a green wallpaper is still a goblin.
 *
 * ## Ranks are drawn, not scaled
 *
 * The elite of each kind wears something — iron, horns, a fiercer colour, eyes that glow — and the
 * king wears a 冠 and something regal, and stands in a slow pulsing aura. Size still does most of
 * the announcing (`RANKS`); the look is so that a king is a king even when nothing else is on the
 * screen to compare it with.
 *
 * ## Coordinates
 *
 * Every kind is drawn facing right in a box ten units in radius, feet at about y = 9, and the whole
 * thing is scaled to the creature's size and mirrored when it is heading left. One unit is a tenth
 * of the drawn radius.
 */
import type { Kind, Rank } from '../game/menaces.js';

/** What is needed to draw one, this frame. */
export interface Look {
  kind: Kind;
  rank: Rank;
  /** Drawn radius, in pixels. */
  size: number;
  /** 1 facing right, -1 facing left. */
  facing: number;
  /** Seconds, for the animation. Offset per creature so a crowd does not march in step. */
  t: number;
  /** How hard it is moving, 0 to 1. A walk cycle at a standstill is a creature treading water. */
  stride: number;
  /** A tell building up, 0 to 1: a ranged one about to fire, a boar about to charge. */
  aim: number;
  /** 野猪 mid-charge. */
  rush: boolean;
  /** Seconds since a ranged one last fired, for the recoil and the smoke. Large when it has not. */
  fired: number;
}

const Ink = '#1d1428';
const Gold = '#f2c14e';
const GoldDark = '#b07a1c';
const Jade = '#5fe0b4';
const Bone = '#f6efdc';
const TAU = Math.PI * 2;

/** The pen for one creature: a context already scaled to units, and the line width in units. */
interface Pen {
  c: CanvasRenderingContext2D;
  lw: number;
}

function path(p: Pen, fill: string, draw: (c: CanvasRenderingContext2D) => void): void {
  const { c } = p;
  c.beginPath();
  draw(c);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = p.lw;
  c.strokeStyle = Ink;
  c.stroke();
}

function oval(p: Pen, x: number, y: number, rx: number, ry: number, fill: string, rot = 0): void {
  path(p, fill, (c) => c.ellipse(x, y, rx, ry, rot, 0, TAU));
}

/** A limb or a rod: a thick stroke with an ink edge. */
function limb(p: Pen, x1: number, y1: number, x2: number, y2: number, width: number, colour: string): void {
  const { c } = p;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = Ink;
  c.lineWidth = width + p.lw * 2;
  c.stroke();
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

/** A bent limb: hip, knee, foot. */
function bent(p: Pen, x1: number, y1: number, kx: number, ky: number, x2: number, y2: number, width: number, colour: string): void {
  const { c } = p;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(kx, ky);
  c.lineTo(x2, y2);
  c.strokeStyle = Ink;
  c.lineWidth = width + p.lw * 2;
  c.stroke();
  c.strokeStyle = colour;
  c.lineWidth = width;
  c.stroke();
}

/** A cartoon eye: a white, and a pupil looking forward. `glow` turns the pupil into a light. */
function eye(p: Pen, x: number, y: number, r: number, sclera: string, glow?: string): void {
  oval(p, x, y, r, r * 1.08, sclera);
  const { c } = p;
  if (glow) {
    c.fillStyle = glow;
    c.beginPath();
    c.arc(x + r * 0.25, y, r * 0.55, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath();
    c.arc(x + r * 0.05, y - r * 0.3, r * 0.2, 0, TAU);
    c.fill();
    return;
  }
  c.fillStyle = Ink;
  c.beginPath();
  c.arc(x + r * 0.3, y + r * 0.05, r * 0.5, 0, TAU);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(x + r * 0.45, y - r * 0.2, r * 0.18, 0, TAU);
  c.fill();
}

/**
 * 冠 — a gold crown in the Chinese manner: a band, three upright leaves, a pin through it and a
 * red jewel. Sits with its base on (x, y).
 */
function crown(p: Pen, x: number, y: number, w: number, h: number): void {
  path(p, Gold, (c) => {
    c.moveTo(x - w / 2, y);
    c.lineTo(x - w / 2, y - h * 0.45);
    c.lineTo(x - w * 0.3, y - h);
    c.lineTo(x - w * 0.12, y - h * 0.5);
    c.lineTo(x, y - h * 1.15);
    c.lineTo(x + w * 0.12, y - h * 0.5);
    c.lineTo(x + w * 0.3, y - h);
    c.lineTo(x + w / 2, y - h * 0.45);
    c.lineTo(x + w / 2, y);
    c.closePath();
  });
  limb(p, x - w * 0.75, y - h * 0.3, x + w * 0.75, y - h * 0.3, p.lw * 0.9, GoldDark);
  oval(p, x, y - h * 0.32, w * 0.13, w * 0.13, '#e0343c');
}

/** The king's aura: a slow pulse of colour on the ground and round the body. Drawn first. */
function aura(p: Pen, t: number, colour: string, reach = 12): void {
  const { c } = p;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  const glow = c.createRadialGradient(0, 0, reach * 0.3, 0, 0, reach * (1.1 + 0.12 * pulse));
  glow.addColorStop(0, colour + '00');
  glow.addColorStop(0.7, colour + '55');
  glow.addColorStop(1, colour + '00');
  c.fillStyle = glow;
  c.beginPath();
  c.arc(0, 0, reach * 1.25, 0, TAU);
  c.fill();
}

/** The shadow on the ground under it. Raised things cast a smaller one, further below. */
function shadow(p: Pen, raised = 0): void {
  const { c } = p;
  const shrink = 1 - Math.min(0.5, raised / 12);
  c.fillStyle = 'rgba(10, 6, 18, 0.28)';
  c.beginPath();
  c.ellipse(0, 9.6, 7.5 * shrink, 1.9 * shrink, 0, 0, TAU);
  c.fill();
}

/** A little puff of smoke or dust, fading with `life` from 1 to 0. */
function puff(p: Pen, x: number, y: number, r: number, life: number, colour = '220, 214, 200'): void {
  if (life <= 0) return;
  const { c } = p;
  c.fillStyle = `rgba(${colour}, ${0.55 * life})`;
  c.beginPath();
  c.arc(x, y, r * (1.6 - life * 0.6), 0, TAU);
  c.fill();
}

// ---------------------------------------------------------------- the kinds

interface Shade {
  skin: string;
  cloth: string;
  trim: string;
  eye?: string;
}

const GoblinShade: Record<Rank, Shade> = {
  common: { skin: '#7cc243', cloth: '#8b5a2b', trim: '#c94a3a' },
  elite: { skin: '#5a9a35', cloth: '#5c6170', trim: '#9aa3b5', eye: '#ff5a3c' },
  boss: { skin: '#8fd14f', cloth: '#b3262e', trim: Gold, eye: '#ffd24a' },
};

/** The goblin's body, shared with the gunner: legs, torso, head. Returns the shoulder. */
function goblinBody(p: Pen, look: Look, shade: Shade, bob: number): { sx: number; sy: number } {
  const { rank, t, stride } = look;
  const swing = Math.sin(t * 9) * stride;
  // Legs, the far one first.
  bent(p, -1.2, 4, -1.8 - swing * 1.5, 6.6, -1.4 - swing * 2.4, 8.8, 2, shade.skin);
  bent(p, 1.2, 4, 1.8 + swing * 1.5, 6.6, 1.6 + swing * 2.4, 8.8, 2, shade.skin);
  oval(p, -1.4 - swing * 2.4 + 0.6, 9, 1.5, 0.8, '#5a3a22');
  oval(p, 1.6 + swing * 2.4 + 0.6, 9, 1.5, 0.8, '#5a3a22');

  const y = bob;
  if (rank === 'boss') {
    // The king's cape, behind everything else of him.
    path(p, '#8a1c24', (c) => {
      c.moveTo(-1, -2 + y);
      c.quadraticCurveTo(-8, 1 + y + Math.sin(t * 4) * 0.8, -6.5, 7.5);
      c.lineTo(-1, 6);
      c.closePath();
    });
  }
  // Torso: a vest over a round belly.
  oval(p, 0, 1.8 + y, 4.3, 4.4, shade.skin);
  path(p, shade.cloth, (c) => {
    c.moveTo(-4.1, 0.4 + y);
    c.quadraticCurveTo(0, -2.4 + y, 4.1, 0.4 + y);
    c.lineTo(3.6, 4.6 + y);
    c.quadraticCurveTo(0, 6.4 + y, -3.6, 4.6 + y);
    c.closePath();
  });
  limb(p, -3.8, 3.6 + y, 3.8, 3.6 + y, 0.9, shade.trim);

  // Head: big, with the ear swept back and the long nose forward.
  const hy = -5 + y + Math.sin(t * 9 + 1) * 0.25 * stride;
  path(p, shade.skin, (c) => {
    c.moveTo(-2.4, hy - 2.2);
    c.quadraticCurveTo(-6.4, hy - 4.6, -9.8, hy - 4.4);
    c.quadraticCurveTo(-7, hy + 0.2, -3, hy + 2.2);
    c.closePath();
  });
  path(p, '#e88b8b', (c) => {
    c.moveTo(-3.2, hy - 1);
    c.quadraticCurveTo(-6, hy - 3, -8, hy - 3.4);
    c.quadraticCurveTo(-6, hy - 0.4, -3.4, hy + 1);
    c.closePath();
  });
  oval(p, 0.8, hy, 4.6, 4.2, shade.skin);
  path(p, shade.skin, (c) => {
    c.moveTo(4.4, hy - 0.8);
    c.quadraticCurveTo(9.4, hy + 0.2, 8.6, hy + 1.6);
    c.quadraticCurveTo(6.4, hy + 1.8, 4.6, hy + 1.4);
    c.closePath();
  });
  eye(p, 2.6, hy - 1.2, 1.35, '#fff3b8', shade.eye);
  // The grin, with two teeth.
  path(p, '#5a1a1a', (c) => {
    c.moveTo(1.4, hy + 2.2);
    c.quadraticCurveTo(3.6, hy + 3.8, 5.6, hy + 2.4);
    c.quadraticCurveTo(3.6, hy + 2.9, 1.4, hy + 2.2);
  });
  path(p, Bone, (c) => {
    c.moveTo(2.6, hy + 2.6);
    c.lineTo(3.1, hy + 3.5);
    c.lineTo(3.5, hy + 2.75);
    c.closePath();
  });

  // What it wears on its head.
  if (rank === 'common') {
    // A topknot, tied with red.
    oval(p, -0.6, hy - 4.6, 1.6, 1.4, '#2a2030');
    limb(p, -1.8, hy - 3.6, 0.6, hy - 3.6, 0.8, shade.trim);
  } else if (rank === 'elite') {
    // An iron cap with two horns.
    path(p, '#6c7486', (c) => {
      c.moveTo(-3.6, hy - 1.6);
      c.quadraticCurveTo(0.8, hy - 7.2, 5, hy - 1.6);
      c.closePath();
    });
    path(p, Bone, (c) => {
      c.moveTo(-2.4, hy - 3.6);
      c.quadraticCurveTo(-5.4, hy - 6.6, -4.2, hy - 8.4);
      c.quadraticCurveTo(-3.2, hy - 6, -1, hy - 4.6);
      c.closePath();
    });
    path(p, Bone, (c) => {
      c.moveTo(3, hy - 4);
      c.quadraticCurveTo(5.6, hy - 6.8, 5.2, hy - 8.6);
      c.quadraticCurveTo(4.2, hy - 6.4, 1.8, hy - 4.8);
      c.closePath();
    });
  } else {
    crown(p, 0.8, hy - 3.4, 5.2, 3.2);
  }
  return { sx: 1.6, sy: 0.6 + y };
}

function goblin(p: Pen, look: Look): void {
  const shade = GoblinShade[look.rank];
  const bob = -Math.abs(Math.sin(look.t * 9)) * 0.8 * look.stride;
  shadow(p);
  const { sx, sy } = goblinBody(p, look, shade, bob);
  // The arm, swinging, with what it hits things with.
  const swing = Math.sin(look.t * 9 + Math.PI) * 0.6 * look.stride;
  const hx = sx + 3 + swing * 2;
  const hy = sy + 2.6 - swing;
  if (look.rank === 'common') {
    limb(p, hx, hy, hx + 2.6, hy - 6.4, 1.6, '#9b6a3a');
    oval(p, hx + 2.9, hy - 6.8, 1.5, 1.9, '#9b6a3a');
  } else if (look.rank === 'elite') {
    limb(p, hx, hy, hx + 1.8, hy - 4, 1, '#5a3a22');
    path(p, '#c9d2de', (c) => {
      c.moveTo(hx + 1.2, hy - 3.4);
      c.lineTo(hx + 5.4, hy - 6.4);
      c.lineTo(hx + 6.2, hy - 3.6);
      c.lineTo(hx + 2.6, hy - 2.4);
      c.closePath();
    });
  } else {
    limb(p, hx, hy, hx + 2.8, hy - 6.6, 1.4, GoldDark);
    oval(p, hx + 3.2, hy - 7.2, 2.2, 2.2, Gold);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      limb(p, hx + 3.2 + Math.cos(a) * 2.2, hy - 7.2 + Math.sin(a) * 2.2, hx + 3.2 + Math.cos(a) * 3.4, hy - 7.2 + Math.sin(a) * 3.4, 0.6, Bone);
    }
  }
  limb(p, sx, sy, hx, hy, 1.7, shade.skin);
}

function gunner(p: Pen, look: Look): void {
  const shade = GoblinShade[look.rank];
  const bob = -Math.abs(Math.sin(look.t * 7)) * 0.6 * look.stride;
  shadow(p);
  const { sx, sy } = goblinBody(p, look, shade, bob);
  // Brass goggles pushed up on the forehead.
  if (look.rank !== 'boss') {
    oval(p, 1.6, -8.4 + bob, 1.2, 1, '#d9a441');
    oval(p, 3.6, -8 + bob, 1.1, 0.95, '#d9a441');
  }
  // The hand cannon over the shoulder, kicking back when it fires.
  const kick = look.fired < 0.25 ? (1 - look.fired / 0.25) * 1.6 : 0;
  const bx = -3.6 - kick;
  const by = sy - 3.2;
  const length = look.rank === 'common' ? 12.5 : 14;
  const bore = look.rank === 'common' ? 1.5 : 1.9;
  const barrel = look.rank === 'boss' ? Gold : look.rank === 'elite' ? '#6c7486' : '#c08a3e';
  limb(p, bx, by, bx + length, by - 1.2, bore * 2, barrel);
  limb(p, bx + 1.6, by + 0.4, bx + 2.6, by + 0.4, bore * 2.2, '#5a3a22');
  const mx = bx + length;
  const my = by - 1.2;
  if (look.rank === 'boss') {
    // A dragon's head for a muzzle.
    path(p, Gold, (c) => {
      c.moveTo(mx - 1.4, my - 2.6);
      c.lineTo(mx + 2.6, my - 1.4);
      c.lineTo(mx + 1.6, my);
      c.lineTo(mx + 2.6, my + 1.4);
      c.lineTo(mx - 1.4, my + 2.6);
      c.closePath();
    });
    eye(p, mx - 0.2, my - 1.2, 0.5, '#ffffff', '#e0343c');
  } else {
    oval(p, mx, my, 0.8, bore * 1.25, barrel);
  }
  limb(p, sx, sy, bx + 4.4, by + 0.8, 1.7, shade.skin);
  // The tell: the fuse is lit and the muzzle glows. Then the flash, then the smoke.
  const { c } = p;
  if (look.aim > 0) {
    c.fillStyle = `rgba(255, 170, 60, ${0.85 * look.aim})`;
    c.beginPath();
    c.arc(mx + 1, my, 1 + look.aim * 1.8, 0, TAU);
    c.fill();
    c.fillStyle = `rgba(255, 240, 180, ${look.aim})`;
    c.beginPath();
    c.arc(bx + 1, by - 1.6, 0.6 + Math.sin(look.t * 40) * 0.2, 0, TAU);
    c.fill();
  }
  if (look.fired < 0.12) {
    c.fillStyle = `rgba(255, 220, 120, ${1 - look.fired / 0.12})`;
    c.beginPath();
    c.arc(mx + 2.2, my, 3, 0, TAU);
    c.fill();
  }
  puff(p, mx + 2 + look.fired * 5, my - look.fired * 6, 1.6, 1 - look.fired / 0.9);
}

const ZombieShade: Record<Rank, { robe: string; trim: string; skin: string; eye: string }> = {
  common: { robe: '#3d4a7a', trim: '#22284a', skin: '#a6c49a', eye: '#d9e86a' },
  elite: { robe: '#8e2430', trim: '#4a1018', skin: '#93b28a', eye: '#ff4a3a' },
  boss: { robe: '#d8a531', trim: '#8a1c24', skin: '#b7cfac', eye: '#7cfff0' },
};

/** 丧尸, as a 僵尸: hops with its feet together, arms out in front, a talisman on its forehead. */
function zombie(p: Pen, look: Look): void {
  const shade = ZombieShade[look.rank];
  const hop = Math.abs(Math.sin(look.t * 4.2)) * 2.6 * Math.max(0.35, look.stride);
  const y = -hop;
  if (look.rank === 'boss') aura(p, look.t, '#7cfff0');
  shadow(p, hop);
  // Boots, together.
  oval(p, 0.6, 8.6 + y, 2.6, 1, '#1f1f2a');
  // The robe, long, flared at the hem.
  path(p, shade.robe, (c) => {
    c.moveTo(-3.2, -2.6 + y);
    c.lineTo(3.4, -2.6 + y);
    c.lineTo(4.6, 8 + y);
    c.quadraticCurveTo(0.6, 9 + y, -3.6, 8 + y);
    c.closePath();
  });
  limb(p, -3.4, 7.4 + y, 4.4, 7.4 + y, 1, shade.trim);
  // The square badge on the chest.
  path(p, look.rank === 'boss' ? '#8a1c24' : '#d8c27a', (c) => c.rect(-1.6, 0.2 + y, 3.4, 3.2));
  if (look.rank === 'boss') {
    // Gold thread: a little dragon is too much at this size; a crane's circle is not.
    oval(p, 0.1, 1.8 + y, 0.9, 0.9, Gold);
  }
  // Arms straight out in front, sleeves hanging, long nails.
  const reach = Math.sin(look.t * 4.2) * 0.3;
  limb(p, 1.4, -1.4 + y, 8.6, -1.8 + y + reach, 2.8, shade.robe);
  oval(p, 9.4, -1.8 + y + reach, 1.2, 1, shade.skin);
  limb(p, 10.2, -2.2 + y + reach, 11.4, -2.4 + y + reach, 0.35, Bone);
  limb(p, 10.2, -1.4 + y + reach, 11.4, -1.2 + y + reach, 0.35, Bone);
  // Head.
  oval(p, 0.8, -5.6 + y, 3.4, 3.6, shade.skin);
  eye(p, 2.4, -5.6 + y, 0.7, '#2a2030', shade.eye);
  path(p, '#3a1a24', (c) => {
    c.moveTo(1.2, -3.4 + y);
    c.lineTo(3.6, -3.6 + y);
    c.lineTo(2.6, -2.6 + y);
    c.closePath();
  });
  // The Qing official's hat: a dome, a brim, a bead on top — and for the king, the peacock plume.
  if (look.rank === 'boss') {
    path(p, '#2f8f6a', (c) => {
      c.moveTo(-1, -10.4 + y);
      c.quadraticCurveTo(-7.8, -10.6 + y, -8.4, -6 + y);
      c.quadraticCurveTo(-5.2, -8.6 + y, -1, -9.2 + y);
      c.closePath();
    });
    oval(p, -7.6, -6.8 + y, 1, 0.9, '#2a4fbf');
  }
  path(p, '#1f1f2a', (c) => {
    c.ellipse(0.8, -8.4 + y, 4.2, 2.3, 0, Math.PI, 0);
    c.closePath();
  });
  limb(p, -3.6, -8.2 + y, 5.2, -8.2 + y, 1.1, look.rank === 'boss' ? Gold : '#8a1c24');
  oval(p, 0.8, -10.9 + y, 0.9, 0.9, look.rank === 'boss' ? Gold : '#d63a3a');
  // The talisman, fluttering. Two on the elite, three on the king.
  const papers = look.rank === 'common' ? 1 : look.rank === 'elite' ? 2 : 3;
  for (let i = 0; i < papers; i++) {
    const ox = 2.2 + (i - (papers - 1) / 2) * 1.6;
    const flutter = Math.sin(look.t * 7 + i) * 0.18;
    const { c } = p;
    c.save();
    c.translate(ox, -7.8 + y);
    c.rotate(flutter);
    path(p, '#f2d14a', (cc) => cc.rect(-0.75, 0, 1.5, 4.6));
    limb(p, 0, 0.8, 0, 3.8, 0.25, '#d02a2a');
    limb(p, -0.4, 1.8, 0.4, 2.2, 0.2, '#d02a2a');
    c.restore();
  }
}

const SpiderShade: Record<Rank, { body: string; mark: string; leg: string; eye: string }> = {
  common: { body: '#5b3f86', mark: '#a98ad8', leg: '#46306a', eye: '#ff4a5a' },
  elite: { body: '#4a2626', mark: '#ff8a2a', leg: '#3a1c1c', eye: '#ffd24a' },
  boss: { body: '#3a2560', mark: Jade, leg: '#2e1c4c', eye: Jade },
};

/**
 * A spider from the side: a round abdomen, a small head, and eight long legs arched high over the
 * body with the feet planted far apart — the legs are what say "spider" at twenty pixels, so they
 * are thin and wide rather than thick and bunched.
 */
function spider(p: Pen, look: Look): void {
  const shade = SpiderShade[look.rank];
  const t = look.t * 13;
  const s = Math.max(0.3, look.stride);
  if (look.rank === 'boss') aura(p, look.t, Jade);
  shadow(p);
  const feet = [-10, -5.6, 4.6, 9.6];
  const leg = (i: number, near: boolean): void => {
    const phase = t + i * 1.6 + (near ? Math.PI : 0);
    const lift = Math.max(0, Math.sin(phase)) * 1.6 * s;
    const slide = Math.cos(phase) * 0.9 * s;
    const foot = feet[i] + (near ? 0.6 : -0.6) + slide;
    const base = 0.4 + (i - 1.5) * 0.5;
    const knee = base + (foot - base) * 0.5;
    // Thin, with a thin edge: a leg with the creature's full ink round it is a bar, not a leg.
    const thin: Pen = { c: p.c, lw: p.lw * 0.55 };
    bent(thin, base, 1.6, knee, -4.8 - lift * 0.5 + Math.abs(i - 1.5) * 0.4, foot, 8.8 - lift, near ? 0.55 : 0.45, near ? shade.leg : '#20162e');
  };
  for (let i = 0; i < 4; i++) leg(i, false);
  // Abdomen, with its markings.
  oval(p, -3.4, 1.4, 5.2, 4.4, shade.body);
  if (look.rank === 'common') {
    limb(p, -6.6, 0.2, -1.4, -0.6, 0.7, shade.mark);
    limb(p, -7.2, 2.4, -1, 1.8, 0.7, shade.mark);
  } else if (look.rank === 'elite') {
    // An hourglass, and spines.
    path(p, shade.mark, (c) => {
      c.moveTo(-5.2, -0.8);
      c.lineTo(-3.4, 1.4);
      c.lineTo(-5.2, 3.6);
      c.lineTo(-1.8, 3.6);
      c.lineTo(-3.6, 1.4);
      c.lineTo(-1.8, -0.8);
      c.closePath();
    });
    for (let i = 0; i < 3; i++) {
      const x = -6 + i * 2.4;
      path(p, Bone, (c) => {
        c.moveTo(x - 0.7, -2.4);
        c.lineTo(x + 0.2, -5);
        c.lineTo(x + 0.8, -2.4);
        c.closePath();
      });
    }
  } else {
    // The queen: a jade pattern that breathes, and a crown of horns.
    const { c } = p;
    c.save();
    c.globalAlpha *= 0.6 + 0.4 * Math.sin(look.t * 3);
    oval(p, -3.4, 1.4, 2.6, 2, shade.mark);
    c.restore();
    limb(p, -6.8, 1.4, -0.2, 1.4, 0.45, shade.mark);
  }
  // Head and fangs.
  oval(p, 2.6, 2.4, 2.8, 2.4, shade.body);
  path(p, Bone, (c) => {
    c.moveTo(4.4, 3.6);
    c.quadraticCurveTo(5.6, 4.8, 4.6, 5.8);
    c.lineTo(4, 4.2);
    c.closePath();
  });
  const { c } = p;
  c.fillStyle = shade.eye;
  for (const [ex, ey, er] of [[3.4, 1.4, 0.65], [4.5, 1.7, 0.55], [3.3, 2.6, 0.45], [4.4, 2.8, 0.4]] as const) {
    c.beginPath();
    c.arc(ex, ey, er, 0, TAU);
    c.fill();
  }
  if (look.rank === 'boss') crown(p, 2.4, 0.2, 3.6, 2.6);
  for (let i = 0; i < 4; i++) leg(i, true);
}

const BoarShade: Record<Rank, { hide: string; belly: string; mane: string; tusk: string }> = {
  common: { hide: '#8a5a36', belly: '#b9895e', mane: '#3e2616', tusk: Bone },
  elite: { hide: '#6a4a3a', belly: '#9a7a62', mane: '#2a1a12', tusk: '#f6f0e0' },
  boss: { hide: '#7a3a22', belly: '#b0704a', mane: '#ff8a2a', tusk: Gold },
};

function boar(p: Pen, look: Look): void {
  const shade = BoarShade[look.rank];
  const { c } = p;
  const trot = Math.sin(look.t * (look.rush ? 18 : 10)) * Math.max(0.3, look.stride);
  if (look.rank === 'boss') aura(p, look.t, '#ff7a3a');
  shadow(p);
  // Dust behind a charge.
  if (look.rush) for (let i = 0; i < 3; i++) puff(p, -9 - i * 2.4, 8 - i * 0.6, 1.4, 1 - i * 0.28, '190, 160, 120');
  c.save();
  // Head down: the tell, and then the charge.
  c.rotate(look.rush ? 0.14 : look.aim * 0.1);
  const legs: [number, number][] = [[-4.6, 1], [-2.4, -1], [3, -1], [5, 1]];
  for (const [x, side] of legs) {
    const swing = trot * side;
    limb(p, x, 3.4, x + swing * 1.4, 8.6, 2, shade.hide);
    oval(p, x + swing * 1.4, 8.8, 1.1, 0.7, '#2a1a12');
  }
  // Tail, curled.
  limb(p, -7.4, -0.2, -8.8, -1.6, 0.6, shade.hide);
  // Body.
  oval(p, -0.6, 0.8, 7.6, 4.8, shade.hide);
  oval(p, -0.2, 3, 5.8, 2.2, shade.belly);
  if (look.rank === 'boss') {
    // A saddle cloth, red and gold.
    path(p, '#b3262e', (cc) => {
      cc.moveTo(-4.4, -3.4);
      cc.lineTo(1.6, -3.6);
      cc.lineTo(2.2, 1.4);
      cc.lineTo(-5, 1.6);
      cc.closePath();
    });
    limb(p, -5, 1.4, 2.2, 1.2, 0.7, Gold);
  }
  // The mane, a row of bristles; on the king they are flame.
  for (let i = 0; i < 6; i++) {
    const x = -5.6 + i * 1.9;
    const flick = look.rank === 'boss' ? Math.sin(look.t * 12 + i) * 0.5 : 0;
    path(p, shade.mane, (cc) => {
      cc.moveTo(x - 1, -3.4 + Math.abs(x) * 0.05);
      cc.lineTo(x + flick, -6.2 + Math.abs(x) * 0.08);
      cc.lineTo(x + 1, -3.4 + Math.abs(x) * 0.05);
      cc.closePath();
    });
  }
  if (look.rank === 'elite') {
    // Iron plates riveted down the back, over the bristles.
    for (let i = 0; i < 3; i++) path(p, '#8a92a6', (cc) => cc.ellipse(-4 + i * 3.4, -2.4, 1.9, 1.5, 0, Math.PI, 0));
  }
  // Head, snout, ear, eye, tusks.
  oval(p, 6.4, 1.8, 3.6, 3.2, shade.hide, 0.2);
  path(p, shade.hide, (cc) => {
    cc.moveTo(4.4, -0.8);
    cc.lineTo(4.8, -3.8);
    cc.lineTo(6.6, -1.2);
    cc.closePath();
  });
  oval(p, 9.6, 2.8, 1.4, 1.7, '#d99a8a');
  c.fillStyle = Ink;
  c.beginPath();
  c.arc(9.9, 2.4, 0.3, 0, TAU);
  c.arc(9.9, 3.3, 0.3, 0, TAU);
  c.fill();
  const angry = look.rush || look.aim > 0.3;
  eye(p, 6.8, 0.6, 0.75, '#fff6e0', angry || look.rank !== 'common' ? '#e0343c' : undefined);
  if (look.rank === 'boss') {
    // War paint, and a 冠 between the ears.
    limb(p, 5.2, 2.4, 7.4, 3.2, 0.5, '#e0343c');
    crown(p, 5.4, -2.4, 3.4, 2.4);
  }
  const tusk = look.rank === 'common' ? 1 : 1.35;
  path(p, shade.tusk, (cc) => {
    cc.moveTo(8.4, 3.8);
    cc.quadraticCurveTo(10.4 * tusk, 4.2, 10.6 * tusk - 0.4, 0.4);
    cc.quadraticCurveTo(9.6, 2.6, 8.2, 3.2);
    cc.closePath();
  });
  c.restore();
}

const BatShade: Record<Rank, { body: string; wing: string; eye: string }> = {
  common: { body: '#4c3a6a', wing: '#7058a4', eye: '#ffd24a' },
  elite: { body: '#2a1424', wing: '#8a1f3a', eye: '#ff4a3a' },
  boss: { body: '#2a1840', wing: '#6a2a9a', eye: '#d48aff' },
};

/** Seen from the front: a bat side-on is a line with ears. */
function bat(p: Pen, look: Look): void {
  const shade = BatShade[look.rank];
  const lift = 3 + Math.sin(look.t * 6) * 1.4;
  const flap = Math.sin(look.t * 18);
  const { c } = p;
  if (look.rank === 'boss') aura(p, look.t, '#b06aff');
  shadow(p, lift + 3);
  c.save();
  c.translate(0, -lift);
  // Undo the mirror: a bat seen from the front faces the viewer either way.
  c.scale(Math.sign(look.facing) || 1, 1);
  const wing = (side: number): void => {
    const tipY = -4 + flap * 4.5;
    const span = 10.5 - Math.abs(flap) * 1.5;
    path(p, shade.wing, (cc) => {
      cc.moveTo(side * 1.8, -1.6);
      cc.lineTo(side * span * 0.55, tipY - 2);
      cc.lineTo(side * span, tipY);
      cc.quadraticCurveTo(side * span * 0.85, tipY + 2.4, side * span * 0.7, tipY + 2.6);
      cc.quadraticCurveTo(side * span * 0.55, tipY + 1.6, side * span * 0.42, tipY + 3.2);
      cc.quadraticCurveTo(side * 3.2, 0.6, side * 2, 1.6);
      cc.closePath();
    });
    limb(p, side * 1.8, -1.6, side * span * 0.55, tipY - 2, 0.3, shade.body);
    limb(p, side * span * 0.55, tipY - 2, side * span * 0.7, tipY + 2.6, 0.25, shade.body);
  };
  wing(-1);
  wing(1);
  // Ears.
  for (const side of [-1, 1]) {
    path(p, shade.body, (cc) => {
      cc.moveTo(side * 0.8, -3.4);
      cc.lineTo(side * 2.6, -7);
      cc.lineTo(side * 2.6, -2.4);
      cc.closePath();
    });
  }
  oval(p, 0, -0.4, 3, 3.6, shade.body);
  oval(p, 0, 0.6, 1.6, 2, '#6a5a80');
  eye(p, -1.1, -1.4, 0.75, '#2a1830', shade.eye);
  eye(p, 1.1, -1.4, 0.75, '#2a1830', shade.eye);
  path(p, Bone, (cc) => {
    cc.moveTo(-0.7, 0.6);
    cc.lineTo(-0.4, 1.6);
    cc.lineTo(-0.1, 0.6);
    cc.moveTo(0.1, 0.6);
    cc.lineTo(0.4, 1.6);
    cc.lineTo(0.7, 0.6);
  });
  if (look.rank === 'elite') {
    for (const side of [-1, 1]) {
      path(p, Bone, (cc) => {
        cc.moveTo(side * 0.6, -3.2);
        cc.quadraticCurveTo(side * 1.4, -5.6, side * 0.4, -6.4);
        cc.lineTo(side * 0.2, -3.4);
        cc.closePath();
      });
    }
  }
  if (look.rank === 'boss') crown(p, 0, -3.4, 3.2, 2.2);
  c.restore();
}

const DrakeShade: Record<Rank, { scale: string; belly: string; wing: string; horn: string; eye: string }> = {
  common: { scale: '#c8402e', belly: '#f4d39a', wing: '#8a2a20', horn: '#f2e2b8', eye: '#ffd24a' },
  elite: { scale: '#2f4f3a', belly: '#f0a050', wing: '#1e3426', horn: '#d0d0c0', eye: '#ff8a2a' },
  boss: { scale: '#d23a2a', belly: '#ffe0a0', wing: '#a02a1a', horn: Gold, eye: '#ffffff' },
};

function drake(p: Pen, look: Look): void {
  const shade = DrakeShade[look.rank];
  const lift = 4 + Math.sin(look.t * 3) * 1.4;
  const flap = Math.sin(look.t * 8);
  const { c } = p;
  if (look.rank === 'boss') aura(p, look.t, '#ff6a2a', 13);
  shadow(p, lift + 3);
  c.save();
  c.translate(0, -lift);
  // The far wing.
  const wing = (shade2: string, lift2: number): void => {
    c.save();
    c.translate(-1, -2.6);
    c.rotate(-0.4 + flap * 0.55 + lift2);
    path(p, shade2, (cc) => {
      cc.moveTo(0, 0);
      cc.lineTo(-2, -8.6);
      cc.lineTo(-5.4, -6.2);
      cc.quadraticCurveTo(-5.6, -3, -7.6, -2.2);
      cc.quadraticCurveTo(-4.6, -1.2, -4.4, 0.8);
      cc.closePath();
    });
    limb(p, 0, 0, -2, -8.6, 0.4, shade.scale);
    c.restore();
  };
  wing(shade.wing, 0.35);
  // Tail with a spade.
  path(p, shade.scale, (cc) => {
    cc.moveTo(-4.4, 1.4);
    cc.quadraticCurveTo(-9, 4.4 + Math.sin(look.t * 4) * 0.8, -11.4, 0.6);
    cc.lineTo(-10.6, 0.2);
    cc.quadraticCurveTo(-8.6, 2.6, -4.2, -0.6);
    cc.closePath();
  });
  path(p, shade.scale, (cc) => {
    cc.moveTo(-11.4, 0.6);
    cc.lineTo(-12.8, -1.6);
    cc.lineTo(-10.2, -1.2);
    cc.closePath();
  });
  // Dangling legs.
  limb(p, -1.6, 3.6, -2, 6.4, 1.4, shade.scale);
  limb(p, 1.8, 3.6, 1.8, 6.2, 1.4, shade.scale);
  // Body and belly.
  oval(p, -0.6, 1, 5.2, 4, shade.scale);
  path(p, shade.belly, (cc) => cc.ellipse(0.4, 2.4, 3.6, 2.4, -0.2, 0, Math.PI));
  if (look.rank === 'elite') {
    for (let i = 0; i < 4; i++) {
      const x = -4 + i * 2;
      path(p, shade.horn, (cc) => {
        cc.moveTo(x - 0.7, -2.6 + i * 0.1);
        cc.lineTo(x, -4.6);
        cc.lineTo(x + 0.7, -2.8 + i * 0.1);
        cc.closePath();
      });
    }
  }
  // Neck and head.
  limb(p, 2, -1, 4.2, -3.8, 3, shade.scale);
  oval(p, 5, -4.6, 3, 2.6, shade.scale);
  path(p, shade.scale, (cc) => {
    cc.moveTo(6.4, -5.8);
    cc.quadraticCurveTo(10, -5.4, 9.6, -3.6);
    cc.quadraticCurveTo(7.6, -2.6, 6, -3.2);
    cc.closePath();
  });
  for (const [hx, hy] of [[3.4, -6.6], [4.8, -7]] as const) {
    path(p, shade.horn, (cc) => {
      cc.moveTo(hx, hy);
      cc.quadraticCurveTo(hx - 2.6, hy - 2.4, hx - 3.8, hy - 1.8);
      cc.quadraticCurveTo(hx - 2.2, hy - 1.2, hx + 1.2, hy + 0.6);
      cc.closePath();
    });
  }
  eye(p, 5.8, -5.4, 0.85, shade.eye, look.rank === 'boss' ? '#e0343c' : undefined);
  if (look.rank === 'boss') {
    // A Chinese dragon's whiskers, and the flaming pearl held out in front.
    for (const off of [0, 1.2]) {
      c.lineCap = 'round';
      c.strokeStyle = Gold;
      c.lineWidth = 0.4;
      c.beginPath();
      c.moveTo(8.8, -4.4 + off * 0.3);
      c.quadraticCurveTo(11 + off, -2 + Math.sin(look.t * 3 + off) * 1.2, 13 + off, -4 + Math.sin(look.t * 2 + off) * 1.6);
      c.stroke();
    }
    const glow = 0.6 + 0.4 * Math.sin(look.t * 5);
    c.fillStyle = `rgba(255, 140, 40, ${0.45 * glow})`;
    c.beginPath();
    c.arc(4.6, 4.8, 2.6, 0, TAU);
    c.fill();
    oval(p, 4.6, 4.8, 1.4, 1.4, '#ffe9a0');
  }
  // A curl of smoke from the nostril now and then; the elite's mouth glows.
  if (look.rank === 'elite') {
    c.fillStyle = `rgba(255, 140, 40, ${0.5 + 0.3 * Math.sin(look.t * 6)})`;
    c.beginPath();
    c.arc(9.2, -3.4, 0.9, 0, TAU);
    c.fill();
  }
  puff(p, 10.4 + ((look.t * 4) % 3), -5.8 - ((look.t * 4) % 3), 0.9, 1 - ((look.t * 4) % 3) / 3);
  wing(shade.scale, 0);
  c.restore();
}

const MageShade: Record<Rank, { robe: string; trim: string; orb: string }> = {
  common: { robe: '#4b2d6e', trim: '#8a6ab0', orb: '#6aff9a' },
  elite: { robe: '#7a1c2e', trim: '#d0a040', orb: '#ff5a3c' },
  boss: { robe: '#2c2552', trim: Gold, orb: '#ffd24a' },
};

/** 魔修: a hooded robe that floats, a staff with an orb, eyes in the dark of the hood. */
function mage(p: Pen, look: Look): void {
  const shade = MageShade[look.rank];
  const hover = 1.2 + Math.sin(look.t * 2.2) * 1.2;
  const { c } = p;
  if (look.rank === 'boss') aura(p, look.t, '#ffd24a');
  shadow(p, hover);
  c.save();
  c.translate(0, -hover);
  // The robe, its hem rippling.
  path(p, shade.robe, (cc) => {
    cc.moveTo(-2.6, -4);
    cc.lineTo(3, -4);
    cc.lineTo(5.2, 7.6);
    for (let i = 0; i <= 5; i++) {
      const x = 5.2 - i * 2.1;
      cc.lineTo(x, 7.6 + Math.sin(look.t * 6 + i) * 0.7 + (i % 2) * 0.6);
    }
    cc.closePath();
  });
  limb(p, -4.6, 6.6, 4.8, 6.6, 0.8, shade.trim);
  limb(p, 0.4, -3.6, 0.6, 6.6, 0.6, shade.trim);
  // The hood, its point falling back.
  path(p, shade.robe, (cc) => {
    cc.moveTo(-3, -3);
    cc.quadraticCurveTo(-4.6, -9.4, -1.6, -11.4);
    cc.quadraticCurveTo(1.6, -11, 3.8, -6.6);
    cc.quadraticCurveTo(4.2, -3.8, 3, -3);
    cc.closePath();
  });
  // The face is a shadow, with two eyes in it that glow brighter as it casts.
  oval(p, 1.6, -6.4, 2, 2.2, '#120c1e');
  c.save();
  c.fillStyle = shade.orb;
  c.globalAlpha *= 0.55 + 0.45 * look.aim;
  c.beginPath();
  c.arc(1.4, -6.6, 0.45, 0, TAU);
  c.arc(2.8, -6.6, 0.45, 0, TAU);
  c.fill();
  c.restore();
  if (look.rank === 'elite') {
    for (const [hx, dir] of [[-1.4, -1], [2.8, 1]] as const) {
      path(p, Bone, (cc) => {
        cc.moveTo(hx, -9.4);
        cc.quadraticCurveTo(hx + dir * 1.8, -12.4, hx + dir * 0.6, -13.2);
        cc.lineTo(hx + dir * 0.2, -9.8);
        cc.closePath();
      });
    }
  }
  if (look.rank === 'boss') crown(p, 0.4, -10.2, 4, 2.8);
  // Staff and orb, held out in front.
  const sx = 6.2;
  limb(p, sx, 7.4, sx, -8.6, 0.9, look.rank === 'boss' ? '#e8e0c8' : '#7a5232');
  if (look.rank === 'boss') {
    // A skull for a headpiece.
    oval(p, sx, -9.4, 1.6, 1.5, Bone);
    c.fillStyle = Ink;
    c.beginPath();
    c.arc(sx - 0.6, -9.6, 0.35, 0, TAU);
    c.arc(sx + 0.6, -9.6, 0.35, 0, TAU);
    c.fill();
  }
  const orbR = 1.5 + look.aim * 1.2 + Math.sin(look.t * 5) * 0.15;
  const oy = look.rank === 'boss' ? -12 : -10;
  c.fillStyle = shade.orb + '55';
  c.beginPath();
  c.arc(sx, oy, orbR * 2.1, 0, TAU);
  c.fill();
  oval(p, sx, oy, orbR, orbR, shade.orb);
  limb(p, 2.6, -2.2, sx - 0.4, -2.8, 1.8, shade.robe);
  // While it winds up, a ring of runes turns round the orb.
  if (look.aim > 0) {
    c.save();
    c.strokeStyle = shade.orb;
    c.lineWidth = 0.35;
    c.globalAlpha *= look.aim;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = look.t * 3 + (i / 6) * TAU;
      c.moveTo(sx + Math.cos(a) * 3.4, oy + Math.sin(a) * 3.4);
      c.lineTo(sx + Math.cos(a + 0.5) * 3.4, oy + Math.sin(a + 0.5) * 3.4);
    }
    c.stroke();
    c.restore();
  }
  // The king's talismans, turning round him.
  if (look.rank === 'boss') {
    for (let i = 0; i < 2; i++) {
      const a = look.t * 1.6 + i * Math.PI;
      const x = Math.cos(a) * 7;
      const y = -2 + Math.sin(a) * 2.2;
      path(p, '#f2d14a', (cc) => cc.rect(x - 0.7, y - 1.6, 1.4, 3.2));
      limb(p, x, y - 1, x, y + 1, 0.2, '#d02a2a');
    }
  }
  c.restore();
}

const ARTISTS: Record<Kind, (p: Pen, look: Look) => void> = {
  goblin,
  gunner,
  zombie,
  spider,
  boar,
  bat,
  drake,
  mage,
};

/**
 * Draws one, centred on the origin. The caller owns the translate and the alpha.
 *
 * The king's aura is drawn by the kind itself rather than here, because two of them fly and their
 * aura belongs on the ground under them rather than round where they happen to be in the air.
 */
export function drawCreature(context: CanvasRenderingContext2D, look: Look): void {
  const unit = look.size / 10;
  if (unit <= 0) return;
  context.save();
  context.scale(unit * (look.facing < 0 ? -1 : 1), unit);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  // The ink stays about a pixel and a quarter however big the creature is — thinner on a king
  // than his scale would give, which is what keeps a king a cartoon rather than a woodcut.
  const pen: Pen = { c: context, lw: Math.max(1.15 / unit, 0.55) };
  ARTISTS[look.kind](pen, look);
  context.restore();
}
