/**
 * SENTINEL AI - Incident Detection & Cascading Failure Manager
 * Coordinates multi-district failure propagation, blast radius evaluation,
 * camera tracking, siren audio alerts, and automated remediation runbooks.
 */

class SentinelIncidentManager {
  constructor(config, telemetryService, isoEngine, particleEngine, audioEngine) {
    this.config = config;
    this.telemetryService = telemetryService;
    this.isoEngine = isoEngine;
    this.particleEngine = particleEngine;
    this.audioEngine = audioEngine;

    this.activeIncident = null;
    this.incidentHistory = [];
    this.listeners = [];
  }

  onIncidentChange(callback) {
    this.listeners.push(callback);
  }

  notify(event, data) {
    this.listeners.forEach(cb => {
      try { cb(event, data); } catch (e) { console.error(e); }
    });
  }

  // Trigger an incident scenario by ID
  triggerScenario(scenarioId) {
    const scenario = this.config.scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    this.activeIncident = {
      ...scenario,
      startTime: Date.now(),
      status: 'active',
      logs: [
        { time: 'T+0.0s', msg: `CRITICAL ALERT: Anomaly signature detected on ${scenario.sourceNode}.` },
        { time: 'T+0.4s', msg: `Telemetry breach: Latency/Error rate crossed P99 threshold.` },
        { time: 'T+0.8s', msg: `Cascading dependency degradation propagating to ${scenario.impactedNodes.length - 1} connected services.` },
        { time: 'T+1.2s', msg: `SENTINEL Neural Copilot generated automated root-cause diagnosis.` }
      ]
    };

    // 1. Play dramatic audio alert siren
    if (this.audioEngine) {
      this.audioEngine.playAlert();
    }

    // 2. Mutate impacted nodes & connections
    scenario.impactedNodes.forEach(impact => {
      const node = this.config.nodes.find(n => n.id === impact.id);
      if (node) {
        node.status = impact.status;
        if (impact.metricChanges) {
          Object.assign(node.metrics, impact.metricChanges);
        }
      }
    });

    scenario.impactedConnections.forEach(ic => {
      const conn = this.config.connections.find(c => c.from === ic.from && c.to === ic.to);
      if (conn) {
        conn.health = ic.health;
        conn.latency = ic.latency;
      }
    });

    // 3. Emit high-energy red blast pulses across data highways
    if (this.particleEngine) {
      scenario.impactedConnections.forEach(ic => {
        this.particleEngine.triggerPulse(ic.from, ic.to, '#ff0055', 0.007);
        setTimeout(() => {
          this.particleEngine.triggerPulse(ic.from, ic.to, '#ff0055', 0.009);
        }, 350);
      });
    }

    // 4. Smooth camera focus fly-to the incident epicenter
    const sourceNode = this.config.nodes.find(n => n.id === scenario.sourceNode);
    if (sourceNode && this.isoEngine) {
      this.isoEngine.selectNode(sourceNode);
      this.isoEngine.flyTo(sourceNode.gridX, sourceNode.gridY, 1.5, 1100);
    }

    this.notify('incident_triggered', this.activeIncident);
    console.log(`[INCIDENT] ${scenario.title} triggered at ${scenario.sourceNode}`);
  }

  // Resolve / Auto-Remediate the current incident
  remediateIncident(actionName) {
    if (!this.activeIncident) return;

    const incident = this.activeIncident;
    incident.status = 'remediated';
    incident.logs.push({
      time: `T+${((Date.now() - incident.startTime) / 1000).toFixed(1)}s`,
      msg: `REMEDIATION EXECUTED: ${actionName || 'Automated Sentinel Runbook'} dispatched.`
    });

    // 1. Play success chime
    if (this.audioEngine) {
      this.audioEngine.playSuccess();
    }

    // 2. Restore nodes & connections gradually
    setTimeout(() => {
      incident.impactedNodes.forEach(impact => {
        const node = this.config.nodes.find(n => n.id === impact.id);
        if (node) {
          node.status = 'healthy';
          // Return to baseline metrics
          if (node.id === 'postgres-primary') { node.metrics.latency = 12; node.metrics.cpu = 62; node.metrics.errorRate = 0.0; }
          if (node.id === 'billing-service') { node.metrics.latency = 42; node.metrics.cpu = 44; node.metrics.errorRate = 0.01; }
          if (node.id === 'checkout-service') { node.metrics.latency = 32; node.metrics.cpu = 58; node.metrics.errorRate = 0.04; }
          if (node.id === 'api-gateway') { node.metrics.latency = 18; node.metrics.cpu = 48; node.metrics.errorRate = 0.02; }
          if (node.id === 'edge-router-alpha') { node.metrics.latency = 4.2; node.metrics.cpu = 36; node.metrics.throughput = 94000; }
          if (node.id === 'auth-service') { node.metrics.latency = 24; node.metrics.memory = 54; node.metrics.cpu = 39; }
        }
      });

      incident.impactedConnections.forEach(ic => {
        const conn = this.config.connections.find(c => c.from === ic.from && c.to === ic.to);
        if (conn) {
          conn.health = 'healthy';
          conn.latency = 15;
        }
      });

      // Emit green healing pulses
      if (this.particleEngine) {
        incident.impactedConnections.forEach(ic => {
          this.particleEngine.triggerPulse(ic.from, ic.to, '#00ffaa', 0.009);
        });
      }

      this.incidentHistory.unshift({ ...this.activeIncident, resolvedTime: Date.now() });
      this.activeIncident = null;
      this.notify('incident_resolved', incident);
    }, 1200);
  }

  getActiveIncident() {
    return this.activeIncident;
  }
}

window.SentinelIncidentManager = SentinelIncidentManager;

