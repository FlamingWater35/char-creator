import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

export const POST = async ({ request, url }: RequestEvent) => {
  const { prompt, model, apiKey, system, temperature, frequencyPenalty, presencePenalty, topP, maxTokens } = await request.json();

  if (!apiKey) {
    return json({ error: 'API Key is missing.' }, { status: 401 });
  }

  const siteUrl = request.headers.get('origin') || url.origin || 'https://char-creator-one.vercel.app/';

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: apiKey,
    defaultHeaders: {
      'HTTP-Referer': siteUrl,
      'X-Title': 'Char Creator'
    }
  });

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  try {
    const completion = await client.chat.completions.create({
      model: model || 'openai/gpt-4o',
      messages: messages as any,
      temperature: temperature ?? 0.8,
      frequency_penalty: frequencyPenalty ?? 0,
      presence_penalty: presencePenalty ?? 0,
      top_p: topP ?? 1.0,
      max_tokens: maxTokens ?? 8192
    }, { signal: request.signal });

    return json({ result: completion.choices[0].message.content });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }
    return json({ error: error.message }, { status: 500 });
  }
};
