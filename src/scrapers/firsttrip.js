/**
 * FirstTrip Scraper
 *
 * Flow: Load the homepage -> intercept the search request it fires and rewrite it into a real
 * one-way search -> drain the streamed response -> extract price breakdown.
 *
 * FirstTrip's search (`POST b2c-api.firsttrip.com/flight/api/v1/Search`) is a public endpoint —
 * no login required — but every request carries a signed, time-limited `sxsrf` header minted by
 * the page's own JS. There's no way to replay that from a bare HTTP call (unlike Shohoz's search),
 * so a real page load is required. The homepage's search widget also always defaults to a
 * round-trip search (with a prefilled return leg) rather than one-way, and there's no query-string
 * shortcut that changes that. Rather than fighting the date pickers to switch the widget to "One
 * Way", `page.route` rewrites the outgoing request body to a genuine one-way search just before it
 * is sent — confirmed live that the `sxsrf` header's validity does not depend on the body content,
 * so the page's own (real) header survives the rewrite untouched.
 *
 * The response streams back as Server-Sent Events — several "data: {...}" chunks arriving as
 * different fare suppliers respond, not one cumulative JSON blob — so chunks are parsed and
 * merged (deduped by `itemCodeRef`) before normalizing.
 *
 * The search response's `finalTotalPrice` / `finalTotalPriceWithCoupon` are NOT the final payable
 * amounts, despite `convenienceChargeAmount` reading 0 there — the real "Convenience fee" only
 * appears later, in the (authenticated) booking flow's fare summary, and is not returned by the
 * public search API at all. It has to be derived: confirmed against a real logged-in checkout
 * (DAC-CXB, US-Bangla, one-way) — Air Fare 4,349, coupon "FTDOM26" -515, Convenience fee +76,
 * Total 3,910 — that 76 is `Math.floor(3834 * 0.02)`, i.e. 2% of the POST-discount subtotal,
 * floored (3834 * 0.02 = 76.68). The undiscounted side of that same fare is unverified (no eligible
 * fare without a discount was observed) but applies the identical rate for consistency, mirroring
 * how GoZayaan's convenience fee is likewise a rate applied per-subtotal (see gozayaan.js).
 *
 * Coupon selection itself is NOT hardcoded — FirstTrip's search response already names whichever
 * coupon or dynamic discount its own pricing engine picked for THAT specific fare/airline (e.g.
 * "FTBGDOM" for Biman, "FTDOM26"/"FTBSDOM" for US-Bangla & Air Astra) via `couponCode` /
 * `dynamicDiscountCode` — this scraper just reads whichever one the API says won, per fare.
 */

const { chromium } = require('playwright');
const { AIRLINES, SCRAPER_CONFIG } = require('../config');

// See the header note above — derived from one real checkout, not returned by the search API.
const CONVENIENCE_FEE_RATE = 0.02;

const HOME_URL = 'https://firsttrip.com/flight';
const SEARCH_URL_PATTERN = '**/flight/api/v1/Search';

async function search({ from, to, date, onProgress }) {
  const browser = await chromium.launch({ headless: true, args: SCRAPER_CONFIG.chromiumArgs });
  try {
    const context = await browser.newContext({ userAgent: SCRAPER_CONFIG.userAgent });
    const page = await context.newPage();

    onProgress?.('firsttrip', 'searching', 'Searching flights on FirstTrip...');
    const fares = await runSearch(page, from, to, date);
    if (fares.length === 0) return [];

    onProgress?.('firsttrip', 'extracting', 'Extracting price breakdowns...');
    return fares.map((f) => normalizeFlight(f, from, to)).filter(Boolean);
  } finally {
    await browser.close();
  }
}

async function runSearch(page, from, to, date) {
  await page.route(SEARCH_URL_PATTERN, async (route) => {
    const req = route.request();
    let body;
    try {
      body = JSON.parse(req.postData() || '{}');
    } catch (e) {
      body = {};
    }
    body.tripTypeId = 1;
    body.routes = [{ origin: from, destination: to, departureDate: date }];
    await route.continue({ postData: JSON.stringify(body) });
  });

  let rawBody = null;
  page.on('response', async (res) => {
    if (rawBody || res.request().method() !== 'POST') return;
    if (!/\/flight\/api\/v1\/Search$/i.test(res.url())) return;
    try {
      const text = await res.text();
      if (text && text.includes('airSearchResponses')) rawBody = text;
    } catch (e) {
      // response body unreadable — leave rawBody unset, caller treats that as no results
    }
  });

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: SCRAPER_CONFIG.timeout });
  await page
    .locator('button:visible', { hasText: 'Search' })
    .first()
    .click({ timeout: SCRAPER_CONFIG.timeout });

  // Wait for the SEARCH RESPONSE, not for the page to fall quiet. `res.text()` above resolves only
  // once the whole SSE stream has ended, so a non-null rawBody already means every fare batch has
  // arrived — there is nothing further to gain by waiting for networkidle, which keeps ticking on
  // analytics, fonts and images long after the fares are in.
  const deadline = Date.now() + SCRAPER_CONFIG.searchTimeout;
  while (!rawBody && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }

  return rawBody ? parseSSE(rawBody) : [];
}

/**
 * The response body is several "data: {...}" SSE events concatenated, each carrying its own batch
 * of `airSearchResponses`. Batches can repeat the same fare across events, so dedupe by
 * `itemCodeRef` (unique per fare) rather than concatenating everything.
 */
function parseSSE(raw) {
  const chunks = raw.split(/(?=^data:\s*)/m).filter(Boolean);
  const byKey = new Map();

  for (const chunk of chunks) {
    const jsonStr = chunk.replace(/^data:\s*/, '').trim();
    if (!jsonStr) continue;
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      continue;
    }
    const responses = parsed?.data?.airSearchResponseWithFilters?.airSearchResponses || [];
    for (const r of responses) {
      const key = r.itemCodeRef || r.uniqueTransID;
      if (key && !byKey.has(key)) byKey.set(key, r);
    }
  }

  return [...byKey.values()];
}

function normalizeFlight(fare, from, to) {
  // `directions[0]` is the (single, since this is a one-way search) outbound direction, itself
  // wrapping one itinerary object that holds the actual per-segment flight data.
  const itinerary = fare.directions?.[0]?.[0];
  const segments = itinerary?.segments || [];
  if (segments.length === 0) return null;

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const airlineCode = fare.marketingCarrierCode;
  const airlineMeta = AIRLINES[airlineCode];

  const baseFare = fare.finalBasePrice;
  const taxes = fare.finalTaxPrice;
  // `finalTotalPrice` / `finalTotalPriceWithCoupon` are the pre-fee subtotals the search API
  // returns; the convenience fee (see header note) is computed on each one independently and
  // added on top, since a coupon changes the subtotal the fee itself is a percentage of.
  const subtotalStandard = fare.finalTotalPrice;
  const subtotalDiscounted = fare.finalTotalPriceWithCoupon ?? subtotalStandard;

  const convenienceFee = Math.floor(subtotalStandard * CONVENIENCE_FEE_RATE);
  const totalStandard = subtotalStandard + convenienceFee;

  const discountedConvenienceFee = Math.floor(subtotalDiscounted * CONVENIENCE_FEE_RATE);
  const totalBkash = subtotalDiscounted + discountedConvenienceFee;

  const bkashDiscount = totalStandard - totalBkash;
  // FirstTrip's pricing engine applies whichever of TWO discount mechanisms nets the better
  // price: a selectable `couponCode` (e.g. "FTDOM26"), or an auto-applied `dynamicDiscountCode`
  // (e.g. "FTBGDOM") when `isDynamicDiscountApplied` is true — `finalTotalPriceWithCoupon`
  // reflects whichever one actually won, so both have to be checked, not just `couponCode`.
  const discountCoupon = bkashDiscount > 0
    ? fare.couponCode || (fare.isDynamicDiscountApplied ? fare.dynamicDiscountCode : null)
    : null;

  // Join every segment's flight number so connecting itineraries are represented in full
  // (e.g. "BS141 + BS205") instead of silently truncating to the first leg — this is also
  // what compare.js matches across platforms by, so only identical itineraries get compared.
  const flightNo = segments.map((s) => `${s.operatingCarrierCode} ${s.flightNumber}`).join(' + ');
  const stops = segments.length - 1;
  const layoverAirports = segments.slice(0, -1).map((s) => s.destinationAirportCode);
  const baggage = firstSegment.passengerBaggages?.[0]?.checkInBaggageInKg;

  return {
    platform: 'firsttrip',
    airline: airlineMeta?.name || fare.marketingCarrierName,
    airlineLogo: airlineMeta?.logo,
    flightNo,
    departure: formatTime(firstSegment.departureTime),
    arrival: formatTime(lastSegment.arrivalTime),
    // `totalFlightDuration` already aggregates the whole itinerary (including any layover wait).
    duration: itinerary.totalFlightDuration || '',
    stops,
    layoverAirports,
    class: firstSegment.cabinClass || 'Economy',
    baggage: baggage ? `${baggage}kg` : '20kg',
    route: `${from} → ${to}`,
    pricing: {
      baseFare,
      taxes,
      convenienceFee,
      totalStandard,
      platformPrice: subtotalStandard,
      bkashDiscount,
      totalBkash,
      discountCoupon,
    },
  };
}

function formatTime(isoDateTime) {
  if (!isoDateTime) return '';
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

module.exports = { search };
