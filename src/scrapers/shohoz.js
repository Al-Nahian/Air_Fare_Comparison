/**
 * Shohoz Scraper
 *
 * Flow: Search (public JSON API, no login needed) -> extract price breakdown
 *
 * Shohoz's flight search (`air-air.shohoz.com/api/air/search`) is a fully public endpoint —
 * no session or auth token required, and no BROWSER either: this scraper is a single HTTP POST.
 * It used to launch a headless Chromium purely to borrow Playwright's `context.request` client,
 * never opening a page — a whole browser (~8 processes) per search for nothing. Plain `fetch`
 * returns identical results, so Shohoz now costs a third of what it did.
 * Better still, it prices out BOTH figures we show, so
 * nothing has to be replayed through the booking UI:
 *
 *   "Total (After Platform Discount)"  = `TotalFareWithAgentMarkup`
 *                                        (BaseFare + Tax + ServiceFee − Fares[0].Discount)
 *   "Discounted Price (Coupon: …)"     = `promoDiscount.CouponDiscountWithAgentMarkup`
 *                                        with `promoDiscount.CouponCode` (GPINT international,
 *                                        OCDOM domestic)
 *
 * Both then get the payment processing fee added (see `withProcessingFee`) to reach the figure
 * the site actually shows as TOTAL PAYABLE. Flights with no eligible coupon simply omit
 * `promoDiscount`, and then the discounted price equals the standard one.
 */

const { AIRLINES, SCRAPER_CONFIG } = require('../config');

const SEARCH_URL = 'https://air-air.shohoz.com/api/air/search';
const BD_DOMESTIC_AIRPORTS = new Set(['DAC', 'CXB', 'CGP', 'ZYL', 'RJH', 'SPD', 'JSR', 'BZL']);
const PROCESSING_FEE_RATE = 0.02;

async function search({ from, to, date, returnDate, onProgress }) {
  const isDomestic = BD_DOMESTIC_AIRPORTS.has(from) && BD_DOMESTIC_AIRPORTS.has(to);
  const isRoundTrip = !!returnDate;

  onProgress?.('shohoz', 'searching', 'Searching flights on Shohoz...');
  const results = await runSearch(from, to, date, returnDate, isDomestic);
  if (results.length === 0) return [];

  onProgress?.('shohoz', 'extracting', 'Extracting price breakdowns...');
  return results.map((r) => normalizeFlight(r, from, to, isRoundTrip)).filter(Boolean);
}

async function runSearch(from, to, date, returnDate, isDomestic) {
  // JourneyType 2 = round trip: append the return segment. Shohoz then prices each result as a
  // single bundled round-trip fare (segments carry both directions, tagged OutBound/InBound).
  const segments = [{ Origin: from, Destination: to, CabinClass: '1', DepartureDateTime: date }];
  if (returnDate) segments.push({ Origin: to, Destination: from, CabinClass: '1', DepartureDateTime: returnDate });

  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: 'https://www.shohoz.com/',
      accept: 'application/json',
      // Sent explicitly now that there is no browser context supplying one.
      'user-agent': SCRAPER_CONFIG.userAgent,
    },
    body: JSON.stringify({
      AdultQuantity: 1,
      ChildQuantity: 0,
      InfantQuantity: 0,
      EndUserIp: '127.0.0.1',
      JourneyType: returnDate ? '2' : '1',
      isInternationalFlight: isDomestic ? 0 : 1,
      Segments: segments,
    }),
    signal: AbortSignal.timeout(SCRAPER_CONFIG.timeout),
  });
  if (!res.ok) return [];
  const body = await res.json();
  return body.data?.Results || [];
}

/**
 * Summarize an ordered list of segments (one direction) into the leg-level fields the UI shows:
 * combined flight number, end-to-end times/duration, stops and layovers. Used for the single leg
 * of a one-way and for each direction of a round trip.
 */
function summarizeLeg(segments) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const airlineCode = first.Airline.AirlineCode;
  const airlineMeta = AIRLINES[airlineCode];
  return {
    airline: airlineMeta?.name || first.Airline.AirlineName,
    airlineLogo: airlineMeta?.logo,
    // Join every segment's flight number so connecting itineraries are represented in full
    // (e.g. "BS141 + BS205") — this is also part of what compare.js matches across platforms.
    flightNo: segments.map((s) => `${s.Airline.AirlineCode} ${s.Airline.FlightNumber}`).join(' + '),
    departure: formatTime(first.Origin.DepTime),
    arrival: formatTime(last.Destination.ArrTime),
    // Shohoz has no leg-level total, so end-to-end duration (including layover) is computed from
    // real timestamps, not summed flight times.
    duration: durationBetween(first.Origin.DepTime, last.Destination.ArrTime),
    stops: segments.length - 1,
    layoverAirports: segments.slice(0, -1).map((s) => s.Destination.Airport.AirportCode),
    baggage: first.baggageDetails?.[0]?.Checkin || '20kg',
  };
}

function normalizeFlight(result, from, to, isRoundTrip) {
  const segments = result.segments || [];
  const fare = result.Fares?.[0];
  if (segments.length === 0 || !fare) return null;

  // Round trip: split the segments into the two directions Shohoz tags them with. One-way: the
  // whole list is a single outbound leg with no return.
  const outSegs = isRoundTrip ? segments.filter((s) => s.TripIndicator === 'OutBound') : segments;
  const inSegs = isRoundTrip ? segments.filter((s) => s.TripIndicator === 'InBound') : [];
  if (outSegs.length === 0 || (isRoundTrip && inSegs.length === 0)) return null;

  const outbound = summarizeLeg(outSegs);
  const ret = isRoundTrip ? summarizeLeg(inSegs) : null;

  const baseFare = fare.BaseFare;
  // The site lists "AIT & VAT" (`ServiceFee`) as its own line right under Tax; we group both
  // into the single "Taxes & Fees" row so the remaining fee row can be the processing fee.
  const taxes = fare.Tax + (fare.ServiceFee || 0);

  // `TotalFareWithAgentMarkup` is the amount after Shohoz's own platform discount, but BEFORE the
  // processing fee. For a round trip this is already the combined both-ways figure.
  const afterPlatform = result.TotalFareWithAgentMarkup;
  const totalStandard = withProcessingFee(afterPlatform);
  const convenienceFee = totalStandard - afterPlatform;

  // The coupon comes straight from the search response (GPINT international / OCDOM domestic),
  // already priced out — no booking-page interaction needed. Flights without an eligible coupon
  // simply have no `promoDiscount`, in which case the discounted price equals the standard one.
  const promo = result.promoDiscount;
  const afterCoupon = promo?.CouponDiscountWithAgentMarkup ?? afterPlatform;
  const totalBkash = withProcessingFee(afterCoupon);
  const discountCoupon = promo?.CouponCode || null;

  // For a round trip the match key must encode BOTH flight numbers, so only identical
  // outbound+return itineraries are compared across platforms.
  const flightNo = ret ? `${outbound.flightNo} / ${ret.flightNo}` : outbound.flightNo;

  return {
    platform: 'shohoz',
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
    baggage: outbound.baggage,
    route: ret ? `${from} ⇄ ${to}` : `${from} → ${to}`,
    pricing: {
      baseFare,
      taxes,
      convenienceFee,
      totalStandard,
      // Same as totalStandard — kept as its own field because the comparison-list CSV
      // has a dedicated "Shohoz Platform" column for this stage.
      platformPrice: result.TotalFareWithAgentMarkup,
      bkashDiscount: totalStandard - totalBkash,
      totalBkash,
      discountCoupon,
    },
  };
}

/**
 * Shohoz charges a payment processing fee worth 2% of the FINAL payable — i.e. the pre-fee
 * amount is grossed up (amount / 0.98), not simply multiplied by 1.02 — then rounded UP to the
 * next taka. Verified against the real checkout on two very different fares:
 *   domestic      4,170  -> 4,256    (fee 86)
 *   international 109,877 -> 112,120 (fee 2,243)
 * The fee isn't returned by the search API (it's applied at the payment step), so it's computed.
 */
function withProcessingFee(amount) {
  return Math.ceil(amount / (1 - PROCESSING_FEE_RATE));
}

function formatTime(isoDateTime) {
  if (!isoDateTime) return '';
  const match = isoDateTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

function durationBetween(depIsoDateTime, arrIsoDateTime) {
  const dep = new Date(depIsoDateTime);
  const arr = new Date(arrIsoDateTime);
  if (isNaN(dep) || isNaN(arr)) return '';
  const minutes = Math.round((arr - dep) / 60000);
  if (minutes < 0) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

module.exports = { search };
