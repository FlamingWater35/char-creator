import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

export const POST = async ({ request }: RequestEvent) => {
  const { provider, customBaseUrl, apiKey } = await request.json();

  let baseURL = 'https://openrouter.ai/api/v1';
  if (provider === 'openai') baseURL = 'https://api.openai.com/v1';
  else if (provider === 'deepseek') baseURL = 'https://api.deepseek.com/v1';
  else if (provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  else if (provider === 'together') baseURL = 'https://api.together.xyz/v1';
  else if (provider === 'custom') baseURL = customBaseUrl || 'http://localhost:11434/v1';

  try {
    const client = new OpenAI({
      baseURL,
      apiKey: apiKey || 'no-key'
    });

    const list = await client.models.list();
    return json({ models: list.data });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
};
