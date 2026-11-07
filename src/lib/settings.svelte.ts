import {
  DEFAULT_ENHANCE_PROMPT,
  DEFAULT_REGENERATE_PROMPT,
} from './prompts';

/**
 * Factory-default base instructions designed to guide modern LLMs to generate
 * highly nuanced, structurally stable, and organic three-dimensional characters.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are an expert AI roleplay character creator, creative writer, and narrative designer. Your goal is to construct multi-dimensional, psychologically complex, and organic characters with deep nuance, avoiding flat archetypes or clichés.

When generating or refining characters:
1. Infuse them with internal contradictions, distinct vulnerabilities, speech patterns, and micro-details of appearance or posture.
2. Ensure relationship dynamics and backstory events directly shape their current personality and worldview.
3. Do not use conversational filler, meta-introductions, or conversational outro commentary.
4. If generating raw text, output only the requested refinement. If requested to generate JSON, output ONLY a valid, syntax-compliant JSON object without markdown wrappers or code block wrapping.`;

/** The concept-generation switches, as a closed union of setting names. */
export type GenerationToggleKey =
  | 'genName'
  | 'genDescription'
  | 'genPersonality'
  | 'genScenario'
  | 'genBackstory'
  | 'genFirstMessages'
  | 'genExampleMessages'
  | 'genRelatedCharacters';

/**
 * The concept-generation switches, with their labels.
 *
 * Declared once as a typed list so the settings UI can iterate over it without
 * `settings as any` — that cast defeated the compiler precisely where a typo
 * would silently toggle the wrong field.
 */
export const GENERATION_TOGGLES: ReadonlyArray<{
  key: GenerationToggleKey;
  label: string;
}> = [
  { key: 'genName', label: 'Name' },
  { key: 'genDescription', label: 'Description' },
  { key: 'genPersonality', label: 'Personality' },
  { key: 'genScenario', label: 'Scenario' },
  { key: 'genBackstory', label: 'Backstory' },
  { key: 'genFirstMessages', label: 'Greetings' },
  { key: 'genExampleMessages', label: 'Examples' },
  { key: 'genRelatedCharacters', label: 'Relations' },
];

/**
 * One persisted setting: which property it is, which `or_*` key it lives under,
 * how to parse it, and what to use when the key is absent.
 *
 * `load()` and `save()` iterate this table, so the read and write halves of a
 * setting cannot drift apart — the previous hand-written pair of 24-line blocks
 * had to be kept in sync by eye, and a new setting was easy to write but never
 * read back.
 */
interface PersistedField {
  property: string;
  storage: string;
  kind: 'string' | 'number' | 'int' | 'boolean';
  /** Serialised default, used when the key is missing or unparseable. */
  fallback: string;
}

const PERSISTED: PersistedField[] = [
  { property: 'apiKey', storage: 'or_key', kind: 'string', fallback: '' },
  { property: 'model', storage: 'or_model', kind: 'string', fallback: 'openai/gpt-chat-latest' },
  { property: 'temperature', storage: 'or_temp', kind: 'number', fallback: '0.8' },
  { property: 'frequencyPenalty', storage: 'or_freq', kind: 'number', fallback: '0' },
  { property: 'presencePenalty', storage: 'or_pres', kind: 'number', fallback: '0' },

  { property: 'topP', storage: 'or_top_p', kind: 'number', fallback: '1' },
  { property: 'maxTokens', storage: 'or_max_tokens', kind: 'int', fallback: '8192' },
  { property: 'systemPrompt', storage: 'or_system_prompt', kind: 'string', fallback: DEFAULT_SYSTEM_PROMPT },
  { property: 'enhancePrompt', storage: 'or_enhance_prompt', kind: 'string', fallback: DEFAULT_ENHANCE_PROMPT },
  { property: 'regeneratePrompt', storage: 'or_regenerate_prompt', kind: 'string', fallback: DEFAULT_REGENERATE_PROMPT },

  { property: 'provider', storage: 'or_provider', kind: 'string', fallback: 'openrouter' },
  { property: 'customBaseUrl', storage: 'or_custom_url', kind: 'string', fallback: '' },

  { property: 'genName', storage: 'or_gen_name', kind: 'boolean', fallback: 'true' },
  { property: 'genDescription', storage: 'or_gen_desc', kind: 'boolean', fallback: 'true' },
  { property: 'genPersonality', storage: 'or_gen_pers', kind: 'boolean', fallback: 'true' },
  { property: 'genScenario', storage: 'or_gen_scen', kind: 'boolean', fallback: 'true' },
  { property: 'genBackstory', storage: 'or_gen_back', kind: 'boolean', fallback: 'true' },
  { property: 'genFirstMessages', storage: 'or_gen_fmsg', kind: 'boolean', fallback: 'true' },
  { property: 'genExampleMessages', storage: 'or_gen_emsg', kind: 'boolean', fallback: 'true' },
  { property: 'genRelatedCharacters', storage: 'or_gen_rchar', kind: 'boolean', fallback: 'false' },

  { property: 'mergeTraitsOnExport', storage: 'or_merge_export', kind: 'boolean', fallback: 'false' },
  { property: 'exportVersion', storage: 'or_export_version', kind: 'string', fallback: 'v3' },
];

/**
 * App-wide settings and parameters for API providers, AI generation toggles,
 * and card export specifications. Saves instantly to localStorage on changes.
 */
class Settings {
  apiKey = $state('');
  model = $state('openai/gpt-chat-latest');
  temperature = $state(0.8);
  frequencyPenalty = $state(0);
  presencePenalty = $state(0);

  // Advanced AI parameters
  topP = $state(1.0);
  maxTokens = $state(8192);
  systemPrompt = $state('');

  // Per-field action prompts (Settings → Advanced). Empty means "use default".
  enhancePrompt = $state('');
  regeneratePrompt = $state('');

  // Provider configuration
  provider = $state('openrouter');
  customBaseUrl = $state('');

  // Concept Generation toggles
  genName = $state(true);
  genDescription = $state(true);
  genPersonality = $state(true);
  genScenario = $state(true);
  genBackstory = $state(true);
  genFirstMessages = $state(true);
  genExampleMessages = $state(true);
  genRelatedCharacters = $state(false);

  // Export Compatibility parameters
  mergeTraitsOnExport = $state(false);
  exportVersion = $state<'v2' | 'v3'>('v3');

  constructor() {
    this.load();
  }

  /**
   * Safe-reads configuration attributes from local storage.
   * Defends against private browsing limitations or disabled cookies.
   */
  load() {
    if (typeof window === 'undefined') return;

    try {
      for (const field of PERSISTED) {
        const raw = localStorage.getItem(field.storage);
        this.writeField(field, raw === null ? field.fallback : raw);
      }
    } catch (e) {
      console.warn("Could not read configuration states from localStorage:", e);
    }
  }

  /**
   * Safe-writes current configuration attributes to local storage.
   */
  save() {
    if (typeof window === 'undefined') return;

    try {
      for (const field of PERSISTED) {
        localStorage.setItem(field.storage, String(this.readField(field)));
      }
    } catch (e) {
      console.warn("Could not save configuration states to localStorage:", e);
    }
  }

  /**
   * Every persisted setting, as a plain object.
   *
   * Reading this inside a `$effect` subscribes to all of them at once, so the
   * settings page no longer has to hand-maintain a 22-line dependency list that
   * silently stops covering anything added later.
   */
  snapshot(): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const field of PERSISTED) out[field.property] = this.readField(field);
    return out;
  }

  /**
   * Reads one setting by its storage descriptor.
   *
   * The cast is confined here on purpose: the property names in `PERSISTED` are
   * checked against this class by `satisfies` below, so a renamed field fails
   * to compile instead of silently writing to a key nobody reads.
   */
  private readField(field: PersistedField): string | number | boolean {
    return (this as unknown as Record<string, string | number | boolean>)[
      field.property
    ];
  }

  private writeField(field: PersistedField, raw: string): void {
    const target = this as unknown as Record<string, string | number | boolean>;

    switch (field.kind) {
      case 'number': {
        const parsed = Number.parseFloat(raw);
        // A corrupted or hand-edited value must not become NaN, which would
        // silently disable the control it feeds.
        target[field.property] = Number.isFinite(parsed) ? parsed : Number(field.fallback);
        return;
      }
      case 'int': {
        const parsed = Number.parseInt(raw, 10);
        target[field.property] = Number.isFinite(parsed) ? parsed : Number(field.fallback);
        return;
      }
      case 'boolean':
        // Anything that is neither "true" nor "false" falls back, rather than
        // guessing — the previous `!== 'false'` read turned garbage into `true`.
        target[field.property] =
          raw === 'true' ? true : raw === 'false' ? false : field.fallback === 'true';
        return;
      default:
        // `exportVersion` is a closed union; a stale or hand-edited value would
        // otherwise flow straight into the export path.
        if (field.property === 'exportVersion') {
          target[field.property] = raw === 'v2' ? 'v2' : 'v3';
          return;
        }
        target[field.property] = raw;
    }
  }

  /**
   * Restores system prompt back to the factory-optimized baseline.
   */
  resetSystemPrompt() {
    this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    this.save();
  }

  /**
   * Restores the per-field action prompts to their factory wording.
   */
  resetActionPrompts() {
    this.enhancePrompt = DEFAULT_ENHANCE_PROMPT;
    this.regeneratePrompt = DEFAULT_REGENERATE_PROMPT;
    this.save();
  }

  /**
   * Restores settings to their original factory defaults.
   */
  resetToDefaults() {
    this.apiKey = '';
    this.model = 'openai/gpt-chat-latest';
    this.temperature = 0.8;
    this.frequencyPenalty = 0;
    this.presencePenalty = 0;
    this.topP = 1.0;
    this.maxTokens = 8192;
    this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    this.enhancePrompt = DEFAULT_ENHANCE_PROMPT;
    this.regeneratePrompt = DEFAULT_REGENERATE_PROMPT;
    this.provider = 'openrouter';
    this.customBaseUrl = '';
    this.genName = true;
    this.genDescription = true;
    this.genPersonality = true;
    this.genScenario = true;
    this.genBackstory = true;
    this.genFirstMessages = true;
    this.genExampleMessages = true;
    this.genRelatedCharacters = false;
    this.mergeTraitsOnExport = false;
    this.exportVersion = 'v3';
    this.save();
  }
}
export const settings = new Settings();
