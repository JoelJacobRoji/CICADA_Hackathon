/**
 * SENTINEL AI - Modern Fintech Interactive Infrastructure Topology Engine
 * Canvas 2D animated directional flows with soft gradient particle paths,
 * mode-aware node names, live metric badges, and smooth pan/zoom.
 */

class EnterpriseTopologyEngine {
  constructor(canvas, container, store, onNodeSelected) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container;
    this.store = store;
    this.theme = window.sentinelTheme;
    this.i18n = window.sentinelI18n;
    this.onNodeSelected = onNodeSelected;

    this.selectedNodeId = 'node-pg-primary';
    this.hoveredNodeId = null;
    this.activeTierFilter = 'all';
    this.searchQuery = '';

    // Transform State
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Traffic Flow Particles
    this.particles = [];
    this.initParticles();

    // DOM Nodes overlay container
    this.nodesOverlay = document.createElement('div');
    this.nodesOverlay.className = 'topology-nodes-overlay';
    this.nodesOverlay.style.position = 'absolute';
    this.nodesOverlay.style.inset = '0';
    this.nodesOverlay.style.pointerEvents = 'none';
    this.container.appendChild(this.nodesOverlay);

    this.setupEvents();
    this.resize();
    this.renderDOMNodes();

    // Re-render when theme or language changes
    this.theme?.subscribe(() => this.renderDOMNodes());
    this.i18n?.subscribe(() => this.renderDOMNodes());

    // Start 60fps render loop
    this.renderLoop();
  }

  initParticles() {
    this.particles = [];
    const links = this.store.links;
    links.forEach(link => {
      const particleCount = link.status === 'critical' ? 6 : 3;
      for (let i = 0; i < particleCount; i++) {
        this.particles.push({
          link,
          prog: Math.random(),
          speed: (link.status === 'critical' ? 0.007 : 0.0035) * (0.8 + Math.random() * 0.4)
        });
      }
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 1000;
    this.height = rect.height || 460;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setupEvents() {
    this.container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.topo-node') || e.target.closest('.tier-filter-btn') || e.target.closest('.btn')) return;
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.updateOverlayTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.container.style.cursor = 'default';
    });

    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.06 : 0.94;
      this.scale = Math.min(1.6, Math.max(0.65, this.scale * zoomFactor));
      this.updateOverlayTransform();
    }, { passive: false });
  }

  setTierFilter(tierId) {
    this.activeTierFilter = tierId;
    this.renderDOMNodes();
  }

  setSearchQuery(q) {
    this.searchQuery = q.toLowerCase().trim();
    this.renderDOMNodes();
  }

  resetView() {
    this.scale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.updateOverlayTransform();
  }

  updateOverlayTransform() {
    this.nodesOverlay.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this.nodesOverlay.style.transformOrigin = '0 0';
  }

  renderDOMNodes() {
    this.nodesOverlay.innerHTML = '';
    const t = (k) => this.i18n.t(k);

    // Tier Header Markers
    const tierLanes = [
      { name: t('tierIngress'), x: 80 },
      { name: t('tierPrivacy'), x: 330 },
      { name: t('tierApps'), x: 500 },
      { name: t('tierData'), x: 730 },
      { name: t('tierCloud'), x: 940 }
    ];

    tierLanes.forEach(tl => {
      const laneEl = document.createElement('div');
      laneEl.style.cssText = 'position: absolute; top: 12px; padding: 4px 12px; border-radius: 9999px; font-size: 10px; font-weight: 700; color: var(--text-muted); background: var(--surface-hover); border: 1px solid var(--border-subtle); pointer-events: none;';
      laneEl.textContent = tl.name;
      laneEl.style.left = `${tl.x}px`;
      this.nodesOverlay.appendChild(laneEl);
    });

    // Render Nodes
    this.store.nodes.forEach(node => {
      if (this.activeTierFilter !== 'all' && node.tier !== this.activeTierFilter) return;

      const displayName = this.store.getNodeDisplayName(node.id);
      if (this.searchQuery && !displayName.toLowerCase().includes(this.searchQuery) && !node.role.toLowerCase().includes(this.searchQuery)) {
        return;
      }

      const card = document.createElement('div');
      card.className = `topo-node ${node.status} ${node.id === this.selectedNodeId ? 'selected' : ''}`;
      card.style.left = `${node.x}px`;
      card.style.top = `${node.y}px`;
      card.style.pointerEvents = 'auto';
      card.setAttribute('data-id', node.id);

      const statusColor = node.status === 'healthy' ? 'var(--status-healthy)' :
                          node.status === 'warning' ? 'var(--status-warning)' : '#EF4444';

      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: ${statusColor}; flex-shrink: 0;"></span>
            <span class="node-title-light" title="${displayName}">${displayName}</span>
          </div>
          <span style="font-size: 9px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase;">${node.type}</span>
        </div>
        <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${node.role}">${node.role}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; font-family: var(--font-mono); color: var(--text-secondary);">
          <span>CPU: <strong style="color: ${node.cpu > 80 ? '#EF4444' : 'var(--text-primary)'}">${node.cpu}%</strong></span>
          <span>LAT: <strong>${node.latency}ms</strong></span>
        </div>
      `;

      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectNode(node.id);
      });

      card.addEventListener('mouseenter', () => {
        this.hoveredNodeId = node.id;
      });

      card.addEventListener('mouseleave', () => {
        this.hoveredNodeId = null;
      });

      this.nodesOverlay.appendChild(card);
    });

    this.updateOverlayTransform();
  }

  selectNode(nodeId) {
    this.selectedNodeId = nodeId;
    const cards = this.nodesOverlay.querySelectorAll('.topo-node');
    cards.forEach(c => {
      c.classList.toggle('selected', c.getAttribute('data-id') === nodeId);
    });

    const node = this.store.nodesMap.get(nodeId);
    if (node && this.onNodeSelected) {
      this.onNodeSelected(node);
    }
  }

  renderLoop() {
    this.drawCanvas();
    requestAnimationFrame(() => this.renderLoop());
  }

  drawCanvas() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.scale, this.scale);

    const primaryColor = this.theme?.getModeConfig()?.palette?.primary || '#7C5CFF';

    // Draw Smooth Connections
    this.store.links.forEach(link => {
      const src = link.sourceNode;
      const dst = link.targetNode;
      if (!src || !dst) return;

      if (this.activeTierFilter !== 'all') {
        if (src.tier !== this.activeTierFilter && dst.tier !== this.activeTierFilter) return;
      }

      const x1 = src.x + 175;
      const y1 = src.y + 35;
      const x2 = dst.x;
      const y2 = dst.y + 35;

      const isRelated = this.selectedNodeId ? (link.source === this.selectedNodeId || link.target === this.selectedNodeId) : false;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const cx1 = x1 + (x2 - x1) * 0.5;
      const cy1 = y1;
      const cx2 = x1 + (x2 - x1) * 0.5;
      const cy2 = y2;
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2);

      if (isRelated) {
        ctx.strokeStyle = link.status === 'critical' ? '#EF4444' : primaryColor;
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = link.status === 'critical' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(215, 208, 245, 0.65)';
        ctx.lineWidth = 1.2;
      }
      ctx.stroke();
    });

    // Draw Animated Traffic Flow Particles
    this.particles.forEach(p => {
      p.prog += p.speed;
      if (p.prog >= 1.0) p.prog = 0;

      const link = p.link;
      const src = link.sourceNode;
      const dst = link.targetNode;
      if (!src || !dst) return;

      const x1 = src.x + 175;
      const y1 = src.y + 35;
      const x2 = dst.x;
      const y2 = dst.y + 35;

      const cx1 = x1 + (x2 - x1) * 0.5;
      const cy1 = y1;
      const cx2 = x1 + (x2 - x1) * 0.5;
      const cy2 = y2;

      const t = p.prog;
      const inv = 1 - t;
      const px = inv * inv * inv * x1 + 3 * inv * inv * t * cx1 + 3 * inv * t * t * cx2 + t * t * t * x2;
      const py = inv * inv * inv * y1 + 3 * inv * inv * t * cy1 + 3 * inv * t * t * cy2 + t * t * t * y2;

      ctx.beginPath();
      ctx.arc(px, py, link.status === 'critical' ? 2.8 : 2.0, 0, Math.PI * 2);
      ctx.fillStyle = link.status === 'critical' ? '#EF4444' : primaryColor;
      ctx.fill();
    });

    ctx.restore();
  }
}

window.EnterpriseTopologyEngine = EnterpriseTopologyEngine;
