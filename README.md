---
title: Air Competition Analysis
emoji: ✈️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Air Competition Analysis

Compares real-time flight prices across **ShareTrip**, **GoZayaan**, and **Shohoz** —
standard vs. discounted fares, side by side.

This Space runs an Express + WebSocket server that drives three Playwright (headless Chromium)
scrapers in parallel. The Dockerfile builds the whole app; the container listens on port 7860.

## Configuration

Set these as **Space Secrets** (Settings → Variables and secrets) — never commit them:

- `SHARETRIP_EMAIL`, `SHARETRIP_PASSWORD`
- `GOZAYAAN_EMAIL`, `GOZAYAAN_PASSWORD`

(Shohoz needs no credentials — its search API is public.)
