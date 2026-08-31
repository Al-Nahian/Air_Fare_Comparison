/**
 * Configuration — Airport data, coupon codes, and scraper settings
 */

// Worldwide commercial airports (large/medium, scheduled service), code -> {code, name, city, country}.
// Generated from OurAirports' public dataset — see src/data/airports.json.
const AIRPORTS = require('./data/airports.json');

// Shared airline directory — code, display name, and logo path (served from public/images/airlines).
const AIRLINES = {
  BG: { name: 'Biman Bangladesh Airlines', flightBase: 400, logo: '/images/airlines/bg.svg' },
  BS: { name: 'US-Bangla Airlines', flightBase: 100, logo: '/images/airlines/bs.svg' },
  VQ: { name: 'Novo Air', flightBase: 700, logo: '/images/airlines/vq.svg' },
  '2A': { name: 'Air Astra', flightBase: 900, logo: '/images/airlines/x1.svg' },
};

// Sentinel for a `PLATFORM_COUPONS[...]` slot: match EVERY Hot Deal rather than one campaign
// prefix, so the best-paying deal wins whatever it happens to be called. Real campaign codes
// never contain "*", so this can't collide with one.
const ANY_COUPON = '*';

// Coupon codes driving the two prices we show per platform:
//   `platform` -> "Total (After Platform Discount)"
//   `discount` -> "Discounted Price (Coupon: <name>)"
// All codes are matched as a case-insensitive PREFIX, because the real codes carry rotating
// route/month suffixes (e.g. "INTFLY0726", "DOMB0726") and inconsistent casing ("bKASHDOM26").
const PLATFORM_COUPONS = {
  sharetrip: {
    // ShareTrip auto-applies a default "preferred fare" coupon (FLYINSIDE domestic /
    // FLIGHTINT international) — that IS the platform discount, already baked into each search
    // result's `promotionalCoupon.finalPriceAfterDiscount`. The `discount` coupon below is a
    // percentage that STACKS on top of it (verified live: domestic 4,124 − 2% of base = 4,141
    // final, matching the real booking page).
    domestic: { platform: 'FLYINSIDE', discount: 'BKASHDOM' },
    international: { platform: 'FLIGHTINT', discount: 'FLYGPSTAR' },
  },
  gozayaan: {
    // GoZayaan's "Hot Deals" are mutually exclusive — you pick one, and it applies to the raw
    // subtotal. So the two prices below are ALTERNATIVES, not stacked.
    domestic: { platform: 'GOFLY', discount: 'DOMB' },
    // International prices against whichever Hot Deal pays most, rather than one fixed campaign.
    // AMEX0126 beat the INTFLY campaign used previously on every carrier checked (AI, BG, BS, 6E,
    // UL, QR, EK, TG, MH, FZ) by 668-1,337 taka on a 16,712 base fare. Caveat: the winner is
    // usually a CARD-RESTRICTED offer, so this column is no longer a like-for-like coupon against
    // the other platforms' open ones.
    international: { platform: 'GOFLY', discount: ANY_COUPON },
  },
  shohoz: {
    // Shohoz has no selectable coupons. Its platform discount is already in the search response;
    // OCDOM/OCINT are flat extra rates on base fare.
    domestic: { platform: null, discount: 'OCDOM' },
    international: { platform: null, discount: 'OCINT' },
  },
};

const SCRAPER_CONFIG = {
  timeout: 60000,        // 60s max wait per operation
  searchTimeout: 90000,  // 90s for search results to load
  retries: 2,
  delayBetweenActions: 1500,  // 1.5s between actions (be polite)
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Required when Chromium runs as root inside a container (e.g. the deployment Docker image);
  // harmless locally. Without --no-sandbox, Chromium refuses to start as root.
  chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
};

const PLATFORM_COLORS = {
  sharetrip: '#0ea5e9',
  gozayaan: '#2563eb',
  shohoz: '#16a34a',
};

module.exports = {
  AIRPORTS,
  AIRLINES,
  ANY_COUPON,
  PLATFORM_COUPONS,
  SCRAPER_CONFIG,
  PLATFORM_COLORS,
};
