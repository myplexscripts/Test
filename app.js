/* =====================================================================
   Home Weather — application logic
   Data: OpenWeather 2.5 (current + 5 day / 3 hour forecast)
   ===================================================================== */

"use strict";

/* ---------- Config ---------- */
const API_KEY = "37c88f3496272531c686b0686ecfe1dd"; // personal testing key
const API_BASE = "https://api.openweathermap.org/data/2.5";
const HOME = { lat: 42.9849, lon: -81.2453, label: "London, Ontario" };
const STATE_KEY = "hw_state_v1";
const CACHE_KEY = "hw_cache_v1";

/* Freeform-gradient per-condition backgrounds: a flat base colour with a few
   soft radial "blobs" layered on top (a mesh-gradient look). Light palettes
   keep the near-black "conditions bar" surface with accent-hue icons; dark
   palettes flip to a light-on-dark scheme. */
const BG = {
  sunny:       "radial-gradient(circle at 18% 14%,rgba(255,247,184,.95) 0%,rgba(255,247,184,.75) 10%,rgba(255,247,184,0) 28%),radial-gradient(circle at 82% 18%,rgba(255,211,92,.7) 0%,rgba(255,211,92,.45) 18%,rgba(255,211,92,0) 40%),radial-gradient(circle at 78% 78%,rgba(255,239,160,.85) 0%,rgba(255,239,160,.45) 16%,rgba(255,239,160,0) 36%),radial-gradient(circle at 20% 88%,rgba(255,221,72,.55) 0%,rgba(255,221,72,.28) 20%,rgba(255,221,72,0) 42%)",
  mostlyclear: "radial-gradient(circle at 20% 14%,rgba(174,232,255,.95) 0%,rgba(174,232,255,.7) 14%,rgba(174,232,255,0) 30%),radial-gradient(circle at 84% 22%,rgba(126,219,255,.65) 0%,rgba(126,219,255,.38) 20%,rgba(126,219,255,0) 38%),radial-gradient(circle at 74% 80%,rgba(31,175,232,.55) 0%,rgba(31,175,232,.3) 18%,rgba(31,175,232,0) 38%),radial-gradient(circle at 16% 84%,rgba(186,239,255,.55) 0%,rgba(186,239,255,.25) 18%,rgba(186,239,255,0) 36%)",
  cloudy:      "radial-gradient(circle at 18% 16%,rgba(236,245,255,.95) 0%,rgba(236,245,255,.68) 14%,rgba(236,245,255,0) 32%),radial-gradient(circle at 82% 14%,rgba(214,231,252,.7) 0%,rgba(214,231,252,.38) 18%,rgba(214,231,252,0) 38%),radial-gradient(circle at 70% 74%,rgba(141,187,250,.45) 0%,rgba(141,187,250,.2) 16%,rgba(141,187,250,0) 34%),radial-gradient(circle at 22% 82%,rgba(255,255,255,.4) 0%,rgba(255,255,255,.18) 16%,rgba(255,255,255,0) 34%)",
  rain:        "radial-gradient(circle at 18% 16%,rgba(143,200,255,.82) 0%,rgba(143,200,255,.5) 16%,rgba(143,200,255,0) 34%),radial-gradient(circle at 82% 18%,rgba(112,177,247,.5) 0%,rgba(112,177,247,.24) 18%,rgba(112,177,247,0) 36%),radial-gradient(circle at 22% 82%,rgba(34,111,212,.42) 0%,rgba(34,111,212,.18) 20%,rgba(34,111,212,0) 42%),radial-gradient(circle at 78% 78%,rgba(120,187,255,.42) 0%,rgba(120,187,255,.18) 20%,rgba(120,187,255,0) 38%)",
  storm:       "radial-gradient(circle at 16% 14%,rgba(77,99,168,.72) 0%,rgba(77,99,168,.42) 16%,rgba(77,99,168,0) 34%),radial-gradient(circle at 82% 18%,rgba(40,57,110,.55) 0%,rgba(40,57,110,.26) 18%,rgba(40,57,110,0) 38%),radial-gradient(circle at 26% 82%,rgba(11,19,43,.7) 0%,rgba(11,19,43,.36) 22%,rgba(11,19,43,0) 44%),radial-gradient(circle at 82% 78%,rgba(17,31,70,.65) 0%,rgba(17,31,70,.3) 18%,rgba(17,31,70,0) 40%)",
  snow:        "radial-gradient(circle at 18% 14%,rgba(234,246,255,.95) 0%,rgba(234,246,255,.65) 16%,rgba(234,246,255,0) 34%),radial-gradient(circle at 84% 18%,rgba(225,241,255,.62) 0%,rgba(225,241,255,.28) 18%,rgba(225,241,255,0) 36%),radial-gradient(circle at 76% 78%,rgba(191,228,255,.38) 0%,rgba(191,228,255,.14) 18%,rgba(191,228,255,0) 36%),radial-gradient(circle at 18% 84%,rgba(244,250,255,.65) 0%,rgba(244,250,255,.24) 18%,rgba(244,250,255,0) 34%)",
  night:       "radial-gradient(circle at 14% 22%,rgba(255,255,255,.85) 0 1px,transparent 1.6px),radial-gradient(circle at 28% 12%,rgba(255,255,255,.65) 0 1px,transparent 1.6px),radial-gradient(circle at 66% 20%,rgba(255,255,255,.7) 0 1px,transparent 1.6px),radial-gradient(circle at 78% 10%,rgba(255,255,255,.85) 0 1px,transparent 1.6px),radial-gradient(circle at 84% 28%,rgba(255,255,255,.5) 0 1px,transparent 1.6px),radial-gradient(circle at 20% 14%,rgba(26,47,92,.78) 0%,rgba(26,47,92,.4) 16%,rgba(26,47,92,0) 34%),radial-gradient(circle at 82% 18%,rgba(60,115,215,.22) 0%,rgba(60,115,215,.1) 16%,rgba(60,115,215,0) 34%),radial-gradient(circle at 20% 86%,rgba(7,14,36,.92) 0%,rgba(7,14,36,.44) 24%,rgba(7,14,36,0) 44%),radial-gradient(circle at 82% 82%,rgba(18,35,76,.54) 0%,rgba(18,35,76,.22) 18%,rgba(18,35,76,0) 38%)",
  sunset:      "radial-gradient(circle at 18% 16%,rgba(255,161,166,.8) 0%,rgba(255,161,166,.44) 18%,rgba(255,161,166,0) 36%),radial-gradient(circle at 82% 18%,rgba(255,116,194,.46) 0%,rgba(255,116,194,.22) 18%,rgba(255,116,194,0) 36%),radial-gradient(circle at 22% 82%,rgba(255,79,109,.34) 0%,rgba(255,79,109,.16) 18%,rgba(255,79,109,0) 36%),radial-gradient(circle at 78% 76%,rgba(255,197,184,.44) 0%,rgba(255,197,184,.18) 20%,rgba(255,197,184,0) 38%)"
};
const PALETTES = {
  sunny:       { bg: "#ffe142", ink: "#0a0a0a", surface: "#0a0a0a", onSurface: "#fffdf8", accent: "#ffd83d", dark: false, bgImage: BG.sunny },
  mostlyclear: { bg: "#42c6ff", ink: "#06222f", surface: "#06222f", onSurface: "#eafaff", accent: "#5fd0ff", dark: false, bgImage: BG.mostlyclear },
  cloudy:      { bg: "#b8d7ff", ink: "#0b1f3a", surface: "#0b1f3a", onSurface: "#eef5ff", accent: "#7fb4ff", dark: false, bgImage: BG.cloudy },
  rain:        { bg: "#4a90e2", ink: "#05203b", surface: "#05203b", onSurface: "#eaf2ff", accent: "#8fc8ff", dark: false, bgImage: BG.rain },
  storm:       { bg: "#243b6b", ink: "#eef2ff", surface: "#0d1733", onSurface: "#f4f6ff", accent: "#8aa6ee", dark: true,  bgImage: BG.storm },
  snow:        { bg: "#ffffff", ink: "#0b1626", surface: "#0b1626", onSurface: "#eef5ff", accent: "#79b6ff", dark: false, bgImage: BG.snow },
  night:       { bg: "#0b132b", ink: "#e9ecff", surface: "#0a1024", onSurface: "#f4f6ff", accent: "#7e9be0", dark: true,  bgImage: BG.night },
  sunset:      { bg: "#ff64d4", ink: "#2b0a24", surface: "#2b0a24", onSurface: "#ffe9fa", accent: "#ff8fe0", dark: false, bgImage: BG.sunset }
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  ptr: $("ptr"), scrim: $("scrim"),
  drawer: $("drawer"), drawerClose: $("drawerClose"),
  menuBtn: $("menuBtn"), locBtn: $("locBtn"),
  unitSeg: $("unitSeg"), themeGrid: $("themeGrid"), useHome: $("useHome"), useLocation: $("useLocation"), refreshBtn: $("refreshBtn"),
  placeName: $("placeName"), datePill: $("datePill"), condition: $("condition"),
  heroIcon: $("heroIcon"), temp: $("temp"), tempNum: $("tempNum"), summary: $("summary"),
  mWind: $("mWind"), mHumidity: $("mHumidity"), mVisibility: $("mVisibility"),
  hourRail: $("hourRail"), dayRail: $("dayRail"), status: $("status"),
  sunCard: $("sunCard"), detailGrid: $("detailGrid"), windCard: $("windCard"),
  radarPreview: $("radarPreview"), radarPreviewMap: $("radarPreviewMap"), radarMore: $("radarMore"),
  radarSheet: $("radarSheet"), radarBack: $("radarBack"), radarMap: $("radarMap"),
  layerSeg: $("layerSeg"), radarNote: $("radarNote"),
  radarTimeline: $("radarTimeline"), radarPlay: $("radarPlay"), radarScrub: $("radarScrub"), radarTime: $("radarTime"), radarLegend: $("radarLegend"),
  hourlyMore: $("hourlyMore"), dailyMore: $("dailyMore"),
  sheet: $("sheet"), sheetBack: $("sheetBack"), tabSeg: $("tabSeg"),
  sheetTitle: $("sheetTitle"), sheetNote: $("sheetNote"), graph: $("graph"), sheetList: $("sheetList"), dayStats: $("dayStats")
};

/* ---------- State ---------- */
const state = {
  units: "metric",
  loc: { ...HOME },
  data: null,
  hourly: [],
  daily: [],
  detail: { metric: "temp", range: "hourly" },
  theme: "auto",
  autoKind: "sunny",
  center: { ...HOME },
  tz: 0,
  placeName: "",
  dark: false,
  drawerOpen: false,
  sheetOpen: false,
  radarOpen: false
};

/* Radar / map (Leaflet) state.
   mode "radar" = animated RainViewer; others = OpenWeather static layers. */
const radar = {
  map: null, base: null, owm: null, marker: null, preview: null, previewBase: null, previewMarker: null,
  layers: [], front: 0, gen: 0,
  mode: "radar", source: "rainviewer", frames: [], idx: 0, playing: false, timer: null, host: "", loaded: false, ecccAt: 0, ecccLayerName: "", themeDark: null
};
const RAINVIEWER_API = "https://api.rainviewer.com/public/weather-maps.json";
const RV_COLOR = 7;    // colour scheme: Dark Sky (Apple-like blue→purple→red→yellow)
const RV_OPTS = "1_1"; // smooth + show snow
const RV_SIZE = 256;
// Environment & Climate Change Canada radar (GeoMet WMS, time-animated).
const ECCC_WMS          = "https://geo.weather.gc.ca/geomet";
// GeoMet's national radar composite is published as the RADAR_1KM_* family
// (1 km mosaic). There is no RADAR_COMPOSITE_* layer — using those names made
// GetMap return blank tiles, so the Canada radar showed nothing.
const ECCC_LAYER_RAIN = "RADAR_1KM_RRAI"; // national composite — rain
const ECCC_LAYER_SNOW = "RADAR_1KM_RSNO"; // national composite — snow
const LAYER_NAMES = { radar: "Live precipitation radar", clouds_new: "Cloud cover", temp_new: "Temperature", wind_new: "Wind speed" };

function ecccLayer() {
  const main = (state.data?.current?.weather?.[0]?.main || "").toLowerCase();
  return main === "snow" ? ECCC_LAYER_SNOW : ECCC_LAYER_RAIN;
}

/* ---------- Boot ---------- */
init();

function init() {
  loadState();
  wireEvents();
  registerSW();
  syncControls();

  // One-time entrance: stagger the forecast cards on first load, then drop the
  // flag so later background refreshes don't re-animate them.
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

/* ---------- Events ---------- */
function wireEvents() {
  el.menuBtn.onclick = openDrawer;
  el.drawerClose.onclick = closeDrawer;
  el.scrim.onclick = () => { closeDrawer(); };
  el.refreshBtn.onclick = () => { closeDrawer(); refresh(true); };
  el.locBtn.onclick = useMyLocation;
  el.useLocation.onclick = () => { closeDrawer(); useMyLocation(); };
  el.useHome.onclick = () => { state.loc = { ...HOME }; markLoc("home"); saveState(); closeDrawer(); refresh(true); };

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
  el.sheetBack.onclick = closeSheet;
  el.windCard.onclick = () => openDetail("wind");
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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSheet(); closeDrawer(); closeRadar(); }
  });

  window.addEventListener("resize", () => { if (state.sheetOpen) drawDetailChart(); });

  initGestures();
}

/* ---------- Data ---------- */
async function refresh(force) {
  setBusy(true);
  if (force) setStatus("Refreshing…");
  try {
    const q = `lat=${state.loc.lat}&lon=${state.loc.lon}&units=${state.units}&appid=${API_KEY}`;
    const [current, forecast] = await Promise.all([
      fetchJSON(`${API_BASE}/weather?${q}`),
      fetchJSON(`${API_BASE}/forecast?${q}`)
    ]);
    const data = { current, forecast };
    state.data = data;
    saveCache(data);
    render(data);
    setStatus(`Updated ${fmtClock(Date.now() / 1000, current.timezone || 0)}`);
  } catch (err) {
    if (state.data) setStatus(`Offline — showing saved weather. (${err.message})`);
    else setStatus(`Couldn't load weather. ${err.message}`);
  } finally {
    setBusy(false);
  }
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { message: text || res.statusText }; }
  if (!res.ok) throw new Error(data.message || res.statusText || "Request failed");
  return data;
}

/* ---------- Render ---------- */
function render(data) {
  const { current, forecast } = data;
  const tz = current.timezone ?? forecast.city?.timezone ?? 0;
  const w = current.weather?.[0] || {};
  const m = current.main || {};
  const sys = current.sys || {};
  const isNight = sys.sunrise && sys.sunset ? (current.dt < sys.sunrise || current.dt >= sys.sunset) : false;

  state.hourly = buildHourly(forecast, tz);
  state.daily = buildDaily(forecast, tz);

  state.autoKind = paletteKind(current, isNight);
  applyPalette(themeKind());

  el.heroIcon.className = `hero-icon ${iconClass(w.main, isNight)}`;
  el.placeName.textContent = current.name ? `${current.name}${sys.country ? ", " + sys.country : ""}` : state.loc.label;
  el.datePill.textContent = fmtDate(tz);
  el.condition.textContent = w.description || w.main || "Weather";
  el.tempNum.textContent = `${Math.round(m.temp ?? 0)}`;
  el.temp.classList.remove("is-loading");
  el.summary.textContent = buildSummary(current, state.daily);

  el.mWind.textContent = windText(current.wind?.speed || 0);
  el.mHumidity.textContent = m.humidity != null ? `${m.humidity}%` : "—";
  el.mVisibility.textContent = visibilityText(current.visibility);

  renderHourly();
  renderDaily();
  renderWind(current);
  renderSun(current);
  renderDetails(current, forecast);

  state.center = { lat: current.coord?.lat ?? state.loc.lat, lon: current.coord?.lon ?? state.loc.lon };
  state.tz = tz;
  state.placeName = current.name || state.loc.label;
  syncMaps();

  if (state.sheetOpen) renderDetailSheet();
}

function renderHourly() {
  const html = state.hourly.map((h) => `
    <button class="card hour-card" data-open="hourly">
      <span>${h.label}</span>
      <i class="${iconClass(h.main, h.hour < 6 || h.hour >= 20)}"></i>
      <strong>${Math.round(h.temp)}°</strong>
      <span>${Math.round(h.pop * 100)}%</span>
    </button>`).join("");
  if (el.hourRail.__sig === html) return; // skip identical re-render (keeps entrance once)
  el.hourRail.__sig = html;
  el.hourRail.innerHTML = html;
  el.hourRail.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openDetail("temp", "hourly"));
}

function renderDaily() {
  const html = state.daily.map((d) => `
    <button class="card day-card" data-open="daily">
      <span>${d.label}</span>
      <i class="${iconClass(d.main, false)}"></i>
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
  el.sunCard.innerHTML = `
    <svg class="sun-svg" viewBox="0 0 300 104" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <path class="arc-bg" d="M24,96 Q150,-10 276,96" pathLength="1"/>
      <path class="arc-fg" d="M24,96 Q150,-10 276,96" pathLength="1" stroke-dasharray="${t.toFixed(3)} 1"/>
      <circle class="sun-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>
    </svg>
    <div class="sun-times">
      <div class="sun-time"><i class="ph-duotone ph-sun-horizon"></i><span class="d-label">Sunrise</span><strong>${fmtClock(sys.sunrise, tz)}</strong></div>
      <div class="sun-time end"><i class="ph-duotone ph-moon-stars"></i><span class="d-label">Sunset</span><strong>${fmtClock(sys.sunset, tz)}</strong></div>
    </div>`;
}

/* Wind compass dial (Apple-style data viz, flat aesthetic) */
function renderWind(current) {
  const w = current.wind || {};
  const deg = w.deg;
  const parts = windParts(w.speed || 0);
  const gust = w.gust != null ? windText(w.gust) : "—";
  const dirTxt = deg != null ? `${Math.round(deg)}° ${direction(deg)}` : "—";
  const rot = deg != null ? (deg + 180) % 360 : 0; // arrow points the way the wind blows
  el.windCard.innerHTML = `
    <div class="wind-stats">
      <div class="wind-row"><span>Wind</span><strong>${windText(w.speed || 0)}</strong></div>
      <div class="wind-row"><span>Gusts</span><strong>${gust}</strong></div>
      <div class="wind-row"><span>Direction</span><strong>${dirTxt}</strong></div>
    </div>
    <div class="wind-compass">${compassSVG(rot, parts.v, parts.u)}</div>`;
}

function compassSVG(rot, value, unit) {
  let ticks = "";
  for (let i = 0; i < 72; i++) {
    const major = i % 9 === 0;
    const a = (i * 5) * Math.PI / 180;
    const r1 = 47, r2 = major ? 38 : 43;
    const x1 = (60 + r1 * Math.sin(a)).toFixed(1), y1 = (60 - r1 * Math.cos(a)).toFixed(1);
    const x2 = (60 + r2 * Math.sin(a)).toFixed(1), y2 = (60 - r2 * Math.cos(a)).toFixed(1);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${major ? 2 : 1}"/>`;
  }
  return `<svg viewBox="0 0 120 120" class="compass-svg" aria-hidden="true">
    <g class="compass-ticks" stroke="var(--ink)" opacity="0.45">${ticks}</g>
    <text x="60" y="15" class="compass-card">N</text>
    <text x="106" y="60" class="compass-card">E</text>
    <text x="60" y="106" class="compass-card">S</text>
    <text x="14" y="60" class="compass-card">W</text>
    <g transform="rotate(${rot} 60 60)"><path class="compass-arrow" d="M60 28 L66 45 L60 40 L54 45 Z"/></g>
    <text x="60" y="59" class="compass-value">${value}</text>
    <text x="60" y="73" class="compass-unit">${unit}</text>
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
    items.push(["humidity", "ph-drop", "Humidity", `${m.humidity}%`, dp != null ? `Dew point ${dp}°` : ""]);
  } else {
    items.push(["humidity", "ph-drop", "Humidity", "—", ""]);
  }

  items.push(precipDetail(current, forecast, tz));
  items.push(["visibility", "ph-eye", "Visibility", visibilityText(current.visibility), visDescriptor(current.visibility)]);
  items.push(["pressure", "ph-gauge", "Pressure", m.pressure != null ? `${m.pressure}` : "—", m.pressure != null ? "hPa" : ""]);
  items.push(["clouds", "ph-cloud", "Cloud cover", clouds.all != null ? `${clouds.all}%` : "—", cloudDescriptor(clouds.all)]);

  el.detailGrid.innerHTML = items.map(([metric, icon, label, value, sub, range]) => `
    <button class="detail" data-metric="${metric}"${range ? ` data-range="${range}"` : ""}>
      <i class="ph-duotone ${icon}"></i>
      <span class="d-label">${label}</span>
      <strong class="d-value">${value}</strong>
      ${sub ? `<span class="d-sub">${sub}</span>` : ""}
      <i class="ph ph-caret-right d-go"></i>
    </button>`).join("");
}

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

/* ---------- Builders ---------- */
function buildHourly(forecast, tz) {
  return (forecast.list || []).slice(0, 12).map((it) => ({
    dt: it.dt,
    label: fmtHour(it.dt, tz),
    hour: new Date((it.dt + tz) * 1000).getUTCHours(),
    temp: it.main.temp,
    pop: it.pop || 0,
    main: it.weather?.[0]?.main || ""
  }));
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
      items: g.items
    };
  });
}

function buildSummary(current, daily) {
  const m = current.main || {};
  const w = current.weather?.[0] || {};
  const feels = Math.round(m.feels_like ?? m.temp ?? 0);
  const desc = w.description || w.main || "current conditions";
  const today = daily[0];
  const range = today ? ` Today ranges from ${Math.round(today.min)}° to ${Math.round(today.max)}°.` : "";
  const pop = today ? Math.round((today.pop || 0) * 100) : 0;
  const rain = pop > 0 ? ` There's a ${pop}% chance of precipitation.` : "";
  const comfort = feels >= 28 ? " It feels hot — find shade and water."
    : feels <= 0 ? " It feels freezing — bundle up."
    : feels <= 10 ? " It feels chilly — bring a layer."
    : " It should feel comfortable.";
  return `It feels like ${feels}° with ${desc}.${range}${rain}${comfort}`;
}

/* ---------- Palette ---------- */
// Within ±45 min of sunrise or sunset → the golden-hour "sunset" look.
function isNearGolden(current) {
  const s = current?.sys, dt = current?.dt;
  if (s?.sunrise == null || s?.sunset == null || dt == null) return false;
  const win = 45 * 60;
  return Math.abs(dt - s.sunrise) <= win || Math.abs(dt - s.sunset) <= win;
}

function paletteKind(current, isNight) {
  const m = String(current?.weather?.[0]?.main || "").toLowerCase();
  const clouds = current?.clouds?.all ?? 0;
  // Active precipitation always wins over time-of-day looks.
  if (m.includes("thunder")) return "storm";
  if (m.includes("snow")) return "snow";
  if (m.includes("rain") || m.includes("drizzle")) return "rain";
  // Golden hour beats both plain night and clear day.
  if (isNearGolden(current)) return "sunset";
  if (isNight) return "night";
  if (m.includes("cloud")) return clouds > 40 ? "cloudy" : "mostlyclear";
  // Clear sky: a few clouds reads as "mostly clear", otherwise full "sunny".
  return clouds > 20 ? "mostlyclear" : "sunny";
}

function applyPalette(kind) {
  const p = PALETTES[kind] || PALETTES.sunny;
  const r = document.documentElement.style;
  r.setProperty("--bg", p.bg);
  r.setProperty("--bg-image", p.bgImage || "none");
  r.setProperty("--ink", p.ink);
  r.setProperty("--surface", p.surface);
  r.setProperty("--on-surface", p.onSurface);
  r.setProperty("--surface-accent", p.accent);
  r.setProperty("--theme", p.surface);
  // The status bar always sits on the dark "conditions bar" colour (--surface)
  // on every theme, so the white system icons stay legible everywhere. On
  // Android the theme-color meta paints the bar; on iOS the .status-fade strip
  // does (behind the always-translucent, white-icon status bar).
  document.querySelector('meta[name="theme-color"]').setAttribute("content", p.surface);
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  state.dark = !!p.dark;
  updateMapTheme();
}

function themeKind() {
  return (state.theme && state.theme !== "auto" && PALETTES[state.theme]) ? state.theme : (state.autoKind || "sunny");
}

function setTheme(theme) {
  state.theme = (theme === "auto" || PALETTES[theme]) ? theme : "auto";
  saveState();
  el.themeGrid.querySelectorAll("[data-theme]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.theme === state.theme));
  applyPalette(themeKind());
}

function iconClass(main, isNight) {
  const m = String(main || "").toLowerCase();
  if (m.includes("thunder")) return "ph-duotone ph-cloud-lightning";
  if (m.includes("drizzle") || m.includes("rain")) return "ph-duotone ph-cloud-rain";
  if (m.includes("snow")) return "ph-duotone ph-cloud-snow";
  if (m.includes("mist") || m.includes("fog") || m.includes("haze") || m.includes("smoke")) return "ph-duotone ph-cloud-fog";
  if (m.includes("cloud")) return "ph-duotone ph-cloud";
  return isNight ? "ph-duotone ph-moon-stars" : "ph-duotone ph-sun";
}

/* ---------- Detail sheet (per-metric, Apple-style) ---------- */
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
    desc: (c) => { const w = c.wind || {}; const g = w.gust != null ? `, gusting ${windText(w.gust)}` : ""; return `${windText(w.speed || 0)} from the ${w.deg != null ? direction(w.deg) : "—"}${g}.`; }
  },
  pressure: {
    label: "Pressure", unit: "hPa", decimals: 0,
    get: (it) => it.main.pressure,
    desc: (c) => { const p = c.main?.pressure; return p != null ? `${p} hPa — ${p >= 1013 ? "above" : "below"} the 1013 hPa average.` : "Sea-level pressure ahead."; }
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

function openDetail(metric, range) {
  if (!METRICS[metric]) metric = "temp";
  state.detail = { metric, range: (range && METRICS[metric].daily) ? range : "hourly" };
  state.sheetOpen = true;
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  el.sheet.scrollTop = 0;
  renderDetailSheet();
}

function closeSheet() {
  state.sheetOpen = false;
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

function openDay(index) {
  if (!state.daily[index]) return;
  state.detail = { metric: "day", dayIndex: index, range: "hourly" };
  state.sheetOpen = true;
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  el.sheet.scrollTop = 0;
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
      <i class="row-icon ${iconClass(it.weather?.[0]?.main, h < 6 || h >= 20)}"></i>
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
    ["ph-thermometer-simple", "Feels like", fMin === fMax ? `${fMax}°` : `${fMin}–${fMax}°`],
    ["ph-drop", "Humidity", humAvg != null ? `${humAvg}%` : "—"],
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
  return (state.data?.forecast?.list || []).slice(0, 16)
    .map((it) => ({ label: fmtHour(it.dt, tz), hi: m.get(it) }))
    .filter((r) => Number.isFinite(r.hi));
}

function drawDetailChart() {
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
        <i class="row-icon ${iconClass(d.main, false)}"></i>
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
  el.sheetList.innerHTML = (state.data?.forecast?.list || []).slice(0, 16).map((it) => `
    <div class="row">
      <span class="row-label">${fmtHour(it.dt, tz)}</span>
      <i class="row-icon ${iconClass(it.weather?.[0]?.main, false)}"></i>
      <span class="row-temp">${valTxt(m.get(it))}</span>
    </div>`).join("");
}

function hexA(hex, a) {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

  // gridlines
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
    // area fill under the line
    ctx.beginPath(); curve("hi");
    ctx.lineTo(X(rows.length - 1), padTop + h); ctx.lineTo(X(0), padTop + h); ctx.closePath();
    const g = ctx.createLinearGradient(0, padTop, 0, padTop + h);
    g.addColorStop(0, hexA(ink, 0.26)); g.addColorStop(1, hexA(ink, 0));
    ctx.fillStyle = g; ctx.fill();
  } else {
    // band between high and low
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

  // "now" marker (only when the series actually starts at the current time)
  if (showNow) {
    ctx.setLineDash([3, 4]); ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(0), padTop); ctx.lineTo(X(0), padTop + h); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  // points + labels
  ctx.fillStyle = ink; ctx.font = "700 12px Inter, system-ui"; ctx.textAlign = "center";
  const step = rows.length > 8 ? 2 : 1;
  rows.forEach((r, i) => {
    ctx.beginPath(); ctx.arc(X(i), Y(r.hi), 4, 0, Math.PI * 2); ctx.fill();
    if (dual) { ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(X(i), Y(r.lo), 3.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    if (i % step === 0) {
      ctx.fillText(lab(r.hi), X(i), Y(r.hi) - 12);
      if (dual) { ctx.globalAlpha = 0.6; ctx.fillText(lab(r.lo), X(i), Y(r.lo) + 18); ctx.globalAlpha = 1; }
      ctx.globalAlpha = 0.55; ctx.fillText(i === 0 && showNow ? "Now" : r.label, X(i), rect.height - 10); ctx.globalAlpha = 1;
    }
  });
}

/* ---------- Drawer ---------- */
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

/* ---------- Radar / map ---------- */
function haveLeaflet() { return typeof window.L !== "undefined"; }
// Radar maps always use the dark basemap so precipitation colours pop.
function radarTileUrl() {
  return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
}
function owmTileUrl(layer) {
  return `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${API_KEY}`;
}
function rvUrl(f) {
  return `${radar.host}${f.path}/${RV_SIZE}/{z}/{x}/{y}/${RV_COLOR}/${RV_OPTS}.png`;
}

// Apple-style location pin: a rounded pill with the current temperature and a
// condition glyph, on a short stem pointing at the spot.
function curIsNight() {
  const c = state.data?.current, s = c?.sys;
  if (!c || !s?.sunrise || !s?.sunset) return false;
  return c.dt < s.sunrise || c.dt >= s.sunset;
}
function locationPinIcon() {
  const t = state.data?.current?.main?.temp;
  const temp = (t == null) ? "" : `${Math.round(t)}°`;
  const main = state.data?.current?.weather?.[0]?.main || "";
  const glyph = iconClass(main, curIsNight()).replace("ph-duotone", "ph");
  return L.divIcon({
    className: "map-pin-wrap",
    html: `<span class="map-pin"><strong class="map-pin-temp">${temp}</strong><i class="${glyph}" aria-hidden="true"></i></span>`,
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
  if (!haveLeaflet() || radar.preview) return;
  try {
    const c = state.center;
    radar.preview = L.map(el.radarPreviewMap, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false
    }).setView([c.lat, c.lon], 6);
    radar.previewBase = L.tileLayer(radarTileUrl(), { subdomains: "abcd", updateWhenZooming: false, keepBuffer: 1 }).addTo(radar.preview);
    setPinMarker(radar.preview, "previewMarker");
    requestAnimationFrame(() => radar.preview && radar.preview.invalidateSize());
    // Overlay the latest radar frame: ECCC for Canadian locations, RainViewer elsewhere.
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
        // Match the full map: shift ECCC's green palette toward Dark Sky blues.
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
    setTimeout(() => radar.preview && radar.preview.invalidateSize(), 400);
  } catch {}
}

function initRadarMap() {
  if (!haveLeaflet()) { el.radarMap.innerHTML = '<div class="map-fallback">The map needs an internet connection.</div>'; el.radarTimeline.style.display = "none"; return; }
  const c = state.center;
  if (radar.map) { radar.map.setView([c.lat, c.lon]); return; }
  try {
    radar.map = L.map(el.radarMap, { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 3, maxZoom: 12 }).setView([c.lat, c.lon], 7);
    radar.base = L.tileLayer(radarTileUrl(), {
      subdomains: "abcd", maxZoom: 19, updateWhenZooming: false, keepBuffer: 1, attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(radar.map);
    setPinMarker(radar.map, "marker");
  } catch {
    el.radarMap.innerHTML = '<div class="map-fallback">The map could not be loaded.</div>';
    el.radarTimeline.style.display = "none";
  }
}

function openRadar() {
  state.radarOpen = true;
  el.radarSheet.classList.add("is-open");
  el.radarSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  initRadarMap();
  applyMode(radar.mode);
  setTimeout(() => radar.map && radar.map.invalidateSize(), 320);
}
function closeRadar() {
  if (!state.radarOpen) return;
  state.radarOpen = false;
  stopRadarPlay();
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
  const isRadar = mode === "radar";
  el.radarTimeline.style.display = isRadar ? "" : "none";
  if (el.radarLegend) el.radarLegend.style.display = isRadar ? "" : "none";
  if (isRadar) {
    loadRadar();
  } else {
    radar.owm = L.tileLayer(owmTileUrl(mode), { opacity: 0.72, maxZoom: 12, maxNativeZoom: 9, updateWhenZooming: false, keepBuffer: 1, attribution: "&copy; OpenWeather" }).addTo(radar.map);
  }
}

function removeRadarLayers() {
  radar.layers.forEach((l) => l && radar.map.removeLayer(l));
  radar.layers = [];
}

function inCanada(lat, lon) {
  return lat >= 41 && lat <= 84 && lon >= -141 && lon <= -52;
}

// RainViewer frames (global fallback): { t, path, kind }
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

// Environment Canada frames (primary over Canada): read the WMS time
// dimension from GetCapabilities and build a list of observed timestamps.
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
  radar.idx = frames.length - 1; // latest observed
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

// Two crossfaded overlay layers. Source picked per location: Environment
// Canada when the map is over Canada, RainViewer everywhere else (and as a
// fallback if ECCC can't be reached).
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
    if (!radar.layers.length) {
      radar.layers = [makeRadarLayer(), makeRadarLayer()];
      radar.front = 0;
    }
    showFrame(radar.idx, true);   // immediate first paint
    startRadarPlay();
    updateRadarNote();
  } catch {
    el.radarTimeline.style.display = "none";
  }
}

function makeRadarLayer() {
  let layer;
  if (radar.source === "eccc") {
    layer = L.tileLayer.wms(ECCC_WMS, {
      layers: ecccLayer(), format: "image/png", transparent: true, version: "1.3.0",
      crs: L.CRS.EPSG3857,
      opacity: 0, maxZoom: 12, updateWhenZooming: false, keepBuffer: 0,
      attribution: "&copy; Environment and Climate Change Canada (ECCC GeoMet)"
    }).addTo(radar.map);
  } else {
    layer = L.tileLayer(rvUrl(radar.frames[radar.idx]), {
      opacity: 0, maxZoom: 12, maxNativeZoom: 10, tileSize: RV_SIZE,
      updateWhenZooming: false, keepBuffer: 0, attribution: "&copy; RainViewer"
    }).addTo(radar.map);
  }
  const c = layer.getContainer && layer.getContainer();
  if (c) {
    c.style.transition = "opacity 550ms ease-in-out";
    if (radar.source === "eccc") {
      // Shift ECCC's green/yellow palette toward the blue-purple-red range
      // so it reads like the Dark Sky heat-map colour scale.
      c.style.filter = "hue-rotate(140deg) saturate(2) brightness(1.1)";
    }
  }
  return layer;
}

function applyFrame(layer, f) {
  if (radar.source === "eccc") layer.setParams({ time: f.iso });
  else layer.setUrl(rvUrl(f));
}

function showFrame(i, immediate, onShown) {
  if (!radar.frames.length || !radar.layers.length) return;
  radar.idx = (i + radar.frames.length) % radar.frames.length;
  const f = radar.frames[radar.idx];
  el.radarScrub.value = String(radar.idx);
  el.radarTime.textContent = relTime(f);
  const frontLayer = radar.layers[radar.front];
  const backLayer = radar.layers[1 - radar.front];
  if (immediate || !backLayer) {
    applyFrame(frontLayer, f);
    frontLayer.setOpacity(0.9);
    if (backLayer) backLayer.setOpacity(0);
    // Pre-warm next frame
    const ni = (radar.idx + 1) % radar.frames.length;
    if (backLayer && radar.frames[ni]) applyFrame(backLayer, radar.frames[ni]);
    if (onShown) onShown();
    return;
  }
  const gen = ++radar.gen;
  let done = false;
  const reveal = () => {
    if (done || gen !== radar.gen) return;
    done = true;
    backLayer.setOpacity(0.9);
    frontLayer.setOpacity(0);
    radar.front = 1 - radar.front;
    // Pre-warm next frame into now-idle layer so tiles load during the hold gap.
    const nextIdx = (radar.idx + 1) % radar.frames.length;
    if (radar.frames[nextIdx]) applyFrame(frontLayer, radar.frames[nextIdx]);
    if (onShown) onShown();
  };
  applyFrame(backLayer, f);
  if (backLayer.once) backLayer.once("load", reveal);
  setTimeout(reveal, 400); // fallback — tiles are pre-warmed so 400ms is ample
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

// Playback chains each step to the previous reveal, so frames never outpace
// their tiles loading (keeps the animation smooth instead of janky).
function startRadarPlay() {
  stopRadarPlay();
  if (!radar.frames.length) return;
  radar.playing = true;
  el.radarPlay.innerHTML = '<i class="ph ph-pause"></i>';
  const advance = () => {
    if (!radar.playing) return;
    const atEnd = radar.idx === radar.frames.length - 1;
    showFrame(radar.idx + 1, false, () => { if (radar.playing) radar.timer = setTimeout(advance, atEnd ? 1200 : 300); });
  };
  radar.timer = setTimeout(advance, 250);
}
function stopRadarPlay() {
  radar.playing = false;
  if (radar.timer) { clearTimeout(radar.timer); radar.timer = null; }
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
}

function updateMapTheme() {
  if (!haveLeaflet()) return;
  // Radar maps stay on the dark basemap regardless of app theme so the
  // precipitation colours always pop; just refresh the location pins (temp +
  // condition glyph) so they track the latest data.
  if (radar.marker) radar.marker.setIcon(locationPinIcon());
  if (radar.previewMarker) radar.previewMarker.setIcon(locationPinIcon());
}

/* ---------- Location ---------- */
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
    () => setStatus("Location permission denied — staying on Home."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
  );
}

function markLoc(which) {
  el.useHome.classList.toggle("is-active", which === "home");
  el.useLocation.classList.toggle("is-active", which === "loc");
}

/* ---------- Chrome ---------- */
function setBusy(b) {
  el.temp.classList.toggle("is-loading", b && !state.data);
  el.ptr.classList.toggle("is-spinning", b);
  if (b) showPTR(64); else hidePTR();
}

function setStatus(t) { el.status.textContent = t; }

/* ---------- Formatting ---------- */
function windText(speed) {
  return state.units === "imperial"
    ? `${Math.round(speed)} mph`
    : `${Math.round(speed * 3.6)} km/h`;
}
function visibilityText(v) {
  if (v == null) return "—";
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

/* ---------- Persistence ---------- */
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ units: state.units, loc: state.loc, theme: state.theme })); } catch {}
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (s) {
      state.units = s.units || "metric";
      state.loc = s.loc || { ...HOME };
      // Drop themes saved under the old palette names (clear/clouds/thunder…).
      state.theme = (s.theme === "auto" || PALETTES[s.theme]) ? s.theme : "auto";
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

/* ---------- Gestures ---------- */
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
  let mode = null;       // "ptr" | "edge" | "drawer" | "sheet"
  let sx = 0, sy = 0, dist = 0;

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
      if (x > DISMISS) closeSheet(); else { el.sheet.classList.add("is-open"); el.sheet.style.transform = ""; }
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

/* ---------- Service worker ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
