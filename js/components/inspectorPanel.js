/**
 * SENTINEL AI - L4 Server & Service Inspector Panel
 * Detailed component inspection:
 * - Details, uptime, heartbeat
 * - Live oscilloscope canvas charts (CPU, Memory, Latency, Throughput)
 * - Dependencies chips
 * - Sentinel Neural Copilot diagnostic analysis
 * - Event log terminal
 */

class SentinelInspectorPanel {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;
    this.currentNode = null;
    this.isOpen = false;

    this.renderContainer();
  }

  renderContainer() {
    this.container.innerHTML = `
      <div class="inspector-drawer" id="inspector-drawer">
        <!-- Close Handle -->
        <div class="inspector-header">
          <div class="inspector-title-group">
            <span class="inspector-eyebrow">// LEVEL_4_INSPECTION //</span>
            <h2 class="inspector-name" id="insp-node-name">SYSTEM NODE</h2>
          </div>
          <button class="tactical-btn icon-btn" id="btn-close-inspector" title="Close Panel [ESC]">✕</button>
        </div>

        <div class="inspector-scroll-body">
          <!-- Status Banner -->
          <div class="insp-status-banner" id="insp-status-banner">
            <span class="status-badge healthy" id="insp-status-badge">HEALTHY NOMINAL</span>
            <span class="insp-tier" id="insp-tier">TIER 0 (CRITICAL)</span>
            <span class="insp-uptime" id="insp-uptime">UPTIME: 99.99%</span>
          </div>

          <!-- Metadata Grid -->
          <div class="insp-meta-grid">
            <div class="meta-item">
              <span class="meta-label">DATA CENTER SITE:</span>
              <span class="meta-val" id="insp-site">-</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">ZONE:</span>
              <span class="meta-val" id="insp-zone">-</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">ENVIRONMENT:</span>
              <span class="meta-val text-cyan">PRODUCTION</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">LAST HEARTBEAT:</span>
              <span class="meta-val" id="insp-heartbeat">0.2s ago (eBPF)</span>
            </div>
          </div>

          <!-- LIVE OSCILLOSCOPE CHARTS -->
          <div class="insp-section-title">
            <span>LIVE TELEMETRY STREAM</span>
            <span class="live-tag">● SIMULATED (1 Hz)</span>
          </div>

          <div class="charts-grid">
            <div class="chart-card">
              <canvas id="chart-cpu" width="310" height="85"></canvas>
            </div>
            <div class="chart-card">
              <canvas id="chart-memory" width="310" height="85"></canvas>
            </div>
            <div class="chart-card">
              <canvas id="chart-latency" width="310" height="85"></canvas>
            </div>
            <div class="chart-card">
              <canvas id="chart-throughput" width="310" height="80"></canvas>
            </div>
          </div>

          <!-- SENTINEL NEURAL COPILOT DIAGNOSIS -->
          <div class="insp-section-title">
            <span class="text-violet">SENTINEL NEURAL COPILOT</span>
            <span class="ai-confidence" id="insp-ai-confidence">94% CONF</span>
          </div>
          <div class="ai-diagnosis-card" id="insp-ai-diagnosis">
            <div class="ai-avatar">🤖</div>
            <div class="ai-text-content">
              <p class="ai-summary" id="insp-ai-text">Analyzing telemetry streams...</p>
              <div class="ai-recs-list" id="insp-ai-recs"></div>
            </div>
          </div>

          <!-- DEPENDENCIES -->
          <div class="insp-section-title">CONNECTED DEPENDENCIES</div>
          <div class="deps-chips-container" id="insp-deps-list">
            <!-- Dynamically populated -->
          </div>

          <!-- RECENT AUDIT LOGS -->
          <div class="insp-section-title">RECENT HEARTBEAT & EVENT AUDIT STREAM</div>
          <div class="audit-log-terminal" id="insp-logs">
            <!-- Dynamically populated -->
          </div>

          <!-- TACTICAL ACTIONS ARSENAL -->
          <div class="insp-section-title">TACTICAL MITIGATION ACTIONS</div>
          <div class="tactical-actions-grid">
            <button class="tactical-btn action-btn" id="btn-act-restart">
              <span>⟳ RESTART POD</span>
            </button>
            <button class="tactical-btn action-btn" id="btn-act-scale">
              <span>⤢ SCALE REPLICAS</span>
            </button>
            <button class="tactical-btn action-btn warning" id="btn-act-diag">
              <span>⚡ RUN DIAGNOSTIC</span>
            </button>
            <button class="tactical-btn action-btn danger" id="btn-act-isolate">
              <span>✕ ISOLATE NODE</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const closeBtn = document.getElementById('btn-close-inspector');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    ['restart', 'scale', 'diag', 'isolate'].forEach(act => {
      const btn = document.getElementById(`btn-act-${act}`);
      if (btn) {
        btn.addEventListener('click', () => {
          if (this.audioEngine) this.audioEngine.playSelect();
          alert(`[SENTINEL OPS] Action dispatched: ${act.toUpperCase()} on ${this.currentNode ? this.currentNode.id : 'NODE'}`);
        });
      }
    });
  }

  open(node) {
    this.currentNode = node;
    this.isOpen = true;
    const drawer = document.getElementById('inspector-drawer');
    if (drawer) drawer.classList.add('open');

    this.updateStaticDetails(node);
    this.updateCharts();
    if (this.audioEngine) this.audioEngine.playSelect();
  }

  close() {
    this.isOpen = false;
    this.currentNode = null;
    const drawer = document.getElementById('inspector-drawer');
    if (drawer) drawer.classList.remove('open');
    this.store.selectEntity(null);
  }

  updateStaticDetails(node) {
    document.getElementById('insp-node-name').textContent = node.name.toUpperCase();
    document.getElementById('insp-site').textContent = node.siteId || 'DC-PRIMARY';
    document.getElementById('insp-zone').textContent = `${node.zone} ZONE`;

    const badge = document.getElementById('insp-status-badge');
    const banner = document.getElementById('insp-status-banner');

    if (node.health === 'critical') {
      badge.textContent = 'CRITICAL ALERT';
      badge.className = 'status-badge critical';
      banner.className = 'insp-status-banner critical';
    } else if (node.health === 'warning') {
      badge.textContent = 'WARNING DEGRADED';
      badge.className = 'status-badge warning';
      banner.className = 'insp-status-banner warning';
    } else {
      badge.textContent = 'HEALTHY NOMINAL';
      badge.className = 'status-badge healthy';
      banner.className = 'insp-status-banner healthy';
    }

    // Dependencies
    const depsContainer = document.getElementById('insp-deps-list');
    depsContainer.innerHTML = '';
    if (node.dependencies && node.dependencies.length > 0) {
      node.dependencies.forEach(depId => {
        const depNode = this.store.nodesMap.get(depId);
        const pill = document.createElement('button');
        pill.className = `dep-chip ${depNode && depNode.health === 'critical' ? 'critical' : ''}`;
        pill.innerHTML = `
          <span class="dep-dot"></span>
          <span class="dep-name">${depNode ? depNode.name : depId}</span>
          <span class="dep-arrow">↗</span>
        `;
        pill.addEventListener('click', () => {
          if (depNode) this.open(depNode);
        });
        depsContainer.appendChild(pill);
      });
    } else {
      depsContainer.innerHTML = '<span class="text-dim">No direct outgoing dependencies (Terminal Leaf).</span>';
    }

    // AI Copilot Explanation
    const aiText = document.getElementById('insp-ai-text');
    const aiRecs = document.getElementById('insp-ai-recs');
    aiRecs.innerHTML = '';

    if (node.health === 'critical') {
      aiText.innerHTML = `<strong>CRITICAL BOTTLENECK DETECTED:</strong> ${node.name} is experiencing severe latency threshold degradation. Connection pools are saturated at 100% capacity.`;
      aiRecs.innerHTML = `
        <div class="ai-rec-item text-red">▸ High probability of cascading timeouts to upstream payment and checkout services.</div>
        <div class="ai-rec-item text-cyan">▸ Recommended: Dispatch PgBouncer pool scaling and kill blocking query PID.</div>
      `;
    } else {
      aiText.innerHTML = `<strong>NOMINAL EQUILIBRIUM:</strong> All eBPF kernel probes reporting healthy zero-copy socket metrics. P99 latency within 14ms tolerance.`;
      aiRecs.innerHTML = `
        <div class="ai-rec-item text-emerald">▸ Privacy Enclave: 100% of telemetry sanitized locally. Zero raw data egress.</div>
      `;
    }

    // Audit logs
    const now = new Date();
    document.getElementById('insp-logs').innerHTML = `
      <div class="log-line"><span class="log-t">[${now.toISOString().substring(11, 19)}]</span> <span class="log-tag">[eBPF]</span> Probe socket handshake ACK. Latency: ${node.metrics.latency}ms</div>
      <div class="log-line"><span class="log-t">[${now.toISOString().substring(11, 19)}]</span> <span class="log-tag">[TLS]</span> mTLS session re-negotiation verified with Vault HSM.</div>
      <div class="log-line"><span class="log-t">[${now.toISOString().substring(11, 19)}]</span> <span class="log-tag">[PRIVACY]</span> Differential noise applied. Zero PII egress detected.</div>
      <div class="log-line ${node.health === 'critical' ? 'text-red' : 'text-cyan'}"><span class="log-t">[${now.toISOString().substring(11, 19)}]</span> <span class="log-tag">[HEALTH]</span> Current node state: ${node.health.toUpperCase()}</div>
    `;
  }

  updateCharts() {
    if (!this.isOpen || !this.currentNode) return;
    const hist = this.store.nodeHistory.get(this.currentNode.id);
    if (!hist) return;

    const cpuCanvas = document.getElementById('chart-cpu');
    const memCanvas = document.getElementById('chart-memory');
    const latCanvas = document.getElementById('chart-latency');
    const tpsCanvas = document.getElementById('chart-throughput');

    const isCrit = this.currentNode.health === 'critical';
    const chartColor = isCrit ? '#ff0055' : '#00f3ff';

    SentinelTelemetryCharts.drawAreaChart(cpuCanvas, hist.cpu, chartColor, 'CPU LOAD', '%', 100);
    SentinelTelemetryCharts.drawAreaChart(memCanvas, hist.memory, '#bd00ff', 'MEMORY', '%', 100);
    SentinelTelemetryCharts.drawAreaChart(latCanvas, hist.latency, isCrit ? '#ff0055' : '#ffaa00', 'LATENCY', 'ms', Math.max(...hist.latency, 30));
    SentinelTelemetryCharts.drawBarSpectrum(tpsCanvas, hist.throughput, '#00f3ff', 'THROUGHPUT', ' req/s');
  }
}

window.SentinelInspectorPanel = SentinelInspectorPanel;
