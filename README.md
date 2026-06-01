# Char Creator

A modern, local-first web application designed to help roleplayers build complex, structured character personalities.

## ✨ Features

- **AI-Powered Generation:** Use a core concept to auto-fill an entire character sheet or enhance specific fields (personality, backstory, etc.).
- **Local-First Storage:** All data is stored in your browser's IndexedDB using Dexie. No servers, no account required.
- **Structured Roleplay Cards:**
  - Multiple **Alternative Greetings**.
  - Structured **Dialogue Examples**.
  - Optional subfields (Personality, Scenario, Backstory).
- **Customizable AI:**
  - Searchable model selector for hundreds of OpenRouter models.
  - Adjustable Temperature and Frequency/Presence penalties.
- **Exporting:** One-click "Export to Clipboard" feature.

## 🚀 Tech Stack

- **Framework:** [SvelteKit](https://kit.svelte.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Database:** [Dexie.js](https://dexie.org/) (IndexedDB)
- **Icons:** [Lucide Svelte](https://lucide.dev/)
- **AI Integration:** [OpenAI SDK](https://github.com/openai/openai-node) (via [OpenRouter](https://openrouter.ai/))
