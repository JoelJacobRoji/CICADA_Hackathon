/**
 * SENTINEL AI - Isometric 2.5D Cyberpunk City Rendering Engine
 * Renders 3D isometric metallic architecture, glowing neon circuits, 
 * district boundaries, animated radar sweeps, dynamic lighting, and game-like camera physics.
 */

class SentinelIsometricEngine {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;

    // Camera State
    this.camera = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      zoom: 1.0,
      targetZoom: 1.0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      cameraStartX: 0,
      cameraStartY: 0,
      isAnimating: false,
      animStartTime: 0,
      animDuration: 800,
      animStartX: 0,
      animStartY: 0,
      animStartZoom: 1.0
    };

    // Interaction State
    this.hoveredNode = null;
    this.selectedNode = null;
    this.incidentNode = null;
    this.onNodeClickCallback = null;
    this.onNodeHoverCallback = null;

    // Visual Effects
    this.radarAngle = 0;
    this.pulsePhase = 0;
    this.scanlineY = 0;
    this.ambientMotes = [];

    // Internal maps
    this.nodes = [];
    this.nodesMap = new Map();
    this.connections = [];

    this.initMotes();
    this.setupEvents();
    this.resize();
  }

  init(nodes, connections) {
    this.nodes = nodes;
    this.connections = connections;
    this.nodesMap.clear();
    this.nodes.forEach(n => this.nodesMap.set(n.id, n));

    // Center camera on the city by default
    this.resetCamera(false);
  }

  initMotes() {
    this.ambientMotes = [];
    for (let i = 0; i < 45; i++) {
      this.ambientMotes.push({
        x: (Math.random() - 0.5) * 2400,
        y: (Math.random() - 0.5) * 1600,
        vy: -0.2 - Math.random() * 0.4,
        vx: (Math.random() - 0.5) * 0.2,
        size: 1 + Math.random() * 2,
        alpha: 0.1 + Math.random() * 0.4,
        color: Math.random() > 0.4 ? '#00f3ff' : '#bd00ff'
      });
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || window.innerWidth || 1280;
    const h = rect.height || (window.innerHeight - 52) || 800;
    this.displayWidth = w;
    this.displayHeight = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Convert Grid (col, row, height) to Isometric Screen Coordinates
  projectIso(gridX, gridY, elevation = 0) {
    const tileW = this.config.isoTileWidth;
    const tileH = this.config.isoTileHeight;
    const screenX = (gridX - gridY) * (tileW / 2);
    const screenY = (gridX + gridY) * (tileH / 2) - elevation;
    return { x: screenX, y: screenY };
  }

  // Convert Screen Coordinates back to approximate Grid Coordinates
  unprojectIso(screenX, screenY) {
    const tileW = this.config.isoTileWidth;
    const tileH = this.config.isoTileHeight;
    const gridX = (screenX / (tileW / 2) + screenY / (tileH / 2)) / 2;
    const gridY = (screenY / (tileH / 2) - screenX / (tileW / 2)) / 2;
    return { gridX, gridY };
  }

  // Smooth Camera Animation to coordinate
  flyTo(gridX, gridY, targetZoom = 1.35, duration = 900) {
    const iso = this.projectIso(gridX, gridY, 40);
    this.camera.isAnimating = true;
    this.camera.animStartTime = performance.now();
    this.camera.animDuration = duration;
    this.camera.animStartX = this.camera.x;
    this.camera.animStartY = this.camera.y;
    this.camera.animStartZoom = this.camera.zoom;
    this.camera.targetX = -iso.x;
    this.camera.targetY = -iso.y;
    this.camera.targetZoom = targetZoom;
  }

  // Reset camera to center overview
  resetCamera(smooth = true) {
    const centerIso = this.projectIso(8, 8, 0);
    if (!smooth) {
      this.camera.x = -centerIso.x;
      this.camera.y = -centerIso.y + 40;
      this.camera.targetX = this.camera.x;
      this.camera.targetY = this.camera.y;
      this.camera.zoom = 0.88;
      this.camera.targetZoom = 0.88;
      this.camera.isAnimating = false;
    } else {
      this.camera.isAnimating = true;
      this.camera.animStartTime = performance.now();
      this.camera.animDuration = 900;
      this.camera.animStartX = this.camera.x;
      this.camera.animStartY = this.camera.y;
      this.camera.animStartZoom = this.camera.zoom;
      this.camera.targetX = -centerIso.x;
      this.camera.targetY = -centerIso.y + 40;
      this.camera.targetZoom = 0.88;
    }
  }

  // Focus on specific district
  flyToDistrict(districtId) {
    const district = this.config.districts[districtId];
    if (district) {
      this.flyTo(district.center.col, district.center.row, 1.25);
    }
  }

  setupEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left click
      this.camera.isDragging = true;
      this.camera.dragStartX = e.clientX;
      this.camera.dragStartY = e.clientY;
      this.camera.cameraStartX = this.camera.x;
      this.camera.cameraStartY = this.camera.y;
      this.camera.isAnimating = false;
    });

    window.addEventListener('mousemove', (e) => {
      const rect = c.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (this.camera.isDragging) {
        const dx = (e.clientX - this.camera.dragStartX) / this.camera.zoom;
        const dy = (e.clientY - this.camera.dragStartY) / this.camera.zoom;
        this.camera.x = this.camera.cameraStartX + dx;
        this.camera.y = this.camera.cameraStartY + dy;
        this.camera.targetX = this.camera.x;
        this.camera.targetY = this.camera.y;
      } else {
        // Hit test nodes for hover
        this.handlePointerMove(mouseX, mouseY);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.camera.isDragging) {
        this.camera.isDragging = false;
        const moveDist = Math.hypot(e.clientX - this.camera.dragStartX, e.clientY - this.camera.dragStartY);
        if (moveDist < 6) {
          // It was a click, not a drag!
          const rect = c.getBoundingClientRect();
          this.handlePointerClick(e.clientX - rect.left, e.clientY - rect.top);
        }
      }
    });

    // Zoom via wheel
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.45, Math.min(2.8, this.camera.zoom * zoomFactor));
      this.camera.targetZoom = newZoom;
      this.camera.zoom = newZoom;
      this.camera.isAnimating = false;
    }, { passive: false });

    window.addEventListener('resize', () => this.resize());
  }

  // Convert mouse viewport coordinates to world coordinates
  screenToWorld(mouseX, mouseY) {
    const centerX = this.displayWidth / 2;
    const centerY = this.displayHeight / 2;
    const worldX = (mouseX - centerX) / this.camera.zoom - this.camera.x;
    const worldY = (mouseY - centerY) / this.camera.zoom - this.camera.y;
    return { worldX, worldY };
  }

  handlePointerMove(mouseX, mouseY) {
    const { worldX, worldY } = this.screenToWorld(mouseX, mouseY);
    let hitNode = null;

    // Check nodes in reverse drawing order (front nodes first)
    const sorted = [...this.nodes].sort((a, b) => (b.gridX + b.gridY) - (a.gridX + a.gridY));
    for (const node of sorted) {
      if (this.isPointInNode(worldX, worldY, node)) {
        hitNode = node;
        break;
      }
    }

    if (this.hoveredNode !== hitNode) {
      this.hoveredNode = hitNode;
      this.canvas.style.cursor = hitNode ? 'pointer' : 'grab';
      if (this.onNodeHoverCallback) {
        this.onNodeHoverCallback(hitNode);
      }
    }
  }

  handlePointerClick(mouseX, mouseY) {
    const { worldX, worldY } = this.screenToWorld(mouseX, mouseY);
    let hitNode = null;

    const sorted = [...this.nodes].sort((a, b) => (b.gridX + b.gridY) - (a.gridX + a.gridY));
    for (const node of sorted) {
      if (this.isPointInNode(worldX, worldY, node)) {
        hitNode = node;
        break;
      }
    }

    this.selectNode(hitNode);
  }

  selectNode(node) {
    this.selectedNode = node;
    if (node) {
      this.flyTo(node.gridX, node.gridY, 1.45);
    }
    if (this.onNodeClickCallback) {
      this.onNodeClickCallback(node);
    }
  }

  // Check if world coordinate falls inside building bounding box
  isPointInNode(wx, wy, node) {
    const baseIso = this.projectIso(node.gridX, node.gridY, 0);
    const topIso = this.projectIso(node.gridX, node.gridY, node.height);
    const halfW = (this.config.isoTileWidth * (node.width || 1)) / 2;
    const height = node.height + this.config.isoTileHeight;

    // Approximate hexagonal/diamond bounding area
    return (
      wx >= baseIso.x - halfW &&
      wx <= baseIso.x + halfW &&
      wy >= topIso.y - 20 &&
      wy <= baseIso.y + 20
    );
  }

  // Animation Update Loop
  update(dt) {
    this.pulsePhase += dt * 0.003;
    this.radarAngle += dt * 0.0008;

    // Update floating motes
    this.ambientMotes.forEach(m => {
      m.y += m.vy;
      m.x += m.vx;
      if (m.y < -800) m.y = 800;
      if (m.x < -1200) m.x = 1200;
      if (m.x > 1200) m.x = -1200;
    });

    // Camera animation tween
    if (this.camera.isAnimating) {
      const now = performance.now();
      const elapsed = now - this.camera.animStartTime;
      const progress = Math.min(1.0, elapsed / this.camera.animDuration);
      
      // Easing: easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.camera.x = this.camera.animStartX + (this.camera.targetX - this.camera.animStartX) * ease;
      this.camera.y = this.camera.animStartY + (this.camera.targetY - this.camera.animStartY) * ease;
      this.camera.zoom = this.camera.animStartZoom + (this.camera.targetZoom - this.camera.animStartZoom) * ease;

      if (progress >= 1.0) {
        this.camera.isAnimating = false;
      }
    }
  }

  // Main Render Routine
  render(particleEngine) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    // Apply Camera Transform
    ctx.save();
    ctx.translate(this.displayWidth / 2, this.displayHeight / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(this.camera.x, this.camera.y);

    // 1. Draw Deep Cyber Background & Ambient Foundation
    this.drawFoundation(ctx);

    // 2. Draw District Highlight Zones
    this.drawDistrictZones(ctx);

    // 3. Draw Isometric Grid Lines & Circuit Pathways
    this.drawGridAndCircuits(ctx);

    // 4. Draw Data Highway Conduits
    this.drawDataHighways(ctx);

    // 5. Draw Active Data Particles
    if (particleEngine) {
      particleEngine.render(ctx, (gx, gy, el) => this.projectIso(gx, gy, el));
    }

    // 6. Draw Buildings (depth-sorted from back to front)
    this.drawBuildings(ctx);

    // 7. Draw Dependency Arcs for Selected Node
    if (this.selectedNode) {
      this.drawDependencyArcs(ctx, this.selectedNode);
    }

    // 8. Draw Ambient Cyber Motes
    this.drawMotes(ctx);

    // 9. Draw Sweeping Radar Beam
    this.drawRadarSweep(ctx);

    ctx.restore();

    // 10. Screen-space HUD Overlays (Floating Labels)
    this.drawFloatingLabels(ctx);
  }

  drawFoundation(ctx) {
    // Dark metallic ground slab
    const center = this.projectIso(8, 8, 0);
    const grad = ctx.createRadialGradient(center.x, center.y, 100, center.x, center.y, 1400);
    grad.addColorStop(0, '#0a101d');
    grad.addColorStop(0.5, '#05070c');
    grad.addColorStop(1, '#020306');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center.x, center.y, 1600, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDistrictZones(ctx) {
    // Subtle glowing zones for each district
    for (const [key, d] of Object.entries(this.config.districts)) {
      const centerIso = this.projectIso(d.center.col, d.center.row, 0);
      const grad = ctx.createRadialGradient(centerIso.x, centerIso.y, 20, centerIso.x, centerIso.y, 260);
      grad.addColorStop(0, d.color + '1a');
      grad.addColorStop(0.7, d.color + '08');
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(centerIso.x, centerIso.y, 260, 0, Math.PI * 2);
      ctx.fill();

      // District watermark label on the ground
      ctx.save();
      ctx.font = '900 13px "JetBrains Mono", monospace';
      ctx.fillStyle = d.color + '33';
      ctx.textAlign = 'center';
      ctx.fillText(`// DISTRICT: ${d.name.toUpperCase()} //`, centerIso.x, centerIso.y + 110);
      ctx.restore();
    }
  }

  drawGridAndCircuits(ctx) {
    const { cols, rows } = this.config.gridSize;
    ctx.save();

    // Subtle isometric grid lines
    ctx.strokeStyle = this.config.colors.gridLines;
    ctx.lineWidth = 1;

    for (let c = 0; c <= cols; c++) {
      const p1 = this.projectIso(c, 0, 0);
      const p2 = this.projectIso(c, rows, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    for (let r = 0; r <= rows; r++) {
      const p1 = this.projectIso(0, r, 0);
      const p2 = this.projectIso(cols, r, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Grid Junction Crosses (+)
    ctx.fillStyle = 'rgba(0, 243, 255, 0.2)';
    for (let c = 0; c <= cols; c += 2) {
      for (let r = 0; r <= rows; r += 2) {
        const p = this.projectIso(c, r, 0);
        ctx.fillRect(p.x - 2, p.y - 0.5, 4, 1);
        ctx.fillRect(p.x - 0.5, p.y - 2, 1, 4);
      }
    }

    // Main Arterial Glowing Highway Lines
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.22)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 243, 255, 0.5)';
    ctx.shadowBlur = 10;

    // Horizontal & Vertical arterial avenues
    [6, 10].forEach(avenueCol => {
      const p1 = this.projectIso(avenueCol, 1, 0);
      const p2 = this.projectIso(avenueCol, rows - 1, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    [6, 10].forEach(avenueRow => {
      const p1 = this.projectIso(1, avenueRow, 0);
      const p2 = this.projectIso(cols - 1, avenueRow, 0);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    ctx.restore();
  }

  drawDataHighways(ctx) {
    ctx.save();
    this.connections.forEach(conn => {
      const fromNode = this.nodesMap.get(conn.from);
      const toNode = this.nodesMap.get(conn.to);
      if (!fromNode || !toNode) return;

      const p1 = this.projectIso(fromNode.gridX, fromNode.gridY, 0);
      const p2 = this.projectIso(toNode.gridX, toNode.gridY, 0);

      let strokeColor = 'rgba(0, 243, 255, 0.25)';
      let glowColor = 'rgba(0, 243, 255, 0.4)';
      let lineWidth = conn.isArterial ? 3 : 1.5;

      if (conn.health === 'warning') {
        strokeColor = 'rgba(255, 170, 0, 0.45)';
        glowColor = 'rgba(255, 170, 0, 0.6)';
      } else if (conn.health === 'critical') {
        strokeColor = 'rgba(255, 0, 85, 0.65)';
        glowColor = 'rgba(255, 0, 85, 0.8)';
        lineWidth = 3.5;
      } else if (conn.isPrivacyChannel) {
        strokeColor = 'rgba(0, 255, 170, 0.4)';
        glowColor = 'rgba(0, 255, 170, 0.5)';
      }

      ctx.strokeStyle = strokeColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = conn.isArterial ? 8 : 4;
      ctx.lineWidth = lineWidth;

      // Draw highway track
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Highway boundary dashed edge
      if (conn.isArterial) {
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = strokeColor.replace('0.25', '0.12').replace('0.45', '0.2').replace('0.65', '0.3');
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    ctx.restore();
  }

  drawBuildings(ctx) {
    // Sort buildings from back to front (top-left to bottom-right in isometric space)
    const sortedNodes = [...this.nodes].sort((a, b) => (a.gridX + a.gridY) - (b.gridX + b.gridY));

    sortedNodes.forEach(node => {
      this.drawSingleBuilding(ctx, node);
    });
  }

  drawSingleBuilding(ctx, node) {
    const isSelected = this.selectedNode === node;
    const isHovered = this.hoveredNode === node;
    const isIncident = node.status === 'critical';
    const isWarning = node.status === 'warning';
    const isOffline = node.status === 'offline';

    // If a node is selected, dim other non-related nodes slightly
    let opacity = 1.0;
    if (this.selectedNode && !isSelected) {
      const isRelated = this.selectedNode.dependencies.includes(node.id) || 
                        node.dependencies.includes(this.selectedNode.id);
      opacity = isRelated ? 0.9 : 0.35;
    }

    ctx.save();
    ctx.globalAlpha = opacity;

    const tileW = this.config.isoTileWidth;
    const tileH = this.config.isoTileHeight;
    const widthFactor = node.width || 1.0;
    const halfW = (tileW * widthFactor) / 2;
    const halfH = (tileH * widthFactor) / 2;
    const h = node.height;

    const base = this.projectIso(node.gridX, node.gridY, 0);
    const top = this.projectIso(node.gridX, node.gridY, h);

    // Color definitions based on health
    let themeColor = this.config.colors.healthy;
    let themeGlow = this.config.colors.healthyGlow;
    if (isIncident) {
      themeColor = this.config.colors.critical;
      themeGlow = this.config.colors.criticalGlow;
    } else if (isWarning) {
      themeColor = this.config.colors.warning;
      themeGlow = this.config.colors.warningGlow;
    } else if (node.district === 'LOCAL_COLLECTOR') {
      themeColor = this.config.colors.privacyShield;
      themeGlow = this.config.colors.privacyGlow;
    } else if (isOffline) {
      themeColor = this.config.colors.offline;
      themeGlow = this.config.colors.offlineGlow;
    }

    // 1. Base Glow / Drop-shadow on ground
    const groundPulse = isIncident ? Math.sin(this.pulsePhase * 4) * 0.3 + 0.7 : 0.8;
    const groundGlow = ctx.createRadialGradient(base.x, base.y, 10, base.x, base.y, halfW * 1.8);
    groundGlow.addColorStop(0, themeColor + (isIncident ? '55' : '33'));
    groundGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.ellipse(base.x, base.y, halfW * 1.8 * groundPulse, halfH * 1.8 * groundPulse, 0, 0, Math.PI * 2);
    ctx.fill();

    // Incident Expanding Warning Rings
    if (isIncident) {
      const ringProg = (this.pulsePhase * 2) % 1.0;
      const ringRadius = halfW * (1.2 + ringProg * 2.2);
      ctx.strokeStyle = `rgba(255, 0, 85, ${1 - ringProg})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(base.x, base.y, ringRadius, ringRadius * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Foundation Plate on Ground
    ctx.beginPath();
    ctx.moveTo(base.x, base.y - halfH);
    ctx.lineTo(base.x + halfW, base.y);
    ctx.lineTo(base.x, base.y + halfH);
    ctx.lineTo(base.x - halfW, base.y);
    ctx.closePath();
    ctx.fillStyle = '#060a12';
    ctx.fill();
    ctx.strokeStyle = themeColor + '66';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Left Facade (Darker side)
    ctx.beginPath();
    ctx.moveTo(base.x - halfW, base.y);
    ctx.lineTo(base.x, base.y + halfH);
    ctx.lineTo(top.x, top.y + halfH);
    ctx.lineTo(top.x - halfW, top.y);
    ctx.closePath();
    const leftGrad = ctx.createLinearGradient(base.x - halfW, base.y, top.x, top.y + halfH);
    leftGrad.addColorStop(0, '#0a101d');
    leftGrad.addColorStop(1, '#0e1628');
    ctx.fillStyle = leftGrad;
    ctx.fill();
    ctx.strokeStyle = themeColor + (isSelected ? 'ff' : '44');
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Right Facade (Illuminated side)
    ctx.beginPath();
    ctx.moveTo(base.x, base.y + halfH);
    ctx.lineTo(base.x + halfW, base.y);
    ctx.lineTo(top.x + halfW, top.y);
    ctx.lineTo(top.x, top.y + halfH);
    ctx.closePath();
    const rightGrad = ctx.createLinearGradient(base.x, base.y + halfH, top.x + halfW, top.y);
    rightGrad.addColorStop(0, '#111b2f');
    rightGrad.addColorStop(1, '#16233d');
    ctx.fillStyle = rightGrad;
    ctx.fill();
    ctx.strokeStyle = themeColor + (isSelected ? 'ff' : '55');
    ctx.lineWidth = 1;
    ctx.stroke();

    // 4. Glowing Windows / Server Slots on Facades
    this.drawBuildingWindows(ctx, base, top, halfW, halfH, h, node, themeColor, isIncident);

    // 5. Roof Face (Top)
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - halfH);
    ctx.lineTo(top.x + halfW, top.y);
    ctx.lineTo(top.x, top.y + halfH);
    ctx.lineTo(top.x - halfW, top.y);
    ctx.closePath();
    const roofGrad = ctx.createLinearGradient(top.x - halfW, top.y, top.x + halfW, top.y);
    roofGrad.addColorStop(0, '#1a2742');
    roofGrad.addColorStop(1, '#233355');
    ctx.fillStyle = roofGrad;
    ctx.fill();
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.stroke();

    // 6. Roof Features (Antennas, Holograms, Helipads, Quantum Cores)
    this.drawRoofFeatures(ctx, top, halfW, halfH, node, themeColor);

    // 7. Tactical Selection Brackets [  ] & Target Beam
    if (isSelected) {
      this.drawSelectionTarget(ctx, base, top, halfW, halfH, h, themeColor);
    } else if (isHovered) {
      // Gentle hover outline
      ctx.strokeStyle = themeColor;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }

  drawBuildingWindows(ctx, base, top, halfW, halfH, h, node, themeColor, isIncident) {
    ctx.save();
    const floors = Math.floor(h / 16);
    const windowColor = isIncident ? '#ff0055' : (node.windowColor || '#00f3ff');

    ctx.fillStyle = windowColor;
    ctx.shadowColor = windowColor;
    ctx.shadowBlur = isIncident ? 8 : 4;

    // Draw horizontal slit windows along the right facade
    for (let f = 1; f < floors; f++) {
      const prog = f / floors;
      const leftY = base.y + halfH - (h * prog);
      const rightX = base.x + (halfW * 0.75);
      const rightY = base.y + (halfH * 0.25) - (h * prog);

      // Pseudo-random window activity
      const seed = Math.sin(f * 13 + node.gridX * 7);
      if (seed > -0.4) {
        ctx.globalAlpha = 0.65 + (Math.sin(this.pulsePhase * 3 + f) * 0.25);
        ctx.beginPath();
        ctx.moveTo(base.x + 8, leftY - 2);
        ctx.lineTo(rightX - 4, rightY - 2);
        ctx.lineTo(rightX - 4, rightY);
        ctx.lineTo(base.x + 8, leftY);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw vertical server blade slots on the left facade
    ctx.fillStyle = themeColor;
    ctx.globalAlpha = 0.55;
    const slots = 3;
    for (let s = 1; s <= slots; s++) {
      const slotProg = s / (slots + 1);
      const x1 = base.x - (halfW * slotProg);
      const y1 = base.y + (halfH * (1 - slotProg));
      ctx.fillRect(x1 - 1, y1 - h + 10, 2, h - 20);
    }

    ctx.restore();
  }

  drawRoofFeatures(ctx, top, halfW, halfH, node, themeColor) {
    ctx.save();
    const style = node.roofStyle || 'flat';

    if (style === 'antenna-array' || style === 'spinning-radar') {
      // Tall comm mast with blinking beacon
      ctx.strokeStyle = '#8da4c4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x, top.y - 32);
      ctx.stroke();

      // Horizontal antenna crossbars
      ctx.beginPath();
      ctx.moveTo(top.x - 8, top.y - 18);
      ctx.lineTo(top.x + 8, top.y - 18);
      ctx.moveTo(top.x - 5, top.y - 25);
      ctx.lineTo(top.x + 5, top.y - 25);
      ctx.stroke();

      // Blinking beacon light at tip
      const beaconOn = Math.sin(this.pulsePhase * 6) > 0;
      ctx.fillStyle = beaconOn ? '#ff0055' : '#00f3ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(top.x, top.y - 34, 3, 0, Math.PI * 2);
      ctx.fill();

    } else if (style === 'hologram-pad' || style === 'glowing-disc') {
      // Spinning holographic target disc on roof
      const discR = halfW * 0.55;
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.ellipse(top.x, top.y, discR, discR * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Spinning crosshairs
      const angle = this.pulsePhase * 2;
      const cosA = Math.cos(angle) * discR;
      const sinA = Math.sin(angle) * discR * 0.45;
      ctx.beginPath();
      ctx.moveTo(top.x - cosA, top.y - sinA);
      ctx.lineTo(top.x + cosA, top.y + sinA);
      ctx.stroke();

    } else if (style === 'shield-dome' || style === 'quantum-core') {
      // Glowing quantum spherical dome
      const domeR = halfW * 0.5;
      const grad = ctx.createRadialGradient(top.x, top.y - 10, 2, top.x, top.y - 10, domeR);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, themeColor);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(top.x, top.y - 10, domeR, Math.PI, 0, false);
      ctx.fill();
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 2;
      ctx.stroke();

    } else if (style === 'helipad') {
      // Glowing Tactical Helipad 'H'
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillStyle = themeColor;
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 6;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('[ H ]', top.x, top.y);

    } else if (style === 'beacon') {
      // Vertical laser pulse beacon
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x, top.y - 15);
      ctx.stroke();
      ctx.fillStyle = themeColor;
      ctx.beginPath();
      ctx.arc(top.x, top.y - 15, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawSelectionTarget(ctx, base, top, halfW, halfH, h, themeColor) {
    ctx.save();
    // Tactical HUD corner brackets around building
    const bOffset = 18;
    const bracketSize = 10;
    const topY = top.y - bOffset;
    const botY = base.y + halfH + bOffset;
    const leftX = base.x - halfW - bOffset;
    const rightX = base.x + halfW + bOffset;

    ctx.strokeStyle = themeColor;
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(leftX, topY + bracketSize);
    ctx.lineTo(leftX, topY);
    ctx.lineTo(leftX + bracketSize, topY);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(rightX - bracketSize, topY);
    ctx.lineTo(rightX, topY);
    ctx.lineTo(rightX, topY + bracketSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(leftX, botY - bracketSize);
    ctx.lineTo(leftX, botY);
    ctx.lineTo(leftX + bracketSize, botY);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(rightX - bracketSize, botY);
    ctx.lineTo(rightX, botY);
    ctx.lineTo(rightX, botY - bracketSize);
    ctx.stroke();

    // Vertical Target Guide Beam from above
    const beamGrad = ctx.createLinearGradient(top.x, top.y - 200, top.x, top.y);
    beamGrad.addColorStop(0, 'transparent');
    beamGrad.addColorStop(0.8, themeColor + '66');
    beamGrad.addColorStop(1, themeColor);
    ctx.strokeStyle = beamGrad;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y - 200);
    ctx.lineTo(top.x, top.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  drawDependencyArcs(ctx, selectedNode) {
    ctx.save();
    const sourceTop = this.projectIso(selectedNode.gridX, selectedNode.gridY, selectedNode.height);

    selectedNode.dependencies.forEach(depId => {
      const targetNode = this.nodesMap.get(depId);
      if (!targetNode) return;

      const targetTop = this.projectIso(targetNode.gridX, targetNode.gridY, targetNode.height);

      // Elevated curved bezier arc
      const midX = (sourceTop.x + targetTop.x) / 2;
      const midY = Math.min(sourceTop.y, targetTop.y) - 60; // Arches upward into cyber space

      const arcGrad = ctx.createLinearGradient(sourceTop.x, sourceTop.y, targetTop.x, targetTop.y);
      arcGrad.addColorStop(0, '#00f3ff');
      arcGrad.addColorStop(0.5, '#bd00ff');
      arcGrad.addColorStop(1, targetNode.status === 'critical' ? '#ff0055' : '#00f3ff');

      ctx.strokeStyle = arcGrad;
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);

      ctx.beginPath();
      ctx.moveTo(sourceTop.x, sourceTop.y);
      ctx.quadraticCurveTo(midX, midY, targetTop.x, targetTop.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flowing indicator along arc
      const prog = (this.pulsePhase * 3) % 1.0;
      const t = prog;
      const invT = 1 - t;
      const pX = invT * invT * sourceTop.x + 2 * invT * t * midX + t * t * targetTop.x;
      const pY = invT * invT * sourceTop.y + 2 * invT * t * midY + t * t * targetTop.y;

      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pX, pY, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  drawMotes(ctx) {
    ctx.save();
    this.ambientMotes.forEach(m => {
      ctx.fillStyle = m.color;
      ctx.globalAlpha = m.alpha;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawRadarSweep(ctx) {
    ctx.save();
    const center = this.projectIso(8, 8, 0);
    const radius = 1100;

    ctx.translate(center.x, center.y);
    ctx.rotate(this.radarAngle);

    const grad = ctx.createRadialGradient(0, 0, 50, 0, 0, radius);
    grad.addColorStop(0, 'rgba(0, 243, 255, 0.08)');
    grad.addColorStop(0.7, 'rgba(0, 243, 255, 0.02)');
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, 0, Math.PI / 4);
    ctx.closePath();
    ctx.fill();

    // Leading laser beam
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    ctx.restore();
  }

  drawFloatingLabels(ctx) {
    // Only draw floating tags for hovered or selected node, or critical incidents
    const nodesToLabel = this.nodes.filter(n => n === this.hoveredNode || n === this.selectedNode || n.status === 'critical');

    nodesToLabel.forEach(node => {
      const topIso = this.projectIso(node.gridX, node.gridY, node.height);
      // Project into canvas screen space
      const screenX = (this.displayWidth / 2) + (topIso.x + this.camera.x) * this.camera.zoom;
      const screenY = (this.displayHeight / 2) + (topIso.y - 25 + this.camera.y) * this.camera.zoom;

      this.renderFloatingHUDTag(ctx, screenX, screenY, node);
    });
  }

  renderFloatingHUDTag(ctx, x, y, node) {
    ctx.save();
    const isCritical = node.status === 'critical';
    const isWarning = node.status === 'warning';
    let borderColor = '#00f3ff';
    let tagText = 'NORMAL';
    if (isCritical) {
      borderColor = '#ff0055';
      tagText = 'CRITICAL';
    } else if (isWarning) {
      borderColor = '#ffaa00';
      tagText = 'WARNING';
    } else if (node.district === 'LOCAL_COLLECTOR') {
      borderColor = '#00ffaa';
      tagText = 'ENCLAVE';
    }

    const title = node.name;
    const sub = `${node.type} | ${node.metrics.latency}ms | CPU ${node.metrics.cpu}%`;

    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    const titleW = ctx.measureText(title).width;
    ctx.font = '9px "JetBrains Mono", monospace';
    const subW = ctx.measureText(sub).width;
    const boxW = Math.max(titleW, subW) + 24;
    const boxH = 34;

    const boxX = x - boxW / 2;
    const boxY = y - boxH - 10;

    // Callout pointer triangle
    ctx.fillStyle = 'rgba(6, 11, 20, 0.92)';
    ctx.beginPath();
    ctx.moveTo(x - 5, boxY + boxH);
    ctx.lineTo(x, boxY + boxH + 6);
    ctx.lineTo(x + 5, boxY + boxH);
    ctx.fill();

    // Box background
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    // Status pill
    ctx.fillStyle = borderColor;
    ctx.fillRect(boxX + 4, boxY + 6, 4, 10);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title, boxX + 12, boxY + 14);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(sub, boxX + 12, boxY + 27);

    ctx.restore();
  }
}

window.SentinelIsometricEngine = SentinelIsometricEngine;

