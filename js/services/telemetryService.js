/**
 * SENTINEL AI - Telemetry Service & Backend Integration Connector
 * Provides real-time simulated telemetry with organic fluctuation AND 
 * a plug-and-play WebSocket / REST adapter for production backend connection.
 */

class SentinelTelemetryService {
  constructor(config) {
    this.config = config;
    this.nodes = [];
    this.connections = [];
    this.historyLength = 40; // Historical data points for charts
    this.history = new Map(); // nodeId -> { cpu: [], memory: [], latency: [], throughput: [], errorRate: [] }

    // Backend connector settings
    this.isLiveBackend = false;
    this.ws = null;
    this.listeners = {
      telemetry: [],
      incident: [],
      nodeUpdate: []
    };

    this.timer = null;
    this.updateInterval = 1200; // ms
  }

  init(nodes, connections) {
    this.nodes = nodes;
    this.connections = connections;

    // Initialize historical circular buffers with realistic base curves
    this.nodes.forEach(node => {
      const hist = {
        cpu: [],
        memory: [],
        latency: [],
        throughput: [],
        errorRate: []
      };

      const baseCpu = node.metrics.cpu;
      const baseMem = node.metrics.memory;
      const baseLat = node.metrics.latency;
      const baseRps = node.metrics.throughput;

      for (let i = 0; i < this.historyLength; i++) {
        const jitter = (Math.sin(i * 0.4 + node.gridX) * 4) + (Math.random() - 0.5) * 3;
        hist.cpu.push(Math.max(5, Math.min(99, Math.round(baseCpu + jitter))));
        hist.memory.push(Math.max(10, Math.min(99, Math.round(baseMem + jitter * 0.6))));
        hist.latency.push(Math.max(0.5, +(baseLat + (Math.random() - 0.5) * (baseLat * 0.15)).toFixed(1)));
        hist.throughput.push(Math.max(100, Math.round(baseRps + (Math.random() - 0.5) * (baseRps * 0.1))));
        hist.errorRate.push(node.metrics.errorRate || 0.01);
      }

      this.history.set(node.id, hist);
    });

    this.startMockSimulation();
  }

  // Event Subscription System
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error('Listener error:', e); }
      });
    }
  }

  // Organic Jitter Simulator
  startMockSimulation() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (this.isLiveBackend) return; // If connected to real backend, skip mock updates

      const updates = [];

      this.nodes.forEach(node => {
        const hist = this.history.get(node.id);
        if (!hist) return;

        // Skip wild mutations if node is in manual critical incident state
        const isCritical = node.status === 'critical';
        const isWarning = node.status === 'warning';

        let cpuJitter = (Math.random() - 0.5) * 3;
        let memJitter = (Math.random() - 0.5) * 1.5;
        let latJitter = (Math.random() - 0.5) * (node.metrics.latency * 0.08);

        // Natural bounds
        if (!isCritical && !isWarning) {
          node.metrics.cpu = Math.max(8, Math.min(88, Math.round(node.metrics.cpu + cpuJitter)));
          node.metrics.memory = Math.max(15, Math.min(92, Math.round(node.metrics.memory + memJitter)));
          node.metrics.latency = Math.max(0.4, +(node.metrics.latency + latJitter).toFixed(1));
          node.metrics.throughput = Math.max(200, Math.round(node.metrics.throughput + (Math.random() - 0.5) * 120));
        }

        // Push to rolling history
        hist.cpu.shift();
        hist.cpu.push(node.metrics.cpu);

        hist.memory.shift();
        hist.memory.push(node.metrics.memory);

        hist.latency.shift();
        hist.latency.push(node.metrics.latency);

        hist.throughput.shift();
        hist.throughput.push(node.metrics.throughput);

        hist.errorRate.shift();
        hist.errorRate.push(node.metrics.errorRate);

        updates.push({
          nodeId: node.id,
          metrics: { ...node.metrics },
          status: node.status
        });
      });

      // Update connection latencies
      this.connections.forEach(conn => {
        const fromNode = this.nodes.find(n => n.id === conn.from);
        if (fromNode) {
          conn.latency = fromNode.metrics.latency;
        }
      });

      this.emit('telemetry', updates);
    }, this.updateInterval);
  }

  getNodeHistory(nodeId) {
    return this.history.get(nodeId);
  }

  // === PRODUCTION BACKEND INTEGRATION API ===
  /**
   * Connect to an actual backend WebSocket stream (e.g. ws://localhost:8080/sentinel/stream)
   * Telemetry packets format expected:
   * {
   *   type: 'telemetry_batch',
   *   timestamp: 1700000000,
   *   nodes: [
   *     { id: 'api-gateway', cpu: 52, memory: 64, latency: 22, throughput: 9100, errorRate: 0.02, status: 'healthy' }
   *   ],
   *   incidents: [...]
   * }
   */
  connectWebSocket(url) {
    try {
      console.log(`[SENTINEL API] Attempting connection to ${url}...`);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[SENTINEL API] WebSocket Stream Connected. Switching to Live Telemetry Mode.');
        this.isLiveBackend = true;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.processBackendPacket(data);
        } catch (err) {
          console.error('[SENTINEL API] Failed to parse backend telemetry packet:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[SENTINEL API] WebSocket error, reverting to simulated telemetry:', err);
        this.isLiveBackend = false;
      };

      this.ws.onclose = () => {
        console.log('[SENTINEL API] WebSocket disconnected.');
        this.isLiveBackend = false;
      };
    } catch (e) {
      console.warn('[SENTINEL API] Could not establish WebSocket:', e);
      this.isLiveBackend = false;
    }
  }

  processBackendPacket(data) {
    if (data.nodes && Array.isArray(data.nodes)) {
      data.nodes.forEach(remoteNode => {
        const localNode = this.nodes.find(n => n.id === remoteNode.id);
        if (localNode) {
          Object.assign(localNode.metrics, remoteNode.metrics || remoteNode);
          if (remoteNode.status) localNode.status = remoteNode.status;

          const hist = this.history.get(localNode.id);
          if (hist) {
            hist.cpu.shift(); hist.cpu.push(localNode.metrics.cpu);
            hist.memory.shift(); hist.memory.push(localNode.metrics.memory);
            hist.latency.shift(); hist.latency.push(localNode.metrics.latency);
            hist.throughput.shift(); hist.throughput.push(localNode.metrics.throughput);
          }
        }
      });
      this.emit('telemetry', data.nodes);
    }

    if (data.incidents && Array.isArray(data.incidents)) {
      data.incidents.forEach(inc => this.emit('incident', inc));
    }
  }

  // REST Polling Alternative
  startRestPolling(endpointUrl, intervalMs = 2000) {
    setInterval(async () => {
      try {
        const res = await fetch(endpointUrl);
        const data = await res.json();
        this.processBackendPacket(data);
      } catch (e) {
        // Fallback gracefully
      }
    }, intervalMs);
  }
}

window.SentinelTelemetryService = SentinelTelemetryService;

