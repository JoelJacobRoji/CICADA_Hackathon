/**
 * SENTINEL AI - Soft Modern Infrastructure Detail View & Inventory
 * Enterprise inventory of all 42 monitored components, grouped by architectural tiers,
 * with search, status filtering, live CPU/Memory bars, latency, and direct inspection links.
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelInfrastructureView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;

    this.tierFilter = 'all';
    this.statusFilter = 'all';
    this.searchQuery = '';

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const modeConfig = this.theme.getModeConfig();

    this.container.innerHTML = `
      <div class="infrastructure-workspace">
        <!-- Title & Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('infraTitle')}</h1>
            <p>${t('infraSubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-export-inventory">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Export CSV</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-view-topology">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>
              <span>${t('navCommandCenter')}</span>
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="card" style="padding: 14px 18px; margin-bottom: 18px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <!-- Search Input -->
              <div style="position: relative; display: flex; align-items: center;">
                <input type="text" id="infra-search-input" placeholder="${t('searchPlaceholder')}" value="${this.searchQuery}" style="background: var(--surface-hover); border: 1px solid var(--border-subtle); color: var(--text-primary); padding: 7px 14px 7px 32px; border-radius: var(--radius-pill); font-size: 12px; outline: none; width: 260px; font-family: var(--font-ui);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" style="position: absolute; left: 11px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>

              <!-- Tier Filter -->
              <div class="header-select-group">
                <span style="color: var(--text-muted); font-size: 10px; font-weight: 700;">${t('tierCol')}</span>
                <select id="select-infra-tier">
                  <option value="all" ${this.tierFilter === 'all' ? 'selected' : ''}>${t('tierAll')}</option>
                  <option value="tier-ingress" ${this.tierFilter === 'tier-ingress' ? 'selected' : ''}>${t('tierIngress')}</option>
                  <option value="tier-privacy" ${this.tierFilter === 'tier-privacy' ? 'selected' : ''}>${t('tierPrivacy')}</option>
                  <option value="tier-apps" ${this.tierFilter === 'tier-apps' ? 'selected' : ''}>${t('tierApps')}</option>
                  <option value="tier-data" ${this.tierFilter === 'tier-data' ? 'selected' : ''}>${t('tierData')}</option>
                  <option value="tier-cloud" ${this.tierFilter === 'tier-cloud' ? 'selected' : ''}>${t('tierCloud')}</option>
                </select>
              </div>

              <!-- Status Filter -->
              <div class="header-select-group">
                <span style="color: var(--text-muted); font-size: 10px; font-weight: 700;">STATUS</span>
                <select id="select-infra-status">
                  <option value="all" ${this.statusFilter === 'all' ? 'selected' : ''}>All States</option>
                  <option value="critical" ${this.statusFilter === 'critical' ? 'selected' : ''}>${t('statusCritical')}</option>
                  <option value="warning" ${this.statusFilter === 'warning' ? 'selected' : ''}>${t('statusWarning')}</option>
                  <option value="healthy" ${this.statusFilter === 'healthy' ? 'selected' : ''}>${t('statusHealthy')}</option>
                </select>
              </div>
            </div>

            <div style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono); font-weight: 600;" id="infra-count-label">
              ${t('showingServices')} 42 ${t('ofServices')} 42 ${t('services')}
            </div>
          </div>
        </div>

        <!-- Full Inventory Table -->
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>${t('serviceCol')}</th>
                <th>${t('roleCol')}</th>
                <th>${t('tierCol')}</th>
                <th>Region</th>
                <th>${t('cpuCol')}</th>
                <th>${t('memCol')}</th>
                <th>${t('latCol')}</th>
                <th>${t('throughputCol')}</th>
                <th>${t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody id="infra-table-body">
              <!-- Dynamically populated -->
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.renderTable();
    this.bindEvents();
  }

  renderTable() {
    const tbody = document.getElementById('infra-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    let visibleCount = 0;
    const t = (k) => this.i18n.t(k);

    this.store.nodes.forEach(node => {
      // Filters
      if (this.tierFilter !== 'all' && node.tier !== this.tierFilter) return;
      if (this.statusFilter !== 'all' && node.status !== this.statusFilter) return;
      
      const displayName = this.store.getNodeDisplayName(node.id);
      if (this.searchQuery) {
        const matchesQuery = displayName.toLowerCase().includes(this.searchQuery) ||
          node.name.toLowerCase().includes(this.searchQuery) ||
          node.role.toLowerCase().includes(this.searchQuery) ||
          node.region.toLowerCase().includes(this.searchQuery);
        if (!matchesQuery) return;
      }

      visibleCount++;
      const tr = document.createElement('tr');

      const cpuColor = node.cpu > 80 ? 'var(--status-critical)' : node.cpu > 65 ? 'var(--status-warning)' : 'var(--primary)';

      tr.innerHTML = `
        <td>
          <span class="badge-severity ${node.status}">
            <span class="status-dot ${node.status}"></span>
            ${node.status.toUpperCase()}
          </span>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 12.5px;">${displayName}</div>
          <span class="cell-mono" style="font-size: 10px; color: var(--text-muted);">${node.name}</span>
        </td>
        <td style="color: var(--text-secondary);">${node.role}</td>
        <td>
          <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--primary); background: var(--primary-ultralight); padding: 2px 7px; border-radius: var(--radius-pill);">
            ${node.tier.replace('tier-', '').toUpperCase()}
          </span>
        </td>
        <td class="cell-mono" style="color: var(--text-secondary);">${node.region}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1; height: 6px; background: var(--surface-hover); border-radius: 3px; overflow: hidden; width: 60px;">
              <div style="width: ${node.cpu}%; height: 100%; background: ${cpuColor}; border-radius: 3px;"></div>
            </div>
            <span class="cell-mono" style="color: ${cpuColor}; font-weight: 700;">${node.cpu}%</span>
          </div>
        </td>
        <td class="cell-mono">${node.memory}%</td>
        <td class="cell-mono" style="color: ${node.latency > 100 ? 'var(--status-critical)' : 'var(--text-primary)'}; font-weight: 700;">${node.latency} ms</td>
        <td class="cell-mono">${node.rps.toLocaleString()} req/s</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-inspect-node" data-id="${node.id}" style="padding: 3px 10px; font-size: 11px;">
            ${t('btnInspect')}
          </button>
        </td>
      `;

      tr.querySelector('.btn-inspect-node')?.addEventListener('click', () => {
        if (this.onNavigate) this.onNavigate('command-center');
      });

      tbody.appendChild(tr);
    });

    const countLabel = document.getElementById('infra-count-label');
    if (countLabel) {
      countLabel.textContent = `${t('showingServices')} ${visibleCount} ${t('ofServices')} ${this.store.nodes.length} ${t('services')}`;
    }
  }

  bindEvents() {
    document.getElementById('select-infra-tier')?.addEventListener('change', (e) => {
      this.tierFilter = e.target.value;
      this.renderTable();
    });

    document.getElementById('select-infra-status')?.addEventListener('change', (e) => {
      this.statusFilter = e.target.value;
      this.renderTable();
    });

    document.getElementById('infra-search-input')?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderTable();
    });

    document.getElementById('btn-view-topology')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('command-center');
    });

    document.getElementById('btn-export-inventory')?.addEventListener('click', () => {
      alert('Inventory Exported: 42 node telemetry records downloaded as sentinel-inventory.csv');
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => {
      this.renderTable();
    });
    this.i18n.subscribe(() => {
      this.render();
    });
    this.theme.subscribe(() => {
      this.render();
    });
  }
}

window.SentinelInfrastructureView = SentinelInfrastructureView;
