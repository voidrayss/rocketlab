// ===========================================================================
// scripts/smoke.mjs — headless validation harness for RocketLab.
//
// This is the reusable baseline smoke test. It imports the DOM-free analysis
// modules (rocket, motors, aero, physics), builds the default rocket, computes
// its stability on a C6 motor, runs a full flight simulation, and prints the
// headline numbers (apogee, maxMach, calibers, CG, CP, dry mass).
//
// It exits non-zero if any reported value is NaN or Infinity, so it can be used
// as a go/no-go gate before and after future features.
//
// Run from the repo root:  node scripts/smoke.mjs
//
// It mirrors exactly how the browser UI wires these modules together:
//   - stability uses the full motor mass placed near the tail (see builder.js)
//   - the flight uses dry mass = structure only; simulator adds the entire motor (see main.js)
// ===========================================================================

import { defaultRocket, totalLength } from "../js/rocket.js";
import { getMotor } from "../js/motors.js";
import {
  massProperties,
  stabilityMargin,
  dragCoefficient,
  referenceArea,
} from "../js/aero.js";
import { simulateFlight } from "../js/physics.js";

// --- Build the default rocket and grab its C6 motor. ---
const rocket = defaultRocket();
const motor = getMotor(rocket.motorId);

// --- Stability: motor sits ~5 cm ahead of the tail (matches builder.js). ---
const L = totalLength(rocket) || 0.5;
const motorX = L - 0.05;
const { cg, cp, dRef, calibers } = stabilityMargin(rocket, motor.totalMass, motorX);

// --- Flight inputs: dry mass = structure only; simulator adds the entire motor (matches main.js). ---
const { mass: structureMass } = massProperties(rocket, 0);
const dryMass = structureMass; // Entire motor mass is added by the simulator.
const Cd = dragCoefficient(rocket);
const area = referenceArea(rocket);

const result = simulateFlight({
  motor,
  dryMass,
  Cd,
  area,
  useParachute: true,
  parachuteArea: Math.max(0.1, area * 40),
});

const { apogee, maxMach, maxV, apogeeTime, flightTime, burnoutTime } = result.stats;

// --- Report. ---
const report = {
  rocket: rocket.name,
  motor: motor.name,
  totalLength_m: L,
  dRef_m: dRef,
  cg_m: cg,
  cp_m: cp,
  calibers,
  dryMass_kg: dryMass,
  Cd,
  area_m2: area,
  apogee_m: apogee,
  apogeeTime_s: apogeeTime,
  maxV_ms: maxV,
  maxMach,
  burnoutTime_s: burnoutTime,
  flightTime_s: flightTime,
};

console.log("RocketLab smoke test");
console.log("====================");
console.log(`Rocket:      ${report.rocket}`);
console.log(`Motor:       ${report.motor}`);
console.log(`Length:      ${(report.totalLength_m * 100).toFixed(1)} cm`);
console.log(`Dry mass:    ${(report.dryMass_kg * 1000).toFixed(1)} g`);
console.log(`CG:          ${(report.cg_m * 100).toFixed(2)} cm from nose`);
console.log(`CP:          ${(report.cp_m * 100).toFixed(2)} cm from nose`);
console.log(`Stability:   ${report.calibers.toFixed(2)} cal`);
console.log(`Cd:          ${report.Cd.toFixed(3)}`);
console.log(`Apogee:      ${report.apogee_m.toFixed(1)} m  (t=${report.apogeeTime_s.toFixed(2)} s)`);
console.log(`Max vel:     ${report.maxV_ms.toFixed(1)} m/s`);
console.log(`Max Mach:    ${report.maxMach.toFixed(3)}`);
console.log(`Burnout:     ${report.burnoutTime_s.toFixed(2)} s`);
console.log(`Flight time: ${report.flightTime_s.toFixed(1)} s`);

// --- Sanity gate: every reported number must be finite. ---
const checked = {
  cg_m: cg,
  cp_m: cp,
  calibers,
  dryMass_kg: dryMass,
  Cd,
  area_m2: area,
  apogee_m: apogee,
  maxV_ms: maxV,
  maxMach,
  apogeeTime_s: apogeeTime,
  flightTime_s: flightTime,
  burnoutTime_s: burnoutTime,
};

const bad = Object.entries(checked).filter(([, v]) => !Number.isFinite(v));
if (bad.length > 0) {
  console.error("\nFAIL: non-finite values detected:");
  for (const [k, v] of bad) console.error(`  ${k} = ${v}`);
  process.exit(1);
}

console.log("\nPASS: all reported values are finite.");
process.exit(0);
