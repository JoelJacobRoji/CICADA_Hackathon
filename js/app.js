/**
 * SENTINEL AI - Main Application Master Coordinator
 * Handles:
 * - First-Visit Onboarding Welcome Screen
 * - Dynamic View Routing with i18n translation keys
 * - Live Theme & Language Synchronization
 * - Header & Sidebar integration
 */

class SentinelSaaSApp {
  constructor() {
    this.store = window.telemetryStore;
    this.theme = window.sentinelTheme;
    this.i18n = window.sentinelI18n;
    this.currentViewId = 'command-center';

    this.sidebar = null;
    this.header = null;
    this.activeViewInstance = null;

    this.viewTitleMap = {
      'command-center': 'navCommandCenter',
      'infrastructure': 'navInfrastructure',
      'incidents': 'navIncidents',
      'investigation': 'navInvestigation',
      'privacy': 'navDataProtection',
      'egress-audit': 'navEgressAudit',
      'collectors': 'navCollectors',
      'analytics': 'navAnalytics',
      'simulator': 'navSimulator',
      'remediation': 'navRemediation',
      'mission-replay': 'navMissionReplay'
    };
  }

  init() {
    console.log('[SENTINEL AI] Initializing Soft Modern Fintech Observability Platform...');

    // 1. Check for First-Visit Onboarding
    const onboardContainer = document.getElementById('onboarding-container');
    const hasOnboarded = localStorage.getItem('sentinel_onboarded');

    if (!hasOnboarded && onboardContainer) {
      new window.SentinelOnboardingModal(onboardContainer, () => {
        this.initMainApp();
      });
    } else {
      this.initMainApp();
    }
  }

  initMainApp() {
    // 2. Initialize Sidebar
    const sidebarContainer = document.getElementById('sidebar-container');
    this.sidebar = new window.SentinelSidebar(sidebarContainer, (route) => {
      this.switchView(route);
    }, this.store);

    // 3. Initialize Top Header
    const headerContainer = document.getElementById('header-container');
    this.header = new window.SentinelHeader(headerContainer, this.store);

    // 4. Render Initial View (Command Center)
    this.switchView('command-center');

    // 5. Subscribe to i18n & Theme updates for view refresh
    this.i18n.subscribe(() => {
      const titleKey = this.viewTitleMap[this.currentViewId] || 'navCommandCenter';
      this.header?.setTitle(titleKey);
      this.sidebar?.render();
    });

    this.theme.subscribe(() => {
      this.header?.render();
      this.sidebar?.render();
    });
  }

  switchView(viewId) {
    this.currentViewId = viewId;
    const container = document.getElementById('view-container');
    if (!container) return;

    // Update Header Title & Sidebar Active State
    const titleKey = this.viewTitleMap[viewId] || 'navCommandCenter';
    this.header?.setTitle(titleKey);
    this.sidebar?.setActive(viewId);

    // Instantiate Target View
    container.innerHTML = '';

    switch (viewId) {
      case 'command-center':
        this.activeViewInstance = new window.SentinelCommandCenterView(container, this.store, (r) => this.switchView(r));
        break;
      case 'infrastructure':
        this.activeViewInstance = new window.SentinelInfrastructureView(container, this.store, (r) => this.switchView(r));
        break;
      case 'incidents':
        this.activeViewInstance = new window.SentinelIncidentsView(container, this.store, (r) => this.switchView(r));
        break;
      case 'investigation':
        this.activeViewInstance = new window.SentinelInvestigationView(container, this.store, (r) => this.switchView(r));
        break;
      case 'privacy':
        this.activeViewInstance = new window.SentinelPrivacyView(container, this.store, (r) => this.switchView(r));
        break;
      case 'egress-audit':
        this.activeViewInstance = new window.SentinelEgressAuditView(container, this.store, (r) => this.switchView(r));
        break;
      case 'collectors':
        this.activeViewInstance = new window.SentinelCollectorsView(container, this.store, (r) => this.switchView(r));
        break;
      case 'analytics':
        this.activeViewInstance = new window.SentinelAnalyticsView(container, this.store, (r) => this.switchView(r));
        break;
      case 'simulator':
        this.activeViewInstance = new window.SentinelSimulatorView(container, this.store, (r) => this.switchView(r));
        break;
      case 'remediation':
        this.activeViewInstance = new window.SentinelRemediationView(container, this.store, (r) => this.switchView(r));
        break;
      case 'mission-replay':
        this.activeViewInstance = new window.SentinelMissionReplayView(container, this.store, (r) => this.switchView(r));
        break;
      default:
        this.activeViewInstance = new window.SentinelCommandCenterView(container, this.store, (r) => this.switchView(r));
    }
  }
}

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.sentinelApp = new SentinelSaaSApp();
  window.sentinelApp.init();
});
