// ===========================================================================
// eng.js - RASP .eng thrust-curve parser + NAR impulse-class helpers.
//
// The .eng format is the de-facto open standard for sharing hobby rocket motor
// thrust curves. It is produced/consumed by RASP, OpenRocket, RockSim, and the
// ThrustCurve.org dataset (https://www.thrustcurve.org/info/raspformat.html).
//
// File layout:
//   ; any line starting with a semicolon is a comment (header block, credits).
//   <name> <diameter_mm> <length_mm> <delays> <propMass_kg> <totalMass_kg> <mfg>
//   <t0> <F0>
//   <t1> <F1>
//   ...
//   <tN> 0           <-- the curve ends when thrust returns to 0 (burnout)
//
// Notes on the header line (the first non-comment line):
//   - name            the motor designation, e.g. "H128" or "54-1706J"
//   - diameter        motor casing diameter in MILLIMETRES
//   - length          motor casing length in MILLIMETRES
//   - delays          available ejection delays, e.g. "6-10-14" or "P" (plugged)
//   - propellantMass  loaded propellant mass in KILOGRAMS
//   - totalMass       total loaded motor mass in KILOGRAMS
//   - manufacturer    short manufacturer token, e.g. "AeroTech", "Cesaroni"
//
// The data lines are "time thrust" pairs: time in SECONDS from ignition, thrust
// in NEWTONS. The very first data point is usually (t>0, F>0); thrust at t=0 is
// implicitly 0. We integrate the curve with the trapezoidal rule to recover
// total impulse (N.s), and from that derive average thrust and the NAR class.
// ===========================================================================

// ---------------------------------------------------------------------------
// NAR / TRA total-impulse classification.
//
// Each letter class spans a factor-of-two band of total impulse (N.s):
//   A: 1.26 - 2.50   B: 2.51 - 5.00   C: 5.01 - 10.0   D: 10.1 - 20.0
//   E: 20.1 - 40.0   F: 40.1 - 80.0   G: 80.1 - 160    H: 161 - 320
//   I: 321 - 640     J: 641 - 1280    K: 1281 - 2560   L: 2561 - 5120
//   M: 5121 - 10240  N: 10241 - 20480 O: 20481 - 40960
// We key off the UPPER bound of each band. Reference:
// https://www.nar.org/standards-and-testing-committee/standard-motor-codes/
// ---------------------------------------------------------------------------
const CLASS_UPPER = [
  ["A", 2.5], ["B", 5], ["C", 10], ["D", 20], ["E", 40], ["F", 80],
  ["G", 160], ["H", 320], ["I", 640], ["J", 1280], ["K", 2560],
  ["L", 5120], ["M", 10240], ["N", 20480], ["O", 40960],
];

// Return the NAR letter class for a given total impulse in N.s.
export function impulseClass(totalImpulse) {
  const I = Number(totalImpulse) || 0;
  for (const [letter, upper] of CLASS_UPPER) {
    if (I <= upper) return letter;
  }
  return "O+"; // anything beyond O is out of hobby range
}

// Return a High-Power certification level hint for a letter class.
//   "Model" : A-G (no HPR certification required)
//   "L1"    : H-I (NAR/TRA Level 1)
//   "L2"    : J-L (Level 2)
//   "L3"    : M and up (Level 3)
export function certLevel(letter) {
  if (letter === "H" || letter === "I") return "L1";
  if (letter === "J" || letter === "K" || letter === "L") return "L2";
  if (["M", "N", "O", "O+"].includes(letter)) return "L3";
  return "Model";
}

// Convenience: class + cert level directly from an impulse value.
export function classifyImpulse(totalImpulse) {
  const letter = impulseClass(totalImpulse);
  return { letter, cert: certLevel(letter) };
}

// ---------------------------------------------------------------------------
// Trapezoidal integral of a {t, thrust} curve, from t=0 (implicit 0 thrust) to
// the last point. Returns total impulse in N.s.
// ---------------------------------------------------------------------------
export function integrateCurve(curve) {
  if (!Array.isArray(curve) || curve.length === 0) return 0;
  let impulse = 0;
  // Treat ignition as (t=0, F=0) unless the first sample is already at t=0.
  let prevT = 0;
  let prevF = 0;
  if (curve[0].t === 0) {
    prevT = curve[0].t;
    prevF = curve[0].thrust;
  }
  for (const point of curve) {
    if (point.t === 0) continue; // already seeded as the previous point
    const dt = point.t - prevT;
    if (dt > 0) impulse += 0.5 * (prevF + point.thrust) * dt;
    prevT = point.t;
    prevF = point.thrust;
  }
  return impulse;
}

// ---------------------------------------------------------------------------
// Parse a RASP .eng file into a normalized motor object compatible with the
// rest of motors.js (thrustAt / motorMassAt / simulateFlight).
//
// Returns:
//   {
//     code, name, manufacturer,
//     diameterMm, lengthMm, delays,
//     propellantMass, totalMass,     // kg
//     curve: [{ t, thrust }],        // seconds, newtons (monotonic in t)
//     burnTime,                      // s (last curve time)
//     totalImpulse,                  // N.s (trapezoidal integral)
//     avgThrust,                     // N (totalImpulse / burnTime)
//     peakThrust,                    // N
//     class, certLevel,              // "H", "L1", ...
//   }
// ---------------------------------------------------------------------------
export function parseEng(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("parseEng: empty or non-string input");
  }

  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;       // skip blank lines
    if (trimmed.startsWith(";")) continue;    // skip comment lines
    lines.push(trimmed);
  }
  if (lines.length < 2) {
    throw new Error("parseEng: file has no header + data lines");
  }

  // --- Header line ---
  const header = lines[0].split(/\s+/);
  if (header.length < 7) {
    throw new Error("parseEng: header needs 7 fields, got " + header.length +
                    " (" + lines[0] + ")");
  }
  const name = header[0];
  const diameterMm = parseFloat(header[1]);
  const lengthMm = parseFloat(header[2]);
  const delays = header[3];
  const propellantMass = parseFloat(header[4]);
  const totalMass = parseFloat(header[5]);
  // Manufacturer may contain spaces; join any trailing tokens.
  const manufacturer = header.slice(6).join(" ");

  if (!Number.isFinite(diameterMm) || !Number.isFinite(lengthMm) ||
      !Number.isFinite(propellantMass) || !Number.isFinite(totalMass)) {
    throw new Error("parseEng: non-numeric header field in '" + lines[0] + "'");
  }

  // --- Data lines (time thrust pairs) ---
  const curve = [];
  let prevT = -Infinity;
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(/\s+/);
    if (parts.length < 2) continue;
    const t = parseFloat(parts[0]);
    const thrust = parseFloat(parts[1]);
    if (!Number.isFinite(t) || !Number.isFinite(thrust)) continue;
    if (t < prevT) {
      throw new Error("parseEng: curve time not monotonic at '" + lines[i] + "'");
    }
    curve.push({ t, thrust });
    prevT = t;
  }

  if (curve.length < 2) {
    throw new Error("parseEng: fewer than 2 thrust points for " + name);
  }

  const burnTime = curve[curve.length - 1].t;
  const totalImpulse = integrateCurve(curve);
  const avgThrust = burnTime > 0 ? totalImpulse / burnTime : 0;
  const peakThrust = curve.reduce((m, p) => Math.max(m, p.thrust), 0);
  const letter = impulseClass(totalImpulse);

  return {
    code: name,
    name,
    manufacturer,
    diameterMm,
    lengthMm,
    delays,
    propellantMass,
    totalMass,
    curve,
    burnTime,
    totalImpulse,
    avgThrust,
    peakThrust,
    class: letter,
    certLevel: certLevel(letter),
  };
}
