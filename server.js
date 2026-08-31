/**
 * Flight Price Comparison — Server
 * Express + WebSocket server that runs scrapers in background.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { runComparison } = require('./src/runner');
const { AIRPORTS } = require('./src/config');

const app = express();
const PORT = process.env.PORT || 3000;

// Every comparison drives headless Chromium instances (one per browser-based platform), so
// unbounded concurrency saturates the CPU instead of going faster: measured on an 8-core box,
// four simultaneous searches stretched a 26s search to 74s while barely improving throughput.
// Cap how many run at once and queue the rest, so each search stays fast and the box stays usable.
const MAX_CONCURRENT_COMPARISONS = Number(process.env.MAX_CONCURRENT_COMPARISONS) || 2;
let activeComparisons = 0;
const comparisonQueue = [];

function acquireComparisonSlot() {
  if (activeComparisons < MAX_CONCURRENT_COMPARISONS) {
    activeComparisons++;
    return Promise.resolve();
  }
  return new Promise((resolve) => comparisonQueue.push(resolve));
}

// Hand the slot straight to the next waiter rather than decrementing and re-racing, so a queued
// request can't be starved by one that arrives later.
function releaseComparisonSlot() {
  const next = comparisonQueue.shift();
  if (next) next();
  else activeComparisons--;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server and attach WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected clients
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total)`);
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} total)`);
  });
});

function broadcastProgress(platform, status, message) {
  const payload = JSON.stringify({ type: 'progress', platform, status, message });
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(payload);
    }
  }
}

// ============ API Routes ============

// GET /api/airports — return airport list for autocomplete
app.get('/api/airports', (req, res) => {
  const list = Object.values(AIRPORTS).map(a => ({
    code: a.code,
    name: a.name,
    city: a.city,
    country: a.country,
    label: `${a.city}, ${a.country} (${a.code})`,
  }));
  res.json(list);
});

// POST /api/compare — trigger scraping and return comparison
app.post('/api/compare', async (req, res) => {
  // `returnDate` is optional — when present, run a bundled round-trip comparison.
  const { from, to, date, returnDate } = req.body;

  if (!from || !to || !date) {
    return res.status(400).json({ error: 'Missing required fields: from, to, date' });
  }

  if (from === to) {
    return res.status(400).json({ error: 'Origin and destination cannot be the same' });
  }

  if (returnDate && returnDate < date) {
    return res.status(400).json({ error: 'Return date cannot be before the departure date' });
  }

  const isRoundTrip = !!returnDate;
  console.log(`\n[API] Compare request: ${from} ${isRoundTrip ? '⇄' : '→'} ${to} on ${date}${isRoundTrip ? ` / ${returnDate}` : ''}`);

  // Say so rather than leaving the UI silent while the queue drains.
  if (activeComparisons >= MAX_CONCURRENT_COMPARISONS) {
    const ahead = comparisonQueue.length + 1;
    console.log('[API] Queued — ' + activeComparisons + ' running, ' + ahead + ' waiting');
    broadcastProgress('all', 'queued', 'Waiting for a free slot (' + ahead + ' ahead)...');
  }
  await acquireComparisonSlot();

  // Broadcast "started" to all WebSocket clients
  broadcastProgress('all', 'started', 'Starting price comparison...');

  try {
    const results = await runComparison({ from, to, date, returnDate }, broadcastProgress);

    broadcastProgress('all', 'complete', 'Comparison complete!');
    console.log(`[API] Comparison complete: ${results.comparisons.length} flights matched`);

    res.json(results);
  } catch (err) {
    console.error('[API] Comparison error:', err);
    broadcastProgress('all', 'error', `Comparison failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    releaseComparisonSlot();
  }
});

// Fallback — serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
server.listen(PORT, () => {
  console.log(`\n✈  Flight Price Comparison Server`);
  console.log(`   Dashboard: http://localhost:${PORT}`);
  console.log(`   API:       http://localhost:${PORT}/api/compare`);
  console.log(`   WebSocket: ws://localhost:${PORT}\n`);
});
