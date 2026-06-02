class Settings {
  apiKey = $state('');
  model = $state('openai/gpt-chat-latest');
  temperature = $state(0.8);
  frequencyPenalty = $state(0);
  presencePenalty = $state(0);

  // Advanced AI parameters
  topP = $state(1.0);
  maxTokens = $state(8192);

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

  constructor() {
    this.load();
  }

  load() {
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('or_key') || '';
      this.model = localStorage.getItem('or_model') || 'openai/gpt-chat-latest';
      this.temperature = parseFloat(localStorage.getItem('or_temp') || '0.8');
      this.frequencyPenalty = parseFloat(localStorage.getItem('or_freq') || '0');
      this.presencePenalty = parseFloat(localStorage.getItem('or_pres') || '0');

      this.topP = parseFloat(localStorage.getItem('or_top_p') || '1.0');
      this.maxTokens = parseInt(localStorage.getItem('or_max_tokens') || '8192', 10);

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
    }
  }

  save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('or_key', this.apiKey);
      localStorage.setItem('or_model', this.model);
      localStorage.setItem('or_temp', this.temperature.toString());
      localStorage.setItem('or_freq', this.frequencyPenalty.toString());
      localStorage.setItem('or_pres', this.presencePenalty.toString());

      localStorage.setItem('or_top_p', this.topP.toString());
      localStorage.setItem('or_max_tokens', this.maxTokens.toString());

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
    }
  }
}
export const settings = new Settings();
