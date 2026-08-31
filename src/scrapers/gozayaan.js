/**
 * GoZayaan Scraper
 *
 * Flow: Login (only when needed) -> start search in-page -> drain results via direct API calls
 *
 * Only the *initial* search creation needs the browser: we deep-link to the results URL
 * (`/flight/list?...`) and capture the `search_id` the page posts. Everything after that is
 * replayed directly — `/search/legs/` carries no signature (the site sends only
 * `authorization`/`accept`/`content-type`), so results are drained over HTTP instead of by
 * scrolling the UI, which is both faster and slightly more complete. An earlier note here claimed
 * all search requests were JWT-signed; that is not true of `/search/legs/`, and believing it cost
 * ~25s per international search.
 *
 * The discount lookup is likewise a plain authenticated POST
 * (`/api/business_rules/get_discount_list/`). Its rate varies by
 * airline (confirmed live: US-Bangla 7%, Air Astra 9%, NovoAir 6%, Biman 6% under the same
 * DOMB0726 campaign), so it's queried once per unique carrier in the result set, not once
 * globally — applying a single carrier's rate to every flight was the bug that caused GoZayaan's
 * bKash prices to drift from the real site for some airlines.
 */

const { chromium } = require('playwright');
const { AIRLINES, ANY_COUPON, PLATFORM_COUPONS, SCRAPER_CONFIG } = require('../config');
const { loadStorageState, saveStorageState } = require('../session-store');

const API_BASE = 'https://production.gozayaan.com';
const BD_DOMESTIC_AIRPORTS = new Set(['DAC', 'CXB', 'CGP', 'ZYL', 'RJH', 'SPD', 'JSR', 'BZL']);

// GoZayaan's real convenience-charge rate, straight from its own API
// (`GET /api/business_rules/product_surcharge/?product=FLIGHT&product_type=INT|DOM...` -> 2.1
// for both), applied to the *post-discount* subtotal — confirmed live: 2.1% of a 58,699 discounted
// subtotal rounds to exactly 1,233, matching the real site's "Convenience Charge" on that booking
// (a flat 2% assumption, used previously, was off by enough to visibly mismatch the real site).
const CONVENIENCE_FEE_RATE = 0.021;

async function search({ from, to, date, returnDate, onProgress }) {
  const isRoundTrip = !!returnDate;
  const browser = await chromium.launch({ headless: true, args: SCRAPER_CONFIG.chromiumArgs });
  try {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1200 },
      userAgent: SCRAPER_CONFIG.userAgent,
      // Restore the previous run's cookies/localStorage so login is usually a no-op.
      storageState: loadStorageState('gozayaan'),
    });
    const page = await context.newPage();

    // Only log in up front when there's no saved session. Otherwise the results-page load below
    // doubles as the session check — it has to happen anyway, so validating via a separate
    // homepage visit just cost a wasted page load on every warm run.
    let authToken = null;
    if (!loadStorageState('gozayaan')) {
      onProgress?.('gozayaan', 'logging_in', 'Logging into GoZayaan...');
      authToken = await login(page, context);
    }

    onProgress?.('gozayaan', 'searching', 'Searching flights on GoZayaan...');
    let { searchId, token } = await startSearch(page, from, to, date, returnDate);
    authToken = authToken || token;
    // No search or no token once we're on the origin => the restored session was stale. Log in
    // for real and retry exactly once so a broken login can't loop.
    if (!searchId || !authToken) {
      onProgress?.('gozayaan', 'logging_in', 'Logging into GoZayaan...');
      authToken = await login(page, context);
      onProgress?.('gozayaan', 'searching', 'Searching flights on GoZayaan...');
      ({ searchId } = await startSearch(page, from, to, date, returnDate));
    }
    if (!searchId || !authToken) return [];

    // Round trips stream under leg_type "LA" (each fare then references BOTH legs); one-way is "L1".
    const legType = isRoundTrip ? 'LA' : 'L1';
    let searchResult = await drainLegs(context, authToken, searchId, legType);

    // A token being PRESENT in localStorage doesn't mean it still works: an expired session leaves
    // the old token behind, so the checks above pass and every drain poll then 401s — which used to
    // surface as a silent "0 flights" on a route that really had them. A 401 is the only reliable
    // signal the restored session is dead, so log in for real and redo the search exactly once.
    if (searchResult?.authFailed) {
      onProgress?.('gozayaan', 'logging_in', 'Logging into GoZayaan...');
      authToken = await login(page, context);
      onProgress?.('gozayaan', 'searching', 'Searching flights on GoZayaan...');
      ({ searchId } = await startSearch(page, from, to, date, returnDate));
      if (!searchId || !authToken) return [];
      searchResult = await drainLegs(context, authToken, searchId, legType);
    }

    const fares = searchResult?.fares || [];
    if (fares.length === 0) return [];

    onProgress?.('gozayaan', 'extracting', 'Extracting price breakdowns...');
    const isDomestic = BD_DOMESTIC_AIRPORTS.has(from) && BD_DOMESTIC_AIRPORTS.has(to);
    const flights = joinFlights(searchResult, from, to, isRoundTrip);
    if (flights.length === 0) return [];

    const coupons = isDomestic ? PLATFORM_COUPONS.gozayaan.domestic : PLATFORM_COUPONS.gozayaan.international;
    const couponsByCarrier = await getCouponsByCarrier(context, authToken, flights, isDomestic, coupons);

    return flights.map((f) => withPricing(f, couponsByCarrier.get(f.carrier)));
  } finally {
    await browser.close();
  }
}

/**
 * Full UI login. Only called when there's genuinely no usable session — the caller decides that,
 * either because no session file exists or because the results page came back signed out.
 */
async function login(page, context) {
  await page.goto('https://gozayaan.com/', { waitUntil: 'domcontentloaded', timeout: SCRAPER_CONFIG.timeout });
  await page.waitForTimeout(3000);

  await page.locator('text=I Understand').click({ timeout: 5000 }).catch(() => {});
  await page.locator('button:has-text("Sign In")').first().click();
  await page.waitForTimeout(1500);
  await page.fill('#email', process.env.GOZAYAAN_EMAIL);
  await page.fill('#password', process.env.GOZAYAAN_PASSWORD);
  await page.locator('button:has-text("Sign In")').last().click();
  await page.waitForTimeout(4000);

  const token = await readToken(page);
  // Persist the fresh session for the next search.
  await saveStorageState(context, 'gozayaan');
  return token;
}

// GoZayaan keeps its auth token in the `vuex` localStorage key, double-encoded
// (base64 -> JSON string -> JSON object).
async function readToken(page) {
  try {
    const vuex = await page.evaluate(() => localStorage.getItem('vuex'));
    if (!vuex) return null;
    const inner = JSON.parse(JSON.parse(Buffer.from(vuex, 'base64').toString('utf-8')));
    return inner?.auth?.Token || null;
  } catch (e) {
    return null;
  }
}

/**
 * Load the results page so the site's own JS creates the search, and capture the `search_id` it
 * posts. Only the initial `/search/` call needs the browser; draining the results afterwards does
 * not (see `drainLegs`).
 */
async function startSearch(page, from, to, date, returnDate) {
  let searchId = null;

  // Batches are handed out DESTRUCTIVELY — each `/search/legs/` call returns the next slice and
  // never repeats it. The page's own JS polls that endpoint too, so if we let it run it eats
  // batches we'll never see (measured: DAC-CXB dropped 20 -> 5, DAC-DXB 98 -> 83). Abort those
  // requests: the postData still gives us the search_id, and with the page silenced every batch
  // is ours to drain.
  const legsRoute = '**/api/flight/v4.0/search/legs/**';
  await page.route(legsRoute, (route) => {
    try {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.search_id) searchId = body.search_id;
    } catch (e) {
      // malformed body — keep waiting for the next request
    }
    route.abort().catch(() => {});
  });

  // Round trip: `trips` carries two comma-joined triplets (outbound then return) and there is NO
  // `trip_type` param — captured from GoZayaan's own UI. One-way keeps the original format.
  const trips = returnDate
    ? `${from},${to},${date},${to},${from},${returnDate}`
    : `${from},${to},${date}`;
  const url = returnDate
    ? `https://gozayaan.com/flight/list?adult=1&child=0&child_age=&infant=0&cabin_class=Economy&trips=${trips}`
    : `https://gozayaan.com/flight/list?adult=1&child=0&child_age=&infant=0&cabin_class=Economy&trips=${trips}&trip_type=One%20Way`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SCRAPER_CONFIG.timeout });
  const deadline = Date.now() + SCRAPER_CONFIG.timeout;
  while (!searchId && Date.now() < deadline) await delay(500);

  // Read the token while we're still on the gozayaan origin — localStorage is per-origin, so it
  // is unreachable once the page is parked below.
  const token = await readToken(page);

  // Park the page so its polling can't race our drain. The abort route stays registered as a
  // second line of defence; both are harmless for the login fallback, which never hits this
  // endpoint.
  await page.goto('about:blank', { timeout: SCRAPER_CONFIG.timeout }).catch(() => {});

  return { searchId, token };
}

/**
 * Drain the whole result stream via direct API calls.
 *
 * GoZayaan STREAMS results: every `/search/legs/` call posts the identical body
 * (`{search_id, leg_type}` — there is no page/offset param) and the server returns the NEXT batch
 * of ~15 fares, so batches never overlap. The site just repeats that call as you scroll.
 *
 * Contrary to this file's original header note, the endpoint carries no JWT signature — the site
 * sends only `authorization`/`accept`/`content-type` — so we can replay it ourselves instead of
 * driving the UI. That matters: the site's own JS polls roughly every 3.5s, so scrolling to collect
 * every batch took ~35-42s on DAC-BKK, whereas draining directly gets the same fares in ~22s.
 *
 * Knowing when to STOP is the whole difficulty. An empty batch is not the end — the buffer merely
 * drains faster than providers refill it, and more fares arrive seconds later. `progress` /
 * `expected_progress` look like a completion signal but are not: on DAC-BKK they read 5/5 from the
 * very first batch while 80 further fares were still to come. Trusting them truncated results
 * (BKK 97 of 138). See the stop thresholds below.
 */
// Stopping needs BOTH a quiet period and a run of empty responses, because either alone breaks in
// one of the two conditions we run under. Measured mid-stream gaps are ~1.9s max when this scraper
// runs alone, but all three scrapers run concurrently in `runner.js`, and under that contention a
// wall-clock-only window expires mid-stream (DAC-BKK returned 77 of 137). A count of empty
// responses scales naturally with latency, so requiring both is safe at either speed.
const QUIET_MS = 4000;
const QUIET_POLLS = 6;
const POLL_MS = 600; // brisk polling doesn't cost us fares; it just finishes sooner

async function drainLegs(context, authToken, searchId, legType = 'L1') {
  const merged = { fares: [], legs: [], segments: [] };
  const seen = { fares: new Set(), legs: new Set(), segments: new Set() };
  const deadline = Date.now() + SCRAPER_CONFIG.searchTimeout;
  let lastFareAt = Date.now();
  let emptyStreak = 0;
  let failStreak = 0;

  while (Date.now() < deadline) {
    if (emptyStreak >= QUIET_POLLS && Date.now() - lastFareAt >= QUIET_MS) break;

    // Batches are handed out destructively, so treating a transient failure as end-of-stream would
    // strand every batch after it. Retry a few times before accepting the stream is really over.
    let result = null;
    try {
      const res = await context.request.post(`${API_BASE}/api/flight/v4.0/search/legs/`, {
        headers: { authorization: authToken, 'content-type': 'application/json' },
        data: { search_id: String(searchId), leg_type: legType },
        timeout: SCRAPER_CONFIG.timeout,
      });
      if (res.ok()) {
        result = (await res.json().catch(() => null))?.result;
      } else if (res.status() === 401 && merged.fares.length === 0) {
        // Dead session — hand it back to the caller to re-login instead of spending the retry
        // budget on 401s that can never succeed. Only before the first fare arrives: once the
        // token has demonstrably worked, a later 401 is treated as transient like any other.
        return { authFailed: true };
      }
    } catch (e) {
      result = null;
    }
    if (!result) {
      if (++failStreak >= 3) break;
      await delay(1000);
      continue;
    }
    failStreak = 0;

    for (const key of ['fares', 'legs', 'segments']) {
      for (const item of result[key] || []) {
        if (item?.hash == null || seen[key].has(item.hash)) continue;
        seen[key].add(item.hash);
        merged[key].push(item);
      }
    }
    merged.airports = result.airports || merged.airports;
    merged.carriers = result.carriers || merged.carriers;

    if ((result.fares || []).length > 0) {
      lastFareAt = Date.now();
      emptyStreak = 0;
    } else {
      emptyStreak++;
    }
    await delay(POLL_MS);
  }

  return merged.fares.length > 0 ? merged : null;
}

// Summarize one leg (a direction) into the leg-level fields the UI shows. A leg's `segment_hashes`
// holds every flight in a connecting itinerary, so the whole list is walked (reading only [0]
// silently dropped connections).
function summarizeLeg(leg, segmentsByHash) {
  const segments = (leg.segment_hashes || []).map((h) => segmentsByHash.get(h)).filter(Boolean);
  if (segments.length === 0) return null;
  const carrier = segments[0].marketing_carrier;
  const airlineMeta = AIRLINES[carrier];
  return {
    carrier,
    airline: airlineMeta?.name || carrier,
    airlineLogo: airlineMeta?.logo,
    flightNo: segments.map((s) => `${s.marketing_carrier} ${s.flight_number}`).join(' + '),
    departure: formatTime(leg.departure_date_time),
    arrival: formatTime(leg.arrival_date_time),
    duration: formatDuration(leg.travel_time),
    stops: segments.length - 1,
    layoverAirports: segments.slice(0, -1).map((s) => s.destination),
  };
}

function joinFlights(searchResult, from, to, isRoundTrip) {
  const legsByHash = new Map(searchResult.legs.map((l) => [l.hash, l]));
  const segmentsByHash = new Map(searchResult.segments.map((s) => [s.hash, s]));

  return searchResult.fares
    .map((fare) => {
      const outLeg = legsByHash.get(fare.leg_hashes[0]);
      if (!outLeg) return null;
      const outbound = summarizeLeg(outLeg, segmentsByHash);
      if (!outbound) return null;

      // Round trip: leg_hashes[1] is the return leg. Drop the fare if it's missing so a broken
      // itinerary isn't shown as a one-way at the round-trip price.
      let ret = null;
      if (isRoundTrip) {
        const retLeg = legsByHash.get(fare.leg_hashes[1]);
        if (!retLeg) return null;
        ret = summarizeLeg(retLeg, segmentsByHash);
        if (!ret) return null;
      }

      return { fare, outbound, ret, carrier: outbound.carrier, from, to };
    })
    .filter(Boolean);
}

/**
 * Fetch both coupons we price against, once per unique carrier. A single `get_discount_list`
 * response contains every "Hot Deal" for that carrier, so the platform coupon (GOFLY…) and the
 * discount coupon (best-paying deal international / DOMB… domestic) both come from the same call.
 * Rates differ by airline.
 */
async function getCouponsByCarrier(context, authToken, flights, isDomestic, coupons) {
  const carriers = [...new Set(flights.map((f) => f.carrier))];
  const byCarrier = new Map();

  await Promise.all(
    carriers.map(async (carrier) => {
      const representativeFlight = flights.find((f) => f.carrier === carrier);
      try {
        const res = await context.request.post(`${API_BASE}/api/business_rules/get_discount_list/`, {
          data: {
            type: 'FLIGHT',
            region: 'BD',
            currency: 'BDT',
            platform_type: 'GZ_WEB',
            search_id: String(Date.now()),
            plating_carrier: carrier,
            // "OUTBOUND" for any international search (one-way OR round-trip), "DOM" for domestic —
            // confirmed live that flight_type depends only on domestic-vs-international, not on the
            // trip type: for an international RT, "OUTBOUND" returns INTFLY while "ROUND_TRIP"/
            // "RETURN" return nothing. "INT" also silently hides the real discount.
            flight_type: isDomestic ? 'DOM' : 'OUTBOUND',
            product_price: representativeFlight.fare.total_fare_amount,
          },
          headers: { authorization: authToken },
          timeout: SCRAPER_CONFIG.timeout,
        });
        const body = await res.json();
        const list = body.result || [];
        byCarrier.set(carrier, {
          platform: findCoupons(list, coupons.platform),
          discount: findCoupons(list, coupons.discount),
        });
      } catch (e) {
        byCarrier.set(carrier, { platform: null, discount: null });
      }
    })
  );

  return byCarrier;
}

/**
 * Collect every Hot Deal matching a configured coupon, as a list of tiers.
 *
 * Campaign codes carry rotating route/month suffixes (e.g. "INTFLY0726"), so a configured code is
 * matched as a PREFIX; `ANY_COUPON` matches the whole list instead. Returning ALL matches rather
 * than the first one matters: a campaign routinely ships several tiers (AMEX0126 runs 18% capped
 * at 30,000 alongside 15% capped at 25,000), and GoZayaan does NOT list the better tier first — on
 * UL, QR, EK, TG and FZ it comes second, so taking the first hit underpaid those carriers.
 */
function findCoupons(list, configuredCode) {
  if (!configuredCode) return null;
  const matches =
    configuredCode === ANY_COUPON
      ? list
      : list.filter((d) =>
          String(d.discount_campaign?.campaign_code || '')
            .toUpperCase()
            .startsWith(configuredCode.toUpperCase())
        );
  if (matches.length === 0) return null;
  return matches.map((d) => ({
    // A deal is either a PERCENTAGE off base fare or a FLAT taka amount, and `markup_amount`
    // means something entirely different in each: EINT0726 is FLAT "3000.00" (BDT 3,000 off for
    // EBL Visa credit cards), which read as a percentage becomes a 3000% discount.
    type: String(d.discount_markup?.markup_type || 'PERCENTAGE').toUpperCase(),
    value: parseFloat(d.discount_markup?.markup_amount) || 0,
    max: Number(d.discount_markup?.markup_max_amount) || 0,
    // A prefix-matched coupon keeps its configured label; a wildcard match has no prefix to show,
    // so it reports the campaign GoZayaan actually applied.
    code: configuredCode === ANY_COUPON ? String(d.discount_campaign?.campaign_code || '') : configuredCode,
  }));
}

/**
 * Pick the best-paying tier for ONE flight, honouring each tier's markup type. Both kinds are
 * optionally capped by `markup_max_amount` (a cap of 0 means "no cap"); because a cap only binds
 * on an expensive enough fare, which tier wins depends on the fare itself — so this is resolved
 * per flight rather than once per carrier.
 */
function bestCoupon(baseFare, tiers) {
  let best = { amount: 0, code: null };
  for (const tier of tiers || []) {
    if (!tier.value) continue;
    const raw = tier.type === 'FLAT' ? Math.round(tier.value) : Math.round(baseFare * (tier.value / 100));
    const amount = tier.max > 0 ? Math.min(raw, tier.max) : raw;
    if (amount > best.amount) best = { amount, code: tier.code };
  }
  return best;
}

function withPricing({ fare, outbound, ret, from, to }, carrierCoupons) {
  const baseFare = fare.total_base_amount;
  const taxes = fare.total_tax_amount;
  // For a round trip `total_fare_amount` / `total_base_amount` are already the combined both-ways
  // figures, so the pricing math is unchanged.
  const subtotal = fare.total_fare_amount;

  // GoZayaan's Hot Deals are mutually exclusive — you pick one — so both prices are computed
  // from the same raw subtotal rather than stacking. The convenience charge is recomputed on
  // each post-discount subtotal, matching the real site.
  // Clamp to the subtotal: no discount can take a fare below zero. Without this an unrecognised
  // markup type (as FLAT once was) silently produces negative prices instead of an obvious error.
  const platformDiscount = Math.min(bestCoupon(baseFare, carrierCoupons?.platform).amount, subtotal);
  const afterPlatform = subtotal - platformDiscount;
  const convenienceFee = Math.round(afterPlatform * CONVENIENCE_FEE_RATE);
  const totalStandard = afterPlatform + convenienceFee;

  const coupon = bestCoupon(baseFare, carrierCoupons?.discount);
  const couponDiscount = Math.min(coupon.amount, subtotal);
  const afterCoupon = subtotal - couponDiscount;
  const discountedConvenienceFee = Math.round(afterCoupon * CONVENIENCE_FEE_RATE);
  const totalBkash = afterCoupon + discountedConvenienceFee;

  // For a round trip the match key must encode BOTH flight numbers, so only identical
  // outbound+return itineraries are compared across platforms.
  const flightNo = ret ? `${outbound.flightNo} / ${ret.flightNo}` : outbound.flightNo;

  return {
    platform: 'gozayaan',
    tripType: ret ? 'roundtrip' : 'oneway',
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
      discountCoupon: couponDiscount > 0 ? coupon.code : null,
    },
  };
}

function formatTime(isoDateTime) {
  if (!isoDateTime) return '';
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function formatDuration(minutes) {
  if (minutes == null) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { search };
