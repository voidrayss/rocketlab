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

import { COMPONENT_TYPES, MATERIALS, layoutPositions, maxBodyDiameter } from "./rocket.js";

const PI = Math.PI;

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
        // Approximate nose as a hollow cone shell.
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
      case COMPONENT_TYPES.FINS: {
        // Trapezoidal plate area * thickness * count.
        const area = 0.5 * (c.rootChord + c.tipChord) * c.span;
        const vol = area * c.thickness * c.count;
        m = vol * MATERIALS[c.material];
        cx = x0 + c.rootChord / 2;
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
    if (c.type === COMPONENT_TYPES.FINS) continue;
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
      const xcp = c.shape === "cone" ? x0 + 0.666 * c.length
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
      const xcp = x0 + (c.length / 3) * (1 + (1 - df / dr) / (1 - (df / dr) ** 2));
      cnSum += cn; cnXSum += cn * xcp;
    }

    else if (c.type === COMPONENT_TYPES.FINS) {
      // Barrowman fin term for N trapezoidal fins.
      const n = c.count;
      const s = c.span;
      const cr = c.rootChord, ct = c.tipChord;
      const rBody = dRef / 2;
      // midchord sweep length
      const lm = Math.sqrt(s * s + (c.sweep + ct / 2 - cr / 2) ** 2);

      const kfb = 1 + rBody / (s + rBody); // fin-body interference factor
      const term = (4 * n * (s / dRef) ** 2) /
                   (1 + Math.sqrt(1 + (2 * lm / (cr + ct)) ** 2));
      const cn = kfb * term;

      // Fin CP location along the root chord (Barrowman).
      const xf = x0; // fin root leading edge position
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
    if (nose.shape === "cone")  cd += 0.10;
    if (nose.shape === "ogive") cd += 0.04;
    if (nose.shape === "blunt") cd += 0.25;
  }
  const fins = rocket.components.find(c => c.type === COMPONENT_TYPES.FINS);
  if (fins) cd += 0.02 * fins.count;
  return cd;
}

// Reference cross-sectional area (m^2) for the drag force.
export function referenceArea(rocket) {
  const d = maxBodyDiameter(rocket);
  return PI * (d / 2) ** 2;
}
