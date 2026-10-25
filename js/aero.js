import { importedPoint } from "./imported.js";
import { finCanProperties, finAxialCentroid } from "./fincan.js";
// ===========================================================================
// aero.js — mass properties + aerodynamics.
//
// This is the "engineering core". It computes, from the rocket geometry:
//   - mass and center of gravity (CG)
//   - center of pressure (CP) via the Barrowman equations (same method as
//     OpenRocket)
//   - stability margin in calibers = (CP - CG) / reference diameter
//   - a drag coefficient estimate
//
// References (talk about these to judges):
//   Barrowman, J. (1966), "The Practical Calculation of the Aerodynamic
//   Characteristics of Slender Finned Vehicles."
// ===========================================================================

import { COMPONENT_TYPES, MATERIALS, layoutPositions, maxBodyDiameter,
         totalLength, noseConeProfile, canonicalNoseShape } from "./rocket.js";
// Circular import with physics.js (it imports massProperties/centerOfPressure
// from here). Safe ONLY because every use of `atmosphere` below is lazy (inside
// a function body), never at module top level. Do not call atmosphere() while
// this module is initializing or the cycle will read an undefined binding.
import { atmosphere } from "./physics.js";

const PI = Math.PI;

// Shear modulus G (Pa) by material, used for the fin-flutter estimate.
// Representative values for hobby materials (order-of-magnitude figures).
export const SHEAR_MODULUS = {
  cardboard:  0.3e9,
  plywood:    0.6e9,
  balsa:      0.3e9,
  fiberglass: 3.0e9,
  plastic:    0.9e9,
  aluminum:  26.0e9,
};

// ---------------------------------------------------------------------------
// Mass properties: total mass and CG (distance from nose tip).
// ---------------------------------------------------------------------------
// We approximate each component as a thin shell (hollow) where appropriate,
// which is realistic for hobby rockets and keeps the math transparent.
export function massProperties(rocket, extraMass = 0, extraMassX = null) {
  const pos = layoutPositions(rocket);
  let totalMass = 0;
  let moment = 0; // sum of mass * centroidX

  for (const c of rocket.components) {
    const x0 = pos.get(c.id) ?? 0;
    let m = 0, cx = x0;

    switch (c.type) {
      case COMPONENT_TYPES.NOSE: {
        // Intentional simplification: every nose is massed as a hollow cone
        // shell regardless of its shape family, even though wettedArea() treats
        // the real profile. This keeps the mass model simple and, critically,
        // keeps analysis.js componentMass() in exact lockstep so the mass
        // breakdown sums to 100%. If you refine one nose-mass site, refine the
        // other too or the breakdown invariant breaks.
        const r = c.diameter / 2;
        const slant = Math.sqrt(r * r + c.length * c.length);
        const surfaceArea = PI * r * slant;           // lateral cone area
        const vol = surfaceArea * c.wallThickness;
        m = vol * MATERIALS[c.material];
        cx = x0 + (2 / 3) * c.length;                 // cone centroid ~2/3 down
        break;
      }
      case COMPONENT_TYPES.BODY: {
        const r = c.diameter / 2;
        const vol = 2 * PI * r * c.wallThickness * c.length; // thin tube shell
        m = vol * MATERIALS[c.material];
        cx = x0 + c.length / 2;
        break;
      }
      case COMPONENT_TYPES.TRANSITION: {
        const rAvg = (c.frontDiameter + c.rearDiameter) / 4;
        const vol = 2 * PI * rAvg * c.wallThickness * c.length;
        m = vol * MATERIALS[c.material];
        cx = x0 + c.length / 2;
        break;
      }
      case "imported": {
        m = c.cad.properties.volumeMm3 * 1e-9 * c.density;
        cx = x0 + importedPoint(c, c.cad.properties.centroidMm)[0];
        break;
      }
      case COMPONENT_TYPES.FINCAN: {
        const props = finCanProperties(c);
        m = props.volume * MATERIALS[c.material];
        cx = x0 + props.centroidX;
        break;
      }
      case COMPONENT_TYPES.FINS: {
        // Trapezoidal plate area * thickness * count.
        const area = 0.5 * (c.rootChord + c.tipChord) * c.span;
        const vol = area * c.thickness * c.count;
        m = vol * MATERIALS[c.material];
        cx = x0 + finAxialCentroid(c);
        break;
      }
    }
    totalMass += m;
    moment += m * cx;
  }

  // Fold in motor (or any extra point mass).
  if (extraMass > 0) {
    const mx = extraMassX ?? totalLengthGuess(rocket);
    totalMass += extraMass;
    moment += extraMass * mx;
  }

  const cg = totalMass > 0 ? moment / totalMass : 0;
  return { mass: totalMass, cg };
}

function totalLengthGuess(rocket) {
  // Motor typically sits near the rear of the rocket.
  const pos = layoutPositions(rocket);
  let maxEnd = 0;
  for (const c of rocket.components) {
    if (c.type === COMPONENT_TYPES.FINS || (c.type === "imported" && c.aeroRole === "internal")) continue;
    const x0 = pos.get(c.id) ?? 0;
    maxEnd = Math.max(maxEnd, x0 + c.length);
  }
  return Math.max(0, maxEnd - 0.05); // ~5 cm ahead of the tail
}

// ---------------------------------------------------------------------------
// Center of pressure via Barrowman equations.
// Each component contributes a normal-force coefficient slope (CNalpha) acting
// at its own center of pressure. The rocket CP is the CNalpha-weighted average.
// ---------------------------------------------------------------------------
export function centerOfPressure(rocket) {
  const pos = layoutPositions(rocket);
  const dRef = maxBodyDiameter(rocket);
  const Aref = PI * (dRef / 2) ** 2;

  let cnSum = 0;      // sum of CNalpha
  let cnXSum = 0;     // sum of CNalpha * x_cp

  for (const c of rocket.components) {
    const x0 = pos.get(c.id) ?? 0;

    if (c.type === COMPONENT_TYPES.NOSE) {
      // Nose cone: CNalpha = 2 (referenced to its own base area), CP location
      // depends on shape. (ogive ~0.466 L, cone 0.666 L).
      const cn = 2 * ((PI * (c.diameter / 2) ** 2) / Aref);
      const xcp = canonicalNoseShape(c.shape) === "conical" ? x0 + 0.666 * c.length
                                     : x0 + 0.466 * c.length; // ogive default
      cnSum += cn; cnXSum += cn * xcp;
    }

    else if (c.type === COMPONENT_TYPES.TRANSITION) {
      // Conical transition contributes normal force from the area change.
      const Af = PI * (c.frontDiameter / 2) ** 2;
      const Ar = PI * (c.rearDiameter / 2) ** 2;
      const cn = 2 * ((Ar - Af) / Aref);
      // CP of a cone frustum (Barrowman form).
      const df = c.frontDiameter, dr = c.rearDiameter;
      const xcp = x0 + (c.length / 3) * (1 + dr / (df + dr));
      cnSum += cn; cnXSum += cn * xcp;
    }

    else if (c.type === COMPONENT_TYPES.FINS || c.type === COMPONENT_TYPES.FINCAN) {
      // Barrowman fin term for N trapezoidal fins.
      const n = c.count;
      const s = c.span;
      const cr = c.rootChord, ct = c.tipChord;
      const rBody = (c.type === "finCan" ? c.diameter : dRef) / 2;
      // midchord sweep length
      const lm = Math.sqrt(s * s + (c.sweep + ct / 2 - cr / 2) ** 2);

      const kfb = 1 + rBody / (s + rBody); // fin-body interference factor
      const term = (4 * n * (s / dRef) ** 2) /
                   (1 + Math.sqrt(1 + (2 * lm / (cr + ct)) ** 2));
      const cn = kfb * term;

      // Fin CP location along the root chord (Barrowman).
      const xf = x0 + (c.type === "finCan" ? c.length - c.rootChord : 0); // fin root leading edge position
      const xcp = xf
        + (c.sweep / 3) * ((cr + 2 * ct) / (cr + ct))
        + (1 / 6) * ((cr + ct) - (cr * ct) / (cr + ct));
      cnSum += cn; cnXSum += cn * xcp;
    }
    // Straight body tubes contribute ~0 normal force at low angle of attack
    // in the basic Barrowman method, so they're skipped (standard assumption).
  }

  const cp = cnSum > 0 ? cnXSum / cnSum : 0;
  return { cp, cnAlpha: cnSum };
}

// ---------------------------------------------------------------------------
// Stability margin in calibers. The classic rule of thumb: 1–2 calibers of
// positive margin (CP behind CG) means a stable rocket.
// ---------------------------------------------------------------------------
export function stabilityMargin(rocket, motorMass, motorX) {
  const { cg } = massProperties(rocket, motorMass, motorX);
  const { cp } = centerOfPressure(rocket);
  const dRef = maxBodyDiameter(rocket);
  const calibers = (cp - cg) / dRef;
  return { cg, cp, dRef, calibers };
}

// ---------------------------------------------------------------------------
// A simple drag-coefficient estimate (Cd) from nose shape + fin count.
// Not full fidelity — intentionally transparent and defendable.
// ---------------------------------------------------------------------------
export function dragCoefficient(rocket) {
  let cd = 0.3; // baseline body/base drag
  const nose = rocket.components.find(c => c.type === COMPONENT_TYPES.NOSE);
  if (nose) {
    // Nose pressure drag depends on the shape family. Low-drag families
    // (von Karman / tangent ogive) add little; conical is moderate; blunt /
    // elliptical / parabolic sit in between to high. These increments are the
    // same order as the legacy values so existing flights stay comparable.
    const shape = canonicalNoseShape(nose.shape);
    const NOSE_DRAG = {
      vonKarman:  0.02,
      ogive:      0.04,
      haack:      0.03,
      parabolic:  0.06,
      elliptical: 0.08,
      conical:    0.10,
    };
    cd += NOSE_DRAG[shape] ?? 0.04;

    // Slender rockets are lower drag; only very stubby airframes (fineness
    // below 4) pay a pressure-drag penalty here, ramping in as fineness drops
    // under 4. Above that threshold this term is zero, so typical hobby
    // rockets (fineness ~10) see no penalty. Keep the adjustment small so
    // simulations stay close to the validated baseline.
    const fr = finenessRatio(rocket);
    if (fr < 4) cd += 0.02 * (4 - Math.min(fr, 4));
  }
  for (const fins of rocket.components.filter(c => c.type === "fins" || c.type === "finCan")) cd += 0.02 * fins.count;
  return cd;
}

// Reference cross-sectional area (m^2) for the drag force.
export function referenceArea(rocket) {
  const d = maxBodyDiameter(rocket);
  return PI * (d / 2) ** 2;
}

// ===========================================================================
// FEAT-002 additive analysis exports (all pure math, DOM-free).
// ===========================================================================

// ---------------------------------------------------------------------------
// Fineness ratio = total length / max body diameter. A key slenderness number:
// slender airframes are lower drag, and the drag model here only penalizes very
// stubby rockets (fineness below 4). Most hobby rockets land around 10-20; too
// low (stubby) is draggy and can be unstable, too high is fragile and flexible.
// ---------------------------------------------------------------------------
export function finenessRatio(rocket) {
  const L = totalLength(rocket);
  const d = maxBodyDiameter(rocket);
  return d > 0 ? L / d : 0;
}

// ---------------------------------------------------------------------------
// Wetted area (m^2): the total exterior surface the airflow touches. Drives
// skin-friction drag. We sum the lateral surface areas of the nose (via a
// surface-of-revolution over its profile), body tubes (PI * d * L), and
// conical transitions (frustum lateral area).
// ---------------------------------------------------------------------------
export function wettedArea(rocket) {
  let area = 0;
  for (const c of rocket.components) {
    if (c.type === COMPONENT_TYPES.NOSE) {
      // Surface of revolution: sum frustum bands between adjacent profile pts.
      const prof = noseConeProfile(c, 32);
      for (let i = 1; i < prof.length; i++) {
        const p0 = prof[i - 1], p1 = prof[i];
        const slant = Math.hypot(p1.x - p0.x, p1.r - p0.r);
        area += PI * (p0.r + p1.r) * slant; // 2*PI*rAvg*slant
      }
    }
    else if (c.type === COMPONENT_TYPES.BODY || c.type === COMPONENT_TYPES.FINCAN || (c.type === "imported" && c.aeroRole === "body")) {
      area += PI * c.diameter * c.length;
    }
    else if (c.type === COMPONENT_TYPES.TRANSITION) {
      const r1 = c.frontDiameter / 2, r2 = c.rearDiameter / 2;
      const slant = Math.hypot(c.length, r2 - r1);
      area += PI * (r1 + r2) * slant; // frustum lateral area
    }
  }
  return area;
}

// ---------------------------------------------------------------------------
// Turbulent flat-plate skin-friction drag coefficient referenced to the body
// cross-section. Uses the standard correlation Cf = 0.074 / Re^0.2 with
// Re = rho * V * L / mu (Prandtl 1/7th-power turbulent boundary layer).
// Reference: Schlichting, "Boundary-Layer Theory"; also Hoerner, "Fluid-
// Dynamic Drag". Returns { Cf, Re, cdFriction } where cdFriction is the
// friction drag normalized to the reference (cross-section) area.
// ---------------------------------------------------------------------------
export function skinFrictionDrag(rocket, { velocity = 50, altitude = 0 } = {}) {
  const mu = 1.8e-5;               // dynamic viscosity of air (Pa.s)
  const { density } = atmosphere(altitude);
  const L = Math.max(1e-4, totalLength(rocket));
  const V = Math.max(1e-3, velocity);
  const Re = (density * V * L) / mu;
  const Cf = 0.074 / Math.pow(Re, 0.2);
  const Sw = wettedArea(rocket);
  const Aref = referenceArea(rocket);
  const cdFriction = Aref > 0 ? Cf * (Sw / Aref) : 0;
  return { Cf, Re, cdFriction, wetted: Sw };
}

// ---------------------------------------------------------------------------
// Fin planform geometry for one fin panel.
//   aspectRatio  = (2 * span)^2 / (2 * finArea)  [standard model-rocket form,
//                  equivalent to using the full "virtual" wing of both fins]
//   taperRatio   = tipChord / rootChord
//   meanAeroChord = (2/3) * cr * (1 + lambda + lambda^2) / (1 + lambda)
// ---------------------------------------------------------------------------
export function finGeometry(rocket) {
  const fin = rocket.components.find(c => c.type === COMPONENT_TYPES.FINS || c.type === COMPONENT_TYPES.FINCAN);
  if (!fin) return { aspectRatio: 0, taperRatio: 0, meanAeroChord: 0, finArea: 0 };
  const cr = fin.rootChord, ct = fin.tipChord, s = fin.span;
  const finArea = 0.5 * (cr + ct) * s;          // one trapezoidal panel
  const aspectRatio = finArea > 0 ? (2 * s) ** 2 / (2 * finArea) : 0;
  const taperRatio = cr > 0 ? ct / cr : 0;
  const lambda = taperRatio;
  const meanAeroChord = cr > 0
    ? (2 / 3) * cr * (1 + lambda + lambda * lambda) / (1 + lambda)
    : 0;
  return { aspectRatio, taperRatio, meanAeroChord, finArea };
}

// ---------------------------------------------------------------------------
// Fin flutter velocity estimate (m/s). Below this airspeed the fins are safe;
// approaching it risks a destructive aeroelastic oscillation. Standard hobby
// fin-flutter boundary (derived from NACA TN 4197, "Summary of Flutter
// Experiences..."):
//
//   Vf = a * sqrt( G / ( (1.337 * AR^3 * P * (lambda + 1))
//                        / (2 * (AR + 2) * (t/c)^3) ) )
//
// where a = local speed of sound, P = ambient pressure, G = fin material
// shear modulus, AR = fin aspect ratio, lambda = taper ratio, t/c = fin
// thickness / root chord.
// ---------------------------------------------------------------------------
export function flutterVelocity(rocket, { altitude = 0, shearModulus = null } = {}) {
  const fin = rocket.components.find(c => c.type === COMPONENT_TYPES.FINS || c.type === COMPONENT_TYPES.FINCAN);
  if (!fin) return { velocity: Infinity, G: 0 };
  const { aspectRatio: AR, taperRatio: lambda } = finGeometry(rocket);
  const { pressure: P, speedOfSound: a } = atmosphere(altitude);
  const G = shearModulus ?? SHEAR_MODULUS[fin.material] ?? SHEAR_MODULUS.plywood;
  const tc = fin.rootChord > 0 ? fin.thickness / fin.rootChord : 0;
  if (AR <= 0 || tc <= 0 || P <= 0) return { velocity: Infinity, G };

  const denom = (1.337 * Math.pow(AR, 3) * P * (lambda + 1)) /
                (2 * (AR + 2) * Math.pow(tc, 3));
  const velocity = denom > 0 ? a * Math.sqrt(G / denom) : Infinity;
  return { velocity, G, aspectRatio: AR, taperRatio: lambda, thicknessRatio: tc };
}
