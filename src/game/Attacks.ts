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
import { clear, mix } from '../slime/colour.js';
import {
  type Combo,
  PALETTE,
  type Palette,
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

/**
 * Grit.
 *
 * The dust is the benchmark for this whole layer and the reason is not the colour — it is that a
 * mote is **one of many small things with a direction drawn into it**. A streak along its own
 * velocity, brightest on the way in. Every school here now throws a handful of the same thing when
 * it connects, which is the cheapest impact feedback there is and the one that was missing
 * entirely: before this, something died and simply stopped being on the screen.
 */
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds left, and how many it started with, so the fade is a fraction. */
  life: number;
  born: number;
  size: number;
  hue: Palette;
}

/** How much of a spark's travel is drawn behind it, in seconds. Off velocity, never off the last
 * frame's position — a remembered position makes the streak three times as long on the 20Hz tier,
 * which is the one place nothing should change length. */
const SparkTail = 0.045;
/** Drag, so they slow into nothing rather than flying off the desktop. */
const SparkDrag = 3.4;
/**
 * The most that can exist at once.
 *
 * A 大乘 run kills a thousand things, and eight sparks each with nothing stopping them is eight
 * thousand line segments a frame. The cap is what keeps the worst case a fixed cost rather than
 * one proportional to how well the run is going.
 */
const MaxSparks = 170;

export class Attacks {
  private live: Effect[] = [];
  private sparks: Spark[] = [];
  /** Seconds since this arsenal started, for anything that wants to turn or waver. */
  private clock = 0;
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
    this.sparks = [];
    this.clock = 0;
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
    return this.live.length > 0 || this.sparks.length > 0 || this.held.length > 0;
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
    this.push('土', 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.5, reach, 0);
    // A shell breaking should throw pieces of itself. Eighteen, outward, fast.
    this.spark(this.bodyX, this.bodyY, 18, '土', 330);

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
    this.clock += dt;

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

    const burning: Spark[] = [];
    for (const spark of this.sparks) {
      spark.life -= dt;
      if (spark.life <= 0) continue;
      const slow = Math.max(0, 1 - SparkDrag * dt);
      spark.vx *= slow;
      spark.vy *= slow;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      burning.push(spark);
    }
    this.sparks = burning;
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
      // Thrown along the arc rather than out from the middle, so the sparks say which way it swept.
      for (let i = 0; i < 6; i++) {
        const along = heading + (full ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * arc);
        this.spark(
          this.bodyX + Math.cos(along) * wide * 0.9,
          this.bodyY + Math.sin(along) * wide * 0.9,
          2,
          '剑',
          230,
          along + Math.PI / 2,
          1.1,
        );
      }
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
      // Skip the first node: that one is the pet, and nothing was struck there.
      for (let i = 1; i < path.length; i++) {
        this.spark(path[i].x, path[i].y, 8, '雷', 250);
      }
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
      const bit = battlefield.cull(this.bodyX, this.bodyY, reach, spec.bite + Math.floor(level / 2));
      if (bit > 0) {
        // Only when it actually caught something. A field that flashes on a timer teaches nothing;
        // one that flashes when it bites is telling you what it just did.
        this.push('冰', 'burst', this.bodyX, this.bodyY, 0, 0, 0, 0.42, reach, 0);
        this.spark(this.bodyX, this.bodyY, 10, '冰', 210);
      }
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

  /**
   * Throws `count` sparks from a point.
   *
   * `aim` of null scatters them evenly; a heading sends them out in a cone, which is what a hit
   * wants — debris off a strike goes the way the strike was going.
   */
  private spark(
    x: number,
    y: number,
    count: number,
    school: School,
    speed: number,
    aim: number | null = null,
    cone = Math.PI * 2,
  ): void {
    const hue = PALETTE[school];
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= MaxSparks) return;
      const angle = aim === null ? Math.random() * Math.PI * 2 : aim + (Math.random() - 0.5) * cone;
      const rush = speed * (0.45 + Math.random() * 0.9);
      const life = 0.22 + Math.random() * 0.3;
      this.sparks.push({
        x,
        y,
        vx: Math.cos(angle) * rush,
        vy: Math.sin(angle) * rush,
        life,
        born: life,
        size: 1.1 + Math.random() * 1.5,
        hue,
      });
    }
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
          this.push('符', 'pop', e.x, e.y, 0, 0, 0, 0.26, 30, 0);
          this.spark(e.x, e.y, 7, '符', 190, Math.atan2(e.vy, e.vx), 2.1);
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
        if (e.cool <= 0 && battlefield.cull(e.x, e.y, Touch + 6, 1) > 0) {
          e.cool = 0.18;
          this.spark(e.x, e.y, 6, '风', 220, e.angle + Math.PI / 2 * way, 1.4);
        }
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
            this.spark(e.x, e.y, 5, e.school, 150);
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
          this.spark(e.x, e.y, 6, '影', 200, e.angle, 1.8);
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
    if (this.live.length === 0 && this.sparks.length === 0 && !this.has('冰') && !this.has('土')) {
      return null;
    }
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
      take(e.x, e.y, Math.max(e.reach, 40));
      if (e.path) for (const p of e.path) take(p.x, p.y, 30);
    }
    // Both ends of a spark's streak, not just the head, or the tail is left smeared on the desktop.
    for (const s of this.sparks) {
      take(s.x, s.y, s.size + 3);
      take(s.x - s.vx * SparkTail, s.y - s.vy * SparkTail, s.size + 3);
    }
    if (this.has('冰')) take(this.bodyX, this.bodyY, span('冰', this.levelOf('冰')) + 16);
    if (this.has('土') && this.shellLeft > 0) take(this.bodyX, this.bodyY, 96);
    if (left === Infinity) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /**
   * Everything the pet is doing, drawn.
   *
   * Two passes. The first is `source-over` and draws only the things that need to be *dark* —
   * outlines and backing plates, which exist so an effect has an edge on a cream wallpaper as well
   * as a navy one. The second is `lighter`, and everything else lives in it: additive, so
   * overlapping light climbs toward white instead of averaging out.
   *
   * Every lit thing follows the same recipe — **bloom, body, core** — out of the school's three-stop
   * palette. The version before this used one pastel per school at some alpha, which is chalk: no
   * hot centre, so it read as a coloured shape rather than as light.
   */
  draw(context: CanvasRenderingContext2D): void {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Structure first, while black still means something.
    for (const e of this.live) this.drawBacking(context, e);
    if (this.has('土') && this.shellLeft > 0) this.drawShellBacking(context);

    context.globalCompositeOperation = 'lighter';
    if (this.has('冰')) this.drawField(context);
    for (const e of this.live) this.drawOne(context, e);
    if (this.has('土') && this.shellLeft > 0) this.drawShell(context);
    this.drawSparks(context);

    context.restore();
  }

  /** The dark side of an effect: a silhouette under the light, so it has an edge anywhere. */
  private drawBacking(context: CanvasRenderingContext2D, e: Effect): void {
    context.globalAlpha = 0.5;
    context.fillStyle = 'rgba(14, 10, 26, 0.85)';
    if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(
        e.kind === 'aimed-orbit' && e.age < 0.34 ? e.angle + e.age * 9 : Math.atan2(e.vy, e.vx),
      );
      context.fillRect(-13, -8, 26, 16);
      context.restore();
    } else if (e.kind === 'orbit') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      crescent(context, 26, 12);
      context.fill();
      context.restore();
    } else if (e.kind === 'ward') {
      context.beginPath();
      context.arc(e.x, e.y, 14, 0, Math.PI * 2);
      context.fill();
    } else if (e.kind === 'ward-glyph') {
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2 + Math.sin(this.clock * 2 + e.x) * 0.06);
      context.fillRect(-11, -15, 22, 30);
      context.restore();
    }
    context.globalAlpha = 1;
  }

  private drawShellBacking(context: CanvasRenderingContext2D): void {
    context.save();
    context.translate(this.bodyX, this.bodyY);
    context.rotate(this.clock * 0.5);
    context.globalAlpha = 0.42;
    context.strokeStyle = 'rgba(14, 10, 26, 0.9)';
    const plates = 6;
    for (let i = 0; i < plates * Math.min(this.shellLeft, 3); i++) {
      const ring = 62 + Math.floor(i / plates) * 11;
      const from = ((i % plates) / plates) * Math.PI * 2 + 0.16;
      context.lineWidth = 9;
      context.beginPath();
      context.arc(0, 0, ring, from, from + (Math.PI * 2) / plates - 0.32);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  /**
   * A bloom: wide and faint, then narrower and brighter, then a hot point.
   *
   * Three gradients rather than one. One gradient gives a soft ball; three nested give something
   * with a centre, and the centre is what the eye reads as brightness.
   */
  private bloom(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    hue: Palette,
    alpha: number,
  ): void {
    if (radius <= 0 || alpha <= 0) return;
    const ring = (r: number, colour: string, a: number) => {
      const ramp = context.createRadialGradient(x, y, 0, x, y, r);
      ramp.addColorStop(0, colour);
      ramp.addColorStop(0.5, mix(colour, hue.edge, 0.45));
      ramp.addColorStop(1, clear(hue.edge));
      context.globalAlpha = a;
      context.fillStyle = ramp;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    };
    ring(radius, hue.edge, alpha * 0.34);
    ring(radius * 0.55, hue.body, alpha * 0.55);
    ring(radius * 0.24, hue.core, alpha * 0.9);
    context.globalAlpha = 1;
  }

  /**
   * 冰魄: a cold rim with crystals standing on it and frost drifting inside.
   *
   * Almost nothing in the middle, still — a wide translucent fill is the background with the
   * contrast taken out, whatever the blend mode. What additive buys here is that the rim, the
   * crystals and the frost all brighten where they cross.
   */
  private drawField(context: CanvasRenderingContext2D): void {
    const r = span('冰', this.levelOf('冰'));
    const hue = PALETTE['冰'];
    const deep = this.evolved('冰');
    context.save();
    context.translate(this.bodyX, this.bodyY);

    // No floor. Three versions have now tried to fill this area — at 19% in source-over, at 18%
    // additive — and every one came out as a wash of haze over the desktop, because what a wide
    // faint fill mostly contributes is alpha. The rim, the crystals and the frost carry it, and
    // they brighten where they cross, which is the whole reason for drawing additively.
    const lip = context.createRadialGradient(0, 0, r * 0.82, 0, 0, r * 1.1);
    lip.addColorStop(0, clear(hue.edge));
    lip.addColorStop(0.55, hue.edge);
    lip.addColorStop(1, clear(hue.edge));
    context.globalAlpha = deep ? 0.55 : 0.36;
    context.fillStyle = lip;
    context.beginPath();
    context.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = 0.5;
    context.strokeStyle = hue.body;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.95;
    context.strokeStyle = hue.core;
    context.lineWidth = 1.8;
    context.beginPath();
    context.arc(0, 0, r, 0, Math.PI * 2);
    context.stroke();

    const spin = this.clock * 0.35;
    const points = deep ? 12 : 8;
    for (let i = 0; i < points; i++) {
      const angle = spin + (i / points) * Math.PI * 2;
      const tall = 10 + 5 * Math.sin(this.clock * 2 + i);
      context.save();
      context.rotate(angle);
      context.translate(r, 0);
      context.globalAlpha = 0.85;
      context.fillStyle = hue.body;
      context.beginPath();
      context.moveTo(tall, 0);
      context.lineTo(-2, 4.6);
      context.lineTo(-6, 0);
      context.lineTo(-2, -4.6);
      context.closePath();
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.beginPath();
      context.moveTo(tall * 0.64, 0);
      context.lineTo(-1, 1.7);
      context.lineTo(-1, -1.7);
      context.closePath();
      context.fill();
      context.restore();
    }

    context.globalAlpha = 0.7;
    context.strokeStyle = hue.core;
    context.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const drift = this.clock * 0.6 + i * 2.4;
      const at = (i * 0.618) % 1;
      const rr = r * (0.2 + 0.72 * at);
      const px = Math.cos(drift) * rr;
      const py = Math.sin(drift * 1.13) * rr;
      context.beginPath();
      context.moveTo(px, py);
      context.lineTo(px - Math.sin(drift) * 6, py + Math.cos(drift) * 6);
      context.stroke();
    }
    context.globalAlpha = 1;
    context.restore();
  }

  /** 山岳: plates that turn, lit along their length. */
  private drawShell(context: CanvasRenderingContext2D): void {
    const hue = PALETTE['土'];
    context.save();
    context.translate(this.bodyX, this.bodyY);
    context.rotate(this.clock * 0.5);
    const plates = 6;
    for (let i = 0; i < plates * Math.min(this.shellLeft, 3); i++) {
      const ring = 62 + Math.floor(i / plates) * 11;
      const from = ((i % plates) / plates) * Math.PI * 2 + 0.16;
      const to = from + (Math.PI * 2) / plates - 0.32;
      context.globalAlpha = 0.34;
      context.strokeStyle = hue.edge;
      context.lineWidth = 11;
      context.beginPath();
      context.arc(0, 0, ring, from, to);
      context.stroke();
      context.globalAlpha = 0.72;
      context.strokeStyle = hue.body;
      context.lineWidth = 4.5;
      context.beginPath();
      context.arc(0, 0, ring, from, to);
      context.stroke();
      context.globalAlpha = 1;
      context.strokeStyle = hue.core;
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(0, 0, ring + 2.4, from + 0.04, to - 0.04);
      context.stroke();
    }
    context.restore();
  }

  private drawSparks(context: CanvasRenderingContext2D): void {
    for (const s of this.sparks) {
      const fade = Math.max(0, s.life / s.born);
      // Two strokes: a fat soft one in the body colour and a thin hot one over it. One stroke is a
      // scratch; two is an ember.
      context.globalAlpha = 0.5 * fade;
      context.strokeStyle = s.hue.body;
      context.lineWidth = s.size * 3.2 * (0.4 + 0.6 * fade);
      context.beginPath();
      context.moveTo(s.x - s.vx * SparkTail, s.y - s.vy * SparkTail);
      context.lineTo(s.x, s.y);
      context.stroke();
      context.globalAlpha = fade * fade;
      context.strokeStyle = s.hue.core;
      context.lineWidth = s.size * 1.2 * (0.4 + 0.6 * fade);
      context.beginPath();
      context.moveTo(s.x - s.vx * SparkTail * 0.7, s.y - s.vy * SparkTail * 0.7);
      context.lineTo(s.x, s.y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  private drawOne(context: CanvasRenderingContext2D, e: Effect): void {
    const hue = PALETTE[e.school];
    const fade = e.life > 0 ? Math.max(0, 1 - e.age / e.life) : 1;
    const grown = e.life > 0 ? Math.min(1, e.age / Math.max(0.0001, e.life * 0.25)) : 1;

    if (e.kind === 'aimed' || e.kind === 'aimed-orbit') {
      const heading = Math.atan2(e.vy, e.vx);
      const held = e.kind === 'aimed-orbit' && e.age < 0.34;
      // A ribbon of afterimages, brightening toward the head, then the talisman itself with a lit
      // face and a mark on it.
      for (let ghost = 4; ghost >= 0; ghost--) {
        const back = ghost * 0.016;
        const gx = e.x - e.vx * back;
        const gy = e.y - e.vy * back;
        const heat = 1 - ghost / 5;
        this.bloom(context, gx, gy, 14 + 10 * heat, hue, 0.3 * heat + 0.12);
      }
      context.save();
      context.translate(e.x, e.y);
      context.rotate(held ? e.angle + e.age * 9 : heading);
      context.globalAlpha = 0.85;
      const face = context.createLinearGradient(-11, 0, 11, 0);
      face.addColorStop(0, hue.edge);
      face.addColorStop(0.55, hue.body);
      face.addColorStop(1, hue.core);
      context.fillStyle = face;
      context.fillRect(-11, -6.5, 22, 13);
      context.globalAlpha = 1;
      context.fillStyle = hue.core;
      context.fillRect(-11, -6.5, 22, 1.4);
      context.fillRect(-11, 5.1, 22, 1.4);
      context.fillStyle = '#ff5a4a';
      context.fillRect(-6.5, -4.6, 2.6, 9.2);
      context.fillRect(-1, -3.6, 2, 7.2);
      context.fillRect(3.6, -4.6, 2, 9.2);
      context.restore();
      return;
    }

    if (e.kind === 'pop' || e.kind === 'burst') {
      const swell = e.age / Math.max(0.01, e.life);
      const r = e.reach * (0.25 + 0.95 * swell);
      this.bloom(context, e.x, e.y, r * 0.8, hue, 0.7 * fade);
      // A ring with the ramp across its thickness, so the shockwave has a hot inside edge.
      const ring = context.createRadialGradient(e.x, e.y, r * 0.7, e.x, e.y, r * 1.15);
      ring.addColorStop(0, clear(hue.edge));
      ring.addColorStop(0.5, hue.core);
      ring.addColorStop(1, clear(hue.edge));
      context.globalAlpha = fade * fade;
      context.fillStyle = ring;
      context.beginPath();
      context.arc(e.x, e.y, r * 1.15, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'sweep' || e.kind === 'sweep-arc') {
      const arc = SweepArc;
      const reach = e.reach * (0.74 + 0.3 * grown);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle);

      // The band is one path that **thins to a point at both ends**, rather than a sector.
      //
      // A filled sector has a hard straight edge at each end — the two radii — and a slash does not
      // stop at a straight line. Fading it out by cutting the sector into twenty-two slices of
      // decreasing alpha fixed the ends and introduced spokes: every slice is anti-aliased against
      // its neighbours and the seams show. So the taper is in the geometry. Thickness follows a
      // sine along the sweep, the outer and inner edges converge, and it is one fill with no seams
      // in it at all.
      const mid = reach * 0.82;
      const fat = reach * 0.6;
      const steps = 26;
      const thickness = (t: number) => fat * Math.pow(Math.sin(t * Math.PI), 0.5);
      context.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = -arc / 2 + t * arc;
        const rr = mid + thickness(t) / 2;
        const px = Math.cos(angle) * rr;
        const py = Math.sin(angle) * rr;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      for (let i = steps; i >= 0; i--) {
        const t = i / steps;
        const angle = -arc / 2 + t * arc;
        const rr = mid - thickness(t) / 2;
        context.lineTo(Math.cos(angle) * rr, Math.sin(angle) * rr);
      }
      context.closePath();
      const band = context.createRadialGradient(0, 0, mid - fat / 2, 0, 0, mid + fat / 2);
      band.addColorStop(0, clear(hue.edge));
      band.addColorStop(0.35, hue.edge);
      band.addColorStop(0.82, hue.body);
      band.addColorStop(0.96, hue.core);
      band.addColorStop(1, clear(hue.core));
      context.globalAlpha = 0.7 * fade;
      context.fillStyle = band;
      context.fill();

      // Smear arcs behind it, hot to cool, each a little shorter than the last.
      for (let i = 0; i < 4; i++) {
        const trim = 0.1 + i * 0.13;
        context.globalAlpha = fade * (0.9 - i * 0.2);
        context.strokeStyle = i === 0 ? hue.core : i === 1 ? hue.body : hue.edge;
        context.lineWidth = 4 - i * 0.85;
        context.beginPath();
        context.arc(0, 0, reach * (1 - i * 0.055), -arc / 2 + trim + i * 0.26, arc / 2 - trim + i * 0.26);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (e.kind === 'chain') {
      const path = e.path;
      if (!path || path.length < 2) return;
      const jitter = seeded(Math.round(e.x * 7 + e.y * 13));
      const points: { x: number; y: number }[] = [];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        if (i === 1) points.push(a);
        const steps = 6;
        const nx = -(b.y - a.y);
        const ny = b.x - a.x;
        const len = Math.hypot(nx, ny) || 1;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          const wobble = step === steps ? 0 : (jitter() - 0.5) * 30 * Math.sin(t * Math.PI);
          points.push({
            x: a.x + (b.x - a.x) * t + (nx / len) * wobble,
            y: a.y + (b.y - a.y) * t + (ny / len) * wobble,
          });
        }
      }
      const trace = () => {
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
      };
      // Four passes, wide and deep to thin and white. Flicker, because lightning that holds still
      // for a quarter second is a neon sign.
      const flare = 0.62 + 0.38 * Math.abs(Math.sin(e.age * 95));
      const passes: [string, number, number][] = [
        [hue.edge, 20, 0.3],
        [hue.edge, 11, 0.55],
        [hue.body, 5, 0.85],
        [hue.core, 1.7, 1],
      ];
      for (const [colour, width, alpha] of passes) {
        context.globalAlpha = fade * alpha * flare;
        context.strokeStyle = colour;
        context.lineWidth = width;
        trace();
        context.stroke();
      }
      // Dead-end forks, off the joints, so it branches like the real thing.
      context.globalAlpha = fade * 0.7 * flare;
      context.strokeStyle = hue.body;
      context.lineWidth = 2;
      for (let i = 2; i < points.length - 1; i += 3) {
        const from = points[i];
        const angle = Math.atan2(points[i + 1].y - from.y, points[i + 1].x - from.x);
        const off = angle + (jitter() - 0.5) * 2.4;
        const reach = 14 + jitter() * 26;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(from.x + Math.cos(off) * reach, from.y + Math.sin(off) * reach);
        context.stroke();
      }
      for (let i = 1; i < path.length; i++) {
        this.bloom(context, path[i].x, path[i].y, 34 * fade + 10, hue, 0.9 * fade);
      }
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'zone') {
      // One wavering body — three sine waves of different periods beating against each other — in
      // three nested sizes, deep outside and white in the middle. Nested is what gives it heat;
      // one filled shape at one colour is a puddle.
      const r = e.reach * (0.6 + 0.4 * grown);
      const t = this.clock;
      // Through the midpoints as quadratics rather than straight between the samples. A polygon
      // of twenty-odd sides is obviously a polygon at ninety pixels across, and fire has no
      // corners in it.
      const body = (scale: number, phase: number) => {
        const steps = 22;
        const at = (i: number) => {
          const angle = ((i % steps) / steps) * Math.PI * 2;
          const reach =
            r *
            scale *
            (0.74 +
              0.13 * Math.sin(angle * 3 + t * 4.2 + phase) +
              0.09 * Math.sin(angle * 5 - t * 6.1) +
              0.06 * Math.sin(angle * 8 + t * 9.3));
          return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
        };
        context.beginPath();
        let previous = at(0);
        let middle = { x: (previous.x + at(1).x) / 2, y: (previous.y + at(1).y) / 2 };
        context.moveTo(middle.x, middle.y);
        for (let i = 1; i <= steps; i++) {
          const here = at(i);
          const next = at(i + 1);
          middle = { x: (here.x + next.x) / 2, y: (here.y + next.y) / 2 };
          context.quadraticCurveTo(here.x, here.y, middle.x, middle.y);
          previous = here;
        }
        context.closePath();
      };

      context.save();
      context.translate(e.x, e.y);
      this.bloom(context, 0, 0, r * 1.25, hue, 0.5 * fade);
      context.globalAlpha = 0.55 * fade;
      context.fillStyle = hue.edge;
      body(1, 0);
      context.fill();
      context.globalAlpha = 0.6 * fade;
      context.fillStyle = hue.body;
      body(0.68, 1.7);
      context.fill();
      context.globalAlpha = 0.75 * fade;
      context.fillStyle = hue.core;
      body(0.3 + 0.05 * Math.sin(t * 7), 3.4);
      context.fill();
      context.globalAlpha = 1;
      context.restore();

      if (Math.random() < 0.34) {
        const angle = Math.random() * Math.PI * 2;
        this.spark(e.x + Math.cos(angle) * r * 0.6, e.y + Math.sin(angle) * r * 0.6, 1, '火', 85, -Math.PI / 2, 1.4);
      }
      return;
    }

    if (e.kind === 'trail' || e.kind === 'trail-fire' || e.kind === 'frost') {
      // Very faint per puff: fifteen of these overlap along the path, and additive stacking is
      // exactly what turns fifteen faint ones into a glowing bank instead of a flat tube.
      const hot = e.kind === 'trail-fire';
      const r = e.reach * (0.5 + 0.5 * grown);
      context.save();
      context.translate(e.x, e.y);
      context.globalAlpha = (hot ? 0.24 : 0.13) * fade;
      context.fillStyle = hue.edge;
      for (let i = 0; i < 3; i++) {
        const angle = e.angle + i * 2.09 + this.clock * (hot ? 1.6 : 0.4);
        const lobe = r * (0.5 + 0.22 * Math.sin(this.clock * 1.6 + i * 2.1 + e.x * 0.03));
        context.beginPath();
        context.arc(Math.cos(angle) * r * 0.34, Math.sin(angle) * r * 0.34, lobe, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = (hot ? 0.9 : 0.6) * fade;
      context.fillStyle = hue.core;
      for (let i = 0; i < 2; i++) {
        const angle = e.angle * 1.7 + i * 3.1 + this.clock * 0.8;
        context.beginPath();
        context.arc(Math.cos(angle) * r * 0.55, Math.sin(angle) * r * 0.55, 2.1, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.restore();
      return;
    }

    if (e.kind === 'orbit') {
      // The trail is a real ribbon: an arc of its own path, ramped from gone to hot along its
      // length, with the blade at the bright end.
      context.save();
      context.translate(this.bodyX, this.bodyY);
      const ring = Math.hypot(e.x - this.bodyX, e.y - this.bodyY) || e.reach;
      for (let i = 0; i < 5; i++) {
        const span = 1.1 * (1 - i / 5);
        context.globalAlpha = 0.16 + 0.12 * i;
        context.strokeStyle = i < 2 ? hue.edge : i < 4 ? hue.body : hue.core;
        context.lineWidth = 9 - i * 1.5;
        context.beginPath();
        context.arc(0, 0, ring, e.angle - span, e.angle);
        context.stroke();
      }
      context.globalAlpha = 1;
      context.restore();

      this.bloom(context, e.x, e.y, 20, hue, 0.55);
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2);
      const blade = context.createLinearGradient(0, -24, 9, 24);
      blade.addColorStop(0, hue.core);
      blade.addColorStop(0.5, hue.body);
      blade.addColorStop(1, hue.edge);
      context.globalAlpha = 0.95;
      context.fillStyle = blade;
      crescent(context, 24, 10);
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = hue.core;
      context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(0, -22);
      context.quadraticCurveTo(9, 0, 0, 22);
      context.stroke();
      context.restore();
      return;
    }

    if (e.kind === 'ward') {
      const heading = e.angle;
      const speed = Math.hypot(e.vx, e.vy);
      for (let ghost = 3; ghost >= 0; ghost--) {
        const back = ghost * 0.045;
        const gx = e.x - Math.cos(heading) * speed * back;
        const gy = e.y - Math.sin(heading) * speed * back;
        const heat = 1 - ghost / 4;
        this.bloom(context, gx, gy, 12 + 12 * heat, hue, 0.22 * heat + 0.12);
      }
      context.globalAlpha = 0.95;
      const skin = context.createRadialGradient(e.x - 3, e.y - 4, 1, e.x, e.y, 12);
      skin.addColorStop(0, hue.core);
      skin.addColorStop(0.6, hue.body);
      skin.addColorStop(1, hue.edge);
      context.fillStyle = skin;
      context.beginPath();
      context.arc(e.x, e.y, 11.5, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      return;
    }

    if (e.kind === 'ward-glyph') {
      this.bloom(context, e.x, e.y, 22, hue, (e.bite > 0 ? 0.6 : 0.2));
      context.save();
      context.translate(e.x, e.y);
      context.rotate(e.angle + Math.PI / 2 + Math.sin(this.clock * 2 + e.x) * 0.06);
      const face = context.createLinearGradient(-9, 0, 9, 0);
      face.addColorStop(0, hue.edge);
      face.addColorStop(0.55, hue.body);
      face.addColorStop(1, hue.core);
      context.globalAlpha = fade * 0.9;
      context.fillStyle = face;
      context.fillRect(-9, -13, 18, 26);
      context.globalAlpha = fade;
      context.fillStyle = hue.core;
      context.fillRect(-9, -13, 18, 1.3);
      context.fillRect(-9, 11.7, 18, 1.3);
      context.fillStyle = '#ff5a4a';
      context.fillRect(-4.5, -8, 2.4, 16);
      context.fillRect(0.6, -6, 2, 12);
      context.globalAlpha = 1;
      context.restore();
    }
  }
}

/** A crescent, pointing along +y. Used for both kinds of blade. */
function crescent(context: CanvasRenderingContext2D, long: number, wide: number): void {
  context.beginPath();
  context.moveTo(0, -long);
  context.quadraticCurveTo(wide, 0, 0, long);
  context.quadraticCurveTo(wide * 0.3, 0, 0, -long);
  context.closePath();
}

/**
 * A repeatable pseudo-random stream from one integer.
 *
 * So a bolt's wobble is the same on every frame it is drawn. Seeding it off the effect's own
 * position rather than off `Math.random` is the difference between lightning and television static
 * — the same lesson the breakthrough's cracks needed.
 */
function seeded(seed: number): () => number {
  let state = (seed | 0) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}


/** Wraps an angle into (−π, π]. */
function wrap(angle: number): number {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}
