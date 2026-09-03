/**
 * Writes the daily snapshot into a workbook, one worksheet per search date, laid out the same way
 * as the date tabs in the main "Air Price Analysis.xlsx" so a sheet can be copied straight across.
 *
 * Deliberately writes its OWN workbook rather than the main one. exceljs works by reading a workbook
 * into memory and writing a brand-new file, and it does not understand pivot tables, pivot caches or
 * drawings — the main file has 2 pivot tables, 3 caches and a drawing across 769 parts, all of which
 * would be silently dropped on the first run. A year of analysis is not worth risking for an
 * automated append.
 *
 * Layout mirrored from the original (verified against the "20th April" tab):
 *   - column A and row 1 are blank spacers
 *   - row 2 carries the section name, the JOURNEY date being priced, and merged group headers
 *   - row 3 carries the sub-headers; data starts at row 4; panes frozen at D4
 *   - routes read "DAC - CXB", flights read "VQ - 921"
 *   - each section ends with an Average row over the two difference percentages
 * The FlightExpert and FirstTrip column groups from the original are omitted, since this app does
 * not scrape those two.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const BD_DOMESTIC = new Set(['DAC', 'CXB', 'CGP', 'ZYL', 'RJH', 'SPD', 'JSR', 'BZL']);

// Widths lifted from the original sheet so columns line up when a tab is pasted beside an old one.
const WIDTHS = [2.86, 14.86, 24.29, 9.71, 11.71, 11.14, 10.86, 10.43, 12, 11.71, 12.29, 13.14, 10.57, 13.57, 10.86, 12.14, 13, 10];

const SUB_HEADERS = [
  '', 'Route', 'Flight',
  'Base ', 'Gross', 'Discount', 'Platform',
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
];

// Row positions of the two percentage columns, 0-based within a data row.
const PCT_INDEXES = { sharetrip: 11, gozayaan: 16 };

function ordinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

/** '2026-09-03' -> '3rd Sept', matching the main workbook's tab naming. */
function sheetNameFor(searchDate) {
  const [, month, day] = searchDate.split('-').map(Number);
  return `${ordinal(day)} ${MONTHS[month - 1]}`;
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
function dataRow({ match }) {
  const sh = match.platforms?.shohoz || {};
  const st = match.platforms?.sharetrip || {};
  const gz = match.platforms?.gozayaan || {};

  // Both sides are FINAL prices — the discounted totals the dashboard shows with each platform's
  // coupon applied (OCDOM/GPINT on Shohoz, BKASHDOM/FLYGPSTAR on ShareTrip, the best Hot Deal on
  // GoZayaan). A positive difference means Shohoz is the dearer of the two.
  const shohozFinal = sh.totalBkash;
  const diff = (rivalFinal) =>
    shohozFinal != null && rivalFinal != null ? shohozFinal - rivalFinal : '';
  const pct = (d) => (d !== '' && shohozFinal ? d / shohozFinal : '');

  const stDiff = diff(st.totalBkash);
  const gzDiff = diff(gz.totalBkash);
  const [from, to] = endpointsOf(match.route);

  const cheapest = { sharetrip: 'ShareTrip', gozayaan: 'GoZayaan', shohoz: 'Shohoz' }[
    match.cheapestBkash?.platform
  ] || '';

  return [
    '', `${from} - ${to}`, formatFlight(match.flightNo),
    sh.baseFare ?? '', sh.totalStandard ?? '', sh.totalBkash ?? '', sh.platformPrice ?? '',
    st.baseFare ?? '', st.totalStandard ?? '', st.totalBkash ?? '',
    stDiff, pct(stDiff),
    gz.baseFare ?? '', gz.totalStandard ?? '', gz.totalBkash ?? '',
    gzDiff, pct(gzDiff),
    cheapest,
  ];
}

const MONEY_COLS = [4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16];
const PCT_COLS = [12, 17];

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
  groupRow.getCell(18).value = 'Cheapest';
  sheet.mergeCells(startRow, 18, startRow + 1, 18);

  const subRow = sheet.getRow(startRow + 1);
  SUB_HEADERS.forEach((h, i) => { if (i >= 1 && i !== 17) subRow.getCell(i + 1).value = h; });

  for (const row of [groupRow, subRow]) {
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let c = 2; c <= 18; c++) {
      row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F5' } };
      row.getCell(c).border = { bottom: { style: 'thin', color: { argb: 'FFBFC7D2' } } };
    }
  }

  const rows = entries.map(dataRow);
  let r = startRow + 2;
  for (const values of rows) {
    const row = sheet.getRow(r);
    values.forEach((v, i) => { row.getCell(i + 1).value = v === '' ? null : v; });
    for (const c of MONEY_COLS) row.getCell(c).numFmt = '#,##0';
    for (const c of PCT_COLS) row.getCell(c).numFmt = '0.00%';
    row.getCell(18).alignment = { horizontal: 'center' };
    r++;
  }

  // Average of the two difference percentages, so each section says at a glance how much dearer
  // ShareTrip and GoZayaan run against Shohoz across its routes.
  const mean = (index) => {
    const nums = rows.map((v) => v[index]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const avgRow = sheet.getRow(r);
  avgRow.getCell(2).value = 'Average';
  avgRow.getCell(12).value = mean(PCT_INDEXES.sharetrip);
  avgRow.getCell(17).value = mean(PCT_INDEXES.gozayaan);
  avgRow.font = { bold: true };
  for (const c of PCT_COLS) {
    avgRow.getCell(c).numFmt = '0.00%';
    avgRow.getCell(c).alignment = { horizontal: 'right' };
  }
  for (let c = 2; c <= 18; c++) {
    avgRow.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFBFC7D2' } } };
  }

  return r + 1;
}

/**
 * @param {object}   opts
 * @param {Array}    opts.entries       [{ match, journeyDate }]
 * @param {string}   opts.searchDate    YYYY-MM-DD, used for the sheet name
 * @param {string}   opts.workbookPath  absolute path; when unset the write is skipped
 * @returns {Promise<{written: boolean, reason: string, sheet?: string}>}
 */
async function writeDailySheet({ entries, searchDate, workbookPath }) {
  if (!workbookPath) {
    return { written: false, reason: 'SNAPSHOT_XLSX not set in .env — Excel write skipped' };
  }

  // Excel holds an exclusive lock and leaves a ~$ file beside the workbook. Writing underneath that
  // produces OneDrive conflict copies, so skip the run rather than corrupt anything.
  const lockFile = path.join(path.dirname(workbookPath), '~$' + path.basename(workbookPath));
  if (fs.existsSync(lockFile)) {
    return { written: false, reason: 'workbook is open in Excel — Excel write skipped' };
  }

  const workbook = new ExcelJS.Workbook();
  const exists = fs.existsSync(workbookPath);
  if (exists) await workbook.xlsx.readFile(workbookPath);
  else fs.mkdirSync(path.dirname(workbookPath), { recursive: true });

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

  await workbook.xlsx.writeFile(workbookPath);
  return {
    written: true,
    sheet: name,
    reason: `${exists ? 'added' : 'created workbook and added'} sheet "${name}" (${domestic.length} domestic, ${international.length} international)`,
  };
}

module.exports = { writeDailySheet, sheetNameFor };
