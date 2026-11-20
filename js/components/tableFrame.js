/**
 * SENTINEL AI - Holographic Operations Table Frame & Room Vignette
 * Includes:
 * - 2-second cinematic room descent camera animation on load with [SKIP INTRO] button
 * - Tabletop bezel & corner projection emitter brackets
 * - Dynamic breadcrumb navigation bar (World › Region › Site › Node)
 * - Bottom tactical icon layer strip (Health, Traffic, Latency, Security, Privacy, Contours)
 */

class SentinelTableFrame {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;

    this.render();
    this.playIntroDescent();
  }

  render() {
    this.container.innerHTML = `
      <!-- Dark Operations Room Vignette -->
      <div class="room-vignette" id="room-vignette">
        <!-- Overhead Ceiling Light Strips -->
        <div class="ceiling-light-strip left"></div>
        <div class="ceiling-light-strip right"></div>

        <!-- Operator Console Silhouettes on Edges -->
        <div class="operator-console-silhouette left"></div>
        <div class="operator-console-silhouette right"></div>
        <div class="operator-console-silhouette center-back"></div>
      </div>

      <!-- Skip Intro Button (Visible during 2s descent) -->
      <button class="tactical-btn skip-intro-btn" id="btn-skip-intro">
        <span>⚡ SKIP INTRO [ESC]</span>
      </button>

      <!-- Holographic Table Base Bezel -->
      <div class="table-bezel-frame">
        <!-- 4 Table Corner Holo-Projector Emitters -->
        <div class="holo-emitter tl"></div>
        <div class="holo-emitter tr"></div>
        <div class="holo-emitter bl"></div>
        <div class="holo-emitter br"></div>

        <!-- Top Breadcrumb Bar -->
        <div class="table-breadcrumb-bar" id="table-breadcrumb">
          <span class="crumb-item active" data-level="0">CONTINENT</span>
        </div>

        <!-- Bottom Tactical Layer Controls Strip (matching reference image!) -->
        <div class="table-bottom-layer-strip">
          <div class="layer-strip-inner">
            <button class="layer-toggle-btn active" data-layer="health" title="Toggle Health Status Colors">
              <span class="btn-icon">●</span>
              <span class="btn-text">HEALTH</span>
            </button>
            <button class="layer-toggle-btn active" data-layer="traffic" title="Toggle Data Highway Particle Flows">
              <span class="btn-icon">☵</span>
              <span class="btn-text">TRAFFIC</span>
            </button>
            <button class="layer-toggle-btn active" data-layer="latency" title="Toggle Latency Markers">
              <span class="btn-icon">⚡</span>
              <span class="btn-text">LATENCY</span>
            </button>
            <button class="layer-toggle-btn active" data-layer="security" title="Toggle WAF & Security Citadels">
              <span class="btn-icon">🛡</span>
              <span class="btn-text">SECURITY</span>
            </button>
            <button class="layer-toggle-btn active highlight" data-layer="privacyBoundary" title="Toggle Zero-Knowledge Privacy Boundary">
              <span class="btn-icon">🔒</span>
              <span class="btn-text">PRIVACY BOUNDARY</span>
            </button>
            <button class="layer-toggle-btn active" data-layer="contours" title="Toggle Topographic Elevation Contours">
              <span class="btn-icon">〰</span>
              <span class="btn-text">CONTOURS</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.bindStoreUpdates();
  }

  bindEvents() {
    // Skip intro button
    const skipBtn = document.getElementById('btn-skip-intro');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.skipIntro());
    }

    // Layer toggles
    const layerBtns = this.container.querySelectorAll('.layer-toggle-btn');
    layerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-layer');
        this.store.toggleLayer(key);
        btn.classList.toggle('active', this.store.layers[key]);
        if (this.audioEngine) this.audioEngine.playHover();
      });
    });

    // Breadcrumb clicks
    const breadcrumb = document.getElementById('table-breadcrumb');
    if (breadcrumb) {
      breadcrumb.addEventListener('click', (e) => {
        const target = e.target.closest('.crumb-item');
        if (!target) return;
        const level = parseInt(target.getAttribute('data-level'), 10);
        this.zoomToLevel(level);
      });
    }
  }

  // 2-Second Cinematic Room Descent onto Table
  playIntroDescent() {
    const tableViewport = document.getElementById('table-viewport-3d');
    const vignette = document.getElementById('room-vignette');
    const skipBtn = document.getElementById('btn-skip-intro');

    if (!tableViewport) return;

    // Start wide room perspective
    tableViewport.style.transition = 'transform 2.2s cubic-bezier(0.16, 1, 0.3, 1)';
    tableViewport.style.transform = 'perspective(1400px) rotateX(54deg) scale(0.72) translateY(-60px)';

    if (vignette) vignette.style.opacity = '1.0';

    // Descent trigger
    setTimeout(() => {
      tableViewport.style.transform = 'perspective(1400px) rotateX(38deg) scale(1.0) translateY(0px)';
      if (vignette) vignette.style.opacity = '0.55';
    }, 50);

    // End of descent
    this.introTimeout = setTimeout(() => {
      if (skipBtn) skipBtn.style.display = 'none';
      if (this.audioEngine) this.audioEngine.playRadarPing();
    }, 2300);
  }

  skipIntro() {
    clearTimeout(this.introTimeout);
    const tableViewport = document.getElementById('table-viewport-3d');
    const vignette = document.getElementById('room-vignette');
    const skipBtn = document.getElementById('btn-skip-intro');

    if (tableViewport) {
      tableViewport.style.transition = 'none';
      tableViewport.style.transform = 'perspective(1400px) rotateX(38deg) scale(1.0) translateY(0px)';
    }
    if (vignette) vignette.style.opacity = '0.55';
    if (skipBtn) skipBtn.style.display = 'none';
  }

  zoomToLevel(level) {
    if (level === 0) {
      this.tableEngine.flyTo(560, 450, 1.0);
      this.store.selectEntity(null);
    } else if (level === 1) {
      const reg = this.store.regionsMap.get(this.store.viewState.selectedRegionId) || this.store.regions[0];
      this.tableEngine.flyTo(reg.cx, reg.cy, 2.2);
    } else if (level === 2) {
      const site = this.store.sitesMap.get(this.store.viewState.selectedSiteId) || this.store.sites[0];
      this.tableEngine.flyTo(site.x, site.y, 4.2);
    }
  }

  bindStoreUpdates() {
    this.store.subscribe((state) => {
      this.updateBreadcrumb(state);
    });
  }

  updateBreadcrumb(state) {
    const el = document.getElementById('table-breadcrumb');
    if (!el) return;

    let html = `<span class="crumb-item" data-level="0">CONTINENT</span>`;

    if (state.viewState.selectedRegionId) {
      const reg = state.regionsMap.get(state.viewState.selectedRegionId);
      if (reg) {
        html += ` <span class="crumb-sep">›</span> <span class="crumb-item" data-level="1">${reg.name.toUpperCase()}</span>`;
      }
    }

    if (state.viewState.selectedSiteId) {
      const site = state.sitesMap.get(state.viewState.selectedSiteId);
      if (site) {
        html += ` <span class="crumb-sep">›</span> <span class="crumb-item" data-level="2">${site.name.toUpperCase()}</span>`;
      }
    }

    if (state.viewState.selectedNodeId) {
      const node = state.nodesMap.get(state.viewState.selectedNodeId);
      if (node) {
        html += ` <span class="crumb-sep">›</span> <span class="crumb-item active" data-level="3">${node.name.toUpperCase()}</span>`;
      }
    }

    el.innerHTML = html;
  }
}

window.SentinelTableFrame = SentinelTableFrame;

