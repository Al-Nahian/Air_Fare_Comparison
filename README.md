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
| `SMTP_USER`, `SMTP_APP_PASSWORD`, `SMTP_TO` | no | Daily snapshot email |

Shohoz needs no credentials — its search API is public.

Logins are cached in `.sessions/` so repeat searches skip the login step. Expired sessions are
detected and refreshed automatically.

`SMTP_APP_PASSWORD` must be a Gmail **app password**, not your account password: enable 2-Step
Verification, then create one at <https://myaccount.google.com/apppasswords>.

---

## Daily price tracking

`scripts/daily-snapshot.js` prices a list of routes unattended and writes one merged CSV per run.

```bash
node scripts/daily-snapshot.js
```

- Routes and lead times are configured in `scripts/routes.json` — edit freely, no code changes.
- Each route is priced N days ahead of the run date, so "DAC→KTM at 30 days out" stays the same
  measurement every night.
- Output is `results/comparison_list_<search date>.csv`, in the same format the dashboard's
  "Add to Comparison" list exports.
- Each row is the cheapest itinerary carried by **all three** platforms — a route with no such
  flight is reported as a failure rather than written as a partial row.
- Exits non-zero if any route fails, so a scheduler surfaces the problem instead of silently
  recording empty days. Details go to `results/snapshot-log.txt`.

Schedule it with cron or Windows Task Scheduler. Keep the run time fixed — prices move through the
day, so a varying run time makes figures non-comparable.

---

## Deployment

See **`requirements.txt`** for the full server specification: runtime versions, CPU/RAM sizing,
Chromium's OS dependencies, nginx settings and the install sequence.

Three things that silently break a deployment if missed:

1. **Node 18+** — the Shohoz scraper uses global `fetch()`. Ubuntu's default `apt` Node is often
   older; install from NodeSource.
2. **`npx playwright install --with-deps chromium`** — without `--with-deps` Chromium installs but
   won't launch, and every search returns zero flights with no obvious cause.
3. **nginx `proxy_read_timeout` ≥ 90s** and WebSocket `Upgrade` headers — searches legitimately run
   20–75 seconds, and the 60s default cuts long ones off with a 504.

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
scripts/
  daily-snapshot.js    unattended daily price capture
  routes.json          which routes to track
  mailer.js            snapshot email
results/               generated CSVs and run log (gitignored)
```

Each platform charges a different fee, verified against real checkout pages — ShareTrip and
GoZayaan multiply a convenience fee on the pre-fee amount, Shohoz grosses up 2% of the final
payable. **These formulas differ deliberately; do not harmonise them.** The reasoning is documented
in the comments at the top of each scraper.
