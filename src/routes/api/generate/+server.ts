import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';

/**
 * Handles server-side completion requests from connected LLM Providers.
 * Cleans out reasoning/thought blocks to ensure perfect text consistency.
 */
export const POST = async ({ request, url }: RequestEvent) => {
  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: 'Malformed JSON payload.' }, { status: 400 });
  }

  const {
    prompt, model, apiKey, system, temperature,
    frequencyPenalty, presencePenalty, topP, maxTokens,
    provider, customBaseUrl
  } = payload;

  if (!apiKey && provider !== 'custom') {
    return json({ error: 'Authentication failed: API Key is missing.' }, { status: 401 });
  }

  // Resolve base endpoints based on provider configuration
  let baseURL = 'https://openrouter.ai/api/v1';
  if (provider === 'openai') baseURL = 'https://api.openai.com/v1';
  else if (provider === 'deepseek') baseURL = 'https://api.deepseek.com/v1';
  else if (provider === 'groq') baseURL = 'https://api.groq.com/openai/v1';
  else if (provider === 'together') baseURL = 'https://api.together.xyz/v1';
  else if (provider === 'custom') baseURL = customBaseUrl || 'http://localhost:11434/v1';

  try {
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

    const completion = await client.chat.completions.create({
      model: model || 'openai/gpt-4o',
      messages: messages as any,
      temperature: temperature ?? 0.8,
      frequency_penalty: frequencyPenalty ?? 0,
      presence_penalty: presencePenalty ?? 0,
      top_p: topP ?? 1.0,
      max_tokens: maxTokens ?? 8192
    }, { signal: request.signal }); // Binds connection abort controller signal to stop LLM compute on client close

    let content = completion.choices[0]?.message?.content || "";

    // Safely strip off deep reasoning thought segments <think>...</think> from output responses
    content = content.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();

    return json({ result: content });
  } catch (error: any) {
    if (error.name === 'AbortError' || request.signal.aborted) {
      return new Response(null, { status: 499 }); // Client Closed Connection
    }
    return json({ error: error.message || 'An unexpected error occurred during model inference.' }, { status: 500 });
  }
};
