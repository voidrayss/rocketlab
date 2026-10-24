// ===========================================================================
// flight.js — the animated flight view + telemetry gauges + altitude plot.
//
// Takes a pre-computed trajectory (array of samples from physics.js) and plays
// it back as an animation: a scrolling sky with the rocket rising, a flame
// while the motor burns, and a parachute on descent. Live gauges update each
// frame, and a static altitude-vs-time plot is drawn alongside.
// ===========================================================================

export class FlightView {
  constructor(refs) {
    this.canvas = refs.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.telemetryEl = refs.telemetryEl;
    this.summaryEl = refs.summaryEl;
    this.plotCanvas = refs.plotCanvas;
    this.plotCtx = this.plotCanvas.getContext("2d");

    this.result = null;
    this.frame = 0;
    this.playing = false;
    this.rafId = null;
  }

  load(result) {
    this.result = result;
    this.frame = 0;
    this.playing = false;
    this.drawPlot();
    this.renderSummary();
    this.drawFrame();
  }

  play() {
    if (!this.result) return;
    this.playing = true;
    const loop = () => {
      if (!this.playing) return;
      // Advance ~4 sim samples per animation frame (sim dt=0.01 → ~40ms/frame
      // of sim time; visually smooth and not too slow).
      this.frame = Math.min(this.frame + 4, this.result.samples.length - 1);
      this.drawFrame();
      if (this.frame >= this.result.samples.length - 1) {
        this.playing = false;
        return;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  reset() {
    this.playing = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.frame = 0;
    this.drawFrame();
  }

  // ---- Animated flight canvas -----------------------------------------
  drawFrame() {
    if (!this.result) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const s = this.result.samples[this.frame];
    const apogee = this.result.stats.apogee || 1;

    // Sky gradient that darkens with altitude.
    const altFrac = Math.min(1, s.y / Math.max(apogee, 1));
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#071326");
    grad.addColorStop(1, `rgb(${27 + 20 * (1 - altFrac)}, ${74 - 30 * altFrac}, ${133 - 40 * altFrac})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Ground line position: we keep the rocket around 2/3 down the screen and
    // scroll the world. Compute a camera offset from the rocket altitude.
    const groundScreenY = H - 40;
    const metersToPx = (H - 120) / Math.max(apogee, 1);
    const rocketScreenY = groundScreenY - s.y * metersToPx;

    // Draw a few altitude gridlines/clouds for a sense of motion.
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "11px system-ui";
    const step = niceStep(apogee);
    for (let a = 0; a <= apogee + step; a += step) {
      const gy = groundScreenY - a * metersToPx;
      if (gy < 0 || gy > H) continue;
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      ctx.fillText(`${a.toFixed(0)} m`, 6, gy - 3);
    }

    // Ground.
    ctx.fillStyle = "#1c2a16";
    ctx.fillRect(0, groundScreenY, W, H - groundScreenY);
    ctx.fillStyle = "#2f4523";
    ctx.fillRect(0, groundScreenY, W, 4);

    // Rocket.
    const cx = W / 2;
    const flying = s.y > 0.01 || this.frame > 0;
    this.drawRocket(ctx, cx, Math.min(rocketScreenY, groundScreenY), s, flying);

    this.renderTelemetry(s);
  }

  drawRocket(ctx, x, y, s, flying) {
    const h = 48, w = 12;
    ctx.save();
    ctx.translate(x, y);

    // Flame while thrusting.
    if (s.thrust > 0) {
      const flicker = 0.7 + Math.random() * 0.6;
      ctx.fillStyle = "#ffcc33";
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(0, 26 * flicker);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#ff6b3d";
      ctx.beginPath();
      ctx.moveTo(-w / 4, 0);
      ctx.lineTo(w / 4, 0);
      ctx.lineTo(0, 16 * flicker);
      ctx.closePath(); ctx.fill();
    }

    // Parachute on descent.
    if (s.parachute) {
      ctx.strokeStyle = "#e6edf3";
      ctx.fillStyle = "rgba(255,107,61,0.85)";
      ctx.beginPath();
      ctx.arc(0, -h - 6, 26, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-26, -h - 6); ctx.lineTo(0, -h + 2);
      ctx.moveTo(26, -h - 6);  ctx.lineTo(0, -h + 2);
      ctx.stroke();
    }

    // Body.
    ctx.fillStyle = "#e6edf3";
    ctx.fillRect(-w / 2, -h, w, h);
    // Nose.
    ctx.fillStyle = "#ff6b3d";
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h); ctx.lineTo(0, -h - 14); ctx.lineTo(w / 2, -h);
    ctx.closePath(); ctx.fill();
    // Fins.
    ctx.fillStyle = "#4da3ff";
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.lineTo(-w / 2 - 8, 8); ctx.lineTo(-w / 2, -10);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2 + 8, 8); ctx.lineTo(w / 2, -10);
    ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  // ---- Telemetry gauges ------------------------------------------------
  renderTelemetry(s) {
    const phase = s.thrust > 0 ? "POWERED" : (s.parachute ? "DESCENT 🪂" : (s.v > 0 ? "COAST" : "DESCENT"));
    this.telemetryEl.innerHTML = `
      <div class="gauge"><div class="label">PHASE</div>
        <div class="value">${phase}</div></div>
      <div class="gauge"><div class="label">ALTITUDE</div>
        <div class="value">${s.y.toFixed(1)}<span class="unit"> m</span></div></div>
      <div class="gauge"><div class="label">VELOCITY</div>
        <div class="value">${s.v.toFixed(1)}<span class="unit"> m/s</span></div></div>
      <div class="gauge"><div class="label">MACH</div>
        <div class="value">${s.mach.toFixed(2)}</div></div>
      <div class="gauge"><div class="label">MASS</div>
        <div class="value">${(s.mass * 1000).toFixed(1)}<span class="unit"> g</span></div></div>
      <div class="gauge"><div class="label">TIME</div>
        <div class="value">${s.t.toFixed(2)}<span class="unit"> s</span></div></div>
    `;
  }

  renderSummary() {
    const st = this.result.stats;
    this.summaryEl.innerHTML = `
      <div class="row"><span>Apogee</span><span>${st.apogee.toFixed(1)} m</span></div>
      <div class="row"><span>Time to apogee</span><span>${st.apogeeTime.toFixed(2)} s</span></div>
      <div class="row"><span>Max velocity</span><span>${st.maxV.toFixed(1)} m/s</span></div>
      <div class="row"><span>Max Mach</span><span>${st.maxMach.toFixed(2)}</span></div>
      <div class="row"><span>Burnout</span><span>${st.burnoutTime.toFixed(2)} s</span></div>
      <div class="row"><span>Flight time</span><span>${st.flightTime.toFixed(1)} s</span></div>
    `;
  }

  // ---- Altitude-vs-time plot -------------------------------------------
  drawPlot() {
    const ctx = this.plotCtx;
    const W = this.plotCanvas.width, H = this.plotCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const pad = 36;
    const samples = this.result.samples;
    const tMax = samples[samples.length - 1].t || 1;
    const yMax = this.result.stats.apogee || 1;

    // Axes.
    ctx.strokeStyle = "#2a333f";
    ctx.beginPath();
    ctx.moveTo(pad, 10); ctx.lineTo(pad, H - pad); ctx.lineTo(W - 10, H - pad);
    ctx.stroke();

    ctx.fillStyle = "#8b98a8";
    ctx.font = "10px system-ui";
    ctx.fillText("alt (m)", 4, 10);
    ctx.fillText("t (s)", W - 30, H - 8);
    ctx.fillText(yMax.toFixed(0), 4, 22);
    ctx.fillText(tMax.toFixed(1), W - 30, H - pad + 14);

    // Altitude curve.
    ctx.strokeStyle = "#ff6b3d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const px = pad + (s.t / tMax) * (W - pad - 10);
      const py = (H - pad) - (Math.max(0, s.y) / yMax) * (H - pad - 10);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

// Pick a "nice" gridline spacing for the altitude scale.
function niceStep(apogee) {
  const raw = apogee / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}
