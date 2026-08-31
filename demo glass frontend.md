/* CSS */

:root {
  --c1: #346CD5;
  --c2: #5E8BDE;
  --c3: #88A9E7;
  --c4: #B3C8EF;
  --c5: #DDE7F8;
}

/* JSON PART */

{
  "scheme": "tints",
  "base": "#2C6ADD",
  "colors": [
    "#346CD5",
    "#5E8BDE",
    "#88A9E7",
    "#B3C8EF",
    "#DDE7F8"
  ]
}



/* HTML PART */


<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Color Palette Generator — Accessible & Performant</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    /* ============================================
       CSS CUSTOM PROPERTIES
       ============================================ */
    :root {
      /* Theme colors */
      --bg-primary: #0b1020;
      --bg-panel: rgba(255, 255, 255, 0.07);
      --bg-panel-hover: rgba(255, 255, 255, 0.10);
      --border-default: rgba(255, 255, 255, 0.12);
      --text-primary: rgba(255, 255, 255, 0.92);
      --text-secondary: rgba(255, 255, 255, 0.70);
      --text-muted: rgba(255, 255, 255, 0.55);
      /* Palette colors (updated by JS) */
      --c1: #6d28d9;
      --c2: #22c55e;
      --c3: #06b6d4;
      --c4: #f59e0b;
      --c5: #ef4444;
      --c6: #8b5cf6;
      --c7: #ec4899;
      /* Layout tokens */
      --radius-sm: 10px;
      --radius-md: 14px;
      --radius-lg: 18px;
      --shadow-md: 0 10px 30px rgba(0, 0, 0, 0.35);
      --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.45);
      /* Animation */
      --transition-fast: 150ms ease;
      --transition-normal: 250ms ease;
    }

    /* ============================================
       BASE STYLES
       ============================================ */
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Progressive background with fallback */
    body {
      background:
        radial-gradient(900px 500px at 12% 10%, rgba(109, 40, 217, 0.35), transparent 60%),
        radial-gradient(700px 500px at 80% 15%, rgba(6, 182, 212, 0.35), transparent 60%),
        radial-gradient(900px 700px at 70% 85%, rgba(239, 68, 68, 0.25), transparent 65%),
        linear-gradient(180deg, #070a12 0%, var(--bg-primary) 55%, #05070d 100%);
    }

    @supports (background: color-mix(in oklab, white, black)) {
      body {
        background:
          radial-gradient(900px 500px at 12% 10%, color-mix(in oklab, var(--c1) 55%, transparent), transparent 60%),
          radial-gradient(700px 500px at 80% 15%, color-mix(in oklab, var(--c3) 55%, transparent), transparent 60%),
          radial-gradient(900px 700px at 70% 85%, color-mix(in oklab, var(--c5) 45%, transparent), transparent 65%),
          linear-gradient(180deg, #070a12 0%, var(--bg-primary) 55%, #05070d 100%);
      }
    }

    /* ============================================
       GLASS PANEL COMPONENT
       ============================================ */
    .glass {
      background: rgba(20, 25, 40, 0.85);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-md);
    }

    @supports (backdrop-filter: blur(10px)) {
      .glass {
        background: var(--bg-panel);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
    }

    /* ============================================
       GLOW EFFECT
       ============================================ */
    .glow {
      position: relative;
      isolation: isolate;
    }

    .glow::before {
      content: '';
      position: absolute;
      inset: -2px;
      border-radius: inherit;
      background: conic-gradient(from 180deg,
          var(--c1),
          var(--c3),
          var(--c5),
          var(--c2),
          var(--c1));
      filter: blur(18px);
      opacity: 0.45;
      z-index: -1;
      mix-blend-mode: screen;
      animation: glow-spin 16s linear infinite;
      will-change: transform;
    }

    @keyframes glow-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .glow::before {
        animation: none;
      }
    }

    /* ============================================
       FORM CONTROLS
       ============================================ */
    .form-input {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      font-size: 14px;
      transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    }

    .form-input:focus {
      outline: none;
      border-color: var(--c3);
      box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.2);
    }

    .form-input:focus-visible {
      outline: 2px solid var(--c3);
      outline-offset: 2px;
    }

    .form-input[aria-invalid="true"] {
      border-color: var(--c5);
    }

    .form-label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    /* Range input styling */
    input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--c3);
      border: 2px solid white;
      cursor: pointer;
      transition: transform var(--transition-fast);
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.1);
    }

    input[type="range"]:focus-visible {
      outline: 2px solid var(--c3);
      outline-offset: 4px;
    }

    /* ============================================
       BUTTONS
       ============================================ */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 20px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: filter var(--transition-fast), transform var(--transition-fast);
    }

    .btn:hover {
      filter: brightness(1.1);
    }

    .btn:active {
      transform: scale(0.98);
    }

    .btn:focus-visible {
      outline: 2px solid white;
      outline-offset: 2px;
    }

    .btn-primary {
      background: linear-gradient(135deg,
          color-mix(in oklab, var(--c1) 70%, #111827),
          color-mix(in oklab, var(--c3) 55%, #111827));
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    }

    .btn-ghost {
      background: rgba(255, 255, 255, 0.06);
    }

    .btn-ghost:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    /* ============================================
       PALETTE CARDS
       ============================================ */
    .palette-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .palette-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .palette-card {
      contain: layout style paint;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      transition: transform var(--transition-fast), box-shadow var(--transition-fast);
    }

    .palette-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 32px rgba(0, 0, 0, 0.35);
    }

    .palette-list .palette-card {
      display: flex;
      flex-direction: row;
    }

    .swatch {
      position: relative;
      width: 100%;
      height: 140px;
      background: var(--swatch-color);
      border: none;
      cursor: pointer;
      transition: filter var(--transition-fast);
    }

    .palette-list .swatch {
      width: 140px;
      height: auto;
      min-height: 100%;
      flex-shrink: 0;
    }

    .swatch:hover {
      filter: brightness(1.05);
    }

    .swatch:focus-visible {
      outline: 3px solid white;
      outline-offset: -3px;
    }

    .swatch-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      padding: 12px;
      background: linear-gradient(to top, rgba(0, 0, 0, 0.4), transparent 60%);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }

    .swatch:hover .swatch-overlay,
    .swatch:focus .swatch-overlay {
      opacity: 1;
    }

    .card-meta {
      padding: 16px;
      flex: 1;
    }

    .color-sample {
      margin-top: 12px;
      padding: 12px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    /* ============================================
       BADGES & TAGS
       ============================================ */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 12px;
      font-weight: 500;
    }

    .badge-success {
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #4ade80;
    }

    .badge-warning {
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fbbf24;
    }

    .badge-error {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #f87171;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 9999px;
      font-size: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
    }

    /* ============================================
       TOAST NOTIFICATIONS
       ============================================ */
    .toast {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 1000;
      padding: 12px 16px;
      border-radius: var(--radius-md);
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(10, 12, 18, 0.9);
      box-shadow: var(--shadow-lg);
      font-size: 14px;
      color: var(--text-primary);
      transform: translateY(10px);
      opacity: 0;
      pointer-events: none;
      transition: transform var(--transition-normal), opacity var(--transition-normal);
    }

    @supports (backdrop-filter: blur(10px)) {
      .toast {
        background: rgba(10, 12, 18, 0.75);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }

    .toast[role="alert"] {
      /* Ensure screen readers announce this */
    }

    /* ============================================
       KEYBOARD HINTS
       ============================================ */
    .kbd {
      display: inline-block;
      padding: 2px 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.07);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.85);
    }

    /* ============================================
       UTILITY CLASSES
       ============================================ */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    .visually-hidden:not(:focus):not(:active) {
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      height: 1px;
      overflow: hidden;
      position: absolute;
      white-space: nowrap;
      width: 1px;
    }

    /* ============================================
       RESPONSIVE ADJUSTMENTS
       ============================================ */
    @media (max-width: 640px) {
      .palette-grid {
        grid-template-columns: 1fr;
      }

      .palette-list .swatch {
        width: 100px;
      }
    }

    /* ============================================
       REDUCED MOTION
       ============================================ */
    @media (prefers-reduced-motion: reduce) {

      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* ============================================
       HIGH CONTRAST MODE
       ============================================ */
    @media (prefers-contrast: high) {
      .glass {
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid white;
      }

      .palette-card {
        border: 2px solid white;
      }

      .swatch:focus-visible {
        outline: 4px solid yellow;
        outline-offset: 0;
      }

      .btn:focus-visible {
        outline: 4px solid yellow;
      }
    }

    /* ============================================
       PRINT STYLES
       ============================================ */
    @media print {
      body {
        background: white;
        color: black;
      }

      .glass {
        background: white;
        border: 1px solid #ccc;
        box-shadow: none;
      }

      .glow::before {
        display: none;
      }

      .btn-ghost,
      .toast,
      [data-no-print] {
        display: none !important;
      }

      .palette-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>

<body>
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-black focus:text-white focus:rounded-lg">
    Skip to main content
  </a>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
    <!-- Header -->
    <header class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
      <div>
        <div class="tag">
          <span class="w-2.5 h-2.5 rounded-full" style="background: var(--c3);" aria-hidden="true"></span>
          <span>Color Palette Generator</span>
        </div>
        <h1 class="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">
          Design palettes fast — export as CSS tokens
        </h1>
        <p class="mt-2 text-white/70 max-w-2xl">
          Pick a base color, choose a harmony, and generate accessible color schemes.
          Uses <span class="kbd">HSL</span> math, contrast checking, and CSS custom properties.
        </p>
      </div>
      <div class="flex items-center gap-2" role="toolbar" aria-label="Quick actions">
        <button type="button" id="randomBtn" class="btn btn-ghost" aria-keyshortcuts="Alt+R">
          <span aria-hidden="true">⟳</span>
          Randomize
        </button>
        <button type="button" id="copyCssBtn" class="btn btn-primary" aria-keyshortcuts="Alt+C">
          <span aria-hidden="true">📄</span>
          Copy CSS
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main id="main-content" class="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- Controls Panel -->
      <section class="lg:col-span-5 glass glow p-5 sm:p-6" aria-labelledby="controls-heading">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="controls-heading" class="text-lg font-semibold">Palette Controls</h2>
            <p class="text-sm text-white/70">
              Configure your color scheme settings below.
            </p>
          </div>
          <span class="badge badge-success">Live Preview</span>
        </div>

        <form id="paletteForm" class="mt-5 space-y-5" aria-label="Palette configuration">
          <!-- Base Color -->
          <fieldset>
            <legend class="form-label">Base Color</legend>
            <div class="flex items-center gap-3">
              <input type="color" id="baseColor" value="#6d28d9" class="h-11 w-14 rounded-xl border border-white/15 bg-transparent cursor-pointer" aria-describedby="baseColorHelp" />
              <input type="text" id="baseHex" value="#6D28D9" pattern="^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$" class="form-input font-mono flex-1" placeholder="#RRGGBB" aria-label="Hex color value" aria-describedby="baseColorHelp" autocomplete="off" spellcheck="false" />
            </div>
            <p id="baseColorHelp" class="mt-1 text-xs text-white/50">
              Enter a 3 or 6 character hex code
            </p>
          </fieldset>

          <!-- Scheme Type -->
          <div>
            <label for="scheme" class="form-label">Color Scheme</label>
            <select id="scheme" class="form-input">
              <option value="analogous">Analogous — Similar hues</option>
              <option value="complementary">Complementary — Opposite hues</option>
              <option value="split">Split Complementary — Balanced contrast</option>
              <option value="triadic">Triadic — Three-way harmony</option>
              <option value="tetradic">Tetradic — Four-way harmony</option>
              <option value="monochrome">Monochrome — Single hue variations</option>
              <option value="shades">Shades — Darker variations</option>
              <option value="tints">Tints — Lighter variations</option>
            </select>
          </div>

          <!-- Sliders Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Color Count -->
            <div>
              <div class="flex items-center justify-between">
                <label for="count" class="form-label mb-0">Colors</label>
                <output id="countOutput" for="count" class="text-xs text-white/65 font-mono">5</output>
              </div>
              <input type="range" id="count" min="3" max="7" value="5" step="1" class="mt-2 w-full" aria-describedby="countDesc" />
              <p id="countDesc" class="sr-only">Number of colors to generate, from 3 to 7</p>
            </div>

            <!-- Hue Drift -->
            <div>
              <div class="flex items-center justify-between">
                <label for="drift" class="form-label mb-0">Hue Drift</label>
                <output id="driftOutput" for="drift" class="text-xs text-white/65 font-mono">24°</output>
              </div>
              <input type="range" id="drift" min="6" max="60" value="24" step="1" class="mt-2 w-full" aria-describedby="driftDesc" />
              <p id="driftDesc" class="sr-only">Degrees of hue separation between colors</p>
            </div>

            <!-- Saturation -->
            <div>
              <div class="flex items-center justify-between">
                <label for="sat" class="form-label mb-0">Saturation</label>
                <output id="satOutput" for="sat" class="text-xs text-white/65 font-mono">80%</output>
              </div>
              <input type="range" id="sat" min="20" max="100" value="80" step="1" class="mt-2 w-full" aria-describedby="satDesc" />
              <p id="satDesc" class="sr-only">Color intensity from 20% to 100%</p>
            </div>

            <!-- Lightness -->
            <div>
              <div class="flex items-center justify-between">
                <label for="lit" class="form-label mb-0">Lightness</label>
                <output id="litOutput" for="lit" class="text-xs text-white/65 font-mono">52%</output>
              </div>
              <input type="range" id="lit" min="18" max="78" value="52" step="1" class="mt-2 w-full" aria-describedby="litDesc" />
              <p id="litDesc" class="sr-only">Color brightness from 18% to 78%</p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="submit" class="btn btn-primary" aria-keyshortcuts="Alt+G">
              Generate Palette
            </button>
            <button type="button" id="copyJsonBtn" class="btn btn-ghost">
              Copy JSON
            </button>
          </div>
        </form>

        <!-- Export Section -->
        <div class="mt-6">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">CSS Export</h3>
            <span class="text-xs text-white/50">Ready for :root</span>
          </div>
          <label for="exportCode" class="sr-only">Generated CSS code</label>
          <textarea id="exportCode" class="mt-2 w-full min-h-[140px] rounded-xl bg-black/20 border border-white/10 px-3 py-3 text-xs font-mono text-white/85 focus:outline-none focus:ring-2 focus:ring-white/15" readonly spellcheck="false" aria-describedby="exportHelp"></textarea>
          <p id="exportHelp" class="mt-2 text-xs text-white/60">
            Keyboard: <span class="kbd">Alt+R</span> Randomize ·
            <span class="kbd">Alt+G</span> Generate ·
            <span class="kbd">Alt+C</span> Copy CSS
          </p>
        </div>
      </section>

      <!-- Palette Display -->
      <section class="lg:col-span-7 glass p-5 sm:p-6" aria-labelledby="palette-heading">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 id="palette-heading" class="text-lg font-semibold">Generated Palette</h2>
            <p class="text-sm text-white/70">
              Click any swatch to copy its hex value.
            </p>
          </div>
          <div class="flex items-center gap-2" role="radiogroup" aria-label="View mode">
            <button type="button" id="viewGrid" class="btn btn-ghost px-3 py-2 text-xs" role="radio" aria-checked="true">
              Grid
            </button>
            <button type="button" id="viewList" class="btn btn-ghost px-3 py-2 text-xs" role="radio" aria-checked="false">
              List
            </button>
          </div>
        </div>

        <!-- Palette Container -->
        <div id="palette" class="mt-5 palette-grid" role="list" aria-label="Color palette swatches" aria-live="polite">
          <!-- Cards injected by JavaScript -->
        </div>

        <!-- Info Panel -->
        <div class="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <!-- Contrast Guide -->
          <div class="glass p-4" style="background: rgba(255,255,255,0.03);">
            <h3 class="text-sm font-semibold">Accessibility Guide</h3>
            <dl class="mt-3 space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-white/70">AA Large Text (3:1)</dt>
                <dd><span class="badge badge-warning">Minimum</span></dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-white/70">AA Normal Text (4.5:1)</dt>
                <dd><span class="badge badge-success">Good</span></dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-white/70">AAA Normal Text (7:1)</dt>
                <dd><span class="badge badge-success">Excellent</span></dd>
              </div>
            </dl>
          </div>

          <!-- Live Preview -->
          <div id="livePreview" class="rounded-[var(--radius-lg)] p-4 sm:p-5" style="background: linear-gradient(160deg, color-mix(in oklab, var(--c1) 22%, #0b1020), color-mix(in oklab, var(--c5) 18%, #0b1020)); border: 1px solid rgba(255,255,255,0.12);" aria-label="Live UI preview using palette colors">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl" style="background: linear-gradient(135deg, var(--c1), var(--c3)); border: 1px solid rgba(255,255,255,0.16);" aria-hidden="true"></div>
              <div>
                <div class="text-sm font-semibold">Preview Component</div>
                <div class="text-xs text-white/65">Uses your palette colors</div>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-2 gap-2">
              <button type="button" class="px-3 py-2 rounded-xl text-sm" style="background: var(--c1); color: white; border: 1px solid rgba(255,255,255,0.2);" tabindex="-1" aria-hidden="true">
                Primary
              </button>
              <button type="button" class="px-3 py-2 rounded-xl text-sm" style="background: var(--c2); color: white; border: 1px solid rgba(255,255,255,0.2);" tabindex="-1" aria-hidden="true">
                Success
              </button>
              <button type="button" class="px-3 py-2 rounded-xl text-sm" style="background: var(--c4); color: black; border: 1px solid rgba(255,255,255,0.2);" tabindex="-1" aria-hidden="true">
                Warning
              </button>
              <button type="button" class="px-3 py-2 rounded-xl text-sm" style="background: var(--c5); color: white; border: 1px solid rgba(255,255,255,0.2);" tabindex="-1" aria-hidden="true">
                Danger
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="mt-8 text-xs text-white/55">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p>Accessible color palette generator with WCAG contrast checking.</p>
        <p>Made with ❤️ by OathanRex </p>
      </div>
    </footer>
  </div>

  <!-- Toast Notification -->
  <div id="toast" class="toast" role="status" aria-live="polite" aria-atomic="true"></div>

  <script>
    'use strict';
    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = Object.freeze({
      palette: {
        maxColors: 7,
        variablePrefix: '--c',
        defaultCount: 5,
      },
      lightness: {
        min: 8,
        max: 92,
        variance: 26,
      },
      random: {
        saturation: {
          base: 70,
          range: 25
        },
        lightness: {
          base: 42,
          range: 18
        },
      },
      contrast: {
        aa: 4.5,
        aaa: 7.0,
        aaLarge: 3.0,
      },
      debounce: {
        inputDelay: 50,
        renderDelay: 16,
      },
      storage: {
        key: 'colorPaletteState',
        version: 1,
      },
    });
    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const mod = (n, m) => ((n % m) + m) % m;

    function debounce(fn, delay) {
      let timeoutId = null;
      return function debounced(...args) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          timeoutId = null;
          fn.apply(this, args);
        }, delay);
      };
    }

    function sanitizeHex(value) {
      if (typeof value !== 'string') return '#000000';
      const match = value.trim().match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
      if (!match) return '#000000';
      const hex = match[1];
      const normalized = hex.length === 3 ?
        hex.split('').map(c => c + c).join('') :
        hex;
      return `#${normalized.toUpperCase()}`;
    }
    // ============================================
    // COLOR SERVICE
    // ============================================
    const ColorService = (() => {
      function hexToRgb(hex) {
        const normalized = String(hex).trim().replace(/^#/, '');
        if (!/^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(normalized)) {
          return null;
        }
        const full = normalized.length === 3 ?
          normalized.split('').map(c => c + c).join('') :
          normalized;
        const int = parseInt(full, 16);
        return {
          r: (int >> 16) & 255,
          g: (int >> 8) & 255,
          b: int & 255,
        };
      }

      function rgbToHex(r, g, b) {
        const toHex = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
      }

      function rgbToHsl(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;
        if (d === 0) {
          return {
            h: 0,
            s: 0,
            l: l * 100
          };
        }
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
            break;
          case g:
            h = ((b - r) / d + 2) * 60;
            break;
          case b:
            h = ((r - g) / d + 4) * 60;
            break;
        }
        return {
          h,
          s: s * 100,
          l: l * 100
        };
      }

      function hslToRgb(h, s, l) {
        h = mod(h, 360);
        s = clamp(s, 0, 100) / 100;
        l = clamp(l, 0, 100) / 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r, g, b;
        if (h < 60) {
          r = c;
          g = x;
          b = 0;
        } else if (h < 120) {
          r = x;
          g = c;
          b = 0;
        } else if (h < 180) {
          r = 0;
          g = c;
          b = x;
        } else if (h < 240) {
          r = 0;
          g = x;
          b = c;
        } else if (h < 300) {
          r = x;
          g = 0;
          b = c;
        } else {
          r = c;
          g = 0;
          b = x;
        }
        return {
          r: Math.round((r + m) * 255),
          g: Math.round((g + m) * 255),
          b: Math.round((b + m) * 255),
        };
      }

      function hslToHex(h, s, l) {
        const {
          r,
          g,
          b
        } = hslToRgb(h, s, l);
        return rgbToHex(r, g, b);
      }

      function relativeLuminance({
        r,
        g,
        b
      }) {
        const [rs, gs, bs] = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function contrastRatio(hex1, hex2) {
        const rgb1 = hexToRgb(hex1);
        const rgb2 = hexToRgb(hex2);
        if (!rgb1 || !rgb2) return 1;
        const L1 = relativeLuminance(rgb1);
        const L2 = relativeLuminance(rgb2);
        const lighter = Math.max(L1, L2);
        const darker = Math.min(L1, L2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function bestTextColor(bgHex) {
        const whiteContrast = contrastRatio(bgHex, '#FFFFFF');
        const blackContrast = contrastRatio(bgHex, '#000000');
        return whiteContrast >= blackContrast ?
          {
            hex: '#FFFFFF',
            ratio: whiteContrast
          } :
          {
            hex: '#000000',
            ratio: blackContrast
          };
      }

      function randomHex() {
        const {
          saturation,
          lightness
        } = CONFIG.random;
        const h = Math.floor(Math.random() * 360);
        const s = saturation.base + Math.floor(Math.random() * saturation.range);
        const l = lightness.base + Math.floor(Math.random() * lightness.range);
        return hslToHex(h, s, l);
      }

      function formatHsl(hsl) {
        return `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`;
      }
      return Object.freeze({
        hexToRgb,
        rgbToHex,
        rgbToHsl,
        hslToRgb,
        hslToHex,
        relativeLuminance,
        contrastRatio,
        bestTextColor,
        randomHex,
        formatHsl,
      });
    })();
    // ============================================
    // PALETTE GENERATOR
    // ============================================
    const PaletteGenerator = (() => {
      const strategies = {
        analogous(baseHue, sat, lit, count, drift) {
          const halfSpan = ((count - 1) * drift) / 2;
          return Array.from({
            length: count
          }, (_, i) => ({
            h: mod(baseHue - halfSpan + i * drift, 360),
            s: sat,
            l: lit,
          }));
        },
        complementary(baseHue, sat, lit, count) {
          if (count === 1) return [{
            h: baseHue,
            s: sat,
            l: lit
          }];
          return Array.from({
            length: count
          }, (_, i) => ({
            h: mod(baseHue + (180 * i) / (count - 1), 360),
            s: sat,
            l: lit,
          }));
        },
        split(baseHue, sat, lit, count, drift) {
          const angles = [0, 180 - drift * 2, 180 + drift * 2];
          return Array.from({
            length: count
          }, (_, i) => ({
            h: mod(baseHue + angles[i % 3], 360),
            s: sat,
            l: lit,
          }));
        },
        triadic(baseHue, sat, lit, count) {
          const angles = [0, 120, 240];
          return Array.from({
            length: count
          }, (_, i) => ({
            h: mod(baseHue + angles[i % 3], 360),
            s: sat,
            l: lit,
          }));
        },
        tetradic(baseHue, sat, lit, count) {
          const angles = [0, 90, 180, 270];
          return Array.from({
            length: count
          }, (_, i) => ({
            h: mod(baseHue + angles[i % 4], 360),
            s: sat,
            l: lit,
          }));
        },
        monochrome(baseHue, sat, lit, count) {
          const {
            min,
            max,
            variance
          } = CONFIG.lightness;
          const minL = clamp(lit - variance, min, max);
          const maxL = clamp(lit + variance, min, max);
          return Array.from({
            length: count
          }, (_, i) => ({
            h: baseHue,
            s: sat,
            l: count === 1 ? lit : minL + ((maxL - minL) * i) / (count - 1),
          }));
        },
        shades(baseHue, sat, lit, count) {
          const maxL = clamp(lit, 25, 80);
          const minL = 10;
          return Array.from({
            length: count
          }, (_, i) => ({
            h: baseHue,
            s: clamp(sat - 10, 10, 100),
            l: count === 1 ? lit : maxL - ((maxL - minL) * i) / (count - 1),
          }));
        },
        tints(baseHue, sat, lit, count) {
          const minL = clamp(lit, 20, 75);
          const maxL = 92;
          return Array.from({
            length: count
          }, (_, i) => ({
            h: baseHue,
            s: clamp(sat - 14, 10, 100),
            l: count === 1 ? lit : minL + ((maxL - minL) * i) / (count - 1),
          }));
        },
      };

      function generate({
        baseHex,
        type,
        count,
        drift,
        sat,
        lit
      }) {
        const rgb = ColorService.hexToRgb(baseHex);
        if (!rgb) return [];
        const {
          h: baseHue
        } = ColorService.rgbToHsl(rgb.r, rgb.g, rgb.b);
        const strategy = strategies[type] || strategies.analogous;
        const hslColors = strategy(baseHue, sat, lit, count, drift);
        return hslColors.map(hsl => ({
          ...hsl,
          hex: ColorService.hslToHex(hsl.h, hsl.s, hsl.l),
        }));
      }

      function getSchemeTypes() {
        return Object.keys(strategies);
      }
      return Object.freeze({
        generate,
        getSchemeTypes
      });
    })();
    // ============================================
    // TOAST SERVICE
    // ============================================
    const Toast = (() => {
      let element = null;
      let timeoutId = null;
      return {
        init(el) {
          element = el;
        },
        show(message, duration = 1400) {
          if (!element) return;
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          element.textContent = message;
          element.classList.add('show');
          timeoutId = setTimeout(() => {
            this.hide();
          }, duration);
        },
        hide() {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          element?.classList.remove('show');
        },
      };
    })();
    // ============================================
    // CLIPBOARD SERVICE
    // ============================================
    const ClipboardService = {
      async copy(text) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
          }
          return this.fallbackCopy(text);
        } catch (error) {
          console.error('Clipboard copy failed:', error);
          return this.fallbackCopy(text);
        }
      },
      fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (e) {
          console.error('Fallback copy failed:', e);
        }
        textarea.remove();
        return success;
      },
    };
    // ============================================
    // STATE MANAGER
    // ============================================
    const StateManager = (() => {
      const {
        key: STORAGE_KEY,
        version
      } = CONFIG.storage;
      let state = {
        baseHex: '#6D28D9',
        scheme: 'analogous',
        count: 5,
        drift: 24,
        saturation: 80,
        lightness: 52,
        viewMode: 'grid',
        palette: [],
      };
      const subscribers = new Set();

      function notify() {
        const currentState = {
          ...state
        };
        subscribers.forEach(callback => callback(currentState));
      }

      function save() {
        try {
          const data = {
            version,
            state
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
          console.warn('Failed to save state:', e);
        }
      }

      function load() {
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const {
              version: savedVersion,
              state: savedState
            } = JSON.parse(saved);
            if (savedVersion === version) {
              state = {
                ...state,
                ...savedState
              };
            }
          }
        } catch (e) {
          console.warn('Failed to load state:', e);
        }
      }
      return Object.freeze({
        init() {
          load();
          return {
            ...state
          };
        },
        get() {
          return {
            ...state
          };
        },
        set(updates) {
          state = {
            ...state,
            ...updates
          };
          notify();
          save();
        },
        subscribe(callback) {
          subscribers.add(callback);
          return () => subscribers.delete(callback);
        },
      });
    })();
    // ============================================
    // DOM REFERENCES
    // ============================================
    const elements = {
      root: document.documentElement,
      form: document.getElementById('paletteForm'),
      baseColor: document.getElementById('baseColor'),
      baseHex: document.getElementById('baseHex'),
      scheme: document.getElementById('scheme'),
      count: document.getElementById('count'),
      drift: document.getElementById('drift'),
      sat: document.getElementById('sat'),
      lit: document.getElementById('lit'),
      countOutput: document.getElementById('countOutput'),
      driftOutput: document.getElementById('driftOutput'),
      satOutput: document.getElementById('satOutput'),
      litOutput: document.getElementById('litOutput'),
      palette: document.getElementById('palette'),
      exportCode: document.getElementById('exportCode'),
      randomBtn: document.getElementById('randomBtn'),
      copyCssBtn: document.getElementById('copyCssBtn'),
      copyJsonBtn: document.getElementById('copyJsonBtn'),
      viewGrid: document.getElementById('viewGrid'),
      viewList: document.getElementById('viewList'),
      toast: document.getElementById('toast'),
    };
    // ============================================
    // PALETTE RENDERER
    // ============================================
    const PaletteRenderer = (() => {
      let currentItems = [];
      let viewMode = 'grid';

      function setViewMode(mode) {
        viewMode = mode;
        elements.palette.className = mode === 'list' ? 'mt-5 palette-list' : 'mt-5 palette-grid';
        elements.viewGrid.setAttribute('aria-checked', mode === 'grid');
        elements.viewList.setAttribute('aria-checked', mode === 'list');
      }

      function createCard(item, index) {
        const textColor = ColorService.bestTextColor(item.hex);
        const ratio = textColor.ratio;
        const level = ratio >= CONFIG.contrast.aaa ? 'AAA' : ratio >= CONFIG.contrast.aa ? 'AA' : 'Low';
        const badgeClass = level === 'AAA' ? 'badge-success' : level === 'AA' ? 'badge-warning' : 'badge-error';
        const card = document.createElement('article');
        card.className = 'palette-card';
        card.setAttribute('role', 'listitem');
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'swatch';
        swatch.style.setProperty('--swatch-color', item.hex);
        swatch.setAttribute('aria-label', `Copy ${item.hex} to clipboard. Contrast ratio: ${ratio.toFixed(1)} to 1, ${level} compliance.`);
        swatch.dataset.color = item.hex;
        const overlay = document.createElement('div');
        overlay.className = 'swatch-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        const indexBadge = document.createElement('span');
        indexBadge.className = 'badge';
        indexBadge.style.cssText = 'background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2);';
        indexBadge.textContent = `c${index + 1}`;
        const contrastBadge = document.createElement('span');
        contrastBadge.className = `badge ${badgeClass}`;
        contrastBadge.textContent = `${level} · ${ratio.toFixed(1)}`;
        overlay.append(indexBadge, contrastBadge);
        swatch.appendChild(overlay);
        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const hexRow = document.createElement('div');
        hexRow.className = 'flex items-center justify-between gap-2';
        const hexValue = document.createElement('code');
        hexValue.className = 'text-sm font-mono text-white/90';
        hexValue.textContent = item.hex;
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn btn-ghost px-3 py-1 text-xs';
        copyBtn.textContent = 'Copy';
        copyBtn.dataset.action = 'copy';
        copyBtn.dataset.color = item.hex;
        copyBtn.setAttribute('aria-label', `Copy ${item.hex}`);
        hexRow.append(hexValue, copyBtn);
        const infoRow = document.createElement('div');
        infoRow.className = 'mt-2 grid grid-cols-2 gap-2 text-xs';
        const hslInfo = document.createElement('div');
        hslInfo.className = 'text-white/60';
        hslInfo.innerHTML = `<span class="text-white/40">HSL</span> <span class="font-mono">${ColorService.formatHsl(item)}</span>`;
        const textInfo = document.createElement('div');
        textInfo.className = 'text-white/60';
        textInfo.innerHTML = `<span class="text-white/40">Text</span> <span class="font-mono">${textColor.hex}</span>`;
        infoRow.append(hslInfo, textInfo);
        const sample = document.createElement('div');
        sample.className = 'color-sample';
        sample.style.cssText = `background: ${item.hex}; color: ${textColor.hex};`;
        sample.innerHTML = `
          <div class="text-sm font-semibold">Sample Text</div>
          <div class="text-xs opacity-85">Preview on this swatch</div>
        `;
        meta.append(hexRow, infoRow, sample);
        card.append(swatch, meta);
        return card;
      }

      function render(items) {
        currentItems = items;
        const fragment = document.createDocumentFragment();
        items.forEach((item, index) => {
          fragment.appendChild(createCard(item, index));
        });
        elements.palette.innerHTML = '';
        elements.palette.appendChild(fragment);
      }
      // Event delegation for palette interactions
      elements.palette.addEventListener('click', async (event) => {
        const target = event.target;
        // Swatch click
        const swatch = target.closest('.swatch');
        if (swatch) {
          const color = swatch.dataset.color;
          const success = await ClipboardService.copy(color);
          Toast.show(success ? `Copied ${color}` : 'Copy failed');
          return;
        }
        // Copy button click
        const copyBtn = target.closest('[data-action="copy"]');
        if (copyBtn) {
          const color = copyBtn.dataset.color;
          const success = await ClipboardService.copy(color);
          Toast.show(success ? `Copied ${color}` : 'Copy failed');
        }
      });
      return {
        render,
        setViewMode
      };
    })();
    // ============================================
    // APPLICATION CONTROLLER
    // ============================================
    const App = (() => {
      function updateOutputs() {
        elements.countOutput.textContent = elements.count.value;
        elements.driftOutput.textContent = `${elements.drift.value}°`;
        elements.satOutput.textContent = `${elements.sat.value}%`;
        elements.litOutput.textContent = `${elements.lit.value}%`;
      }

      function getFormSettings() {
        const baseHex = sanitizeHex(elements.baseHex.value) || elements.baseColor.value;
        return {
          baseHex,
          type: elements.scheme.value,
          count: parseInt(elements.count.value, 10),
          drift: parseInt(elements.drift.value, 10),
          sat: parseInt(elements.sat.value, 10),
          lit: parseInt(elements.lit.value, 10),
        };
      }

      function setRootPalette(hexes) {
        for (let i = 0; i < CONFIG.palette.maxColors; i++) {
          const key = `${CONFIG.palette.variablePrefix}${i + 1}`;
          if (i < hexes.length && hexes[i]) {
            elements.root.style.setProperty(key, hexes[i]);
          } else {
            elements.root.style.removeProperty(key);
          }
        }
      }

      function generateCssTokens(hexes) {
        const lines = [':root {'];
        hexes.forEach((hex, i) => {
          lines.push(`  ${CONFIG.palette.variablePrefix}${i + 1}: ${hex};`);
        });
        lines.push('}');
        return lines.join('\n');
      }

      function generateJsonExport(settings, hexes) {
        return JSON.stringify({
          scheme: settings.type,
          base: settings.baseHex,
          colors: hexes,
        }, null, 2);
      }

      function generate() {
        updateOutputs();
        const settings = getFormSettings();
        // Sync color inputs
        elements.baseColor.value = settings.baseHex;
        elements.baseHex.value = settings.baseHex;
        // Generate palette
        const palette = PaletteGenerator.generate(settings);
        const hexes = palette.map(c => c.hex);
        // Update UI
        setRootPalette(hexes);
        PaletteRenderer.render(palette);
        // Update export
        const css = generateCssTokens(hexes);
        const json = generateJsonExport(settings, hexes);
        elements.exportCode.value = `${css}\n\n/* JSON */\n${json}`;
        // Save state
        StateManager.set({
          baseHex: settings.baseHex,
          scheme: settings.type,
          count: settings.count,
          drift: settings.drift,
          saturation: settings.sat,
          lightness: settings.lit,
          palette: hexes,
        });
        return {
          palette,
          css,
          json,
          hexes
        };
      }

      function randomize() {
        const hex = ColorService.randomHex();
        elements.baseColor.value = hex;
        elements.baseHex.value = hex;
        generate();
        Toast.show('Randomized!');
      }
      async function copyCss() {
        const {
          css
        } = generate();
        const success = await ClipboardService.copy(css);
        Toast.show(success ? 'CSS copied!' : 'Copy failed');
      }
      async function copyJson() {
        const {
          json
        } = generate();
        const success = await ClipboardService.copy(json);
        Toast.show(success ? 'JSON copied!' : 'Copy failed');
      }

      function setViewMode(mode) {
        PaletteRenderer.setViewMode(mode);
        StateManager.set({
          viewMode: mode
        });
      }

      function restoreState() {
        const state = StateManager.init();
        elements.baseColor.value = state.baseHex;
        elements.baseHex.value = state.baseHex;
        elements.scheme.value = state.scheme;
        elements.count.value = state.count;
        elements.drift.value = state.drift;
        elements.sat.value = state.saturation;
        elements.lit.value = state.lightness;
        PaletteRenderer.setViewMode(state.viewMode);
      }

      function init() {
        // Initialize toast
        Toast.init(elements.toast);
        // Restore previous state
        restoreState();
        // Initial generation
        generate();
        // Debounced generate for sliders
        const debouncedGenerate = debounce(generate, CONFIG.debounce.inputDelay);
        // Form events
        elements.form.addEventListener('submit', (e) => {
          e.preventDefault();
          generate();
          Toast.show('Generated!');
        });
        // Color picker sync
        elements.baseColor.addEventListener('input', (e) => {
          elements.baseHex.value = e.target.value.toUpperCase();
          debouncedGenerate();
        });
        elements.baseHex.addEventListener('change', () => {
          const normalized = sanitizeHex(elements.baseHex.value);
          if (normalized && normalized !== '#000000') {
            elements.baseHex.value = normalized;
            elements.baseColor.value = normalized;
            elements.baseHex.removeAttribute('aria-invalid');
            generate();
          } else {
            elements.baseHex.setAttribute('aria-invalid', 'true');
            Toast.show('Invalid hex format');
          }
        });
        // Slider events
        ['scheme', 'count', 'drift', 'sat', 'lit'].forEach(id => {
          elements[id].addEventListener('input', debouncedGenerate);
        });
        // Button events
        elements.randomBtn.addEventListener('click', randomize);
        elements.copyCssBtn.addEventListener('click', copyCss);
        elements.copyJsonBtn.addEventListener('click', copyJson);
        // View mode toggle
        elements.viewGrid.addEventListener('click', () => setViewMode('grid'));
        elements.viewList.addEventListener('click', () => setViewMode('list'));
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
          // Ignore if focus is in an input
          if (e.target.matches('input, textarea, select')) return;
          if (e.altKey) {
            switch (e.key.toLowerCase()) {
              case 'r':
                e.preventDefault();
                randomize();
                break;
              case 'g':
                e.preventDefault();
                generate();
                Toast.show('Generated!');
                break;
              case 'c':
                e.preventDefault();
                copyCss();
                break;
            }
          }
        });
        console.log('Color Palette Generator initialized');
      }
      return {
        init,
        generate,
        randomize
      };
    })();
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', App.init);
    } else {
      App.init();
    }
  </script>
</body>

</html>