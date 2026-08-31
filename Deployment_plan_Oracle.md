# Deploy to Oracle Cloud "Always Free" + DuckDNS

## Context

The user wanted to deploy this flight-comparison dashboard somewhere free. Vercel doesn't fit without a substantial rewrite (no persistent WebSocket server, no bundled Chromium, function execution-time caps far below this app's 30–90s per-platform scrape time — see prior discussion). Render's free tier sleeps after ~15 min idle, which combined with Chromium's own cold-start would make the first search after any gap feel broken. **Oracle Cloud's "Always Free" tier** is the one genuinely free option that's also a real always-on VM (up to 24GB RAM on the Ampere A1 shape) — no sleep, no serverless rewrite needed, since this app already runs unmodified on any persistent-process host (`server.js` already reads `process.env.PORT`; the frontend's WebSocket client already connects via `window.location.host` dynamically, not a hardcoded address).

**Decided division of labor**: the user handles anything requiring their own identity/payment/account access (Oracle signup, VM creation, DuckDNS signup) — I handle everything reachable over SSH once the VM exists (installing Node/PM2/nginx/Chromium's dependencies, deploying the app, HTTPS setup). For future updates: the user pushes code to GitHub as normal, tells me, and I SSH in and run a one-command deploy script.

## Step-by-Step Plan

### Phase 1 — Create your Oracle Cloud account (you do this)
1. Go to oracle.com/cloud/free and sign up: email, name, address.
2. Verify identity: phone number (SMS/call code) + a card on file (for verification only — Always Free resources are never charged, though some people see a small temporary authorization hold that gets released).
3. **Choose your Home Region carefully during signup — this is permanent and cannot be changed later.** Pick whichever available region is geographically closest/most relevant (e.g. Mumbai/Hyderabad or Singapore, since Oracle has no Bangladesh region) — this affects latency both for you accessing the dashboard and the server reaching ShareTrip/GoZayaan/Shohoz.
4. Wait for account activation. Known Oracle quirk: Always Free Ampere (ARM) capacity is sometimes reported as unavailable in a given region — if you hit that, it's a documented, common issue; retrying later or picking a different available region usually resolves it.

### Phase 2 — Create the VM (you do this)
1. Log into the OCI Console (cloud.oracle.com) → hamburger menu → **Compute → Instances → Create Instance**.
2. Name it (e.g. `air-price-analysis`).
3. **Image**: click "Change Image" → select **Ubuntu** (latest LTS).
4. **Shape**: click "Change Shape" → **Ampere (ARM)** → `VM.Standard.A1.Flex` → set OCPUs/memory within your Always Free allowance (up to 4 OCPUs / 24GB total — a single instance can use all of it).
5. **Networking**: keep the default VCN, make sure "Assign a public IPv4 address" is checked.
6. **SSH keys**: let Oracle generate a key pair and **download the private key immediately** (only shown once) — this is what you'll hand to me later.
7. Click **Create**, wait a few minutes, then note the instance's public IP once it's running.

### Phase 3 — Open the firewall ports (you do this)
1. From the instance's detail page → click the subnet link under "Primary VNIC" → click into its **Security List**.
2. Add two Ingress Rules: Source `0.0.0.0/0`, TCP, port **80**; and another for port **443**. (Port 22/SSH is open by default.)
3. Heads-up: Oracle's Ubuntu images often *also* have an OS-level firewall blocking these ports even after the Security List is opened — a well-known gotcha with this specific free tier. I'll check for and fix this myself once I have SSH access, no action needed from you here.

### Phase 4 — DuckDNS subdomain (you do this)
1. Go to duckdns.org, sign in with an existing account (Google/GitHub/etc. — no separate signup needed).
2. Type a subdomain name (e.g. `airpriceanalysis`) and click **add domain** → gives you `airpriceanalysis.duckdns.org`.
3. Paste your Oracle VM's public IP into the "current ip" field for that domain, click **update ip**. Since the VM's IP is static, this is one-time — no ongoing maintenance.

### Phase 5 — Put the project in its own GitHub repo (I can do this in parallel, doesn't need Oracle/DuckDNS)
This project currently lives inside a larger, uncommitted parent folder (`AntiGravity-Project`) alongside unrelated sibling projects — it has no dedicated git history of its own yet. The Oracle VM needs to `git clone` this project specifically, so:
- Initialize a **new, separate git repository scoped to just this `Air Price Analysis` folder** (not the parent).
- Create a **private** GitHub repo for it (recommended, since this code automates login sessions against 3 real commercial sites — better kept private than public) via `gh repo create` (the `gh` CLI is already available in this environment).
- Push the initial commit. `.gitignore` already excludes `node_modules/`, `.env`, `results/`, `*.log`, so no secrets go up.
- This can be done right away, independent of the Oracle account/VM steps above.

### Phase 6 — Hand off access (you do this)
Share with me:
- The VM's public IP address
- The SSH private key (or confirm the VM's SSH user/port if using a different auth method)
- The DuckDNS domain you chose

*(Note: sharing an SSH private key is sensitive — if you'd rather not paste it directly, an alternative is generating a fresh keypair yourself and adding just the public key to the VM's `~/.ssh/authorized_keys`, then sharing only the private key over a channel you trust, or restricting what that key can do. Flagging this so you can decide; happy to proceed either way.)*

### Phase 7 — Server setup (I do this over SSH, once I have access)
1. `apt update && apt upgrade`, install `git`, build essentials.
2. Install Node.js (via NodeSource) and PM2 globally (`npm install -g pm2`).
3. Clone the private GitHub repo from Phase 5.
4. `npm install`, then `npx playwright install --with-deps chromium` — installs Chromium plus every required OS library directly on the VM (no Docker needed here, unlike a PaaS host, since we have full OS access).
5. Recreate `.env` directly on the VM with the ShareTrip/GoZayaan/Shohoz credentials (same values as your local `.env`).
6. Start the app under PM2: `pm2 start server.js --name air-price-analysis`, then `pm2 save` and `pm2 startup` so it automatically restarts if the VM ever reboots.
7. Install and configure **nginx** as a reverse proxy: port 80/443 → the app's port 3000, with correct `Upgrade`/`Connection` headers so the WebSocket connection passes through nginx correctly (a common point of failure if misconfigured).
8. Run `certbot --nginx` (free Let's Encrypt) against the DuckDNS domain for a real, auto-renewing HTTPS certificate — needed for a secure `wss://` WebSocket connection from a real domain.
9. Add a small deploy script for future updates (see below).

### Update workflow going forward
No auto-deploy-on-push (that's a Vercel/Render-specific feature a raw VM doesn't have). Going forward:
1. You edit code locally and `git push` to the private GitHub repo, exactly like today.
2. You let me know a push is ready.
3. I SSH in and run:
   ```bash
   #!/bin/bash
   cd /path/to/app
   git pull origin main
   npm install
   pm2 restart air-price-analysis
   ```
   PM2 restarts the process with near-zero downtime. (This can later be upgraded to a GitHub Actions workflow that triggers this automatically on push, if you want true push-to-deploy — not part of this initial setup.)

### Verification
- `curl https://yourappname.duckdns.org/api/airports` returns the airport list over HTTPS.
- A real search from the dashboard in a browser, over the public DuckDNS URL, shows live per-platform WebSocket progress and returns matched comparison results — confirms nginx is correctly proxying both regular HTTP and the WebSocket upgrade.
- `pm2 list` shows the app running; reboot the VM once via the Oracle console and confirm the app comes back up on its own (`pm2 startup` working).
- Confirm the GitHub repo is private and contains no `.env`/credentials.
