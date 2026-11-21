/**
 * SENTINEL AI - Data Highway Particle & Traffic Engine
 * Simulates high-speed packet flow, latency slowdowns, incident blast waves,
 * and glowing arterial conduits across the isometric cyber infrastructure.
 */

class SentinelParticleEngine {
  constructor(config) {
    this.config = config;
    this.particles = [];
    this.pulses = []; // Special dramatic wave pulses during incidents
    this.maxParticles = 650;
    this.lastTime = performance.now();
  }

  init(nodesMap, connections) {
    this.nodesMap = nodesMap;
    this.connections = connections;
    this.particles = [];

    // Pre-populate particles across all connections
    this.connections.forEach(conn => {
      const fromNode = this.nodesMap.get(conn.from);
      const toNode = this.nodesMap.get(conn.to);
      if (!fromNode || !toNode) return;

      const count = conn.particles || 10;
      for (let i = 0; i < count; i++) {
        this.particles.push(this.createParticle(conn, fromNode, toNode, Math.random()));
      }
    });
  }

  createParticle(conn, fromNode, toNode, progress = 0) {
    // Speed is inversely proportional to latency (higher latency = slower particles)
    const baseSpeed = conn.isArterial ? 0.0035 : 0.0022;
    const latencyFactor = Math.max(0.2, 1 - (conn.latency / 120));
    const speed = baseSpeed * latencyFactor * (0.8 + Math.random() * 0.4);

    return {
      conn,
      fromNode,
      toNode,
      progress, // 0.0 to 1.0
      speed,
      size: conn.isArterial ? (2.5 + Math.random() * 1.5) : (1.6 + Math.random() * 1.2),
      jitter: (Math.random() - 0.5) * 3,
      health: conn.health || 'healthy'
    };
  }

  // Trigger a dramatic high-energy pulse surge (e.g. during incident or remediation)
  triggerPulse(fromNodeId, toNodeId, color = '#ff0055', speed = 0.008) {
    const fromNode = this.nodesMap.get(fromNodeId);
    const toNode = this.nodesMap.get(toNodeId);
    if (!fromNode || !toNode) return;

    this.pulses.push({
      fromNode,
      toNode,
      progress: 0,
      speed,
      color,
      radius: 6,
      tailLength: 35
    });
  }

  update(dt) {
    // Update regular particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      
      // Dynamic speed adjustment based on live connection health
      const latencyFactor = Math.max(0.15, 1 - (p.conn.latency / 150));
      const speed = (p.conn.isArterial ? 0.0035 : 0.0022) * latencyFactor;
      
      p.progress += speed * dt * 0.06;
      if (p.progress >= 1.0) {
        p.progress = 0.0;
        p.health = p.conn.health || 'healthy';
      }
    }

    // Update dramatic incident pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      pulse.progress += pulse.speed * dt * 0.06;
      if (pulse.progress >= 1.0) {
        this.pulses.splice(i, 1);
      }
    }
  }

  // Render particles on the 2D canvas using the isometric camera projection
  render(ctx, projectIso) {
    ctx.save();

    // 1. Render standard data packets
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.conn.health === 'offline') continue;

      const fromIso = projectIso(p.fromNode.gridX, p.fromNode.gridY, 0);
      const toIso = projectIso(p.toNode.gridX, p.toNode.gridY, 0);

      // Interpolate along the isometric path
      const curX = fromIso.x + (toIso.x - fromIso.x) * p.progress;
      const curY = fromIso.y + (toIso.y - fromIso.y) * p.progress;

      // Color mapping
      let color = this.config.colors.healthy;
      let glow = this.config.colors.healthyGlow;
      if (p.conn.health === 'warning') {
        color = this.config.colors.warning;
        glow = this.config.colors.warningGlow;
      } else if (p.conn.health === 'critical') {
        color = this.config.colors.critical;
        glow = this.config.colors.criticalGlow;
      } else if (p.conn.isPrivacyChannel) {
        color = this.config.colors.privacyShield;
        glow = this.config.colors.privacyGlow;
      }

      // Draw particle with glow
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.arc(curX, curY, p.size, 0, Math.PI * 2);
      ctx.fill();

      // Light trail
      if (p.conn.isArterial || p.progress > 0.05) {
        const prevProg = Math.max(0, p.progress - 0.04);
        const trailX = fromIso.x + (toIso.x - fromIso.x) * prevProg;
        const trailY = fromIso.y + (toIso.y - fromIso.y) * prevProg;

        ctx.strokeStyle = color;
        ctx.lineWidth = p.size * 0.6;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(curX, curY);
        ctx.lineTo(trailX, trailY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }

    // 2. Render high-energy blast pulses
    for (let i = 0; i < this.pulses.length; i++) {
      const pulse = this.pulses[i];
      const fromIso = projectIso(pulse.fromNode.gridX, pulse.fromNode.gridY, 0);
      const toIso = projectIso(pulse.toNode.gridX, pulse.toNode.gridY, 0);

      const curX = fromIso.x + (toIso.x - fromIso.x) * pulse.progress;
      const curY = fromIso.y + (toIso.y - fromIso.y) * pulse.progress;

      ctx.shadowColor = pulse.color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = pulse.color;

      // Glowing pulse head
      ctx.beginPath();
      ctx.arc(curX, curY, pulse.radius, 0, Math.PI * 2);
      ctx.fill();

      // Trailing laser streak
      const tailProg = Math.max(0, pulse.progress - 0.12);
      const tailX = fromIso.x + (toIso.x - fromIso.x) * tailProg;
      const tailY = fromIso.y + (toIso.y - fromIso.y) * tailProg;

      const grad = ctx.createLinearGradient(curX, curY, tailX, tailY);
      grad.addColorStop(0, pulse.color);
      grad.addColorStop(1, 'transparent');

      ctx.strokeStyle = grad;
      ctx.lineWidth = pulse.radius * 1.8;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }

    ctx.restore();
  }
}

window.SentinelParticleEngine = SentinelParticleEngine;

