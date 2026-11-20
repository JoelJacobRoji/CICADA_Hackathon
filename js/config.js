/**
 * SENTINEL AI - Configuration & Infrastructure Topology
 * Defines the 6 Cyber Districts, 24 Monitored Nodes, Connections, Telemetry Ranges, and Scenarios
 */

const SENTINEL_CONFIG = {
  version: '2.4.0-TACTICAL',
  gridSize: { cols: 18, rows: 18 },
  isoTileWidth: 120,
  isoTileHeight: 60,

  colors: {
    bg: '#05070c',
    bgDark: '#020306',
    gridLines: 'rgba(0, 243, 255, 0.08)',
    gridHighlight: 'rgba(0, 243, 255, 0.25)',
    circuitRoads: 'rgba(0, 243, 255, 0.15)',
    roadGlow: 'rgba(0, 243, 255, 0.4)',
    
    // Health States
    healthy: '#00f3ff',       // Cyan / Turquoise
    healthyGlow: 'rgba(0, 243, 255, 0.6)',
    healthyFill: 'rgba(0, 243, 255, 0.15)',
    
    warning: '#ffaa00',       // Amber / Orange
    warningGlow: 'rgba(255, 170, 0, 0.7)',
    warningFill: 'rgba(255, 170, 0, 0.2)',
    
    critical: '#ff0055',      // Hot Pink / Neon Red
    criticalGlow: 'rgba(255, 0, 85, 0.85)',
    criticalFill: 'rgba(255, 0, 85, 0.3)',
    
    offline: '#4a5568',       // Dim desaturated
    offlineGlow: 'rgba(74, 85, 104, 0.3)',
    
    aiAnalysis: '#bd00ff',    // Violet / Purple
    aiGlow: 'rgba(189, 0, 255, 0.7)',
    
    privacyShield: '#00ffaa', // Emerald / Neon Green for Privacy Enclave
    privacyGlow: 'rgba(0, 255, 170, 0.7)'
  },

  districts: {
    APPLICATION: {
      id: 'APPLICATION',
      name: 'Application District',
      shortName: 'APP',
      color: '#00f3ff',
      description: 'Core microservices, ingress gateways, and application runtime orchestration.',
      center: { col: 4, row: 4 }
    },
    DATABASE: {
      id: 'DATABASE',
      name: 'Database District',
      shortName: 'DB',
      color: '#00b4d8',
      description: 'Persistent relational clusters, in-memory caches, and telemetry time-series storage.',
      center: { col: 12, row: 4 }
    },
    NETWORK: {
      id: 'NETWORK',
      name: 'Network District',
      shortName: 'NET',
      color: '#ffaa00',
      description: 'High-speed edge routing, service mesh proxies, and global DNS mesh.',
      center: { col: 4, row: 11 }
    },
    SECURITY: {
      id: 'SECURITY',
      name: 'Security District',
      shortName: 'SEC',
      color: '#ff0055',
      description: 'Zero-trust perimeter, WAF firewalls, behavioral anomaly monitors, and cryptographic vaults.',
      center: { col: 12, row: 11 }
    },
    CLOUD: {
      id: 'CLOUD',
      name: 'Cloud District',
      shortName: 'CLOUD',
      color: '#bd00ff',
      description: 'External cloud services, data lakes, object storage, and SaaS integrations.',
      center: { col: 13, row: 14 }
    },
    LOCAL_COLLECTOR: {
      id: 'LOCAL_COLLECTOR',
      name: 'Local Collector District',
      shortName: 'LOCAL',
      color: '#00ffaa',
      description: 'Privacy-first on-prem eBPF agent with local PII redaction and zero-knowledge encryption.',
      center: { col: 7, row: 9 }
    }
  },

  nodes: [
    // === APPLICATION DISTRICT ===
    {
      id: 'api-gateway',
      name: 'API Gateway Ingress',
      district: 'APPLICATION',
      type: 'Ingress Router',
      tier: 'Tier 0 (Critical)',
      gridX: 3,
      gridY: 3,
      buildingStyle: 'skyscraper',
      width: 1.2,
      depth: 1.2,
      height: 140,
      windowColor: '#00f3ff',
      roofStyle: 'antenna-array',
      status: 'healthy',
      metrics: {
        cpu: 48,
        memory: 62,
        throughput: 8450, // req/sec
        latency: 18,      // ms
        errorRate: 0.02,  // %
        uptime: 99.99
      },
      tags: ['nginx', 'ingress', 'ssl-termination'],
      dependencies: ['auth-service', 'checkout-service', 'mesh-proxy-istio']
    },
    {
      id: 'auth-service',
      name: 'Auth & Identity v3',
      district: 'APPLICATION',
      type: 'Microservice',
      tier: 'Tier 0 (Critical)',
      gridX: 2,
      gridY: 5,
      buildingStyle: 'tower',
      width: 1.0,
      depth: 1.0,
      height: 110,
      windowColor: '#00f3ff',
      roofStyle: 'hologram-pad',
      status: 'healthy',
      metrics: {
        cpu: 39,
        memory: 54,
        throughput: 3200,
        latency: 24,
        errorRate: 0.01,
        uptime: 99.98
      },
      tags: ['oauth2', 'jwt', 'go-runtime'],
      dependencies: ['redis-cache', 'vault-secrets']
    },
    {
      id: 'checkout-service',
      name: 'Checkout & Cart Engine',
      district: 'APPLICATION',
      type: 'Microservice',
      tier: 'Tier 1 (High)',
      gridX: 5,
      gridY: 3,
      buildingStyle: 'stepped-tower',
      width: 1.1,
      depth: 1.1,
      height: 125,
      windowColor: '#00f3ff',
      roofStyle: 'helipad',
      status: 'healthy',
      metrics: {
        cpu: 58,
        memory: 71,
        throughput: 4100,
        latency: 32,
        errorRate: 0.04,
        uptime: 99.95
      },
      tags: ['checkout', 'cart', 'node-runtime'],
      dependencies: ['billing-service', 'redis-cache']
    },
    {
      id: 'billing-service',
      name: 'Billing & Ledger Core',
      district: 'APPLICATION',
      type: 'Microservice',
      tier: 'Tier 0 (Critical)',
      gridX: 5,
      gridY: 5,
      buildingStyle: 'tower',
      width: 1.0,
      depth: 1.0,
      height: 105,
      windowColor: '#00f3ff',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 44,
        memory: 58,
        throughput: 1850,
        latency: 42,
        errorRate: 0.01,
        uptime: 99.99
      },
      tags: ['ledger', 'pci-dss', 'rust-service'],
      dependencies: ['postgres-primary', 'kafka-broker']
    },
    {
      id: 'notification-svc',
      name: 'Event Notification Broker',
      district: 'APPLICATION',
      type: 'Microservice',
      tier: 'Tier 2 (Medium)',
      gridX: 3,
      gridY: 6,
      buildingStyle: 'pod',
      width: 0.9,
      depth: 0.9,
      height: 75,
      windowColor: '#00f3ff',
      roofStyle: 'flat',
      status: 'healthy',
      metrics: {
        cpu: 28,
        memory: 42,
        throughput: 950,
        latency: 14,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['smtp', 'push', 'async-queue'],
      dependencies: ['kafka-broker']
    },

    // === DATABASE DISTRICT ===
    {
      id: 'postgres-primary',
      name: 'PostgreSQL Primary Cluster',
      district: 'DATABASE',
      type: 'Relational DB',
      tier: 'Tier 0 (Critical)',
      gridX: 11,
      gridY: 3,
      buildingStyle: 'fortress-bunker',
      width: 1.4,
      depth: 1.4,
      height: 95,
      windowColor: '#00b4d8',
      roofStyle: 'quantum-core',
      status: 'healthy',
      metrics: {
        cpu: 64,
        memory: 78,
        throughput: 12400, // iops
        latency: 12,       // ms
        errorRate: 0.00,
        uptime: 99.999
      },
      tags: ['postgresql-16', 'patroni', 'ha-cluster'],
      dependencies: ['postgres-replica', 'aws-s3-lake']
    },
    {
      id: 'postgres-replica',
      name: 'PostgreSQL Read Replica 01',
      district: 'DATABASE',
      type: 'Relational DB',
      tier: 'Tier 1 (High)',
      gridX: 13,
      gridY: 3,
      buildingStyle: 'bunker',
      width: 1.1,
      depth: 1.1,
      height: 80,
      windowColor: '#00b4d8',
      roofStyle: 'flat',
      status: 'healthy',
      metrics: {
        cpu: 45,
        memory: 66,
        throughput: 8100,
        latency: 14,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['postgresql-read', 'streaming-repl'],
      dependencies: []
    },
    {
      id: 'redis-cache',
      name: 'Redis Cluster L1/L2',
      district: 'DATABASE',
      type: 'In-Memory Cache',
      tier: 'Tier 1 (High)',
      gridX: 11,
      gridY: 5,
      buildingStyle: 'cylinder-pod',
      width: 1.1,
      depth: 1.1,
      height: 85,
      windowColor: '#00f3ff',
      roofStyle: 'glowing-disc',
      status: 'healthy',
      metrics: {
        cpu: 31,
        memory: 82,
        throughput: 29500,
        latency: 2.1,
        errorRate: 0.00,
        uptime: 99.999
      },
      tags: ['redis-cluster', 'sub-millisecond', 'ram-backed'],
      dependencies: []
    },
    {
      id: 'timescale-telemetry',
      name: 'TimescaleDB Metrics Core',
      district: 'DATABASE',
      type: 'Time-Series DB',
      tier: 'Tier 1 (High)',
      gridX: 13,
      gridY: 5,
      buildingStyle: 'tower',
      width: 1.0,
      depth: 1.0,
      height: 90,
      windowColor: '#00b4d8',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 52,
        memory: 64,
        throughput: 16800,
        latency: 8.5,
        errorRate: 0.01,
        uptime: 99.97
      },
      tags: ['hypertables', 'telemetry', 'analytics'],
      dependencies: []
    },
    {
      id: 'kafka-broker',
      name: 'Kafka Event Mesh',
      district: 'DATABASE',
      type: 'Message Streaming',
      tier: 'Tier 0 (Critical)',
      gridX: 12,
      gridY: 7,
      buildingStyle: 'stepped-tower',
      width: 1.2,
      depth: 1.2,
      height: 100,
      windowColor: '#ffaa00',
      roofStyle: 'antenna-array',
      status: 'healthy',
      metrics: {
        cpu: 41,
        memory: 73,
        throughput: 45000,
        latency: 4.8,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['event-bus', 'partition-mesh', 'pub-sub'],
      dependencies: ['timescale-telemetry']
    },

    // === NETWORK DISTRICT ===
    {
      id: 'edge-router-alpha',
      name: 'Edge Gateway Alpha',
      district: 'NETWORK',
      type: 'Hardware Border Router',
      tier: 'Tier 0 (Critical)',
      gridX: 3,
      gridY: 10,
      buildingStyle: 'comm-tower',
      width: 1.3,
      depth: 1.3,
      height: 130,
      windowColor: '#ffaa00',
      roofStyle: 'spinning-radar',
      status: 'healthy',
      metrics: {
        cpu: 36,
        memory: 48,
        throughput: 94000, // pkts/sec
        latency: 4.2,
        errorRate: 0.001,
        uptime: 99.999
      },
      tags: ['bgp', 'anycast', '100gbe'],
      dependencies: ['waf-sentinel', 'dns-resolver']
    },
    {
      id: 'mesh-proxy-istio',
      name: 'Istio Service Mesh Control',
      district: 'NETWORK',
      type: 'Service Mesh',
      tier: 'Tier 1 (High)',
      gridX: 5,
      gridY: 11,
      buildingStyle: 'tower',
      width: 1.0,
      depth: 1.0,
      height: 95,
      windowColor: '#00f3ff',
      roofStyle: 'hologram-pad',
      status: 'healthy',
      metrics: {
        cpu: 42,
        memory: 55,
        throughput: 18500,
        latency: 6.4,
        errorRate: 0.01,
        uptime: 99.98
      },
      tags: ['envoy', 'mtls', 'traffic-shaping'],
      dependencies: ['api-gateway', 'auth-service']
    },
    {
      id: 'dns-resolver',
      name: 'Global Anycast DNS',
      district: 'NETWORK',
      type: 'DNS Infrastructure',
      tier: 'Tier 0 (Critical)',
      gridX: 2,
      gridY: 12,
      buildingStyle: 'pod',
      width: 0.9,
      depth: 0.9,
      height: 70,
      windowColor: '#ffaa00',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 22,
        memory: 34,
        throughput: 12000,
        latency: 3.1,
        errorRate: 0.00,
        uptime: 100.0
      },
      tags: ['coredns', 'dnssec', 'anycast'],
      dependencies: []
    },
    {
      id: 'cdn-origin-shield',
      name: 'CDN Edge Shield',
      district: 'NETWORK',
      type: 'Cache Shield',
      tier: 'Tier 1 (High)',
      gridX: 4,
      gridY: 13,
      buildingStyle: 'bunker',
      width: 1.1,
      depth: 1.1,
      height: 75,
      windowColor: '#00f3ff',
      roofStyle: 'flat',
      status: 'healthy',
      metrics: {
        cpu: 29,
        memory: 61,
        throughput: 38000,
        latency: 5.5,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['edge-cache', 'gzip-br', 'origin-protect'],
      dependencies: ['edge-router-alpha']
    },

    // === SECURITY DISTRICT ===
    {
      id: 'waf-sentinel',
      name: 'WAF & DDoS Defense Citadel',
      district: 'SECURITY',
      type: 'Perimeter Firewall',
      tier: 'Tier 0 (Critical)',
      gridX: 11,
      gridY: 10,
      buildingStyle: 'citadel-fortress',
      width: 1.4,
      depth: 1.4,
      height: 120,
      windowColor: '#ff0055',
      roofStyle: 'shield-dome',
      status: 'healthy',
      metrics: {
        cpu: 44,
        memory: 59,
        throughput: 52000,
        latency: 3.8,
        errorRate: 0.00,
        uptime: 99.999
      },
      tags: ['layer7-waf', 'ebpf-filter', 'rate-limiter'],
      dependencies: ['api-gateway', 'anomaly-engine']
    },
    {
      id: 'anomaly-engine',
      name: 'AI Threat Intelligence Core',
      district: 'SECURITY',
      type: 'Neural ML Engine',
      tier: 'Tier 1 (High)',
      gridX: 13,
      gridY: 11,
      buildingStyle: 'quantum-pyramid',
      width: 1.1,
      depth: 1.1,
      height: 105,
      windowColor: '#bd00ff',
      roofStyle: 'quantum-core',
      status: 'healthy',
      metrics: {
        cpu: 68,
        memory: 76,
        throughput: 8400,
        latency: 16.0,
        errorRate: 0.00,
        uptime: 99.95
      },
      tags: ['unsupervised-ml', 'zero-day', 'telemetry-eval'],
      dependencies: ['siem-correlator']
    },
    {
      id: 'siem-correlator',
      name: 'Security Incident Correlator',
      district: 'SECURITY',
      type: 'SIEM Analyzer',
      tier: 'Tier 1 (High)',
      gridX: 12,
      gridY: 13,
      buildingStyle: 'tower',
      width: 1.0,
      depth: 1.0,
      height: 90,
      windowColor: '#ff0055',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 51,
        memory: 63,
        throughput: 14200,
        latency: 22.0,
        errorRate: 0.01,
        uptime: 99.98
      },
      tags: ['audit-log', 'compliance', 'mitre-attack'],
      dependencies: ['timescale-telemetry']
    },
    {
      id: 'vault-secrets',
      name: 'HSM Cryptographic Vault',
      district: 'SECURITY',
      type: 'Key Vault',
      tier: 'Tier 0 (Critical)',
      gridX: 10,
      gridY: 12,
      buildingStyle: 'bunker',
      width: 1.0,
      depth: 1.0,
      height: 70,
      windowColor: '#00ffaa',
      roofStyle: 'shield-dome',
      status: 'healthy',
      metrics: {
        cpu: 18,
        memory: 32,
        throughput: 3100,
        latency: 2.2,
        errorRate: 0.00,
        uptime: 100.0
      },
      tags: ['fips-140-3', 'pkcs11', 'zero-trust'],
      dependencies: []
    },

    // === CLOUD DISTRICT ===
    {
      id: 'aws-s3-lake',
      name: 'Cloud Data Lake (S3)',
      district: 'CLOUD',
      type: 'Object Storage',
      tier: 'Tier 2 (Medium)',
      gridX: 13,
      gridY: 15,
      buildingStyle: 'cloud-platform',
      width: 1.3,
      depth: 1.3,
      height: 60,
      windowColor: '#bd00ff',
      roofStyle: 'cloud-hologram',
      status: 'healthy',
      metrics: {
        cpu: 25,
        memory: 40,
        throughput: 6200,
        latency: 35.0,
        errorRate: 0.00,
        uptime: 99.999
      },
      tags: ['aws', 'parquet', 'iceberg'],
      dependencies: []
    },
    {
      id: 'gcp-bigquery',
      name: 'GCP Analytics Warehouse',
      district: 'CLOUD',
      type: 'Cloud Analytics',
      tier: 'Tier 2 (Medium)',
      gridX: 15,
      gridY: 14,
      buildingStyle: 'cloud-platform',
      width: 1.2,
      depth: 1.2,
      height: 65,
      windowColor: '#bd00ff',
      roofStyle: 'hologram-pad',
      status: 'healthy',
      metrics: {
        cpu: 34,
        memory: 48,
        throughput: 4100,
        latency: 48.0,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['olap', 'serverless', 'streaming-insert'],
      dependencies: []
    },
    {
      id: 'saas-egress-gw',
      name: 'SaaS Egress Firewall',
      district: 'CLOUD',
      type: 'Cloud Egress Gate',
      tier: 'Tier 1 (High)',
      gridX: 11,
      gridY: 15,
      buildingStyle: 'tower',
      width: 0.9,
      depth: 0.9,
      height: 80,
      windowColor: '#00f3ff',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 31,
        memory: 42,
        throughput: 5800,
        latency: 28.0,
        errorRate: 0.00,
        uptime: 99.98
      },
      tags: ['egress-filter', 'mtls-cloud', 'zero-leak'],
      dependencies: ['privacy-redaction-enclave']
    },

    // === LOCAL COLLECTOR DISTRICT (PRIVACY FIRST LAYER) ===
    {
      id: 'sentinel-local-agent',
      name: 'SENTINEL Local Telemetry Agent',
      district: 'LOCAL_COLLECTOR',
      type: 'Privacy Sentinel Node',
      tier: 'Tier 0 (Core)',
      gridX: 7,
      gridY: 8,
      buildingStyle: 'privacy-citadel',
      width: 1.6,
      depth: 1.6,
      height: 120,
      windowColor: '#00ffaa',
      roofStyle: 'hologram-pad',
      status: 'healthy',
      metrics: {
        cpu: 18,
        memory: 34,
        throughput: 142800, // metrics/sec
        latency: 1.2,       // ms ultra fast local
        errorRate: 0.00,
        uptime: 100.0,
        egressBlocked: 0,
        sanitizedFields: 1420912
      },
      tags: ['privacy-first', 'zero-egress-leak', 'local-kernel'],
      dependencies: ['ebpf-probe-node', 'privacy-redaction-enclave', 'zk-hasher-node']
    },
    {
      id: 'ebpf-probe-node',
      name: 'eBPF Kernel Telemetry Probe',
      district: 'LOCAL_COLLECTOR',
      type: 'Kernel Collector',
      tier: 'Tier 0 (Core)',
      gridX: 6,
      gridY: 10,
      buildingStyle: 'pod',
      width: 0.9,
      depth: 0.9,
      height: 75,
      windowColor: '#00ffaa',
      roofStyle: 'beacon',
      status: 'healthy',
      metrics: {
        cpu: 6,
        memory: 18,
        throughput: 88000,
        latency: 0.4,
        errorRate: 0.00,
        uptime: 100.0
      },
      tags: ['kernel-ring-buffer', 'zero-copy', 'kprobe'],
      dependencies: ['sentinel-local-agent']
    },
    {
      id: 'privacy-redaction-enclave',
      name: 'Zero-Knowledge Redaction Enclave',
      district: 'LOCAL_COLLECTOR',
      type: 'Privacy Enclave',
      tier: 'Tier 0 (Core)',
      gridX: 8,
      gridY: 10,
      buildingStyle: 'stepped-tower',
      width: 1.1,
      depth: 1.1,
      height: 95,
      windowColor: '#00ffaa',
      roofStyle: 'shield-dome',
      status: 'healthy',
      metrics: {
        cpu: 24,
        memory: 42,
        throughput: 62000,
        latency: 1.8,
        errorRate: 0.00,
        uptime: 100.0,
        piiScrubbed: 39481
      },
      tags: ['differential-privacy', 'sha3-256', 'memory-enclave'],
      dependencies: ['sentinel-local-agent', 'timescale-telemetry']
    },
    {
      id: 'zk-hasher-node',
      name: 'ZK Telemetry Proof Generator',
      district: 'LOCAL_COLLECTOR',
      type: 'Cryptographic Prover',
      tier: 'Tier 1 (High)',
      gridX: 9,
      gridY: 8,
      buildingStyle: 'quantum-pyramid',
      width: 1.0,
      depth: 1.0,
      height: 85,
      windowColor: '#00ffaa',
      roofStyle: 'quantum-core',
      status: 'healthy',
      metrics: {
        cpu: 38,
        memory: 52,
        throughput: 12000,
        latency: 4.5,
        errorRate: 0.00,
        uptime: 99.99
      },
      tags: ['zk-snark', 'cryptographic-audit', 'tamper-proof'],
      dependencies: ['sentinel-local-agent']
    }
  ],

  // Data Highway Pathways (Arterials connecting infrastructure)
  connections: [
    // App to App
    { from: 'api-gateway', to: 'auth-service', bandwidth: 80, latency: 18, health: 'healthy', particles: 12 },
    { from: 'api-gateway', to: 'checkout-service', bandwidth: 95, latency: 22, health: 'healthy', particles: 15 },
    { from: 'checkout-service', to: 'billing-service', bandwidth: 70, latency: 32, health: 'healthy', particles: 10 },
    { from: 'billing-service', to: 'notification-svc', bandwidth: 40, latency: 14, health: 'healthy', particles: 6 },
    
    // App to Database (Arterial conduits)
    { from: 'billing-service', to: 'postgres-primary', bandwidth: 90, latency: 42, health: 'healthy', particles: 14, isArterial: true },
    { from: 'checkout-service', to: 'redis-cache', bandwidth: 85, latency: 2.1, health: 'healthy', particles: 14 },
    { from: 'auth-service', to: 'redis-cache', bandwidth: 75, latency: 2.5, health: 'healthy', particles: 10 },
    { from: 'postgres-primary', to: 'postgres-replica', bandwidth: 60, latency: 14, health: 'healthy', particles: 8 },
    { from: 'billing-service', to: 'kafka-broker', bandwidth: 65, latency: 4.8, health: 'healthy', particles: 9 },

    // Network to App & Security
    { from: 'edge-router-alpha', to: 'waf-sentinel', bandwidth: 100, latency: 4.2, health: 'healthy', particles: 18, isArterial: true },
    { from: 'waf-sentinel', to: 'api-gateway', bandwidth: 95, latency: 6.8, health: 'healthy', particles: 16, isArterial: true },
    { from: 'edge-router-alpha', to: 'dns-resolver', bandwidth: 50, latency: 3.1, health: 'healthy', particles: 8 },
    { from: 'cdn-origin-shield', to: 'edge-router-alpha', bandwidth: 75, latency: 5.5, health: 'healthy', particles: 11 },
    { from: 'mesh-proxy-istio', to: 'api-gateway', bandwidth: 80, latency: 6.4, health: 'healthy', particles: 10 },
    
    // Security to Core
    { from: 'waf-sentinel', to: 'anomaly-engine', bandwidth: 70, latency: 8.2, health: 'healthy', particles: 9 },
    { from: 'anomaly-engine', to: 'siem-correlator', bandwidth: 55, latency: 16.0, health: 'healthy', particles: 7 },
    { from: 'auth-service', to: 'vault-secrets', bandwidth: 45, latency: 2.2, health: 'healthy', particles: 5 },

    // Local Collector Hub (Privacy Enclave to everything)
    { from: 'ebpf-probe-node', to: 'sentinel-local-agent', bandwidth: 95, latency: 0.4, health: 'healthy', particles: 16, isPrivacyChannel: true },
    { from: 'sentinel-local-agent', to: 'privacy-redaction-enclave', bandwidth: 90, latency: 1.2, health: 'healthy', particles: 14, isPrivacyChannel: true },
    { from: 'privacy-redaction-enclave', to: 'zk-hasher-node', bandwidth: 80, latency: 1.8, health: 'healthy', particles: 10, isPrivacyChannel: true },
    { from: 'privacy-redaction-enclave', to: 'timescale-telemetry', bandwidth: 85, latency: 4.5, health: 'healthy', particles: 12, isPrivacyChannel: true },
    { from: 'privacy-redaction-enclave', to: 'saas-egress-gw', bandwidth: 50, latency: 28.0, health: 'healthy', particles: 6, isPrivacyChannel: true },

    // Cloud links
    { from: 'postgres-primary', to: 'aws-s3-lake', bandwidth: 50, latency: 35.0, health: 'healthy', particles: 6 },
    { from: 'timescale-telemetry', to: 'gcp-bigquery', bandwidth: 55, latency: 48.0, health: 'healthy', particles: 7 }
  ],

  // Incident Scenarios for Interactive Simulation
  scenarios: [
    {
      id: 'db-latency-spike',
      title: 'Database Latency Spike & Pool Starvation',
      district: 'DATABASE',
      sourceNode: 'postgres-primary',
      severity: 'critical',
      description: 'Postgres query buffer lock contention causes latency spike to 2,850ms, starving connection pools in Billing and Checkout microservices.',
      impactedNodes: [
        { id: 'postgres-primary', status: 'critical', metricChanges: { latency: 2850, cpu: 94, errorRate: 14.8 } },
        { id: 'billing-service', status: 'critical', metricChanges: { latency: 3120, cpu: 89, errorRate: 22.4 } },
        { id: 'checkout-service', status: 'warning', metricChanges: { latency: 890, cpu: 78, errorRate: 6.2 } },
        { id: 'api-gateway', status: 'warning', metricChanges: { latency: 450, errorRate: 4.1 } }
      ],
      impactedConnections: [
        { from: 'billing-service', to: 'postgres-primary', health: 'critical', latency: 2850 },
        { from: 'checkout-service', to: 'billing-service', health: 'warning', latency: 890 },
        { from: 'api-gateway', to: 'checkout-service', health: 'warning', latency: 450 }
      ],
      aiDiagnosis: {
        rootCause: 'Connection pool starvation on postgres-primary caused by unindexed analytical join query on billing_ledger_v2 running without query timeout.',
        confidence: 98.4,
        blastRadius: '4 Services (12% of Total Fleet)',
        privacyRisk: 'ZERO RISK — Query parameters sanitized locally by Sentinel Agent before telemetry ingestion.',
        remediation: [
          { action: 'Kill Slow Query PID #49102', cmd: 'sentinel runbook exec pg-kill-slow-query --pid 49102', status: 'ready' },
          { action: 'Scale PgBouncer Connection Pool to 150', cmd: 'sentinel runbook exec scale-pool --size 150', status: 'ready' },
          { action: 'Enable Client-Side Circuit Breaker on Checkout', cmd: 'sentinel mesh trip-breaker --svc checkout-service', status: 'recommended' }
        ]
      }
    },
    {
      id: 'ddos-perimeter-flood',
      title: 'Distributed Layer 7 SYN Flood at Edge Router',
      district: 'NETWORK',
      sourceNode: 'edge-router-alpha',
      severity: 'critical',
      description: 'Sudden incoming burst of 4.2M rps volumetric traffic hitting Edge Router Alpha and WAF Citadel from 18,000 spoofed IP prefixes.',
      impactedNodes: [
        { id: 'edge-router-alpha', status: 'critical', metricChanges: { throughput: 420000, cpu: 98, latency: 120 } },
        { id: 'waf-sentinel', status: 'warning', metricChanges: { throughput: 180000, cpu: 88, latency: 45 } },
        { id: 'api-gateway', status: 'warning', metricChanges: { latency: 95, throughput: 14000 } }
      ],
      impactedConnections: [
        { from: 'edge-router-alpha', to: 'waf-sentinel', health: 'critical', latency: 120 },
        { from: 'waf-sentinel', to: 'api-gateway', health: 'warning', latency: 45 }
      ],
      aiDiagnosis: {
        rootCause: 'Volumetric Layer 7 SYN flood targeting /api/v1/auth/token endpoint with randomized User-Agent patterns.',
        confidence: 96.1,
        blastRadius: '2 Edge Services (8% of Fleet)',
        privacyRisk: 'ZERO RISK — Ingress packet headers inspected in eBPF memory ring buffer; payload never stored.',
        remediation: [
          { action: 'Deploy eBPF XDP Drop Filter on Edge Router', cmd: 'sentinel ebpf apply-filter --rule syn-flood-xdp', status: 'recommended' },
          { action: 'Activate Cloudflare / Akamai Origin Shield Scrubbing', cmd: 'sentinel network divert-cdn-shield', status: 'ready' },
          { action: 'Enable Aggressive IP Reputation Challenge', cmd: 'sentinel waf set-challenge --level high', status: 'ready' }
        ]
      }
    },
    {
      id: 'privacy-egress-violation',
      title: 'PII Leak Prevented by Local Privacy Enclave',
      district: 'LOCAL_COLLECTOR',
      sourceNode: 'sentinel-local-agent',
      severity: 'warning',
      description: 'Legacy payment logging hook attempted to emit unmasked raw credit card PAN to SaaS egress channel. Sentinel Privacy Enclave halted the packet locally.',
      impactedNodes: [
        { id: 'sentinel-local-agent', status: 'warning', metricChanges: { egressBlocked: 14, cpu: 28 } },
        { id: 'privacy-redaction-enclave', status: 'warning', metricChanges: { piiScrubbed: 39512 } },
        { id: 'saas-egress-gw', status: 'healthy', metricChanges: { throughput: 4200 } }
      ],
      impactedConnections: [
        { from: 'privacy-redaction-enclave', to: 'saas-egress-gw', health: 'warning', latency: 42 }
      ],
      aiDiagnosis: {
        rootCause: 'Payment gateway debugging logger bypassed standard JSON masking filter and attempted to stream credit card PANs in raw syslog stream.',
        confidence: 99.8,
        blastRadius: 'Local Collector Isolation Zone — ZERO External Data Leakage',
        privacyRisk: 'NEUTRALIZED — Sentinel Zero-Knowledge Enclave caught and redacted 14 packets at kernel layer before egress.',
        remediation: [
          { action: 'Hot-Patch Payment Logging Masking Config', cmd: 'sentinel privacy reload-rules --strict-pci', status: 'recommended' },
          { action: 'Quarantine Offending Pod Replica #3', cmd: 'sentinel pod quarantine --pod payment-log-worker-3', status: 'ready' },
          { action: 'Export Cryptographic Proof of Zero-Leakage', cmd: 'sentinel audit export-zk-proof --incident-id SEC-904', status: 'ready' }
        ]
      }
    },
    {
      id: 'auth-memory-leak',
      title: 'Memory Leak & GC Latency in Auth Service v3',
      district: 'APPLICATION',
      sourceNode: 'auth-service',
      severity: 'critical',
      description: 'Unbounded cache retention in token validation cache causes memory usage to breach 95%, triggering frequent 800ms Stop-The-World garbage collection pauses.',
      impactedNodes: [
        { id: 'auth-service', status: 'critical', metricChanges: { memory: 96, cpu: 82, latency: 620, errorRate: 8.5 } },
        { id: 'api-gateway', status: 'warning', metricChanges: { latency: 180, errorRate: 3.2 } }
      ],
      impactedConnections: [
        { from: 'api-gateway', to: 'auth-service', health: 'critical', latency: 620 }
      ],
      aiDiagnosis: {
        rootCause: 'JWT revocation cache retains expired token claims without TTL expiration, leading to heap exhaustion.',
        confidence: 97.2,
        blastRadius: 'Auth Microservice & Ingress Handshake',
        privacyRisk: 'ZERO RISK — Memory enclave isolated in userspace container.',
        remediation: [
          { action: 'Trigger Rolling Pod Restart for Auth Service', cmd: 'kubectl rollout restart deployment auth-service-v3', status: 'recommended' },
          { action: 'Flush Local Token Revocation Bloom Filter', cmd: 'sentinel cache flush-filter --cache auth-jwt', status: 'ready' }
        ]
      }
    }
  ]
};

// Expose configuration globally
window.SENTINEL_CONFIG = SENTINEL_CONFIG;

