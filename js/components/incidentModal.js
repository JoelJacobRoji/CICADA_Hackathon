/**
 * SENTINEL AI - Incident Detection Slide-in Panel (#1042)
 * Renders the incident panel with:
 * - Animated confidence gauge (94%)
 * - Contributing signals & impact breakdown
 * - INVESTIGATE INCIDENT button (switches directly to causal investigation)
 * - APPROVE REMEDIATION button
 */

class SentinelIncidentModal {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;
    this.isOpen = false;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="incident-modal-overlay" id="incident-modal-overlay" style="display: none;">
        <div class="incident-tactical-card" id="incident-card">
          <!-- Incident Header -->
          <div class="inc-modal-header">
            <div class="inc-title-group">
              <span class="inc-severity-tag">CRITICAL SEV-1 INCIDENT #1042</span>
              <h2 class="inc-title" id="inc-modal-title">DATABASE LATENCY ANOMALY</h2>
            </div>
            <button class="tactical-btn icon-btn" id="btn-close-inc-modal">✕</button>
          </div>

          <!-- Body -->
          <div class="inc-modal-body">
            <!-- Animated Confidence & Status Row -->
            <div class="inc-status-row">
              <div class="confidence-gauge-box">
                <div class="gauge-circle">
                  <svg width="74" height="74" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" stroke="rgba(189, 0, 255, 0.2)" stroke-width="6" fill="none" />
                    <circle cx="40" cy="40" r="32" stroke="#bd00ff" stroke-width="6" fill="none" 
                            stroke-dasharray="201" stroke-dashoffset="12" class="gauge-ring-anim" />
                  </svg>
                  <span class="gauge-number" id="inc-confidence-num">94%</span>
                </div>
                <div class="gauge-text">
                  <span class="gauge-title">AI CONFIDENCE</span>
                  <span class="gauge-state text-violet">INVESTIGATING</span>
                </div>
              </div>

              <div class="inc-impact-badge-box">
                <div class="impact-stat">
                  <span class="stat-num text-red">4 SERVICES</span>
                  <span class="stat-lbl">DEGRADED</span>
                </div>
                <div class="impact-stat">
                  <span class="stat-num text-amber">2 APPS</span>
                  <span class="stat-lbl">IMPACTED</span>
                </div>
                <div class="impact-stat">
                  <span class="stat-num text-cyan">1,284</span>
                  <span class="stat-lbl">FAILED REQS</span>
                </div>
              </div>
            </div>

            <!-- Root Cause Summary Box -->
            <div class="inc-diagnosis-box">
              <div class="diagnosis-header">
                <span class="text-violet">PROBABLE ROOT CAUSE</span>
                <span class="enclave-badge">🛡️ ZERO PII LEAK</span>
              </div>
              <p class="diagnosis-desc" id="inc-diagnosis-text">
                PostgreSQL connection pool exhaustion caused by unindexed recursive join query on <code>billing_ledger_v2</code> running without a query execution deadline.
              </p>
            </div>

            <!-- Contributing Signals -->
            <div class="inc-section-title">CONTRIBUTING TELEMETRY SIGNALS</div>
            <div class="signals-list" id="inc-signals-list">
              <div class="signal-item">▸ Postgres worker pool at 100% saturation (100/100 active connections)</div>
              <div class="signal-item">▸ Disk I/O wait spiked to 480ms on NVMe array #2</div>
              <div class="signal-item">▸ Downstream TCP handshake timeouts at 3,000ms threshold</div>
            </div>

            <!-- Recommended Action -->
            <div class="inc-section-title">RECOMMENDED REMEDIATION ACTION</div>
            <div class="recommended-action-box">
              <span class="action-title">Scale PgBouncer Connection Pool to 250 & Kill Blocking Query PID #49102</span>
              <code>sentinel runbook exec pg-kill-slow-query --pid 49102 && pgbouncer scale --size 250</code>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="inc-modal-footer">
            <button class="tactical-btn" id="btn-investigate-incident">⌖ INVESTIGATE INCIDENT (CAUSAL GRAPH)</button>
            <button class="tactical-btn primary" id="btn-approve-remediation">⚡ APPROVE REMEDIATION</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const closeBtn = document.getElementById('btn-close-inc-modal');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Investigate button: switches straight to the Investigation mode view!
    const investBtn = document.getElementById('btn-investigate-incident');
    if (investBtn) {
      investBtn.addEventListener('click', () => {
        this.close();
        if (window.sentinelApp) {
          window.sentinelApp.switchView('investigation');
          window.sentinelApp.navRail.setActive('investigation');
        }
      });
    }

    // Approve remediation
    const approveBtn = document.getElementById('btn-approve-remediation');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => {
        approveBtn.textContent = 'EXECUTING REMEDIATION...';
        approveBtn.disabled = true;
        if (this.audioEngine) this.audioEngine.playSuccess();

        setTimeout(() => {
          this.store.resetAll();
          this.close();
          approveBtn.textContent = '⚡ APPROVE REMEDIATION';
          approveBtn.disabled = false;
        }, 1200);
      });
    }
  }

  show(incident) {
    this.isOpen = true;
    const overlay = document.getElementById('incident-modal-overlay');
    if (overlay) overlay.style.display = 'flex';

    if (incident) {
      document.getElementById('inc-modal-title').textContent = incident.title.toUpperCase();
      document.getElementById('inc-diagnosis-text').innerHTML = incident.probableCause;
      document.getElementById('inc-confidence-num').textContent = `${incident.confidence}%`;
    }

    if (this.audioEngine) this.audioEngine.playAlert();
  }

  close() {
    this.isOpen = false;
    const overlay = document.getElementById('incident-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  }
}

window.SentinelIncidentModal = SentinelIncidentModal;
