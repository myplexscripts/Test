# Weather-news proxy

`news.js` is a single-file [Cloudflare Worker](https://workers.cloudflare.com/)
that turns Environment Canada's weather feeds into a CORS-friendly JSON endpoint
the app can read from the browser. It is free on Cloudflare's Workers free plan.

## What it returns

```
GET https://<your-worker>.workers.dev/?country=ca

{
  "country": "ca",
  "updated": "2026-07-14T12:00:00.000Z",
  "stories": [
    { "title": "Heat Warning in effect, City of London - Middlesex",
      "url": "https://weather.gc.ca/warnings/report_e.html?on117",
      "source": "Environment Canada",
      "published": "2026-07-14T11:40:00.000Z", "summary": "..." }
  ]
}
```

`country` defaults to `ca` (Canada-first). The feeds are configured in the
`FEEDS` map at the top of `news.js` — add more Environment Canada region/city
feeds (or feeds for other countries under a new code) there; they're fetched
best-effort and merged, so one dead feed never blanks the rest. The app sends
the visitor's own country code and falls back to Canada.

## Deploy (two options)

### A. Dashboard (no tooling)
1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**.
2. Give it a name, **Deploy**, then **Edit code**.
3. Paste the contents of `news.js`, replacing the sample, and **Deploy**.
4. Your URL is `https://<name>.<subdomain>.workers.dev`.

### B. Wrangler CLI
```bash
npm i -g wrangler
wrangler login
wrangler deploy worker/news.js --name weather-news
```

## Point the app at it

In `app.js` set the endpoint near the top:

```js
const NEWS_ENDPOINT = "https://<your-worker>.workers.dev";
```

Leave it as `""` to keep the news feature disabled (the section stays hidden).

## Notes
- Results are edge-cached for 15 minutes (only non-empty ones), so upstream is
  hit at most a few times an hour regardless of traffic.
- Source is Environment Canada (`weather.gc.ca`), so entries are the region's
  warnings, current conditions and forecast — each links to the EC page. Unlike
  a news aggregator, government feeds don't rate-limit datacenter IPs, so the
  Worker fetches them reliably.
- No API keys are involved and nothing is stored.
