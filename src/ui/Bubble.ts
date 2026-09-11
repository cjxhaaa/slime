export interface BubbleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING_X = 14;
const PADDING_Y = 10;
const LINE_HEIGHT = 19;
const TAIL = 9;
const RADIUS = 12;
const MAX_WIDTH = 260;

/**
 * The speech bubble.
 *
 * Drawn on the canvas rather than as a DOM element so it shares one compositing pass with the body
 * and cannot lag a frame behind a bouncing slime — an offset bubble is the single most obvious way
 * for this kind of overlay to look broken.
 */
export class Bubble {
  private text = '';
  private lines: string[] = [];
  /**
   * Widest line in CSS pixels, or null until measured. Measuring needs a context with the font set
   * on it, and the text changes rarely — an alert countdown once a minute — while `layout` runs on
   * every frame the bubble is visible, so the measurement is kept until the text changes.
   */
  private textWidth: number | null = null;
  private appear = 0;
  visible = false;

  show(text: string): void {
    this.visible = true;
    if (text === this.text) return;
    this.text = text;
    this.lines = text.split('\n').slice(0, 3);
    this.textWidth = null;
  }

  hide(): void {
    this.visible = false;
  }

  update(dt: number): void {
    const target = this.visible ? 1 : 0;
    // Eased in, snapped out: an alert should feel like it arrived, not like it faded up.
    const rate = this.visible ? 9 : 14;
    this.appear += (target - this.appear) * Math.min(1, dt * rate);
  }

  get opacity(): number {
    return this.appear;
  }

  /**
   * Where the bubble will be drawn, given the anchor (the top of the slime). Returned so the caller
   * can hit-test it: the bubble is part of the alert's click target, not just decoration.
   */
  layout(
    context: CanvasRenderingContext2D,
    anchorX: number,
    anchorY: number,
    stageWidth: number,
  ): BubbleRect | null {
    if (this.appear < 0.01 || this.lines.length === 0) return null;
    if (this.textWidth === null) {
      context.save();
      context.font = FONT;
      let widest = 0;
      for (const line of this.lines) {
        widest = Math.max(widest, context.measureText(line).width);
      }
      context.restore();
      this.textWidth = widest;
    }
    const width = Math.min(MAX_WIDTH, this.textWidth) + PADDING_X * 2;
    const height = this.lines.length * LINE_HEIGHT + PADDING_Y * 2;

    // Keep it on screen: near an edge the bubble slides along rather than being clipped.
    const x = Math.max(8, Math.min(stageWidth - width - 8, anchorX - width / 2));
    const y = anchorY - height - TAIL;
    return { x, y, width, height };
  }

  draw(
    context: CanvasRenderingContext2D,
    rect: BubbleRect,
    anchorX: number,
    anchorY: number,
  ): void {
    const t = this.appear;
    context.save();
    context.globalAlpha = t;
    // Rises the last few pixels into place as it appears.
    context.translate(0, (1 - t) * 8);

    context.beginPath();
    roundedRect(context, rect.x, rect.y, rect.width, rect.height, RADIUS);
    // Tail, drawn as part of the same path so the fill and stroke stay continuous.
    const tailX = Math.max(rect.x + RADIUS + TAIL, Math.min(rect.x + rect.width - RADIUS - TAIL, anchorX));
    context.moveTo(tailX - TAIL, rect.y + rect.height);
    context.lineTo(tailX, anchorY - 1);
    context.lineTo(tailX + TAIL, rect.y + rect.height);
    context.closePath();

    context.fillStyle = 'rgba(255, 255, 255, 0.97)';
    context.shadowColor = 'rgba(12, 32, 28, 0.28)';
    context.shadowBlur = 14;
    context.shadowOffsetY = 3;
    context.fill();
    context.shadowColor = 'transparent';
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(20, 60, 52, 0.16)';
    context.stroke();

    context.fillStyle = '#12332e';
    context.font = FONT;
    context.textBaseline = 'middle';
    this.lines.forEach((line, index) => {
      context.fillText(
        line,
        rect.x + PADDING_X,
        rect.y + PADDING_Y + LINE_HEIGHT * index + LINE_HEIGHT / 2,
        MAX_WIDTH,
      );
    });
    context.restore();
  }
}

const FONT = '500 13px -apple-system, "Segoe UI", system-ui, sans-serif';

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
