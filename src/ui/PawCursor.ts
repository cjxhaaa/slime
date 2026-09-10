export type PawPose = 'open' | 'grab';

/**
 * Sized against the OS cursors it stands in for — a Windows pointer is around 32 logical pixels —
 * and a little above that, because the paw's detail is in five separate pads and they stop reading
 * as pads if each one is only two pixels across.
 */
const PAW_SCALE = 1.55;

/** Toe layout at rest: offset from the hotspot, and radius. */
const TOES: Array<{ x: number; y: number; r: number }> = [
  { x: -8.6, y: 5.0, r: 3.3 },
  { x: -3.0, y: 1.6, r: 3.9 },
  { x: 2.9, y: 1.6, r: 3.9 },
  { x: 8.4, y: 5.2, r: 3.3 },
];

const OUTLINE = 'rgba(18, 40, 36, 0.9)';
const PAD_BLUSH = 'rgba(255, 150, 178, 0.85)';

/**
 * A cat paw drawn on the canvas, standing in for the OS cursor over the pet.
 *
 * An OS cursor cannot animate on click, and the press animation is the part that makes the
 * interaction legible: something that visibly closes tells you the press registered. A realistic
 * hand did that job but read as clip-art next to a soft round jelly, so this keeps the "you can
 * grab this" meaning — a paw is still a thing that takes hold of things — without the mismatch. A
 * purely abstract shape would have lost that meaning entirely.
 *
 * Hiding the real cursor is safe for the same reason the overlay is safe: `cursor: none` applies
 * only while the overlay accepts clicks, and it only accepts clicks while the frame loop is
 * actively renewing the click lease. Stop the loop by any means and the lease lapses, the window
 * goes click-through, and the OS cursor is back. The pointer cannot be lost by a bug in here.
 */
export class PawCursor {
  visible = false;
  pose: PawPose = 'open';

  private x = 0;
  private y = 0;
  /** 0 released, 1 fully pressed. Springs so a click reads as a squeeze rather than a cut. */
  private press = 0;
  private pressTarget = 0;
  private pressVelocity = 0;
  private ripples: Array<{ x: number; y: number; age: number }> = [];

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  setPressed(pressed: boolean): void {
    this.pressTarget = pressed ? 1 : 0;
  }

  /** A discrete tap worth acknowledging, at the point that was hit. */
  ping(x: number, y: number): void {
    this.ripples.push({ x, y, age: 0 });
    if (this.ripples.length > 4) this.ripples.shift();
  }

  update(dt: number): void {
    // Slightly underdamped, so the release overshoots open by a hair. That overshoot is the whole
    // difference between "the paw moved" and "the paw let go".
    const acceleration = 420 * (this.pressTarget - this.press) - 26 * this.pressVelocity;
    this.pressVelocity += acceleration * dt;
    this.press += this.pressVelocity * dt;

    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((ripple) => ripple.age < 0.45);
  }

  /** Bounding box in CSS pixels, for the dirty-rect renderer. */
  bounds(): { x: number; y: number; width: number; height: number } {
    const reach = 46;
    return { x: this.x - reach, y: this.y - reach, width: reach * 2, height: reach * 2 + 30 };
  }

  hasRipples(): boolean {
    return this.ripples.length > 0;
  }

  draw(context: CanvasRenderingContext2D): void {
    for (const ripple of this.ripples) {
      const progress = ripple.age / 0.45;
      context.save();
      context.globalAlpha = (1 - progress) * 0.5;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2.5 * (1 - progress) + 0.5;
      context.beginPath();
      context.arc(ripple.x, ripple.y, 6 + progress * 26, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    if (!this.visible) return;

    // Holding on adds a standing tuck on top of whatever the press spring is doing, so a drag looks
    // like a grip rather than like a paw that happens to be resting there.
    const squeeze = Math.max(0, Math.min(1.15, this.press + (this.pose === 'grab' ? 0.35 : 0)));
    const scale = PAW_SCALE * (1 - squeeze * 0.06);

    context.save();
    context.translate(this.x, this.y);
    context.scale(scale, scale);
    context.lineJoin = 'round';
    context.lineCap = 'round';

    const silhouette = this.shape(squeeze);

    // Outline by stroking underneath the fill: the paw is five overlapping rounded parts, and
    // stroking on top would draw every internal seam. Stroked first and then covered, only the
    // outer half of the stroke survives, which is exactly the silhouette.
    context.strokeStyle = OUTLINE;
    context.lineWidth = 3.2 / PAW_SCALE + 1.1;
    context.stroke(silhouette);
    context.fillStyle = '#ffffff';
    context.fill(silhouette);

    // Blush inset into each pad. Drawn after the white fill so it sits inside the silhouette, and
    // kept well clear of the outline so it never muddies the edge.
    context.fillStyle = PAD_BLUSH;
    const tuck = squeeze * 0.35;
    for (const toe of TOES) {
      context.beginPath();
      context.ellipse(
        toe.x * (1 - tuck),
        toe.y + squeeze * 2.4,
        toe.r * 0.58,
        toe.r * 0.58,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    const pad = this.padRect(squeeze);
    context.beginPath();
    context.ellipse(
      0,
      pad.y + pad.height / 2,
      pad.width * 0.33,
      pad.height * 0.34,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    context.restore();
  }

  /** The main pad, which flattens and spreads as the paw presses down. */
  private padRect(squeeze: number): { y: number; width: number; height: number } {
    const width = 19 * (1 + squeeze * 0.1);
    const height = 13 * (1 - squeeze * 0.16);
    return { y: 7 - squeeze * 1.2, width, height };
  }

  /**
   * The paw, with the hotspot at (0,0) just above the middle toes — the point the pointer is
   * actually at, which for a paw reads as the tip of the reach.
   */
  private shape(squeeze: number): Path2D {
    const path = new Path2D();
    // Toes draw inward and downward as the paw closes.
    const tuck = squeeze * 0.35;
    for (const toe of TOES) {
      const x = toe.x * (1 - tuck);
      const y = toe.y + squeeze * 2.4;
      path.moveTo(x + toe.r, y);
      path.arc(x, y, toe.r, 0, Math.PI * 2);
    }
    const pad = this.padRect(squeeze);
    path.roundRect(-pad.width / 2, pad.y, pad.width, pad.height, pad.height * 0.46);
    return path;
  }
}
