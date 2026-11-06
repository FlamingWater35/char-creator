import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';
import { z } from 'zod';
import { resolveEndpoint, redactSecrets } from '$lib/server/providers';
import { stripReasoning } from '$lib/reasoning';

/**
 * Handles server-side completion requests from connected LLM Providers.
 * Cleans out reasoning/thought blocks to ensure perfect text consistency.
 */

/** Upper bound on a single prompt, to keep the proxy from being used as a file host. */
const MAX_PROMPT_CHARS = 400_000;

const payloadSchema = z.object({
	prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
	system: z.string().max(200_000).optional(),
	model: z.string().min(1).max(200).optional(),
	apiKey: z.string().max(500).optional(),
	provider: z.string().max(50).optional(),
	customBaseUrl: z.string().max(2000).optional(),
	temperature: z.number().min(0).max(2).optional(),
	frequencyPenalty: z.number().min(-2).max(2).optional(),
	presencePenalty: z.number().min(-2).max(2).optional(),
	topP: z.number().min(0).max(1).optional(),
	maxTokens: z.number().int().min(1).max(1_000_000).optional()
});

type ChatParams = Parameters<OpenAI['chat']['completions']['create']>[0];

/**
 * Builds the sampling payload, omitting anything the caller left undefined.
 */
function buildParams(
	model: string,
	messages: ChatParams['messages'],
	body: z.infer<typeof payloadSchema>
): ChatParams {
	return {
		model,
		messages,
		temperature: body.temperature ?? 0.8,
		frequency_penalty: body.frequencyPenalty ?? 0,
		presence_penalty: body.presencePenalty ?? 0,
		top_p: body.topP ?? 1.0,
		max_tokens: body.maxTokens ?? 8192
	};
}

/** True when an upstream 400 is complaining about a sampling parameter. */
function isUnsupportedParamError(message: string): boolean {
	return /unsupported|not supported|unrecognized|unknown (field|parameter)|extra (field|inputs)|does not support/i.test(
		message
	);
}

/** True when the provider wants `max_completion_tokens` instead of `max_tokens`. */
function wantsCompletionTokens(message: string): boolean {
	return /max_completion_tokens|use .*max_completion_tokens/i.test(message);
}

export const POST = async ({ request, url }: RequestEvent) => {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Malformed JSON payload.' }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(raw);
	if (!parsed.success) {
		const first = parsed.error.issues[0];
		return json(
			{ error: `Invalid request: ${first.path.join('.') || 'payload'} ${first.message}` },
			{ status: 400 }
		);
	}
	const body = parsed.data;

	const endpoint = resolveEndpoint(body.provider, body.customBaseUrl);
	if (!endpoint.ok) {
		return json({ error: endpoint.error }, { status: endpoint.status });
	}

	if (!body.apiKey && body.provider !== 'custom') {
		return json({ error: 'Authentication failed: API Key is missing.' }, { status: 401 });
	}

	try {
		const client = new OpenAI({
			baseURL: endpoint.baseURL,
			apiKey: body.apiKey || 'no-key',
			maxRetries: 0,
			defaultHeaders: {
				'HTTP-Referer': request.headers.get('origin') || url.origin,
				'X-Title': 'Char Creator'
			}
		});

		const messages: ChatParams['messages'] = [];
		if (body.system) messages.push({ role: 'system', content: body.system });
		messages.push({ role: 'user', content: body.prompt });

		const model = body.model || 'openai/gpt-chat-latest';
		const options = { signal: request.signal };

		let completion;
		try {
			completion = (await client.chat.completions.create(
				buildParams(model, messages, body),
				options
			)) as OpenAI.Chat.Completions.ChatCompletion;
		} catch (firstError: any) {
			const message = String(firstError?.message ?? '');
			if (firstError?.status !== 400 || !isUnsupportedParamError(message)) throw firstError;

			// The model rejects sampling controls (o-series, GPT-5+, several
			// OpenRouter routes). Retry with the smallest legal payload rather than
			// surfacing a 400 the user cannot act on.
			const minimal: ChatParams = { model, messages };
			if (wantsCompletionTokens(message)) {
				(minimal as any).max_completion_tokens = body.maxTokens ?? 8192;
			} else {
				minimal.max_tokens = body.maxTokens ?? 8192;
			}

			try {
				completion = (await client.chat.completions.create(
					minimal,
					options
				)) as OpenAI.Chat.Completions.ChatCompletion;
			} catch (secondError: any) {
				if (wantsCompletionTokens(String(secondError?.message ?? ''))) {
					completion = (await client.chat.completions.create(
						{
							model,
							messages,
							max_completion_tokens: body.maxTokens ?? 8192
						} as ChatParams,
						options
					)) as OpenAI.Chat.Completions.ChatCompletion;
				} else {
					throw secondError;
				}
			}
		}

		const content = stripReasoning(completion.choices[0]?.message?.content || '');
		return json({ result: content });
	} catch (error: any) {
		if (error?.name === 'AbortError' || request.signal.aborted) {
			return new Response(null, { status: 499 }); // Client closed connection
		}

		const status = typeof error?.status === 'number' ? error.status : 502;
		const message = redactSecrets(
			String(error?.message || 'An unexpected error occurred during model inference.')
		);
		return json({ error: message }, { status: status === 401 || status === 429 ? status : 502 });
	}
};
