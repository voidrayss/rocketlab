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
};

let nextId = 1;
function makeId() { return nextId++; }

// --- Factory helpers: each returns a plain object with sensible defaults. ---

export function createNose({ length = 0.15, diameter = 0.05, shape = "ogive",
                             material = "plastic", wallThickness = 0.002 } = {}) {
  return { id: makeId(), type: COMPONENT_TYPES.NOSE,
           length, diameter, shape, material, wallThickness };
}

export function createBody({ length = 0.30, diameter = 0.05,
                             material = "cardboard", wallThickness = 0.001 } = {}) {
  return { id: makeId(), type: COMPONENT_TYPES.BODY,
           length, diameter, material, wallThickness };
}

export function createTransition({ length = 0.05, frontDiameter = 0.05,
                                   rearDiameter = 0.08, material = "plastic",
                                   wallThickness = 0.002 } = {}) {
  return { id: makeId(), type: COMPONENT_TYPES.TRANSITION,
           length, frontDiameter, rearDiameter, material, wallThickness };
}

export function createFins({ count = 3, rootChord = 0.08, tipChord = 0.04,
                             span = 0.05, sweep = 0.04, thickness = 0.003,
                             material = "plywood" } = {}) {
  return { id: makeId(), type: COMPONENT_TYPES.FINS,
           count, rootChord, tipChord, span, sweep, thickness, material };
}

// A default starter rocket so the app opens with something flyable.
export function defaultRocket() {
  return {
    name: "My First Rocket",
    components: [
      createNose({ length: 0.15, diameter: 0.05, shape: "ogive" }),
      createBody({ length: 0.35, diameter: 0.05 }),
      createFins({ count: 3, rootChord: 0.08, tipChord: 0.04, span: 0.05, sweep: 0.04 }),
    ],
    motorId: "C6",
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// The outer diameter of a component at its rear (used to position the next one
// and to find the max body diameter for stability normalization).
export function rearDiameter(c) {
  if (c.type === COMPONENT_TYPES.TRANSITION) return c.rearDiameter;
  if (c.type === COMPONENT_TYPES.FINS)       return 0; // fins don't set body radius
  return c.diameter;
}

export function frontDiameter(c) {
  if (c.type === COMPONENT_TYPES.TRANSITION) return c.frontDiameter;
  if (c.type === COMPONENT_TYPES.FINS)       return 0;
  return c.diameter;
}

// The largest body diameter anywhere on the rocket — used as the reference
// diameter for the stability margin (calibers).
export function maxBodyDiameter(rocket) {
  let d = 0;
  for (const c of rocket.components) {
    d = Math.max(d, frontDiameter(c), rearDiameter(c));
  }
  return d || 0.05;
}

// Total length of the rocket along the centerline. Fins attach to the body
// and don't add to the length, so they're skipped.
export function totalLength(rocket) {
  let L = 0;
  for (const c of rocket.components) {
    if (c.type === COMPONENT_TYPES.FINS) continue;
    L += c.length;
  }
  return L;
}

// Returns the axial start position (x, measured from the nose tip) of each
// non-fin component, plus where fins sit (anchored to the rear of the body).
export function layoutPositions(rocket) {
  const positions = new Map();
  let x = 0;
  for (const c of rocket.components) {
    if (c.type === COMPONENT_TYPES.FINS) continue;
    positions.set(c.id, x);
    x += c.length;
  }
  // Fins: place their root trailing edge at the current body rear by default.
  const bodyEnd = x;
  for (const c of rocket.components) {
    if (c.type !== COMPONENT_TYPES.FINS) continue;
    positions.set(c.id, bodyEnd - c.rootChord);
  }
  return positions;
}
