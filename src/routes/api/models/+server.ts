import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

/**
 * Handles server-side fetching of available models from dynamic LLM providers.
 * Proxies the request to prevent CORS issues on the client.
 */
export const POST = async ({ request }: RequestEvent) => {
  let payload;

  // Safely parse the incoming JSON to prevent server crashes on malformed requests
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: 'Malformed request payload.' }, { status: 400 });
  }

  const { provider, customBaseUrl, apiKey } = payload;

  // Resolves the proper API endpoint based on the selected provider
  let baseURL = 'https://openrouter.ai/api/v1';
  if (provider === 'openai') baseURL = 'https://api.openai.com/v1';
  else if (provider === 'deepseek') baseURL = 'https://api.deepseek.com/v1';
  else if (provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  else if (provider === 'together') baseURL = 'https://api.together.xyz/v1';
  else if (provider === 'custom') baseURL = customBaseUrl || 'http://localhost:11434/v1';

  // Attempt to fetch the model list and handle unauthorized/network errors
  try {
    const client = new OpenAI({
      baseURL,
      apiKey: apiKey || 'no-key'
    });

    const list = await client.models.list();
    return json({ models: list.data });
  } catch (error: any) {
    console.error("Model fetch failed:", error.message);
    return json({ error: error.message || "Failed to communicate with provider." }, { status: 500 });
  }
};
