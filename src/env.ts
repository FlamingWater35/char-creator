import { defineEnvVars } from '@sveltejs/kit/env';

/**
 * Server-only environment variables.
 *
 * `CHAR_CREATOR_ALLOWED_HOSTS` is a comma-separated allowlist of extra
 * hostnames the custom-provider proxy may contact. `CHAR_CREATOR_ALLOW_CUSTOM_PROVIDER`
 * must be `1` for the custom provider to be reachable in production — without
 * it, the proxy would be an open relay on a public deployment.
 */
export const variables = defineEnvVars({
	CHAR_CREATOR_ALLOWED_HOSTS: {
		schema: (value: string | undefined) => value ?? ''
	},
	CHAR_CREATOR_ALLOW_CUSTOM_PROVIDER: {
		schema: (value: string | undefined) => value ?? ''
	},
	NODE_ENV: {
		schema: (value: string | undefined) => value ?? 'development'
	}
});
