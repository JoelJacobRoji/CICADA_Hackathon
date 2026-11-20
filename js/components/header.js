/**
 * SENTINEL AI - Modern Fintech Top Header & Controls Dock
 * Includes Breadcrumbs, Industry Mode Switcher, Language Toggle (English / ಕನ್ನಡ),
 * Compliance Badge Chip, Live System Status Pill, Collector Indicator, and UTC Clock.
 */

class SentinelHeader {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.theme = window.sentinelTheme;
    this.i18n = window.sentinelI18n;
    this.currentTitle = 'navCommandCenter';

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
    this.startClock();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const modeConfig = this.theme.getModeConfig();
    const currentLang = this.i18n.getLanguage();

    this.container.innerHTML = `
      <header id="top-header">
        <!-- Breadcrumbs -->
        <div class="header-left">
          <div class="header-breadcrumbs">
            <span>Acme Corp</span>
            <span class="breadcrumb-sep">/</span>
            <span id="header-env-crumb">${t('envProduction')}</span>
            <span class="breadcrumb-sep">/</span>
            <span class="breadcrumb-current" id="header-title">${t(this.currentTitle)}</span>
          </div>

          <!-- Active Compliance Framework Chip -->
          <span style="font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--primary); background: var(--primary-ultralight); border: 1px solid var(--border-subtle); padding: 2px 8px; border-radius: var(--radius-pill);" id="header-compliance-badge">
            🛡 ${modeConfig.compliance}
          </span>
        </div>

        <!-- Controls: Mode Selector, Language Toggle, Status Pills, Clock -->
        <div class="header-right">
          <!-- Industry Mode Selector -->
          <div class="pill-select-control">
            <span>${modeConfig.icon}</span>
            <select id="select-industry-mode">
              <option value="general" ${this.theme.currentMode === 'general' ? 'selected' : ''}>${currentLang === 'kn' ? 'ಸಾಮಾನ್ಯ (General)' : 'General Tech'}</option>
              <option value="healthcare" ${this.theme.currentMode === 'healthcare' ? 'selected' : ''}>${currentLang === 'kn' ? 'ಆರೋಗ್ಯ ಸೇವೆ (Health)' : 'Healthcare'}</option>
              <option value="industry" ${this.theme.currentMode === 'industry' ? 'selected' : ''}>${currentLang === 'kn' ? 'ಕೈಗಾರಿಕೆ (Industry)' : 'Industry / SCADA'}</option>
              <option value="finance" ${this.theme.currentMode === 'finance' ? 'selected' : ''}>${currentLang === 'kn' ? 'ಹಣಕಾಸು (Finance)' : 'Finance / Banking'}</option>
              <option value="education" ${this.theme.currentMode === 'education' ? 'selected' : ''}>${currentLang === 'kn' ? 'ಶಿಕ್ಷಣ (Education)' : 'Higher Education'}</option>
            </select>
          </div>

          <!-- Language Pill Segmented Toggle -->
          <div class="pill-segmented-control">
            <button class="pill-segment-btn ${currentLang === 'en' ? 'active' : ''}" id="btn-lang-en">English</button>
            <button class="pill-segment-btn ${currentLang === 'kn' ? 'active' : ''}" id="btn-lang-kn">ಕನ್ನಡ</button>
          </div>

          <!-- Onboarding / Tour Trigger Button -->
          <button class="pill-segment-btn" id="btn-trigger-tour" style="background: var(--surface-hover); border: 1px solid var(--border-subtle); padding: 5px 12px; font-weight: 700; color: var(--primary);" title="Open Onboarding Screen">
            ${t('btnWelcomeTour')}
          </button>

          <!-- Live System Status Pill -->
          <div class="status-pill-chip ${this.store.globalMetrics.activeIncidentsCount > 0 ? 'critical' : ''}" id="header-status-chip">
            <span class="dot"></span>
            <span id="header-status-text">
              ${this.store.globalMetrics.activeIncidentsCount > 0 ? `${this.store.globalMetrics.activeIncidentsCount} ${t('statusCritical')}` : t('systemHealthy')}
            </span>
          </div>

          <!-- Collectors Pill -->
          <div class="status-pill-chip" title="Local eBPF Enclaves">
            <span class="dot" style="background: var(--status-healthy);"></span>
            <span>3/3 ${t('navCollectors')}</span>
          </div>

          <!-- Live UTC Clock -->
          <div class="utc-clock-pill" id="header-utc-clock">
            00:00:00 UTC
          </div>
        </div>
      </header>
    `;

    this.bindEvents();
  }

  setTitle(titleKey) {
    this.currentTitle = titleKey;
    const titleEl = document.getElementById('header-title');
    if (titleEl) titleEl.textContent = this.i18n.t(titleKey);
  }

  bindEvents() {
    // Mode Switcher
    const modeSelect = document.getElementById('select-industry-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        this.theme.setMode(e.target.value);
        this.render();
      });
    }

    // Language Toggles
    document.getElementById('btn-lang-en')?.addEventListener('click', () => {
      this.i18n.setLanguage('en');
      this.render();
    });

    document.getElementById('btn-lang-kn')?.addEventListener('click', () => {
      this.i18n.setLanguage('kn');
      this.render();
    });

    // Tour / Onboarding Modal Trigger
    document.getElementById('btn-trigger-tour')?.addEventListener('click', () => {
      const onboardContainer = document.getElementById('onboarding-container');
      if (onboardContainer) {
        new window.SentinelOnboardingModal(onboardContainer, () => {
          this.render();
        });
      }
    });
  }

  bindStoreUpdates() {
    this.store.subscribe((store) => {
      const chip = document.getElementById('header-status-chip');
      const text = document.getElementById('header-status-text');
      if (chip && text) {
        if (store.globalMetrics.activeIncidentsCount > 0) {
          chip.className = 'status-pill-chip critical';
          text.textContent = `${store.globalMetrics.activeIncidentsCount} ${this.i18n.t('statusCritical')}`;
        } else {
          chip.className = 'status-pill-chip';
          text.textContent = this.i18n.t('systemHealthy');
        }
      }
    });

    this.theme.subscribe(() => {
      this.render();
    });

    this.i18n.subscribe(() => {
      this.render();
    });
  }

  startClock() {
    const update = () => {
      const clockEl = document.getElementById('header-utc-clock');
      if (clockEl) {
        const now = new Date();
        clockEl.textContent = now.toISOString().substring(11, 19) + ' UTC';
      }
    };
    update();
    setInterval(update, 1000);
  }
}

window.SentinelHeader = SentinelHeader;
