/**
 * SENTINEL AI - Technical Telemetry Oscilloscope Charts
 * High-performance, retro-futuristic canvas charts with glowing area gradients,
 * oscilloscope reticle grids, and peak markers. Zero external charting dependencies.
 */

class SentinelTelemetryCharts {
  // Render an oscilloscope area chart
  static drawAreaChart(canvas, dataPoints, color = '#00f3ff', label = '', unit = '%', maxScale = 100) {
    if (!canvas || !dataPoints || dataPoints.length === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Grid Reticle
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const maxVal = maxScale || Math.max(...dataPoints, 1);
    const stepX = w / (dataPoints.length - 1);

    // 2. Compute Points
    const pts = dataPoints.map((val, idx) => {
      const clamped = Math.max(0, Math.min(maxVal, val));
      const py = h - 6 - (clamped / maxVal) * (h - 14);
      const px = idx * stepX;
      return { x: px, y: py, val };
    });

    // 3. Area Fill Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '55');
    grad.addColorStop(0.7, color + '18');
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, h);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 4. Glowing Stroke Line
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // 5. Current Value & Peak Marker
    const lastPt = pts[pts.length - 1];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lastPt.x, lastPt.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Value HUD readout
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(`${label}: ${lastPt.val}${unit}`, w - 4, 12);
  }

  // Render a bar histogram spectrum (for throughput / request volume)
  static drawBarSpectrum(canvas, dataPoints, color = '#ffaa00', label = '', unit = ' req/s') {
    if (!canvas || !dataPoints || dataPoints.length === 0) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const maxVal = Math.max(...dataPoints, 1) * 1.15;
    const barW = (w / dataPoints.length) - 2;

    dataPoints.forEach((val, idx) => {
      const bh = (val / maxVal) * (h - 16);
      const bx = idx * (barW + 2);
      const by = h - bh;

      const grad = ctx.createLinearGradient(bx, by, bx, h);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '33');

      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, barW, bh);

      // Peak LED dot
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by - 2, barW, 1.5);
    });

    const lastVal = dataPoints[dataPoints.length - 1];
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    ctx.fillText(`${label}: ${lastVal.toLocaleString()}${unit}`, w - 4, 12);
  }
}

window.SentinelTelemetryCharts = SentinelTelemetryCharts;

