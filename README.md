# Air Competition Analysis

Compares real-time flight prices across **ShareTrip**, **GoZayaan** and **Shohoz** — standard
vs. discounted fares, side by side, for the same itinerary.

An Express + WebSocket server drives two headless Chromium scrapers (ShareTrip, GoZayaan) and one
direct API call (Shohoz), matches identical flights across all three, and reports the difference
with live per-platform progress. A search takes 20–30 seconds.

---

## Quick start

**Windows:** double-click `start-flight.bat` — it checks Node, installs dependencies and the
Playwright browser on first run, then starts the server.

**Anything else:**

```bash
npm install
npx playwright install chromium
cp .env.example .env      # then fill in your credentials
node server.js
```

Then open <http://localhost:3000>.

---

## Configuration

Copy `.env.example` to `.env` and fill it in. **Never commit `.env`** — it is gitignored.

| Variable | Required | Purpose |
|---|---|---|
| `SHARETRIP_EMAIL`, `SHARETRIP_PASSWORD` | yes | ShareTrip login |
| `GOZAYAAN_EMAIL`, `GOZAYAAN_PASSWORD` | yes | GoZayaan login |
| `PORT` | no | Listen port, default `3000` |
| `MAX_CONCURRENT_COMPARISONS` | no | Simultaneous searches, default `2` |

Shohoz needs no credentials — its search API is public.

Logins are cached in `.sessions/` so repeat searches skip the login step. Expired sessions are
detected and refreshed automatically.

---

## Layout

```
server.js              Express + WebSocket server
src/
  runner.js            runs all three scrapers, merges results
  compare.js           matches flights across platforms, CSV export
  config.js            airports, airlines, coupon codes, scraper settings
  session-store.js     saves/restores platform logins
  scrapers/            sharetrip.js, gozayaan.js, shohoz.js
public/                dashboard (vanilla JS, no build step)
```

Each platform charges a different fee, verified against real checkout pages — ShareTrip and
GoZayaan multiply a convenience fee on the pre-fee amount, Shohoz grosses up 2% of the final
payable. **These formulas differ deliberately; do not harmonise them.** The reasoning is documented
in the comments at the top of each scraper.
