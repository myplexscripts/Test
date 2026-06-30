/* =====================================================================
   Home Weather — application logic
   Data: OpenWeather 2.5 (current + 5 day / 3 hour forecast)
   ===================================================================== */

"use strict";

/* ---------- Config ---------- */
const API_KEY = "37c88f3496272531c686b0686ecfe1dd"; // personal testing key
const API_BASE = "https://api.openweathermap.org/data/2.5";
// Air quality + UV index — free, keyless, CORS-friendly (no One Call 3.0 needed).
const AIR_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
// True hourly weather (every hour on the hour) — free, keyless. OpenWeather's
// free /forecast is only 3-hourly, so the hourly rail/detail come from here.
const WX_BASE = "https://api.open-meteo.com/v1/forecast";
const HOME = { lat: 42.9849, lon: -81.2453, label: "London, Ontario" };
const STATE_KEY = "hw_state_v1";
const CACHE_KEY = "hw_cache_v1";
const MOON_RAD = Math.PI / 180, ECL = MOON_RAD * 23.4397; // moon-math constants

/* Flat per-theme palettes. The background is a single solid colour — no
   gradients. Themes are chosen by the user only (no weather-based switching). */
const PALETTES = {
  sunny:       { bg: "#ffe142", ink: "#0a0a0a", surface: "#0a0a0a", onSurface: "#fffdf8", accent: "#ffd83d", dark: false },
  mostlyclear: { bg: "#42c6ff", ink: "#06222f", surface: "#06222f", onSurface: "#eafaff", accent: "#5fd0ff", dark: false },
  cloudy:      { bg: "#b8d7ff", ink: "#0b1f3a", surface: "#0b1f3a", onSurface: "#eef5ff", accent: "#7fb4ff", dark: false },
  rain:        { bg: "#4a90e2", ink: "#05203b", surface: "#05203b", onSurface: "#eaf2ff", accent: "#8fc8ff", dark: false },
  storm:       { bg: "#243b6b", ink: "#eef2ff", surface: "#0d1733", onSurface: "#f4f6ff", accent: "#8aa6ee", dark: true  },
  snow:        { bg: "#ffffff", ink: "#0b1626", surface: "#0b1626", onSurface: "#eef5ff", accent: "#79b6ff", dark: false },
  night:       { bg: "#0b132b", ink: "#e9ecff", surface: "#0a1024", onSurface: "#f4f6ff", accent: "#7e9be0", dark: true  },
  sunset:      { bg: "#ff64d4", ink: "#2b0a24", surface: "#2b0a24", onSurface: "#ffe9fa", accent: "#ff8fe0", dark: false },
  // Monochrome dark theme — the inverse of snow: black page, white panels.
  // statusBar stays black so the white iOS status-bar icons remain legible.
  newmoon:     { bg: "#000000", ink: "#ffffff", surface: "#ffffff", onSurface: "#0a0a0a", accent: "#0a0a0a", dark: true, statusBar: "#000000" }
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
  sunCard: $("sunCard"), moonCard: $("moonCard"), detailGrid: $("detailGrid"), windCard: $("windCard"),
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
  theme: "sunny",
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
  applyPalette(themeKind()); // user-chosen theme, applied immediately on load

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
  el.sheetBack.onclick = sheetBack;
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

  // Tap / drag across the detail chart to read off a point.
  let scrubbing = false;
  el.graph.addEventListener("pointerdown", (e) => { scrubbing = true; showChartPoint(e.clientX); });
  el.graph.addEventListener("pointermove", (e) => { if (scrubbing) showChartPoint(e.clientX); });
  const endScrub = () => { scrubbing = false; };
  el.graph.addEventListener("pointerup", endScrub);
  el.graph.addEventListener("pointercancel", endScrub);
  el.graph.addEventListener("pointerleave", endScrub);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSheet(); closeDrawer(); closeRadar(); }
  });

  window.addEventListener("resize", () => {
    if (!state.sheetOpen) return;
    if (state.detail.metric === "uv") drawUvChart(state.data?.air?.hourly);
    else if (state.detail.metric !== "aqi") drawDetailChart();
  });

  initGestures();
}

/* ---------- Data ---------- */
async function refresh(force) {
  setBusy(true);
  if (force) setStatus("Refreshing…");
  try {
    const q = `lat=${state.loc.lat}&lon=${state.loc.lon}&units=${state.units}&appid=${API_KEY}`;
    const [current, forecast, air, hourly] = await Promise.all([
      fetchJSON(`${API_BASE}/weather?${q}`),
      fetchJSON(`${API_BASE}/forecast?${q}`),
      fetchAir(state.loc.lat, state.loc.lon).catch(() => null), // never blocks core weather
      fetchHourlyWx(state.loc.lat, state.loc.lon, state.units).catch(() => null)
    ]);
    const data = { current, forecast, air, hourly };
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

// Open-Meteo air quality + UV (free, no key). Returns the `current` block with
// today's `hourly` UV/AQI arrays attached (for the UV day-curve graph).
async function fetchAir(lat, lon) {
  const cur = "current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,uv_index";
  const hourly = "hourly=uv_index,us_aqi&forecast_days=1";
  const json = await fetchJSON(`${AIR_BASE}?latitude=${lat}&longitude=${lon}&${cur}&${hourly}&timezone=auto`);
  const out = json.current || {};
  out.hourly = json.hourly || null;
  return out;
}

// WMO weather code -> an OpenWeather-style condition string (for iconClass).
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

// True hourly weather from Open-Meteo, normalised into the same item shape as
// OpenWeather's forecast list so the rail / detail / METRICS code works as-is.
// Units are matched to OpenWeather metric (wind in m/s) / imperial (mph).
async function fetchHourlyWx(lat, lon, units) {
  const tu = units === "imperial" ? "fahrenheit" : "celsius";
  const wu = units === "imperial" ? "mph" : "ms";
  const fields = "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,cloud_cover,visibility";
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
    clouds: { all: h.cloud_cover?.[i] },
    visibility: h.visibility?.[i]
  }));
}

// Pollutant reference info: friendly name + plain-English explanation + a rough
// "concern" reference (µg/m³) used only to pick the dominant pollutant.
const POLLUTANTS = {
  pm2_5:            { name: "PM2.5", desc: "Tiny inhalable particles from smoke, dust and combustion.", ref: 25 },
  pm10:             { name: "PM10", desc: "Coarser particles like dust, pollen and mould.", ref: 50 },
  ozone:            { name: "Ozone (O₃)", desc: "Forms in sunlight from traffic and industry; irritates the lungs.", ref: 100 },
  nitrogen_dioxide: { name: "Nitrogen dioxide (NO₂)", desc: "Mostly from vehicle exhaust and burning fuel.", ref: 40 },
  sulphur_dioxide:  { name: "Sulphur dioxide (SO₂)", desc: "From burning fossil fuels; can irritate airways.", ref: 40 },
  carbon_monoxide:  { name: "Carbon monoxide (CO)", desc: "Colourless gas from incomplete combustion, e.g. engines.", ref: 4000 }
};

// The pollutant currently highest relative to its reference level.
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

// US AQI -> band label + short guidance.
function aqiBand(aqi) {
  if (aqi == null) return { label: "—", advice: "" };
  if (aqi <= 50)  return { label: "Good", advice: "Air quality is satisfactory." };
  if (aqi <= 100) return { label: "Moderate", advice: "Acceptable; unusually sensitive people should take care." };
  if (aqi <= 150) return { label: "Unhealthy for sensitive groups", advice: "Sensitive groups may feel effects." };
  if (aqi <= 200) return { label: "Unhealthy", advice: "Everyone may begin to feel effects." };
  if (aqi <= 300) return { label: "Very unhealthy", advice: "Health alert — limit time outdoors." };
  return { label: "Hazardous", advice: "Avoid outdoor activity." };
}

// UV index -> band label + short guidance.
function uvBand(uv) {
  if (uv == null) return { label: "—", advice: "" };
  const u = Math.round(uv);
  if (u <= 2)  return { label: "Low", advice: "No protection needed." };
  if (u <= 5)  return { label: "Moderate", advice: "Wear sunglasses; use SPF 30+." };
  if (u <= 7)  return { label: "High", advice: "Seek shade midday; cover up." };
  if (u <= 10) return { label: "Very high", advice: "Extra protection — burns happen fast." };
  return { label: "Extreme", advice: "Avoid the sun midday." };
}

// Moon phase from a date: fraction 0..1 of the synodic cycle + name + illum.
function moonPhase(date = new Date()) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14) / 1000; // known new moon (s)
  const now = date.getTime() / 1000;
  const age = (((now - ref) / 86400) % synodic + synodic) % synodic;
  const frac = age / synodic; // 0 = new, .5 = full
  const illum = Math.round((1 - Math.cos(frac * 2 * Math.PI)) / 2 * 100);
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  const idx = Math.floor(((frac * 8) + 0.5)) % 8;
  return { name: names[idx], illum, frac };
}

// Simple monochrome moon glyph: a faint full-disk outline with the illuminated
// fraction filled in --ink (fuller phase = more solid). frac: 0 new → .5 full.
function moonSVG(frac) {
  const r = 23, c = 26;                  // viewBox 52x52
  const theta = frac * 2 * Math.PI;
  const rx = Math.abs(Math.cos(theta)) * r;
  const waxing = frac < 0.5;             // lit limb on the right when waxing
  const gibbous = frac > 0.25 && frac < 0.75;
  const limb = waxing ? 1 : 0;           // sweep for the bright outer limb
  const term = gibbous ? limb : 1 - limb; // terminator bulges same way if gibbous
  const top = `${c} ${c - r}`, bot = `${c} ${c + r}`;
  const lit = `M ${top} A ${r} ${r} 0 0 ${limb} ${bot} A ${rx} ${r} 0 0 ${term} ${top} Z`;
  // Faint full disk (the unlit part) + solid lit fill on top. No stroke, so the
  // edges stay crisp — a stroked outline left a soft halo around the disk.
  return `<svg viewBox="0 0 52 52" class="moon-svg" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="var(--ink)" opacity="0.16"/>
    <path d="${lit}" fill="var(--ink)"/>
  </svg>`;
}

/* ---------- Render ---------- */
function render(data) {
  const { current, forecast } = data;
  const tz = current.timezone ?? forecast.city?.timezone ?? 0;
  const w = current.weather?.[0] || {};
  const m = current.main || {};
  const sys = current.sys || {};
  const isNight = sys.sunrise && sys.sunset ? (current.dt < sys.sunrise || current.dt >= sys.sunset) : false;

  state.hourly = hourlyPoints();
  state.daily = buildDaily(forecast, tz);
  // Set these before the render* calls below — renderMoon/renderSun read them.
  state.center = { lat: current.coord?.lat ?? state.loc.lat, lon: current.coord?.lon ?? state.loc.lon };
  state.tz = tz;
  state.placeName = current.name || state.loc.label;

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
  renderMoon(current);
  renderDetails(current, forecast);

  syncMaps();

  if (state.sheetOpen) renderDetailSheet();
}

function renderHourly() {
  const tz = state.tz || 0;
  const html = state.hourly.map((it) => {
    const hh = new Date((it.dt + tz) * 1000).getUTCHours();
    return `
    <button class="card hour-card" data-open="hourly">
      <span>${fmtHour(it.dt, tz)}</span>
      <i class="${iconClass(it.weather?.[0]?.main, hh < 6 || hh >= 20)}"></i>
      <strong>${Math.round(it.main.temp)}°</strong>
      <span>${Math.round((it.pop || 0) * 100)}%</span>
    </button>`;
  }).join("");
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

/* ---------- Moon ---------- */
// Moon altitude (radians) at a unix time + location — compact SunCalc port.
function moonToDays(unix) { return unix / 86400 - 10957.5; } // days since J2000
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
  return h + 0.0002967 / Math.tan(hr + 0.00312536 / (hr + 0.08901179)); // refraction
}
// Moonrise/moonset (unix UTC) for the local day starting at baseUtc.
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
  // UTC instant of the location's local midnight today
  const nowUnix = Math.floor(Date.now() / 1000);
  const base = Math.floor((nowUnix + tz) / 86400) * 86400 - tz;
  const mt = Number.isFinite(c.lat) ? moonTimes(base, c.lat, c.lon) : {};
  // Days until the next full moon (frac 0=new, .5=full).
  const synodic = 29.530588853;
  let d = (((0.5 - moon.frac) % 1) + 1) % 1, days = d * synodic;
  if (days < 0.5) days += synodic; // basically full now → next one is a cycle away
  days = Math.round(days);
  const rows = [
    ["Illumination", `${moon.illum}%`],
    ["Moonrise", mt.rise != null ? fmtClock(mt.rise, tz) : "—"],
    ["Moonset", mt.set != null ? fmtClock(mt.set, tz) : "—"],
    ["Next full moon", `${days} ${days === 1 ? "day" : "days"}`]
  ];
  el.moonCard.innerHTML = `
    <div class="moon-art">${moonSVG(moon.frac)}</div>
    <div class="moon-info">
      <div class="moon-name">${moon.name}</div>
      <div class="moon-stats">${rows.map(([k, v]) => `<div class="moon-stat"><span>${k}</span><strong>${v}</strong></div>`).join("")}</div>
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

  const air = state.data?.air;
  if (air && air.us_aqi != null) {
    const b = aqiBand(air.us_aqi);
    items.push(["aqi", "ph-wind", "Air quality", `${Math.round(air.us_aqi)}`, b.label]);
  }
  if (air && air.uv_index != null) {
    const u = uvBand(air.uv_index);
    items.push(["uv", "ph-sun", "UV index", `${Math.round(air.uv_index)}`, u.label]);
  }

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
// The next 24 hours, on the hour, as OpenWeather-shaped items. Uses Open-Meteo
// hourly when available; falls back to OWM's 3-hourly list (one day ≈ 8 points).
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

/* ---------- Palette (user-chosen only) ---------- */
function applyPalette(kind) {
  const p = PALETTES[kind] || PALETTES.sunny;
  const r = document.documentElement.style;
  r.setProperty("--bg", p.bg);
  r.setProperty("--ink", p.ink);
  r.setProperty("--surface", p.surface);
  r.setProperty("--on-surface", p.onSurface);
  r.setProperty("--surface-accent", p.accent);
  // The status-bar strip must stay dark so the white system icons stay legible
  // (the iOS status bar is always white). It defaults to --surface, but a theme
  // with a light surface (e.g. New Moon) can override it via statusBar.
  const sb = p.statusBar || p.surface;
  r.setProperty("--statusbar", sb);
  r.setProperty("--theme", sb);
  // On Android the theme-color meta paints the bar; on iOS the .status-fade
  // strip does (behind the always-translucent, white-icon status bar).
  document.querySelector('meta[name="theme-color"]').setAttribute("content", sb);
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  state.dark = !!p.dark;
  updateMapTheme();
}

function themeKind() {
  return PALETTES[state.theme] ? state.theme : "sunny";
}

function setTheme(theme) {
  state.theme = PALETTES[theme] ? theme : "sunny";
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

// Shared sheet-open UI (classes / scroll lock).
function openSheetUI() {
  state.sheetOpen = true;
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  el.sheet.scrollTop = 0;
}

function openDetail(metric, range) {
  const isInfo = metric === "aqi" || metric === "uv";
  if (!METRICS[metric] && !isInfo) metric = "temp";
  const view = { metric, range: (range && METRICS[metric]?.daily) ? range : "hourly" };
  state.nav = [view];          // fresh entry from the home screen
  state.detail = view;
  openSheetUI();
  renderDetailSheet();
}

// Back: pop one level off the sheet's nav stack; only close to home at the root.
function sheetBack() {
  if (state.nav && state.nav.length > 1) {
    state.nav.pop();
    state.detail = state.nav[state.nav.length - 1];
    el.sheet.classList.add("is-open");
    el.sheet.style.transform = ""; // in case we got here from a swipe
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
  if (state.detail.metric === "aqi" || state.detail.metric === "uv") { renderInfoSheet(state.detail.metric); return; }
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

// Plain-language detail sheets for Air Quality and UV — written so a non-expert
// understands what each number means (Apple-Weather style).
function renderInfoSheet(kind) {
  const air = state.data?.air || {};
  const gc = el.graph.closest(".graph-card");
  el.dayStats.style.display = "none";
  el.tabSeg.style.display = "none";
  if (kind === "aqi") { if (gc) gc.style.display = "none"; chartGeom = null; chartRedraw = null; renderAqiSheet(air); }
  else { if (gc) gc.style.display = ""; renderUvSheet(air); }
}

function section(title, body) {
  return `<div class="info-section"><h3 class="info-head">${title}</h3><div class="info-card">${body}</div></div>`;
}

// Straight position bar in the sunrise/sunset style: a faint full track, a
// solid --ink fill up to the value, and a dot. No gradient, no colour.
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
  el.sheetNote.textContent = `The air quality index is ${aqi} — ${b.label.toLowerCase()}.`;

  // Position-on-scale bar (0–300+), sunrise/sunset style.
  const scale = scaleBar((aqi / 300) * 100, ["0", "Good", "Unhealthy", "300+"]);

  // Primary pollutant, explained in plain English.
  const pk = primaryPollutant(air);
  const primary = pk
    ? section(`Main pollutant · ${POLLUTANTS[pk].name}`, `<p class="info-text">${POLLUTANTS[pk].desc}</p>`)
    : "";

  // Full breakdown — each pollutant with what it actually is.
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

  // Grayscale severity ramp on the legend dots (no hue) — lighter = lower.
  const dotOp = { "Low": 0.25, "Moderate": 0.45, "High": 0.62, "Very high": 0.8, "Extreme": 1 };
  const scaleRows = [["Low", "0–2"], ["Moderate", "3–5"], ["High", "6–7"], ["Very high", "8–10"], ["Extreme", "11+"]]
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

// Today's hourly UV values (or [] if missing).
function todayUv(hourly) {
  if (!hourly || !hourly.time || !hourly.uv_index) return [];
  return hourly.time.map((t, i) => ({ t, uv: hourly.uv_index[i] })).filter((p) => Number.isFinite(p.uv));
}

// Apple-style "now" sentence for the UV page.
function uvSummary(air, hourly) {
  const cur = Math.round(air.uv_index);
  const pts = todayUv(hourly);
  if (!pts.length) return `The UV index is ${cur} right now — ${uvBand(air.uv_index).label.toLowerCase()}.`;
  const hours = pts.map((p) => Number(p.t.slice(11, 13)));
  const modIdx = pts.map((p, i) => (p.uv >= 3 ? i : -1)).filter((i) => i >= 0);
  if (!modIdx.length) return `The UV index stays low all day — no protection needed.`;
  const from = hours[modIdx[0]], to = hours[modIdx[modIdx.length - 1]];
  const fmt = (h) => `${(h % 12) || 12}${h < 12 ? "am" : "pm"}`;
  return `Currently ${uvBand(air.uv_index).label.toLowerCase()}. Moderate or higher from ${fmt(from)} to ${fmt(to)}.`;
}

// UV day-curve graph: hourly UV across today, monochrome ink area + line with
// band gridlines/labels and a "now" marker (same style as the other graphs).
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

  // band gridlines + left labels (Low / Moderate / High / Very high)
  ctx.font = "700 10px Inter, system-ui"; ctx.textAlign = "left";
  [["Low", 2], ["Moderate", 5], ["High", 7], ["Very high", 10]].forEach(([label, v]) => {
    const gy = Y(v);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.1; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(rect.width - padX, gy); ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.fillStyle = ink; ctx.fillText(label, padX, gy - 4); ctx.globalAlpha = 1;
  });

  // monochrome ink area + line (matches the other graphs; height vs. the
  // band gridlines conveys the level — no colour needed)
  const grad = ctx.createLinearGradient(0, padTop, 0, padTop + h);
  grad.addColorStop(0, hexA(ink, 0.26)); grad.addColorStop(1, hexA(ink, 0));

  const curve = () => {
    pts.forEach((p, i) => {
      const px = X(i), py = Y(p.uv);
      if (i === 0) ctx.moveTo(px, py);
      else { const cx = (X(i - 1) + px) / 2; ctx.bezierCurveTo(cx, Y(pts[i - 1].uv), cx, py, px, py); }
    });
  };

  // area fill
  ctx.beginPath(); curve();
  ctx.lineTo(X(pts.length - 1), padTop + h); ctx.lineTo(X(0), padTop + h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // line
  ctx.beginPath(); curve(); ctx.strokeStyle = ink; ctx.lineWidth = 3.5; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();

  // "now" marker at the current local hour
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

  // time axis labels
  ctx.fillStyle = ink; ctx.globalAlpha = 0.55; ctx.font = "700 11px Inter, system-ui"; ctx.textAlign = "center";
  [6, 12, 18].forEach((hh) => {
    const i = pts.findIndex((p) => Number(p.t.slice(11, 13)) === hh);
    if (i >= 0) ctx.fillText(`${(hh % 12) || 12}${hh < 12 ? "am" : "pm"}`, X(i), rect.height - 8);
  });
  ctx.globalAlpha = 1;

  // geometry + redraw for tap-to-read (so tapping the UV graph reads UV, not
  // a stale chart left over from another metric)
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
  // Opened from within the sheet (a daily list) → push so Back returns there;
  // opened straight from the home day rail → it's the root.
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
  return (state.hourly || [])
    .map((it) => ({ label: fmtHour(it.dt, tz), hi: m.get(it) }))
    .filter((r) => Number.isFinite(r.hi));
}

function drawDetailChart() {
  if (state.detail.metric === "aqi" || state.detail.metric === "uv") return; // info sheets draw their own
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
  el.sheetList.innerHTML = (state.hourly || []).map((it) => {
    const hh = new Date((it.dt + tz) * 1000).getUTCHours();
    return `
    <div class="row">
      <span class="row-label">${fmtHour(it.dt, tz)}</span>
      <i class="row-icon ${iconClass(it.weather?.[0]?.main, hh < 6 || hh >= 20)}"></i>
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

// For tap-to-scrub: the current chart's geometry, plus a fn that re-renders it
// cleanly (each chart type — drawChart, drawUvChart — sets its own).
let chartGeom = null, chartRedraw = null;

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

  // dots + labels only at evenly-spaced points (≤ ~8) so dense series breathe
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

  // remember geometry + how to redraw so a tap can highlight the nearest point
  chartGeom = {
    xs: rows.map((_, i) => X(i)), ys: rows.map((r) => Y(r.hi)),
    rows, padTop, h, rect, dual, fmt: lab
  };
  chartRedraw = () => drawChart(rows, m, dual, showNow);
}

// Highlight the data point nearest a client X — a marker + a value/time bubble.
function showChartPoint(clientX) {
  if (!chartGeom || !chartRedraw) return;
  const rect = el.graph.getBoundingClientRect();
  const x = clientX - rect.left;
  const xs = chartGeom.xs;
  let idx = 0, best = Infinity;
  for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - x); if (d < best) { best = d; idx = i; } }
  chartRedraw(); // clean redraw of whatever chart is current
  const g = chartGeom, r = g.rows[idx];
  if (!r) return;
  const ctx = el.graph.getContext("2d");
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a";
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff";
  const px = g.xs[idx], py = g.ys[idx];
  ctx.save();
  // vertical guide
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(px, g.padTop); ctx.lineTo(px, g.padTop + g.h); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  // emphasised dot
  ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
  // bubble: time · value
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
      // Fall back to the default theme if an old/unknown name was saved.
      state.theme = PALETTES[s.theme] ? s.theme : "sunny";
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

/* ---------- Service worker ---------- */
function registerSW() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
