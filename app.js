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

/* Flat per-condition palettes. Light palettes use a near-black tinted
   surface (the "black box") with accent-hue icons, exactly like the
   inspiration; dark palettes flip to a light-on-dark scheme. */
const PALETTES = {
  clear:   { bg: "#ffd83d", ink: "#0a0a0a", surface: "#0a0a0a", onSurface: "#fffdf8", accent: "#ffd83d", dark: false },
  clouds:  { bg: "#42c6ff", ink: "#06222f", surface: "#06222f", onSurface: "#eafaff", accent: "#5fd0ff", dark: false },
  rain:    { bg: "#ff64d4", ink: "#2b0a24", surface: "#2b0a24", onSurface: "#ffe9fa", accent: "#ff8fe0", dark: false },
  snow:    { bg: "#d8e9ff", ink: "#0b1626", surface: "#0b1626", onSurface: "#eef5ff", accent: "#79b6ff", dark: false },
  thunder: { bg: "#211a47", ink: "#f4eeff", surface: "#372d6e", onSurface: "#fff9e6", accent: "#ffe24a", dark: true },
  night:   { bg: "#121845", ink: "#e9ecff", surface: "#28306e", onSurface: "#f4f6ff", accent: "#a98bff", dark: true }
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const el = {
  statusFade: $("statusFade"), ptr: $("ptr"), scrim: $("scrim"),
  drawer: $("drawer"), drawerClose: $("drawerClose"),
  menuBtn: $("menuBtn"), locBtn: $("locBtn"),
  unitSeg: $("unitSeg"), useHome: $("useHome"), useLocation: $("useLocation"), refreshBtn: $("refreshBtn"),
  placeName: $("placeName"), datePill: $("datePill"), condition: $("condition"),
  heroIcon: $("heroIcon"), temp: $("temp"), summary: $("summary"),
  mWind: $("mWind"), mHumidity: $("mHumidity"), mVisibility: $("mVisibility"),
  hourRail: $("hourRail"), dayRail: $("dayRail"), status: $("status"),
  sunCard: $("sunCard"), detailGrid: $("detailGrid"),
  radarPreview: $("radarPreview"), radarPreviewMap: $("radarPreviewMap"), radarMore: $("radarMore"),
  radarSheet: $("radarSheet"), radarBack: $("radarBack"), radarMap: $("radarMap"),
  layerSeg: $("layerSeg"), radarPlace: $("radarPlace"),
  hourlyMore: $("hourlyMore"), dailyMore: $("dailyMore"),
  sheet: $("sheet"), sheetBack: $("sheetBack"), tabSeg: $("tabSeg"),
  sheetTitle: $("sheetTitle"), sheetNote: $("sheetNote"), graph: $("graph"), sheetList: $("sheetList")
};

/* ---------- State ---------- */
const state = {
  units: "metric",
  loc: { ...HOME },
  data: null,
  hourly: [],
  daily: [],
  tab: "hourly",
  center: { ...HOME },
  dark: false,
  drawerOpen: false,
  sheetOpen: false,
  radarOpen: false
};

/* Radar / map (Leaflet) state */
const radar = { map: null, base: null, overlay: null, marker: null, preview: null, previewBase: null, layer: "precipitation_new" };

/* ---------- Boot ---------- */
init();

function init() {
  loadState();
  wireEvents();
  registerSW();
  syncControls();

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

  el.hourlyMore.onclick = () => openSheet("hourly");
  el.dailyMore.onclick = () => openSheet("daily");
  el.sheetBack.onclick = closeSheet;
  el.radarPreview.onclick = openRadar;
  el.radarMore.onclick = openRadar;
  el.radarBack.onclick = closeRadar;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) => b.onclick = () => setLayer(b.dataset.layer));
  el.tabSeg.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => setTab(b.dataset.tab);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSheet(); closeDrawer(); closeRadar(); }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => { if (state.sheetOpen) drawGraph(); });

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

  applyPalette(paletteKind(w.main, isNight));

  el.heroIcon.className = `hero-icon ${iconClass(w.main, isNight)}`;
  el.placeName.textContent = current.name ? `${current.name}${sys.country ? ", " + sys.country : ""}` : state.loc.label;
  el.datePill.textContent = fmtDate(tz);
  el.condition.textContent = w.description || w.main || "Weather";
  el.temp.textContent = `${Math.round(m.temp ?? 0)}°`;
  el.temp.classList.remove("is-loading");
  el.summary.textContent = buildSummary(current, state.daily);

  el.mWind.textContent = windText(current.wind?.speed || 0);
  el.mHumidity.textContent = m.humidity != null ? `${m.humidity}%` : "—";
  el.mVisibility.textContent = visibilityText(current.visibility);

  renderHourly();
  renderDaily();
  renderSun(current);
  renderDetails(current);

  state.center = { lat: current.coord?.lat ?? state.loc.lat, lon: current.coord?.lon ?? state.loc.lon };
  if (el.radarPlace) el.radarPlace.textContent = current.name || state.loc.label;
  syncMaps();

  if (state.sheetOpen) { drawGraph(); renderSheetList(); }
}

function renderHourly() {
  el.hourRail.innerHTML = state.hourly.map((h) => `
    <button class="card hour-card" data-open="hourly">
      <span>${h.label}</span>
      <i class="${iconClass(h.main, h.hour < 6 || h.hour >= 20)}"></i>
      <strong>${Math.round(h.temp)}°</strong>
      <span>${Math.round(h.pop * 100)}%</span>
    </button>`).join("");
  el.hourRail.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openSheet("hourly"));
}

function renderDaily() {
  el.dayRail.innerHTML = state.daily.map((d) => `
    <button class="card day-card" data-open="daily">
      <span>${d.label}</span>
      <i class="${iconClass(d.main, false)}"></i>
      <strong class="hi">${Math.round(d.max)}°</strong>
      <span class="lo">${Math.round(d.min)}°</span>
    </button>`).join("");
  el.dayRail.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openSheet("daily"));
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

function renderDetails(current) {
  const m = current.main || {};
  const wind = current.wind || {};
  const clouds = current.clouds || {};
  const today = state.daily[0];
  const items = [];
  items.push(["ph-thermometer-simple", "Feels like", `${Math.round(m.feels_like ?? m.temp ?? 0)}°`, ""]);
  if (today) items.push(["ph-arrows-vertical", "High / Low", `${Math.round(today.max)}° / ${Math.round(today.min)}°`, "today"]);
  items.push(["ph-wind", "Wind", windText(wind.speed || 0), wind.deg != null ? direction(wind.deg) : ""]);
  if (wind.gust != null) items.push(["ph-wind", "Gusts", windText(wind.gust), "peak"]);
  items.push(["ph-drop", "Humidity", m.humidity != null ? `${m.humidity}%` : "—", ""]);
  items.push(["ph-gauge", "Pressure", m.pressure != null ? `${m.pressure} hPa` : "—", ""]);
  items.push(["ph-cloud", "Cloud cover", clouds.all != null ? `${clouds.all}%` : "—", ""]);
  items.push(["ph-eye", "Visibility", visibilityText(current.visibility), ""]);
  const precip = precipItem(current, today);
  if (precip) items.push(precip);

  el.detailGrid.innerHTML = items.map(([icon, label, value, sub]) => `
    <div class="detail">
      <i class="ph-duotone ${icon}"></i>
      <span class="d-label">${label}</span>
      <strong class="d-value">${value}</strong>
      ${sub ? `<span class="d-sub">${sub}</span>` : ""}
    </div>`).join("");
}

function precipItem(current, today) {
  const snow = current.snow?.["1h"] ?? current.snow?.["3h"];
  const rain = current.rain?.["1h"] ?? current.rain?.["3h"];
  if (snow != null) return ["ph-cloud-snow", "Snow", `${snow} mm`, "last hour"];
  if (rain != null) return ["ph-cloud-rain", "Rain", `${rain} mm`, "last hour"];
  if (today) return ["ph-umbrella", "Precip chance", `${Math.round((today.pop || 0) * 100)}%`, "today"];
  return null;
}

function direction(deg) {
  const d = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${d[Math.round(deg / 45) % 8]} · ${Math.round(deg)}°`;
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
      main: rep.weather?.[0]?.main || ""
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
function paletteKind(main, isNight) {
  const m = String(main || "").toLowerCase();
  if (isNight) return "night";
  if (m.includes("thunder")) return "thunder";
  if (m.includes("snow")) return "snow";
  if (m.includes("rain") || m.includes("drizzle")) return "rain";
  if (m.includes("cloud")) return "clouds";
  return "clear";
}

function applyPalette(kind) {
  const p = PALETTES[kind] || PALETTES.clear;
  const r = document.documentElement.style;
  r.setProperty("--bg", p.bg);
  r.setProperty("--ink", p.ink);
  r.setProperty("--surface", p.surface);
  r.setProperty("--on-surface", p.onSurface);
  r.setProperty("--surface-accent", p.accent);
  r.setProperty("--theme", p.bg);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", p.bg);
  document.documentElement.style.colorScheme = p.dark ? "dark" : "light";
  state.dark = !!p.dark;
  updateMapTheme();
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

/* ---------- Detail sheet + graph ---------- */
function openSheet(tab) {
  state.tab = tab;
  state.sheetOpen = true;
  syncTabs();
  el.sheet.classList.add("is-open");
  el.sheet.setAttribute("aria-hidden", "false");
  el.sheet.style.transform = "";
  document.body.style.overflow = "hidden";
  drawGraph();
  renderSheetList();
  onScroll();
}

function closeSheet() {
  state.sheetOpen = false;
  el.sheet.classList.remove("is-open");
  el.sheet.setAttribute("aria-hidden", "true");
  el.sheet.style.transform = "";
  document.body.style.overflow = "";
  onScroll();
}

function setTab(tab) {
  state.tab = tab;
  syncTabs();
  drawGraph();
  renderSheetList();
  el.sheet.scrollTo({ top: 0, behavior: "smooth" });
}

function syncTabs() {
  el.tabSeg.querySelectorAll("[data-tab]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tab === state.tab));
  const hourly = state.tab === "hourly";
  el.sheetTitle.textContent = hourly ? "Hourly trend" : "Daily trend";
  el.sheetNote.textContent = hourly
    ? "Temperature across the next hours."
    : "Daily highs and lows for the days ahead.";
}

function renderSheetList() {
  if (state.tab === "hourly") {
    el.sheetList.innerHTML = state.hourly.map((h) => `
      <div class="row">
        <span class="row-label">${h.label}</span>
        <i class="row-icon ${iconClass(h.main, h.hour < 6 || h.hour >= 20)}"></i>
        <span class="row-temp">${Math.round(h.temp)}°<span class="row-sub"> · ${Math.round(h.pop * 100)}%</span></span>
      </div>`).join("");
  } else {
    el.sheetList.innerHTML = state.daily.map((d) => `
      <div class="row">
        <span class="row-label">${d.label}</span>
        <i class="row-icon ${iconClass(d.main, false)}"></i>
        <span class="row-temp">${Math.round(d.max)}°<span class="row-sub"> / ${Math.round(d.min)}°</span></span>
      </div>`).join("");
  }
}

function drawGraph() {
  const rows = state.tab === "hourly"
    ? state.hourly.map((h) => ({ label: h.label, hi: h.temp }))
    : state.daily.map((d) => ({ label: d.label, hi: d.max, lo: d.min }));
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
  const hasLo = rows.some((r) => Number.isFinite(r.lo));
  const vals = rows.flatMap((r) => [r.hi, r.lo]).filter(Number.isFinite);
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const padX = 30, padTop = 34, padBottom = 30;
  const w = rect.width - padX * 2;
  const h = rect.height - padTop - padBottom;
  const x = (i) => padX + (w / Math.max(1, rows.length - 1)) * i;
  const y = (v) => padTop + h - ((v - min) / Math.max(1, max - min)) * h;

  // gridlines
  ctx.strokeStyle = ink; ctx.globalAlpha = 0.14; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const gy = padTop + (h / 3) * i;
    ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(rect.width - padX, gy); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const line = (key, alpha, width) => {
    ctx.beginPath();
    rows.forEach((r, i) => {
      if (!Number.isFinite(r[key])) return;
      const px = x(i), py = y(r[key]);
      if (i === 0) ctx.moveTo(px, py);
      else {
        const prev = rows[i - 1];
        const cx = (x(i - 1) + px) / 2;
        ctx.bezierCurveTo(cx, y(prev[key]), cx, py, px, py);
      }
    });
    ctx.strokeStyle = ink; ctx.globalAlpha = alpha; ctx.lineWidth = width;
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke();
    ctx.globalAlpha = 1;
  };
  if (hasLo) line("lo", 0.4, 3);
  line("hi", 1, 4);

  // points + labels
  ctx.fillStyle = ink;
  ctx.font = "700 12px Inter, system-ui";
  ctx.textAlign = "center";
  const step = rows.length > 8 ? 2 : 1;
  rows.forEach((r, i) => {
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x(i), y(r.hi), 4.5, 0, Math.PI * 2); ctx.fill();
    if (i % step === 0) {
      ctx.fillText(`${Math.round(r.hi)}°`, x(i), y(r.hi) - 12);
      ctx.globalAlpha = 0.6;
      ctx.fillText(r.label, x(i), rect.height - 10);
    }
  });
  ctx.globalAlpha = 1;
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
function baseTileUrl() {
  return state.dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
}
function owmTileUrl(layer) {
  return `https://tile.openweathermap.org/map/${layer}/{z}/{x}/{y}.png?appid=${API_KEY}`;
}

function initRadarPreview() {
  if (!haveLeaflet() || radar.preview) return;
  const c = state.center;
  radar.preview = L.map(el.radarPreviewMap, {
    zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false
  }).setView([c.lat, c.lon], 6);
  radar.previewBase = L.tileLayer(baseTileUrl(), { subdomains: "abcd" }).addTo(radar.preview);
  L.tileLayer(owmTileUrl("precipitation_new"), { opacity: 0.75 }).addTo(radar.preview);
  setTimeout(() => radar.preview && radar.preview.invalidateSize(), 300);
}

function initRadarMap() {
  if (!haveLeaflet()) { el.radarMap.innerHTML = '<div class="map-fallback">The map needs an internet connection.</div>'; return; }
  const c = state.center;
  if (radar.map) { radar.map.setView([c.lat, c.lon]); return; }
  radar.map = L.map(el.radarMap, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lon], 7);
  radar.base = L.tileLayer(baseTileUrl(), {
    subdomains: "abcd", maxZoom: 18, attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(radar.map);
  radar.overlay = L.tileLayer(owmTileUrl(radar.layer), {
    opacity: 0.72, maxZoom: 18, attribution: '&copy; OpenWeather'
  }).addTo(radar.map);
  radar.marker = L.circleMarker([c.lat, c.lon], {
    radius: 7, weight: 3, color: "#ffffff",
    fillColor: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#0a0a0a",
    fillOpacity: 1
  }).addTo(radar.map);
}

function openRadar() {
  state.radarOpen = true;
  el.radarSheet.classList.add("is-open");
  el.radarSheet.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  initRadarMap();
  setTimeout(() => radar.map && radar.map.invalidateSize(), 320);
}
function closeRadar() {
  if (!state.radarOpen) return;
  state.radarOpen = false;
  el.radarSheet.classList.remove("is-open");
  el.radarSheet.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setLayer(layer) {
  radar.layer = layer;
  el.layerSeg.querySelectorAll("[data-layer]").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.layer === layer));
  if (radar.overlay) radar.overlay.setUrl(owmTileUrl(layer));
}

function syncMaps() {
  if (!haveLeaflet()) return;
  const c = state.center;
  if (radar.preview) radar.preview.setView([c.lat, c.lon]); else initRadarPreview();
  if (radar.map) { radar.map.setView([c.lat, c.lon]); radar.marker && radar.marker.setLatLng([c.lat, c.lon]); }
}

function updateMapTheme() {
  if (!haveLeaflet()) return;
  const url = baseTileUrl();
  if (radar.base) radar.base.setUrl(url);
  if (radar.previewBase) radar.previewBase.setUrl(url);
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
function onScroll() {
  const y = window.scrollY || 0;
  el.statusFade.classList.toggle("is-visible", y > 8 && !state.sheetOpen);
}

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
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ units: state.units, loc: state.loc })); } catch {}
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (s) { state.units = s.units || "metric"; state.loc = s.loc || { ...HOME }; }
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
