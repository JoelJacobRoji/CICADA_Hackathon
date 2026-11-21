/**
 * SENTINEL AI - Modern Fintech Left Sidebar
 * Slim, pill-shaped active state with hero gradient,
 * clean icons, localized labels, and breathing room.
 */

class SentinelSidebar {
  constructor(container, onNavigate, store) {
    this.container = container;
    this.onNavigate = onNavigate;
    this.store = store;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;
    this.currentRoute = 'command-center';

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const incidentCount = this.store.globalMetrics.activeIncidentsCount;

    this.container.innerHTML = `
      <aside id="sidebar">
        <!-- Brand Header -->
        <div class="sidebar-brand">
          <div class="brand-left">
            <div class="brand-icon-pill">S</div>
            <div class="brand-titles">
              <span class="brand-name">SENTINEL AI</span>
              <span class="brand-subtitle">${t('appSubtitle')}</span>
            </div>
          </div>
        </div>

        <!-- Navigation Groups -->
        <nav class="sidebar-nav">
          <!-- OVERVIEW -->
          <div class="nav-group">
            <div class="nav-group-title">${t('navOverview')}</div>
            <div class="nav-group-items">
              <a class="nav-link ${this.currentRoute === 'command-center' ? 'active' : ''}" data-route="command-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                <span>${t('navCommandCenter')}</span>
              </a>
            </div>
          </div>

          <!-- OPERATIONS -->
          <div class="nav-group">
            <div class="nav-group-title">${t('navOperations')}</div>
            <div class="nav-group-items">
              <a class="nav-link ${this.currentRoute === 'infrastructure' ? 'active' : ''}" data-route="infrastructure">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/></svg>
                <span>${t('navInfrastructure')}</span>
              </a>
              <a class="nav-link ${this.currentRoute === 'incidents' ? 'active' : ''}" data-route="incidents">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>${t('navIncidents')}</span>
                ${incidentCount > 0 ? `<span class="nav-badge-pill critical">${incidentCount}</span>` : ''}
              </a>
              <a class="nav-link ${this.currentRoute === 'investigation' ? 'active' : ''}" data-route="investigation">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>${t('navInvestigation')}</span>
              </a>
            </div>
          </div>

          <!-- SECURITY & PRIVACY -->
          <div class="nav-group">
            <div class="nav-group-title">${t('navSecurityPrivacy')}</div>
            <div class="nav-group-items">
              <a class="nav-link ${this.currentRoute === 'privacy' ? 'active' : ''}" data-route="privacy">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>${t('navDataProtection')}</span>
                <span class="nav-badge-pill enclave">ENCLAVE</span>
              </a>
              <a class="nav-link ${this.currentRoute === 'egress-audit' ? 'active' : ''}" data-route="egress-audit">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>${t('navEgressAudit')}</span>
              </a>
              <a class="nav-link ${this.currentRoute === 'collectors' ? 'active' : ''}" data-route="collectors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                <span>${t('navCollectors')}</span>
              </a>
            </div>
          </div>

          <!-- INTELLIGENCE -->
          <div class="nav-group">
            <div class="nav-group-title">${t('navIntelligence')}</div>
            <div class="nav-group-items">
              <a class="nav-link ${this.currentRoute === 'analytics' ? 'active' : ''}" data-route="analytics">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                <span>${t('navAnalytics')}</span>
              </a>
              <a class="nav-link ${this.currentRoute === 'mission-replay' ? 'active' : ''}" data-route="mission-replay">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                <span>${t('navMissionReplay')}</span>
              </a>
            </div>
          </div>

          <!-- TOOLS -->
          <div class="nav-group">
            <div class="nav-group-title">${t('navTools')}</div>
            <div class="nav-group-items">
              <a class="nav-link ${this.currentRoute === 'simulator' ? 'active' : ''}" data-route="simulator">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span>${t('navSimulator')}</span>
              </a>
              <a class="nav-link ${this.currentRoute === 'remediation' ? 'active' : ''}" data-route="remediation">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                <span>${t('navRemediation')}</span>
              </a>
            </div>
          </div>
        </nav>

        <!-- Sidebar Bottom Footer -->
        <div class="sidebar-footer">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--surface-hover); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;">
              OA
            </div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 11.5px; font-weight: 700; color: var(--text-primary);">Acme Corp</span>
              <span style="font-size: 9.5px; color: var(--text-muted); font-family: var(--font-mono);">ops@sentinel.internal</span>
            </div>
          </div>
        </div>
      </aside>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.container.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const route = link.getAttribute('data-route');
        this.setActive(route);
        if (this.onNavigate) this.onNavigate(route);
      });
    });
  }

  setActive(route) {
    this.currentRoute = route;
    this.container.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('data-route') === route);
    });
  }

  bindStoreUpdates() {
    this.store.subscribe(() => {
      this.render();
    });
    this.i18n.subscribe(() => {
      this.render();
    });
  }
}

window.SentinelSidebar = SentinelSidebar;
