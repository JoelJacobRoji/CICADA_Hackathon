/**
 * SENTINEL AI - Soft Modern Investigation Workspace (Root Cause Isolation)
 * Multi-panel enterprise investigation workspace:
 * - Left: Incident context and affected infrastructure systems
 * - Center: Interactive Causal DAG graph (Request Spike -> DB CPU -> Pool Exhaustion -> Latency -> 504)
 * - Right: Structured technical AI investigation findings report (NOT a chatbot!)
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelInvestigationView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;
    this.selectedDagNodeId = 'c2'; // Default to DB CPU Saturation
    this.animFrameId = null;

    this.render();
    this.initCausalDag();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const inc = this.store.incidents.find(i => i.id === this.store.activeIncidentId) || this.store.incidents[0];
    const modeConfig = this.theme.getModeConfig();

    this.container.innerHTML = `
      <div class="investigation-workspace">
        <!-- Top Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('investigationTitle')} // <span style="font-family: var(--font-mono); color: var(--primary);">${inc.id}</span></h1>
            <p>${t('investigationSubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-back-to-command">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>${t('navCommandCenter')}</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-exec-runbook">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span>${t('btnExecute')}</span>
            </button>
          </div>
        </div>

        <!-- 3-Column Multi-Panel Layout -->
        <div class="investigation-grid-layout">
          <!-- Left: Incident Context & Blast Radius -->
          <div class="investigation-panel">
            <div style="padding: 14px 18px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px;">
                ${t('incidentContext')}
              </span>
              <span class="badge-severity ${inc.severity.toLowerCase()}">${inc.severity}</span>
            </div>

            <div style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; flex: 1;">
              <div>
                <h3 style="font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${inc.title}</h3>
                <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">${inc.detectedAt} · Duration ${inc.duration}</span>
              </div>

              <!-- Epicenter Card -->
              <div style="background: var(--surface-hover); padding: 12px; border-radius: var(--radius-md); border: 1.5px solid var(--border-subtle);">
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Primary Epicenter</div>
                <div class="cell-mono" style="font-weight: 700; color: var(--status-critical); font-size: 12.5px;">${this.store.getNodeDisplayName(inc.service)}</div>
                <div style="font-size: 10.5px; color: var(--text-secondary); margin-top: 2px;">${inc.service} · Primary Leader</div>
              </div>

              <!-- Impacted Systems -->
              <div>
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Affected Downstream Systems</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  ${inc.affectedServices.map(s => `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--surface); padding: 7px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-size: 11px; font-family: var(--font-mono);">
                      <div style="display: flex; align-items: center; gap: 7px;">
                        <span class="status-dot ${s === inc.service ? 'critical' : 'warning'}"></span>
                        <span style="color: var(--text-primary); font-weight: 600;">${this.store.getNodeDisplayName(s)}</span>
                      </div>
                      <span style="font-size: 9.5px; font-weight: 700; color: ${s === inc.service ? 'var(--status-critical)' : 'var(--status-warning)'};">
                        ${s === inc.service ? 'EPICENTER' : 'IMPACTED'}
                      </span>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Correlated Signals -->
              <div>
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Correlated Telemetry Signals</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  ${inc.correlatedSignals.map(sig => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--surface-elevated); border-radius: var(--radius-sm); font-size: 10.5px; font-family: var(--font-mono); border: 1px solid var(--border-subtle);">
                      <span style="color: var(--text-secondary);">${sig.signal.split('.')[1] || sig.signal}</span>
                      <span style="color: var(--status-critical); font-weight: 700; background: var(--status-critical-light); padding: 1px 6px; border-radius: var(--radius-pill);">${sig.delta}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Center: Interactive Causal DAG Graph -->
          <div class="investigation-panel">
            <div style="padding: 12px 18px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-primary); display: flex; align-items: center; gap: 7px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                ${t('causalDagTitle')}
              </span>
              <span style="font-size: 10.5px; color: var(--primary); font-family: var(--font-mono); font-weight: 600;">
                Click node to isolate signal evidence
              </span>
            </div>
            
            <div class="causal-dag-canvas-container" id="dag-container">
              <canvas id="dag-canvas"></canvas>
            </div>
          </div>

          <!-- Right: Structured Technical AI Investigation Findings Report -->
          <div class="investigation-panel">
            <div style="padding: 14px 18px; background: var(--surface-elevated); border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--primary); letter-spacing: 0.5px;">
                ${t('findingsTitle')}
              </span>
              <span style="font-size: 9.5px; font-family: var(--font-mono); font-weight: 700; color: var(--primary); background: var(--primary-ultralight); padding: 2px 7px; border-radius: var(--radius-pill);">
                AI VERIFIED
              </span>
            </div>

            <div style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; flex: 1;">
              <!-- Confidence Card -->
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border-subtle);">
                <div>
                  <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">${t('confidenceScore')}</div>
                  <div style="font-size: 17px; font-weight: 800; font-family: var(--font-mono); color: var(--primary); margin-top: 2px;">
                    ${inc.confidence}% PROBABLE
                  </div>
                </div>
                <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--surface); border: 3px solid var(--primary); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 11.5px; font-weight: 800; color: var(--primary); box-shadow: 0 4px 12px rgba(124, 92, 255, 0.15);">
                  ${inc.confidence}%
                </div>
              </div>

              <!-- Technical Summary -->
              <div>
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px;">${t('probableRootCause')}</div>
                <p style="font-size: 12px; color: var(--text-primary); line-height: 1.55; background: var(--surface); padding: 10px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                  ${inc.probableRootCause}
                </p>
              </div>

              <!-- Evidence Chain -->
              <div>
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">${t('evidenceChain')}</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  ${inc.evidence.map((ev, idx) => `
                    <div style="font-size: 11px; color: var(--text-secondary); background: var(--surface); padding: 8px 10px; border-radius: var(--radius-sm); border-left: 3px solid var(--primary); border-top: 1px solid var(--border-subtle); border-right: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); line-height: 1.45;">
                      <strong style="color: var(--primary);">#${idx + 1}:</strong> ${ev}
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Recommended Remediation -->
              <div>
                <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px;">${t('recommendedAction')}</div>
                <div style="background: var(--primary-ultralight); border: 1.5px solid var(--primary-light); border-radius: var(--radius-md); padding: 12px;">
                  <div style="font-weight: 700; font-size: 12px; color: var(--primary); margin-bottom: 2px;">RUNBOOK-01: Scale Connection Pool</div>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.45;">Increase max_connections parameter from 100 to 250 and reload PgBouncer pooler.</div>
                  <button class="btn btn-primary btn-sm" style="width: 100%; justify-content: center;" id="btn-remediate-from-report">${t('btnApplyFix')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  initCausalDag() {
    const canvas = document.getElementById('dag-canvas');
    const container = document.getElementById('dag-container');
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 450;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const primaryNodeName = this.store.getNodeDisplayName('postgres-primary-01');

    const dagNodes = [
      { id: 'c1', label: 'Batch Influx', sub: 'Client Trigger (15:41:48)', x: w * 0.15, y: h * 0.5, status: 'warning' },
      { id: 'c2', label: `${primaryNodeName} (98%)`, sub: 'Root Cause Epicenter', x: w * 0.35, y: h * 0.3, status: 'critical' },
      { id: 'c3', label: 'Pool Exhaustion', sub: 'PgBouncer Saturation (98/100)', x: w * 0.55, y: h * 0.3, status: 'critical' },
      { id: 'c4', label: 'order-processor Spike', sub: 'Cascade Latency (284ms)', x: w * 0.73, y: h * 0.52, status: 'warning' },
      { id: 'c5', label: 'Gateway 504 Errors', sub: 'Ingress Envoy Symptom', x: w * 0.86, y: h * 0.74, status: 'critical' }
    ];

    const edges = [
      { from: 'c1', to: 'c2' },
      { from: 'c2', to: 'c3' },
      { from: 'c3', to: 'c4' },
      { from: 'c4', to: 'c5' }
    ];

    let pulse = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      pulse += 0.04;

      // Draw Edges with smooth curves & moving pulses
      edges.forEach(edge => {
        const n1 = dagNodes.find(n => n.id === edge.from);
        const n2 = dagNodes.find(n => n.id === edge.to);
        if (!n1 || !n2) return;

        const cpx1 = (n1.x + n2.x) / 2;
        const cpy1 = n1.y;
        const cpx2 = (n1.x + n2.x) / 2;
        const cpy2 = n2.y;

        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, n2.x, n2.y);
        ctx.strokeStyle = '#FCA5A5';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Direction Arrow Marker
        const t = (Math.sin(pulse) + 1) / 2;
        const midX = (1 - t) * (1 - t) * n1.x + 2 * (1 - t) * t * cpx1 + t * t * n2.x;
        const midY = (1 - t) * (1 - t) * n1.y + 2 * (1 - t) * t * cpy2 + t * t * n2.y;

        ctx.beginPath();
        ctx.arc(midX, midY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#EF4444';
        ctx.fill();
      });

      // Draw Nodes
      dagNodes.forEach(node => {
        const isSelected = node.id === this.selectedDagNodeId;
        const color = node.status === 'critical' ? '#EF4444' : '#F59E0B';

        const boxW = 160;
        const boxH = 54;
        const bx = node.x - boxW / 2;
        const by = node.y - boxH / 2;
        const r = 12;

        // Soft Shadow
        ctx.save();
        ctx.shadowColor = isSelected ? 'rgba(124, 92, 255, 0.25)' : 'rgba(0, 0, 0, 0.06)';
        ctx.shadowBlur = isSelected ? 16 : 8;
        ctx.shadowOffsetY = 4;

        // Rounded Box
        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + boxW - r, by);
        ctx.quadraticCurveTo(bx + boxW, by, bx + boxW, by + r);
        ctx.lineTo(bx + boxW, by + boxH - r);
        ctx.quadraticCurveTo(bx + boxW, by + boxH, bx + boxW - r, by + boxH);
        ctx.lineTo(bx + r, by + boxH);
        ctx.quadraticCurveTo(bx, by + boxH, bx, by + boxH - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();

        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();

        // Border
        ctx.strokeStyle = isSelected ? '#7C5CFF' : (node.status === 'critical' ? '#FECACA' : '#FDE68A');
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Status indicator dot
        ctx.beginPath();
        ctx.arc(bx + 16, by + 20, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Title
        ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = '#1E1B2E';
        ctx.fillText(node.label, bx + 27, by + 23);

        // Subtitle
        ctx.font = '9.5px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#6B6684';
        ctx.fillText(node.sub, bx + 12, by + 41);
      });

      this.animFrameId = requestAnimationFrame(draw);
    };

    draw();

    // Node click selection
    canvas.addEventListener('click', (e) => {
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left;
      const y = e.clientY - b.top;

      dagNodes.forEach(node => {
        if (Math.abs(node.x - x) < 80 && Math.abs(node.y - y) < 27) {
          this.selectedDagNodeId = node.id;
        }
      });
    });
  }

  bindEvents() {
    document.getElementById('btn-back-to-command')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('command-center');
    });

    document.getElementById('btn-exec-runbook')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('remediation');
    });

    document.getElementById('btn-remediate-from-report')?.addEventListener('click', () => {
      this.store.executeRemediation('RUNBOOK-01');
      if (this.onNavigate) this.onNavigate('remediation');
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => {
      // Live store updates
    });
    this.i18n.subscribe(() => {
      this.render();
      this.initCausalDag();
    });
    this.theme.subscribe(() => {
      this.render();
      this.initCausalDag();
    });
  }
}

window.SentinelInvestigationView = SentinelInvestigationView;
