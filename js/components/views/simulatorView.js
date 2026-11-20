/**
 * SENTINEL AI - Soft Modern Chaos Engineering & Scenario Simulator
 * Inject 8 synthetic enterprise failure scenarios to test real-time observability,
 * topology mutations, automated incident isolation, and zero-knowledge remediation.
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelSimulatorView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;

    this.scenarios = [
      {
        key: 'db_saturation',
        title: 'Database Connection Pool Saturation',
        severity: 'CRITICAL',
        target: 'postgres-primary-01',
        description: 'Simulate ad-hoc batch reporting query storm exhausting 98 of 100 connection pool slots and causing downstream checkout timeouts.',
        impact: 'order-processor latency spikes to 284ms; HTTP 504 errors on /api/v1/checkout.'
      },
      {
        key: 'api_latency',
        title: 'Ingress API Gateway Latency Spike',
        severity: 'CRITICAL',
        target: 'api-gateway-core',
        description: 'Inject 450ms thread latency on ingress Envoy proxy layer due to SSL certificate handshake renegotiation loop.',
        impact: 'Global P99 latency surges across all mobile and web client routes.'
      },
      {
        key: 'memory_leak',
        title: 'Auth Service Memory Leak & GC Pause',
        severity: 'HIGH',
        target: 'auth-service',
        description: 'Simulate unbounded JWT token cache accumulation causing JVM/Node memory heap exhaustion and 2.4s stop-the-world GC pauses.',
        impact: 'OAuth token validations timeout; users experience intermittent re-authentication prompts.'
      },
      {
        key: 'collector_offline',
        title: 'eBPF Local Collector Disconnect',
        severity: 'HIGH',
        target: 'col-acme-mumbai-01',
        description: 'Terminate Tier-1 collector daemon to verify local SQLite WAL ring-buffer fail-safe and backpressure preservation without data loss.',
        impact: 'Collector status toggles offline; telemetry buffers locally on host disk.'
      },
      {
        key: 'redis_eviction',
        title: 'Redis Cache Key Eviction Storm',
        severity: 'MEDIUM',
        target: 'redis-cluster-cache',
        description: 'Flush L1 product catalog cache keys simultaneously, forcing high-concurrency read queries to hit downstream PostgreSQL leader.',
        impact: 'Cache hit ratio drops from 98.8% to 32%; DB read IOPS spikes.'
      },
      {
        key: 'brute_force',
        title: 'Distributed Brute-Force Auth Influx',
        severity: 'HIGH',
        target: 'waf-shield-proxy',
        description: 'Inject 50,000 req/s credential stuffing traffic from botnet IPs targeting /api/v1/auth/login.',
        impact: 'WAF rate limiter engages; adaptive challenge rules quarantine malicious ASNs.'
      },
      {
        key: 'packet_loss',
        title: 'Cross-Region Inter-DC Packet Loss',
        severity: 'MEDIUM',
        target: 'Cross-Region Mesh',
        description: 'Simulate 18% packet loss on underwater fiber transit connecting Mumbai (ap-south) and Frankfurt (eu-west).',
        impact: 'Async database replication lag increases from 8ms to 1,420ms.'
      },
      {
        key: 'saas_outage',
        title: 'SENTINEL Cloud SaaS Ingest Degradation',
        severity: 'MEDIUM',
        target: 'sentinel-saas-gateway',
        description: 'Simulate upstream SaaS endpoint 503 Service Unavailable to test zero-data-loss local spooling on customer nodes.',
        impact: 'Outbox queue accumulates safely inside customer VPC; zero data drops.'
      }
    ];

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const modeConfig = this.theme.getModeConfig();
    const isChaosActive = !!this.store.activeScenario;

    this.container.innerHTML = `
      <div class="simulator-workspace">
        <!-- Title & Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('simTitle')}</h1>
            <p>${t('simSubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-reset-simulator">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
              <span>${t('btnResetBaseline')}</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-sim-to-command">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              <span>${t('navCommandCenter')}</span>
            </button>
          </div>
        </div>

        <!-- Simulation State Banner -->
        <div class="card" style="padding: 14px 20px; margin-bottom: 20px; border-left: 4px solid ${isChaosActive ? 'var(--status-critical)' : 'var(--status-healthy)'};">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="status-dot ${isChaosActive ? 'critical' : 'healthy'}" style="width: 9px; height: 9px;"></span>
              <div>
                <span style="font-weight: 700; color: var(--text-primary); font-size: 13px;">${t('simState')}</span>
                <span style="font-family: var(--font-mono); font-weight: 700; color: ${isChaosActive ? 'var(--status-critical)' : 'var(--status-healthy)'}; margin-left: 8px; font-size: 12.5px;">
                  ${isChaosActive ? `ACTIVE: [${this.store.activeScenario.toUpperCase()}]` : t('simNominal')}
                </span>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--primary); background: var(--primary-ultralight); padding: 3px 8px; border-radius: var(--radius-pill);">
                ${modeConfig.nameEn}
              </span>
              <span style="font-size: 11px; color: var(--text-muted);">
                Real-time 1 Hz telemetry propagation
              </span>
            </div>
          </div>
        </div>

        <!-- 8 Scenario Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          ${this.scenarios.map(s => {
            const isActive = this.store.activeScenario === s.key;
            const targetDisplayName = this.store.getNodeDisplayName(s.target);

            return `
              <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between; border: 1.5px solid ${isActive ? 'var(--status-critical)' : 'var(--border-subtle)'}; background: ${isActive ? 'var(--surface-elevated)' : 'var(--surface)'};">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span class="badge-severity ${s.severity.toLowerCase()}">${s.severity}</span>
                    <span class="cell-mono" style="font-size: 10.5px; color: var(--primary); font-weight: 700;">${targetDisplayName}</span>
                  </div>
                  <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">${s.title}</h3>
                  <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.5;">${s.description}</p>
                  <div style="font-size: 11px; color: var(--text-muted); background: var(--surface-hover); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-bottom: 14px; line-height: 1.45;">
                    <strong style="color: var(--text-primary);">Observed Impact:</strong> ${s.impact}
                  </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border-subtle);">
                  ${isActive ? `
                    <button class="btn btn-secondary btn-sm btn-deactivate-scenario" data-key="${s.key}">
                      ${t('btnDeactivate')}
                    </button>
                    <button class="btn btn-primary btn-sm btn-inspect-scenario-impact" data-key="${s.key}">
                      ${t('btnInspectDag')}
                    </button>
                  ` : `
                    <button class="btn btn-danger btn-sm btn-trigger-scenario" data-key="${s.key}">
                      ${t('btnInject')}
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.btn-trigger-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-key');
        this.store.triggerScenario(key);
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-deactivate-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        this.store.resetScenario();
        this.render();
      });
    });

    this.container.querySelectorAll('.btn-inspect-scenario-impact').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.onNavigate) this.onNavigate('investigation');
      });
    });

    document.getElementById('btn-reset-simulator')?.addEventListener('click', () => {
      this.store.resetScenario();
      this.render();
    });

    document.getElementById('btn-sim-to-command')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('command-center');
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

window.SentinelSimulatorView = SentinelSimulatorView;
