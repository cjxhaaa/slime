/**
 * 选定 — the dialog before a level: two weapons, three ways.
 *
 * This is the one place in the mode that asks you to think before anything happens (TOWER.md §3),
 * so it is a dialog rather than part of the bar: it turns up because you chose to fight, it asks
 * one thing, and it goes. CULTIVATION.md §6.5 draws exactly that line — a dialog that comes to
 * you with a decision and then leaves is not a panel.
 *
 * Picking a third weapon or a fourth way lets go of the earliest one picked rather than refusing:
 * "you already have two" is the answer a person changing their mind least wants, and the earliest
 * pick is the one they have thought about longest.
 *
 * It opens on whatever the last level was played with, so going straight back in is one click.
 */
import { tintOf } from '../game/gear.js';
import { type Loadout, PickArms, PickWays, complete } from '../game/loadout.js';
import { WAYS, WEAPONS, type Way, type Weapon } from '../game/kit.js';
import { words } from '../i18n/index.js';
import { drawWayIcon, drawWeaponIcon, wayTint } from './icons.js';
import type { Rect } from './Pause.js';
import { wrap } from './text.js';
import { BodyFace, Sect, TitleFace, paperPanel, plaque, seal, sealButton, veil } from './sect.js';

/** One tile, the column it sits in, and the room under it for a name of up to two lines. */
const Tile = 52;
export const Pitch = 78;
const RowHeight = Tile + 38;
const Margin = 24;
const PanelWidth = Margin * 2 + Pitch * 5;
const ButtonHeight = 38;
const ButtonGap = 10;

const LabelFont = `700 13px ${TitleFace}`;
export const NameFont = `12px ${BodyFace}`;

export type Pick = 'start' | 'leave';

type Target = { kind: 'arm'; weapon: Weapon } | { kind: 'way'; way: Way } | { kind: 'start' } | { kind: 'leave' };

export class LoadoutPanel {
  private open = false;
  private age = 0;
  private arms: Weapon[] = [];
  private ways: Way[] = [];
  private hot: Target | null = null;
  /** The line under the title: which level, and whether it is the top of the realm's road. */
  private heading: { text: string; capped: string | null } | null = null;
  private panel: Rect = { x: 0, y: 0, width: PanelWidth, height: 0 };
  private targets: { target: Target; box: Rect }[] = [];

  get isOpen(): boolean {
    return this.open;
  }

  /** The five, once all five are picked; null until then. */
  get choice(): Loadout | null {
    const loadout = { arms: [...this.arms], ways: [...this.ways] };
    return complete(loadout) ? loadout : null;
  }

  show(previous: Loadout | null, heading: { text: string; capped: string | null } | null = null): void {
    this.heading = heading;
    this.open = true;
    this.age = 0;
    this.hot = null;
    this.arms = previous ? [...previous.arms] : [];
    this.ways = previous ? [...previous.ways] : [];
  }

  hide(): void {
    this.open = false;
    this.hot = null;
  }

  advance(dt: number): void {
    if (this.open) this.age = Math.min(1, this.age + dt * 7);
  }

  layout(width: number, height: number): void {
    const panelHeight = Margin + 28 + 18 + 22 + RowHeight + 22 + RowHeight * 2 + 14 + ButtonHeight + Margin;
    const x = Math.round(width / 2 - PanelWidth / 2);
    const y = Math.round(height / 2 - panelHeight / 2);
    this.panel = { x, y, width: PanelWidth, height: panelHeight };
    this.targets = [];
    const tileAt = (column: number, top: number): Rect => ({
      x: x + Margin + column * Pitch + (Pitch - Tile) / 2,
      y: top,
      width: Tile,
      height: Tile,
    });
    let top = y + Margin + 28 + 18 + 22;
    WEAPONS.forEach((weapon, i) => this.targets.push({ target: { kind: 'arm', weapon }, box: tileAt(i, top) }));
    top += RowHeight + 22;
    // Two rows of five, in the order the ten are listed — which is by element, so each column is
    // one of the five phases with its two ways one above the other.
    WAYS.forEach((way, i) =>
      this.targets.push({ target: { kind: 'way', way }, box: tileAt(Math.floor(i / 2), top + (i % 2) * RowHeight) }),
    );
    const half = (PanelWidth - Margin * 2 - ButtonGap) / 2;
    const buttons = y + panelHeight - Margin - ButtonHeight;
    this.targets.push({ target: { kind: 'start' }, box: { x: x + Margin, y: buttons, width: half, height: ButtonHeight } });
    this.targets.push({
      target: { kind: 'leave' },
      box: { x: x + Margin + half + ButtonGap, y: buttons, width: half, height: ButtonHeight },
    });
  }

  bounds(): Rect | null {
    return this.open ? this.panel : null;
  }

  hover(px: number, py: number): void {
    if (this.open) this.hot = this.at(px, py);
  }

  /**
   * A click. Tiles toggle here and return null; the two buttons are returned for the caller. Start
   * only answers once all five are picked.
   */
  click(px: number, py: number): Pick | null {
    if (!this.open) return null;
    const target = this.at(px, py);
    if (!target) return null;
    if (target.kind === 'arm') this.arms = toggle(this.arms, target.weapon, PickArms);
    else if (target.kind === 'way') this.ways = toggle(this.ways, target.way, PickWays);
    else if (target.kind === 'leave') return 'leave';
    else if (this.choice) return 'start';
    return null;
  }

  private at(px: number, py: number): Target | null {
    for (const { target, box } of this.targets) {
      if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) return target;
    }
    return null;
  }

  draw(context: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.open) return;
    const w = words();
    const rise = 1 - (1 - this.age) * (1 - this.age);
    const { x, y, height: panelHeight } = this.panel;

    context.save();
    veil(context, width, height);
    context.globalAlpha = rise;
    context.translate(0, (1 - rise) * 18);

    // A sheet of the sect's paper with the question hung across its top on a lacquered board.
    paperPanel(context, { x, y, width: PanelWidth, height: panelHeight }, 8);
    plaque(context, w.loadout.title, x + PanelWidth / 2, y + Margin + 12, 18);
    if (this.heading) {
      // Which level, and — at the top of a realm's road — that it is the top, in cinnabar.
      context.save();
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `700 13px ${BodyFace}`;
      const line = this.heading.capped ? `${this.heading.text} · ${this.heading.capped}` : this.heading.text;
      context.fillStyle = this.heading.capped ? Sect.cinnabar : Sect.muted;
      context.fillText(line, x + PanelWidth / 2, y + Margin + 40);
      context.restore();
    }

    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = LabelFont;
    context.fillStyle = Sect.ink;
    const armsTop = y + Margin + 28 + 18 + 22;
    for (const [label, top] of [
      [w.loadout.arms, armsTop - 12],
      [w.loadout.ways, armsTop + RowHeight + 22 - 12],
    ] as const) {
      seal(context, Array.from(label)[0] ?? '', x + Margin, top - 8, 16);
      context.fillText(label, x + Margin + 22, top + 1);
    }

    for (const { target, box } of this.targets) {
      if (target.kind === 'start' || target.kind === 'leave') {
        this.drawButton(context, target.kind, box);
        continue;
      }
      const picked =
        target.kind === 'arm' ? this.arms.includes(target.weapon) : this.ways.includes(target.way);
      const hot = this.hot !== null && sameTarget(this.hot, target);
      if (picked) {
        // Picked: a jade glow behind it, so the five read as chosen from across the panel.
        context.save();
        context.globalAlpha = rise * 0.55;
        const glow = context.createRadialGradient(
          box.x + Tile / 2, box.y + Tile / 2, Tile * 0.2,
          box.x + Tile / 2, box.y + Tile / 2, Tile * 0.85,
        );
        glow.addColorStop(0, 'rgba(108, 194, 166, 0.9)');
        glow.addColorStop(1, 'rgba(108, 194, 166, 0)');
        context.fillStyle = glow;
        context.fillRect(box.x - Tile * 0.4, box.y - Tile * 0.4, Tile * 1.8, Tile * 1.8);
        context.restore();
      }
      context.save();
      // What is not picked is drawn faded rather than greyed: it is still a thing you could take.
      context.globalAlpha = rise * (picked ? 1 : hot ? 0.8 : 0.5);
      context.translate(box.x + Tile / 2, box.y + Tile / 2);
      if (target.kind === 'arm') drawWeaponIcon(context, target.weapon, Tile, tintOf(1));
      else drawWayIcon(context, target.way, Tile, wayTint(target.way));
      context.restore();
      if (picked) {
        // A gold frame round what is picked.
        context.strokeStyle = Sect.gold;
        context.lineWidth = 2.5;
        context.beginPath();
        context.roundRect(box.x - 4, box.y - 4, Tile + 8, Tile + 8, 6);
        context.stroke();
      }
      const name = target.kind === 'arm' ? w.arms[target.weapon].name : w.ways[target.way].name;
      context.font = NameFont;
      context.textAlign = 'center';
      context.fillStyle = picked ? Sect.ink : Sect.muted;
      const lines = wrap(name, Pitch - 4, (text) => context.measureText(text).width).slice(0, 2);
      lines.forEach((line, i) => context.fillText(line, box.x + Tile / 2, box.y + Tile + 14 + i * 14));
    }

    context.globalAlpha = 1;
    context.restore();
  }

  private drawButton(context: CanvasRenderingContext2D, kind: Pick, box: Rect): void {
    const w = words();
    const hot = this.hot?.kind === kind;
    if (kind === 'leave') {
      sealButton(context, box, w.trial.pauseLeave, 'paper', { hot });
      return;
    }
    // Lacquered once all five are picked; faded until then, because it does nothing until then.
    sealButton(context, box, w.loadout.start, 'cinnabar', { hot, disabled: this.choice === null });
  }
}

/** Adds or removes one; a pick past the limit lets go of the earliest. */
function toggle<T>(list: T[], item: T, limit: number): T[] {
  if (list.includes(item)) return list.filter((x) => x !== item);
  const next = [...list, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

function sameTarget(a: Target, b: Target): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'arm' && b.kind === 'arm') return a.weapon === b.weapon;
  if (a.kind === 'way' && b.kind === 'way') return a.way === b.way;
  return true;
}

/** Exported for the checks: the toggle rule, on its own. */
export { toggle as togglePick };
