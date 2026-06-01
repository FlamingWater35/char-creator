class Settings {
  apiKey = $state('');
  model = $state('openai/gpt-4o');

  constructor() {
    // Hydrate from localStorage on init (only in browser)
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('or_key') || '';
      this.model = localStorage.getItem('or_model') || 'openai/gpt-4o';
    }
  }

  save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('or_key', this.apiKey);
      localStorage.setItem('or_model', this.model);
    }
  }
}
export const settings = new Settings();
