/**
 * Weather-news proxy — a tiny Cloudflare Worker.
 *
 * Environment Canada's feeds are public XML but send no CORS headers, so a
 * browser can't read them directly. This Worker fetches them server-side,
 * normalises them to JSON, adds CORS, and edge-caches the result. The PWA
 * calls one clean endpoint:
 *
 *     GET https://<your-worker>.workers.dev/?country=ca
 *
 * It is Canada-first. Add feeds per country in FEEDS below. See
 * worker/README.md to deploy.
 */

const FEEDS = {
  // Canada — Environment Canada. "battleboard" feeds carry the warnings,
  // current conditions and forecast for a region. Add more entries (other
  // regions / city feeds) to widen coverage; they're merged in order.
  ca: [
    { url: "https://weather.gc.ca/rss/battleboard/onrm117_e.xml", source: "Environment Canada" },
  ],
};
const DEFAULT_CC = "ca";
const MAX_STORIES = 24;
const TTL = 900;            // seconds the result stays fresh (15 min)
const FEED_TIMEOUT = 8000;  // ms per upstream feed

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return cors(json({ error: "method-not-allowed" }, 405));

    const url = new URL(request.url);
    const cc = (url.searchParams.get("country") || DEFAULT_CC).toLowerCase();
    const feeds = FEEDS[cc] || FEEDS[DEFAULT_CC];

    // Serve from the edge cache when we can, keyed by country.
    const cache = caches.default;
    const cacheKey = new Request(`https://news-cache.internal/?c=${cc}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cors(cached);

    // Fetch every feed best-effort: one failing source never blanks the rest.
    const batches = await Promise.all(feeds.map((f) => fetchFeed(f)));
    const seen = new Set();
    const stories = batches.flat()
      .filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))
      .slice(0, MAX_STORIES);

    const body = json({ country: cc, updated: new Date().toISOString(), stories });
    body.headers.set("Cache-Control", `public, max-age=${TTL}, s-maxage=${TTL}`);
    const out = cors(body);
    // Only cache a non-empty result, so a transient upstream hiccup isn't
    // frozen for 15 minutes.
    if (stories.length) await cache.put(cacheKey, out.clone());
    return out;
  },
};

async function fetchFeed(f) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FEED_TIMEOUT);
  try {
    const res = await fetch(f.url, {
      headers: { "User-Agent": "Mozilla/5.0 (weather-news-proxy)", "Accept": "application/atom+xml, application/rss+xml, application/xml, text/xml" },
      cf: { cacheTtl: TTL, cacheEverything: true },
      signal: ctl.signal,
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), f.source);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---- Feed parsing (regex-based; Workers have no XML DOM) ---------------------
// Handles both Atom (<entry>, <link href>) and RSS (<item>, <link>text).

function parseFeed(xml, fallbackSource) {
  const atom = /<entry[\s>]/.test(xml);
  const blocks = xml.match(atom ? /<entry[\s\S]*?<\/entry>/g : /<item[\s\S]*?<\/item>/g) || [];
  const out = [];
  for (const b of blocks) {
    let title = clean(tag(b, "title"));
    const url = atom ? atomLink(b) : clean(tag(b, "link"));
    const published = atom ? (tag(b, "updated") || tag(b, "published")) : tag(b, "pubDate");
    const rawSummary = atom ? (tag(b, "summary") || tag(b, "content")) : tag(b, "description");
    const source = clean(stripTags(tag(b, "source"))) || fallbackSource || hostname(url);
    // Some aggregators append " - Source" to titles; drop it when redundant.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)).trim();
    if (!title || !url) continue;
    const summary = plain(rawSummary);
    out.push({
      title,
      url,
      source,
      published: safeDate(published),
      summary: summary.length > 180 ? summary.slice(0, 177) + "…" : summary,
    });
  }
  return out;
}

// Pick an Atom <link>: prefer rel="alternate" (the human page), else the first.
function atomLink(block) {
  const links = block.match(/<link\b[^>]*>/gi) || [];
  let fallback = "";
  for (const l of links) {
    const href = (l.match(/href="([^"]*)"/i) || [])[1];
    if (!href) continue;
    const rel = (l.match(/rel="([^"]*)"/i) || [])[1] || "alternate";
    if (rel === "alternate") return decodeEntities(href);
    if (!fallback) fallback = href;
  }
  return decodeEntities(fallback);
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].trim() : "";
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, " "); }
function clean(s) {
  return decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/\s+/g, " ").trim();
}
// Plain text from a field whose markup is entity-encoded (e.g. <summary>):
// un-CDATA, decode entities so the encoded tags become real tags, THEN strip
// them — stripping before decoding would leave the markup behind.
function plain(s) {
  const decoded = decodeEntities(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
  return stripTags(decoded).replace(/\s+/g, " ").trim();
}
function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => codePoint(parseInt(n, 10)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
function codePoint(n) { try { return String.fromCodePoint(n); } catch { return ""; } }
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
