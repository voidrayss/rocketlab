import { resolveAssembly, defaultAttachment } from "./assembly.js";
import { ringProperties } from "./rings.js";
import { validateImported } from "./imported.js";
import { validateFinCan } from "./fincan.js";
// ===========================================================================
// rocket.js — the rocket component model (the "CAD" data model).
//
// A rocket is a stack of axisymmetric components along a centerline, nose at
// the top (x = 0) growing downward. Each component knows its own geometry,
// mass, and center of mass. This is the single source of truth that both the
// builder (drawing) and the aero module (physics) read from.
// ===========================================================================

// Material densities (kg/m^3). Rough but reasonable for hobby rockets.
export const MATERIALS = {
  cardboard:   680,
  plywood:     600,
  balsa:       160,
  fiberglass: 1850,
  plastic:    1200,
  aluminum:   2700,
};

// Component type identifiers.
export const COMPONENT_TYPES = {
  NOSE: "nose",
  BODY: "body",
  TRANSITION: "transition",
  FINS: "fins",
  FINCAN: "finCan",
};

let nextId = 1;
function makeId() { return nextId++; }
export function newUID() { return crypto.randomUUID(); }

// ---------------------------------------------------------------------------
// Nose cone shape families.
//
// We support the common model-rocket nose profiles. The legacy editor only
// knew 'ogive' | 'cone' | 'blunt'; those are kept working. 'cone' is treated
// as an alias for 'conical' and 'blunt' is treated as an elliptical-ish blunt
// profile for drawing/analysis. The canonical family names are:
//   conical, ogive (tangent ogive), vonKarman (LD-Haack), haack (LV-Haack),
//   parabolic, elliptical.
// ---------------------------------------------------------------------------
export const NOSE_SHAPES = [
  "conical", "ogive", "vonKarman", "haack", "parabolic", "elliptical",
];

// Map legacy / alias shape values onto a canonical family name.
export function canonicalNoseShape(shape) {
  if (shape === "cone") return "conical";   // legacy alias
  if (shape === "blunt") return "elliptical"; // blunt approximated as elliptical
  if (NOSE_SHAPES.includes(shape)) return shape;
  return "ogive"; // safe default
}

// --- Factory helpers: each returns a plain object with sensible defaults. ---

export function createNose({ length = 0.15, diameter = 0.05, shape = "ogive",
                             material = "plastic", wallThickness = 0.002 } = {}) {
  return { id: makeId(), uid: newUID(), type: COMPONENT_TYPES.NOSE, name:"Nose cone",
           length, diameter, shape, material, wallThickness };
}

export function createBody({ length = 0.30, diameter = 0.05,
                             material = "cardboard", wallThickness = 0.001 } = {}) {
  return { id: makeId(), uid: newUID(), type: COMPONENT_TYPES.BODY, name:"Body tube",
           length, diameter, material, wallThickness };
}

export function createTransition({ length = 0.05, frontDiameter = 0.05,
                                   rearDiameter = 0.08, material = "plastic",
                                   wallThickness = 0.002 } = {}) {
  return { id: makeId(), uid: newUID(), type: COMPONENT_TYPES.TRANSITION, name:"Transition",
           length, frontDiameter, rearDiameter, material, wallThickness };
}

export function createFins({ count = 3, rootChord = 0.08, tipChord = 0.04,
                             span = 0.05, sweep = 0.04, thickness = 0.003,
                             material = "plywood" } = {}) {
  return { id: makeId(), uid: newUID(), type: COMPONENT_TYPES.FINS, name:"Fin set",
           count, rootChord, tipChord, span, sweep, thickness, material };
}

export function createFinCan({ length = 0.12, diameter = 0.05, innerDiameter = 0.046,
  count = 3, rootChord = 0.08, tipChord = 0.04, span = 0.05, sweep = 0.04,
  thickness = 0.003, material = "plastic" } = {}) {
  const c = { id: makeId(), uid: newUID(), type: "finCan", name:"Fin can", length, diameter, innerDiameter,
    count, rootChord, tipChord, span, sweep, thickness, material };
  validateFinCan(c);
  return c;
}

export function createImported(options) {
  const c = {name:"Imported CAD",material:"plastic",density:MATERIALS.plastic,
    aeroRole:"internal",length:.1,diameter:.05,axialOffset:0,radialX:0,radialY:0,
    rotationX:0,rotationY:0,rotationZ:0,...options,type:"imported",id:makeId(),uid:newUID()};
  validateImported(c);
  return c;
}

export function createRing({length=.005,diameter=.048,innerDiameter=.029,axialOffset=.4,material="plywood"}={}) {
  const c={id:makeId(),uid:newUID(),type:"ring",name:"Centering ring",length,diameter,innerDiameter,axialOffset,material};
  ringProperties(c); return c;
}

export function isInternal(c) { return c.type === "ring" || (c.type === "imported" && c.aeroRole === "internal"); }

// A default starter rocket so the app opens with something flyable.
export function defaultRocket() {
  const nose=createNose({length:.15,diameter:.05,shape:"ogive"});
  const body=createBody({length:.35,diameter:.05});
  nose.attachment=defaultAttachment(body.id,"nose");
  return {name:"My First Rocket",components:[nose,body,createFins()],motorId:"C6"};
}

// ---------------------------------------------------------------------------
// Nose cone profile generator.
//
// Returns an array of {x, r} points sampled from tip (x = 0) to base (x = L),
// where r is the local radius. Used for drawing and for wetted-area /
// surface-of-revolution calculations in aero.js. All equations are the
// standard nose-cone profiles (see e.g. Gary Crowell, "The Descriptive
// Geometry of Nose Cones", 1996).
//
// Arguments:
//   c       a nose component { length, diameter, shape }
//   nPoints how many sample points to generate (>= 2)
// ---------------------------------------------------------------------------
export function noseConeProfile(c, nPoints = 24) {
  const L = c.length;
  const R = c.diameter / 2;
  const n = Math.max(2, Math.floor(nPoints));
  const shape = canonicalNoseShape(c.shape);
  const pts = [];

  // Tangent ogive radius: rho = (R^2 + L^2) / (2R).
  const rho = (R * R + L * L) / (2 * R);

  for (let i = 0; i < n; i++) {
    const x = (L * i) / (n - 1);
    const f = x / L; // normalized position 0..1 from tip
    let r;

    switch (shape) {
      case "conical":
        // Cone: r = R * x / L.
        r = R * f;
        break;

      case "ogive": {
        // Tangent ogive: r = sqrt(rho^2 - (L - x)^2) + R - rho.
        const inner = rho * rho - (L - x) * (L - x);
        r = Math.sqrt(Math.max(0, inner)) + R - rho;
        break;
      }

      case "parabolic": {
        // Parabolic series with K = 1 (full parabola):
        // r = R * (2*(x/L) - K*(x/L)^2).
        const K = 1;
        r = R * (2 * f - K * f * f);
        break;
      }

      case "elliptical":
        // Elliptical (half ellipse): r = R * sqrt(1 - (1 - x/L)^2).
        r = R * Math.sqrt(Math.max(0, 1 - (1 - f) * (1 - f)));
        break;

      case "vonKarman":
      case "haack": {
        // Haack series. theta = acos(1 - 2x/L);
        // r = R/sqrt(PI) * sqrt(theta - sin(2 theta)/2 + C * sin^3(theta)).
        // C = 0 is the LD-Haack (von Karman, minimum drag for given L&R).
        // C = 1/3 is the LV-Haack.
        const C = shape === "vonKarman" ? 0 : 1 / 3;
        const theta = Math.acos(Math.min(1, Math.max(-1, 1 - 2 * f)));
        const inner = theta - Math.sin(2 * theta) / 2 + C * Math.sin(theta) ** 3;
        r = (R / Math.sqrt(Math.PI)) * Math.sqrt(Math.max(0, inner));
        break;
      }

      default:
        r = R * f; // conical fallback
    }

    pts.push({ x, r });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// The outer diameter of a component at its rear (used to position the next one
// and to find the max body diameter for stability normalization).
export function rearDiameter(c) {
  if (isInternal(c)) return 0;
  if (c.type === COMPONENT_TYPES.TRANSITION) return c.rearDiameter;
  if (c.type === COMPONENT_TYPES.FINS)       return 0; // fins don't set body radius
  return c.diameter;
}

export function frontDiameter(c) {
  if (isInternal(c)) return 0;
  if (c.type === COMPONENT_TYPES.TRANSITION) return c.frontDiameter;
  if (c.type === COMPONENT_TYPES.FINS)       return 0;
  return c.diameter;
}

// The largest body diameter anywhere on the rocket — used as the reference
// diameter for the stability margin (calibers).
export function maxBodyDiameter(rocket) {
  rocket=resolveAssembly(rocket);
  let d = 0;
  for (const c of rocket.components) {
    d = Math.max(d, frontDiameter(c), rearDiameter(c));
  }
  return d || 0.05;
}

// Total length of the rocket along the centerline. Fins attach to the body
// and don't add to the length, so they're skipped.
export function totalLength(rocket) { return resolveAssembly(rocket).overallEnd; }
export function bodyLength(rocket) { return resolveAssembly(rocket).bodyEnd; }
export function layoutPositions(rocket) { return resolveAssembly(rocket).assemblyPositions; }
