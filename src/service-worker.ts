/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event: any) => {
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);
	}
	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event: any) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
	}
	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event: any) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	// Bypass caching for internal generator APIs and local LLM endpoints
	if (url.pathname.startsWith('/api/') || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
		return;
	}

	async function respond() {
		const cache = await caches.open(CACHE);

		// Always try the cache for static assets
		if (ASSETS.includes(url.pathname)) {
			return cache.match(url.pathname) as Promise<Response>;
		}

		// For everything else, try the network first, fall back to cache
		try {
			const response = await fetch(event.request);
			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}
			return response;
		} catch {
			return cache.match(event.request) as Promise<Response>;
		}
	}

	event.respondWith(respond());
});
