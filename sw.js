const CACHE_NAME = "home-weather-shell-v11";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

const PATCH_ID = "weather-ios-chrome-radii-v2";

const PATCH_STYLE = `
<style id="${PATCH_ID}">
  :root {
    --r-xl: 34px;
    --r-lg: 30px;
    --r-md: 24px;
    --r-sm: 18px;
    --panel-pad: clamp(16px, 3vw, 22px);
  }

  .status-fade {
    position: fixed !important;
    z-index: 32 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: calc(64px + var(--safe-top)) !important;
    pointer-events: none !important;
    opacity: 0 !important;
    background: linear-gradient(to bottom, color-mix(in srgb, var(--sky) 96%, white 4%) 0%, color-mix(in srgb, var(--sky) 86%, transparent) 54%, transparent 100%) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.18) !important;
    backdrop-filter: blur(18px) saturate(1.18) !important;
    transition: opacity 180ms ease !important;
  }

  .status-fade.show { opacity: 1 !important; }
  .shell { position: relative !important; z-index: 1 !important; }
  .topbar { position: relative !important; z-index: 33 !important; }
  .drawer { z-index: 40 !important; }
  .menu-overlay { z-index: 39 !important; }
  .graph-screen { z-index: 45 !important; }

  .metrics-bar { --outer-radius: var(--r-lg); border-radius: var(--outer-radius) !important; }
  .sticky-stats { --outer-radius: var(--r-md); border-radius: var(--outer-radius) !important; }
  .day-card, .hour-card, .graph-day-card { --outer-radius: var(--r-md); border-radius: var(--outer-radius) !important; }

  .data-group {
    --outer-radius: var(--r-xl);
    --outer-pad: var(--panel-pad);
    border-radius: var(--outer-radius) !important;
    padding: var(--outer-pad) !important;
  }

  .detail { border-radius: max(14px, calc(var(--outer-radius) - var(--outer-pad))) !important; }

  .graph-canvas-wrap {
    --outer-radius: var(--r-xl);
    --outer-pad: clamp(14px, 3vw, 22px);
    border-radius: var(--outer-radius) !important;
    padding: var(--outer-pad) !important;
  }

  #graphCanvas { border-radius: max(14px, calc(var(--outer-radius) - var(--outer-pad))) !important; }
  .brand-icon, .menu-button { border-radius: var(--r-sm) !important; }
  .drawer-action { border-radius: 18px !important; }

  .more-button {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    display: grid !important;
    place-items: center !important;
    color: currentColor !important;
    box-shadow: none !important;
    font-size: 0 !important;
    overflow: hidden !important;
  }

  .more-button:hover,
  .more-button:focus-visible {
    transform: translateX(3px) !important;
    background: transparent !important;
    outline: none !important;
  }

  .more-button i { font-size: 2rem !important; line-height: 1 !important; }

  @media (max-width: 760px) {
    :root { --r-xl: 30px; --r-lg: 26px; --r-md: 22px; --r-sm: 16px; }
    .status-fade { height: calc(58px + var(--safe-top)) !important; }
    .more-button { width: 42px !important; height: 42px !important; min-width: 42px !important; }
    .more-button i { font-size: 1.85rem !important; }
  }
</style>`;

function patchHtml(html) {
  if (!html || html.includes(PATCH_ID)) return html;
  return html.replace("</head>", `${PATCH_STYLE}\n</head>`);
}

function htmlResponse(html, response) {
  const headers = new Headers(response?.headers || {});
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status: response?.status || 200, statusText: response?.statusText || "OK", headers });
}

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

  const isShell = event.request.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");

  if (isShell) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          const html = patchHtml(await response.clone().text());
          const patched = htmlResponse(html, response);
          const copy = patched.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return patched;
        })
        .catch(() => caches.match(event.request).then(async (cached) => {
          const fallback = cached || await caches.match("./index.html");
          if (!fallback) return new Response("Offline", { status: 503 });
          return htmlResponse(patchHtml(await fallback.clone().text()), fallback);
        }))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
