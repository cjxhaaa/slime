/**
 * 行囊 —— the six slots and the spare, opened mid-fight.
 *
 * ## The clock does not stop
 *
 * Every other panel in this mode pauses the run. This one does not, and that is the decision the
 * whole thing is shaped around: **"when do I dare take my hands off the fight"** is the question
 * it exists to ask. A panel that froze everything would turn merging into bookkeeping you do at
 * your leisure, which is the thing waves-and-shops would have been.
 *
 * Two consequences follow, and neither is cosmetic:
 *
 * - **It cannot cover the fight.** It sits along the bottom and washes nothing. Every other panel
 *   here dims the screen because nothing is happening behind it; behind this one, something is.
 * - **It has to be quick.** Three rows, every action one click, nothing nested. A gesture that
 *   needs a second click to confirm is a gesture that gets you hit.
 *
 * ## Why merging is its own row rather than dragging one thing onto another
 *
 * Dragging is the obvious gesture and it is wrong here. It needs a press, a travel and a release
 * on a target the width of a thumb, while something is walking toward you — and if you miss, the
 * most likely outcome is that you have silently moved an item instead of merging it. The pairs
 * row says exactly what it will do, costs one click, and cannot be half-performed.
 *
 * `Pack.pairs()` already guarantees each item appears in at most one pair, so the row can never
 * offer two buttons that would eat the same 蓝刀.
 */
import { words } from '../i18n/index.js';
import { type Item, tintOf } from '../game/gear.js';
import { Capacity, type Pack, Slots } from '../game/Pack.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a click on the panel asked for. */
export type Act =
  | { do: 'open' }
  | { do: 'close' }
  | { do: 'move'; id: number }
  | { do: 'fuse'; a: number; b: number };

const PanelHeight = 150;
const PanelPad = 14;
const Margin = 16;
const Radius = 14;
const ChipHeight = 30;
const ChipGap = 7;
const RowGap = 8;
const LabelWidth = 54;

/** The button that opens it, tucked into the corner so it is never where the fight is. */
const TabWidth = 74;
const TabHeight = 28;

const LabelFont = '600 11px system-ui, sans-serif';
const ChipFont = '600 12px system-ui, sans-serif';
const TabFont = '600 12px system-ui, sans-serif';

interface Hit {
  box: Rect;
  act: Act;
}

export class Satchel {
  private open = false;
  private hot: string | null = null;
  private hits: Hit[] = [];
  private panel: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private tab: Rect = { x: 0, y: 0, width: TabWidth, height: TabHeight };

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    this.open = true;
    this.hot = null;
  }

  hide(): void {
    this.open = false;
    this.hot = null;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  /**
   * Where everything is this frame.
   *
   * Rebuilt every frame rather than on change, because what it lays out **moves on its own**: a
   * drop can arrive while the panel is open, and a layout cached until the next click would be a
   * row of chips whose hit boxes belong to the items that were there a second ago.
   */
  layout(pack: Pack, width: number, height: number, measure: (text: string) => number): void {
    this.hits = [];
    this.tab = {
      x: Margin,
      y: height - Margin - TabHeight,
      width: TabWidth,
      height: TabHeight,
    };
    this.hits.push({ box: this.tab, act: { do: this.open ? 'close' : 'open' } });
    if (!this.open) {
      this.panel = { x: 0, y: 0, width: 0, height: 0 };
      return;
    }

    const panelWidth = Math.min(width - Margin * 2, 560);
    const x = Math.round(width / 2 - panelWidth / 2);
    const y = height - Margin - TabHeight - RowGap - PanelHeight;
    this.panel = { x, y, width: panelWidth, height: PanelHeight };

    const left = x + PanelPad + LabelWidth;
    const room = panelWidth - PanelPad * 2 - LabelWidth;
    let row = y + PanelPad;

    // Row one: the six, holes included. A hole is a target too — it is how you put something on.
    let at = left;
    for (let i = 0; i < Slots; i++) {
      const item = pack.worn[i];
      const w = item ? this.chipWidth(item, measure) : 34;
      if (at + w > left + room) break;
      if (item) this.hits.push({ box: { x: at, y: row, width: w, height: ChipHeight }, act: { do: 'move', id: item.id } });
      at += w + ChipGap;
    }

    // Row two: the spare.
    row += ChipHeight + RowGap;
    at = left;
    for (const item of pack.stash) {
      const w = this.chipWidth(item, measure);
      if (at + w > left + room) break;
      this.hits.push({ box: { x: at, y: row, width: w, height: ChipHeight }, act: { do: 'move', id: item.id } });
      at += w + ChipGap;
    }

    // Row three: what could be fused.
    row += ChipHeight + RowGap;
    at = left;
    for (const pair of pack.pairs()) {
      const w = this.pairWidth(pair.a, measure);
      if (at + w > left + room) break;
      this.hits.push({
        box: { x: at, y: row, width: w, height: ChipHeight },
        act: { do: 'fuse', a: pair.a.id, b: pair.b.id },
      });
      at += w + ChipGap;
    }
  }

  private chipWidth(item: Item, measure: (text: string) => number): number {
    return Math.round(measure(nameOf(item)) + 30);
  }

  private pairWidth(item: Item, measure: (text: string) => number): number {
    return Math.round(measure(nameOf(item)) + 54);
  }

  /** The panel plus its tab, for the dirty rect. Always includes the tab — it is always drawn. */
  bounds(): Rect {
    if (!this.open) return { ...this.tab };
    const top = Math.min(this.panel.y, this.tab.y);
    const bottom = Math.max(this.panel.y + this.panel.height, this.tab.y + this.tab.height);
    const left = Math.min(this.panel.x, this.tab.x);
    const right = Math.max(this.panel.x + this.panel.width, this.tab.x + this.tab.width);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  /** True while the pointer is over anything this owns, which is what the click lease asks. */
  covers(px: number, py: number): boolean {
    if (inside(this.tab, px, py)) return true;
    return this.open && inside(this.panel, px, py);
  }

  hover(px: number, py: number): void {
    const found = this.hits.find((h) => inside(h.box, px, py));
    this.hot = found ? key(found.act) : null;
  }

  click(px: number, py: number): Act | null {
    const found = this.hits.find((h) => inside(h.box, px, py));
    return found ? found.act : null;
  }

  draw(context: CanvasRenderingContext2D, pack: Pack): void {
    const w = words().satchel;
    context.save();
    context.textBaseline = 'middle';

    // The tab, always. It is the only thing that says the 行囊 is there at all.
    this.plate(context, this.tab, 9, this.hot === 'tab:open' || this.hot === 'tab:close');
    context.textAlign = 'center';
    context.font = TabFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.82)';
    context.fillText(w.title, this.tab.x + this.tab.width / 2, this.tab.y + this.tab.height / 2 + 1);

    if (!this.open) {
      context.restore();
      return;
    }

    const { x, y, width } = this.panel;
    // **No wash.** Every other panel here dims the screen because nothing is happening behind it.
    // Something is happening behind this one.
    context.shadowColor = 'rgba(0, 0, 0, 0.45)';
    context.shadowBlur = 22;
    context.shadowOffsetY = 5;
    context.fillStyle = 'rgba(16, 21, 32, 0.93)';
    context.beginPath();
    context.roundRect(x, y, width, PanelHeight, Radius);
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(255, 255, 255, 0.13)';
    context.beginPath();
    context.roundRect(x, y, width, PanelHeight, Radius);
    context.stroke();

    const labelAt = x + PanelPad;
    let row = y + PanelPad;

    // Row one.
    context.textAlign = 'left';
    context.font = LabelFont;
    // Red when there is nothing to swing. Six 五行 and no weapon is a legal build and a useless
    // one, and the panel is the only place that can say so before the run says it for you.
    context.fillStyle = pack.unarmed ? '#ff8a7a' : 'rgba(255, 255, 255, 0.4)';
    context.fillText(
      `${w.worn} ${pack.wornCount}/${Slots}`,
      labelAt,
      row + ChipHeight / 2,
    );
    for (const hit of this.hits) {
      if (hit.act.do !== 'move') continue;
      const item = pack.find(hit.act.id);
      if (!item) continue;
      this.chip(context, hit.box, item, this.hot === key(hit.act), pack.slotOf(item.id) >= 0);
    }
    // The empty slots, drawn from the holes rather than from a count, so they are where the row
    // actually ran out.
    let at = x + PanelPad + LabelWidth;
    for (let i = 0; i < Slots; i++) {
      const item = pack.worn[i];
      if (item) {
        at += this.chipWidth(item, (t) => context.measureText(t).width) + ChipGap;
        continue;
      }
      context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      context.setLineDash([3, 3]);
      context.beginPath();
      context.roundRect(at, row, 34, ChipHeight, 7);
      context.stroke();
      context.setLineDash([]);
      at += 34 + ChipGap;
    }

    // Row two.
    row += ChipHeight + RowGap;
    context.font = LabelFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.4)';
    context.fillText(`${w.stash} ${pack.stash.length}/${Capacity}`, labelAt, row + ChipHeight / 2);

    // Row three.
    row += ChipHeight + RowGap;
    context.fillStyle = 'rgba(255, 255, 255, 0.4)';
    context.fillText(w.fuse, labelAt, row + ChipHeight / 2);
    for (const hit of this.hits) {
      if (hit.act.do !== 'fuse') continue;
      const item = pack.find(hit.act.a);
      if (!item) continue;
      this.pairChip(context, hit.box, item, this.hot === key(hit.act));
    }

    context.restore();
  }

  private plate(context: CanvasRenderingContext2D, box: Rect, radius: number, hot: boolean): void {
    context.fillStyle = hot ? 'rgba(46, 58, 82, 0.96)' : 'rgba(22, 28, 42, 0.92)';
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, radius);
    context.fill();
    context.lineWidth = 1;
    context.strokeStyle = hot ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.16)';
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, radius);
    context.stroke();
  }

  private chip(
    context: CanvasRenderingContext2D,
    box: Rect,
    item: Item,
    hot: boolean,
    worn: boolean,
  ): void {
    const tint = tintOf(item.tier);
    context.fillStyle = hot ? 'rgba(52, 64, 88, 0.96)' : 'rgba(26, 33, 48, 0.94)';
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, 7);
    context.fill();
    // The grade is the border, not a dot: at this size a dot is three pixels and the one thing
    // you are reading the row for is which of two 刀 is the better one.
    context.lineWidth = worn ? 1.8 : 1.2;
    context.strokeStyle = tint;
    context.globalAlpha = worn ? 1 : 0.55;
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, 7);
    context.stroke();
    context.globalAlpha = 1;

    context.textAlign = 'center';
    context.font = ChipFont;
    context.fillStyle = worn ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.6)';
    context.fillText(nameOf(item), box.x + box.width / 2, box.y + box.height / 2 + 1);
    context.textAlign = 'left';
  }

  private pairChip(context: CanvasRenderingContext2D, box: Rect, item: Item, hot: boolean): void {
    const from = tintOf(item.tier);
    const to = tintOf(item.tier + 1);
    context.fillStyle = hot ? 'rgba(58, 52, 30, 0.96)' : 'rgba(34, 30, 20, 0.94)';
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, 7);
    context.fill();
    context.lineWidth = hot ? 1.8 : 1.2;
    // From one grade to the next, drawn as the gradient it is — the button says what it does
    // without needing a sentence.
    const sweep = context.createLinearGradient(box.x, 0, box.x + box.width, 0);
    sweep.addColorStop(0, from);
    sweep.addColorStop(1, to);
    context.strokeStyle = sweep;
    context.beginPath();
    context.roundRect(box.x, box.y, box.width, box.height, 7);
    context.stroke();

    context.textAlign = 'center';
    context.font = ChipFont;
    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.fillText(`${nameOf(item)} ×2 ▸`, box.x + box.width / 2, box.y + box.height / 2 + 1);
    context.textAlign = 'left';
  }
}

function nameOf(item: Item): string {
  const w = words();
  return item.sort.sort === 'arm' ? w.arms[item.sort.weapon].name : w.ways[item.sort.way].name;
}

/** A stable name for a hit, so hover survives the layout being rebuilt every frame. */
function key(act: Act): string {
  if (act.do === 'move') return `move:${act.id}`;
  if (act.do === 'fuse') return `fuse:${act.a}`;
  return `tab:${act.do}`;
}

function inside(box: Rect, px: number, py: number): boolean {
  return px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
}
