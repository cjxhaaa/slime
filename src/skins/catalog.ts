/// <reference types="vite/client" />
import { invoke } from '@tauri-apps/api/core';
import { Classic, type Skin } from '../slime/skin.js';
import { buildSkin } from './dataSkin.js';
import { type LocalText, type SkinSpec, parseManifest } from './manifest.js';

/**
 * Every skin there is to choose from: the one drawn in code, the ones bundled with the app, and the
 * ones in the skins folder.
 *
 * The bundled ones live in `src/skins/packs/<id>/` in exactly the format a mod uses, and go through
 * exactly the same parser. They are the DLC; the folder is the workshop; nothing tells them apart
 * but where the files came from.
 */
export interface SkinEntry {
  /** `classic`, a pack's folder name, or `mod:` and the folder name for one from the skins folder. */
  id: string;
  source: 'classic' | 'builtin' | 'mod';
  /** The folder it was read from, for the message when it is broken. */
  folder: string;
  name: LocalText;
  author: string | null;
  /** Why it cannot be worn. Null for one that can. */
  error: string | null;
  spec: SkinSpec | null;
  urls: Readonly<Record<string, string>>;
}

export const ClassicId = Classic.id;

/** Prefixed so a mod can never shadow a bundled skin by sharing its folder name. */
const ModPrefix = 'mod:';

const manifests = import.meta.glob<unknown>('./packs/*/skin.json', {
  eager: true,
  import: 'default',
});
const pictures = import.meta.glob<string>('./packs/*/*.{png,webp,jpg,jpeg,gif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function bundled(): SkinEntry[] {
  const entries: SkinEntry[] = [];
  for (const [path, raw] of Object.entries(manifests)) {
    const folder = path.split('/')[2];
    const urls: Record<string, string> = {};
    for (const [picturePath, url] of Object.entries(pictures)) {
      const [, , owner, file] = picturePath.split('/');
      if (owner === folder) urls[file] = url;
    }
    entries.push(entry(folder, folder, 'builtin', raw, urls, null));
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}

function entry(
  id: string,
  folder: string,
  source: SkinEntry['source'],
  raw: unknown,
  urls: Record<string, string>,
  knownError: string | null,
): SkinEntry {
  const broken = (error: string): SkinEntry => ({
    id,
    source,
    folder,
    name: folder,
    author: null,
    error,
    spec: null,
    urls,
  });
  if (knownError) return broken(knownError);
  const parsed = parseManifest(raw, new Set(Object.keys(urls)));
  if (!parsed.ok) return broken(parsed.error);
  return {
    id,
    source,
    folder,
    name: parsed.spec.name,
    author: parsed.spec.author,
    error: null,
    spec: parsed.spec,
    urls,
  };
}

interface ModSkin {
  folder: string;
  manifest: string | null;
  files: Record<string, string>;
  error: string | null;
}

async function mods(): Promise<SkinEntry[]> {
  let found: ModSkin[];
  try {
    found = await invoke<ModSkin[]>('list_skins');
  } catch (error) {
    console.warn(`SKINS_LIST_FAILED ${String(error)}`);
    return [];
  }
  return found.map((mod) => {
    let raw: unknown = null;
    let error = mod.error;
    if (!error && mod.manifest !== null) {
      try {
        raw = JSON.parse(mod.manifest);
      } catch (thrown) {
        error = `skin.json is not valid JSON: ${(thrown as Error).message}`;
      }
    }
    return entry(ModPrefix + mod.folder, mod.folder, 'mod', raw, mod.files, error);
  });
}

/** The full list, freshly read. The skins folder is looked at again every time. */
export async function listSkins(): Promise<SkinEntry[]> {
  const classic: SkinEntry = {
    id: ClassicId,
    source: 'classic',
    folder: '',
    // Named by the dictionary rather than here, because it is the one skin with no skin.json.
    name: '',
    author: null,
    error: null,
    spec: null,
    urls: {},
  };
  return [classic, ...bundled(), ...(await mods())];
}

/** Puts the skin together. Throws, with a reason meant for the skin's author, if it cannot be. */
export async function loadSkin(entry: SkinEntry): Promise<Skin> {
  if (entry.source === 'classic') return Classic;
  if (!entry.spec) throw new Error(entry.error ?? 'this skin cannot be read');
  return buildSkin(entry.id, entry.spec, (file) => entry.urls[file]);
}
