/**
 * SENTINEL AI - Arsenal View (Tactical Remediation Runbooks)
 * Actions:
 * - Increase DB connection pool
 * - Restart degraded service
 * - Block suspicious IP
 * - Reduce request rate
 * - Redeploy collector
 * Includes tactical confirmation modal with Action, Reason, Expected Impact, Risk, Rollback Plan & Approve.
 */

class SentinelArsenalView {
  constructor(container, store, audioEngine) {
    this.container = container;
    this.store = store;
    this.audioEngine = audioEngine;
    this.pendingAction = null;

    this.runbooks = [
      {
        id: 'rb-db-pool',
        title: 'INCREASE DB CONNECTION POOL',
        category: 'DATABASE // PGBOUNCER',
        cmd: 'sentinel runbook exec scale-pool --size 250 --service db-primary-01',
        reason: 'Client connection queue exhausted at 100% saturation on PostgreSQL primary master.',
        impact: 'Expands connection pool limit from 100 to 250 slots; immediate queue drainage.',
        risk: 'LOW — Master server has 42GB spare memory buffer.',
        rollback: 'Revert max_clients to 100 via patroni reload.'
      },
      {
        id: 'rb-restart-svc',
        title: 'RESTART DEGRADED SERVICE REPLICA',
        category: 'MICROSERVICES // KUBERNETES',
        cmd: 'kubectl rollout restart deployment billing-service-worker',
        reason: 'Worker threads deadlocked on blocking socket connections.',
        impact: 'Zero-downtime rolling replacement of 4 pod replicas in Vanguard Plains.',
        risk: 'LOW — Traffic routed to healthy standby replicas during rollout.',
        rollback: 'kubectl rollout undo deployment billing-service-worker'
      },
      {
        id: 'rb-block-ip',
        title: 'BLOCK SUSPICIOUS IP PREFIX (eBPF XDP)',
        category: 'NETWORK // DRIVER XDP',
        cmd: 'sentinel ebpf apply-filter --rule drop-syn-flood --prefix 185.220.101.0/24',
        reason: 'Volumetric L7 credential stuffing flood hitting /api/v1/auth/token.',
        impact: 'Kernel driver drops hostile packets in < 1 microsecond before CPU socket allocation.',
        risk: 'LOW — Verified against legitimate customer IP allowlist.',
        rollback: 'sentinel ebpf remove-filter --rule drop-syn-flood'
      },
      {
        id: 'rb-throttle-req',
        title: 'REDUCE REQUEST RATE AT EDGE GATEWAY',
        category: 'INGRESS // RATE LIMIT',
        cmd: 'sentinel mesh set-rate-limit --endpoint /api/v1/ledger --limit 5000',
        reason: 'Ingress request volume exceeding downstream queue ingestion capacity.',
        impact: 'Applies token-bucket rate limiter; responds with HTTP 429 for excess burst.',
        risk: 'MEDIUM — Non-priority client requests throttled for 3 minutes.',
        rollback: 'sentinel mesh set-rate-limit --endpoint /api/v1/ledger --limit 50000'
      },
      {
        id: 'rb-redeploy-collector',
        title: 'REDEPLOY PRIVACY TELEMETRY COLLECTOR',
        category: 'PRIVACY // eBPF ENCLAVE',
        cmd: 'sentinel collector redeploy --enclave-sync --verify-zk',
        reason: 'Local privacy agent probe buffer reset requested.',
        impact: 'Restarts kernel eBPF ring buffer with fresh differential privacy seed.',
        risk: 'ZERO RISK — Local data buffer retained on-prem on customer SSD.',
        rollback: 'Failover to secondary local daemon replica.'
      }
    ];

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="view-panel-header">
        <div>
          <span class="view-panel-eyebrow">// TACTICAL_REMEDIATION_ARSENAL //</span>
          <h1 class="view-panel-title">ARSENAL — RUNBOOK CATALOG</h1>
        </div>
        <div class="threat-kpi-group">
          <div class="threat-kpi">
            <span class="kpi-val text-cyan">5 RUNBOOKS</span>
            <span class="kpi-label">CERTIFIED READY</span>
          </div>
          <div class="threat-kpi">
            <span class="kpi-val text-emerald">100% SAFE</span>
            <span class="kpi-label">SIMULATED EXECUTION</span>
          </div>
        </div>
      </div>

      <div class="view-panel-content">
        <p class="section-intro">
          Sentinel AIOps Arsenal provides pre-certified tactical runbooks that can be executed autonomously by the Neural Copilot
          or approved manually with 1-click execution. Nothing destructive runs against production.
        </p>

        <div class="arsenal-grid">
          ${this.runbooks.map((rb, idx) => `
            <div class="arsenal-card">
              <div class="a-card-head">
                <span class="a-icon">⚡</span>
                <div>
                  <h4>${rb.title}</h4>
                  <span class="a-meta">${rb.category}</span>
                </div>
              </div>
              <p>${rb.reason}</p>
              <div class="a-cmd"><code>${rb.cmd}</code></div>
              <button class="tactical-btn primary btn-open-approval" data-idx="${idx}">
                REVIEW & APPROVE
              </button>
            </div>
          `).join('')}
        </div>

        <!-- CONFIRMATION APPROVAL MODAL -->
        <div class="remediation-modal-overlay" id="approval-modal" style="display: none;">
          <div class="remediation-approval-card">
            <div class="approval-header">
              <span class="text-cyan">// REMEDIATION_APPROVAL_GATE //</span>
              <h3 id="appr-title">INCREASE DB CONNECTION POOL</h3>
            </div>

            <div class="approval-body">
              <div class="appr-field">
                <span class="appr-label">COMMAND TO EXECUTE:</span>
                <code class="appr-code" id="appr-cmd"></code>
              </div>
              <div class="appr-field">
                <span class="appr-label">TRIGGER REASON:</span>
                <p id="appr-reason"></p>
              </div>
              <div class="appr-field">
                <span class="appr-label">EXPECTED IMPACT:</span>
                <p class="text-emerald" id="appr-impact"></p>
              </div>
              <div class="appr-field">
                <span class="appr-label">RISK ASSESSMENT:</span>
                <p class="text-amber" id="appr-risk"></p>
              </div>
              <div class="appr-field">
                <span class="appr-label">AUTOMATED ROLLBACK PLAN:</span>
                <code class="appr-code" id="appr-rollback"></code>
              </div>
            </div>

            <div class="approval-footer">
              <button class="tactical-btn" id="btn-cancel-approval">CANCEL</button>
              <button class="tactical-btn primary" id="btn-approve-action">⚡ APPROVE & DISPATCH</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const openBtns = this.container.querySelectorAll('.btn-open-approval');
    openBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        this.openApprovalModal(this.runbooks[idx]);
      });
    });

    const cancelBtn = this.container.querySelector('#btn-cancel-approval');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        document.getElementById('approval-modal').style.display = 'none';
      });
    }

    const approveBtn = this.container.querySelector('#btn-approve-action');
    if (approveBtn) {
      approveBtn.addEventListener('click', () => {
        approveBtn.textContent = 'DISPATCHING...';
        approveBtn.disabled = true;

        if (this.audioEngine) this.audioEngine.playSuccess();

        setTimeout(() => {
          this.store.resetAll();
          document.getElementById('approval-modal').style.display = 'none';
          approveBtn.textContent = '⚡ APPROVE & DISPATCH';
          approveBtn.disabled = false;
          alert(`[SENTINEL RUNBOOK] ${this.pendingAction.title} successfully executed. Fleet returned to nominal.`);
        }, 1200);
      });
    }
  }

  openApprovalModal(rb) {
    this.pendingAction = rb;
    const modal = document.getElementById('approval-modal');
    if (!modal) return;

    document.getElementById('appr-title').textContent = rb.title;
    document.getElementById('appr-cmd').textContent = rb.cmd;
    document.getElementById('appr-reason').textContent = rb.reason;
    document.getElementById('appr-impact').textContent = rb.impact;
    document.getElementById('appr-risk').textContent = rb.risk;
    document.getElementById('appr-rollback').textContent = rb.rollback;

    modal.style.display = 'flex';
    if (this.audioEngine) this.audioEngine.playHover();
  }
}

window.SentinelArsenalView = SentinelArsenalView;
