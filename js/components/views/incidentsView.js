/**
 * SENTINEL AI - Modern Fintech Incident Management Workspace
 * Light lavender & white surfaces, generous rounded corners,
 * compact incident triage roster, root-cause confidence gauge, and Kannada localization.
 */

class SentinelIncidentsView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;
    this.selectedIncidentId = 'INC-1042';
    this.severityFilter = 'all';

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const inc = this.store.incidents.find(i => i.id === this.selectedIncidentId) || this.store.incidents[0];

    this.container.innerHTML = `
      <div class="incidents-workspace">
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1 style="font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px;">${t('navIncidents')}</h1>
            <p style="font-size: 13px; color: var(--text-muted);">Real-time incident triage, automated blast-radius isolation, and verified root-cause determination.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-create-drill">${t('btnSimulate')}</button>
            <button class="btn btn-primary btn-sm" id="btn-incident-remediate">${t('btnExecute')}</button>
          </div>
        </div>

        <!-- Filter Pill Segmented Row -->
        <div class="card" style="padding: 12px 18px; margin-bottom: 16px; border-radius: var(--radius-pill); display: flex; align-items: center; justify-content: space-between;">
          <div class="pill-segmented-control">
            <button class="pill-segment-btn ${this.severityFilter === 'all' ? 'active' : ''}" data-sev="all">${t('tierAll')} (${this.store.incidents.length})</button>
            <button class="pill-segment-btn ${this.severityFilter === 'CRITICAL' ? 'active' : ''}" data-sev="CRITICAL">${t('statusCritical')} (1)</button>
            <button class="pill-segment-btn ${this.severityFilter === 'MEDIUM' ? 'active' : ''}" data-sev="MEDIUM">${t('statusWarning')} (1)</button>
            <button class="pill-segment-btn ${this.severityFilter === 'RESOLVED' ? 'active' : ''}" data-sev="RESOLVED">${t('statusResolved')} (2)</button>
          </div>
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            MTTR: <strong style="color: var(--status-healthy);">8.2m</strong>
          </div>
        </div>

        <!-- 2-Column Split: Incident Queue on Left | Incident Detail Workspace on Right -->
        <div style="display: grid; grid-template-columns: 320px 1fr; gap: 18px;">
          <!-- Left: Incident Queue -->
          <div class="card" style="padding: 16px; border-radius: var(--radius-lg); height: fit-content;">
            <div style="font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.5px;">
              Incident Queue
            </div>
            <div id="incidents-roster-list" style="display: flex; flex-direction: column; gap: 8px;">
              ${this.store.incidents.map(i => {
                const isSelected = i.id === this.selectedIncidentId;
                return `
                  <div class="btn-select-incident" data-id="${i.id}" style="padding: 12px; border-radius: var(--radius-md); background: ${isSelected ? 'var(--primary-ultralight)' : 'var(--surface-elevated)'}; border: 1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border-subtle)'}; cursor: pointer; transition: all 0.2s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span class="nav-badge-pill ${i.severity === 'CRITICAL' ? 'critical' : 'enclave'}" style="font-size: 9px;">${i.severity}</span>
                      <span class="cell-mono" style="font-size: 10px; color: var(--text-muted);">${i.detectedAt}</span>
                    </div>
                    <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary); margin-bottom: 2px;">${i.title}</div>
                    <div class="cell-mono" style="font-size: 10.5px; color: var(--primary); font-weight: 600;">${i.service} · ${i.confidence}% conf</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Right: Deep Incident Workspace -->
          <div class="card" style="border-radius: var(--radius-lg); display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle);">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span class="nav-badge-pill ${inc.severity === 'CRITICAL' ? 'critical' : 'enclave'}">${inc.severity}</span>
                  <span style="font-family: var(--font-mono); font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${inc.id}</span>
                  <span style="font-size: 11.5px; color: var(--text-muted);">· ${inc.detectedAt} · Duration ${inc.duration}</span>
                </div>
                <h2 style="font-size: 17px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px;">${inc.title}</h2>
              </div>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-secondary btn-sm" id="btn-view-causal-dag">${t('navInvestigation')}</button>
                <button class="btn btn-primary btn-sm" id="btn-resolve-incident-now">${t('btnExecute')}</button>
              </div>
            </div>

            <!-- Root Cause Analysis -->
            <div style="background: var(--surface-elevated); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">
                  Neural Diagnostic Isolation
                </div>
                <span class="status-pill-chip" style="font-size: 11px;">
                  ${inc.confidence}% Confidence
                </span>
              </div>
              <p style="font-size: 13px; color: var(--text-primary); line-height: 1.5; margin-bottom: 12px;">
                ${inc.probableRootCause}
              </p>
              
              <div style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Diagnostic Evidence</div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${inc.evidence.map(e => `
                  <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary);">
                    <span style="color: var(--primary); font-weight: 700;">✔</span>
                    <span>${e}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Impacted Systems & Signals -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div style="background: var(--surface-hover); border-radius: var(--radius-md); padding: 14px;">
                <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Blast Radius (${inc.affectedServices.length} Services)</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  ${inc.affectedServices.map(srv => `
                    <span class="status-pill-chip" style="font-size: 11px; font-family: var(--font-mono); background: var(--surface); color: var(--text-primary); border: 1px solid var(--border-subtle);">
                      ${srv}
                    </span>
                  `).join('')}
                </div>
              </div>

              <div style="background: var(--surface-hover); border-radius: var(--radius-md); padding: 14px;">
                <div style="font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Correlated Signals</div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                  ${inc.correlatedSignals.map(sig => `
                    <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: var(--font-mono);">
                      <span style="color: var(--text-secondary);">${sig.signal}</span>
                      <strong style="color: #EF4444;">${sig.delta}</strong>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-select-incident').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedIncidentId = card.getAttribute('data-id');
        this.render();
      });
    });

    this.container.querySelectorAll('.pill-segmented-control [data-sev]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.severityFilter = btn.getAttribute('data-sev');
        this.render();
      });
    });

    document.getElementById('btn-view-causal-dag')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('investigation');
    });

    document.getElementById('btn-resolve-incident-now')?.addEventListener('click', () => {
      this.store.executeRemediation('RUNBOOK-01');
    });

    document.getElementById('btn-create-drill')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('simulator');
    });

    document.getElementById('btn-incident-remediate')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('remediation');
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => this.render());
    this.i18n.subscribe(() => this.render());
  }
}

window.SentinelIncidentsView = SentinelIncidentsView;
