/**
 * SENTINEL AI - Soft Modern SRE Infrastructure & Reliability Analytics
 * SLO compliance, Mean Time to Detection (MTTD), Mean Time to Resolution (MTTR),
 * Alert noise reduction metrics, and cross-region latency matrix.
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelAnalyticsView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const modeConfig = this.theme.getModeConfig();

    this.container.innerHTML = `
      <div class="analytics-workspace">
        <!-- Title & Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('analyticsTitle')}</h1>
            <p>${t('analyticsSubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <div class="header-select-group">
              <span style="color: var(--text-muted); font-size: 10px; font-weight: 700;">TIMEFRAME</span>
              <select id="select-analytics-time">
                <option value="24h" selected>Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-analytics">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>${t('btnExportSre')}</span>
            </button>
          </div>
        </div>

        <!-- 4 KPI Summary Cards -->
        <div class="metrics-ribbon-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
          <div class="metric-tile">
            <span class="metric-label">Service Level Objective (SLO)</span>
            <div class="metric-value-row">
              <span class="metric-value">99.98%</span>
              <span class="metric-unit">Target: 99.90%</span>
            </div>
            <span class="metric-trend good">▲ Error budget healthy (88% remaining)</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Mean Time to Detection (MTTD)</span>
            <div class="metric-value-row">
              <span class="metric-value">1.4</span>
              <span class="metric-unit">minutes</span>
            </div>
            <span class="metric-trend good">▼ -34s faster than industry avg</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Mean Time to Resolution (MTTR)</span>
            <div class="metric-value-row">
              <span class="metric-value">8.2</span>
              <span class="metric-unit">minutes</span>
            </div>
            <span class="metric-trend good">▼ -4.2m with automated runbooks</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Alert Noise Reduction</span>
            <div class="metric-value-row">
              <span class="metric-value">84%</span>
              <span class="metric-unit">deduplicated</span>
            </div>
            <span class="metric-trend good">✓ 1,240 noisy alerts suppressed</span>
          </div>
        </div>

        <!-- 2x2 Analytics Charts Grid -->
        <div class="charts-2x2-grid">
          <!-- Left: Incident Frequency -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>Incident Frequency by Service (Last 30 Days)</span>
              </div>
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">Top 4 Contributors</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 14px;">
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 4px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${this.store.getNodeDisplayName('postgres-primary-01')}</span>
                  <span><strong>14 incidents</strong> (48%)</span>
                </div>
                <div style="height: 8px; background: var(--surface-hover); border-radius: 4px; overflow: hidden;">
                  <div style="width: 48%; height: 100%; background: var(--status-critical); border-radius: 4px;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 4px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${this.store.getNodeDisplayName('order-processor')}</span>
                  <span><strong>8 incidents</strong> (28%)</span>
                </div>
                <div style="height: 8px; background: var(--surface-hover); border-radius: 4px; overflow: hidden;">
                  <div style="width: 28%; height: 100%; background: var(--status-warning); border-radius: 4px;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 4px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${this.store.getNodeDisplayName('redis-cluster-cache')}</span>
                  <span><strong>4 incidents</strong> (14%)</span>
                </div>
                <div style="height: 8px; background: var(--surface-hover); border-radius: 4px; overflow: hidden;">
                  <div style="width: 14%; height: 100%; background: var(--primary); border-radius: 4px;"></div>
                </div>
              </div>

              <div>
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 4px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${this.store.getNodeDisplayName('api-gateway-core')}</span>
                  <span><strong>3 incidents</strong> (10%)</span>
                </div>
                <div style="height: 8px; background: var(--surface-hover); border-radius: 4px; overflow: hidden;">
                  <div style="width: 10%; height: 100%; background: var(--secondary); border-radius: 4px;"></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Cross-Region Latency & Packet Quality Matrix -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span>Cross-Region Latency & Packet Quality Matrix</span>
              </div>
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">P99 Round-Trip Time</span>
            </div>

            <div class="data-table-container" style="margin-top: 10px; border: none; box-shadow: none;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>From / To</th>
                    <th>Mumbai (ap-south)</th>
                    <th>Frankfurt (eu-west)</th>
                    <th>US-East (va)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="cell-mono"><strong>Mumbai</strong></td>
                    <td class="cell-mono" style="color: var(--status-healthy); font-weight: 700;">0.8 ms</td>
                    <td class="cell-mono">112.4 ms</td>
                    <td class="cell-mono">174.1 ms</td>
                  </tr>
                  <tr>
                    <td class="cell-mono"><strong>Frankfurt</strong></td>
                    <td class="cell-mono">112.4 ms</td>
                    <td class="cell-mono" style="color: var(--status-healthy); font-weight: 700;">0.6 ms</td>
                    <td class="cell-mono">78.2 ms</td>
                  </tr>
                  <tr>
                    <td class="cell-mono"><strong>US-East</strong></td>
                    <td class="cell-mono">174.1 ms</td>
                    <td class="cell-mono">78.2 ms</td>
                    <td class="cell-mono" style="color: var(--status-healthy); font-weight: 700;">0.4 ms</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btn-export-analytics')?.addEventListener('click', () => {
      alert('SRE Report generated: Download initiated for sentinel-sre-report-q4.pdf');
    });
  }

  bindStoreUpdates() {
    this.i18n.subscribe(() => {
      this.render();
    });
    this.theme.subscribe(() => {
      this.render();
    });
  }
}

window.SentinelAnalyticsView = SentinelAnalyticsView;
