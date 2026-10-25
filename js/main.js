// ===========================================================================
// main.js — wires everything together.
//
// Owns the shared rocket model, hooks up the builder + flight views, handles
// the tab switching and the "Launch" action (build the sim inputs from the
// rocket + motor, run the simulation, and hand the trajectory to the flight
// view).
// ===========================================================================

import { defaultRocket, createNose, createBody, createTransition, createFins,
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
};
document.querySelectorAll("[data-add]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.add;
    const comp = factories[type]();
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
  const motor = getMotor(rocket.motorId);
  const L = totalLength(rocket) || 0.5;

  // Dry mass = all structural components (no motor); motor mass handled by sim.
  const { mass: structureMass } = massProperties(rocket, 0);
  const dryMass = structureMass + (motor.totalMass - motor.propellantMass);

  const Cd = dragCoefficient(rocket);
  const area = referenceArea(rocket);

  const result = simulateFlight({
    motor, dryMass, Cd, area,
    useParachute: true,
    parachuteArea: Math.max(0.1, area * 40), // rough chute size from body size
  });

  flight.load(result);
  switchTab("fly");
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
    if (file.size > 1000000) throw new Error("Project file exceeds 1 MB.");
    const imported = parseProject(await file.text());
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
