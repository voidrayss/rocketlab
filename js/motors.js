// ===========================================================================
// motors.js — model rocket motor presets, the .eng catalog, and thrust model.
//
// Real hobby motors are classified by total impulse (A, B, C, D, ...). Each
// letter is roughly double the previous one's impulse. The "6" in "C6" is the
// average thrust in newtons.
//
// Two kinds of motor objects flow through this module and the simulator:
//
//   1. LEGACY BOXCAR PRESETS (the MOTORS table below): a constant average
//      thrust for the burn duration. No curve field. These are kept as a
//      simple, offline-friendly fallback.
//
//   2. CURVE-BASED MOTORS parsed from RASP .eng files (see js/eng.js). These
//      carry a `curve` array of {t, thrust} samples. thrustAt/motorMassAt
//      detect the curve and interpolate it; otherwise they fall back to the
//      boxcar model. Both kinds expose the same fields the simulator reads:
//      avgThrust, burnTime, totalMass, propellantMass.
//
// The large real catalog (Level-1 and Level-2 H/I/J/K motors) ships as .eng
// files under data/motors/ and is loaded at runtime via fetch() in the browser
// (there is no build step). See loadEngFiles() and ENG_FILES below.
//
// Data source: ThrustCurve.org open motor dataset + manufacturer public data,
// RASP .eng standard (https://www.thrustcurve.org/info/raspformat.html).
// ===========================================================================

import { parseEng, impulseClass, certLevel } from "./eng.js";

// mass values in kg, thrust in N, time in s.
export const MOTORS = {
  "A8": {
    name: "A8 (Estes)",
    avgThrust: 2.5, burnTime: 0.5, totalImpulse: 2.5,
    propellantMass: 0.0032, totalMass: 0.0162,
  },
  "B6": {
    name: "B6 (Estes)",
    avgThrust: 4.3, burnTime: 0.8, totalImpulse: 5.0,
    propellantMass: 0.0062, totalMass: 0.0197,
  },
  "C6": {
    name: "C6 (Estes)",
    avgThrust: 6.0, burnTime: 1.7, totalImpulse: 10.0,
    propellantMass: 0.0108, totalMass: 0.0258,
  },
  "D12": {
    name: "D12 (Estes)",
    avgThrust: 12.0, burnTime: 1.65, totalImpulse: 20.0,
    propellantMass: 0.0211, totalMass: 0.0432,
  },
  "E12": {
    name: "E12 (Estes)",
    avgThrust: 12.0, burnTime: 2.5, totalImpulse: 30.0,
    propellantMass: 0.0357, totalMass: 0.0640,
  },
  "F15": {
    name: "F15 (Estes)",
    avgThrust: 15.0, burnTime: 3.45, totalImpulse: 50.0,
    propellantMass: 0.0600, totalMass: 0.1010,
  },
  "G80": {
    name: "G80 (AeroTech)",
    avgThrust: 80.0, burnTime: 1.25, totalImpulse: 100.0,
    propellantMass: 0.0625, totalMass: 0.1240,
  },
};

// ---------------------------------------------------------------------------
// The merged catalog. Starts with the legacy presets; curve-based motors are
// added by loadEngFiles() once the .eng files have been fetched and parsed.
// Keyed by motor id (the motor code / designation). The default selected motor
// is "C6" (a legacy preset), which is always present.
// ---------------------------------------------------------------------------
export const MOTOR_CATALOG = { ...MOTORS };

// The .eng files that ship with RocketLab under data/motors/. Add new motors by
// dropping a .eng file into that folder and appending its filename here (the
// loader fetches each one relative to the page). See README.md.
export const ENG_FILES = [
  "AeroTech_H128W.eng",
  "AeroTech_H180W.eng",
  "CTI_H133.eng",
  "AeroTech_I200W.eng",
  "AeroTech_I280DM.eng",
  "CTI_I223.eng",
  "AeroTech_J350W.eng",
  "CTI_J145.eng",
  "CTI_J285.eng",
  "AeroTech_K550W.eng",
  "CTI_K530.eng",
  "Estes_F15.eng",
];

// Register one parsed .eng motor into the catalog under its code. If the code
// collides with an existing entry, we suffix the manufacturer to keep both.
export function registerMotor(motor) {
  let id = motor.code || motor.name;
  if (MOTOR_CATALOG[id] && MOTOR_CATALOG[id] !== motor) {
    id = `${id}-${(motor.manufacturer || "x").split(/\s+/)[0]}`;
  }
  motor.id = id;
  MOTOR_CATALOG[id] = motor;
  return id;
}

// ---------------------------------------------------------------------------
// Load + parse a list of .eng files and merge them into MOTOR_CATALOG.
//
// In the browser we fetch each file relative to the page under data/motors/.
// `baseDir` can be overridden (defaults to "data/motors/"). Returns the array
// of registered motor objects. Parse failures on individual files are logged
// and skipped so one bad file does not break the whole catalog.
//
// This is async because fetch() is async; callers should await it before
// rebuilding the motor dropdown. There is no build step, so this runs in the
// user's browser at page load.
// ---------------------------------------------------------------------------
export async function loadEngFiles(list = ENG_FILES, baseDir = "data/motors/") {
  const loaded = [];
  if (typeof fetch !== "function") return loaded; // non-browser: nothing to do
  await Promise.all(list.map(async (file) => {
    try {
      const res = await fetch(baseDir + file);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const motor = parseEng(text);
      registerMotor(motor);
      loaded.push(motor);
    } catch (err) {
      console.warn(`motors: failed to load ${file}:`, err && err.message);
    }
  }));
  return loaded;
}

// Resolve a motor by id from the merged catalog. Falls back to C6 so the app
// always has a valid motor (matches the previous getMotor behavior).
export function getMotor(id) {
  return MOTOR_CATALOG[id] ?? MOTOR_CATALOG["C6"] ?? MOTORS["C6"];
}

// ---------------------------------------------------------------------------
// Build the dropdown option list. Each entry is labeled by class and (for
// curve motors) manufacturer + certification level, and tagged with its class
// and cert so the UI can group them under <optgroup> headings.
//
//   legacy preset  -> { id, label: "C6 (Estes)",            class: "C", cert: "Model" }
//   curve motor     -> { id, label: "H128W (AeroTech) - L1", class: "H", cert: "L1" }
//
// Sorted by total impulse so the list runs small motors first.
// ---------------------------------------------------------------------------
export function motorOptions() {
  const entries = Object.entries(MOTOR_CATALOG).map(([id, m]) => {
    const letter = m.class ?? impulseClass(m.totalImpulse);
    const cert = m.certLevel ?? certLevel(letter);
    let label;
    if (m.curve) {
      // Curve motors come from the shipped .eng files, whose thrust curves are
      // transcribed / approximate (see README). Tag the label so a user who
      // never reads the README sees the caveat right in the dropdown.
      const mfg = m.manufacturer ? ` (${m.manufacturer})` : "";
      const certTag = cert === "Model" ? "" : ` - ${cert}`;
      label = `${m.name}${mfg}${certTag} - approx curve`;
    } else {
      label = m.name;
    }
    return { id, label, class: letter, cert, impulse: m.totalImpulse ?? 0 };
  });
  entries.sort((a, b) => a.impulse - b.impulse);
  return entries;
}

// ---------------------------------------------------------------------------
// Thrust model
// ---------------------------------------------------------------------------

// Instantaneous thrust (N) at time t into the burn.
//   - Curve motors: linear interpolation between adjacent {t, thrust} samples,
//     0 before t=0 and after burnTime.
//   - Legacy presets: constant average thrust until burnTime, then zero.
export function thrustAt(motor, t) {
  if (motor.curve && motor.curve.length > 0) {
    return interpolateCurve(motor.curve, t);
  }
  if (t < 0 || t > motor.burnTime) return 0;
  return motor.avgThrust;
}

// Linear interpolation of a {t, thrust} curve. Thrust is 0 before the first
// sample time (treating ignition at t=0 with 0 thrust) and after the last.
function interpolateCurve(curve, t) {
  const last = curve[curve.length - 1];
  if (t <= 0 || t > last.t) return 0;
  // Before the first data point, ramp from (0, 0) up to the first sample.
  const first = curve[0];
  if (t <= first.t) {
    if (first.t <= 0) return first.thrust;
    return (t / first.t) * first.thrust;
  }
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.thrust;
      const frac = (t - a.t) / span;
      return a.thrust + frac * (b.thrust - a.thrust);
    }
  }
  return 0;
}

// Delivered impulse (N.s) from ignition to time t, by trapezoidal integration
// of the interpolated curve. Used to burn propellant in proportion to the
// energy actually delivered. Only called for curve motors.
function deliveredImpulse(motor, t) {
  const curve = motor.curve;
  if (t <= 0) return 0;
  let impulse = 0;
  let prevT = 0;
  let prevF = 0; // ignition at (0, 0)
  if (curve[0].t === 0) { prevT = 0; prevF = curve[0].thrust; }
  for (const p of curve) {
    if (p.t === 0) continue;
    const segEnd = Math.min(p.t, t);
    const dt = segEnd - prevT;
    if (dt > 0) {
      const fAtEnd = segEnd === p.t ? p.thrust : interpolateCurve(curve, segEnd);
      impulse += 0.5 * (prevF + fAtEnd) * dt;
    }
    if (p.t >= t) break;
    prevT = p.t;
    prevF = p.thrust;
  }
  return impulse;
}

// Instantaneous motor mass (kg) at time t.
//   - Curve motors: propellant is consumed in proportion to delivered impulse
//     (fraction burned = integral(thrust, 0..t) / totalImpulse), which tracks
//     the real burn profile instead of a straight line.
//   - Legacy presets: propellant burns off linearly over the burn.
export function motorMassAt(motor, t) {
  if (t <= 0) return motor.totalMass;
  if (t >= motor.burnTime) return motor.totalMass - motor.propellantMass;

  if (motor.curve && motor.curve.length > 0 && motor.totalImpulse > 0) {
    const fracBurned = Math.min(1, deliveredImpulse(motor, t) / motor.totalImpulse);
    return motor.totalMass - motor.propellantMass * fracBurned;
  }

  const fracBurned = t / motor.burnTime;
  return motor.totalMass - motor.propellantMass * fracBurned;
}
