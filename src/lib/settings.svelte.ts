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
    if (typeof window !== 'undefined') {
      try {
        this.apiKey = localStorage.getItem('or_key') || '';
        this.model = localStorage.getItem('or_model') || 'openai/gpt-chat-latest';
        this.temperature = parseFloat(localStorage.getItem('or_temp') || '0.8');
        this.frequencyPenalty = parseFloat(localStorage.getItem('or_freq') || '0');
        this.presencePenalty = parseFloat(localStorage.getItem('or_pres') || '0');

        this.topP = parseFloat(localStorage.getItem('or_top_p') || '1.0');
        this.maxTokens = parseInt(localStorage.getItem('or_max_tokens') || '8192', 10);
        this.systemPrompt = localStorage.getItem('or_system_prompt') || DEFAULT_SYSTEM_PROMPT;

        this.provider = localStorage.getItem('or_provider') || 'openrouter';
        this.customBaseUrl = localStorage.getItem('or_custom_url') || '';

        this.genName = localStorage.getItem('or_gen_name') !== 'false';
        this.genDescription = localStorage.getItem('or_gen_desc') !== 'false';
        this.genPersonality = localStorage.getItem('or_gen_pers') !== 'false';
        this.genScenario = localStorage.getItem('or_gen_scen') !== 'false';
        this.genBackstory = localStorage.getItem('or_gen_back') !== 'false';
        this.genFirstMessages = localStorage.getItem('or_gen_fmsg') !== 'false';
        this.genExampleMessages = localStorage.getItem('or_gen_emsg') !== 'false';
        this.genRelatedCharacters = localStorage.getItem('or_gen_rchar') === 'true';

        this.mergeTraitsOnExport = localStorage.getItem('or_merge_export') === 'true';
        this.exportVersion = (localStorage.getItem('or_export_version') as 'v2' | 'v3') || 'v3';
      } catch (e) {
        console.warn("Could not read configuration states from localStorage:", e);
      }
    }
  }

  /**
   * Safe-writes current configuration attributes to local storage.
   */
  save() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('or_key', this.apiKey);
        localStorage.setItem('or_model', this.model);
        localStorage.setItem('or_temp', this.temperature.toString());
        localStorage.setItem('or_freq', this.frequencyPenalty.toString());
        localStorage.setItem('or_pres', this.presencePenalty.toString());

        localStorage.setItem('or_top_p', this.topP.toString());
        localStorage.setItem('or_max_tokens', this.maxTokens.toString());
        localStorage.setItem('or_system_prompt', this.systemPrompt);

        localStorage.setItem('or_provider', this.provider);
        localStorage.setItem('or_custom_url', this.customBaseUrl);

        localStorage.setItem('or_gen_name', this.genName ? 'true' : 'false');
        localStorage.setItem('or_gen_desc', this.genDescription ? 'true' : 'false');
        localStorage.setItem('or_gen_pers', this.genPersonality ? 'true' : 'false');
        localStorage.setItem('or_gen_scen', this.genScenario ? 'true' : 'false');
        localStorage.setItem('or_gen_back', this.genBackstory ? 'true' : 'false');
        localStorage.setItem('or_gen_fmsg', this.genFirstMessages ? 'true' : 'false');
        localStorage.setItem('or_gen_emsg', this.genExampleMessages ? 'true' : 'false');
        localStorage.setItem('or_gen_rchar', this.genRelatedCharacters ? 'true' : 'false');

        localStorage.setItem('or_merge_export', this.mergeTraitsOnExport ? 'true' : 'false');
        localStorage.setItem('or_export_version', this.exportVersion);
      } catch (e) {
        console.warn("Could not save configuration states to localStorage:", e);
      }
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
