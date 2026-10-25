// ===========================================================================
// js/onshape/featurescript.js - FeatureScript / parameter payload builders
// (SCAFFOLDING).
//
// Given the parametric geometry definitions from js/onshape/geometry.js, this
// module produces two things for each part family:
//   1. a FeatureScript source string (textual, human-readable), and
//   2. a parameter payload object (plain JSON) describing the same part.
// A later phase, once Onshape API keys work, will POST these to Onshape with no
// further geometry math: the authenticated REST call simply carries the string
// / object produced here. See the SEAM comments marked "API SEAM" below and in
// js/onshape/client.js.
//
// This module is PURE: string and JSON building only. It makes NO network call,
// touches NO DOM, and holds NO secrets. It imports only geometry.js (pure).
//
// UNITS: geometry.js emits meters and degrees. Onshape FeatureScript uses
// meters as its internal base length unit, so a raw length literal here is in
// meters; we annotate values with "* meter" / "* degree" so the generated
// FeatureScript is explicit and copy-paste friendly.
// ===========================================================================

import {
  noseDefinition,
  bodyDefinition,
  transitionDefinition,
  finsDefinition,
  rocketDefinitions,
} from "./geometry.js";
import { COMPONENT_TYPES } from "../rocket.js";

// FeatureScript standard-library version line that tops every feature file.
// Pinned to a recent published std so the generated source is self-contained.
const FS_VERSION = "FeatureScript 2278;\nimport(path : \"onshape/std/geometry.fs\", version : \"2278.0\");";

// Format a number for inclusion in FeatureScript source. Keep enough precision
// for small hobby-rocket dimensions (sub-millimeter) without noisy long tails.
function fsNum(n) {
  return Number.parseFloat(Number(n).toFixed(6)).toString();
}

// Turn an [{x, r}] or [{x, y}] point list into a FeatureScript array-of-vectors
// comment block. We emit the points as a documented comment rather than a full
// spline command so the generated source stays readable; the exact sketch
// entities are reconstructed by the feature logic from the parameter payload.
function pointsComment(points, keys) {
  const [a, b] = keys;
  return points
    .map((p) => `    //   (${a}=${fsNum(p[a])} m, ${b}=${fsNum(p[b])} m)`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Nose -> FeatureScript + parameter payload.
// ---------------------------------------------------------------------------
export function noseFeatureScript(nose, options = {}) {
  const def = noseDefinition(nose, options.nPoints);
  const src = `${FS_VERSION}

// RocketLab nose cone: ${def.shape} profile, revolved about the ${def.revolveAxis} axis.
// Profile points (tip -> base), meters:
${pointsComment(def.profile, ["x", "r"])}
annotation { "Feature Type Name" : "RocketLab Nose" }
export const rocketLabNose = defineFeature(function(context is Context, id is Id, definition is map)
    precondition { }
    {
        // Build the profile sketch from definition.profile, then:
        //   opRevolve: axis = ${def.revolveAxis}, angle = ${fsNum(def.revolveAngleDeg)} * degree
        //   opShell:   thickness = ${fsNum(def.wallThickness)} * meter (inward)
        // outerRadius = ${fsNum(def.outerRadius)} * meter, length = ${fsNum(def.length)} * meter
    });
`;
  return {
    part: "nose",
    featureName: "RocketLab Nose",
    units: "m",
    source: src,
    parameters: def,
  };
}

// ---------------------------------------------------------------------------
// Body tube -> FeatureScript + parameter payload.
// ---------------------------------------------------------------------------
export function bodyFeatureScript(body) {
  const def = bodyDefinition(body);
  const src = `${FS_VERSION}

// RocketLab body tube: hollow cylinder, revolved about the ${def.revolveAxis} axis.
// outerDiameter = ${fsNum(def.outerDiameter)} m, innerDiameter = ${fsNum(def.innerDiameter)} m, length = ${fsNum(def.length)} m
annotation { "Feature Type Name" : "RocketLab Body Tube" }
export const rocketLabBodyTube = defineFeature(function(context is Context, id is Id, definition is map)
    precondition { }
    {
        // Sketch an annulus: outer circle d = ${fsNum(def.outerDiameter)} * meter,
        //                    inner circle d = ${fsNum(def.innerDiameter)} * meter.
        // opExtrude along the axis by length = ${fsNum(def.length)} * meter.
    });
`;
  return {
    part: "body",
    featureName: "RocketLab Body Tube",
    units: "m",
    source: src,
    parameters: def,
  };
}

// ---------------------------------------------------------------------------
// Transition -> FeatureScript + parameter payload.
// ---------------------------------------------------------------------------
export function transitionFeatureScript(tr) {
  const def = transitionDefinition(tr);
  const src = `${FS_VERSION}

// RocketLab transition: frustum from front to rear diameter, revolved about ${def.revolveAxis}.
// frontDiameter = ${fsNum(def.frontDiameter)} m, rearDiameter = ${fsNum(def.rearDiameter)} m, length = ${fsNum(def.length)} m
annotation { "Feature Type Name" : "RocketLab Transition" }
export const rocketLabTransition = defineFeature(function(context is Context, id is Id, definition is map)
    precondition { }
    {
        // Sketch the outer profile line (front -> rear), revolve ${fsNum(def.revolveAngleDeg)} * degree,
        // then opShell inward by ${fsNum(def.wallThickness)} * meter.
    });
`;
  return {
    part: "transition",
    featureName: "RocketLab Transition",
    units: "m",
    source: src,
    parameters: def,
  };
}

// ---------------------------------------------------------------------------
// Fins -> FeatureScript + parameter payload.
// ---------------------------------------------------------------------------
export function finsFeatureScript(fins) {
  const def = finsDefinition(fins);
  const src = `${FS_VERSION}

// RocketLab fin set: trapezoid extruded, then circular-patterned ${def.count}x around ${def.revolveAxis}.
// Trapezoid points (fin-local x,y), meters:
${pointsComment(def.trapezoid, ["x", "y"])}
// thickness = ${fsNum(def.thickness)} m, pattern angle = ${fsNum(def.radialPattern.angleDeg)} degree (= 360 / ${def.count})
annotation { "Feature Type Name" : "RocketLab Fins" }
export const rocketLabFins = defineFeature(function(context is Context, id is Id, definition is map)
    precondition { }
    {
        // Sketch the trapezoid, opExtrude by thickness = ${fsNum(def.thickness)} * meter,
        // then opPattern (circular): ${def.count} instances, ${fsNum(def.radialPattern.angleDeg)} * degree apart.
    });
`;
  return {
    part: "fins",
    featureName: "RocketLab Fins",
    units: "m",
    source: src,
    parameters: def,
  };
}

// Dispatch on component type.
export function componentFeatureScript(component, options = {}) {
  switch (component && component.type) {
    case COMPONENT_TYPES.NOSE:
      return noseFeatureScript(component, options);
    case COMPONENT_TYPES.BODY:
      return bodyFeatureScript(component);
    case COMPONENT_TYPES.TRANSITION:
      return transitionFeatureScript(component);
    case COMPONENT_TYPES.FINS:
      return finsFeatureScript(component);
    default:
      throw new Error(
        `componentFeatureScript: unsupported component type '${component && component.type}'`
      );
  }
}

// Build FeatureScript payloads for a whole rocket, in component order.
//
// API SEAM: the returned array is exactly what a later Onshape export will POST
// (one Part Studio feature per component). The authenticated REST request lives
// in js/onshape/client.js (createPartStudioFeature). Nothing here performs it.
export function rocketFeatureScripts(rocket, options = {}) {
  // Validate via geometry.js (throws on a malformed rocket) so callers get a
  // clear error before we build any strings.
  rocketDefinitions(rocket, options);
  return rocket.components.map((c) => componentFeatureScript(c, options));
}
