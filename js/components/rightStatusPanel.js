/**
 * SENTINEL AI - Right Status Panel
 * Slim tactical vertical telemetry gauges (as seen in the reference image).
 * Displays Fleet Load, Global P99, Memory Saturation, and Zero Egress Leak Tracking.
 */

class SentinelRightStatusPanel {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.isCollapsed = false;

    this.render();
    this.bindStoreUpdates();
  }

  render() {
    this.container.innerHTML = `
      <div class="status-panel-card" id="status-panel-card">
        <div class="status-panel-header">
          <button class="tactical-btn icon-btn mini" id="btn-collapse-status" title="Collapse Panel">▶</button>
          <span class="status-tag">// FLEET_TELEMETRY //</span>
        </div>

        <div class="status-gauges-list">
          <!-- Gauge 1: Fleet Aggregate CPU -->
          <div class="tactical-gauge-item">
            <div class="gauge-labels">
              <span class="g-name">FLEET COMPUTE LOAD</span>
              <span class="g-val text-cyan" id="gauge-cpu-val">48%</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill cyan" id="gauge-cpu-bar" style="width: 48%;"></div>
            </div>
          </div>

          <!-- Gauge 2: Global Latency P99 -->
          <div class="tactical-gauge-item">
            <div class="gauge-labels">
              <span class="g-name">GLOBAL P99 LATENCY</span>
              <span class="g-val text-cyan" id="gauge-lat-val">14.2 ms</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill cyan" id="gauge-lat-bar" style="width: 18%;"></div>
            </div>
          </div>

          <!-- Gauge 3: Memory Saturation -->
          <div class="tactical-gauge-item">
            <div class="gauge-labels">
              <span class="g-name">MEMORY ALLOCATION</span>
              <span class="g-val text-violet" id="gauge-mem-val">62%</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill violet" id="gauge-mem-bar" style="width: 62%;"></div>
            </div>
          </div>

          <!-- Gauge 4: Zero Egress Leak (Privacy Hero Stat) -->
          <div class="tactical-gauge-item">
            <div class="gauge-labels">
              <span class="g-name">RAW PII EGRESS</span>
              <span class="g-val text-emerald" id="gauge-egress-val">0 BYTES</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill emerald" id="gauge-egress-bar" style="width: 0%;"></div>
            </div>
            <span class="gauge-note text-emerald">🛡️ ENCLAVE LOCK: 100% PRIVATE</span>
          </div>

          <!-- Gauge 5: eBPF Probe Ingestion -->
          <div class="tactical-gauge-item">
            <div class="gauge-labels">
              <span class="g-name">eBPF TELEMETRY INGEST</span>
              <span class="g-val text-cyan">142.8k /s</span>
            </div>
            <div class="gauge-bar-track">
              <div class="gauge-bar-fill cyan" style="width: 82%;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const collapseBtn = document.getElementById('btn-collapse-status');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.isCollapsed = !this.isCollapsed;
        this.container.classList.toggle('collapsed', this.isCollapsed);
        collapseBtn.textContent = this.isCollapsed ? '◀' : '▶';
      });
    }
  }

  bindStoreUpdates() {
    this.store.subscribe((state) => {
      const cpuVal = document.getElementById('gauge-cpu-val');
      const cpuBar = document.getElementById('gauge-cpu-bar');
      const latVal = document.getElementById('gauge-lat-val');
      const latBar = document.getElementById('gauge-lat-bar');

      if (!cpuVal || !cpuBar) return;

      const isCritical = state.globalMetrics.activeIncidents > 0;
      const avgCpu = isCritical ? 88 : 46;
      const avgLat = isCritical ? 240 : 14.2;

      cpuVal.textContent = `${avgCpu}%`;
      cpuVal.className = `g-val ${isCritical ? 'text-red' : 'text-cyan'}`;
      cpuBar.style.width = `${avgCpu}%`;
      cpuBar.className = `gauge-bar-fill ${isCritical ? 'red' : 'cyan'}`;

      latVal.textContent = `${avgLat} ms`;
      latVal.className = `g-val ${isCritical ? 'text-red' : 'text-cyan'}`;
      latBar.style.width = `${Math.min(100, (avgLat / 300) * 100)}%`;
      latBar.className = `gauge-bar-fill ${isCritical ? 'red' : 'cyan'}`;
    });
  }
}

window.SentinelRightStatusPanel = SentinelRightStatusPanel;

