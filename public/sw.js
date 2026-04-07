const CACHE_NAME = "odd-wheels-pwa-v2";
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/odd-wheels-logo.png",
];

function isLocalHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableAsset(request) {
  if (request.method !== "GET") return false;
  const destination = request.destination;
  if (
    destination === "script" ||
    destination === "style" ||
    destination === "worker" ||
    destination === "font" ||
    destination === "image"
  ) {
    return true;
  }
  const url = new URL(request.url);
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || networkFetch || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (isLocalHost(url.hostname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isCacheableAsset(request)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data?.json?.() ?? {};
    } catch {
      return {};
    }
  })();

  const title = String(payload.title ?? "Odd Wheels").trim() || "Odd Wheels";
  const body =
    String(payload.body ?? "You have a new update.").trim() ||
    "You have a new update.";
  const url = String(payload.url ?? "/").trim() || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: String(payload.icon ?? "/icon-192.png"),
      badge: String(payload.badge ?? "/icon-192.png"),
      tag: String(payload.tag ?? "odd-wheels-notification"),
      requireInteraction: payload.requireInteraction === true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const requestedUrl = new URL(
        String(event.notification?.data?.url ?? "/"),
        self.location.origin
      ).toString();
      const requestedPath = new URL(requestedUrl).pathname;
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin !== self.location.origin) continue;

        if (clientUrl.pathname === requestedPath) {
          return client.focus();
        }

        if ("navigate" in client) {
          await client.navigate(requestedUrl).catch(() => undefined);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(requestedUrl);
      }

      return undefined;
    })()
  );
});
