/**
 * ShareTrip Scraper
 *
 * Flow: Login (UI) -> Search (JSON API) -> discount lookup -> price breakdown
 *
 * ShareTrip's flight-search results are driven by its own JSON API
 * (api.sharetrip.net/api/v2/flight/search/*), which is far faster and more reliable than
 * scraping the rendered result cards.
 *
 * Two prices are produced per flight:
 *
 *  1. "Total (After Platform Discount)" — ShareTrip auto-applies a default preferred-fare coupon
 *     to every result (FLYINSIDE domestic / FLIGHTINT international, both flagged `isDefault`).
 *     That reduction is already baked into `promotionalCoupon.finalPriceAfterDiscount` on the
 *     search result, so it needs no extra call.
 *
 *  2. "Discounted Price (Coupon: …)" — a selectable coupon (bKASHDOM… domestic /
 *     FLYGPSTAR… international) whose percentage STACKS on top of that preferred fare.
 *     Its rate comes from `/search/details`, which returns every coupon for a flight with its
 *     `discount` percentage and cap. Rates differ by airline, so it's fetched once per unique
 *     carrier. This replaced an older booking-page + coupon-click flow that was by far the
 *     slowest part of the app.
 */

const { chromium } = require('playwright');
const { AIRPORTS, AIRLINES, PLATFORM_COUPONS, SCRAPER_CONFIG } = require('../config');
const { loadStorageState, saveStorageState } = require('../session-store');

const API_BASE = 'https://api.sharetrip.net';
const BD_DOMESTIC_AIRPORTS = new Set(['DAC', 'CXB', 'CGP', 'ZYL', 'RJH', 'SPD', 'JSR', 'BZL']);
// Verified live: 50 is accepted, 200 is rejected with HTTP 400.
const RESULTS_PAGE_LIMIT = 50;
// Safety net so an unstable `totalFlightsCount` can't page forever (50 x 8 = 400 flights).
const MAX_RESULT_PAGES = 8;
// Consecutive page-1 polls with no growth in `totalFlightsCount` before the search counts as
// settled, and the gap between those polls.
const TOTAL_STEADY_POLLS = 4;
const RESULTS_POLL_MS = 1500;

// ShareTrip charges a ~2% convenience fee on the post-discount amount (observed consistently
// across both the standard and bKash-discounted totals during manual verification).
const CONVENIENCE_FEE_RATE = 0.02;

async function search({ from, to, date, returnDate, onProgress }) {
  const isRoundTrip = !!returnDate;
  const browser = await chromium.launch({ headless: true, args: SCRAPER_CONFIG.chromiumArgs });
  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1200 },
      userAgent: SCRAPER_CONFIG.userAgent,
      // Restore the previous run's cookies/localStorage so login is usually a no-op.
      storageState: loadStorageState('sharetrip'),
    });
    const page = await context.newPage();

    // Only log in up front when there's no saved session. Otherwise the search-results page load
    // below doubles as the session check — it has to happen anyway, so validating the session via
    // a separate homepage visit just cost a wasted page load (~4-5s) on every warm run.
    if (!loadStorageState('sharetrip')) {
      onProgress?.('sharetrip', 'logging_in', 'Logging into ShareTrip...');
      await login(page, context);
    }

    onProgress?.('sharetrip', 'searching', 'Searching flights on ShareTrip...');
    let searchId = await startSearch(page, from, to, date, returnDate);
    // No searchId, or no token once we're on the origin => the restored session was stale.
    // Log in for real and retry exactly once so a broken login can't loop.
    if (!searchId || !(await readAccessToken(page))) {
      onProgress?.('sharetrip', 'logging_in', 'Logging into ShareTrip...');
      await login(page, context);
      onProgress?.('sharetrip', 'searching', 'Searching flights on ShareTrip...');
      searchId = await startSearch(page, from, to, date, returnDate);
    }
    if (!searchId) return [];

    // Headers the site's own XHRs send; our direct API calls are rejected without them.
    const apiHeaders = await buildApiHeaders(page);
    const matchedFlights = await collectResults(context, apiHeaders, searchId);
    if (matchedFlights.length === 0) return [];

    onProgress?.('sharetrip', 'extracting', 'Extracting price breakdowns...');
    const isDomestic = BD_DOMESTIC_AIRPORTS.has(from) && BD_DOMESTIC_AIRPORTS.has(to);
    const coupons = isDomestic ? PLATFORM_COUPONS.sharetrip.domestic : PLATFORM_COUPONS.sharetrip.international;

    const couponByCarrier = await getCouponByCarrier(context, apiHeaders, searchId, matchedFlights, coupons.discount);

    return matchedFlights
      .map((flight) => normalizeFlight(
        flight,
        from,
        to,
        couponByCarrier.get(flight.legs?.[0]?.segments?.[0]?.airlines?.code),
        isRoundTrip
      ))
      .filter(Boolean);
  } finally {
    await browser.close();
  }
}

/**
 * Full UI login. Only called when there's genuinely no usable session — the caller decides that,
 * either because no session file exists or because the search page came back signed out.
 */
async function login(page, context) {
  await page.goto('https://www.sharetrip.net/', { waitUntil: 'domcontentloaded', timeout: SCRAPER_CONFIG.timeout });
  await page.waitForTimeout(2000);
  // A full-screen #global-loader covers the page while it hydrates and swallows clicks.
  await page.locator('#global-loader').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});

  const signInBtn = page.locator('.header-sign-in-btn').first();
  await signInBtn.waitFor({ state: 'visible', timeout: 15000 });
  await signInBtn.click();
  await page.waitForTimeout(1500);
  await page.fill('#email', process.env.SHARETRIP_EMAIL);
  await page.fill('#password', process.env.SHARETRIP_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Persist the fresh session for the next search.
  await saveStorageState(context, 'sharetrip');
}

/**
 * Reads the auth token the site stores client-side. Only works once the page is on the
 * sharetrip.net origin — its presence is what tells us a restored session is still signed in.
 */
async function readAccessToken(page) {
  return page.evaluate(() => localStorage.getItem('accessToken')).catch(() => null);
}

/**
 * Build the search-results URL the site itself navigates to. The full parameter set matters —
 * a trimmed-down URL loads the page but never fires the search.
 *
 * Round trip (captured from the site's own UI): tripType=Return and the `depart` param appears
 * TWICE — first the outbound date, then the return date. Everything else is identical to one-way.
 */
function buildSearchUrl(from, to, date, returnDate) {
  const label = (code) => {
    const a = AIRPORTS[code];
    return a ? `${a.country}, ${a.name} (${code})` : code;
  };
  const cityOf = (code) => AIRPORTS[code]?.city || code;
  const params = new URLSearchParams({
    adult: '1', child: '0', child2To5Count: '0', child6To12Count: '0',
    class: 'Economy', depart: date,
    destination: to, destinationAirport: label(to), destinationCity: cityOf(to),
    infant: '0', occupation: 'NOT_SELECTED',
    origin: from, originAirport: label(from), originCity: cityOf(from),
    tripType: returnDate ? 'Return' : 'OneWay',
  });
  // A second `depart` = the return date. URLSearchParams keeps both when appended.
  if (returnDate) params.append('depart', returnDate);
  return `https://sharetrip.net/flight-search?${params.toString()}`;
}

// The API rejects requests that don't carry the same headers the site's own XHRs send.
async function buildApiHeaders(page) {
  const accessToken = await readAccessToken(page);
  return {
    accept: 'application/json, text/plain, */*',
    accesstoken: accessToken || '',
    'country-code': 'BD',
    currency: 'BDT',
    timezone: 'Asia/Dhaka',
    referer: 'https://sharetrip.net/',
  };
}

/**
 * Load the site's real search-results page and capture the `searchId` its JS receives.
 *
 * `/search/initialize` is guarded by an `x-sort-live-token` header that ShareTrip's own JS
 * generates fresh for every search (it's not in localStorage/cookies and changes each time), so
 * replaying that call ourselves returns 401. Every *other* flight endpoint still accepts our
 * direct calls, so this navigation is the only step that needs the browser — and it doubles as
 * the session check, since a signed-out page leaves no `accessToken` behind.
 *
 * Returns the searchId, or null if the page never fired the request.
 */
async function startSearch(page, from, to, date, returnDate) {
  let searchId = null;
  const onResponse = async (res) => {
    if (!res.url().includes('/flight/search/initialize')) return;
    try {
      searchId = (await res.json())?.response?.searchId || searchId;
    } catch (e) {
      // non-JSON / already-consumed response — ignore and keep waiting
    }
  };
  page.on('response', onResponse);

  try {
    await page.goto(buildSearchUrl(from, to, date, returnDate), {
      waitUntil: 'domcontentloaded',
      timeout: SCRAPER_CONFIG.timeout,
    });
    const initDeadline = Date.now() + SCRAPER_CONFIG.timeout;
    while (!searchId && Date.now() < initDeadline) await delay(500);
  } finally {
    page.off('response', onResponse);
  }

  return searchId;
}

/**
 * Poll `available-flights` for page 1 until the result set settles, then page through the rest.
 *
 * `limit` is capped server-side (50 is accepted, 200 returns HTTP 400), and busy routes hold far
 * more than one page — DAC-BKK reported `totalFlightsCount=136`. Stopping at page 1 meant judging
 * ShareTrip on its first 50 flights only, so genuine cross-platform matches were missed.
 */
async function collectResults(context, headers, searchId) {
  const availableUrl = `${API_BASE}/api/v2/flight/search/available-flights?searchId=${searchId}`;
  const fetchPage = (pageNo) => context.request.post(availableUrl, {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { page: pageNo, limit: RESULTS_PAGE_LIMIT },
    timeout: SCRAPER_CONFIG.timeout,
  });

  const deadline = Date.now() + SCRAPER_CONFIG.searchTimeout;
  let matchedFlights = [];
  // `totalFlightsCount` is not a stable figure — it keeps climbing as more of ShareTrip's
  // backend sources respond (confirmed live: a domestic search settles in one poll, but an
  // international search can report e.g. 36/36 "complete" on one poll and then jump to 50/97
  // on the next). Treating one matched===total snapshot as final caused us to stop polling with
  // only a small fraction of the real results. Require that reading to hold for two consecutive
  // polls before trusting it; otherwise keep polling until the timeout and return whatever's
  // accumulated (results also appear capped at 50 per response regardless of the true total).
  let steadyPolls = 0;
  let expectedTotal = 0;
  while (Date.now() < deadline) {
    const body = await (await fetchPage(1)).json().catch(() => ({}));
    const flights = body.response?.matchedFlights || [];
    const total = body.response?.totalFlightsCount || 0;
    if (flights.length > matchedFlights.length) matchedFlights = flights;
    if (total > expectedTotal) {
      expectedTotal = total;
      steadyPolls = 0;
    } else {
      steadyPolls++;
    }
    // The search is settled once the reported total stops growing — NOT once `matched === total`.
    // That equality holds trivially at the start of a search, when only a source or two has
    // reported, and returned 2 flights of an eventual 20 on DAC-CXB.
    if (matchedFlights.length > 0 && steadyPolls >= TOTAL_STEADY_POLLS) break;
    await delay(RESULTS_POLL_MS);
  }

  // Fetch the remaining pages concurrently rather than one after another. `totalFlightsCount` is
  // still climbing at this point, though, so sizing the fan-out from a single reading truncates
  // the results — under parallel load DAC-DXB settled at a total of 73 and we returned 73 of 182.
  // Re-read the total after each round and pick up whatever pages it newly reveals.
  const seen = new Set(matchedFlights.map((f) => f.sequenceCode));
  const absorb = (flights) => {
    for (const f of flights || []) {
      if (seen.has(f.sequenceCode)) continue;
      seen.add(f.sequenceCode);
      matchedFlights.push(f);
    }
  };
  const pageFlights = (pageNo) => fetchPage(pageNo)
    .then(async (res) => (res.ok() ? (await res.json()).response?.matchedFlights || [] : []))
    .catch(() => []);

  let fetchedUpTo = 1;
  while (fetchedUpTo < MAX_RESULT_PAGES && Date.now() < deadline) {
    const pagesNeeded = Math.min(Math.ceil(expectedTotal / RESULTS_PAGE_LIMIT), MAX_RESULT_PAGES);
    if (pagesNeeded <= fetchedUpTo) break;

    const rest = await Promise.all(
      Array.from({ length: pagesNeeded - fetchedUpTo }, (_, i) => pageFlights(fetchedUpTo + 1 + i))
    );
    rest.forEach(absorb);
    fetchedUpTo = pagesNeeded;

    // Refresh the total; if more backend sources have reported in, the loop fetches their pages.
    const body = await (await fetchPage(1)).json().catch(() => ({}));
    absorb(body.response?.matchedFlights);
    expectedTotal = Math.max(expectedTotal, body.response?.totalFlightsCount || 0);
  }

  return matchedFlights;
}

/**
 * Look up the discount coupon's rate once per unique carrier.
 *
 * The `/search/details` endpoint returns the FULL coupon list for a flight — every coupon with
 * its `discount` percentage and `maximumDiscountAmount` cap — so a single cheap API call per
 * carrier replaces what used to be a booking-page visit + coupon click per carrier (that browser
 * flow was the slowest part of the whole app). Rates genuinely differ by airline, which is why
 * this is per-carrier rather than once globally.
 */
async function getCouponByCarrier(context, headers, searchId, matchedFlights, couponPrefix) {
  // One representative flight per carrier, then fetch them all at once. Long international routes
  // span ~25 carriers, and doing these serially cost ~35s of pure round-trip latency.
  const representatives = new Map();
  for (const flight of matchedFlights) {
    const carrier = flight.legs?.[0]?.segments?.[0]?.airlines?.code;
    if (carrier && !representatives.has(carrier)) representatives.set(carrier, flight.sequenceCode);
  }

  const lookups = [...representatives].map(async ([carrier, sequenceCode]) => {
    try {
      const url = `${API_BASE}/api/v2/flight/search/details?searchId=${searchId}&sequenceCode=${sequenceCode}`;
      const body = await (await context.request.get(url, { headers, timeout: SCRAPER_CONFIG.timeout })).json();
      const coupon = (body.response?.promotionalCoupon || []).find((c) => startsWithCI(c.couponCode, couponPrefix));
      return [carrier, coupon
        ? { pct: Number(coupon.discount) || 0, max: Number(coupon.maximumDiscountAmount) || 0, code: couponPrefix }
        : null];
    } catch (e) {
      return [carrier, null]; // coupon lookup failed — fall back to no extra discount
    }
  });

  return new Map(await Promise.all(lookups));
}

// Codes carry rotating suffixes and inconsistent casing (e.g. "bKASHDOM26"), so match loosely.
function startsWithCI(value, prefix) {
  return String(value || '').toUpperCase().startsWith(String(prefix || '').toUpperCase());
}

// Coupon rates are a percentage of BASE FARE, optionally capped by `maximumDiscountAmount`
// (a cap of 0 means "no cap").
function applyCouponPercent(baseFare, couponInfo) {
  if (!couponInfo || !couponInfo.pct) return 0;
  const raw = Math.round(baseFare * (couponInfo.pct / 100));
  return couponInfo.max > 0 ? Math.min(raw, couponInfo.max) : raw;
}

/**
 * Summarize one ShareTrip leg (a direction) into the leg-level fields the UI shows. ShareTrip's
 * `leg` already aggregates the whole itinerary — arrival/duration/stops include any connection —
 * so those come from the leg, not from an individual segment.
 */
function summarizeLeg(leg) {
  const segments = leg.segments || [];
  const firstSegment = segments[0] || {};
  const airlineCode = firstSegment.airlines?.code;
  const airlineMeta = AIRLINES[airlineCode];
  return {
    airline: airlineMeta?.name || firstSegment.airlines?.short || firstSegment.airlines?.full || airlineCode,
    airlineLogo: airlineMeta?.logo,
    // Join every segment's flight number so connecting itineraries are represented in full
    // (e.g. "BS141 + BS205") — this is also part of what compare.js matches across platforms.
    flightNo: segments.map((s) => `${s.airlines?.code || airlineCode} ${s.flightNumber}`).join(' + '),
    departure: formatTime(leg.departureDateTime?.time),
    arrival: formatTime(leg.arrivalDateTime?.time),
    duration: formatDuration(leg.duration),
    stops: leg.stop ?? segments.length - 1,
    layoverAirports: leg.layoverIataList || [],
  };
}

function normalizeFlight(flight, from, to, couponInfo, isRoundTrip) {
  const outLeg = flight.legs?.[0];
  if (!outLeg || (outLeg.segments || []).length === 0) return null;
  // Round trip: legs[1] is the return. Guard it — a malformed result missing the return leg is
  // dropped rather than shown as a bogus one-way at the round-trip price.
  const retLeg = isRoundTrip ? flight.legs?.[1] : null;
  if (isRoundTrip && (!retLeg || (retLeg.segments || []).length === 0)) return null;

  const outbound = summarizeLeg(outLeg);
  const ret = retLeg ? summarizeLeg(retLeg) : null;

  // For a round trip, `displayPrice.totalFare` / `finalPriceAfterDiscount` are already the combined
  // both-ways figures, so the pricing math below is unchanged.
  const totalFare = flight.displayPrice?.totalFare || {};
  const baseFare = totalFare.base || 0;
  const taxes = totalFare.tax || 0;

  // ShareTrip auto-applies a default "preferred fare" coupon to every result (FLYINSIDE domestic /
  // FLIGHTINT international) — that IS the platform discount, and it's already reflected in
  // `finalPriceAfterDiscount`. This is the "Total (After Platform Discount)" we show.
  const platformAmount = flight.promotionalCoupon?.finalPriceAfterDiscount ?? totalFare.total ?? 0;

  // The selectable coupon (bKASHDOM… / FLYGPSTAR…) is a percentage off BASE FARE that STACKS on
  // top of that preferred fare — verified live against the real booking page.
  const couponDiscount = applyCouponPercent(baseFare, couponInfo);
  const afterCouponAmount = platformAmount - couponDiscount;

  const convenienceFee = Math.round(platformAmount * CONVENIENCE_FEE_RATE);
  const totalStandard = platformAmount + convenienceFee;
  const discountedConvenienceFee = Math.round(afterCouponAmount * CONVENIENCE_FEE_RATE);
  const totalBkash = afterCouponAmount + discountedConvenienceFee;

  // For a round trip the match key must encode BOTH flight numbers, so only identical
  // outbound+return itineraries are compared across platforms.
  const flightNo = ret ? `${outbound.flightNo} / ${ret.flightNo}` : outbound.flightNo;

  return {
    platform: 'sharetrip',
    tripType: isRoundTrip ? 'roundtrip' : 'oneway',
    airline: outbound.airline,
    airlineLogo: outbound.airlineLogo,
    flightNo,
    departure: outbound.departure,
    arrival: outbound.arrival,
    duration: outbound.duration,
    stops: outbound.stops,
    layoverAirports: outbound.layoverAirports,
    ret: ret ? {
      flightNo: ret.flightNo,
      airline: ret.airline,
      airlineLogo: ret.airlineLogo,
      departure: ret.departure,
      arrival: ret.arrival,
      duration: ret.duration,
      stops: ret.stops,
      layoverAirports: ret.layoverAirports,
    } : null,
    class: 'Economy',
    baggage: '20kg',
    route: ret ? `${from} ⇄ ${to}` : `${from} → ${to}`,
    pricing: {
      baseFare,
      taxes,
      convenienceFee,
      totalStandard,
      bkashDiscount: totalStandard - totalBkash,
      totalBkash,
      // Shown in the UI as "Discounted Price (Coupon: …)" — only when the coupon actually applied.
      discountCoupon: couponInfo && couponInfo.pct > 0 ? couponInfo.code : null,
    },
  };
}

function formatTime(hms) {
  if (!hms) return '';
  const [h, m] = hms.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

function formatDuration(minutes) {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { search };
