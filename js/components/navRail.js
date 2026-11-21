/**
 * SENTINEL AI - Left Tactical Navigation Rail
 * Tactical operations rail for switching modes: The Grid, Threat Zone,
 * Investigation, Secure Zone, Mission Replay, Simulator, Arsenal.
 */

class SentinelNavRail {
  constructor(container, onNavSelect, audioEngine) {
    this.container = container;
    this.onNavSelect = onNavSelect;
    this.audioEngine = audioEngine;
    this.activeId = 'grid';

    this.navItems = [
      { id: 'grid', label: 'THE GRID', icon: '☵', desc: 'Infrastructure Overview' },
      { id: 'threats', label: 'THREAT ZONE', icon: '⚠', desc: 'Active Incidents & Triage', badge: '0' },
      { id: 'investigation', label: 'INVESTIGATION', icon: '⌖', desc: 'Root-Cause Causal Graph' },
      { id: 'secure', label: 'SECURE ZONE', icon: '🛡', desc: 'Privacy & Zero Egress Enclave' },
      { id: 'replay', label: 'MISSION REPLAY', icon: '◷', desc: 'Historical Incident Scrubber' },
      { id: 'simulator', label: 'SIMULATOR', icon: '⚡', desc: 'Chaos Failure Injection' },
      { id: 'arsenal', label: 'ARSENAL', icon: '⚔', desc: 'Remediation Runbooks' }
    ];

    this.render();
  }

  render() {
    let html = `
      <div class="nav-rail-inner">
        <div class="nav-header">
          <span class="nav-tactical-label">OPS_NAV</span>
        </div>
        <div class="nav-items-list">
    `;

    this.navItems.forEach(item => {
      const isActive = item.id === this.activeId;
      html += `
        <button class="nav-item ${isActive ? 'active' : ''}" data-nav-id="${item.id}" title="${item.desc}">
          <div class="nav-active-bar"></div>
          <span class="nav-icon">${item.icon}</span>
          <span class="nav-label">${item.label}</span>
          ${item.badge && item.badge !== '0' ? `<span class="nav-badge text-red">${item.badge}</span>` : ''}
        </button>
      `;
    });

    html += `
        </div>
        <div class="nav-footer">
          <div class="network-link-status">
            <span class="pulse-dot green mini"></span>
            <span class="link-label">MESH: CONNECTED</span>
          </div>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.bindEvents();
  }

  bindEvents() {
    const buttons = this.container.querySelectorAll('.nav-item');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const navId = btn.getAttribute('data-nav-id');
        this.setActive(navId);
      });
      btn.addEventListener('mouseenter', () => {
        if (this.audioEngine) this.audioEngine.playHover();
      });
    });
  }

  setActive(navId) {
    this.activeId = navId;
    const buttons = this.container.querySelectorAll('.nav-item');
    buttons.forEach(btn => {
      const id = btn.getAttribute('data-nav-id');
      if (id === navId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (this.audioEngine) this.audioEngine.playSelect();
    if (this.onNavSelect) this.onNavSelect(navId);
  }

  updateIncidentBadge(count) {
    const threatItem = this.navItems.find(i => i.id === 'threats');
    if (threatItem) {
      threatItem.badge = count > 0 ? String(count) : '0';
      this.render();
    }
  }
}

window.SentinelNavRail = SentinelNavRail;

