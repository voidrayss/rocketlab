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
         frontDiameter, rearDiameter, maxBodyDiameter } from "./rocket.js";
import { stabilityMargin } from "./aero.js";
import { getMotor } from "./motors.js";

// --- Which editable fields each component type exposes. ---
const FIELDS = {
  [COMPONENT_TYPES.NOSE]: [
    { key: "length",        label: "Length (m)",        step: 0.01 },
    { key: "diameter",      label: "Diameter (m)",      step: 0.005 },
    { key: "wallThickness", label: "Wall thickness (m)",step: 0.0005 },
    { key: "shape",         label: "Shape",             type: "select", options: ["ogive", "cone", "blunt"] },
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

const LABELS = {
  [COMPONENT_TYPES.NOSE]: "Nose Cone",
  [COMPONENT_TYPES.BODY]: "Body Tube",
  [COMPONENT_TYPES.TRANSITION]: "Transition",
  [COMPONENT_TYPES.FINS]: "Fins",
};

export class Builder {
  constructor(refs, callbacks) {
    this.canvas = refs.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.listEl = refs.listEl;
    this.editorEl = refs.editorEl;
    this.stabilityEl = refs.stabilityEl;
    this.cb = callbacks; // { onChange, onSelect }
    this.selectedId = null;
  }

  render(rocket) {
    this.rocket = rocket;
    this.drawRocket(rocket);
    this.renderList(rocket);
    this.renderEditor(rocket);
    this.renderStability(rocket);
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
        if (c.shape === "cone") {
          ctx.lineTo(cx - w / 2, y + c.length * scale);
          ctx.lineTo(cx + w / 2, y + c.length * scale);
        } else if (c.shape === "blunt") {
          ctx.quadraticCurveTo(cx - w, y + c.length * scale, cx - w / 2, y + c.length * scale);
          ctx.lineTo(cx + w / 2, y + c.length * scale);
          ctx.quadraticCurveTo(cx + w, y + c.length * scale, cx, y);
        } else { // ogive
          ctx.quadraticCurveTo(cx - w / 2, y + c.length * scale * 0.4, cx - w / 2, y + c.length * scale);
          ctx.lineTo(cx + w / 2, y + c.length * scale);
          ctx.quadraticCurveTo(cx + w / 2, y + c.length * scale * 0.4, cx, y);
        }
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

      else if (c.type === COMPONENT_TYPES.FINS) {
        const bodyW = maxD * scale;
        const h = c.rootChord * scale;
        const span = c.span * scale;
        const sweep = c.sweep * scale;
        const tip = c.tipChord * scale;
        // left fin
        ctx.beginPath();
        ctx.moveTo(cx - bodyW / 2, y);
        ctx.lineTo(cx - bodyW / 2 - span, y + sweep);
        ctx.lineTo(cx - bodyW / 2 - span, y + sweep + tip);
        ctx.lineTo(cx - bodyW / 2, y + h);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        // right fin
        ctx.beginPath();
        ctx.moveTo(cx + bodyW / 2, y);
        ctx.lineTo(cx + bodyW / 2 + span, y + sweep);
        ctx.lineTo(cx + bodyW / 2 + span, y + sweep + tip);
        ctx.lineTo(cx + bodyW / 2, y + h);
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
        input.addEventListener("input", () => {
          let v = parseFloat(input.value);
          if (!isNaN(v)) { c[f.key] = f.int ? Math.round(v) : v; this.cb.onChange(); }
        });
      }
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
}
