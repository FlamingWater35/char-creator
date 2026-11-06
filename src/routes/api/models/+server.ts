import { json, type RequestEvent } from '@sveltejs/kit';
import OpenAI from 'openai';
import { z } from 'zod';
import { resolveEndpoint, redactSecrets } from '$lib/server/providers';

/**
 * Handles server-side fetching of available models from dynamic LLM providers.
 * Proxies the request to prevent CORS issues on the client.
 */

const payloadSchema = z.object({
	provider: z.string().max(50).optional(),
	customBaseUrl: z.string().max(2000).optional(),
	apiKey: z.string().max(500).optional()
});

/** Only the fields the picker actually renders, so the response stays small. */
type ModelSummary = { id: string; name: string };

export const POST = async ({ request }: RequestEvent) => {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Malformed request payload.' }, { status: 400 });
	}

	const parsed = payloadSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: 'Invalid request payload.' }, { status: 400 });
	}
	const body = parsed.data;

	const endpoint = resolveEndpoint(body.provider, body.customBaseUrl);
	if (!endpoint.ok) {
		return json({ error: endpoint.error }, { status: endpoint.status });
	}

	try {
		const client = new OpenAI({
			baseURL: endpoint.baseURL,
			apiKey: body.apiKey || 'no-key',
			maxRetries: 0
		});

		const list = await client.models.list();
		const models: ModelSummary[] = list.data
			.map((model) => {
				// OpenRouter and several compatible servers expose a display name;
				// the base OpenAI type does not declare it.
				const displayName = (model as { name?: unknown }).name;
				return {
					id: String(model.id),
					name:
						typeof displayName === 'string' && displayName
							? displayName
							: String(model.id)
				};
			})
			.sort((a, b) => a.name.localeCompare(b.name));

		return json({ models });
	} catch (error: any) {
		const status = typeof error?.status === 'number' ? error.status : 502;
		return json(
			{ error: redactSecrets(String(error?.message || 'Failed to communicate with provider.')) },
			{ status: status === 401 ? 401 : 502 }
		);
	}
};
