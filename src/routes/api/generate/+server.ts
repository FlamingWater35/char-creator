import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

export const POST = async ({ request }: RequestEvent) => {
  const { prompt, model, apiKey, system } = await request.json();

  if (!apiKey) {
    return json({ error: 'API Key is missing.' }, { status: 401 });
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'Char Creator'
    }
  });

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  try {
    const completion = await client.chat.completions.create({
      model: model || 'openai/gpt-4o',
      messages: messages as any
    });

    return json({ result: completion.choices[0].message.content });
  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
};
