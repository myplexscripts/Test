const CACHE_NAME = "home-weather-shell-v10";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

const PATCH_ID = "weather-flat-control-hotfix-v1";

const PATCH_STYLE = `
<style id="${PATCH_ID}">
  .status-fade {
    z-index: 0 !important;
    height: calc(58px + var(--safe-top)) !important;
    background: linear-gradient(to bottom, var(--sky) 0%, var(--sky) 62%, transparent 100%) !important;
    opacity: 0 !important;
  }
  .status-fade.show { opacity: 0.88 !important; }
  .shell { position: relative !important; z-index: 2 !important; }
  .topbar { position: relative !important; z-index: 3 !important; }
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
  }
  .more-button:hover,
  .more-button:focus-visible {
    transform: translateX(3px) !important;
    background: transparent !important;
    outline: none !important;
  }
  .more-button i { font-size: 2rem !important; line-height: 1 !important; }
  @media (max-width: 760px) {
    .more-button { width: 42px !important; height: 42px !important; min-width: 42px !important; }
    .more-button i { font-size: 1.85rem !important; }
  }
</style>`;

const PATCH_SCRIPT = `
<script id="${PATCH_ID}-script">
  (() => {
    const buttons = [
      [document.getElementById("hourlyMore"), "Open hourly graph"],
      [document.getElementById("weeklyMore"), "Open weekly graph"]
    ];
    buttons.forEach(([button, label]) => {
      if (!button) return;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.innerHTML = '<i class="ph ph-arrow-right" aria-hidden="true"></i>';
    });
  })();
</script>`;

function patchHtml(html) {
  if (!html || html.includes(PATCH_ID)) return html;
  return html.replace("</head>", `${PATCH_STYLE}\n</head>`).replace("</body>", `${PATCH_SCRIPT}\n</body>`);
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
