/**
 * Prompt templates for the two per-field AI actions.
 *
 * "Enhance" rewrites existing text; "Regenerate" writes the field from scratch.
 * Both are user-editable in Settings → Advanced, so the wording lives here as a
 * factory default rather than inline in the editor.
 *
 * Templates use `{placeholders}`. Unknown placeholders are left untouched on
 * purpose: a typo stays visible in the preview instead of silently vanishing.
 */

export const DEFAULT_ENHANCE_PROMPT = `You are an expert roleplay character designer and prose stylist.

Character concept:
{concept}

Character sheet so far:
{context}

Field: {field}

Current text of this field:
{content}

Rewrite this field so it is more vivid, specific, and consistent with the character above. Keep every established fact, name, and relationship intact — refine the writing, never contradict it. Match the length and format expected by a character card field. Output only the rewritten field text: no headings, no labels, no quotation marks around the whole reply, and no commentary.`;

export const DEFAULT_REGENERATE_PROMPT = `You are an expert roleplay character designer.

Character concept:
{concept}

Character sheet so far:
{context}

Field: {field}

Write this field from scratch for the character described above. Ignore any earlier draft of this field: produce a fresh, self-contained take with concrete, specific detail that avoids clichés and generic filler. Match the length and format expected by a character card field. Output only the field text: no headings, no labels, no quotation marks around the whole reply, and no commentary.`;

/** Placeholders the template renderer understands, for the settings help text. */
export const PROMPT_PLACEHOLDERS: ReadonlyArray<{
  token: string;
  description: string;
}> = [
  {
    token: "{concept}",
    description: "The character's core concept (the Main Prompt).",
  },
  {
    token: "{field}",
    description: 'The section being written, e.g. "Description" or "First Message 1".',
  },
  {
    token: "{content}",
    description: "The field's current text (empty fields say so).",
  },
  {
    token: "{context}",
    description: "A compact summary of the character's other filled fields.",
  },
];

export interface PromptVariables {
  concept?: string;
  field?: string;
  content?: string;
  context?: string;
}

const EMPTY_CONCEPT = "(no concept provided yet)";
const EMPTY_FIELD = "(unknown field)";
const EMPTY_CONTENT = "(no content yet)";
const EMPTY_CONTEXT = "(no other fields filled in yet)";

/** Placeholder names the renderer understands, in display order. */
export const PLACEHOLDER_NAMES = ["concept", "field", "content", "context"] as const;

/**
 * Matches `{name}` / `{{name}}` with optional inner whitespace — the same shape
 * `renderPrompt` substitutes.
 */
const PLACEHOLDER_RE =
  /\{\{\s*(concept|field|content|context)\s*\}\}|\{\s*(concept|field|content|context)\s*\}/g;

/**
 * The placeholders a template actually uses, as canonical `{name}` tokens.
 *
 * Detection must share the renderer's grammar: a template written as
 * `{ concept }` renders correctly, so it must not be reported as missing the
 * token (that warning is only useful when it is accurate).
 */
export function templatePlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_RE)) {
    const name = (match[1] ?? match[2]) as string;
    found.add(`{${name}}`);
  }
  return PLACEHOLDER_NAMES.map((name) => `{${name}}`).filter((token) =>
    found.has(token),
  );
}

/**
 * Substitutes `{name}` / `{{name}}` placeholders with their values.
 *
 * Supports optional surrounding whitespace (`{ content }`) and repeated tokens.
 * Values are inserted verbatim, so a character description containing braces
 * cannot accidentally inject another placeholder.
 */
export function renderPrompt(
  template: string,
  variables: PromptVariables,
): string {
  const values: Record<string, string> = {
    concept: variables.concept?.trim() || EMPTY_CONCEPT,
    field: variables.field?.trim() || EMPTY_FIELD,
    content: variables.content?.trim() || EMPTY_CONTENT,
    context: variables.context?.trim() || EMPTY_CONTEXT,
  };

  return template.replace(
    PLACEHOLDER_RE,
    (_match, double: string | undefined, single: string | undefined) =>
      values[(double ?? single ?? "").toLowerCase()] ?? "",
  );
}

/**
 * True when the stored template differs from the factory default.
 *
 * Used only for a "modified" badge, so whitespace-only differences should not
 * count as a customization.
 */
export function isPromptCustomized(
  value: string | null | undefined,
  fallback: string,
): boolean {
  return (value ?? "").trim() !== fallback.trim();
}

/** Minimal shape of a character needed to build prompt context. */
export interface PromptContextSource {
  name: string;
  data: {
    description?: string;
    personality?: string;
    scenario?: string;
    backstory?: string;
    relatedCharacters?: string;
    firstMessages?: string[];
  };
}

const SECTION_LIMIT = 400;
const TOTAL_LIMIT = 1200;

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Builds the `{context}` block: the other fields already written, so a
 * regenerated section stays consistent with them.
 *
 * The field currently being written is omitted — feeding a stale draft back in
 * is exactly what "regenerate" is meant to escape.
 */
export function buildPromptContext(
  source: PromptContextSource,
  field = "",
  limit = TOTAL_LIMIT,
): string {
  const current = field.trim().toLowerCase();
  const parts: string[] = [];

  const add = (label: string, value: string | undefined) => {
    const text = (value ?? "").trim();
    if (text) parts.push(`${label}: ${clip(text, SECTION_LIMIT)}`);
  };

  if (source.name?.trim()) add("Name", source.name);
  if (!current.startsWith("description")) add("Description", source.data.description);
  if (!current.startsWith("personality")) add("Personality", source.data.personality);
  if (!current.startsWith("scenario")) add("Scenario", source.data.scenario);
  if (!current.startsWith("backstory")) add("Backstory", source.data.backstory);
  if (!current.startsWith("related characters"))
    add("Related characters", source.data.relatedCharacters);

  // A dialogue example needs the character's voice; a greeting *is* that voice.
  if (current.startsWith("example message")) {
    add("Main greeting", source.data.firstMessages?.[0]);
  }

  // An alternate greeting should complement the main one, not repeat it — but
  // the main greeting must not see itself.
  const alternateGreeting = /^first message (\d+)$/.exec(current);
  if (alternateGreeting && Number(alternateGreeting[1]) > 0) {
    add("Main greeting", source.data.firstMessages?.[0]);
  }

  const joined = parts.join("\n");
  if (!joined) return EMPTY_CONTEXT;
  if (joined.length <= limit) return joined;
  return joined.slice(0, limit - 1).trimEnd() + "…";
}
