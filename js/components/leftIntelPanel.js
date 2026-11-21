/**
 * SENTINEL AI - Left Tactical Intelligence Panel
 * Context-sensitive intel for currently hovered or selected region/site/node.
 * Collapsible on laptop screens.
 */

class SentinelLeftIntelPanel {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;
    this.isCollapsed = false;

    this.render();
    this.bindStoreUpdates();
  }

  render() {
    this.container.innerHTML = `
      <div class="intel-panel-card" id="intel-panel-card">
        <div class="intel-header">
          <div class="intel-tag">// TACTICAL_INTEL //</div>
          <button class="tactical-btn icon-btn mini" id="btn-collapse-intel" title="Collapse Panel">◀</button>
        </div>

        <div class="intel-body" id="intel-body-content">
          <h3 class="intel-title" id="intel-title">AETHELGARD EDGE</h3>
          <span class="intel-sub" id="intel-role">Global Ingress & Edge CDN</span>

          <div class="intel-metrics-grid">
            <div class="intel-m-item">
              <span class="m-label">HEALTH STATE:</span>
              <span class="m-val text-cyan" id="intel-health">NOMINAL</span>
            </div>
            <div class="intel-m-item">
              <span class="m-label">P99 LATENCY:</span>
              <span class="m-val" id="intel-latency">8.4 ms</span>
            </div>
            <div class="intel-m-item">
              <span class="m-label">THROUGHPUT:</span>
              <span class="m-val" id="intel-throughput">64,000 req/s</span>
            </div>
            <div class="intel-m-item">
              <span class="m-label">MONITORED NODES:</span>
              <span class="m-val text-emerald" id="intel-nodes">280 ENTITIES</span>
            </div>
          </div>

          <div class="intel-section-title">ACTIVE CONNECTED SITES</div>
          <div class="intel-chips-list" id="intel-sites-list">
            <!-- Dynamically populated -->
          </div>

          <div class="intel-actions">
            <button class="tactical-btn mini primary" id="btn-intel-focus">⌖ FOCUS SECTOR</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const collapseBtn = document.getElementById('btn-collapse-intel');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.isCollapsed = !this.isCollapsed;
        this.container.classList.toggle('collapsed', this.isCollapsed);
        collapseBtn.textContent = this.isCollapsed ? '▶' : '◀';
      });
    }

    const focusBtn = document.getElementById('btn-intel-focus');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        const selRegId = this.store.viewState.selectedRegionId;
        const reg = this.store.regionsMap.get(selRegId) || this.store.regions[0];
        this.tableEngine.flyTo(reg.cx, reg.cy, 2.2);
      });
    }
  }

  bindStoreUpdates() {
    this.store.subscribe((state) => {
      this.updateContent(state);
    });
  }

  updateContent(state) {
    const titleEl = document.getElementById('intel-title');
    const roleEl = document.getElementById('intel-role');
    const healthEl = document.getElementById('intel-health');
    const latEl = document.getElementById('intel-latency');
    const tpsEl = document.getElementById('intel-throughput');
    const nodesEl = document.getElementById('intel-nodes');
    const sitesListEl = document.getElementById('intel-sites-list');

    if (!titleEl) return;

    let target = null;
    let type = 'region';

    // Prioritize selected node -> selected site -> selected region -> default
    if (state.viewState.selectedNodeId) {
      target = state.nodesMap.get(state.viewState.selectedNodeId);
      type = 'node';
    } else if (state.viewState.selectedSiteId) {
      target = state.sitesMap.get(state.viewState.selectedSiteId);
      type = 'site';
    } else if (state.viewState.selectedRegionId) {
      target = state.regionsMap.get(state.viewState.selectedRegionId);
      type = 'region';
    } else if (state.viewState.hoveredEntity) {
      target = state.viewState.hoveredEntity.entity;
      type = state.viewState.hoveredEntity.type;
    } else {
      target = state.regions[0];
    }

    if (!target) return;

    titleEl.textContent = target.name.toUpperCase();
    roleEl.textContent = target.role || target.type || 'Monitored Infrastructure';

    const isCrit = target.health === 'critical';
    const isWarn = target.health === 'warning';
    healthEl.textContent = isCrit ? 'CRITICAL ALERT' : isWarn ? 'DEGRADED' : 'NOMINAL';
    healthEl.className = `m-val ${isCrit ? 'text-red' : isWarn ? 'text-amber' : 'text-cyan'}`;

    latEl.textContent = `${target.metrics?.latency || 12} ms`;
    tpsEl.textContent = `${(target.metrics?.throughput || 42000).toLocaleString()} req/s`;
    nodesEl.textContent = `${target.nodesCount || target.serversCount || 1} ENTITIES`;

    // Populate sites or dependencies
    if (sitesListEl) {
      sitesListEl.innerHTML = '';
      if (type === 'region') {
        const sites = state.sites.filter(s => s.regionId === target.id);
        sites.forEach(s => {
          const chip = document.createElement('span');
          chip.className = `intel-chip ${s.health}`;
          chip.textContent = s.name;
          chip.addEventListener('click', () => {
            this.tableEngine.flyTo(s.x, s.y, 4.2);
            this.store.selectEntity(s, 'site');
          });
          sitesListEl.appendChild(chip);
        });
      } else {
        const chip = document.createElement('span');
        chip.className = 'intel-chip';
        chip.textContent = `PARENT: ${target.siteId || target.regionId || 'GLOBAL'}`;
        sitesListEl.appendChild(chip);
      }
    }
  }
}

window.SentinelLeftIntelPanel = SentinelLeftIntelPanel;

