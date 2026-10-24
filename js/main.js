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
import { motorOptions, getMotor } from "./motors.js";
import { massProperties, dragCoefficient, referenceArea } from "./aero.js";
import { simulateFlight } from "./physics.js";
import { Builder } from "./builder.js";
import { FlightView } from "./flight.js";

// ---- Shared state ------------------------------------------------------
let rocket = defaultRocket();

// ---- Builder view ------------------------------------------------------
const builder = new Builder(
  {
    canvas: document.getElementById("cad-canvas"),
    listEl: document.getElementById("component-list"),
    editorEl: document.getElementById("editor"),
    stabilityEl: document.getElementById("stability"),
  },
  {
    onChange: () => builder.render(rocket),
    onDelete: (id) => {
      rocket.components = rocket.components.filter((c) => c.id !== id);
      if (builder.selectedId === id) builder.selectedId = null;
      builder.render(rocket);
    },
  }
);

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
    builder.render(rocket);
  });
});

// ---- Motor dropdown ----------------------------------------------------
const motorSelect = document.getElementById("motor-select");
for (const { id, label } of motorOptions()) {
  const o = document.createElement("option");
  o.value = id; o.textContent = label;
  if (id === rocket.motorId) o.selected = true;
  motorSelect.appendChild(o);
}
motorSelect.addEventListener("change", () => {
  rocket.motorId = motorSelect.value;
  builder.render(rocket);
});

// ---- Tabs --------------------------------------------------------------
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("view-build").classList.toggle("active", name === "build");
  document.getElementById("view-fly").classList.toggle("active", name === "fly");
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
document.getElementById("play-btn").addEventListener("click", () => flight.play());
document.getElementById("reset-btn").addEventListener("click", () => flight.reset());

// ---- Initial render ----------------------------------------------------
builder.render(rocket);
