/**
 * Weather-news proxy — a tiny Cloudflare Worker.
 *
 * Browsers can't read most weather-news RSS feeds directly (no CORS headers),
 * so this Worker fetches them server-side, normalises them to JSON, adds CORS,
 * and edge-caches the result. The PWA calls one clean endpoint:
 *
 *     GET https://<your-worker>.workers.dev/?country=ca
 *
 * It is Canada-first (the default) and already understands a handful of other
 * countries; add more to COUNTRIES as needed. See worker/README.md to deploy.
 */

const COUNTRIES = {
  ca: { hl: "en-CA", gl: "CA", ceid: "CA:en", q: "Canada weather" },
  us: { hl: "en-US", gl: "US", ceid: "US:en", q: "United States weather" },
  gb: { hl: "en-GB", gl: "GB", ceid: "GB:en", q: "UK weather" },
  au: { hl: "en-AU", gl: "AU", ceid: "AU:en", q: "Australia weather" },
  nz: { hl: "en-NZ", gl: "NZ", ceid: "NZ:en", q: "New Zealand weather" },
  ie: { hl: "en-IE", gl: "IE", ceid: "IE:en", q: "Ireland weather" },
  in: { hl: "en-IN", gl: "IN", ceid: "IN:en", q: "India weather" },
};
const DEFAULT_CC = "ca";
const MAX_STORIES = 24;
const TTL = 900; // seconds the result is considered fresh (15 min)

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return cors(json({ error: "method-not-allowed" }, 405));

    const url = new URL(request.url);
    const cc = (url.searchParams.get("country") || DEFAULT_CC).toLowerCase();
    const conf = COUNTRIES[cc] || COUNTRIES[DEFAULT_CC];

    // Serve from the edge cache when we can, keyed by country.
    const cache = caches.default;
    const cacheKey = new Request(`https://news-cache.internal/?c=${conf.gl}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cors(cached);

    const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(conf.q)}` +
      `&hl=${conf.hl}&gl=${conf.gl}&ceid=${conf.ceid}`;

    let stories = [];
    try {
      const res = await fetch(feed, {
        headers: { "User-Agent": "Mozilla/5.0 (weather-news-proxy)" },
        cf: { cacheTtl: TTL, cacheEverything: true },
      });
      if (!res.ok) return cors(json({ error: "upstream", status: res.status }, 502));
      stories = parseRss(await res.text()).slice(0, MAX_STORIES);
    } catch (e) {
      return cors(json({ error: "fetch-failed", detail: String(e) }, 502));
    }

    const body = json({ country: conf.gl.toLowerCase(), updated: new Date().toISOString(), stories });
    body.headers.set("Cache-Control", `public, max-age=${TTL}, s-maxage=${TTL}`);
    const out = cors(body);
    await cache.put(cacheKey, out.clone());
    return out;
  },
};

// ---- RSS parsing (regex-based; Workers have no XML DOM) ----------------------

function parseRss(xml) {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const url = clean(tag(it, "link"));
    let title = clean(tag(it, "title"));
    const source = clean(stripTags(tag(it, "source"))) || hostname(url);
    // Google News appends " - Source" to titles; drop it when redundant.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    const pub = tag(it, "pubDate");
    const summary = plain(tag(it, "description"));
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      title,
      url,
      source,
      published: pub ? safeDate(pub) : null,
      summary: summary.length > 180 ? summary.slice(0, 177) + "…" : summary,
    });
  }
  return out;
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, " "); }
function clean(s) {
  return decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/\s+/g, " ").trim();
}
// Plain text from a field whose markup is entity-encoded (e.g. RSS <description>):
// un-CDATA, decode entities so the encoded tags become real tags, THEN strip
// them — stripping before decoding would leave the markup behind.
function plain(s) {
  const decoded = decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
  return stripTags(decoded).replace(/\s+/g, " ").trim();
}
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
function hostname(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function safeDate(s) { const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null; }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
function cors(res) {
  const r = new Response(res.body, res);
  r.headers.set("Access-Control-Allow-Origin", "*");
  r.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  r.headers.set("Access-Control-Allow-Headers", "*");
  return r;
}
