/**
 * SENTINEL AI - Decluttered Modern Fintech Command Center
 * - Slim row of 5 circular progress ring summary metrics
 * - Interactive Topology Centerpiece with frosted inspector drawer
 * - Compact Active Incidents (max 2 rows)
 * - Single Unified Curved Trend Chart with pill switcher (CPU, Memory, Throughput, Latency)
 * - Short Recent Events list (max 3 rows)
 * - Floating Quick Action Dock (Investigate, Simulate, Remediate)
 * - Multi-language (English / ಕನ್ನಡ) & Industry Mode Terminology
 */

class SentinelCommandCenterView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.theme = window.sentinelTheme;
    this.i18n = window.sentinelI18n;

    this.activeChartMetric = 'cpu'; // cpu | mem | rps | lat
    this.topologyEngine = null;

    this.render();
    this.initTopology();
    this.initChart();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const m = this.store.globalMetrics;
    const modeConfig = this.theme.getModeConfig();

    // Circular progress calculation (r=20, circumference = 2 * PI * 20 ≈ 125.6)
    const circum = 125.6;
    const healthOffset = circum - (m.systemHealth / 100) * circum;
    const cpuOffset = circum - (m.fleetCpuAvg / 100) * circum;

    this.container.innerHTML = `
      <div class="command-center-workspace" style="padding-bottom: 70px;">
        <!-- 1. Slim Row of 5 Circular Progress Ring Metrics -->
        <div class="summary-rings-row">
          <!-- Metric 1: System Health (Ring) -->
          <div class="ring-metric-card">
            <div class="progress-ring-container">
              <svg class="progress-ring-svg" viewBox="0 0 52 52">
                <circle class="progress-ring-bg" cx="26" cy="26" r="20" stroke-width="4.5" fill="none" />
                <circle class="progress-ring-fill" cx="26" cy="26" r="20" stroke-width="4.5" fill="none"
                  stroke-dasharray="${circum}" stroke-dashoffset="${healthOffset}" />
              </svg>
              <span class="ring-center-val" id="val-ring-health">${Math.round(m.systemHealth)}%</span>
            </div>
            <div class="ring-metric-info">
              <span class="ring-metric-label">${t('metricHealth')}</span>
              <span class="ring-metric-value">${m.systemHealth}%</span>
              <span class="ring-metric-trend">SLO 99.9%</span>
            </div>
          </div>

          <!-- Metric 2: Active Incidents -->
          <div class="ring-metric-card" style="border-left: 3px solid ${m.activeIncidentsCount > 0 ? '#EF4444' : 'var(--border-subtle)'};">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: ${m.activeIncidentsCount > 0 ? 'var(--status-critical-light)' : 'var(--status-healthy-light)'}; display: flex; align-items: center; justify-content: center; font-size: 18px; color: ${m.activeIncidentsCount > 0 ? '#EF4444' : 'var(--status-healthy)'}; font-weight: 800;">
              ${m.activeIncidentsCount}
            </div>
            <div class="ring-metric-info">
              <span class="ring-metric-label">${t('metricIncidents')}</span>
              <span class="ring-metric-value" style="color: ${m.activeIncidentsCount > 0 ? '#EF4444' : 'var(--text-primary)'};">${m.activeIncidentsCount}</span>
              <span class="ring-metric-trend critical">${m.activeIncidentsCount > 0 ? 'P1 Saturation' : 'All Clear'}</span>
            </div>
          </div>

          <!-- Metric 3: Monitored Services (Mode-adapted) -->
          <div class="ring-metric-card">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--primary-ultralight); display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--primary); font-weight: 800;">
              42
            </div>
            <div class="ring-metric-info">
              <span class="ring-metric-label">${modeConfig.terminology.servicesLabel}</span>
              <span class="ring-metric-value">42</span>
              <span class="ring-metric-trend">5 Tiers</span>
            </div>
          </div>

          <!-- Metric 4: Collectors Online -->
          <div class="ring-metric-card">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: var(--status-healthy-light); display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--status-healthy); font-weight: 800;">
              3/3
            </div>
            <div class="ring-metric-info">
              <span class="ring-metric-label">${t('metricCollectors')}</span>
              <span class="ring-metric-value">3 / 3</span>
              <span class="ring-metric-trend">0 Bytes PII Leak</span>
            </div>
          </div>

          <!-- Metric 5: Mean Latency -->
          <div class="ring-metric-card">
            <div class="progress-ring-container">
              <svg class="progress-ring-svg" viewBox="0 0 52 52">
                <circle class="progress-ring-bg" cx="26" cy="26" r="20" stroke-width="4.5" fill="none" />
                <circle class="progress-ring-fill" cx="26" cy="26" r="20" stroke-width="4.5" fill="none"
                  stroke-dasharray="${circum}" stroke-dashoffset="${circum - (m.meanResponseTimeMs / 150) * circum}" />
              </svg>
              <span class="ring-center-val">${Math.round(m.meanResponseTimeMs)}</span>
            </div>
            <div class="ring-metric-info">
              <span class="ring-metric-label">${t('metricLatency')}</span>
              <span class="ring-metric-value">${m.meanResponseTimeMs} ms</span>
              <span class="ring-metric-trend ${m.meanResponseTimeMs > 40 ? 'critical' : ''}">P99: 42ms</span>
            </div>
          </div>
        </div>

        <!-- 2. Interactive Topology Centerpiece -->
        <div class="topology-card-wrapper">
          <div class="topology-toolbar-light">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">${t('topologyTitle')}</span>
              <div class="pill-segmented-control">
                <button class="pill-segment-btn active" data-tier="all">${t('tierAll')}</button>
                <button class="pill-segment-btn" data-tier="tier-ingress">${t('tierIngress')}</button>
                <button class="pill-segment-btn" data-tier="tier-privacy">${t('tierPrivacy')}</button>
                <button class="pill-segment-btn" data-tier="tier-apps">${t('tierApps')}</button>
                <button class="pill-segment-btn" data-tier="tier-data">${t('tierData')}</button>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 8px;">
              <input type="text" id="topo-search-input" placeholder="Search node..." style="background: var(--surface-hover); border: 1px solid var(--border-subtle); color: var(--text-primary); padding: 5px 12px; border-radius: var(--radius-pill); font-size: 11.5px; outline: none; width: 130px;">
              <button class="btn btn-secondary btn-sm" id="btn-topo-reset">Fit</button>
            </div>
          </div>

          <div class="topology-viewport-light" id="topology-viewport">
            <canvas id="topology-canvas"></canvas>

            <!-- Frosted Glass Node Inspector Drawer -->
            <aside id="node-drawer">
              <div style="padding: 14px 18px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #EF4444;" id="drawer-node-status-dot"></span>
                  <span id="drawer-node-name" style="font-family: var(--font-mono); font-size: 13px; font-weight: 700;">postgres-primary-01</span>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-close-drawer" style="padding: 2px 7px;">✕</button>
              </div>

              <div style="padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
                <div id="drawer-node-role" style="font-size: 11.5px; color: var(--text-secondary);">HA Leader Cluster</div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--surface); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
                  <div>
                    <span style="font-size: 9.5px; color: var(--text-muted); display: block;">CPU</span>
                    <strong id="drawer-cpu" style="font-family: var(--font-mono); font-size: 13px; color: #EF4444;">96%</strong>
                  </div>
                  <div>
                    <span style="font-size: 9.5px; color: var(--text-muted); display: block;">LATENCY</span>
                    <strong id="drawer-lat" style="font-family: var(--font-mono); font-size: 13px;">284ms</strong>
                  </div>
                  <div>
                    <span style="font-size: 9.5px; color: var(--text-muted); display: block;">THROUGHPUT</span>
                    <strong id="drawer-rps" style="font-family: var(--font-mono); font-size: 13px;">5.8k rps</strong>
                  </div>
                  <div>
                    <span style="font-size: 9.5px; color: var(--text-muted); display: block;">POOL</span>
                    <strong id="drawer-pool" style="font-family: var(--font-mono); font-size: 13px; color: #EF4444;">98 / 100</strong>
                  </div>
                </div>

                <div style="display: flex; gap: 6px; margin-top: 8px;">
                  <button class="btn btn-primary btn-sm" style="flex: 1;" id="btn-drawer-investigate">${t('btnInvestigate')}</button>
                  <button class="btn btn-secondary btn-sm" id="btn-drawer-remediate">${t('btnResolve')}</button>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <!-- 3. Decluttered Two-Column Row: Active Incidents & Single Trend Chart -->
        <div style="display: grid; grid-template-columns: 1fr 1.1fr; gap: 18px; margin-bottom: 20px;">
          <!-- Compact Active Incidents Card -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-header">
              <div class="card-title">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: #EF4444;"></span>
                <span>${t('navIncidents')}</span>
              </div>
              <button class="btn btn-secondary btn-sm" id="btn-view-all-incidents">${t('btnViewAll')}</button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${this.store.incidents.slice(0, 2).map(inc => `
                <div style="background: var(--surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="flex: 1; margin-right: 12px;">
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                      <span class="nav-badge-pill critical">${inc.severity}</span>
                      <strong style="font-size: 12.5px; color: var(--text-primary);">${inc.title}</strong>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">${inc.service} · Detected ${inc.detectedAt} · <strong>${inc.confidence}% confidence</strong></div>
                  </div>
                  <button class="btn btn-primary btn-sm btn-incident-inspect-action" data-id="${inc.id}">
                    ${t('btnInvestigate')}
                  </button>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Single Trend Chart with Pill Switcher -->
          <div class="card" style="margin-bottom: 0;">
            <div class="card-header">
              <div class="card-title">${t('healthTrendsTitle')}</div>
              <!-- Pill Switcher -->
              <div class="pill-segmented-control">
                <button class="pill-segment-btn ${this.activeChartMetric === 'cpu' ? 'active' : ''}" data-metric="cpu">CPU %</button>
                <button class="pill-segment-btn ${this.activeChartMetric === 'mem' ? 'active' : ''}" data-metric="mem">Mem %</button>
                <button class="pill-segment-btn ${this.activeChartMetric === 'rps' ? 'active' : ''}" data-metric="rps">RPS</button>
                <button class="pill-segment-btn ${this.activeChartMetric === 'lat' ? 'active' : ''}" data-metric="lat">Latency</button>
              </div>
            </div>

            <div style="width: 100%; height: 145px; position: relative;">
              <canvas id="unified-trend-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
          </div>
        </div>

        <!-- 4. Short Recent Events List (Max 3 rows) -->
        <div class="card" style="margin-bottom: 0;">
          <div class="card-header">
            <div class="card-title">${t('recentEventsTitle')}</div>
            <span style="font-size: 11px; color: var(--text-muted);">Live 1Hz Stream</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${this.store.recentEvents.slice(0, 3).map(ev => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--surface-elevated); border-radius: var(--radius-sm); font-size: 11.5px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted);">${ev.timestamp}</span>
                  <span style="font-family: var(--font-mono); font-weight: 700; color: var(--primary);">${ev.source}</span>
                  <span style="color: var(--text-primary);">${ev.description}</span>
                </div>
                <span class="nav-badge-pill ${ev.severity === 'CRITICAL' ? 'critical' : 'enclave'}">${ev.severity}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- 5. Floating Bottom Quick Actions Dock -->
        <div class="floating-quick-dock">
          <button class="dock-pill-btn primary" id="btn-dock-investigate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>${t('btnInvestigate')}</span>
          </button>
          <button class="dock-pill-btn" id="btn-dock-simulate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>${t('btnSimulate')}</span>
          </button>
          <button class="dock-pill-btn" id="btn-dock-remediate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            <span>${t('btnExecute')}</span>
          </button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  initTopology() {
    const canvas = document.getElementById('topology-canvas');
    const viewport = document.getElementById('topology-viewport');
    if (canvas && viewport) {
      this.topologyEngine = new window.EnterpriseTopologyEngine(canvas, viewport, this.store, (node) => {
        this.openNodeDrawer(node);
      });
      const initNode = this.store.nodesMap.get('node-pg-primary');
      if (initNode) this.openNodeDrawer(initNode);
    }
  }

  openNodeDrawer(node) {
    const drawer = document.getElementById('node-drawer');
    if (!drawer) return;

    drawer.classList.add('open');
    const displayName = this.store.getNodeDisplayName(node.id);
    document.getElementById('drawer-node-name').textContent = displayName;
    document.getElementById('drawer-node-role').textContent = node.role;
    document.getElementById('drawer-cpu').textContent = `${node.cpu}%`;
    document.getElementById('drawer-lat').textContent = `${node.latency} ms`;
    document.getElementById('drawer-rps').textContent = `${(node.rps / 1000).toFixed(1)}k rps`;
    document.getElementById('drawer-pool').textContent = node.dbPoolUsage || '24 / 100';
  }

  initChart() {
    this.drawCurvedTrendChart();
  }

  drawCurvedTrendChart() {
    const canvas = document.getElementById('unified-trend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 420;
    const h = rect.height || 145;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const hist = this.store.history;
    if (!hist || !hist.cpu.length) return;

    let data = hist.cpu;
    let minVal = 0, maxVal = 100;

    if (this.activeChartMetric === 'mem') {
      data = hist.memory;
      minVal = 0; maxVal = 100;
    } else if (this.activeChartMetric === 'rps') {
      data = hist.rps;
      minVal = 10000; maxVal = 16000;
    } else if (this.activeChartMetric === 'lat') {
      data = hist.latency;
      minVal = 0; maxVal = 350;
    }

    const primaryColor = this.theme.getModeConfig().palette.primary || '#7C5CFF';
    ctx.clearRect(0, 0, w, h);

    const padTop = 10;
    const padBottom = 20;
    const plotH = h - padTop - padBottom;
    const len = data.length;
    const stepX = w / (len - 1);

    // Subtle horizontal gridlines
    ctx.strokeStyle = 'rgba(235, 231, 247, 0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = padTop + (plotH / 2) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Smooth Curved Line Path
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const norm = (data[i] - minVal) / (maxVal - minVal);
      const clamped = Math.max(0, Math.min(1, norm));
      const px = i * stepX;
      const py = padTop + (1 - clamped) * plotH;

      if (i === 0) ctx.moveTo(px, py);
      else {
        const prevPx = (i - 1) * stepX;
        const prevNorm = (data[i - 1] - minVal) / (maxVal - minVal);
        const prevPy = padTop + (1 - Math.max(0, Math.min(1, prevNorm))) * plotH;
        ctx.bezierCurveTo((prevPx + px) / 2, prevPy, (prevPx + px) / 2, py, px, py);
      }
    }

    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Soft Gradient Fill
    ctx.lineTo(w, h - padBottom);
    ctx.lineTo(0, h - padBottom);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padTop, 0, h - padBottom);
    grad.addColorStop(0, primaryColor + '30');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    // Floating Tooltip Bubble on Last Point
    const lastVal = data[len - 1];
    const lastNorm = (lastVal - minVal) / (maxVal - minVal);
    const lastPy = padTop + (1 - Math.max(0, Math.min(1, lastNorm))) * plotH;
    const lastPx = (len - 1) * stepX;

    ctx.beginPath();
    ctx.arc(lastPx - 4, lastPy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  bindEvents() {
    // Metric Switcher Pills
    this.container.querySelectorAll('[data-metric]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeChartMetric = btn.getAttribute('data-metric');
        this.container.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.drawCurvedTrendChart();
      });
    });

    // Tier Filter Pills
    this.container.querySelectorAll('.pill-segmented-control [data-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.container.querySelectorAll('[data-tier]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.topologyEngine?.setTierFilter(btn.getAttribute('data-tier'));
      });
    });

    // Search Input
    document.getElementById('topo-search-input')?.addEventListener('input', (e) => {
      this.topologyEngine?.setSearchQuery(e.target.value);
    });

    document.getElementById('btn-topo-reset')?.addEventListener('click', () => {
      this.topologyEngine?.resetView();
    });

    // Drawer Close
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
      document.getElementById('node-drawer')?.classList.remove('open');
    });

    // Quick Actions
    document.getElementById('btn-dock-investigate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('investigation');
    });

    document.getElementById('btn-dock-simulate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('simulator');
    });

    document.getElementById('btn-dock-remediate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('remediation');
    });

    document.getElementById('btn-drawer-investigate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('investigation');
    });

    document.getElementById('btn-drawer-remediate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('remediation');
    });

    document.getElementById('btn-view-all-incidents')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('incidents');
    });

    this.container.querySelectorAll('.btn-incident-inspect-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.store.activeIncidentId = id;
        if (this.onNavigate) this.onNavigate('investigation');
      });
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => {
      this.drawCurvedTrendChart();
    });

    this.theme.subscribe(() => {
      this.drawCurvedTrendChart();
    });
  }
}

window.SentinelCommandCenterView = SentinelCommandCenterView;
