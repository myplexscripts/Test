
"use strict";

const API_KEY = "37c88f3496272531c686b0686ecfe1dd";
const API_BASE = "https://api.openweathermap.org/data/2.5";
const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const WX_BASE = "https://api.open-meteo.com/v1/forecast";
const HOME = { lat: 42.9849, lon: -81.2453, label: "London, Ontario" };
const STATE_KEY = "hw_state_v1";
const CACHE_KEY = "hw_cache_v1";
const MOON_RAD = Math.PI / 180, ECL = MOON_RAD * 23.4397;

const PALETTES = {
  lemon:  { bg: "#ffe442", ink: "#050505", surface: "#050505", onSurface: "#ffe442", accent: "#ffe442", dark: false },
  sand:   { bg: "#f3bf7b", ink: "#050505", surface: "#050505", onSurface: "#f3bf7b", accent: "#f3bf7b", dark: false },
  orchid: { bg: "#d37bf3", ink: "#050505", surface: "#050505", onSurface: "#d37bf3", accent: "#d37bf3", dark: false },
  sage:   { bg: "#99f37b", ink: "#050505", surface: "#050505", onSurface: "#99f37b", accent: "#99f37b", dark: false },
  night:  { bg: "#050505", ink: "#fafafa", surface: "#fafafa", onSurface: "#050505", accent: "#050505", dark: true, statusBar: "#050505" }
};

const THEME_REMAP = {
  rose: "orchid", ocean: "orchid", lilac: "orchid", slate: "night", newmoon: "night"
};

const $ = (id) => document.getElementById(id);
const el = {
  ptr: $("ptr"), scrim: $("scrim"),
  drawer: $("drawer"), drawerClose: $("drawerClose"),
  menuBtn: $("menuBtn"), locBtn: $("locBtn"),
  unitSeg: $("unitSeg"), themeGrid: $("themeGrid"), useHome: $("useHome"), useLocation: $("useLocation"), refreshBtn: $("refreshBtn"), creditsBtn: $("creditsBtn"),
  placeName: $("placeName"), condition: $("condition"),
  heroIcon: $("heroIcon"), temp: $("temp"), tempNum: $("tempNum"), summary: $("summary"), wear: $("wear"), alerts: $("alerts"),
  alertOverlay: $("alertOverlay"), alertModalTitle: $("alertModalTitle"), alertModalMeta: $("alertModalMeta"), alertModalBody: $("alertModalBody"), alertModalClose: $("alertModalClose"),
  hero: document.querySelector(".hero"),
  miniHeader: $("miniHeader"), miniTemp: $("miniTemp"), miniCond: $("miniCond"), miniPlace: $("miniPlace"), miniIcon: $("miniIcon"),
  mWind: $("mWind"), mHumidity: $("mHumidity"), mFeels: $("mFeels"),
  hourRail: $("hourRail"), dayRail: $("dayRail"), status: $("status"),
  trendGraph: $("trendGraph"), trendCard: $("trendCard"),
  sunCard: $("sunCard"), moonCard: $("moonCard"), detailGrid: $("detailGrid"), windCard: $("windCard"),
  radarPreview: $("radarPreview"), radarPreviewMap: $("radarPreviewMap"), radarMore: $("radarMore"),
  radarSheet: $("radarSheet"), radarBack: $("radarBack"), radarMap: $("radarMap"),
  layerSeg: $("layerSeg"), radarNote: $("radarNote"),
  radarTimeline: $("radarTimeline"), radarPlay: $("radarPlay"), radarScrub: $("radarScrub"), radarTime: $("radarTime"), radarLegend: $("radarLegend"), windLegend: $("windLegend"),
  hourlyMore: $("hourlyMore"), dailyMore: $("dailyMore"),
  sheet: $("sheet"), sheetBack: $("sheetBack"), tabSeg: $("tabSeg"),
  sheetTitle: $("sheetTitle"), sheetNote: $("sheetNote"), graph: $("graph"), sheetList: $("sheetList"), dayStats: $("dayStats")
};

const state = {
  units: "metric",
  loc: { ...HOME },
  data: null,
  hourly: [],
  daily: [],
  detail: { metric: "temp", range: "hourly" },
  theme: "lemon",
  center: { ...HOME },
  tz: 0,
  placeName: "",
  dark: false,
  clock24: false,
  drawerOpen: false,
  sheetOpen: false,
  radarOpen: false
};

const radar = {
  map: null, base: null, owm: null, marker: null, preview: null, previewBase: null, previewMarker: null,
  layers: [], shown: new Map(), raf: null, t0: 0, gateTimer: null, ready: false, warmScheduled: false,
  mode: "radar", source: "rainviewer", frames: [], idx: 0, playing: false, timer: null, host: "", loaded: false, ecccAt: 0, ecccLayerName: "", themeDark: null,
  windLayer: null, windMoveHandler: null, windDebounce: null, windReq: 0
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
const RV_OPTS = "1_1";
const RV_SIZE = 256;
const ECCC_WMS          = "https://geo.weather.gc.ca/geomet";
const ECCC_LAYER_RAIN = "RADAR_1KM_RRAI";
const ECCC_LAYER_SNOW = "RADAR_1KM_RSNO";
const LAYER_NAMES = { radar: "Live precipitation radar", clouds_new: "Cloud cover", temp_new: "Temperature", wind_new: "Wind speed & direction" };

function ecccLayer() {
  const main = (state.data?.current?.weather?.[0]?.main || "").toLowerCase();
  return main === "snow" ? ECCC_LAYER_SNOW : ECCC_LAYER_RAIN;
}

function init() {
  loadState();
  wireEvents();
  registerSW();
  syncControls();
  applyPalette(themeKind());

  const appEl = document.getElementById("app");
  if (appEl && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    appEl.classList.add("intro");
    setTimeout(() => appEl.classList.remove("intro"), 2800);
  }

  const cache = loadCache();
  if (cache && cache.units === state.units) {
    state.data = cache.data;
    render(cache.data);
    setStatus("Showing saved weather…");
  }
  refresh();
}

function wireEvents() {
  el.menuBtn.onclick = openDrawer;
  el.drawerClose.onclick = closeDrawer;
  el.scrim.onclick = () => { closeDrawer(); };
  el.refreshBtn.onclick = () => { closeDrawer(); refresh(true); };
  el.locBtn.onclick = useMyLocation;
  el.useLocation.onclick = () => { closeDrawer(); useMyLocation(); };
  el.useHome.onclick = () => { state.loc = { ...HOME }; markLoc("home"); saveState(); closeDrawer(); refresh(true); };
  if (el.creditsBtn) el.creditsBtn.onclick = () => { closeDrawer(); openDetail("credits"); };

  el.unitSeg.querySelectorAll("[data-units]").forEach((b) => {
    b.onclick = () => {
      if (state.units === b.dataset.units) return;
      state.units = b.dataset.units;
      syncControls();
      saveState();
      refresh(true);
    };
  });

  el.themeGrid.querySelectorAll("[data-theme]").forEach((b) => b.onclick = () => setTheme(b.dataset.theme));

  el.hourlyMore.onclick = () => openDetail("temp", "hourly");
  el.dailyMore.onclick = () => openDetail("temp", "daily");
  if (el.trendCard) el.trendCard.onclick = () => openDetail("temp", "hourly");
  el.sheetBack.onclick = sheetBack;
  el.windCard.onclick = () => openDetail("wind");
  if (el.moonCard) el.moonCard.onclick = () => openDetail("moon");
  if (el.sunCard) el.sunCard.onclick = () => openDetail("sun");
  el.detailGrid.addEventListener("click", (e) => {
    const card = e.target.closest("[data-metric]");
    if (card) openDetail(card.dataset.metric, card.dataset.range || "hourly");
  });
  el.radarPreview.onclick = openRadar;
  el.radarMore.onclick = openRadar;
  el.radarBack.onclick = closeRadar;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) => b.onclick = () => applyMode(b.dataset.layer));
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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeAlertModal(); closeSheet(); closeDrawer(); closeRadar(); }
  });

  if (el.alertModalClose) el.alertModalClose.onclick = closeAlertModal;
  if (el.alertOverlay) el.alertOverlay.onclick = (e) => { if (e.target === el.alertOverlay) closeAlertModal(); };

  window.addEventListener("resize", () => {
    if (radar.preview) radar.preview.invalidateSize();
    if (state.data) drawTrend();
    if (!state.sheetOpen) return;
    if (state.detail.metric === "uv") drawUvChart(state.data?.air?.hourly);
    else if (state.detail.metric !== "aqi") drawDetailChart();
  });

  initGestures();
}

async function refresh(force) {
  setBusy(true);
  if (force) setStatus("Refreshing…");
  try {
    const q = `lat=${state.loc.lat}&lon=${state.loc.lon}&units=${state.units}&appid=${API_KEY}`;
    const [current, forecast, air, hourly, alerts] = await Promise.all([
      fetchJSON(`${API_BASE}/weather?${q}`),
      fetchJSON(`${API_BASE}/forecast?${q}`),
      fetchAir(state.loc.lat, state.loc.lon).catch(() => null),
      fetchHourlyWx(state.loc.lat, state.loc.lon, state.units).catch(() => null),
      fetchAlerts(state.loc.lat, state.loc.lon).catch(() => null)
    ]);
    const data = { current, forecast, air, hourly, alerts };
    state.data = data;
    saveCache(data);
    render(data);
    setStatus(`Updated ${fmtClock(Date.now() / 1000, current.timezone || 0)}`);
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

async function fetchAir(lat, lon) {
  const cur = "current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,uv_index";
  const hourly = "hourly=uv_index,us_aqi&forecast_days=1";
  const json = await fetchJSON(`${AIR_BASE}?latitude=${lat}&longitude=${lon}&${cur}&${hourly}&timezone=auto`);
  const out = json.current || {};
  out.hourly = json.hourly || null;
  return out;
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

async function fetchHourlyWx(lat, lon, units) {
  const tu = units === "imperial" ? "fahrenheit" : "celsius";
  const wu = units === "imperial" ? "mph" : "ms";
  const fields = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,cloud_cover,visibility";
  const url = `${WX_BASE}?latitude=${lat}&longitude=${lon}&hourly=${fields}&temperature_unit=${tu}&wind_speed_unit=${wu}&timeformat=unixtime&timezone=auto&forecast_days=2`;
  const h = (await fetchJSON(url)).hourly;
  if (!h || !h.time) return null;
  return h.time.map((t, i) => ({
    dt: t,
    main: {
      temp: h.temperature_2m?.[i],
      feels_like: h.apparent_temperature?.[i],
      humidity: h.relative_humidity_2m?.[i],
      pressure: h.surface_pressure?.[i] != null ? Math.round(h.surface_pressure[i]) : null
    },
    weather: [{ main: wmoMain(h.weather_code?.[i]) }],
    wind: { speed: h.wind_speed_10m?.[i] ?? 0, gust: h.wind_gusts_10m?.[i], deg: h.wind_direction_10m?.[i] },
    pop: (h.precipitation_probability?.[i] ?? 0) / 100,
    precip: h.precipitation?.[i] ?? 0,
    clouds: { all: h.cloud_cover?.[i] },
    visibility: h.visibility?.[i]
  }));
}

const POLLUTANTS = {
  pm2_5:            { name: "PM2.5", desc: "Tiny inhalable particles from smoke, dust and combustion.", ref: 25 },
  pm10:             { name: "PM10", desc: "Coarser particles like dust, pollen and mould.", ref: 50 },
  ozone:            { name: "Ozone (O₃)", desc: "Forms in sunlight from traffic and industry; irritates the lungs.", ref: 100 },
  nitrogen_dioxide: { name: "Nitrogen dioxide (NO₂)", desc: "Mostly from vehicle exhaust and burning fuel.", ref: 40 },
  sulphur_dioxide:  { name: "Sulphur dioxide (SO₂)", desc: "From burning fossil fuels; can irritate airways.", ref: 40 },
  carbon_monoxide:  { name: "Carbon monoxide (CO)", desc: "Colourless gas from incomplete combustion, e.g. engines.", ref: 4000 }
};

function primaryPollutant(air) {
  let best = null, bestRatio = -1;
  for (const key in POLLUTANTS) {
    const v = air[key];
    if (v == null) continue;
    const ratio = v / POLLUTANTS[key].ref;
    if (ratio > bestRatio) { bestRatio = ratio; best = key; }
  }
  return best;
}

function aqiBand(aqi) {
  if (aqi == null) return { label: "--", advice: "" };
  if (aqi <= 50)  return { label: "Good", advice: "Air quality is satisfactory." };
  if (aqi <= 100) return { label: "Moderate", advice: "Acceptable; unusually sensitive people should take care." };
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", advice: "Sensitive groups may feel effects." };
  if (aqi <= 200) return { label: "Unhealthy", advice: "Everyone may begin to feel effects." };
  if (aqi <= 300) return { label: "Very unhealthy", advice: "Health alert. Limit time outdoors." };
  return { label: "Hazardous", advice: "Avoid outdoor activity." };
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

function render(data) {
  const { current, forecast } = data;
  const tz = current.timezone ?? forecast.city?.timezone ?? 0;
  const w = current.weather?.[0] || {};
  const m = current.main || {};
  const sys = current.sys || {};
  const isNight = sys.sunrise && sys.sunset ? (current.dt < sys.sunrise || current.dt >= sys.sunset) : false;

  state.hourly = hourlyPoints();
  state.daily = buildDaily(forecast, tz);
  state.center = { lat: current.coord?.lat ?? state.loc.lat, lon: current.coord?.lon ?? state.loc.lon };
  state.tz = tz;
  state.placeName = current.name || state.loc.label;

  el.heroIcon.className = "hero-icon wx-icon";
  el.heroIcon.innerHTML = wxSVG(wxResolve(w, isNight), true);
  el.placeName.textContent = current.name ? `${current.name}${sys.country ? ", " + sys.country : ""}` : state.loc.label;
  el.condition.textContent = w.description || w.main || "Weather";
  el.tempNum.textContent = `${Math.round(m.temp ?? 0)}`;
  el.temp.classList.remove("is-loading");
  el.summary.textContent = buildSummary(current, state.daily);
  if (el.wear) {
    el.wear.innerHTML = `<button class="wear-toggle" type="button" aria-expanded="false"><span class="wear-head"><i class="ph ph-coat-hanger wear-ic" aria-hidden="true"></i><span class="wear-label">What to wear</span></span><i class="ph ph-caret-down wear-chev" aria-hidden="true"></i></button><div class="wear-content"><div class="wear-clip"><p class="wear-text">${buildWear(current, state.daily)}</p></div></div>`;
    el.wear.classList.remove("is-open");
    const wt = el.wear.querySelector(".wear-toggle");
    wt.onclick = () => {
      const open = el.wear.classList.toggle("is-open");
      wt.setAttribute("aria-expanded", open ? "true" : "false");
    };
  }
  renderAlerts(data.alerts, tz);

  if (el.miniIcon) { el.miniIcon.className = "mini-ic wx-icon"; el.miniIcon.innerHTML = wxSVG(wxResolve(w, isNight), false); }
  if (el.miniPlace) el.miniPlace.textContent = el.placeName.textContent;
  if (el.miniCond) el.miniCond.textContent = w.description || w.main || "Weather";
  if (el.miniTemp) el.miniTemp.textContent = `${Math.round(m.temp ?? 0)}°`;

  el.mWind.textContent = windText(current.wind?.speed || 0);
  el.mHumidity.textContent = m.humidity != null ? `${m.humidity}%` : "--";
  el.mFeels.textContent = `${Math.round(m.feels_like ?? m.temp ?? 0)}°`;

  renderHourly();
  renderDaily();
  drawTrend();
  renderWind(current);
  renderSun(current);
  renderMoon(current);
  renderDetails(current, forecast);

  syncMaps();
  setupScrollFx();

  if (state.sheetOpen) renderDetailSheet();
}

let scrollFxReady = false;
function setupScrollFx() {
  if (scrollFxReady || !("IntersectionObserver" in window)) return;
  scrollFxReady = true;

  if (el.hero && el.miniHeader) {
    new IntersectionObserver(([e]) => {
      el.miniHeader.classList.toggle("show", !e.isIntersecting);
      el.miniHeader.setAttribute("aria-hidden", e.isIntersecting ? "true" : "false");
    }, { threshold: 0, rootMargin: "-72px 0px 0px 0px" }).observe(el.hero);
  }

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
      <span class="lo">${Math.round(d.min)}°</span>
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
  if (air && air.us_aqi != null) {
    const b = aqiBand(air.us_aqi);
    items.push(["aqi", "ph-waves", "Air quality", `${Math.round(air.us_aqi)}`, b.label, null, rangeMeter(air.us_aqi, 0, 300, "Good", "Poor")]);
  }
  if (air && air.uv_index != null) {
    const u = uvBand(air.uv_index);
    items.push(["uv", "ph-sun", "UV index", `${Math.round(air.uv_index)}`, u.label, null, rangeMeter(air.uv_index, 0, 11)]);
  }

  if (current.visibility != null) {
    items.push(["visibility", "ph-eye", "Visibility", visibilityText(current.visibility), visDescriptor(current.visibility), null, rangeMeter(visVal(current.visibility), 0, 10)]);
  } else {
    items.push(["visibility", "ph-eye", "Visibility", "--", ""]);
  }
  if (m.pressure != null) {
    items.push(["pressure", "ph-gauge", "Pressure", `${m.pressure}<span class="d-unit">hPa</span>`, "", null, pressureMeter(m.pressure)]);
  } else {
    items.push(["pressure", "ph-gauge", "Pressure", "--", ""]);
  }
  items.push(["clouds", "ph-cloud", "Cloud cover", clouds.all != null ? `${clouds.all}%` : "--", cloudDescriptor(clouds.all), null, clouds.all != null ? rangeMeter(clouds.all, 0, 100) : ""]);

  el.detailGrid.innerHTML = items.map(([metric, icon, label, value, sub, range, spark]) => `
    <button class="detail" data-metric="${metric}"${range ? ` data-range="${range}"` : ""}>
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
      items: g.items
    };
  });
}

function buildSummary(current, daily) {
  const tz = state.tz || current.timezone || 0;
  const today = daily && daily[0];
  const hrs = restOfToday(tz);
  const parts = [];
  const lead = dayLead(current, hrs, today);
  if (today) parts.push(`${lead}, with a high of ${Math.round(today.max)}° and a low of ${Math.round(today.min)}°.`);
  else parts.push(`${lead}.`);
  const precip = precipOutlook(hrs, today, tz);
  if (precip) parts.push(precip);
  for (const note of summaryNotes(current, hrs)) parts.push(note);
  return parts.join(" ");
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
  const aqi = state.data?.air?.us_aqi;
  if (aqi != null && aqi > 150) out.push("Air quality is unhealthy today.");
  return out.slice(0, 2);
}

function buildWear(current, daily) {
  const m = current.main || {};
  const raw = m.feels_like ?? m.temp;
  const t = raw == null ? 15 : (state.units === "imperial" ? (raw - 32) * 5 / 9 : raw);
  let base;
  if (t <= -10) base = "Heavy winter gear today: an insulated coat, hat, gloves and warm boots.";
  else if (t <= 0) base = "Dress warm with a winter coat, plus a hat and gloves.";
  else if (t <= 8) base = "A warm jacket with a layer underneath.";
  else if (t <= 15) base = "A light jacket or sweater should be enough.";
  else if (t <= 21) base = "A long sleeve or light top is comfortable today.";
  else if (t <= 27) base = "Light clothing like a t-shirt is ideal.";
  else base = "Stay cool in light, breathable clothing, and keep water handy.";
  const extras = [];
  const pop = daily?.[0] ? Math.round((daily[0].pop || 0) * 100) : 0;
  if (pop >= 50) extras.push("Bring an umbrella or a waterproof layer.");
  else if (pop >= 25) extras.push("An umbrella may come in handy.");
  const uv = state.data?.air?.uv_index;
  if (uv != null && uv >= 6) extras.push("Add sunglasses and sunscreen for the strong sun.");
  const spd = current.wind?.speed || 0;
  const kmh = state.units === "imperial" ? spd * 1.609 : spd * 3.6;
  if (kmh >= 30) extras.push("A windbreaker helps against the wind.");
  return base + (extras.length ? " " + extras.join(" ") : "");
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
  host.innerHTML = list.map((a) => {
    const meta = escapeHTML(alertMeta(a, tz));
    return `<button class="alert" type="button">
      <i class="ph-fill ph-warning-octagon alert-ic" aria-hidden="true"></i>
      <span class="alert-body">
        <span class="alert-title">${escapeHTML(a.event)}</span>
        ${meta ? `<span class="alert-meta">${meta}</span>` : ""}
      </span>
      <i class="ph ph-caret-right alert-go" aria-hidden="true"></i>
    </button>`;
  }).join("");
  [...host.querySelectorAll(".alert")].forEach((btn, i) => {
    btn.onclick = () => openAlertModal(list[i], tz);
  });
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
  r.setProperty("--moon-lit", p.dark ? "var(--ink)" : "var(--bg)");
  r.setProperty("--moon-shadow", p.dark ? "var(--bg)" : "var(--ink)");
  const sb = p.statusBar || p.surface;
  r.setProperty("--statusbar", sb);
  r.setProperty("--theme", sb);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", sb);
  document.documentElement.setAttribute("data-theme", kind);
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  state.dark = !!p.dark;
  updateMapTheme();
  if (state.data) drawTrend();
}

function themeKind() {
  return PALETTES[state.theme] ? state.theme : "lemon";
}

function setTheme(theme) {
  state.theme = PALETTES[theme] ? theme : "lemon";
  saveState();
  el.themeGrid.querySelectorAll("[data-theme]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.theme === state.theme));
  applyPalette(themeKind());
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
  if (!animated) svg = svg.replace(/<animate[^>]*\/>/g, "");
  const uid = "w" + (wxUid++);
  svg = svg.replace(/\bid="([^"]+)"/g, (mm, v) => `id="${v}${uid}"`).replace(/url\(#([^)]+)\)/g, (mm, v) => `url(#${v}${uid})`);
  return svg;
}
function wxIcon(w, isNight, cls) {
  return `<i class="wx-icon${cls ? " " + cls : ""}" aria-hidden="true">${wxSVG(wxResolve(w, isNight), false)}</i>`;
}

function speedUnit() { return state.units === "imperial" ? "mph" : "km/h"; }
function visUnit() { return state.units === "imperial" ? "mi" : "km"; }
function visVal(mtr) { if (mtr == null) return 0; return state.units === "imperial" ? mtr / 1609 : mtr / 1000; }

const METRICS = {
  temp: {
    label: "Temperature", unit: "°", decimals: 0, daily: true,
    get: (it) => it.main.temp,
    desc: () => { const t = state.daily[0]; return t ? `High near ${Math.round(t.max)}°, low near ${Math.round(t.min)}°.` : "Temperature trend ahead."; }
  },
  feels: {
    label: "Feels Like", unit: "°", decimals: 0,
    get: (it) => it.main.feels_like,
    desc: (c) => { const f = Math.round(c.main?.feels_like ?? 0), a = Math.round(c.main?.temp ?? 0), d = f - a; return Math.abs(d) < 1 ? "Feels about the same as the actual temperature." : d < 0 ? `Feels ${Math.abs(d)}° colder than the air temperature.` : `Feels ${d}° warmer than the air temperature.`; }
  },
  humidity: {
    label: "Humidity", unit: "%", decimals: 0,
    get: (it) => it.main.humidity,
    desc: (c) => { const dp = dewPointDisplay(c.main?.temp, c.main?.humidity); return dp != null ? `The dew point is ${dp}° right now.` : "Relative humidity over the next hours."; }
  },
  wind: {
    label: "Wind", unit: speedUnit(), decimals: 0,
    get: (it) => windParts(it.wind?.speed || 0).v,
    desc: (c) => { const w = c.wind || {}; const g = w.gust != null ? `, gusting ${windText(w.gust)}` : ""; return `${windText(w.speed || 0)} from the ${w.deg != null ? direction(w.deg) : "--"}${g}.`; }
  },
  pressure: {
    label: "Pressure", unit: "hPa", decimals: 0,
    get: (it) => it.main.pressure,
    desc: (c) => { const p = c.main?.pressure; return p != null ? `${p} hPa, ${p >= 1013 ? "above" : "below"} the 1013 hPa average.` : "Sea-level pressure ahead."; }
  },
  precip: {
    label: "Precipitation", unit: "%", decimals: 0,
    get: (it) => (it.pop || 0) * 100,
    desc: () => { const n = nextPrecip(state.data?.forecast, state.tz); const t = state.daily[0]; const pop = t ? Math.round((t.pop || 0) * 100) : 0; return n ? `Next precipitation around ${n.when}.` : pop > 0 ? `${pop}% chance today.` : "No precipitation expected soon."; }
  },
  clouds: {
    label: "Cloud Cover", unit: "%", decimals: 0,
    get: (it) => it.clouds?.all ?? 0,
    desc: (c) => cloudDescriptor(c.clouds?.all) + " Cloud cover over the next hours."
  },
  visibility: {
    label: "Visibility", unit: visUnit(), decimals: 1,
    get: (it) => visVal(it.visibility),
    desc: (c) => `${visDescriptor(c.visibility)} Currently ${visibilityText(c.visibility)}.`
  }
};

function openSheetUI() {
  state.sheetOpen = true;
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  el.sheet.scrollTop = 0;
}

function openDetail(metric, range) {
  const isInfo = metric === "aqi" || metric === "uv" || metric === "moon" || metric === "credits" || metric === "sun";
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
    el.sheet.scrollTop = 0;
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
  el.sheet.scrollTo({ top: 0, behavior: "smooth" });
}

function syncRange() {
  el.tabSeg.querySelectorAll("[data-tab]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === state.detail.range));
}

function renderDetailSheet() {
  const gc = el.graph.closest(".graph-card");
  if (["aqi", "uv", "moon", "credits", "sun"].includes(state.detail.metric)) { renderInfoSheet(state.detail.metric); return; }
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
  else if (kind === "aqi") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderAqiSheet(air); }
  else { if (gc) gc.style.display = ""; renderUvSheet(air); }
}

function section(title, body) {
  return `<div class="info-section"><h3 class="info-head">${title}</h3><div class="info-card">${body}</div></div>`;
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
  if (air.us_aqi == null) { el.sheetNote.textContent = "Air quality data is unavailable right now."; el.sheetList.innerHTML = ""; return; }
  const aqi = Math.round(air.us_aqi);
  const b = aqiBand(aqi);
  el.sheetNote.textContent = `The air quality index is ${aqi}, ${b.label.toLowerCase()}.`;

  const scale = scaleBar((aqi / 300) * 100, ["0", "Good", "Unhealthy", "300+"]);

  const pk = primaryPollutant(air);
  const primary = pk
    ? section(`Main pollutant · ${POLLUTANTS[pk].name}`, `<p class="info-text">${POLLUTANTS[pk].desc}</p>`)
    : "";

  const breakdown = Object.keys(POLLUTANTS).filter((k) => air[k] != null).map((k) => `
    <div class="pollutant">
      <div class="pollutant-top"><span class="pollutant-name">${POLLUTANTS[k].name}</span><strong class="pollutant-val">${Math.round(air[k])} µg/m³</strong></div>
      <p class="info-text">${POLLUTANTS[k].desc}</p>
    </div>`).join("");

  el.sheetList.innerHTML =
    `<div class="aqi-hero"><span class="aqi-big">${aqi}</span><span class="aqi-band">${b.label}</span></div>` +
    scale +
    section("What this means", `<p class="info-text">${b.advice}</p>`) +
    primary +
    section("Pollutants right now", breakdown);
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
    section("UV scale", `<div class="uv-scale">${scaleRows}</div>`) +
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

const SUN_BANDS = {
  day:      { name: "Day",                   color: "color-mix(in srgb, var(--ink) 5%, var(--bg))" },
  golden:   { name: "Golden hour",           color: "color-mix(in srgb, var(--ink) 28%, var(--bg))" },
  civil:    { name: "Civil twilight",        color: "color-mix(in srgb, var(--ink) 50%, var(--bg))" },
  nautical: { name: "Nautical twilight",     color: "color-mix(in srgb, var(--ink) 72%, var(--bg))" },
  astro:    { name: "Astronomical twilight", color: "color-mix(in srgb, var(--ink) 89%, var(--bg))" },
  night:    { name: "Night",                 color: "color-mix(in srgb, var(--ink) 100%, var(--bg))" }
};

function moonGlyph(cx, cy, r, frac) {
  const theta = frac * 2 * Math.PI;
  const rx = Math.abs(Math.cos(theta)) * r;
  const waxing = frac < 0.5, gibbous = frac > 0.25 && frac < 0.75;
  const limb = waxing ? 1 : 0, term = gibbous ? limb : 1 - limb;
  const top = `${cx} ${cy - r}`, bot = `${cx} ${cy + r}`;
  const shadow = `M ${top} A ${r} ${r} 0 0 ${1 - limb} ${bot} A ${rx} ${r} 0 0 ${term} ${top} Z`;
  return `<circle cx="${cx}" cy="${cy}" r="${(r + 3).toFixed(1)}" fill="var(--bg)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--bg)"/><path d="${shadow}" fill="var(--ink)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--ink)" stroke-width="0.8"/>`;
}

function renderSunSheet() {
  el.sheetTitle.textContent = "Sun Clock";
  const tz = state.tz || state.data?.current?.timezone || 0;
  const c = state.center || {};
  const lat = c.lat, lon = c.lon;
  if (!Number.isFinite(lat)) { el.sheetNote.textContent = "Location is unavailable."; el.sheetList.innerHTML = ""; return; }
  const nowUnix = Math.floor(Date.now() / 1000);
  const localMidnight = Math.floor((nowUnix + tz) / 86400) * 86400 - tz;
  const t = sunTimes(localMidnight + 43200, lat, lon);
  const dir = lat >= 0 ? 1 : -1;
  const toH = (u) => u == null ? null : ((((u + tz) / 3600) % 24) + 24) % 24;
  const hToClock = (h) => fmtClock(localMidnight + Math.round(h * 3600), tz);

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
  let bands;
  if (raw.length === 0) {
    bands = [[0, 24, t.maxAlt > 0 ? "day" : "night"]];
  } else {
    raw.sort((a, b) => a[0] - b[0]);
    const deep = ev.astroUp != null ? "night" : ev.nautUp != null ? "astro" : ev.civilUp != null ? "nautical" : ev.sunrise != null ? "civil" : (t.maxAlt > 0 ? "golden" : "night");
    bands = []; let cur = 0;
    for (const b of raw) { if (b[0] > cur + 0.001) bands.push([cur, b[0], deep]); bands.push(b); cur = Math.max(cur, b[1]); }
    if (cur < 24) bands.push([cur, 24, deep]);
  }

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
  const bandPaths = bands.map((b, i) => `<path class="sc-band" data-i="${i}" d="${arc(RI, RO, b[0], b[1])}" fill="${SUN_BANDS[b[2]].color}"/>`).join("");

  let ticks = "";
  for (let h = 0; h < 24; h++) {
    const [x1, y1] = pol(RO, ang(h)), [x2, y2] = pol(RO + (h % 6 === 0 ? 8 : 4), ang(h));
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sc-tick" stroke-width="${h % 6 === 0 ? 2 : 1}"/>`;
  }
  const hourText = (h) => { if (state.clock24) return String(h); const hh = h % 12 || 12; return `${hh}${h < 12 ? "a" : "p"}`; };
  const hourLabels = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => {
    const [x, y] = pol(RO + 20, ang(h));
    return `<text x="${x}" y="${y}" class="sc-hour">${hourText(h)}</text>`;
  }).join("");

  const moonFrac = moonPhase().frac;
  const mt = moonTimes(localMidnight, lat, lon);
  let moonMarks = "";
  [["Moonrise", mt.rise], ["Moonset", mt.set]].forEach(([label, u]) => {
    if (u == null) return;
    const [mx, my] = pol((RI + RO) / 2, ang(toH(u)));
    moonMarks += `<g class="sc-mark" data-cap="${label} · ${fmtClock(u, tz)}">${moonGlyph(+mx, +my, 9, moonFrac)}</g>`;
  });

  const nowH = toH(nowUnix);
  const [sx, sy] = pol(RO, ang(nowH));
  const sunUp = t.sunrise.up != null && nowUnix >= t.sunrise.up && nowUnix < t.sunrise.down;
  const sunHand = `<line x1="${CX}" y1="${CY}" x2="${sx}" y2="${sy}" class="sc-hand-casing"/><line x1="${CX}" y1="${CY}" x2="${sx}" y2="${sy}" class="sc-hand" data-cap="Now · ${fmtClock(nowUnix, tz)}"/><circle cx="${sx}" cy="${sy}" r="7" class="sc-sun"/>`;
  const noonCap = t.noon != null ? `Solar noon · ${fmtClock(t.noon, tz)}` : "";

  const svg = `<svg viewBox="0 0 300 300" class="sunclock" role="img" aria-label="24-hour sun clock">
    ${bandPaths}
    <circle cx="${CX}" cy="${CY}" r="${RO}" class="sc-ring" fill="none"/>
    ${ticks}${hourLabels}${moonMarks}${sunHand}
    <circle cx="${CX}" cy="${CY}" r="5" class="sc-center" data-cap="${noonCap}"/>
  </svg>`;

  const row = (icon, label, value) => `<div class="sun-row"><i class="ph-duotone ${icon}"></i><span class="sun-row-label">${label}</span><strong class="sun-row-val">${value}</strong></div>`;
  const fmtOrDash = (u) => u != null ? fmtClock(u, tz) : "--";
  const goldenAm = t.sunrise.up != null && t.golden.up != null ? `${fmtClock(t.sunrise.up, tz)} to ${fmtClock(t.golden.up, tz)}` : "--";
  const goldenPm = t.golden.down != null && t.sunrise.down != null ? `${fmtClock(t.golden.down, tz)} to ${fmtClock(t.sunrise.down, tz)}` : "--";
  const sectionD = (title, desc, body) => `<div class="info-section"><h3 class="info-head">${title}</h3><p class="info-desc">${desc}</p><div class="info-card">${body}</div></div>`;
  const intro = `<p class="sun-intro">A 24-hour map of light for your location. Midnight sits at the bottom and noon at the top; the hand shows where the sun is <em>right now</em>. Each shaded band is a stage of light, from bright <strong>day</strong> at the pale end down to full <strong>night</strong> at the dark end, so you can see daylight and darkness fall across the whole day. The little moons mark when the moon rises and sets. Tap any band, the sun, the moon, or the centre to read its exact times.</p>`;
  const list = intro +
    `<div class="sun-key">` + Object.entries(SUN_BANDS).map(([k, v]) => `<span class="sun-key-item"><span class="sun-swatch" style="background:${v.color}"></span>${v.name}</span>`).join("") + `</div>` +
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
    ].join(""));

  el.sheetNote.textContent = sunUp
    ? `Daylight now. Sunset at ${fmtOrDash(t.sunrise.down)}.`
    : `Nighttime now. Sunrise at ${fmtOrDash(t.sunrise.up)}.`;
  const toggle = `<div class="sun-fmt-wrap"><div class="segmented small sun-fmt" role="group" aria-label="Clock format">
      <button class="seg-item ${state.clock24 ? "" : "is-active"}" data-fmt="12">12h</button>
      <button class="seg-item ${state.clock24 ? "is-active" : ""}" data-fmt="24">24h</button>
    </div></div>`;
  el.sheetList.innerHTML = `${toggle}<div class="sunclock-wrap">${svg}</div>${list}`;

  const setCap = (txt) => { if (txt) el.sheetNote.textContent = txt; };
  el.sheetList.querySelectorAll(".sc-band").forEach((p) => {
    p.addEventListener("click", () => { const b = bandInfo[+p.dataset.i]; setCap(`${b.name} · ${b.from} to ${b.to}`); });
  });
  el.sheetList.querySelectorAll("[data-cap]").forEach((n) => n.addEventListener("click", () => setCap(n.dataset.cap)));
  el.sheetList.querySelectorAll(".sun-fmt [data-fmt]").forEach((b) => {
    b.addEventListener("click", () => { state.clock24 = b.dataset.fmt === "24"; saveState(); renderSunSheet(); });
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
    section("Upcoming phases", `<div class="phase-list">${upcoming}</div>`) +
    section("The eight phases", `<p class="info-text">The Moon makes no light of its own, we see the half lit by the Sun. As it orbits Earth about every 29.5 days, the amount of that lit half we can see grows (waxing) and shrinks (waning), giving eight named phases.</p><div class="phase-guide">${guide}</div>`) +
    section("The month ahead", calendar) +
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
    ["Phosphor Icons", "The interface icon set.", "https://phosphoricons.com"],
    ["Inter & Rubik", "Typefaces, served via Google Fonts.", "https://fonts.google.com"]
  ]],
  ["Astronomy", [
    ["SunCalc", "Algorithms behind the sun and moon times.", "https://github.com/mourner/suncalc"]
  ]]
];

function renderCreditsSheet() {
  el.sheetTitle.textContent = "Acknowledgements";
  el.sheetNote.textContent = "This app is built on free and open data, tools and typefaces. Thank you to the people and projects behind them.";
  el.sheetList.innerHTML = CREDITS.map(([group, items]) =>
    section(group, `<div class="credit-list">${items.map(([name, desc, url]) => `
      <a class="credit-row" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="credit-name">${name}</span>
        <span class="credit-desc">${desc}</span>
      </a>`).join("")}</div>`)
  ).join("");
}

function drawUvChart(hourly) {
  const canvas = el.graph;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  chartGeom = null; chartRedraw = null;
  const pts = todayUv(hourly);
  if (!pts.length) return;

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
  const yMax = Math.max(11, Math.ceil(Math.max(...pts.map((p) => p.uv))));
  const padX = 28, padTop = 26, padB = 26;
  const w = rect.width - padX * 2, h = rect.height - padTop - padB;
  const X = (i) => padX + (w / Math.max(1, pts.length - 1)) * i;
  const Y = (v) => padTop + h - (v / yMax) * h;

  ctx.font = "700 10px Inter, system-ui"; ctx.textAlign = "left";
  [["Low", 2], ["Moderate", 5], ["High", 7], ["Very high", 10]].forEach(([label, v]) => {
    const gy = Y(v);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.1; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(rect.width - padX, gy); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.fillStyle = ink; ctx.fillText(label, padX, gy - 4); ctx.globalAlpha = 1;
  });

  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + h);
  grad.addColorStop(0, hexA(ink, 0.26)); grad.addColorStop(1, hexA(ink, 0));

  const curve = () => {
    pts.forEach((p, i) => {
      const px = X(i), py = Y(p.uv);
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, Y(pts[i - 1].uv), cx, py, px, py); }
    });
  };

  ctx.beginPath(); curve();
  ctx.lineTo(X(pts.length - 1), padTop + h); ctx.lineTo(X(0), padTop + h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); curve(); ctx.strokeStyle = ink; ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();

  const nowH = new Date().getHours();
  let nowI = pts.findIndex((p) => Number(p.t.slice(11, 13)) === nowH);
  if (nowI < 0) nowI = pts.length - 1;
  const nx = X(nowI), ny = Y(pts[nowI].uv);
  ctx.setLineDash([3, 4]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(nx, padTop); ctx.lineTo(nx, padTop + h); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(nx, ny, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff";
  ctx.beginPath(); ctx.arc(nx, ny, 2.5, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = ink; ctx.globalAlpha = 0.55; ctx.font = "700 11px Inter, system-ui"; ctx.textAlign = "center";
  [6, 12, 18].forEach((hh) => {
    const i = pts.findIndex((p) => Number(p.t.slice(11, 13)) === hh);
    if (i >= 0) ctx.fillText(`${(hh % 12) || 12}${hh < 12 ? "am" : "pm"}`, X(i), rect.height - 8);
  });
  ctx.globalAlpha = 1;

  chartGeom = {
    xs: pts.map((_, i) => X(i)), ys: pts.map((p) => Y(p.uv)),
    rows: pts.map((p) => { const hh = Number(p.t.slice(11, 13)); return { label: `${(hh % 12) || 12}${hh < 12 ? "am" : "pm"}`, hi: p.uv }; }),
    padTop, h, rect, dual: false, fmt: (v) => `${Math.round(v)}`
  };
  chartRedraw = () => drawUvChart(hourly);
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
      <span class="row-temp">${Math.round(it.main.temp)}°<span class="row-sub"> · feels ${Math.round(it.main.feels_like)}°</span></span>
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
  return (state.hourly || [])
    .map((it) => ({ label: fmtHour(it.dt, tz), hi: m.get(it) }))
    .filter((r) => Number.isFinite(r.hi));
}

function drawDetailChart() {
  if (state.detail.metric === "aqi" || state.detail.metric === "uv") return;
  if (state.detail.metric === "day") {
    const day = state.daily[state.detail.dayIndex];
    if (!day) return;
    const tz = state.tz || 0;
    drawChart((day.items || []).map((it) => ({ label: fmtHour(it.dt, tz), hi: it.main.temp })), METRICS.temp, false, day.label === "Today");
    return;
  }
  const m = METRICS[state.detail.metric];
  if (state.detail.metric === "temp" && state.detail.range === "daily") {
    drawChart(state.daily.map((d) => ({ label: d.label, hi: d.max, lo: d.min })), m, true, false);
  } else {
    drawChart(detailSeries(), m, false, true);
  }
}

function renderDetailList() {
  const m = METRICS[state.detail.metric];
  const tz = state.tz || 0;
  if (state.detail.metric === "temp" && state.detail.range === "daily") {
    el.sheetList.innerHTML = state.daily.map((d, i) => `
      <button class="row row-tap" data-day="${i}">
        <span class="row-label">${d.label}</span>
        ${wxIcon({ main: d.main, icon: d.icon }, false, "row-icon")}
        <span class="row-temp">${Math.round(d.max)}°<span class="row-sub"> / ${Math.round(d.min)}°</span></span>
        <i class="ph ph-caret-right row-go"></i>
      </button>`).join("");
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
      ? `<span class="row-precip"><i class="ph-fill ph-drop"></i><span class="rp-chance">${pop}%</span>${mmTxt ? `<span class="rp-amt">${mmTxt} mm</span>` : ""}</span>`
      : "";
    return `
    <div class="row${showWx ? " row-wx" : ""}">
      <span class="row-label">${fmtHour(it.dt, tz)}</span>
      ${wxIcon(it.weather?.[0], hh < 6 || hh >= 20, "row-icon")}
      ${wx}
      <span class="row-temp">${valTxt(m.get(it))}</span>
    </div>`;
  }).join("");
}

function hexA(hex, a) {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

let chartGeom = null, chartRedraw = null;

function drawTrend() {
  const canvas = el.trendGraph;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const tz = state.tz || 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const localDay = (sec) => { const d = new Date((sec + tz) * 1000); return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`; };
  const today = localDay(nowSec);

  const fromHourly = (state.data?.hourly || [])
    .map((it) => ({ t: it.dt, temp: it.main?.temp, precip: it.precip || 0 }))
    .filter((p) => Number.isFinite(p.temp));
  const fromForecast = (state.data?.forecast?.list || [])
    .map((it) => ({ t: it.dt, temp: it.main?.temp, precip: (it.rain?.["3h"] || 0) + (it.snow?.["3h"] || 0) }))
    .filter((p) => Number.isFinite(p.temp));

  let pts = fromHourly.filter((p) => localDay(p.t) === today);
  if (pts.length < 3) pts = fromForecast.filter((p) => localDay(p.t) === today);
  if (pts.length < 3) {
    const base = fromHourly.length ? fromHourly : fromForecast;
    pts = base.filter((p) => p.t >= nowSec - 3600).slice(0, fromHourly.length ? 24 : 8);
  }
  if (pts.length < 2) return;

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#050505";
  const font = "Inter, system-ui, sans-serif";

  const temps = pts.map((p) => p.temp);
  let tMin = Math.min(...temps), tMax = Math.max(...temps);
  if (tMin === tMax) { tMin -= 1; tMax += 1; }
  const tPad = (tMax - tMin) * 0.28 || 1;
  tMin -= tPad; tMax += tPad;
  const maxPrecip = Math.max(0.1, ...pts.map((p) => p.precip));

  const anyPrecip = pts.some((p) => p.precip > 0);
  const padL = 36, padR = anyPrecip ? 48 : 14, padTop = 18, padB = 26;
  const W = rect.width, H = rect.height;
  const x0 = padL, x1 = W - padR;
  const y0 = padTop, y1 = H - padB, plotH = y1 - y0;
  const slotW = (x1 - x0) / (pts.length - 1);
  const X = (i) => x0 + slotW * i;
  const Y = (v) => y1 - ((v - tMin) / (tMax - tMin)) * plotH;
  const barMaxH = plotH * 0.42;

  ctx.textBaseline = "middle";
  ctx.textAlign = "right";
  ctx.font = `600 11px ${font}`;
  const lines = 4;
  for (let i = 0; i < lines; i++) {
    const v = tMax - ((tMax - tMin) / (lines - 1)) * i;
    const gy = Y(v);
    ctx.strokeStyle = hexA(ink, 0.1); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
    ctx.fillStyle = hexA(ink, 0.5);
    ctx.fillText(`${Math.round(v)}°`, x0 - 8, gy);
  }

  const barW = Math.min(slotW * 0.6, 12);
  pts.forEach((p, i) => {
    if (p.precip <= 0) return;
    const bh = (p.precip / maxPrecip) * barMaxH;
    ctx.fillStyle = hexA(ink, 0.22);
    ctx.fillRect(X(i) - barW / 2, y1 - bh, barW, bh);
  });
  if (anyPrecip) {
    const mmMax = maxPrecip >= 10 ? Math.round(maxPrecip) : Math.round(maxPrecip * 10) / 10;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = `600 11px ${font}`;
    ctx.fillStyle = hexA(ink, 0.5);
    ctx.fillText(`${mmMax} mm`, W - 4, y1 - barMaxH);
    ctx.fillText("0", W - 4, y1);
  }

  const curve = () => {
    pts.forEach((p, i) => {
      const px = X(i), py = Y(p.temp);
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, Y(pts[i - 1].temp), cx, py, px, py); }
    });
  };
  ctx.beginPath(); curve();
  ctx.lineTo(X(pts.length - 1), y1); ctx.lineTo(X(0), y1); ctx.closePath();
  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, hexA(ink, 0.2)); grad.addColorStop(1, hexA(ink, 0));
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); curve();
  ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.stroke();

  if (nowSec >= pts[0].t && nowSec <= pts[pts.length - 1].t) {
    let ni = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      if (nowSec >= pts[i].t && nowSec <= pts[i + 1].t) {
        ni = i + (nowSec - pts[i].t) / Math.max(1, pts[i + 1].t - pts[i].t);
        break;
      }
    }
    const nx = X(ni);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = hexA(ink, 0.45); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(nx, y0); ctx.lineTo(nx, y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = hexA(ink, 0.55); ctx.font = `700 10px ${font}`;
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.fillText("Now", Math.max(x0 + 12, Math.min(x1 - 12, nx)), y0 - 6);
  }

  let hiIdx = 0, loIdx = 0;
  pts.forEach((p, i) => { if (p.temp > pts[hiIdx].temp) hiIdx = i; if (p.temp < pts[loIdx].temp) loIdx = i; });
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 11px ${font}`;
  const marks = hiIdx === loIdx ? [[hiIdx, -9]] : [[hiIdx, -9], [loIdx, 16]];
  marks.forEach(([idx, dy]) => {
    const px = X(idx), py = Y(pts[idx].temp);
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillText(`${Math.round(pts[idx].temp)}°`, Math.max(x0 + 12, Math.min(x1 - 12, px)), py + dy);
  });

  ctx.fillStyle = hexA(ink, 0.55);
  ctx.font = `700 11px ${font}`;
  const labelStep = Math.max(1, Math.round(pts.length / 5));
  pts.forEach((p, i) => {
    if (i % labelStep !== 0) return;
    ctx.fillText(fmtHour(p.t, tz), Math.max(x0 + 16, Math.min(x1 - 16, X(i))), H - 8);
  });
}

function drawChart(rows, m, dual, showNow) {
  const canvas = el.graph;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  chartGeom = null;
  chartRedraw = null;
  if (!rows.length) return;

  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
  const vals = rows.flatMap((r) => dual ? [r.hi, r.lo] : [r.hi]).filter(Number.isFinite);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; } else { const pad = (max - min) * 0.18; min -= pad; max += pad; }
  const padX = 28, padTop = 34, padB = 30;
  const w = rect.width - padX * 2, h = rect.height - padTop - padB;
  const X = (i) => padX + (w / Math.max(1, rows.length - 1)) * i;
  const Y = (v) => padTop + h - ((v - min) / Math.max(1e-6, max - min)) * h;
  const dec = m.decimals || 0;
  const lab = (v) => dec ? v.toFixed(dec) : (m.unit === "°" ? `${Math.round(v)}°` : `${Math.round(v)}`);

  ctx.strokeStyle = ink; ctx.globalAlpha = 0.12; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const gy = padTop + (h / 3) * i; ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(rect.width - padX, gy); ctx.stroke(); }
  ctx.globalAlpha = 1;

  const curve = (key) => {
    rows.forEach((r, i) => {
      const px = X(i), py = Y(r[key]);
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, Y(rows[i - 1][key]), cx, py, px, py); }
    });
  };

  if (!dual) {
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
  if (dual) stroke("lo", 0.4, 3);
  stroke("hi", 1, 3.5);

  if (showNow) {
    ctx.setLineDash([3, 4]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(0), padTop); ctx.lineTo(X(0), padTop + h); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  ctx.fillStyle = ink; ctx.font = "700 12px Inter, system-ui"; ctx.textAlign = "center";
  const step = Math.max(1, Math.ceil(rows.length / 8));
  rows.forEach((r, i) => {
    if (i % step !== 0) return;
    ctx.beginPath(); ctx.arc(X(i), Y(r.hi), 3.5, 0, Math.PI * 2); ctx.fill();
    if (dual) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(X(i), Y(r.lo), 3.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.fillText(lab(r.hi), X(i), Y(r.hi) - 12);
    if (dual) { ctx.globalAlpha = 0.6; ctx.fillText(lab(r.lo), X(i), Y(r.lo) + 18); ctx.globalAlpha = 1; }
    ctx.globalAlpha = 0.55; ctx.fillText(i === 0 && showNow ? "Now" : r.label, X(i), rect.height - 10); ctx.globalAlpha = 1;
  });

  chartGeom = {
    xs: rows.map((_, i) => X(i)), ys: rows.map((r) => Y(r.hi)),
    rows, padTop, h, rect, dual, fmt: lab
  };
  chartRedraw = () => drawChart(rows, m, dual, showNow);
}

function showChartPoint(clientX) {
  if (!chartGeom || !chartRedraw) return;
  const rect = el.graph.getBoundingClientRect();
  const x = clientX - rect.left;
  const xs = chartGeom.xs;
  let idx = 0, best = Infinity;
  for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - x); if (d < best) { best = d; idx = i; } }
  chartRedraw();
  const g = chartGeom, r = g.rows[idx];
  if (!r) return;
  const ctx = el.graph.getContext("2d");
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
  const text = `${r.label}  ${val}`;
  ctx.font = "700 12px Inter, system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(text).width + 18, bh = 24;
  let bx = Math.max(2, Math.min(g.rect.width - tw - 2, px - tw / 2));
  ctx.fillStyle = ink;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, 2, tw, bh, 9); ctx.fill(); }
  else ctx.fillRect(bx, 2, tw, bh);
  ctx.fillStyle = bg; ctx.fillText(text, bx + tw / 2, 2 + bh / 2);
  ctx.restore();
}

function openDrawer() {
  state.drawerOpen = true;
  el.drawer.classList.add("is-open");
  el.scrim.classList.add("is-open");
  el.drawer.setAttribute("aria-hidden", "false");
  el.drawer.style.transform = "";
}
function closeDrawer() {
  state.drawerOpen = false;
  el.drawer.classList.remove("is-open");
  el.scrim.classList.remove("is-open");
  el.drawer.setAttribute("aria-hidden", "true");
  el.drawer.style.transform = "";
}

function haveLeaflet() { return typeof window.L !== "undefined"; }
function radarTileUrl() {
  return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
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
    radar.preview = L.map(el.radarPreviewMap, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false
    }).setView([c.lat, c.lon], 9);
    radar.previewBase = L.tileLayer(radarTileUrl(), { subdomains: "abcd", updateWhenZooming: false, keepBuffer: 1 }).addTo(radar.preview);
    let previewTileErrs = 0;
    radar.previewBase.on("tileerror", () => {
      if (++previewTileErrs === 8 && radar.previewBase) radar.previewBase.setUrl("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    });
    setPinMarker(radar.preview, "previewMarker");
    const invalidate = () => radar.preview && radar.preview.invalidateSize();
    requestAnimationFrame(invalidate);
    [120, 500, 1000].forEach((d) => setTimeout(invalidate, d));
    if ("ResizeObserver" in window && !radar._previewRO) {
      radar._previewRO = new ResizeObserver(invalidate);
      radar._previewRO.observe(el.radarPreviewMap);
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

function openRadar() {
  state.radarOpen = true;
  el.radarSheet.classList.add("is-open");
  el.radarSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  initRadarMap();
  setTimeout(() => radar.map && radar.map.invalidateSize(), 320);
  const warmed = radar.mode === "radar" && radar.layers.length;
  if (!warmed) {
    applyMode(radar.mode);
    return;
  }
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) => b.classList.toggle("is-active", b.dataset.layer === "radar"));
  el.radarTimeline.style.display = "";
  if (el.radarLegend) el.radarLegend.style.display = "";
  updateRadarNote();
  if (radar.ready) { radar.idx = 0; startRadarPlay(); }
}
function closeRadar() {
  if (!state.radarOpen) return;
  state.radarOpen = false;
  stopRadarPlay();
  disableWindArrows();
  el.radarSheet.classList.remove("is-open");
  el.radarSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function applyMode(mode) {
  radar.mode = mode;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.layer === mode));
  updateRadarNote();
  if (!haveLeaflet() || !radar.map) return;
  stopRadarPlay();
  removeRadarLayers();
  if (radar.owm) { radar.map.removeLayer(radar.owm); radar.owm = null; }
  disableWindArrows();
  const isRadar = mode === "radar";
  const isWind = mode === "wind_new";
  el.radarTimeline.style.display = isRadar ? "" : "none";
  if (el.radarLegend) el.radarLegend.style.display = isRadar ? "" : "none";
  if (el.windLegend) el.windLegend.style.display = isWind ? "" : "none";
  if (isRadar) {
    loadRadar();
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

function inCanada(lat, lon) {
  return lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52;
}

async function ensureFrames() {
  if (!radar.loaded) {
    const j = await (await fetch(RAINVIEWER_API, { cache: "no-store" })).json();
    radar.host = j.host;
    const past = (j.radar?.past || []).map((f) => ({ t: f.time, path: f.path, kind: "past" }));
    const soon = (j.radar?.nowcast || []).map((f) => ({ t: f.time, path: f.path, kind: "forecast" }));
    radar.rvFrames = [...past, ...soon];
    radar.loaded = true;
  }
  radar.source = "rainviewer";
  radar.frames = radar.rvFrames || [];
  const lastPast = radar.frames.map((f) => f.kind).lastIndexOf("past");
  radar.idx = lastPast >= 0 ? lastPast : Math.max(0, radar.frames.length - 1);
  return radar.frames;
}

async function ensureEccc() {
  const now = Date.now();
  const layer = ecccLayer();
  if (radar.source === "eccc" && radar.ecccLayerName === layer && radar.frames.length && now - radar.ecccAt < 300000) return radar.frames;
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
  radar.frames = frames;
  radar.source = "eccc";
  radar.ecccLayerName = layer;
  radar.ecccAt = now;
  radar.idx = frames.length - 1;
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
    for (let t = t0; t <= t1 + 1000; t += stepMin * 60000) out.push({ t: Math.floor(t / 1000), iso: iso(t), kind: "past" });
    return out.slice(-13);
  }
  return dimText.split(",").map((s) => s.trim()).filter(Boolean).slice(-13)
    .map((s) => ({ t: Math.floor(Date.parse(s) / 1000), iso: iso(Date.parse(s)), kind: "past" }))
    .filter((f) => Number.isFinite(f.t));
}

async function loadRadar() {
  if (!haveLeaflet() || !radar.map) return;
  try {
    const c = state.center;
    let frames = null;
    if (inCanada(c.lat, c.lon)) frames = await ensureEccc().catch(() => null);
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
    let layer;
    if (radar.source === "eccc") {
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
      if (radar.source === "eccc") c.style.filter = ECCC_FILTER;
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
  else if (diffMin < 0) rel = Math.abs(diffMin) >= 60 ? `−${Math.round(Math.abs(diffMin) / 60)}h` : `−${Math.abs(diffMin)}m`;
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
  let name = LAYER_NAMES[radar.mode] || "Weather";
  if (radar.mode === "radar") {
    if (radar.source === "eccc") {
      name = ecccLayer() === ECCC_LAYER_SNOW
        ? "Snow radar · Environment Canada"
        : "Composite rain radar · Environment Canada";
    } else {
      name = "Live precipitation radar";
    }
  }
  el.radarNote.textContent = `${name} near ${place}.`;
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
  if (radar.marker) radar.marker.setIcon(locationPinIcon());
  if (radar.previewMarker) radar.previewMarker.setIcon(locationPinIcon());
}

function useMyLocation() {
  if (!navigator.geolocation) { setStatus("Geolocation isn't available."); return; }
  closeDrawer();
  setStatus("Finding your location…");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My location" };
      markLoc("loc");
      saveState();
      refresh(true);
    },
    () => setStatus("Location permission denied. Staying on Home."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

function markLoc(which) {
  el.useHome.classList.toggle("is-active", which === "home");
  el.useLocation.classList.toggle("is-active", which === "loc");
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
    ? `${Math.min(10, v / 1609).toFixed(v >= 16090 ? 0 : 1)} mi`
    : `${Math.min(10, v / 1000).toFixed(v >= 10000 ? 0 : 1)} km`;
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
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ units: state.units, loc: state.loc, theme: state.theme, clock24: state.clock24 })); } catch {}
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (s) {
      state.units = s.units || "metric";
      state.loc = s.loc || { ...HOME };
      state.theme = PALETTES[s.theme] ? s.theme : (THEME_REMAP[s.theme] || "lemon");
      state.clock24 = !!s.clock24;
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
  el.themeGrid.querySelectorAll("[data-theme]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.theme === state.theme));
  markLoc(state.loc.label === HOME.label ? "home" : "loc");
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
  const EDGE = 26, OPEN = 55, DISMISS = 95, PTR_TRIGGER = 72;
  let mode = null;
  let sx = 0, sy = 0, dist = 0;

  ["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) { mode = null; return; }
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dist = 0;

    if (state.radarOpen) { mode = null; return; }
    if (state.drawerOpen) { mode = "drawer"; return; }
    if (state.sheetOpen) { mode = sx < EDGE ? "sheet" : null; return; }
    if (sx < EDGE) { mode = "edge"; return; }
    if ((window.scrollY || 0) <= 0) { mode = "ptr"; return; }
    mode = null;
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!mode) return;
    const t = e.touches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;

    if (mode === "ptr") {
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) && (window.scrollY || 0) <= 0) {
        dist = dy * 0.5;
        showPTR(dist);
        if (dy > 6) e.preventDefault();
      } else { mode = null; hidePTR(); }
    } else if (mode === "edge") {
      if (dx > OPEN) { openDrawerDrag(dx); }
    } else if (mode === "drawer") {
      if (dx < 0) { el.drawer.style.transition = "none"; el.drawer.style.transform = `translateX(${Math.max(dx, -360)}px)`; }
    } else if (mode === "sheet") {
      if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
        el.sheet.style.transition = "none";
        el.sheet.style.transform = `translateX(${dx}px)`;
        e.preventDefault();
      }
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    if (mode === "ptr") {
      if (dist >= PTR_TRIGGER) refresh(true); else hidePTR();
    } else if (mode === "edge") {
      el.drawer.style.transition = "";
      if (dist > 90) openDrawer(); else closeDrawer();
    } else if (mode === "drawer") {
      el.drawer.style.transition = "";
      const x = currentX(el.drawer);
      if (x < -70) closeDrawer(); else openDrawer();
    } else if (mode === "sheet") {
      el.sheet.style.transition = "";
      const x = currentX(el.sheet);
      if (x > DISMISS) sheetBack(); else { el.sheet.classList.add("is-open"); el.sheet.style.transform = ""; }
    }
    mode = null;
  });

  function openDrawerDrag(dx) {
    dist = dx;
    el.drawer.classList.add("is-open");
    el.scrim.classList.add("is-open");
    el.drawer.style.transition = "none";
    el.drawer.style.transform = `translateX(${Math.min(0, dx - 360)}px)`;
  }
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
