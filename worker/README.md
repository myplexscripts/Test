# Weather-news proxy

`news.js` is a single-file [Cloudflare Worker](https://workers.cloudflare.com/)
that turns weather-news RSS feeds into a CORS-friendly JSON endpoint the app can
read from the browser. It is free on Cloudflare's Workers free plan.

## What it returns

```
GET https://<your-worker>.workers.dev/?country=ca

{
  "country": "ca",
  "updated": "2026-07-14T12:00:00.000Z",
  "stories": [
    { "title": "...", "url": "https://...", "source": "CBC News",
      "published": "2026-07-14T11:40:00.000Z", "summary": "..." }
  ]
}
```

`country` defaults to `ca` (Canada-first). Other supported codes: `us`, `gb`,
`au`, `nz`, `ie`, `in`. Add more in the `COUNTRIES` map at the top of `news.js`.
The app sends the visitor's own country code and falls back to Canada.

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
- Results are edge-cached for 15 minutes, so upstream is hit at most a few times
  an hour regardless of traffic.
- Source is Google News RSS (an aggregator), so headlines link out via a
  `news.google.com` redirect to the original article.
- No API keys are involved and nothing is stored.
