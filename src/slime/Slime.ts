import { Blob } from './Blob';

export type Mood =
  | 'idle'
  | 'happy'
  | 'sleepy'
  | 'asleep'
  | 'surprised'
  | 'alert'
  | 'dragged';

export interface Env {
  width: number;
  height: number;
  /** Cursor in canvas CSS pixels, or null when it is off this monitor. */
  cursor: { x: number; y: number } | null;
}

const GRAVITY = 2100;
const GROUND_MARGIN = 12;
const RESTITUTION = 0.42;
const HOP_SPEED = 780;
const WALK_SPEED = 130;
const SLEEPY_AFTER = 75;
const ASLEEP_AFTER = 95;

/** Body palette per mood. Colour is reserved for state — it is the one thing that must read instantly. */
const PALETTE: Record<string, { core: string; edge: string; rim: string }> = {
  calm: { core: '#8ff0d4', edge: '#33c6a6', rim: '#1d9c85' },
  alert: { core: '#ffd48a', edge: '#f59b2c', rim: '#c9761a' },
  sleep: { core: '#b9d8ee', edge: '#6fa8cd', rim: '#4d86ab' },
};

export class Slime {
  x: number;
  y: number;
  vx = 0;
  vy = 0;

  mood: Mood = 'idle';
  readonly blob: Blob;

  /** Set while an alert is live; the caller supplies the words, the slime supplies the performance. */
  alertText: string | null = null;
  alertAction: (() => void) | null = null;

  private readonly points: Float32Array;
  private readonly radius: number;

  private blinkAt = 2;
  private blinkPhase = 0;
  private look = { x: 0, y: 0 };
  private lookTargetJitter = { x: 0, y: 0 };
  private clock = 0;
  private lastInteraction = 0;
  private nextDecisionAt = 3;
  private hopsLeft = 0;
  private facing = 1;
  private grabbed = false;
  private grabOffset = { x: 0, y: 0 };
  private trail = { x: 0, y: 0 };
  private moodUntil = 0;
  private nextAlertBounceAt = 0;

  constructor(x: number, y: number, radius = 46) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.blob = new Blob(radius);
    this.points = new Float32Array(this.blob.count * 2);
  }

  get groundY(): number {
    return this.groundFor(this.envHeight);
  }

  private envHeight = 800;

  private groundFor(height: number): number {
    return height - GROUND_MARGIN - this.radius;
  }

  hitTest(px: number, py: number): boolean {
    const scale = this.blob.squashScale;
    const dx = (px - this.x) / (this.radius * scale.x);
    const dy = (py - this.y) / (this.radius * scale.y);
    // Slightly generous, so grabbing it does not require pixel precision on a wobbling target.
    return dx * dx + dy * dy < 1.35;
  }

  grab(px: number, py: number): void {
    this.grabbed = true;
    this.mood = 'dragged';
    this.grabOffset = { x: this.x - px, y: this.y - py };
    this.lastInteraction = this.clock;
    this.blob.pulse(-60);
    this.hopsLeft = 0;
  }

  dragTo(px: number, py: number): void {
    if (!this.grabbed) return;
    const nextX = px + this.grabOffset.x;
    const nextY = py + this.grabOffset.y;
    // Velocity is inferred from the drag so a release throws with the motion the hand had.
    this.vx = (nextX - this.x) * 12;
    this.vy = (nextY - this.y) * 12;
    this.x = nextX;
    this.y = nextY;
  }

  release(): void {
    if (!this.grabbed) return;
    this.grabbed = false;
    this.mood = 'surprised';
    this.moodUntil = this.clock + 0.7;
    this.vx = Math.max(-900, Math.min(900, this.vx));
    this.vy = Math.max(-1200, Math.min(1200, this.vy));
  }

  /** A click that was not a drag: the slime reacts and says so. */
  poke(px: number, py: number): void {
    this.lastInteraction = this.clock;
    if (this.alertText && this.alertAction) {
      this.alertAction();
      return;
    }
    if (this.mood === 'asleep' || this.mood === 'sleepy') {
      this.mood = 'surprised';
      this.moodUntil = this.clock + 1.2;
      this.blob.pulse(90);
      this.vy = -320;
      return;
    }
    const angle = Math.atan2(py - this.y, px - this.x);
    this.blob.poke(angle, -260, 1.4);
    this.blob.squash(0.22);
    this.mood = 'happy';
    this.moodUntil = this.clock + 1.4;
  }

  /** Starts the meeting performance. Persists until dismissed — this is the one thing it must not drop. */
  raiseAlert(text: string, action: () => void): void {
    this.alertText = text;
    this.alertAction = action;
    this.mood = 'alert';
    this.moodUntil = Infinity;
    this.hopsLeft = 0;
    // Positive pulse drives every ring point outward, so the body swells before the first hop.
    // A negative one would shrink it first, which reads as flinching rather than as alarm.
    this.blob.pulse(150);
    this.vy = -HOP_SPEED * 0.8;
    this.nextAlertBounceAt = this.clock + 0.9;
  }

  clearAlert(): void {
    this.alertText = null;
    this.alertAction = null;
    this.mood = 'happy';
    this.moodUntil = this.clock + 1.5;
  }

  update(dt: number, env: Env): void {
    this.clock += dt;
    this.envHeight = env.height;
    const ground = this.groundFor(env.height);

    if (this.grabbed) {
      this.trail.x += (this.vx - this.trail.x) * Math.min(1, dt * 8);
      this.trail.y += (this.vy - this.trail.y) * Math.min(1, dt * 8);
    } else {
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.trail.x += (this.vx - this.trail.x) * Math.min(1, dt * 6);
      this.trail.y += (this.vy - this.trail.y) * Math.min(1, dt * 6);

      // Walls. Bouncing off the screen edge rather than clamping keeps a hard throw playful instead
      // of ending with the slime stuck to the border.
      const minX = this.radius * 0.6;
      const maxX = env.width - this.radius * 0.6;
      if (this.x < minX) {
        this.x = minX;
        this.vx = Math.abs(this.vx) * RESTITUTION;
        this.onImpact(Math.PI, Math.abs(this.vx));
      } else if (this.x > maxX) {
        this.x = maxX;
        this.vx = -Math.abs(this.vx) * RESTITUTION;
        this.onImpact(0, Math.abs(this.vx));
      }

      if (this.y >= ground) {
        const impact = this.vy;
        this.y = ground;
        if (impact > 140) {
          this.vy = -impact * RESTITUTION;
          this.onImpact(Math.PI / 2, impact);
        } else {
          this.vy = 0;
          // Ground friction, so it comes to rest instead of sliding forever.
          this.vx *= Math.pow(0.02, dt);
          if (Math.abs(this.vx) < 4) this.vx = 0;
        }
      }
    }

    this.updateMood(dt, env, ground);
    this.updateFace(dt, env);
    this.blob.update(dt);
  }

  private onImpact(angle: number, strength: number): void {
    const normalised = Math.min(1, strength / 1400);
    this.blob.poke(angle, -420 * normalised, 1.5);
    this.blob.squash(0.5 * normalised);
  }

  private updateMood(dt: number, env: Env, ground: number): void {
    void dt;
    const idleFor = this.clock - this.lastInteraction;

    if (this.grabbed) return;

    // Keyed off the live alert rather than the current mood, so picking the slime up mid-reminder
    // interrupts the performance instead of cancelling it. The mood does change while it is held
    // and for the startle right after, and without this the reminder would never come back.
    if (this.alertText) {
      this.mood = 'alert';
      // Bounce on a beat rather than continuously: a steady pulse reads as insistent, whereas
      // constant motion just reads as noise you learn to ignore.
      if (this.clock >= this.nextAlertBounceAt && this.y >= ground - 1) {
        this.vy = -HOP_SPEED * 0.72;
        this.blob.squash(-0.18);
        this.nextAlertBounceAt = this.clock + 0.85;
      }
      return;
    }

    if (this.moodUntil > this.clock) return;

    if (env.cursor && this.hitTest(env.cursor.x, env.cursor.y)) {
      this.lastInteraction = this.clock;
    }

    if (idleFor > ASLEEP_AFTER) {
      if (this.mood !== 'asleep') {
        this.mood = 'asleep';
        this.blob.squash(0.14);
      }
      return;
    }
    if (idleFor > SLEEPY_AFTER) {
      this.mood = 'sleepy';
      return;
    }

    this.mood = 'idle';

    if (this.clock < this.nextDecisionAt) return;

    if (this.hopsLeft > 0 && this.y >= ground - 1) {
      this.hopsLeft -= 1;
      this.vy = -HOP_SPEED * (0.55 + Math.random() * 0.25);
      this.vx = this.facing * WALK_SPEED * (0.8 + Math.random() * 0.6);
      this.blob.squash(-0.2);
      this.nextDecisionAt = this.clock + 0.45 + Math.random() * 0.2;
      return;
    }

    // Pick something to do. Mostly nothing — a pet that fidgets constantly is exhausting to have
    // on screen, so stillness is the common case and movement is the exception.
    const roll = Math.random();
    if (roll < 0.45) {
      this.nextDecisionAt = this.clock + 2.5 + Math.random() * 5;
    } else if (roll < 0.62) {
      this.lookTargetJitter = {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 1.2,
      };
      this.nextDecisionAt = this.clock + 1.5 + Math.random() * 2.5;
    } else if (roll < 0.78) {
      this.blob.pulse(-24);
      this.nextDecisionAt = this.clock + 2 + Math.random() * 3;
    } else {
      const target = this.radius + Math.random() * (env.width - this.radius * 2);
      this.facing = target > this.x ? 1 : -1;
      this.hopsLeft = 1 + Math.floor(Math.random() * 3);
      this.nextDecisionAt = this.clock;
    }
  }

  private updateFace(dt: number, env: Env): void {
    // Eyes track the cursor, which is most of what makes it feel aware of you.
    let targetX = this.lookTargetJitter.x;
    let targetY = this.lookTargetJitter.y;
    if (env.cursor && this.mood !== 'asleep') {
      const dx = env.cursor.x - this.x;
      const dy = env.cursor.y - this.y;
      const distance = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, distance / 260);
      targetX = (dx / distance) * reach;
      targetY = (dy / distance) * reach;
    }
    const ease = Math.min(1, dt * 6);
    this.look.x += (targetX - this.look.x) * ease;
    this.look.y += (targetY - this.look.y) * ease;

    if (this.mood === 'asleep') {
      this.blinkPhase = 1;
      return;
    }
    this.blinkAt -= dt;
    if (this.blinkAt <= 0) {
      this.blinkPhase = 1;
      this.blinkAt = 2.2 + Math.random() * 4;
    }
    this.blinkPhase = Math.max(0, this.blinkPhase - dt * 7);
  }

  draw(context: CanvasRenderingContext2D): void {
    const ground = this.groundFor(this.envHeight);
    const airborne = Math.max(0, ground - this.y);
    const palette =
      this.mood === 'alert'
        ? PALETTE.alert
        : this.mood === 'asleep' || this.mood === 'sleepy'
          ? PALETTE.sleep
          : PALETTE.calm;

    // Contact shadow. It shrinks and fades with height, which is most of what sells the jump.
    const shadowScale = Math.max(0.35, 1 - airborne / 420);
    context.save();
    context.globalAlpha = 0.22 * shadowScale;
    context.fillStyle = '#0b2a24';
    context.beginPath();
    context.ellipse(
      this.x,
      ground + this.radius * 0.72,
      this.radius * 0.95 * shadowScale,
      this.radius * 0.24 * shadowScale,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();

    // Directional stretch while flying or being dragged.
    const speed = Math.hypot(this.trail.x, this.trail.y);
    const stretch = Math.min(0.32, speed / 3600);
    const stretchAngle = Math.atan2(this.trail.y, this.trail.x);
    this.blob.outline(this.points, stretchAngle, this.grabbed ? stretch * 1.6 : stretch);

    context.save();
    context.translate(this.x, this.y);

    Blob.trace(context, this.points, this.blob.count);

    const gradient = context.createRadialGradient(
      -this.radius * 0.3,
      -this.radius * 0.45,
      this.radius * 0.15,
      0,
      0,
      this.radius * 1.25,
    );
    gradient.addColorStop(0, palette.core);
    gradient.addColorStop(1, palette.edge);
    context.fillStyle = gradient;
    context.globalAlpha = 0.92;
    context.fill();

    context.globalAlpha = 1;
    context.lineWidth = 2;
    context.strokeStyle = palette.rim;
    context.stroke();

    // Specular blob, clipped to the body so it never leaks past a squashed silhouette.
    context.save();
    Blob.trace(context, this.points, this.blob.count);
    context.clip();
    context.globalAlpha = 0.55;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.ellipse(
      -this.radius * 0.32,
      -this.radius * 0.42,
      this.radius * 0.26,
      this.radius * 0.16,
      -0.5,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 0.18;
    context.beginPath();
    context.ellipse(
      this.radius * 0.3,
      this.radius * 0.3,
      this.radius * 0.34,
      this.radius * 0.2,
      0.4,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();

    this.drawFace(context);
    context.restore();

    if (this.mood === 'asleep') this.drawSleepMarks(context);
  }

  private drawFace(context: CanvasRenderingContext2D): void {
    const scale = this.blob.squashScale;
    const eyeGap = this.radius * 0.34;
    const eyeY = -this.radius * 0.08 * scale.y;
    const lookX = this.look.x * this.radius * 0.16;
    const lookY = this.look.y * this.radius * 0.12;
    const open = 1 - this.blinkPhase;

    context.fillStyle = '#12332e';
    context.strokeStyle = '#12332e';
    context.lineCap = 'round';

    const eyes: Array<[number, number]> = [
      [-eyeGap * scale.x + lookX, eyeY + lookY],
      [eyeGap * scale.x + lookX, eyeY + lookY],
    ];

    if (this.mood === 'asleep' || (this.mood === 'sleepy' && open < 0.5)) {
      context.lineWidth = 2.4;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        context.arc(ex, ey, this.radius * 0.12, 0.25 * Math.PI, 0.75 * Math.PI);
        context.stroke();
      }
    } else if (this.mood === 'happy') {
      context.lineWidth = 2.6;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        // Upturned arc: the whole "pleased" read comes from the eyes, not the mouth.
        context.arc(ex, ey + this.radius * 0.06, this.radius * 0.12, 1.15 * Math.PI, 1.85 * Math.PI);
        context.stroke();
      }
    } else {
      const wide = this.mood === 'surprised' || this.mood === 'alert' ? 1.35 : 1;
      for (const [ex, ey] of eyes) {
        context.beginPath();
        context.ellipse(
          ex,
          ey,
          this.radius * 0.105 * wide,
          this.radius * 0.13 * wide * Math.max(0.06, open),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        if (open > 0.6) {
          context.save();
          context.fillStyle = '#ffffff';
          context.globalAlpha = 0.9;
          context.beginPath();
          context.ellipse(
            ex - this.radius * 0.035,
            ey - this.radius * 0.05 * wide,
            this.radius * 0.032,
            this.radius * 0.038,
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
          context.restore();
        }
      }
    }

    const mouthY = this.radius * 0.26 * scale.y;
    context.lineWidth = 2.2;
    context.beginPath();
    if (this.mood === 'happy') {
      // A small ω, drawn as two arcs.
      const w = this.radius * 0.085;
      context.arc(lookX - w, mouthY, w, 0, Math.PI);
      context.arc(lookX + w, mouthY, w, 0, Math.PI);
      context.stroke();
    } else if (this.mood === 'surprised' || this.mood === 'alert') {
      context.ellipse(lookX, mouthY, this.radius * 0.075, this.radius * 0.1, 0, 0, Math.PI * 2);
      context.fill();
    } else if (this.mood === 'dragged') {
      context.ellipse(lookX, mouthY, this.radius * 0.11, this.radius * 0.07, 0, 0, Math.PI * 2);
      context.fill();
    } else if (this.mood === 'asleep' || this.mood === 'sleepy') {
      context.moveTo(lookX - this.radius * 0.07, mouthY);
      context.lineTo(lookX + this.radius * 0.07, mouthY);
      context.stroke();
    } else {
      context.arc(lookX, mouthY - this.radius * 0.04, this.radius * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
      context.stroke();
    }
  }

  private drawSleepMarks(context: CanvasRenderingContext2D): void {
    context.save();
    context.fillStyle = '#4d86ab';
    context.font = '600 14px system-ui, sans-serif';
    for (let i = 0; i < 3; i++) {
      // Each z rises and fades on its own offset phase, so they read as a drift rather than a blink.
      const phase = (this.clock / 2.6 + i * 0.33) % 1;
      context.globalAlpha = Math.sin(phase * Math.PI) * 0.85;
      const size = 10 + i * 3;
      context.font = `600 ${size}px system-ui, sans-serif`;
      context.fillText(
        'z',
        this.x + this.radius * 0.5 + phase * 22,
        this.y - this.radius * 0.7 - phase * 46,
      );
    }
    context.restore();
  }
}
