import { ringProperties } from "./rings.js";
import { finCanProperties } from "./fincan.js";
// ===========================================================================
// analysis.js: the educational analysis engine (DOM-free, pure logic).
//
// Assembles a single rich report from a rocket + motor by calling the aero and
// physics helpers. Every metric is paired with a short plain-language
// explanation ("what this means / why it matters") and a citation, so the UI
// can teach the user as it reports numbers. No DOM, no browser APIs, so this
// imports cleanly in Node for the smoke tests.
// ===========================================================================

import { COMPONENT_TYPES, MATERIALS, layoutPositions, totalLength,
         maxBodyDiameter, canonicalNoseShape } from "./rocket.js";
import { massProperties, centerOfPressure, stabilityMargin, dragCoefficient,
         referenceArea, finenessRatio, wettedArea, skinFrictionDrag,
         finGeometry, flutterVelocity } from "./aero.js";
import { simulateFlight, atmosphere } from "./physics.js";

const PI = Math.PI;

// Human-friendly label + drag character for each nose shape family.
const NOSE_SHAPE_INFO = {
  conical:   { label: "Conical", drag: "moderate drag; simplest to build" },
  ogive:     { label: "Tangent ogive", drag: "low drag; the classic hobby profile" },
  vonKarman: { label: "Von Karman (LD-Haack)", drag: "minimum drag for a given length and diameter" },
  haack:     { label: "LV-Haack", drag: "very low drag; slightly blunter tip than Von Karman" },
  parabolic: { label: "Parabolic", drag: "low-to-moderate drag; rounded profile" },
  elliptical:{ label: "Elliptical", drag: "higher drag; good for low-speed flights" },
};

// Per-part mass of a single component (kg). Mirrors massProperties() exactly so
// the breakdown sums to the structural mass.
function componentMass(c) {
  switch (c.type) {
    case COMPONENT_TYPES.NOSE: {
      // Intentional simplification: mass every nose as a hollow cone shell
      // regardless of shape family. This mirrors aero.js massProperties()
      // exactly so the per-part breakdown sums to 100%. wettedArea() is
      // shape-aware, but mass deliberately is not. Keep this in lockstep with
      // the aero.js nose case if you ever change it.
      const r = c.diameter / 2;
      const slant = Math.sqrt(r * r + c.length * c.length);
      const surfaceArea = PI * r * slant;
      return surfaceArea * c.wallThickness * MATERIALS[c.material];
    }
    case COMPONENT_TYPES.BODY: {
      const r = c.diameter / 2;
      return 2 * PI * r * c.wallThickness * c.length * MATERIALS[c.material];
    }
    case COMPONENT_TYPES.TRANSITION: {
      const rAvg = (c.frontDiameter + c.rearDiameter) / 4;
      return 2 * PI * rAvg * c.wallThickness * c.length * MATERIALS[c.material];
    }
    case "ring": return ringProperties(c).volume * MATERIALS[c.material];
    case "imported": return c.cad.properties.volumeMm3 * 1e-9 * c.density;
    case COMPONENT_TYPES.FINCAN: return finCanProperties(c).volume * MATERIALS[c.material];
    case COMPONENT_TYPES.FINS: {
      const area = 0.5 * (c.rootChord + c.tipChord) * c.span;
      return area * c.thickness * c.count * MATERIALS[c.material];
    }
    default:
      return 0;
  }
}

const PART_NAMES = {
  imported: "Imported CAD",
  ring: "Centering ring",
  [COMPONENT_TYPES.NOSE]: "Nose cone",
  [COMPONENT_TYPES.BODY]: "Body tube",
  [COMPONENT_TYPES.TRANSITION]: "Transition",
  [COMPONENT_TYPES.FINS]: "Fins",
  [COMPONENT_TYPES.FINCAN]: "Integrated fin can",
};

// Per-part mass breakdown: array of { name, grams, percent }.
export function massBreakdown(rocket) {
  const parts = rocket.components.map(c => ({
    name: PART_NAMES[c.type] ?? c.type,
    kg: componentMass(c),
  }));
  const total = parts.reduce((a, p) => a + p.kg, 0) || 1;
  return parts.map(p => ({
    name: p.name,
    grams: p.kg * 1000,
    percent: (p.kg / total) * 100,
  }));
}

// A small helper so every metric has the same shape.
function metric(label, value, unit, explanation, citation) {
  return { label, value, unit, explanation, citation };
}

// ---------------------------------------------------------------------------
// buildReport(rocket, motor) -> structured report.
//   {
//     metrics: [ { label, value, unit, explanation, citation }, ... ],
//     massBreakdown: [ { name, grams, percent }, ... ],
//     warnings: [ string, ... ],
//   }
// ---------------------------------------------------------------------------
export function buildReport(rocket, motor) {
  const L = totalLength(rocket) || 0.5;
  const motorX = L - 0.05; // motor sits ~5 cm ahead of the tail

  // --- Geometry / mass ---
  const { mass: structureMass } = massProperties(rocket, 0);
  const { cg } = massProperties(rocket, motor.totalMass, motorX);
  const { cp } = centerOfPressure(rocket);
  const { calibers, dRef } = stabilityMargin(rocket, motor.totalMass, motorX);
  const liftoffMass = structureMass + motor.totalMass;

  // --- Aero ---
  const Cd = dragCoefficient(rocket);
  const fr = finenessRatio(rocket);
  const Sw = wettedArea(rocket);
  const fins = finGeometry(rocket);
  const flutter = flutterVelocity(rocket, { altitude: 0 });
  const nose = rocket.components.find(c => c.type === COMPONENT_TYPES.NOSE);
  const noseShape = nose ? canonicalNoseShape(nose.shape) : "ogive";
  const noseInfo = NOSE_SHAPE_INFO[noseShape] ?? NOSE_SHAPE_INFO.ogive;

  // --- Flight (dry mass = structure only; simulator adds the entire motor, matches main.js) ---
  const dryMass = structureMass; // Entire motor mass is added by the simulator.
  const area = referenceArea(rocket);
  const result = simulateFlight({
    motor, dryMass, Cd, area,
    useParachute: true,
    parachuteArea: Math.max(0.1, area * 40),
    railLength: 1.0,
    rocket, motorX,
  });
  const s = result.stats;

  // --- Stability interpretation ---
  let stabWord;
  if (calibers < 0) stabWord = "UNSTABLE: the rocket will tumble. Move mass forward or enlarge the fins.";
  else if (calibers < 1) stabWord = "MARGINAL: less than one caliber. Add nose weight or bigger fins for a safer margin.";
  else if (calibers <= 2.5) stabWord = "STABLE: one to two-and-a-half calibers is the recommended range.";
  else stabWord = "OVER-STABLE: it will weathercock strongly into the wind. Trim fin size or move mass rearward.";

  const warnings = [];
  if (rocket.components.some(c => c.type === "imported")) warnings.push("Imported CAD mass uses saved kernel volume and selected density. Internal parts add mass only; external parts use a user-specified cylindrical aerodynamic proxy with no fin or nose CP. Confirm fit, placement, and aerodynamic assumptions. Project reload does not rerun the CAD kernel.");
  if (!s.launched) warnings.push("The rocket never lifted off the launch pad.");
  else if (!s.railCleared) warnings.push("The rocket did not clear the launch rail.");
  if (s.termination === "time-limit") warnings.push("Simulation time limit reached before landing.");
  if (rocket.components.some(c => c.type === "finCan")) warnings.push("Fin cans are inline sleeve sections. Do not add another tube or fin set for the same physical part. Sleeve-step drag and structural strength are not validated; flutter uses the first fin set.");
  if (calibers < 1) warnings.push("Stability margin is below 1 caliber.");

  // Honesty note: curve motors come from the shipped .eng files, whose thrust
  // curves are transcribed / approximate (the app was built offline). Surface
  // that in the panel so numbers off a curve motor are not mistaken for
  // certified source data. See README "the shipped curves are approximate".
  const approximate = Boolean(motor.curve);
  const motorNote = approximate
    ? "This motor uses an approximate thrust curve transcribed from published data, not an official ThrustCurve.org file. Apogee, max-Q, and flutter numbers are indicative, not competition-grade. Drop in the official .eng file for exact results."
    : null;

  // Flutter warning if the max flight speed gets within 1.5x of the boundary.
  const flutterV = flutter.velocity;
  let flutterExplain = "Fins can oscillate and tear off above this airspeed. Keep the max flight speed well below it. Thicker fins, stiffer material, and lower aspect ratio raise the limit.";
  if (Number.isFinite(flutterV) && s.maxV > flutterV * 0.66) {
    warnings.push("Max flight speed is approaching the fin flutter velocity.");
    flutterExplain += " WARNING: your predicted top speed is close to this limit.";
  }

  const metrics = [
    metric("Liftoff mass", liftoffMass * 1000, "g",
      "Total mass at launch including the loaded motor. Heavier rockets accelerate slower and reach a lower apogee for the same motor.",
      "Sum of component masses plus motor total mass."),
    metric("Structure mass", structureMass * 1000, "g",
      "Mass of the airframe alone (no motor). This is what you are really building; lighter structure means higher flights.",
      "Thin-shell mass model (aero.js massProperties)."),
    metric("Center of gravity (CG)", cg * 100, "cm from nose",
      "The balance point with the motor loaded. For a stable rocket the CG must sit ahead of the center of pressure.",
      "Mass-weighted centroid (aero.js massProperties)."),
    metric("Center of pressure (CP)", cp * 100, "cm from nose",
      "Where the aerodynamic lift effectively acts. It must sit behind the CG so the rocket self-corrects when it points off course.",
      "Barrowman equations (Barrowman 1966)."),
    metric("Stability margin", calibers, "cal",
      "Distance from CG to CP measured in body diameters. " + stabWord,
      "Stability = (CP - CG) / reference diameter; 1-2 cal rule of thumb."),
    metric("Reference diameter", dRef * 100, "cm",
      "The largest body diameter, used as the unit (one caliber) for the stability margin.",
      "Max body diameter (rocket.js)."),
    metric("Fineness ratio", fr, "L/D",
      "Length divided by diameter. Slender airframes have lower drag; most hobby rockets land around 10-20, which is slender enough to fly cleanly without becoming floppy or unstable. Only very stubby rockets (below about 4) pay a real drag penalty.",
      "Fineness ratio = length / max diameter."),
    metric("Nose shape", noseInfo.label, "",
      "Nose profile family. This one has " + noseInfo.drag + ". The nose sets how cleanly air is parted at speed.",
      "Nose-cone geometry (Crowell 1996)."),
    metric("Drag coefficient (Cd)", Cd, "",
      "A dimensionless measure of how much the shape resists the air. Lower is faster and higher-flying. It blends nose shape, fineness, and fin count.",
      "Shape- and fineness-based estimate (aero.js dragCoefficient)."),
    metric("Wetted area", Sw * 1e4, "cm^2",
      "Total exterior surface the air rubs against. More surface means more skin-friction drag.",
      "Surface-of-revolution + tube/frustum lateral areas."),
    metric("Fin aspect ratio", fins.aspectRatio, "",
      "Slenderness of the fins (span vs chord). Higher aspect ratio fins are more effective but flutter more easily.",
      "AR = (2*span)^2 / (2*finArea)."),
    metric("Fin taper ratio", fins.taperRatio, "tip/root",
      "Tip chord divided by root chord. Tapered fins (ratio below 1) cut drag and tip mass while staying effective.",
      "Taper ratio = tip chord / root chord."),
    metric("Fin flutter velocity", flutterV, "m/s",
      flutterExplain,
      "Fin-flutter boundary (NACA TN 4197 / standard hobby derivation)."),
    metric("Thrust-to-weight ratio", s.thrustToWeight, "",
      "Average thrust divided by launch weight. A safe launch needs at least about 5; below that the rocket leaves the rail too slowly to be stable. Note that peak thrust is usually higher, so the instant off the pad can exceed this ratio.",
      "Average thrust / (liftoff mass * g)."),
    metric("Rail-exit velocity", s.railExitVelocity ?? "Not cleared", "m/s",
      "Speed as the rocket clears a 1 m launch rail. Fins only stabilize once there is enough airflow; aim for roughly 15 m/s or more.",
      "Velocity at " + s.railLength + " m (ISA atmosphere, RK4 sim)."),
    metric("Max dynamic pressure (max-Q)", s.maxQ, "Pa",
      "The highest aerodynamic loading during flight (0.5*rho*v^2) and the moment the airframe is stressed most.",
      "Peak of 0.5 * density * velocity^2 over the trajectory."),
    metric("Max acceleration", s.maxAcceleration, "g",
      "Peak acceleration in g's during the burn. High-g launches stress glued joints and electronics.",
      "Peak |acceleration| / g during ascent."),
    metric("Apogee", s.apogee, "m",
      "The highest altitude reached. This is the headline number most builders optimize.",
      "RK4 flight integration with ISA atmosphere (physics.js)."),
    metric("Max velocity", s.maxV, "m/s",
      "Top speed, reached near motor burnout. Compare this to the flutter velocity for fin safety.",
      "Peak speed from the flight simulation."),
    metric("Max Mach", s.maxMach, "",
      "Top speed as a fraction of the speed of sound. Above ~0.8 transonic drag rises sharply.",
      "Max velocity / local speed of sound (ISA)."),
    metric("Descent rate", s.descentRate, "m/s",
      "Steady speed coming down under the parachute. Aim for roughly 3-6 m/s for a soft, safe landing.",
      "Terminal descent under parachute (physics.js)."),
  ];

  return { metrics, massBreakdown: massBreakdown(rocket), warnings,
           approximate, motorNote, stats: s };
}
