import { bytesToBase64, base64ToBytes, stepHash, metadataComparison, verifyProjectAssets, PROJECT_LIMIT } from "./imported.js";
import { runCAD } from "./cad/client.js";
// ===========================================================================
// main.js — wires everything together.
//
// Owns the shared rocket model, hooks up the builder + flight views, handles
// the tab switching and the "Launch" action (build the sim inputs from the
// rocket + motor, run the simulation, and hand the trajectory to the flight
// view).
// ===========================================================================

import { defaultRocket, createNose, createBody, createTransition, createFins, createFinCan, createImported, createRing, layoutPositions, MATERIALS,
         totalLength } from "./rocket.js";
import { motorOptions, getMotor, loadEngFiles } from "./motors.js";
import { massProperties, dragCoefficient, referenceArea } from "./aero.js";
import { simulateFlight } from "./physics.js";
import { Builder } from "./builder.js";
import { FlightView } from "./flight.js";
import { parseProject, serializeProject } from "./project.js";
import { rocketFeatureScripts } from "./onshape/featurescript.js";

// ---- Shared state ------------------------------------------------------
let rocket = defaultRocket();
let cadResult = null, cadSnapshot = null, cadViewer = null, cadMetadata = null;
let view3dActive = false; // whether the 3D view is currently showing

// ---- Builder view ------------------------------------------------------
const builder = new Builder(
  {
    canvas: document.getElementById("cad-canvas"),
    listEl: document.getElementById("component-list"),
    editorEl: document.getElementById("editor"),
    stabilityEl: document.getElementById("stability"),
    analysisEl: document.getElementById("analysis"),
  },
  {
    onChange: () => refresh(),
    onDelete: (id) => {
      rocket.components = rocket.components.filter((c) => c.id !== id);
      if (builder.selectedId === id) builder.selectedId = null;
      refresh();
    },
  }
);

// ---- 3D viewer ---------------------------------------------------------
let viewer = null;
let viewerLoading = null;
let activeTab = "build";

// Re-render the builder (2D + analysis) and, if the 3D view is showing, the
// 3D scene too. Keeping this in one place means every edit path stays in sync.
function refresh() {
  builder.render(rocket);
  invalidateCAD();
  if (view3dActive && viewer) viewer.render(rocket);
}

// ---- Flight view -------------------------------------------------------
const flight = new FlightView({
  canvas: document.getElementById("flight-canvas"),
  telemetryEl: document.getElementById("telemetry"),
  summaryEl: document.getElementById("summary"),
  plotCanvas: document.getElementById("plot-canvas"),
});

// ---- Add-component buttons --------------------------------------------
const factories = {
  nose: createNose,
  body: createBody,
  transition: createTransition,
  fins: createFins,
  finCan: createFinCan,
  ring: createRing,
};
document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.add;
    if ((type === "fins" || type === "finCan") && rocket.components.some(c => c.type === "finCan")) {
      document.getElementById("project-status").textContent = "Edit or remove the existing fin can before adding another tail fin set.";
      return;
    }
    const comp = factories[type]();
    if (type === "finCan") {
      rocket.components = rocket.components.filter(c => c.type !== "fins");
      document.getElementById("project-status").textContent = "Separate tail fins replaced by one inline fin-can sleeve. Rocket length increases by the sleeve length.";
    }
    // Insert fins at the end, everything else before fins.
    if (type === "fins") {
      rocket.components.push(comp);
    } else {
      const firstFin = rocket.components.findIndex((c) => c.type === "fins");
      if (firstFin === -1) rocket.components.push(comp);
      else rocket.components.splice(firstFin, 0, comp);
    }
    builder.selectedId = comp.id;
    refresh();
  });
});

// ---- Motor dropdown ----------------------------------------------------
// The dropdown is populated in two passes: first with the legacy presets so
// the app is usable immediately and offline, then rebuilt once the .eng
// catalog has been fetched and parsed. Options are grouped by impulse class
// (and certification level) under <optgroup> headings so the big L1/L2 list
// stays navigable. The default motor (C6) stays selected across rebuilds.
const motorSelect = document.getElementById("motor-select");

function populateMotorSelect() {
  const current = rocket.motorId;
  motorSelect.textContent = "";

  // Group options by class letter, preserving the impulse-sorted order.
  const groups = new Map(); // letter -> { cert, options: [] }
  for (const opt of motorOptions()) {
    if (!groups.has(opt.class)) groups.set(opt.class, { cert: opt.cert, options: [] });
    groups.get(opt.class).options.push(opt);
  }

  for (const [letter, group] of groups) {
    const og = document.createElement("optgroup");
    const certTag = group.cert && group.cert !== "Model" ? ` - ${group.cert}` : "";
    og.label = `Class ${letter}${certTag}`;
    for (const opt of group.options) {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      if (opt.id === current) o.selected = true;
      og.appendChild(o);
    }
    motorSelect.appendChild(og);
  }
  motorSelect.value = current;
}

populateMotorSelect();

motorSelect.addEventListener("change", () => {
  rocket.motorId = motorSelect.value;
  refresh();
});

// Fetch the real .eng catalog in the background, then rebuild the dropdown
// with the full H/I/J/K list grouped by class. Failures are non-fatal: the
// legacy presets remain available.
loadEngFiles()
  .then((loaded) => {
    if (loaded.length > 0) populateMotorSelect();
  })
  .catch((err) => console.warn("motor catalog load failed:", err));

// ---- 2D / 3D view toggle ----------------------------------------------
// Switch the Builder center panel between the 2D canvas and the 3D viewer.
// The 3D animation loop runs only while 3D is shown, and is stopped when we
// switch back, so we never leave an idle RAF loop running.
async function setCenterView(mode) {
  if (mode === "3d" && !viewer) {
    const button = document.getElementById("view3d-btn");
    button.disabled = true;
    try {
      viewerLoading ??= import("./viewer3d.js");
      const { Viewer3D } = await viewerLoading;
      viewer = new Viewer3D(document.getElementById("viewer3d"));
    } catch (error) {
      viewerLoading = null;
      document.getElementById("project-status").textContent = "3D unavailable. The 2D builder remains available. " + error.message;
      return;
    } finally { button.disabled = false; }
  }
  view3dActive = mode === "3d";
  document.getElementById("view2d-btn").classList.toggle("active", !view3dActive);
  document.getElementById("view3d-btn").classList.toggle("active", view3dActive);
  document.getElementById("cad-2d").classList.toggle("active", !view3dActive);
  document.getElementById("cad-3d").classList.toggle("active", view3dActive);

  if (view3dActive) {
    viewer.render(rocket);
    if (activeTab === "build") {
      try { viewer.start(); } catch (error) {
        setCenterView("2d");
        document.getElementById("project-status").textContent = "3D unavailable: " + error.message;
      }
    }
  } else {
    viewer?.stop();
  }
}
document.getElementById("view2d-btn").addEventListener("click", () => setCenterView("2d"));
document.getElementById("view3d-btn").addEventListener("click", () => setCenterView("3d"));

// ---- Tabs --------------------------------------------------------------
function switchTab(name) {
  activeTab = name;
  if (name !== "build") cadViewer?.stop();
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("view-build").classList.toggle("active", name === "build");
  document.getElementById("view-fly").classList.toggle("active", name === "fly");

  // Pause the 3D loop when the Builder tab is not visible; resume it when we
  // come back and 3D is the selected center view. This avoids a hidden RAF
  // loop rendering offscreen during flight.
  if (name === "build" && view3dActive && viewer) {
    viewer.render(rocket);
    viewer.start();
  } else {
    viewer?.stop();
  }
}
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => switchTab(t.dataset.tab)));
document.getElementById("back-btn").addEventListener("click", () => switchTab("build"));

// ---- Launch: build sim inputs, run it, show the flight -----------------
function runSimulation() {
  try {
  const motor = getMotor(rocket.motorId);
  const L = totalLength(rocket) || 0.5;

  // Dry mass = all structural components (no motor); motor mass handled by sim.
  const { mass: structureMass } = massProperties(rocket, 0);
  const dryMass = structureMass; // Entire motor mass is added by the simulator.

  const Cd = dragCoefficient(rocket);
  const area = referenceArea(rocket);

  const result = simulateFlight({
    motor, dryMass, Cd, area, rocket,
    useParachute: true,
    parachuteArea: Math.max(0.1, area * 40), // rough chute size from body size
  });

  flight.load(result);
  switchTab("fly");
  } catch (error) {
    document.getElementById("project-status").textContent = "Simulation unavailable: " + error.message;
  }
}

document.getElementById("launch-btn").addEventListener("click", runSimulation);

// ---- Onshape export preview (scaffolding, no network) ------------------
// The live Onshape REST API is deferred until the account can create API keys.
// For now this button only PREVIEWS the parametric part definitions the export
// pipeline would POST (the pure builders in js/onshape/*). It makes no network
// call and is wrapped in try/catch so a bad edit can never break the Builder.
const onshapeBtn = document.getElementById("onshape-preview-btn");
const onshapePreview = document.getElementById("onshape-preview");
if (onshapeBtn && onshapePreview) {
  onshapeBtn.addEventListener("click", () => {
    if (!onshapePreview.hidden) {
      onshapePreview.hidden = true;
      return;
    }
    try {
      const payloads = rocketFeatureScripts(rocket);
      const parts = payloads
        .map((p) => {
          const params = JSON.stringify(p.parameters, null, 2);
          return `=== ${p.featureName} (${p.units}) ===\n\n` +
                 `-- FeatureScript --\n${p.source}\n` +
                 `-- Parameters --\n${params}`;
        })
        .join("\n\n");
      onshapePreview.textContent =
        "Live Onshape export is coming soon. These are the parametric part " +
        "definitions the pipeline would send (no network call is made yet).\n\n" +
        parts;
    } catch (err) {
      onshapePreview.textContent = `Preview unavailable: ${err.message}`;
    }
    onshapePreview.hidden = false;
  });
}
document.getElementById("play-btn").addEventListener("click", () => flight.play());
document.getElementById("reset-btn").addEventListener("click", () => flight.reset());

// ---- Initial render ----------------------------------------------------
// Start in the 2D view (offline-friendly); the user opts into 3D via the
// toggle, which lazily boots the WebGL renderer and the animation loop.
refresh();

// Project replacement is atomic: parsing must succeed before shared state changes.
const projectStatus = document.getElementById("project-status");
const projectName = document.getElementById("project-name");
const projectFile = document.getElementById("project-file");
projectName.addEventListener("change", () => {
  rocket.name = projectName.value.trim() || "Untitled Rocket";
  projectName.value = rocket.name;
});
document.getElementById("save-project-btn").addEventListener("click", () => {
  try {
    rocket.name = projectName.value.trim() || "Untitled Rocket";
    const url = URL.createObjectURL(new Blob([serializeProject(rocket)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = rocket.name.replace(/[^a-z0-9_-]/gi, "_") + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    projectStatus.textContent = "Project saved as JSON.";
  } catch (error) { projectStatus.textContent = "Save failed: " + error.message; }
});
document.getElementById("load-project-btn").addEventListener("click", () => projectFile.click());
projectFile.addEventListener("change", async () => {
  const file = projectFile.files[0];
  if (!file) return;
  try {
    if (file.size > PROJECT_LIMIT) throw new Error("Project file exceeds 50 MB.");
    const imported = parseProject(await file.text());
    await verifyProjectAssets(imported);
    flight.reset();
    flight.result = null;
    flight.telemetryEl.textContent = "Launch the imported design to generate telemetry.";
    flight.summaryEl.textContent = "";
    flight.ctx.clearRect(0, 0, flight.canvas.width, flight.canvas.height);
    flight.plotCtx.clearRect(0, 0, flight.plotCanvas.width, flight.plotCanvas.height);
    rocket = imported;
    builder.selectedId = null;
    projectName.value = rocket.name;
    onshapePreview.hidden = true;
    populateMotorSelect();
    refresh();
    switchTab("build");
    projectStatus.textContent = "Project loaded. Previous simulation cleared.";
  } catch (error) { projectStatus.textContent = "Load failed: " + error.message; }
  finally { projectFile.value = ""; }
});

const plotSelect = document.getElementById("plot-select");
plotSelect.addEventListener("change", () => {
  flight.plotType = plotSelect.value;
  if (flight.result) flight.drawPlot();
});

// CAD operations run in an optional worker; core builder startup stays offline.
function selectedCADComponent() {
  return rocket.components.find(c => c.id === builder.selectedId);
}
function invalidateCAD() {
  if (cadSnapshot && JSON.stringify(selectedCADComponent()) !== cadSnapshot) {
    cadResult = null; cadSnapshot = null;
    for (const id of ["cad-step", "cad-stl", "cad-metadata", "cad-attach", "cad-load-metadata", "cad-restore"]) document.getElementById(id).disabled = true;
    document.getElementById("cad-status").textContent = "Model changed. Generate the solid again before exporting.";
    document.getElementById("cad-properties").textContent = "";
    cadViewer?.stop();
  }
}
function downloadCAD(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], {type}));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function showCADResult(result, note) {
  document.getElementById("cad-properties").textContent = JSON.stringify(result.properties, null, 2);
  document.getElementById("cad-status").textContent = note;
  try {
    const { Viewer3D } = await import("./viewer3d.js");
    cadViewer ??= new Viewer3D(document.getElementById("cad-viewer"));
    cadViewer.renderCAD(result.mesh, result.properties);
    if (activeTab !== "build" || !document.getElementById("cad-panel").open) cadViewer.stop();
  } catch (error) {
    document.getElementById("cad-status").textContent += " 3D preview unavailable: " + error.message;
  }
}
async function performCAD(job, snapshot = null) {
  const controls = ["cad-generate", "cad-import", "cad-step", "cad-stl", "cad-metadata", "cad-attach", "cad-load-metadata", "cad-restore"];
  for (const id of controls) document.getElementById(id).disabled = true;
  cadResult = null; cadSnapshot = null; cadMetadata = null;
  document.getElementById("cad-status").textContent = "Loading CAD kernel / computing solid…";
  document.getElementById("cad-properties").textContent = "";
  try {
    const result = await runCAD(job);
    if (snapshot && snapshot !== JSON.stringify(selectedCADComponent())) throw new Error("Selection or dimensions changed during generation. Generate again.");
    result.sha256 = await stepHash(job.action === "import" ? job.bytes : result.step);
    if (job.action === "import") { result.sourceStep = job.bytes; result.sourceName=job.filename; }
    cadResult = result; cadSnapshot = snapshot;
    await showCADResult(result, job.action === "import" ? "STEP imported for inspection. Choose an assembly action and explicit aerodynamic interpretation to use it in the rocket." : "Valid single solid. Exported STEP reopened successfully with matching volume. CAD coordinates: +Z along the sleeve, +X radial, millimeters.");
    if (snapshot) for (const id of ["cad-step", "cad-stl", "cad-metadata"]) document.getElementById(id).disabled = false;
    else for (const id of ["cad-attach", "cad-load-metadata"]) document.getElementById(id).disabled = false;
  } catch (error) { document.getElementById("cad-status").textContent = "CAD failed: " + error.message; }
  finally { for (const id of ["cad-generate", "cad-import"]) document.getElementById(id).disabled = false; }
}
document.getElementById("cad-generate").addEventListener("click", () => {
  const component = selectedCADComponent();
  if (!component || !["body", "finCan", "ring"].includes(component.type)) {
    document.getElementById("cad-status").textContent = "Select a body tube, fin can, or centering ring in the component list first."; return;
  }
  performCAD({component: {...component}, toleranceMm: Number(document.getElementById("cad-tolerance").value)}, JSON.stringify(component));
});
for (const [id, key, ext, mime] of [["cad-step","step","step","application/step"],["cad-stl","stl","stl","model/stl"],["cad-metadata","metadata","json","application/json"]]) {
  document.getElementById(id).addEventListener("click", () => {
    invalidateCAD(); if (!cadResult || !cadSnapshot) return;
    const component = JSON.parse(cadSnapshot);
    const metadata = {format:"rocketlab-cad",version:2,stepSha256:cadResult.sha256,rocketName:rocket.name,component,material:component.material,coordinateSystem:{units:"mm",axis:"+Z from sleeve front to rear",radial:"+X"},properties:cadResult.properties,tessellationToleranceMm:cadResult.toleranceMm,notice:"External edits may invalidate these parameters. Reinspect the STEP geometry."};
    downloadCAD(key === "metadata" ? JSON.stringify(metadata,null,2) : cadResult[key], `rocketlab-${component.type}-${component.id}.${ext}`, mime);
  });
}
const cadFile = document.getElementById("cad-file");
document.getElementById("cad-import").addEventListener("click", () => cadFile.click());
cadFile.addEventListener("change", async () => {
  const file = cadFile.files[0]; if (!file) return;
  try {
    if (file.size > 20000000) throw new Error("STEP import limit is 20 MB.");
    await performCAD({action:"import",filename:file.name,bytes:new Uint8Array(await file.arrayBuffer()),toleranceMm:.1});
  } catch(error) {document.getElementById("cad-status").textContent = error.message;}
  finally {cadFile.value="";}
});
document.getElementById("component-list").addEventListener("click", invalidateCAD);
document.getElementById("cad-panel").addEventListener("toggle", event => {
  if (event.target.open && cadResult && activeTab === "build") cadViewer?.start();
  else cadViewer?.stop();
});

function installCADComponent(component) {
  const selected = selectedCADComponent();
  const replace = document.getElementById("cad-assembly-mode").value === "replace";
  if (replace && !selected) throw new Error("Select the physical component to replace, or choose Add a separate physical part.");
  const components = replace ? rocket.components.map(c=>c.id===selected.id?component:c) : [...rocket.components,component];
  // Validate the prospective assembly before changing shared state.
  serializeProject({...rocket,components});
  rocket.components=components; builder.selectedId=component.id;
  flight.reset(); flight.result=null;
  flight.telemetryEl.textContent="Launch the modified assembly to generate telemetry.";
  flight.summaryEl.textContent="";
  flight.ctx.clearRect(0,0,flight.canvas.width,flight.canvas.height);
  flight.plotCtx.clearRect(0,0,flight.plotCanvas.width,flight.plotCanvas.height);
  onshapePreview.hidden=true;
  refresh();
}
document.getElementById("cad-attach").addEventListener("click",()=>{
  try {
    if(!cadResult?.sourceStep) throw new Error("Inspect a STEP file first.");
    const aeroRole=document.getElementById("cad-role").value;
    const selected=selectedCADComponent();
    const material=document.getElementById("cad-material").value;
    const component=createImported({
      name:cadResult.sourceName || "Imported CAD", aeroRole,material,density:MATERIALS[material],
      length:Number(document.getElementById("cad-proxy-length").value),
      diameter:Number(document.getElementById("cad-proxy-diameter").value),
      axialOffset:aeroRole==="internal" && selected ? layoutPositions(rocket).get(selected.id) ?? 0 : 0,
      cad:{stepBase64:bytesToBase64(cadResult.sourceStep),sha256:cadResult.sha256,
        properties:cadResult.properties,mesh:cadResult.mesh,metadata:cadMetadata},
    });
    installCADComponent(component);
    document.getElementById("cad-status").textContent="Imported CAD is in the assembly. Confirm placement and density in its editor; aerodynamic role is " + aeroRole + ". Source STEP and measured properties will be saved in the project.";
  } catch(error) {document.getElementById("cad-status").textContent="Assembly unchanged: "+error.message;}
});
const metadataFile=document.getElementById("cad-metadata-file");
document.getElementById("cad-load-metadata").addEventListener("click",()=>metadataFile.click());
metadataFile.addEventListener("change",async()=>{
  const file=metadataFile.files[0]; if(!file)return;
  document.getElementById("cad-restore").disabled=true;
  try {
    if(!cadResult?.sourceStep)throw new Error("Inspect a STEP file first.");
    if(file.size>1000000)throw new Error("Metadata file exceeds 1 MB.");
    const metadata=JSON.parse(await file.text());
    const match=metadataComparison(metadata,cadResult);
    cadMetadata=metadata;
    document.getElementById("cad-restore").disabled=!match.canRestore;
    document.getElementById("cad-status").textContent=match.canRestore
      ? "STEP fingerprint and measured properties match companion metadata. Original parameters can be restored after a regeneration check."
      : "Metadata does not establish an unchanged source: "+(match.propertiesMatch?"properties match, but source fingerprint is missing or different.":"measured geometry differs.")+" Use the custom CAD assembly workflow and confirm parameters manually.";
  } catch(error) {document.getElementById("cad-status").textContent="Metadata unavailable: "+error.message;}
  finally {metadataFile.value="";}
});
document.getElementById("cad-restore").addEventListener("click",async()=>{
  document.getElementById("cad-restore").disabled=true;
  try {
    if(!cadResult?.sourceStep || !metadataComparison(cadMetadata,cadResult).canRestore)throw new Error("Unchanged STEP source and compatible metadata are required.");
    const original=parseProject(JSON.stringify({format:"rocketlab",version:1,rocket:{name:"Restored CAD",motorId:rocket.motorId,components:[cadMetadata.component]}})).components[0];
    const selectedId=builder.selectedId;
    const regenerated=await runCAD({component:original});
    if(builder.selectedId!==selectedId) throw new Error("Selection changed during regeneration. Try restoring again.");
    const checked=metadataComparison({format:"rocketlab-cad",version:1,properties:regenerated.properties},cadResult);
    if(!checked.propertiesMatch)throw new Error("Regenerated parameters differ from the imported geometry. Use custom CAD instead.");
    original.sourceStepSha256=cadResult.sha256;
    installCADComponent(original);
    document.getElementById("cad-status").textContent="Original parametric part restored. STEP fingerprint and regenerated solid properties both matched; no extra physical part was added when using Replace.";
  } catch(error) {document.getElementById("cad-status").textContent="Restore failed; assembly unchanged: "+error.message;}
});
