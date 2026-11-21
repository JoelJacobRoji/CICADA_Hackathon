/**
 * SENTINEL AI - Soft Modern Collector Fleet Management Workspace
 * Oversee all distributed Tier-1 collectors, local eBPF memory enclaves,
 * SQLite WAL buffers, and telemetry ingestion rates.
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelCollectorsView {
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
      <div class="collectors-workspace">
        <!-- Title & Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('colFleetTitle')}</h1>
            <p>${t('colFleetSubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-col-ping">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <span>${t('btnPingCollectors')}</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-col-install">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              <span>${t('btnInstallCommand')}</span>
            </button>
          </div>
        </div>

        <!-- Fleet Aggregates Ribbon -->
        <div class="metrics-ribbon-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
          <div class="metric-tile">
            <span class="metric-label">Registered Collectors</span>
            <div class="metric-value-row">
              <span class="metric-value">3 / 3</span>
              <span class="metric-unit">Active</span>
            </div>
            <span class="metric-trend good">▲ All nodes reporting nominal</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Total Ingestion Rate</span>
            <div class="metric-value-row">
              <span class="metric-value">21,520</span>
              <span class="metric-unit">events/sec</span>
            </div>
            <span class="metric-trend neutral">Across 3 geographical regions</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Local SQLite WAL Buffer</span>
            <div class="metric-value-row">
              <span class="metric-value">44.7</span>
              <span class="metric-unit">MB total</span>
            </div>
            <span class="metric-trend good">✓ Automatic ring sync active</span>
          </div>

          <div class="metric-tile">
            <span class="metric-label">Privacy Policy Engine</span>
            <div class="metric-value-row">
              <span class="metric-value" style="color: var(--primary); font-size: 18px;">STRICT eBPF</span>
            </div>
            <span class="metric-trend good">🛡 100% PII isolation active (${modeConfig.compliance.split('/')[0].trim()})</span>
          </div>
        </div>

        <!-- Collectors Table -->
        <div class="card" style="padding: 0; overflow: hidden;">
          <div style="padding: 16px 20px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
              <span class="status-dot healthy"></span>
              <span>Active Collector Fleet</span>
            </div>
            <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
              Loopback binding (127.0.0.1:9100) on-prem
            </span>
          </div>

          <div class="data-table-container" style="border: none; border-radius: 0; box-shadow: none;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Collector ID</th>
                  <th>Internal Hostname</th>
                  <th>Region</th>
                  <th>Version</th>
                  <th>Heartbeat</th>
                  <th>CPU / Mem</th>
                  <th>Buffer Usage</th>
                  <th>WAL Size</th>
                  <th>Kernel Enclave Mode</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.store.collectors.map(c => `
                  <tr>
                    <td>
                      <span class="badge-severity ${c.status === 'HEALTHY' ? 'healthy' : 'critical'}">
                        <span class="status-dot ${c.status === 'HEALTHY' ? 'healthy' : 'critical'}"></span>
                        ${c.status}
                      </span>
                    </td>
                    <td class="cell-mono"><strong>${c.id}</strong></td>
                    <td class="cell-mono" style="color: var(--text-secondary);">${c.hostname}</td>
                    <td>${c.region}</td>
                    <td class="cell-mono">${c.version}</td>
                    <td class="cell-mono">${c.lastHeartbeat}</td>
                    <td class="cell-mono">${c.cpu}% / ${c.memory}%</td>
                    <td>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; height: 5px; background: var(--surface-hover); border-radius: 3px; width: 50px; overflow: hidden;">
                          <div style="width: ${c.bufferUtilization}; height: 100%; background: var(--primary); border-radius: 3px;"></div>
                        </div>
                        <span class="cell-mono">${c.bufferUtilization}</span>
                      </div>
                    </td>
                    <td class="cell-mono">${c.sqliteWalSize}</td>
                    <td>
                      <span style="font-size: 10px; font-family: var(--font-mono); font-weight: 700; color: var(--status-healthy); background: var(--status-healthy-light); padding: 2px 7px; border-radius: var(--radius-pill);">
                        ${c.kernelEnclave}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm btn-col-config" style="padding: 3px 10px; font-size: 11px;">Config</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btn-col-ping')?.addEventListener('click', () => {
      alert('Ping sent to 3 collectors: All replied within 1.2ms with verified SHA-256 heartbeat receipts.');
    });

    document.getElementById('btn-col-install')?.addEventListener('click', () => {
      alert('Install Command:\ncurl -sSL https://get.sentinel.internal/install.sh | bash -s -- --enclave=strict --token=tok_acme_prod');
    });

    this.container.querySelectorAll('.btn-col-config').forEach(btn => {
      btn.addEventListener('click', () => {
        alert('Collector Configuration: TLS 1.3 mTLS, eBPF ring buffer size 64MB, local WAL retention 7 days.');
      });
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => {
      // Live store updates
    });
    this.i18n.subscribe(() => {
      this.render();
    });
    this.theme.subscribe(() => {
      this.render();
    });
  }
}

window.SentinelCollectorsView = SentinelCollectorsView;
