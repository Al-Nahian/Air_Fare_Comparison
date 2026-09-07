/**
 * Writes the daily snapshot into a workbook, one worksheet per search date, laid out the same way
 * as the date tabs in the main "Air Price Analysis.xlsx" so a sheet can be copied straight across.
 *
 * TWO FILES, ON PURPOSE:
 *   results/Air Price Daily Snapshot.xlsx   the master. Local, never synced, and nothing but this
 *                                           script ever touches it, so writing to it cannot fail.
 *   <SNAPSHOT_XLSX>                         a copy pushed into the OneDrive/SharePoint folder.
 *
 * The copy is disposable. If it can't happen — workbook open in Excel, someone editing it in a
 * browser, sync stuck — the run says so and moves on, and the NEXT run's copy carries the missed
 * days too, because the master still holds every tab. Writing straight to the synced file instead
 * would lose that day's tab permanently, since there would be no second copy to add it to.
 *
 * Deliberately never writes the main "Air Price Analysis.xlsx". exceljs reads a workbook into memory
 * and writes a brand-new file, and cannot round-trip pivot tables, pivot caches or drawings — that
 * file has 2 pivot tables, 3 caches and a drawing across 769 parts, all of which would be silently
 * dropped on the first run.
 *
 * Layout mirrored from the original (verified against the "20th April" tab):
 *   - column A and row 1 are blank spacers
 *   - row 2 carries the section name, the JOURNEY date being priced, and merged group headers
 *   - row 3 carries the sub-headers; data starts at row 4; panes frozen at D4
 *   - routes read "DAC - CXB", flights read "VQ - 921"
 *   - each section ends with an Average row over the two difference percentages
 * The FlightExpert column group from the original is omitted, since this app does not scrape it.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const MASTER_PATH = path.join(RESULTS_DIR, 'Air Price Daily Snapshot.xlsx');
// Ad-hoc runs on a subset config write here instead, and never publish. Sheet names are dates, so
// a test run would otherwise overwrite the day's real tab in the master and push it to SharePoint.
const TEST_MASTER_PATH = path.join(RESULTS_DIR, 'Air Price Daily Snapshot (test).xlsx');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const BD_DOMESTIC = new Set(['DAC', 'CXB', 'CGP', 'ZYL', 'RJH', 'SPD', 'JSR', 'BZL']);

// Widths lifted from the original sheet so columns line up when a tab is pasted beside an old one.
const WIDTHS = [
  2.86, 14.86, 24.29,               // spacer, Route, Flight
  9.71, 11.71, 11.14, 10.86,        // Shohoz
  10.43, 12, 11.71, 12.29, 13.14,   // ShareTrip + difference
  10.57, 13.57, 10.86, 12.14, 13,   // GoZayaan + difference
  10.57, 13.57, 10.86, 12.14, 13,   // FirstTrip + difference
  10,                               // Cheapest
];

const SUB_HEADERS = [
  '', 'Route', 'Flight',
  'Base ', 'Gross', 'Discount', 'Platform',
  'Base', 'Gross', 'Discount',
  'Difference', 'Percentage',
  'Base', 'Gross', 'Discount',
  'Difference', 'Percentage',
  'Base', 'Gross', 'Discount',
  'Difference', 'Percentage',
  'Cheapest',
];

const GROUPS = [
  { from: 4, to: 7, label: 'Shohoz' },
  { from: 8, to: 10, label: 'ShareTrip' },
  { from: 11, to: 12, label: 'Difference with Shohoz' },
  { from: 13, to: 15, label: 'GoZayaan' },
  { from: 16, to: 17, label: 'Difference with Shohoz' },
  { from: 18, to: 20, label: 'FirstTrip' },
  { from: 21, to: 22, label: 'Difference with Shohoz' },
];

const CHEAPEST_COL = 23;
const LAST_COL = 23;

// Row positions of the percentage cells, 0-based within a data row.
const PCT_INDEXES = { sharetrip: 11, gozayaan: 16, firsttrip: 21 };
const MONEY_COLS = [4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 18, 19, 20, 21];
const PCT_COLS = [12, 17, 22];

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

/**
 * '2026-09-03' -> '3rd Sept 2026'.
 *
 * Follows the main workbook's '3rd Sept' convention but ADDS THE YEAR. That workbook already
 * holds a year of tabs named without one, so a yearless name collides on every single date, and
 * copying a new tab across would silently replace the previous year's analysis.
 */
function sheetNameFor(searchDate) {
  const [year, month, day] = searchDate.split('-').map(Number);
  return `${ordinal(day)} ${MONTHS[month - 1]} ${year}`;
}

// "DAC → CXB" -> ["DAC", "CXB"];  round trips use ⇄
function endpointsOf(route) {
  return String(route).split(/\s*[→⇄]\s*/).map((s) => s.trim());
}

// "VQ 921" -> "VQ - 921";  "AI 238 + AI 4209" -> "AI - 238 + AI - 4209"
function formatFlight(flightNo) {
  return String(flightNo)
    .split(' + ')
    .map((leg) => leg.replace(/^([A-Z0-9]{2})\s+(.+)$/, '$1 - $2'))
    .join(' + ');
}

/** One data row, in the original's column order. */
function dataRow({ match, comparable = true }) {
  const sh = match.platforms?.shohoz || {};
  const st = match.platforms?.sharetrip || {};
  const gz = match.platforms?.gozayaan || {};
  const ft = match.platforms?.firsttrip || {};

  // Both sides are FINAL prices — the discounted totals the dashboard shows with each platform's
  // coupon applied (OCDOM/GPINT on Shohoz, BKASHDOM/FLYGPSTAR on ShareTrip, the best Hot Deal on
  // GoZayaan). A positive difference means Shohoz is the dearer of the two.
  const shohozFinal = sh.totalBkash;
  const diff = (rivalFinal) =>
    shohozFinal != null && rivalFinal != null ? shohozFinal - rivalFinal : '';
  const pct = (d) => (d !== '' && shohozFinal ? d / shohozFinal : '');

  const stDiff = diff(st.totalBkash);
  const gzDiff = diff(gz.totalBkash);
  const ftDiff = diff(ft.totalBkash);
  const [from, to] = endpointsOf(match.route);

  const cheapest = {
    sharetrip: 'ShareTrip', gozayaan: 'GoZayaan', shohoz: 'Shohoz', firsttrip: 'FirstTrip',
  }[match.cheapestBkash?.platform] || '';

  return [
    // A trailing asterisk marks a row whose platforms quoted different base fares, i.e. different
    // fare classes for the same flight number, so its difference is not like-for-like.
    '', `${from} - ${to}${comparable ? '' : ' *'}`, formatFlight(match.flightNo),
    sh.baseFare ?? '', sh.totalStandard ?? '', sh.totalBkash ?? '', sh.platformPrice ?? '',
    st.baseFare ?? '', st.totalStandard ?? '', st.totalBkash ?? '',
    stDiff, pct(stDiff),
    gz.baseFare ?? '', gz.totalStandard ?? '', gz.totalBkash ?? '',
    gzDiff, pct(gzDiff),
    ft.baseFare ?? '', ft.totalStandard ?? '', ft.totalBkash ?? '',
    ftDiff, pct(ftDiff),
    cheapest,
  ];
}

/** Header block, data rows and the average row for one section. Returns the next free row. */
function writeSection(sheet, startRow, label, journeyDate, entries) {
  const groupRow = sheet.getRow(startRow);
  groupRow.getCell(2).value = label;
  // The journey date being priced, not the date the search ran — that is in the sheet name.
  groupRow.getCell(3).value = journeyDate;
  for (const g of GROUPS) {
    groupRow.getCell(g.from).value = g.label;
    sheet.mergeCells(startRow, g.from, startRow, g.to);
  }
  groupRow.getCell(CHEAPEST_COL).value = 'Cheapest';
  sheet.mergeCells(startRow, CHEAPEST_COL, startRow + 1, CHEAPEST_COL);

  const subRow = sheet.getRow(startRow + 1);
  // The Cheapest header is merged down from the row above, so skip writing it again here.
  SUB_HEADERS.forEach((h, i) => { if (i >= 1 && i + 1 !== CHEAPEST_COL) subRow.getCell(i + 1).value = h; });

  for (const row of [groupRow, subRow]) {
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = 2; c <= LAST_COL; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F5' } };
      row.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFBFC7D2' } } };
    }
  }

  const rows = entries.map(dataRow);
  let r = startRow + 2;
  entries.forEach((entry, idx) => {
    const row = sheet.getRow(r);
    rows[idx].forEach((v, i) => { row.getCell(i + 1).value = v === '' ? null : v; });
    for (const c of MONEY_COLS) row.getCell(c).numFmt = '#,##0';
    for (const c of PCT_COLS) row.getCell(c).numFmt = '0.00%';
    row.getCell(CHEAPEST_COL).alignment = { horizontal: 'center' };
    if (entry.comparable === false) {
      for (let c = 2; c <= LAST_COL; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF0E0' } };
      }
    }
    r++;
  });

  // Average of the two difference percentages, so each section says at a glance how much dearer
  // Shohoz runs against ShareTrip and GoZayaan across its routes.
  const mean = (index) => {
    const nums = rows.map((v) => v[index]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const avgRow = sheet.getRow(r);
  avgRow.getCell(2).value = 'Average';
  avgRow.getCell(12).value = mean(PCT_INDEXES.sharetrip);
  avgRow.getCell(17).value = mean(PCT_INDEXES.gozayaan);
  avgRow.getCell(22).value = mean(PCT_INDEXES.firsttrip);
  avgRow.font = { bold: true };
  for (const c of PCT_COLS) {
    avgRow.getCell(c).numFmt = '0.00%';
    avgRow.getCell(c).alignment = { horizontal: 'right' };
  }
  for (let c = 2; c <= LAST_COL; c++) {
    avgRow.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFBFC7D2' } } };
  }

  // Explain the asterisk in the sheet itself, so the caveat travels with the tab when it is copied.
  if (entries.some((e) => e.comparable === false)) {
    const note = sheet.getRow(r + 1);
    note.getCell(2).value = '* base fares differ across platforms — different fare class, not a like-for-like comparison';
    note.getCell(2).font = { italic: true, size: 9, color: { argb: 'FF8A5D00' } };
    return r + 3;
  }

  return r + 1;
}

/**
 * Copy the master into the synced folder, and report anything that stopped it.
 *
 * Deliberately non-fatal. The master already holds the data, so a blocked copy delays publication
 * by a day rather than losing anything.
 */
function publish(masterPath, targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);

  // Desktop Excel leaves a ~$ lock file beside the workbook. A browser (Excel Online) session
  // leaves NO local trace, which is why the conflict scan below matters as well.
  if (fs.existsSync(path.join(dir, '~$' + base))) {
    return { ok: false, reason: 'target workbook is open in Excel — copy deferred to the next run' };
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(masterPath, targetPath);
  } catch (err) {
    return { ok: false, reason: `copy failed (${err.code || err.message}) — deferred to the next run` };
  }

  // OneDrive resolves an unmergeable clash by keeping both files, renaming one after the machine.
  // Nobody notices those, so surface them.
  const stem = base.replace(/\.xlsx$/i, '');
  let conflicts = [];
  try {
    conflicts = fs.readdirSync(dir).filter(
      (f) => f !== base && f.startsWith(stem) && /\.xlsx$/i.test(f)
    );
  } catch (err) {
    // Listing the folder is a nicety; never let it fail the run.
  }

  return { ok: true, conflicts, reason: `copied to ${base}` };
}

/**
 * @param {object}   opts
 * @param {Array}    opts.entries      [{ match, journeyDate, comparable }]
 * @param {string}   opts.searchDate   YYYY-MM-DD, used for the sheet name
 * @param {string}   opts.publishPath  where to copy the master; when unset only the master is written
 * @returns {Promise<{sheet, master, sheetCount, publish}>}
 */
async function writeDailySheet({ entries, searchDate, publishPath, isTest = false }) {
  const masterPath = isTest ? TEST_MASTER_PATH : MASTER_PATH;
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(masterPath)) await workbook.xlsx.readFile(masterPath);
  else fs.mkdirSync(path.dirname(masterPath), { recursive: true });

  // Re-running on the same day replaces that day's tab instead of stacking duplicates.
  const name = sheetNameFor(searchDate);
  const previous = workbook.getWorksheet(name);
  if (previous) workbook.removeWorksheet(previous.id);

  const sheet = workbook.addWorksheet(name);
  WIDTHS.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

  const isDomestic = (e) => endpointsOf(e.match.route).every((a) => BD_DOMESTIC.has(a));
  const domestic = entries.filter(isDomestic);
  const international = entries.filter((e) => !isDomestic(e));

  // Every route in a section shares a lead time, so the section's journey date is uniform.
  const journeyOf = (list) => (list.length ? list[0].journeyDate : '');

  let row = 2;
  if (domestic.length) row = writeSection(sheet, row, 'Domestic', journeyOf(domestic), domestic) + 2;
  if (international.length) writeSection(sheet, row, 'International', journeyOf(international), international);

  // Same frozen view as the original: route and flight stay visible while scrolling prices.
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 3 }];

  await workbook.xlsx.writeFile(masterPath);

  return {
    sheet: name,
    master: masterPath,
    sheetCount: workbook.worksheets.length,
    publish: isTest
      ? { ok: false, reason: 'test run — written to the test master, not published' }
      : publishPath
        ? publish(masterPath, publishPath)
        : { ok: false, reason: 'SNAPSHOT_XLSX not set in .env — kept local only' },
  };
}

module.exports = { writeDailySheet, sheetNameFor, MASTER_PATH };
