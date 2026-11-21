/**
 * SENTINEL AI - Holographic Table Minimap
 * Continental overview with active viewport camera reticle and 1-click region jumpers.
 */

class SentinelMinimap {
  constructor(container, store, tableEngine, audioEngine) {
    this.container = container;
    this.store = store;
    this.tableEngine = tableEngine;
    this.audioEngine = audioEngine;
    this.canvas = null;
    this.ctx = null;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="minimap-wrapper">
        <div class="minimap-header">
          <span class="minimap-title">TACTICAL RADAR</span>
          <span class="minimap-coords" id="minimap-coords">ZOOM: 1.0x</span>
        </div>
        <div class="minimap-canvas-container">
          <canvas id="minimap-canvas" width="160" height="130"></canvas>
          <div class="radar-scan-line"></div>
        </div>
        <div class="district-pills">
          <button class="district-pill" data-reg="reg-north">NORTH</button>
          <button class="district-pill" data-reg="reg-west">WEST</button>
          <button class="district-pill" data-reg="reg-center">CENTER</button>
          <button class="district-pill" data-reg="reg-east">EAST</button>
          <button class="district-pill highlight" data-reg="reg-south">PRIVACY</button>
        </div>
      </div>
    `;

    this.canvas = document.getElementById('minimap-canvas');
    if (this.canvas) this.ctx = this.canvas.getContext('2d');
    this.bindEvents();
  }

  bindEvents() {
    const pills = this.container.querySelectorAll('.district-pill');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        const regId = pill.getAttribute('data-reg');
        const reg = this.store.regionsMap.get(regId);
        if (reg) {
          this.tableEngine.flyTo(reg.cx, reg.cy, 2.2);
          this.store.selectEntity(reg, 'region');
          if (this.audioEngine) this.audioEngine.playSelect();
        }
      });
    });

    if (this.canvas) {
      this.canvas.addEventListener('click', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldX = (mx / rect.width) * 1200;
        const worldY = (my / rect.height) * 900;
        this.tableEngine.flyTo(worldX, worldY, Math.max(1.8, this.tableEngine.zoom));
        if (this.audioEngine) this.audioEngine.playSelect();
      });
    }
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark Radar Background
    ctx.fillStyle = '#03060c';
    ctx.fillRect(0, 0, w, h);

    // Draw Simplified Continent Outline
    const scaleX = w / 1200;
    const scaleY = h / 900;

    // Draw Region Blips
    this.store.regions.forEach(reg => {
      const rx = reg.cx * scaleX;
      const ry = reg.cy * scaleY;
      const rRad = reg.radius * scaleX * 0.7;

      ctx.strokeStyle = reg.health === 'critical' ? '#ff0055' : reg.color + '44';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, ry, rRad, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = reg.health === 'critical' ? '#ff0055' : reg.color;
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Active Viewport Camera Reticle
    const te = this.tableEngine;
    const screenLeft = (-te.panX) * scaleX / te.zoom;
    const screenTop = (-te.panY) * scaleY / te.zoom;
    const screenW = (te.displayWidth * scaleX) / te.zoom;
    const screenH = (te.displayHeight * scaleY) / te.zoom;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(screenLeft, screenTop, Math.min(w, screenW), Math.min(h, screenH));

    const coords = document.getElementById('minimap-coords');
    if (coords) {
      coords.textContent = `ZOOM: ${te.zoom.toFixed(1)}x`;
    }
  }
}

window.SentinelMinimap = SentinelMinimap;
