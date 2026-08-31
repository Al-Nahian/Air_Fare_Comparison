/**
 * Scraper Runner
 * Orchestrates all 3 scrapers in parallel and emits progress events.
 */

const sharetripScraper = require('./scrapers/sharetrip');
const gozayaanScraper = require('./scrapers/gozayaan');
const shohozScraper = require('./scrapers/shohoz');
const { compareResults } = require('./compare');

/**
 * Run all scrapers and return comparison results.
 * @param {object} params - { from, to, date }
 * @param {function} onProgress - callback(platform, status, message)
 * @returns {Promise<object>} comparison results
 */
async function runComparison(params, onProgress = () => {}) {
  // `returnDate` (optional) switches every scraper into bundled round-trip mode: each result is a
  // single outbound+return itinerary priced the way the platform actually sells it.
  const { from, to, date, returnDate } = params;
  const isRoundTrip = !!returnDate;

  const scrapers = [
    { name: 'sharetrip', label: 'ShareTrip', fn: sharetripScraper },
    { name: 'gozayaan', label: 'GoZayaan', fn: gozayaanScraper },
    { name: 'shohoz', label: 'Shohoz', fn: shohozScraper },
  ];

  // Run all 3 in parallel
  const results = {};

  const tasks = scrapers.map(async (scraper) => {
    try {
      // "starting" (not "searching") — the scraper hasn't logged in / begun searching yet.
      // The scrapers emit their own logging_in/searching/extracting once they actually start,
      // so this initial event just marks the platform as kicked off.
      onProgress(scraper.name, 'starting', `Searching flights on ${scraper.label}...`);

      const flights = await scraper.fn.search({ from, to, date, returnDate, onProgress });

      onProgress(scraper.name, 'done', `Found ${flights.length} flights on ${scraper.label}`);
      results[scraper.name] = flights;
    } catch (err) {
      console.error(`[${scraper.label}] Scraper error:`, err.message);
      onProgress(scraper.name, 'error', `Error on ${scraper.label}: ${err.message}`);
      results[scraper.name] = [];
    }
  });

  await Promise.allSettled(tasks);

  // Compare and match flights across platforms
  const comparisons = compareResults(results);

  // Deliberately writes NO file here. Every search used to drop its own CSV into results/, which
  // accumulated ~90 files of clutter that nothing ever read — and under the nightly job, whose
  // departure dates roll daily, it would have added 11 more every night. Callers that want a file
  // write one themselves: the dashboard exports client-side, and scripts/daily-snapshot.js writes a
  // single merged file per day.
  return {
    route: { from, to },
    date,
    returnDate: returnDate || null,
    tripType: isRoundTrip ? 'roundtrip' : 'oneway',
    comparisons,
    raw: results,
    meta: {
      timestamp: new Date().toISOString(),
      sharetripCount: results.sharetrip?.length || 0,
      gozayaanCount: results.gozayaan?.length || 0,
      shohozCount: results.shohoz?.length || 0,
    },
  };
}

module.exports = { runComparison };
