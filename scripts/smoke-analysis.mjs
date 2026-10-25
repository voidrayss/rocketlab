// ===========================================================================
// scripts/smoke-analysis.mjs: headless validation for the FEAT-002 depth
// metrics. It imports the new analysis engine plus the new aero/physics
// exports, runs them on the default rocket, and asserts:
//   - every metric value is finite (numbers) or a non-empty string
//   - every metric has a non-empty explanation and citation
//   - the per-part mass breakdown percentages sum to ~100%
//   - default C6 apogee is within ~10% of the FEAT-001 baseline (166.3 m)
//
// Run from the repo root:  node scripts/smoke-analysis.mjs
// ===========================================================================

import { defaultRocket, noseConeProfile, canonicalNoseShape } from "../js/rocket.js";
import { getMotor } from "../js/motors.js";
import { finenessRatio, wettedArea, skinFrictionDrag, finGeometry,
         flutterVelocity, SHEAR_MODULUS } from "../js/aero.js";
import { atmosphere, simulateFlight } from "../js/physics.js";
import { buildReport } from "../js/analysis.js";

const BASELINE_APOGEE = 166.3;
let failures = 0;
function fail(msg) { failures++; console.error("FAIL: " + msg); }

const rocket = defaultRocket();
const motor = getMotor(rocket.motorId);

console.log("RocketLab analysis smoke test");
console.log("=============================");

// --- New rocket.js profile ---
for (const shape of ["conical", "ogive", "vonKarman", "haack", "parabolic",
                     "elliptical", "cone", "blunt"]) {
  const prof = noseConeProfile({ length: 0.15, diameter: 0.05, shape }, 24);
  const allFinite = prof.every(p => Number.isFinite(p.x) && Number.isFinite(p.r));
  if (!allFinite) fail(`noseConeProfile(${shape}) produced non-finite points`);
  if (canonicalNoseShape(shape) === undefined) fail(`canonicalNoseShape(${shape}) undefined`);
}
console.log("Nose profiles:  OK (all families finite)");

// --- New aero exports ---
const fr = finenessRatio(rocket);
const Sw = wettedArea(rocket);
const sf = skinFrictionDrag(rocket, { velocity: 60, altitude: 0 });
const fg = finGeometry(rocket);
const fv = flutterVelocity(rocket, { altitude: 0 });
for (const [k, v] of Object.entries({
  finenessRatio: fr, wettedArea: Sw, Cf: sf.Cf, Re: sf.Re,
  cdFriction: sf.cdFriction, aspectRatio: fg.aspectRatio,
  taperRatio: fg.taperRatio, meanAeroChord: fg.meanAeroChord,
  flutterVelocity: fv.velocity,
})) {
  if (!Number.isFinite(v)) fail(`aero metric ${k} is not finite: ${v}`);
}
if (!(SHEAR_MODULUS.plywood > 0)) fail("SHEAR_MODULUS map missing plywood");
console.log(`Aero exports:   OK (fineness=${fr.toFixed(1)}, Sw=${(Sw*1e4).toFixed(0)} cm^2, flutter=${fv.velocity.toFixed(0)} m/s)`);

// --- Atmosphere ---
const atm0 = atmosphere(0);
if (Math.abs(atm0.density - 1.225) > 0.01) fail(`sea-level density off: ${atm0.density}`);
if (Math.abs(atm0.speedOfSound - 340.3) > 2) fail(`sea-level speed of sound off: ${atm0.speedOfSound}`);
console.log(`Atmosphere:     OK (rho0=${atm0.density.toFixed(3)}, a0=${atm0.speedOfSound.toFixed(1)})`);

// --- buildReport ---
const report = buildReport(rocket, motor);

if (!Array.isArray(report.metrics) || report.metrics.length === 0) {
  fail("report.metrics is empty");
}
for (const m of report.metrics) {
  const okValue = (typeof m.value === "number" && Number.isFinite(m.value)) ||
                  (typeof m.value === "string" && m.value.length > 0);
  if (!okValue) fail(`metric "${m.label}" has bad value: ${m.value}`);
  if (typeof m.unit !== "string") fail(`metric "${m.label}" missing unit`);
  if (!m.explanation || m.explanation.length === 0) fail(`metric "${m.label}" missing explanation`);
  if (!m.citation || m.citation.length === 0) fail(`metric "${m.label}" missing citation`);
  if (/\u2014/.test(m.explanation) || /\u2014/.test(m.citation)) fail(`metric "${m.label}" contains an em dash`);
}
console.log(`Report metrics: OK (${report.metrics.length} metrics, each with explanation + citation)`);

// --- Mass breakdown sums to ~100% ---
const pctSum = report.massBreakdown.reduce((a, p) => a + p.percent, 0);
if (Math.abs(pctSum - 100) > 0.5) fail(`mass breakdown percentages sum to ${pctSum.toFixed(2)}, expected ~100`);
console.log(`Mass breakdown: OK (sum=${pctSum.toFixed(2)}%, ${report.massBreakdown.length} parts)`);

// --- Flight stats additive keys present & finite ---
const s = report.stats;
for (const k of ["thrustToWeight", "railExitVelocity", "maxQ", "maxQTime",
                 "maxAcceleration", "descentRate", "apogee"]) {
  if (!Number.isFinite(s[k])) fail(`stats.${k} not finite: ${s[k]}`);
}
if (!Array.isArray(s.stabilityVsTime) || s.stabilityVsTime.length === 0) {
  fail("stats.stabilityVsTime missing or empty");
} else {
  for (const p of s.stabilityVsTime) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.calibers)) fail("stabilityVsTime has non-finite entry");
  }
}
console.log(`Flight stats:   OK (T/W=${s.thrustToWeight.toFixed(1)}, railExit=${s.railExitVelocity.toFixed(1)} m/s, maxQ=${s.maxQ.toFixed(0)} Pa, maxAcc=${s.maxAcceleration.toFixed(1)} g, descent=${s.descentRate.toFixed(1)} m/s)`);

// --- Apogee regression gate ---
const apogee = s.apogee;
const errPct = Math.abs(apogee - BASELINE_APOGEE) / BASELINE_APOGEE * 100;
if (errPct > 10) fail(`apogee ${apogee.toFixed(1)} m is more than 10% off baseline ${BASELINE_APOGEE} m`);
console.log(`Apogee:         OK (${apogee.toFixed(1)} m, ${errPct.toFixed(1)}% from baseline ${BASELINE_APOGEE} m)`);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nPASS: analysis depth metrics all valid.");
process.exit(0);
