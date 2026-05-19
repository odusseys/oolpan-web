const CACHE_NAME = "oolpan-shell-v2";
const MEDIA_CACHE_NAME = "oolpan-media-v1";
const MEDIA_ROUTE_PREFIX = "/__oolpan_media/";
const IS_LOCAL_DEV = ["localhost", "127.0.0.1", "::1"].includes(self.location.hostname);
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/oolpan-logo.png",
  "/oolpan-favicon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png"
];

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME && key !== MEDIA_CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith(MEDIA_ROUTE_PREFIX)) {
    event.respondWith(
      caches.open(MEDIA_CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          return cachedResponse || new Response(null, { status: 404 });
        })
      )
    );
    return;
  }

  if (IS_LOCAL_DEV) {
    return;
  }

  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }

        return networkResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
