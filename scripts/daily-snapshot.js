/**
 * Daily price snapshot — unattended.
 *
 * Runs the same `runComparison()` the dashboard uses for every route in `routes.json`, and writes
 * ONE merged file per run: `results/comparison_list_<search date>.csv`. No server and no browser UI
 * are involved — this is a plain script any scheduler can fire (Windows Task Scheduler here, cron on
 * a server), which is deliberate: the web server process is not a dependency of data collection.
 *
 * The filename carries the date the SEARCH ran; the first column carries the JOURNEY date being
 * priced. Those are different things and both matter — with rolling lead times a route's journey
 * date moves forward every night.
 *
 * Lead times, not fixed dates: each route is priced N days ahead of the run date, so "DAC-KTM at 30
 * days out" is the same measurement every night and files stay comparable across days.
 *
 * One row per route, not per flight: the row is the first itinerary carried by ALL THREE platforms.
 * `compareResults` already sorts by platform coverage and then by price, so that first match is also
 * the cheapest fully-comparable flight — the top row of the dashboard. A flight missing from any
 * platform is skipped, because a partial row can't answer "who was cheapest today".
 *
 * Routes run strictly one at a time. Each comparison drives two headless Chromium instances, so a
 * parallel batch would saturate the CPU and could starve anyone using the live dashboard.
 *
 * Exit code is 1 if any route failed, so a scheduler reports a failed run instead of the job
 * silently recording empty days — the failure mode that actually matters here, because an expired
 * login surfaces as "0 flights" rather than as an error.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runComparison } = require('../src/runner');
const { sendSnapshotEmail } = require('./mailer');

const ROOT = path.join(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'results');
const LOG_FILE = path.join(RESULTS_DIR, 'snapshot-log.txt');
// One merged file per run, named for the date the search was executed.
const dailyCsvPath = (searchDate) => path.join(RESULTS_DIR, `comparison_list_${searchDate}.csv`);

const PLATFORMS = ['sharetrip', 'gozayaan', 'shohoz'];

/**
 * The dashboard's comparison-list export columns (see `exportComparisonListCSV` in
 * public/js/app.js), with the journey date moved to the front — the filename already says when the
 * search ran, so the first thing in a row should be when you'd actually fly.
 *
 * "Difference" and "Percentage" mirror the UI exactly: Shohoz's platform price against ShareTrip's
 * discounted price.
 */
const HEADERS = [
  'Journey Date', 'Route', 'Flight',
  'Shohoz Base', 'Shohoz Gross', 'Shohoz Discount', 'Shohoz Platform',
  'ShareTrip Base', 'ShareTrip Gross', 'ShareTrip Discount',
  'Difference', 'Percentage',
  'GoZayaan Base', 'GoZayaan Gross', 'GoZayaan Discount',
];

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  try {
    fs.appendFileSync(LOG_FILE, stamped + '\n');
  } catch (e) {
    // Logging must never be the thing that kills an unattended run.
  }
}

// Local calendar date, deliberately not UTC: a run just after midnight local time would otherwise
// be filed under the previous day and shift every lead time by one.
function localDate(daysAhead = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function writeDailyCsv(entries, searchDate) {
  const rows = entries.map(({ match, journeyDate }) => {
    const shohoz = match.platforms?.shohoz || {};
    const sharetrip = match.platforms?.sharetrip || {};
    const gozayaan = match.platforms?.gozayaan || {};

    const shohozPlatform = shohoz.platformPrice ?? '';
    const sharetripDiscount = sharetrip.totalBkash ?? '';
    const difference = (shohoz.platformPrice != null && sharetrip.totalBkash != null)
      ? shohoz.platformPrice - sharetrip.totalBkash
      : '';
    const percentage = (difference !== '' && shohoz.platformPrice)
      ? `${((difference / shohoz.platformPrice) * 100).toFixed(2)}%`
      : '';

    return [
      journeyDate, match.route, match.flightNo,
      shohoz.baseFare ?? '', shohoz.totalStandard ?? '', shohoz.totalBkash ?? '', shohozPlatform,
      sharetrip.baseFare ?? '', sharetrip.totalStandard ?? '', sharetripDiscount,
      difference, percentage,
      gozayaan.baseFare ?? '', gozayaan.totalStandard ?? '', gozayaan.totalBkash ?? '',
    ];
  });

  // Quoting and BOM match the dashboard's export byte for byte, so Excel opens either file the same.
  const csv = [HEADERS, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const file = dailyCsvPath(searchDate);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(file, '﻿' + csv, 'utf8');
  return file;
}

/**
 * Find the itinerary priced by all three platforms, and summarise it for logging and the email.
 * Returns null when no such itinerary exists — a reportable problem, not a blank day.
 */
function buildEntry(result, route, leadDays, journeyDate) {
  const match = (result.comparisons || []).find(
    (c) => PLATFORMS.every((p) => c.platforms && c.platforms[p])
  );
  if (!match) return null;

  const summary = {
    route: `${route.from}-${route.to}`,
    lead_days: leadDays,
    journey_date: journeyDate,
    airline: match.airline,
    flight_no: match.flightNo,
    cheapest_discounted_platform: match.cheapestBkash?.platform || '',
  };
  for (const p of PLATFORMS) summary[`${p}_discounted`] = match.platforms[p].totalBkash;

  return { match, journeyDate, summary };
}

async function main() {
  // Config file is overridable so a subset can be run ad hoc, or a second schedule added later.
  const configFile = process.argv[2] || 'routes.json';
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, configFile), 'utf8'));
  const routes = config.routes || [];
  const searchDate = localDate();
  const startedAt = Date.now();

  log(`=== snapshot start — ${routes.length} routes, search date ${searchDate} ===`);

  const entries = [];
  const failures = [];
  const warnings = [];

  for (const route of routes) {
    const { from, to, leadDays } = route;
    const journeyDate = localDate(leadDays);
    const returnDate = route.returnAfterDays ? localDate(leadDays + route.returnAfterDays) : undefined;
    const label = `${from}-${to} @${leadDays}d (${journeyDate}${returnDate ? ` / ${returnDate}` : ''})`;
    const t0 = Date.now();

    try {
      const result = await runComparison({ from, to, date: journeyDate, returnDate });
      const counts = result.meta || {};

      for (const [name, count] of [['sharetrip', counts.sharetripCount], ['gozayaan', counts.gozayaanCount], ['shohoz', counts.shohozCount]]) {
        if (!count) {
          const note = `${label} — ${name} returned 0 flights`;
          warnings.push(note);
          log(`WARN ${note}`);
        }
      }

      const entry = buildEntry(result, route, leadDays, journeyDate);
      if (!entry) {
        // Either a platform failed, or genuinely no single itinerary is sold by all three. Both
        // leave nothing comparable to record, so say so rather than writing a half-empty row.
        failures.push(`${label} — no itinerary carried by all 3 platforms`);
        log(`FAIL ${label} — no itinerary on all 3 platforms (ST ${counts.sharetripCount}, GZ ${counts.gozayaanCount}, SH ${counts.shohozCount})`);
        continue;
      }

      entries.push(entry);
      const s = entry.summary;
      log(`ok   ${label} — ${s.flight_no} ${s.airline} | ST ${s.sharetrip_discounted} · GZ ${s.gozayaan_discounted} · SH ${s.shohoz_discounted} | cheapest ${s.cheapest_discounted_platform} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (err) {
      failures.push(`${label} — ${err.message}`);
      log(`FAIL ${label} — ${err.message}`);
    }
  }

  const mins = ((Date.now() - startedAt) / 60000).toFixed(1);
  log(`=== snapshot done — ${entries.length}/${routes.length} routes captured in ${mins} min, ${failures.length} failed ===`);
  if (failures.length) process.exitCode = 1;

  if (entries.length > 0) {
    const filePath = writeDailyCsv(entries, searchDate);
    log(`file — ${filePath}`);

    // The file is already safely written by this point. Email is a delivery convenience, so a mail
    // failure is logged loudly but never discards a successful collection run.
    try {
      const { sent, reason } = await sendSnapshotEmail({
        rows: entries.map((e) => e.summary),
        failures, warnings, searchDate, durationMin: mins, attachmentPath: filePath,
      });
      log(sent ? `email sent — ${reason}` : `email skipped — ${reason}`);
    } catch (err) {
      log(`EMAIL FAILED — ${err.message} (the file is still saved in results/)`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  log(`FATAL ${err.stack || err.message}`);
  process.exitCode = 1;
});
