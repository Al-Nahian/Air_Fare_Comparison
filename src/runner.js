/**
 * Scraper Runner
 * Orchestrates the scrapers and emits progress events.
 *
 * Each browser-based scraper drives its own headless Chromium, and running all four at once
 * measurably starves them — GoZayaan returned zero flights twice under that load while succeeding
 * on its own. So at most two browsers run at a time. Shohoz is exempt: it is a plain fetch with no
 * browser, so it always starts immediately.
 *
 * Within that budget the order matters. ShareTrip averages 21.6s against GoZayaan's 15.9s and
 * FirstTrip's 7.8s, so ShareTrip holds one slot from the start — it is the long pole, and any
 * second spent not running it is a second added to the total. The other slot takes the rest
 * shortest-first, which fills a second column at ~7.8s instead of ~15.9s and finishes the whole
 * search around 23.7s rather than the 29.3s the old fixed waves cost.
 */

const sharetripScraper = require('./scrapers/sharetrip');
const gozayaanScraper = require('./scrapers/gozayaan');
const shohozScraper = require('./scrapers/shohoz');
const firsttripScraper = require('./scrapers/firsttrip');
const { compareResults } = require('./compare');

/**
 * Run all scrapers and return comparison results.
 * @param {object} params - { from, to, date }
 * @param {function} onProgress - callback(platform, status, message)
 * @returns {Promise<object>} comparison results
 */
async function runComparison(params, onProgress = () => {}, onPartial = null) {
  // `returnDate` (optional) switches every scraper into bundled round-trip mode: each result is a
  // single outbound+return itinerary priced the way the platform actually sells it.
  const { from, to, date, returnDate } = params;
  const isRoundTrip = !!returnDate;

  // No browser, so it costs nothing against the concurrency budget.
  const instant = [{ name: 'shohoz', label: 'Shohoz', fn: shohozScraper }];

  // FirstTrip's search API is one-way only — it takes no returnDate. Handing it a round trip would
  // return ONE-WAY fares presented as though they were the round trip, which is wrong data rather
  // than a missing feature, so it sits out those searches entirely.
  //
  // Longest first, then shortest-first for the remaining slot — see the header note.
  const browserQueue = [
    { name: 'sharetrip', label: 'ShareTrip', fn: sharetripScraper },
    ...(isRoundTrip ? [] : [{ name: 'firsttrip', label: 'FirstTrip', fn: firsttripScraper }]),
    { name: 'gozayaan', label: 'GoZayaan', fn: gozayaanScraper },
  ];

  const BROWSER_CONCURRENCY = 2;

  const results = {};

  // Every payload — partial or final — has the same shape, so the dashboard renders a half-finished
  // search through exactly the same path as a complete one.
  const buildPayload = (pending) => ({
    route: { from, to },
    date,
    returnDate: returnDate || null,
    tripType: isRoundTrip ? 'roundtrip' : 'oneway',
    comparisons: compareResults(results),
    raw: results,
    partial: pending.length > 0,
    pending,
    meta: {
      timestamp: new Date().toISOString(),
      sharetripCount: results.sharetrip?.length || 0,
      gozayaanCount: results.gozayaan?.length || 0,
      shohozCount: results.shohoz?.length || 0,
      firsttripCount: results.firsttrip?.length || 0,
    },
  });

  const allNames = [...instant, ...browserQueue].map((s) => s.name);
  const stillPending = () => allNames.filter((n) => !(n in results));

  const run = async (scraper) => {
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

    // Shohoz answers in ~6s while ShareTrip takes ~30s. Publishing after each platform lets the
    // dashboard show real prices immediately instead of a spinner until the slowest one finishes.
    if (onPartial) {
      try {
        onPartial(buildPayload(stillPending()));
      } catch (e) {
        // A rendering/broadcast problem must never abort the search itself.
      }
    }
  };

  // Two workers pulling from one ordered queue, rather than fixed waves. A wave can only advance
  // when its slowest member finishes, which left FirstTrip running alone for ~7.8s while the other
  // browsers sat idle; a queue refills a slot the moment it frees up.
  let next = 0;
  const worker = async () => {
    while (next < browserQueue.length) {
      await run(browserQueue[next++]);
    }
  };

  await Promise.allSettled([
    ...instant.map(run),
    ...Array.from({ length: BROWSER_CONCURRENCY }, worker),
  ]);

  // Deliberately writes NO file here. Every search used to drop its own CSV into results/, which
  // accumulated ~90 files of clutter that nothing ever read — and under the nightly job, whose
  // departure dates roll daily, it would have added 11 more every night. Callers that want a file
  // write one themselves: the dashboard exports client-side, and scripts/daily-snapshot.js writes a
  // single merged file per day.
  return buildPayload([]);
}

module.exports = { runComparison };
