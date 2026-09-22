/**
 * The nine schools, running.
 *
 * One list of live effects and one timer per held school, rather than nine systems. What makes a
 * school itself is its motion plus its numbers; a combination sets a flag that bends one of those
 * behaviours, and an evolution overrides them. Written that way because fourteen combinations and
 * nine evolutions as twenty-three separate implementations is how a feature this size stops being
 * finishable — and because the flags are then the same shape as the design document, which is the
 * only reason anyone will be able to check one against the other later.
 *
 * ## What it does not own
 *
 * It never touches the 邪气 list. It asks a `Battlefield` what is nearby and tells it what died.
 * The trial owns the fight; this owns what the pet is doing about it. The one place that boundary
 * bends is 山岳, which has to be asked *before* damage is applied rather than after — so the shell
 * is a question the trial asks (`absorb`), not an effect that fires.
 */
import { clear } from '../slime/colour.js';
import {
  type Combo,
  type School,
  SPECS,
  cadence,
  comboFor,
  span,
} from './schools.js';

/** What the fight has to be able to answer. Implemented by `Trial`. */
export interface Battlefield {
  targets(): { x: number; y: number }[];
  /** Kills up to `most` within `radius` of a point, nearest first. Returns how many died. */
  cull(x: number, y: number, radius: number, most: number): number;
  /** The nearest 邪气 within `within`, or null. */
  closest(x: number, y: number, within: number): { x: number; y: number } | null;
}

/** A slowing region the trial reads back each frame. 冰魄 is the only thing that makes them. */
export interface Field {
  x: number;
  y: number;
  radius: number;
  /** Multiplier on closing speed inside. 0.5 is half pace. */
  factor: number;
}

interface Effect {
  school: School;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Heading, or orbit phase. */
  angle: number;
  age: number;
  life: number;
  reach: number;
  /** How many more it can kill before it is spent. */
  bite: number;
  /** Seconds until it can bite again, for the things that persist. */
  cool: number;
  /** For 雷法: the points the bolt passed through, so it can be drawn as one polyline. */
  path?: { x: number; y: number }[];
  /** For 影卫: which one it is, so three of them do not stack on the same pixel. */
  index?: number;
}

/** How long each motion's effect lives, in seconds. */
const LIFE: Record<string, number> = {
  aimed: 1.4,
  sweep: 0.2,
  chain: 0.26,
  zone: 3.2,
  field: 0,
  orbit: 0,
  shell: 0,
  trail: 2.6,
  ward: 0,
};

/** How fast an aimed talisman flies. */
const AimedSpeed = 980;
/** Radians a 剑气 sweep covers at level one. A combination opens it to the full circle. */
const SweepArc = 1.9;
/** How fast 风刃 goes round, in radians a second. */
const OrbitRate = 3.1;
/** How fast an 影卫 moves, and how often it can kill. */
const WardSpeed = 190;
const WardCool = 0.55;
/** How close a thing has to be to count as touched by a persistent effect. */
const Touch = 22;

export class Attacks {
  private live: Effect[] = [];
  private timers = new Map<School, number>();
  /** 山岳: contacts the shell will still eat, and how long until it re-forms. */
  private shellLeft = 0;
  private shellBack = 0;
  /** Everything the current build holds, refreshed whenever the arsenal changes. */
  private held: { school: School; level: number; evolved: boolean }[] = [];
  private combos: Combo[] = [];

  reset(): void {
    this.arena = null;
    this.live = [];
    this.timers.clear();
    this.shellLeft = 0;
    this.shellBack = 0;
    this.held = [];
    this.combos = [];
  }

  /**
   * Tells it what is being carried.
   *
   * Pushed in rather than read out of an `Arsenal`, so this class can be driven straight from a
   * literal in the checks and in the probe harness without standing a draft up first.
   */
  carry(held: { school: School; level: number; evolved: boolean }[], combos: Combo[]): void {
    this.held = held;
    this.combos = combos;
    for (const h of held) if (!this.timers.has(h.school)) this.timers.set(h.school, 0.25);
  }

  private has(school: School): boolean {
    return this.held.some((h) => h.school === school);
  }

  private levelOf(school: School): number {
    return this.held.find((h) => h.school === school)?.level ?? 1;
  }

  private evolved(school: School): boolean {
    return this.held.find((h) => h.school === school)?.evolved ?? false;
  }

  /** True when both halves of a named pairing are held. */
  private paired(a: School, b: School): boolean {
    const combo = comboFor(a, b);
    return combo !== null && this.combos.includes(combo);
  }

  get busy(): boolean {
    return this.live.length > 0 || this.held.length > 0;
  }

  /** The slowing regions, for the trial to apply to its own units. */
  fields(): Field[] {
    if (!this.has('冰')) return [];
    const level = this.levelOf('冰');
    return [
      {
        x: this.bodyX,
        y: this.bodyY,
        radius: span('冰', level),
        // 玄冰狱 stops them outright; otherwise it is a wade rather than a wall.
        factor: this.evolved('冰') ? 0.12 : 0.55,
      },
    ];
  }

  /**
   * 山岳, asked before the body takes a hit.
   *
   * A question rather than an effect because the shell has to act *between* the contact and the
   * damage, and everything else in here acts after its own timer. Returns true when the shell ate
   * it — and bursts when the last one goes.
   *
   * Takes no argument, because the trial asks this in the middle of its own update and so cannot
   * be handing anything over at the time. The battlefield it bursts against is the one from the
   * last `update`, which is the same object every frame — and null on the very first, before
   * anything has arrived to burst at.
   */
  absorb(): boolean {
    const battlefield = this.arena;
    if (!battlefield || !this.has('土') || this.shellLeft <= 0) return false;
    this.shellLeft -= 1;
    if (this.shellLeft > 0) return true;

    const level = this.levelOf('土');
    const reach = span('土', level);
    battlefield.cull(this.bodyX, this.bodyY, reach, SPECS['土'].bite + level);
    this.push('土', 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.42, reach, 0);

    // 幽壤: two 影卫 come out of the ground where it broke.
    if (this.paired('土', '影')) {
      for (let i = 0; i < 2; i++) this.spawnWard(i + 7);
    }
    // 不动明山 never actually breaks — it bursts and is immediately whole again.
    if (this.evolved('土')) this.shellLeft = this.shellCapacity();
    else this.shellBack = this.paired('土', '冰') ? SPECS['土'].interval * 0.45 : SPECS['土'].interval;
    return true;
  }

  private shellCapacity(): number {
    return 1 + Math.floor(this.levelOf('土') / 2);
  }

  private arena: Battlefield | null = null;
  private bodyX = 0;
  private bodyY = 0;
  private lastDropX = 0;
  private lastDropY = 0;

  update(dt: number, body: { x: number; y: number }, battlefield: Battlefield): void {
    this.arena = battlefield;
    this.bodyX = body.x;
    this.bodyY = body.y;

    if (this.has('土')) {
      if (this.shellLeft <= 0) {
        this.shellBack -= dt;
        if (this.shellBack <= 0) this.shellLeft = this.shellCapacity();
      }
    }

    for (const h of this.held) {
      const period = h.evolved ? this.evolvedCadence(h.school) : cadence(h.school, h.level);
      let left = (this.timers.get(h.school) ?? period) - dt;
      // Clamped to one activation a frame: a cadence shorter than a frame would otherwise fire a
      // burst proportional to how badly the machine is struggling, which is backwards.
      if (left <= 0) {
        left = period;
        this.fire(h.school, battlefield);
      }
      this.timers.set(h.school, left);
    }

    this.step(dt, battlefield);
  }

  /** An evolution's cadence, where it changes one. */
  private evolvedCadence(school: School): number {
    const base = cadence(school, 5);
    if (school === '符') return 0.12;
    if (school === '雷') return base * 0.7;
    if (school === '影') return base;
    return base * 0.8;
  }

  /** One activation of one school. */
  private fire(school: School, battlefield: Battlefield): void {
    const level = this.levelOf(school);
    const reach = span(school, level);
    const spec = SPECS[school];

    if (school === '符') {
      // 阵符: the talismans stop flying and stand in a ring on the ground instead.
      if (this.paired('符', '土')) {
        const count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const radius = 108;
          this.push(
            '符',
            'ward-glyph',
            this.bodyX + Math.cos(angle) * radius,
            this.bodyY + Math.sin(angle) * radius,
            0,
            0,
            angle,
            1.4,
            26,
            1,
          );
        }
        return;
      }
      const shots = this.evolved('符') ? 2 : 1;
      const seen: { x: number; y: number }[] = [];
      for (let i = 0; i < shots; i++) {
        const mark = this.pickAway(battlefield, seen, reach);
        if (!mark) break;
        seen.push(mark);
        const away = Math.hypot(mark.x - this.bodyX, mark.y - this.bodyY) || 1;
        // 符剑: it circles for a moment first, then goes.
        const orbit = this.paired('符', '剑');
        this.push(
          '符',
          orbit ? 'aimed-orbit' : 'aimed',
          this.bodyX,
          this.bodyY,
          ((mark.x - this.bodyX) / away) * AimedSpeed,
          ((mark.y - this.bodyY) / away) * AimedSpeed,
          Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX),
          LIFE.aimed,
          Touch,
          1,
        );
      }
      return;
    }

    if (school === '剑') {
      const mark = battlefield.closest(this.bodyX, this.bodyY, reach * 3);
      const heading = mark
        ? Math.atan2(mark.y - this.bodyY, mark.x - this.bodyX)
        : Math.random() * Math.PI * 2;
      // 风剑 closes the sweep into a full circle; 万剑归宗 does too, and bites far harder.
      const full = this.paired('剑', '风') || this.evolved('剑');
      const arc = full ? Math.PI * 2 : SweepArc;
      const bite = this.evolved('剑') ? spec.bite * 4 : spec.bite + level;
      const wide = full ? reach * 1.25 : reach;
      this.push('剑', 'sweep', this.bodyX, this.bodyY, 0, 0, heading, LIFE.sweep, wide, bite);
      battlefield
        .targets()
        .filter((t) => {
          const away = Math.hypot(t.x - this.bodyX, t.y - this.bodyY);
          if (away > wide) return false;
          if (arc >= Math.PI * 2) return true;
          const to = Math.atan2(t.y - this.bodyY, t.x - this.bodyX);
          return Math.abs(wrap(to - heading)) <= arc / 2;
        })
        .slice(0, bite)
        .forEach((t) => battlefield.cull(t.x, t.y, Touch, 1));

      // 雷剑 leaves the arc behind as lightning.
      if (this.paired('剑', '雷')) {
        this.push('剑', 'sweep-arc', this.bodyX, this.bodyY, 0, 0, heading, 0.5, wide, 0);
      }
      return;
    }

    if (school === '雷') {
      let mark = battlefield.closest(this.bodyX, this.bodyY, reach);
      if (!mark) return;
      const hops = this.evolved('雷') ? 8 : spec.bite + Math.floor(level / 2);
      const path = [{ x: this.bodyX, y: this.bodyY }];
      for (let i = 0; i < hops && mark; i++) {
        path.push({ x: mark.x, y: mark.y });
        battlefield.cull(mark.x, mark.y, Touch, 1);
        mark = battlefield.closest(mark.x, mark.y, reach * 0.55);
      }
      const bolt = this.push('雷', 'chain', this.bodyX, this.bodyY, 0, 0, 0, LIFE.chain, reach, 0);
      bolt.path = path;
      return;
    }

    if (school === '火') {
      // 焚天炉 burns under the pet and goes where it goes; otherwise it is dropped on something.
      const at = this.evolved('火')
        ? { x: this.bodyX, y: this.bodyY }
        : (battlefield.closest(this.bodyX, this.bodyY, reach * 5) ?? {
            x: this.bodyX,
            y: this.bodyY,
          });
      this.push('火', 'zone', at.x, at.y, 0, 0, 0, LIFE.zone, reach, spec.bite + level);
      return;
    }

    if (school === '冰') {
      // The field itself is reported through `fields()`; this is the bite that comes with it.
      battlefield.cull(this.bodyX, this.bodyY, reach, spec.bite + Math.floor(level / 2));
      this.push('冰', 'pulse', this.bodyX, this.bodyY, 0, 0, 0, 0.36, reach, 0);
      return;
    }

    if (school === '风') {
      // Blades are persistent, so this only tops them up to the number the level allows.
      const want = (this.evolved('风') ? 3 : 1) * (1 + Math.floor(level / 2));
      const have = this.live.filter((e) => e.school === '风' && e.kind === 'orbit').length;
      for (let i = have; i < want; i++) {
        const blade = this.push(
          '风',
          'orbit',
          this.bodyX,
          this.bodyY,
          0,
          0,
          (i / want) * Math.PI * 2,
          0,
          reach,
          1,
        );
        blade.index = i;
      }
      return;
    }

    if (school === '土') return; // the shell is `absorb`, not a timer

    if (school === '毒') {
      const moved = Math.hypot(this.bodyX - this.lastDropX, this.bodyY - this.lastDropY);
      // Only where you have actually been. A trail that pools while you stand still is a field,
      // and 冰魄 is already the field.
      if (moved < 14) return;
      this.lastDropX = this.bodyX;
      this.lastDropY = this.bodyY;
      const wide = this.paired('毒', '风') ? reach * 1.7 : reach;
      const burning = this.paired('毒', '火');
      const puff = this.push(
        '毒',
        burning ? 'trail-fire' : 'trail',
        this.bodyX,
        this.bodyY,
        0,
        0,
        Math.random() * Math.PI * 2,
        LIFE.trail,
        wide,
        burning ? 2 : 1,
      );
      // 风毒 drifts; 万毒蛊 follows.
      if (this.paired('毒', '风')) {
        puff.vx = (Math.random() - 0.5) * 34;
        puff.vy = (Math.random() - 0.5) * 34;
      }
      return;
    }

    if (school === '影') {
      const want = this.evolved('影') ? 3 : 1 + Math.floor(level / 3);
      const have = this.live.filter((e) => e.school === '影' && e.kind === 'ward').length;
      for (let i = have; i < want; i++) this.spawnWard(i);
      return;
    }
  }

  private spawnWard(index: number): void {
    const ward = this.push(
      '影',
      'ward',
      this.bodyX + Math.cos(index * 2.1) * 40,
      this.bodyY + Math.sin(index * 2.1) * 40,
      0,
      0,
      0,
      0,
      span('影', this.levelOf('影')),
      1,
    );
    ward.index = index;
  }

  /** The nearest thing that is not already in `seen`. Keeps two talismans off one target. */
  private pickAway(
    battlefield: Battlefield,
    seen: { x: number; y: number }[],
    within: number,
  ): { x: number; y: number } | null {
    const all = battlefield.targets();
    let best: { x: number; y: number } | null = null;
    let closest = within;
    for (const t of all) {
      if (seen.some((s) => Math.hypot(s.x - t.x, s.y - t.y) < 1)) continue;
      const away = Math.hypot(t.x - this.bodyX, t.y - this.bodyY);
      if (away <= closest) {
        closest = away;
        best = t;
      }
    }
    return best;
  }

  private push(
    school: School,
    kind: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    angle: number,
    life: number,
    reach: number,
    bite: number,
  ): Effect {
    const effect: Effect = { school, kind, x, y, vx, vy, angle, age: 0, life, reach, bite, cool: 0 };
    this.live.push(effect);
    return effect;
  }

  /** Moves everything that is still alive, and lets the persistent things bite. */
  private step(dt: number, battlefield: Battlefield): void {
    const alive: Effect[] = [];
    for (const e of this.live) {
      e.age += dt;
      e.cool = Math.max(0, e.cool - dt);

      if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
        // 符剑 holds it in a circle for a third of a second before letting it go.
        if (e.kind === 'aimed-orbit' && e.age < 0.34) {
          const turn = e.age * 9;
          e.x = this.bodyX + Math.cos(e.angle + turn) * 46;
          e.y = this.bodyY + Math.sin(e.angle + turn) * 46;
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        }
        if (battlefield.cull(e.x, e.y, e.reach, 1) > 0) {
          // 雷符: where a talisman lands, one more jumps to whatever is nearest.
          if (this.paired('符', '雷')) {
            const next = battlefield.closest(e.x, e.y, 150);
            if (next) {
              battlefield.cull(next.x, next.y, Touch, 1);
              const fork = this.push('符', 'chain', e.x, e.y, 0, 0, 0, 0.2, 150, 0);
              fork.path = [
                { x: e.x, y: e.y },
                { x: next.x, y: next.y },
              ];
            }
          }
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.26, 24, 0);
          continue;
        }
      } else if (e.kind === 'orbit') {
        const want = this.live.filter((x) => x.school === '风' && x.kind === 'orbit').length;
        // 罡风阵 turns its rings against each other, which is the whole reason it reads as three.
        const way = this.evolved('风') && (e.index ?? 0) % 2 === 1 ? -1 : 1;
        e.angle += OrbitRate * dt * way;
        const ring = e.reach * (1 + 0.22 * Math.floor((e.index ?? 0) / Math.max(1, want / 3)));
        e.x = this.bodyX + Math.cos(e.angle) * ring;
        e.y = this.bodyY + Math.sin(e.angle) * ring;
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 6, 1) > 0) e.cool = 0.18;
        // 风雪: the blades leave frost behind them, and the frost bites too.
        if (this.paired('风', '冰') && Math.random() < dt * 9) {
          this.push('风', 'frost', e.x, e.y, 0, 0, 0, 0.7, 20, 1);
        }
      } else if (e.kind === 'zone' || e.kind === 'frost' || e.kind === 'trail' || e.kind === 'trail-fire') {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        // 万毒蛊: the cloud goes after them.
        if (e.school === '毒' && this.evolved('毒')) {
          const mark = battlefield.closest(e.x, e.y, 260);
          if (mark) {
            const away = Math.hypot(mark.x - e.x, mark.y - e.y) || 1;
            e.vx += ((mark.x - e.x) / away) * 90 * dt;
            e.vy += ((mark.y - e.y) / away) * 90 * dt;
          }
        }
        if (e.cool <= 0 && e.bite > 0) {
          const killed = battlefield.cull(e.x, e.y, e.reach, 1);
          if (killed > 0) {
            e.bite -= killed;
            e.cool = 0.3;
            // 雷火: the ground fire reaches out for a neighbour every time it catches something.
            if (e.school === '火' && this.paired('火', '雷')) {
              const next = battlefield.closest(e.x, e.y, 170);
              if (next) {
                battlefield.cull(next.x, next.y, Touch, 1);
                const arc = this.push('火', 'chain', e.x, e.y, 0, 0, 0, 0.2, 170, 0);
                arc.path = [
                  { x: e.x, y: e.y },
                  { x: next.x, y: next.y },
                ];
              }
            }
            // 冰火: anything that dies burning inside the cold field goes off.
            if (e.school === '火' && this.paired('火', '冰')) {
              const inside = Math.hypot(e.x - this.bodyX, e.y - this.bodyY) < span('冰', this.levelOf('冰'));
              if (inside) {
                battlefield.cull(e.x, e.y, 72, 2);
                this.push('火', 'burst', e.x, e.y, 0, 0, 0, 0.36, 72, 0);
              }
            }
            // 焚瘴: a cloud that catches fire takes the rest of the cloud with it.
            if (e.kind === 'trail-fire') {
              for (const other of this.live) {
                if (other.kind === 'trail-fire' && other !== e && other.cool <= 0) {
                  if (Math.hypot(other.x - e.x, other.y - e.y) < e.reach * 2.4) other.cool = 0.06;
                }
              }
            }
          }
        }
      } else if (e.kind === 'ward') {
        const mark = battlefield.closest(e.x, e.y, 900);
        const goal = mark ?? { x: this.bodyX, y: this.bodyY };
        const away = Math.hypot(goal.x - e.x, goal.y - e.y) || 1;
        e.x += ((goal.x - e.x) / away) * WardSpeed * dt;
        e.y += ((goal.y - e.y) / away) * WardSpeed * dt;
        e.angle = Math.atan2(goal.y - e.y, goal.x - e.x);
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 8, 1) > 0) {
          e.cool = WardCool;
          // 影毒: everything it touches is left poisoned.
          if (this.paired('影', '毒')) {
            this.push('影', 'trail', e.x, e.y, 0, 0, 0, 1.4, 34, 1);
          }
        }
        // 傀符: it throws talismans as well.
        if (this.paired('影', '符') && mark && e.cool <= 0 && Math.random() < dt * 1.2) {
          const to = Math.hypot(mark.x - e.x, mark.y - e.y) || 1;
          this.push(
            '符',
            'aimed',
            e.x,
            e.y,
            ((mark.x - e.x) / to) * AimedSpeed,
            ((mark.y - e.y) / to) * AimedSpeed,
            e.angle,
            LIFE.aimed,
            Touch,
            1,
          );
        }
      } else if (e.kind === 'ward-glyph') {
        // 阵符: a standing ring. It bites what walks into it and then that post is spent.
        if (e.bite > 0 && battlefield.cull(e.x, e.y, e.reach, 1) > 0) e.bite -= 1;
      }

      const expired = e.life > 0 && e.age >= e.life;
      const spent = e.bite <= 0 && (e.kind === 'ward-glyph' || e.kind === 'zone');
      if (!expired && !spent) alive.push(e);
    }
    this.live = alive;
  }

  bounds(): { x: number; y: number; width: number; height: number } | null {
    if (this.live.length === 0 && !this.has('冰') && !this.has('土')) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const take = (x: number, y: number, r: number) => {
      left = Math.min(left, x - r);
      top = Math.min(top, y - r);
      right = Math.max(right, x + r);
      bottom = Math.max(bottom, y + r);
    };
    for (const e of this.live) {
      take(e.x, e.y, Math.max(e.reach, 30));
      if (e.path) for (const p of e.path) take(p.x, p.y, 24);
    }
    if (this.has('冰')) take(this.bodyX, this.bodyY, span('冰', this.levelOf('冰')) + 8);
    if (this.has('土') && this.shellLeft > 0) take(this.bodyX, this.bodyY, 76);
    if (left === Infinity) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * Everything the pet is doing, drawn.
   *
   * Every stroke goes down twice — a dark wide rim under a pale narrow core — for the same reason
   * it does everywhere else in this app: it is drawn over a desktop nobody has described to it, and
   * a single pale line vanishes on a pale wallpaper.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // The cold field first, because everything else happens inside it.
    if (this.has('冰')) {
      const r = span('冰', this.levelOf('冰'));
      const ring = context.createRadialGradient(this.bodyX, this.bodyY, r * 0.55, this.bodyX, this.bodyY, r);
      ring.addColorStop(0, clear(SPECS['冰'].tint));
      ring.addColorStop(0.82, 'rgba(185, 242, 255, 0.16)');
      ring.addColorStop(1, clear(SPECS['冰'].tint));
      context.fillStyle = ring;
      context.beginPath();
      context.arc(this.bodyX, this.bodyY, r, 0, Math.PI * 2);
      context.fill();
      this.twice(context, SPECS['冰'].tint, 3.4, 1.4, () => {
        context.beginPath();
        context.arc(this.bodyX, this.bodyY, r, 0, Math.PI * 2);
      });
    }

    for (const e of this.live) this.drawOne(context, e);

    // The shell last, so it sits on top of the body it is protecting.
    if (this.has('土') && this.shellLeft > 0) {
      const tint = SPECS['土'].tint;
      for (let i = 0; i < this.shellLeft; i++) {
        this.twice(context, tint, 5, 2.2, () => {
          context.beginPath();
          context.arc(this.bodyX, this.bodyY, 58 + i * 9, 0, Math.PI * 2);
        });
      }
    }
    context.restore();
  }

  /** Strokes the same path twice: a dark rim, then a pale core inside it. */
  private twice(
    context: CanvasRenderingContext2D,
    tint: string,
    rim: number,
    core: number,
    path: () => void,
    alpha = 1,
  ): void {
    context.globalAlpha = alpha * 0.5;
    context.strokeStyle = 'rgba(18, 24, 38, 0.75)';
    context.lineWidth = rim;
    path();
    context.stroke();
    context.globalAlpha = alpha;
    context.strokeStyle = tint;
    context.lineWidth = core;
    path();
    context.stroke();
    context.globalAlpha = 1;
  }

  private drawOne(context: CanvasRenderingContext2D, e: Effect): void {
    const tint = SPECS[e.school].tint;
    const fade = e.life > 0 ? Math.max(0, 1 - e.age / e.life) : 1;

    if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);
      context.globalAlpha = 0.5;
      context.fillStyle = 'rgba(18, 24, 38, 0.6)';
      context.fillRect(-11, -6, 22, 12);
      context.globalAlpha = 1;
      context.fillStyle = tint;
      context.fillRect(-9, -4.5, 18, 9);
      context.restore();
      return;
    }

    if (e.kind === 'pop' || e.kind === 'burst') {
      const r = e.reach * (0.4 + 0.6 * (e.age / Math.max(0.01, e.life)));
      const glow = context.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      glow.addColorStop(0, tint);
      glow.addColorStop(1, clear(tint));
      context.globalAlpha = fade * 0.8;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(e.x, e.y, r, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'sweep' || e.kind === 'sweep-arc') {
      const full = e.reach;
      const arc = SweepArc;
      this.twice(
        context,
        tint,
        e.kind === 'sweep-arc' ? 7 : 9,
        e.kind === 'sweep-arc' ? 2 : 3.4,
        () => {
          context.beginPath();
          context.arc(e.x, e.y, full * (0.72 + 0.28 * (e.age / Math.max(0.01, e.life))), e.angle - arc / 2, e.angle + arc / 2);
        },
        fade,
      );
      return;
    }

    if (e.kind === 'chain') {
      const path = e.path;
      if (!path || path.length < 2) return;
      this.twice(
        context,
        tint,
        6,
        2.2,
        () => {
          context.beginPath();
          context.moveTo(path[0].x, path[0].y);
          for (let i = 1; i < path.length; i++) {
            // A kink at the midpoint, so it reads as a bolt rather than a ruler.
            const mx = (path[i - 1].x + path[i].x) / 2;
            const my = (path[i - 1].y + path[i].y) / 2;
            const nx = -(path[i].y - path[i - 1].y);
            const ny = path[i].x - path[i - 1].x;
            const len = Math.hypot(nx, ny) || 1;
            context.lineTo(mx + (nx / len) * 11, my + (ny / len) * 11);
            context.lineTo(path[i].x, path[i].y);
          }
        },
        fade,
      );
      return;
    }

    if (e.kind === 'zone' || e.kind === 'trail' || e.kind === 'trail-fire' || e.kind === 'frost') {
      const r = e.reach * (e.kind === 'zone' ? 0.6 + 0.4 * Math.min(1, e.age * 3) : 1);
      const glow = context.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      glow.addColorStop(0, tint);
      glow.addColorStop(1, clear(tint));
      context.globalAlpha = fade * (e.kind === 'zone' || e.kind === 'trail-fire' ? 0.62 : 0.4);
      context.fillStyle = glow;
      context.beginPath();
      context.arc(e.x, e.y, r, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      this.twice(context, tint, 6, 2.4, () => {
        context.beginPath();
        context.moveTo(0, -13);
        context.quadraticCurveTo(7, 0, 0, 13);
      });
      context.restore();
      return;
    }

    if (e.kind === 'ward') {
      context.save();
      context.translate(e.x, e.y);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, 22);
      glow.addColorStop(0, tint);
      glow.addColorStop(1, clear(tint));
      context.globalAlpha = 0.55;
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, 22, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      // A small one, the same shape as the thing that made it.
      context.fillStyle = 'rgba(18, 24, 38, 0.55)';
      context.beginPath();
      context.arc(0, 0, 12.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = tint;
      context.beginPath();
      context.arc(0, 0, 10, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }

    if (e.kind === 'ward-glyph') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      context.globalAlpha = fade;
      context.fillStyle = 'rgba(18, 24, 38, 0.6)';
      context.fillRect(-9, -12, 18, 24);
      context.fillStyle = tint;
      context.fillRect(-7, -10, 14, 20);
      context.globalAlpha = 1;
      context.restore();
    }
  }
}

/** Wraps an angle into (−π, π]. */
function wrap(angle: number): number {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}
