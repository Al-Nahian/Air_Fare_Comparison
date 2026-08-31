/**
 * Comparison Engine
 * Matches flights across platforms and identifies cheapest options.
 */

const fs = require('fs');
const path = require('path');

/**
 * Normalize a flight key for cross-platform matching.
 * Matches by airline + flight number (same physical flight).
 */
function getFlightKey(flight) {
  const no = (flight.flightNo || '').replace(/\s+/g, '').toUpperCase();
  return `${no}`;
}

/**
 * Compare results from all 3 platforms.
 * @param {{ sharetrip: Array, gozayaan: Array, shohoz: Array }} results
 * @returns {Array} Comparison rows grouped by flight
 */
function compareResults(results) {
  const platforms = ['sharetrip', 'gozayaan', 'shohoz'];
  const flightMap = new Map(); // flightKey -> { sharetrip: data, gozayaan: data, shohoz: data }

  for (const platform of platforms) {
    const flights = results[platform] || [];
    for (const flight of flights) {
      const key = getFlightKey(flight);
      if (!key) continue;

      if (!flightMap.has(key)) {
        flightMap.set(key, {
          flightNo: flight.flightNo,
          airline: flight.airline,
          airlineLogo: flight.airlineLogo,
          departure: flight.departure,
          arrival: flight.arrival,
          duration: flight.duration || '',
          stops: flight.stops ?? 0,
          layoverAirports: flight.layoverAirports || [],
          class: flight.class || 'Economy',
          baggage: flight.baggage || '—',
          route: flight.route || '',
          // Round-trip fields — carried through so the UI can render the return leg. `ret` is the
          // return-leg summary (null for one-way).
          tripType: flight.tripType || 'oneway',
          ret: flight.ret || null,
          platforms: {},
        });
      }

      const entry = flightMap.get(key);
      // Use the most complete info available
      if (!entry.airline && flight.airline) entry.airline = flight.airline;
      if (!entry.airlineLogo && flight.airlineLogo) entry.airlineLogo = flight.airlineLogo;
      if (!entry.departure && flight.departure) entry.departure = flight.departure;
      if (!entry.arrival && flight.arrival) entry.arrival = flight.arrival;
      if (!entry.ret && flight.ret) entry.ret = flight.ret;

      entry.platforms[platform] = {
        baseFare: flight.pricing?.baseFare ?? null,
        taxes: flight.pricing?.taxes ?? null,
        convenienceFee: flight.pricing?.convenienceFee ?? null,
        totalStandard: flight.pricing?.totalStandard ?? null,
        platformPrice: flight.pricing?.platformPrice ?? null,
        bkashDiscount: flight.pricing?.bkashDiscount ?? null,
        totalBkash: flight.pricing?.totalBkash ?? null,
        discountCoupon: flight.pricing?.discountCoupon ?? null,
      };
    }
  }

  // Build comparison array with cheapest indicators
  const comparisons = [];

  for (const [key, flight] of flightMap) {
    // Find cheapest standard & bKash prices
    let cheapestStandard = { platform: null, price: Infinity };
    let cheapestBkash = { platform: null, price: Infinity };

    for (const platform of platforms) {
      const p = flight.platforms[platform];
      if (!p) continue;

      if (p.totalStandard != null && p.totalStandard < cheapestStandard.price) {
        cheapestStandard = { platform, price: p.totalStandard };
      }
      if (p.totalBkash != null && p.totalBkash < cheapestBkash.price) {
        cheapestBkash = { platform, price: p.totalBkash };
      }
    }

    comparisons.push({
      ...flight,
      cheapestStandard: cheapestStandard.platform ? cheapestStandard : null,
      cheapestBkash: cheapestBkash.platform ? cheapestBkash : null,
    });
  }

  // Sort: flights available on more platforms first, then by cheapest standard price
  comparisons.sort((a, b) => {
    const aPlatforms = Object.keys(a.platforms).length;
    const bPlatforms = Object.keys(b.platforms).length;
    if (bPlatforms !== aPlatforms) return bPlatforms - aPlatforms;
    const aPrice = a.cheapestStandard?.price ?? Infinity;
    const bPrice = b.cheapestStandard?.price ?? Infinity;
    return aPrice - bPrice;
  });

  return comparisons;
}

/**
 * Export comparison results to CSV.
 */
async function exportToCSV(comparisons, route, date) {
  const resultsDir = path.join(__dirname, '..', 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filename = `comparison_${route}_${date}.csv`;
  const filepath = path.join(resultsDir, filename);

  // Round-trip runs get an extra column for the return leg (empty on one-way runs).
  const isRoundTrip = comparisons.some(c => c.tripType === 'roundtrip' || c.ret);

  const headers = [
    'Trip', 'Outbound Flight', ...(isRoundTrip ? ['Return Flight'] : []), 'Airline', 'Departure', 'Arrival', 'Class',
    'ShareTrip Base', 'ShareTrip Tax', 'ShareTrip Fee', 'ShareTrip Total', 'ShareTrip bKash',
    'GoZayaan Base', 'GoZayaan Tax', 'GoZayaan Fee', 'GoZayaan Total', 'GoZayaan bKash',
    'Shohoz Base', 'Shohoz Tax', 'Shohoz Fee', 'Shohoz Total', 'Shohoz bKash',
    'Cheapest (Standard)', 'Cheapest (bKash)',
  ];

  const rows = comparisons.map(c => {
    const st = c.platforms.sharetrip || {};
    const gz = c.platforms.gozayaan || {};
    const sh = c.platforms.shohoz || {};
    // For round trips `flightNo` is "OUT / RET"; split so each leg gets its own column.
    const [outboundNo, returnNo] = c.ret ? c.flightNo.split(' / ') : [c.flightNo, ''];
    return [
      c.tripType === 'roundtrip' ? 'Round Trip' : 'One Way',
      outboundNo, ...(isRoundTrip ? [returnNo] : []), c.airline, c.departure, c.arrival, c.class,
      st.baseFare ?? '', st.taxes ?? '', st.convenienceFee ?? '', st.totalStandard ?? '', st.totalBkash ?? '',
      gz.baseFare ?? '', gz.taxes ?? '', gz.convenienceFee ?? '', gz.totalStandard ?? '', gz.totalBkash ?? '',
      sh.baseFare ?? '', sh.taxes ?? '', sh.convenienceFee ?? '', sh.totalStandard ?? '', sh.totalBkash ?? '',
      c.cheapestStandard ? `${c.cheapestStandard.platform} (৳${c.cheapestStandard.price})` : '',
      c.cheapestBkash ? `${c.cheapestBkash.platform} (৳${c.cheapestBkash.price})` : '',
    ];
  });

  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  fs.writeFileSync(filepath, csv, 'utf-8');

  return filepath;
}

module.exports = { compareResults, exportToCSV };
