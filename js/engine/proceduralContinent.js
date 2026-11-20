/**
 * SENTINEL AI - Procedural Continent & Tactical Landmass Generator
 * Generates deterministic fictional archipelago/continental topography (fixed seed: 133742).
 * Features glowing coastlines, topographic contour lines, lat/long grid, and regional boundaries.
 */

class ProceduralContinentGenerator {
  constructor(seed = 133742) {
    this.seed = seed;
    this.width = 1200;
    this.height = 900;
    this.cachedLandmass = null;
    this.cachedContours = [];
    this.cachedGrid = [];
    this.cachedIslands = [];

    this.generate();
  }

  // Seeded PRNG
  prng(s) {
    let t = (s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  generate() {
    let s = this.seed;
    const rnd = () => { s += 17; return this.prng(s); };

    // 1. Generate Main Continent Perimeter Polygon using harmonic perturbation
    const pointsCount = 180;
    const mainPoly = [];
    const centerX = 560;
    const centerY = 450;
    const baseRadius = 380;

    for (let i = 0; i < pointsCount; i++) {
      const theta = (i / pointsCount) * Math.PI * 2;
      
      // Layered harmonic noise for bays, fjords, and peninsulas
      const h1 = Math.sin(theta * 2.0 + 0.4) * 110;
      const h2 = Math.cos(theta * 3.0 - 0.8) * 80;
      const h3 = Math.sin(theta * 5.0 + 1.2) * 45;
      const h4 = Math.cos(theta * 8.0) * 25;
      const h5 = Math.sin(theta * 13.0) * 12;

      // Asymmetric stretch for natural continental look
      const stretchX = 1.0 + Math.cos(theta) * 0.28;
      const stretchY = 0.82 + Math.sin(theta) * 0.18;

      const r = (baseRadius + h1 + h2 + h3 + h4 + h5);
      const px = centerX + Math.cos(theta) * r * stretchX;
      const py = centerY + Math.sin(theta) * r * stretchY;

      mainPoly.push({ x: px, y: py });
    }

    this.cachedLandmass = mainPoly;

    // 2. Generate Concentric Topographic Contours (3 elevation tiers)
    this.cachedContours = [];
    [0.78, 0.55, 0.32].forEach((scale, tier) => {
      const contourPoly = [];
      for (let i = 0; i < pointsCount; i += 2) {
        const theta = (i / pointsCount) * Math.PI * 2;
        const h1 = Math.sin(theta * 2.0 + 0.4) * 80 * scale;
        const h2 = Math.cos(theta * 3.0 - 0.8) * 55 * scale;
        const h3 = Math.sin(theta * 5.0 + 1.2) * 30 * scale;

        const r = (baseRadius * scale + h1 + h2 + h3);
        const px = centerX + Math.cos(theta) * r * (1.0 + Math.cos(theta) * 0.25);
        const py = centerY + Math.sin(theta) * r * (0.82 + Math.sin(theta) * 0.15);
        contourPoly.push({ x: px, y: py });
      }
      this.cachedContours.push({ tier, points: contourPoly });
    });

    // 3. Generate Satellite Tactical Offshore Islands
    this.cachedIslands = [];
    const islandBases = [
      { x: 190, y: 280, r: 42 },
      { x: 230, y: 220, r: 28 },
      { x: 920, y: 240, r: 50 },
      { x: 980, y: 310, r: 35 },
      { x: 880, y: 680, r: 44 },
      { x: 790, y: 740, r: 32 },
      { x: 280, y: 650, r: 38 }
    ];

    islandBases.forEach(isl => {
      const poly = [];
      const n = 28;
      for (let i = 0; i < n; i++) {
        const theta = (i / n) * Math.PI * 2;
        const r = isl.r + (Math.sin(theta * 3) * 6) + (Math.cos(theta * 5) * 3);
        poly.push({
          x: isl.x + Math.cos(theta) * r,
          y: isl.y + Math.sin(theta) * r * 0.85
        });
      }
      this.cachedIslands.push(poly);
    });

    // 4. Tactical Latitude / Longitude Grid
    this.cachedGrid = {
      lats: [150, 300, 450, 600, 750],
      longs: [200, 400, 600, 800, 1000]
    };
  }

  // Draw the landmass, coastlines, and contours onto Canvas
  renderCanvas(ctx, options = {}) {
    const { showContours = true, pulsePhase = 0 } = options;

    ctx.save();

    // 1. Landmass Base Body Fill
    ctx.beginPath();
    const pts = this.cachedLandmass;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    // Deep dark tactical land fill
    const landGrad = ctx.createRadialGradient(560, 450, 80, 560, 450, 500);
    landGrad.addColorStop(0, '#060d1a');
    landGrad.addColorStop(0.6, '#040812');
    landGrad.addColorStop(1, '#020408');
    ctx.fillStyle = landGrad;
    ctx.fill();

    // 2. Coastal Neon Cyan Glow (Multi-pass)
    const coastGlowAlpha = 0.5 + Math.sin(pulsePhase * 2) * 0.15;
    ctx.strokeStyle = `rgba(0, 243, 255, ${coastGlowAlpha})`;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Outer subtle shoreline buffer ring
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.2)';
    ctx.shadowBlur = 4;
    ctx.stroke();

    // 3. Offshore Islands
    this.cachedIslands.forEach(isl => {
      ctx.beginPath();
      ctx.moveTo(isl[0].x, isl[0].y);
      for (let i = 1; i < isl.length; i++) {
        ctx.lineTo(isl[i].x, isl[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = '#050a16';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // 4. Elevation Contours
    if (showContours) {
      this.cachedContours.forEach(c => {
        ctx.beginPath();
        ctx.moveTo(c.points[0].x, c.points[0].y);
        for (let i = 1; i < c.points.length; i++) {
          ctx.lineTo(c.points[i].x, c.points[i].y);
        }
        ctx.closePath();

        ctx.strokeStyle = `rgba(0, 243, 255, ${0.12 + c.tier * 0.08})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // 5. Latitude & Longitude Tactical Coordinate Grid
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
    ctx.lineWidth = 1;
    this.cachedGrid.lats.forEach(y => {
      ctx.beginPath();
      ctx.moveTo(80, y);
      ctx.lineTo(1120, y);
      ctx.stroke();

      // Lat label
      ctx.fillStyle = 'rgba(0, 243, 255, 0.3)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(`${(90 - (y / 900) * 90).toFixed(0)}°N`, 90, y - 3);
    });

    this.cachedGrid.longs.forEach(x => {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, 840);
      ctx.stroke();

      // Long label
      ctx.fillStyle = 'rgba(0, 243, 255, 0.3)';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillText(`${((x / 1200) * 180).toFixed(0)}°E`, x + 3, 75);
    });

    ctx.restore();
  }
}

window.ProceduralContinentGenerator = ProceduralContinentGenerator;

