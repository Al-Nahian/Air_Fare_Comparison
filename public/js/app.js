/**
 * Flight Price Comparison — Frontend Application
 */

(function () {
  'use strict';

  // ============ State ============
  let airports = [];
  let ws = null;
  let lastResults = null;
  let activeAirlineFilters = new Set(); // empty = show all

  // ============ DOM Elements ============
  const fromInput = document.getElementById('fromAirport');
  const toInput = document.getElementById('toAirport');
  const fromCode = document.getElementById('fromCode');
  const toCode = document.getElementById('toCode');
  const fromDropdown = document.getElementById('fromDropdown');
  const toDropdown = document.getElementById('toDropdown');
  const dateInput = document.getElementById('travelDate');
  const returnDateInput = document.getElementById('returnDate');
  const returnDateField = document.getElementById('returnDateField');
  const tripTypeButtons = Array.from(document.querySelectorAll('.trip-type-btn'));
  const searchForm = document.getElementById('searchForm');
  const compareBtn = document.getElementById('compareBtn');
  const swapBtn = document.getElementById('swapBtn');
  const progressSection = document.getElementById('progressSection');
  const resultsSection = document.getElementById('resultsSection');
  const resultsContainer = document.getElementById('resultsContainer');
  const airlineFilter = document.getElementById('airlineFilter');
  const resultsTitle = document.getElementById('resultsTitle');
  const resultsSubtitle = document.getElementById('resultsSubtitle');
  const exportBtn = document.getElementById('exportBtn');
  const emptyState = document.getElementById('emptyState');
  const comparisonListToggle = document.getElementById('comparisonListToggle');
  const comparisonListCount = document.getElementById('comparisonListCount');
  const comparisonListPanel = document.getElementById('comparisonListPanel');
  const comparisonListItems = document.getElementById('comparisonListItems');
  const comparisonListExport = document.getElementById('comparisonListExport');
  const comparisonListClose = document.getElementById('comparisonListClose');
  const themeToggle = document.getElementById('themeToggle');
  const searchStepsEl = document.getElementById('searchSteps');
  const advancedStatusToggle = document.getElementById('advancedStatusToggle');
  const progressItemsEl = document.getElementById('progressItems');

  // ============ Init ============
  async function init() {
    setupThemeToggle();
    setupAdvancedStatusToggle();
    setupInteractiveBackground();
    setMinDate();
    await loadAirports();
    setupAutocomplete(fromInput, fromCode, fromDropdown);
    setupAutocomplete(toInput, toCode, toDropdown);
    setupSwapButton();
    setupTripType();
    setupForm();
    setupExport();
    setupComparisonList();
    connectWebSocket();
  }

  // ============ Theme Toggle ============
  function setupThemeToggle() {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // ============ Advanced Status Toggle ============
  // The per-platform rows are detail most people don't need, so they start collapsed.
  function setupAdvancedStatusToggle() {
    const label = advancedStatusToggle.querySelector('.advanced-toggle__label');
    advancedStatusToggle.addEventListener('click', () => {
      const isExpanded = advancedStatusToggle.getAttribute('aria-expanded') === 'true';
      advancedStatusToggle.setAttribute('aria-expanded', String(!isExpanded));
      progressItemsEl.classList.toggle('progress-card__items--collapsed', isExpanded);
      label.textContent = isExpanded ? 'View advanced status' : 'Hide advanced status';
    });
  }

  // ============ Interactive Background ============
  // Orbs parallax toward the cursor and a soft radial glow follows it, so the background
  // subtly shifts focus/blur as the mouse moves. Movement is eased for a fluid feel.
  function setupInteractiveBackground() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const blobs = Array.from(document.querySelectorAll('.bg-blob'));
    const glow = document.querySelector('.bg-cursor-glow');
    if (!blobs.length && !glow) return;

    // Per-orb parallax depth (px of travel at the screen edge); alternating signs so they
    // drift in different directions for a layered, dimensional feel.
    const depths = [46, -60, 34];
    let targetX = 0, targetY = 0;   // normalized cursor offset from center, -1..1
    let curX = 0, curY = 0;
    let raf = null;

    let glowX = window.innerWidth / 2, glowY = window.innerHeight * 0.38;

    // Only RECORD the cursor here; all style writes happen in the rAF tick below. A high-polling
    // mouse fires this far more often than once per frame, and writing styles per event made the
    // browser do the same work several times for a single painted frame.
    window.addEventListener('mousemove', (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
      glowX = e.clientX;
      glowY = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });

    function tick() {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      blobs.forEach((b, i) => {
        const d = depths[i % depths.length];
        b.style.setProperty('--px', (curX * d).toFixed(1) + 'px');
        b.style.setProperty('--py', (curY * d).toFixed(1) + 'px');
      });
      if (glow) glow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0)`;
      if (Math.abs(targetX - curX) > 0.0005 || Math.abs(targetY - curY) > 0.0005) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = null;
      }
    }
  }

  function setMinDate() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
    // Default to 7 days from now
    const defaultDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dy = defaultDate.getFullYear();
    const dm = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const ddd = String(defaultDate.getDate()).padStart(2, '0');
    dateInput.value = `${dy}-${dm}-${ddd}`;
  }

  // ============ Airports ============
  async function loadAirports() {
    try {
      const res = await fetch('/api/airports');
      airports = await res.json();
    } catch (err) {
      console.error('Failed to load airports:', err);
      // Fallback hardcoded list
      airports = [
        { code: 'DAC', city: 'Dhaka', label: 'Dhaka (DAC)' },
        { code: 'CXB', city: "Cox's Bazar", label: "Cox's Bazar (CXB)" },
        { code: 'CGP', city: 'Chittagong', label: 'Chittagong (CGP)' },
        { code: 'ZYL', city: 'Sylhet', label: 'Sylhet (ZYL)' },
        { code: 'RJH', city: 'Rajshahi', label: 'Rajshahi (RJH)' },
        { code: 'SPD', city: 'Saidpur', label: 'Saidpur (SPD)' },
        { code: 'JSR', city: 'Jessore', label: 'Jessore (JSR)' },
        { code: 'BZL', city: 'Barisal', label: 'Barisal (BZL)' },
      ];
    }
  }

  // ============ Autocomplete ============
  function setupAutocomplete(input, hiddenInput, dropdown) {
    let activeIndex = -1;

    input.addEventListener('input', () => {
      const query = input.value.toLowerCase().trim();
      hiddenInput.value = '';
      activeIndex = -1;

      if (!query) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      const matches = airports.filter(a =>
        a.label.toLowerCase().includes(query) ||
        a.code.toLowerCase().includes(query) ||
        a.city.toLowerCase().includes(query) ||
        (a.country || '').toLowerCase().includes(query)
      ).slice(0, 10);

      if (matches.length === 0) {
        dropdown.classList.remove('active');
        dropdown.innerHTML = '';
        return;
      }

      renderDropdown(dropdown, matches, (airport) => {
        input.value = airport.label;
        hiddenInput.value = airport.code;
        dropdown.classList.remove('active');
      });

      dropdown.classList.add('active');
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) {
        input.dispatchEvent(new Event('input'));
      }
    });

    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.autocomplete-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        updateActiveItem(items, activeIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActiveItem(items, activeIndex);
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        items[activeIndex].click();
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('active');
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
      }
    });
  }

  function renderDropdown(dropdown, items, onSelect) {
    dropdown.innerHTML = items.map((a, i) => `
      <div class="autocomplete-item" data-index="${i}">
        <span>${a.city}${a.country ? `, ${a.country}` : ''}</span>
        <span class="autocomplete-item__code">${a.code}</span>
      </div>
    `).join('');

    dropdown.querySelectorAll('.autocomplete-item').forEach((el, i) => {
      el.addEventListener('click', () => onSelect(items[i]));
    });
  }

  function updateActiveItem(items, index) {
    items.forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
    if (items[index]) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
  }

  // ============ Swap Button ============
  function setupSwapButton() {
    swapBtn.addEventListener('click', () => {
      const tempValue = fromInput.value;
      const tempCode = fromCode.value;
      fromInput.value = toInput.value;
      fromCode.value = toCode.value;
      toInput.value = tempValue;
      toCode.value = tempCode;
    });
  }

  // ============ WebSocket ============
  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'progress') {
          updateProgress(data.platform, data.status, data.message);
        }
      } catch (e) {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      // Reconnect after a delay
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
      // Will trigger onclose
    };
  }

  // ============ Progress Updates ============
  function updateProgress(platform, status, message) {
    if (platform === 'all') return;

    // Drive the animated step feed from the real per-platform progress.
    reportPlatformProgress(platform, status);

    const item = document.querySelector(`.progress-item[data-platform="${platform}"]`);
    if (!item) return;

    item.setAttribute('data-status', status);
    const statusEl = item.querySelector('.progress-item__status');
    if (statusEl) {
      statusEl.textContent = message || status;
    }
  }

  function resetProgress() {
    document.querySelectorAll('.progress-item').forEach(item => {
      item.setAttribute('data-status', 'waiting');
      const statusEl = item.querySelector('.progress-item__status');
      if (statusEl) statusEl.textContent = 'Waiting...';
    });
  }

  // ============ Animated Search Steps (progress-driven) ============
  const SEARCH_STEPS = [
    { icon: '🔎', text: 'Looking for the best fares...' },
    { icon: '🛫', text: 'Comparing available departures...' },
    { icon: '🪙', text: "Checking today's lowest prices..." },
    { icon: '💗', text: 'Matching identical flights across platforms...' },
    { icon: '📘', text: 'Comparing fare options...' },
    { icon: '🧮', text: 'Calculating the final payable price...' },
    { icon: '🏆', text: 'Ranking the best deals...' },
    { icon: '✨', text: 'Almost done...' },
  ];
  // The `min` weight below (slowest platform) at which each step becomes the *active* one.
  // Because progress tracks the SLOWEST platform, the feed can't run ahead of one that's still
  // logging in, and the final step ("Almost done") only unlocks when EVERY platform is done.
  const STEP_THRESHOLDS = [0, 0.15, 0.30, 0.42, 0.55, 0.70, 0.88, 1.0];
  // Per-platform phase weights. Overall progress = the MINIMUM across the 3 platforms (the
  // slowest one), so a platform finishing instantly (e.g. Shohoz) can't drag the feed forward
  // while others are still logging in.
  const PHASE_WEIGHT = { waiting: 0, starting: 0.05, logging_in: 0.2, searching: 0.45, extracting: 0.8, done: 1, error: 1 };
  const platformProgress = { sharetrip: 0, gozayaan: 0, shohoz: 0, firsttrip: 0 };
  let searchStepsTimer = null;
  let searchStepsActive = false;

  function startSearchSteps() {
    stopSearchSteps();
    searchStepsEl.innerHTML = '';
    Object.keys(platformProgress).forEach((k) => { platformProgress[k] = 0; });
    searchStepsActive = true;
    appendStep(0);            // first step shows immediately
    syncStepsToProgress();
  }

  function appendStep(index) {
    const prevActive = searchStepsEl.querySelector('.search-step--active');
    if (prevActive) {
      prevActive.classList.remove('search-step--active');
      prevActive.classList.add('search-step--done');
    }
    const step = SEARCH_STEPS[index];
    const el = document.createElement('div');
    el.className = 'search-step search-step--active';
    el.innerHTML = `
      <span class="search-step__icon">${step.icon}</span>
      <span class="search-step__text">${step.text}</span>
      <span class="search-step__marker"></span>
    `;
    searchStepsEl.appendChild(el);
  }

  function overallProgress() {
    // The slowest platform gates the feed — we're only as far as our least-progressed source.
    return Math.min(...Object.values(platformProgress));
  }

  function targetStepIndex() {
    const frac = overallProgress();
    let idx = 0;
    for (let i = 0; i < STEP_THRESHOLDS.length; i++) {
      if (frac >= STEP_THRESHOLDS[i]) idx = i;
    }
    return idx;
  }

  // Reveal steps up toward the target index dictated by real progress — never ahead of it.
  // Reveals at most one step per tick with a gentle stagger so progress jumps animate smoothly.
  function syncStepsToProgress() {
    if (!searchStepsActive) return;
    if (searchStepsTimer) { clearTimeout(searchStepsTimer); searchStepsTimer = null; }
    const revealed = searchStepsEl.querySelectorAll('.search-step').length;
    const target = targetStepIndex();
    if (revealed - 1 < target) {
      appendStep(revealed);
      searchStepsTimer = setTimeout(syncStepsToProgress, 450);
    }
  }

  // Called from the WebSocket progress handler for each platform.
  function reportPlatformProgress(platform, status) {
    if (!(platform in platformProgress) || !(status in PHASE_WEIGHT)) return;
    // Only ever move forward.
    platformProgress[platform] = Math.max(platformProgress[platform], PHASE_WEIGHT[status]);
    syncStepsToProgress();
  }

  function stopSearchSteps() {
    if (searchStepsTimer) { clearTimeout(searchStepsTimer); searchStepsTimer = null; }
    searchStepsActive = false;
  }

  // ============ Trip Type (One Way / Round Trip) ============
  let tripType = 'oneway';

  function setupTripType() {
    tripTypeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        tripType = btn.dataset.trip;
        tripTypeButtons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('trip-type-btn--active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        const roundTrip = tripType === 'roundtrip';
        returnDateField.style.display = roundTrip ? '' : 'none';
        returnDateInput.required = roundTrip;
        // Return can't be before departure.
        if (roundTrip) returnDateInput.min = dateInput.value || returnDateInput.min;
      });
    });
    // Keep the return date's floor in sync with the chosen departure date.
    dateInput.addEventListener('change', () => {
      returnDateInput.min = dateInput.value;
      if (returnDateInput.value && returnDateInput.value < dateInput.value) returnDateInput.value = dateInput.value;
    });
  }

  // ============ Form Submission ============
  function setupForm() {
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const from = fromCode.value;
      const to = toCode.value;
      const date = dateInput.value;
      const roundTrip = tripType === 'roundtrip';
      const returnDate = roundTrip ? returnDateInput.value : null;

      // Validate
      if (!from) {
        shakeInput(fromInput);
        fromInput.focus();
        return;
      }
      if (!to) {
        shakeInput(toInput);
        toInput.focus();
        return;
      }
      if (from === to) {
        shakeInput(toInput);
        return;
      }
      if (!date) {
        shakeInput(dateInput);
        dateInput.focus();
        return;
      }
      if (roundTrip && !returnDate) {
        shakeInput(returnDateInput);
        returnDateInput.focus();
        return;
      }
      if (roundTrip && returnDate < date) {
        shakeInput(returnDateInput);
        return;
      }

      // Start loading
      setLoading(true);
      resetProgress();
      startSearchSteps();
      emptyState.style.display = 'none';
      progressSection.style.display = 'block';
      resultsSection.style.display = 'none';
      document.body.classList.remove('has-results');

      try {
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, date, returnDate }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Comparison failed');
        }

        const data = await res.json();
        lastResults = data;
        renderResults(data);
      } catch (err) {
        console.error('Comparison error:', err);
        alert(`Error: ${err.message}`);
      } finally {
        setLoading(false);
        stopSearchSteps();
      }
    });
  }

  function setLoading(isLoading) {
    compareBtn.disabled = isLoading;
    const textEl = compareBtn.querySelector('.search-form__submit-text');
    const loaderEl = compareBtn.querySelector('.search-form__submit-loader');
    textEl.style.display = isLoading ? 'none' : 'inline';
    loaderEl.style.display = isLoading ? 'inline-flex' : 'none';
  }

  function shakeInput(el) {
    el.style.animation = 'none';
    el.offsetHeight; // force reflow
    el.style.animation = 'shake 0.4s ease-out';
    el.style.borderColor = '#ef4444';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.animation = '';
    }, 1000);
  }

  // ============ Render Results ============
  function renderResults(data) {
    const { comparisons, route, date, returnDate, meta } = data;
    const isRoundTrip = data.tripType === 'roundtrip' || !!returnDate;

    // Update header
    const fromAirport = airports.find(a => a.code === route.from);
    const toAirport = airports.find(a => a.code === route.to);
    const fromLabel = fromAirport ? fromAirport.city : route.from;
    const toLabel = toAirport ? toAirport.city : route.to;
    const dateFormatted = formatDate(date);

    // Round trip uses a two-way arrow and shows both dates.
    resultsTitle.textContent = isRoundTrip ? `${fromLabel} ⇄ ${toLabel}` : `${fromLabel} → ${toLabel}`;
    const dateLabel = isRoundTrip ? `${dateFormatted} – ${formatDate(returnDate)}` : dateFormatted;
    const tripLabel = isRoundTrip ? 'round trip' : 'flight';
    resultsSubtitle.textContent = `${dateLabel} · ${comparisons.length} ${tripLabel}${comparisons.length !== 1 ? 's' : ''} compared · ShareTrip (${meta.sharetripCount}) · GoZayaan (${meta.gozayaanCount}) · Shohoz (${meta.shohozCount}) · FirstTrip (${meta.firsttripCount ?? 0})`;

    activeAirlineFilters = new Set();
    renderAirlineFilters(comparisons);
    renderCards(comparisons);

    // Show results — flags the background plane to pass less often on this page.
    progressSection.style.display = 'none';
    resultsSection.style.display = 'block';
    document.body.classList.add('has-results');
  }

  function renderCards(list) {
    resultsContainer.innerHTML = '';

    if (list.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <div class="empty-state__content">
            <span class="empty-state__icon">😔</span>
            <h3>No flights found</h3>
            <p>No matching flights were found across the platforms for this route and date. Try a different date or route.</p>
          </div>
        </div>
      `;
    } else {
      renderCardsChunked(list);
    }
  }

  /**
   * Building 165 cards in one pass blocked the main thread for ~299ms — felt as a freeze the moment
   * results appear. The first chunk covers what's on screen and goes in synchronously so results
   * still appear instantly; the rest are appended a frame at a time, so no single task is long
   * enough to block input.
   *
   * Each call takes a new token: a filter change re-renders, and without this the previous run's
   * queued chunks would keep appending cards that no longer match.
   */
  let renderToken = 0;
  const FIRST_CHUNK = 12;
  const CHUNK_SIZE = 24;

  function renderCardsChunked(list) {
    const token = ++renderToken;

    const appendRange = (start, end) => {
      const frag = document.createDocumentFragment();
      for (let i = start; i < end; i++) frag.appendChild(createFlightCard(list[i], i));
      resultsContainer.appendChild(frag);
    };

    appendRange(0, Math.min(FIRST_CHUNK, list.length));

    let next = FIRST_CHUNK;
    const pump = () => {
      if (token !== renderToken || next >= list.length) return;
      appendRange(next, Math.min(next + CHUNK_SIZE, list.length));
      next += CHUNK_SIZE;
      requestAnimationFrame(pump);
    };
    if (list.length > FIRST_CHUNK) requestAnimationFrame(pump);
  }

  // ============ Airline Filter ============
  function renderAirlineFilters(comparisons) {
    const airlineNames = [...new Set(comparisons.map(f => f.airline).filter(Boolean))].sort();

    if (airlineNames.length <= 1) {
      airlineFilter.innerHTML = '';
      airlineFilter.style.display = 'none';
      return;
    }

    airlineFilter.style.display = 'flex';
    airlineFilter.innerHTML = `
      <button class="airline-filter__pill airline-filter__pill--active" data-airline="__all__">All Airlines</button>
      ${airlineNames.map(name => `<button class="airline-filter__pill" data-airline="${name}">${name}</button>`).join('')}
    `;

    airlineFilter.querySelectorAll('.airline-filter__pill').forEach(pill => {
      pill.addEventListener('click', () => onAirlineFilterClick(pill.dataset.airline));
    });
  }

  function onAirlineFilterClick(airline) {
    if (airline === '__all__') {
      activeAirlineFilters.clear();
    } else if (activeAirlineFilters.has(airline)) {
      activeAirlineFilters.delete(airline);
    } else {
      activeAirlineFilters.add(airline);
    }

    airlineFilter.querySelectorAll('.airline-filter__pill').forEach(pill => {
      const isAll = pill.dataset.airline === '__all__';
      const isActive = isAll ? activeAirlineFilters.size === 0 : activeAirlineFilters.has(pill.dataset.airline);
      pill.classList.toggle('airline-filter__pill--active', isActive);
    });

    renderCards(getFilteredComparisons());
  }

  function getFilteredComparisons() {
    if (!lastResults) return [];
    if (activeAirlineFilters.size === 0) return lastResults.comparisons;
    return lastResults.comparisons.filter(f => activeAirlineFilters.has(f.airline));
  }

  // Stagger only the cards that are on screen at the start. An international route returns ~190
  // results, so an uncapped `index * 0.1s` delayed the last card to 19s and left dozens of cards
  // mid-animation the whole time you were scrolling.
  const STAGGERED_CARDS = 8;

  function createFlightCard(flight, index) {
    const card = document.createElement('div');
    card.className = 'flight-card';
    if (index < STAGGERED_CARDS) {
      card.style.animationDelay = `${index * 0.06}s`;
    } else {
      card.style.animation = 'none';
    }

    const icon = renderAirlineIcon(flight);
    const platforms = ['sharetrip', 'gozayaan', 'shohoz', 'firsttrip'];
    const platformLabels = { sharetrip: 'ShareTrip', gozayaan: 'GoZayaan', shohoz: 'Shohoz', firsttrip: 'FirstTrip' };

    // Route string is "DAC → CXB" (one-way) or "DAC ⇄ CXB" (round trip); either separator splits
    // into the two airport codes.
    const [routeFrom, routeTo] = (flight.route || '').split(/[→⇄]/).map(s => (s || '').trim());
    const isRoundTrip = !!flight.ret;

    // One leg's dep/arrow/arr trio. `legForStops` supplies duration + stops (the flight itself for
    // the outbound, flight.ret for the return).
    const legInner = (depTime, arrTime, fromCode, toCode, legForStops) => `
      <div class="flight-card__time">
        <div class="flight-card__time-value">${depTime || '—'}</div>
        <div class="flight-card__time-label">${fromCode || ''}</div>
      </div>
      <div class="flight-card__route-arrow">
        <div class="flight-card__route-line"></div>
        <div class="flight-card__duration">${legForStops.duration || ''}</div>
        <div class="flight-card__stops">${formatStops(legForStops)}</div>
      </div>
      <div class="flight-card__time">
        <div class="flight-card__time-value">${arrTime || '—'}</div>
        <div class="flight-card__time-label">${toCode || ''}</div>
      </div>`;

    const routeInfoHTML = isRoundTrip ? `
        <div class="flight-card__route-info flight-card__route-info--stacked">
          <div class="flight-card__leg">
            <span class="flight-card__leg-tag">↗ Outbound</span>
            ${legInner(flight.departure, flight.arrival, routeFrom, routeTo, flight)}
          </div>
          <div class="flight-card__leg">
            <span class="flight-card__leg-tag flight-card__leg-tag--return">↘ Return</span>
            ${legInner(flight.ret.departure, flight.ret.arrival, routeTo, routeFrom, flight.ret)}
          </div>
        </div>` : `
        <div class="flight-card__route-info">
          ${legInner(flight.departure, flight.arrival, routeFrom, routeTo, flight)}
        </div>`;

    card.innerHTML = `
      <div class="flight-card__header">
        <div class="flight-card__airline">
          <div class="flight-card__airline-icon${icon.className}">${icon.html}</div>
          <div>
            <div class="flight-card__airline-name">${flight.airline || 'Unknown Airline'}</div>
            <div class="flight-card__flight-no">${flight.flightNo || '—'}</div>
          </div>
        </div>
        ${routeInfoHTML}
        <div class="flight-card__meta">
          <span class="flight-card__badge">${flight.class || 'Economy'}</span>
          <span class="flight-card__badge">🧳 ${flight.baggage || '—'}</span>
          <button class="flight-card__add-btn" type="button">+ Add to Comparison</button>
        </div>
      </div>
      <div class="flight-card__prices">
        ${platforms.map(p => renderPlatformPrice(p, platformLabels[p], flight.platforms[p], flight, p)).join('')}
      </div>
    `;

    card.querySelector('.flight-card__add-btn').addEventListener('click', (e) => {
      addToComparisonList(flight);
      const btn = e.currentTarget;
      btn.textContent = '✓ Added';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = '+ Add to Comparison'; btn.disabled = false; }, 1500);
    });

    return card;
  }

  function renderAirlineIcon(flight) {
    const initial = (flight.airline || 'X')[0].toUpperCase();
    if (!flight.airlineLogo) {
      return { className: '', html: initial };
    }
    return {
      className: ' flight-card__airline-icon--logo',
      // lazy + async: a busy route emits ~700 logos, nearly all of them off-screen on first paint.
      html: `<img src="${flight.airlineLogo}" alt="${flight.airline || 'Airline'} logo" class="flight-card__airline-img" loading="lazy" decoding="async" width="28" height="28" onerror="this.parentElement.classList.remove('flight-card__airline-icon--logo');this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="flight-card__airline-fallback">${initial}</span>`,
    };
  }

  const PLATFORM_LOGOS = {
    sharetrip: '/images/platforms/sharetrip.svg',
    gozayaan: '/images/platforms/gozayaan.png',
    shohoz: '/images/platforms/shohoz.png',
    firsttrip: '/images/platforms/firsttrip.svg',
  };

  function platformBadge(platformKey, platformLabel) {
    const logo = PLATFORM_LOGOS[platformKey];
    return `<span class="platform-price__name platform-price__name--${platformKey}">${logo ? `<img class="platform-logo" src="${logo}" alt="" loading="lazy" decoding="async" width="16" height="16" />` : ''}${platformLabel}</span>`;
  }

  function renderPlatformPrice(platformKey, platformLabel, data, flight, platformId) {
    if (!data) {
      return `
        <div class="platform-price platform-price--empty">
          <div>
            ${platformBadge(platformKey, platformLabel)}
            <p style="margin-top:12px; font-size:0.8rem;">Not available on this platform</p>
          </div>
        </div>
      `;
    }

    // Check if this platform is the cheapest. A platform can win on the platform-discounted
    // total, on the coupon-discounted price, or both — so the badge says which, rather than a
    // generic "BEST PRICE" that would read as "cheapest overall".
    const isStandardWinner = flight.cheapestStandard?.platform === platformKey;
    const isBkashWinner = flight.cheapestBkash?.platform === platformKey;
    const isWinner = isStandardWinner || isBkashWinner;
    const winnerLabel = isStandardWinner && isBkashWinner
      ? '★ BEST PRICE'
      : isStandardWinner
        ? '★ BEST PLATFORM PRICE'
        : '★ BEST DISCOUNTED PRICE';
    // Platform-price-only wins get the neutral white badge; discounted wins stay green.
    const winnerModifier = isStandardWinner && !isBkashWinner
      ? ' platform-price__winner-badge--platform'
      : '';

    return `
      <div class="platform-price ${isWinner ? 'platform-price--winner' : ''}">
        <div class="platform-price__header">
          ${platformBadge(platformKey, platformLabel)}
          <span class="platform-price__winner-badge${winnerModifier}">${winnerLabel}</span>
        </div>
        <div class="platform-price__rows">
          <div class="price-row">
            <span class="price-row__label">Base Fare</span>
            <span class="price-row__value">${formatPrice(data.baseFare)}</span>
          </div>
          <div class="price-row">
            <span class="price-row__label">Taxes & Fees</span>
            <span class="price-row__value">${formatPrice(data.taxes)}</span>
          </div>
          <div class="price-row">
            <span class="price-row__label">Convenience Fee</span>
            <span class="price-row__value">${formatPrice(data.convenienceFee)}</span>
          </div>
          <div class="price-row price-row--total">
            <span class="price-row__label">Total (After Platform Discount)</span>
            <span class="price-row__value">${formatPrice(data.totalStandard)}</span>
          </div>
          ${data.bkashDiscount ? `
            <div class="price-row price-row--discount">
              <span class="price-row__label">Discount</span>
              <span class="price-row__value">-${formatPrice(data.bkashDiscount)}</span>
            </div>
          ` : ''}
          <div class="price-row price-row--bkash">
            <span class="price-row__label">Discounted Price${data.discountCoupon ? ` (Coupon: ${data.discountCoupon})` : ''}</span>
            <span class="price-row__value">${formatPrice(data.totalBkash)}</span>
          </div>
        </div>
      </div>
    `;
  }

  // ============ CSV Export ============
  function setupExport() {
    exportBtn.addEventListener('click', () => {
      const comparisons = getFilteredComparisons();
      if (!comparisons.length) return;

      const { route, date, returnDate } = lastResults;
      const isRoundTrip = lastResults.tripType === 'roundtrip' || !!returnDate;
      const headers = [
        'Trip', 'Outbound Flight', ...(isRoundTrip ? ['Return Flight'] : []), 'Airline', 'Departure', 'Arrival', 'Class',
        'ShareTrip Base', 'ShareTrip Tax', 'ShareTrip Fee', 'ShareTrip Total', 'ShareTrip bKash',
        'GoZayaan Base', 'GoZayaan Tax', 'GoZayaan Fee', 'GoZayaan Total', 'GoZayaan bKash',
        'Shohoz Base', 'Shohoz Tax', 'Shohoz Fee', 'Shohoz Total', 'Shohoz bKash',
        'FirstTrip Base', 'FirstTrip Tax', 'FirstTrip Fee', 'FirstTrip Total', 'FirstTrip Discounted',
        'Cheapest Standard', 'Cheapest bKash',
      ];

      const rows = comparisons.map(c => {
        const getValue = (p, field) => c.platforms[p]?.[field] ?? '';
        // Round-trip flightNo is "OUT / RET"; split into two columns.
        const [outboundNo, returnNo] = c.ret ? c.flightNo.split(' / ') : [c.flightNo, ''];
        return [
          c.tripType === 'roundtrip' ? 'Round Trip' : 'One Way',
          outboundNo, ...(isRoundTrip ? [returnNo] : []), c.airline, c.departure, c.arrival, c.class,
          getValue('sharetrip', 'baseFare'), getValue('sharetrip', 'taxes'), getValue('sharetrip', 'convenienceFee'), getValue('sharetrip', 'totalStandard'), getValue('sharetrip', 'totalBkash'),
          getValue('gozayaan', 'baseFare'), getValue('gozayaan', 'taxes'), getValue('gozayaan', 'convenienceFee'), getValue('gozayaan', 'totalStandard'), getValue('gozayaan', 'totalBkash'),
          getValue('shohoz', 'baseFare'), getValue('shohoz', 'taxes'), getValue('shohoz', 'convenienceFee'), getValue('shohoz', 'totalStandard'), getValue('shohoz', 'totalBkash'),
          getValue('firsttrip', 'baseFare'), getValue('firsttrip', 'taxes'), getValue('firsttrip', 'convenienceFee'), getValue('firsttrip', 'totalStandard'), getValue('firsttrip', 'totalBkash'),
          c.cheapestStandard ? `${c.cheapestStandard.platform} (${c.cheapestStandard.price})` : '',
          c.cheapestBkash ? `${c.cheapestBkash.platform} (${c.cheapestBkash.price})` : '',
        ];
      });

      const csv = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isRoundTrip
        ? `flight_comparison_${route.from}-${route.to}-RT_${date}_${returnDate}.csv`
        : `flight_comparison_${route.from}-${route.to}_${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ============ Comparison List ============
  const COMPARISON_LIST_KEY = 'comparisonList';

  function loadComparisonList() {
    try {
      return JSON.parse(localStorage.getItem(COMPARISON_LIST_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveComparisonList(list) {
    localStorage.setItem(COMPARISON_LIST_KEY, JSON.stringify(list));
  }

  function addToComparisonList(flight) {
    const date = lastResults?.date;
    const id = `${flight.route}|${flight.flightNo}|${date}`;
    const list = loadComparisonList().filter(item => item.id !== id);
    list.push({
      id,
      route: flight.route,
      flightNo: flight.flightNo,
      airline: flight.airline,
      date,
      platforms: flight.platforms,
    });
    saveComparisonList(list);
    renderComparisonListUI();
  }

  function removeFromComparisonList(id) {
    saveComparisonList(loadComparisonList().filter(item => item.id !== id));
    renderComparisonListUI();
  }

  function setupComparisonList() {
    renderComparisonListUI();

    comparisonListToggle.addEventListener('click', () => {
      const isOpen = comparisonListPanel.style.display !== 'none';
      comparisonListPanel.style.display = isOpen ? 'none' : 'flex';
    });
    comparisonListClose.addEventListener('click', () => {
      comparisonListPanel.style.display = 'none';
    });
    comparisonListExport.addEventListener('click', exportComparisonListCSV);
  }

  function renderComparisonListUI() {
    const list = loadComparisonList();

    comparisonListToggle.style.display = list.length ? 'flex' : 'none';
    comparisonListCount.textContent = list.length;

    if (list.length === 0) {
      comparisonListItems.innerHTML = `<p class="comparison-list-panel__empty">No flights added yet. Use "+ Add to Comparison" on any flight card.</p>`;
      return;
    }

    comparisonListItems.innerHTML = list.map(item => `
      <div class="comparison-list-item">
        <div>
          <div class="comparison-list-item__route">${item.route} · ${item.flightNo}</div>
          <div class="comparison-list-item__meta">${item.airline || ''} · ${formatDate(item.date)}</div>
        </div>
        <button class="comparison-list-item__remove" data-id="${item.id}" title="Remove">✕</button>
      </div>
    `).join('');

    comparisonListItems.querySelectorAll('.comparison-list-item__remove').forEach(btn => {
      btn.addEventListener('click', () => removeFromComparisonList(btn.dataset.id));
    });
  }

  function exportComparisonListCSV() {
    const list = loadComparisonList();
    if (!list.length) return;

    const headers = [
      'Route', 'Flight', 'Date',
      'Shohoz Base', 'Shohoz Gross', 'Shohoz Discount', 'Shohoz Platform',
      'ShareTrip Base', 'ShareTrip Gross', 'ShareTrip Discount',
      'Difference', 'Percentage',
      'GoZayaan Base', 'GoZayaan Gross', 'GoZayaan Discount',
      'FirstTrip Base', 'FirstTrip Gross', 'FirstTrip Discount',
    ];

    const rows = list.map(item => {
      const shohoz = item.platforms?.shohoz || {};
      const sharetrip = item.platforms?.sharetrip || {};
      const gozayaan = item.platforms?.gozayaan || {};
      const firsttrip = item.platforms?.firsttrip || {};

      const shohozPlatform = shohoz.platformPrice ?? '';
      const sharetripDiscount = sharetrip.totalBkash ?? '';
      const difference = (shohoz.platformPrice != null && sharetrip.totalBkash != null)
        ? shohoz.platformPrice - sharetrip.totalBkash
        : '';
      const percentage = (difference !== '' && shohoz.platformPrice)
        ? `${((difference / shohoz.platformPrice) * 100).toFixed(2)}%`
        : '';

      return [
        item.route, item.flightNo, item.date,
        shohoz.baseFare ?? '', shohoz.totalStandard ?? '', shohoz.totalBkash ?? '', shohozPlatform,
        sharetrip.baseFare ?? '', sharetrip.totalStandard ?? '', sharetripDiscount,
        difference, percentage,
        gozayaan.baseFare ?? '', gozayaan.totalStandard ?? '', gozayaan.totalBkash ?? '',
        firsttrip.baseFare ?? '', firsttrip.totalStandard ?? '', firsttrip.totalBkash ?? '',
      ];
    });

    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comparison_list_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatStops(flight) {
    const stops = flight.stops || 0;
    if (stops === 0) return 'Non-stop';
    const via = (flight.layoverAirports || []).join(', ');
    const label = stops === 1 ? '1 stop' : `${stops} stops`;
    return via ? `${label} · ${via}` : label;
  }

  // ============ Helpers ============
  function formatPrice(amount) {
    if (amount == null || isNaN(amount)) return '—';
    return '৳' + Number(amount).toLocaleString('en-BD');
  }

  function formatDate(dateStr) {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  // ============ Start ============
  document.addEventListener('DOMContentLoaded', init);
})();
