import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

export const POST = async ({ request, url }: RequestEvent) => {
  const {
    prompt, model, apiKey, system, temperature,
    frequencyPenalty, presencePenalty, topP, maxTokens,
    provider, customBaseUrl
  } = await request.json();

  if (!apiKey && provider !== 'custom') {
    return json({ error: 'API Key is missing.' }, { status: 401 });
  }

  let baseURL = 'https://openrouter.ai/api/v1';
  if (provider === 'openai') baseURL = 'https://api.openai.com/v1';
  else if (provider === 'deepseek') baseURL = 'https://api.deepseek.com/v1';
  else if (provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  else if (provider === 'together') baseURL = 'https://api.together.xyz/v1';
  else if (provider === 'custom') baseURL = customBaseUrl || 'http://localhost:11434/v1';

  const client = new OpenAI({
    baseURL: baseURL,
    apiKey: apiKey || 'no-key',
    defaultHeaders: {
      'HTTP-Referer': request.headers.get('origin') || url.origin || 'https://char-creator-one.vercel.app/',
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
