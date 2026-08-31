/**
 * Snapshot email delivery.
 *
 * Sends the nightly result over Gmail SMTP using an APP PASSWORD (not the account password —
 * Google blocks plain-password SMTP entirely). Credentials come from `.env`, which is gitignored,
 * so nothing sensitive is committed.
 *
 * Emailing is strictly optional: with no SMTP settings configured this module reports that it
 * skipped, and the snapshot still writes its files. Collecting the data must never depend on the
 * mail server being reachable.
 *
 * The attachment is the run's own merged file — one row per route, named for the search date — so
 * each email is self-contained and stays small however long the job has been running.
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PLATFORMS = [
  ['sharetrip', 'ShareTrip'],
  ['gozayaan', 'GoZayaan'],
  ['shohoz', 'Shohoz'],
];

function isConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

const money = (n) => (n === '' || n == null ? '—' : 'BDT ' + Number(n).toLocaleString('en-US'));

/**
 * One line per route: the flight all three platforms carry, and what each charges for it.
 * The winning platform is emphasised rather than merely coloured, so it survives a mail client
 * that strips colour.
 */
function summaryTable(rows) {
  const th = (h, align = 'left') =>
    `<th style="padding:7px 12px;border:1px solid #d8dde5;text-align:${align};font-weight:600">${h}</th>`;
  const td = (v, extra = '') =>
    `<td style="padding:7px 12px;border:1px solid #d8dde5;${extra}">${v}</td>`;

  const head =
    '<tr style="background:#eef1f5">' +
    th('Route') + th('Flight') + th('Departs') +
    PLATFORMS.map(([, label]) => th(label, 'right')).join('') +
    th('Cheapest') +
    '</tr>';

  const body = rows.map((r) => {
    const winner = r.cheapest_discounted_platform;
    const cells = PLATFORMS.map(([key]) => {
      const isWin = key === winner;
      return td(
        isWin ? `<strong>${money(r[`${key}_discounted`])}</strong>` : money(r[`${key}_discounted`]),
        `text-align:right;font-variant-numeric:tabular-nums;${isWin ? 'color:#1a6b3c;background:#eef7f1' : ''}`
      );
    }).join('');
    const winLabel = (PLATFORMS.find(([k]) => k === winner) || [, '—'])[1];
    return '<tr>' +
      td(`<strong>${r.route}</strong> <span style="color:#5a6270">@${r.lead_days}d</span>`) +
      td(`${r.flight_no}<br><span style="color:#5a6270;font-size:12px">${r.airline}</span>`) +
      td(r.journey_date) +
      cells +
      td(winLabel, 'color:#1a6b3c') +
      '</tr>';
  }).join('\n');

  return `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:13px">
${head}
${body}
</table>`;
}

/**
 * @param {object}   opts
 * @param {Array}    opts.rows            one row per successfully captured route
 * @param {string[]} opts.failures        routes that produced no all-three-platform itinerary
 * @param {string[]} opts.warnings        per-platform "0 flights" notes
 * @param {string}   opts.searchDate      YYYY-MM-DD
 * @param {string}   opts.durationMin
 * @param {string}   opts.attachmentPath  CSV of this run's rows
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
async function sendSnapshotEmail({ rows, failures, warnings, searchDate, durationMin, attachmentPath }) {
  if (!isConfigured()) {
    return { sent: false, reason: 'SMTP_USER / SMTP_APP_PASSWORD not set in .env — email skipped' };
  }

  const to = process.env.SMTP_TO || process.env.SMTP_USER;
  const failed = failures.length;
  const subject = failed
    ? `⚠ Air price snapshot ${searchDate} — ${rows.length} routes, ${failed} failed`
    : `Air price snapshot ${searchDate} — ${rows.length} routes`;

  const problems = [];
  if (failed) {
    problems.push(
      `<div style="margin:14px 0;padding:11px 14px;border-left:3px solid #a0231d;background:#faeae8">
         <strong style="color:#a0231d">Not captured (${failed})</strong><br>
         <span style="color:#5a6270;font-size:12px">No single itinerary was priced by all three platforms.</span>
         <div style="margin-top:6px">${failures.join('<br>')}</div>
       </div>`
    );
  }
  if (warnings.length) {
    problems.push(
      `<div style="margin:14px 0;padding:11px 14px;border-left:3px solid #8a5d00;background:#faf2e0">
         <strong style="color:#8a5d00">Warnings (${warnings.length})</strong>
         <div style="margin-top:6px">${warnings.join('<br>')}</div>
       </div>`
    );
  }

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1d23;line-height:1.5">
  <p style="margin:0 0 4px"><strong>Air price snapshot — ${searchDate}</strong></p>
  <p style="margin:0;color:#5a6270">${rows.length} route${rows.length === 1 ? '' : 's'} captured in ${durationMin} min. Prices shown are the discounted total for the cheapest flight all three platforms sell.</p>
  ${problems.join('\n')}
  <div style="margin-top:18px">${summaryTable(rows)}</div>
  <p style="margin-top:18px;color:#5a6270;font-size:12px">
    Attached: this run's routes, in the same format the dashboard's comparison list exports.
  </p>
</div>`;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `Air Price Analysis <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments: fs.existsSync(attachmentPath)
      ? [{ filename: path.basename(attachmentPath), path: attachmentPath }]
      : [],
  });

  return { sent: true, reason: `emailed to ${to}` };
}

module.exports = { sendSnapshotEmail, isConfigured };
