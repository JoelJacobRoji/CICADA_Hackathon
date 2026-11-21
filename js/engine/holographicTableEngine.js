/**
 * SENTINEL AI - Holographic Operations Table Rendering Engine
 * Controls 3D perspective table tilt, smooth zoom toward cursor,
 * multi-level semantic zoom (L0-L4), dynamic entity rendering,
 * and dependency arc highlighting.
 */

class HolographicTableEngine {
  constructor(canvas, container, store, continentGen) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container;
    this.store = store;
    this.continent = continentGen;

    // Viewport & Camera State
    this.width = 1200;
    this.height = 900;
    this.panX = 0;
    this.panY = 0;
    this.targetPanX = 0;
    this.targetPanY = 0;

    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.tilt = 38; // Initial perspective tilt in degrees
    this.targetTilt = 38;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.panStartX = 0;
    this.panStartY = 0;

    // Smooth Flying Animation
    this.isFlying = false;
    this.flyStartTime = 0;
    this.flyDuration = 900;
    this.flyStart = { x: 0, y: 0, zoom: 1.0 };
    this.flyTarget = { x: 0, y: 0, zoom: 1.0 };

    // Hover & Pulse State
    this.hoveredEntity = null;
    this.pulsePhase = 0;
    this.particles = [];

    this.initParticles();
    this.setupEvents();
    this.resize();
  }

  initParticles() {
    this.particles = [];
    const links = this.store.links;
    links.forEach(link => {
      const fromSite = this.store.sitesMap.get(link.fromSite);
      const toSite = this.store.sitesMap.get(link.toSite);
      if (!fromSite || !toSite) return;

      const count = link.isBackbone ? 12 : 7;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          link,
          fromSite,
          toSite,
          prog: Math.random(),
          speed: (link.isBackbone ? 0.0035 : 0.0022) * (0.8 + Math.random() * 0.4),
          size: link.isBackbone ? 2.6 : 1.8
        });
      }
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 1200;
    const h = rect.height || 850;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.displayWidth = w;
    this.displayHeight = h;

    // Center table initially
    if (this.panX === 0 && this.panY === 0) {
      this.panX = (w - 1200) / 2;
      this.panY = (h - 900) / 2;
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
    }
  }

  setupEvents() {
    const c = this.container;

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
      this.isFlying = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.panX = this.panStartX + dx;
        this.panY = this.panStartY + dy;
        this.targetPanX = this.panX;
        this.targetPanY = this.panY;
      } else {
        const rect = this.canvas.getBoundingClientRect();
        this.handlePointerMove(e.clientX - rect.left, e.clientY - rect.top);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
        if (dist < 5) {
          const rect = this.canvas.getBoundingClientRect();
          this.handlePointerClick(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    });

    // Zoom toward cursor
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.18 : 0.84;
      const newZoom = Math.max(0.7, Math.min(12.0, this.zoom * zoomFactor));

      // Zoom toward mouse point
      const worldX = (mouseX - this.panX) / this.zoom;
      const worldY = (mouseY - this.panY) / this.zoom;

      this.targetPanX = mouseX - worldX * newZoom;
      this.targetPanY = mouseY - worldY * newZoom;
      this.targetZoom = newZoom;
      this.isFlying = false;

      this.store.setZoom(newZoom);
    }, { passive: false });

    // Double click to zoom in
    c.addEventListener('dblclick', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.panX) / this.zoom;
      const worldY = (mouseY - this.panY) / this.zoom;
      this.flyTo(worldX, worldY, Math.min(12.0, this.zoom * 1.8));
    });
  }

  // Smooth Camera Fly Transition
  flyTo(targetWorldX, targetWorldY, targetZoom = 3.5, duration = 850) {
    this.isFlying = true;
    this.flyStartTime = performance.now();
    this.flyDuration = duration;

    this.flyStart = {
      x: this.panX,
      y: this.panY,
      zoom: this.zoom
    };

    const screenCenterX = this.displayWidth / 2;
    const screenCenterY = this.displayHeight / 2;

    this.flyTarget = {
      x: screenCenterX - targetWorldX * targetZoom,
      y: screenCenterY - targetWorldY * targetZoom,
      zoom: targetZoom
    };
  }

  // Screen to Map Coordinates
  screenToMap(sx, sy) {
    return {
      x: (sx - this.panX) / this.zoom,
      y: (sy - this.panY) / this.zoom
    };
  }

  handlePointerMove(sx, sy) {
    const { x, y } = this.screenToMap(sx, sy);
    const level = this.store.viewState.level;
    let hit = null;

    if (level === 0) {
      // Hit test regions
      for (const reg of this.store.regions) {
        if (Math.hypot(reg.cx - x, reg.cy - y) <= reg.radius) {
          hit = { entity: reg, type: 'region' };
          break;
        }
      }
    } else if (level === 1) {
      // Hit test sites
      for (const site of this.store.sites) {
        if (Math.hypot(site.x - x, site.y - y) <= 24) {
          hit = { entity: site, type: 'site' };
          break;
        }
      }
    } else {
      // Hit test individual nodes
      for (const node of this.store.nodes) {
        const site = this.store.sitesMap.get(node.siteId);
        if (site && Math.hypot(site.x - x, site.y - y) <= 18) {
          hit = { entity: node, type: 'node' };
          break;
        }
      }
    }

    if (this.hoveredEntity !== hit) {
      this.hoveredEntity = hit;
      this.canvas.style.cursor = hit ? 'pointer' : 'grab';
      this.store.viewState.hoveredEntity = hit;
      this.store.notify();
    }
  }

  handlePointerClick(sx, sy) {
    const { x, y } = this.screenToMap(sx, sy);
    const level = this.store.viewState.level;

    if (level === 0) {
      for (const reg of this.store.regions) {
        if (Math.hypot(reg.cx - x, reg.cy - y) <= reg.radius) {
          this.flyTo(reg.cx, reg.cy, 2.2);
          this.store.selectEntity(reg, 'region');
          return;
        }
      }
    } else if (level === 1) {
      for (const site of this.store.sites) {
        if (Math.hypot(site.x - x, site.y - y) <= 30) {
          this.flyTo(site.x, site.y, 4.2);
          this.store.selectEntity(site, 'site');
          return;
        }
      }
    } else {
      for (const node of this.store.nodes) {
        const site = this.store.sitesMap.get(node.siteId);
        if (site && Math.hypot(site.x - x, site.y - y) <= 22) {
          this.flyTo(site.x, site.y, 8.5);
          this.store.selectEntity(node, 'node');
          return;
        }
      }
    }
  }

  // Update loop for camera physics, dynamic tilt, and particles
  update(dt) {
    this.pulsePhase += dt * 0.003;

    // Flying animation tween
    if (this.isFlying) {
      const elapsed = performance.now() - this.flyStartTime;
      const p = Math.min(1.0, elapsed / this.flyDuration);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      this.panX = this.flyStart.x + (this.flyTarget.x - this.flyStart.x) * ease;
      this.panY = this.flyStart.y + (this.flyTarget.y - this.flyStart.y) * ease;
      this.zoom = this.flyStart.zoom + (this.flyTarget.zoom - this.flyStart.zoom) * ease;

      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
      this.targetZoom = this.zoom;

      if (p >= 1.0) {
        this.isFlying = false;
        this.store.setZoom(this.zoom);
      }
    } else {
      // Smooth dampening
      this.panX += (this.targetPanX - this.panX) * 0.15;
      this.panY += (this.targetPanY - this.panY) * 0.15;
      this.zoom += (this.targetZoom - this.zoom) * 0.18;
    }

    // Dynamic Tilt Easing: eases toward 0deg as zoom increases so detail is readable
    // L0 (zoom 1.0) -> 38deg tilt. Zoom >= 4.5 -> 0deg tilt.
    const tiltFactor = Math.max(0, 1 - (this.zoom - 0.9) / 3.8);
    this.tilt = 38 * Math.pow(tiltFactor, 1.4);

    // Apply CSS 3D perspective tilt to container
    if (this.container) {
      this.container.style.transform = `rotateX(${this.tilt}deg)`;
    }

    // Update traffic particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const latFactor = Math.max(0.2, 1 - (p.link.latency / 200));
      p.prog += p.speed * latFactor * (dt * 0.06);
      if (p.prog >= 1.0) p.prog = 0.0;
    }
  }

  // Master Render Routine
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    ctx.save();
    // Apply Pan and Zoom Transforms
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // 1. Draw Procedural Landmass, Glowing Coastlines & Contours
    this.continent.renderCanvas(ctx, {
      showContours: this.store.layers.contours,
      pulsePhase: this.pulsePhase
    });

    // 2. Draw Privacy Boundary (Trust perimeter layer around local enclave)
    if (this.store.layers.privacyBoundary) {
      this.drawPrivacyBoundary(ctx);
    }

    // 3. Draw Inter-Site & Backbone Links
    if (this.store.layers.traffic) {
      this.drawLinksAndParticles(ctx);
    }

    // 4. Render Semantic Entities (L0 -> L4)
    this.drawSemanticLayers(ctx);

    // 5. Draw Dependency Arcs if a node is selected
    if (this.store.viewState.selectedNodeId) {
      this.drawSelectedDependencyArcs(ctx);
    }

    ctx.restore();
  }

  // Draw the Privacy Trust Boundary Fence
  drawPrivacyBoundary(ctx) {
    ctx.save();
    // Draw glowing emerald perimeter fence around Citadel Reach (South)
    const cx = 505;
    const cy = 690;
    const rx = 135;
    const ry = 95;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    ctx.strokeStyle = '#00ffaa';
    ctx.shadowColor = '#00ffaa';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2.0;
    ctx.setLineDash([8, 6]);
    ctx.stroke();

    // Fill with soft emerald privacy glow
    ctx.fillStyle = 'rgba(0, 255, 170, 0.06)';
    ctx.fill();
    ctx.setLineDash([]);

    // Trust boundary watermark badge
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#00ffaa';
    ctx.textAlign = 'center';
    ctx.fillText('// TRUST BOUNDARY: ZERO-KNOWLEDGE ENCLAVE (ON-PREM) //', cx, cy + ry + 16);

    ctx.restore();
  }

  // Draw Links & Traveling Traffic Particles
  drawLinksAndParticles(ctx) {
    ctx.save();
    const level = this.store.viewState.level;

    // Draw lines
    this.store.links.forEach(link => {
      const fromSite = this.store.sitesMap.get(link.fromSite);
      const toSite = this.store.sitesMap.get(link.toSite);
      if (!fromSite || !toSite) return;

      let color = 'rgba(0, 243, 255, 0.28)';
      let lineWidth = link.isBackbone ? 2.5 : 1.2;

      if (link.health === 'warning') color = 'rgba(255, 170, 0, 0.55)';
      if (link.health === 'critical') color = 'rgba(255, 0, 85, 0.75)';
      if (link.isPrivacy) color = 'rgba(0, 255, 170, 0.45)';

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(fromSite.x, fromSite.y);
      ctx.lineTo(toSite.x, toSite.y);
      ctx.stroke();
    });

    // Draw Particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const curX = p.fromSite.x + (p.toSite.x - p.fromSite.x) * p.prog;
      const curY = p.fromSite.y + (p.toSite.y - p.fromSite.y) * p.prog;

      let pColor = '#00f3ff';
      if (p.link.health === 'warning') pColor = '#ffaa00';
      if (p.link.health === 'critical') pColor = '#ff0055';
      if (p.link.isPrivacy) pColor = '#00ffaa';

      ctx.fillStyle = pColor;
      ctx.shadowColor = pColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(curX, curY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Semantic Zoom Layers (L0 -> L4)
  drawSemanticLayers(ctx) {
    const level = this.store.viewState.level;

    // L0: Whole Continent (Regions glowing by aggregate health + incident rings)
    if (level === 0 || level === 1) {
      this.drawL0Regions(ctx);
    }

    // L1: Sites / Data Centers as clusters with ring markers
    if (level >= 1) {
      this.drawL1Sites(ctx);
    }

    // L2 & L3: Zoned layouts, building blocks, and individual server pods
    if (level >= 2) {
      this.drawL2ZonedSiteDetails(ctx);
    }

    // L3 & L4: Individual server blades & live sparklines
    if (level >= 3) {
      this.drawL3ServerBlades(ctx);
    }
  }

  drawL0Regions(ctx) {
    ctx.save();
    this.store.regions.forEach(reg => {
      const isCritical = reg.health === 'critical';
      const isWarning = reg.health === 'warning';
      let color = reg.color;
      if (isCritical) color = '#ff0055';
      else if (isWarning) color = '#ffaa00';

      // Regional Area Ambient Glow
      const grad = ctx.createRadialGradient(reg.cx, reg.cy, 20, reg.cx, reg.cy, reg.radius);
      grad.addColorStop(0, color + '22');
      grad.addColorStop(0.7, color + '08');
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(reg.cx, reg.cy, reg.radius, 0, Math.PI * 2);
      ctx.fill();

      // Regional Ring Boundary
      ctx.strokeStyle = color + '44';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Critical Incident Expanding Wave Ring
      if (isCritical) {
        const ringP = (this.pulsePhase * 2) % 1.0;
        const r = reg.radius * (0.6 + ringP * 0.7);
        ctx.strokeStyle = `rgba(255, 0, 85, ${1 - ringP})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(reg.cx, reg.cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Region Name Tag
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillText(reg.name.toUpperCase(), reg.cx, reg.cy - 12);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${reg.role} • ${reg.nodesCount} ENTITIES`, reg.cx, reg.cy + 4);
    });
    ctx.restore();
  }

  drawL1Sites(ctx) {
    ctx.save();
    this.store.sites.forEach(site => {
      const isCritical = site.health === 'critical';
      const isWarning = site.health === 'warning';
      let color = '#00f3ff';
      if (isCritical) color = '#ff0055';
      else if (isWarning) color = '#ffaa00';
      else if (site.regionId === 'reg-south') color = '#00ffaa';

      // Concentric Site Ring Markers
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;

      // Outer ring
      ctx.beginPath();
      ctx.arc(site.x, site.y, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring with spinning dash
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(site.x, site.y, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center core blip
      ctx.fillStyle = isCritical ? '#ff0055' : '#ffffff';
      ctx.beginPath();
      ctx.arc(site.x, site.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Site Name Label
      if (this.zoom >= 1.6) {
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(site.name, site.x, site.y + 28);

        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = color;
        ctx.fillText(`[${site.type}]`, site.x, site.y + 39);
      }
    });
    ctx.restore();
  }

  drawL2ZonedSiteDetails(ctx) {
    ctx.save();
    // Render 2.5D building outlines and rack perimeters inside the active sites
    this.store.sites.forEach(site => {
      const isCritical = site.health === 'critical';
      const color = isCritical ? '#ff0055' : '#00f3ff';

      // Zone Boundary Box
      ctx.strokeStyle = color + '55';
      ctx.lineWidth = 1;
      ctx.strokeRect(site.x - 35, site.y - 35, 70, 70);

      // 4 Tactical corner brackets
      const bSize = 6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      // TL
      ctx.beginPath(); ctx.moveTo(site.x - 35, site.y - 35 + bSize); ctx.lineTo(site.x - 35, site.y - 35); ctx.lineTo(site.x - 35 + bSize, site.y - 35); ctx.stroke();
      // TR
      ctx.beginPath(); ctx.moveTo(site.x + 35 - bSize, site.y - 35); ctx.lineTo(site.x + 35, site.y - 35); ctx.lineTo(site.x + 35, site.y - 35 + bSize); ctx.stroke();
      // BL
      ctx.beginPath(); ctx.moveTo(site.x - 35, site.y + 35 - bSize); ctx.lineTo(site.x - 35, site.y + 35); ctx.lineTo(site.x - 35 + bSize, site.y + 35); ctx.stroke();
      // BR
      ctx.beginPath(); ctx.moveTo(site.x + 35 - bSize, site.y + 35); ctx.lineTo(site.x + 35, site.y + 35); ctx.lineTo(site.x + 35, site.y + 35 - bSize); ctx.stroke();
    });
    ctx.restore();
  }

  drawL3ServerBlades(ctx) {
    ctx.save();
    // Draw individual servers/nodes and live micro sparklines
    this.store.nodes.forEach(node => {
      const site = this.store.sitesMap.get(node.siteId);
      if (!site) return;

      const isCritical = node.health === 'critical';
      const isWarning = node.health === 'warning';
      const color = isCritical ? '#ff0055' : isWarning ? '#ffaa00' : '#00f3ff';

      // Server Blade icon dot
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = isCritical ? 12 : 5;
      ctx.beginPath();
      ctx.arc(site.x, site.y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Mini live sparkline bar above server
      const hist = this.store.nodeHistory.get(node.id);
      if (hist && this.zoom >= 4.5) {
        const sw = 45;
        const sh = 14;
        const sx = site.x - sw / 2;
        const sy = site.y - 24;

        ctx.fillStyle = 'rgba(2, 4, 8, 0.88)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, sw, sh);

        // Draw sparkline wave
        ctx.beginPath();
        const pts = hist.cpu.slice(-10);
        pts.forEach((val, idx) => {
          const px = sx + (idx / 9) * sw;
          const py = sy + sh - (val / 100) * sh;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = color;
        ctx.stroke();

        // Node ID label
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(node.id, site.x, site.y + 14);
      }
    });
    ctx.restore();
  }

  // Draw 3D curved dependency arcs when a node is selected
  drawSelectedDependencyArcs(ctx) {
    const selNodeId = this.store.viewState.selectedNodeId;
    const selNode = this.store.nodesMap.get(selNodeId);
    if (!selNode || !selNode.dependencies) return;

    const sourceSite = this.store.sitesMap.get(selNode.siteId);
    if (!sourceSite) return;

    ctx.save();
    selNode.dependencies.forEach(depId => {
      const depNode = this.store.nodesMap.get(depId);
      if (!depNode) return;
      const targetSite = this.store.sitesMap.get(depNode.siteId);
      if (!targetSite) return;

      const midX = (sourceSite.x + targetSite.x) / 2;
      const midY = (sourceSite.y + targetSite.y) / 2 - 45; // Arches upward

      const grad = ctx.createLinearGradient(sourceSite.x, sourceSite.y, targetSite.x, targetSite.y);
      grad.addColorStop(0, '#00f3ff');
      grad.addColorStop(0.5, '#bd00ff');
      grad.addColorStop(1, depNode.health === 'critical' ? '#ff0055' : '#00f3ff');

      ctx.strokeStyle = grad;
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);

      ctx.beginPath();
      ctx.moveTo(sourceSite.x, sourceSite.y);
      ctx.quadraticCurveTo(midX, midY, targetSite.x, targetSite.y);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.restore();
  }
}

window.HolographicTableEngine = HolographicTableEngine;

