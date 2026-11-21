/**
 * SENTINEL AI - Soft Modern Mission Replay (Incident Reconstruction & Telemetry Playback)
 * Historical timeline scrubber, Play/Pause, speed multipliers (1x, 2x, 5x),
 * and step-by-step state reconstruction for post-mortem reviews.
 * Supports 5 Industry Modes and English / Kannada Localization.
 */

class SentinelMissionReplayView {
  constructor(container, store, onNavigate) {
    this.container = container;
    this.store = store;
    this.onNavigate = onNavigate;
    this.i18n = window.sentinelI18n;
    this.theme = window.sentinelTheme;

    this.playbackIndex = 0;
    this.isPlaying = false;
    this.speed = 1;
    this.timer = null;

    this.replayFrames = [
      { time: '15:41:40 UTC', event: 'Nominal baseline. All 42 services operating with <20ms latency.', health: '99.98%', cpu: '46%', pool: '24 / 100' },
      { time: '15:41:48 UTC', event: 'Batch analytical query executed by BI analyst against primary PostgreSQL.', health: '99.20%', cpu: '78%', pool: '58 / 100' },
      { time: '15:42:01 UTC', event: 'Alert #8812 triggered: DB Connection Pool reached 95% capacity (98/100 slots).', health: '95.10%', cpu: '96%', pool: '98 / 100' },
      { time: '15:42:14 UTC', event: 'Cascade failure: order-processor socket exhaustion triggers retry storm.', health: '93.40%', cpu: '98%', pool: '98 / 100' },
      { time: '15:42:30 UTC', event: 'AI Diagnostics identifies unindexed sequential scan on "transactions" table.', health: '94.20%', cpu: '98%', pool: '98 / 100' },
      { time: '15:43:00 UTC', event: 'Certified Runbook-01 applied: PgBouncer max_connections scaled to 250.', health: '99.80%', cpu: '44%', pool: '32 / 250' }
    ];

    this.render();
    this.bindEvents();
    this.bindStoreUpdates();
  }

  render() {
    const t = (k) => this.i18n.t(k);
    const frame = this.replayFrames[this.playbackIndex];
    const modeConfig = this.theme.getModeConfig();
    const primaryNodeName = this.store.getNodeDisplayName('postgres-primary-01');

    this.container.innerHTML = `
      <div class="replay-workspace">
        <!-- Title & Action Bar -->
        <div class="page-title-bar">
          <div class="page-title-block">
            <h1>${t('replayTitle')}</h1>
            <p>${t('replaySubtitle')}</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-replay-export">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>${t('btnExportPostMortem')}</span>
            </button>
            <button class="btn btn-primary btn-sm" id="btn-replay-to-investigation">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>${t('navInvestigation')}</span>
            </button>
          </div>
        </div>

        <!-- Scrubber & Playback Controls Card -->
        <div class="card scrubber-card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <button class="btn btn-primary btn-sm" id="btn-play-pause" style="min-width: 90px; justify-content: center;">
                ${this.isPlaying ? '❚❚ Pause' : '▶ Play'}
              </button>

              <div class="pill-segmented-control">
                <button class="pill-segment-btn ${this.speed === 1 ? 'active' : ''}" data-speed="1">1x</button>
                <button class="pill-segment-btn ${this.speed === 2 ? 'active' : ''}" data-speed="2">2x</button>
                <button class="pill-segment-btn ${this.speed === 5 ? 'active' : ''}" data-speed="5">5x</button>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Timecode:</span>
              <span class="status-pill-chip" style="font-family: var(--font-mono); font-size: 12px; font-weight: 700;" id="replay-timecode">
                ${frame.time}
              </span>
            </div>
          </div>

          <!-- Interactive Range Slider Scrubber -->
          <input type="range" id="replay-scrubber" min="0" max="${this.replayFrames.length - 1}" value="${this.playbackIndex}" step="1" style="width: 100%; height: 6px; border-radius: 3px; accent-color: var(--primary); cursor: pointer; margin-bottom: 16px; background: var(--surface-hover);">

          <!-- Event Markers Below Scrubber -->
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
            <span>T-0: Baseline</span>
            <span>T+8s: Query Influx</span>
            <span style="color: var(--status-critical); font-weight: 700;">T+21s: Alert #8812</span>
            <span style="color: var(--status-critical); font-weight: 700;">T+34s: 504 Cascade</span>
            <span style="color: var(--primary); font-weight: 700;">T+50s: AI Isolation</span>
            <span style="color: var(--status-healthy); font-weight: 700;">T+80s: Resolved</span>
          </div>
        </div>

        <!-- Frame Telemetry State Snapshot (2-Column) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 18px;">
          <!-- Left: Event Narrative -->
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div class="card-header">
              <div class="card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
                <span>Incident Event Reconstruction</span>
              </div>
              <span class="cell-mono" style="color: var(--primary); font-weight: 700; font-size: 11px;">
                Step ${this.playbackIndex + 1} of ${this.replayFrames.length}
              </span>
            </div>
            
            <div style="padding: 10px 0 16px 0;">
              <div style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Event Description</div>
              <p style="font-size: 13.5px; color: var(--text-primary); line-height: 1.6; background: var(--surface-hover); padding: 14px 16px; border-radius: var(--radius-md); border: 1.5px solid var(--border-subtle);" id="replay-event-text">
                ${frame.event}
              </p>
            </div>

            <div style="font-size: 11.5px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;">
              <span class="status-dot healthy"></span>
              <span>Regulatory Zero-Knowledge Egress Proof attached to frame.</span>
            </div>
          </div>

          <!-- Right: Snapshot Metrics -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span>Infrastructure Snapshot Telemetry</span>
              </div>
              <span class="cell-mono" style="color: var(--text-muted); font-size: 10.5px;">Live State at Frame</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
              <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">SYSTEM HEALTH</span>
                <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 800; color: var(--text-primary);" id="replay-snap-health">${frame.health}</span>
              </div>

              <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">${primaryNodeName.toUpperCase()} CPU</span>
                <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 800; color: var(--status-critical);" id="replay-snap-cpu">${frame.cpu}</span>
              </div>

              <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">CONNECTION POOL SLOTS</span>
                <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 800; color: var(--primary);" id="replay-snap-pool">${frame.pool}</span>
              </div>

              <div style="background: var(--surface-hover); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span style="font-size: 10.5px; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">EGRESS PRIVACY STATUS</span>
                <span style="font-family: var(--font-mono); font-size: 16px; font-weight: 800; color: var(--status-healthy);">ZERO LEAK</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const scrubber = document.getElementById('replay-scrubber');
    if (scrubber) {
      scrubber.addEventListener('input', (e) => {
        this.playbackIndex = parseInt(e.target.value, 10);
        this.updateSnapshot();
      });
    }

    const playBtn = document.getElementById('btn-play-pause');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.togglePlay();
      });
    }

    this.container.querySelectorAll('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.speed = parseInt(btn.getAttribute('data-speed'), 10);
        this.render();
      });
    });

    document.getElementById('btn-replay-to-investigation')?.addEventListener('click', () => {
      if (this.onNavigate) this.onNavigate('investigation');
    });

    document.getElementById('btn-replay-export')?.addEventListener('click', () => {
      alert('Post-Mortem PDF generated: incident-1042-root-cause-replay.pdf');
    });
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    const btn = document.getElementById('btn-play-pause');
    if (btn) btn.textContent = this.isPlaying ? '❚❚ Pause' : '▶ Play';

    if (this.isPlaying) {
      this.timer = setInterval(() => {
        this.playbackIndex = (this.playbackIndex + 1) % this.replayFrames.length;
        const scrubber = document.getElementById('replay-scrubber');
        if (scrubber) scrubber.value = this.playbackIndex;
        this.updateSnapshot();
      }, 1800 / this.speed);
    } else {
      clearInterval(this.timer);
    }
  }

  updateSnapshot() {
    const frame = this.replayFrames[this.playbackIndex];
    const timecode = document.getElementById('replay-timecode');
    const text = document.getElementById('replay-event-text');
    const health = document.getElementById('replay-snap-health');
    const cpu = document.getElementById('replay-snap-cpu');
    const pool = document.getElementById('replay-snap-pool');

    if (timecode) timecode.textContent = frame.time;
    if (text) text.textContent = frame.event;
    if (health) health.textContent = frame.health;
    if (cpu) cpu.textContent = frame.cpu;
    if (pool) pool.textContent = frame.pool;
  }

  bindStoreUpdates() {
    this.i18n.subscribe(() => {
      this.render();
    });
    this.theme.subscribe(() => {
      this.render();
    });
  }
}

window.SentinelMissionReplayView = SentinelMissionReplayView;
