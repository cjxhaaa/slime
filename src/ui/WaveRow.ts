/**
 * 波次点 — the row of ten at the top of the screen.
 *
 * This is what `Trial.through` became when it stopped being seconds over ninety. The old number was
 * a progress bar nobody could see; the new one is drawn, because a level that ends when its boss
 * falls needs you to know how far off the boss is.
 *
 * **No numbers.** §6.4 holds here as everywhere: not "wave 4/10", not the level. Ten dots, and the
 * three that bring something bigger are drawn bigger — the same rule the 邪气 themselves follow. The
 * level is said once, in the bubble at the end, which is the one place this mode already speaks.
 */
import type { Rect } from '../game/Trial.js';
import { BossWave, EliteWaves, WavesPerLevel } from '../game/Waves.js';
import { lacquerPlate } from './sect.js';

const Top = 16;
const Height = 30;
const Pitch = 22;
const Width = Pitch * WavesPerLevel + 20;

/** The radius each dot is drawn at. */
function radiusOf(wave: number): number {
  if (wave === BossWave) return 8;
  return EliteWaves.includes(wave) ? 6 : 4;
}

/**
 * Draws the row from `Trial.marks`: -1 for a wave that has not arrived, then how much of it is
 * gone. Cleared waves are solid, arrived ones fill as a ring, the rest are hollow.
 *
 * Several can be filling at once. The timetable does not wait for a wave to be finished, so wave
 * three can be half done when wave four arrives — and the dot that is still open is the honest
 * picture of what is still out there.
 */
export function drawWaveRow(context: CanvasRenderingContext2D, width: number, marks: number[]): void {
  const left = width / 2 - Width / 2;
  const y = Top + Height / 2;
  context.save();

  // On a strip of lacquer, like the bar: the overlay is transparent and pale dots on a pale
  // wallpaper are not there.
  lacquerPlate(context, { x: left, y: Top, width: Width, height: Height }, Height / 2, 0.88);

  for (let i = 0; i < WavesPerLevel; i++) {
    const x = left + 10 + Pitch * (i + 0.5);
    const r = radiusOf(i);
    const boss = i === BossWave;
    // Gold for the waves, cinnabar for the king's.
    const ink = boss ? '226, 96, 79' : '232, 207, 138';

    const mark = marks[i] ?? -1;
    if (mark >= 1) {
      context.fillStyle = `rgba(${ink}, 0.92)`;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    context.lineWidth = boss ? 2 : 1.5;
    context.strokeStyle = `rgba(${ink}, ${mark >= 0 ? 0.85 : 0.32})`;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.stroke();

    if (mark > 0) {
      // Filled as a pie from twelve o'clock, so it reads as a clock face filling rather than a dot
      // getting brighter — brightness is what the cleared ones already use.
      context.fillStyle = `rgba(${ink}, 0.7)`;
      context.beginPath();
      context.moveTo(x, y);
      context.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, mark));
      context.closePath();
      context.fill();
    }
  }
  context.restore();
}

/** What the row covers, so the dirty rect can include it. */
export function waveRowBounds(width: number): Rect {
  return { x: width / 2 - Width / 2, y: Top, width: Width, height: Height };
}
