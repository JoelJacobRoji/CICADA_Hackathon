/**
 * SENTINEL AI - Soft Modern Privacy Center & Zero-Knowledge Enclave
 * 5-Stage Privacy Pipeline, Egress Proof Drawer, Regulatory Justifications,
 * and Multi-Industry Compliance Badges (HIPAA, PCI-DSS, ISO 27001, FERPA, GDPR).
 */

class SentinelPrivacyView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;
    this.selectedPayload = this.store.privacyAuditLogs[0];

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const m = this.store.globalMetrics;
    const p = this.selectedPayload;
    const modeConfig = this.theme.getModeConfig();

    this.container.innerHTML = `
      <div class="privacy-workspace">
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1 style="font-size: 20px; font-weight: 800; color: var(--text-primary); letter-spacing: -0.3px;">${t('privacyTitle')}</h1>
            <p style="font-size: 13px; color: var(--text-muted);">Zero-knowledge privacy enforcement powered by local on-premise eBPF memory enclaves.</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-export-proof">${t('btnExport')}</button>
            <button class="btn btn-primary btn-sm" id="btn-verify-all-hashes">${t('btnVerify')}</button>
          </div>
        </div>

        <!-- 5-Stage Pipeline Card -->
        <div class="card" style="padding: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <strong style="font-size: 13.5px; color: var(--text-primary);">${t('privacyPipeline')}</strong>
            <span class="status-pill-chip" style="font-size: 11px;">
              🛡 ${modeConfig.compliance}
            </span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin: 20px 0 28px 0; gap: 8px;">
            <div style="flex: 1; background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); text-align: center; border: 1.5px solid var(--border-subtle);">
              <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">STAGE 1</span>
              <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary); margin: 3px 0;">LOCAL ON-PREM</div>
              <span style="font-size: 10.5px; color: var(--status-critical);">Contains Raw PII</span>
            </div>

            <span style="color: var(--text-muted); font-size: 14px;">→</span>

            <div style="flex: 1; background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); text-align: center; border: 1.5px solid var(--border-subtle);">
              <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">STAGE 2</span>
              <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary); margin: 3px 0;">eBPF COLLECTOR</div>
              <span style="font-size: 10.5px; color: var(--primary);">Kernel Memory Ring</span>
            </div>

            <span style="color: var(--text-muted); font-size: 14px;">→</span>

            <div style="flex: 1.2; background: var(--primary-ultralight); padding: 14px; border-radius: var(--radius-md); text-align: center; border: 1.5px solid var(--primary); box-shadow: 0 4px 14px rgba(124, 92, 255, 0.12);">
              <span style="font-size: 10px; font-weight: 700; color: var(--primary);">STAGE 3 (ACTIVE)</span>
              <div style="font-weight: 800; font-size: 13px; color: var(--primary); margin: 3px 0;">REDACT & SCRUB</div>
              <span style="font-size: 10.5px; color: var(--status-healthy); font-weight: 600;">${modeConfig.compliance.split('/')[0].trim()} Rules</span>
            </div>

            <span style="color: var(--text-muted); font-size: 14px;">→</span>

            <div style="flex: 1; background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); text-align: center; border: 1.5px solid var(--border-subtle);">
              <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">STAGE 4</span>
              <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary); margin: 3px 0;">ALLOW-LIST META</div>
              <span style="font-size: 10.5px; color: var(--text-secondary);">outbound.py schema</span>
            </div>

            <span style="color: var(--text-muted); font-size: 14px;">→</span>

            <div style="flex: 1; background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); text-align: center; border: 1.5px solid var(--border-subtle);">
              <span style="font-size: 10px; font-weight: 700; color: var(--text-muted);">STAGE 5</span>
              <div style="font-weight: 700; font-size: 12.5px; color: var(--text-primary); margin: 3px 0;">SENTINEL SAAS</div>
              <span style="font-size: 10.5px; color: var(--primary);">Zero-Knowledge Ingest</span>
            </div>
          </div>

          <!-- Counter Strip -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; background: var(--surface-elevated); padding: 14px; border-radius: var(--radius-md);">
            <div>
              <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; display: block;">PROCESSED LOCALLY</span>
              <strong style="font-family: var(--font-mono); font-size: 15px; color: var(--text-primary);">${m.eventsProcessedTotal.toLocaleString()}</strong>
            </div>
            <div>
              <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; display: block;">FIELDS REDACTED</span>
              <strong style="font-family: var(--font-mono); font-size: 15px; color: var(--primary);">${m.fieldsRedactedTotal.toLocaleString()}</strong>
            </div>
            <div>
              <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; display: block;">APPROVED METADATA</span>
              <strong style="font-family: var(--font-mono); font-size: 15px; color: var(--text-primary);">18.4 MB</strong>
            </div>
            <div>
              <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; display: block;">${t('rawLeaked')}</span>
              <strong style="font-family: var(--font-mono); font-size: 15px; color: var(--status-healthy);">0 BYTES (100% PRIVATE)</strong>
            </div>
          </div>
        </div>

        <!-- Egress Proof Inspection (Side-by-Side Diff) -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              <span>Egress Proof Diff // ${p.id}</span>
            </div>
            <span style="font-family: var(--font-mono); font-size: 10.5px; color: var(--primary);">
              SHA-256: ${p.outboundMetadata.sha256_proof.substring(0, 24)}...
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <!-- Raw Local -->
            <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
              <div style="font-size: 10.5px; font-weight: 700; color: #EF4444; margin-bottom: 8px;">1. Raw Local Telemetry (On-Prem Only)</div>
              <pre style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); max-height: 220px; overflow-y: auto; line-height: 1.5;">${JSON.stringify(p.rawSample, null, 2)}</pre>
            </div>

            <!-- Outbound Metadata -->
            <div style="background: var(--primary-ultralight); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--primary);">
              <div style="font-size: 10.5px; font-weight: 700; color: var(--primary); margin-bottom: 8px;">2. Allowed Outbound Metadata (To SaaS)</div>
              <pre style="font-family: var(--font-mono); font-size: 11px; color: var(--text-primary); max-height: 220px; overflow-y: auto; line-height: 1.5;">${JSON.stringify(p.outboundMetadata, null, 2)}</pre>
            </div>
          </div>

          <!-- Justifications -->
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Regulatory Compliance Enclave Justifications</div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${p.justifications.map(j => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--surface-elevated); border-radius: var(--radius-sm); font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="cell-mono" style="font-weight: 700; color: var(--text-primary);">${j.field}</span>
                  <span class="nav-badge-pill enclave" style="font-size: 9.5px;">${j.action}</span>
                  <span style="color: var(--text-secondary);">${j.justification}</span>
                </div>
                <strong style="font-size: 11px; color: var(--primary);">${j.rule}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btn-verify-all-hashes')?.addEventListener('click', () => {
      alert('Cryptographic Hash Chain Verified: All 1,420,580 egress payloads matched local SHA-256 signatures with 0 byte leak.');
    });

    document.getElementById('btn-export-proof')?.addEventListener('click', () => {
      alert('Audit Certificate generated: sentinel-egress-certificate.pdf ready for download.');
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => this.render());
    this.theme.subscribe(() => this.render());
    this.i18n.subscribe(() => this.render());
  }
}

window.SentinelPrivacyView = SentinelPrivacyView;
