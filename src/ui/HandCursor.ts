export type HandPose = 'point' | 'grab';

const HAND_SCALE = 1.4;

/**
 * A hand cursor drawn on the canvas, so that pressing it can be animated.
 *
 * The OS cursor would be the obvious choice for "show a hand over the pet" — `cursor: pointer` is
 * one line and has zero latency. It cannot animate on click, though, which is the part that makes
 * the interaction legible: a hand that visibly closes tells you the press registered. So the real
 * cursor is hidden over the pet and this is drawn instead.
 *
 * The safety of hiding the real cursor rests on the click lease: `cursor: none` only applies while
 * the overlay is accepting clicks, and it only accepts clicks while this loop is actively asking. If
 * anything stops the loop, the lease lapses, the window goes click-through, and the OS cursor is
 * back — the pointer cannot be lost by a bug in here.
 */
export class HandCursor {
  visible = false;
  pose: HandPose = 'point';

  private x = 0;
  private y = 0;
  /** 0 released, 1 fully pressed. Springs so a click reads as a squeeze rather than a cut. */
  private press = 0;
  private pressTarget = 0;
  private pressVelocity = 0;
  /** Expanding rings left behind by clicks. */
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
    // difference between "the hand moved" and "the hand let go".
    const acceleration = 420 * (this.pressTarget - this.press) - 26 * this.pressVelocity;
    this.pressVelocity += acceleration * dt;
    this.press += this.pressVelocity * dt;

    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((ripple) => ripple.age < 0.45);
  }

  /** Bounding box in CSS pixels, for the dirty-rect renderer. */
  bounds(): { x: number; y: number; width: number; height: number } {
    const reach = 46;
    return {
      x: this.x - reach,
      y: this.y - reach,
      width: reach * 2,
      height: reach * 2 + 30,
    };
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

    const squeeze = Math.max(0, Math.min(1.15, this.press));
    // Sized to sit alongside the OS cursors it stands in for: a Windows pointer is around 32
    // logical pixels tall, and a hand noticeably smaller than that reads as a stray graphic rather
    // than as the pointer.
    const scale = HAND_SCALE * (1 - squeeze * 0.1);
    context.save();
    context.translate(this.x, this.y);
    context.scale(scale, scale);

    const path = this.shape(squeeze);

    // Outline by stroking underneath the fill: the hand is assembled from overlapping rounded
    // parts, and stroking on top would draw every internal seam. Stroked first and then covered,
    // only the outer half of the stroke survives, which is exactly the silhouette.
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = 'rgba(18, 40, 36, 0.9)';
    context.lineWidth = 3.2 / HAND_SCALE + 1.1;
    context.stroke(path);

    context.fillStyle = '#ffffff';
    context.fill(path);

    context.restore();
  }

  /**
   * The hand, with the hotspot at (0,0) on the index fingertip.
   *
   * Pressing curls the index finger down into the fist and pulls the thumb in, which is a real
   * enough approximation of a tap that it reads instantly at cursor size.
   */
  private shape(squeeze: number): Path2D {
    const path = new Path2D();
    const fingerLength = 13 - squeeze * 7;
    const fingerWidth = 6.5;

    // Index finger.
    path.roundRect(-fingerWidth / 2, 0, fingerWidth, fingerLength + 6, fingerWidth / 2);
    // Fist.
    const fistTop = fingerLength + 2;
    path.roundRect(-fingerWidth / 2 - 1, fistTop, 15, 15 - squeeze * 1.5, 5);
    // Thumb, tucking in as the hand closes.
    const thumbOut = 5.5 - squeeze * 2.5;
    path.roundRect(-fingerWidth / 2 - thumbOut, fistTop + 3, thumbOut + 4, 6, 3);
    // Knuckles: two bumps that keep the closed pose from reading as a plain rectangle.
    path.roundRect(6, fistTop - 1.5 + squeeze * 1.5, 4.5, 6, 2.2);
    path.roundRect(9.5, fistTop + 1 + squeeze * 1.5, 4, 6, 2);

    return path;
  }
}
