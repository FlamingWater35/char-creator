/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event: any) => {
	// Pre-caches vital static assets on application install
	async function addFilesToCache() {
		try {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
		} catch (e) {
			console.error("Service worker cache installation failed:", e);
		}
	}
	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event: any) => {
	// Purges obsolete caches automatically when version increments
	async function deleteOldCaches() {
		try {
			for (const key of await caches.keys()) {
				if (key !== CACHE) await caches.delete(key);
			}
		} catch (e) {
			console.error("Failed to delete old caches:", e);
		}
	}
	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event: any) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);
	// Bypass caching for dynamic external APIs to avoid stale generated responses
	if (url.pathname.startsWith('/api/') || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
		return;
	}

	// Tries Network first, degrades gracefully to Cache on failure
	async function respond() {
		try {
			const cache = await caches.open(CACHE);

			if (ASSETS.includes(url.pathname)) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}

			try {
				const response = await fetch(event.request);
				if (response.status === 200) {
					cache.put(event.request, response.clone());
				}
				return response;
			} catch (networkErr) {
				const cachedFallback = await cache.match(event.request);
				if (cachedFallback) return cachedFallback;

				// Critical fallback to avoid breaking the UI completely on missing assets when offline
				return new Response('You are offline and the requested asset is not cached.', { status: 503 });
			}
		} catch (cacheErr) {
			console.error("Critical Cache API failure:", cacheErr);
			return new Response("Service Worker Storage Error", { status: 500 });
		}
	}

	event.respondWith(respond());
});
