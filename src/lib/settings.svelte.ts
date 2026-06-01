class Settings {
  apiKey = $state('');
  model = $state('openai/gpt-4o');
  temperature = $state(0.8);
  frequencyPenalty = $state(0);
  presencePenalty = $state(0);

  constructor() {
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('or_key') || '';
      this.model = localStorage.getItem('or_model') || 'openai/gpt-4o';
      this.temperature = parseFloat(localStorage.getItem('or_temp') || '0.8');
      this.frequencyPenalty = parseFloat(localStorage.getItem('or_freq') || '0');
      this.presencePenalty = parseFloat(localStorage.getItem('or_pres') || '0');
    }
  }

  save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('or_key', this.apiKey);
      localStorage.setItem('or_model', this.model);
      localStorage.setItem('or_temp', this.temperature.toString());
      localStorage.setItem('or_freq', this.frequencyPenalty.toString());
      localStorage.setItem('or_pres', this.presencePenalty.toString());
    }
  }
}
export const settings = new Settings();
