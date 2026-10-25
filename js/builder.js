import { validateFinCan } from "./fincan.js";
// ===========================================================================
// builder.js — the CAD builder view.
//
// Responsible for:
//   - drawing the rocket profile on the canvas (plus CG and CP markers)
//   - rendering the component list and the per-component editor form
//   - rendering the live stability readout
// It reads the shared rocket model and calls back into main.js on edits.
// ===========================================================================

import { COMPONENT_TYPES, MATERIALS, layoutPositions, totalLength,
         frontDiameter, rearDiameter, maxBodyDiameter, noseConeProfile } from "./rocket.js";
import { stabilityMargin } from "./aero.js";
import { getMotor } from "./motors.js";
import { buildReport } from "./analysis.js";

// --- Which editable fields each component type exposes. ---
const FIELDS = {
  [COMPONENT_TYPES.NOSE]: [
    { key: "length",        label: "Length (m)",        step: 0.01 },
    { key: "diameter",      label: "Diameter (m)",      step: 0.005 },
    { key: "wallThickness", label: "Wall thickness (m)",step: 0.0005 },
    { key: "shape",         label: "Shape",             type: "select", options: ["ogive", "conical", "vonKarman", "haack", "parabolic", "elliptical", "cone", "blunt"] },
    { key: "material",      label: "Material",          type: "select", options: Object.keys(MATERIALS) },
  ],
  [COMPONENT_TYPES.BODY]: [
    { key: "length",        label: "Length (m)",        step: 0.01 },
    { key: "diameter",      label: "Diameter (m)",      step: 0.005 },
    { key: "wallThickness", label: "Wall thickness (m)",step: 0.0005 },
    { key: "material",      label: "Material",          type: "select", options: Object.keys(MATERIALS) },
  ],
  [COMPONENT_TYPES.TRANSITION]: [
    { key: "length",        label: "Length (m)",        step: 0.01 },
    { key: "frontDiameter", label: "Front diameter (m)",step: 0.005 },
    { key: "rearDiameter",  label: "Rear diameter (m)", step: 0.005 },
    { key: "material",      label: "Material",          type: "select", options: Object.keys(MATERIALS) },
  ],
  [COMPONENT_TYPES.FINS]: [
    { key: "count",     label: "Fin count",      step: 1, int: true },
    { key: "rootChord", label: "Root chord (m)", step: 0.005 },
    { key: "tipChord",  label: "Tip chord (m)",  step: 0.005 },
    { key: "span",      label: "Span (m)",       step: 0.005 },
    { key: "sweep",     label: "Sweep (m)",      step: 0.005 },
    { key: "thickness", label: "Thickness (m)",  step: 0.0005 },
    { key: "material",  label: "Material",       type: "select", options: Object.keys(MATERIALS) },
  ],
};

FIELDS.finCan = [
  { key: "length", label: "Sleeve length (m)", step: 0.005 },
  { key: "diameter", label: "Sleeve outer diameter (m)", step: 0.001 },
  { key: "innerDiameter", label: "Sleeve inner diameter (m)", step: 0.001 },
  ...FIELDS.fins,
];
const LABELS = {
  [COMPONENT_TYPES.NOSE]: "Nose Cone",
  [COMPONENT_TYPES.BODY]: "Body Tube",
  [COMPONENT_TYPES.TRANSITION]: "Transition",
  [COMPONENT_TYPES.FINS]: "Fins",
  finCan: "Integrated fin can",
};

export class Builder {
  constructor(refs, callbacks) {
    this.canvas = refs.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.listEl = refs.listEl;
    this.editorEl = refs.editorEl;
    this.stabilityEl = refs.stabilityEl;
    this.analysisEl = refs.analysisEl || null; // richer analysis panel (optional)
    this.cb = callbacks; // { onChange, onSelect }
    this.selectedId = null;
  }

  render(rocket) {
    this.rocket = rocket;
    this.drawRocket(rocket);
    this.renderList(rocket);
    this.renderEditor(rocket);
    this.renderStability(rocket);
    this.renderAnalysis(rocket);
  }

  // ---- Canvas drawing --------------------------------------------------
  drawRocket(rocket) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const L = totalLength(rocket) || 0.5;
    const maxD = maxBodyDiameter(rocket);

    // Scale so the rocket fills ~80% of the canvas height.
    const margin = 60;
    const scale = (H - 2 * margin) / L;
    const cx = W / 2;
    const topY = margin;

    const pos = layoutPositions(rocket);

    // Draw centerline.
    ctx.strokeStyle = "#2a333f";
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(cx, topY - 10); ctx.lineTo(cx, topY + L * scale + 10); ctx.stroke();
    ctx.setLineDash([]);

    // Draw each component.
    for (const c of rocket.components) {
      const x0 = pos.get(c.id) ?? 0;
      const y = topY + x0 * scale;

      ctx.fillStyle = c.id === this.selectedId ? "#ff9166" : "#c9d4e0";
      ctx.strokeStyle = "#0e1116";
      ctx.lineWidth = 1.5;

      if (c.type === COMPONENT_TYPES.NOSE) {
        const w = c.diameter * scale;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        const profile = noseConeProfile(c, 48);
        for (const point of profile) ctx.lineTo(cx - point.r * scale, y + point.x * scale);
        for (const point of [...profile].reverse()) ctx.lineTo(cx + point.r * scale, y + point.x * scale);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }

      else if (c.type === COMPONENT_TYPES.BODY) {
        const w = c.diameter * scale;
        ctx.beginPath();
        ctx.rect(cx - w / 2, y, w, c.length * scale);
        ctx.fill(); ctx.stroke();
      }

      else if (c.type === COMPONENT_TYPES.TRANSITION) {
        const wf = c.frontDiameter * scale, wr = c.rearDiameter * scale;
        const h = c.length * scale;
        ctx.beginPath();
        ctx.moveTo(cx - wf / 2, y);
        ctx.lineTo(cx - wr / 2, y + h);
        ctx.lineTo(cx + wr / 2, y + h);
        ctx.lineTo(cx + wf / 2, y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }

      else if (c.type === COMPONENT_TYPES.FINS || c.type === "finCan") {
        const finY = c.type === "finCan" ? y + (c.length - c.rootChord) * scale : y;
        if (c.type === "finCan") {
          ctx.strokeRect(cx - c.diameter * scale / 2, y, c.diameter * scale, c.length * scale);
        }
        const bodyW = (c.type === "finCan" ? c.diameter : maxD) * scale;
        const h = c.rootChord * scale;
        const span = c.span * scale;
        const sweep = c.sweep * scale;
        const tip = c.tipChord * scale;
        // left fin
        ctx.beginPath();
        ctx.moveTo(cx - bodyW / 2, finY);
        ctx.lineTo(cx - bodyW / 2 - span, finY + sweep);
        ctx.lineTo(cx - bodyW / 2 - span, finY + sweep + tip);
        ctx.lineTo(cx - bodyW / 2, finY + h);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // right fin
        ctx.beginPath();
        ctx.moveTo(cx + bodyW / 2, finY);
        ctx.lineTo(cx + bodyW / 2 + span, finY + sweep);
        ctx.lineTo(cx + bodyW / 2 + span, finY + sweep + tip);
        ctx.lineTo(cx + bodyW / 2, finY + h);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }

    // CG and CP markers.
    const motor = getMotor(rocket.motorId);
    const motorMass = motor.totalMass;
    const motorX = L - 0.05;
    const { cg, cp } = stabilityMargin(rocket, motorMass, motorX);

    const cgY = topY + cg * scale;
    const cpY = topY + cp * scale;

    // CG (blue circle with checker look)
    ctx.fillStyle = "#4da3ff";
    ctx.beginPath(); ctx.arc(cx, cgY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4da3ff"; ctx.font = "12px system-ui";
    ctx.fillText("CG", cx + 12, cgY + 4);

    // CP (red triangle)
    ctx.fillStyle = "#ff5c5c";
    ctx.beginPath();
    ctx.moveTo(cx, cpY - 7); ctx.lineTo(cx - 7, cpY + 6); ctx.lineTo(cx + 7, cpY + 6);
    ctx.closePath(); ctx.fill();
    ctx.fillText("CP", cx + 12, cpY + 4);
  }

  // ---- Component list --------------------------------------------------
  renderList(rocket) {
    this.listEl.innerHTML = "";
    rocket.components.forEach((c) => {
      const li = document.createElement("li");
      if (c.id === this.selectedId) li.classList.add("selected");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = LABELS[c.type];
      li.appendChild(name);

      const del = document.createElement("button");
      del.className = "del";
      del.textContent = "×";
      del.title = "Delete";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.cb.onDelete(c.id);
      });
      li.appendChild(del);

      li.addEventListener("click", () => {
        this.selectedId = c.id;
        this.render(rocket);
      });
      this.listEl.appendChild(li);
    });
  }

  // ---- Per-component editor -------------------------------------------
  renderEditor(rocket) {
    const c = rocket.components.find((x) => x.id === this.selectedId);
    if (!c) {
      this.editorEl.innerHTML = '<p class="muted">Select a component to edit its dimensions.</p>';
      return;
    }
    this.editorEl.innerHTML = `<strong>${LABELS[c.type]}</strong>`;
    if (c.type === "finCan") this.editorEl.insertAdjacentHTML("beforeend", `<p class="muted">Inline sleeve section; wall thickness = ${((c.diameter-c.innerDiameter)*500).toFixed(2)} mm. Flat fins, no fillets. Dimensions apply on Enter or blur.</p>`);
    for (const f of FIELDS[c.type]) {
      const label = document.createElement("label");
      label.textContent = f.label;
      this.editorEl.appendChild(label);

      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        for (const opt of f.options) {
          const o = document.createElement("option");
          o.value = opt; o.textContent = opt;
          if (c[f.key] === opt) o.selected = true;
          input.appendChild(o);
        }
        input.addEventListener("change", () => {
          c[f.key] = input.value;
          this.cb.onChange();
        });
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.step = f.step;
        input.value = c[f.key];
        input.addEventListener("change", () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          const candidate = { ...c, [f.key]: f.int ? Math.round(v) : v };
          try {
            if (c.type === "finCan") validateFinCan(candidate);
            else if (v <= 0 && f.key !== "sweep") throw new Error("Dimension must be positive.");
            Object.assign(c, candidate);
            document.getElementById("project-status").textContent = "";
            this.cb.onChange();
          } catch (error) {
            input.value = c[f.key];
            document.getElementById("project-status").textContent = error.message;
          }
        });
      }
      input.id = `component-${c.id}-${f.key}`;
      input.dataset.field = f.key;
      label.htmlFor = input.id;
      this.editorEl.appendChild(input);
    }
  }

  // ---- Stability readout ----------------------------------------------
  renderStability(rocket) {
    const motor = getMotor(rocket.motorId);
    const motorX = (totalLength(rocket) || 0.5) - 0.05;
    const { cg, cp, dRef, calibers } = stabilityMargin(rocket, motor.totalMass, motorX);

    const stable = calibers >= 1 && calibers <= 2.5;
    const marginal = calibers > 0 && calibers < 1;

    let verdict, cls;
    if (stable) { verdict = "STABLE"; cls = "good"; }
    else if (marginal) { verdict = "MARGINAL"; cls = "bad"; }
    else if (calibers >= 2.5) { verdict = "OVER-STABLE"; cls = "bad"; }
    else { verdict = "UNSTABLE"; cls = "bad"; }

    this.stabilityEl.innerHTML = `
      <div class="row"><span>Stability margin</span>
        <span class="big">${calibers.toFixed(2)} cal</span></div>
      <div class="row"><span>Verdict</span>
        <span class="badge ${cls}">${verdict}</span></div>
      <div class="row"><span>CG from nose</span><span>${(cg * 100).toFixed(1)} cm</span></div>
      <div class="row"><span>CP from nose</span><span>${(cp * 100).toFixed(1)} cm</span></div>
      <div class="row"><span>Reference ⌀</span><span>${(dRef * 100).toFixed(1)} cm</span></div>
    `;
  }

  // ---- Rich, educational analysis panel --------------------------------
  // Lists every depth metric with its value + unit, a plain-language note on
  // why it matters, and a citation. Also shows the per-part mass breakdown
  // and any warnings (low stability, fin flutter risk).
  renderAnalysis(rocket) {
    if (!this.analysisEl) return;
    const motor = getMotor(rocket.motorId);

    let report;
    try {
      report = buildReport(rocket, motor);
    } catch (err) {
      this.analysisEl.innerHTML =
        `<p class="muted">Analysis unavailable: ${err.message}</p>`;
      return;
    }

    const esc = (str) => String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const fmtValue = (v) => {
      if (typeof v === "string") return esc(v);
      if (!Number.isFinite(v)) return "n/a";
      const abs = Math.abs(v);
      if (abs !== 0 && (abs < 0.01 || abs >= 100000)) return v.toExponential(2);
      if (abs >= 100) return v.toFixed(0);
      if (abs >= 10) return v.toFixed(1);
      return v.toFixed(2);
    };

    let html = "";

    // Warnings first so they are impossible to miss.
    for (const w of report.warnings) {
      html += `<div class="analysis-warning">⚠ ${esc(w)}</div>`;
    }

    // Honesty note when the selected motor uses an approximate .eng curve.
    if (report.motorNote) {
      html += `<div class="analysis-note">ℹ ${esc(report.motorNote)}</div>`;
    }

    // Each metric: value + unit on the header row, explanation + citation below.
    for (const m of report.metrics) {
      html += `
        <div class="metric">
          <div class="metric-head">
            <span class="metric-label">${esc(m.label)}</span>
            <span class="metric-value">${fmtValue(m.value)}${m.unit ? " " + esc(m.unit) : ""}</span>
          </div>
          <div class="metric-why">${esc(m.explanation)}</div>
          <div class="metric-cite">${esc(m.citation)}</div>
        </div>`;
    }

    // Per-part mass breakdown.
    html += `<div class="metric"><div class="metric-head">
      <span class="metric-label">Mass breakdown</span></div>`;
    for (const p of report.massBreakdown) {
      html += `<div class="breakdown-row">
        <span>${esc(p.name)}</span>
        <span>${p.grams.toFixed(1)} g (${p.percent.toFixed(0)}%)</span>
      </div>`;
    }
    html += `</div>`;

    this.analysisEl.innerHTML = html;
  }
}
