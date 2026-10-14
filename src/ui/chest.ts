/**
 * 宝箱 — what an elite or a king leaves where it fell.
 *
 * A wooden chest bound in gold, sitting on the ground and breathing a little light so it reads as
 * something to click. Clicked, the lid flies back, coins burst out, and how much it held rises off
 * it — the one number in a level that is not on the bar, because it is the answer to "what did I
 * just get", asked by the click that got it.
 */
import { fill, words } from '../i18n/index.js';

const Ink = '#2a1608';
const Wood = '#a8662e';
const WoodDark = '#7a4620';
const Gold = '#f2c14e';
const GoldDark = '#b07a1c';

/** How long the opening plays, in seconds. */
export const OpenSeconds = 1.4;
/** How big a chest is, in pixels across. A king's is bigger. */
export function chestSize(boss: boolean): number {
  return boss ? 46 : 34;
}

/**
 * Draws a chest centred on its foot point. `age` drives the idle shimmer; `opened` is seconds since
 * it was clicked, or negative while still shut.
 */
export function drawChest(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  boss: boolean,
  age: number,
  opened: number,
): void {
  const w = chestSize(boss);
  const h = w * 0.62;
  const open = opened < 0 ? 0 : Math.min(1, opened / 0.25);
  const fade = opened < 0 ? 1 : Math.max(0, 1 - Math.max(0, opened - 0.9) / (OpenSeconds - 0.9));
  context.save();
  context.globalAlpha *= fade;
  context.translate(x, y);

  // The glow that says "click me", and the shadow that puts it on the ground.
  const pulse = 0.5 + 0.5 * Math.sin(age * 3);
  const halo = context.createRadialGradient(0, -h * 0.5, 0, 0, -h * 0.5, w * 1.2);
  halo.addColorStop(0, `rgba(255, 220, 120, ${0.35 + 0.25 * pulse + open * 0.4})`);
  halo.addColorStop(1, 'rgba(255, 220, 120, 0)');
  context.fillStyle = halo;
  context.beginPath();
  context.arc(0, -h * 0.5, w * 1.2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(20, 10, 4, 0.28)';
  context.beginPath();
  context.ellipse(0, 1, w * 0.6, w * 0.14, 0, 0, Math.PI * 2);
  context.fill();

  context.lineWidth = 1.6;
  context.strokeStyle = Ink;
  context.lineJoin = 'round';
  // The box.
  context.fillStyle = boss ? GoldDark : Wood;
  context.beginPath();
  context.roundRect(-w / 2, -h, w, h, 3);
  context.fill();
  context.stroke();
  context.fillStyle = boss ? Gold : WoodDark;
  for (const bx of [-w * 0.32, w * 0.32]) {
    context.beginPath();
    context.rect(bx - w * 0.06, -h, w * 0.12, h);
    context.fill();
    context.stroke();
  }
  // Inside, lit, once the lid is up.
  if (open > 0) {
    context.fillStyle = `rgba(255, 236, 160, ${open})`;
    context.beginPath();
    context.ellipse(0, -h, w * 0.42, h * 0.18, 0, 0, Math.PI * 2);
    context.fill();
  }
  // The lid, hinged at the back and swinging up and over.
  context.save();
  context.translate(0, -h);
  context.scale(1, 1 - open * 1.6);
  context.fillStyle = boss ? Gold : Wood;
  context.beginPath();
  context.moveTo(-w / 2, 0);
  context.lineTo(-w / 2, -h * 0.32);
  context.quadraticCurveTo(0, -h * 0.72, w / 2, -h * 0.32);
  context.lineTo(w / 2, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
  // The lock.
  if (open === 0) {
    context.fillStyle = Gold;
    context.beginPath();
    context.roundRect(-w * 0.09, -h * 0.72, w * 0.18, h * 0.3, 2);
    context.fill();
    context.stroke();
    // A glint that runs across it now and then.
    const glint = (age * 0.7) % 2.4;
    if (glint < 0.4) {
      context.fillStyle = `rgba(255, 255, 255, ${1 - glint / 0.4})`;
      context.beginPath();
      context.arc(-w * 0.3 + glint * w * 1.5, -h * 0.85, 1.6, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

/**
 * The coins and the amount, coming out of an opened chest. Drawn over everything standing, since
 * they are in the air.
 */
export function drawChestBurst(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  boss: boolean,
  opened: number,
  worth: number,
  seed: number,
): void {
  if (opened < 0 || opened > OpenSeconds) return;
  const h = chestSize(boss) * 0.62;
  context.save();
  const life = opened / OpenSeconds;
  // Coins, thrown up and out on fixed arcs so they do not jitter between frames.
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + ((i / 9) - 0.5) * 1.8 + Math.sin(seed + i) * 0.15;
    const speed = 150 + ((seed * 7 + i * 13) % 60);
    const t = Math.min(opened, 0.9);
    const cx = x + Math.cos(angle) * speed * t;
    const cy = y - h + Math.sin(angle) * speed * t + 380 * t * t;
    context.globalAlpha = Math.max(0, 1 - life * 1.2);
    context.fillStyle = Gold;
    context.strokeStyle = GoldDark;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(cx, cy, 4, 4 * Math.abs(Math.cos(opened * 14 + i)) + 0.8, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  // How much it held, rising off it.
  context.globalAlpha = Math.min(1, (OpenSeconds - opened) / 0.4);
  context.font = '700 18px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const ty = y - h - 18 - opened * 34;
  const text = fill(words().bar.found, { silver: worth });
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(42, 22, 8, 0.85)';
  context.strokeText(text, x, ty);
  context.fillStyle = '#ffe08a';
  context.fillText(text, x, ty);
  context.restore();
}
