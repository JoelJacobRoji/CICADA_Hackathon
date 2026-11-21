/**
 * SENTINEL AI - Privacy Control Center (Hero Feature 2)
 * Interactive 3-stage horizontal pipeline:
 * LOCAL ENVIRONMENT ➔ PRIVACY GATE ➔ SENTINEL SaaS
 * Interactive payload diff drawer & cryptographic Egress Proof ledger.
 */

class SentinelPrivacyControlCenter {
  constructor(container, store, audioEngine) {
    this.container = container;
    this.store = store;
    this.audioEngine = audioEngine;
    this.selectedPayload = null;
    this.streamTimer = null;

    this.mockPayloads = [
      {
        id: 'PLD-94021',
        timestamp: '19:42:01.402',
        source: 'payment-service-pod-02',
        eventType: 'PAYMENT_AUTH_TOKEN',
        raw: {
          account_id: 'ACC-882194',
          email: 'sarah.connor@cyberdyne.io',
          client_ip: '192.168.4.112',
          card_pan: '4532-8819-2049-9912',
          auth_token: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          duration_ms: 14.2,
          status: 'SUCCESS'
        },
        redacted: {
          account_id: 'ACC-882194',
          email: '[REDACTED_EMAIL_HMAC_7f8a]',
          client_ip: '10.0.0.0/8 (ANONYMIZED)',
          card_pan: '[STRIPPED_PCI_COMPLIANCE]',
          auth_token: '[STRIPPED_SECURITY_POLICY]',
          duration_ms: 14.2,
          status: 'SUCCESS'
        },
        allowedFields: ['account_id', 'duration_ms', 'status'],
        blockedFields: [
          { field: 'email', reason: 'GDPR Article 4 Personal Data' },
          { field: 'client_ip', reason: 'Internal Network Topology Leak Prevention' },
          { field: 'card_pan', reason: 'PCI-DSS Requirement 3.4 Cardholder Data' },
          { field: 'auth_token', reason: 'OAuth2 / NIST SP 800-63B Credential Protection' }
        ],
        hash: '0x8f4d92a1bc34e819ac0012e873b94a11fec049281726a849f10928374a81b901'
      },
      {
        id: 'PLD-94022',
        timestamp: '19:42:02.118',
        source: 'auth-service-pod-01',
        eventType: 'USER_LOGIN_CHALLENGE',
        raw: {
          user_id: 'USR-1094',
          email: 'admin.ops@defense-grid.mil',
          client_ip: '172.16.88.4',
          mfa_method: 'TOTP',
          session_token: 'sec_tok_9918237401928301',
          risk_score: 0.04
        },
        redacted: {
          user_id: 'USR-1094',
          email: '[REDACTED_EMAIL_HMAC_3b19]',
          client_ip: '172.16.0.0/16 (ANONYMIZED)',
          mfa_method: 'TOTP',
          session_token: '[STRIPPED_CREDENTIAL]',
          risk_score: 0.04
        },
        allowedFields: ['user_id', 'mfa_method', 'risk_score'],
        blockedFields: [
          { field: 'email', reason: 'Federal PII Masking Standard' },
          { field: 'session_token', reason: 'Session Hijacking Vector Elimination' },
          { field: 'client_ip', reason: 'RFC 1918 Private Subnet Shield' }
        ],
        hash: '0x11a94e88cc2910fae0049182bb3819002938471928a837190028193847291a10'
      }
    ];

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="view-panel-header">
        <div>
          <span class="view-panel-eyebrow">// ZERO_KNOWLEDGE_ARCHITECTURE //</span>
          <h1 class="view-panel-title">PRIVACY CONTROL CENTER — LOCAL PIPELINE</h1>
        </div>
        <div class="threat-kpi-group">
          <div class="threat-kpi">
            <span class="kpi-val text-emerald">0 BYTES</span>
            <span class="kpi-label">RAW PII EGRESS</span>
          </div>
          <div class="threat-kpi">
            <span class="kpi-val text-cyan">100%</span>
            <span class="kpi-label">LOCAL KERNEL REDACTION</span>
          </div>
          <div class="threat-kpi">
            <span class="kpi-val text-violet">1,420,912</span>
            <span class="kpi-label">FIELDS MASKED TODAY</span>
          </div>
        </div>
      </div>

      <div class="view-panel-content">
        <!-- 3-STAGE HORIZONTAL PIPELINE -->
        <div class="privacy-pipeline-container">
          <!-- Column 1: Local Environment -->
          <div class="pipeline-column local">
            <div class="pipeline-col-header">
              <span class="col-icon">💻</span>
              <div class="col-title-group">
                <h3>LOCAL ENVIRONMENT</h3>
                <span class="col-sub">Customer Perimeter (On-Prem eBPF)</span>
              </div>
            </div>
            <div class="pipeline-stream" id="stream-local">
              <div class="stream-badge-title">RAW TELEMETRY / IN-FLIGHT PACKETS</div>
              <div class="payload-cards-list" id="local-payloads-list">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>

          <!-- Pipeline Laser Gate Separator -->
          <div class="pipeline-gate-beam">
            <div class="gate-emitter top"></div>
            <div class="gate-laser-line">
              <span class="gate-status-pill">SCANNING ENCLAVE ACTIVE</span>
            </div>
            <div class="gate-interceptor-tags">
              <span class="int-tag text-red">EMAIL REDACTED</span>
              <span class="int-tag text-amber">IP PSEUDONYMIZED</span>
              <span class="int-tag text-red">TOKEN BLOCKED</span>
              <span class="int-tag text-emerald">RAW LOG RETAINED LOCALLY</span>
            </div>
            <div class="gate-emitter bottom"></div>
          </div>

          <!-- Column 3: Sentinel SaaS -->
          <div class="pipeline-column saas">
            <div class="pipeline-col-header">
              <span class="col-icon">☁️</span>
              <div class="col-title-group">
                <h3>SENTINEL SaaS</h3>
                <span class="col-sub">Aggregated AIOps Observability</span>
              </div>
            </div>
            <div class="pipeline-stream" id="stream-saas">
              <div class="stream-badge-title">APPROVED SANITIZED METADATA ONLY</div>
              <div class="payload-cards-list" id="saas-payloads-list">
                <!-- Dynamically populated -->
              </div>
            </div>
          </div>
        </div>

        <!-- EGRESS PROOF & AUDIT LEDGER -->
        <div class="table-section-title">CRYPTOGRAPHIC EGRESS PROOF & SHA-256 HASH-CHAINED LEDGER</div>
        <div class="egress-proof-deck">
          <div class="egress-code-box">
            <div class="code-box-header">
              <span>OUTBOUND TELEMETRY PAYLOAD (SENT TO SAAS)</span>
              <span class="text-emerald">✓ VERIFIED BY GROTH16 ZK-SNARK</span>
            </div>
            <pre class="egress-json" id="egress-json-view">
{
  "timestamp": 1700501234,
  "source_cluster": "citadel-reach-enclave-01",
  "pld_id": "PLD-94021",
  "event_type": "PAYMENT_AUTH_TOKEN",
  "sanitized_metadata": {
    "account_id": "ACC-882194",
    "duration_ms": 14.2,
    "status": "SUCCESS"
  },
  "privacy_proof": {
    "differential_privacy_epsilon": 0.5,
    "zk_proof_hash": "0x8f4d92a1bc34e819ac0012e873b94a11fec049281726a849f10928374a81b901",
    "zero_leak_attestation": "TRUE"
  }
}
            </pre>
          </div>
        </div>

        <!-- PAYLOAD DIFF DRAWER (Slide in when a card is clicked) -->
        <div class="payload-diff-drawer" id="payload-diff-drawer" style="display: none;">
          <div class="diff-header">
            <div>
              <span class="text-emerald">// PAYLOAD_INSPECTOR //</span>
              <h3 id="diff-pld-id">PLD-94021: ORIGINAL vs REDACTED DIFF</h3>
            </div>
            <button class="tactical-btn icon-btn mini" id="btn-close-diff">✕</button>
          </div>

          <div class="diff-body">
            <div class="diff-grid">
              <div class="diff-col raw">
                <span class="diff-col-title text-red">ORIGINAL RAW (RETAINED ON-PREM)</span>
                <pre class="diff-code" id="diff-raw-code"></pre>
              </div>
              <div class="diff-col sanitized">
                <span class="diff-col-title text-emerald">SANITIZED (PERMITTED OUTBOUND)</span>
                <pre class="diff-code" id="diff-sanitized-code"></pre>
              </div>
            </div>

            <div class="table-section-title">FIELD ENFORCEMENT & COMPLIANCE JUSTIFICATIONS</div>
            <table class="tactical-table mini">
              <thead>
                <tr>
                  <th>FIELD</th>
                  <th>ACTION</th>
                  <th>COMPLIANCE REASON</th>
                </tr>
              </thead>
              <tbody id="diff-compliance-rows">
                <!-- Dynamically populated -->
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.populatePayloads();
    this.bindEvents();
  }

  populatePayloads() {
    const localList = document.getElementById('local-payloads-list');
    const saasList = document.getElementById('saas-payloads-list');

    if (!localList || !saasList) return;

    localList.innerHTML = '';
    saasList.innerHTML = '';

    this.mockPayloads.forEach((pld, idx) => {
      // Local Raw Card
      const localCard = document.createElement('div');
      localCard.className = 'payload-card local-card';
      localCard.innerHTML = `
        <div class="pld-card-top">
          <span class="pld-id">${pld.id}</span>
          <span class="pld-time">${pld.timestamp}</span>
        </div>
        <div class="pld-event">${pld.eventType}</div>
        <div class="pld-meta">Source: <code>${pld.source}</code></div>
        <div class="pld-flags">
          <span class="flag-danger">⚠️ RAW PII DETECTED</span>
          <span class="flag-btn">INSPECT ➔</span>
        </div>
      `;
      localCard.addEventListener('click', () => this.inspectPayload(pld));
      localList.appendChild(localCard);

      // SaaS Sanitized Card
      const saasCard = document.createElement('div');
      saasCard.className = 'payload-card saas-card';
      saasCard.innerHTML = `
        <div class="pld-card-top">
          <span class="pld-id text-emerald">${pld.id}</span>
          <span class="pld-time">${pld.timestamp}</span>
        </div>
        <div class="pld-event text-cyan">${pld.eventType}</div>
        <div class="pld-meta">Hash: <code>${pld.hash.substring(0, 16)}...</code></div>
        <div class="pld-flags">
          <span class="flag-safe">🛡️ 100% SANITIZED</span>
          <span class="flag-btn">VIEW PROOF</span>
        </div>
      `;
      saasCard.addEventListener('click', () => this.inspectPayload(pld));
      saasList.appendChild(saasCard);
    });
  }

  inspectPayload(pld) {
    this.selectedPayload = pld;
    const drawer = document.getElementById('payload-diff-drawer');
    if (!drawer) return;

    drawer.style.display = 'block';
    document.getElementById('diff-pld-id').textContent = `${pld.id} (${pld.eventType}) — INSPECTOR`;
    document.getElementById('diff-raw-code').textContent = JSON.stringify(pld.raw, null, 2);
    document.getElementById('diff-sanitized-code').textContent = JSON.stringify(pld.redacted, null, 2);

    const tbody = document.getElementById('diff-compliance-rows');
    tbody.innerHTML = '';

    pld.allowedFields.forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${f}</code></td>
        <td><span class="status-badge healthy mini">ALLOWED</span></td>
        <td class="text-dim">Non-sensitive aggregated execution metric</td>
      `;
      tbody.appendChild(tr);
    });

    pld.blockedFields.forEach(b => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code class="text-red">${b.field}</code></td>
        <td><span class="status-badge critical mini">STRIPPED AT KERNEL</span></td>
        <td class="text-amber">${b.reason}</td>
      `;
      tbody.appendChild(tr);
    });

    if (this.audioEngine) this.audioEngine.playSelect();
  }

  bindEvents() {
    const closeBtn = document.getElementById('btn-close-diff');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        document.getElementById('payload-diff-drawer').style.display = 'none';
      });
    }
  }
}

window.SentinelPrivacyControlCenter = SentinelPrivacyControlCenter;

