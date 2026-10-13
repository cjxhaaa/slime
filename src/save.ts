import { invoke } from '@tauri-apps/api/core';

/**
 * Everything that survives a restart.
 *
 * The schema lives here rather than in Rust because the gameplay does — that side stores opaque
 * JSON and only checks that it parses, so it never needs touching as this grows. Today it is one
 * point; cultivation state goes in beside it.
 */
export interface SaveState {
  slime: { x: number; y: number };
  cultivation: { realm: number; stage: number; qi: number; ascensions: number; nourishUntil: number };
  /** The daily allowance of nourished kills: the local date it rolled, and what is left of it. */
  daily: { date: string; remaining: number };
  /**
   * The charm hoard, and the realm breakthroughs that have failed.
   *
   * `failures` is keyed by realm index as a string, because that is what survives `JSON.stringify`
   * unchanged — an array would work too and would carry eight nulls for the realms nobody has
   * failed at.
   */
  charms: { held: number; failures: Record<string, number> };
  /** When the next 机缘 is due, in unix seconds. Zero on a fresh install. */
  fortune: { nextAt: number };
  /** Unix seconds the qi above was last brought up to date. Offline progress is this and nothing else. */
  settledAt: number;
  /** The one line said on a first run has been said. */
  seenIntro: boolean;
  /**
   * 见闻 — the ids of everything this pet has done, in no particular order.
   *
   * Latched rather than derived: a rebirth puts `realm` back to zero, so "reached 大乘" cannot be
   * recovered from the rest of this file an hour later. Ids are stable strings and are never
   * renamed, because a rename would silently un-earn something somebody did.
   */
  feats: string[];
  /** Seclusion: the keyboard is being left alone and nothing asks for attention. */
  quiet: boolean;
  /**
   * 敛息: step out of the way while something else owns the screen.
   *
   * Stored, and **defaults to on** for a save that predates it. The usual rule for a new setting is
   * to default it off so an upgrade changes nothing, and it is the wrong rule here: the behaviour
   * this turns on is "do not sit on top of the full-screen thing you are doing", and nobody who
   * upgrades wants a week of that happening before they find the switch.
   */
  lieLow: boolean;
  /**
   * The chosen language, or null to follow the system.
   *
   * Null rather than a resolved tag, so somebody who never opens the language menu keeps following
   * their system — including after they change *that*. Storing the resolved value would freeze the
   * first guess forever, which is the kind of thing nobody notices until they switch their OS to
   * another language and this one alone stays behind.
   */
  locale: string | null;
  /**
   * 关卡: the level the next 历练 is fought at, 1 to 99.
   *
   * The furthest reached, which is always one not yet beaten. A second line of progress beside the
   * realm, on purpose — see TOWER.md §2 for the cost of that. Absent in every save from before the
   * tower, and absent means the bottom of it.
   */
  tower: { level: number };
}

/**
 * Bumped whenever the shape below changes incompatibly.
 *
 * Present from the first release, before there is anything to migrate, because a save format
 * without a version has to *guess* what it is looking at the first time one is needed.
 */
const Version = 1;

/**
 * How long a change sits before it is written.
 *
 * Long enough that settling after a throw is one write rather than several, short enough that
 * quitting a moment later still keeps it. Nothing here is precious to the second: the worst case
 * is the slime coming back a couple of seconds' worth of drift from where it was left.
 */
const FlushDelayMs = 2000;

/** The serialised save waiting to go out, and the last one that actually went out. */
let pending: string | null = null;
let written: string | null = null;
let timer: number | null = null;
/**
 * True while a write is in the air.
 *
 * Two overlapping writes would both be going through the same scratch file on the Rust side, and
 * the loser would rename a half-written one over the save. Rare, but the cost of losing that race
 * is the whole file.
 */
let writing = false;
/**
 * Writing stays off until a load has actually come back.
 *
 * Without this, a read that is slow or broken ends with the pet homed to its default corner and
 * that default promptly written over a save that was perfectly fine. Refusing to write is the
 * failure worth having: it loses the last session's drift, not the save.
 */
let loaded = false;

/** The stored state, or null for a fresh start. Never throws; an unreadable save is a fresh start. */
export async function loadSave(): Promise<SaveState | null> {
  const raw = await invoke<string | null>('load_save');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown;
      slime?: { x?: unknown; y?: unknown };
      cultivation?: Partial<SaveState['cultivation']> & { rebirths?: unknown };
      daily?: { date?: unknown; remaining?: unknown };
      charms?: { held?: unknown; failures?: unknown };
      fortune?: { nextAt?: unknown };
      settledAt?: unknown;
      seenIntro?: unknown;
      feats?: unknown;
      quiet?: unknown;
      lieLow?: unknown;
      locale?: unknown;
      tower?: { level?: unknown };
    };
    // A file from a future version is not something this build can reason about, and guessing at
    // it is how a save gets quietly mangled. Starting fresh is bad; corrupting is worse.
    if (typeof parsed.version !== 'number' || parsed.version > Version) return null;
    const point = parsed.slime;
    if (typeof point?.x !== 'number' || typeof point?.y !== 'number') return null;
    // Fields added after a save was written are filled in rather than rejected. Growing the shape
    // is backwards compatible in both directions — an older build ignores what it does not know —
    // so `version` stays put and is there for a change that genuinely breaks.
    const grown = parsed.cultivation;
    return {
      slime: { x: point.x, y: point.y },
      cultivation: {
        realm: numberOr(grown?.realm, 0),
        stage: numberOr(grown?.stage, 0),
        qi: numberOr(grown?.qi, 0),
        // `rebirths` is the name this field had when it was incremented on the rebirth rather than
        // on the ascension before it. Read for anyone carrying a save from then.
        ascensions: numberOr(grown?.ascensions, numberOr(grown?.rebirths, 0)),
        nourishUntil: numberOr(grown?.nourishUntil, 0),
      },
      daily: {
        date: typeof parsed.daily?.date === 'string' ? parsed.daily.date : '',
        remaining: numberOr(parsed.daily?.remaining, 0),
      },
      charms: {
        held: Math.max(0, Math.floor(numberOr(parsed.charms?.held, 0))),
        failures: countsOr(parsed.charms?.failures),
      },
      fortune: { nextAt: numberOr(parsed.fortune?.nextAt, 0) },
      settledAt: numberOr(parsed.settledAt, Date.now() / 1000),
      seenIntro: parsed.seenIntro === true,
      // Ids this build has never heard of are kept, not dropped: a save written by a newer version
      // must survive being opened by an older one without losing what it recorded.
      feats: Array.isArray(parsed.feats) ? parsed.feats.filter((id) => typeof id === 'string') : [],
      quiet: parsed.quiet === true,
      // Absent means an older save, and absent means on — see the field's own note.
      lieLow: parsed.lieLow !== false,
      // Absent in every save written before there was a language menu, which is the common case
      // and not an error: null means "follow the system", and that is the right default for them.
      locale: typeof parsed.locale === 'string' ? parsed.locale : null,
      tower: { level: Math.max(1, Math.floor(numberOr(parsed.tower?.level, 1))) },
    };
  } catch {
    return null;
  }
}

/**
 * A finite number, or the fallback.
 *
 * Guards against a hand-edited or partially written save turning into `NaN` qi, which would poison
 * every sum afterwards and look exactly like the game having stopped rather than like bad data.
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * A map of realm index to a count, with anything unrecognisable dropped.
 *
 * Every entry is checked rather than the object as a whole, because this one is keyed by data: a
 * single junk value in here would otherwise become a `NaN` added to somebody's odds, and odds that
 * are `NaN` compare false against everything — which fails the breakthrough every time, silently,
 * and looks exactly like very bad luck.
 */
function countsOr(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      out[key] = Math.floor(count);
    }
  }
  return out;
}

/** Called once the load has settled, successfully or as a confirmed absence. */
export function allowSaving(): void {
  loaded = true;
}

/**
 * Records a change, to be written once it stops changing. Cheap enough to call from the loop.
 *
 * State that matches what is already on disk is dropped here rather than written again. That
 * matters more than it sounds: the caller's "has it settled" signal also goes true when a bubble
 * finishes fading or a ripple dies, so without this check, hovering the pet and moving away would
 * spend a disk write saying the slime is exactly where it already was.
 */
export function requestSave(state: SaveState): void {
  if (!loaded) return;
  const json = JSON.stringify({ version: Version, ...state });
  if (json === written || json === pending) return;
  pending = json;
  timer ??= window.setTimeout(() => void flush(), FlushDelayMs);
}

async function flush(): Promise<void> {
  timer = null;
  if (writing) {
    // Come back once the one in flight is done, rather than racing it through the scratch file.
    timer = window.setTimeout(() => void flush(), FlushDelayMs);
    return;
  }
  const json = pending;
  pending = null;
  if (json === null) return;

  writing = true;
  try {
    await invoke('write_save', { json });
    written = json;
  } catch (error) {
    // Nothing useful to do about it here, and an exception thrown out of a timer would take the
    // frame loop with it. Visible in the dev log, which is where a disk problem belongs.
    console.warn(`SAVE_FAILED ${String(error)}`);
  } finally {
    writing = false;
  }
}
