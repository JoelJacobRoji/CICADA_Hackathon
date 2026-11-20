/**
 * SENTINEL AI - Central Telemetry Store & Deterministic Simulation Engine
 * Enterprise Observability Single Source of Truth.
 * Manages 42 infrastructure services across 5 tiers, 1 Hz telemetry drift,
 * 8 chaos engineering scenarios, incident states, privacy audit records, and runbooks.
 */

class SentinelTelemetryStore {
  constructor() {
    this.seed = 133742;
    this.tickCount = 0;
    this.listeners = new Set();

    // Environment & Region Selection
    this.currentEnv = 'Production';      // Production | Staging | Development
    this.currentRegion = 'Asia Pacific (Mumbai)'; // Asia Pacific | Europe | North America

    // Active Scenario & Incident
    this.activeScenario = null;
    this.activeIncidentId = 'INC-1042';

    // Global Fleet Aggregates
    this.globalMetrics = {
      systemHealth: 99.84,      // %
      activeIncidentsCount: 1,
      monitoredServicesCount: 42,
      collectorsOnline: 3,
      totalCollectors: 3,
      ingestionRateMBps: 14.8,  // MB/s
      meanResponseTimeMs: 24.6, // ms
      p99LatencyMs: 42.1,
      fleetCpuAvg: 48.2,        // %
      fleetMemAvg: 62.4,        // %
      errorRateAvg: 0.04,       // %
      totalRPS: 12840,          // req/s
      eventsProcessedTotal: 1420580,
      fieldsRedactedTotal: 4821300,
      payloadsBlockedTotal: 24,
      rawEgressBytes: 0,        // Zero raw leak guarantee
      mttdMin: 1.4,             // minutes
      mttrMin: 8.2,             // minutes
      alertNoiseReduction: 84   // %
    };

    // Historical Time Series Buffer (60s window for charts)
    this.history = {
      timestamps: [],
      cpu: [],
      memory: [],
      rps: [],
      latency: [],
      errorRate: [],
      networkIO: []
    };

    // Initialize Subsystems
    this.initInfrastructure();
    this.initIncidents();
    this.initCollectors();
    this.initPrivacyRecords();
    this.initRemediations();
    this.initRecentEvents();
    this.initHistoricalBuffer();

    // Start 1 Hz deterministic tick
    this.startTicker();

    // Subscribe to Theme & Localization Updates
    if (typeof window !== 'undefined') {
      window.addEventListener('DOMContentLoaded', () => {
        if (window.sentinelTheme) {
          window.sentinelTheme.subscribe(() => this.notifyListeners());
        }
        if (window.sentinelI18n) {
          window.sentinelI18n.subscribe(() => this.notifyListeners());
        }
      });
    }
  }

  getNodeDisplayName(nodeId) {
    if (typeof window !== 'undefined' && window.sentinelTheme) {
      const modeConfig = window.sentinelTheme.getModeConfig();
      if (modeConfig && modeConfig.nodeNames && modeConfig.nodeNames[nodeId]) {
        return modeConfig.nodeNames[nodeId];
      }
    }
    const node = this.nodesMap.get(nodeId);
    return node ? node.name : nodeId;
  }

  // Deterministic Mulberry32 PRNG
  prng() {
    let t = (this.seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  initInfrastructure() {
    // 5 Architectural Tiers with 42 distinct enterprise components
    this.tiers = [
      { id: 'tier-ingress', name: 'Global Ingress & Edge', order: 1 },
      { id: 'tier-privacy', name: 'Local Privacy Gate (eBPF Enclave)', order: 2 },
      { id: 'tier-apps', name: 'Application Microservices', order: 3 },
      { id: 'tier-data', name: 'Data & Storage Tier', order: 4 },
      { id: 'tier-cloud', name: 'Cloud Infrastructure & Security', order: 5 }
    ];

    // Primary nodes positioned in topology canvas
    this.nodes = [
      // --- TIER 1: Ingress & Edge ---
      {
        id: 'node-cdn-edge',
        name: 'cloudflare-edge-01',
        tier: 'tier-ingress',
        role: 'Anycast CDN & WAF Edge',
        type: 'ingress',
        x: 100, y: 160,
        status: 'healthy',
        cpu: 32, memory: 44, latency: 4.2, rps: 12840, errorRate: 0.01,
        connections: ['node-api-gw', 'node-waf-guard'],
        region: 'Global Anycast',
        version: 'v4.18.2'
      },
      {
        id: 'node-waf-guard',
        name: 'waf-shield-proxy',
        tier: 'tier-ingress',
        role: 'Layer 7 Threat Mitigation',
        type: 'security',
        x: 100, y: 320,
        status: 'healthy',
        cpu: 28, memory: 38, latency: 2.1, rps: 12840, errorRate: 0.0,
        connections: ['node-api-gw'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v2.9.1'
      },
      {
        id: 'node-api-gw',
        name: 'api-gateway-core',
        tier: 'tier-ingress',
        role: 'Envoy Ingress Router & TLS',
        type: 'gateway',
        x: 270, y: 240,
        status: 'healthy',
        cpu: 54, memory: 61, latency: 12.4, rps: 11420, errorRate: 0.05,
        connections: ['node-col-01', 'node-auth-svc', 'node-order-svc', 'node-billing-svc', 'node-search-svc'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v1.31.0'
      },

      // --- TIER 2: Local Privacy Collectors (Hero Feature) ---
      {
        id: 'node-col-01',
        name: 'col-acme-mumbai-01',
        tier: 'tier-privacy',
        role: 'Local eBPF Kernel Collector & PII Scrubber',
        type: 'collector',
        x: 440, y: 120,
        status: 'healthy',
        cpu: 18, memory: 34, latency: 0.8, rps: 9400, errorRate: 0.0,
        connections: ['node-saas-cloud'],
        region: 'On-Prem Enclave (Mumbai)',
        version: 'v0.9.4',
        enclaveMode: 'eBPF Kernel Ring Buffer',
        zeroLeakVerified: true,
        bufferUtilization: 24
      },
      {
        id: 'node-col-02',
        name: 'col-acme-frankfurt-02',
        tier: 'tier-privacy',
        role: 'Differential Privacy Aggregator',
        type: 'collector',
        x: 440, y: 440,
        status: 'healthy',
        cpu: 14, memory: 28, latency: 1.1, rps: 4200, errorRate: 0.0,
        connections: ['node-saas-cloud'],
        region: 'On-Prem Enclave (Frankfurt)',
        version: 'v0.9.4',
        enclaveMode: 'eBPF Kernel Ring Buffer',
        zeroLeakVerified: true,
        bufferUtilization: 19
      },

      // --- TIER 3: Microservices ---
      {
        id: 'node-auth-svc',
        name: 'auth-service',
        tier: 'tier-apps',
        role: 'OAuth2 / OIDC & Session Engine',
        type: 'app',
        x: 520, y: 210,
        status: 'healthy',
        cpu: 41, memory: 52, latency: 16.2, rps: 3420, errorRate: 0.02,
        connections: ['node-redis-cache', 'node-vault-kms'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v3.4.1'
      },
      {
        id: 'node-order-svc',
        name: 'order-processor',
        tier: 'tier-apps',
        role: 'Transactional Checkout Pipeline',
        type: 'app',
        x: 520, y: 310,
        status: 'warning',
        cpu: 76, memory: 81, latency: 84.5, rps: 4120, errorRate: 2.14,
        connections: ['node-pg-primary', 'node-redis-cache', 'node-kafka-bus'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v2.18.0'
      },
      {
        id: 'node-billing-svc',
        name: 'billing-engine',
        tier: 'tier-apps',
        role: 'PCI-DSS Stripe & Ledger Sync',
        type: 'app',
        x: 520, y: 410,
        status: 'healthy',
        cpu: 38, memory: 46, latency: 28.4, rps: 1840, errorRate: 0.01,
        connections: ['node-pg-primary', 'node-vault-kms'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v1.12.3'
      },
      {
        id: 'node-search-svc',
        name: 'search-indexer',
        tier: 'tier-apps',
        role: 'Vector Embeddings & Hybrid Search',
        type: 'app',
        x: 520, y: 510,
        status: 'healthy',
        cpu: 52, memory: 68, latency: 34.1, rps: 2040, errorRate: 0.04,
        connections: ['node-redis-cache', 'node-clickhouse'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v2.4.0'
      },

      // --- TIER 4: Data & Storage ---
      {
        id: 'node-pg-primary',
        name: 'postgres-primary-01',
        tier: 'tier-data',
        role: 'HA PostgreSQL 16 Cluster Leader',
        type: 'database',
        x: 750, y: 260,
        status: 'critical', // Epicenter of #1042 incident!
        cpu: 96, memory: 89, latency: 284.0, rps: 5840, errorRate: 8.42,
        connections: ['node-pg-replica', 'node-kafka-bus'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v16.3',
        dbPoolUsage: '98 / 100 conns',
        iops: 14200,
        lockWaits: 42
      },
      {
        id: 'node-pg-replica',
        name: 'postgres-read-replica-01',
        tier: 'tier-data',
        role: 'Async Streaming Read Replica',
        type: 'database',
        x: 750, y: 370,
        status: 'healthy',
        cpu: 44, memory: 58, latency: 14.8, rps: 3400, errorRate: 0.01,
        connections: [],
        region: 'Asia Pacific (Mumbai)',
        version: 'v16.3',
        replicationLagMs: 8.2
      },
      {
        id: 'node-redis-cache',
        name: 'redis-cluster-cache',
        tier: 'tier-data',
        role: 'In-Memory Key-Value & Session Store',
        type: 'database',
        x: 750, y: 150,
        status: 'healthy',
        cpu: 31, memory: 64, latency: 1.4, rps: 9800, errorRate: 0.0,
        connections: [],
        region: 'Asia Pacific (Mumbai)',
        version: 'v7.2.4',
        hitRate: '98.8%'
      },
      {
        id: 'node-kafka-bus',
        name: 'kafka-event-mesh',
        tier: 'tier-data',
        role: 'Distributed Audit Event Bus',
        type: 'database',
        x: 750, y: 480,
        status: 'healthy',
        cpu: 42, memory: 56, latency: 6.2, rps: 7600, errorRate: 0.0,
        connections: ['node-clickhouse'],
        region: 'Asia Pacific (Mumbai)',
        version: 'v3.7.0'
      },
      {
        id: 'node-clickhouse',
        name: 'clickhouse-olap',
        tier: 'tier-data',
        role: 'Columnar Analytics & Telemetry Log Lake',
        type: 'database',
        x: 750, y: 580,
        status: 'healthy',
        cpu: 58, memory: 72, latency: 18.4, rps: 2200, errorRate: 0.02,
        connections: [],
        region: 'Asia Pacific (Mumbai)',
        version: 'v24.3'
      },

      // --- TIER 5: Cloud & Security ---
      {
        id: 'node-vault-kms',
        name: 'hashicorp-vault-kms',
        tier: 'tier-cloud',
        role: 'HSM Cryptographic Key Authority',
        type: 'security',
        x: 960, y: 220,
        status: 'healthy',
        cpu: 24, memory: 36, latency: 3.1, rps: 1800, errorRate: 0.0,
        connections: [],
        region: 'Cloud Enclave (HSM)',
        version: 'v1.16.2'
      },
      {
        id: 'node-saas-cloud',
        name: 'sentinel-saas-gateway',
        tier: 'tier-cloud',
        role: 'Multi-Tenant SaaS Telemetry Ingest',
        type: 'cloud',
        x: 960, y: 400,
        status: 'healthy',
        cpu: 36, memory: 48, latency: 18.2, rps: 13600, errorRate: 0.01,
        connections: [],
        region: 'SENTINEL Cloud SaaS (US-East)',
        version: 'v2.4.0',
        zeroKnowledgeReceiptVerified: true
      }
    ];

    // Build Node Map & Links Map
    this.nodesMap = new Map();
    this.nodes.forEach(n => this.nodesMap.set(n.id, n));

    this.links = [];
    this.nodes.forEach(src => {
      src.connections.forEach(targetId => {
        const dst = this.nodesMap.get(targetId);
        if (dst) {
          this.links.push({
            id: `${src.id}->${dst.id}`,
            source: src.id,
            target: dst.id,
            sourceNode: src,
            targetNode: dst,
            bandwidthRPS: Math.round(src.rps * 0.45),
            latency: Math.round((src.latency + dst.latency) * 0.5 * 10) / 10,
            status: (src.status === 'critical' || dst.status === 'critical') ? 'critical' :
                    (src.status === 'warning' || dst.status === 'warning') ? 'warning' : 'healthy'
          });
        }
      });
    });
  }

  initIncidents() {
    this.incidents = [
      {
        id: 'INC-1042',
        title: 'Database Connection Pool Saturation & Cascade',
        severity: 'CRITICAL',
        status: 'ACTIVE',
        service: 'postgres-primary-01',
        affectedServices: ['postgres-primary-01', 'order-processor', 'billing-engine', 'api-gateway-core'],
        detectedAt: '2 minutes ago (15:42:01 UTC)',
        duration: '4m 18s',
        confidence: 94,
        owner: 'DevOps / Database Reliability',
        probableRootCause: 'Ad-hoc analytic query execution triggered unindexed sequential table scan on table "transactions", consuming 98% CPU and holding transaction locks.',
        evidence: [
          'Postgres connection pool exhausted (98 of 100 slots active)',
          'Disk IOPS saturated at 14,200 (98% threshold)',
          'Cascade latency jump in order-processor: 16.2ms -> 284ms',
          'Downstream HTTP 504 Gateway Timeouts rising at 4.2%/min'
        ],
        correlatedSignals: [
          { signal: 'pg_stat_activity.active_conns', delta: '+340%', correlation: 0.98 },
          { signal: 'order-processor.p99_latency', delta: '+1650%', correlation: 0.94 },
          { signal: 'api-gateway.504_error_rate', delta: '+8.4%', correlation: 0.91 }
        ],
        remediationId: 'RUNBOOK-01',
        timeline: [
          { time: '15:41:48 UTC', event: 'Sudden influx of batch analytical queries to leader node', level: 'warning' },
          { time: '15:42:01 UTC', event: 'Database connection pool reached 95% threshold (Alert #8812)', level: 'critical' },
          { time: '15:42:14 UTC', event: 'order-processor thread exhaustion triggered upstream retry storm', level: 'critical' },
          { time: '15:42:30 UTC', event: 'AI Diagnostics isolated lock contention on "transactions" table', level: 'info' }
        ],
        causalDAG: {
          nodes: [
            { id: 'c1', label: 'Batch Query Influx', type: 'trigger', status: 'warning' },
            { id: 'c2', label: 'DB CPU Saturation (98%)', type: 'cause', status: 'critical' },
            { id: 'c3', label: 'Connection Pool Exhaustion', type: 'cause', status: 'critical' },
            { id: 'c4', label: 'order-processor Timeout', type: 'symptom', status: 'warning' },
            { id: 'c5', label: 'Upstream 504 Errors', type: 'symptom', status: 'critical' }
          ],
          edges: [
            { from: 'c1', to: 'c2' },
            { from: 'c2', to: 'c3' },
            { from: 'c3', to: 'c4' },
            { from: 'c4', to: 'c5' }
          ]
        }
      },
      {
        id: 'INC-1039',
        title: 'Redis Cluster Memory Fragmentation Warning',
        severity: 'MEDIUM',
        status: 'RESOLVED',
        service: 'redis-cluster-cache',
        affectedServices: ['redis-cluster-cache'],
        detectedAt: '3 hours ago',
        duration: '18m 22s',
        confidence: 88,
        owner: 'SRE Team',
        probableRootCause: 'Episodic cache key churn during product catalog indexing.',
        evidence: ['Memory fragmentation ratio spiked to 1.82', 'Eviction count rose to 4,200 keys/sec'],
        correlatedSignals: [],
        remediationId: 'RUNBOOK-05',
        timeline: []
      },
      {
        id: 'INC-1036',
        title: 'WAF Rate Limit Spike on Edge Route /api/v1/auth',
        severity: 'HIGH',
        status: 'RESOLVED',
        service: 'waf-shield-proxy',
        affectedServices: ['waf-shield-proxy', 'auth-service'],
        detectedAt: '12 hours ago',
        duration: '6m 40s',
        confidence: 96,
        owner: 'SecOps Team',
        probableRootCause: 'Distributed credential stuffing attempt originated from AS13335 IP block.',
        evidence: ['12,400 failed login attempts in 60s', 'WAF automatically applied adaptive CAPTCHA rate rule'],
        correlatedSignals: [],
        remediationId: 'RUNBOOK-04',
        timeline: []
      }
    ];
  }

  initCollectors() {
    this.collectors = [
      {
        id: 'col_acme_mumbai_01',
        hostname: 'prod-in-col-01.internal.acme.corp',
        env: 'Production',
        region: 'Asia Pacific (Mumbai)',
        version: 'v0.9.4',
        status: 'HEALTHY',
        lastHeartbeat: '1s ago',
        cpu: 18.2,
        memory: 34.6,
        ingestionRate: '9,420 ev/s',
        bufferUtilization: '24%',
        sqliteWalSize: '14.2 MB',
        kernelEnclave: 'eBPF Ring Buffer Active',
        zeroKnowledgeHash: '0x8f3b2a91...e4c1'
      },
      {
        id: 'col_acme_frankfurt_02',
        hostname: 'prod-eu-col-02.internal.acme.corp',
        env: 'Production',
        region: 'Europe (Frankfurt)',
        version: 'v0.9.4',
        status: 'HEALTHY',
        lastHeartbeat: '1s ago',
        cpu: 14.1,
        memory: 28.3,
        ingestionRate: '4,210 ev/s',
        bufferUtilization: '19%',
        sqliteWalSize: '8.4 MB',
        kernelEnclave: 'eBPF Ring Buffer Active',
        zeroKnowledgeHash: '0x3c71a92e...f8a2'
      },
      {
        id: 'col_acme_va_03',
        hostname: 'prod-us-col-03.internal.acme.corp',
        env: 'Production',
        region: 'North America (US-East)',
        version: 'v0.9.4',
        status: 'HEALTHY',
        lastHeartbeat: '2s ago',
        cpu: 21.4,
        memory: 39.0,
        ingestionRate: '7,890 ev/s',
        bufferUtilization: '31%',
        sqliteWalSize: '22.1 MB',
        kernelEnclave: 'eBPF Ring Buffer Active',
        zeroKnowledgeHash: '0x5b92d431...9a12'
      }
    ];
  }

  initPrivacyRecords() {
    this.privacyAuditLogs = [
      {
        id: 'PAYLOAD-99421',
        timestamp: '15:42:19.412 UTC',
        collectorId: 'col_acme_mumbai_01',
        sourceType: 'HTTP Access Log',
        rawFieldsCount: 28,
        redactedCount: 6,
        blockedCount: 0,
        status: 'TRANSMITTED',
        policy: 'STRICT_PCI_GDPR_ENCLAVE',
        rawSample: {
          timestamp: '2026-11-21T15:42:19.410Z',
          client_ip: '103.21.244.18',
          user_id: 'usr_849204812',
          email: 'sarah.connor@acme-enterprise.com',
          credit_card_mask: '4532-XXXX-XXXX-8912',
          auth_jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          method: 'POST',
          path: '/api/v1/orders/checkout',
          status_code: 504,
          duration_ms: 284.2,
          sql_query: "SELECT * FROM transactions WHERE card_hash = '9f82...' AND amount > 500"
        },
        redactedSample: {
          timestamp: '2026-11-21T15:42:19.410Z',
          client_ip: 'ANONYMIZED_SUBNET (103.21.0.0/16)',
          user_id: 'PSEUDO_HASH_8F921B',
          email: '[REDACTED: GDPR Art. 6 PII]',
          credit_card_mask: '[REDACTED: PCI-DSS Req 3.4]',
          auth_jwt: '[REDACTED: SENSITIVE_CREDENTIAL]',
          method: 'POST',
          path: '/api/v1/orders/checkout',
          status_code: 504,
          duration_ms: 284.2,
          sql_query: '[REDACTED: SANITIZED_METADATA_ONLY - SELECT transactions]'
        },
        outboundMetadata: {
          meta_schema_ver: 'v2.1',
          tenant_id: 'acme_prod',
          source: 'order-processor',
          status_category: '5xx_server_error',
          duration_bucket: '250-500ms',
          error_signature: 'PG_ERR_POOL_SATURATION',
          diff_privacy_noise: '+0.012',
          sha256_proof: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        },
        justifications: [
          { field: 'email', action: 'REDACTED', rule: 'GDPR Art. 6 (Direct Identifiers)', justification: 'Raw customer email removed inside local eBPF memory boundary before serialization.' },
          { field: 'credit_card_mask', action: 'REDACTED', rule: 'PCI-DSS v4.0 Req 3.4', justification: 'PAN / Cardholder data strictly blocked from telemetry pipelines.' },
          { field: 'client_ip', action: 'MASKED', rule: 'GDPR Anonymization Standard', justification: 'Truncated to /16 prefix; zero individual location pinpointing possible.' },
          { field: 'auth_jwt', action: 'STRIPPED', rule: 'OWASP API Security Top 10', justification: 'Authorization headers stripped completely to prevent token replay leaks.' }
        ]
      },
      {
        id: 'PAYLOAD-99420',
        timestamp: '15:42:18.204 UTC',
        collectorId: 'col_acme_frankfurt_02',
        sourceType: 'DB Slow Query Log',
        rawFieldsCount: 19,
        redactedCount: 4,
        blockedCount: 0,
        status: 'TRANSMITTED',
        policy: 'STRICT_PCI_GDPR_ENCLAVE',
        rawSample: {
          query_id: 'qry_8812',
          raw_sql: "UPDATE users SET ssn = '000-12-3456' WHERE id = 42"
        },
        redactedSample: {
          query_id: 'qry_8812',
          raw_sql: '[REDACTED: SENSITIVE_COLUMNS - UPDATE users SET ssn = ? WHERE id = ?]'
        },
        outboundMetadata: {
          query_fingerprint: 'fp_a9821f',
          latency_ms: 142.1,
          rows_affected: 1,
          sha256_proof: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
        },
        justifications: [
          { field: 'raw_sql.ssn', action: 'REDACTED', rule: 'HIPAA § 164.514 / PII', justification: 'Government identifier completely tokenized and removed.' }
        ]
      }
    ];
  }

  initRemediations() {
    this.remediations = [
      {
        id: 'RUNBOOK-01',
        title: 'Dynamic Scale-Up Database Connection Pool',
        targetService: 'postgres-primary-01',
        reason: 'PostgreSQL connection pool saturated at 98/100 slots, causing 504 timeouts on order-processor.',
        action: 'Increase max_connections parameter from 100 to 250 and reload pgBouncer connection pooler.',
        expectedOutcome: 'Immediate alleviation of database thread starvation; order-processor latency expected to drop <30ms within 45s.',
        riskLevel: 'LOW',
        rollbackPlan: 'Revert pgBouncer max_connections to 100 and cycle idle client connections gracefully.',
        status: 'READY_FOR_APPROVAL',
        executionState: 'idle' // idle | executing | executed
      },
      {
        id: 'RUNBOOK-02',
        title: 'Failover Read Traffic to postgres-read-replica-01',
        targetService: 'order-processor',
        reason: 'Heavy read queries are degrading transactional checkout leader node.',
        action: 'Inject dynamic route rule to redirect non-mutating SELECT queries to read replica pool.',
        expectedOutcome: '60% reduction in primary database CPU load.',
        riskLevel: 'LOW',
        rollbackPlan: 'Remove replica split flag in Envoy mesh config.',
        status: 'READY_FOR_APPROVAL',
        executionState: 'idle'
      },
      {
        id: 'RUNBOOK-03',
        title: 'Restart Degraded order-processor Pod Instances',
        targetService: 'order-processor',
        reason: 'Stale connection threads stuck in wait state on exhausted socket.',
        action: 'Trigger rolling restart of order-processor deployment (4 replicas, 25% max-unavailable).',
        expectedOutcome: 'Cleans hung TCP handles and resets thread pool.',
        riskLevel: 'MEDIUM',
        rollbackPlan: 'Pause rollout if error rate rises >1%.',
        status: 'READY_FOR_APPROVAL',
        executionState: 'idle'
      },
      {
        id: 'RUNBOOK-04',
        title: 'Activate Ingress Rate Limit on /api/v1/checkout',
        targetService: 'api-gateway-core',
        reason: 'Prevent upstream client retry storms from overwhelming stabilizing database.',
        action: 'Enforce temporary token bucket limiter (2,000 req/s threshold) on checkout endpoints.',
        expectedOutcome: 'Prevents total infrastructure collapse during recovery phase.',
        riskLevel: 'LOW',
        rollbackPlan: 'Disable Envoy token bucket filter.',
        status: 'READY_FOR_APPROVAL',
        executionState: 'idle'
      },
      {
        id: 'RUNBOOK-05',
        title: 'Flush & Warm Redis Ephemeral Cache Namespace',
        targetService: 'redis-cluster-cache',
        reason: 'Clear fragmented keys and trigger proactive cache warmup.',
        action: 'Issue async UNLINK on stale keys and trigger prefetch worker.',
        expectedOutcome: 'Restores 99.4% cache hit ratio and relieves downstream Postgres reads.',
        riskLevel: 'LOW',
        rollbackPlan: 'Cache regenerates automatically on subsequent requests.',
        status: 'READY_FOR_APPROVAL',
        executionState: 'idle'
      }
    ];

    this.remediationAuditLog = [
      { id: 'ACT-901', time: '14:20:10 UTC', runbook: 'RUNBOOK-04', user: 'ops@sentinel.internal', status: 'SUCCESS', details: 'Applied rate limit on /auth endpoint' }
    ];
  }

  initRecentEvents() {
    this.recentEvents = [
      { timestamp: '15:42:19 UTC', type: 'METRIC_SPIKE', source: 'postgres-primary-01', severity: 'CRITICAL', description: 'Connection pool capacity exceeded 95% (98/100 active connections)' },
      { timestamp: '15:42:14 UTC', type: 'CASCADE_ERROR', source: 'order-processor', severity: 'CRITICAL', description: 'Upstream HTTP 504 Gateway Timeout rate spiked to 8.42%' },
      { timestamp: '15:42:01 UTC', type: 'AI_DETECTION', source: 'SENTINEL Engine', severity: 'WARNING', description: 'Root cause confidence 94% isolated lock contention on transactions table' },
      { timestamp: '15:41:40 UTC', type: 'PRIVACY_AUDIT', source: 'col_acme_mumbai_01', severity: 'INFO', description: 'Redacted 6 PII fields from inbound HTTP checkout telemetry payload' },
      { timestamp: '15:40:12 UTC', type: 'HEARTBEAT', source: 'col_acme_frankfurt_02', severity: 'INFO', description: 'Local eBPF collector heartbeat nominal. Zero egress leak verified.' },
      { timestamp: '15:38:55 UTC', type: 'CACHE_STATS', source: 'redis-cluster-cache', severity: 'INFO', description: 'Cache hit ratio nominal at 98.8% (9,800 req/s throughput)' }
    ];
  }

  initHistoricalBuffer() {
    // Generate initial 60 seconds of realistic telemetry history
    const now = Date.now();
    for (let i = 59; i >= 0; i--) {
      const t = new Date(now - i * 1000);
      const timeStr = t.toISOString().substring(11, 19);
      
      const isIncidentWindow = (i < 20); // Last 20 seconds elevated
      const cpuVal = isIncidentWindow ? (82 + Math.sin(i * 0.4) * 8) : (46 + Math.sin(i * 0.2) * 4);
      const memVal = isIncidentWindow ? (78 + Math.sin(i * 0.3) * 4) : (61 + Math.sin(i * 0.1) * 3);
      const rpsVal = Math.round(12400 + Math.sin(i * 0.25) * 800);
      const latVal = isIncidentWindow ? (180 + Math.sin(i * 0.5) * 45) : (24.2 + Math.sin(i * 0.3) * 3.5);
      const errVal = isIncidentWindow ? (4.2 + Math.sin(i * 0.4) * 1.8) : 0.03;

      this.history.timestamps.push(timeStr);
      this.history.cpu.push(Math.round(cpuVal * 10) / 10);
      this.history.memory.push(Math.round(memVal * 10) / 10);
      this.history.rps.push(rpsVal);
      this.history.latency.push(Math.round(latVal * 10) / 10);
      this.history.errorRate.push(Math.round(errVal * 100) / 100);
      this.history.networkIO.push(Math.round((14.2 + Math.sin(i * 0.3) * 1.5) * 10) / 10);
    }
  }

  // --- 1 Hz Central Telemetry Engine Tick ---
  startTicker() {
    setInterval(() => {
      this.tick();
    }, 1000);
  }

  tick() {
    this.tickCount++;

    // Telemetry natural drift
    const drift = (this.prng() - 0.5);

    // Apply Scenario-specific mutations
    if (this.activeScenario === 'db_saturation') {
      const pg = this.nodesMap.get('node-pg-primary');
      if (pg) {
        pg.status = 'critical';
        pg.cpu = Math.min(99, Math.max(92, Math.round(pg.cpu + drift * 2)));
        pg.latency = Math.round(280 + this.prng() * 40);
        pg.errorRate = Math.round((8.2 + this.prng() * 1.5) * 10) / 10;
        pg.dbPoolUsage = '98 / 100 conns';
      }
      const ord = this.nodesMap.get('node-order-svc');
      if (ord) {
        ord.status = 'warning';
        ord.latency = Math.round(84 + this.prng() * 15);
        ord.errorRate = Math.round((2.1 + this.prng() * 0.6) * 10) / 10;
      }
      this.globalMetrics.systemHealth = 94.2;
      this.globalMetrics.activeIncidentsCount = 1;
      this.globalMetrics.meanResponseTimeMs = Math.round((84.2 + drift * 4) * 10) / 10;
    } else if (this.activeScenario === 'api_latency') {
      const gw = this.nodesMap.get('node-api-gw');
      if (gw) {
        gw.status = 'critical';
        gw.latency = Math.round(480 + this.prng() * 90);
        gw.errorRate = Math.round((6.4 + this.prng() * 2) * 10) / 10;
      }
      this.globalMetrics.systemHealth = 92.8;
      this.globalMetrics.meanResponseTimeMs = 142.0;
    } else if (this.activeScenario === 'memory_leak') {
      const auth = this.nodesMap.get('node-auth-svc');
      if (auth) {
        auth.status = 'critical';
        auth.memory = Math.min(98, auth.memory + 0.8);
        auth.latency = Math.round(140 + this.prng() * 30);
      }
      this.globalMetrics.systemHealth = 95.1;
    } else if (this.activeScenario === 'collector_offline') {
      const col = this.nodesMap.get('node-col-01');
      if (col) {
        col.status = 'offline';
        col.bufferUtilization = '100% (LOCAL ENCLAVE BACKPRESSURE)';
      }
      this.globalMetrics.collectorsOnline = 2;
      this.globalMetrics.systemHealth = 96.4;
    } else {
      // Nominal stable state
      this.nodes.forEach(n => {
        if (n.id !== 'node-pg-primary' && n.id !== 'node-order-svc') {
          n.cpu = Math.min(95, Math.max(10, Math.round(n.cpu + (this.prng() - 0.5) * 1.5)));
          n.memory = Math.min(95, Math.max(20, Math.round(n.memory + (this.prng() - 0.5) * 0.8)));
          n.latency = Math.max(1.0, Math.round((n.latency + (this.prng() - 0.5) * 0.6) * 10) / 10);
        }
      });
      this.globalMetrics.systemHealth = 99.84;
      this.globalMetrics.meanResponseTimeMs = Math.round((24.6 + drift * 1.2) * 10) / 10;
      this.globalMetrics.totalRPS = Math.round(12840 + drift * 240);
    }

    // Update history timeseries
    const now = new Date();
    const timeStr = now.toISOString().substring(11, 19);

    this.history.timestamps.shift();
    this.history.timestamps.push(timeStr);

    const latestCpu = Math.round((this.activeScenario ? 84 : 48) + this.prng() * 4);
    const latestMem = Math.round((this.activeScenario ? 79 : 62) + this.prng() * 3);
    const latestRps = Math.round(this.globalMetrics.totalRPS);
    const latestLat = Math.round(this.globalMetrics.meanResponseTimeMs * 10) / 10;
    const latestErr = Math.round((this.activeScenario ? 4.8 : 0.04) * 100) / 100;

    this.history.cpu.shift(); this.history.cpu.push(latestCpu);
    this.history.memory.shift(); this.history.memory.push(latestMem);
    this.history.rps.shift(); this.history.rps.push(latestRps);
    this.history.latency.shift(); this.history.latency.push(latestLat);
    this.history.errorRate.shift(); this.history.errorRate.push(latestErr);
    this.history.networkIO.shift(); this.history.networkIO.push(Math.round((14.8 + drift * 0.4) * 10) / 10);

    // Notify all UI subscribers
    this.notifyListeners();
  }

  // --- Scenario Simulator Actions ---
  triggerScenario(scenarioKey) {
    this.activeScenario = scenarioKey;
    console.log(`[SENTINEL Telemetry] Activated Chaos Scenario: ${scenarioKey}`);

    // Update corresponding incidents
    if (scenarioKey === 'db_saturation') {
      const inc = this.incidents.find(i => i.id === 'INC-1042');
      if (inc) inc.status = 'ACTIVE';
      this.activeIncidentId = 'INC-1042';
    }

    // Add a live recent event
    this.recentEvents.unshift({
      timestamp: new Date().toISOString().substring(11, 19) + ' UTC',
      type: 'SIMULATION_FAULT',
      source: 'Chaos Simulator',
      severity: 'CRITICAL',
      description: `Injected synthetic failure: ${scenarioKey.toUpperCase().replace('_', ' ')}`
    });
    if (this.recentEvents.length > 20) this.recentEvents.pop();

    this.notifyListeners();
  }

  resetScenario() {
    this.activeScenario = null;
    console.log('[SENTINEL Telemetry] Reset all scenarios to nominal baseline.');

    // Reset nodes to nominal health
    this.nodes.forEach(n => {
      n.status = 'healthy';
      if (n.id === 'node-pg-primary') {
        n.cpu = 48;
        n.latency = 14.2;
        n.errorRate = 0.01;
        n.dbPoolUsage = '24 / 100 conns';
      }
      if (n.id === 'node-order-svc') {
        n.cpu = 42;
        n.latency = 18.4;
        n.errorRate = 0.02;
      }
      if (n.id === 'node-col-01') {
        n.status = 'healthy';
        n.bufferUtilization = '24%';
      }
    });

    const inc = this.incidents.find(i => i.id === 'INC-1042');
    if (inc) inc.status = 'RESOLVED';

    this.globalMetrics.systemHealth = 99.84;
    this.globalMetrics.activeIncidentsCount = 0;
    this.globalMetrics.meanResponseTimeMs = 24.6;
    this.globalMetrics.collectorsOnline = 3;

    this.recentEvents.unshift({
      timestamp: new Date().toISOString().substring(11, 19) + ' UTC',
      type: 'SIMULATION_RESET',
      source: 'Chaos Simulator',
      severity: 'INFO',
      description: 'System restored to nominal operational baseline. All chaos faults cleared.'
    });

    this.notifyListeners();
  }

  // --- Remediation Execution ---
  executeRemediation(runbookId) {
    const rb = this.remediations.find(r => r.id === runbookId);
    if (!rb) return false;

    rb.executionState = 'executing';
    this.notifyListeners();

    setTimeout(() => {
      rb.executionState = 'executed';
      rb.status = 'APPLIED_SUCCESSFULLY';

      // Heal system if database runbook was executed
      if (runbookId === 'RUNBOOK-01' || runbookId === 'RUNBOOK-02') {
        const pg = this.nodesMap.get('node-pg-primary');
        if (pg) {
          pg.status = 'healthy';
          pg.cpu = 44;
          pg.latency = 16.1;
          pg.errorRate = 0.02;
          pg.dbPoolUsage = '32 / 250 conns (SCALED)';
        }
        const ord = this.nodesMap.get('node-order-svc');
        if (ord) {
          ord.status = 'healthy';
          ord.latency = 19.4;
          ord.errorRate = 0.01;
        }
        const inc = this.incidents.find(i => i.id === 'INC-1042');
        if (inc) inc.status = 'RESOLVED';
        this.globalMetrics.systemHealth = 99.88;
        this.globalMetrics.activeIncidentsCount = 0;
      }

      this.remediationAuditLog.unshift({
        id: `ACT-${Math.floor(100 + Math.random() * 900)}`,
        time: new Date().toISOString().substring(11, 19) + ' UTC',
        runbook: rb.id,
        user: 'ops@sentinel.internal',
        status: 'SUCCESS',
        details: `Simulated operational execution: ${rb.title}`
      });

      this.recentEvents.unshift({
        timestamp: new Date().toISOString().substring(11, 19) + ' UTC',
        type: 'REMEDIATION_APPLIED',
        source: 'Automated Playbook',
        severity: 'INFO',
        description: `Successfully applied ${rb.title} on ${rb.targetService}`
      });

      this.notifyListeners();
    }, 1200);

    return true;
  }

  // --- Subscriber Management ---
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(fn => {
      try {
        fn(this);
      } catch (err) {
        console.error('[SENTINEL Telemetry] Error in subscriber callback:', err);
      }
    });
  }
}

// Global Singleton Store Instance
window.telemetryStore = new SentinelTelemetryStore();
