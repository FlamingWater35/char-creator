import { env } from '$env/dynamic/private';

/**
 * Known hosted providers and their OpenAI-compatible base endpoints.
 * Only these URLs are ever contacted for a non-custom provider, so a request
 * cannot redirect the server at an arbitrary host by lying about `provider`.
 */
export const PROVIDER_BASE_URLS: Record<string, string> = {
	openrouter: 'https://openrouter.ai/api/v1',
	openai: 'https://api.openai.com/v1',
	deepseek: 'https://api.deepseek.com/v1',
	groq: 'https://api.groq.com/openai/v1',
	together: 'https://api.together.xyz/v1'
};

export const DEFAULT_CUSTOM_BASE_URL = 'http://localhost:11434/v1';

export type ResolvedEndpoint =
	| { ok: true; baseURL: string }
	| { ok: false; status: number; error: string };

/**
 * Hostnames that must never be reachable through the proxy: cloud metadata
 * endpoints and anything link-local are the classic SSRF pivots.
 */
const BLOCKED_HOSTNAMES = new Set([
	'metadata',
	'metadata.google.internal',
	'metadata.goog',
	'instance-data'
]);

/**
 * Parses a comma-separated allowlist from the environment.
 */
function readHostAllowlist(): string[] {
	return (env.CHAR_CREATOR_ALLOWED_HOSTS || '')
		.split(',')
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * True when the deployment has explicitly opted in to proxying arbitrary hosts.
 */
export function customProviderEnabled(): boolean {
	if (env.CHAR_CREATOR_ALLOW_CUSTOM_PROVIDER === '1') return true;
	// Local development and self-hosted `npm run preview` are always allowed.
	return env.NODE_ENV !== 'production';
}

/**
 * Rejects loopback-adjacent and link-local addresses that only ever make sense
 * as an SSRF target, while still permitting real LAN inference servers.
 */
function isBlockedAddress(hostname: string): boolean {
	const host = hostname.toLowerCase();

	if (BLOCKED_HOSTNAMES.has(host)) return true;
	if (host === '0.0.0.0' || host === '[::]' || host === '::') return true;

	// IPv4 literal checks
	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		// 169.254.0.0/16 is link-local: AWS/GCP/Azure metadata lives at .169.254
		if (a === 169 && b === 254) return true;
		// 127.0.0.0/8 is loopback and fine; 0.0.0.0/8 is not routable
		if (a === 0) return true;
		// 224.0.0.0/4 multicast and 240.0.0.0/4 reserved
		if (a >= 224) return true;
	}

	// IPv6 literal checks
	if (host.startsWith('[') || host.includes(':')) {
		const bare = host.replace(/^\[|\]$/g, '');
		if (bare === '::1' || bare === '::') return false;
		if (bare.startsWith('fe80') || bare.startsWith('fc') || bare.startsWith('fd')) {
			// fc00::/7 unique-local is a legitimate LAN address, fe80::/10 is not
			return bare.startsWith('fe80');
		}
	}

	return false;
}

/**
 * Resolves the base URL a request is allowed to talk to.
 *
 * Non-custom providers are hard-coded. The custom provider requires an
 * explicit opt-in on public deployments, an http(s) scheme, and a host that is
 * not a known metadata/link-local address.
 */
export function resolveEndpoint(
	provider: unknown,
	customBaseUrl: unknown
): ResolvedEndpoint {
	const providerId = typeof provider === 'string' && provider ? provider : 'openrouter';

	if (providerId !== 'custom') {
		const baseURL = PROVIDER_BASE_URLS[providerId];
		if (!baseURL) {
			return { ok: false, status: 400, error: `Unsupported provider "${providerId}".` };
		}
		return { ok: true, baseURL };
	}

	if (!customProviderEnabled()) {
		return {
			ok: false,
			status: 403,
			error:
				'The custom provider is disabled on this deployment. Set CHAR_CREATOR_ALLOW_CUSTOM_PROVIDER=1 to enable it.'
		};
	}

	const raw = typeof customBaseUrl === 'string' ? customBaseUrl.trim() : '';
	const candidate = raw || DEFAULT_CUSTOM_BASE_URL;

	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		return { ok: false, status: 400, error: 'Custom base URL is not a valid absolute URL.' };
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { ok: false, status: 400, error: 'Custom base URL must use http or https.' };
	}

	if (isBlockedAddress(parsed.hostname)) {
		return {
			ok: false,
			status: 400,
			error: 'Custom base URL points at a link-local or metadata address, which is not allowed.'
		};
	}

	const allowlist = readHostAllowlist();
	if (allowlist.length > 0 && !allowlist.includes(parsed.hostname.toLowerCase())) {
		return {
			ok: false,
			status: 400,
			error: `Host "${parsed.hostname}" is not in CHAR_CREATOR_ALLOWED_HOSTS.`
		};
	}

	return { ok: true, baseURL: parsed.toString().replace(/\/+$/, '') };
}

/**
 * Removes anything that looks like a credential before an upstream error is
 * echoed back to the browser.
 */
export function redactSecrets(message: string): string {
	return message
		.replace(/\b(sk|pk|gsk|xai|or)-[A-Za-z0-9_\-]{8,}/g, '[redacted]')
		.replace(/(api[_-]?key["'\s:=]+)[^\s"',}]+/gi, '$1[redacted]');
}
