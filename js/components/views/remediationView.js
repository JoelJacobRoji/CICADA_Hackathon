/**
 * SENTINEL AI - Decluttered Remediation & Runbooks Workspace
 * Compact rows with title, risk pill, and single action button.
 * Action & expected outcome details nested in expandable accordion sections.
 */

class SentinelRemediationView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;
    this.expandedRunbookId = 'RUNBOOK-01';

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);

    this.container.innerHTML = `
      <div class="remediation-workspace">
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1 style="font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px;">${t('navRemediation')}</h1>
            <p style="font-size: 13px; color: var(--text-muted);">Pre-certified operational playbooks with automated risk analysis and rollback plans.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-export-audit-log">${t('btnExport')}</button>
          </div>
        </div>

        <!-- Compact Runbook Accordion Rows -->
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;">
          ${this.store.remediations.map(rb => {
            const isExecuted = rb.executionState === 'executed';
            const isExecuting = rb.executionState === 'executing';
            const isExpanded = this.expandedRunbookId === rb.id;

            return `
              <div class="card" style="margin-bottom: 0; padding: 14px 18px; border-radius: var(--radius-md); box-shadow: var(--shadow-soft);">
                <!-- Compact Row -->
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1;" class="btn-toggle-expand" data-id="${rb.id}">
                    <span style="font-size: 11px; color: var(--text-muted); transition: transform 0.2s;" style="${isExpanded ? 'transform: rotate(90deg);' : ''}">▶</span>
                    <span class="cell-mono" style="font-weight: 700; color: var(--primary); font-size: 12px;">${rb.id}</span>
                    <strong style="font-size: 13.5px; color: var(--text-primary);">${rb.title}</strong>
                    <span class="nav-badge-pill ${rb.riskLevel === 'LOW' ? 'enclave' : 'critical'}" style="font-size: 9.5px;">${rb.riskLevel} RISK</span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 8px;">
                    ${isExecuted ? `
                      <span class="status-pill-chip" style="background: var(--status-healthy-light); color: var(--status-healthy);">✔ ${t('statusResolved')}</span>
                    ` : isExecuting ? `
                      <button class="btn btn-secondary btn-sm" disabled>Applying...</button>
                    ` : `
                      <button class="btn btn-primary btn-sm btn-open-confirm-modal" data-id="${rb.id}">
                        ${t('btnExecute')}
                      </button>
                    `}
                  </div>
                </div>

                <!-- Expandable Action & Expected Outcome Section -->
                ${isExpanded ? `
                  <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 12px;">
                    <div style="background: var(--surface-hover); padding: 10px 12px; border-radius: var(--radius-sm);">
                      <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Target Action</div>
                      <div style="color: var(--text-primary);">${rb.action}</div>
                      <div style="font-size: 10.5px; color: var(--primary); font-family: var(--font-mono); margin-top: 4px;">TARGET: ${rb.targetService}</div>
                    </div>
                    <div style="background: var(--surface-hover); padding: 10px 12px; border-radius: var(--radius-sm);">
                      <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Expected Outcome & Rollback</div>
                      <div style="color: var(--text-secondary); margin-bottom: 4px;">${rb.expectedOutcome}</div>
                      <div style="font-size: 10px; color: var(--text-muted);">Rollback: ${rb.rollbackPlan}</div>
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>

        <!-- Audit History -->
        <div class="card" style="border-radius: var(--radius-lg);">
          <div class="card-header">
            <div class="card-title">Execution Audit Ledger</div>
            <span style="font-size: 11px; color: var(--text-muted);">Immutable audit trail</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${this.store.remediationAuditLog.map(act => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--surface-elevated); border-radius: var(--radius-sm); font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${act.id}</span>
                  <span class="cell-mono" style="color: var(--primary); font-size: 11px;">${act.runbook}</span>
                  <span style="color: var(--text-secondary);">${act.details}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="cell-mono" style="font-size: 10.5px; color: var(--text-muted);">${act.time}</span>
                  <span class="status-pill-chip" style="font-size: 10px;">${act.status}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Confirmation Modal -->
        <div id="remediation-modal-container" style="display: none;"></div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-toggle-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        this.expandedRunbookId = (this.expandedRunbookId === id) ? null : id;
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-open-confirm-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        this.openConfirmModal(id);
      });
    });
  }

  openConfirmModal(runbookId) {
    const rb = this.store.remediations.find(r => r.id === runbookId);
    if (!rb) return;

    const modalContainer = document.getElementById('remediation-modal-container');
    if (!modalContainer) return;

    modalContainer.style.display = 'block';
    modalContainer.innerHTML = `
      <div style="position: fixed; inset: 0; background: rgba(30, 27, 46, 0.4); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100;">
        <div style="width: 480px; background: var(--surface); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-elevated); border: 1px solid var(--border-subtle);">
          <h3 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px;">Confirm Execution</h3>
          <p style="font-size: 12.5px; color: var(--text-secondary); margin-bottom: 16px;">Are you sure you want to execute <strong>${rb.title}</strong> on <code>${rb.targetService}</code>?</p>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-modal-cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" id="btn-modal-confirm">Confirm & Execute</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-modal-cancel')?.addEventListener('click', () => {
      modalContainer.style.display = 'none';
    });

    document.getElementById('btn-modal-confirm')?.addEventListener('click', () => {
      modalContainer.style.display = 'none';
      this.store.executeRemediation(rb.id);
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => this.render());
    this.i18n.subscribe(() => this.render());
  }
}

window.SentinelRemediationView = SentinelRemediationView;
