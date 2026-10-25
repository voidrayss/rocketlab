// ===========================================================================
// js/onshape/geometry.js - parametric CAD geometry definitions (SCAFFOLDING).
//
// This module turns a RocketLab component model (the plain objects created by
// js/rocket.js) into parametric, CAD-ready definitions: the profile curves and
// revolve/extrude parameters a feature-based CAD system (Onshape) needs to
// regenerate each part family.
//
// It is PURE, DOM-free, and NETWORK-free. It imports only js/rocket.js (which
// is itself DOM-free and network-free). It must never import three, viewer3d,
// or anything that touches the DOM, and it must never make a network call.
//
// Why this exists now, with no live API:
//   The headline goal is an AI-assisted rocketry CAD extension that generates
//   parametric rocket parts inside Onshape, using our physics as the rocket
//   brain. The live Onshape REST API is currently blocked (a new personal
//   account cannot create API keys yet). So we build the parts that need no
//   live API: the geometry math here, the FeatureScript / parameter builders
//   in featurescript.js, and the client seam in client.js. When API keys work,
//   the client transport is swapped in and these definitions are POSTed as-is.
//
// UNITS:
//   Everything here is in METERS, matching the RocketLab model (js/rocket.js
//   stores all lengths and diameters in meters). This is convenient because
//   Onshape FeatureScript uses METERS as its internal base length unit, so a
//   raw number here maps directly to a FeatureScript length value in meters.
//   Angles are in DEGREES at this layer (easy for humans and for the radial
//   fin pattern); the FeatureScript builder documents the conversion.
// ===========================================================================

import { COMPONENT_TYPES, noseConeProfile, canonicalNoseShape } from "../rocket.js";

// The revolve axis for every axisymmetric part. The rocket centerline is the
// x axis in the RocketLab model (x grows from the nose tip down the body), and
// the profile radius r is measured perpendicular to it. A revolve of the
// {x, r} profile about the x axis reproduces the solid.
export const REVOLVE_AXIS = "x";

// A full revolution, in degrees. Exposed as a constant so the FeatureScript
// builder and tests agree on the value.
export const FULL_REVOLUTION_DEG = 360;

// ---------------------------------------------------------------------------
// Nose cone -> revolve definition.
//
// Reuses FEAT-002's noseConeProfile(c, nPoints) -> [{x, r}] so the CAD solid
// matches exactly what the 2D drawing, the 3D viewer, and the aero model use.
// The profile runs from the tip (x = 0, r ~ 0) to the base (x = L, r = R).
// A revolve of that profile about the x axis makes the solid nose; a shell
// operation (shellInward, by wallThickness) hollows it to a realistic part.
// ---------------------------------------------------------------------------
export function noseDefinition(nose, nPoints = 48) {
  if (!nose || nose.type !== COMPONENT_TYPES.NOSE) {
    throw new Error("noseDefinition expects a nose component");
  }
  const profile = noseConeProfile(nose, nPoints);
  const R = nose.diameter / 2;
  return {
    part: "nose",
    shape: canonicalNoseShape(nose.shape),
    units: "m",
    profile,                 // [{x, r}] from tip to base, meters
    revolveAxis: REVOLVE_AXIS,
    revolveAngleDeg: FULL_REVOLUTION_DEG,
    outerRadius: R,
    length: nose.length,
    wallThickness: nose.wallThickness,
    shellInward: true,       // hollow the revolved solid inward by wallThickness
    material: nose.material,
  };
}

// ---------------------------------------------------------------------------
// Body tube -> revolve / extrude definition.
//
// A body tube is a hollow cylinder. Two equivalent ways to model it in CAD:
//   - revolve: spin a thin rectangular profile (the wall cross-section) about
//     the axis, over revolveAngleDeg;
//   - extrude: extrude an annular sketch (outer circle minus inner circle) by
//     the tube length.
// We return both the dimensions and a ready-to-use rectangular revolve profile
// so the FeatureScript builder can pick whichever feature it emits.
// ---------------------------------------------------------------------------
export function bodyDefinition(body) {
  if (!body || body.type !== COMPONENT_TYPES.BODY) {
    throw new Error("bodyDefinition expects a body component");
  }
  const outerDiameter = body.diameter;
  const wall = body.wallThickness;
  // Clamp so the inner diameter can never go negative for a thick wall on a
  // thin tube; keep a hair of material so inner < outer always holds.
  const innerDiameter = Math.max(outerDiameter - 2 * wall, outerDiameter * 0.01);
  const outerR = outerDiameter / 2;
  const innerR = innerDiameter / 2;
  const L = body.length;

  // Wall cross-section rectangle for a revolve (in the x-r half-plane):
  // from innerR to outerR in radius, from x=0 to x=L along the axis.
  const revolveProfile = [
    { x: 0, r: innerR },
    { x: 0, r: outerR },
    { x: L, r: outerR },
    { x: L, r: innerR },
  ];

  return {
    part: "body",
    units: "m",
    outerDiameter,
    innerDiameter,
    length: L,
    wallThickness: wall,
    revolveAxis: REVOLVE_AXIS,
    revolveAngleDeg: FULL_REVOLUTION_DEG,
    revolveProfile,
    // extrude alternative: an annular face extruded along the axis.
    extrude: { outerDiameter, innerDiameter, depth: L },
    material: body.material,
  };
}

// ---------------------------------------------------------------------------
// Transition (frustum / shoulder) -> revolve definition.
//
// A transition joins a front diameter to a rear diameter over a length. Its
// outer profile is a straight line from (0, frontR) to (L, rearR); revolving
// it about the axis makes the conical frustum. We hollow it by wallThickness
// as well (shellInward) so it is a realistic part rather than a solid plug.
// ---------------------------------------------------------------------------
export function transitionDefinition(tr) {
  if (!tr || tr.type !== COMPONENT_TYPES.TRANSITION) {
    throw new Error("transitionDefinition expects a transition component");
  }
  const frontR = tr.frontDiameter / 2;
  const rearR = tr.rearDiameter / 2;
  const L = tr.length;

  // Outer profile from front face to rear face (meters).
  const profile = [
    { x: 0, r: frontR },
    { x: L, r: rearR },
  ];

  return {
    part: "transition",
    units: "m",
    frontDiameter: tr.frontDiameter,
    rearDiameter: tr.rearDiameter,
    length: L,
    wallThickness: tr.wallThickness,
    revolveAxis: REVOLVE_AXIS,
    revolveAngleDeg: FULL_REVOLUTION_DEG,
    profile,
    shellInward: true,
    material: tr.material,
  };
}

// ---------------------------------------------------------------------------
// Fins -> extrude + radial pattern definition.
//
// A single fin is a flat trapezoid sketched in a plane that contains the axis,
// then extruded by the fin thickness, then patterned radially around the body
// by count copies spaced evenly (360 / count degrees apart).
//
// The trapezoid corners, in a fin-local (x, y) frame (meters):
//   x runs along the body axis (root chord direction),
//   y runs radially outward from the body surface (span direction).
//   - root leading edge:  (0, 0)
//   - root trailing edge: (rootChord, 0)
//   - tip trailing edge:  (sweep + tipChord, span)
//   - tip leading edge:   (sweep, span)
// This matches how builder.js draws the fin (leading edge swept back by sweep,
// tip chord of tipChord at radial distance span).
// ---------------------------------------------------------------------------
export function finsDefinition(fins) {
  if (!fins || fins.type !== COMPONENT_TYPES.FINS) {
    throw new Error("finsDefinition expects a fins component");
  }
  const { rootChord, tipChord, span, sweep, thickness, count } = fins;

  const trapezoid = [
    { x: 0, y: 0 },                        // root leading edge
    { x: rootChord, y: 0 },                // root trailing edge
    { x: sweep + tipChord, y: span },      // tip trailing edge
    { x: sweep, y: span },                 // tip leading edge
  ];

  return {
    part: "fins",
    units: "m",
    trapezoid,                             // 4 points, fin-local x-y, meters
    thickness,                             // extrude depth, meters
    count,
    revolveAxis: REVOLVE_AXIS,
    // Radial (circular) pattern: count copies, evenly spaced around the axis.
    radialPattern: {
      count,
      angleDeg: FULL_REVOLUTION_DEG / count,
    },
    material: fins.material,
  };
}

// ---------------------------------------------------------------------------
// Convenience: build a definition for any supported component, dispatching on
// its type. Fins and components with no parametric mapping fall through with a
// clear error so callers never silently emit nothing.
// ---------------------------------------------------------------------------
export function componentDefinition(component, options = {}) {
  switch (component && component.type) {
    case COMPONENT_TYPES.NOSE:
      return noseDefinition(component, options.nPoints);
    case COMPONENT_TYPES.BODY:
      return bodyDefinition(component);
    case COMPONENT_TYPES.TRANSITION:
      return transitionDefinition(component);
    case COMPONENT_TYPES.FINS:
      return finsDefinition(component);
    default:
      throw new Error(
        `componentDefinition: unsupported component type '${component && component.type}'`
      );
  }
}

// Build parametric definitions for a whole rocket, in component order. This is
// the payload a later Onshape export would iterate over to create one Part
// Studio feature per component.
export function rocketDefinitions(rocket, options = {}) {
  if (!rocket || !Array.isArray(rocket.components)) {
    throw new Error("rocketDefinitions expects a rocket with a components array");
  }
  return rocket.components.map((c) => componentDefinition(c, options));
}
