// Cloudflare Worker: "On this day" historical records.
//
// The phone can't reach archive-api.open-meteo.com directly (it fails with
// "Load failed"), so this Worker fetches the daily archive server-side, reduces
// it to the records for one calendar day, and returns a tiny JSON payload. The
// result is cached at Cloudflare's edge per location/day, so the heavy archive
// call happens at most once per location per day for all visitors combined.
//
// Deploy this as its own Worker (see the walkthrough), then paste its URL into
// OTD_PROXY in app.js.
//
// Request:  GET /?lat=42.98&lon=-81.25&unit=metric&mmdd=07-20
// Response: { "mmdd":"07-20", "count":34,
//             "hi":{"v":34.1,"year":"2011"},
//             "lo":{"v":6.2,"year":"1992"},
//             "wet":{"v":41.3,"year":"2017"},   // precip always in mm
//             "avgHigh":26.4 }                   // temps in the requested unit

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
    }
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get("lat"));
    const lon = parseFloat(url.searchParams.get("lon"));
    const unit = url.searchParams.get("unit") === "imperial" ? "imperial" : "metric";
    const mmdd = (url.searchParams.get("mmdd") || "").slice(0, 5);
    if (!isFinite(lat) || !isFinite(lon) || !/^\d\d-\d\d$/.test(mmdd)) {
      return new Response(JSON.stringify({ error: "bad params" }), { status: 400, headers: CORS });
    }

    const latR = lat.toFixed(2), lonR = lon.toFixed(2);
    const today = new Date().toISOString().slice(0, 10);
    // Edge cache: same place + unit + day = one shared result.
    const cacheKey = new Request(`https://otd-cache.internal/${latR},${lonR},${unit},${mmdd},${today}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const tu = unit === "imperial" ? "fahrenheit" : "celsius";
    const end = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
    const api = `https://archive-api.open-meteo.com/v1/archive?latitude=${latR}&longitude=${lonR}`
      + `&start_date=1990-01-01&end_date=${end}`
      + `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=${tu}&timezone=auto`;

    let j;
    try {
      const r = await fetch(api, { cf: { cacheTtl: 86400, cacheEverything: true } });
      j = await r.json();
      if (!r.ok || j.error) {
        return new Response(JSON.stringify({ error: j.reason || `archive HTTP ${r.status}` }), { status: 502, headers: CORS });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: `archive fetch failed: ${e}` }), { status: 502, headers: CORS });
    }

    const d = j.daily || {};
    const time = d.time || [], tmax = d.temperature_2m_max || [], tmin = d.temperature_2m_min || [], pr = d.precipitation_sum || [];
    let hi = null, lo = null, wet = null, sumHi = 0, nHi = 0;
    const years = new Set();
    for (let i = 0; i < time.length; i++) {
      if (String(time[i]).slice(5, 10) !== mmdd) continue;
      const year = String(time[i]).slice(0, 4);
      const mx = tmax[i], mn = tmin[i], p = pr[i];
      if (Number.isFinite(mx)) { years.add(year); sumHi += mx; nHi++; if (!hi || mx > hi.v) hi = { v: mx, year }; }
      if (Number.isFinite(mn) && (!lo || mn < lo.v)) lo = { v: mn, year };
      if (Number.isFinite(p) && p > 0 && (!wet || p > wet.v)) wet = { v: p, year };
    }

    const body = JSON.stringify({ mmdd, count: years.size, hi, lo, wet, avgHigh: nHi ? sumHi / nHi : null });
    const resp = new Response(body, { headers: { ...CORS, "Cache-Control": "public, max-age=86400" } });
    await cache.put(cacheKey, resp.clone());
    return resp;
  },
};
