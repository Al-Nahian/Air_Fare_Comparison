# Deploy to Hugging Face Spaces (Docker) — no credit card

## Context

Oracle Cloud "Always Free" was the original plan but is **blocked**: it requires a card for
verification and the user's card declined during that step, so the account can't be created.
Koyeb closed its free tier (Mistral acquisition, early 2026) and Fly.io now requires a card too.

**Hugging Face Spaces (Docker SDK)** is the chosen no-card alternative — and a genuinely good fit:

- **No credit card**, ever.
- **2 vCPU / 16 GB RAM** free (`cpu-basic`) — far more than enough for 3 concurrent headless
  Chromium instances (Render free is only 512 MB).
- **Docker SDK** — we ship a `Dockerfile`, so Playwright/Chromium runs exactly like on a VM.
- **HTTPS + WSS** on a `*.hf.space` URL out of the box (no DuckDNS/certbot needed).
- **Push-to-deploy** — deploying/updating is `git push` to the Space's git remote.
- **Secrets** UI holds credentials as env vars (never committed).
- Sleeps only after **48 h of inactivity** (vs Render's 15 min); wakes on the next visit.

## Already done in the repo (by me)

- **`Dockerfile`** — Playwright base image (`mcr.microsoft.com/playwright:v1.48.0-noble`), installs
  deps, matches the Chromium build, listens on **port 7860** (HF's required port; `server.js`
  already reads `process.env.PORT`).
- **`README.md`** — contains the HF Space YAML front-matter (`sdk: docker`, `app_port: 7860`).
- **`.dockerignore`** — excludes `node_modules`, `.env`, `results`, `.git`, logs, local-only docs.
- **`--no-sandbox`** added to every Chromium launch (via `SCRAPER_CONFIG.chromiumArgs` in
  `src/config.js`) — **required** because Chromium runs as root in the container; harmless locally.
  Verified the local app still scrapes fine with this change.

## Steps

### Phase 1 — Create a Hugging Face account (you do this)
1. Sign up at huggingface.co — email + password, **no card required**.
2. Verify your email.

### Phase 2 — Create the Space (you do this)
1. Go to huggingface.co/new-space.
2. Name it (e.g. `air-competition-analysis`), owner = your account.
3. **License**: any (e.g. MIT). **SDK**: choose **Docker** → **Blank**.
4. **Visibility**: **Private** (recommended — this app automates logins against real sites).
5. Create the Space. This gives you a git remote:
   `https://huggingface.co/spaces/<your-username>/air-competition-analysis`

### Phase 3 — Add your credentials as Secrets (you do this)
In the Space → **Settings → Variables and secrets → New secret**, add:
- `SHARETRIP_EMAIL`, `SHARETRIP_PASSWORD`
- `GOZAYAAN_EMAIL`, `GOZAYAAN_PASSWORD`

(Shohoz needs none — its search API is public.) These become env vars in the container;
`server.js`'s `dotenv` won't override them, so no `.env` file is needed on the Space.

### Phase 4 — Push the app to the Space
The project isn't its own git repo yet (it lives inside the larger `AntiGravity-Project` folder),
so we give it a dedicated repo and push it to the Space. Two options:

- **You push it** (keeps your HF token private): create a User Access Token at
  huggingface.co/settings/tokens (write scope), then from the project folder:
  ```bash
  git init
  git add .
  git commit -m "Deploy Air Competition Analysis to HF Spaces"
  git branch -M main
  git remote add space https://huggingface.co/spaces/<your-username>/air-competition-analysis
  git push space main         # username = your HF username, password = the access token
  ```
- **Or I push it** — if you paste me the Space URL + a write token, I'll run the above. (A token
  is sensitive; only share it if you're comfortable, and you can revoke it afterwards.)

`.gitignore` already excludes `node_modules/`, `.env`, `results/`, `*.log`, so nothing sensitive
goes up.

### Phase 5 — First build & verification
1. On push, HF builds the Docker image automatically (watch the Space's **Logs/Building** tab —
   first build takes a few minutes for the Playwright image).
2. Once "Running", open `https://<your-username>-air-competition-analysis.hf.space`.
3. Confirm: the dashboard loads, a real search shows **live WebSocket progress** (this verifies
   HF's proxy passes the WebSocket upgrade — the one thing to watch on first deploy), and returns
   matched comparison results.
4. Watch the Space logs during that first search to confirm Chromium launches without errors.

## Update workflow going forward
Push-to-deploy: edit locally, then
```bash
git add . && git commit -m "..." && git push space main
```
HF rebuilds and redeploys automatically. No SSH, no manual restart.

## Caveats / things to watch
- **48 h idle sleep**: the first request after a long idle pays a cold start (container restart +
  Chromium launch). Fine for personal use; can be kept warm with a scheduled ping if desired.
- **Ephemeral disk**: `results/` CSVs don't persist across restarts — fine, they're downloaded by
  the user anyway.
- **WebSocket**: expected to work through HF's proxy (Gradio apps use WS the same way); the Phase 5
  live-search check is the confirmation. If it doesn't upgrade, fall back to the polling approach.
- **HF acceptable-use**: this is a personal scraping tool on a private Space — low risk, but it is
  HF's platform, so keep it private and personal.
