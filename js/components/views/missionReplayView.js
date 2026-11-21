/**
 * SENTINEL AI - Mission Replay View Component
 * Historical incident playback scrubber with play, pause, rewind, speed controls,
 * and live synchronization with map state.
 */

class SentinelMissionReplayView {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;

    this.currentStep = 0;
    this.isPlaying = false;
    this.speed = 1;
    this.timer = null;

    this.replaySteps = [
      { time: '15:40:00', label: 'Nominal Operations', status: 'healthy', desc: 'All 1,500 continental infrastructure components running within normal SLA tolerances. P99 latency: 14.2ms.' },
      { time: '15:42:01', label: 'Analytical Query Influx', status: 'warning', desc: 'Sudden surge of unindexed queries hitting payment ledger endpoint in Vanguard Plains.' },
      { time: '15:42:04', label: 'DB CPU Saturation (96%)', status: 'critical', desc: 'PostgreSQL primary cluster worker threads hit maximum core utilization in Obsidian Basin.' },
      { time: '15:42:07', label: 'CRITICAL POOL EXHAUSTION', status: 'critical', desc: 'PgBouncer connection queue completely saturated (100/100 slots). Downstream requests queued.' },
      { time: '15:42:09', label: 'Cascading Microservice 504s', status: 'critical', desc: 'Billing and Checkout worker pods experience TCP handshake socket timeouts. Error rate: 24.2%.' },
      { time: '15:42:11', label: 'Neural Copilot Isolation', status: 'warning', desc: 'Sentinel eBPF probe correlates causal graph; isolates root cause to query PID #49102.' },
      { time: '15:42:16', label: 'Automated Runbook Dispatched', status: 'warning', desc: 'Sentinel executes query kill and scales PgBouncer connection pool to 250 slots.' },
      { time: '15:42:35', label: 'Full Fleet Nominal Recovery', status: 'healthy', desc: 'Postgres latency returns to 12ms. Queues drained. Zero PII egress throughout incident lifecycle.' }
    ];

    this.render();
  }

  render() {
    const cur = this.replaySteps[this.currentStep];

    this.container.innerHTML = `
      <div class="view-panel-header">
        <div>
          <span class="view-panel-eyebrow">// INCIDENT_TIMELINE_SCRUBBER //</span>
          <h1 class="view-panel-title">MISSION REPLAY: INCIDENT #1042 (DATABASE SATURATION)</h1>
        </div>
        <div class="replay-controls-group">
          <button class="tactical-btn icon-btn" id="btn-replay-rewind" title="Rewind to Start">⏮</button>
          <button class="tactical-btn icon-btn" id="btn-replay-prev" title="Step Back">◀◀</button>
          <button class="tactical-btn icon-btn primary" id="btn-replay-play" title="Play / Pause">
            <span id="replay-play-icon">${this.isPlaying ? '❚❚ PAUSE' : '▶ PLAY'}</span>
          </button>
          <button class="tactical-btn icon-btn" id="btn-replay-next" title="Step Forward">▶▶</button>
          
          <div class="speed-toggle-group">
            <button class="tactical-btn mini ${this.speed === 1 ? 'active' : ''}" data-speed="1">1x</button>
            <button class="tactical-btn mini ${this.speed === 2 ? 'active' : ''}" data-speed="2">2x</button>
            <button class="tactical-btn mini ${this.speed === 5 ? 'active' : ''}" data-speed="5">5x</button>
          </div>
        </div>
      </div>

      <div class="view-panel-content">
        <!-- Replay Scrubber Bar -->
        <div class="scrubber-card">
          <div class="scrubber-header">
            <span class="scrubber-clock text-cyan">${cur.time} UTC</span>
            <span class="scrubber-label status-badge ${cur.status}">${cur.label.toUpperCase()}</span>
          </div>

          <input type="range" id="replay-slider" min="0" max="${this.replaySteps.length - 1}" value="${this.currentStep}" class="tactical-slider scrubber-range">

          <div class="scrubber-milestones">
            ${this.replaySteps.map((s, idx) => `
              <div class="milestone-tick ${idx === this.currentStep ? 'active' : ''} ${s.status}" data-idx="${idx}">
                <span class="m-dot"></span>
                <span class="m-time">${s.time.substring(3)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Frame Telemetry Summary -->
        <div class="replay-frame-details">
          <h3>FRAME TELEMETRY SNAPSHOT</h3>
          <p class="frame-desc">${cur.desc}</p>

          <div class="frame-kpi-row">
            <div class="threat-kpi">
              <span class="kpi-val ${cur.status === 'critical' ? 'text-red' : cur.status === 'warning' ? 'text-amber' : 'text-cyan'}">
                ${cur.status === 'critical' ? '2,850 ms' : cur.status === 'warning' ? '320 ms' : '14.2 ms'}
              </span>
              <span class="kpi-label">POSTGRES P99 LATENCY</span>
            </div>
            <div class="threat-kpi">
              <span class="kpi-val ${cur.status === 'critical' ? 'text-red' : 'text-emerald'}">
                ${cur.status === 'critical' ? '24.2%' : '0.01%'}
              </span>
              <span class="kpi-label">DOWNSTREAM ERROR RATE</span>
            </div>
            <div class="threat-kpi">
              <span class="kpi-val text-emerald">0 BYTES</span>
              <span class="kpi-label">RAW PII EGRESS</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const slider = this.container.querySelector('#replay-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.currentStep = parseInt(e.target.value, 10);
        this.applyFrameToMap();
        this.render();
      });
    }

    const prevBtn = this.container.querySelector('#btn-replay-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentStep > 0) {
          this.currentStep--;
          this.applyFrameToMap();
          this.render();
        }
      });
    }

    const nextBtn = this.container.querySelector('#btn-replay-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (this.currentStep < this.replaySteps.length - 1) {
          this.currentStep++;
          this.applyFrameToMap();
          this.render();
        }
      });
    }

    const rewindBtn = this.container.querySelector('#btn-replay-rewind');
    if (rewindBtn) {
      rewindBtn.addEventListener('click', () => {
        this.currentStep = 0;
        this.applyFrameToMap();
        this.render();
      });
    }

    const playBtn = this.container.querySelector('#btn-replay-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.togglePlay();
      });
    }

    const speedBtns = this.container.querySelectorAll('.speed-toggle-group button');
    speedBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.speed = parseInt(btn.getAttribute('data-speed'), 10);
        if (this.isPlaying) {
          clearInterval(this.timer);
          this.startPlaybackTimer();
        }
        this.render();
      });
    });

    const ticks = this.container.querySelectorAll('.milestone-tick');
    ticks.forEach(tick => {
      tick.addEventListener('click', () => {
        this.currentStep = parseInt(tick.getAttribute('data-idx'), 10);
        this.applyFrameToMap();
        this.render();
      });
    });
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this.startPlaybackTimer();
    } else {
      clearInterval(this.timer);
    }
    this.render();
  }

  startPlaybackTimer() {
    const interval = Math.max(300, 1800 / this.speed);
    this.timer = setInterval(() => {
      if (this.currentStep < this.replaySteps.length - 1) {
        this.currentStep++;
        this.applyFrameToMap();
        this.render();
      } else {
        this.isPlaying = false;
        clearInterval(this.timer);
        this.render();
      }
    }, interval);
  }

  applyFrameToMap() {
    const cur = this.replaySteps[this.currentStep];
    const dbNode = this.store.nodesMap.get('db-primary-01');
    const dbSite = this.store.sitesMap.get('site-obs-01');

    if (cur.status === 'critical') {
      if (dbNode) dbNode.health = 'critical';
      if (dbSite) dbSite.health = 'critical';
    } else if (cur.status === 'warning') {
      if (dbNode) dbNode.health = 'warning';
      if (dbSite) dbSite.health = 'warning';
    } else {
      if (dbNode) dbNode.health = 'healthy';
      if (dbSite) dbSite.health = 'healthy';
    }
    this.store.notify();
  }
}

window.SentinelMissionReplayView = SentinelMissionReplayView;
