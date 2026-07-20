// Cloudflare Worker: "On this day" historical records.
//
// The phone can't reach archive-api.open-meteo.com directly (it fails with
// "Load failed"), so this Worker fetches the daily archive server-side, reduces
// it to the records for one calendar day, and returns a tiny JSON payload. The
// result is edge-cached per location/day where the Cache API is available.
//
// Every response - success OR error - carries CORS headers, and caching is
// best-effort, so a Worker hiccup surfaces as a readable message in the app
// instead of an opaque browser "NetworkError".
//
// Request:  GET /?lat=42.98&lon=-81.25&unit=metric&mmdd=07-20&start=2000
//   start is the first year of the range (default 2000; the app offers 1970).
// Response: { "mmdd":"07-20", "count":24,
//             "hi":{"v":34.1,"year":"2011"},
//             "lo":{"v":6.2,"year":"2003"},
//             "wet":{"v":41.3,"year":"2017"},   // precip always in mm
//             "avgHigh":26.4,                    // temps in the requested unit
//             "series":[{"y":2000,"hi":28.1,"lo":12.3,"p":0}, …] }  // per-year points

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, ...extra } });

export default {
  async fetch(request) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
      }
      const url = new URL(request.url);
      const lat = parseFloat(url.searchParams.get("lat"));
      const lon = parseFloat(url.searchParams.get("lon"));
      const unit = url.searchParams.get("unit") === "imperial" ? "imperial" : "metric";
      const mmdd = (url.searchParams.get("mmdd") || "").slice(0, 5);
      // Range start: the app defaults to 2000 (fast) and offers 1970 on demand.
      const start = Math.min(2020, Math.max(1940, parseInt(url.searchParams.get("start"), 10) || 2000));
      if (!isFinite(lat) || !isFinite(lon) || !/^\d\d-\d\d$/.test(mmdd)) {
        return json({ error: "bad params" }, 400);
      }

      const latR = lat.toFixed(2), lonR = lon.toFixed(2);
      const today = new Date().toISOString().slice(0, 10);
      // VERSION busts the edge cache on deploys that change the response shape -
      // without it, a response cached earlier the same day by the previous code
      // keeps being served until midnight UTC.
      const VERSION = "v3";
      const cacheKey = new Request(`https://otd-cache.internal/${VERSION}/${latR},${lonR},${unit},${mmdd},${start},${today}`);
      // Cache API is a no-op on workers.dev, and shouldn't ever be fatal.
      let cache = null;
      try {
        cache = caches.default;
        const hit = await cache.match(cacheKey);
        if (hit) return hit;
      } catch { cache = null; }

      const tu = unit === "imperial" ? "fahrenheit" : "celsius";
      const end = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const api = `https://archive-api.open-meteo.com/v1/archive?latitude=${latR}&longitude=${lonR}`
        + `&start_date=${start}-01-01&end_date=${end}`
        + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tu}&timezone=auto`;

      let j;
      try {
        const r = await fetch(api);
        j = await r.json();
        if (!r.ok || j.error) return json({ error: j.reason || `archive HTTP ${r.status}` }, 502);
      } catch (e) {
        return json({ error: `archive fetch failed: ${e && e.message || e}` }, 502);
      }

      const d = j.daily || {};
      const time = d.time || [], tmax = d.temperature_2m_max || [], tmin = d.temperature_2m_min || [], pr = d.precipitation_sum || [];
      let hi = null, lo = null, wet = null, sumHi = 0, nHi = 0;
      const years = new Set();
      const series = [];   // one point per year for the year-over-year graph
      for (let i = 0; i < time.length; i++) {
        if (String(time[i]).slice(5, 10) !== mmdd) continue;
        const year = String(time[i]).slice(0, 4);
        const mx = tmax[i], mn = tmin[i], p = pr[i];
        if (!Number.isFinite(mx) && !Number.isFinite(mn)) continue;
        series.push({
          y: Number(year),
          hi: Number.isFinite(mx) ? Math.round(mx * 10) / 10 : null,
          lo: Number.isFinite(mn) ? Math.round(mn * 10) / 10 : null,
          p: Number.isFinite(p) ? Math.round(p * 10) / 10 : 0,
        });
        if (Number.isFinite(mx)) { years.add(year); sumHi += mx; nHi++; if (!hi || mx > hi.v) hi = { v: mx, year }; }
        if (Number.isFinite(mn) && (!lo || mn < lo.v)) lo = { v: mn, year };
        if (Number.isFinite(p) && p > 0 && (!wet || p > wet.v)) wet = { v: p, year };
      }

      const resp = json({ mmdd, count: years.size, hi, lo, wet, avgHigh: nHi ? sumHi / nHi : null, series },
        200, { "Cache-Control": "public, max-age=86400" });
      try { if (cache) await cache.put(cacheKey, resp.clone()); } catch { /* best effort */ }
      return resp;
    } catch (e) {
      return json({ error: `worker error: ${e && e.message || e}` }, 500);
    }
  },
};
