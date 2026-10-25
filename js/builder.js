import { resolveAssembly, assembled, finStart } from "./assembly.js";
import { ringProperties } from "./rings.js";
import { validateImported, importedPoint } from "./imported.js";
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

import { COMPONENT_TYPES, MATERIALS, layoutPositions, bodyLength, totalLength,
         frontDiameter, rearDiameter, maxBodyDiameter, noseConeProfile, overallBounds } from "./rocket.js";
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
    {key:"massModel",label:"Mass / manufacturing model",type:"select",options:["legacy-cone","profile-shell"]},
    {key:"shoulderEnabled",label:"Enable shoulder",type:"checkbox"},
    {key:"shoulderLength",label:"Shoulder length (m)",step:.005},
    {key:"shoulderDiameter",label:"Shoulder outer diameter (m)",step:.001},
    {key:"shoulderWallThickness",label:"Shoulder wall (m)",step:.0005},
    {key:"shoulderHollow",label:"Hollow shoulder",type:"checkbox"},
    {key:"shoulderJoinThickness",label:"Join web axial thickness (m)",step:.0005},
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
    {key:"finOffset",label:"Fin axial offset (m; relative to sleeve start / tail alignment)",step:.005},
    { key: "material",  label: "Material",       type: "select", options: Object.keys(MATERIALS) },
  ],
};

FIELDS.finCan = [
  { key: "length", label: "Sleeve length (m)", step: 0.005 },
  { key: "diameter", label: "Sleeve outer diameter (m)", step: 0.001 },
  { key: "innerDiameter", label: "Sleeve inner diameter (m)", step: 0.001 },
  ...FIELDS.fins,
];
FIELDS.ring = [
  {key:"length",label:"Ring axial thickness (m)",step:.001},
  {key:"diameter",label:"Outer diameter (m)",step:.001},
  {key:"innerDiameter",label:"Bore diameter (m)",step:.001},
  {key:"axialOffset",label:"Axial position from nose (m)",step:.005},
  {key:"material",label:"Material",type:"select",options:Object.keys(MATERIALS)},
];
FIELDS.imported = [
  {key:"name",label:"Part name",type:"text"},
  {key:"aeroRole",label:"Aerodynamic interpretation",type:"select",options:["internal","body"]},
  {key:"material",label:"Material (resets density)",type:"select",options:Object.keys(MATERIALS)},
  {key:"density",label:"Density (kg/m³)",step:10},
  {key:"length",label:"External proxy / stack length (m)",step:.005},
  {key:"diameter",label:"External proxy diameter (m)",step:.001},
  {key:"axialOffset",label:"Axial offset / internal absolute position (m)",step:.005},
  {key:"radialX",label:"Radial X offset (m)",step:.001},
  {key:"radialY",label:"Radial Y offset (m)",step:.001},
  ...["X","Y","Z"].map(axis=>({key:"rotation"+axis,label:"Source "+axis+" rotation (deg)",step:1})),
];
const LABELS = {
  [COMPONENT_TYPES.NOSE]: "Nose Cone",
  [COMPONENT_TYPES.BODY]: "Body Tube",
  [COMPONENT_TYPES.TRANSITION]: "Transition",
  [COMPONENT_TYPES.FINS]: "Fins",
  finCan: "Integrated fin can",
  imported: "Imported CAD",
  ring: "Centering ring",
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
    this.drawRocket(resolveAssembly(rocket));
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
    const topY = margin-overallBounds(rocket).min*scale;

    const pos = layoutPositions(rocket);

    // Draw centerline.
    ctx.strokeStyle = "#2a333f";
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(cx, topY - 10); ctx.lineTo(cx, topY + L * scale + 10); ctx.stroke();
    ctx.setLineDash([]);

    // Draw each component.
    for (const c of rocket.components) {
      if(c.visible===false)continue;
      const x0 = pos.get(c.id) ?? 0;
      const y = topY + x0 * scale;

      ctx.fillStyle = c.id === this.selectedId ? "#ff9166" : "#c9d4e0";
      ctx.strokeStyle = "#0e1116";
      ctx.lineWidth = 1.5;

      if (c.type === "ring") {
        ctx.strokeStyle="#8bd3b0";
        ctx.strokeRect(cx-c.diameter*scale/2,y,c.diameter*scale,Math.max(2,c.length*scale));
        ctx.fillText("RING",cx+c.diameter*scale/2+4,y+4);
      } else if (c.type === "imported") {
        const axial = importedPoint(c,c.cad.properties.centroidMm)[0];
        ctx.strokeStyle = "#8bd3b0";
        if (c.aeroRole === "body") {
          ctx.setLineDash([5,3]);
          ctx.strokeRect(cx-c.diameter*scale/2,y,c.diameter*scale,c.length*scale);
          ctx.setLineDash([]);
        }
        ctx.fillText("CAD",cx+18,y+axial*scale);
        ctx.beginPath();ctx.arc(cx,y+axial*scale,4,0,Math.PI*2);ctx.fill();
      } else if (c.type === COMPONENT_TYPES.NOSE) {
        const w = c.diameter * scale;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        const profile = noseConeProfile(c, 48);
        for (const point of profile) ctx.lineTo(cx - point.r * scale, y + point.x * scale);
        for (const point of [...profile].reverse()) ctx.lineTo(cx + point.r * scale, y + point.x * scale);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if(c.shoulderEnabled){ctx.setLineDash([3,3]);ctx.strokeRect(cx-c.shoulderDiameter*scale/2,y+c.length*scale,c.shoulderDiameter*scale,c.shoulderLength*scale);ctx.setLineDash([]);}
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
        const finY = c.type === "finCan" ? y + finStart(c) * scale : y;
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
    const motorX = Math.max(0,bodyLength(rocket)-0.05);
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
      const li = document.createElement("li");li.dataset.type=c.type;li.dataset.partUid=c.uid;
      if (c.id === this.selectedId) li.classList.add("selected");
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = (c.name || LABELS[c.type]) + (c.inAssembly===false ? " · library" : "") + (c.visible===false ? " · hidden" : "");
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
        if(this.cb.onSelect)this.cb.onSelect(c.id);else this.render(rocket);
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
    const nameLabel=document.createElement("label");nameLabel.textContent="Part name";
    const name=document.createElement("input");name.type="text";name.maxLength=200;name.value=c.name||LABELS[c.type];name.dataset.field="partName";
    name.addEventListener("change",()=>{if(name.value.trim())this.commit(c,{name:name.value.trim()});});
    nameLabel.appendChild(name);this.editorEl.appendChild(nameLabel);
    for(const [key,text] of [["inAssembly","Include in assembly / engineering"],["visible","Visible (display only)"]]){
      const label=document.createElement("label"),input=document.createElement("input");input.type="checkbox";input.checked=c[key]!==false;input.dataset.field=key;
      label.append(input,document.createTextNode(text));input.addEventListener("change",()=>this.commit(c,{[key]:input.checked}));this.editorEl.appendChild(label);
    }
    if(["nose","finCan","ring","body"].includes(c.type))this.renderAttachment(c,rocket);

    if (c.type === "finCan") this.editorEl.insertAdjacentHTML("beforeend", `<p class="muted">Sleeve wall thickness = ${((c.diameter-c.innerDiameter)*500).toFixed(2)} mm. Flat fins, no fillets. Dimensions apply on Enter or blur.</p>`);
    if (c.type === "ring") this.editorEl.insertAdjacentHTML("beforeend", `<p class="muted">Internal annular solid: exact volume and midpoint centroid; no external drag or CP. Confirm clearances and placement against your body and motor mount.</p>`);
    if (c.type === "imported") this.editorEl.insertAdjacentHTML("beforeend", `<p class="muted">Internal: mass only, absolute axial position. Body: explicit cylindrical aerodynamic proxy in the axial stack; offset is relative to its stack start. STEP geometry remains separate from that proxy. Rotations apply X then Y then Z.</p>`);
    for (const f of FIELDS[c.type]) {
      const label = document.createElement("label");
      label.textContent = f.label;
      this.editorEl.appendChild(label);

      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        for (const opt of f.options) {
          const o = document.createElement("option");
          o.value = opt; o.textContent = ({"legacy-cone":"Legacy thin-cone estimate","profile-shell":"Manufacturing radial-wall shell"})[opt]||opt;
          if (c[f.key] === opt) o.selected = true;
          input.appendChild(o);
        }
        input.addEventListener("change", () => {
          this.commit(c,{[f.key]:input.value,...(c.type==="imported"&&f.key==="material"?{density:MATERIALS[input.value]}:{})});
        });
      } else if (f.type === "checkbox") {
        input=document.createElement("input");input.type="checkbox";input.checked=!!c[f.key];
        input.addEventListener("change",()=>this.commit(c,{[f.key]:input.checked,...(f.key==="shoulderEnabled"&&input.checked?{massModel:"profile-shell"}:{})}));
      } else if (f.type === "text") {
        input = document.createElement("input"); input.type="text";input.maxLength=200;input.value=c[f.key];
        input.addEventListener("change",()=>{
          if(input.value.trim()) {this.commit(c,{[f.key]:input.value.trim()});}
          else input.value=c[f.key];
        });
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.step = f.step;
        input.value = f.key==="finOffset"?(c.finOffset??finStart(c)):c[f.key];
        input.addEventListener("change", () => {
          const v = Number(input.value);
          if (!Number.isFinite(v)) return;
          const candidate = { ...c, [f.key]: f.int ? Math.round(v) : v };
          try {
            if (c.type === "ring") ringProperties(candidate);
            else if (c.type === "imported") validateImported(candidate);
            else if (c.type === "finCan") validateFinCan(candidate);
            else if (v <= 0 && !["sweep","finOffset"].includes(f.key)) throw new Error("Dimension must be positive.");
            this.commit(c,{[f.key]:candidate[f.key]});
          } catch (error) {
            input.value = f.key==="finOffset"?(c.finOffset??finStart(c)):c[f.key];
            document.getElementById("project-status").textContent = error.message;
          }
        });
      }
      if(f.key==="massModel"&&c.shoulderEnabled){input.disabled=true;input.title="A manufacturing shoulder requires the profile-shell model.";}
      const controlled=c.attachment && ["diameter","innerDiameter","shoulderDiameter"].includes(f.key);
      if(controlled && c.attachment.matching!=="manual") {input.disabled=true;input.title=c.attachment.matching==="auto"?"Derived from the attached body; switch matching to manual to override.":"Locked dimension.";}
      input.id = `component-${c.id}-${f.key}`;
      input.dataset.field = f.key;
      label.htmlFor = input.id;
      this.editorEl.appendChild(input);
    }
  }

  commit(c,patch){
    try {this.cb.onEdit(c.id,patch);document.getElementById("project-status").textContent="";}
    catch(error){document.getElementById("project-status").textContent=error.message;this.renderEditor(this.rocket);}
  }
  renderAttachment(c,rocket){
    const section=document.createElement("fieldset"),legend=document.createElement("legend");legend.textContent="Assembly relationship";section.appendChild(legend);
    const bodies=rocket.components.filter(p=>p.type==="body"&&p.id!==c.id&&p.inAssembly!==false);
    const a=c.attachment;
    const select=(key,labelText,options,value,change)=>{
      const label=document.createElement("label"),input=document.createElement("select");label.textContent=labelText;input.dataset.field=key;
      for(const [id,text] of options){const o=document.createElement("option");o.value=id;o.textContent=text;o.selected=String(id)===String(value);input.appendChild(o);}
      input.addEventListener("change",()=>change(input.value));label.appendChild(input);section.appendChild(label);
    };
    select("attachmentParent","Concentric body",[["","Unattached"],...bodies.map(p=>[p.id,p.name||"Body tube #"+p.id])],a?.parentId??"",value=>this.commit(c,{attachment:value?{parentId:Number(value),end:c.type==="nose"?"forward":"aft",fit:c.type==="finCan"?"over":"butt",offset:0,clearance:.0002,matching:"auto"}:undefined}));
    if(a){
      select("matching","Diameter sizing",[["auto","Automatic"],["manual","Manual override"],["locked","Locked"]],a.matching,value=>this.commit(c,{attachment:{...a,matching:value}}));
      if(c.type!=="nose")select("attachmentEnd","Body end",[["forward","Forward"],["aft","Aft"]],a.end,value=>this.commit(c,{attachment:{...a,end:value}}));
      if(c.type==="finCan")select("attachmentFit","Sleeve fit",[["over","Sleeve over body"],["inside","Sleeve inside body (slots required)"],["butt","Inline butt joint"]],a.fit,value=>this.commit(c,{attachment:{...a,fit:value}}));
      for(const [key,labelText,step] of [["offset","Axial offset (m)",.005],["clearance","Radial manufacturing clearance (m)",.0001]]){
        const label=document.createElement("label"),input=document.createElement("input");label.textContent=labelText;input.type="number";input.step=step;input.value=a[key];input.dataset.field="attachment"+key;input.addEventListener("change",()=>this.commit(c,{attachment:{...a,[key]:Number(input.value)}}));label.appendChild(input);section.appendChild(label);
      }
    }
    this.editorEl.appendChild(section);
  }

  // ---- Stability readout ----------------------------------------------
  renderStability(rocket) {
    const motor = getMotor(rocket.motorId);
    const motorX = Math.max(0,bodyLength(rocket)-0.05);
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
