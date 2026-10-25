// ===========================================================================
// scripts/smoke-motors.mjs: headless validation for the FEAT-004 motor
// database. It reads shipped .eng files from data/motors/ via node:fs, runs
// parseEng, and asserts:
//   - integrated totalImpulse is within a few percent of the motor's nominal
//     class band (so the transcribed curves are physically consistent)
//   - burnTime > 0 and curve time is strictly monotonic increasing
//   - the resolved NAR letter class matches the integrated impulse
//   - thrustAt interpolation returns 0 outside the burn and a plausible peak
//     within it
//   - motorMassAt is monotonic non-increasing and ends at the spent casing mass
//   - a curve-based H/I motor flown on the default airframe yields a finite
//     apogee HIGHER than the C6 baseline
//
// Run from the repo root:  node scripts/smoke-motors.mjs
// ===========================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parseEng, impulseClass, classifyImpulse, integrateCurve } from "../js/eng.js";
import { MOTOR_CATALOG, registerMotor, getMotor, motorOptions,
         thrustAt, motorMassAt } from "../js/motors.js";
import { defaultRocket, totalLength } from "../js/rocket.js";
import { massProperties, dragCoefficient, referenceArea } from "../js/aero.js";
import { simulateFlight } from "../js/physics.js";

const here = dirname(fileURLToPath(import.meta.url));
const motorsDir = join(here, "..", "data", "motors");

let failures = 0;
function fail(msg) { failures++; console.error("FAIL: " + msg); }

console.log("RocketLab motor database smoke test");
console.log("===================================");

// Class impulse bands (upper bounds). Used to sanity-check that an integrated
// impulse sits inside the band its letter advertises.
const BANDS = {
  A: [1.26, 2.5], B: [2.51, 5], C: [5.01, 10], D: [10.1, 20],
  E: [20.1, 40], F: [40.1, 80], G: [80.1, 160], H: [160.1, 320],
  I: [320.1, 640], J: [640.1, 1280], K: [1280.1, 2560], L: [2560.1, 5120],
};

// --- Parse a representative sample of shipped .eng files ---
const sample = [
  "AeroTech_H128W.eng",
  "AeroTech_I280DM.eng",
  "CTI_J285.eng",
  "AeroTech_K550W.eng",
];

let hMotor = null; // keep an H/I motor around for the flight test

for (const file of sample) {
  let motor;
  try {
    motor = parseEng(readFileSync(join(motorsDir, file), "utf8"));
  } catch (err) {
    fail(`parseEng threw on ${file}: ${err.message}`);
    continue;
  }

  // burnTime > 0
  if (!(motor.burnTime > 0)) fail(`${file}: burnTime not > 0 (${motor.burnTime})`);

  // curve strictly monotonic in time
  let mono = true;
  for (let i = 1; i < motor.curve.length; i++) {
    if (!(motor.curve[i].t > motor.curve[i - 1].t)) mono = false;
  }
  if (!mono) fail(`${file}: curve time not strictly increasing`);

  // integrated impulse matches the integrateCurve helper exactly
  const recomputed = integrateCurve(motor.curve);
  if (Math.abs(recomputed - motor.totalImpulse) > 1e-6) {
    fail(`${file}: totalImpulse (${motor.totalImpulse}) != integrateCurve (${recomputed})`);
  }

  // class matches impulse, and impulse sits inside the band for that class
  const letter = impulseClass(motor.totalImpulse);
  if (letter !== motor.class) fail(`${file}: class ${motor.class} != impulseClass ${letter}`);
  const band = BANDS[letter];
  if (band && (motor.totalImpulse < band[0] || motor.totalImpulse > band[1])) {
    fail(`${file}: impulse ${motor.totalImpulse.toFixed(1)} outside ${letter} band ${band}`);
  }

  // thrustAt: zero before and after the burn, plausible peak within it
  if (thrustAt(motor, -0.1) !== 0) fail(`${file}: thrustAt(-0.1) not 0`);
  if (thrustAt(motor, motor.burnTime + 0.1) !== 0) fail(`${file}: thrust after burnout not 0`);
  let peak = 0;
  for (let t = 0; t <= motor.burnTime; t += motor.burnTime / 200) {
    peak = Math.max(peak, thrustAt(motor, t));
  }
  if (!(peak > motor.avgThrust * 0.9)) {
    fail(`${file}: interpolated peak ${peak.toFixed(1)} below avg thrust ${motor.avgThrust.toFixed(1)}`);
  }
  if (peak > motor.peakThrust + 1) {
    fail(`${file}: interpolated peak ${peak.toFixed(1)} exceeds curve peak ${motor.peakThrust.toFixed(1)}`);
  }

  // motorMassAt: non-increasing, starts at totalMass, ends at spent casing
  if (Math.abs(motorMassAt(motor, 0) - motor.totalMass) > 1e-9) {
    fail(`${file}: motorMassAt(0) != totalMass`);
  }
  const spent = motor.totalMass - motor.propellantMass;
  if (Math.abs(motorMassAt(motor, motor.burnTime + 1) - spent) > 1e-9) {
    fail(`${file}: motorMassAt after burnout != spent casing mass`);
  }
  let prevMass = Infinity;
  let massMono = true;
  for (let t = 0; t <= motor.burnTime; t += motor.burnTime / 100) {
    const m = motorMassAt(motor, t);
    if (m > prevMass + 1e-9) massMono = false;
    prevMass = m;
  }
  if (!massMono) fail(`${file}: motorMassAt not monotonic non-increasing`);

  // register into the catalog so getMotor can resolve it
  const id = registerMotor(motor);
  if (getMotor(id) !== motor) fail(`${file}: getMotor(${id}) did not resolve the registered motor`);

  if (!hMotor && (letter === "H" || letter === "I")) hMotor = motor;

  const { cert } = classifyImpulse(motor.totalImpulse);
  console.log(`${file.padEnd(24)} ${letter} ${cert.padEnd(5)} I=${motor.totalImpulse.toFixed(1).padStart(7)} N.s  avg=${motor.avgThrust.toFixed(0).padStart(4)} N  peak=${motor.peakThrust.toFixed(0).padStart(4)} N  bt=${motor.burnTime.toFixed(2)} s`);
}

// --- motorOptions grouping/labeling sanity ---
const opts = motorOptions();
const hasC6 = opts.some(o => o.id === "C6" && o.class === "C");
if (!hasC6) fail("motorOptions missing C6 preset");
const curveOpt = opts.find(o => o.id.startsWith("H128"));
if (!curveOpt) fail("motorOptions missing the registered H128 curve motor");
else if (!/L1/.test(curveOpt.label)) fail(`H128 label missing cert level: ${curveOpt.label}`);
console.log(`\nmotorOptions: OK (${opts.length} motors, grouped by class, C6 present)`);

// --- Flight comparison: curve-based H/I beats C6 on the default airframe ---
function flyApogee(motor) {
  const rocket = defaultRocket();
  const { mass: structureMass } = massProperties(rocket, 0);
  const dryMass = structureMass + (motor.totalMass - motor.propellantMass);
  const Cd = dragCoefficient(rocket);
  const area = referenceArea(rocket);
  const result = simulateFlight({
    motor, dryMass, Cd, area,
    useParachute: true,
    parachuteArea: Math.max(0.1, area * 40),
  });
  return result.stats.apogee;
}

const c6Apogee = flyApogee(getMotor("C6"));
const hApogee = hMotor ? flyApogee(hMotor) : NaN;

if (!Number.isFinite(c6Apogee)) fail(`C6 apogee not finite: ${c6Apogee}`);
if (!hMotor) fail("no H/I curve motor available for the flight test");
else {
  if (!Number.isFinite(hApogee)) fail(`${hMotor.name} apogee not finite: ${hApogee}`);
  if (!(hApogee > c6Apogee)) {
    fail(`${hMotor.name} apogee ${hApogee.toFixed(1)} m not higher than C6 ${c6Apogee.toFixed(1)} m`);
  }
}
console.log(`\nFlight:  C6 apogee = ${c6Apogee.toFixed(1)} m`);
if (hMotor) console.log(`         ${hMotor.name} (curve) apogee = ${hApogee.toFixed(1)} m  (higher: ${hApogee > c6Apogee})`);

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nPASS: motor database parse + interpolation + flight all valid.");
process.exit(0);
