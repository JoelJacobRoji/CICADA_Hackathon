/**
 * SENTINEL AI - First-Visit Onboarding Welcome Screen
 * Modern soft fintech aesthetic with purple gradient backdrop,
 * language toggle (English / ಕನ್ನಡ), live-previewing 5 industry mode cards,
 * and animated transition into the Command Center.
 */

class SentinelOnboardingModal {
  constructor(container, onComplete) {
    this.container = container;
    this.onComplete = onComplete;
    this.theme = window.sentinelTheme;
    this.i18n = window.sentinelI18n;

    this.selectedMode = this.theme.currentMode;
    this.selectedLang = this.i18n.currentLang;

    this.render();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const modeConfig = this.theme.modes;

    this.container.innerHTML = `
      <div class="onboarding-overlay" id="onboarding-overlay">
        <!-- Ambient Blurred Background Orbs -->
        <div class="ambient-orb orb-1"></div>
        <div class="ambient-orb orb-2"></div>
        <div class="ambient-orb orb-3"></div>

        <div class="onboarding-card">
          <!-- Top Row: Brand & Language Switcher -->
          <div class="onboarding-header">
            <div class="onboarding-brand">
              <div class="onboarding-logo-icon">S</div>
              <span class="onboarding-brand-title">SENTINEL AI</span>
            </div>

            <!-- Language Pill Toggle -->
            <div class="pill-segmented-control">
              <button class="pill-segment-btn ${this.selectedLang === 'en' ? 'active' : ''}" id="btn-onboard-lang-en">English</button>
              <button class="pill-segment-btn ${this.selectedLang === 'kn' ? 'active' : ''}" id="btn-onboard-lang-kn">ಕನ್ನಡ</button>
            </div>
          </div>

          <!-- Hero Headline & Subtitle -->
          <div class="onboarding-hero-text">
            <h1 class="onboarding-title" id="onboard-headline">${t('onboardTitle')}</h1>
            <p class="onboarding-subtitle" id="onboard-subline">${t('onboardSubtitle')}</p>
          </div>

          <!-- Section Label -->
          <div class="onboarding-modes-label" id="onboard-select-label">
            ${t('onboardSelectMode')}
          </div>

          <!-- 5 Industry Mode Cards -->
          <div class="onboarding-modes-row">
            ${Object.values(modeConfig).map(m => {
              const isSelected = this.selectedMode === m.id;
              const modeName = this.selectedLang === 'kn' ? m.nameKn : m.nameEn;
              return `
                <div class="onboarding-mode-card ${isSelected ? 'active' : ''}" data-mode="${m.id}">
                  <div class="mode-card-icon" style="background: ${m.palette.primaryUltraLight}; color: ${m.palette.primary};">${m.icon}</div>
                  <div class="mode-card-name">${modeName}</div>
                  <div class="mode-card-indicator" style="background: ${m.palette.primary};"></div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Action Dock -->
          <div class="onboarding-actions">
            <button class="pill-btn-gradient" id="btn-onboard-start">
              <span>${t('btnGetStarted')}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
            <button class="text-link-skip" id="btn-onboard-skip">
              ${t('btnSkip')}
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Language Toggles
    document.getElementById('btn-onboard-lang-en')?.addEventListener('click', () => {
      this.selectedLang = 'en';
      this.i18n.setLanguage('en');
      this.render();
    });

    document.getElementById('btn-onboard-lang-kn')?.addEventListener('click', () => {
      this.selectedLang = 'kn';
      this.i18n.setLanguage('kn');
      this.render();
    });

    // Mode Card Selections (live preview!)
    this.container.querySelectorAll('.onboarding-mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const modeId = card.getAttribute('data-mode');
        this.selectedMode = modeId;
        this.theme.setMode(modeId);
        this.render();
      });
    });

    // Start Button
    document.getElementById('btn-onboard-start')?.addEventListener('click', () => {
      this.dismiss();
    });

    // Skip Link
    document.getElementById('btn-onboard-skip')?.addEventListener('click', () => {
      this.dismiss();
    });
  }

  dismiss() {
    localStorage.setItem('sentinel_onboarded', 'true');
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
      overlay.classList.add('dismissing');
      setTimeout(() => {
        this.container.innerHTML = '';
        if (this.onComplete) this.onComplete(this.selectedMode, this.selectedLang);
      }, 350);
    }
  }
}

window.SentinelOnboardingModal = SentinelOnboardingModal;

