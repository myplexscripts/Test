const CACHE_NAME = "home-weather-shell-v139";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./activities.js",
  "./manifest.json",
  "./icon.svg",
  "./vendor/leaflet/leaflet.js",
  "./vendor/leaflet/leaflet.css",
  "./vendor/meteocons/icons.js",
  "./vendor/worldmap/land.js",
  "./vendor/phosphor/style.css",
  "./vendor/phosphor/Phosphor.woff2",
  "./vendor/phosphor/style-duotone.css",
  "./vendor/phosphor/Phosphor-Duotone.woff2",
  "./vendor/phosphor/style-fill.css",
  "./vendor/phosphor/Phosphor-Fill.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => key === CACHE_NAME ? null : caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (await caches.match("./index.html")) || new Response("Offline", { status: 503 });
        }
        return new Response("Offline", { status: 503 });
      })
  );
});
