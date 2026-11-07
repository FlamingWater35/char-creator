/**
 * Small, pure presentation helpers shared by the dashboard and the editor.
 *
 * Kept free of DOM/Svelte imports so they can be unit-tested with `node:test`.
 */

export interface CharacterSummaryInput {
  name?: string;
  data: {
    mainPrompt?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    backstory?: string;
    relatedCharacters?: string;
    firstMessages?: string[];
    exampleMessages?: Array<{ user?: string; character?: string }>;
    characterBook?: { entries?: Array<{ content?: string; enabled?: boolean }> };
  };
}

export interface CharacterSummary {
  /** Rough context cost, using the app's existing chars/4 estimate. */
  tokens: number;
  /** How many of the six prose sections have content. */
  filledSections: number;
  /** Total prose sections tracked (description, personality, ...). */
  totalSections: number;
  greetings: number;
  examples: number;
  loreEntries: number;
  /** Lore entries whose `enabled` flag is not explicitly false. */
  activeLoreEntries: number;
}

const SECTION_KEYS = [
  "description",
  "personality",
  "scenario",
  "backstory",
  "relatedCharacters",
] as const;

/**
 * Aggregates the numbers the dashboard shows on a card.
 *
 * The token estimate deliberately mirrors the editor's estimator so the two
 * views never disagree about the same character.
 */
export function summarizeCharacter(char: CharacterSummaryInput): CharacterSummary {
  const d = char.data ?? {};
  const loreEntries = d.characterBook?.entries ?? [];

  const prose = [
    d.mainPrompt ?? "",
    ...SECTION_KEYS.map((key) => d[key] ?? ""),
    ...(d.firstMessages ?? []),
    ...(d.exampleMessages ?? []).map(
      (ex) => `${ex.user ?? ""} ${ex.character ?? ""}`,
    ),
  ];

  const loreText = loreEntries
    .filter((entry) => entry.enabled !== false)
    .map((entry) => entry.content ?? "")
    .join(" ");

  const totalChars = prose.reduce((sum, text) => sum + text.length, 0);

  return {
    tokens: Math.ceil((totalChars + loreText.length) / 4),
    filledSections: SECTION_KEYS.filter((key) => (d[key] ?? "").trim().length > 0)
      .length,
    totalSections: SECTION_KEYS.length,
    greetings: (d.firstMessages ?? []).filter((msg) => msg.trim().length > 0).length,
    examples: (d.exampleMessages ?? []).filter(
      (ex) => (ex.character ?? "").trim().length > 0,
    ).length,
    loreEntries: loreEntries.length,
    activeLoreEntries: loreEntries.filter((entry) => entry.enabled !== false)
      .length,
  };
}

/**
 * Formats a token count compactly: 812 → "812", 12_400 → "12.4k".
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 100_000) {
    const k = tokens / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Human-friendly "last edited" label.
 *
 * `now` is injectable so the tests do not depend on the wall clock. Invalid or
 * missing dates return "unknown" rather than "Invalid Date" in the UI.
 */
export function relativeTime(
  value: Date | string | number | null | undefined,
  now: Date | number = Date.now(),
): string {
  if (value === null || value === undefined || value === "") return "unknown";

  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(then)) return "unknown";

  const diff = nowMs - then;
  if (diff < 0) return "just now";

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }

  const date = new Date(then);
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  const month = date.toLocaleString("en", { month: "short" });
  return sameYear
    ? `${date.getDate()} ${month}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * One- or two-letter monogram for characters without a thumbnail.
 *
 * Uses the first letter of the first two meaningful words ("Merlin the Wise" →
 * "MW"), falling back to the first two characters for single-word names.
 * Articles and nobiliary particles are skipped: "The Old Man" → "OM", not "TO".
 */
export function initials(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";

  // `Array.from` splits by code point, so an emoji is never cut in half.
  const words = clean.split(/\s+/).filter(Boolean);
  const meaningful = words.filter(
    (word) => !PARTICLES.has(word.toLowerCase().replace(/[^\p{L}]/gu, "")),
  );
  const source = meaningful.length > 0 ? meaningful : words;

  const firstLetter = (word: string) => Array.from(word)[0] ?? "";

  if (source.length >= 2) {
    return (firstLetter(source[0]) + firstLetter(source[1])).toUpperCase();
  }

  return Array.from(source[0] ?? "").slice(0, 2).join("").toUpperCase();
}

/** Words that never earn a letter in a monogram. */
const PARTICLES = new Set([
  "the",
  "a",
  "an",
  "of",
  "de",
  "da",
  "di",
  "van",
  "von",
  "der",
  "la",
  "le",
  "el",
]);

/** First non-empty line of a block of text, trimmed for a card preview. */
export function firstLine(text: string | null | undefined, max = 160): string {
  const line = (text ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  return line.length <= max ? line : line.slice(0, max - 1).trimEnd() + "…";
}
