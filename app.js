
"use strict";

const API_KEY = "37c88f3496272531c686b0686ecfe1dd";
const GEO_BASE = "https://api.openweathermap.org/geo/1.0";
const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const AQHI_BASE = "https://api.weather.gc.ca";
const NEWS_PROXY = "https://rss-proxy.davidbusch-02.workers.dev/local?_=";
// The /local feed is a site:ctvnews.ca/london search, so any item that arrives
// without its own publisher is still CTV News London.
const WX_BASE = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";
const OTD_START_DEFAULT = 2000;   // fast pull: this day each year since 2000
const OTD_START_FULL = 1970;      // "See back to 1970" loads the deeper archive
const HOME = { lat: 42.9849, lon: -81.2453, label: "London, Ontario" };
const STATE_KEY = "hw_state_v1";
const CACHE_KEY = "hw_cache_v1";
const OTD_CACHE_KEY = "hw_otd_v2";
const OTD_RESULT_KEY = "hw_otd_result_v2";
// Deployed Worker that fetches + reduces the Open-Meteo archive server-side and
// edge-caches it (worker/on-this-day.js). Leave "" to fetch the archive directly
// from the browser instead (which some networks block).
const OTD_PROXY = "https://otd-weather.contactdavidbusch.workers.dev";
const ACTIVITY_KEY = "hw_activityplan_v1";
const NEWS_CACHE_KEY = "hw_news_v1";
const MOON_RAD = Math.PI / 180, ECL = MOON_RAD * 23.4397;

const PALETTES = {
  // Bloom: flat off-white/off-black page with a soft condition-tinted glow at
  // the top of the home screen (the glow uses the Dynamic sky colours).
  bloom:     { bg: "#f7f5f0", ink: "#121212", surface: "#121212", onSurface: "#f7f5f0", accent: "#f7f5f0", dark: false, isDynamic: true, bloom: true, statusBar: "#050505" },
  bloomdark: { bg: "#111113", ink: "#f2f0eb", surface: "#f2f0eb", onSurface: "#111113", accent: "#111113", dark: true, isDynamic: true, bloom: true, statusBar: "#050505" }
};

const $ = (id) => document.getElementById(id);
const el = {
  ptr: $("ptr"), splash: $("splash"),
  locBtn: $("locBtn"), homeLocBtn: $("homeLocBtn"),
  unitSeg: $("unitSeg"), animToggle: $("animToggle"), refreshBtn: $("refreshBtn"), creditsBtn: $("creditsBtn"),
  radarFull: $("radarFull"), searchFull: $("searchFull"),
  locSearch: $("locSearch"), searchResults: $("searchResults"), searchClear: $("searchClear"),
  settingsPop: $("settingsPop"), bottomNav: $("bottomNav"),
  searchSheet: $("searchSheet"), searchBack: $("searchBack"),
  mapPickMap: $("mapPickMap"), mapPickConfirm: $("mapPickConfirm"),
  placeName: $("placeName"), condition: $("condition"),
  heroIcon: $("heroIcon"), temp: $("temp"), tempNum: $("tempNum"), summary: $("summary"), quickHits: $("quickHits"), alerts: $("alerts"),
  heroLo: $("heroLo"), heroHi: $("heroHi"), heroFeels: $("heroFeels"), heroWhen: $("heroWhen"),
  alertOverlay: $("alertOverlay"), alertModalTitle: $("alertModalTitle"), alertModalMeta: $("alertModalMeta"), alertModalBody: $("alertModalBody"), alertModalClose: $("alertModalClose"),
  hero: document.querySelector(".hero"),
  metrics: $("metrics"), newsList: $("newsList"),
  meshWrap: $("meshWrap"), homeNavBtn: $("navHome"),
  newsSheet: $("newsSheet"), newsBack: $("newsBack"), navNews: $("navNews"),
  homeNews: $("homeNews"), homeNewsList: $("homeNewsList"), homeNewsMore: $("homeNewsMore"),
  hourRail: $("hourRail"), dayRail: $("dayRail"), status: $("status"),
  dayGraph: $("dayGraph"),
  nowcast: $("nowcast"), nowcastLine: $("nowcastLine"), nowcastIc: document.querySelector(".nowcast-ic"),
  onThisDay: $("onThisDay"), otdCard: $("otdCard"),
  sunCard: $("sunCard"), moonCard: $("moonCard"), detailGrid: $("detailGrid"), windCard: $("windCard"),
  radarPreview: $("radarPreview"), radarPreviewMap: $("radarPreviewMap"), radarMore: $("radarMore"),
  radarSheet: $("radarSheet"), radarBack: $("radarBack"), radarMap: $("radarMap"),
  layerSeg: $("layerSeg"), radarNote: $("radarNote"),
  radarTimeline: $("radarTimeline"), radarPlay: $("radarPlay"), radarScrub: $("radarScrub"), radarTime: $("radarTime"), radarLegend: $("radarLegend"), windLegend: $("windLegend"), aqiLegend: $("aqiLegend"),
  hourlyMore: $("hourlyMore"), dailyMore: $("dailyMore"),
  sheet: $("sheet"), sheetScroll: $("sheetScroll"), sheetBack: $("sheetBack"), tabSeg: $("tabSeg"), sheetHeadAux: $("sheetHeadAux"),
  sheetTitle: $("sheetTitle"), sheetNote: $("sheetNote"), graph: $("graph"), sheetList: $("sheetList"), dayStats: $("dayStats")
};

const state = {
  units: "metric",
  loc: { ...HOME },
  quickHitsOpen: false,
  data: null,
  hourly: [],
  daily: [],
  detail: { metric: "temp", range: "hourly" },
  theme: "bloomdark",
  tinted: true,
  center: { ...HOME },
  tz: 0,
  placeName: "",
  dark: false,
  clock24: false,
  clockPattern: false,
  animate: true,
  drawerOpen: false,
  sheetOpen: false,
  radarOpen: false
};

const radar = {
  map: null, base: null, owm: null, marker: null, preview: null, previewBase: null, previewMarker: null,
  layers: [], shown: new Map(), raf: null, t0: 0, gateTimer: null, ready: false, warmScheduled: false,
  mode: "radar", source: "rainviewer", frames: [], idx: 0, playing: false, timer: null, host: "", loaded: false, ecccAt: 0, ecccLayerName: "", themeDark: null,
  windLayer: null, windMoveHandler: null, windDebounce: null, windReq: 0,
  aqiCanvas: null, aqiOff: null, aqiStations: [], aqiHandlers: null, aqiFetchTimer: null, aqiRaf: null, aqiReq: 0
};
const FRAME_MS = 620;
const END_HOLD_MS = 1100;
const RESET_MS = 520;
const FADE_FRAC = 0.55;
const RADAR_OPACITY = 0.9;
const ECCC_FILTER = "hue-rotate(140deg) saturate(2) brightness(1.1)";
function radarEase(t) { return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2; }
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const RV_COLOR = 7;
// options are `smooth_snow`: smoothed pixels (1) and a distinct snow colour (1)
// give the crisper, less blocky radar look at the larger 512px tile size below.
const RV_OPTS = "1_1";
// 512px RainViewer tiles carry four times the detail of the 256px default, so
// the precipitation edges stay sharp instead of pixelating as you zoom in.
const RV_SIZE = 512;
const ECCC_WMS          = "https://geo.weather.gc.ca/geomet";
const ECCC_LAYER_RAIN = "RADAR_1KM_RRAI";
const ECCC_LAYER_SNOW = "RADAR_1KM_RSNO";
const ECCC_LAYER_LIGHTNING = "Lightning_2.5km_Density";
const LAYER_NAMES = { radar: "Live precipitation radar", clouds_new: "Cloud cover", temp_new: "Temperature", wind_new: "Wind speed & direction", air_quality: "Air quality", lightning: "Lightning density, Environment Canada, Canada only" };

function ecccLayer() {
  const main = (state.data?.current?.weather?.[0]?.main || "").toLowerCase();
  return main === "snow" ? ECCC_LAYER_SNOW : ECCC_LAYER_RAIN;
}

// Dismiss the splash and let the entrance animations play. Idempotent, so the
// first of {content rendered, safety timeout} wins - no lingering splash.
let appRevealed = false;
function revealApp() {
  if (appRevealed) return;
  appRevealed = true;
  // Wait two frames so the freshly built content is actually painted before the
  // splash lifts - otherwise you'd watch the page populate through the fade.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.body.classList.remove("booting");
    if (el.splash) {
      const done = () => el.splash.classList.add("gone");
      el.splash.addEventListener("transitionend", done, { once: true });
      setTimeout(done, 700);   // fallback if transitionend doesn't fire
    }
  }));
}

function init() {
  loadState();
  wireEvents();
  registerSW();
  syncControls();
  applyPalette(themeKind());
  // Safety net: never hold the splash longer than needed if data is slow/offline.
  setTimeout(revealApp, 2600);

  const appEl = document.getElementById("app");
  if (appEl && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    appEl.classList.add("intro");
    setTimeout(() => appEl.classList.remove("intro"), 2800);
  }

  // Prewarm the news: show any cached articles at once, then fetch fresh right
  // away, independent of geolocation and the weather load, so the feed is ready
  // by the time it scrolls into view instead of waiting on the weather refresh.
  state.news = loadNewsCache();
  loadNews();

  const cache = loadCache();
  if (cache && cache.units === state.units) {
    state.data = cache.data;
    render(cache.data, { cached: true });
    setStatus("Showing saved weather…");
  }
  initialLocate();
}

// On every launch, try to use the device's current location for the most
// relevant forecast. Falls back to the saved/Home location if geolocation is
// unavailable or the user has denied permission.
function initialLocate() {
  if (!navigator.geolocation) { refresh(); return; }
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" };
      saveState();
      refresh(true);
    },
    () => { refresh(); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

function wireEvents() {
  el.refreshBtn.onclick = () => { closeSettingsPop(); refresh(true); };
  el.locBtn.onclick = useMyLocation;
  // Home-screen locate control: the crosshair button and the place name both
  // jump to the device's current location.
  if (el.homeLocBtn) el.homeLocBtn.onclick = useMyLocation;
  if (el.placeName) {
    el.placeName.onclick = useMyLocation;
    el.placeName.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); useMyLocation(); } };
  }
  if (el.searchBack) el.searchBack.onclick = closeSearch;
  if (el.mapPickConfirm) el.mapPickConfirm.onclick = confirmMapPick;
  if (el.bottomNav) el.bottomNav.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => navTo(b.dataset.nav));
  window.addEventListener("scroll", onPageScroll, { passive: true });
  if (el.homeNewsMore) el.homeNewsMore.onclick = () => navTo("news");
  if (el.newsSheet) {
    const sc = el.newsSheet.querySelector(".sheet-scroll");
    if (sc) sc.addEventListener("scroll", onNewsScroll, { passive: true });
  }
  // Light-dismiss for the settings drop-up: any tap outside it (and outside
  // the nav, whose own buttons manage it) folds it back into the bar.
  document.addEventListener("pointerdown", (e) => {
    if (!state.popOpen) return;
    if (el.settingsPop.contains(e.target) || el.bottomNav.contains(e.target)) return;
    closeSettingsPop();
  });
  if (el.radarFull) el.radarFull.onclick = () => setMapFull(el.radarSheet, el.radarFull, () => radar.map);
  if (el.searchFull) el.searchFull.onclick = () => setMapFull(el.searchSheet, el.searchFull, () => mapPick);
  wireLocationSearch();
  if (el.creditsBtn) el.creditsBtn.onclick = () => openDetail("credits");

  el.unitSeg.querySelectorAll("[data-units]").forEach((b) => {
    b.onclick = () => {
      if (state.units === b.dataset.units) return;
      state.units = b.dataset.units;
      syncControls();
      saveState();
      refresh(true);
    };
  });

  if (el.animToggle) el.animToggle.onclick = () => {
    state.animate = !(state.animate !== false);   // flip on/off
    syncControls();
    saveState();
    updateSkyPlayback();
    if (state.data) render(state.data);
  };

  el.hourlyMore.onclick = () => openDetail("temp", "hourly");
  el.dailyMore.onclick = () => openDetail("temp", "daily");
  el.sheetBack.onclick = sheetBack;
  el.windCard.onclick = () => openDetail("wind");
  // Sun and moon cards are divs (their innerHTML is rebuilt each render), so
  // give them the button semantics the wind card gets for free from <button>.
  const cardButton = (elm, label, open) => {
    if (!elm) return;
    elm.setAttribute("role", "button");
    elm.setAttribute("tabindex", "0");
    elm.setAttribute("aria-label", label);
    elm.onclick = open;
    elm.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
  };
  cardButton(el.moonCard, "Open moon detail", () => openDetail("moon"));
  cardButton(el.sunCard, "Open sun detail", () => openDetail("sun"));
  el.detailGrid.addEventListener("click", (e) => {
    const card = e.target.closest("[data-metric]");
    if (card) openDetail(card.dataset.metric, card.dataset.range || "hourly");
  });
  el.radarPreview.onclick = () => openRadar();
  el.radarMore.onclick = () => openRadar();
  el.radarBack.onclick = closeRadar;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) => b.onclick = () => {
    // A tap means the user found the picker - cancel the one-time reveal timer.
    if (radarHintTimer) { clearTimeout(radarHintTimer); radarHintTimer = null; }
    // Collapsed: only the active icon is tappable - the tap opens the picker.
    // Expanded: the tap chooses a layer, then the picker folds back up.
    if (!layerExpanded) { setLayerExpanded(true); return; }
    if (b.dataset.layer !== radar.mode) applyMode(b.dataset.layer);
    setLayerExpanded(false);
  });
  // Tapping anywhere outside the open picker collapses it gracefully.
  el.radarSheet.addEventListener("click", (e) => {
    if (layerExpanded && !e.target.closest("#layerSeg")) setLayerExpanded(false);
  });
  el.radarPlay.onclick = toggleRadarPlay;
  el.radarScrub.oninput = () => { stopRadarPlay(); showFrame(Number(el.radarScrub.value), true); };
  el.tabSeg.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => setRange(b.dataset.tab);
  });

  let scrubbing = false;
  el.graph.addEventListener("pointerdown", (e) => { scrubbing = true; showChartPoint(e.clientX); });
  el.graph.addEventListener("pointermove", (e) => { if (scrubbing) showChartPoint(e.clientX); });
  const endScrub = () => { scrubbing = false; };
  el.graph.addEventListener("pointerup", endScrub);
  el.graph.addEventListener("pointercancel", endScrub);
  el.graph.addEventListener("pointerleave", endScrub);

  // The home day-overview chart is scrubbable too; it clears on release.
  if (el.dayGraph) {
    let dayScrub = false;
    el.dayGraph.addEventListener("pointerdown", (e) => { dayScrub = true; showDayPoint(e.clientX); });
    el.dayGraph.addEventListener("pointermove", (e) => { if (dayScrub) showDayPoint(e.clientX); });
    const endDay = () => { if (dayScrub && dayRedraw) dayRedraw(); dayScrub = false; };
    el.dayGraph.addEventListener("pointerup", endDay);
    el.dayGraph.addEventListener("pointercancel", endDay);
    el.dayGraph.addEventListener("pointerleave", endDay);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAlertModal(); closeSheet(); closeSettingsPop(); closeRadar(); closeSearch(); }
  });

  if (el.alertModalClose) el.alertModalClose.onclick = closeAlertModal;
  if (el.alertOverlay) el.alertOverlay.onclick = (e) => { if (e.target === el.alertOverlay) closeAlertModal(); };
  if (el.newsBack) el.newsBack.onclick = closeNews;

  window.addEventListener("resize", () => {
    Sky.resize();
    if (radar.preview) radar.preview.invalidateSize();
    if (state.data) { renderDayView(); renderNowcast(); }
    if (!state.sheetOpen) return;
    if (state.detail.metric === "uv") drawUvChart(state.data?.air?.hourly);
    else if (state.detail.metric !== "aqi") drawDetailChart();
  });

  // Pause / resume the sky when the tab hides or a full sheet opens (the sky is
  // Home-only). The style observer catches the body overflow lock every sheet
  // sets; the class observer catches sheets toggling their .is-open state.
  document.addEventListener("visibilitychange", updateSkyPlayback);
  new MutationObserver(scheduleSkyPlayback).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });

  initGestures();
}

async function refresh(force) {
  setBusy(true);
  if (force) setStatus("Refreshing…");
  try {
    const [omj, place, air, alerts, yesterday] = await Promise.all([
      fetchOpenMeteo(state.loc.lat, state.loc.lon, state.units),
      fetchPlaceName(state.loc.lat, state.loc.lon).catch(() => null),
      fetchAir(state.loc.lat, state.loc.lon).catch(() => null),
      fetchAlerts(state.loc.lat, state.loc.lon).catch(() => null),
      fetchYesterday(state.loc.lat, state.loc.lon, state.units).catch(() => null)
    ]);
    const { current, forecast, points, minutely } = adaptOpenMeteo(omj, place, state.loc.lat, state.loc.lon);
    const data = { current, forecast, air, hourly: points, minutely, alerts, yesterday };
    state.data = data;
    saveCache(data);
    render(data);
    setStatus(`Updated ${fmtClock(Date.now() / 1000, current.timezone || 0)}`);
    loadNews();
  } catch (err) {
    if (state.data) setStatus(`Offline, showing saved weather. (${err.message})`);
    else setStatus(`Couldn't load weather. ${err.message}`);
  } finally {
    setBusy(false);
  }
}

async function fetchJSON(url, timeoutMs = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { cache: "no-store", signal: ctl.signal });
  } catch (err) {
    throw err.name === "AbortError" ? new Error("Request timed out") : err;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text || res.statusText }; }
  if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
  return data;
}

const GEOMET_WMS = "https://geo.weather.gc.ca/geomet";
const GEOMET_ALERTS_LAYER = "Current-Alerts";

async function fetchAlerts(lat, lon) {
  if (!inCanada(lat, lon)) return [];
  const d = 0.05;
  const params = new URLSearchParams({
    SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetFeatureInfo",
    LAYERS: GEOMET_ALERTS_LAYER, QUERY_LAYERS: GEOMET_ALERTS_LAYER,
    CRS: "EPSG:4326",
    BBOX: `${lat - d},${lon - d},${lat + d},${lon + d}`,
    WIDTH: "101", HEIGHT: "101", I: "50", J: "50",
    INFO_FORMAT: "application/json", FEATURE_COUNT: "10", LANG: "en"
  });
  const j = await fetchJSON(`${GEOMET_WMS}?${params.toString()}`);
  const feats = Array.isArray(j.features) ? j.features : [];
  const seen = new Set();
  const out = [];
  for (const f of feats) {
    const a = alertFromFeature(f);
    if (!a) continue;
    const key = `${a.event}|${a.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function alertFromFeature(f) {
  const p = (f && f.properties) || {};
  if (!Object.keys(p).length) return null;
  const name = p.alert_name_en || p.alert_type || "Weather alert";
  return {
    event: titleCase(name),
    description: alertSummary(p.alert_text_en || ""),
    start: parseWhen(p.validity_datetime || p.publication_datetime),
    end: parseWhen(p.event_end_datetime || p.expiration_datetime),
    sender_name: "Environment Canada",
    colour: String(p.risk_colour_en || "").toLowerCase(),
    type: String(p.alert_type || "").toLowerCase()
  };
}

function titleCase(s) {
  return String(s).replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function alertSummary(s) {
  return String(s).replace(/[\u2014\u2013]/g, "-").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function parseWhen(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// Environment Canada publishes the official measured AQHI through its OGC API
// (api.weather.gc.ca). Pull the observation stations near a point and use the
// closest one. Returns null outside Canada or when the service is unreachable,
// so callers fall back to the modelled estimate. Never throws.
async function fetchEcccAqhi(lat, lon) {
  if (lat < 41 || lat > 84 || lon < -142 || lon > -52) return null; // Canada only
  // Longitude degrees shrink toward the poles; scale the box and the distance by
  // cos(lat) so "nearest" is true ground distance, not raw degrees.
  const coslat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  // The collection is a time series (many hourly rows per station), so we must
  // pin the *latest* row - a stale morning peak is exactly how "10+" shows when
  // the current reading is 3. Any date/time-ish property is the observation time.
  const rowTime = (p) => {
    for (const k in p) if (/date|time/i.test(k)) { const t = Date.parse(p[k]); if (Number.isFinite(t)) return t; }
    return 0;
  };
  const rowTimeStr = (p) => { for (const k in p) if (/date|time/i.test(k) && Number.isFinite(Date.parse(p[k]))) return p[k]; return null; };
  // Widen the search in rings. Cities resolve on the first, tight ring; rural
  // areas fall through to the wider ones and still find their community station,
  // instead of coming up empty and dropping to the over-reading modelled value.
  for (const r of [2.5, 6, 12]) {
    const bbox = `${lon - r / coslat},${lat - r},${lon + r / coslat},${lat + r}`;
    const base = `${AQHI_BASE}/collections/aqhi-observations-realtime/items?f=json&bbox=${bbox}&limit=1000`;
    let json;
    // Ask newest-first so the current hour wins even if the timestamps don't
    // parse; fall back to an unsorted query if the server rejects sortby.
    try { json = await fetchJSON(`${base}&sortby=-observation_datetime`, 8000); }
    catch { try { json = await fetchJSON(base, 8000); } catch { return null; } }
    const feats = json && Array.isArray(json.features) ? json.features : [];
    let best = null, bestD = Infinity, bestT = -Infinity;
    for (const f of feats) {
      const p = f.properties || {};
      let raw = p.aqhi;
      if (raw == null) { const k = Object.keys(p).find((k) => /^aqhi/i.test(k)); if (k) raw = p[k]; }
      const v = (typeof raw === "string" && raw.includes("+")) ? 11 : Number(raw);
      if (!Number.isFinite(v)) continue;
      const c = f.geometry && f.geometry.coordinates;
      if (!c || c.length < 2) continue;
      const dLon = (c[0] - lon) * coslat, dLat = c[1] - lat;
      const d = dLon * dLon + dLat * dLat, t = rowTime(p);
      // Nearest station wins; for the same station keep the most recent reading.
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && t > bestT)) {
        best = { aqhi: v, station: p.location_name_en || p.location_name || p.name || null, time: rowTimeStr(p) };
        bestD = d; bestT = t;
      }
    }
    if (best) return best;
  }
  return null;
}

async function fetchAir(lat, lon) {
  const cur = "current=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,uv_index";
  const hourly = "hourly=uv_index,ozone,nitrogen_dioxide,pm2_5&forecast_days=1";
  // Fetch the modelled pollutants and the official AQHI in parallel so the
  // government call adds no latency and a failure never blocks the air data.
  const [json, eccc] = await Promise.all([
    fetchJSON(`${AIR_BASE}?latitude=${lat}&longitude=${lon}&${cur}&${hourly}&timezone=auto`),
    fetchEcccAqhi(lat, lon)
  ]);
  const out = json.current || {};
  out.hourly = json.hourly || null;
  if (eccc) { out.aqhi = eccc.aqhi; out.aqhiStation = eccc.station; out.aqhiTime = eccc.time; }
  return out;
}

// Local weather news via the user's Cloudflare Worker, which proxies a Google
// News RSS search (browsers can't fetch that feed directly). The worker may
// return JSON or raw RSS XML, so parseNews handles both. Never throws.
async function fetchNews() {
  let text;
  try {
    const res = await fetch(NEWS_PROXY + Date.now(), { cache: "no-store" });
    if (!res.ok) return [];
    text = await res.text();
  } catch { return []; }
  return parseNews(text);
}

// Decode HTML entities that arrive in feed text (e.g. &#8216; -> a curly
// quote). A detached textarea decodes text only and never runs scripts; callers
// still escapeHTML before writing to the DOM, so decode-then-escape stays safe.
let _entityEl = null;
function decodeEntities(s) {
  if (!s) return "";
  _entityEl = _entityEl || document.createElement("textarea");
  _entityEl.innerHTML = String(s);
  return _entityEl.value;
}

// Google News titles read "Headline - Publisher"; split the publisher out.
function newsSourceFromTitle(t) { const m = decodeEntities(t).match(/\s+-\s+([^-]+)$/); return m ? m[1].trim() : ""; }
function newsCleanTitle(t) { const s = decodeEntities(t).trim(); return s.replace(/\s+-\s+[^-]+$/, "").trim() || s; }

// Reduce a feed description to a plain-text snippet: drop HTML, decode entities,
// collapse whitespace. Truncate on a word boundary when it runs long.
function newsSummary(raw) {
  if (!raw) return "";
  // Decode entities FIRST (twice, since feeds sometimes double-encode), then
  // strip tags. Stripping before decoding lets encoded <a href> anchors survive
  // and show up as raw HTML text. Paragraph breaks kept for longer summaries.
  let s = decodeEntities(decodeEntities(String(raw)));
  s = s.replace(/<\/(?:p|div|li|h[1-6])>|<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ");
  return s.replace(/[ \t\f\r]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{2,}/g, "\n").trim();
}
function newsTruncate(s, n) {
  if (!s || s.length <= n) return s || "";
  let cut = s.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  if (sp > n * 0.6) cut = cut.slice(0, sp);
  return cut.replace(/[\s.,;:]+$/, "") + "…";
}

// Last-resort publisher name from the article's own domain (so items are never
// all mislabelled with one source). Returns "" for Google redirect links.
const NEWS_DOMAINS = {
  "ctvnews.ca": "CTV News", "cbc.ca": "CBC", "globalnews.ca": "Global News",
  "theweathernetwork.com": "The Weather Network", "thestar.com": "Toronto Star",
  "lfpress.com": "London Free Press", "weather.gc.ca": "Environment Canada",
  "thespec.com": "The Spectator", "nationalpost.com": "National Post"
};
function newsSourceFromLink(link) {
  try {
    const h = new URL(link).hostname.replace(/^www\./, "").toLowerCase();
    if (/(^|\.)google\./.test(h)) return "";
    for (const d in NEWS_DOMAINS) if (h === d || h.endsWith("." + d)) return NEWS_DOMAINS[d];
    const core = h.split(".").slice(-2, -1)[0] || "";
    return core ? core.charAt(0).toUpperCase() + core.slice(1) : "";
  } catch { return ""; }
}

// Pull a publisher name from a JSON item, wherever a feed might tuck it away.
function newsPickSource(it) {
  const s = it.source;
  const cand = (s && (s.title || s.name)) || (typeof s === "string" ? s : "")
    || it.publisher || it.sourceName || it.author || it.creator || it["dc:creator"] || "";
  return (cand ? decodeEntities(String(cand)).trim() : "") || newsSourceFromTitle(it.title || "");
}

// The feed is a broad "weather" search, so non-weather stories slip in. Keep
// only headlines that mention a weather topic. A leading word boundary avoids
// mid-word false hits (rain vs training), while open ends allow suffixes
// (rain/rains/rainfall, freez/freezing).
const NEWS_WEATHER_RE = /\b(?:weather|forecast|temperature|celsius|fahrenheit|rain|drizzle|downpour|shower|snow|flurr|squall|blizzard|sleet|ice|icy|freez|frost|slush|storm|thunder|lightning|hail|tornado|wind|gust|breez|heat|humid|muggy|sunny|sunshine|sunset|cloud|overcast|fog|smog|smoke|wildfire|uv index|air quality|aqhi|flood|drought|warning|watch|advisory|meteorolog|environment canada|climate|chill|vortex|precipitat|hurricane|cyclone|warm|cold)/i;
function newsIsWeather(title) { return NEWS_WEATHER_RE.test(String(title || "")); }

function parseNews(text) {
  let items = null;
  try {
    const j = JSON.parse(text);
    items = j.items || j.articles || j.entries || (Array.isArray(j) ? j : null);
    if (items) items = items.map((it) => ({
      title: newsCleanTitle(it.title || ""),
      link: it.link || it.url || it.guid || "",
      source: newsPickSource(it),
      ts: parseWhen(it.pubDate || it.published || it.date || it.pubdate || it.isoDate || ""),
      summary: newsSummary(it.description || it.summary || it.contentSnippet || it.content || it.content_text || "")
    }));
  } catch { /* not JSON, try XML below */ }
  if (!items) items = parseRssXml(text);
  return (items || [])
    .filter((a) => a.title && a.link && newsIsWeather(a.title))
    .map((a) => ({ ...a, source: (typeof a.source === "string" && a.source.trim()) ? a.source.trim() : newsSourceFromLink(a.link) }))
    .slice(0, 20);
}

function parseRssXml(text) {
  let doc;
  try { doc = new DOMParser().parseFromString(text, "text/xml"); } catch { return []; }
  if (!doc || doc.querySelector("parsererror")) return [];
  const tag = (it, name) => it.getElementsByTagName(name)[0]?.textContent?.trim() || "";
  return [...doc.querySelectorAll("item")].map((it) => {
    const q = (s) => it.querySelector(s)?.textContent?.trim() || "";
    const rawTitle = q("title");
    const src = tag(it, "source") || tag(it, "dc:creator") || tag(it, "creator") || tag(it, "author");
    return {
      title: newsCleanTitle(rawTitle),
      link: q("link") || it.querySelector("guid")?.textContent?.trim() || "",
      source: src || newsSourceFromTitle(rawTitle),
      ts: parseWhen(q("pubDate") || tag(it, "dc:date") || tag(it, "published") || tag(it, "updated")),
      summary: newsSummary(tag(it, "description") || tag(it, "content:encoded") || tag(it, "summary") || tag(it, "content"))
    };
  });
}

function saveNews(articles) {
  try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), articles })); } catch { /* storage full or disabled */ }
}
function loadNewsCache() {
  try {
    const j = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || "null");
    if (!j || !Array.isArray(j.articles) || Date.now() - (j.ts || 0) > 24 * 3600e3) return [];
    return j.articles;
  } catch { return []; }
}

// Fetch fresh news, but no more than once a minute so the startup prewarm and
// the first weather refresh do not double-fetch. Keeps the last good list on a
// failed fetch instead of blanking the section.
async function loadNews(force) {
  const now = Date.now();
  if (!force && state.newsLoadedAt && now - state.newsLoadedAt < 60000) return;
  state.newsLoadedAt = now;
  const arr = await fetchNews();
  if (arr && arr.length) { state.news = arr; saveNews(arr); }
  else state.newsLoadedAt = 0;
  renderNewsAll();
}

// Group label for a publish time: Today / Yesterday / weekday and date.
function newsGroupLabel(ts) {
  if (!ts) return "Earlier";
  const tz = state.tz || 0;
  const day = (t) => Math.floor((t + tz) / 86400);
  const diff = day(Math.floor(Date.now() / 1000)) - day(ts);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date((ts + tz) * 1000);
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${wd}, ${mo} ${d.getUTCDate()}`;
}

// One article card. `cls` swaps the frame: news-item on Home, news-tile inside
// the news-screen folders. Always links straight out to the source. `idx`
// (Home only) renders a plain rank number to the left, top-aligned, where the
// article's lead image used to sit.
function newsCardHtml(a, cls, idx) {
  const meta = [a.source, a.ts ? fmtClock(a.ts, state.tz || 0) : ""].filter(Boolean).map(escapeHTML).join(" · ");
  const tN = (a.title || "").toLowerCase(), sN = (a.summary || "").toLowerCase();
  const redundant = !sN || (tN && (sN.startsWith(tN.slice(0, 40)) || tN.startsWith(sN.slice(0, 40))));
  const summary = redundant ? "" : newsTruncate(a.summary, 150);
  const numEl = Number.isInteger(idx) ? `<span class="news-num" aria-hidden="true">${idx + 1}</span>` : "";
  return `<a class="${cls}" href="${escapeHTML(a.link)}" target="_blank" rel="noopener noreferrer">
    ${numEl}
    <span class="news-body">
      <span class="news-title">${escapeHTML(a.title)}</span>
      ${summary ? `<span class="news-summary">${escapeHTML(summary)}</span>` : ""}
      <span class="news-foot"><span class="news-meta">${meta}</span><i class="ph ph-arrow-up-right news-go" aria-hidden="true"></i></span>
    </span>
  </a>`;
}

function newsSorted(articles) {
  return (articles || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function renderNewsAll() {
  renderHomeNews(state.news || []);
  renderNews(state.news || []);
}

// Home: the five most recent, with a click-through to the full news screen.
function renderHomeNews(articles) {
  if (!el.homeNews || !el.homeNewsList) return;
  const list = newsSorted(articles).slice(0, 5);
  if (!list.length) { el.homeNews.hidden = true; return; }
  el.homeNewsList.innerHTML = list.map((a, i) => newsCardHtml(a, "news-item", i)).join("");
  el.homeNews.hidden = false;
}

// News screen: articles newest-first, each day a folder of article tiles.
function renderNews(articles) {
  if (!el.newsList) return;
  const list = newsSorted(articles);
  if (!list.length) {
    el.newsList.innerHTML = `<p class="news-empty">No weather news right now.</p>`;
    return;
  }
  const groups = [];
  for (const a of list) {
    const label = newsGroupLabel(a.ts);
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push(a);
  }
  el.newsList.innerHTML = groups.map((g) =>
    section(escapeHTML(g.label), `<div class="news-tiles">${g.items.map((a) => newsCardHtml(a, "news-tile")).join("")}</div>`)
  ).join("");
}

function openNews() {
  if (!el.newsSheet || state.newsOpen) return;
  state.newsOpen = true;
  renderNews(state.news || []);
  loadNews();
  el.newsSheet.classList.add("is-open");
  el.newsSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const sc = el.newsSheet.querySelector(".sheet-scroll");
  if (sc) sc.scrollTop = 0;
  syncNav();
}
function closeNews() {
  if (!el.newsSheet || !state.newsOpen) return;
  state.newsOpen = false;
  el.newsSheet.classList.remove("is-open");
  el.newsSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  syncNav();
}

function wmoMain(code) {
  if (code == null) return "Clouds";
  if (code === 0 || code === 1) return "Clear";
  if (code === 2 || code === 3) return "Clouds";
  if (code === 45 || code === 48) return "Mist";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return "Clouds";
}

async function fetchOpenMeteo(lat, lon, units) {
  const tu = units === "imperial" ? "fahrenheit" : "celsius";
  const wu = units === "imperial" ? "mph" : "ms";
  const hourly = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,visibility,cape,freezing_level_height";
  const current = "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,rain,showers,snowfall,weather_code,is_day,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover,cape,freezing_level_height";
  const url = `${WX_BASE}?latitude=${lat}&longitude=${lon}&current=${current}&hourly=${hourly}&minutely_15=precipitation&daily=sunrise,sunset,uv_index_max&temperature_unit=${tu}&wind_speed_unit=${wu}&timeformat=unixtime&timezone=auto&forecast_days=7`;
  return fetchJSON(url);
}

async function fetchYesterday(lat, lon, units) {
  const tu = units === "imperial" ? "fahrenheit" : "celsius";
  const url = `${WX_BASE}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min&past_days=1&forecast_days=1&temperature_unit=${tu}&timezone=auto`;
  const j = await fetchJSON(url);
  const D = j.daily || {};
  const max = D.temperature_2m_max?.[0], min = D.temperature_2m_min?.[0];
  if (max == null || min == null) return null;
  return { max, min };
}

async function fetchPlaceName(lat, lon) {
  const r = await fetchJSON(`${GEO_BASE}/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${API_KEY}`);
  const g = Array.isArray(r) ? r[0] : null;
  return g ? { name: g.name, country: g.country } : null;
}

function wmoDesc(code) {
  const map = { 0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm" };
  return map[code] || wmoMain(code);
}

function wmoIcon(code, isDay) {
  const dn = isDay ? "d" : "n";
  if (code === 0) return "01" + dn;
  if (code === 1) return "02" + dn;
  if (code === 2) return "03" + dn;
  if (code === 3) return "04" + dn;
  if (code === 45 || code === 48) return "50" + dn;
  if (code >= 51 && code <= 57) return "09" + dn;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "10" + dn;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "13" + dn;
  if (code >= 95) return "11" + dn;
  return "03" + dn;
}

function omWeather(code, isDay) {
  return [{ main: wmoMain(code), description: wmoDesc(code), icon: wmoIcon(code, isDay) }];
}

function adaptOpenMeteo(j, place, lat, lon) {
  const H = j.hourly || {};
  const times = H.time || [];
  const at = (arr, i) => (arr && arr[i] != null ? arr[i] : null);
  const points = times.map((t, i) => {
    const rain = (at(H.rain, i) || 0) + (at(H.showers, i) || 0);
    const snow = at(H.snowfall, i) || 0;
    const pt = {
      dt: t,
      main: {
        temp: at(H.temperature_2m, i),
        feels_like: at(H.apparent_temperature, i),
        humidity: at(H.relative_humidity_2m, i),
        pressure: at(H.pressure_msl, i) != null ? Math.round(H.pressure_msl[i]) : null
      },
      weather: omWeather(at(H.weather_code, i), at(H.is_day, i)),
      code: at(H.weather_code, i),
      wind: { speed: at(H.wind_speed_10m, i) ?? 0, gust: at(H.wind_gusts_10m, i), deg: at(H.wind_direction_10m, i) },
      pop: (at(H.precipitation_probability, i) ?? 0) / 100,
      precip: at(H.precipitation, i) ?? 0,
      clouds: { all: at(H.cloud_cover, i) },
      visibility: at(H.visibility, i),
      snowDepth: at(H.snow_depth, i),
      dew: at(H.dew_point_2m, i),
      cape: at(H.cape, i),
      freezing: at(H.freezing_level_height, i)
    };
    if (rain > 0) pt.rain = { "1h": rain, "3h": rain };
    if (snow > 0) pt.snow = { "1h": snow, "3h": snow };
    return pt;
  });

  const MI = j.minutely_15 || {};
  const minutely = (MI.time || []).map((t, i) => ({ dt: t, precip: at(MI.precipitation, i) ?? 0 }));

  const C = j.current || {};
  const D = j.daily || {};
  const nowHr = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const nowPt = points.find((p) => p.dt >= nowHr) || points[0] || {};
  const current = {
    dt: C.time || Math.floor(Date.now() / 1000),
    timezone: j.utc_offset_seconds ?? 0,
    coord: { lat, lon },
    name: place?.name || "",
    sys: { country: place?.country || "", sunrise: at(D.sunrise, 0), sunset: at(D.sunset, 0) },
    main: {
      temp: C.temperature_2m,
      feels_like: C.apparent_temperature,
      humidity: C.relative_humidity_2m,
      pressure: C.pressure_msl != null ? Math.round(C.pressure_msl) : null
    },
    weather: omWeather(C.weather_code, C.is_day),
    wind: { speed: C.wind_speed_10m ?? 0, gust: C.wind_gusts_10m, deg: C.wind_direction_10m },
    clouds: { all: C.cloud_cover },
    visibility: nowPt.visibility,
    dew: C.dew_point_2m,
    cape: C.cape,
    freezing: C.freezing_level_height
  };
  const crain = (C.rain || 0) + (C.showers || 0);
  if (crain > 0) current.rain = { "1h": crain };
  if ((C.snowfall || 0) > 0) current.snow = { "1h": C.snowfall };

  const forecast = { list: points, city: { timezone: j.utc_offset_seconds ?? 0 }, dailyUV: { time: D.time, uv: D.uv_index_max } };
  return { current, forecast, points, minutely };
}

const POLLUTANTS = {
  pm2_5: {
    name: "PM2.5",
    desc: "Tiny pollution particles that are about 30 times smaller than the width of a human hair. Because they're so small, they can travel deep into your lungs and even enter your bloodstream.",
    sources: "Wildfire smoke, wood stoves, vehicle exhaust, diesel engines, factories, power plants, candles, cooking fumes."
  },
  pm10: {
    name: "PM10",
    desc: "Larger airborne particles that can be breathed into your nose and upper airways. They can irritate your eyes, nose and throat, and some can still reach your lungs.",
    sources: "Dust, pollen, mould spores, road dust, construction sites, farming, crushed leaves, sand."
  },
  ozone: {
    name: "Ozone (O₃)",
    desc: "A harmful gas that forms when sunlight reacts with pollution from vehicles, industry and wildfire smoke. It can build up far from where the pollution started because wind can carry it long distances. It can irritate your lungs and make it harder to breathe.",
    sources: "Vehicle exhaust, industrial emissions, gasoline vapours, wildfire smoke. Ozone itself isn't emitted directly - it forms in the air from these pollutants."
  },
  nitrogen_dioxide: {
    name: "Nitrogen dioxide (NO₂)",
    desc: "A harmful gas released whenever fuel is burned. It can irritate your lungs, worsen asthma and contribute to the formation of ozone and fine particle pollution.",
    sources: "Car and truck exhaust, buses, gas stoves, gas furnaces, fireplaces, power plants, industrial facilities."
  },
  sulphur_dioxide: {
    name: "Sulphur dioxide (SO₂)",
    desc: "A harmful gas released when fuels containing sulphur are burned or certain metals are processed. It can irritate your airways and also contributes to the formation of fine particle pollution.",
    sources: "Coal and oil power plants, oil refineries, metal smelters, ships, diesel fuel, volcanic eruptions."
  },
  carbon_monoxide: {
    name: "Carbon monoxide (CO)",
    desc: "An invisible, odourless gas produced when fuel doesn't burn completely. At high levels, it reduces the amount of oxygen your blood can carry, which can be dangerous or even fatal.",
    sources: "Car engines, generators, fireplaces, wood stoves, gas furnaces, charcoal grills, gas-powered equipment, boats."
  }
};

// Canada's Air Quality Health Index (AQHI): a 1-10+ scale from Environment
// Canada that blends ground-level ozone, nitrogen dioxide and PM2.5 as 3-hour
// averages. Open-Meteo has no AQHI field, so we compute it with Environment
// Canada's own formula. O3 and NO2 arrive in ug/m3 and convert to ppb (factor
// 24.45 / molar mass, at 25C); PM2.5 stays in ug/m3.
const UGM3_TO_PPB = { ozone: 24.45 / 48.00, nitrogen_dioxide: 24.45 / 46.01 };

function aqhiValue(o3ppb, no2ppb, pm25) {
  if (o3ppb == null || no2ppb == null || pm25 == null) return null;
  const v = (1000 / 10.4) * (
    (Math.exp(0.000537 * o3ppb) - 1) +
    (Math.exp(0.000871 * no2ppb) - 1) +
    (Math.exp(0.000487 * pm25) - 1)
  );
  return Math.max(1, Math.round(v));
}

// 3-hour trailing mean of a pollutant from the hourly series, falling back to
// the current snapshot when fewer than three past hours are available.
function airAvg3(air, key) {
  const arr = air.hourly && air.hourly[key], times = air.hourly && air.hourly.time;
  if (arr && times && times.length) {
    const tz = state.tz || 0;
    const nowHr = Math.floor((Math.floor(Date.now() / 1000) + tz) / 3600) % 24;
    let i = times.findIndex((t) => Number(String(t).slice(11, 13)) === nowHr);
    if (i < 0) i = arr.length - 1;
    const vals = [];
    for (let k = Math.max(0, i - 2); k <= i; k++) if (Number.isFinite(arr[k])) vals.push(arr[k]);
    if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return air[key] != null ? air[key] : null;
}

// Whichever pollutant contributes the largest AQHI term is the driver. Uses the
// modelled pollutants, so it is informational even when the index is measured.
function aqhiDriver(air) {
  const o3 = airAvg3(air, "ozone"), no2 = airAvg3(air, "nitrogen_dioxide"), pm = airAvg3(air, "pm2_5");
  if (o3 == null || no2 == null || pm == null) return null;
  const o3p = o3 * UGM3_TO_PPB.ozone, no2p = no2 * UGM3_TO_PPB.nitrogen_dioxide;
  const terms = {
    ozone: Math.exp(0.000537 * o3p) - 1,
    nitrogen_dioxide: Math.exp(0.000871 * no2p) - 1,
    pm2_5: Math.exp(0.000487 * pm) - 1
  };
  return Object.keys(terms).reduce((a, b) => (terms[b] > terms[a] ? b : a));
}

function airHealthIndex(air) {
  if (!air) return { index: null, pollutant: null, measured: false };
  // Prefer Environment Canada's official measured AQHI when we have it.
  if (air.aqhi != null && Number.isFinite(Number(air.aqhi))) {
    return { index: Math.max(1, Math.round(Number(air.aqhi))), pollutant: aqhiDriver(air), measured: true };
  }
  // Otherwise estimate it from Open-Meteo's modelled pollutants.
  const o3 = airAvg3(air, "ozone"), no2 = airAvg3(air, "nitrogen_dioxide"), pm = airAvg3(air, "pm2_5");
  if (o3 == null || no2 == null || pm == null) return { index: null, pollutant: null, measured: false };
  const index = aqhiValue(o3 * UGM3_TO_PPB.ozone, no2 * UGM3_TO_PPB.nitrogen_dioxide, pm);
  return { index, pollutant: aqhiDriver(air), measured: false };
}

// AQHI health-risk bands (Environment Canada). Values above 10 read as "10+".
function aqhiBand(index) {
  if (index == null) return { label: "--", advice: "" };
  if (index <= 3)  return { label: "Low", advice: "Ideal air quality for outdoor activities." };
  if (index <= 6)  return { label: "Moderate", advice: "No need to change your plans unless you have symptoms like coughing or throat irritation." };
  if (index <= 10) return { label: "High", advice: "Consider reducing or rescheduling strenuous activities outdoors if you have symptoms." };
  return { label: "Very high", advice: "Reduce or reschedule strenuous activities outdoors, especially if you have symptoms." };
}
function aqhiLabel(index) {
  return index == null ? "--" : (index > 10 ? "10+" : `${index}`);
}

function uvBand(uv) {
  if (uv == null) return { label: "--", advice: "" };
  const u = Math.round(uv);
  if (u <= 2)  return { label: "Low", advice: "No protection needed." };
  if (u <= 5)  return { label: "Moderate", advice: "Wear sunglasses; use SPF 30+." };
  if (u <= 7)  return { label: "High", advice: "Seek shade midday; cover up." };
  if (u <= 10) return { label: "Very high", advice: "Extra protection. Burns happen fast." };
  return { label: "Extreme", advice: "Avoid the sun midday." };
}

function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14) / 1000;
  const now = date.getTime() / 1000;
  const age = (((now - ref) / 86400) % synodic + synodic) % synodic;
  const frac = age / synodic;
  const illum = Math.round((1 - Math.cos(frac * 2 * Math.PI)) / 2 * 100);
  const near = (a, b) => Math.abs(((frac - a) % 1 + 1.5) % 1 - 0.5) < b;
  let name;
  if (near(0, 0.02)) name = "New moon";
  else if (near(0.25, 0.02)) name = "First quarter";
  else if (near(0.5, 0.02)) name = "Full moon";
  else if (near(0.75, 0.02)) name = "Last quarter";
  else if (frac < 0.25) name = "Waxing crescent";
  else if (frac < 0.5) name = "Waxing gibbous";
  else if (frac < 0.75) name = "Waning gibbous";
  else name = "Waning crescent";
  return { name, illum, frac };
}

function moonSVG(frac) {
  const r = 23, c = 26;
  const theta = frac * 2 * Math.PI;
  const rx = Math.abs(Math.cos(theta)) * r;
  const waxing = frac < 0.5;
  const gibbous = frac > 0.25 && frac < 0.75;
  const limb = waxing ? 1 : 0;
  const term = gibbous ? limb : 1 - limb;
  const top = `${c} ${c - r}`, bot = `${c} ${c + r}`;
  const shadow = `M ${top} A ${r} ${r} 0 0 ${1 - limb} ${bot} A ${rx} ${r} 0 0 ${term} ${top} Z`;
  return `<svg viewBox="0 0 52 52" class="moon-svg" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="var(--moon-lit)"/>
    <path d="${shadow}" fill="var(--moon-shadow)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--ink)" stroke-width="1.4" opacity="0.32"/>
  </svg>`;
}

function render(data, opts) {
  const { current, forecast } = data;
  const tz = current.timezone ?? forecast.city?.timezone ?? 0;
  const w = current.weather?.[0] || {};
  const m = current.main || {};
  const sys = current.sys || {};
  const isNight = sys.sunrise && sys.sunset ? (current.dt < sys.sunrise || current.dt >= sys.sunset) : false;

  state.hourly = hourlyPoints();
  state.daily = buildDaily(forecast, tz);
  state.yesterday = data.yesterday || null;
  state.center = { lat: current.coord?.lat ?? state.loc.lat, lon: current.coord?.lon ?? state.loc.lon };
  state.tz = tz;
  state.placeName = current.name || state.loc.label;

  const heroCode = wxResolve(w, isNight);
  el.heroIcon.className = `hero-icon wx-icon ${wxCategory(heroCode)}`;
  el.heroIcon.innerHTML = wxSVG(heroCode, true);
  el.placeName.textContent = current.name ? `${current.name}${sys.country ? ", " + sys.country : ""}` : state.loc.label;
  el.condition.textContent = w.description || w.main || "Weather";
  el.tempNum.textContent = `${Math.round(m.temp ?? 0)}`;
  el.temp.classList.remove("is-loading");
  const dToday = state.daily?.[0];
  if (el.heroLo) el.heroLo.textContent = dToday && dToday.min != null ? `${Math.round(dToday.min)}°` : "--";
  if (el.heroHi) el.heroHi.textContent = dToday && dToday.max != null ? `${Math.round(dToday.max)}°` : "--";
  if (el.heroFeels) el.heroFeels.textContent = `${Math.round(m.feels_like ?? m.temp ?? 0)}°`;
  if (el.heroWhen) {
    const dNow = new Date((Math.floor(Date.now() / 1000) + tz) * 1000);
    const moShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dNow.getUTCMonth()];
    el.heroWhen.textContent = `${moShort} ${dNow.getUTCDate()} · ${fmtClock(Math.floor(Date.now() / 1000), tz)}`;
  }
  el.summary.textContent = buildSummary(current, state.daily, state.yesterday);
  renderQuickHits();
  renderAlerts(data.alerts, tz);


  renderHeroMetrics(current);

  renderHourly();
  renderDaily();
  renderNowcast();
  renderDayView();
  renderWind(current);
  renderSun(current);
  renderMoon(current);
  renderDetails(current, forecast);
  loadOnThisDay();
  renderNewsAll();

  syncMaps();
  setupScrollFx();

  if (PALETTES[themeKind()]?.isDynamic) updateDynamicBackground();
  if (state.sheetOpen) renderDetailSheet();

  // Drop the splash once real content is painted. Hold it through the initial
  // cached render (stale) so the splash lifts on the live data instead of
  // letting you watch values swap in behind it - the fetch render or the
  // safety timeout in init() takes over.
  if (!opts?.cached) revealApp();
}

let scrollFxReady = false;
function setupScrollFx() {
  if (scrollFxReady || !("IntersectionObserver" in window)) return;
  scrollFxReady = true;

  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target === el.sunCard) animateSun();
      if (e.target === el.windCard) animateCompass();
      reveal.unobserve(e.target);
    });
  }, { threshold: 0.2 });
  [el.sunCard, el.windCard].forEach((t) => t && reveal.observe(t));
}

let scrollRaf = 0;
function onPageScroll() {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const y = window.scrollY || 0;
    // Parallax: the animated mesh drifts up slower than the content, so the
    // background and foreground scroll at different rates. Skipped for reduced
    // motion. The solid page colour behind it never moves.
    if (el.meshWrap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.meshWrap.style.transform = `translate3d(0, ${(y * 0.4).toFixed(1)}px, 0)`;
    }
    updateHomeNavAffordance(y);
  });
}

// Well down the home screen, the Home nav button morphs into an up arrow:
// tapping it (which already smooth-scrolls to the top) then reads as "back to
// top", and it morphs back to the house once you are near the top again. Only
// on the bare home view - not while a sheet, radar, search or settings is up.
function updateHomeNavAffordance(y = window.scrollY || 0) {
  if (!el.homeNavBtn) return;
  const homeContext = !state.radarOpen && !state.searchOpen && !state.sheetOpen && !state.popOpen && !state.newsOpen;
  const show = homeContext && y > 400;
  el.homeNavBtn.classList.toggle("at-top", show);
  el.homeNavBtn.setAttribute("aria-label", show ? "Back to top" : "Home");
}

// Same back-to-top morph on the News tab, driven by the news sheet's scroll.
let newsScrollRaf = 0;
function onNewsScroll() {
  if (newsScrollRaf) return;
  newsScrollRaf = requestAnimationFrame(() => { newsScrollRaf = 0; updateNewsNavAffordance(); });
}
function updateNewsNavAffordance() {
  if (!el.navNews || !el.newsSheet) return;
  const sc = el.newsSheet.querySelector(".sheet-scroll");
  const show = state.newsOpen && sc && sc.scrollTop > 400;
  el.navNews.classList.toggle("at-top", show);
  el.navNews.setAttribute("aria-label", show ? "Back to top" : "Weather news");
}

function tween(ms, ease, step) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { step(1); return; }
  const t0 = performance.now();
  (function frame(now) {
    const p = Math.min(1, (now - t0) / ms);
    step(ease(p));
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
const easeInOutQuad = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

function animateSun() {
  const arc = el.sunCard && el.sunCard.querySelector(".arc-fg");
  const dot = el.sunCard && el.sunCard.querySelector(".sun-dot");
  if (!arc) return;
  const t = Number(el.sunCard.dataset.t) || 0;
  if (dot) dot.style.opacity = "0";
  tween(1100, easeOutCubic, (p) => {
    arc.style.strokeDashoffset = (t * (1 - p)).toFixed(4);
    if (dot) dot.style.opacity = String(Math.max(0, (p - 0.75) / 0.25));
  });
}

function animateCompass() {
  const g = el.windCard && el.windCard.querySelector(".compass-rot");
  if (!g) return;
  const rot = Number(el.windCard.dataset.rot) || 0;
  const kf = [[0, 0], [rot + 70, 0.34], [rot - 38, 0.6], [rot + 14, 0.82], [rot, 1]];
  tween(1500, (p) => p, (p) => {
    let a = rot;
    for (let i = 1; i < kf.length; i++) {
      if (p <= kf[i][1]) {
        const [v0, p0] = kf[i - 1], [v1, p1] = kf[i];
        const e = easeInOutQuad((p - p0) / (p1 - p0 || 1));
        a = v0 + (v1 - v0) * e;
        break;
      }
    }
    g.setAttribute("transform", `rotate(${a.toFixed(2)} 60 60)`);
  });
}

function renderHourly() {
  const tz = state.tz || 0;
  const html = state.hourly.map((it) => {
    const hh = new Date((it.dt + tz) * 1000).getUTCHours();
    return `
    <button class="card hour-card" data-open="hourly">
      <span>${fmtHour(it.dt, tz)}</span>
      ${wxIcon(it.weather?.[0], hh < 6 || hh >= 20)}
      <strong>${Math.round(it.main.temp)}°</strong>
      <span>${Math.round((it.pop || 0) * 100)}%</span>
    </button>`;
  }).join("");
  if (el.hourRail.__sig === html) return;
  el.hourRail.__sig = html;
  el.hourRail.innerHTML = html;
  el.hourRail.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openDetail("temp", "hourly"));
}

function renderDaily() {
  const html = state.daily.map((d) => `
    <button class="card day-card" data-open="daily">
      <span>${d.label}</span>
      ${wxIcon({ main: d.main, icon: d.icon }, false)}
      <strong class="hi">${Math.round(d.max)}°</strong>
      <span class="day-meta"><span class="lo">${Math.round(d.min)}°</span><span class="pop">${Math.round((d.pop || 0) * 100)}%</span></span>
    </button>`).join("");
  if (el.dayRail.__sig === html) return;
  el.dayRail.__sig = html;
  el.dayRail.innerHTML = html;
  el.dayRail.querySelectorAll("[data-open]").forEach((b, i) => b.onclick = () => openDay(i));
}

function renderSun(current) {
  const sys = current.sys || {};
  const tz = current.timezone ?? 0;
  if (!sys.sunrise || !sys.sunset) { el.sunCard.style.display = "none"; return; }
  el.sunCard.style.display = "";
  const now = current.dt || Math.floor(Date.now() / 1000);
  let t = (now - sys.sunrise) / (sys.sunset - sys.sunrise);
  t = Math.max(0, Math.min(1, t));
  const P0 = [24, 96], P1 = [150, -10], P2 = [276, 96];
  const x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t ** 2 * P2[0];
  const y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t ** 2 * P2[1];
  el.sunCard.dataset.t = t.toFixed(3);

  const rt = Math.floor(Date.now() / 1000);
  const rel = (eventUnix) => { const diff = rt - eventUnix; return diff >= 0 ? `${fmtDur(diff)} since` : `${fmtDur(-diff)} until`; };

  el.sunCard.innerHTML = `
    <i class="ph ph-caret-right card-go" aria-hidden="true"></i>
    <svg class="sun-svg" viewBox="0 0 300 104" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path class="arc-bg" d="M24,96 Q150,-10 276,96" pathLength="1"/>
      <path class="arc-fg" d="M24,96 Q150,-10 276,96" pathLength="1" stroke-dasharray="${t.toFixed(3)} 1"/>
      <circle class="sun-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>
    </svg>
    <div class="sun-times">
      <div class="sun-time">
        <span class="d-label">Sunrise</span>
        <strong>${fmtClock(sys.sunrise, tz)}</strong>
        <span class="sun-rel">${rel(sys.sunrise)}</span>
      </div>
      <div class="sun-time end">
        <span class="d-label">Sunset</span>
        <strong>${fmtClock(sys.sunset, tz)}</strong>
        <span class="sun-rel">${rel(sys.sunset)}</span>
      </div>
    </div>`;
}

function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function moonToDays(unix) { return unix / 86400 - 10957.5; }
function moonCoords(d) {
  const L = MOON_RAD * (218.316 + 13.176396 * d),
        M = MOON_RAD * (134.963 + 13.064993 * d),
        F = MOON_RAD * (93.272 + 13.229350 * d),
        l = L + MOON_RAD * 6.289 * Math.sin(M),
        b = MOON_RAD * 5.128 * Math.sin(F);
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(ECL) - Math.tan(b) * Math.sin(ECL), Math.cos(l)),
    dec: Math.asin(Math.sin(b) * Math.cos(ECL) + Math.cos(b) * Math.sin(ECL) * Math.sin(l))
  };
}
function moonAltitude(unix, lat, lon) {
  const lw = MOON_RAD * -lon, phi = MOON_RAD * lat, d = moonToDays(unix), c = moonCoords(d);
  const H = (MOON_RAD * (280.16 + 360.9856235 * d) - lw) - c.ra;
  let h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
  const hr = h < 0 ? 0 : h;
  return h + 0.0002967 / Math.tan(hr + 0.00312536 / (hr + 0.08901179));
}
function moonTimes(baseUtc, lat, lon) {
  const hc = 0.133 * MOON_RAD;
  let h0 = moonAltitude(baseUtc, lat, lon) - hc, rise, set, ye;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = moonAltitude(baseUtc + i * 3600, lat, lon) - hc;
    const h2 = moonAltitude(baseUtc + (i + 1) * 3600, lat, lon) - hc;
    const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a);
    ye = (a * xe + b) * xe + h1;
    const disc = b * b - 4 * a * h1;
    let roots = 0, x1, x2;
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
    else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
    if (rise != null && set != null) break;
    h0 = h2;
  }
  const out = {};
  if (rise != null) out.rise = Math.round(baseUtc + rise * 3600);
  if (set != null) out.set = Math.round(baseUtc + set * 3600);
  return out;
}

function renderMoon(current) {
  if (!el.moonCard) return;
  const tz = state.tz || current?.timezone || 0;
  const c = state.center || {};
  const moon = moonPhase();
  const nowUnix = Math.floor(Date.now() / 1000);
  const base = Math.floor((nowUnix + tz) / 86400) * 86400 - tz;
  const mt = Number.isFinite(c.lat) ? moonTimes(base, c.lat, c.lon) : {};
  const synodic = 29.530588853;
  let d = (((0.5 - moon.frac) % 1) + 1) % 1, days = d * synodic;
  if (days < 0.5) days += synodic;
  days = Math.round(days);
  const rows = [
    ["Illumination", `${moon.illum}%`],
    ["Moonrise", mt.rise != null ? fmtClock(mt.rise, tz) : "--"],
    ["Moonset", mt.set != null ? fmtClock(mt.set, tz) : "--"],
    ["Next full moon", `${days} ${days === 1 ? "day" : "days"}`]
  ];
  el.moonCard.innerHTML = `
    <i class="ph ph-caret-right card-go" aria-hidden="true"></i>
    <div class="moon-art">${moonSVG(moon.frac)}</div>
    <div class="moon-info">
      <div class="moon-name">${moon.name}</div>
      <div class="moon-stats">${rows.map(([k, v]) => `<div class="moon-stat"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
    </div>`;
}

function toCelsius(t) { return state.units === "imperial" ? (t - 32) * 5 / 9 : t; }
function windKmh(speed) { return (speed || 0) * (state.units === "imperial" ? 1.609 : 3.6); }

// Short clock label for a timestamp ("11pm" / "23:00"), honouring the 24h setting.
function clockHour(dt, tz) {
  const h = new Date((dt + tz) * 1000).getUTCHours();
  if (state.clock24) return `${h}:00`;
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}
// The part of the day right now, for "when is this advice for" chips.
function dayPartLabel(tz) {
  const h = new Date((Date.now() / 1000 + tz) * 1000).getUTCHours();
  if (h < 5) return "Overnight";
  if (h < 12) return "This morning";
  if (h < 17) return "This afternoon";
  if (h < 21) return "This evening";
  return "Tonight";
}
// First upcoming hour (within ~12h) that looks wet, and whether it's snow.
function nextPrecipHour() {
  const now = Math.floor(Date.now() / 1000);
  const hrs = (state.hourly || []).filter((p) => p.dt >= now).slice(0, 12);
  for (const p of hrs) {
    if ((p.pop != null && p.pop >= 0.5) || (p.precip || 0) >= 0.2 || p.rain || p.snow) {
      const snow = !!p.snow || (p.code >= 71 && p.code <= 77) || (p.code >= 85 && p.code <= 86);
      return { dt: p.dt, snow };
    }
  }
  return null;
}

// Stargazing tonight, hour by hour. Each night hour gets a "clarity" score from
// cloud cover, knocked down by haze (humidity near saturation, low visibility)
// and ruled out entirely by rain, snow or fog. We then find the best clear
// window, rate it, and factor in whether a bright moon is up to wash it out.
function stargazingTonight() {
  const tz = state.tz || 0;
  const now = Math.floor(Date.now() / 1000);
  const c = state.center || {};
  const hasLoc = Number.isFinite(c.lat) && Number.isFinite(c.lon);
  // Stargazing is a night-only thing: an hour only counts once real darkness has
  // fallen. Use nautical twilight (sun 12 deg below the horizon - when the stars
  // actually come out), falling back to civil where the sun never gets that low
  // on short summer nights. Not "any clear hour", only genuinely dark ones.
  const darkAt = (dt) => {
    if (!hasLoc) { const h = new Date((dt + tz) * 1000).getUTCHours(); return h >= 22 || h <= 4; }
    const st = sunTimes(dt, c.lat, c.lon);
    const duskDark = st.nautical.down ?? st.civil.down;   // evening: darkness falls
    const dawnDark = st.nautical.up ?? st.civil.up;        // morning: darkness lifts
    if (duskDark != null && dt >= duskDark) return true;
    if (dawnDark != null && dt <= dawnDark && (st.sunrise.up == null || dt < st.sunrise.up)) return true;
    return false;
  };
  const hrs = (state.hourly || []).filter((p) => p.dt >= now - 3600 && darkAt(p.dt)).slice(0, 12);
  if (hrs.length < 2) return null;

  const clarity = (p) => {
    const wet = (p.precip || 0) > 0.05 || p.rain || p.snow;
    const fog = p.code === 45 || p.code === 48 || (p.visibility != null && p.visibility < 3000);
    if (wet || fog) return -1;
    let s = 100 - (p.clouds?.all ?? 100);
    const t = p.main?.temp != null ? toCelsius(p.main.temp) : null;
    const d = p.dew != null ? toCelsius(p.dew) : null;
    if (t != null && d != null && t - d < 3) s -= 15;                 // humid haze
    if (p.visibility != null && p.visibility < 8000) s -= 10;
    return Math.max(0, s);
  };
  const sc = hrs.map(clarity);

  // Best run of "good" (>= 55) hours.
  let bestS = -1, bestLen = 0, s0 = -1;
  for (let i = 0; i <= sc.length; i++) {
    if (i < sc.length && sc[i] >= 55) { if (s0 < 0) s0 = i; }
    else { if (s0 >= 0 && i - s0 > bestLen) { bestLen = i - s0; bestS = s0; } s0 = -1; }
  }

  const moon = moonPhase().illum;
  if (bestLen === 0) {
    const washedOut = sc.some((v) => v < 0);
    return {
      rating: "Poor",
      note: washedOut ? "Rain or fog tonight will keep the stars hidden." : "Cloud cover will hide most stars tonight.",
      when: "Not tonight"
    };
  }

  const startDt = hrs[bestS].dt, endDt = hrs[bestS + bestLen - 1].dt + 3600;
  const windowLabel = `${clockHour(startDt, tz)}–${clockHour(endDt, tz)}`;
  const win = sc.slice(bestS, bestS + bestLen);
  const clear = Math.round(win.reduce((a, b) => a + b, 0) / win.length);

  // A bright moon dims the rating; a nearly-new or already-set moon doesn't.
  const base = Math.floor((now + tz) / 86400) * 86400 - tz;
  const mt = Number.isFinite(c.lat) ? moonTimes(base, c.lat, c.lon) : {};
  const moonSetsInWindow = mt.set != null && mt.set > startDt && mt.set < endDt + 3600;
  const moonDownFirst = mt.set != null && mt.set <= startDt;
  let moonPenalty = 0, moonNote;
  if (moon <= 15) { moonNote = "a nearly new moon leaves the sky dark"; }
  else if (moonDownFirst) { moonNote = `the ${moon}% moon has set, leaving it darker`; }
  else if (moon > 55) {
    moonPenalty = (moon - 55) * 0.35;
    moonNote = moonSetsInWindow ? `the bright ${moon}% moon sets around ${clockHour(mt.set, tz)} — darker after` : `a bright ${moon}% moon will wash out fainter stars`;
  } else { moonNote = `a ${moon}% moon overhead`; }

  const eff = clear - moonPenalty;
  const rating = eff >= 78 ? "Excellent" : eff >= 60 ? "Good" : eff >= 42 ? "Fair" : "Poor";
  const sky = clear >= 82 ? "Clear skies" : clear >= 60 ? "Mostly clear" : "Partly clear";
  return { rating, note: `${sky} around ${windowLabel}, with ${moonNote}.`, when: windowLabel };
}

function seasonalCallout() {
  const cur = state.data?.current || {};
  const today = state.daily?.[0];
  const snowSum = (state.hourly || []).slice(0, 24).reduce((a, p) => a + ((p.snow?.["1h"]) || 0), 0);
  const depth = state.hourly?.[0]?.snowDepth;
  const low = today ? today.min : cur.main?.temp;
  const high = today ? today.max : cur.main?.temp;
  const uv = state.data?.air?.uv_index;
  const gust = cur.wind?.gust;
  const round = (v) => Math.round(v);
  const tz = state.tz || 0;
  const snowWhen = nextPrecipHour();
  if (snowSum >= 0.4) return { icon: "ph-snowflake", label: "Snow expected", value: `${snowSum >= 10 ? round(snowSum) : Math.round(snowSum * 10) / 10} cm`, sub: "Allow extra time for travel and bundle up.", when: snowWhen ? `From ${clockHour(snowWhen.dt, tz)}` : "Today" };
  if (depth != null && depth > 0.02) return { icon: "ph-snowflake", label: "Snow on the ground", value: `${round(depth * 100)} cm`, sub: "Watch for icy patches underfoot.", when: "Right now" };
  if (low != null && toCelsius(low) <= 0.5) return { icon: "ph-thermometer-cold", label: "Frost tonight", value: `${round(low)}°`, sub: "Cover tender plants; roads may be icy early.", when: "Overnight" };
  if (high != null && toCelsius(high) >= 29) return { icon: "ph-thermometer-hot", label: "Hot day ahead", value: `${round(high)}°`, sub: "Stay hydrated and find shade midday.", when: "Midday peak" };
  if (uv != null && uv >= 8) return { icon: "ph-sun", label: "Very high UV", value: `${round(uv)}`, sub: "Sunscreen, hat and sunglasses recommended.", when: "10am–4pm" };
  if (gust != null && windKmh(gust) >= 45) return { icon: "ph-wind", label: "Gusty winds", value: windText(gust), sub: "Secure loose outdoor items.", when: dayPartLabel(tz) };
  return { icon: "ph-leaf", label: "Settled conditions", value: today ? `${round(high)}° / ${round(low)}°` : "--", sub: "Calm and seasonal, nothing to watch out for.", when: "Today" };
}

function seasonOf(month, lat) {
  const north = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "fall", "fall", "fall", "winter"][month];
  if (lat >= 0) return north;
  return { winter: "summer", summer: "winter", spring: "fall", fall: "spring" }[north];
}

function pickWeighted(list, n) {
  const pool = list.slice();
  const picked = [];
  // Weight by score^2 so a clearly stronger fit is picked far more often than a
  // marginal one; near-equal options still shuffle, which is what keeps the
  // refresh button useful without ever surfacing a weak suggestion.
  const wt = (o) => { const s = Math.max(o.score, 0.01); return s * s; };
  while (pool.length && picked.length < n) {
    const total = pool.reduce((s, o) => s + wt(o), 0);
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= wt(pool[i]);
      if (r <= 0) { idx = i; break; }
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function selectActivities(force) {
  const catalog = window.WEATHER_ACTIVITIES;
  const tz = state.tz || 0;
  const now = Math.floor(Date.now() / 1000);
  const sun = state.data?.current?.sys || {};
  const lh = (dt) => new Date((dt + tz) * 1000).getUTCHours();
  const fmtH = (dt) => { const h = lh(dt); return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`; };
  const daylight = (p) => (!sun.sunrise || p.dt >= sun.sunrise) && (!sun.sunset || p.dt <= sun.sunset);
  const raw = state.data?.hourly || [];
  const today = new Date((now + tz) * 1000).toISOString().slice(0, 10);
  const dayKey = (dt) => new Date((dt + tz) * 1000).toISOString().slice(0, 10);
  const dayHours = raw.filter((p) => dayKey(p.dt) === today);
  const source = dayHours.length ? dayHours : (state.hourly || []);
  if (!catalog || !source.length) return state.activities || [];

  const lat = state.center?.lat ?? state.loc?.lat ?? 45;
  const lon = state.center?.lon ?? state.loc?.lon ?? 0;
  const planKey = `${today}|${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = loadActivityPlan();
  if (!force && cached && cached.key === planKey && Array.isArray(cached.list) && cached.list.length) {
    state.activityAt = cached.at;
    state.activities = cached.list;
    return state.activities;
  }

  // Per-hour UV, aligned by local hour of day (the air feed returns today's 24
  // hourly values starting at local midnight). Falls back to null when absent.
  const uvHourly = state.data?.air?.hourly?.uv_index;
  const uvAt = (dt) => {
    if (!uvHourly || !uvHourly.length) return null;
    const h = lh(dt);
    const v = uvHourly[h];
    return Number.isFinite(v) ? v : null;
  };

  const pts = source.map((p) => ({
    dt: p.dt,
    tempC: toCelsius(p.main?.temp ?? p.main?.feels_like ?? 0),
    feelsC: toCelsius(p.main?.feels_like ?? p.main?.temp ?? 0),
    humidity: p.main?.humidity ?? 60,
    precip: p.precip || 0,
    pop: p.pop ?? 0,
    cloud: p.clouds?.all ?? 50,
    wind: windKmh(p.wind?.speed || 0),
    gust: windKmh(p.wind?.gust || p.wind?.speed || 0),
    snow: p.snow?.["1h"] || 0,
    visibility: p.visibility ?? null,
    dewC: p.dew != null ? toCelsius(p.dew) : null,
    uv: uvAt(p.dt),
    cape: p.cape ?? 0,
    isDay: daylight(p)
  }));
  const dayPool = pts.filter((p) => p.isDay);
  const evePool = pts.filter((p) => { const h = lh(p.dt); return h >= 17 && h <= 23; });
  const nightPool = pts.filter((p) => { const h = lh(p.dt); return h >= 21 || h <= 4; });
  const dawnPool = pts.filter((p) => sun.sunrise && p.dt >= sun.sunrise && p.dt - sun.sunrise <= 7200);
  const goldenPool = pts.filter((p) => (sun.sunrise && Math.abs(p.dt - sun.sunrise) <= 3600) || (sun.sunset && Math.abs(p.dt - sun.sunset) <= 3600));
  const twilightPool = pts.filter((p) => (sun.sunset && p.dt > sun.sunset && p.dt - sun.sunset <= 2700) || (sun.sunrise && p.dt < sun.sunrise && sun.sunrise - p.dt <= 2700));
  const poolFor = (a) => {
    if (a.pool === "night") return nightPool;
    if (a.pool === "golden") return goldenPool;
    if (a.pool === "twilight") return twilightPool;
    if (a.pool === "dawn") return dawnPool;
    if (a.pool === "eve" || a.nocturnal) return evePool;
    return dayPool;
  };
  const labelFor = (a) => {
    if (a.pool === "night") return "Overnight";
    if (a.pool === "golden") return "Golden hour";
    if (a.pool === "twilight") return "Twilight";
    if (a.pool === "dawn") return "At dawn";
    if (a.pool === "eve" || a.nocturnal) return "All evening";
    return "All day";
  };

  const daily = state.daily?.[0] || {};
  const depth = source[0]?.snowDepth;
  const uvArr = state.data?.air?.hourly?.uv_index;
  const uvMax = uvArr && uvArr.length ? Math.max(...uvArr.filter(Number.isFinite)) : (state.data?.air?.uv_index ?? 0);
  const ctx = {
    season: seasonOf(new Date((now + tz) * 1000).getUTCMonth(), lat),
    highC: daily.max != null ? toCelsius(daily.max) : (dayPool[0]?.tempC ?? pts[0]?.tempC ?? 15),
    lowC: daily.min != null ? toCelsius(daily.min) : (pts[0]?.tempC ?? 8),
    snowOnGround: depth != null && depth > 0.02,
    wetDay: dayPool.some((p) => p.precip > 0.2),
    rainStart: (pts.find((p) => p.precip > 0.2) || {}).dt || null,
    rainRisk: dayPool.length ? Math.max(...dayPool.map((p) => p.pop || 0)) : 0,
    uvMax,
    aqi: airHealthIndex(state.data?.air).index ?? null,
    moonIllum: moonPhase().illum,
    capeMax: pts.length ? Math.max(...pts.map((p) => p.cape || 0)) : 0,
    gustMax: pts.length ? Math.max(...pts.map((p) => p.gust || 0)) : 0,
    // band(v, lo, idealLo, idealHi, hi): 1 inside the ideal range, ramping to 0
    // at the outer edges - lets an activity say how *pleasant* a value is, not
    // just whether it passes a threshold.
    band: bandScore,
    fmtH
  };

  const out = [];
  for (const a of catalog) {
    if (a.seasons && !a.seasons.includes(ctx.season)) continue;
    const appeal = a.relevance(ctx);
    if (appeal <= 0) continue;
    let good, when, quality;
    if (a.verdict) {
      const v = a.verdict(ctx);
      good = v.good; when = v.when;
      quality = v.quality != null ? v.quality : (good ? 0.7 : 0);
    } else {
      const pool = poolFor(a);
      const w = fitWindow(pool, (p) => hourFit(a, p, ctx), labelFor(a), fmtH);
      good = !!w; when = w ? w.when : (a.bad || "Not today");
      quality = w ? w.quality : 0;
    }
    // score blends how much you'd want to do it (appeal) with how good today
    // actually is for it (quality). A great-fit day multiplies appeal up; a
    // marginal one barely clears. Not-good options keep a small score so they
    // can still fill the list on a washout day.
    const score = good ? appeal * (0.5 + 1.1 * quality) : appeal * 0.12;
    out.push({ icon: a.icon, label: a.label, explain: a.explain, good, when, quality, score });
  }
  const goods = out.filter((o) => o.good).sort((x, y) => y.score - x.score);
  const bads = out.filter((o) => !o.good).sort((x, y) => y.score - x.score);
  // Reliability: only ever sample from options genuinely close to the best fit,
  // so a standout day surfaces standout activities rather than a lucky filler.
  const best = goods.length ? goods[0].score : 0;
  const strong = goods.filter((o) => o.score >= best * 0.55);
  const top = pickWeighted(strong, 4);
  if (top.length < 4) top.push(...goods.filter((o) => !top.includes(o)).slice(0, 4 - top.length));
  if (top.length < 4) top.push(...bads.slice(0, 4 - top.length));
  state.activityAt = now;
  state.activities = top;
  saveActivityPlan({ key: planKey, at: now, list: top });
  return top;
}

// 1 when v sits in [idealLo, idealHi], sloping linearly to 0 at lo and hi, and
// 0 beyond. A trapezoid so activities can grade comfort instead of hard cutoffs.
function bandScore(v, lo, idealLo, idealHi, hi) {
  if (v == null) return 0.5;
  if (v <= lo || v >= hi) return 0;
  if (v >= idealLo && v <= idealHi) return 1;
  return v < idealLo ? (v - lo) / (idealLo - lo) : (hi - v) / (hi - idealHi);
}

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// --- Granular per-hour modifiers, all driven by data we already fetch ---------
// Each returns a 0..1 multiplier on an hour's fit, so conditions bend the
// suggestion smoothly instead of flipping a switch.

// Chance of rain: a bone-dry hour is still a gamble if it's likely to rain.
// pop is 0..1 - full confidence to ~15%, sliding to a fifth by ~70%.
function rainConfidence(pop) {
  if (pop == null) return 1;
  return 1 - 0.85 * clamp01((pop - 0.15) / 0.55);
}
// Mugginess: dew point is the honest "sticky" signal (more than humidity %).
// Comfortable to ~15°C, oppressive by the mid-20s. Only bites sweaty activities.
function muggyFactor(dewC) {
  if (dewC == null) return 1;
  return 1 - 0.55 * clamp01((dewC - 15) / 9);
}
// Gustiness: gusts well above the steady wind are unpleasant or unsafe beyond
// what the average wind implies.
function gustFactor(wind, gust) {
  if (gust == null) return 1;
  return 1 - 0.5 * clamp01((gust - wind - 15) / 25);
}
// Strong sun: nudges sun-exposed activities away from the peak-UV hours toward
// the gentler ends of the day rather than banning them.
function uvFactor(uv) {
  if (uv == null) return 1;
  return 1 - 0.045 * Math.max(0, uv - 6);
}

// How good a single forecast hour is for an activity, 0..1: its comfort grade,
// then trimmed by the granular modifiers the activity opts into via flags.
function hourFit(a, p, ctx) {
  if (!a.suits(p, ctx)) return 0;
  let f = a.comfort ? clamp01(a.comfort(p, ctx)) : 0.7;
  if (!a.rainOk) f *= rainConfidence(p.pop);
  if (a.sweaty) f *= muggyFactor(p.dewC);
  if (a.gusty) f *= gustFactor(p.wind, p.gust);
  if (a.sun) f *= uvFactor(p.uv);
  return clamp01(f);
}

// Best contiguous stretch where the hourly fit clears a usable bar (bridging a
// single dip). Returns a label plus a graded quality blended from how much of
// the day works (coverage), how good it is on average (mean) and at its best
// (peak) - a smooth read rather than a yes/no.
function fitWindow(pool, fitFn, fullLabel, fmtH) {
  if (!pool.length) return null;
  const f = pool.map(fitFn);
  const GOOD = 0.4;
  const g = f.map((v) => (v >= GOOD ? 1 : 0));
  for (let i = 1; i < g.length - 1; i++) if (!g[i] && g[i - 1] && g[i + 1]) g[i] = 1;
  let bestS = -1, bestLen = 0, s = -1;
  for (let i = 0; i <= g.length; i++) {
    if (i < g.length && g[i]) { if (s < 0) s = i; }
    else { if (s >= 0 && i - s > bestLen) { bestLen = i - s; bestS = s; } s = -1; }
  }
  if (bestS < 0) return null;
  const e = bestS + bestLen - 1;
  const seg = f.slice(bestS, e + 1);
  const meanFit = seg.reduce((a, b) => a + b, 0) / seg.length;
  const peakFit = Math.max(...f);
  const coverage = Math.min(1, g.reduce((a, b) => a + b, 0) / pool.length * 1.4);
  const quality = clamp01(0.25 * coverage + 0.45 * meanFit + 0.30 * peakFit);
  const when = bestLen >= pool.length - 1 ? fullLabel
    : bestS === e ? `Around ${fmtH(pool[bestS].dt)}`
      : `${fmtH(pool[bestS].dt)} to ${fmtH(pool[e].dt)}`;
  return { when, quality };
}

function insightTileHTML(icon, label, value, sub, when) {
  return `<div class="insight-card"><i class="ph-duotone ${icon} insight-ic" aria-hidden="true"></i><div class="insight-body">`
    + `<div class="insight-top"><span class="insight-label">${label}</span>${when ? `<span class="insight-when">${when}</span>` : ""}</div>`
    + `${value ? `<div class="insight-value">${value}</div>` : ""}<div class="insight-sub">${sub}</div></div></div>`;
}

function renderQuickHits() {
  if (!el.quickHits) return;
  const wear = buildWear();
  const wearTile = insightTileHTML("ph-coat-hanger", "What to wear", wear.value, wear.sub, wear.when);
  const s = seasonalCallout();
  const seasonalTile = insightTileHTML(s.icon, s.label, s.value, s.sub, s.when);
  const star = stargazingTonight();
  const starTile = star ? insightTileHTML("ph-shooting-star", "Stargazing", star.rating, star.note, star.when) : "";
  const open = state.quickHitsOpen;
  if (open) el.quickHits.classList.add("qh-no-anim");
  el.quickHits.innerHTML = `
    <button class="qh-toggle" type="button" aria-expanded="${open}">
      <span class="qh-head"><i class="ph ph-sparkle qh-ic" aria-hidden="true"></i><span class="qh-label">Quick Hits</span></span>
      <svg class="qh-chev" viewBox="0 0 256 256" aria-hidden="true"><line class="qh-arm qh-arm-l" x1="48" y1="96" x2="128" y2="176" stroke="currentColor" stroke-linecap="round" stroke-width="20"/><line class="qh-arm qh-arm-r" x1="208" y1="96" x2="128" y2="176" stroke="currentColor" stroke-linecap="round" stroke-width="20"/></svg>
    </button>
    <div class="qh-content"><div class="qh-clip"><div class="qh-tiles">${wearTile}${seasonalTile}${starTile}</div></div></div>`;
  el.quickHits.classList.toggle("is-open", open);
  if (open) {
    requestAnimationFrame(() => requestAnimationFrame(() => el.quickHits.classList.remove("qh-no-anim")));
  }
  const toggle = el.quickHits.querySelector(".qh-toggle");
  toggle.onclick = () => {
    state.quickHitsOpen = !state.quickHitsOpen;
    el.quickHits.classList.remove("qh-no-anim");
    el.quickHits.classList.toggle("is-open", state.quickHitsOpen);
    toggle.setAttribute("aria-expanded", state.quickHitsOpen ? "true" : "false");
  };
  el.quickHits.querySelectorAll("[data-open]").forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); openDetail(b.dataset.open); };
  });
}

function renderWind(current) {
  const w = current.wind || {};
  const deg = w.deg;
  const parts = windParts(w.speed || 0);
  const gust = w.gust != null ? windText(w.gust) : "--";
  const dirTxt = deg != null ? `${Math.round(deg)}° ${direction(deg)}` : "--";
  const rot = deg != null ? (deg + 180) % 360 : 0;
  el.windCard.innerHTML = `
    <div class="wind-stats">
      <div class="wind-row"><span>Wind</span><strong>${windText(w.speed || 0)}</strong></div>
      <div class="wind-row"><span>Gusts</span><strong>${gust}</strong></div>
      <div class="wind-row"><span>Direction</span><strong>${dirTxt}</strong></div>
    </div>
    <div class="wind-compass">${compassSVG(rot, parts.v, parts.u)}</div>`;
  el.windCard.dataset.rot = String(rot);
}

function compassSVG(rot, value, unit) {
  let ticks = "";
  for (let i = 0; i < 72; i++) {
    const major = i % 9 === 0;
    const a = (i * 5) * Math.PI / 180;
    const r1 = 42, r2 = major ? 34 : 38;
    const x1 = (60 + r1 * Math.sin(a)).toFixed(1), y1 = (60 - r1 * Math.cos(a)).toFixed(1);
    const x2 = (60 + r2 * Math.sin(a)).toFixed(1), y2 = (60 - r2 * Math.cos(a)).toFixed(1);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 2 : 1}"/>`;
  }
  return `<svg viewBox="0 0 120 120" class="compass-svg" aria-hidden="true">
    <g class="compass-ticks" stroke="var(--ink)" opacity="0.4">${ticks}</g>
    <text x="60" y="9" class="compass-card">N</text>
    <text x="111" y="60" class="compass-card">E</text>
    <text x="60" y="111" class="compass-card">S</text>
    <text x="9" y="60" class="compass-card">W</text>
    <g class="compass-rot" transform="rotate(${rot} 60 60)"><path class="compass-arrow" d="M60 30 L66 40 L60 36 L54 40 Z"/></g>
    <text x="60" y="58" class="compass-value">${value}</text>
    <text x="60" y="72" class="compass-unit">${unit}</text>
  </svg>`;
}

// Inline metric icons for the hero condition bar, in the same line-drawn style
// as the originals (256 viewBox, 16 stroke, a 0.2 fill layer). Wind and eye
// animate from CSS (windgust / blink2) and the humidity drop keeps its SMIL;
// the newer sun / waves / rain are static for now. heroMetricIcon() strips any
// remaining SMIL when motion is turned off.
const HERO_METRIC_ICONS = {
  wind: `<svg class="cond-ic cond-wind" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <circle cx="120" cy="72" r="24" opacity="0.2"/><circle cx="208" cy="104" r="24" opacity="0.2"/><circle cx="152" cy="184" r="24" opacity="0.2"/>
    <path class="wind-line wl1" d="M128,192c3.39,9.15,13.67,16,24,16a24,24,0,0,0,0-48H40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
    <path class="wind-line wl2" d="M96,64c3.39-9.15,13.67-16,24-16a24,24,0,0,1,0,48H24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
    <path class="wind-line wl3" d="M184,96c3.39-9.15,13.67-16,24-16a24,24,0,0,1,0,48H32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
  </svg>`,
  drop: `<svg class="cond-ic cond-drop" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M208,144c0-72-80-128-80-128S48,72,48,144a80,80,0,0,0,160,0Z" opacity="0.2"/>
    <path d="M208,144c0-72-80-128-80-128S48,72,48,144a80,80,0,0,0,160,0Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
    <path class="drop-shine" d="M136,192c20-3.37,36.61-20,40-40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16">
      <animateTransform attributeName="transform" attributeType="XML" type="rotate" values="-26 128 144;26 128 144;-26 128 144" keyTimes="0;0.5;1" dur="3.6s" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1" repeatCount="indefinite"/>
    </path>
  </svg>`,
  eye: `<svg class="cond-ic cond-eye" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Zm0,112a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z" opacity="0.2"/>
    <path class="eye-outline" d="M128,56C48,56,16,128,16,128s32,72,112,72,112-72,112-72S208,56,128,56Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
    <circle class="eye-iris" cx="128" cy="128" r="40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16"/>
  </svg>`,
  sun: `<svg class="cond-ic cond-sun" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <circle cx="128" cy="128" r="46" opacity="0.2"/>
    <circle cx="128" cy="128" r="46" fill="none" stroke="currentColor" stroke-width="16"/>
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="16">
      <line x1="128" y1="26" x2="128" y2="8"/><line x1="128" y1="248" x2="128" y2="230"/>
      <line x1="26" y1="128" x2="8" y2="128"/><line x1="248" y1="128" x2="230" y2="128"/>
      <line x1="55" y1="55" x2="42" y2="42"/><line x1="214" y1="214" x2="201" y2="201"/>
      <line x1="55" y1="201" x2="42" y2="214"/><line x1="214" y1="42" x2="201" y2="55"/>
    </g>
  </svg>`,
  waves: `<svg class="cond-ic cond-waves" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16">
      <path d="M28,84 q25,-22 50,0 t50,0 t50,0 t50,0"/>
      <path d="M28,128 q25,-22 50,0 t50,0 t50,0 t50,0"/>
      <path d="M28,172 q25,-22 50,0 t50,0 t50,0 t50,0"/>
    </g>
  </svg>`,
  rain: `<svg class="cond-ic cond-rain" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
    <path d="M160,120a40,40,0,0,1,0,80H72a56,56,0,1,1,13.85-110.28A64,64,0,0,1,160,120Z" opacity="0.2" transform="translate(20,-22)"/>
    <path d="M160,120a40,40,0,0,1,0,80H72a56,56,0,1,1,13.85-110.28A64,64,0,0,1,160,120Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="16" transform="translate(20,-22)"/>
    <g stroke="currentColor" stroke-width="16" stroke-linecap="round">
      <line x1="96" y1="190" x2="88" y2="214"/>
      <line x1="132" y1="190" x2="124" y2="214"/>
      <line x1="168" y1="190" x2="160" y2="214"/>
    </g>
  </svg>`
};

function heroMetricIcon(key) {
  let svg = HERO_METRIC_ICONS[key] || "";
  if (state.animate === false) svg = svg.replace(/<animate[^>]*\/>/g, "");
  return svg;
}

// The hero condition bar shows the three most prominent readings right now
// (windy, humid/dry, high UV, poor air, rain, fog). Each candidate gets a
// prominence score on a shared scale and the top three win, so on a calm day it
// falls back to wind, humidity and precipitation. Feels like lives in the hero.
function renderHeroMetrics(current) {
  const m = current.main || {};
  const air = state.data?.air;
  const spd = current.wind?.speed || 0;
  const kmh = state.units === "imperial" ? spd * 1.609 : spd * 3.6;
  const h = m.humidity;
  const uv = air?.uv_index;
  const aq = airHealthIndex(air);
  const popNow = state.hourly?.[0]?.pop ?? state.data?.forecast?.list?.[0]?.pop ?? 0;
  const vis = state.hourly?.[0]?.visibility ?? current.visibility;

  const cands = [];
  cands.push({ key: "wind", label: "Wind", value: windText(spd), icon: "wind", order: 0, score: Math.max(0, kmh - 8) * 0.07 });
  if (h != null) cands.push({ key: "humidity", label: "Humidity", value: `${h}%`, icon: "drop", order: 1, score: Math.abs(h - 50) / 12 });
  if (uv != null) cands.push({ key: "uv", label: "UV", value: `${Math.round(uv)}`, icon: "sun", order: 2, score: Math.max(0, uv - 2) * 0.7 });
  if (aq.index != null) cands.push({ key: "aqi", label: "Air quality", value: aqhiLabel(aq.index), icon: "waves", order: 3, score: Math.max(0, aq.index - 2) * 0.9 });
  cands.push({ key: "precip", label: "Precip", value: `${Math.round(popNow * 100)}%`, icon: "rain", order: 4, score: (popNow * 100) / 22 });
  if (vis != null) cands.push({ key: "visibility", label: "Visibility", value: visibilityText(vis), icon: "eye", order: 5, score: (vis / 1000) < 8 ? (8 - vis / 1000) * 0.9 : 0 });

  cands.sort((a, b) => (b.score - a.score) || (a.order - b.order));
  const tiles = cands.slice(0, 3);

  el.metrics.innerHTML = tiles.map((t) => `
    <div class="metric" data-metric="${t.key}">
      ${heroMetricIcon(t.icon)}
      <strong>${t.value}</strong><span>${t.label}</span>
    </div>`).join("");
}

function renderDetails(current, forecast) {
  const m = current.main || {};
  const clouds = current.clouds || {};
  const today = state.daily[0];
  const tz = state.tz || current.timezone || 0;
  const items = [];

  const feels = Math.round(m.feels_like ?? m.temp ?? 0);
  const actual = Math.round(m.temp ?? feels);
  const fd = feels - actual;
  const fSub = Math.abs(fd) < 1 ? "Similar to the actual temperature." : fd < 0 ? `${Math.abs(fd)}° colder than actual.` : `${fd}° warmer than actual.`;
  items.push(["feels", "ph-thermometer-simple", "Feels like", `${feels}°`, fSub]);

  if (today) items.push(["temp", "ph-arrows-vertical", "High / Low", `${Math.round(today.max)}° / ${Math.round(today.min)}°`, "Today", "daily"]);

  if (m.humidity != null) {
    const dp = dewPointDisplay(m.temp, m.humidity);
    items.push(["humidity", "ph-drop", "Humidity", `${m.humidity}%`, dp != null ? `Dew point ${dp}°` : "", null, rangeMeter(m.humidity, 0, 100)]);
  } else {
    items.push(["humidity", "ph-drop", "Humidity", "--", ""]);
  }

  const pd = precipDetail(current, forecast, tz);
  const popNow = state.hourly?.[0]?.pop ?? forecast?.list?.[0]?.pop ?? 0;
  pd[6] = rangeMeter(Math.round(popNow * 100), 0, 100);
  items.push(pd);

  const air = state.data?.air;
  const aq = airHealthIndex(air);
  if (aq.index != null) {
    const b = aqhiBand(aq.index);
    items.push(["aqi", "ph-waves", "Air quality", aqhiLabel(aq.index), b.label, null, rangeMeter(Math.min(aq.index, 10), 0, 10, "Low", "High")]);
  }
  if (air && air.uv_index != null) {
    const u = uvBand(air.uv_index);
    items.push(["uv", "ph-sun", "UV index", `${Math.round(air.uv_index)}`, u.label, null, rangeMeter(air.uv_index, 0, 11)]);
  }

  const nowHr = state.hourly?.[0] || {};
  const vis = nowHr.visibility ?? current.visibility;
  const pres = nowHr.main?.pressure ?? m.pressure;
  const cloudPct = nowHr.clouds?.all ?? clouds.all;

  if (vis != null) {
    items.push(["visibility", "ph-eye", "Visibility", visibilityText(vis), visDescriptor(vis), null, rangeMeter(visVal(vis), 0, 10)]);
  } else {
    items.push(["visibility", "ph-eye", "Visibility", "--", ""]);
  }
  if (pres != null) {
    items.push(["pressure", "ph-gauge", "Pressure", `${pres}<span class="d-unit">hPa</span>`, "", null, pressureMeter(pres)]);
  } else {
    items.push(["pressure", "ph-gauge", "Pressure", "--", ""]);
  }
  items.push(["clouds", "ph-cloud", "Cloud cover", cloudPct != null ? `${cloudPct}%` : "--", cloudDescriptor(cloudPct), null, cloudPct != null ? rangeMeter(cloudPct, 0, 100) : ""]);

  // A single "scale" tile grows to double width when its reading is high enough
  // to be worth surfacing. If several qualify, the highest-priority one wins -
  // only ever one large tile at a time.
  // Thresholds are deliberately low - this is a stylistic highlight, not an
  // alert, so a tile gets featured whenever a reading is merely elevated.
  const promo = [];
  if (aq.index != null && aq.index >= 4) promo.push(["aqi", 5]);
  if (air && air.uv_index != null && air.uv_index >= 5) promo.push(["uv", 4]);
  if (popNow != null && popNow * 100 >= 40) promo.push(["precip", 3]);
  if (m.humidity != null && m.humidity >= 65) promo.push(["humidity", 2]);
  if (cloudPct != null && cloudPct >= 60) promo.push(["clouds", 1]);
  const bigMetric = promo.sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  el.detailGrid.innerHTML = items.map(([metric, icon, label, value, sub, range, spark]) => `
    <button class="detail${metric === bigMetric ? " detail--wide" : ""}" data-metric="${metric}"${range ? ` data-range="${range}"` : ""}>
      <i class="ph-duotone ${icon}"></i>
      <span class="d-label">${label}</span>
      <strong class="d-value">${value}</strong>
      ${sub ? `<span class="d-sub">${sub}</span>` : ""}
      ${spark || ""}
      <i class="ph ph-caret-right d-go"></i>
    </button>`).join("");
}

function rangeMeter(value, lo, hi, loLabel = "Low", hiLabel = "High") {
  const pct = Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100)).toFixed(1);
  return `<span class="p-meter" aria-hidden="true">
    <span class="p-track"><span class="p-fill" style="width:${pct}%"></span><span class="p-dot" style="left:${pct}%"></span></span>
    <span class="p-scale"><span>${loLabel}</span><span>${hiLabel}</span></span>
  </span>`;
}
function pressureMeter(p) { return rangeMeter(p, 980, 1040); }

function precipDetail(current, forecast, tz) {
  const snow = current.snow?.["1h"] ?? current.snow?.["3h"];
  const rain = current.rain?.["1h"] ?? current.rain?.["3h"];
  if (snow != null) return ["precip", "ph-cloud-snow", "Snow", `${snow} mm`, "Last hour"];
  if (rain != null) return ["precip", "ph-cloud-rain", "Precipitation", `${rain} mm`, "Last hour"];
  const next = nextPrecip(forecast, tz);
  return ["precip", "ph-umbrella", "Precipitation", "0 mm", next ? `Next: ${next.amt} mm ${next.when}` : "None expected soon"];
}

function nextPrecip(forecast, tz) {
  for (const it of (forecast?.list || [])) {
    const amt = (it.rain?.["3h"] || 0) + (it.snow?.["3h"] || 0);
    if (amt > 0) return { amt: Math.round(amt * 10) / 10, when: `${dayLabel(it.dt, tz)} ${fmtHour(it.dt, tz)}` };
  }
  return null;
}

function dewPointDisplay(temp, rh) {
  if (temp == null || rh == null) return null;
  const c = state.units === "imperial" ? (temp - 32) * 5 / 9 : temp;
  const a = 17.625, b = 243.04;
  const al = Math.log(rh / 100) + (a * c) / (b + c);
  const d = (b * al) / (a - al);
  return Math.round(state.units === "imperial" ? d * 9 / 5 + 32 : d);
}
function visDescriptor(v) {
  if (v == null) return "";
  if (v >= 10000) return "Perfectly clear.";
  if (v >= 6000) return "Clear view.";
  if (v >= 2000) return "A little hazy.";
  return "Low visibility.";
}
function cloudDescriptor(c) {
  if (c == null) return "";
  if (c < 10) return "Clear sky.";
  if (c < 40) return "Mostly clear.";
  if (c < 70) return "Partly cloudy.";
  if (c < 90) return "Mostly cloudy.";
  return "Overcast.";
}

function windParts(speed) {
  return state.units === "imperial" ? { v: Math.round(speed), u: "mph" } : { v: Math.round(speed * 3.6), u: "km/h" };
}
function direction(deg) {
  const d = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return d[Math.round(deg / 22.5) % 16];
}

function hourlyPoints() {
  const nowH = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const h = state.data?.hourly;
  if (h && h.length) return h.filter((it) => it.dt >= nowH).slice(0, 24);
  return (state.data?.forecast?.list || []).slice(0, 8);
}

function buildDaily(forecast, tz) {
  const uvByDate = {};
  const du = forecast.dailyUV;
  if (du?.time && du?.uv) du.time.forEach((t, i) => { uvByDate[new Date((t + tz) * 1000).toISOString().slice(0, 10)] = du.uv[i]; });
  const map = new Map();
  (forecast.list || []).forEach((it) => {
    const key = new Date((it.dt + tz) * 1000).toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { dt: it.dt, items: [] });
    map.get(key).items.push(it);
  });
  return [...map.values()].slice(0, 7).map((g) => {
    const temps = g.items.map((it) => it.main.temp);
    let rep = g.items[0], best = 99;
    g.items.forEach((it) => {
      const diff = Math.abs(new Date((it.dt + tz) * 1000).getUTCHours() - 12);
      if (diff < best) { best = diff; rep = it; }
    });
    return {
      dt: g.dt,
      label: dayLabel(g.dt, tz),
      min: Math.min(...temps),
      max: Math.max(...temps),
      pop: Math.max(...g.items.map((it) => it.pop || 0)),
      main: rep.weather?.[0]?.main || "",
      icon: rep.weather?.[0]?.icon,
      uvMax: uvByDate[new Date((g.dt + tz) * 1000).toISOString().slice(0, 10)] ?? null,
      items: g.items
    };
  });
}

function buildSummary(current, daily, yesterday) {
  const tz = state.tz || current.timezone || 0;
  const today = daily && daily[0];
  const tomorrow = daily && daily[1];
  const hrs = restOfToday(tz);
  const parts = [];
  const lead = dayLead(current, hrs, today);
  if (today) parts.push(`${lead}, with a high of ${Math.round(today.max)}° and a low of ${Math.round(today.min)}°.`);
  else parts.push(`${lead}.`);
  const precip = precipOutlook(hrs, today, tz);
  if (precip) parts.push(precip);
  const compare = compareOutlook(today, yesterday, tomorrow);
  if (compare) parts.push(compare);
  for (const note of summaryNotes(current, hrs)) parts.push(note);
  return parts.join(" ");
}

function tempCompareClause(diff, label) {
  const d = Math.round(diff);
  if (d === 0) return `about the same as ${label}`;
  return `${Math.abs(d)}° ${d > 0 ? "warmer" : "cooler"} than ${label}`;
}

function compareOutlook(today, yesterday, tomorrow) {
  if (!today || today.max == null) return null;
  const clauses = [];
  if (yesterday && yesterday.max != null) clauses.push(tempCompareClause(today.max - yesterday.max, "yesterday"));
  if (tomorrow && tomorrow.max != null) clauses.push(tempCompareClause(today.max - tomorrow.max, "tomorrow"));
  if (!clauses.length) return null;
  return `That's ${clauses.join(" and ")}.`;
}

function restOfToday(tz) {
  const now = Math.floor(Date.now() / 1000);
  const key = (t) => new Date((t + tz) * 1000).toISOString().slice(0, 10);
  const today = key(now);
  return (state.hourly || []).filter((h) => h.dt >= now - 1800 && key(h.dt) === today);
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function dayLead(current, hrs, today) {
  const mains = (hrs.length ? hrs.map((h) => h.weather?.[0]?.main) : [today && today.main]).filter(Boolean);
  const any = (re) => mains.some((m) => re.test(m));
  if (any(/thunder/i)) return "Thunderstorms are possible";
  if (any(/snow/i)) return "Snow at times";
  if (any(/rain|drizzle/i)) return "Cloudy with rain at times";
  if (any(/mist|fog|haze|smoke/i)) return "Areas of fog and haze";
  const n = mains.length || 1;
  const cloud = mains.filter((m) => /cloud/i.test(m)).length;
  const clear = mains.filter((m) => /clear/i.test(m)).length;
  if (clear >= n * 0.6) return "Clear and sunny";
  if (cloud >= n * 0.6) return "Cloudy";
  if (clear && cloud) return "A mix of sun and cloud";
  const d = current.weather?.[0]?.description || current.weather?.[0]?.main;
  return d ? cap(d) : "A mixed day";
}

function precipOutlook(hrs, today, tz) {
  if (!hrs.length) {
    const p = today ? Math.round((today.pop || 0) * 100) : 0;
    if (p >= 40) return `There is a ${p}% chance of precipitation.`;
    return p > 0 ? "Mostly dry." : "Staying dry.";
  }
  const wet = hrs.filter((h) => (h.pop || 0) >= 0.5 || /rain|drizzle|snow|thunder/i.test(h.weather?.[0]?.main || ""));
  if (!wet.length) {
    const maxPop = Math.max(...hrs.map((h) => h.pop || 0));
    return maxPop >= 0.3 ? "A slight chance of a shower later." : "Staying dry.";
  }
  const snowy = wet.some((h) => /snow/i.test(h.weather?.[0]?.main || "")) || wet.every((h) => (h.main?.temp ?? 5) <= 0);
  const type = snowy ? "snow" : "rain";
  if (wet.length >= hrs.length * 0.6) return `Periods of ${type} through the day.`;
  return `${cap(type)} likely from around ${fmtHour(wet[0].dt, tz)}.`;
}

function summaryNotes(current, hrs) {
  const out = [];
  const toC = (t) => t == null ? null : (state.units === "imperial" ? (t - 32) * 5 / 9 : t);
  const feels = (hrs.length ? hrs.map((h) => h.main?.feels_like ?? h.main?.temp) : [current.main?.feels_like ?? current.main?.temp]).filter((v) => v != null);
  if (feels.length) {
    const hi = toC(Math.max(...feels)), lo = toC(Math.min(...feels));
    if (hi >= 32) out.push("It stays hot through the afternoon, so keep water handy.");
    else if (lo <= -12) out.push("It stays bitterly cold, so dress in warm layers.");
  }
  const winds = hrs.length ? hrs.map((h) => h.wind?.gust ?? h.wind?.speed ?? 0) : [current.wind?.gust ?? current.wind?.speed ?? 0];
  const mw = Math.max(...winds);
  const kmh = state.units === "imperial" ? mw * 1.609 : mw * 3.6;
  if (kmh >= 45) out.push(`Winds pick up, gusting to ${windText(mw)}.`);
  const uvArr = state.data?.air?.hourly?.uv_index;
  const uvMax = uvArr && uvArr.length ? Math.max(...uvArr.filter(Number.isFinite)) : (state.data?.air?.uv_index ?? 0);
  if (uvMax >= 8) out.push("UV climbs to very high near midday, so sun protection matters.");
  else if (uvMax >= 6) out.push("UV is high near midday, so wear sunscreen.");
  const aqhiNow = airHealthIndex(state.data?.air).index;
  if (aqhiNow != null && aqhiNow >= 7) out.push("Air quality is poor today.");
  return out.slice(0, 2);
}

// What to wear, reasoned from how the air actually feels: apparent temperature
// (which already folds in wind chill and humidity) sets the base layer, then
// wind, mugginess, damp cold, incoming precip, strong sun and the day's swing
// each add a specific, human-sounding note. Returns { value, sub, when }.
function buildWear() {
  const cur = state.data?.current || {};
  const m = cur.main || {};
  const tz = state.tz || 0;
  if (m.temp == null && m.feels_like == null) {
    return { value: "--", sub: "Conditions unavailable right now.", when: dayPartLabel(tz) };
  }
  const feels = toCelsius(m.feels_like ?? m.temp);           // °C, for thresholds
  const tempC = m.temp != null ? toCelsius(m.temp) : feels;
  const dTemp = Math.round(m.temp ?? m.feels_like);          // display units, for text
  const dFeels = Math.round(m.feels_like ?? m.temp);
  const humidity = m.humidity ?? null;
  const dewC = cur.dew != null ? toCelsius(cur.dew) : null;
  const windK = windKmh(cur.wind?.speed);
  const gustK = cur.wind?.gust != null ? windKmh(cur.wind.gust) : null;
  const cloud = cur.clouds?.all ?? 0;
  const rainingNow = !!cur.rain, snowingNow = !!cur.snow;
  const uv = state.data?.air?.uv_index;
  const isDay = !curIsNight();

  let value, base;
  if (feels <= -12) { value = "Serious winter gear"; base = "an insulated parka, a hat, gloves and warm boots"; }
  else if (feels <= -4) { value = "Bundle up"; base = "a winter coat with a hat and gloves"; }
  else if (feels <= 3) { value = "Warm coat weather"; base = "a proper coat over a warm layer"; }
  else if (feels <= 9) { value = "Jacket weather"; base = "a warm jacket with a long sleeve underneath"; }
  else if (feels <= 15) { value = "Light layers"; base = "a light jacket or a sweater"; }
  else if (feels <= 20) { value = "Long-sleeve weather"; base = "a long sleeve or a light top"; }
  else if (feels <= 26) { value = "T-shirt weather"; base = "light clothes like a t-shirt"; }
  else if (feels <= 31) { value = "Keep it light"; base = "loose, breathable clothing"; }
  else { value = "Beat the heat"; base = "loose, breathable clothing — and keep water close"; }

  // How it feels vs the raw temperature (wind chill / humid warmth).
  let feelsClause = "";
  if (tempC - feels >= 4 && windK >= 15) feelsClause = ` It's ${dTemp}° but the ${Math.round(windK)} km/h wind makes it feel like ${dFeels}°.`;
  else if (feels - tempC >= 3 && dewC != null && dewC >= 16) feelsClause = ` Humid air makes ${dTemp}° feel like ${dFeels}°.`;
  else if (Math.abs(dTemp - dFeels) >= 2) feelsClause = ` Feels like ${dFeels}°.`;

  // Specific add-ons, in priority order; keep the two most relevant.
  const extras = [];
  if (snowingNow) extras.push("Snow is falling, so waterproof boots and a warm hat.");
  else if (rainingNow) extras.push("It's raining now — a waterproof shell or an umbrella.");
  else {
    const up = nextPrecipHour();
    if (up) extras.push(`${up.snow ? "Snow" : "Rain"} moves in around ${clockHour(up.dt, tz)}, so pack ${up.snow ? "warm, waterproof layers" : "a shell or umbrella"}.`);
  }
  if (tempC >= 24 && dewC != null && dewC >= 18) extras.push(dewC >= 21 ? "The air is oppressively humid, so stick to light, breathable fabrics." : "It's muggy out, so breathable fabrics help.");
  else if (tempC <= 12 && humidity != null && humidity >= 88 && !rainingNow) extras.push("The damp air feels raw, so a wind-resistant layer takes the bite off.");
  if (gustK != null && gustK >= 40 && !feelsClause.includes("wind")) extras.push("Gusty winds — a windbreaker cuts the chill.");
  if (uv != null && uv >= 6 && isDay && cloud < 65) extras.push(uv >= 8 ? "Strong sun: sunglasses, a hat and sunscreen." : "Sunny enough for sunglasses and a little sunscreen.");
  const lo = state.daily?.[0]?.min;
  if (isDay && lo != null && feels - toCelsius(lo) >= 7) extras.push(`Bring a layer for later — it dips to ${Math.round(lo)}° tonight.`);

  const sub = `Reach for ${base}.${feelsClause}${extras.length ? " " + extras.slice(0, 2).join(" ") : ""}`;
  return { value, sub, when: dayPartLabel(tz) };
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function alertWhen(a, tz) {
  const now = Math.floor(Date.now() / 1000);
  if (a.end && a.end > now) return `Until ${dayLabel(a.end, tz)} ${fmtHour(a.end, tz)}`;
  if (a.start && a.start > now) return `From ${dayLabel(a.start, tz)} ${fmtHour(a.start, tz)}`;
  if (a.start) return `Since ${dayLabel(a.start, tz)} ${fmtHour(a.start, tz)}`;
  return "";
}

function alertMeta(a, tz) {
  return [alertWhen(a, tz), a.sender_name].filter(Boolean).join(" · ");
}

function linkify(html) {
  return html
    .replace(/(https?:\/\/[^\s<]+?)([.,;:]?)(?=\s|$)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>$2')
    .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
}

function renderAlerts(alerts, tz) {
  const host = el.alerts;
  if (!host) return;
  const list = (alerts || []).filter((a) => a && a.event);
  if (!list.length) { host.hidden = true; host.innerHTML = ""; return; }
  host.hidden = false;
  const isTier = (c) => c === "yellow" || c === "orange" || c === "red";
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  host.innerHTML = list.map((a) => {
    const meta = escapeHTML(alertMeta(a, tz));
    const tier = isTier(a.colour) ? a.colour : "";
    return `<button class="alert${tier ? ` alert--${tier}` : ""}" type="button">
      <i class="ph ph-exclamation-mark alert-ic" aria-hidden="true"></i>
      <span class="alert-body">
        ${tier ? `<span class="alert-tier">${cap(tier)} warning</span>` : ""}
        <span class="alert-title">${escapeHTML(a.event)}</span>
        ${meta ? `<span class="alert-meta">${meta}</span>` : ""}
      </span>
      <i class="ph ph-caret-right alert-go" aria-hidden="true"></i>
    </button>`;
  }).join("") + `<button class="alert-help" type="button"><i class="ph ph-info" aria-hidden="true"></i><span>What do the alert colours mean?</span></button>`;
  [...host.querySelectorAll(".alert")].forEach((btn, i) => {
    btn.onclick = () => openAlertModal(list[i], tz);
  });
  const help = host.querySelector(".alert-help");
  if (help) help.onclick = () => openDetail("alerts");
}

function openAlertModal(a, tz) {
  if (!el.alertOverlay) return;
  el.alertModalTitle.textContent = a.event;
  el.alertModalMeta.textContent = alertMeta(a, tz);
  el.alertModalBody.innerHTML = linkify(escapeHTML((a.description || "").trim()));
  el.alertModalBody.scrollTop = 0;
  el.alertOverlay.classList.add("is-open");
  el.alertOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeAlertModal() {
  if (!el.alertOverlay || !el.alertOverlay.classList.contains("is-open")) return;
  el.alertOverlay.classList.remove("is-open");
  el.alertOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function applyPalette(kind) {
  const p = PALETTES[kind] || PALETTES.lemon;
  const r = document.documentElement.style;
  r.setProperty("--bg", p.bg);
  r.setProperty("--ink", p.ink);
  r.setProperty("--surface", p.surface);
  r.setProperty("--on-surface", p.onSurface);
  r.setProperty("--surface-accent", p.accent);
  r.setProperty("--moon-lit", p.dark ? "var(--ink)" : "transparent");
  r.setProperty("--moon-shadow", p.dark ? "var(--bg)" : "var(--ink)");
  const sb = p.statusBar || p.surface;
  r.setProperty("--statusbar", sb);
  r.setProperty("--theme", sb);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", sb);
  document.documentElement.setAttribute("data-theme", kind);
  document.documentElement.setAttribute("data-tint", state.tinted ? "on" : "off");
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  state.dark = !!p.dark;
  // Alert tiers and the neutral alert surface come from the curated palette,
  // switching bg/fg by mode so severity reads cleanly in light and dark.
  for (const k in ALERT_TOKENS) {
    const t = ALERT_TOKENS[k];
    r.setProperty(`--tier-${k}-bg`, p.dark ? t.dbg : t.lbg);
    r.setProperty(`--tier-${k}-fg`, p.dark ? t.dfg : t.lfg);
  }
  r.setProperty("--neutral-card", p.dark ? NEUTRAL_SURFACE.card.dark : NEUTRAL_SURFACE.card.light);
  r.setProperty("--neutral-card-hi", p.dark ? NEUTRAL_SURFACE.cardHi.dark : NEUTRAL_SURFACE.cardHi.light);
  updateMapTheme();
  if (state.data) { renderDayView(); renderNowcast(); }

  if (p.isDynamic) startDynamicTheme(); else stopDynamicTheme();
}

function themeKind() {
  return PALETTES[state.theme] ? state.theme : "bloom";
}

function wxCode(main, isNight) {
  const m = String(main || "").toLowerCase();
  const dn = isNight ? "n" : "d";
  if (m.includes("thunder")) return "11" + dn;
  if (m.includes("drizzle")) return "09" + dn;
  if (m.includes("rain")) return "10" + dn;
  if (m.includes("snow")) return "13" + dn;
  if (m.includes("mist") || m.includes("fog") || m.includes("haze") || m.includes("smoke")) return "50" + dn;
  if (m.includes("cloud")) return "03" + dn;
  return "01" + dn;
}
function wxResolve(w, isNight) {
  const code = w && w.icon;
  if (code && typeof METEOCONS !== "undefined" && METEOCONS[code]) return code;
  return wxCode(w && w.main, isNight);
}
let wxUid = 0;
function wxSVG(code, animated) {
  let svg = (typeof METEOCONS !== "undefined" && (METEOCONS[code] || METEOCONS["03d"])) || "";
  if (!svg) return "";
  if (!animated || state.animate === false) svg = svg.replace(/<animate[^>]*\/>/g, "");
  const uid = "w" + (wxUid++);
  svg = svg.replace(/\bid="([^"]+)"/g, (mm, v) => `id="${v}${uid}"`).replace(/url\(#([^)]+)\)/g, (mm, v) => `url(#${v}${uid})`);
  return svg;
}
// Category class for an icon code, used to tint icons in "Colour" mode.
function wxCategory(code) {
  const c = String(code || "").slice(0, 2);
  const night = String(code || "").endsWith("n");
  if (c === "01") return night ? "wx-clear-n" : "wx-clear-d";
  if (c === "02" || c === "03" || c === "04") return "wx-clouds";
  if (c === "09" || c === "10") return "wx-rain";
  if (c === "11") return "wx-storm";
  if (c === "13") return "wx-snow";
  if (c === "50") return "wx-mist";
  return "wx-clouds";
}
function wxIcon(w, isNight, cls) {
  const code = wxResolve(w, isNight);
  return `<i class="wx-icon ${wxCategory(code)}${cls ? " " + cls : ""}" aria-hidden="true">${wxSVG(code, true)}</i>`;
}

function speedUnit() { return state.units === "imperial" ? "mph" : "km/h"; }
function visUnit() { return state.units === "imperial" ? "mi" : "km"; }
function visVal(mtr) { if (mtr == null) return 0; return state.units === "imperial" ? mtr / 1609 : mtr / 1000; }

const METRICS = {
  temp: {
    label: "Temperature", unit: "°", decimals: 0, daily: true,
    get: (it) => it.main.temp,
    desc: () => { const t = state.daily[0]; return t ? `High near ${Math.round(t.max)}°, low near ${Math.round(t.min)}°.` : "Temperature trend ahead."; },
    about: "Air temperature is measured about two metres above the ground, the standard height used by weather stations everywhere. These hourly values come from a forecast model, a computer simulation of the atmosphere built from satellite, radar and ground observations and updated several times a day."
  },
  feels: {
    label: "Feels Like", unit: "°", decimals: 0,
    get: (it) => it.main.feels_like,
    desc: (c) => { const f = Math.round(c.main?.feels_like ?? 0), a = Math.round(c.main?.temp ?? 0), d = f - a; return Math.abs(d) < 1 ? "Feels about the same as the actual temperature." : d < 0 ? `Feels ${Math.abs(d)}° colder than the air temperature.` : `Feels ${d}° warmer than the air temperature.`; },
    about: "Feels-like temperature adjusts the air temperature for wind and humidity, the two things that most change how hot or cold your skin actually senses. Wind speeds up heat loss, so it makes cold air feel colder, while high humidity slows the evaporation that normally cools your skin, so it makes warm air feel hotter."
  },
  humidity: {
    label: "Humidity", unit: "%", decimals: 0, zero: true,
    get: (it) => it.main.humidity,
    desc: (c) => { const dp = dewPointDisplay(c.main?.temp, c.main?.humidity); return dp != null ? `The dew point is ${dp}° right now.` : "Relative humidity over the next hours."; },
    about: "Relative humidity is how much moisture the air is holding compared with the most it could hold at that temperature, shown as a percentage. Warm air can hold more moisture than cold air, so the same amount of water vapour reads as a higher percentage on a cool day than on a warm one."
  },
  wind: {
    label: "Wind", unit: speedUnit(), decimals: 0, zero: true,
    get: (it) => windParts(it.wind?.speed || 0).v,
    desc: (c) => { const w = c.wind || {}; const g = w.gust != null ? `, gusting ${windText(w.gust)}` : ""; return `${windText(w.speed || 0)} from the ${w.deg != null ? direction(w.deg) : "--"}${g}.`; },
    about: "Wind speed and direction are measured about ten metres above open ground, away from buildings and trees that would slow or redirect it. A gust is a brief spike above the sustained speed, usually lasting just a few seconds, caused by turbulence in the air."
  },
  pressure: {
    label: "Pressure", unit: "hPa", decimals: 0,
    get: (it) => it.main.pressure,
    desc: () => { const p = state.hourly?.[0]?.main?.pressure ?? state.data?.current?.main?.pressure; return p != null ? `${p} hPa, ${p >= 1013 ? "above" : "below"} the 1013 hPa average.` : "Sea-level pressure ahead."; },
    about: "Atmospheric pressure is the weight of the air above you, measured in hectopascals and adjusted to sea level so readings from different elevations can be compared fairly. Falling pressure usually means unsettled or stormy weather is moving in, while rising pressure usually means clearer, calmer conditions are on the way."
  },
  precip: {
    label: "Precipitation", unit: "%", decimals: 0, zero: true, bars: true,
    get: (it) => (it.pop || 0) * 100,
    desc: () => { const n = nextPrecip(state.data?.forecast, state.tz); const t = state.daily[0]; const pop = t ? Math.round((t.pop || 0) * 100) : 0; return n ? `Next precipitation around ${n.when}.` : pop > 0 ? `${pop}% chance today.` : "No precipitation expected soon."; },
    about: "The percentage is the forecast's confidence that measurable rain or snow will fall in that hour, and the millimetres are how much is expected to accumulate if it does. A high chance with a small amount usually means light, steady precipitation, while a lower chance with a larger amount usually means a heavier but less certain event, like an isolated shower."
  },
  clouds: {
    label: "Cloud Cover", unit: "%", decimals: 0, zero: true,
    get: (it) => it.clouds?.all ?? 0,
    desc: () => { const c = state.hourly?.[0]?.clouds?.all ?? state.data?.current?.clouds?.all; return cloudDescriptor(c) + " Cloud cover over the next hours."; },
    about: "Cloud cover is the share of the sky hidden by cloud, from clear at 0% to fully overcast at 100%. It shapes the temperature swing between day and night, since clouds block incoming sunlight from warming the ground by day and trap outgoing heat that would otherwise escape by night."
  },
  visibility: {
    label: "Visibility", unit: visUnit(), decimals: 1, zero: true,
    get: (it) => visVal(it.visibility),
    desc: () => { const v = state.hourly?.[0]?.visibility ?? state.data?.current?.visibility; return v != null ? `${visDescriptor(v)} Currently ${visibilityText(v)}.` : ""; },
    about: "Visibility is the greatest distance at which an object can still be told apart from the sky behind it, most often limited by fog, haze, or heavy rain or snow. Clear air typically allows visibility of 10 km or more, while anything below about 1 km is considered low."
  }
};

function openSheetUI() {
  state.sheetOpen = true;
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  el.sheetScroll.scrollTop = 0;
}

function openDetail(metric, range) {
  const isInfo = metric === "aqi" || metric === "uv" || metric === "moon" || metric === "credits" || metric === "sun" || metric === "alerts" || metric === "history";
  if (!METRICS[metric] && !isInfo) metric = "temp";
  const view = { metric, range: (range && METRICS[metric]?.daily) ? range : "hourly" };
  state.nav = [view];
  state.detail = view;
  openSheetUI();
  renderDetailSheet();
}

function sheetBack() {
  if (state.nav && state.nav.length > 1) {
    state.nav.pop();
    state.detail = state.nav[state.nav.length - 1];
    el.sheet.classList.add("is-open");
    el.sheet.style.transform = "";
    el.sheetScroll.scrollTop = 0;
    renderDetailSheet();
  } else {
    closeSheet();
  }
}

function closeSheet() {
  state.sheetOpen = false;
  state.nav = [];
  el.sheet.classList.remove("is-open");
  el.sheet.setAttribute("aria-hidden", "true");
  el.sheet.style.transform = "";
  document.body.style.overflow = "";
}

function setRange(range) {
  state.detail.range = range;
  syncRange();
  drawDetailChart();
  renderDetailList();
  el.sheetScroll.scrollTo({ top: 0, behavior: "smooth" });
}

function syncRange() {
  el.tabSeg.querySelectorAll("[data-tab]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === state.detail.range));
  syncSlide(el.tabSeg);
}

// Position the sliding thumb behind a two-option segmented control by writing
// the active item's index to data-pos; the CSS transitions the transform.
function syncSlide(seg) {
  if (!seg) return;
  const items = [...seg.querySelectorAll(".seg-item")];
  const i = items.findIndex((b) => b.classList.contains("is-active"));
  if (i >= 0) seg.dataset.pos = i;
}

function renderDetailSheet() {
  if (el.sheetHeadAux) { el.sheetHeadAux.innerHTML = ""; el.sheetHeadAux.style.display = "none"; }
  const gc = el.graph.closest(".graph-card");
  if (["aqi", "uv", "moon", "credits", "sun", "alerts", "history"].includes(state.detail.metric)) { renderInfoSheet(state.detail.metric); return; }
  if (gc) gc.style.display = "";
  if (state.detail.metric === "day") { renderDaySheet(); return; }
  const m = METRICS[state.detail.metric];
  if (!m) return;
  el.dayStats.style.display = "none";
  el.sheetTitle.textContent = m.label;
  el.tabSeg.style.display = m.daily ? "" : "none";
  syncRange();
  el.sheetNote.textContent = m.desc ? m.desc(state.data?.current || {}) : "";
  drawDetailChart();
  renderDetailList();
}

function renderInfoSheet(kind) {
  const air = state.data?.air || {};
  const gc = el.graph.closest(".graph-card");
  el.dayStats.style.display = "none";
  el.tabSeg.style.display = "none";
  if (kind === "moon") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderMoonSheet(); }
  else if (kind === "sun") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderSunSheet(); }
  else if (kind === "credits") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderCreditsSheet(); }
  else if (kind === "alerts") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderAlertsSheet(); }
  else if (kind === "aqi") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderAqiSheet(air); }
  else if (kind === "history") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; loadOtdMonthly(); }
  else { if (gc) gc.style.display = ""; renderUvSheet(air); }
}

function section(title, body, card, icon) {
  const tab = `<div class="folder-tab">${icon ? `<i class="ph ${icon} folder-tab-ic" aria-hidden="true"></i>` : ""}<span>${title}</span></div>`;
  return `<div class="folder">${tab}<div class="folder-body">${body}</div></div>`;
}

function scaleBar(pos, ends) {
  const p = Math.max(0, Math.min(100, pos));
  return `
    <div class="scale-wrap">
      <div class="scale-track"></div>
      <div class="scale-fill" style="width:${p}%"></div>
      <div class="scale-dot" style="left:${p}%"></div>
    </div>
    <div class="scale-ends">${ends.map((e) => `<span>${e}</span>`).join("")}</div>`;
}

function renderAqiSheet(air) {
  el.sheetTitle.textContent = "Air Quality";
  const { index, pollutant, measured } = airHealthIndex(air);
  if (index == null) { el.sheetNote.textContent = "Air quality data is unavailable right now."; el.sheetList.innerHTML = ""; return; }
  const b = aqhiBand(index);
  const shown = aqhiLabel(index);
  const obsT = measured && air.aqhiTime ? Date.parse(air.aqhiTime) : NaN;
  const at = Number.isFinite(obsT) ? ` at ${fmtClock(obsT / 1000, state.tz || 0)}` : "";
  const src = measured
    ? (air.aqhiStation ? ` Measured at ${air.aqhiStation}${at}.` : ` Measured by Environment Canada${at}.`)
    : " Estimated from modelled pollutants.";
  el.sheetNote.textContent = `Canada's Air Quality Health Index is ${shown} - ${b.label.toLowerCase()} health risk.${src}`;

  const scale = scaleBar(Math.min(index / 10, 1) * 100, ["1", "Moderate", "High", "10+"]);

  const primary = pollutant
    ? section(`Main pollutant · ${POLLUTANTS[pollutant].name}`,
        `<p class="info-text">${POLLUTANTS[pollutant].desc}</p>` +
        `<p class="info-text"><strong>Common sources:</strong> ${POLLUTANTS[pollutant].sources}</p>`)
    : "";

  const breakdown = Object.keys(POLLUTANTS).filter((k) => air[k] != null).map((k) => `
    <div class="pollutant">
      <div class="pollutant-top"><span class="pollutant-name">${POLLUTANTS[k].name}</span><strong class="pollutant-val">${Math.round(air[k])} µg/m³</strong></div>
      <p class="info-text">${POLLUTANTS[k].desc}</p>
      <p class="info-text"><strong>Common sources:</strong> ${POLLUTANTS[k].sources}</p>
    </div>`).join("");

  el.sheetList.innerHTML =
    `<div class="aqi-hero"><span class="aqi-big">${shown}</span><span class="aqi-band">${b.label}</span></div>` +
    scale +
    section("What this means", `<p class="info-text">${b.advice}</p>`) +
    primary +
    section("About the scale", `<p class="info-text">This is Canada's Air Quality Health Index (AQHI) from Environment Canada. 1-3 is low health risk, 4-6 moderate, 7-10 high and above 10 very high. It blends ground-level ozone, nitrogen dioxide and fine particulate matter (PM2.5), as a 3-hour average.</p>`) +
    section("Pollutants right now", breakdown, true);
}

function renderUvSheet(air) {
  el.sheetTitle.textContent = "UV Index";
  const hourly = air.hourly;
  const cur = air.uv_index != null ? Math.round(air.uv_index) : null;
  const u = uvBand(air.uv_index);
  el.sheetNote.textContent = cur != null ? uvSummary(air, hourly) : "UV data is unavailable right now.";

  drawUvChart(hourly);

  const dotOp = { "Low": 0.25, "Moderate": 0.45, "High": 0.62, "Very high": 0.8, "Extreme": 1 };
  const scaleRows = [["Low", "0-2"], ["Moderate", "3-5"], ["High", "6-7"], ["Very high", "8-10"], ["Extreme", "11+"]]
    .map(([label, rg]) => {
      const active = cur != null && u.label === label;
      return `<div class="uv-scale-row${active ? " is-active" : ""}"><span class="uv-dot" style="opacity:${dotOp[label]}"></span><span class="row-label">${label}</span><span class="uv-range">${rg}</span></div>`;
    }).join("");

  el.sheetList.innerHTML =
    (cur != null ? `<div class="aqi-hero"><span class="aqi-big">${cur}</span><span class="aqi-band">${u.label}</span></div>` : "") +
    (cur != null ? scaleBar((cur / 11) * 100, ["0", "Moderate", "Very high", "11+"]) : "") +
    (cur != null ? section("What to do", `<p class="info-text">${u.advice}</p>`) : "") +
    section("UV scale", `<div class="uv-scale">${scaleRows}</div>`, true) +
    section("About the UV index", `<p class="info-text">The UV index rates the strength of the sun's ultraviolet rays from 0 (low) to 11+ (extreme). Higher means skin and eyes burn faster, so sun protection matters more.</p>`);
}

function todayUv(hourly) {
  if (!hourly || !hourly.time || !hourly.uv_index) return [];
  return hourly.time.map((t, i) => ({ t, uv: hourly.uv_index[i] })).filter((p) => Number.isFinite(p.uv));
}

function uvSummary(air, hourly) {
  const cur = Math.round(air.uv_index);
  const pts = todayUv(hourly);
  if (!pts.length) return `The UV index is ${cur} right now, ${uvBand(air.uv_index).label.toLowerCase()}.`;
  const hours = pts.map((p) => Number(p.t.slice(11, 13)));
  const modIdx = pts.map((p, i) => (p.uv >= 3 ? i : -1)).filter((i) => i >= 0);
  if (!modIdx.length) return `The UV index stays low all day. No protection needed.`;
  const from = hours[modIdx[0]], to = hours[modIdx[modIdx.length - 1]];
  const fmt = (h) => `${(h % 12) || 12}${h < 12 ? "am" : "pm"}`;
  return `Currently ${uvBand(air.uv_index).label.toLowerCase()}. Moderate or higher from ${fmt(from)} to ${fmt(to)}.`;
}

function moonDistanceKm(unix = Date.now() / 1000) {
  const d = moonToDays(unix);
  const M = MOON_RAD * (134.963 + 13.064993 * d);
  return Math.round(385001 - 20905 * Math.cos(M));
}
function nextPhaseDate(targetFrac, from = Date.now()) {
  const synodic = 29.530588853;
  const f = moonPhase(new Date(from)).frac;
  let days = ((((targetFrac - f) % 1) + 1) % 1) * synodic;
  if (days < 0.5) days += synodic;
  return new Date(from + days * 86400 * 1000);
}
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MO_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function fmtDayDate(d) { return `${WD_SHORT[d.getDay()]}, ${MO_SHORT[d.getMonth()]} ${d.getDate()}`; }
function groupNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }

const PHASE_GUIDE = [
  ["New moon", 0, "The Moon sits between Earth and the Sun, so its sunlit side faces away from us. The disk looks dark, the start of the cycle."],
  ["Waxing crescent", 0.125, "A slim sliver of light appears on the right and grows a little each night. “Waxing” means the lit share is increasing."],
  ["First quarter", 0.25, "About a week in, the right half of the face is lit, a quarter of the way through the roughly 29.5-day cycle."],
  ["Waxing gibbous", 0.375, "More than half is lit and still growing. “Gibbous” means the bright part bulges past a half-circle."],
  ["Full moon", 0.5, "Earth lies between the Sun and Moon, so the whole near side is lit. It rises around sunset and sets around sunrise."],
  ["Waning gibbous", 0.625, "Just past full, the lit area starts to shrink, fading from the right. “Waning” means decreasing."],
  ["Last quarter", 0.75, "Three weeks in, the left half is lit, the mirror image of the first quarter."],
  ["Waning crescent", 0.875, "A thin, shrinking sliver on the left, until the disk goes dark and a new cycle begins."]
];

const SUN_J1970 = 2440588, SUN_J2000 = 2451545, SUN_J0 = 0.0009;
function sunFromJulian(j) { return (j + 0.5 - SUN_J1970) * 86400; }
function sunMeanAnomaly(d) { return MOON_RAD * (357.5291 + 0.98560028 * d); }
function sunEclipticLon(M) {
  const C = MOON_RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + MOON_RAD * 102.9372 + Math.PI;
}
function sunTimes(unix, lat, lon) {
  const lw = MOON_RAD * -lon, phi = MOON_RAD * lat;
  const d = moonToDays(unix);
  const n = Math.round(d - SUN_J0 - lw / (2 * Math.PI));
  const ds = SUN_J0 + lw / (2 * Math.PI) + n;
  const M = sunMeanAnomaly(ds);
  const L = sunEclipticLon(M);
  const dec = Math.asin(Math.sin(ECL) * Math.sin(L));
  const Jnoon = SUN_J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const event = (angleDeg) => {
    const h = angleDeg * MOON_RAD;
    const cosH = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (cosH >= 1 || cosH <= -1) return { up: null, down: null };
    const w = Math.acos(cosH);
    const a = SUN_J0 + (w + lw) / (2 * Math.PI) + n;
    const Jset = SUN_J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    return { up: sunFromJulian(Jnoon - (Jset - Jnoon)), down: sunFromJulian(Jset) };
  };
  return {
    noon: sunFromJulian(Jnoon),
    maxAlt: Math.PI / 2 - Math.abs(phi - dec),
    golden: event(6), sunrise: event(-0.833), civil: event(-6), nautical: event(-12), astro: event(-18)
  };
}

function hourOfDay(u, tz) {
  return u == null ? null : ((((u + tz) / 3600) % 24) + 24) % 24;
}

function bandsFromSunTimes(t, tz) {
  const toH = (u) => hourOfDay(u, tz);
  const ev = {
    astroUp: toH(t.astro.up), nautUp: toH(t.nautical.up), civilUp: toH(t.civil.up), sunrise: toH(t.sunrise.up), goldenUp: toH(t.golden.up),
    goldenDn: toH(t.golden.down), sunset: toH(t.sunrise.down), civilDn: toH(t.civil.down), nautDn: toH(t.nautical.down), astroDn: toH(t.astro.down)
  };
  const raw = [];
  const add = (h0, h1, type) => { if (h0 != null && h1 != null && h1 > h0 + 0.001) raw.push([h0, h1, type]); };
  add(0, ev.astroUp, "night"); add(ev.astroUp, ev.nautUp, "astro"); add(ev.nautUp, ev.civilUp, "nautical");
  add(ev.civilUp, ev.sunrise, "civil"); add(ev.sunrise, ev.goldenUp, "golden"); add(ev.goldenUp, ev.goldenDn, "day");
  add(ev.goldenDn, ev.sunset, "golden"); add(ev.sunset, ev.civilDn, "civil"); add(ev.civilDn, ev.nautDn, "nautical");
  add(ev.nautDn, ev.astroDn, "astro"); add(ev.astroDn, 24, "night");
  if (raw.length === 0) return [[0, 24, t.maxAlt > 0 ? "day" : "night"]];
  raw.sort((a, b) => a[0] - b[0]);
  const deep = ev.astroUp != null ? "night" : ev.nautUp != null ? "astro" : ev.civilUp != null ? "nautical" : ev.sunrise != null ? "civil" : (t.maxAlt > 0 ? "golden" : "night");
  const bands = []; let cur = 0;
  for (const b of raw) { if (b[0] > cur + 0.001) bands.push([cur, b[0], deep]); bands.push(b); cur = Math.max(cur, b[1]); }
  if (cur < 24) bands.push([cur, 24, deep]);
  // Night wraps through midnight - merge the evening + morning night segments
  // into one continuous band (end > 24) so there's no split at 12a.
  if (bands.length > 1) {
    const first = bands[0], last = bands[bands.length - 1];
    if (first[2] === last[2] && first[0] <= 0.001 && Math.abs(last[1] - 24) < 0.001) {
      bands.shift(); bands.pop();
      bands.push([last[0], first[1] + 24, first[2]]);
    }
  }
  return bands;
}

const SUN_BANDS = {
  day:      { name: "Day",                   color: "color-mix(in srgb, var(--ink) 11%, transparent)" },
  golden:   { name: "Golden hour",           color: "color-mix(in srgb, var(--ink) 34%, transparent)" },
  civil:    { name: "Civil twilight",        color: "color-mix(in srgb, var(--ink) 56%, transparent)" },
  nautical: { name: "Nautical twilight",     color: "color-mix(in srgb, var(--ink) 78%, transparent)" },
  astro:    { name: "Astronomical twilight", color: "color-mix(in srgb, var(--ink) 92%, transparent)" },
  night:    { name: "Night",                 color: "color-mix(in srgb, var(--ink) 100%, transparent)" }
};

// Optional per-band textures (toggle) so the stages read apart from just their
// shade. Drawn in white and composited with mix-blend-mode so they stay subtle
// and legible on any shade in either theme. Each twilight stage gets its own
// texture; "day" is left clean.
const SUN_PATTERN_DEFS =
  `<pattern id="scpat-golden" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="11" stroke="#fff" stroke-width="1.6"/></pattern>` +
  `<pattern id="scpat-civil" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="11" stroke="#fff" stroke-width="1.6"/></pattern>` +
  `<pattern id="scpat-nautical" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 0V12M0 0H12" stroke="#fff" stroke-width="1.4"/></pattern>` +
  `<pattern id="scpat-astro" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.7" fill="#fff"/></pattern>` +
  `<pattern id="scpat-night" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="9" stroke="#fff" stroke-width="1.6"/></pattern>`;
const SUN_PATTERN_TYPES = { golden: 1, civil: 1, nautical: 1, astro: 1, night: 1 };

const DYNAMIC_SKY = {
  night:    { top: "#05070f", bottom: "#10152b" },
  astro:    { top: "#0b1130", bottom: "#1c2049" },
  nautical: { top: "#16215a", bottom: "#3a3568" },
  civil:    { top: "#33418f", bottom: "#c97a86" },
  golden:   { top: "#5f86cf", bottom: "#ffb27a" },
  day:      { top: "#4fa3e8", bottom: "#bfe6f7" }
};

// Weather no longer repaints the sky. Time of day owns the mesh's hue and
// brightness (so night always reads as night, day as day, golden as warm), and
// the condition only modulates it: sat scales how vivid the mesh is (clear
// bold, rain/mist muted) and light nudges the deep base up (snow, mist) or down
// (rain, storm). The weather comes and goes over a stable per-time identity.
const CONDITION_MOD = {
  Clear:        { sat: 1.00, light:  0.00 },
  Clouds:       { sat: 0.66, light: -0.02 },
  Mist:         { sat: 0.34, light:  0.03 },
  Drizzle:      { sat: 0.54, light: -0.03 },
  Rain:         { sat: 0.48, light: -0.05 },
  Snow:         { sat: 0.82, light:  0.05 },
  Thunderstorm: { sat: 0.56, light: -0.08 }
};

function hexToRgb(hex) {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
}
function rgbToHex(rgb) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
function lerpHex(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (dd) {
    s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    if (max === r) h = (g - b) / dd + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / dd + 2;
    else h = (r - g) / dd + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t) => {
    t = (t % 1 + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}

// A curated tint palette: named hue families, each a bg/fg pair tuned for
// legible contrast in light and dark. The live sky is classified to the nearest
// family; its bg paints the tiles, its fg the icons and the bloom. Because the
// pair is designed to contrast, there is no runtime nudging to guess at.
const TINT_FAMILIES = {
  red:    { lbg: "#FCEAEC", lfg: "#E63946", dbg: "#3A0D12", dfg: "#FF6A77" },
  orange: { lbg: "#FFF1E8", lfg: "#E6731C", dbg: "#3B1F00", dfg: "#FFB066" },
  amber:  { lbg: "#FFF5E2", lfg: "#D88A00", dbg: "#3A2600", dfg: "#FFC94D" },
  yellow: { lbg: "#FFF9E3", lfg: "#B38A00", dbg: "#3A3100", dfg: "#FFE35C" },
  lime:   { lbg: "#F6FCE8", lfg: "#7BAA00", dbg: "#213000", dfg: "#BCEB4E" },
  green:  { lbg: "#EBF9EF", lfg: "#1FA24A", dbg: "#0F2C17", dfg: "#54D87D" },
  mint:   { lbg: "#EAFBF7", lfg: "#11A88B", dbg: "#0E2B26", dfg: "#66E3C8" },
  cyan:   { lbg: "#EAF9FC", lfg: "#1596B8", dbg: "#0D2730", dfg: "#66D7F5" },
  blue:   { lbg: "#EAF4FF", lfg: "#2B79E3", dbg: "#10233E", dfg: "#78B6FF" },
  indigo: { lbg: "#EFEEFF", lfg: "#5C63D8", dbg: "#1A1D42", dfg: "#9DA7FF" },
  purple: { lbg: "#F5EEFF", lfg: "#8E57D7", dbg: "#26143C", dfg: "#C998FF" },
  pink:   { lbg: "#FFEAF3", lfg: "#D84F95", dbg: "#3B1328", dfg: "#FF92C5" }
};
// Grey fallback so overcast / desaturated skies stay neutral, not forced hues.
const TINT_NEUTRAL = { lbg: "#ECECE8", lfg: "#3A3A37", dbg: "#2A2A27", dfg: "#ECECE8" };
// Each family's hue angle (from its light fg), precomputed for classification.
const TINT_HUES = Object.entries(TINT_FAMILIES).map(([name, f]) => [name, rgbToHsl(hexToRgb(f.lfg))[0] * 360]);

// Classify a sky colour to the nearest family by hue; low saturation -> neutral.
function skyFamily(hex) {
  const [h, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.12) return TINT_NEUTRAL;
  const deg = h * 360;
  let best = TINT_HUES[0][0], bestD = 999;
  for (const [name, fh] of TINT_HUES) {
    let d = Math.abs(deg - fh); if (d > 180) d = 360 - d;
    if (d < bestD) { bestD = d; best = name; }
  }
  return TINT_FAMILIES[best];
}

// ---- Colour mode: a layered, animated weather sky on the Home first viewport.
// Chrome CSS vars the sky drives (neutral tokens); cleared when tint is off.
const BLOOM_VARS = ["--icon", "--card-bg", "--card-bg-hi", "--card-border", "--hairline",
  "--on-surface", "--on-surface-soft", "--surface"];

/* =====================================================================
   Sky engine - a layered background for the Home first viewport. Time of
   day sets the gradient, the sun/moon and the light that paints clouds;
   the weather condition adds cloud cover, precipitation, fog and storms.
   Two crossfading gradient layers + a tint + two canvases. Home only.
   ===================================================================== */
const Sky = (() => {
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  // time of day: sky (4 stops), the LIGHT painting cloud tops, cloud SHADOW,
  // star strength, which orb, and its position.
  const TIMES = {
    night:   { sky:["#2f3f63","#212c4c","#151e36","#0d1526"], light:[118,134,170], shadow:[24,30,50],   starMul:1,   orb:"moon", pos:[0.76,0.20] },
    dawn:    { sky:["#182252","#332f61","#573f6f","#835a79"], light:[168,138,166], shadow:[44,40,66],   starMul:.6,  orb:"moon", pos:[0.22,0.30] },
    sunrise: { sky:["#264075","#3e4b74","#8c434a","#bb5100"], light:[255,190,150], shadow:[86,74,102],  starMul:.1,  orb:"sun",  pos:[0.26,0.62] },
    morning: { sky:["#124373","#195084","#1363a1","#1975b6"], light:[236,244,252], shadow:[120,142,170],starMul:0,   orb:"sun",  pos:[0.40,0.34] },
    midday:  { sky:["#0e4374","#135485","#0e67a0","#0e75bd"], light:[248,252,255], shadow:[150,172,196],starMul:0,   orb:"sun",  pos:[0.52,0.16] },
    golden:  { sky:["#323f73","#55466a","#974622","#a56100"], light:[255,206,150], shadow:[108,94,122], starMul:0,   orb:"sun",  pos:[0.66,0.46] },
    sunset:  { sky:["#231e4c","#4d2d51","#953340","#c94200"], light:[255,166,128], shadow:[92,68,104],  starMul:.1,  orb:"sun",  pos:[0.78,0.60] },
    dusk:    { sky:["#121a3e","#252a54","#433a63","#5e466a"], light:[128,120,164], shadow:[38,38,64],   starMul:.55, orb:"moon", pos:[0.30,0.24] },
  };
  // condition: cloud cover/heaviness, sky tint, precipitation, fog, storm, wind.
  const CONDS = {
    clear:     { cover:0,    heavy:0,   tint:"rgba(0,0,0,0)",           precip:null,                     fog:0,   storm:false, wind:1,   starMul:1   },
    partly:    { cover:0.28, heavy:.12, tint:"rgba(0,0,0,0)",           precip:null,                     fog:0,   storm:false, wind:1,   starMul:.55 },
    mostly:    { cover:0.55, heavy:.3,  tint:"rgba(96,104,122,0.12)",   precip:null,                     fog:0,   storm:false, wind:1,   starMul:.2  },
    overcast:  { cover:0.92, heavy:.5,  tint:"rgba(92,100,116,0.30)",   precip:null,                     fog:.12, storm:false, wind:1,   starMul:0   },
    fog:       { cover:0.1,  heavy:.2,  tint:"rgba(150,156,166,0.12)",  precip:null,                     fog:1,   storm:false, wind:.5,  starMul:0   },
    haze:      { cover:0.16, heavy:.12, tint:"rgba(210,196,168,0.14)",  precip:null,                     fog:.5,  storm:false, wind:.5,  starMul:.12 },
    drizzle:   { cover:0.6,  heavy:.42, tint:"rgba(64,76,96,0.20)",     precip:{t:"rain",rate:2,sp:.75}, fog:.28, storm:false, wind:1,   starMul:0   },
    rain:      { cover:0.78, heavy:.58, tint:"rgba(44,56,74,0.30)",     precip:{t:"rain",rate:5,sp:1},   fog:.1,  storm:false, wind:1.1, starMul:0   },
    heavyRain: { cover:0.95, heavy:.74, tint:"rgba(30,40,56,0.40)",     precip:{t:"rain",rate:10,sp:1.3},fog:.16, storm:false, wind:1.5, starMul:0   },
    storm:     { cover:0.98, heavy:.86, tint:"rgba(14,18,28,0.46)",     precip:{t:"rain",rate:9,sp:1.4}, fog:.1,  storm:true,  wind:1.7, starMul:0   },
    flurries:  { cover:0.45, heavy:.26, tint:"rgba(186,198,216,0.08)",  precip:{t:"snow",rate:1.3},      fog:.12, storm:false, wind:1,   starMul:.15 },
    snow:      { cover:0.72, heavy:.4,  tint:"rgba(190,202,220,0.14)",  precip:{t:"snow",rate:2.6},      fog:.22, storm:false, wind:1,   starMul:0   },
    blizzard:  { cover:0.95, heavy:.55, tint:"rgba(176,188,206,0.24)",  precip:{t:"snow",rate:6},        fog:.5,  storm:false, wind:2.4, starMul:0   },
    windy:     { cover:0.4,  heavy:.18, tint:"rgba(0,0,0,0)",           precip:null,                     fog:0,   storm:false, wind:2.8, starMul:.4  },
  };

  const OKLAB = !!(window.CSS && CSS.supports && CSS.supports("background-image", "linear-gradient(in oklab, red, blue)"));
  const gradCss = (sky) => `linear-gradient(180deg${OKLAB ? " in oklab" : ""}, ${sky[0]} 0%, ${sky[1]} 38%, ${sky[2]} 72%, ${sky[3]} 100%)`;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const rgba = (a, al) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;

  const cur = { time: "night", cond: "clear" };
  let activeSky = "A", stormMode = false;
  const anim = { cover:0, heavy:0, star:0, orbSun:0, orbMoon:0, fog:0, wind:1, rain:0, rainSp:1, snow:0, light:[118,134,170], shadow:[24,30,50], orbX:0.76, orbY:0.20, init:false };
  const tgt = JSON.parse(JSON.stringify(anim));
  const NUMKEYS = ["cover","heavy","star","orbSun","orbMoon","fog","wind","rain","rainSp","snow","orbX","orbY"];

  let bg, bx, fx, fxx, wrap, dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
  let stars = [], drops = [], flakes = [], fogBanks = [], cloudField = [];
  let cloudFlash = [], cloudStrike = [], lastFlash = -1, cloudBuf = null, cbx = null;

  function ensure() {
    if (bg) return true;
    bg = $("skyBg"); fx = $("skyFx"); wrap = $("meshWrap");
    if (!bg || !fx || !wrap) return false;
    bx = bg.getContext("2d"); fxx = fx.getContext("2d");
    return true;
  }
  function sizeCanvas() {
    if (!ensure()) return;
    W = wrap.clientWidth || window.innerWidth; H = wrap.clientHeight || window.innerHeight;
    [bg, fx].forEach(c => { c.width = W * dpr; c.height = H * dpr; c.style.width = W + "px"; c.style.height = H + "px"; });
    bx.setTransform(dpr, 0, 0, dpr, 0, 0); fxx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!cloudBuf) { cloudBuf = document.createElement("canvas"); cbx = cloudBuf.getContext("2d"); }
    cloudBuf.width = W * dpr; cloudBuf.height = H * dpr; cbx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = []; const ns = Math.round(W * H / 8500);
    for (let i = 0; i < ns; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.72, r: Math.random() * 1.2 + .3, tw: Math.random() * 6.28, sp: .5 + Math.random() * 1.4 });
    cloudField = []; const base = Math.max(W, H);
    for (let i = 0; i < 9; i++) {
      const depth = Math.random(), cs = (0.5 + depth * 0.9) * base * 0.14, puffs = [], np = 6 + Math.round(Math.random() * 5);
      for (let p = 0; p < np; p++) { const ang = Math.random() * Math.PI * 2, rad = Math.random(), dx = Math.cos(ang) * rad * 1.5, dy = Math.sin(ang) * rad * 0.55 - 0.1;
        puffs.push({ dx, dy, r: (0.55 + Math.random() * 0.75), lit: Math.min(1, Math.max(0, 0.5 - dy * 0.9)), rnd: Math.random() }); }
      cloudField.push({ bx: Math.random(), by: 0.06 + Math.random() * 0.34, depth, cs, puffs });
    }
    cloudFlash = new Array(cloudField.length).fill(0);
    cloudStrike = cloudField.map(() => ({ dx: 0, dy: -0.1 }));
    fogBanks = [];
    for (let i = 0; i < 5; i++) fogBanks.push({ x: Math.random(), y: 0.55 + Math.random() * 0.4, r: base * (0.28 + Math.random() * 0.22), sp: 0.006 + Math.random() * 0.01, ph: Math.random() });
  }
  function puff(ctx, x, y, r, col, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(0.55, rgba(col, a * 0.5)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
  function drawStars(dt) { if (anim.star < 0.01) return; bx.fillStyle = "#fff"; for (const s of stars) { s.tw += dt * 0.0016 * s.sp; bx.globalAlpha = (0.84 + 0.16 * Math.sin(s.tw)) * anim.star; bx.beginPath(); bx.arc(s.x, s.y, s.r, 0, 7); bx.fill(); } bx.globalAlpha = 1; }
  function drawSun(cx, cy, a) { if (a < 0.01) return; const R = Math.min(W, H) * 0.48, glow = mix(anim.light, [255,214,150], 0.5); bx.globalCompositeOperation = "lighter";
    let g = bx.createRadialGradient(cx, cy, 0, cx, cy, R); g.addColorStop(0, rgba([255,250,236], .85*a)); g.addColorStop(0.12, rgba(mix([255,250,236], glow, .6), .5*a)); g.addColorStop(0.4, rgba(glow, .16*a)); g.addColorStop(1, rgba(glow, 0)); bx.fillStyle = g; bx.beginPath(); bx.arc(cx, cy, R, 0, 7); bx.fill();
    g = bx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.14); g.addColorStop(0, rgba([255,252,244], .95*a)); g.addColorStop(1, rgba([255,244,214], 0)); bx.fillStyle = g; bx.beginPath(); bx.arc(cx, cy, R * 0.14, 0, 7); bx.fill(); bx.globalCompositeOperation = "source-over"; }
  function drawMoon(cx, cy, a) { if (a < 0.01) return; const R = Math.min(W, H) * 0.052; bx.globalCompositeOperation = "lighter";
    let g = bx.createRadialGradient(cx, cy, R*0.6, cx, cy, R*3.2); g.addColorStop(0, rgba([180,196,230], .28*a)); g.addColorStop(1, rgba([180,196,230], 0)); bx.fillStyle = g; bx.beginPath(); bx.arc(cx, cy, R*3.2, 0, 7); bx.fill(); bx.globalCompositeOperation = "source-over";
    bx.save(); bx.beginPath(); bx.arc(cx, cy, R, 0, 7); bx.clip();
    g = bx.createRadialGradient(cx-R*0.4, cy-R*0.4, R*0.1, cx-R*0.4, cy-R*0.4, R*1.9); g.addColorStop(0, rgba([240,244,252], a)); g.addColorStop(1, rgba([150,162,190], a)); bx.fillStyle = g; bx.fillRect(cx-R, cy-R, R*2, R*2);
    g = bx.createRadialGradient(cx+R*0.55, cy+R*0.45, 0, cx+R*0.55, cy+R*0.45, R*1.7); g.addColorStop(0, rgba([16,22,40], .6*a)); g.addColorStop(0.7, rgba([16,22,40], .18*a)); g.addColorStop(1, rgba([16,22,40], 0)); bx.fillStyle = g; bx.fillRect(cx-R, cy-R, R*2, R*2); bx.restore(); }
  function drawClouds(tsec) { cbx.clearRect(0, 0, W, H); if (anim.cover < 0.02) return false; const nC = Math.max(0, Math.round(anim.cover * 9)), heavy = anim.heavy;
    for (let i = 0; i < nC; i++) { const cl = cloudField[i], driftPx = 9 * anim.wind * (0.4 + cl.depth); let x = ((cl.bx * W + tsec * driftPx) % (W*1.4)) - W*0.2; const y = cl.by * H, sc = cl.cs * (0.75 + anim.cover * 0.4);
      for (const p of cl.puffs) { const px = x+p.dx*sc, py = y+p.dy*sc, pr = p.r*sc, lit = p.lit*(1-heavy*0.55); let col = mix(anim.shadow, anim.light, lit); col = scl(col, 1-heavy*0.4); puff(cbx, px, py, pr, col, (0.05+anim.cover*0.11)*(0.7+cl.depth*0.45)); }
      if (stormMode && cloudFlash[i] > 0.01) { const fi = cloudFlash[i], st = cloudStrike[i]||{dx:0,dy:-0.1}, sx = x+st.dx*sc, sy = y+st.dy*sc, R = sc*2.3; cbx.globalCompositeOperation = "lighter";
        let g = cbx.createRadialGradient(sx, sy, 0, sx, sy, R*1.15); g.addColorStop(0, rgba([168,190,242], 0.05*fi)); g.addColorStop(1, rgba([168,190,242], 0)); cbx.fillStyle = g; cbx.beginPath(); cbx.arc(sx, sy, R*1.15, 0, 7); cbx.fill();
        for (const p of cl.puffs) { const px = x+p.dx*sc, py = y+p.dy*sc, pr = p.r*sc, gf = Math.max(0, 1 - Math.hypot(px-sx, py-sy)/R); if (gf > 0.02) { const m = gf*gf*(0.45+0.55*p.rnd)*(0.5+0.5*p.lit); puff(cbx, px, py, pr*(0.82+0.3*p.rnd), [216,228,255], m*fi*0.42); } }
        cbx.globalCompositeOperation = "source-over"; } }
    return true; }
  function drawFogBanks(tsec) { if (anim.fog < 0.05) return; const lit = mix(mix(anim.shadow, anim.light, .75), [255,255,255], .15); for (const b of fogBanks) { const x = ((b.x + tsec*b.sp*anim.wind) % 1.3 - 0.15)*W, y = b.y*H; puff(bx, x, y, b.r, lit, 0.10*anim.fog); puff(bx, x+b.r*0.4, y+b.r*0.15, b.r*0.8, lit, 0.08*anim.fog); } }
  function drawRain(dt) { if (anim.rain < 0.05) { if (drops.length) drops.length = 0; return; } const ang = 0.34 + (anim.wind-1)*0.26, margin = Math.abs(ang)*H, n = anim.rain*(W/760);
    for (let i = 0; i < n; i++) drops.push({ x: Math.random()*(W+margin)-margin, y: -14, len: 11+Math.random()*16, v: (9+Math.random()*7)*anim.rainSp, o: .05+Math.random()*.14, w: .6+Math.random()*.6 });
    for (let i = drops.length-1; i >= 0; i--) { const d = drops[i]; d.x += ang*d.v*dt/16; d.y += d.v*dt/16; fxx.strokeStyle = `rgba(194,210,240,${d.o})`; fxx.lineWidth = d.w; fxx.beginPath(); fxx.moveTo(d.x, d.y); fxx.lineTo(d.x-ang*d.len, d.y-d.len); fxx.stroke(); if (d.y > H+16) drops.splice(i, 1); } }
  function drawSnow(dt) { if (anim.snow < 0.05) { if (flakes.length) flakes.length = 0; return; } const drift = (anim.wind-1), n = anim.snow*(W/560);
    for (let i = 0; i < n; i++) { const depth = Math.random(); flakes.push({ x: Math.random()*W, y: -10, r: 0.8+depth*3, v: (.5+depth*1.4), ph: Math.random()*6.28, o: (.35+depth*.55), soft: depth > 0.55 }); }
    for (let i = flakes.length-1; i >= 0; i--) { const f = flakes[i]; f.ph += 0.02; f.x += Math.sin(f.ph)*(0.5+f.r*0.2)+drift*1.5; f.y += f.v*dt/16*1.6; if (f.soft) { puff(fxx, f.x, f.y, f.r*1.8, [255,255,255], f.o*0.5); } else { fxx.fillStyle = `rgba(255,255,255,${f.o})`; fxx.beginPath(); fxx.arc(f.x, f.y, f.r, 0, 7); fxx.fill(); } if (f.y > H+10) flakes.splice(i, 1); } }
  function drawFrame(dt, tsec, motion) {
    for (let i = 0; i < cloudFlash.length; i++) if (cloudFlash[i] > 0) cloudFlash[i] = Math.max(0, cloudFlash[i] - dt/220);
    bx.clearRect(0, 0, W, H);
    drawStars(dt);
    const ox = anim.orbX*W, oy = anim.orbY*H;
    drawSun(ox, oy, anim.orbSun); drawMoon(ox, oy, anim.orbMoon);
    if (drawClouds(motion ? tsec : 0)) { bx.save(); bx.filter = "blur(5px)"; bx.drawImage(cloudBuf, 0, 0, W, H); bx.restore(); }
    drawFogBanks(motion ? tsec : 0);
    fxx.clearRect(0, 0, W, H);
    if (motion) { drawRain(dt); drawSnow(dt); }
  }
  function ease(k) { for (const key of NUMKEYS) anim[key] += (tgt[key] - anim[key]) * k; for (let i = 0; i < 3; i++) { anim.light[i] += (tgt.light[i] - anim.light[i]) * k; anim.shadow[i] += (tgt.shadow[i] - anim.shadow[i]) * k; } }
  function snap() { for (const key of NUMKEYS) anim[key] = tgt[key]; anim.light = tgt.light.slice(); anim.shadow = tgt.shadow.slice(); }

  let last = performance.now(), raf = 0, playing = false, ltTimer = null;
  function loop(now) { if (!playing) return; const dt = Math.min(50, now-last); last = now; ease(1 - Math.pow(0.001, dt/1000)); drawFrame(dt, now/1000, true); raf = requestAnimationFrame(loop); }
  function snapDraw() { if (!ensure()) return; if (!W) sizeCanvas(); if (!W) return; snap(); drawFrame(16, performance.now()/1000, false); }
  function lightningLoop() { clearTimeout(ltTimer); const tick = () => { if (playing && stormMode && !reduceMotion()) triggerFlash(); ltTimer = setTimeout(tick, 4000 + Math.random()*9000); }; ltTimer = setTimeout(tick, 2600); }
  function triggerFlash() { const nC = Math.min(cloudFlash.length, Math.max(1, Math.round(anim.cover*9))); if (nC < 1) return; let idx = Math.floor(Math.random()*nC); if (idx === lastFlash) idx = (idx+1)%nC; lastFlash = idx; cloudFlash[idx] = 1; cloudStrike[idx] = { dx: Math.random()*1.2-0.6, dy: Math.random()*0.5-0.35 };
    if (Math.random() < 0.4) setTimeout(() => { cloudFlash[idx] = Math.max(cloudFlash[idx], 0.6); }, 80+Math.random()*90);
    if (Math.random() < 0.18) { const j = (idx+1)%nC; cloudStrike[j] = { dx: Math.random()*1.2-0.6, dy: Math.random()*0.5-0.35 }; setTimeout(() => { cloudFlash[j] = Math.max(cloudFlash[j], 0.75); }, 160+Math.random()*200); } }

  function applyCss() {
    if (!ensure()) return;
    const T = TIMES[cur.time], C = CONDS[cur.cond];
    const a = activeSky === "A" ? $("skyA") : $("skyB"), b = activeSky === "A" ? $("skyB") : $("skyA");
    b.style.background = gradCss(T.sky); b.style.opacity = "1"; a.style.opacity = "0"; activeSky = activeSky === "A" ? "B" : "A";
    $("skyTint").style.backgroundColor = C.tint;
    const fog = $("skyFog");
    fog.style.opacity = C.fog > 0 ? String(Math.min(1, C.fog*0.9)) : "0";
    const fogLit = mix(T.shadow, T.light, .7);
    fog.style.background = `linear-gradient(180deg, ${rgba(mix(fogLit, [255,255,255], .1), 0)} 0%, ${rgba(fogLit, .5)} 46%, ${rgba(fogLit, .62)} 100%)`;
  }
  function setTargets() {
    const T = TIMES[cur.time], C = CONDS[cur.cond];
    tgt.light = T.light.slice(); tgt.shadow = T.shadow.slice();
    tgt.cover = C.cover; tgt.heavy = C.heavy; tgt.fog = C.fog; tgt.wind = C.wind;
    const vis = Math.max(0, 1 - C.cover/0.4) * ((C.precip||C.storm) ? 0 : 1) * (C.fog > 0.5 ? 0 : 1);
    tgt.orbSun = T.orb === "sun" ? vis : 0; tgt.orbMoon = T.orb === "moon" ? vis : 0; tgt.orbX = T.pos[0]; tgt.orbY = T.pos[1];
    tgt.star = T.starMul * C.starMul;
    tgt.rain = (C.precip && C.precip.t === "rain") ? C.precip.rate : 0;
    tgt.rainSp = (C.precip && C.precip.t === "rain") ? C.precip.sp : 1;
    tgt.snow = (C.precip && C.precip.t === "snow") ? C.precip.rate : 0;
    stormMode = C.storm;
    if (!anim.init) { snap(); anim.init = true; }
  }

  function play() { if (!ensure()) return; if (!W) sizeCanvas(); if (!W || playing) return; playing = true; last = performance.now(); lightningLoop(); raf = requestAnimationFrame(loop); }
  function stopPlay() { playing = false; if (raf) cancelAnimationFrame(raf); raf = 0; clearTimeout(ltTimer); }
  return {
    set(time, cond) { if (!TIMES[time]) time = "midday"; if (!CONDS[cond]) cond = "clear"; if (time === cur.time && cond === cur.cond && anim.init) return; cur.time = time; cur.cond = cond; applyCss(); setTargets(); if (!playing) snapDraw(); },
    resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); sizeCanvas(); if (!playing) snapDraw(); },
    play, stopPlay,
    still() { stopPlay(); snapDraw(); },
    skyStops(time) { return (TIMES[time] || TIMES.midday).sky; }
  };
})();

// Local hour (0..24) -> Sky time-of-day phase.
function phaseForHour(h) {
  if (h < 4.5) return "night";
  if (h < 6) return "dawn";
  if (h < 7.5) return "sunrise";
  if (h < 11) return "morning";
  if (h < 15.5) return "midday";
  if (h < 18.5) return "golden";
  if (h < 20) return "sunset";
  if (h < 21.5) return "dusk";
  return "night";
}

// The sky phase for a moment, from the location's *actual* sun geometry rather
// than fixed clock hours: twilight bands (astronomical/nautical/civil) on the
// night side, the sunrise glow anchored to real civil-dawn→sunrise, the evening
// golden/sunset/dusk anchored to real sunset, and the daylight split into
// morning/midday/golden by fraction of the day's length. This is what lines the
// background up with the location's real day. Handles polar day/night and the
// high-latitude summer case where it never gets fully dark.
function skyPhaseAt(t, lat, lon) {
  const st = sunTimes(t, lat, lon);
  const SR = st.sunrise.up, SS = st.sunrise.down;
  const aU = st.astro.up, cU = st.civil.up, cD = st.civil.down, aD = st.astro.down;
  if (SR == null || SS == null) return st.maxAlt > 0.1 ? "midday" : "night";   // polar day / night
  if (t >= SR && t <= SS) {
    const day = SS - SR;
    if (t < SR + 0.09 * day) return "sunrise";   // just-risen glow
    if (t < SR + 0.42 * day) return "morning";
    if (t < SS - 0.16 * day) return "midday";
    return "golden";                             // afternoon warmth down to sunset
  }
  if (t < SR) {                                  // morning twilight
    if (cU != null && t >= cU) return "sunrise"; // civil dawn into sunrise
    if (aU != null && t >= aU) return "dawn";    // astronomical/nautical twilight
    return aU == null ? "dusk" : "night";        // never-dark summer night reads as lingering dusk
  }
  if (cD != null && t <= cD) return "sunset";    // afterglow past sunset
  if (aD != null && t <= aD) return "dusk";      // deepening twilight
  return aD == null ? "dusk" : "night";
}
// Current weather -> Sky condition key (from OpenWeather main/description, cloud
// cover and wind). Defaults to clear when there is no data yet.
function currentSkyCond() {
  const cw = state.data?.current, w = cw?.weather?.[0] || {};
  const main = (w.main || "").toLowerCase(), desc = (w.description || "").toLowerCase();
  const clouds = Number.isFinite(cw?.clouds?.all) ? cw.clouds.all : (Number.isFinite(cw?.clouds) ? cw.clouds : null);
  const windKph = windKmh(cw?.wind?.speed);   // unit-agnostic km/h
  if (main.includes("thunder")) return "storm";
  if (main.includes("drizzle")) return "drizzle";
  if (main.includes("rain")) { if (desc.includes("heavy") || desc.includes("extreme")) return "heavyRain"; if (desc.includes("light")) return "drizzle"; return "rain"; }
  if (main.includes("snow") || main.includes("sleet")) { if (desc.includes("heavy") || desc.includes("blizzard")) return "blizzard"; if (desc.includes("light") || desc.includes("flurr")) return "flurries"; return "snow"; }
  if (main.includes("fog") || main.includes("mist")) return "fog";
  if (main.includes("haze") || main.includes("smoke") || main.includes("dust") || main.includes("sand") || main.includes("ash")) return "haze";
  if (windKph >= 35 && (main.includes("clear") || (clouds != null && clouds < 40))) return "windy";
  if (main.includes("cloud")) { if (clouds != null) { if (clouds < 30) return "partly"; if (clouds < 65) return "mostly"; return "overcast"; } return "mostly"; }
  if (main.includes("clear")) return (clouds != null && clouds >= 15) ? "partly" : "clear";
  if (clouds != null) { if (clouds < 15) return "clear"; if (clouds < 40) return "partly"; if (clouds < 70) return "mostly"; return "overcast"; }
  return "clear";
}

// time = resolved sky phase ("night", "sunrise", …), or null to clear the tint.
// Drives the Sky engine (time of day + current condition) and the chrome tokens.
function applyMeshColors(time) {
  const r = document.documentElement.style;
  if (!state.tinted || time == null) {
    BLOOM_VARS.forEach((v) => r.removeProperty(v));
    const base = PALETTES[themeKind()];
    if (base) {
      r.setProperty("--ink", base.ink); r.setProperty("--bg", base.bg);
      r.setProperty("--surface", base.surface); r.setProperty("--on-surface", base.onSurface);
    }
    updateSkyPlayback();
    return;
  }
  Sky.set(time, currentSkyCond());
  const sky = Sky.skyStops(time);
  // The page background continues the sky's *bottom* stop (the horizon), so the
  // hero dissolves seamlessly into the rest of the page instead of cropping to a
  // mismatched dark band, and that lower colour carries on below the fold.
  r.setProperty("--bg", sky[3]);
  r.setProperty("--ink", "#f7f5f0");
  r.setProperty("--icon", "#f7f5f0");
  r.setProperty("--on-surface", "#f7f5f0");
  r.setProperty("--on-surface-soft", "rgba(247,245,240,0.60)");
  r.setProperty("--surface", "#161c26");
  r.setProperty("--card-bg", "rgba(255,255,255,0.09)");
  r.setProperty("--card-bg-hi", "rgba(255,255,255,0.15)");
  r.setProperty("--card-border", "transparent");
  r.setProperty("--hairline", "rgba(255,255,255,0.20)");
  // Keep the browser/PWA chrome in step with the sky: the top of the gradient
  // sits behind the status bar, so that's the colour the chrome should carry.
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", sky[0]);
  updateSkyPlayback();
}

// Decide whether the sky should animate, draw a static frame, or stop entirely:
// only on Home (no full sheet / modal open), while the tab is visible, tint is
// on, and animation is enabled (else a single static frame).
function updateSkyPlayback() {
  if (!state.tinted) { Sky.stopPlay(); return; }
  const hidden = document.visibilityState === "hidden"
    || !!document.querySelector(".sheet.is-open")
    || !!(el.alertOverlay && el.alertOverlay.classList.contains("is-open"));
  if (hidden) { Sky.stopPlay(); return; }
  const animate = state.animate !== false && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate) Sky.play(); else Sky.still();
}
let skyPbRaf = 0;
function scheduleSkyPlayback() { if (skyPbRaf) return; skyPbRaf = requestAnimationFrame(() => { skyPbRaf = 0; updateSkyPlayback(); }); }
function skyGradientAt(bands, nowH) {
  const anchors = bands.map((b) => ({ h: (b[0] + b[1]) / 2, key: b[2] }));
  if (!anchors.length) return DYNAMIC_SKY.day;
  const ext = [
    { h: anchors[anchors.length - 1].h - 24, key: anchors[anchors.length - 1].key },
    ...anchors,
    { h: anchors[0].h + 24, key: anchors[0].key }
  ];
  let lo = ext[0], hi = ext[ext.length - 1];
  for (let i = 0; i < ext.length - 1; i++) {
    if (nowH >= ext[i].h && nowH <= ext[i + 1].h) { lo = ext[i]; hi = ext[i + 1]; break; }
  }
  const span = hi.h - lo.h;
  const frac = span > 0 ? (nowH - lo.h) / span : 0;
  const a = DYNAMIC_SKY[lo.key] || DYNAMIC_SKY.day, b = DYNAMIC_SKY[hi.key] || DYNAMIC_SKY.day;
  return { top: lerpHex(a.top, b.top, frac), bottom: lerpHex(a.bottom, b.bottom, frac) };
}

// Alert severity tiers, from the curated palette (bg = chip fill, fg = chip
// text / warning icon / tier dot). Tuned for legibility in both modes.
const ALERT_TOKENS = {
  yellow: { lbg: "#FFF8BF", lfg: "#8A6800", dbg: "#3A2C00", dfg: "#FFE44D" },
  orange: { lbg: "#FFF0E3", lfg: "#B84A00", dbg: "#3D1700", dfg: "#FF9638" },
  red:    { lbg: "#FFE7EA", lfg: "#C90024", dbg: "#43000C", dfg: "#FF5A72" }
};
// Neutral card surface from the grey ramp. Alerts sit on this rather than the
// sky-tinted tile, so severity colour is never muddied by the bloom's hue.
const NEUTRAL_SURFACE = {
  card:   { light: "#ECECE8", dark: "#2A2A27" },
  cardHi: { light: "#D8D8D3", dark: "#343431" }
};

let dynamicTimer = null;

function updateDynamicBackground() {
  const c = state.center || {};
  const lat = c.lat, lon = c.lon;
  let time;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // Phase from the viewed location's real sun/twilight times.
    time = skyPhaseAt(Math.floor(Date.now() / 1000), lat, lon);
  } else {
    // No location yet: fall back to the device's local hour.
    const d = new Date();
    time = phaseForHour(d.getHours() + d.getMinutes() / 60);
  }
  applyMeshColors(time);
}

function startDynamicTheme() {
  if (dynamicTimer) clearInterval(dynamicTimer);
  Sky.resize();
  updateDynamicBackground();
  dynamicTimer = setInterval(updateDynamicBackground, 120000);
}
function stopDynamicTheme() {
  if (dynamicTimer) { clearInterval(dynamicTimer); dynamicTimer = null; }
}

function sunMapSVG(lat, lon) {
  if (typeof WORLD_MAP === "undefined" || !Number.isFinite(lat)) return "";
  const W = WORLD_MAP.w, H = WORLD_MAP.h;
  const dd = moonToDays(Math.floor(Date.now() / 1000));
  const M = sunMeanAnomaly(dd), Lsun = sunEclipticLon(M);
  const dec = Math.asin(Math.sin(ECL) * Math.sin(Lsun));
  const ra = Math.atan2(Math.cos(ECL) * Math.sin(Lsun), Math.cos(Lsun));
  const gmst = (280.16 + 360.9856235 * dd) * MOON_RAD;
  let subLon = (ra - gmst) / MOON_RAD; subLon = ((subLon % 360) + 540) % 360 - 180;
  const subLat = dec / MOON_RAD;
  const X = (lo) => (lo + 180) / 360 * W;
  const Y = (la) => (90 - la) / 180 * H;
  const decR = Math.abs(dec) < 1e-4 ? 1e-4 : dec;
  let term = "";
  for (let lo = -180; lo <= 180; lo += 2) {
    const tl = Math.atan(-Math.cos((lo - subLon) * MOON_RAD) / Math.tan(decR)) / MOON_RAD;
    term += `${lo === -180 ? "M" : "L"}${X(lo).toFixed(1)},${Y(tl).toFixed(1)}`;
  }
  const nightY = subLat >= 0 ? H : 0;
  const nightPath = `${term}L${W},${nightY}L0,${nightY}Z`;
  const lx = X(lon), ly = Y(lat);
  const ps = 1.9, tx = lx - 12 * ps, ty = ly - 22 * ps;
  const pin = `<g class="sm-pin" transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${ps})"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.6" class="sm-pinhole"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="sunmap" role="img" aria-label="World map showing day and night right now">
    <clipPath id="smclip"><rect x="0" y="0" width="${W}" height="${H}" rx="18"/></clipPath>
    <g clip-path="url(#smclip)">
      <rect x="0" y="0" width="${W}" height="${H}" class="sm-sea"/>
      <path d="${WORLD_MAP.land}" class="sm-land"/>
      <path d="${nightPath}" class="sm-night"/>
      <path d="${term}" class="sm-term"/>
    </g>
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18" class="sm-frame"/>
    ${pin}
  </svg>`;
}

function renderSunSheet(keepHead) {
  el.sheetTitle.textContent = "Sun Clock";
  const tz = state.tz || state.data?.current?.timezone || 0;
  const c = state.center || {};
  const lat = c.lat, lon = c.lon;
  if (!Number.isFinite(lat)) { el.sheetNote.textContent = "Location is unavailable."; el.sheetList.innerHTML = ""; return; }
  const nowUnix = Math.floor(Date.now() / 1000);
  const localMidnight = Math.floor((nowUnix + tz) / 86400) * 86400 - tz;
  const t = sunTimes(localMidnight + 43200, lat, lon);
  const dir = lat >= 0 ? 1 : -1;
  const toH = (u) => hourOfDay(u, tz);
  const hToClock = (h) => fmtClock(localMidnight + Math.round(h * 3600), tz);

  const bands = bandsFromSunTimes(t, tz);

  const CX = 150, CY = 150, RI = 62, RO = 116;
  const ang = (h) => -90 + dir * ((h - 12) / 24) * 360;
  const pol = (r, a) => { const rad = a * Math.PI / 180; return [(CX + r * Math.cos(rad)).toFixed(2), (CY + r * Math.sin(rad)).toFixed(2)]; };
  const arc = (ri, ro, h0, h1) => {
    let a0 = ang(h0), a1 = ang(h1); if (a1 < a0) { const s = a0; a0 = a1; a1 = s; }
    const large = (a1 - a0) > 180 ? 1 : 0;
    const [ox0, oy0] = pol(ro, a0), [ox1, oy1] = pol(ro, a1), [ix1, iy1] = pol(ri, a1), [ix0, iy0] = pol(ri, a0);
    return `M${ox0},${oy0} A${ro},${ro} 0 ${large} 1 ${ox1},${oy1} L${ix1},${iy1} A${ri},${ri} 0 ${large} 0 ${ix0},${iy0} Z`;
  };

  const bandInfo = bands.map((b) => ({ name: SUN_BANDS[b[2]].name, from: hToClock(b[0]), to: hToClock(b[1]) }));
  const patOn = state.clockPattern;
  const bandPaths = bands.map((b, i) => {
    const d = arc(RI, RO, b[0], b[1]);
    let s = `<path class="sc-band" data-i="${i}" d="${d}" fill="${SUN_BANDS[b[2]].color}"/>`;
    if (SUN_PATTERN_TYPES[b[2]]) s += `<path class="sc-band-pat" d="${d}" fill="url(#scpat-${b[2]})"/>`;
    return s;
  }).join("");

  let ticks = "";
  for (let h = 0; h < 24; h++) {
    const major = h % 3 === 0;   // 3-hour marks (aligned with the labels) read; hourly ones stay faint
    const [x1, y1] = pol(RO, ang(h)), [x2, y2] = pol(RO + (major ? 7 : 3), ang(h));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sc-tick${major ? " sc-tick-major" : ""}" stroke-width="${major ? 2 : 1}"/>`;
  }
  const hourText = (h) => { if (state.clock24) return String(h); const hh = h % 12 || 12; return `${hh}${h < 12 ? "a" : "p"}`; };
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
    const [x, y] = pol(RO + 20, ang(h));
    return `<text x="${x}" y="${y}" class="sc-hour">${hourText(h)}</text>`;
  }).join("");

  const mt = moonTimes(localMidnight, lat, lon);
  const nowH = toH(nowUnix);
  const [sx, sy] = pol(RO, ang(nowH));
  const sunUp = t.sunrise.up != null && nowUnix >= t.sunrise.up && nowUnix < t.sunrise.down;
  const sunHand = `<line x1="${CX}" y1="${CY}" x2="${sx}" y2="${sy}" class="sc-hand" data-cap="Now · ${fmtClock(nowUnix, tz)}"/><circle cx="${sx}" cy="${sy}" r="8" class="sc-sun"/>`;
  const noonCap = t.noon != null ? `Solar noon · ${fmtClock(t.noon, tz)}` : "";

  // No badges/markers - a tight viewBox so the dial fills the width. Patterns are
  // always drawn and shown/hidden with a class, so the toggle can animate in place.
  const svg = `<svg viewBox="-6 -6 312 312" class="sunclock" role="img" aria-label="24-hour sun clock">
    <defs>${SUN_PATTERN_DEFS}</defs>
    ${bandPaths}
    <circle cx="${CX}" cy="${CY}" r="${RO}" class="sc-ring" fill="none"/>
    ${ticks}${hourLabels}${sunHand}
    <circle cx="${CX}" cy="${CY}" r="5" class="sc-center" data-cap="${noonCap}"/>
  </svg>`;

  const row = (icon, label, value) => `<div class="sun-row"><i class="ph-duotone ${icon}"></i><span class="sun-row-label">${label}</span><strong class="sun-row-val">${value}</strong></div>`;
  const fmtOrDash = (u) => u != null ? fmtClock(u, tz) : "--";
  const goldenAm = t.sunrise.up != null && t.golden.up != null ? `${fmtClock(t.sunrise.up, tz)} to ${fmtClock(t.golden.up, tz)}` : "--";
  const goldenPm = t.golden.down != null && t.sunrise.down != null ? `${fmtClock(t.golden.down, tz)} to ${fmtClock(t.sunrise.down, tz)}` : "--";
  const sectionD = (title, desc, body) => section(title, `<p class="info-desc">${desc}</p>${body}`);
  const intro = `<p class="sun-intro">A 24-hour map of light for your location. Midnight sits at the bottom and noon at the top; the hand shows where the sun is <em>right now</em>. Each shaded band is a stage of light, from bright <strong>day</strong> at the pale end down to full <strong>night</strong> at the dark end, so you can see daylight and darkness fall across the whole day. Tap any band, the sun, or the centre to read its exact times.</p>`;
  const sunMap = sunMapSVG(lat, lon);
  const mapSection = sunMap ? section("Sun map", `<p class="info-desc">Day and night across the world right now. The pin marks your location.</p>${sunMap}`) : "";
  const keyRow = `<div class="sun-key">` + Object.entries(SUN_BANDS).map(([k, v]) => `<span class="sun-key-item"><span class="sun-swatch" style="background:${v.color}"></span>${v.name}</span>`).join("") + `</div>`;
  const list = intro + mapSection +
    sectionD("Sun", "The sun's key moments today. Solar noon is when the sun is highest in the sky, the true middle of the day.", [
      row("ph-sun-horizon", "Sunrise", fmtOrDash(t.sunrise.up)),
      row("ph-sun", "Solar noon", fmtOrDash(t.noon)),
      row("ph-sun-horizon", "Sunset", fmtOrDash(t.sunrise.down))
    ].join("")) +
    sectionD("Golden hour", "The soft, warm, low-angle light just after sunrise and just before sunset. It is the flattering light photographers love.", [
      row("ph-sun", "Morning", goldenAm),
      row("ph-sun", "Evening", goldenPm)
    ].join("")) +
    sectionD("Dawn", "Light building before sunrise. Civil: bright enough to be outside without lights. Nautical: the horizon is still visible and the first stars appear. Astronomical: the faint first glow, before which the sky is fully dark.", [
      row("ph-cloud-sun", "Civil", fmtOrDash(t.civil.up)),
      row("ph-cloud-moon", "Nautical", fmtOrDash(t.nautical.up)),
      row("ph-moon-stars", "Astronomical", fmtOrDash(t.astro.up))
    ].join("")) +
    sectionD("Dusk", "The same three stages after sunset, in reverse: Civil, then Nautical, then Astronomical, after which it is fully dark (night).", [
      row("ph-cloud-sun", "Civil", fmtOrDash(t.civil.down)),
      row("ph-cloud-moon", "Nautical", fmtOrDash(t.nautical.down)),
      row("ph-moon-stars", "Astronomical", fmtOrDash(t.astro.down))
    ].join("")) +
    sectionD("Moon", "Where the moon is in its cycle, how much of it is lit, and when it rises and sets.", [
      row("ph-moon", moonPhase().name, `${moonPhase().illum}%`),
      row("ph-arrow-up", "Moonrise", fmtOrDash(mt.rise)),
      row("ph-arrow-down", "Moonset", fmtOrDash(mt.set))
    ].join("") + `<button class="sun-link" data-open="moon"><span>Moon details</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`);

  el.sheetNote.textContent = sunUp
    ? `Daylight now. Sunset at ${fmtOrDash(t.sunrise.down)}.`
    : `Nighttime now. Sunrise at ${fmtOrDash(t.sunrise.up)}.`;
  const inBand = (b, h) => b[1] > 24 ? (h >= b[0] || h < b[1] - 24) : (h >= b[0] && h < b[1]);
  const curBand = bands.find((b) => inBand(b, nowH)) || bands[bands.length - 1];
  const curName = curBand ? SUN_BANDS[curBand[2]].name : "";
  const defaultCap = curName ? `Right now: ${curName}` : "";
  const toggle = `<div class="segmented small seg-slide sun-fmt" role="group" aria-label="Clock format" data-pos="${state.clock24 ? 1 : 0}">
      <button class="seg-item ${state.clock24 ? "" : "is-active"}" data-fmt="12">12h</button>
      <button class="seg-item ${state.clock24 ? "is-active" : ""}" data-fmt="24">24h</button>
    </div>`;
  // Keep the head toggle across re-renders so its thumb can slide (a fresh
  // element would just jump to the new position).
  if (!keepHead) { el.sheetHeadAux.innerHTML = toggle; el.sheetHeadAux.style.display = ""; }
  const controls = `<div class="sc-controls"><span class="sc-controls-label">Band patterns</span>` +
    `<button class="switch sc-switch" id="scPattern" type="button" role="switch" aria-checked="${patOn ? "true" : "false"}" aria-label="Band patterns">` +
    `<i class="ph ph-circle switch-ic switch-ic-off" aria-hidden="true"></i>` +
    `<i class="ph ph-dots-nine switch-ic switch-ic-on" aria-hidden="true"></i>` +
    `<span class="switch-thumb"></span></button></div>`;
  el.sheetList.innerHTML = `<div class="sc-caption" id="scCaption">${defaultCap}</div><div class="sunclock-wrap${patOn ? "" : " sc-nopat"}">${svg}</div>${controls}${keyRow}${list}`;

  const capEl = el.sheetList.querySelector("#scCaption");
  const setCap = (txt) => { if (capEl) capEl.textContent = txt || defaultCap; };
  el.sheetList.querySelectorAll(".sc-band").forEach((p) => {
    p.addEventListener("click", () => { const b = bandInfo[+p.dataset.i]; setCap(`${b.name} · ${b.from} to ${b.to}`); });
  });
  el.sheetList.querySelectorAll("[data-cap]").forEach((n) => n.addEventListener("click", () => setCap(n.dataset.cap)));
  // 12h/24h: slide the head toggle in place, then re-render the dial/times only.
  el.sheetHeadAux.querySelectorAll("[data-fmt]").forEach((b) => {
    b.addEventListener("click", () => {
      const to24 = b.dataset.fmt === "24";
      if (state.clock24 === to24) return;
      state.clock24 = to24;
      saveState();
      const seg = el.sheetHeadAux.querySelector(".sun-fmt");
      if (seg) { seg.dataset.pos = to24 ? 1 : 0; seg.querySelectorAll("[data-fmt]").forEach((x) => x.classList.toggle("is-active", (x.dataset.fmt === "24") === to24)); }
      renderSunSheet(true);
    });
  });
  // Band patterns: the overlays are always drawn, so just slide the switch and
  // show/hide them with a class - no re-render, so the thumb animates.
  const patBtn = el.sheetList.querySelector("#scPattern");
  if (patBtn) patBtn.addEventListener("click", () => {
    state.clockPattern = !state.clockPattern;
    saveState();
    patBtn.setAttribute("aria-checked", state.clockPattern ? "true" : "false");
    const wrap = el.sheetList.querySelector(".sunclock-wrap");
    if (wrap) wrap.classList.toggle("sc-nopat", !state.clockPattern);
  });
  const moonLink = el.sheetList.querySelector('.sun-link[data-open="moon"]');
  if (moonLink) moonLink.addEventListener("click", () => {
    const v = { metric: "moon", range: "hourly" };
    if (state.sheetOpen && state.nav) state.nav.push(v); else state.nav = [v];
    state.detail = v;
    el.sheetScroll.scrollTop = 0;
    renderDetailSheet();
  });
}

function renderMoonSheet() {
  const now = new Date();
  const moon = moonPhase(now);
  const tz = state.tz || state.data?.current?.timezone || 0;
  const c = state.center || {};
  const nowUnix = Math.floor(Date.now() / 1000);
  const base = Math.floor((nowUnix + tz) / 86400) * 86400 - tz;
  const mt = Number.isFinite(c.lat) ? moonTimes(base, c.lat, c.lon) : {};
  const dist = moonDistanceKm();

  el.sheetTitle.textContent = "Moon";
  el.sheetNote.textContent = `${moon.name} tonight, ${moon.illum}% of the Moon's face is lit.`;

  const hero = `
    <div class="moon-hero">
      <div class="moon-hero-art">${moonSVG(moon.frac)}</div>
      <div class="moon-phase-name">${moon.name}</div>
      <div class="moon-date">${WD_LONG[now.getDay()]}, ${MO_LONG[now.getMonth()]} ${now.getDate()}</div>
    </div>`;

  const figs = `
    <div class="moon-figs">
      <div class="moon-fig"><span class="d-label">Illumination</span><strong>${moon.illum}%</strong></div>
      <div class="moon-fig"><span class="d-label">Moonrise</span><strong>${mt.rise != null ? fmtClock(mt.rise, tz) : "--"}</strong></div>
      <div class="moon-fig"><span class="d-label">Moonset</span><strong>${mt.set != null ? fmtClock(mt.set, tz) : "--"}</strong></div>
    </div>`;

  const phaseDefs = [["New moon", 0], ["First quarter", 0.25], ["Full moon", 0.5], ["Last quarter", 0.75]];
  const upcoming = phaseDefs
    .map(([name, t]) => ({ name, t, date: nextPhaseDate(t) }))
    .sort((a, b) => a.date - b.date)
    .map((p) => `
      <div class="phase-row">
        <span class="phase-glyph">${moonSVG(p.t)}</span>
        <span class="phase-name">${p.name}</span>
        <strong class="phase-date">${fmtDayDate(p.date)}</strong>
      </div>`).join("");

  const y = now.getFullYear(), mo = now.getMonth();
  const startDow = new Date(y, mo, 1).getDay();
  const dim = new Date(y, mo + 1, 0).getDate();
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= dim; day++) {
    const f = moonPhase(new Date(y, mo, day, 12)).frac;
    const today = day === now.getDate();
    cells += `<div class="cal-cell${today ? " is-today" : ""}"><span class="cal-num">${day}</span><span class="cal-moon">${moonSVG(f)}</span></div>`;
  }
  const calendar = `
    <div class="moon-cal">
      <div class="cal-month">${MO_LONG[mo]} ${y}</div>
      <div class="cal-grid cal-dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="cal-grid cal-days">${cells}</div>
    </div>`;

  const guide = PHASE_GUIDE.map(([name, frac, desc]) => `
    <div class="guide-row${name === moon.name ? " is-active" : ""}">
      <span class="phase-glyph">${moonSVG(frac)}</span>
      <div class="guide-body">
        <div class="guide-name">${name}${name === moon.name ? '<span class="guide-now">Now</span>' : ""}</div>
        <p class="guide-desc">${desc}</p>
      </div>
    </div>`).join("");

  el.sheetList.innerHTML =
    hero + figs +
    section("Upcoming phases", `<div class="phase-list">${upcoming}</div>`, true) +
    section("The eight phases", `<p class="info-text">The Moon makes no light of its own, we see the half lit by the Sun. As it orbits Earth about every 29.5 days, the amount of that lit half we can see grows (waxing) and shrinks (waning), giving eight named phases.</p><div class="phase-guide">${guide}</div>`, true) +
    section("The month ahead", calendar, true) +
    section("About illumination", `<p class="info-text">Illumination represents the percentage of the Moon's Earth-facing side lit by the Sun, ranging from 0% at a new moon to 100% at a full moon. This value describes the Moon's phase regardless of your local horizon or weather conditions.</p><p class="info-text info-now">Currently, the Moon's illumination is ${moon.illum}%.</p>`) +
    section("About the Moon's distance", `<p class="info-text">The Moon follows an elliptical orbit, causing its distance from Earth to vary throughout the month between approximately 356,500 km (perigee) and 406,700 km (apogee).</p><p class="info-text info-now">Currently, the Moon is approximately ${groupNum(dist)} km away.</p>`);
}

const CREDITS = [
  ["Weather data", [
    ["OpenWeather", "Current conditions and the daily forecast.", "https://openweathermap.org"],
    ["Open-Meteo", "Hourly forecast, air quality and UV index.", "https://open-meteo.com"]
  ]],
  ["Radar", [
    ["RainViewer", "Global precipitation radar imagery.", "https://www.rainviewer.com"],
    ["Environment and Climate Change Canada", "Canadian radar via the MSC GeoMet service.", "https://eccc-msc.github.io/open-data/"]
  ]],
  ["Maps", [
    ["Leaflet", "The interactive map library.", "https://leafletjs.com"],
    ["CARTO", "Dark basemap tiles.", "https://carto.com/attributions"],
    ["OpenStreetMap contributors", "The underlying map data.", "https://www.openstreetmap.org/copyright"]
  ]],
  ["Icons & type", [
    ["Meteocons", "Animated weather icons by Bas Milius.", "https://bas.dev/work/meteocons"],
    ["Phosphor Icons", "The interface icon set.", "https://phosphoricons.com"],
    ["Inter & Rubik", "Typefaces, served via Google Fonts.", "https://fonts.google.com"]
  ]],
  ["Astronomy", [
    ["SunCalc", "Algorithms behind the sun and moon times.", "https://github.com/mourner/suncalc"]
  ]]
];

function renderAlertsSheet() {
  const tier = (name, key, desc) => `<div class="tier-row tier-${key}"><span class="tier-dot" aria-hidden="true"></span><div class="tier-body"><div class="tier-name">${name}</div><p class="info-text">${desc}</p></div></div>`;
  const type = (name, desc) => `<p class="info-text"><strong>${name}</strong>: ${desc}</p>`;
  el.sheetTitle.textContent = "Weather alerts";
  el.sheetNote.textContent = "In Canada, every weather alert now carries a colour that tells you how serious it is at a glance. Here is what each colour means, along with the kinds of alert you might see.";
  el.sheetList.innerHTML =
    section("What the colours mean",
      tier("Yellow", "yellow", "Moderate, localized or short-lived. These are the most common alerts. Worth keeping an eye on.") +
      tier("Orange", "orange", "Major, more widespread, and may last a day or more. Less common. Be ready to act.") +
      tier("Red", "red", "The most severe: extensive, widespread and prolonged. Take action right away to protect life and property."), true) +
    section("Types of alert",
      type("Watch", "Conditions are favourable for severe weather. It may develop, so stay aware.") +
      type("Advisory", "Weather that is not severe but can still affect your day. Plan around it.") +
      type("Warning", "Severe weather is happening or is very likely. Act now.") +
      type("Special weather statement", "A heads-up about unusual weather that does not yet meet alert criteria.")) +
    section("Where these come from", `<p class="info-text">Alerts shown here are issued by Environment and Climate Change Canada for your area. They are a guide, so always follow the latest official guidance.</p>`);
}

function renderCreditsSheet() {
  el.sheetTitle.textContent = "Acknowledgements";
  el.sheetNote.textContent = "This app is built on free and open data, tools and typefaces. Thank you to the people and projects behind them.";
  el.sheetList.innerHTML = CREDITS.map(([group, items]) =>
    section(group, `<div class="credit-list">${items.map(([name, desc, url]) => `
      <a class="credit-row" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="credit-name">${name}</span>
        <span class="credit-desc">${desc}</span>
      </a>`).join("")}</div>`, true)
  ).join("");
}

const UV_METRIC = { label: "UV Index", unit: "", decimals: 0, zero: true };

function drawUvChart(hourly) {
  // UV shares the one renderer so its detail chart matches every other graph:
  // same grid, scale, "Now" marker and tap-to-read scrubber.
  const pts = todayUv(hourly);
  if (!pts.length) {
    const ctx = el.graph.getContext("2d");
    const rect = el.graph.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    chartGeom = null; chartRedraw = null;
    return;
  }
  const tz = state.tz || 0;
  const localMidnight = Math.floor((Math.floor(Date.now() / 1000) + tz) / 86400) * 86400;
  const rows = pts.map((p) => {
    const hh = Number(p.t.slice(11, 13));
    return { label: `${(hh % 12) || 12}${hh < 12 ? "am" : "pm"}`, hi: p.uv, dt: localMidnight - tz + hh * 3600 };
  });
  drawChart(rows, UV_METRIC, false, true, el.graph);
}

function openDay(index) {
  if (!state.daily[index]) return;
  const view = { metric: "day", dayIndex: index, range: "hourly" };
  if (state.sheetOpen && state.nav) state.nav.push(view);
  else state.nav = [view];
  state.detail = view;
  openSheetUI();
  renderDetailSheet();
}

function renderDaySheet() {
  const day = state.daily[state.detail.dayIndex];
  if (!day) return;
  const tz = state.tz || 0;
  const items = day.items || [];
  el.tabSeg.style.display = "none";
  el.sheetTitle.textContent = dayFull(day.dt, tz);
  el.sheetNote.textContent = daySummary(day, items);
  drawDetailChart();
  el.dayStats.style.display = "";
  el.dayStats.innerHTML = dayStatsHTML(day, items);
  el.sheetList.innerHTML = items.map((it) => {
    const h = new Date((it.dt + tz) * 1000).getUTCHours();
    return `
    <div class="row">
      <span class="row-label">${fmtHour(it.dt, tz)}</span>
      ${wxIcon(it.weather?.[0], h < 6 || h >= 20, "row-icon")}
      <span class="row-temp">${Math.round(it.main.temp)}°<span class="row-sub">${Math.round(it.main.feels_like)}°</span></span>
    </div>`;
  }).join("");
}

function dayFull(dt, tz) {
  const d = new Date((dt + tz) * 1000);
  const today = new Date((Date.now() / 1000 + tz) * 1000).toISOString().slice(0, 10);
  if (d.toISOString().slice(0, 10) === today) return "Today";
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${wd}, ${mo} ${d.getUTCDate()}`;
}

function daySummary(day, items) {
  const feels = items.map((i) => i.main.feels_like).filter(Number.isFinite);
  const fMax = feels.length ? Math.round(Math.max(...feels)) : Math.round(day.max);
  const pop = Math.round((day.pop || 0) * 100);
  const rain = pop > 0 ? ` ${pop}% chance of precipitation.` : "";
  return `High ${Math.round(day.max)}°, low ${Math.round(day.min)}°. Feels like up to ${fMax}°.${rain}`;
}

function dayStatsHTML(day, items) {
  const feels = items.map((i) => i.main.feels_like).filter(Number.isFinite);
  const hums = items.map((i) => i.main.humidity).filter((x) => x != null);
  const winds = items.map((i) => i.wind?.speed || 0);
  const fMin = feels.length ? Math.round(Math.min(...feels)) : Math.round(day.min);
  const fMax = feels.length ? Math.round(Math.max(...feels)) : Math.round(day.max);
  const humAvg = hums.length ? Math.round(hums.reduce((a, b) => a + b, 0) / hums.length) : null;
  const windMax = winds.length ? Math.max(...winds) : 0;
  const pop = Math.round((day.pop || 0) * 100);
  const tiles = [
    ["ph-thermometer-simple", "Feels like", fMin === fMax ? `${fMax}°` : `${fMin}-${fMax}°`],
    ["ph-drop", "Humidity", humAvg != null ? `${humAvg}%` : "--"],
    ["ph-wind", "Wind", windText(windMax)],
    ["ph-umbrella", "Precipitation", `${pop}%`]
  ];
  return tiles.map(([icon, label, value]) => `
    <div class="detail static">
      <i class="ph-duotone ${icon}"></i>
      <span class="d-label">${label}</span>
      <strong class="d-value">${value}</strong>
    </div>`).join("");
}

function detailSeries() {
  const m = METRICS[state.detail.metric];
  const tz = state.tz || 0;
  const withPrecip = state.detail.metric === "temp";
  const raw = state.data?.hourly || [];
  const today = new Date((Math.floor(Date.now() / 1000) + tz) * 1000).toISOString().slice(0, 10);
  const dayKey = (dt) => new Date((dt + tz) * 1000).toISOString().slice(0, 10);
  const day = raw.filter((it) => dayKey(it.dt) === today);
  const src = day.length ? day : (state.hourly || []);
  return src
    .map((it) => ({ label: fmtHour(it.dt, tz), hi: m.get(it), dt: it.dt, precip: withPrecip ? (it.precip || 0) : 0 }))
    .filter((r) => Number.isFinite(r.hi));
}

function drawDetailChart() {
  if (state.detail.metric === "aqi" || state.detail.metric === "uv") return;
  if (state.detail.metric === "day") {
    const day = state.daily[state.detail.dayIndex];
    if (!day) return;
    const tz = state.tz || 0;
    drawChart((day.items || []).map((it) => ({ label: fmtHour(it.dt, tz), hi: it.main.temp, lo: Number.isFinite(it.main.feels_like) ? it.main.feels_like : it.main.temp, dt: it.dt, precip: it.precip || 0, uv: uvForHour(it.dt) })), METRICS.temp, true, day.label === "Today", el.graph);
    return;
  }
  const m = METRICS[state.detail.metric];
  if (state.detail.metric === "temp" && state.detail.range === "daily") {
    drawChart(state.daily.map((d) => ({ label: d.label, hi: d.max, lo: d.min, uv: d.uvMax, precip: (d.items || []).reduce((s, it) => s + (it.precip || 0), 0) })), m, true, false);
  } else {
    drawChart(detailSeries(), m, false, true, el.graph, true, !!m.bars);
  }
}

const ABOUT_TITLES = {
  temp: "About temperature", feels: "About feels-like temperature", humidity: "About humidity",
  wind: "About wind", pressure: "About pressure", precip: "About precipitation",
  clouds: "About cloud cover", visibility: "About visibility"
};

function aboutSection(metric, m) {
  if (!m.about) return "";
  return section(ABOUT_TITLES[metric] || `About ${m.label}`, `<p class="info-text">${m.about}</p>`);
}

function renderDetailList() {
  const m = METRICS[state.detail.metric];
  const tz = state.tz || 0;
  if (state.detail.metric === "temp" && state.detail.range === "daily") {
    el.sheetList.innerHTML = state.daily.map((d, i) => `
      <button class="row row-tap" data-day="${i}">
        <span class="row-label">${d.label}</span>
        ${wxIcon({ main: d.main, icon: d.icon }, false, "row-icon")}
        <span class="row-hilo">
          <span class="hilo-item"><i class="ph ph-arrow-up" aria-hidden="true"></i>${Math.round(d.max)}°</span>
          <span class="hilo-item"><i class="ph ph-arrow-down" aria-hidden="true"></i>${Math.round(d.min)}°</span>
        </span>
        <i class="ph ph-caret-right row-go"></i>
      </button>`).join("") + aboutSection(state.detail.metric, m);
    el.sheetList.querySelectorAll("[data-day]").forEach((b) => b.onclick = () => openDay(Number(b.dataset.day)));
    return;
  }
  const dec = m.decimals || 0;
  const unit = state.detail.metric === "wind" ? speedUnit() : state.detail.metric === "visibility" ? visUnit() : m.unit;
  const valTxt = (v) => {
    const n = dec ? v.toFixed(dec) : `${Math.round(v)}`;
    return unit === "°" ? `${n}°` : `${n} ${unit}`;
  };
  const showWx = state.detail.metric === "temp";
  el.sheetList.innerHTML = (state.hourly || []).map((it) => {
    const hh = new Date((it.dt + tz) * 1000).getUTCHours();
    const pop = Math.round((it.pop || 0) * 100);
    const mm = it.precip != null ? it.precip : (it.rain?.["3h"] || 0) + (it.snow?.["3h"] || 0);
    const mmTxt = mm > 0 ? (mm >= 10 ? Math.round(mm) : Math.round(mm * 10) / 10) : 0;
    const wx = showWx
      ? `<span class="row-precip"><i class="ph-fill ph-drop"></i><span class="rp-chance">${pop}%</span><span class="rp-amt">${mmTxt ? `${mmTxt} mm` : ""}</span></span>`
      : "";
    return `
    <div class="row${showWx ? " row-wx" : ""}">
      <span class="row-label">${fmtHour(it.dt, tz)}</span>
      ${wxIcon(it.weather?.[0], hh < 6 || hh >= 20, "row-icon")}
      ${wx}
      <span class="row-temp">${valTxt(m.get(it))}</span>
    </div>`;
  }).join("") + aboutSection(state.detail.metric, m);
}

function hexA(hex, a) {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

let chartGeom = null, chartRedraw = null;

// ---- Day overview: today's temperature band, same chart as the daily views --
// Reuses drawChart so the home card, the day sheet and the daily forecast all
// share one look: temperature (bold) over feels-like (soft), the range shaded
// between them, with precipitation bars. Just fed today's 24 hours.
// UV for a given hour from the air feed (today only - that feed is one day of
// local hours). Returns null when unavailable so the UV line simply drops out.
function uvForHour(dt) {
  const air = state.data?.air?.hourly;
  if (!air?.uv_index || !air?.time) return null;
  const tz = state.tz || 0;
  const today = new Date((Math.floor(Date.now() / 1000) + tz) * 1000).toISOString().slice(0, 10);
  if (new Date((dt + tz) * 1000).toISOString().slice(0, 10) !== today) return null;
  const h = new Date((dt + tz) * 1000).getUTCHours();
  for (let i = 0; i < air.time.length; i++) {
    if (parseInt(String(air.time[i]).slice(11, 13), 10) === h) return Number.isFinite(air.uv_index[i]) ? air.uv_index[i] : null;
  }
  return null;
}

function renderDayView() {
  if (!el.dayGraph) return;
  const tz = state.tz || 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const localDay = (s) => new Date((s + tz) * 1000).toISOString().slice(0, 10);
  const today = localDay(nowSec);
  const all = (state.data?.hourly || []).filter((p) => Number.isFinite(p.main?.temp));
  let src = all.filter((p) => localDay(p.dt) === today);
  if (src.length < 3) src = all.filter((p) => p.dt >= nowSec - 3600).slice(0, 24);
  const rows = src.map((p) => ({
    label: fmtHour(p.dt, tz),
    hi: p.main.temp,
    lo: Number.isFinite(p.main.feels_like) ? p.main.feels_like : p.main.temp,
    dt: p.dt,
    precip: p.precip || 0,
    uv: uvForHour(p.dt)
  }));
  drawChart(rows, METRICS.temp, true, true, el.dayGraph);
}

// ---- Precipitation nowcast ------------------------------------------------
// A single short-range message about rain right now or imminently, built from
// Open-Meteo's 15-minute precipitation. Deliberately narrow: it only speaks
// when rain is falling or about to, so it never just restates the day summary.
const NOWCAST_TR = 0.05;        // mm per 15 min counted as meaningful precipitation
const NOWCAST_SOON = 75;        // only announce a dry-now start within this many minutes

function precipWord(cap) {
  const t = state.data?.current?.main?.temp;
  const c = t == null ? 20 : (state.units === "imperial" ? (t - 32) * 5 / 9 : t);
  const w = c <= 1 ? "snow" : "rain";
  return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

function nowcastModel() {
  const mins = state.data?.minutely;
  if (!mins || mins.length < 2) return null;
  const now = Date.now() / 1000;
  const win = mins.filter((b) => b.dt >= now - 900 && b.dt <= now + 120 * 60);
  if (win.length < 2) return null;

  const vals = win.map((b) => Math.max(0, b.precip || 0));
  const maxV = Math.max(...vals);
  const rainingNow = vals[0] > NOWCAST_TR;
  const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);
  const word = maxV > 2 ? `Heavy ${precipWord(false)}` : maxV > 0.6 ? precipWord(true) : `Light ${precipWord(false)}`;

  if (rainingNow) {
    let stop = -1;
    for (let i = 1; i < vals.length; i++) { if (vals[i] <= NOWCAST_TR) { stop = i; break; } }
    if (stop === -1) return { headline: `${word} for at least the next two hours.` };
    const m = round5((win[stop].dt - now) / 60);
    return { headline: m <= 5 ? `${word} easing off within minutes.` : `${word} easing off in about ${m} min.` };
  }

  let start = -1;
  for (let i = 0; i < vals.length; i++) { if (vals[i] > NOWCAST_TR) { start = i; break; } }
  if (start === -1) return null;
  const m = round5((win[start].dt - now) / 60);
  if (m > NOWCAST_SOON) return null;   // still hours off; the day summary already covers it
  let end = start;
  while (end < vals.length && vals[end] > NOWCAST_TR) end++;
  const dur = (end - start) * 15;
  const lead = m <= 5 ? `${word} starting within minutes` : `${word} starting in about ${m} min`;
  const tail = end >= vals.length ? ", lasting a while" : dur <= 15 ? ", a brief burst" : `, about ${dur} min of it`;
  return { headline: `${lead}${tail}.` };
}

function renderNowcast() {
  const host = el.nowcast;
  if (!host) return;
  const model = nowcastModel();
  if (!model) { host.hidden = true; return; }
  host.hidden = false;
  if (el.nowcastLine) el.nowcastLine.textContent = model.headline;
  if (el.nowcastIc) el.nowcastIc.className = `ph-fill ${precipWord(false) === "snow" ? "ph-snowflake" : "ph-drop"} nowcast-ic`;
}

// ---- On this day (historical records) ---------------------------------------
// Pull the daily archive (ERA5 reanalysis, from 2000 by default, 1970 on
// request) for this place, keep the rows landing on today's calendar day, and
// surface the warmest/coldest/wettest years plus how today compares to the
// long-run average. The full archive is cached raw for a fortnight, so it is
// fetched rarely and just re-filtered cheaply each day.
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function todayMonthDay() {
  const tz = state.tz || 0;
  const d = new Date((Math.floor(Date.now() / 1000) + tz) * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return { mmdd: `${mm}-${dd}`, label: `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}` };
}

function loadOtdRaw() { try { return JSON.parse(localStorage.getItem(OTD_CACHE_KEY) || "null"); } catch { return null; } }
function saveOtdRaw(o) { try { localStorage.setItem(OTD_CACHE_KEY, JSON.stringify(o)); } catch { /* quota */ } }
function loadOtdResult() { try { return JSON.parse(localStorage.getItem(OTD_RESULT_KEY) || "null"); } catch { return null; } }
function saveOtdResult(o) { try { localStorage.setItem(OTD_RESULT_KEY, JSON.stringify(o)); } catch { /* quota */ } }
function otdStartYear() { return state.otdFull ? OTD_START_FULL : OTD_START_DEFAULT; }
function otdKey() { const c = state.center || state.loc; return `${(+c.lat).toFixed(1)},${(+c.lon).toFixed(1)},${state.units},${otdStartYear()}`; }

// Records for a day. The Worker is the fast path (server-side, tiny payload,
// edge-cached) but never a hard dependency: if it's unreachable, errors, or is
// running an older build that doesn't return the per-year series, fall back to
// fetching the archive directly and computing everything client-side.
async function otdRecords(lat, lon, mmdd, label, key) {
  const start = otdStartYear();
  if (OTD_PROXY) {
    try {
      const u = `${OTD_PROXY}?lat=${(+lat).toFixed(3)}&lon=${(+lon).toFixed(3)}&unit=${state.units}&mmdd=${mmdd}&start=${start}`;
      const j = await fetchJSON(u, 20000);
      if (j && !j.error && j.hi && Array.isArray(j.series) && j.series.length >= 4) {
        return { key, mmdd, label, count: j.count, hi: j.hi, lo: j.lo, wet: j.wet, avgHigh: j.avgHigh, series: j.series };
      }
    } catch { /* fall through to the direct fetch */ }
  }
  const raw = await fetchOtdRaw(lat, lon, start);
  raw.key = key; raw.fetchedAt = Date.now(); saveOtdRaw(raw);
  return processOtd(raw, mmdd, key, label);
}

async function fetchOtdRaw(lat, lon, startYear = OTD_START_DEFAULT) {
  const tu = state.units === "imperial" ? "fahrenheit" : "celsius";
  // The archive lags several days and 400s if end_date runs past what's ready.
  // We only need past years anyway (the newest relevant day is a year ago), so
  // pull the end back a safe week. Precip stays in mm and is converted at render
  // to keep the request minimal.
  const end = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const url = `${ARCHIVE_BASE}?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${end}`
    + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tu}&timezone=auto`;
  // Read the body even on error so Open-Meteo's `reason` surfaces instead of a
  // bare status, and so failures are diagnosable rather than silent.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25000);
  let res, j;
  try { res = await fetch(url, { signal: ctl.signal }); j = await res.json(); }
  finally { clearTimeout(timer); }
  if (!res.ok || (j && j.error)) throw new Error((j && j.reason) || `HTTP ${res.status}`);
  const d = j && j.daily;
  if (!d || !Array.isArray(d.time)) throw new Error("no daily data returned");
  return { time: d.time, tmax: d.temperature_2m_max, tmin: d.temperature_2m_min, precip: d.precipitation_sum };
}

// Reduce the raw archive to the records for a given MM-DD.
function processOtd(raw, mmdd, key, label) {
  const { time, tmax, tmin, precip } = raw;
  let hi = null, lo = null, wet = null, sumHi = 0, nHi = 0;
  const years = new Set();
  const series = [];
  for (let i = 0; i < time.length; i++) {
    if (String(time[i]).slice(5, 10) !== mmdd) continue;
    const year = String(time[i]).slice(0, 4);
    const mx = tmax ? tmax[i] : null, mn = tmin ? tmin[i] : null, pr = precip ? precip[i] : null;
    if (Number.isFinite(mx) || Number.isFinite(mn)) {
      series.push({ y: Number(year), hi: Number.isFinite(mx) ? mx : null, lo: Number.isFinite(mn) ? mn : null, p: Number.isFinite(pr) ? pr : 0 });
    }
    if (Number.isFinite(mx)) { years.add(year); sumHi += mx; nHi++; if (!hi || mx > hi.v) hi = { v: mx, year }; }
    if (Number.isFinite(mn) && (!lo || mn < lo.v)) lo = { v: mn, year };
    if (Number.isFinite(pr) && pr > 0 && (!wet || pr > wet.v)) wet = { v: pr, year };
  }
  return { key, mmdd, label, count: years.size, hi, lo, wet, avgHigh: nHi ? sumHi / nHi : null, series };
}

// ---- Monthly climatology (for the Historical detail screen) ------------------
// Per-year, per-month mean temp + precip total, plus the long-run baseline, so
// the grid can colour each month by its anomaly. The Worker computes it
// server-side (tiny payload); the direct archive fetch is the fallback and the
// aggregation is done here to match. Result is small, so we cache it.
function otdMonthlyKey() { const c = state.center || state.loc; return `${(+c.lat).toFixed(2)},${(+c.lon).toFixed(2)},${state.units},${otdStartYear()}`; }
function loadOtdMonthlyCache() { try { return JSON.parse(localStorage.getItem("hw_otd_monthly_v1") || "null"); } catch { return null; } }
function saveOtdMonthlyCache(o) { try { localStorage.setItem("hw_otd_monthly_v1", JSON.stringify(o)); } catch { /* quota */ } }

function aggregateMonthly(raw, start, key) {
  const { time, tmax, tmin, precip } = raw;
  const byYear = new Map();
  for (let i = 0; i < time.length; i++) {
    const y = Number(String(time[i]).slice(0, 4)), m = Number(String(time[i]).slice(5, 7)) - 1;
    if (!(m >= 0 && m < 12)) continue;
    let rec = byYear.get(y);
    if (!rec) { rec = { t: Array(12).fill(0), tn: Array(12).fill(0), p: Array(12).fill(0), pn: Array(12).fill(0) }; byYear.set(y, rec); }
    const mx = tmax ? tmax[i] : null, mn = tmin ? tmin[i] : null, p = precip ? precip[i] : null;
    if (Number.isFinite(mx) && Number.isFinite(mn)) { rec.t[m] += (mx + mn) / 2; rec.tn[m]++; }
    if (Number.isFinite(p)) { rec.p[m] += p; rec.pn[m]++; }
  }
  const rnd = (v) => Math.round(v * 10) / 10;
  const years = [...byYear.keys()].sort((a, b) => a - b).map((y) => {
    const rec = byYear.get(y);
    return { y, t: rec.t.map((s, m) => rec.tn[m] ? rnd(s / rec.tn[m]) : null), p: rec.p.map((s, m) => rec.pn[m] >= 20 ? Math.round(s) : null) };
  });
  const base = (pick, round) => Array(12).fill(0).map((_, m) => { const v = years.map((yr) => pick(yr)[m]).filter(Number.isFinite); return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null; });
  return { key, mode: "monthly", start, years, baseT: base((yr) => yr.t, rnd), baseP: base((yr) => yr.p, Math.round) };
}

async function fetchOtdMonthly(lat, lon, start, key) {
  if (OTD_PROXY) {
    try {
      const u = `${OTD_PROXY}?lat=${(+lat).toFixed(3)}&lon=${(+lon).toFixed(3)}&unit=${state.units}&mode=monthly&start=${start}`;
      const j = await fetchJSON(u, 25000);
      if (j && !j.error && Array.isArray(j.years) && j.years.length >= 4) {
        return { key, mode: "monthly", start, years: j.years, baseT: j.baseT, baseP: j.baseP };
      }
    } catch { /* fall through */ }
  }
  const raw = await fetchOtdRaw(lat, lon, start);
  return aggregateMonthly(raw, start, key);
}

let otdMonthlyPending = null;
function loadOtdMonthly() {
  const key = otdMonthlyKey();
  if (state.otdMonthly && state.otdMonthly.key === key) { renderHistorySheet(); return; }
  const cached = loadOtdMonthlyCache();
  if (cached && cached.key === key && Date.now() - (cached.at || 0) < 30 * 864e5) {
    state.otdMonthly = cached; renderHistorySheet(); return;
  }
  if (otdMonthlyPending === key) return;
  otdMonthlyPending = key;
  renderHistorySheet();   // shows the loading state
  const c = state.center || state.loc;
  fetchOtdMonthly(c.lat, c.lon, otdStartYear(), key)
    .then((o) => { if (otdMonthlyKey() !== key) return; o.at = Date.now(); state.otdMonthly = o; saveOtdMonthlyCache(o); if (state.detail?.metric === "history") renderHistorySheet(); })
    .catch(() => { if (state.detail?.metric === "history") renderHistorySheet(true); })
    .finally(() => { if (otdMonthlyPending === key) otdMonthlyPending = null; });
}

// ---- Warming-grid renderer (Historical detail screen) -----------------------
// One ring per year, twelve monthly wedges, each coloured by how far that month
// sat from the long-run normal - a diverging scale (blue↔red for temperature,
// brown↔teal for precipitation).
// Annular wedge path; a=0 points up, angle increases clockwise.
function annularWedge(cx, cy, ri, ro, a0, a1) {
  const pt = (r, a) => `${(cx + r * Math.sin(a)).toFixed(2)} ${(cy - r * Math.cos(a)).toFixed(2)}`;
  return `M${pt(ro, a0)} A${ro} ${ro} 0 0 1 ${pt(ro, a1)} L${pt(ri, a1)} A${ri} ${ri} 0 0 0 ${pt(ri, a0)} Z`;
}
// Shared value->radius scale across every year, so the roses are comparable.
function histScale(monthly, metric) {
  const vals = [];
  monthly.years.forEach((yr) => (metric === "precip" ? yr.p : yr.t).forEach((v) => { if (Number.isFinite(v)) vals.push(v); }));
  if (!vals.length) return { lo: 0, hi: 1 };
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (metric === "precip") lo = 0;   // rainfall reads from an absolute zero
  else { const pad = (hi - lo) * 0.05; lo -= pad; }
  if (hi <= lo) hi = lo + 1;
  return { lo, hi };
}
// The petals themselves: twelve monthly wedges, each length = that month's
// average on the shared scale. Solid ink, no colour - like the Sun Clock.
function monthRose(yr, metric, scale, cx, cy, rHub, rOut, gap) {
  const arr = metric === "precip" ? yr.p : yr.t;
  let w = "";
  for (let m = 0; m < 12; m++) {
    const a0 = m * Math.PI / 6 + gap, a1 = (m + 1) * Math.PI / 6 - gap, v = arr[m];
    if (!Number.isFinite(v)) { w += `<path d="${annularWedge(cx, cy, rHub, rHub + 1.5, a0, a1)}" class="wg-miss"/>`; continue; }
    const f = Math.max(0, Math.min(1, (v - scale.lo) / (scale.hi - scale.lo)));
    w += `<path d="${annularWedge(cx, cy, rHub, rHub + (rOut - rHub) * f, a0, a1)}" class="wg-wedge"/>`;
  }
  return w;
}
function yearRose(yr, metric, scale) {
  const S = 48, c = S / 2;
  return `<svg viewBox="0 0 ${S} ${S}" class="wg-donut" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${c - 1}" class="wg-guide"/>${monthRose(yr, metric, scale, c, c, 4, c - 2, 0.05)}</svg>`;
}
function warmingGrid(monthly, metric, scale) {
  return `<div class="wg-grid">` + monthly.years.map((yr) =>
    `<button class="wg-cell" type="button" data-year="${yr.y}" aria-label="${yr.y}">${yearRose(yr, metric, scale)}<span class="wg-year">${String(yr.y).slice(2)}</span></button>`
  ).join("") + `</div>`;
}
// Enlarged view of one year: labelled rose + a month-by-month value list.
function histDetailHTML(yr, metric, scale) {
  const S = 184, c = S / 2, rOut = 66, labR = 82;
  const ini = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const full = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lab = "";
  for (let m = 0; m < 12; m++) { const am = (m + 0.5) * Math.PI / 6; lab += `<text x="${(c + labR * Math.sin(am)).toFixed(1)}" y="${(c - labR * Math.cos(am)).toFixed(1)}" class="wg-key-lab">${ini[m]}</text>`; }
  const arr = metric === "precip" ? yr.p : yr.t;
  const fmt = (v) => !Number.isFinite(v) ? "–" : (metric === "precip"
    ? (state.units === "imperial" ? `${(v / 25.4).toFixed(1)}"` : `${Math.round(v)}mm`)
    : `${Math.round(v)}°`);
  const chips = full.map((mn, i) => `<span class="wg-chip"><span class="wg-chip-m">${mn}</span><strong>${fmt(arr[i])}</strong></span>`).join("");
  const what = metric === "precip" ? "monthly precipitation" : "monthly average temperature";
  return `<div class="wg-detail">
    <div class="wg-detail-head">${yr.y}<span>${what}</span></div>
    <div class="wg-detail-body">
      <svg viewBox="0 0 ${S} ${S}" class="wg-detail-svg" role="img" aria-label="${yr.y} ${what}"><circle cx="${c}" cy="${c}" r="${rOut + 2}" class="wg-guide"/>${monthRose(yr, metric, scale, c, c, 12, rOut, 0.05)}${lab}</svg>
      <div class="wg-chips">${chips}</div>
    </div>
  </div>`;
}
function selectHistYear(y, scroll) {
  const m = state.otdMonthly; if (!m) return;
  const yr = m.years.find((r) => r.y === y); if (!yr) return;
  state.histYear = y;
  const metric = state.otdMetric === "precip" ? "precip" : "temp";
  const d = document.getElementById("wgDetail");
  if (d) d.innerHTML = histDetailHTML(yr, metric, histScale(m, metric));
  el.sheetList.querySelectorAll(".wg-cell").forEach((b) => b.classList.toggle("is-sel", Number(b.dataset.year) === y));
  if (scroll && el.sheetScroll) el.sheetScroll.scrollTo({ top: 0, behavior: "smooth" });
}
function renderHistorySheet(err) {
  if (!el.sheetList || state.detail?.metric !== "history") return;
  el.sheetTitle.textContent = "Historical data";
  el.tabSeg.style.display = "none";
  el.dayStats.style.display = "none";
  const key = otdMonthlyKey(), place = state.placeName || "this location";
  const metric = state.otdMetric === "precip" ? "precip" : "temp";
  if (err) { el.sheetNote.textContent = "Couldn't load the historical archive right now."; el.sheetList.innerHTML = ""; return; }
  const m = state.otdMonthly;
  if (!m || m.key !== key) {
    el.sheetNote.textContent = `Building the monthly climate history for ${place}…`;
    el.sheetList.innerHTML = `<p class="otd-lead otd-loading">Digging through the archive…</p>`;
    return;
  }
  const span = `${m.years[0].y}–${m.years[m.years.length - 1].y}`;
  el.sheetNote.textContent = metric === "temp"
    ? `Average temperature for every month, ${span}. Each ring is a year; a longer petal is a warmer month. Tap a year to open it.`
    : `Total precipitation for every month, ${span}. Each ring is a year; a longer petal is a wetter month. Tap a year to open it.`;
  const scale = histScale(m, metric);
  const toggle = `<div class="segmented small seg-slide hist-toggle" role="group" aria-label="Metric" data-pos="${metric === "precip" ? 1 : 0}">`
    + `<button class="seg-item ${metric === "temp" ? "is-active" : ""}" data-hm="temp">Temperature</button>`
    + `<button class="seg-item ${metric === "precip" ? "is-active" : ""}" data-hm="precip">Precipitation</button></div>`;
  el.sheetList.innerHTML = toggle + `<div class="wg-detail-wrap" id="wgDetail"></div>` + warmingGrid(m, metric, scale) + histLegend(metric);
  el.sheetList.querySelectorAll("[data-hm]").forEach((b) => b.onclick = () => { state.otdMetric = b.dataset.hm; renderHistorySheet(); });
  el.sheetList.querySelectorAll(".wg-cell").forEach((b) => b.onclick = () => selectHistYear(Number(b.dataset.year), true));
  const init = (state.histYear && m.years.some((r) => r.y === state.histYear)) ? state.histYear : m.years[m.years.length - 1].y;
  selectHistYear(init, false);   // fill the detail without yanking the scroll on first paint
}
function histLegend(metric) {
  const S = 116, c = S / 2, ro = 40, ri = 19, labR = 50;
  const names = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  let w = "", lab = "";
  for (let m = 0; m < 12; m++) {
    const a0 = m * Math.PI / 6, a1 = (m + 1) * Math.PI / 6, am = (a0 + a1) / 2;
    w += `<path d="${annularWedge(c, c, ri, ro, a0, a1)}" class="wg-key-wedge"/>`;
    lab += `<text x="${(c + labR * Math.sin(am)).toFixed(1)}" y="${(c - labR * Math.cos(am)).toFixed(1)}" class="wg-key-lab">${names[m]}</text>`;
  }
  return `<div class="wg-legend"><div class="wg-key"><svg viewBox="0 0 ${S} ${S}" class="wg-key-svg">${w}${lab}</svg>`
    + `<span class="wg-key-cap">Each ring is one year. Months run clockwise from January at the top; a longer petal means a ${metric === "precip" ? "wetter" : "warmer"} month.</span></div></div>`;
}

let otdPendingKey = null;
function loadOnThisDay() {
  if (!el.onThisDay) return;
  const key = otdKey();
  const { mmdd, label } = todayMonthDay();
  if (state.otd && state.otd.key === key && state.otd.mmdd === mmdd && Array.isArray(state.otd.series) && state.otd.series.length >= 4) { renderOnThisDay(); return; }
  // Small processed result, cached a couple of days so re-opens are instant.
  // Require a series too, so a copy cached before the graph/series existed is
  // treated as a miss and refetched instead of silently showing no graph.
  const cached = loadOtdResult();
  if (cached && cached.key === key && cached.mmdd === mmdd && Array.isArray(cached.series) && cached.series.length >= 4 && Date.now() - (cached.at || 0) < 2 * 864e5) {
    state.otd = cached; renderOnThisDay(); return;
  }
  // Direct-path raw archive cache (only present when the browser can reach the
  // archive itself; the whole history is one download, re-filtered each day).
  const raw = !OTD_PROXY && loadOtdRaw();
  if (raw && raw.key === key && Date.now() - (raw.fetchedAt || 0) < 60 * 864e5) {
    state.otd = processOtd(raw, mmdd, key, label); renderOnThisDay(); return;
  }
  if (otdPendingKey === key) return;   // render runs twice on startup; fetch once
  otdPendingKey = key;
  renderOtdLoading(label);   // show a card immediately so the wait isn't a blank gap
  setTimeout(() => {
    const c = state.center || state.loc;
    otdRecords(c.lat, c.lon, mmdd, label, key).then((o) => {
      if (otdKey() !== key) return;   // location changed mid-flight
      o.at = Date.now();
      state.otd = o; saveOtdResult(o);
      renderOnThisDay();
    }).catch((err) => { if (otdKey() === key) renderOtdError(err && err.message); })
      .finally(() => { if (otdPendingKey === key) otdPendingKey = null; });
  }, 250);
}

function renderOtdError(msg) {
  const host = el.onThisDay;
  if (!host) return;
  host.hidden = false;
  const { label } = todayMonthDay();
  el.otdCard.innerHTML =
    `<div class="otd-head"><span class="otd-date">${label}</span></div>`
    + `<p class="otd-lead">Couldn't load the archive${msg ? `: ${escapeHTML(String(msg))}` : "."}</p>`;
}

function renderOtdLoading(label) {
  const host = el.onThisDay;
  if (!host) return;
  host.hidden = false;
  el.otdCard.innerHTML =
    `<div class="otd-head"><span class="otd-date">${label}</span></div>`
    + `<p class="otd-lead otd-loading">Digging through the archive for ${label}…</p>`;
}

function otdRow(icon, label, value, year) {
  return `<div class="otd-row"><i class="ph-duotone ${icon} otd-ic" aria-hidden="true"></i>`
    + `<span class="otd-row-label">${label}</span><span class="otd-row-val">${value}</span>`
    + `<span class="otd-row-year">${year}</span></div>`;
}

// Year-over-year chart of the day's high & low (lines) and precipitation (bars)
// across every year on record. Labelled axes (temperature left, year bottom) on
// a nice-stepped grid, monochrome to match the app's other charts, and it scrubs
// like them: tap/drag anywhere to read a year. Geometry is stashed for the
// pointer handler wired in renderOnThisDay.
let otdChartGeom = null;
function otdChart(series) {
  const pts = (series || []).filter((d) => Number.isFinite(d.hi) || Number.isFinite(d.lo)).sort((a, b) => a.y - b.y);
  otdChartGeom = null;
  if (pts.length < 4) return "";
  const W = 328, H = 156, padL = 30, padR = 8, padT = 12, padB = 22;
  const n = pts.length, plotW = W - padL - padR, plotH = H - padT - padB;
  const x = (i) => padL + plotW * (n === 1 ? 0.5 : i / (n - 1));
  const temps = pts.flatMap((d) => [d.hi, d.lo]).filter(Number.isFinite);
  const sc = niceScale(Math.min(...temps), Math.max(...temps), 4);
  const y = (v) => padT + plotH * (1 - (v - sc.min) / Math.max(1e-6, sc.max - sc.min));

  let grid = "", yLab = "";
  for (let v = sc.min; v <= sc.max + 1e-6; v += sc.step) {
    const gy = y(v).toFixed(1);
    grid += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" class="otd-grid"/>`;
    yLab += `<text x="${padL - 6}" y="${gy}" class="otd-axis otd-axis-y">${Math.round(v)}°</text>`;
  }
  const xStep = Math.max(1, Math.ceil(n / 5));
  let xLab = "";
  for (let i = 0; i < n - xStep + 1; i += xStep) xLab += `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : "middle"}" class="otd-axis">${pts[i].y}</text>`;
  xLab += `<text x="${x(n - 1).toFixed(1)}" y="${H - 6}" text-anchor="end" class="otd-axis">${pts[n - 1].y}</text>`;

  const maxP = Math.max(1, ...pts.map((d) => d.p || 0));
  const bw = Math.max(1.4, plotW / n * 0.5);
  const bars = pts.map((d, i) => {
    const h = (d.p || 0) / maxP * (plotH * 0.32);
    return h < 0.6 ? "" : `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(padT + plotH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="currentColor" opacity="0.13"/>`;
  }).join("");
  const line = (key, dash) => {
    const seg = pts.filter((d) => Number.isFinite(d[key]));
    const pl = seg.map((d) => `${x(pts.indexOf(d)).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
    return `<polyline points="${pl}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="${dash ? "0.5" : "0.92"}"${dash ? ' stroke-dasharray="3 3.5"' : ""}/>`;
  };
  const cross = `<g class="otd-cross"><line class="otd-cross-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}"/>`
    + `<circle class="otd-cross-dot otd-cross-hi" r="3.4"/><circle class="otd-cross-dot otd-cross-lo" r="3.4"/></g>`;
  const hit = `<rect class="otd-hit" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}"/>`;
  const svg = `<svg class="otd-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="Yearly high and low temperature on this day; drag to read a year">`
    + grid + bars + line("lo", true) + line("hi", false) + cross + yLab + xLab + hit + `</svg>`;
  const legend = `<div class="otd-legend">`
    + `<span class="otd-leg"><span class="otd-leg-line"></span>High</span>`
    + `<span class="otd-leg"><span class="otd-leg-line otd-leg-dash"></span>Low</span>`
    + `<span class="otd-leg"><span class="otd-leg-bar"></span>Precip</span></div>`;
  otdChartGeom = { pts, W, xOf: x, yOf: y };
  return `<div class="otd-graphwrap">${svg}<div class="otd-readout" id="otdReadout" aria-live="polite"></div>${legend}</div>`;
}

// Wire the home chart's scrub: drag along it to read each year's numbers, the
// same touch-anywhere interaction the hourly/daily charts use.
function wireOtdChart() {
  const g = otdChartGeom;
  const svg = el.otdCard && el.otdCard.querySelector(".otd-graph");
  if (!g || !svg) return;
  const cross = svg.querySelector(".otd-cross");
  const line = svg.querySelector(".otd-cross-line");
  const chi = svg.querySelector(".otd-cross-hi");
  const clo = svg.querySelector(".otd-cross-lo");
  const readout = document.getElementById("otdReadout");
  const punit = state.units === "imperial" ? "in" : "mm";
  const show = (idx) => {
    const d = g.pts[idx], px = g.xOf(idx);
    cross.classList.add("is-on");
    line.setAttribute("x1", px); line.setAttribute("x2", px);
    const setDot = (c, v) => { if (Number.isFinite(v)) { c.setAttribute("cx", px); c.setAttribute("cy", g.yOf(v)); c.style.opacity = "1"; } else c.style.opacity = "0"; };
    setDot(chi, d.hi); setDot(clo, d.lo);
    if (readout) {
      const pv = state.units === "imperial" ? (d.p / 25.4).toFixed(2) : Math.round(d.p || 0);
      const hi = Number.isFinite(d.hi) ? `${Math.round(d.hi)}°` : "–", lo = Number.isFinite(d.lo) ? `${Math.round(d.lo)}°` : "–";
      readout.innerHTML = `<strong>${d.y}</strong><span class="otd-read-hi">${hi}</span><span class="otd-read-lo">${lo}</span>${d.p > 0 ? `<span class="otd-read-p">${pv} ${punit}</span>` : ""}`;
    }
  };
  const idxAt = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vbx = (clientX - r.left) / r.width * g.W;
    let idx = 0, best = Infinity;
    g.pts.forEach((d, i) => { const dx = Math.abs(g.xOf(i) - vbx); if (dx < best) { best = dx; idx = i; } });
    return idx;
  };
  let active = false;
  svg.addEventListener("pointerdown", (e) => { active = true; try { svg.setPointerCapture(e.pointerId); } catch {} show(idxAt(e.clientX)); });
  svg.addEventListener("pointermove", (e) => { if (active) show(idxAt(e.clientX)); });
  const end = () => { active = false; };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  show(g.pts.length - 1);   // start on the most recent year so it's never blank
}

function renderOnThisDay() {
  const o = state.otd, host = el.onThisDay;
  if (!host) return;
  if (!o || !o.hi || !o.lo) { host.hidden = true; return; }
  if (o.count < 5) {   // fetch worked but almost nothing matched - say so, don't vanish
    host.hidden = false;
    el.otdCard.innerHTML =
      `<div class="otd-head"><span class="otd-date">${o.label}</span></div>`
      + `<p class="otd-lead">Only ${o.count} year${o.count === 1 ? "" : "s"} of records here so far.</p>`;
    return;
  }
  host.hidden = false;
  const punit = state.units === "imperial" ? "in" : "mm";   // archive precip is mm
  const wetVal = o.wet ? (state.units === "imperial" ? (o.wet.v / 25.4).toFixed(2) : Math.round(o.wet.v)) : null;
  const todayHigh = state.daily?.[0]?.max;
  let lead;
  if (todayHigh != null && o.avgHigh != null) {
    const diff = Math.round(todayHigh - o.avgHigh);
    lead = Math.abs(diff) <= 1
      ? `Today's high of ${Math.round(todayHigh)}° sits right around the ${o.label} average of ${Math.round(o.avgHigh)}°.`
      : `Today's high of ${Math.round(todayHigh)}° is ${Math.abs(diff)}° ${diff > 0 ? "warmer" : "cooler"} than the ${o.label} average of ${Math.round(o.avgHigh)}°.`;
  } else {
    lead = `Weather records for ${o.label} at this spot.`;
  }
  const rows = [
    otdRow("ph-thermometer-hot", "Warmest", `${Math.round(o.hi.v)}°`, o.hi.year),
    otdRow("ph-thermometer-cold", "Coldest", `${Math.round(o.lo.v)}°`, o.lo.year)
  ];
  if (wetVal != null && Number(wetVal) > 0) rows.push(otdRow("ph-cloud-rain", "Most Precipitation", `${wetVal} ${punit}`, o.wet.year));
  const firstYear = (o.series && o.series.length) ? o.series[0].y : otdStartYear();
  const moreBtn = state.otdFull ? "" :
    `<button class="otd-more" type="button"><i class="ph-duotone ph-clock-counter-clockwise" aria-hidden="true"></i><span>See back to ${OTD_START_FULL}</span></button>`;
  el.otdCard.innerHTML =
    `<div class="otd-head"><span class="otd-date">${o.label}</span><span class="otd-count">${o.count} years · since ${firstYear}</span></div>`
    + `<p class="otd-lead">${lead}</p><div class="otd-rows">${rows.join("")}</div>`
    + otdChart(o.series)
    + `<button class="otd-open" type="button"><span>Monthly averages & every year</span><i class="ph ph-arrow-right" aria-hidden="true"></i></button>`
    + moreBtn;
  wireOtdChart();
  const open = el.otdCard.querySelector(".otd-open");
  if (open) open.onclick = () => openDetail("history");
  const btn = el.otdCard.querySelector(".otd-more");
  if (btn) btn.onclick = () => {
    // Deepen the range: new key (start year is part of it), fresh fetch.
    state.otdFull = true;
    state.otd = null;
    loadOnThisDay();
  };
}

// Round a data range to a clean [min, max] and step (1/2/5 x 10^n) so an axis
// reads on equal, sensible intervals.
function niceScale(min, max, ticks = 4) {
  if (!(max > min)) max = min + 1;
  const rawStep = (max - min) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const n = rawStep / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

function drawChart(rows, m, dual, showNow, canvas, labelLo = true, bars = false) {
  // Shared band chart. Defaults to the detail-sheet canvas (with the scrubber
  // geometry); pass another canvas (e.g. the day-overview) to reuse the exact
  // same look without the interactive state. labelLo can be turned off when the
  // two lines run close (temp vs feels-like) so their labels don't collide.
  canvas = canvas || el.graph;
  const interactive = canvas === el.graph;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (interactive) { chartGeom = null; chartRedraw = null; }
  if (!rows.length) return;

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
  const vals = rows.flatMap((r) => dual ? [r.hi, r.lo] : [r.hi]).filter(Number.isFinite);
  let dmin = Math.min(...vals), dmax = Math.max(...vals);
  if (dmin === dmax) { dmin -= 1; dmax += 1; }
  // Round the axis to a "nice" range and step so gridlines land on clean values
  // at equal intervals, rather than plotting against an arbitrary data-fit range.
  const pad = (dmax - dmin) * 0.06 || 1;
  // Metrics that can't go negative (humidity, wind, precip, UV…) anchor their
  // axis at 0 so the baseline is meaningful and the scale reads consistently.
  const sc = (m.zero && dmin >= 0) ? niceScale(0, dmax + pad, 4) : niceScale(dmin - pad, dmax + pad, 4);
  const min = (m.zero && dmin >= 0) ? 0 : sc.min, max = sc.max, tickStep = sc.step;
  const anyPrecip = rows.some((r) => (r.precip || 0) > 0);
  const padL = 16, padR = 16, padTop = 34, padB = 30;
  const w = rect.width - padL - padR, h = rect.height - padTop - padB;
  const X = (i) => padL + (w / Math.max(1, rows.length - 1)) * i;
  const Y = (v) => padTop + h - ((v - min) / Math.max(1e-6, max - min)) * h;
  const dec = m.decimals || 0;
  const lab = (v) => dec ? v.toFixed(dec) : (m.unit === "°" ? `${Math.round(v)}°` : `${Math.round(v)}`);

  // Which x positions get a label + vertical rule: hourly rules the 6-hour
  // marks (12am, 6am, 12pm, 6pm); daily/other series rule every ~8th point.
  const tz = state.tz || 0;
  const isHourly = Number.isFinite(rows[0]?.dt);
  const hourAt = (i) => new Date((rows[i].dt + tz) * 1000).getUTCHours();
  const labelTicks = isHourly
    ? rows.map((_, i) => i).filter((i) => hourAt(i) % 6 === 0)
    : rows.map((_, i) => i).filter((i) => i % Math.max(1, Math.ceil(rows.length / 8)) === 0);

  // Full grid: horizontal lines at the nice value steps, vertical rules at the
  // label ticks. Every chart gets the same grid so they read consistently.
  ctx.strokeStyle = ink; ctx.lineWidth = 1;
  ctx.globalAlpha = 0.12;
  for (let v = min; v <= max + 1e-6; v += tickStep) {
    const gy = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(rect.width - padR, gy); ctx.stroke();
  }
  ctx.globalAlpha = 0.08;
  labelTicks.forEach((i) => { ctx.beginPath(); ctx.moveTo(X(i), padTop); ctx.lineTo(X(i), padTop + h); ctx.stroke(); });
  ctx.globalAlpha = 1;

  // Precipitation bars along the bottom, on their own mm scale (left axis).
  const maxP = anyPrecip ? Math.max(0.1, ...rows.map((r) => r.precip || 0)) : 0;
  const barMaxH = h * 0.4;
  if (anyPrecip) {
    const slotW = w / Math.max(1, rows.length - 1);
    const barW = Math.min(slotW * 0.55, 12);
    ctx.fillStyle = hexA(ink, 0.2);
    rows.forEach((r, i) => { const p = r.precip || 0; if (p > 0) { const bh = (p / maxP) * barMaxH; ctx.fillRect(X(i) - barW / 2, padTop + h - bh, barW, bh); } });
  }
  const hasUV = rows.some((r) => Number.isFinite(r.uv));

  const curve = (key) => {
    rows.forEach((r, i) => {
      const px = X(i), py = Y(r[key]);
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, Y(rows[i - 1][key]), cx, py, px, py); }
    });
  };

  if (bars) {
    // Bar mode: draw the primary series as columns from the baseline (e.g.
    // precipitation). Uses the same grid and scale as every other chart.
    const slotW = w / Math.max(1, rows.length - 1);
    const bw = Math.min(slotW * 0.6, 16);
    const base = padTop + h;
    ctx.fillStyle = hexA(ink, 0.7);
    rows.forEach((r, i) => { if (Number.isFinite(r.hi) && r.hi > min) ctx.fillRect(X(i) - bw / 2, Y(r.hi), bw, base - Y(r.hi)); });
  } else if (!dual) {
    ctx.beginPath(); curve("hi");
    ctx.lineTo(X(rows.length - 1), padTop + h); ctx.lineTo(X(0), padTop + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, padTop, 0, padTop + h);
    g.addColorStop(0, hexA(ink, 0.26)); g.addColorStop(1, hexA(ink, 0));
    ctx.fillStyle = g; ctx.fill();
  } else {
    ctx.beginPath(); curve("hi");
    for (let i = rows.length - 1; i >= 0; i--) {
      const px = X(i), py = Y(rows[i].lo);
      if (i === rows.length - 1) ctx.lineTo(px, py);
      else { const cx = (X(i + 1) + px) / 2; ctx.bezierCurveTo(cx, Y(rows[i + 1].lo), cx, py, px, py); }
    }
    ctx.closePath(); ctx.fillStyle = hexA(ink, 0.14); ctx.fill();
  }

  const stroke = (key, alpha, width) => { ctx.beginPath(); curve(key); ctx.strokeStyle = ink; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); ctx.globalAlpha = 1; };
  if (!bars) {
    if (dual) stroke("lo", 0.4, 3);
    stroke("hi", 1, 3.5);
  }

  // Optional UV overlay: a dotted line on its own 0-11 scale (right axis), with
  // the day's peak labelled. Drawn when rows carry uv.
  if (hasUV) {
    const UY = (u) => padTop + h - Math.min(1, Math.max(0, u / 11)) * h * 0.92;
    const uvAt = (i) => Number.isFinite(rows[i].uv) ? rows[i].uv : 0;
    ctx.setLineDash([1.5, 4]); ctx.strokeStyle = hexA(ink, 0.5); ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    rows.forEach((r, i) => {
      const px = X(i), py = UY(uvAt(i));
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, UY(uvAt(i - 1)), cx, py, px, py); }
    });
    ctx.stroke(); ctx.setLineDash([]);
    let up = 0; rows.forEach((_, i) => { if (uvAt(i) > uvAt(up)) up = i; });
    if (uvAt(up) >= 1) {
      const uy = UY(uvAt(up));
      ctx.fillStyle = hexA(ink, 0.75); ctx.font = "700 10px Inter, system-ui"; ctx.textAlign = "center";
      ctx.beginPath(); ctx.arc(X(up), uy, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(`UV ${Math.round(uvAt(up))}`, Math.max(padL + 18, Math.min(rect.width - padR - 18, X(up))), uy - 5);
    }
  }

  // Band charts carry two secondary axes: precipitation (mm) on the left and
  // UV on the right. Drawn inset over the plot so it stays edge-to-edge.
  if (dual) {
    ctx.font = "700 9px Inter, system-ui"; ctx.textBaseline = "alphabetic";
    if (anyPrecip) {
      ctx.textAlign = "left"; ctx.fillStyle = hexA(ink, 0.5);
      const pmax = maxP >= 10 ? `${Math.round(maxP)}` : `${Math.round(maxP * 10) / 10}`;
      ctx.fillText(`${pmax}mm`, padL + 2, padTop + h - barMaxH - 4);
      ctx.fillText("0", padL + 2, padTop + h - 3);
    }
    if (hasUV) {
      ctx.textAlign = "right"; ctx.fillStyle = hexA(ink, 0.5);
      ctx.fillText("UV 11", rect.width - padR - 2, padTop + h * 0.08 + 8);
      ctx.fillText("0", rect.width - padR - 2, padTop + h - 3);
    }
    ctx.textAlign = "center";
  }

  if (showNow && rows.length && rows[0].dt != null) {
    const now = Date.now() / 1000;
    let nf = null;
    if (now <= rows[0].dt) nf = 0;
    else if (now < rows[rows.length - 1].dt) {
      for (let i = 0; i < rows.length - 1; i++) {
        if (now >= rows[i].dt && now <= rows[i + 1].dt) { nf = i + (now - rows[i].dt) / (rows[i + 1].dt - rows[i].dt); break; }
      }
    }
    if (nf != null) {
      const nx = X(nf);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nx, padTop); ctx.lineTo(nx, padTop + h); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.6; ctx.fillStyle = ink; ctx.font = "700 11px Inter, system-ui"; ctx.textAlign = "center";
      ctx.fillText("Now", Math.max(padL + 14, Math.min(rect.width - padR - 14, nx)), padTop - 12);
      ctx.globalAlpha = 1;
    }
  }

  const keyIdx = (arr) => { let mn = 0, mx = 0; arr.forEach((v, i) => { if (v < arr[mn]) mn = i; if (v > arr[mx]) mx = i; }); return { mn, mx }; };
  const end = rows.length - 1;
  let hiIdx, loIdx = new Set();
  if (rows.length > 10) {
    const k = keyIdx(rows.map((r) => r.hi));
    hiIdx = new Set([0, end, k.mx, k.mn]);
    if (dual) { const kl = keyIdx(rows.map((r) => r.lo)); loIdx = new Set([0, end, kl.mn, kl.mx]); }
  } else {
    hiIdx = new Set(rows.map((_, i) => i));
    if (dual) loIdx = new Set(rows.map((_, i) => i));
  }
  // Label each line on its outer side (away from the other), so temp and feels-
  // like labels never collide even where the two run close or cross.
  const hiSide = (i) => (!dual || rows[i].hi >= rows[i].lo) ? -13 : 18;
  const loSide = (i) => (rows[i].lo >= rows[i].hi) ? -13 : 18;

  ctx.font = "700 12px Inter, system-ui"; ctx.fillStyle = ink;
  // Anchor the endpoint labels to the plot edges so they don't clip now that
  // the plot runs edge-to-edge to line up with the rows below.
  const labelX = (i) => i === 0 ? X(0) : i === end ? X(end) : X(i);
  const labelAlign = (i) => i === 0 ? "left" : i === end ? "right" : "center";
  if (bars) {
    // Only the tallest bar carries a value, so the columns stay clean.
    let pk = 0; rows.forEach((r, i) => { if ((r.hi || 0) > (rows[pk].hi || 0)) pk = i; });
    if ((rows[pk].hi || 0) > min) {
      ctx.textAlign = labelAlign(pk);
      ctx.fillText(lab(rows[pk].hi), labelX(pk), Y(rows[pk].hi) - 8);
    }
  } else {
    hiIdx.forEach((i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(rows[i].hi), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = labelAlign(i);
      ctx.fillText(lab(rows[i].hi), labelX(i), Y(rows[i].hi) + hiSide(i));
    });
  }
  if (dual && labelLo) {
    ctx.globalAlpha = 0.7;
    loIdx.forEach((i) => {
      ctx.beginPath(); ctx.arc(X(i), Y(rows[i].lo), 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = labelAlign(i);
      ctx.fillText(lab(rows[i].lo), labelX(i), Y(rows[i].lo) + loSide(i));
    });
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = "center";

  ctx.globalAlpha = 0.55; ctx.fillStyle = ink;
  ctx.textAlign = "center";
  // Labels sit under the vertical rules; the first flush with the plot's left
  // edge and the last flush right so they line up with any rows below.
  labelTicks.forEach((i) => {
    ctx.textAlign = i === 0 ? "left" : i === end ? "right" : "center";
    const hw = ctx.measureText(rows[i].label).width / 2;
    const x = i === 0 || i === end ? X(i) : Math.max(hw + 1, Math.min(rect.width - hw - 1, X(i)));
    ctx.fillText(rows[i].label, x, rect.height - 10);
  });
  ctx.textAlign = "center";
  ctx.globalAlpha = 1;

  const geom = {
    xs: rows.map((_, i) => X(i)), ys: rows.map((r) => Y(r.hi)),
    rows, padTop, h, rect, dual, fmt: lab
  };
  const redraw = () => drawChart(rows, m, dual, showNow, canvas, labelLo, bars);
  if (interactive) { chartGeom = geom; chartRedraw = redraw; }
  else if (canvas === el.dayGraph) { dayGeom = geom; dayRedraw = redraw; }
}
let dayGeom = null, dayRedraw = null;

function showChartPoint(clientX) { scrubChart(el.graph, chartGeom, chartRedraw, clientX); }
function showDayPoint(clientX) { scrubChart(el.dayGraph, dayGeom, dayRedraw, clientX); }

// Tap/drag to read a chart. Works on any canvas given its geometry + redraw fn.
function scrubChart(canvas, g, redraw, clientX) {
  if (!canvas || !g || !redraw) return;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const xs = g.xs;
  let idx = 0, best = Infinity;
  for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - x); if (d < best) { best = d; idx = i; } }
  redraw();
  const r = g.rows[idx];
  if (!r) return;
  const ctx = canvas.getContext("2d");
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff";
  const px = g.xs[idx], py = g.ys[idx];
  ctx.save();
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(px, g.padTop); ctx.lineTo(px, g.padTop + g.h); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  const val = g.fmt(r.hi) + (g.dual && r.lo != null ? ` / ${g.fmt(r.lo)}` : "");
  const uv = Number.isFinite(r.uv) ? `  ·  UV ${Math.round(r.uv)}` : "";
  const rain = (r.precip || 0) > 0 ? `  ·  ${r.precip >= 10 ? Math.round(r.precip) : Math.round(r.precip * 10) / 10} mm` : "";
  const text = `${r.label}  ${val}${uv}${rain}`;
  ctx.font = "700 12px Inter, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width + 18, bh = 24;
  let bx = Math.max(2, Math.min(g.rect.width - tw - 2, px - tw / 2));
  ctx.fillStyle = ink;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, 2, tw, bh, 9); ctx.fill(); }
  else ctx.fillRect(bx, 2, tw, bh);
  ctx.fillStyle = bg; ctx.fillText(text, bx + tw / 2, 2 + bh / 2);
  ctx.restore();
}

// ---- Settings drop-up: a small menu that springs out of the nav bar ---------
function openSettingsPop() {
  if (state.popOpen) return;
  state.popOpen = true;
  el.settingsPop.classList.add("is-open");
  el.settingsPop.setAttribute("aria-hidden", "false");
  const gear = el.bottomNav.querySelector('[data-nav="settings"]');
  if (gear) gear.setAttribute("aria-expanded", "true");
  syncNav();
}
function closeSettingsPop() {
  if (!state.popOpen) return;
  state.popOpen = false;
  el.settingsPop.classList.remove("is-open");
  el.settingsPop.setAttribute("aria-hidden", "true");
  const gear = el.bottomNav.querySelector('[data-nav="settings"]');
  if (gear) gear.setAttribute("aria-expanded", "false");
  syncNav();
}

// ---- Bottom navigation ------------------------------------------------------
const NAV_TABS = ["home", "radar", "search", "news", "settings"];

function navTo(tab) {
  if (tab === "home") {
    closeSettingsPop(); closeSheet(); closeRadar(); closeSearch(); closeNews();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (tab === "radar") {
    closeSettingsPop(); closeSheet(); closeSearch(); closeNews();
    if (!state.radarOpen) openRadar();
    return;
  }
  if (tab === "search") {
    closeSettingsPop(); closeSheet(); closeRadar(); closeNews();
    if (!state.searchOpen) openSearch();
    return;
  }
  if (tab === "news") {
    closeSettingsPop(); closeSheet(); closeRadar(); closeSearch();
    if (!state.newsOpen) openNews();
    else { const sc = el.newsSheet && el.newsSheet.querySelector(".sheet-scroll"); if (sc) sc.scrollTo({ top: 0, behavior: "smooth" }); }
    return;
  }
  if (tab === "settings") {
    // The drop-up floats over whatever screen is showing - no screen change,
    // and tapping the gear again folds it away.
    if (state.popOpen) closeSettingsPop(); else openSettingsPop();
  }
}

// The thumb tracks whichever top-level surface is open; detail sheets are
// sub-screens of Home, so Home stays lit while they're up.
function syncNav() {
  if (!el.bottomNav) return;
  const tab = state.popOpen ? "settings" : state.radarOpen ? "radar" : state.searchOpen ? "search" : state.newsOpen ? "news" : "home";
  el.bottomNav.dataset.pos = String(NAV_TABS.indexOf(tab));
  el.bottomNav.querySelectorAll("[data-nav]").forEach((b) => {
    const on = b.dataset.nav === tab;
    b.classList.toggle("is-active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  updateHomeNavAffordance();
  updateNewsNavAffordance();
}

function haveLeaflet() { return typeof window.L !== "undefined"; }
// Apple-Weather-style basemap: a clean, low-chroma CARTO map that flips with
// the app theme (Positron in light, Dark Matter in dark) so the coloured
// precipitation overlay always sits on high-contrast, muted terrain.
function radarTileUrl() {
  return state.dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
}
function owmTileUrl(layer) {
  return `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${API_KEY}`;
}
function rvUrl(f) {
  return `${radar.host}${f.path}/${RV_SIZE}/{z}/{x}/{y}/${RV_COLOR}/${RV_OPTS}.png`;
}

function curIsNight() {
  const c = state.data?.current, s = c?.sys;
  if (!c || !s?.sunrise || !s?.sunset) return false;
  return c.dt < s.sunrise || c.dt >= s.sunset;
}
function locationPinIcon() {
  const t = state.data?.current?.main?.temp;
  const temp = (t == null) ? "" : `${Math.round(t)}°`;
  const svg = wxSVG(wxResolve(state.data?.current?.weather?.[0], curIsNight()), false);
  return L.divIcon({
    className: "map-pin-wrap",
    html: `<span class="map-pin"><strong class="map-pin-temp">${temp}</strong><i class="wx-icon" aria-hidden="true">${svg}</i></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
}
function setPinMarker(map, ref) {
  if (!map) return null;
  const c = state.center;
  if (radar[ref]) { radar[ref].setLatLng([c.lat, c.lon]).setIcon(locationPinIcon()); return radar[ref]; }
  radar[ref] = L.marker([c.lat, c.lon], { icon: locationPinIcon(), interactive: false, keyboard: false }).addTo(map);
  return radar[ref];
}

async function initRadarPreview() {
  if (radar.preview) return;
  if (!haveLeaflet()) {
    if ((radar._previewTries = (radar._previewTries || 0) + 1) <= 60) setTimeout(initRadarPreview, 200);
    else if (el.radarPreviewMap) el.radarPreviewMap.innerHTML = '<div class="map-fallback">Map unavailable right now.</div>';
    return;
  }
  try {
    const c = state.center;
    // Assign radar.preview BEFORE setView: if anything below throws, the guard
    // (`if (radar.preview) return`) still holds, so we never re-run L.map on the
    // now-tagged container and hit "Map container is already initialized".
    const map = L.map(el.radarPreviewMap, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false
    });
    radar.preview = map;
    map.setView([c.lat, c.lon], 9);
    radar.previewBase = L.tileLayer(radarTileUrl(), { subdomains: "abcd", updateWhenZooming: false, keepBuffer: 1 }).addTo(map);
    let previewTileErrs = 0, previewTilesLoaded = 0;
    radar.previewBase.on("tileload", () => { previewTilesLoaded++; });
    radar.previewBase.on("tileerror", () => {
      if (++previewTileErrs === 8 && radar.previewBase) radar.previewBase.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    });
    setPinMarker(map, "previewMarker");
    // The preview lives below the fold, so it's often created/measured before
    // it has a real size and never fetches tiles - the card then looks like the
    // black fallback. Re-measure and, while still blank, force the base layer to
    // redraw; as a last resort swap CARTO for OSM. This runs on a short timer
    // ramp, on resize, AND when the card actually scrolls into view.
    const heal = (lastResort) => {
      if (!radar.preview || !radar.previewBase) return;
      radar.preview.invalidateSize();
      if (previewTilesLoaded === 0) {
        if (lastResort) radar.previewBase.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
        else radar.previewBase.redraw();
      }
    };
    requestAnimationFrame(() => heal(false));
    [120, 500, 1000, 2000].forEach((d) => setTimeout(() => heal(false), d));
    setTimeout(() => heal(true), 4000);
    if ("ResizeObserver" in window && !radar._previewRO) {
      radar._previewRO = new ResizeObserver(() => heal(false));
      radar._previewRO.observe(el.radarPreviewMap);
    }
    if ("IntersectionObserver" in window && !radar._previewIO) {
      radar._previewIO = new IntersectionObserver((ents) => {
        if (ents.some((e) => e.isIntersecting)) heal(false);
      }, { threshold: 0.05 });
      radar._previewIO.observe(el.radarPreviewMap);
    }
    if (inCanada(c.lat, c.lon)) {
      const frames = await ensureEccc().catch(() => null);
      if (radar.preview && frames && frames.length) {
        const f = frames[frames.length - 1];
        const ec = L.tileLayer.wms(ECCC_WMS, {
          layers: ecccLayer(), format: "image/png", transparent: true, version: "1.3.0",
          crs: L.CRS.EPSG3857, opacity: 0.8, maxZoom: 12,
          attribution: "&copy; Environment and Climate Change Canada (ECCC GeoMet)"
        }).addTo(radar.preview);
        ec.setParams({ time: f.iso });
        const ecc = ec.getContainer && ec.getContainer();
        if (ecc) ecc.style.filter = "hue-rotate(140deg) saturate(2) brightness(1.1)";
      } else {
        const rvFrames = await ensureFrames();
        if (radar.preview && rvFrames.length) {
          L.tileLayer(rvUrl(rvFrames[radar.idx]), { opacity: 0.8, tileSize: RV_SIZE }).addTo(radar.preview);
        }
      }
    } else {
      const frames = await ensureFrames();
      if (radar.preview && frames.length) {
        L.tileLayer(rvUrl(frames[radar.idx]), { opacity: 0.8, tileSize: RV_SIZE }).addTo(radar.preview);
      }
    }
  } catch {}
}

function initRadarMap() {
  if (!haveLeaflet()) { el.radarMap.innerHTML = '<div class="map-fallback">The map needs an internet connection.</div>'; el.radarTimeline.style.display = "none"; return; }
  const c = state.center;
  if (radar.map) { radar.map.setView([c.lat, c.lon]); return; }
  try {
    radar.map = L.map(el.radarMap, { zoomControl: true, attributionControl: false, preferCanvas: true, minZoom: 3, maxZoom: 12 }).setView([c.lat, c.lon], 9);
    radar.base = L.tileLayer(radarTileUrl(), {
      subdomains: "abcd", maxZoom: 19, updateWhenZooming: false, keepBuffer: 1, attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(radar.map);
    let baseTileErrs = 0;
    radar.base.on("tileerror", () => {
      if (++baseTileErrs === 8 && radar.base) radar.base.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    });
    setPinMarker(radar.map, "marker");
  } catch {
    el.radarMap.innerHTML = '<div class="map-fallback">The map could not be loaded.</div>';
    el.radarTimeline.style.display = "none";
  }
}

function warmRadar() {
  if (!haveLeaflet() || state.radarOpen || radar.map) return;
  initRadarMap();
  if (radar.map && radar.mode === "radar") loadRadar();
}

function openRadar(mode) {
  // Default to rain every time it's opened; only honour an explicit layer when
  // one is passed in (e.g. a "Live maps" link that deep-links to lightning).
  radar.mode = (typeof mode === "string" && mode) ? mode : "radar";
  state.radarOpen = true;
  el.radarSheet.classList.add("is-open");
  el.radarSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  syncNav();
  initRadarMap();
  setTimeout(() => radar.map && radar.map.invalidateSize(), 320);
  // First radar open of the session: reveal the picker expanded, then let it
  // fold away gracefully so the user learns the other layers are in there.
  if (!radarHintShown) {
    radarHintShown = true;
    setLayerExpanded(true);
    radarHintTimer = setTimeout(() => {
      radarHintTimer = null;
      if (state.radarOpen) setLayerExpanded(false);
    }, 1500);
  } else {
    setLayerExpanded(false);   // open showing just the active layer's icon
  }
  const warmed = radar.mode === "radar" && radar.layers.length;
  if (!warmed) {
    applyMode(radar.mode);
    return;
  }
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) => b.classList.toggle("is-active", b.dataset.layer === radar.mode));
  scrollActiveLayerIntoView();
  el.radarTimeline.style.display = "";
  if (el.radarLegend) el.radarLegend.style.display = "";
  updateRadarNote();
  if (radar.ready) { radar.idx = 0; startRadarPlay(); }
}

let layerExpanded = false;
let radarHintShown = false;   // once per app session
let radarHintTimer = null;
function setLayerExpanded(on) {
  layerExpanded = on;
  el.layerSeg.classList.toggle("is-collapsed", !on);
  if (on) scrollActiveLayerIntoView();
}
function scrollActiveLayerIntoView() {
  const active = el.layerSeg && el.layerSeg.querySelector(".seg-item.is-active");
  if (active && active.scrollIntoView) active.scrollIntoView({ inline: "center", block: "nearest" });
}
function closeRadar() {
  if (!state.radarOpen) return;
  state.radarOpen = false;
  if (radarHintTimer) { clearTimeout(radarHintTimer); radarHintTimer = null; }
  stopRadarPlay();
  disableWindArrows();
  disableAirQuality();
  setMapFull(el.radarSheet, el.radarFull, () => radar.map, false);
  el.radarSheet.classList.remove("is-open");
  el.radarSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  syncNav();
}

function applyMode(mode) {
  radar.mode = mode;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.layer === mode));
  scrollActiveLayerIntoView();
  updateRadarNote();
  if (!haveLeaflet() || !radar.map) return;
  stopRadarPlay();
  removeRadarLayers();
  if (radar.owm) { radar.map.removeLayer(radar.owm); radar.owm = null; }
  disableWindArrows();
  disableAirQuality();
  const isRadar = mode === "radar";
  const isWind = mode === "wind_new";
  const isAir = mode === "air_quality";
  const isLightning = mode === "lightning";
  el.radarTimeline.style.display = isRadar ? "" : "none";
  if (el.radarLegend) el.radarLegend.style.display = isRadar ? "" : "none";
  if (el.windLegend) el.windLegend.style.display = isWind ? "" : "none";
  if (el.aqiLegend) el.aqiLegend.style.display = isAir ? "" : "none";
  if (isRadar) {
    loadRadar();
  } else if (isAir) {
    enableAirQuality();
  } else if (isLightning) {
    radar.owm = L.tileLayer.wms(ECCC_WMS, { layers: ECCC_LAYER_LIGHTNING, format: "image/png", transparent: true, version: "1.3.0", opacity: 0.85, updateWhenZooming: false, keepBuffer: 1, attribution: "&copy; Environment Canada" }).addTo(radar.map);
  } else {
    const opacity = isWind ? 0.3 : 0.72;
    radar.owm = L.tileLayer(owmTileUrl(mode), { opacity, maxZoom: 12, maxNativeZoom: 9, updateWhenZooming: false, keepBuffer: 1, attribution: "&copy; OpenWeather" }).addTo(radar.map);
    if (isWind) enableWindArrows();
  }
}

function removeRadarLayers() {
  radar.layers.forEach((l) => l && radar.map.removeLayer(l));
  radar.layers = [];
  radar.shown.clear();
}

function enableWindArrows() {
  if (!radar.map) return;
  if (!radar.windLayer) radar.windLayer = L.layerGroup().addTo(radar.map);
  if (!radar.windMoveHandler) {
    radar.windMoveHandler = () => scheduleWindArrows();
    radar.map.on("moveend zoomend", radar.windMoveHandler);
  }
  drawWindArrows();
}

function disableWindArrows() {
  if (radar.map && radar.windMoveHandler) { radar.map.off("moveend zoomend", radar.windMoveHandler); }
  radar.windMoveHandler = null;
  if (radar.windDebounce) { clearTimeout(radar.windDebounce); radar.windDebounce = null; }
  if (radar.map && radar.windLayer) { radar.map.removeLayer(radar.windLayer); }
  radar.windLayer = null;
  radar.windReq++;
}

function scheduleWindArrows() {
  if (radar.windDebounce) clearTimeout(radar.windDebounce);
  radar.windDebounce = setTimeout(drawWindArrows, 260);
}

async function drawWindArrows() {
  if (!radar.map || radar.mode !== "wind_new" || !radar.windLayer) return;
  const req = ++radar.windReq;
  const b = radar.map.getBounds(), size = radar.map.getSize();
  const cols = Math.max(3, Math.min(7, Math.round(size.x / 104)));
  const rows = Math.max(4, Math.min(9, Math.round(size.y / 104)));
  const north = b.getNorth(), south = b.getSouth(), west = b.getWest(), east = b.getEast();
  const pts = [];
  for (let r = 0; r < rows; r++) {
    const lat = north - (r + 0.5) * (north - south) / rows;
    for (let cc = 0; cc < cols; cc++) pts.push([lat, west + (cc + 0.5) * (east - west) / cols]);
  }
  const data = await fetchWindGrid(pts).catch(() => null);
  if (!data || req !== radar.windReq || radar.mode !== "wind_new" || !radar.windLayer) return;
  radar.windLayer.clearLayers();
  pts.forEach((p, i) => {
    const d = data[i];
    if (!d || d.speed == null || d.dir == null) return;
    radar.windLayer.addLayer(L.marker(p, { icon: windArrowIcon(d.speed, d.dir), interactive: false, keyboard: false }));
  });
}

async function fetchWindGrid(pts) {
  const wu = state.units === "imperial" ? "mph" : "kmh";
  const lat = pts.map((p) => p[0].toFixed(3)).join(",");
  const lon = pts.map((p) => p[1].toFixed(3)).join(",");
  const url = `${WX_BASE}?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=${wu}&timeformat=unixtime`;
  const j = await fetchJSON(url);
  const arr = Array.isArray(j) ? j : [j];
  return arr.map((o) => ({ speed: o.current?.wind_speed_10m, dir: o.current?.wind_direction_10m }));
}

const WIND_STOPS = [
  [0, "#7db8e8"], [12, "#63d9c8"], [24, "#7fe38a"], [40, "#ffd23f"], [58, "#ff9f43"], [80, "#ff5a5a"]
];
function windColor(speed) {
  const kmh = state.units === "imperial" ? speed * 1.609 : speed;
  let c = WIND_STOPS[0][1];
  for (const [t, col] of WIND_STOPS) { if (kmh >= t) c = col; else break; }
  return c;
}

function windArrowIcon(speed, dir) {
  const kmh = state.units === "imperial" ? speed * 1.609 : speed;
  const rot = (dir + 180) % 360;
  const color = windColor(speed);
  const val = Math.round(speed);
  const S = 44, c = S / 2, half = 13;
  const arrow = `<g transform="rotate(${rot.toFixed(1)} ${c} ${c})">
      <g stroke="${color}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <line x1="${c}" y1="${c + half}" x2="${c}" y2="${c - half}"/>
        <polyline points="${c - 5.5},${c - half + 6} ${c},${c - half} ${c + 5.5},${c - half + 6}"/>
      </g></g>`;
  const label = `<text x="${c}" y="${S - 2}" class="wind-arrow-val" fill="${color}">${val}</text>`;
  const svg = `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${arrow}${label}</svg>`;
  return L.divIcon({ className: "wind-arrow", html: svg, iconSize: [S, S], iconAnchor: [c, c] });
}

// ---- Air-quality heat map ---------------------------------------------------
// Sample US AQI on a fixed lattice from Open-Meteo, then paint a smooth inverse-
// distance-weighted field onto a canvas overlay for a continuous Apple-style
// heat map (no markers, no numbers). US EPA AQI colour scale.
const AQI_RAMP = [
  [0,   [16, 185, 129]],   // good
  [50,  [242, 233, 0]],    // moderate
  [100, [255, 153, 51]],   // unhealthy for sensitive groups
  [150, [204, 0, 51]],     // unhealthy
  [200, [139, 63, 176]],   // very unhealthy
  [300, [126, 0, 35]],     // hazardous
  [500, [126, 0, 35]]
];
function aqiRGB(v) {
  if (v <= 0) return AQI_RAMP[0][1];
  for (let i = 1; i < AQI_RAMP.length; i++) {
    const [t1, c1] = AQI_RAMP[i];
    if (v <= t1) {
      const [t0, c0] = AQI_RAMP[i - 1], f = (v - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return AQI_RAMP[AQI_RAMP.length - 1][1];
}

function enableAirQuality() {
  if (!radar.map) return;
  // A real Leaflet pane (child of the map pane) so the z-index sits correctly
  // between the base tiles (200) and the location pin (600) - and so the canvas
  // rides with the map during a drag instead of being covered by it.
  if (!radar.map.getPane("aqiHeat")) {
    radar.map.createPane("aqiHeat");
    const pane = radar.map.getPane("aqiHeat");
    pane.style.zIndex = 350;
    pane.style.pointerEvents = "none";
  }
  const cvs = radar.aqiCanvas || document.createElement("canvas");
  cvs.className = "aqi-heat-canvas";
  radar.aqiCanvas = cvs;
  radar.map.getPane("aqiHeat").appendChild(cvs);
  radar.aqiCache = new Map();   // fresh readings each time the layer opens
  // The canvas moves with the pane during a drag; hide it through the zoom
  // animation (projection is mid-flight) and realign + repaint once it settles.
  const onEnd = () => { scheduleAqiFetch(); scheduleAqiRedraw(); };
  const onZoomStart = () => { if (radar.aqiCanvas) radar.aqiCanvas.style.visibility = "hidden"; };
  const onZoomEnd = () => { if (radar.aqiCanvas) radar.aqiCanvas.style.visibility = ""; onEnd(); };
  radar.aqiHandlers = { moveend: onEnd, zoomstart: onZoomStart, zoomend: onZoomEnd, resize: onEnd };
  radar.map.on(radar.aqiHandlers);
  fetchAqiField();
}

function disableAirQuality() {
  if (radar.map && radar.aqiHandlers) radar.map.off(radar.aqiHandlers);
  radar.aqiHandlers = null;
  if (radar.aqiFetchTimer) { clearTimeout(radar.aqiFetchTimer); radar.aqiFetchTimer = null; }
  if (radar.aqiRaf) { cancelAnimationFrame(radar.aqiRaf); radar.aqiRaf = null; }
  if (radar.aqiCanvas && radar.aqiCanvas.parentNode) radar.aqiCanvas.parentNode.removeChild(radar.aqiCanvas);
  radar.aqiStations = [];
  radar.aqiReq++;
}

function scheduleAqiFetch() {
  if (radar.aqiFetchTimer) clearTimeout(radar.aqiFetchTimer);
  radar.aqiFetchTimer = setTimeout(fetchAqiField, 320);
}
function scheduleAqiRedraw() {
  if (radar.aqiRaf) return;
  radar.aqiRaf = requestAnimationFrame(() => { radar.aqiRaf = null; redrawAqiHeat(); });
}

// "Nice" lattice steps in degrees; sampling snaps to whichever keeps ~13 rows in
// view, so the same geographic points recur as you pan and their readings stay
// put (and cached) instead of re-rolling on every move.
const AQI_STEPS = [0.1, 0.15, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6];
function aqiStep(rough) { for (const s of AQI_STEPS) if (rough <= s) return s; return 8; }
const AQI_STALE_MS = 20 * 60 * 1000;   // reading good for ~20 min
const AQI_MAX_FETCH = 220;             // cap points per request (URL length)

// Sample US AQI on a fixed geographic lattice from Open-Meteo (keyless and
// CORS-friendly), cache each point, and hand the filled lattice to the heat
// renderer to interpolate into a smooth field.
async function fetchAqiField() {
  if (!radar.map || radar.mode !== "air_quality") return;
  const req = ++radar.aqiReq;
  const cache = radar.aqiCache || (radar.aqiCache = new Map());
  const now = Date.now();
  const b = radar.map.getBounds().pad(0.35);
  const north = b.getNorth(), south = b.getSouth(), west = b.getWest(), east = b.getEast();
  const step = aqiStep((north - south) / 13);
  const pts = [];
  for (let ia = Math.floor(south / step); ia <= Math.ceil(north / step); ia++)
    for (let io = Math.floor(west / step); io <= Math.ceil(east / step); io++)
      pts.push({ lat: ia * step, lon: io * step, k: `${ia},${io}` });
  const need = pts.filter((p) => { const e = cache.get(p.k); return !e || now - e.at > AQI_STALE_MS; }).slice(0, AQI_MAX_FETCH);
  if (need.length) {
    const vals = await fetchAqiUsGrid(need).catch(() => null);
    if (req !== radar.aqiReq || radar.mode !== "air_quality") return;
    if (vals) need.forEach((p, i) => cache.set(p.k, { v: vals[i], at: now }));
  }
  radar.aqiStations = pts
    .map((p) => { const e = cache.get(p.k); return e && e.v != null ? { lat: p.lat, lon: p.lon, aqi: e.v } : null; })
    .filter(Boolean);
  scheduleAqiRedraw();
}

// One Open-Meteo air-quality request returns the US AQI at every lattice point.
async function fetchAqiUsGrid(pts) {
  const lat = pts.map((p) => p.lat.toFixed(3)).join(",");
  const lon = pts.map((p) => p.lon.toFixed(3)).join(",");
  const url = `${AIR_BASE}?latitude=${lat}&longitude=${lon}&current=us_aqi&timeformat=unixtime`;
  const j = await fetchJSON(url);
  const arr = Array.isArray(j) ? j : [j];
  return arr.map((o) => (o.current && o.current.us_aqi != null ? o.current.us_aqi : null));
}

// Paint the interpolated field. A low-resolution grid is filled by inverse-
// distance weighting the sampled points, then scaled up with smoothing so it
// reads as a soft, continuous heat map; alpha fades where no sample is near.
function redrawAqiHeat() {
  const map = radar.map, cvs = radar.aqiCanvas;
  if (!map || radar.mode !== "air_quality" || !cvs) return;
  const size = map.getSize();
  if (cvs.width !== size.x || cvs.height !== size.y) { cvs.width = size.x; cvs.height = size.y; }
  // Pin the canvas's (0,0) to the map's top-left corner within the pane so we
  // can draw in container-point space and stay aligned after the pane moves.
  L.DomUtil.setPosition(cvs, map.containerPointToLayerPoint([0, 0]));
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0, 0, size.x, size.y);
  const stations = radar.aqiStations || [];
  if (!stations.length) return;
  const pts = stations.map((s) => { const p = map.latLngToContainerPoint([s.lat, s.lon]); return { x: p.x, y: p.y, v: s.aqi }; });
  const D = 10, gw = Math.max(1, Math.ceil(size.x / D)), gh = Math.max(1, Math.ceil(size.y / D));
  const off = radar.aqiOff || (radar.aqiOff = document.createElement("canvas"));
  off.width = gw; off.height = gh;
  const octx = off.getContext("2d"), img = octx.createImageData(gw, gh), data = img.data;
  const K = 900, farPx = 115, fadePx = 85;   // smoothing radius; fade past nearest station
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const X = gx * D, Y = gy * D;
      let sw = 0, swv = 0, minD2 = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dx = X - pts[i].x, dy = Y - pts[i].y, d2 = dx * dx + dy * dy;
        if (d2 < minD2) minD2 = d2;
        const w = 1 / (d2 + K); sw += w; swv += w * pts[i].v;
      }
      const rgb = aqiRGB(swv / sw), minD = Math.sqrt(minD2);
      let a = 0.62;
      if (minD > farPx) a *= Math.max(0, 1 - (minD - farPx) / fadePx);
      const idx = (gy * gw + gx) * 4;
      data[idx] = rgb[0]; data[idx + 1] = rgb[1]; data[idx + 2] = rgb[2]; data[idx + 3] = Math.round(a * 255);
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(off, 0, 0, gw, gh, 0, 0, size.x, size.y);
}

function inCanada(lat, lon) {
  return lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52;
}

// One RainViewer fetch, cached, split into observed past frames and the ~30 min
// nowcast forecast. Each frame carries its own source so timelines can mix (the
// Canadian path pairs ECCC's past with RainViewer's forecast). Pure loader - it
// does not touch the active timeline (radar.frames / idx / source).
async function loadRainviewer() {
  if (!radar.loaded) {
    const j = await (await fetch(RAINVIEWER_API, { cache: "no-store" })).json();
    radar.host = j.host;
    radar.rvPast = (j.radar?.past || []).map((f) => ({ t: f.time, path: f.path, kind: "past", source: "rainviewer" }));
    radar.rvForecast = (j.radar?.nowcast || []).map((f) => ({ t: f.time, path: f.path, kind: "forecast", source: "rainviewer" }));
    radar.loaded = true;
  }
  return { past: radar.rvPast || [], forecast: radar.rvForecast || [] };
}

async function ensureFrames() {
  const { past, forecast } = await loadRainviewer();
  radar.source = "rainviewer";
  radar.frames = [...past, ...forecast];
  const lastPast = radar.frames.map((f) => f.kind).lastIndexOf("past");
  radar.idx = lastPast >= 0 ? lastPast : Math.max(0, radar.frames.length - 1);
  return radar.frames;
}

// Just the forecast tail, for stitching onto a past-only source like ECCC.
async function rvForecastFrames() {
  const { forecast } = await loadRainviewer();
  return forecast;
}

// Returns the ECCC observed frames only, cached in its own field so callers can
// stitch a forecast onto the end without the cache re-appending it next time.
async function ensureEccc() {
  const now = Date.now();
  const layer = ecccLayer();
  if (radar.ecccLayerName === layer && radar.ecccFrames && radar.ecccFrames.length && now - radar.ecccAt < 300000) return radar.ecccFrames;
  const url = `${ECCC_WMS}?lang=en&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&LAYER=${layer}`;
  const text = await (await fetch(url, { cache: "no-store" })).text();
  const doc = new DOMParser().parseFromString(text, "text/xml");
  let dimText = "";
  const dims = doc.getElementsByTagName("Dimension");
  for (let i = 0; i < dims.length; i++) {
    if ((dims[i].getAttribute("name") || "").toLowerCase() === "time") { dimText = (dims[i].textContent || "").trim(); break; }
  }
  const frames = ecccFrames(dimText);
  if (!frames.length) throw new Error("ECCC: no time frames");
  radar.ecccFrames = frames;
  radar.source = "eccc";
  radar.ecccLayerName = layer;
  radar.ecccAt = now;
  return frames;
}

function ecccFrames(dimText) {
  if (!dimText) return [];
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, "Z");
  if (dimText.includes("/")) {
    const [start, end, period] = dimText.split("/");
    const stepMin = Number((period && period.match(/PT(\d+)M/) || [])[1]) || 6;
    const t0 = Date.parse(start), t1 = Date.parse(end);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return [];
    const out = [];
    for (let t = t0; t <= t1 + 1000; t += stepMin * 60000) out.push({ t: Math.floor(t / 1000), iso: iso(t), kind: "past", source: "eccc" });
    return out.slice(-13);
  }
  return dimText.split(",").map((s) => s.trim()).filter(Boolean).slice(-13)
    .map((s) => ({ t: Math.floor(Date.parse(s) / 1000), iso: iso(Date.parse(s)), kind: "past", source: "eccc" }))
    .filter((f) => Number.isFinite(f.t));
}

async function loadRadar() {
  if (!haveLeaflet() || !radar.map) return;
  try {
    const c = state.center;
    let frames = null;
    if (inCanada(c.lat, c.lon)) {
      const eccc = await ensureEccc().catch(() => null);
      if (eccc && eccc.length) {
        // ECCC is observation-only, so bolt RainViewer's nowcast onto the end for
        // a short-term forecast. Keep the "now" cursor at the last observed frame
        // so playback runs observed -> forecast, then loops.
        const fc = await rvForecastFrames().catch(() => []);
        frames = fc.length ? [...eccc, ...fc] : eccc;
        radar.frames = frames;
        radar.idx = eccc.length - 1;
      }
    }
    if (!frames || !frames.length) frames = await ensureFrames();
    if (!frames.length || !radar.map || radar.mode !== "radar") { el.radarTimeline.style.display = "none"; return; }
    el.radarTimeline.style.display = "";
    el.radarScrub.max = String(frames.length - 1);
    buildRadarLayers();
    renderSolid(radar.idx);
    gateLoading();
    updateRadarNote();
  } catch {
    el.radarTimeline.style.display = "none";
  }
}

function buildRadarLayers() {
  removeRadarLayers();
  radar.layers = radar.frames.map((f) => {
    // Per-frame source lets one timeline mix providers (ECCC past + RainViewer
    // forecast), falling back to the timeline's source for older untagged frames.
    const src = f.source || radar.source;
    let layer;
    if (src === "eccc") {
      layer = L.tileLayer.wms(ECCC_WMS, {
        layers: ecccLayer(), format: "image/png", transparent: true, version: "1.3.0",
        crs: L.CRS.EPSG3857, time: f.iso,
        opacity: 0, maxZoom: 12, updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0,
        attribution: "&copy; Environment and Climate Change Canada (ECCC GeoMet)"
      });
    } else {
      layer = L.tileLayer(rvUrl(f), {
        opacity: 0, maxZoom: 12, maxNativeZoom: 10, tileSize: RV_SIZE,
        updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 0, attribution: "&copy; RainViewer"
      });
    }
    layer.addTo(radar.map);
    const c = layer.getContainer && layer.getContainer();
    if (c) {
      c.style.transition = "none";
      if (src === "eccc") c.style.filter = ECCC_FILTER;
    }
    return layer;
  });
}

function gateLoading() {
  const layers = radar.layers, need = layers.length;
  if (!need) return;
  radar.ready = false;
  let done = 0, started = false;
  const begin = () => {
    if (started) return;
    started = true;
    if (radar.gateTimer) { clearTimeout(radar.gateTimer); radar.gateTimer = null; }
    radar.ready = true;
    if (state.radarOpen) { radar.idx = 0; startRadarPlay(); }
  };
  el.radarTime.textContent = "Loading radar… 0%";
  layers.forEach((l) => l.once("load", () => {
    done++;
    if (!started) el.radarTime.textContent = `Loading radar… ${Math.round((done / need) * 100)}%`;
    if (done >= need) begin();
  }));
  radar.gateTimer = setTimeout(begin, 6000);
}

function setLayerOpacities(target) {
  radar.shown.forEach((_, idx) => {
    if (!(idx in target)) { const l = radar.layers[idx]; if (l) l.setOpacity(0); radar.shown.delete(idx); }
  });
  for (const k in target) {
    const idx = +k, o = target[k];
    if (radar.shown.get(idx) !== o) { const l = radar.layers[idx]; if (l) l.setOpacity(o); radar.shown.set(idx, o); }
  }
}

function renderSolid(i) {
  if (!radar.layers.length) return;
  const N = radar.frames.length;
  radar.idx = ((i % N) + N) % N;
  setLayerOpacities({ [radar.idx]: RADAR_OPACITY });
  el.radarScrub.value = String(radar.idx);
  el.radarTime.textContent = relTime(radar.frames[radar.idx]);
}

function renderCrossfade(p) {
  const N = radar.frames.length;
  const i = Math.min(N - 1, Math.floor(p));
  if (i >= N - 1) { renderSolid(N - 1); return; }
  const frac = p - i;
  let fade = 0;
  if (frac > 1 - FADE_FRAC) fade = radarEase((frac - (1 - FADE_FRAC)) / FADE_FRAC);
  setLayerOpacities({ [i]: RADAR_OPACITY * (1 - fade), [i + 1]: RADAR_OPACITY * fade });
  const idx = fade < 0.5 ? i : i + 1;
  if (idx !== radar.idx) {
    radar.idx = idx;
    el.radarScrub.value = String(idx);
    el.radarTime.textContent = relTime(radar.frames[idx]);
  }
}

function tickRadar(now) {
  if (!radar.playing) return;
  const N = radar.frames.length;
  if (N < 2) { renderSolid(0); return; }
  const PLAY = (N - 1) * FRAME_MS, total = PLAY + END_HOLD_MS + RESET_MS;
  const e = (now - radar.t0) % total;
  if (e < PLAY) {
    renderCrossfade(e / FRAME_MS);
  } else if (e < PLAY + END_HOLD_MS) {
    renderSolid(N - 1);
  } else {
    const u = (e - PLAY - END_HOLD_MS) / RESET_MS;
    if (u < 0.5) setLayerOpacities({ [N - 1]: RADAR_OPACITY * (1 - radarEase(u * 2)) });
    else setLayerOpacities({ 0: RADAR_OPACITY * radarEase(u * 2 - 1) });
    if (radar.idx !== 0) { radar.idx = 0; el.radarScrub.value = "0"; el.radarTime.textContent = relTime(radar.frames[0]); }
  }
  radar.raf = requestAnimationFrame(tickRadar);
}

function showFrame(i, _immediate, onShown) {
  if (!radar.frames.length || !radar.layers.length) return;
  renderSolid(i);
  if (onShown) onShown();
}

function relTime(f) {
  const diffMin = Math.round((f.t - Date.now() / 1000) / 60);
  let rel;
  if (Math.abs(diffMin) <= 3) rel = "Now";
  else if (diffMin < 0) rel = Math.abs(diffMin) >= 60 ? `-${Math.round(Math.abs(diffMin) / 60)}h` : `-${Math.abs(diffMin)}m`;
  else rel = `+${diffMin}m`;
  const clock = fmtClock(f.t, state.tz || 0);
  return f.kind === "forecast" ? `${rel} · ${clock} forecast` : `${rel} · ${clock}`;
}

function startRadarPlay() {
  stopRadarPlay();
  if (!radar.frames.length || !radar.layers.length) return;
  radar.playing = true;
  el.radarPlay.innerHTML = '<i class="ph ph-pause"></i>';
  radar.t0 = performance.now() - radar.idx * FRAME_MS;
  radar.raf = requestAnimationFrame(tickRadar);
}
function stopRadarPlay() {
  radar.playing = false;
  if (radar.raf) { cancelAnimationFrame(radar.raf); radar.raf = null; }
  if (radar.gateTimer) { clearTimeout(radar.gateTimer); radar.gateTimer = null; }
  if (el.radarPlay) el.radarPlay.innerHTML = '<i class="ph ph-play"></i>';
}
function toggleRadarPlay() { radar.playing ? stopRadarPlay() : startRadarPlay(); }

function updateRadarNote() {
  const place = state.placeName || "your area";
  if (radar.mode === "lightning") { el.radarNote.textContent = "Lightning density from Environment Canada. Canada coverage only."; return; }
  if (radar.mode === "air_quality") { el.radarNote.textContent = `Air quality near ${place} on the US AQI scale, from Open-Meteo's modelled pollutants.`; return; }
  let name = LAYER_NAMES[radar.mode] || "Weather";
  let suffix = "";
  if (radar.mode === "radar") {
    if (radar.source === "eccc") {
      name = ecccLayer() === ECCC_LAYER_SNOW
        ? "Snow radar · Environment Canada"
        : "Composite rain radar · Environment Canada";
    } else {
      name = "Live precipitation radar";
    }
    // Playback now runs past observations straight into the nowcast, so call out
    // that the tail of the timeline is a short-term forecast.
    if (radar.frames.some((f) => f.kind === "forecast")) suffix = " Plays through to a short-term forecast.";
  }
  el.radarNote.textContent = `${name} near ${place}.${suffix}`;
}

function syncMaps() {
  if (!haveLeaflet()) return;
  const c = state.center;
  if (radar.preview) { radar.preview.setView([c.lat, c.lon]); setPinMarker(radar.preview, "previewMarker"); } else initRadarPreview();
  if (radar.map) { radar.map.setView([c.lat, c.lon]); setPinMarker(radar.map, "marker"); }
  if (el.radarNote) updateRadarNote();
  if (!radar.map && !radar.warmScheduled && !state.radarOpen) {
    radar.warmScheduled = true;
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 700)))(warmRadar);
  }
}

function updateMapTheme() {
  if (!haveLeaflet()) return;
  const url = radarTileUrl();
  if (radar.base) radar.base.setUrl(url);
  if (radar.previewBase) radar.previewBase.setUrl(url);
  if (mapPickBase) mapPickBase.setUrl(url);
  if (radar.marker) radar.marker.setIcon(locationPinIcon());
  if (radar.previewMarker) radar.previewMarker.setIcon(locationPinIcon());
}

function useMyLocation() {
  if (!navigator.geolocation) { setStatus("Geolocation isn't available."); return; }
  closeSearch();
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" };
      saveState();
      refresh(true);
    },
    () => setStatus("Location permission denied. Staying on Home."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

// ---- Search screen: type-ahead search over the pick-a-spot map --------------
let mapPick = null, mapPickBase = null;
function openSearch() {
  if (!el.searchSheet || state.searchOpen) return;
  state.searchOpen = true;
  el.searchSheet.classList.add("is-open");
  el.searchSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  syncNav();
  if (!haveLeaflet()) {
    el.mapPickMap.innerHTML = '<div class="map-fallback">The map needs an internet connection.</div>';
    return;
  }
  const c = state.center || state.loc || HOME;
  if (mapPick) {
    mapPick.setView([c.lat, c.lon], mapPick.getZoom() || 9);
  } else {
    mapPick = L.map(el.mapPickMap, { zoomControl: true, attributionControl: false, minZoom: 3, maxZoom: 14 })
      .setView([c.lat, c.lon], 9);
    mapPickBase = L.tileLayer(radarTileUrl(), { subdomains: "abcd", updateWhenZooming: false, keepBuffer: 1, attribution: "&copy; OpenStreetMap &copy; CARTO" }).addTo(mapPick);
    let errs = 0;
    mapPickBase.on("tileerror", () => { if (++errs === 8) mapPickBase.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png"); });
  }
  // The pin is a fixed centre overlay; moving the map moves the world under it.
  setTimeout(() => mapPick && mapPick.invalidateSize(), 320);
  [120, 500, 1000].forEach((d) => setTimeout(() => mapPick && mapPick.invalidateSize(), d));
}
function closeSearch() {
  if (!el.searchSheet || !state.searchOpen) return;
  state.searchOpen = false;
  clearSearch();
  setMapFull(el.searchSheet, el.searchFull, () => mapPick, false);
  el.searchSheet.classList.remove("is-open");
  el.searchSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  syncNav();
}

// Toggle a map sheet between its framed layout and absolute full screen.
// `force` pins the state (used on close so sheets never re-open expanded).
function setMapFull(sheet, btn, getMap, force) {
  if (!sheet) return;
  const on = typeof force === "boolean" ? force : !sheet.classList.contains("is-full");
  if (sheet.classList.contains("is-full") === on) return;
  sheet.classList.toggle("is-full", on);
  if (btn) {
    const ic = btn.querySelector("i");
    if (ic) ic.className = on ? "ph ph-corners-in" : "ph ph-corners-out";
    btn.setAttribute("aria-label", on ? "Exit full screen map" : "Toggle full screen map");
  }
  const map = getMap && getMap();
  if (map) [60, 340].forEach((d) => setTimeout(() => map.invalidateSize(), d));
}
function confirmMapPick() {
  if (!mapPick) { closeSearch(); return; }
  const c = mapPick.getCenter();
  state.loc = { lat: c.lat, lon: c.lng, label: "Dropped pin" };
  saveState();
  closeSearch();
  refresh(true);
}

// ---- Location search (Open-Meteo geocoding, no API key) --------------------
const GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search";
let searchTimer = null, searchSeq = 0, searchItems = [], searchActive = -1;

function wireLocationSearch() {
  if (!el.locSearch) return;
  el.locSearch.addEventListener("input", () => {
    const q = el.locSearch.value.trim();
    el.searchClear.hidden = !q;
    clearTimeout(searchTimer);
    if (q.length < 2) { renderSearchResults(null); return; }
    searchTimer = setTimeout(() => runGeocode(q), 220);   // debounce keystrokes
  });
  el.locSearch.addEventListener("keydown", onSearchKey);
  el.searchClear.onclick = () => { clearSearch(); el.locSearch.focus(); };
  // Tapping a suggestion.
  el.searchResults.addEventListener("click", (e) => {
    const li = e.target.closest("[data-idx]");
    if (li) pickSearchResult(searchItems[+li.dataset.idx]);
  });
}

async function runGeocode(q) {
  const seq = ++searchSeq;
  try {
    const url = `${GEOCODE_BASE}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const data = await fetchJSON(url, 8000);
    if (seq !== searchSeq) return;   // a newer keystroke already superseded this
    renderSearchResults(Array.isArray(data.results) ? data.results : []);
  } catch {
    if (seq === searchSeq) renderSearchResults([]);
  }
}

// "London, Ontario, Canada" style - region and country when they add signal.
function geoLabel(r) {
  const parts = [r.name];
  if (r.admin1 && r.admin1 !== r.name) parts.push(r.admin1);
  if (r.country && r.country !== r.admin1) parts.push(r.country);
  return parts.join(", ");
}

function renderSearchResults(results) {
  searchItems = results || [];
  searchActive = -1;
  if (results == null) {            // idle / query too short
    el.searchResults.hidden = true;
    el.searchResults.innerHTML = "";
    el.locSearch.setAttribute("aria-expanded", "false");
    return;
  }
  if (!results.length) {
    el.searchResults.hidden = false;
    el.searchResults.innerHTML = `<li class="search-empty" role="presentation">No places found</li>`;
    el.locSearch.setAttribute("aria-expanded", "false");
    return;
  }
  el.searchResults.innerHTML = results.map((r, i) => {
    const flag = r.country_code ? countryFlag(r.country_code) : "";
    const sub = [r.admin1, r.country].filter(Boolean).join(", ");
    return `<li class="search-item" role="option" id="searchopt${i}" data-idx="${i}" aria-selected="false">` +
      `<span class="search-flag" aria-hidden="true">${flag}</span>` +
      `<span class="search-text"><span class="search-name">${escapeHTML(r.name)}</span>` +
      `<span class="search-sub">${escapeHTML(sub)}</span></span></li>`;
  }).join("");
  el.searchResults.hidden = false;
  el.locSearch.setAttribute("aria-expanded", "true");
}

function onSearchKey(e) {
  if (e.key === "Escape") { clearSearch(); return; }
  if (!searchItems.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const dir = e.key === "ArrowDown" ? 1 : -1;
    searchActive = (searchActive + dir + searchItems.length) % searchItems.length;
    highlightSearch();
  } else if (e.key === "Enter") {
    e.preventDefault();
    pickSearchResult(searchItems[searchActive >= 0 ? searchActive : 0]);
  }
}

function highlightSearch() {
  [...el.searchResults.children].forEach((li, i) => {
    const on = i === searchActive;
    li.classList.toggle("is-active", on);
    li.setAttribute("aria-selected", on ? "true" : "false");
    if (on) { li.scrollIntoView({ block: "nearest" }); el.locSearch.setAttribute("aria-activedescendant", li.id); }
  });
}

function pickSearchResult(r) {
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return;
  state.loc = { lat: r.latitude, lon: r.longitude, label: geoLabel(r) };
  saveState();
  closeSearch();
  refresh(true);
}

function clearSearch() {
  clearTimeout(searchTimer);
  searchSeq++;
  el.locSearch.value = "";
  el.searchClear.hidden = true;
  el.locSearch.removeAttribute("aria-activedescendant");
  renderSearchResults(null);
}

// Turn a 2-letter country code into its flag emoji (regional indicators).
function countryFlag(cc) {
  const c = String(cc).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function setBusy(b) {
  el.temp.classList.toggle("is-loading", b && !state.data);
  el.ptr.classList.toggle("is-spinning", b);
  if (b) showPTR(64); else hidePTR();
}

function setStatus(t) { el.status.textContent = t; }

function windText(speed) {
  return state.units === "imperial"
    ? `${Math.round(speed)} mph`
    : `${Math.round(speed * 3.6)} km/h`;
}
function visibilityText(v) {
  if (v == null) return "--";
  return state.units === "imperial"
    ? `${(v / 1609).toFixed(1)} mi`
    : `${(v / 1000).toFixed(1)} km`;
}
function fmtHour(dt, tz) {
  let hh = new Date((dt + tz) * 1000).getUTCHours();
  const ap = hh < 12 ? "am" : "pm";
  hh = hh % 12 || 12;
  return `${hh}${ap}`;
}
function dayLabel(dt, tz) {
  const d = new Date((dt + tz) * 1000).toISOString().slice(0, 10);
  const today = new Date((Date.now() / 1000 + tz) * 1000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date((dt + tz) * 1000).getUTCDay()];
}
function fmtDate(tz) {
  const d = new Date((Date.now() / 1000 + tz) * 1000);
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getUTCDay()];
  const mo = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][d.getUTCMonth()];
  return `${wd}, ${mo} ${d.getUTCDate()}`;
}
function fmtClock(dt, tz) {
  const d = new Date((dt + tz) * 1000);
  let hh = d.getUTCHours();
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ap = hh < 12 ? "am" : "pm";
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${ap}`;
}

function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ units: state.units, loc: state.loc, theme: state.theme, tinted: state.tinted, clock24: state.clock24, clockPattern: state.clockPattern, animate: state.animate })); } catch {}
}
function loadActivityPlan() { try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "null"); } catch { return null; } }
function saveActivityPlan(p) { try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(p)); } catch {} }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (s) {
      state.units = s.units || "metric";
      state.loc = s.loc || { ...HOME };
      // One theme now: the animated weather mesh, always on, always dark-based.
      state.theme = "bloomdark";
      state.tinted = true;
      state.clock24 = !!s.clock24;
      state.clockPattern = !!s.clockPattern;
      state.animate = s.animate !== false;
    }
  } catch {}
}
function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, units: state.units, savedAt: Date.now() })); } catch {}
}
function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch { return null; }
}
function syncControls() {
  el.unitSeg.querySelectorAll("[data-units]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.units === state.units));
  if (el.animToggle) el.animToggle.setAttribute("aria-checked", state.animate !== false ? "true" : "false");
  document.documentElement.setAttribute("data-anim", state.animate === false ? "off" : "on");
  syncSlide(el.unitSeg);
}

function showPTR(d) {
  const t = Math.min(1, d / 64);
  el.ptr.style.opacity = t;
  el.ptr.style.transform = `translateY(${Math.min(d, 70) - 20}px) scale(${0.6 + t * 0.4}) rotate(${d * 2}deg)`;
}
function hidePTR() {
  el.ptr.style.opacity = "0";
  el.ptr.style.transform = "translateY(-20px) scale(0.6)";
}

function initGestures() {
  const EDGE = 26, DISMISS = 95, PTR_TRIGGER = 72;
  let mode = null;
  let sx = 0, sy = 0, dist = 0;
  let dx = 0, dy = 0, rafId = null;

  const applyFrame = () => {
    rafId = null;
    if (mode === "ptr") {
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) && (window.scrollY || 0) <= 0) {
        dist = dy * 0.5;
        showPTR(dist);
      } else { mode = null; hidePTR(); }
    } else if (mode === "sheet") {
      if (dx > 0 && Math.abs(dx) > Math.abs(dy)) el.sheet.style.transform = `translateX(${dx}px)`;
    }
  };
  const scheduleFrame = () => { if (rafId == null) rafId = requestAnimationFrame(applyFrame); };

  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { mode = null; return; }
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dist = 0; dx = 0; dy = 0;

    if (state.radarOpen || state.searchOpen || state.popOpen) { mode = null; return; }
    if (state.sheetOpen) {
      mode = sx < EDGE ? "sheet" : null;
      if (mode === "sheet") el.sheet.style.transition = "none";
      return;
    }
    if ((window.scrollY || 0) <= 0) { mode = "ptr"; el.ptr.style.transition = "none"; return; }
    mode = null;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!mode) return;
    const t = e.touches[0];
    dx = t.clientX - sx;
    dy = t.clientY - sy;

    if (mode === "ptr") {
      if (dy > 6 && Math.abs(dy) > Math.abs(dx) && (window.scrollY || 0) <= 0) e.preventDefault();
    } else if (mode === "sheet") {
      if (dx > 0 && Math.abs(dx) > Math.abs(dy)) e.preventDefault();
    }
    scheduleFrame();
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    el.ptr.style.transition = "";
    if (mode === "ptr") {
      if (dist >= PTR_TRIGGER) refresh(true); else hidePTR();
    } else if (mode === "sheet") {
      el.sheet.style.transition = "";
      const x = currentX(el.sheet);
      if (x > DISMISS) sheetBack(); else { el.sheet.classList.add("is-open"); el.sheet.style.transform = ""; }
    }
    mode = null;
  });

  function currentX(node) {
    const tr = getComputedStyle(node).transform;
    if (!tr || tr === "none") return 0;
    try { return new DOMMatrixReadOnly(tr).m41; } catch { return 0; }
  }
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
    .then((reg) => reg.update())
    .catch(() => {});
}

init();
