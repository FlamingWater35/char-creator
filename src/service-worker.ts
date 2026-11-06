/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

/**
 * Offline strategy
 * ----------------
 * - Precache the build output and static files, one by one: `cache.addAll`
 *   rejects the whole batch when a single URL 404s, which used to leave the app
 *   with no offline support at all.
 * - Navigations: network first, falling back to the cached page and then to the
 *   cached app shell, so an offline reload shows the UI instead of a 503.
 * - Hashed build assets: cache first (their URL changes when they change).
 * - Everything else: network first with a cached fallback.
 */

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

/** Cap the runtime cache so long-lived installs cannot grow without bound. */
const MAX_RUNTIME_ENTRIES = 120;

self.addEventListener('install', (event: any) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);

			const results = await Promise.allSettled(
				ASSETS.map((asset) => cache.add(asset))
			);

			const failed = results.filter((r) => r.status === 'rejected').length;
			if (failed > 0) {
				console.warn(`Service worker: ${failed} of ${ASSETS.length} assets failed to precache.`);
			}

			// Take over as soon as possible; the app is client-rendered, so a
			// mixed-version page is safe.
			await (self as any).skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event: any) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
			);
			await (self as any).clients.claim();
		})()
	);
});

/**
 * Trims the runtime cache to a fixed number of most-recent entries.
 */
async function trimCache(cache: Cache): Promise<void> {
	const keys = await cache.keys();
	if (keys.length <= MAX_RUNTIME_ENTRIES) return;
	await Promise.all(
		keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((key) => cache.delete(key))
	);
}

/**
 * Only same-origin, fully successful responses are worth storing. Opaque
 * responses (status 0) and partial content would poison the cache.
 */
function isCacheable(response: Response): boolean {
	return response.status === 200 && response.type !== 'opaque' && response.type !== 'opaqueredirect';
}

self.addEventListener('fetch', (event: any) => {
	const request: Request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// Never cache the LLM proxy: responses are unique per prompt and must not
	// be replayed after a reconnect.
	if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
	if (url.origin !== self.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// Hashed build output never changes under a given URL.
			if (build.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}

			// Navigations: the network wins, but offline must still render.
			if (request.mode === 'navigate') {
				try {
					const response = await fetch(request);
					if (isCacheable(response)) {
						await cache.put(request, response.clone());
						void trimCache(cache);
					}
					return response;
				} catch {
					const cachedPage = await cache.match(request);
					if (cachedPage) return cachedPage;

					// Fall back to any cached document, preferring the shell.
					const shell =
						(await cache.match('/')) ||
						(await cache.match('/settings')) ||
						(await cache.match('index.html'));
					if (shell) return shell;

					return new Response(
						'<!doctype html><meta charset="utf-8"><title>Offline</title>' +
							'<body style="font-family:system-ui;padding:2rem;line-height:1.6">' +
							'<h1>You are offline</h1>' +
							'<p>Char Creator could not load this page. Reconnect and reload to continue — your characters are stored locally and are safe.</p>',
						{ status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
					);
				}
			}

			// Static files and anything else: cache first when precached,
			// otherwise network first with a cached fallback.
			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}

			try {
				const response = await fetch(request);
				if (isCacheable(response)) {
					await cache.put(request, response.clone());
					void trimCache(cache);
				}
				return response;
			} catch {
				const cached = await cache.match(request);
				if (cached) return cached;
				return new Response('Offline and not cached.', {
					status: 503,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' }
				});
			}
		})()
	);
});
