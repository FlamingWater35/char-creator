/**
 * Parsing of untrusted backup files.
 *
 * A backup is JSON a user picked from disk: it may come from an older version
 * of this app, from a different app entirely, or be hand-edited. Everything
 * here narrows `unknown` into the shapes `db.ts` declares, and drops rows it
 * cannot make sense of rather than writing `undefined` into IndexedDB.
 *
 * This exists so the settings page does not have to reach for `any`: an
 * unvalidated `data.exampleMessages` used to flow straight into a keyed
 * `{#each}`, where a row without an `id` throws at render time.
 */

import type {
  Character,
  CharacterAsset,
  CharacterBook,
  CharacterBookEntry,
  CharacterImage,
  ExampleMessage,
} from "./db";

/** What a restore actually produces. */
export interface ParsedBackup {
  /** Raw settings object, if the file carried one. */
  settings: Record<string, unknown> | null;
  characters: Character[];
  images: CharacterImage[];
  assets: CharacterAsset[];
  /** True when the file contained an API key, which is never applied. */
  carriesApiKey: boolean;
  /** Rows skipped because they were not usable. */
  skippedCharacters: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function parseExampleMessages(value: unknown): ExampleMessage[] {
  if (!Array.isArray(value)) return [];

  const out: ExampleMessage[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const character = str(entry.character);
    const user = str(entry.user);
    // A row with neither side is empty noise; drop it instead of storing it.
    if (!character && !user) continue;
    out.push({
      // Older backups predate the id, and a keyed `{#each}` needs one.
      id: str(entry.id) || crypto.randomUUID(),
      user,
      character,
    });
  }
  return out;
}

function parseBookEntry(value: unknown): CharacterBookEntry | null {
  if (!isRecord(value)) return null;

  const content = str(value.content);
  const keys = strArray(value.keys);
  if (!content && keys.length === 0) return null;

  const entry: CharacterBookEntry = {
    id: str(value.id) || crypto.randomUUID(),
    keys,
    content,
    enabled: value.enabled !== false,
  };

  const secondary = strArray(value.secondary_keys);
  if (secondary.length > 0) entry.secondary_keys = secondary;
  if (typeof value.priority === "number") entry.priority = value.priority;
  if (typeof value.comment === "string") entry.comment = value.comment;
  if (typeof value.constant === "boolean") entry.constant = value.constant;

  const extra = optionalRecord(value.extra);
  if (extra) entry.extra = extra;

  return entry;
}

function parseBook(value: unknown): CharacterBook {
  const book = isRecord(value) ? value : {};
  const entries = Array.isArray(book.entries)
    ? book.entries
        .map(parseBookEntry)
        .filter((entry): entry is CharacterBookEntry => entry !== null)
    : [];

  const parsed: CharacterBook = {
    name: str(book.name),
    entries,
  };
  if (typeof book.description === "string") parsed.description = book.description;

  const extra = optionalRecord(book.extra);
  if (extra) parsed.extra = extra;

  return parsed;
}

/**
 * Normalises one character row.
 *
 * Returns `null` when the row has no usable identity, which the caller counts
 * rather than silently storing a record nobody can open.
 */
export function parseCharacterRow(value: unknown): Character | null {
  if (!isRecord(value)) return null;

  const id = str(value.id);
  const name = str(value.name);
  if (!id || !name) return null;

  const data = isRecord(value.data) ? value.data : {};

  const character: Character = {
    id,
    name,
    createdAt: toDate(value.createdAt),
    updatedAt: toDate(value.updatedAt),
    data: {
      mainPrompt: str(data.mainPrompt),
      description: str(data.description),
      personality: str(data.personality),
      scenario: str(data.scenario),
      backstory: str(data.backstory),
      firstMessages:
        strArray(data.firstMessages).length > 0 ? strArray(data.firstMessages) : [""],
      exampleMessages: parseExampleMessages(data.exampleMessages),
      thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : null,
      relatedCharacters: str(data.relatedCharacters),
      characterBook: parseBook(data.characterBook),
      worldInfo: str(data.worldInfo),
    },
  };

  const cardMeta = optionalRecord(data.cardMeta);
  if (cardMeta) character.data.cardMeta = cardMeta;

  return character;
}

/**
 * Reads the legacy inline `data.image` / `data.assets` that older backups used,
 * before assets moved into their own tables.
 */
export function extractLegacyMedia(value: unknown): {
  image: string | null;
  assets: Omit<CharacterAsset, "characterId">[];
} {
  if (!isRecord(value)) return { image: null, assets: [] };
  const data = isRecord(value.data) ? value.data : {};

  const image = typeof data.image === "string" ? data.image : null;

  const assets: Omit<CharacterAsset, "characterId">[] = [];
  if (Array.isArray(data.assets)) {
    for (const entry of data.assets) {
      if (!isRecord(entry)) continue;
      const uri = str(entry.uri);
      if (!uri) continue;

      const type =
        entry.type === "avatar" || entry.type === "voice" ? entry.type : "image";

      assets.push({
        id: str(entry.id) || crypto.randomUUID(),
        name: str(entry.name, "unnamed_asset"),
        type,
        uri,
        ext: str(entry.ext, "png"),
      });
    }
  }

  return { image, assets };
}

/** Keeps only the image rows that can actually be stored. */
export function parseImageRows(value: unknown): CharacterImage[] {
  if (!Array.isArray(value)) return [];

  const out: CharacterImage[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    if (!id || typeof entry.image !== "string") continue;
    out.push({ id, image: entry.image });
  }
  return out;
}

/** Keeps only the asset rows that can actually be stored. */
export function parseAssetRows(value: unknown): CharacterAsset[] {
  if (!Array.isArray(value)) return [];

  const out: CharacterAsset[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = str(entry.id);
    const characterId = str(entry.characterId);
    if (!id || !characterId) continue;

    const type =
      entry.type === "avatar" || entry.type === "voice" ? entry.type : "image";

    out.push({
      id,
      characterId,
      name: str(entry.name, "unnamed_asset"),
      type,
      uri: str(entry.uri),
      ext: str(entry.ext, "png"),
    });
  }
  return out;
}

/**
 * Parses a whole backup file.
 *
 * Never throws on a malformed *body* — only on JSON that is not an object at
 * all, which the caller has already parsed. Unusable rows are dropped and
 * counted so the summary can tell the user what happened.
 */
export function parseBackup(value: unknown): ParsedBackup {
  const root = isRecord(value) ? value : {};
  const settings = optionalRecord(root.settings) ?? null;

  const characters: Character[] = [];
  let skippedCharacters = 0;

  if (Array.isArray(root.characters)) {
    for (const row of root.characters) {
      const parsed = parseCharacterRow(row);
      if (parsed) characters.push(parsed);
      else skippedCharacters++;
    }
  }

  return {
    settings,
    characters,
    images: parseImageRows(root.characterImages),
    assets: parseAssetRows(root.characterAssets),
    carriesApiKey: typeof settings?.apiKey === "string" && settings.apiKey.length > 0,
    skippedCharacters,
  };
}
