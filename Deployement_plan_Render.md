# Deploy to Render (Free Tier)

## Context

Alternative to the Oracle Cloud plan discussed earlier (still valid if you want to revisit it — just ask). Render is a PaaS: far less setup than a raw VM, deploys automatically on every `git push`, and has a genuine free tier — but free-tier web services **sleep after ~15 minutes of inactivity** and cold-start on the next request, and get only **512MB RAM**, which is tight for 3 concurrent headless Chromium instances under real load. Tradeoff: much less work now, at the cost of occasional slow "wake-up" searches and a real (if uncertain) risk of out-of-memory crashes during a real 3-platform search. No app code changes are needed either way — `server.js` already reads `process.env.PORT`, and the frontend's WebSocket client already connects via `window.location.host` dynamically.

## Step-by-Step Plan

### Phase 0 — Put this project in its own GitHub repo (prerequisite)
Same as the Oracle plan: this project currently has no dedicated git history of its own (it lives inside a larger, uncommitted parent folder). Render deploys directly from a GitHub repo, so:
- Initialize a new git repository scoped to just this `Air Price Analysis` folder.
- Create a **private** GitHub repo (via `gh repo create` — already available in this environment) — private is recommended since this code automates logins against 3 real commercial sites.
- Push the initial commit. `.gitignore` already excludes `node_modules/`, `.env`, `results/`, `*.log`, so no secrets go up.

### Phase 1 — Add a Dockerfile (I do this)
Render can build from a plain Node buildpack, but Playwright's Chromium needs specific OS-level libraries (`libnss3`, `libatk`, etc.) that a plain buildpack doesn't include, and `npx playwright install --with-deps` isn't always reliable on managed builders. Using Microsoft's official Playwright base image sidesteps this entirely:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```
I'll add this file to the repo before deploying.

### Phase 2 — Create the Render account + Web Service (you do this)
1. Sign up at render.com (can use GitHub login directly — no card needed for the free tier).
2. Connect your GitHub account and grant access to the new private repo.
3. Create a **New Web Service**, select the repo — Render auto-detects the Dockerfile.
4. Choose the **Free** instance type to start.

### Phase 3 — Environment variables (you do this, in Render's dashboard)
Add these as Environment Variables in the Web Service's settings (not committed to git):
- `SHARETRIP_EMAIL`, `SHARETRIP_PASSWORD`
- `GOZAYAAN_EMAIL`, `GOZAYAAN_PASSWORD`
- Any Shohoz session values currently in your local `.env`

### Phase 4 — Deploy and verify
1. Render builds the Docker image and deploys automatically — first build will take a few minutes (Playwright's base image is large).
2. Render assigns a free subdomain automatically: `your-app-name.onrender.com` (this is the Vercel-style friendly URL the user originally asked about — Render provides this out of the box, unlike a raw VM).
3. Verify: `GET https://your-app-name.onrender.com/api/airports` returns the airport list.
4. Run one real search from the deployed dashboard in a browser (not curl) — confirms the WebSocket progress events stream correctly end-to-end.
5. Watch Render's build/runtime logs during that first search to confirm Chromium launches without missing-library errors and to check memory usage isn't close to the 512MB ceiling.

### Update workflow going forward
This is Render's main advantage over the Oracle VM path: **push to GitHub, Render redeploys automatically** — no manual SSH step, no deploy script needed. Just `git push` to `main` as normal; Render picks up the webhook, rebuilds the Docker image, and replaces the running instance once the new build is healthy.

### Known free-tier caveats to watch for
- **Sleep on idle**: after ~15 minutes with no requests, Render spins the service down. The next request pays a cold start (image restart) *plus* Chromium's own launch time — the first search after any gap will feel slow, not broken, but noticeably so.
- **512MB RAM ceiling**: 3 concurrent headless Chromium instances (one per platform, per search) can approach or exceed this under real load. If searches start failing or timing out under real use, that's the likely cause — the fix at that point is upgrading to Render's cheapest paid instance tier (more RAM, no sleep), not a code change.

## Verification
- `GET https://your-app-name.onrender.com/api/airports` returns the airport list.
- A real `/api/compare` search from the deployed dashboard (in a browser) shows live per-platform WebSocket progress and returns matched comparison results, matching local behavior.
- Confirm the GitHub repo is private and contains no `.env`/credentials.
- After confirming it works, push a trivial change and confirm Render auto-redeploys without any manual step.
