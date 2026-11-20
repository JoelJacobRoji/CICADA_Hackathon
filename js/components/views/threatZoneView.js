/**
 * SENTINEL AI - Threat Zone View Component
 * Active incidents, severity triage matrix, MTTR metrics, and historical logs.
 */

class SentinelThreatZoneView {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;

    this.render();
  }

  render() {
    const active = this.store.activeIncident;

    this.container.innerHTML = `
      <div class="view-panel-header">
        <div>
          <span class="view-panel-eyebrow">// OPS_SURVEILLANCE //</span>
          <h1 class="view-panel-title">THREAT ZONE — ACTIVE INCIDENTS</h1>
        </div>
        <div class="threat-kpi-group">
          <div class="threat-kpi">
            <span class="kpi-val text-red">${active ? '1 ACTIVE' : '0 ACTIVE'}</span>
            <span class="kpi-label">SEV-1 CRITICAL</span>
          </div>
          <div class="threat-kpi">
            <span class="kpi-val text-cyan">1.2s</span>
            <span class="kpi-label">AVG DETECTION TIME (MTTD)</span>
          </div>
          <div class="threat-kpi">
            <span class="kpi-val text-emerald">18.4s</span>
            <span class="kpi-label">AVG AUTO-MTTR</span>
          </div>
        </div>
      </div>

      <div class="view-panel-content">
        <!-- Active Incident Banner -->
        ${active ? `
          <div class="active-threat-card">
            <div class="threat-card-top">
              <span class="threat-badge critical">${active.severity.toUpperCase()}</span>
              <span class="threat-time">TRIGGERED: ACTIVE IN-FLIGHT</span>
            </div>
            <h2 class="threat-card-title">${active.id}: ${active.title.toUpperCase()}</h2>
            <p class="threat-card-desc">${active.probableCause}</p>
            
            <div class="threat-impact-row">
              <span class="impact-label">IMPACTED ENTITIES:</span>
              <div class="impact-chips">
                <span class="impact-chip critical">db-primary-01</span>
                <span class="impact-chip critical">billing-service-01</span>
                <span class="impact-chip warning">checkout-service-01</span>
                <span class="impact-chip warning">auth-service-01</span>
              </div>
            </div>

            <div class="threat-card-actions">
              <button class="tactical-btn" id="btn-threat-view-table">⌖ FOCUS ON HOLOGRAPHIC TABLE</button>
              <button class="tactical-btn" id="btn-threat-investigate">⌖ INVESTIGATE (CAUSAL GRAPH)</button>
              <button class="tactical-btn primary" id="btn-threat-quick-remediate">⚡ AUTO-REMEDIATE (1-CLICK)</button>
            </div>
          </div>
        ` : `
          <div class="empty-threat-card">
            <span class="empty-icon">🛡️</span>
            <h3>ALL CONTINENTAL SYSTEMS SECURE & OPERATIONAL</h3>
            <p>No active SEV-1 or SEV-2 threats detected across monitored fleet. Sentinel Local Agent is continuously evaluating eBPF telemetry.</p>
            <button class="tactical-btn primary" id="btn-threat-simulate-hero">⚡ SIMULATE DATABASE SATURATION (HERO SCENARIO)</button>
          </div>
        `}

        <!-- Past Incident History Table -->
        <div class="table-section-title">HISTORICAL INCIDENT LOGS</div>
        <table class="tactical-table">
          <thead>
            <tr>
              <th>SEVERITY</th>
              <th>INCIDENT TITLE</th>
              <th>REGION</th>
              <th>SOURCE COMPONENT</th>
              <th>TIME</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="status-badge warning mini">SEV-2</span></td>
              <td>PII Leak Prevented by Local Privacy Enclave</td>
              <td>Citadel Reach</td>
              <td>sentinel-local-agent</td>
              <td>8m ago</td>
              <td><span class="text-emerald">NEUTRALIZED (0 BYTE EGRESS)</span></td>
            </tr>
            <tr>
              <td><span class="status-badge critical mini">SEV-1</span></td>
              <td>Memory Leak in Auth Microservice Cluster</td>
              <td>Vanguard Plains</td>
              <td>auth-service-01</td>
              <td>35m ago</td>
              <td><span class="text-emerald">RESOLVED (18s MTTR)</span></td>
            </tr>
            <tr>
              <td><span class="status-badge critical mini">SEV-1</span></td>
              <td>Border Gateway SYN Flood Mitigated</td>
              <td>Aethelgard Edge</td>
              <td>edge-router-01</td>
              <td>1h 40m ago</td>
              <td><span class="text-emerald">RESOLVED (32s MTTR)</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const viewTableBtn = this.container.querySelector('#btn-threat-view-table');
    if (viewTableBtn) {
      viewTableBtn.addEventListener('click', () => {
        window.sentinelApp.switchView('grid');
        const site = this.store.sitesMap.get('site-obs-01');
        if (site) this.tableEngine.flyTo(site.x, site.y, 4.2);
      });
    }

    const investBtn = this.container.querySelector('#btn-threat-investigate');
    if (investBtn) {
      investBtn.addEventListener('click', () => {
        window.sentinelApp.switchView('investigation');
        window.sentinelApp.navRail.setActive('investigation');
      });
    }

    const remediateBtn = this.container.querySelector('#btn-threat-quick-remediate');
    if (remediateBtn) {
      remediateBtn.addEventListener('click', () => {
        this.store.resetAll();
        if (this.audioEngine) this.audioEngine.playSuccess();
        this.render();
      });
    }

    const simHeroBtn = this.container.querySelector('#btn-threat-simulate-hero');
    if (simHeroBtn) {
      simHeroBtn.addEventListener('click', () => {
        this.store.triggerScenario('database-saturation');
        if (this.audioEngine) this.audioEngine.playAlert();
        this.render();
      });
    }
  }
}

window.SentinelThreatZoneView = SentinelThreatZoneView;
